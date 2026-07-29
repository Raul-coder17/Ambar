// Edge Function: live
//
// Todo lo que el modo Live (Fase 4) necesita del servidor. Una sola función
// con `action`, siguiendo el precedente de `manage-ai-key` (que se extendió
// para Tavily en vez de crear una función nueva): así el bloque de CORS, auth
// y descifrado existe una sola vez.
//
// POR QUÉ EXISTE ESTA FUNCIÓN
//
// En modo texto, `ai-chat` habla con Gemini por REST y la key nunca sale del
// servidor. En Live, el audio va por WebSocket directo del navegador a Google
// — meter un proxy en el medio agregaría latencia justo en el canal donde la
// latencia ES el producto. Pero mandarle la key BYOK al navegador la expondría
// para siempre. El token efímero resuelve las dos cosas: esta función lo mintea
// con la key descifrada, y el navegador recibe una credencial que dura minutos
// y sólo sirve para la Live API.
//
// ALCANCE DE ESTE PASO (4b)
//
// Implementadas: `abrir`, `latir`, `cerrar` — o sea el token y el ciclo de vida
// del lock de sesión única. NO está el puente de tools (4d): las tools ya se
// DECLARAN en el token, pero todavía no hay nada que las ejecute, así que si el
// modelo emite un toolCall en esta etapa nadie le contesta. No usar Live de
// verdad hasta que 4d esté.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptApiKey } from '../_shared/crypto.ts'
import { bloqueMemoria, type Hecho } from '../_shared/memoria.ts'
import { systemInstructionLive } from '../_shared/prompt.ts'
import { toolDeclarations } from '../_shared/tools.ts'

// Confirmado disponible para una key gratuita de AI Studio (smoke test de R1,
// GET /v1beta/models). Es "-preview": el nombre puede cambiar, por eso vive en
// una constante y no repartido por el archivo.
const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview'

// Sulafat: voz "Warm" de la lista de 30 prebuilt voices. Ojo — `auth_tokens`
// NO valida el contenido del setup (se probó con una voz inexistente y devolvió
// 200), así que un nombre mal escrito acá no falla al mintear el token: falla
// recién al abrir el WebSocket.
const VOZ = 'Sulafat'

// El máximo que admite la API es 20 horas para los dos. Se usan los defaults
// (30 min / 60 s) a propósito: el token vive en el navegador, y una credencial
// de 20 h ahí no compra nada que no resuelva ya el re-mint. 60 s para conectar
// obliga a pedir los permisos de micrófono ANTES de pedir el token, no después.
const TOKEN_VIDA_MS = 30 * 60 * 1000
const NUEVA_SESION_VIDA_MS = 60 * 1000

// Qué campos del setup manda el servidor y el cliente NO puede pisar.
//
// ESTO NO ES OPCIONAL, Y LA RAZÓN NO ES LA QUE PARECE. El discovery document
// de la API dice que si se manda `bidiGenerateContentSetup` con el fieldMask
// VACÍO, el setup del cliente se ignora ENTERO. Y el handle de session
// resumption viaja justamente en el setup del cliente: sin máscara, el modo
// Live no podría reconectarse nunca. La máscara lista todo lo que fijamos y
// deja `sessionResumption` afuera, que es lo único que el cliente necesita
// poder mandar por su cuenta.
const FIELD_MASK = [
  'model',
  'generationConfig',
  'systemInstruction',
  'tools',
  'contextWindowCompression',
  'outputAudioTranscription',
  'inputAudioTranscription',
  'realtimeInputConfig',
].join(',')

const AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens'

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

// Motivos tipados en vez de sólo un mensaje: el cliente decide cosas distintas
// según cuál sea. `sesion_activa` NO cae a modo texto (hay que cerrar la otra
// sesión); `sin_cuota` y `live_no_disponible` sí.
type Motivo = 'sin_key' | 'sin_cuota' | 'sesion_activa' | 'live_no_disponible' | 'error'

function errorResponse(motivo: Motivo, error: string, status: number, extra: Record<string, unknown> = {}) {
  return jsonResponse({ motivo, error, ...extra }, status)
}

// ---------------------------------------------------------------------------

/**
 * El setup que queda fijado dentro del token.
 *
 * `sessionResumption` no está a propósito: no entra en el FIELD_MASK, así que
 * lo aporta el cliente en su propio setup (es donde viaja el handle al
 * reconectar). Ver el comentario de FIELD_MASK.
 */
function buildSetup(systemInstruction: string) {
  const declaraciones = toolDeclarations()

  return {
    model: LIVE_MODEL,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } },
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    ...(declaraciones.length > 0 ? { tools: [{ functionDeclarations: declaraciones }] } : {}),
    // Sin esto la sesión muere a los 15 min (audio) o 2 min (audio+video).
    // Va desde el día 1, no como afterthought: activarlo después obligaría a
    // rehacer el manejo de sesión entero.
    contextWindowCompression: { slidingWindow: {} },
    // Las transcripciones no son un extra de UI: son lo que hace posible el
    // fallback a texto (Fase 4g) y guardar la charla en memoria_vectorial.
    outputAudioTranscription: {},
    inputAudioTranscription: {},
    realtimeInputConfig: {
      // VAD automático (D5). 700ms de silencio antes de dar por terminado el
      // turno: más corto corta al usuario en medio de una pausa para pensar.
      automaticActivityDetection: { silenceDurationMs: 700 },
    },
  }
}

async function cargarHechos(supabase: SupabaseClient, userId: string): Promise<Hecho[]> {
  const { data, error } = await supabase
    .from('memoria_hechos')
    .select('hecho, categoria')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    // Best-effort, igual que en ai-chat: sin hechos Ámbar arranca la charla
    // sabiendo menos, pero arranca.
    console.error('[live] no se pudieron cargar los hechos:', error.message)
    return []
  }
  return (data ?? []) as Hecho[]
}

/** Mintea el token efímero contra la API de Gemini con la key del usuario. */
async function mintearToken(
  apiKey: string,
  systemInstruction: string,
): Promise<{ ok: true; token: string; expiraEn: string; nuevaSesionHasta: string } | { ok: false; motivo: Motivo; error: string }> {
  const ahora = Date.now()
  const expireTime = new Date(ahora + TOKEN_VIDA_MS).toISOString()
  const newSessionExpireTime = new Date(ahora + NUEVA_SESION_VIDA_MS).toISOString()

  let res: Response
  try {
    res = await fetch(AUTH_TOKENS_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Reanudar una sesión NO cuenta como uso (está en la spec del campo),
        // así que 1 alcanza para una sesión con todas sus reconexiones.
        uses: 1,
        expireTime,
        newSessionExpireTime,
        fieldMask: FIELD_MASK,
        bidiGenerateContentSetup: buildSetup(systemInstruction),
      }),
    })
  } catch (err) {
    console.error('[live] auth_tokens: fetch falló:', err instanceof Error ? err.message : err)
    return { ok: false, motivo: 'error', error: 'No se pudo contactar a Gemini para abrir el modo voz.' }
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '<sin body>')
    console.error(`[live] auth_tokens no-ok: status=${res.status} body=${rawBody}`)

    if (res.status === 429) {
      return { ok: false, motivo: 'sin_cuota', error: 'Se alcanzó el límite de uso del modo voz por ahora. Seguimos por texto.' }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        motivo: 'live_no_disponible',
        error: 'Tu cuenta de Gemini no tiene acceso al modo voz. Revisá tu plan en Google AI Studio.',
      }
    }
    if (res.status === 400) {
      return {
        ok: false,
        motivo: 'live_no_disponible',
        error: 'El modo voz quedó mal configurado del lado del servidor. Avisá que falló al abrir la sesión.',
      }
    }
    return { ok: false, motivo: 'error', error: `No se pudo abrir el modo voz (código ${res.status}).` }
  }

  const data = await res.json().catch(() => null)
  const token = data?.name
  if (typeof token !== 'string' || !token) {
    console.error(`[live] auth_tokens 200 sin name: ${JSON.stringify(data)}`)
    return { ok: false, motivo: 'error', error: 'Gemini devolvió un token vacío. Intentá de nuevo.' }
  }

  return { ok: true, token, expiraEn: expireTime, nuevaSesionHasta: newSessionExpireTime }
}

// ---------------------------------------------------------------------------

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
  const encryptionSecret = Deno.env.get('AI_KEY_ENCRYPTION_SECRET')
  if (!supabaseUrl || !supabaseAnonKey || !encryptionSecret) {
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

  let body: { action?: string; session_id?: string; handle?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Body inválido.' }, 400)
  }

  // --- abrir ---------------------------------------------------------------
  if (body.action === 'abrir') {
    const { data: settings } = await supabase
      .from('ajustes_ia')
      .select('ia_habilitada, gemini_api_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!settings?.ia_habilitada || !settings.gemini_api_key_encrypted) {
      return errorResponse('sin_key', 'Guardá tu API key de Gemini en Ajustes primero.', 400)
    }

    // El cliente puede traer su session_id (reconexión / re-mint de token);
    // si no, se genera uno nuevo.
    const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : crypto.randomUUID()

    // El lock se reclama ANTES de mintear: si hay otra sesión viva, no tiene
    // sentido gastar una llamada a Gemini.
    const { data: lockRows, error: lockError } = await supabase.rpc('reclamar_sesion_live', {
      p_session_id: sessionId,
    })

    if (lockError) {
      console.error('[live] reclamar_sesion_live falló:', lockError.message)
      return errorResponse('error', 'No se pudo abrir la sesión de voz. Intentá de nuevo.', 500)
    }

    const lock = Array.isArray(lockRows) ? lockRows[0] : lockRows
    if (!lock?.reclamada) {
      return errorResponse(
        'sesion_activa',
        'Ya tenés una sesión de voz abierta en otro lado. Cerrala antes de abrir una nueva.',
        409,
        { espera_segundos: lock?.espera_segundos ?? null },
      )
    }

    let apiKey: string
    try {
      apiKey = await decryptApiKey(settings.gemini_api_key_encrypted, encryptionSecret)
    } catch {
      await supabase.rpc('liberar_sesion_live', { p_session_id: sessionId })
      return errorResponse('sin_key', 'No se pudo descifrar la key. Volvé a guardarla en Ajustes.', 500)
    }

    // Los hechos van completos, igual que en texto. Los recuerdos por RAG no:
    // al abrir la sesión el usuario todavía no dijo nada contra qué buscar.
    // Eso lo resuelve la tool `buscar_en_memoria` (D3), que es de 4d.
    const hechos = await cargarHechos(supabase, user.id)
    const systemInstruction = systemInstructionLive() + bloqueMemoria(hechos, [])

    const minted = await mintearToken(apiKey, systemInstruction)

    if (!minted.ok) {
      // Si no hay token no hay sesión: soltar el lock, o el usuario queda
      // bloqueado 90s por una sesión que nunca existió.
      await supabase.rpc('liberar_sesion_live', { p_session_id: sessionId })
      return errorResponse(minted.motivo, minted.error, minted.motivo === 'sin_cuota' ? 429 : 502)
    }

    console.log(`[live] sesión abierta: hechos=${hechos.length} session_id=${sessionId}`)

    return jsonResponse({
      token: minted.token,
      // El cliente lo pasa tal cual a live.connect(). Va desde el servidor para
      // que no haya dos lugares donde cambiar el modelo.
      model: LIVE_MODEL,
      session_id: sessionId,
      expira_en: minted.expiraEn,
      nueva_sesion_hasta: minted.nuevaSesionHasta,
      // Si venimos a retomar una sesión que murió sin liberarse, acá viene su
      // handle de resumption para continuar la charla (lo usa 4e).
      handle_previo: lock.handle_previo ?? null,
    })
  }

  // --- latir ---------------------------------------------------------------
  if (body.action === 'latir') {
    if (!body.session_id) {
      return jsonResponse({ error: 'Falta session_id.' }, 400)
    }

    const { data: vigente, error } = await supabase.rpc('latir_sesion_live', {
      p_session_id: body.session_id,
      p_handle: body.handle ?? null,
    })

    if (error) {
      console.error('[live] latir_sesion_live falló:', error.message)
      return jsonResponse({ error: 'No se pudo renovar la sesión.' }, 500)
    }

    // vigente === false significa que otra sesión tomó el lock: el cliente
    // tiene que cerrar la suya, no reintentar.
    return jsonResponse({ vigente: Boolean(vigente) })
  }

  // --- cerrar --------------------------------------------------------------
  if (body.action === 'cerrar') {
    if (!body.session_id) {
      return jsonResponse({ error: 'Falta session_id.' }, 400)
    }

    const { data: liberada, error } = await supabase.rpc('liberar_sesion_live', {
      p_session_id: body.session_id,
    })

    if (error) {
      console.error('[live] liberar_sesion_live falló:', error.message)
      return jsonResponse({ error: 'No se pudo cerrar la sesión.' }, 500)
    }

    return jsonResponse({ liberada: Boolean(liberada) })
  }

  return jsonResponse({ error: 'Acción desconocida.' }, 400)
})
