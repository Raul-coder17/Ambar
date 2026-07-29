-- Fase 4g: permite forzar el cierre de la sesión Live de OTRO dispositivo.
--
-- Hasta acá, `liberar_sesion_live(session_id)` sólo borra la fila si el
-- `session_id` coincide con el que la pide — una pestaña nunca conoce el
-- `session_id` de otra, así que no había forma de que el cliente cerrara una
-- sesión ajena (mismo usuario, otro dispositivo) desde el diagnóstico
-- `sesion_activa`.
--
-- Se extiende `reclamar_sesion_live` con `p_forzar` en vez de crear una
-- función aparte: reusa la misma carrera resuelta en un solo
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE, sólo que ahora el WHERE
-- también se cumple cuando `p_forzar` es true, sin importar de quién sea la
-- fila. Sigue siendo seguro porque `security invoker` + `auth.uid()` ya
-- escopean todo al usuario dueño del JWT — forzar sólo puede tumbar TU
-- propia sesión en otro dispositivo, nunca la de otro usuario.
--
-- Hay que hacer DROP antes: `create or replace` no permite agregar un
-- parámetro nuevo (eso crea una sobrecarga, y una llamada con un solo
-- argumento quedaría ambigua entre la firma vieja y la nueva).

drop function if exists public.reclamar_sesion_live(uuid);

create function public.reclamar_sesion_live(p_session_id uuid, p_forzar boolean default false)
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
        -- cuánto lleva viva la conversación, no la conexión actual. Un
        -- forzado siempre es un dispositivo DISTINTO (si fuera el mismo,
        -- ya habría entrado por la rama `s.session_id = p_session_id`), así
        -- que acá iniciada_at se resetea igual que con una sesión nueva.
        iniciada_at = case when s.session_id = p_session_id then s.iniciada_at else now() end,
        heartbeat_at = now()
    where p_forzar
       or s.session_id = p_session_id
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

grant execute on function public.reclamar_sesion_live(uuid, boolean) to authenticated;
