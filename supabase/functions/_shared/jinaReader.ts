// Lectura de páginas web vía Jina Reader (`leer_pagina`).
//
// Mismo patrón que `tavily.ts`: es el RESULTADO de una tool que el modelo
// pidió a propósito, así que los errores no se tragan en silencio — se
// devuelven en el mismo objeto que se manda de vuelta como functionResponse.

const JINA_READER_URL = 'https://r.jina.ai/'
// Una página entera puede ser mucho más larga que un resultado de búsqueda de
// Tavily: 6000 da margen para el contenido real de un artículo sin volcar la
// página completa al contexto de un modelo flash-lite.
const MAX_LARGO_CONTENIDO = 6000

export type ResultadoJina = { ok: true; contenido: string } | { ok: false; error: string }

// `apiKey` es null cuando el usuario no configuró una: Jina Reader funciona
// sin key en su tier gratis, así que la ausencia de key no es un error —
// simplemente no se manda el header `Authorization`.
export async function leerPagina(apiKey: string | null, url: string): Promise<ResultadoJina> {
  let res: Response
  try {
    res = await fetch(`${JINA_READER_URL}${url}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
  } catch (err) {
    console.error('[jinaReader] fetch falló:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'No se pudo conectar con Jina Reader en este momento. Probá de nuevo en un rato.' }
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '<sin body>')
    console.error(`[jinaReader] no-ok: status=${res.status} body=${rawBody}`)

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: apiKey
          ? 'La API key de Jina no es válida. Volvé a guardarla en Ajustes.'
          : 'No se pudo leer la página. Probá guardar una API key de Jina en Ajustes.',
      }
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: 'Se alcanzó el límite de lecturas de Jina Reader por ahora. Probá de nuevo más tarde.',
      }
    }
    return {
      ok: false,
      error: `Jina Reader devolvió un error (código ${res.status}). Probá de nuevo en un momento.`,
    }
  }

  const contenido = await res.text().catch(() => '')
  return { ok: true, contenido: contenido.trim().slice(0, MAX_LARGO_CONTENIDO) }
}
