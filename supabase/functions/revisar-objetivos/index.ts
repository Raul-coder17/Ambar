// Edge Function: revisar-objetivos (Fase 5, Paso 3)
//
// Revisión periódica de objetivos vigilados. Selecciona TODOS los objetivos
// activos vencidos de TODOS los usuarios y los procesa en una sola pasada —
// no hay un usuario particular invocando esto, corre con `service_role`
// (bypassa RLS a propósito: es la única función del proyecto que necesita ver
// filas de usuarios que no son quien la invoca).
//
// SIN pg_cron todavía (Paso 4) — hoy se invoca a mano para probarla contra un
// objetivo real antes de confiarle a un cron que la dispare sola.
//
// SEGURIDAD: el gateway de Supabase deja pasar cualquier JWT que firme bien
// para el proyecto, incluida la key `anon` (pública, embebida en el cliente).
// Como esta función gasta cuota de Tavily/Gemini de TODOS los usuarios y les
// manda push, no alcanza con "pasó el gateway" — se valida además que el
// Authorization recibido sea EXACTAMENTE `REVISAR_OBJETIVOS_SECRET`, un
// secret propio nuevo (no el service_role): el proyecto tiene dos formatos de
// API key conviviendo (JWT clásico y el sistema nuevo `sb_publishable_`/
// `sb_secret_`) y comparar contra el service_role real resultó ambiguo — con
// un secret propio, generado y seteado acá mismo vía `supabase secrets set`
// (nunca mostrado en el chat, mismo criterio que AI_KEY_ENCRYPTION_SECRET),
// no hay ambigüedad de formato posible. Es también el valor que va a viajar
// en el header del `net.http_post` que dispare `pg_cron` en el Paso 4.
//
// El service_role SÍ se sigue usando, pero para otra cosa: crear el cliente
// de Supabase con el que la función lee/escribe filas de usuarios que no son
// quien la invoca (bypassa RLS a propósito).
//
// SIN CORS/OPTIONS: a diferencia de ai-chat/live/send-test-push, nunca la
// llama un navegador — sólo pg_net (Paso 4) o una invocación manual con
// service_role.
//
// Por objetivo, si cualquier paso del pipeline falla (key BYOK faltante o
// inválida, Tavily caído, cuota agotada, JSON de Gemini mal formado), se
// loguea y se pasa al siguiente: no se escribe fila en objetivos_revisiones
// (esa tabla es de comparaciones que sí ocurrieron) y `proxima_revision`
// queda sin tocar, así que el objetivo se reintenta solo en el próximo tick
// del cron. Sin backoff ni contador de fallos — no hace falta todavía.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { decryptApiKey } from '../_shared/crypto.ts'
import { buscarEnInternet } from '../_shared/tavily.ts'
import { compararObjetivo } from './comparar.ts'

// gemini-3.1-flash-lite: mismo modelo (y misma cuota compartida, ver
// `hayMargenGemini`) que el chat interactivo.
const GEMINI_MODEL_COMPARACION = 'gemini-3.1-flash-lite'

// Margen de seguridad bajo el ~1000/mes gratis de Tavily. No es la fecha real
// de reset de Tavily (no la exponen) — es un calendario UTC propio, sólo para
// tener ALGUNA señal antes del 429 real (ver PLAN_AMBAR.md, punto 7 del
// diagnóstico de Fase 5).
const TAVILY_TOPE_MENSUAL = 900

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function intervaloMs(frecuencia: string): number {
  switch (frecuencia) {
    case 'cada_6h':
      return 6 * 60 * 60 * 1000
    case 'semanal':
      return 7 * 24 * 60 * 60 * 1000
    case 'diario':
    default:
      return 24 * 60 * 60 * 1000
  }
}

function primerDiaDelMes(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** 'YYYY-MM-DD' en America/Los_Angeles, igual que ia_uso.fecha (Fase 1). */
function hoyPacifico(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

// --- Tavily: contador propio de uso mensual ---------------------------------

async function hayMargenTavily(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tavily_uso')
    .select('busquedas')
    .eq('user_id', userId)
    .eq('mes', primerDiaDelMes())
    .maybeSingle()
  return (data?.busquedas ?? 0) < TAVILY_TOPE_MENSUAL
}

async function incrementarTavilyUso(supabase: SupabaseClient, userId: string): Promise<void> {
  const mes = primerDiaDelMes()
  const { data } = await supabase.from('tavily_uso').select('busquedas').eq('user_id', userId).eq('mes', mes).maybeSingle()
  const actual = data?.busquedas ?? 0
  const { error } = await supabase.from('tavily_uso').upsert({ user_id: userId, mes, busquedas: actual + 1 })
  if (error) console.error('[revisar-objetivos] no se pudo incrementar tavily_uso:', error.message)
}

// --- Gemini: misma cuota diaria que ai-chat, leída sin auth.uid() ----------
//
// `uso_ia_hoy()`/`incrementar_uso_ia()` son `security invoker` y dependen de
// `auth.uid()` — acá no hay JWT de usuario (corre con service_role), así que
// se lee/escribe `ia_uso` directo por `user_id` explícito en vez de llamar
// esas RPC.

async function usoIaHoy(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('ia_uso')
    .select('solicitudes')
    .eq('user_id', userId)
    .eq('fecha', hoyPacifico())
    .maybeSingle()
  return data?.solicitudes ?? 0
}

async function incrementarUsoIa(supabase: SupabaseClient, userId: string): Promise<void> {
  const fecha = hoyPacifico()
  const actual = await usoIaHoy(supabase, userId)
  const { error } = await supabase.from('ia_uso').upsert({ user_id: userId, fecha, solicitudes: actual + 1 })
  if (error) console.error('[revisar-objetivos] no se pudo incrementar ia_uso:', error.message)
}

// --- Push --------------------------------------------------------------------

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

async function mandarPush(
  supabase: SupabaseClient,
  userId: string,
  objetivoId: number,
  mensaje: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !data || data.length === 0) return false

  const payload = JSON.stringify({
    title: 'Ámbar',
    body: mensaje,
    url: '/objetivos',
    tag: `objetivo-${objetivoId}`,
  })

  let enviada = false
  for (const sub of data as SubRow[]) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      enviada = true
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 410 || statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('[revisar-objetivos] web-push error', statusCode, (err as Error).message)
      }
    }
  }
  return enviada
}

// --- Pipeline por objetivo ---------------------------------------------------

interface ObjetivoVencido {
  id: number
  user_id: string
  descripcion: string
  frecuencia: string
  valor_actual: string | null
}

type ResultadoRevision = 'novedad' | 'sin_novedad' | 'saltado'

async function revisarUno(
  supabase: SupabaseClient,
  objetivo: ObjetivoVencido,
  encryptionSecret: string,
): Promise<ResultadoRevision> {
  if (!(await hayMargenTavily(supabase, objetivo.user_id))) {
    console.log(`[revisar-objetivos] objetivo ${objetivo.id}: saltado, tope mensual propio de Tavily alcanzado`)
    return 'saltado'
  }

  const { data: ajustes, error: errAjustes } = await supabase
    .from('ajustes_ia')
    .select('tavily_api_key_encrypted, gemini_api_key_encrypted, cuota_diaria_aprendida, cuota_diaria_aprendida_modelo')
    .eq('user_id', objetivo.user_id)
    .maybeSingle()

  if (errAjustes || !ajustes?.tavily_api_key_encrypted || !ajustes.gemini_api_key_encrypted) {
    console.log(`[revisar-objetivos] objetivo ${objetivo.id}: saltado, faltan keys BYOK de Tavily y/o Gemini`)
    return 'saltado'
  }

  let tavilyKey: string
  let geminiKey: string
  try {
    tavilyKey = await decryptApiKey(ajustes.tavily_api_key_encrypted, encryptionSecret)
    geminiKey = await decryptApiKey(ajustes.gemini_api_key_encrypted, encryptionSecret)
  } catch (err) {
    console.error(
      `[revisar-objetivos] objetivo ${objetivo.id}: no se pudo descifrar una key:`,
      err instanceof Error ? err.message : err,
    )
    return 'saltado'
  }

  const busqueda = await buscarEnInternet(tavilyKey, objetivo.descripcion, 'basic')
  if (!busqueda.ok) {
    console.error(`[revisar-objetivos] objetivo ${objetivo.id}: Tavily falló: ${busqueda.error}`)
    return 'saltado'
  }
  // Se cuenta como gasto real aunque después el resto del pipeline falle: la
  // búsqueda ya se hizo, es lo que consume la cuota de Tavily.
  await incrementarTavilyUso(supabase, objetivo.user_id)

  if (busqueda.resultados.length === 0) {
    console.log(`[revisar-objetivos] objetivo ${objetivo.id}: Tavily no devolvió resultados`)
    return 'saltado'
  }

  const learned =
    ajustes.cuota_diaria_aprendida_modelo === GEMINI_MODEL_COMPARACION ? ajustes.cuota_diaria_aprendida : null
  if (learned != null && (await usoIaHoy(supabase, objetivo.user_id)) >= learned) {
    console.log(`[revisar-objetivos] objetivo ${objetivo.id}: saltado, cuota diaria de Gemini ya alcanzada hoy`)
    return 'saltado'
  }

  const resultado = await compararObjetivo(geminiKey, objetivo.descripcion, objetivo.valor_actual, busqueda.resultados)
  if (!resultado) {
    console.error(`[revisar-objetivos] objetivo ${objetivo.id}: la comparación con Gemini falló`)
    return 'saltado'
  }
  await incrementarUsoIa(supabase, objetivo.user_id)

  const ahora = new Date()
  const { error: errUpdate } = await supabase
    .from('objetivos')
    .update({
      valor_actual: resultado.valorActual,
      resumen_actual: resultado.resumenActual,
      ultima_revision: ahora.toISOString(),
      proxima_revision: new Date(ahora.getTime() + intervaloMs(objetivo.frecuencia)).toISOString(),
    })
    .eq('id', objetivo.id)

  if (errUpdate) {
    console.error(`[revisar-objetivos] objetivo ${objetivo.id}: no se pudo actualizar:`, errUpdate.message)
    return 'saltado'
  }

  let notificado = false
  if (resultado.cambioSignificativo) {
    notificado = await mandarPush(
      supabase,
      objetivo.user_id,
      objetivo.id,
      resultado.mensajeNotificacion ?? resultado.resumenActual,
    )
  }

  const { error: errRevision } = await supabase.from('objetivos_revisiones').insert({
    objetivo_id: objetivo.id,
    user_id: objetivo.user_id,
    hubo_novedad: resultado.cambioSignificativo,
    valor_extraido: resultado.valorActual,
    notificado,
  })
  if (errRevision) {
    console.error(`[revisar-objetivos] objetivo ${objetivo.id}: no se pudo guardar la revisión:`, errRevision.message)
  }

  return resultado.cambioSignificativo ? 'novedad' : 'sin_novedad'
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const revisarObjetivosSecret = Deno.env.get('REVISAR_OBJETIVOS_SECRET')
  const encryptionSecret = Deno.env.get('AI_KEY_ENCRYPTION_SECRET')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ambar@example.com'

  if (!supabaseUrl || !serviceRoleKey || !revisarObjetivosSecret || !encryptionSecret || !vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'Función mal configurada (faltan secrets).' }, 500)
  }

  // Ver la cabecera del archivo: el gateway ya validó que el JWT firma bien
  // para el proyecto, pero eso también es cierto de la key anon (pública).
  // Acá se exige el secret propio, no el service_role.
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${revisarObjetivosSecret}`) {
    return jsonResponse({ error: 'No autorizado.' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const { data: vencidos, error: errVencidos } = await supabase
    .from('objetivos')
    .select('id, user_id, descripcion, frecuencia, valor_actual')
    .eq('estado', 'activo')
    .lte('proxima_revision', new Date().toISOString())

  if (errVencidos) {
    console.error('[revisar-objetivos] no se pudieron leer los objetivos vencidos:', errVencidos.message)
    return jsonResponse({ error: 'No se pudieron leer los objetivos vencidos.' }, 500)
  }

  const objetivos = (vencidos ?? []) as ObjetivoVencido[]
  console.log(`[revisar-objetivos] ${objetivos.length} objetivos vencidos`)

  let conNovedad = 0
  let sinNovedad = 0
  let saltados = 0

  for (const objetivo of objetivos) {
    const resultado = await revisarUno(supabase, objetivo, encryptionSecret)
    if (resultado === 'novedad') conNovedad++
    else if (resultado === 'sin_novedad') sinNovedad++
    else saltados++
  }

  return jsonResponse({
    ok: true,
    vencidos: objetivos.length,
    con_novedad: conNovedad,
    sin_novedad: sinNovedad,
    saltados,
  })
})
