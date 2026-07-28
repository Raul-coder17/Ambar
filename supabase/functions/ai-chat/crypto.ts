// Descifrado AES-GCM de las API keys guardadas por `manage-ai-key`.
//
// Compartido entre index.ts (key de Gemini) y tools.ts (key de Tavily, Fase 3):
// las dos vienen cifradas con el mismo patrón — payload `iv_base64.ciphertext_base64`,
// secret `AI_KEY_ENCRYPTION_SECRET` — así que el descifrado es una sola función.

export async function decryptApiKey(payload: string, secretB64: string): Promise<string> {
  const [ivB64, ctB64] = payload.split('.')
  if (!ivB64 || !ctB64) throw new Error('Formato de key cifrada inválido.')
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0))
  const secretBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('raw', secretBytes, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
  return new TextDecoder().decode(plaintext)
}
