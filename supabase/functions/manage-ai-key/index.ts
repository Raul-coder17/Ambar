// Edge Function: manage-ai-key
//
// Guarda/borra las API keys BYOK del usuario autenticado (Gemini, Tavily, y
// desde el backlog adelantado también Spoonacular, TMDB y Jina Reader) en
// `ajustes_ia`. Ninguna key se persiste en texto plano: se cifra con AES-GCM
// (secret `AI_KEY_ENCRYPTION_SECRET`, definido como secret de proyecto) antes
// de escribirla. Ninguna respuesta de esta función devuelve una key, ni en
// texto plano ni cifrada.
//
// `provider` ('gemini' | 'tavily' | 'spoonacular' | 'tmdb' | 'jina', default
// 'gemini' por compatibilidad con el cliente de Fase 1) decide qué columna se
// toca. Sólo Gemini controla `ia_habilitada` (gatea si el chat corre en
// absoluto); las demás son aditivas — cada tool chequea directamente si su
// columna es NULL, y guardar/borrar su key nunca toca
// `gemini_api_key_encrypted` ni `ia_habilitada` (el upsert de cada provider
// sólo lista sus propias columnas).
//
// VALIDAR AL GUARDAR: no es lo mismo para los cinco.
//   - gemini: valida contra GET /v1beta/models (gratis, sin cuota de por medio).
//   - tmdb: valida contra GET /3/authentication (igual de gratis — TMDB no
//     tiene cuota por puntos, sólo rate-limiting, así que probar la key no
//     cuesta nada real).
//   - tavily, spoonacular y jina: NO se validan al guardar. Ninguna tiene un
//     endpoint de "solo probar la key" sin gastar una unidad de cuota real
//     (búsqueda, receta o lectura), y las tres tienen free tier limitado
//     (~1000/mes Tavily, 150 puntos/día Spoonacular, 20 RPM Jina sin key vs.
//     200 RPM con key gratis). Si la key es inválida, la tool correspondiente
//     lo va a reportar con un mensaje claro la primera vez que se use de
//     verdad. Jina además es la única de las cinco donde NO tener key no es
//     un error en absoluto: la tool sigue funcionando igual, sólo con el
//     límite más bajo del tier sin key.

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

async function isValidTmdbKey(apiKey: string): Promise<boolean> {
  const res = await fetch(
    `https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(apiKey)}`,
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

  const provider =
    body.provider === 'tavily' || body.provider === 'spoonacular' || body.provider === 'tmdb' || body.provider === 'jina'
      ? body.provider
      : 'gemini'

  // Columna de `ajustes_ia` que le corresponde a cada provider.
  const COLUMNA: Record<typeof provider, string> = {
    gemini: 'gemini_api_key_encrypted',
    tavily: 'tavily_api_key_encrypted',
    spoonacular: 'spoonacular_api_key_encrypted',
    tmdb: 'tmdb_api_key_encrypted',
    jina: 'jina_api_key_encrypted',
  }
  // Nombre de la flag que devuelve el body de respuesta (además de `ok`), para
  // que el cliente sepa qué estado reflejar sin tener que adivinar por
  // provider. `gemini` es la única con una flag real en la tabla
  // (`ia_habilitada`); las demás son sintéticas (true al guardar, false al
  // borrar) porque no tienen columna de habilitación propia.
  const FLAG: Record<typeof provider, string> = {
    gemini: 'ia_habilitada',
    tavily: 'tavily_habilitada',
    spoonacular: 'spoonacular_habilitada',
    tmdb: 'tmdb_habilitada',
    jina: 'jina_habilitada',
  }

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
    if (provider === 'tmdb') {
      const valid = await isValidTmdbKey(apiKey)
      if (!valid) {
        return jsonResponse({ error: 'La API key no es válida según TMDB.' }, 422)
      }
    }
    // tavily y spoonacular: sin validación previa, ver el comentario de cabecera.

    const encrypted = await encryptApiKey(apiKey, encryptionSecret)

    const row: Record<string, unknown> = { user_id: user.id, [COLUMNA[provider]]: encrypted }
    if (provider === 'gemini') row.ia_habilitada = true

    const { error: upsertError } = await supabase.from('ajustes_ia').upsert(row, { onConflict: 'user_id' })

    if (upsertError) {
      return jsonResponse({ error: 'No se pudo guardar la key.' }, 500)
    }

    return jsonResponse({ ok: true, [FLAG[provider]]: true })
  }

  if (body.action === 'remove') {
    const row: Record<string, unknown> = { user_id: user.id, [COLUMNA[provider]]: null }
    if (provider === 'gemini') row.ia_habilitada = false

    const { error: upsertError } = await supabase.from('ajustes_ia').upsert(row, { onConflict: 'user_id' })

    if (upsertError) {
      return jsonResponse({ error: provider === 'gemini' ? 'No se pudo desactivar la IA.' : 'No se pudo quitar la key.' }, 500)
    }

    return jsonResponse({ ok: true, [FLAG[provider]]: false })
  }

  return jsonResponse({ error: 'Acción desconocida.' }, 400)
})
