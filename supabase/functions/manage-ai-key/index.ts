// Edge Function: manage-ai-key
//
// Guarda/borra las API keys BYOK del usuario autenticado (Gemini, y desde
// Fase 3 también Tavily) en `ajustes_ia`. Ninguna key se persiste en texto
// plano: se cifra con AES-GCM (secret `AI_KEY_ENCRYPTION_SECRET`, definido
// como secret de proyecto) antes de escribirla. Ninguna respuesta de esta
// función devuelve una key, ni en texto plano ni cifrada.
//
// `provider` ('gemini' | 'tavily', default 'gemini' por compatibilidad con el
// cliente de Fase 1) decide qué columna se toca. Gemini es distinto en dos
// cosas, ninguna aplicable a Tavily:
//   - se valida contra la API antes de guardar (GET /v1beta/models);
//   - controla `ia_habilitada`, que es lo que gatea si el chat corre.
// Tavily no tiene endpoint de "solo validar" sin gastar una búsqueda real, así
// que se guarda sin validar (se decidió no pagar esa unidad de cuota sólo para
// probar la key) — si es inválida, `buscar_en_internet` lo va a reportar con
// un mensaje claro la primera vez que se use. Y al no tener un flag de
// habilitación propio, guardar/borrar la key de Tavily nunca toca
// `gemini_api_key_encrypted` ni `ia_habilitada` (el upsert sólo lista la
// columna de Tavily).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function encryptApiKey(apiKey: string, secretB64: string): Promise<string> {
  const secretBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('raw', secretBytes, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(apiKey))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`
}

async function isValidGeminiKey(apiKey: string): Promise<boolean> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  )
  return res.ok
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

  let body: { action?: string; apiKey?: string; provider?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Body inválido.' }, 400)
  }

  const provider = body.provider === 'tavily' ? 'tavily' : 'gemini'

  if (body.action === 'save') {
    const apiKey = body.apiKey?.trim()
    if (!apiKey) {
      return jsonResponse({ error: 'Falta la API key.' }, 400)
    }

    if (provider === 'gemini') {
      const valid = await isValidGeminiKey(apiKey)
      if (!valid) {
        return jsonResponse({ error: 'La API key no es válida según Gemini.' }, 422)
      }
    }

    const encrypted = await encryptApiKey(apiKey, encryptionSecret)

    const row =
      provider === 'gemini'
        ? { user_id: user.id, gemini_api_key_encrypted: encrypted, ia_habilitada: true }
        : { user_id: user.id, tavily_api_key_encrypted: encrypted }

    const { error: upsertError } = await supabase.from('ajustes_ia').upsert(row, { onConflict: 'user_id' })

    if (upsertError) {
      return jsonResponse({ error: 'No se pudo guardar la key.' }, 500)
    }

    return provider === 'gemini'
      ? jsonResponse({ ok: true, ia_habilitada: true })
      : jsonResponse({ ok: true, tavily_habilitada: true })
  }

  if (body.action === 'remove') {
    const row =
      provider === 'gemini'
        ? { user_id: user.id, gemini_api_key_encrypted: null, ia_habilitada: false }
        : { user_id: user.id, tavily_api_key_encrypted: null }

    const { error: upsertError } = await supabase.from('ajustes_ia').upsert(row, { onConflict: 'user_id' })

    if (upsertError) {
      return jsonResponse({ error: provider === 'gemini' ? 'No se pudo desactivar la IA.' : 'No se pudo quitar la key.' }, 500)
    }

    return provider === 'gemini'
      ? jsonResponse({ ok: true, ia_habilitada: false })
      : jsonResponse({ ok: true, tavily_habilitada: false })
  }

  return jsonResponse({ error: 'Acción desconocida.' }, 400)
})
