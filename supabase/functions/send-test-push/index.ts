// Edge Function: send-test-push
//
// Infraestructura base de push (prerequisito de Fase 5, objetivos vigilados)
// — SIN contenido de objetivos todavía. La invoca el propio usuario
// autenticado desde Ajustes ("Probar notificación") para validar en vivo el
// circuito completo: suscripción del navegador -> guardado en
// push_subscriptions -> envío Web Push -> recepción en sw.ts. El envío real
// disparado por pg_cron con contenido de objetivos es la siguiente sesión.
//
// No usa service_role: corre con la key anon + el JWT del usuario, así que
// RLS ya scopea push_subscriptions a sus propias filas sin necesidad de
// filtrar server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Falta el header Authorization.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ambar@example.com'

  if (!supabaseUrl || !supabaseAnonKey || !vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'Función mal configurada (faltan secrets).' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonResponse({ error: 'Sesión inválida o expirada.' }, 401)
  }

  const { data, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)

  if (subsError) {
    return jsonResponse({ error: 'No se pudieron leer las suscripciones.' }, 500)
  }

  const subs = (data ?? []) as SubRow[]
  if (subs.length === 0) {
    return jsonResponse(
      { error: 'No hay notificaciones activadas en este dispositivo/cuenta todavía.' },
      404,
    )
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const payload = JSON.stringify({
    title: 'Ámbar',
    body: 'Notificación de prueba — si ves esto, la infraestructura de push funciona.',
    url: '/ajustes',
    tag: 'ambar-test',
  })

  let enviadas = 0
  let expiradasBorradas = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      enviadas++
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 410 || statusCode === 404) {
        // Suscripción expirada/inexistente: la borramos.
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        expiradasBorradas++
      } else {
        console.error('web-push error', statusCode, (err as Error).message)
      }
    }
  }

  if (enviadas === 0) {
    return jsonResponse(
      { error: 'No se pudo enviar a ninguna suscripción activa.', suscripciones_expiradas_borradas: expiradasBorradas },
      502,
    )
  }

  return jsonResponse({ ok: true, enviadas, suscripciones_expiradas_borradas: expiradasBorradas })
})
