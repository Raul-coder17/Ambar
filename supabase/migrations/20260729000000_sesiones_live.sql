-- Fase 4b: lock de sesión Live única por usuario.
--
-- POR QUÉ EN EL SERVIDOR Y NO EN EL CLIENTE
--
-- El plan original decía "bloquear en cliente más de 1 sesión Live activa".
-- Un lock en cliente cubre una pestaña: no cubre dos pestañas, ni el celular
-- más la laptop, que es justo el caso realista de una PWA. Y ya existe el
-- choke point perfecto: nadie abre una sesión Live sin pedirle antes un token
-- efímero a la Edge Function `live`. Poner el lock ahí lo hace inevitable.
--
-- EL TTL ES LO QUE EVITA EL DEADLOCK
--
-- Una pestaña que se cierra de golpe (crash, matar el navegador, quedarse sin
-- batería) nunca llega a liberar su fila. Sin TTL, ese usuario quedaría sin
-- poder abrir Live nunca más. Por eso el lock no es "hay fila = ocupado" sino
-- "hay fila Y latió hace menos de 90s": el cliente late cada 30s, así que 90s
-- tolera dos latidos perdidos antes de dar la sesión por muerta.
--
-- La fila también guarda el handle de session resumption. Es el mismo ciclo de
-- vida (nace y muere con la sesión) y ponerlo acá tiene un efecto útil: al
-- retomar una sesión que se murió sin liberar, `reclamar_sesion_live` devuelve
-- el handle anterior y la charla puede continuar donde iba en vez de arrancar
-- de cero. El handle sirve hasta 2h después de terminada la sesión.

create table public.sesiones_live (
  -- PK en user_id: "una sola sesión por usuario" es la estructura de la tabla,
  -- no una regla que haya que recordar chequear en el código.
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Quién es el dueño actual del lock. Todas las operaciones lo exigen: una
  -- pestaña vieja que perdió el lock por TTL no puede seguir latiendo ni
  -- liberar la sesión que otra pestaña ya tomó.
  session_id uuid not null,
  iniciada_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  resumption_handle text,
  handle_at timestamptz
);

alter table public.sesiones_live enable row level security;

-- Mismas 4 policies que ajustes_ia y las tablas de memoria.
create policy "sesiones_live_select_own"
  on public.sesiones_live for select
  using (user_id = auth.uid());

create policy "sesiones_live_insert_own"
  on public.sesiones_live for insert
  with check (user_id = auth.uid());

create policy "sesiones_live_update_own"
  on public.sesiones_live for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "sesiones_live_delete_own"
  on public.sesiones_live for delete
  using (user_id = auth.uid());

-- ============================================================
-- reclamar_sesion_live: toma el lock, o explica por qué no pudo.
--
-- Se toma el lock en tres casos:
--   1. No hay fila            -> sesión nueva.
--   2. La fila es de esta misma session_id -> reconexión de la misma sesión.
--   3. La fila venció el TTL  -> la sesión anterior murió sin liberar.
-- En cualquier otro caso hay otra sesión viva y se rechaza.
--
-- Todo pasa en UN solo INSERT ... ON CONFLICT DO UPDATE ... WHERE, a propósito:
-- la versión "leo, decido, escribo" tiene una carrera real entre dos pestañas
-- que abren Live al mismo tiempo, donde las dos leen "no hay fila" y las dos
-- creen que ganaron. Acá el WHERE del DO UPDATE lo resuelve el motor: si no se
-- cumple, no se toca ninguna fila y FOUND queda en false.
--
-- `resumption_handle` NO se pisa en el UPDATE, y por eso el RETURNING devuelve
-- el handle que YA estaba: es exactamente lo que necesita quien retoma una
-- sesión que se murió sin liberar.
-- ============================================================

create function public.reclamar_sesion_live(p_session_id uuid)
returns table (reclamada boolean, handle_previo text, espera_segundos integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ttl constant interval := interval '90 seconds';
  v_handle text;
begin
  insert into sesiones_live as s (user_id, session_id)
    values (auth.uid(), p_session_id)
  on conflict (user_id) do update
    set session_id = p_session_id,
        -- Si es la MISMA sesión reconectando, iniciada_at no se toca: mide
        -- cuánto lleva viva la conversación, no la conexión actual.
        iniciada_at = case when s.session_id = p_session_id then s.iniciada_at else now() end,
        heartbeat_at = now()
    where s.session_id = p_session_id
       or s.heartbeat_at < now() - v_ttl
  returning s.resumption_handle into v_handle;

  if found then
    return query select true, v_handle, 0;
    return;
  end if;

  -- No se pudo: hay otra sesión viva. Devolvemos cuánto falta para que su TTL
  -- venza, así el cliente puede decir algo concreto en vez de "probá después".
  return query
    select false,
           null::text,
           greatest(0, ceil(extract(epoch from (heartbeat_at + v_ttl - now()))))::integer
      from sesiones_live
     where user_id = auth.uid();
end;
$$;

-- ============================================================
-- latir_sesion_live: renueva el TTL y guarda el último handle de resumption.
--
-- Devuelve false si el lock ya no es de esta session_id — o sea, si otra
-- pestaña lo tomó mientras tanto. Para el cliente eso no es un error de red:
-- es la orden de cerrar su sesión, porque ya no es el dueño.
--
-- El handle se guarda acá y no en cada SessionResumptionUpdate porque esos
-- mensajes llegan muy seguido; el latido cada 30s alcanza y evita un UPDATE
-- por cada mensaje del servidor.
-- ============================================================

create function public.latir_sesion_live(p_session_id uuid, p_handle text default null)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update sesiones_live
     set heartbeat_at = now(),
         -- coalesce: un latido sin handle (todavía no llegó el primero)
         -- renueva el TTL sin borrar el handle que ya teníamos.
         resumption_handle = coalesce(p_handle, resumption_handle),
         handle_at = case when p_handle is not null then now() else handle_at end
   where user_id = auth.uid()
     and session_id = p_session_id;

  return found;
end;
$$;

-- ============================================================
-- liberar_sesion_live: cierre limpio.
--
-- El chequeo de session_id evita que una pestaña vieja, que ya perdió el lock
-- por TTL, borre la fila de la sesión nueva que tomó su lugar al cerrarse.
-- ============================================================

create function public.liberar_sesion_live(p_session_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from sesiones_live
   where user_id = auth.uid()
     and session_id = p_session_id;

  return found;
end;
$$;

grant execute on function public.reclamar_sesion_live(uuid) to authenticated;
grant execute on function public.latir_sesion_live(uuid, text) to authenticated;
grant execute on function public.liberar_sesion_live(uuid) to authenticated;
