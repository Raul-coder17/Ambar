-- Fase 1: BYOK + rate-limiter adaptativo para el chat de texto (Gemini).
--
-- La API key de Gemini nunca se guarda en texto plano: se cifra con AES-GCM
-- en la Edge Function `manage-ai-key` (secret `AI_KEY_ENCRYPTION_SECRET`,
-- definido como secret de proyecto) antes del insert/update. Mismo patrón
-- que Organizador-IA (`user_ai_settings` / `ai_usage` / `ai_call_log`).

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- ajustes_ia: 1 fila por usuario con la key cifrada + cuota diaria aprendida
-- ============================================================

create table public.ajustes_ia (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gemini_api_key_encrypted text,
  ia_habilitada boolean not null default false,
  -- RPD real aprendido del 429 de Gemini (nunca hardcodeado: la cuota free
  -- tier ya cambió una vez). Válido sólo para el modelo de
  -- cuota_diaria_aprendida_modelo; si no coincide con el modelo actual de la
  -- Edge Function se ignora y se reaprende del próximo 429 real.
  cuota_diaria_aprendida integer,
  cuota_diaria_aprendida_modelo text,
  updated_at timestamptz not null default now()
);

create trigger ajustes_ia_set_updated_at
  before update on public.ajustes_ia
  for each row
  execute function public.set_updated_at();

alter table public.ajustes_ia enable row level security;

create policy "ajustes_ia_select_own"
  on public.ajustes_ia for select
  using (user_id = auth.uid());

create policy "ajustes_ia_insert_own"
  on public.ajustes_ia for insert
  with check (user_id = auth.uid());

create policy "ajustes_ia_update_own"
  on public.ajustes_ia for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ajustes_ia_delete_own"
  on public.ajustes_ia for delete
  using (user_id = auth.uid());

-- ============================================================
-- ia_uso: contador de uso diario, día calculado en America/Los_Angeles para
-- coincidir con el reset de cuota de Gemini (medianoche hora del Pacífico).
-- ============================================================

create table public.ia_uso (
  user_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  solicitudes integer not null default 0,
  primary key (user_id, fecha)
);

alter table public.ia_uso enable row level security;

create policy "ia_uso_select_own"
  on public.ia_uso for select
  using (user_id = auth.uid());

create policy "ia_uso_insert_own"
  on public.ia_uso for insert
  with check (user_id = auth.uid());

create policy "ia_uso_update_own"
  on public.ia_uso for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Incremento atómico del contador de hoy; devuelve el nuevo total.
-- security invoker => corre con el rol del usuario y respeta RLS.
create function public.incrementar_uso_ia()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Los_Angeles')::date;
  nuevo integer;
begin
  insert into ia_uso (user_id, fecha, solicitudes)
    values (auth.uid(), hoy, 1)
  on conflict (user_id, fecha)
    do update set solicitudes = ia_uso.solicitudes + 1
  returning solicitudes into nuevo;
  return nuevo;
end;
$$;

-- Lectura del contador de hoy (0 si no hay fila).
create function public.uso_ia_hoy()
returns integer
language sql
security invoker
set search_path = public
as $$
  select coalesce(
    (select solicitudes
       from ia_uso
      where user_id = auth.uid()
        and fecha = (now() at time zone 'America/Los_Angeles')::date),
    0);
$$;

grant execute on function public.incrementar_uso_ia() to authenticated;
grant execute on function public.uso_ia_hoy() to authenticated;

-- ============================================================
-- ia_llamadas_log: freno proactivo de RPM (ventana deslizante de 60s).
--
-- El RPM real del modelo/cuenta es bajo y NO se "aprende" con fiabilidad
-- (a diferencia de la cuota diaria, no hay un 429 del que derivarlo con esta
-- granularidad): se hardcodea en la Edge Function (mismo valor que
-- Organizador-IA, 15). Esta tabla sólo guarda el historial de marcas; la
-- Edge Function poda sus propias marcas más viejas que la ventana en cada
-- chequeo, así la tabla no crece sin límite con el uso normal.
-- ============================================================

create table public.ia_llamadas_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  called_at timestamptz not null default now()
);

create index ia_llamadas_log_user_called_idx on public.ia_llamadas_log (user_id, called_at desc);

alter table public.ia_llamadas_log enable row level security;

create policy "ia_llamadas_log_select_own"
  on public.ia_llamadas_log for select
  using (user_id = auth.uid());

create policy "ia_llamadas_log_insert_own"
  on public.ia_llamadas_log for insert
  with check (user_id = auth.uid());

create policy "ia_llamadas_log_delete_own"
  on public.ia_llamadas_log for delete
  using (user_id = auth.uid());
