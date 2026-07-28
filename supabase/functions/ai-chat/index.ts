// Edge Function: ai-chat
//
// Chat de texto (Gemini, gemini-3.1-flash-lite) con function-calling. Descifra
// la key del usuario y hace la llamada REST a Gemini, mismo patrón que
// Organizador-IA (ai-assistant). La arquitectura de tools está lista (ver
// tools.ts) pero el registro está vacío: Fase 3 conecta ahí la primera tool
// real (Tavily). Sin tools, el loop llama a Gemini una vez y devuelve texto.
//
// Reglas de seguridad clave:
// - Requiere JWT de usuario válido + ia_habilitada = true con key guardada.
// - La key descifrada nunca se persiste ni se devuelve al cliente.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

async function decryptApiKey(payload: string, secretB64: string): Promise<string> {
  const [ivB64, ctB64] = payload.split('.')
  if (!ivB64 || !ctB64) throw new Error('Formato de key cifrada inválido.')
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0))
  const secretBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('raw', secretBytes, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// ---------------------------------------------------------------------------

export interface MensajeHistorial {
  role: 'user' | 'assistant'
  text: string
}

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

// Historial plano: sin persistencia todavía (eso es Fase 2, memoria), así que
// no hay turnos functionCall/functionResponse que reconstruir entre pedidos
// distintos como en Organizador-IA — sólo texto de ida y vuelta de esta sesión
// de chat en memoria del cliente.
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
  contents: GeminiContent[],
  declarations: ReturnType<typeof toolDeclarations>,
): Promise<GeminiCandidate> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        // Sin tools registradas todavía (Fase 1): no mandamos `tools` en
        // absoluto en vez de un `functionDeclarations` vacío.
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

  const contents = buildContents(messages)
  if (contents.length === 0) {
    return jsonResponse({ error: 'Faltan mensajes.' }, 400)
  }

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

      const candidate = await callGemini(apiKey, contents, declarations)

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
        return jsonResponse({ respuesta_texto: textFromParts(parts) || 'Listo.', ...usageField() })
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
          ? await tool.handler(call.args, { supabase, userId: user.id })
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
