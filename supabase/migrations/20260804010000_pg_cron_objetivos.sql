-- Fase 5, Paso 4: pg_cron + pg_net disparando revisar-objetivos.
--
-- Primer uso real de pg_cron y pg_net en este proyecto (la poda de
-- memoria_vectorial lo había diseñado conceptualmente pero nunca se
-- implementó — esto es lo primero que lo pone en producción).
--
-- CADA 15 MINUTOS, no según la frecuencia de cada objetivo: la granularidad
-- real la da `objetivos.proxima_revision` (Paso 1/3) — el cron sólo dispara
-- la función lo bastante seguido para que ningún objetivo espere de más
-- entre que vence y que se lo revisa.
--
-- EL SECRET NO ESTÁ ACÁ. `net.http_post` necesita mandar
-- REVISAR_OBJETIVOS_SECRET en el header Authorization, pero este archivo se
-- versiona en git — así que el valor vive en Supabase Vault (extensión
-- `supabase_vault`, ya instalada por defecto) bajo el nombre
-- 'revisar_objetivos_secret', cargado por fuera de esta migración (mismo
-- criterio que AI_KEY_ENCRYPTION_SECRET / VAPID_*: generado y seteado por
-- CLI, nunca en un archivo del repo ni mostrado en el chat). Acá sólo se
-- referencia ese NOMBRE, que no es secreto.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'revisar-objetivos-cada-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://zrqcnykrrshpbauhhcef.supabase.co/functions/v1/revisar-objetivos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'revisar_objetivos_secret'
      )
    ),
    body := '{}'::jsonb,
    -- Generoso a propósito: revisar-objetivos procesa los objetivos vencidos
    -- de un usuario en secuencia (Tavily + Gemini por cada uno), así que con
    -- varios vencidos a la vez puede tardar bastante más que el timeout por
    -- defecto de pg_net (5s). pg_net es asincrónico — esto no bloquea al
    -- cron ni a la corrida siguiente, sólo cuánto espera ESTE worker antes
    -- de dar por perdida la respuesta.
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
