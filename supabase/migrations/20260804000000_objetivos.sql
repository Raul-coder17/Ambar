-- Fase 5, Paso 1: esquema de "objetivos vigilados". Diseño completo en
-- PLAN_AMBAR.md ("Decisiones técnicas — Fase 5", diagnóstico del 2026-08-04).
--
-- Tres tablas:
--   objetivos            -- qué vigilar, frecuencia, estado, último dato conocido
--   objetivos_revisiones -- historial append-only de cada revisión (Paso 5 lo lista)
--   tavily_uso           -- contador propio de búsquedas Tavily por usuario/mes
--
-- Ninguna Edge Function toca estas tablas todavía (eso es Paso 2 en adelante) —
-- esta migración es sólo el esquema.

-- ============================================================
-- objetivos: 1 fila por objetivo vigilado
-- ============================================================

create table public.objetivos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Lo que el usuario pidió vigilar, tal cual lo dijo ("avisame si baja el
  -- precio de la PS5"). Es lo que arma la búsqueda en Tavily y lo que el
  -- modelo usa como referencia para juzgar novedad en cada revisión (Paso 3).
  descripcion text not null,
  -- Set fijo, no un intervalo libre: acota el peor caso de gasto de Tavily
  -- (ver tavily_uso más abajo) y simplifica el cron de Paso 4, que sólo
  -- necesita mirar `proxima_revision`, no reinterpretar un intervalo por fila.
  -- Default 'diario', confirmado con Raúl como punto de partida conservador.
  frecuencia text not null default 'diario'
    check (frecuencia in ('cada_6h', 'diario', 'semanal')),
  estado text not null default 'activo'
    check (estado in ('activo', 'pausado')),
  -- El dato extraído en la última revisión (ver Paso 3, opción D del
  -- diagnóstico: extracción + juicio de novedad en una sola llamada
  -- estructurada). NULL hasta que corra la primera revisión.
  valor_actual text,
  -- Frase corta de contexto para mostrar en la UI (Paso 5) junto a
  -- valor_actual — no es el texto crudo de Tavily, es lo que el modelo
  -- devuelve ya redactado.
  resumen_actual text,
  -- Cuándo le toca la próxima pasada. El cron de Paso 4 filtra por esto en
  -- vez de recalcular contra frecuencia + ultima_revision en cada corrida —
  -- misma lógica que una cola de trabajo simple. Default now() para que un
  -- objetivo recién creado entre en el próximo ciclo del cron sin esperar un
  -- día completo por su primera revisión (que sólo establece línea de base,
  -- ver el diseño de Paso 3: la primera revisión nunca dispara push).
  proxima_revision timestamptz not null default now(),
  ultima_revision timestamptz,
  creado_at timestamptz not null default now()
);

-- El cron de Paso 4 escanea objetivos vencidos de TODOS los usuarios en una
-- sola pasada: `where estado = 'activo' and proxima_revision <= now()`.
-- Parcial porque los pausados no participan nunca de esa consulta — mismo
-- criterio que el índice HNSW parcial de memoria_vectorial (Fase 2).
create index objetivos_pendientes_idx
  on public.objetivos (proxima_revision)
  where estado = 'activo';

create index objetivos_user_idx on public.objetivos (user_id);

alter table public.objetivos enable row level security;

create policy "objetivos_select_own"
  on public.objetivos for select
  using (user_id = auth.uid());

create policy "objetivos_insert_own"
  on public.objetivos for insert
  with check (user_id = auth.uid());

create policy "objetivos_update_own"
  on public.objetivos for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "objetivos_delete_own"
  on public.objetivos for delete
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- Tope de 5 objetivos activos simultáneos (confirmado con Raúl).
--
-- Sólo chequea cuando un objetivo PASA a estar activo (alta nueva, o
-- reactivación desde pausado) — no en cada UPDATE de valor_actual/
-- resumen_actual/proxima_revision que va a hacer Paso 3 en cada revisión
-- periódica, donde el estado no cambia. Sin el WHEN acotado a ese cambio,
-- cada revisión automática recontaría innecesariamente los activos del
-- usuario por nada.
-- ------------------------------------------------------------

create function public.chequear_tope_objetivos_activos()
returns trigger
language plpgsql
as $$
declare
  activos integer;
begin
  select count(*) into activos
    from public.objetivos
   where user_id = new.user_id
     and estado = 'activo'
     and id is distinct from new.id;

  if activos >= 5 then
    raise exception 'Ya tenés % objetivos activos (máximo 5). Pausá o borrá alguno antes de activar otro.', activos;
  end if;

  return new;
end;
$$;

-- Dos triggers en vez de uno combinado: la cláusula WHEN de un trigger de
-- INSERT sólo puede referenciar NEW (no existe un OLD que referenciar), y la
-- de uno de UPDATE puede referenciar los dos. `tg_op` no está disponible en
-- WHEN (sólo dentro del cuerpo de la función), así que combinarlos en un
-- solo "before insert or update" no es viable sin esa referencia.
create trigger objetivos_tope_activos_insert
  before insert on public.objetivos
  for each row
  when (new.estado = 'activo')
  execute function public.chequear_tope_objetivos_activos();

create trigger objetivos_tope_activos_update
  before update on public.objetivos
  for each row
  when (new.estado = 'activo' and old.estado is distinct from new.estado)
  execute function public.chequear_tope_objetivos_activos();

-- ============================================================
-- objetivos_revisiones: historial append-only de cada revisión (Paso 3 la
-- escribe, Paso 5 la lista de sólo lectura en el detalle de cada objetivo).
-- ============================================================

create table public.objetivos_revisiones (
  id bigint generated always as identity primary key,
  objetivo_id bigint not null references public.objetivos (id) on delete cascade,
  -- Denormalizado a propósito, mismo criterio que otras tablas del proyecto:
  -- RLS directa contra auth.uid() sin depender de un join a objetivos.
  user_id uuid not null references auth.users (id) on delete cascade,
  ocurrida_en timestamptz not null default now(),
  hubo_novedad boolean not null,
  valor_extraido text,
  -- Puede haber novedad y que el envío del push falle igual (suscripción
  -- expirada, etc.) — son dos hechos distintos, no se colapsan en una sola
  -- columna.
  notificado boolean not null default false
);

create index objetivos_revisiones_objetivo_idx
  on public.objetivos_revisiones (objetivo_id, ocurrida_en desc);

alter table public.objetivos_revisiones enable row level security;

-- Sólo select: esta tabla la escribe exclusivamente la Edge Function de
-- Paso 3 con service_role (bypassa RLS), nunca el cliente en nombre del
-- usuario — no hace falta policy de insert/update/delete para `authenticated`.
create policy "objetivos_revisiones_select_own"
  on public.objetivos_revisiones for select
  using (user_id = auth.uid());

-- ============================================================
-- tavily_uso: contador propio de búsquedas Tavily por usuario/mes.
--
-- Tavily no tiene un endpoint de "sólo consultar cuota" (ya se decidió así
-- en Fase 3: no vale la pena gastar una búsqueda real sólo para validar).
-- Sin este contador no hay ninguna señal antes del 429 real de la cuota
-- mensual (~1000 gratis) — y a diferencia del uso interactivo de
-- buscar_en_internet, el gasto de Paso 3 es automático e invisible en el
-- momento para el usuario, así que amerita su propio freno.
--
-- Sólo lo escribe la Edge Function de Paso 3 (service_role, upsert directo
-- por user_id — no hace falta una RPC como incrementar_uso_ia(), que existe
-- porque ese contador lo incrementa el propio usuario autenticado). Sin
-- policy de insert/update para `authenticated` por lo mismo que
-- objetivos_revisiones. La policy de select queda para cuando la UI quiera
-- mostrar cuánto se lleva gastado.
-- ============================================================

create table public.tavily_uso (
  user_id uuid not null references auth.users (id) on delete cascade,
  mes date not null,
  busquedas integer not null default 0,
  primary key (user_id, mes)
);

alter table public.tavily_uso enable row level security;

create policy "tavily_uso_select_own"
  on public.tavily_uso for select
  using (user_id = auth.uid());
