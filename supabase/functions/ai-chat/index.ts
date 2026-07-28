// Edge Function: ai-chat
//
// Chat de texto (Gemini, gemini-3.1-flash-lite) con function-calling. Descifra
// la key del usuario y hace la llamada REST a Gemini, mismo patrón que
// Organizador-IA (ai-assistant). Fase 3 conecta la primera tool de búsqueda
// (Tavily) en el mismo registro de `tools.ts`.
//
// Fase 2 le agregó memoria. El request a Gemini ya NO lleva el historial
// completo: lleva los hechos del usuario y los recuerdos relevantes en la
// system instruction, más los últimos turnos en `contents` (ver memoria.ts).
// Y después de contestar, el intercambio se guarda embebido en
// memoria_vectorial para poder recuperarlo más adelante.
//
// Reglas de seguridad clave:
// - Requiere JWT de usuario válido + ia_habilitada = true con key guardada.
// - La key descifrada nunca se persiste ni se devuelve al cliente.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptApiKey } from './crypto.ts'
import { generarEmbedding, vectorLiteral } from './embeddings.ts'
import {
  bloqueMemoria,
  filtrarRecuerdos,
  textoDelIntercambio,
  turnosRecientes,
  ultimoMensajeUsuario,
  TOP_K,
  type Hecho,
  type MensajeHistorial,
  type Recuerdo,
} from './memoria.ts'
import { decideRpmSlot } from './rpm.ts'
import { findTool, toolDeclarations } from './tools.ts'

// gemini-3.1-flash-lite (no "-preview": esa variante quedó dada de baja).
// Mismo modelo que Organizador-IA.
const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const MAX_TURNS = 5
// RPM real de este modelo para este proyecto (AI Studio, no la guía genérica
// de 1500/15). Es fijo, a diferencia de cuota_diaria_aprendida: no hay 429 del
// que "aprenderlo" de forma confiable con esta granularidad, así que se
// hardcodea como el límite conocido del modelo/cuenta.
const GEMINI_RPM = 15
const RPM_WINDOW_MS = 60_000

// Base fija de la personalidad. Lo que sabe del usuario NO va acá: se le
// agrega por request en `bloqueMemoria()`, porque cambia con cada charla.
const SYSTEM_INSTRUCTION =
  'Sos Ámbar, el asistente personal del usuario. Respondé siempre en español, de forma breve y clara.'

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

// ---------------------------------------------------------------------------

export type { MensajeHistorial }

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}

interface GeminiContent {
  role: string
  parts: GeminiPart[]
}

interface GeminiCandidate {
  content?: GeminiContent
  finishReason?: string
}

// Historial plano: acá entran sólo los turnos RECIENTES (ya recortados por
// `turnosRecientes`), no la charla entera. Lo que quedó afuera vuelve por RAG
// desde memoria_vectorial si viene al caso.
//
// Sigue sin haber turnos functionCall/functionResponse que reconstruir entre
// pedidos distintos como en Organizador-IA: `recordar_hecho` se resuelve entera
// dentro de este mismo request (no espera confirmación del usuario como las
// acciones `propose*` de allá), así que no queda nada pendiente que contarle a
// Gemini en el request siguiente.
function buildContents(messages: MensajeHistorial[]): GeminiContent[] {
  return messages
    .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }))
}

function textFromParts(parts: GeminiPart[]): string {
  return parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()
}

function allFunctionCalls(parts: GeminiPart[]): { name: string; args: Record<string, unknown> }[] {
  return parts
    .filter((p) => p.functionCall)
    .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }))
}

// Info de rate limit aprendida de un 429 (nada hardcodeado): el propio body
// de Gemini trae el quotaId, el quotaValue real y el retryDelay.
interface RateLimitInfo {
  kind: 'day' | 'short'
  quotaValue?: number
  retryDelaySeconds?: number
  quotaId?: string
}

class GeminiError extends Error {
  constructor(
    public userMessage: string,
    public rateLimit?: RateLimitInfo,
  ) {
    super(userMessage)
    this.name = 'GeminiError'
  }
}

function parseRateLimit(rawBody: string): RateLimitInfo {
  try {
    const parsed = JSON.parse(rawBody)
    const details = Array.isArray(parsed?.error?.details) ? parsed.error.details : []
    const quotaFailure = details.find((d: Record<string, unknown>) =>
      String(d['@type'] ?? '').includes('QuotaFailure'),
    )
    const retryInfo = details.find((d: Record<string, unknown>) => String(d['@type'] ?? '').includes('RetryInfo'))
    const violation = quotaFailure?.violations?.[0] ?? {}
    const quotaId: string = violation.quotaId ?? ''
    const quotaValue = violation.quotaValue != null ? Number(violation.quotaValue) : undefined

    let retryDelaySeconds: number | undefined
    const rawDelay = retryInfo?.retryDelay
    if (typeof rawDelay === 'string') {
      const m = rawDelay.match(/([\d.]+)s/)
      if (m) retryDelaySeconds = Math.ceil(Number(m[1]))
    }

    const isDay = /perday|daily/i.test(quotaId)
    const isShort = /perminute|persecond/i.test(quotaId)
    const kind: 'day' | 'short' = isDay
      ? 'day'
      : isShort
        ? 'short'
        : retryDelaySeconds != null && retryDelaySeconds <= 120
          ? 'short'
          : 'day'

    return { kind, quotaValue: Number.isFinite(quotaValue) ? quotaValue : undefined, retryDelaySeconds, quotaId }
  } catch {
    return { kind: 'day' }
  }
}

function mensajeCuotaDiaria(n?: number): string {
  const cuota = n != null ? `tus ${n} mensajes` : 'tus mensajes'
  return `Ya usaste ${cuota} de IA de hoy. Volvé mañana (la cuota se reinicia a medianoche, hora del Pacífico de EE.UU.).`
}

function mensajeCuotaCorta(segundos?: number): string {
  if (segundos != null) {
    return `Alcanzaste el límite de mensajes por minuto. Esperá ${segundos} segundos y volvé a intentar.`
  }
  return 'Alcanzaste el límite de mensajes por minuto. Esperá un momento y volvé a intentar.'
}

function mensajeRpmProactivo(segundos: number): string {
  return `Vas rápido: llegaste al máximo de ${GEMINI_RPM} mensajes por minuto. Esperá ${segundos} segundo${segundos === 1 ? '' : 's'} y volvé a intentar.`
}

// Antes de CADA llamada real a Gemini, chequea cuántas hubo en los últimos
// RPM_WINDOW_MS y decide si hay lugar. Poda sus propias marcas viejas de paso,
// así ia_llamadas_log no crece sin límite con el uso normal.
async function reserveRpmSlot(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const nowMs = Date.now()
  const desdeIso = new Date(nowMs - RPM_WINDOW_MS).toISOString()

  await supabase.from('ia_llamadas_log').delete().eq('user_id', userId).lt('called_at', desdeIso)

  const { data } = await supabase
    .from('ia_llamadas_log')
    .select('called_at')
    .eq('user_id', userId)
    .gte('called_at', desdeIso)

  const timestamps = (data ?? []).map((r) => new Date(r.called_at as string).getTime())
  const decision = decideRpmSlot(timestamps, GEMINI_RPM, RPM_WINDOW_MS, nowMs)

  if (decision.allowed) {
    await supabase.from('ia_llamadas_log').insert({ user_id: userId, called_at: new Date(nowMs).toISOString() })
  }

  return decision
}

function translateGeminiError(status: number, rawBody: string): string {
  let apiStatus = ''
  let reason = ''
  try {
    const parsed = JSON.parse(rawBody)
    apiStatus = parsed?.error?.status ?? ''
    const details = Array.isArray(parsed?.error?.details) ? parsed.error.details : []
    reason = details.find((d: { reason?: string }) => d?.reason)?.reason ?? ''
  } catch {
    // body no-JSON: seguimos solo con el status HTTP.
  }

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return 'Se alcanzó el límite de uso de la IA por ahora. Intentá de nuevo en unos minutos, o revisá tu plan de Gemini si esto se repite seguido.'
  }
  if (status === 400 && reason === 'API_KEY_INVALID') {
    return 'Tu API key de Gemini no es válida. Volvé a guardarla en Ajustes.'
  }
  if (status === 403 || apiStatus === 'PERMISSION_DENIED') {
    return 'Tu cuenta de Gemini no tiene acceso a este modelo. Revisá tu plan en Google AI Studio.'
  }
  if (status === 500 || status === 503) {
    return 'El servicio de IA está teniendo problemas ahora mismo. Intentá de nuevo en un momento.'
  }
  return `Hubo un problema con la IA (código ${status}). Intentá de nuevo; si se repite, avisá.`
}

async function callGemini(
  apiKey: string,
  systemInstruction: string,
  contents: GeminiContent[],
  declarations: ReturnType<typeof toolDeclarations>,
): Promise<GeminiCandidate> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        // Con el registro vacío no se manda `tools` en absoluto, en vez de un
        // `functionDeclarations` vacío. Desde Fase 2 siempre hay al menos
        // `recordar_hecho`, pero la guarda queda: es la que hace que el registro
        // sea la única fuente de verdad de qué tools existen.
        ...(declarations.length > 0 ? { tools: [{ functionDeclarations: declarations }] } : {}),
        generationConfig: {
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
        },
      }),
    },
  )

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '<sin body>')
    console.error(`[ai-chat] Gemini no-ok: status=${res.status} body=${rawBody}`)
    if (res.status === 429) {
      const rl = parseRateLimit(rawBody)
      const msg = rl.kind === 'day' ? mensajeCuotaDiaria(rl.quotaValue) : mensajeCuotaCorta(rl.retryDelaySeconds)
      throw new GeminiError(msg, rl)
    }
    throw new GeminiError(translateGeminiError(res.status, rawBody))
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]
  if (!candidate) {
    console.error(`[ai-chat] Gemini 200 sin candidates: ${JSON.stringify(data)}`)
    throw new Error(`Respuesta de Gemini sin candidates: ${JSON.stringify(data)}`)
  }
  return candidate as GeminiCandidate
}

// --- Memoria (Fase 2) -------------------------------------------------------
//
// Todo lo de acá es best-effort: si algo de la memoria falla, el chat contesta
// igual, sólo que sin contexto o sin guardar ese intercambio. Nada de esto
// cuenta en ia_uso ni en ia_llamadas_log: esos contadores miden el RPD/RPM de
// gemini-3.1-flash-lite, y el modelo de embeddings tiene su propia cuota.

async function cargarHechos(supabase: SupabaseClient, userId: string): Promise<Hecho[]> {
  const { data, error } = await supabase
    .from('memoria_hechos')
    .select('hecho, categoria')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[ai-chat] no se pudieron cargar los hechos:', error.message)
    return []
  }
  return (data ?? []) as Hecho[]
}

async function buscarRecuerdos(supabase: SupabaseClient, embedding: number[]): Promise<Recuerdo[]> {
  const { data, error } = await supabase.rpc('buscar_memoria_vectorial', {
    consulta: vectorLiteral(embedding),
    limite: TOP_K,
  })

  if (error) {
    console.error('[ai-chat] falló la búsqueda vectorial:', error.message)
    return []
  }
  return filtrarRecuerdos((data ?? []) as Recuerdo[])
}

// Guarda el intercambio embebido. Se llama DESPUÉS de haberle contestado al
// usuario (ver `enSegundoPlano`), así que su latencia no se siente en el chat.
async function guardarIntercambio(
  supabase: SupabaseClient,
  apiKey: string,
  userId: string,
  pregunta: string,
  respuesta: string,
): Promise<void> {
  const contenido = textoDelIntercambio(pregunta, respuesta)
  // RETRIEVAL_DOCUMENT y no RETRIEVAL_QUERY: éste es el lado "documento" de la
  // búsqueda. Gemini entrena los dos lados de forma asimétrica y mezclarlos
  // degrada la similitud.
  const embedding = await generarEmbedding(apiKey, contenido, 'RETRIEVAL_DOCUMENT')

  // Sin embedding se guarda igual: perder el texto sería peor que perder el
  // vector (la columna es nullable justamente por esto).
  const { error } = await supabase.from('memoria_vectorial').insert({
    user_id: userId,
    contenido,
    embedding: embedding ? vectorLiteral(embedding) : null,
  })

  if (error) console.error('[ai-chat] no se pudo guardar el intercambio:', error.message)
}

// Deja corriendo una tarea después de haber devuelto la respuesta. `waitUntil`
// es lo que evita que el runtime mate el isolate con la escritura a mitad de
// camino; el fallback es para cuando la función corre fuera de Supabase
// (`supabase functions serve` viejo, tests locales).
function enSegundoPlano(tarea: Promise<unknown>): void {
  const seguro = tarea.catch((err) =>
    console.error('[ai-chat] tarea de memoria falló:', err instanceof Error ? err.message : err),
  )
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(seguro)
}

// ---------------------------------------------------------------------------

function messageForFinishReason(reason?: string): string {
  switch (reason) {
    case 'MAX_TOKENS':
      return 'La respuesta se cortó por límite de tokens. Probá un mensaje más corto o reformulá.'
    case 'SAFETY':
      return 'Gemini bloqueó la respuesta por contenido. Reformulá el pedido.'
    case 'RECITATION':
      return 'Gemini bloqueó la respuesta por recitación de contenido protegido. Reformulá el pedido.'
    default:
      return `No pude generar una respuesta (motivo: ${reason ?? 'desconocido'}). Probá reformular el pedido.`
  }
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

  const { data: settings } = await supabase
    .from('ajustes_ia')
    .select('ia_habilitada, gemini_api_key_encrypted, cuota_diaria_aprendida, cuota_diaria_aprendida_modelo')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!settings?.ia_habilitada || !settings.gemini_api_key_encrypted) {
    return jsonResponse({ error: 'Guardá tu API key de Gemini en Ajustes primero.' }, 400)
  }

  // La cuota aprendida vale SÓLO para el modelo bajo el que se aprendió: cada
  // modelo tiene su propio RPD. Si no coincide con el que estamos usando ahora
  // se ignora y se reaprende del próximo 429 real.
  const learned: number | null =
    settings.cuota_diaria_aprendida_modelo === GEMINI_MODEL ? (settings.cuota_diaria_aprendida ?? null) : null

  // Pre-flight: si ya aprendimos la cuota diaria y hoy la alcanzamos,
  // respondemos al instante sin gastar una llamada a Gemini que igual daría 429.
  if (learned != null) {
    const { data: usedToday } = await supabase.rpc('uso_ia_hoy')
    if (typeof usedToday === 'number' && usedToday >= learned) {
      return jsonResponse({
        respuesta_texto: mensajeCuotaDiaria(learned),
        rate_limit: { kind: 'day', quota_value: learned },
        usage: { used_today: usedToday, daily_quota: learned },
      })
    }
  }

  let apiKey: string
  try {
    apiKey = await decryptApiKey(settings.gemini_api_key_encrypted, encryptionSecret)
  } catch {
    return jsonResponse({ error: 'No se pudo descifrar la key. Volvé a guardarla en Ajustes.' }, 500)
  }

  let body: { messages?: MensajeHistorial[] }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Body inválido.' }, 400)
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return jsonResponse({ error: 'Faltan mensajes.' }, 400)
  }

  // (c) Los últimos turnos, no la charla entera.
  const contents = buildContents(turnosRecientes(messages))
  if (contents.length === 0) {
    return jsonResponse({ error: 'Faltan mensajes.' }, 400)
  }

  // (a) Los hechos, siempre todos; (b) los recuerdos que se parezcan a lo que
  // el usuario acaba de escribir. Se piden en paralelo porque no dependen uno
  // del otro y los dos están entre el mensaje y la respuesta.
  const pregunta = ultimoMensajeUsuario(messages)
  const [hechos, recuerdos] = await Promise.all([
    cargarHechos(supabase, user.id),
    (async () => {
      if (!pregunta) return []
      const embedding = await generarEmbedding(apiKey, pregunta, 'RETRIEVAL_QUERY')
      return embedding ? await buscarRecuerdos(supabase, embedding) : []
    })(),
  ])

  const systemInstruction = SYSTEM_INSTRUCTION + bloqueMemoria(hechos, recuerdos)
  console.log(`[ai-chat] contexto: hechos=${hechos.length} recuerdos=${recuerdos.length} turnos=${contents.length}`)

  const declarations = toolDeclarations()

  let usedToday: number | null = null
  const usageField = () => ({ usage: { used_today: usedToday ?? undefined, daily_quota: learned ?? undefined } })

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Freno proactivo: chequeamos ANTES de gastar la llamada, no después de
      // que Gemini nos devuelva un 429.
      const rpm = await reserveRpmSlot(supabase, user.id)
      if (!rpm.allowed) {
        return jsonResponse({
          respuesta_texto: mensajeRpmProactivo(rpm.retryAfterSeconds),
          rate_limit: { kind: 'short', retry_after_seconds: rpm.retryAfterSeconds },
          ...usageField(),
        })
      }

      const candidate = await callGemini(apiKey, systemInstruction, contents, declarations)

      // Llamada exitosa: incrementamos el contador diario (atómico, respeta RLS).
      const { data: nuevo } = await supabase.rpc('incrementar_uso_ia')
      if (typeof nuevo === 'number') usedToday = nuevo

      const parts = candidate.content?.parts

      if (!parts || parts.length === 0) {
        console.error(
          `[ai-chat] candidate sin parts (finishReason=${candidate.finishReason ?? 'null'}): ${JSON.stringify(candidate)}`,
        )
        return jsonResponse({ respuesta_texto: messageForFinishReason(candidate.finishReason), ...usageField() })
      }

      const calls = allFunctionCalls(parts)

      if (calls.length === 0) {
        const respuesta = textFromParts(parts) || 'Listo.'
        // El intercambio se guarda sólo cuando hubo una respuesta de verdad:
        // los avisos de cuota o de finishReason no son conversación y no tienen
        // nada que valga la pena recordar.
        if (pregunta) {
          enSegundoPlano(guardarIntercambio(supabase, apiKey, user.id, pregunta, respuesta))
        }
        return jsonResponse({ respuesta_texto: respuesta, ...usageField() })
      }

      // Ejecuta cada function call contra el registro de tools (vacío en Fase
      // 1) y reinyecta los resultados como functionResponse para el próximo
      // turno. Una call que no matchea ninguna tool conocida (no debería pasar
      // mientras el registro esté vacío, ya que no mandamos `tools`) devuelve
      // un error a Gemini en vez de colgar el loop.
      contents.push(candidate.content!)
      const responseParts: GeminiPart[] = []
      for (const call of calls) {
        const tool = findTool(call.name)
        const result = tool
          ? await tool.handler(call.args, { supabase, userId: user.id, encryptionSecret })
          : { error: `Tool desconocida: ${call.name}` }
        responseParts.push({ functionResponse: { name: call.name, response: result as Record<string, unknown> } })
      }
      contents.push({ role: 'user', parts: responseParts })
    }

    return jsonResponse({ respuesta_texto: 'No pude terminar de procesar el pedido. Probá reformularlo.', ...usageField() })
  } catch (err) {
    console.error('[ai-chat] fallo en el loop:', err instanceof Error ? err.stack ?? err.message : err)

    if (err instanceof GeminiError && err.rateLimit) {
      const rl = err.rateLimit
      if (rl.kind === 'day') {
        if (rl.quotaValue != null) {
          await supabase
            .from('ajustes_ia')
            .update({ cuota_diaria_aprendida: rl.quotaValue, cuota_diaria_aprendida_modelo: GEMINI_MODEL })
            .eq('user_id', user.id)
        }
        return jsonResponse({
          respuesta_texto: err.userMessage,
          rate_limit: { kind: 'day', quota_value: rl.quotaValue ?? learned ?? undefined },
          ...usageField(),
        })
      }
      return jsonResponse({
        respuesta_texto: err.userMessage,
        rate_limit: { kind: 'short', retry_after_seconds: rl.retryDelaySeconds },
        ...usageField(),
      })
    }

    const mensaje =
      err instanceof GeminiError
        ? err.userMessage
        : 'Ocurrió un error inesperado con el asistente. Intentá de nuevo en un momento.'
    return jsonResponse({ error: mensaje }, 502)
  }
})
