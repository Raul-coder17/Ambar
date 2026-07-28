// Búsqueda web vía Tavily (Fase 3).
//
// A diferencia de `embeddings.ts` (que es memoria de fondo y nunca debe
// romper el chat), esto es el RESULTADO de una tool que el modelo pidió a
// propósito: si falla, Gemini tiene que enterarse con un motivo claro para
// poder explicárselo al usuario en vez de inventar una respuesta. Por eso acá
// no se traga errores en silencio — se devuelven en el mismo objeto que se
// manda de vuelta como functionResponse.

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const MAX_RESULTADOS = 5
// Cada resultado se trunca: son varios por búsqueda y van al contexto de un
// modelo flash-lite, no hace falta el artículo entero para que conteste.
// 500 resultó demasiado corto: en la práctica cortaba el `content` de Tavily
// antes del dato puntual (precio, fecha) que a veces viene más adelante en el
// extracto, no al principio. 2000 da margen sin volverse el artículo entero.
const MAX_LARGO_CONTENIDO = 2000

export interface ResultadoBusqueda {
  titulo: string
  url: string
  contenido: string
}

export type ResultadoTavily =
  | { ok: true; resultados: ResultadoBusqueda[] }
  | { ok: false; error: string }

export async function buscarEnInternet(apiKey: string, query: string): Promise<ResultadoTavily> {
  let res: Response
  try {
    res = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        // 'advanced' hace mejor extracción de contenido que 'basic' (menos
        // probable que se pierda un precio o una fecha puntual en el
        // resumen). Cuesta más cuota por búsqueda, pero el free tier de
        // Tavily (~1000/mes) da margen de sobra para este uso.
        search_depth: 'advanced',
        max_results: MAX_RESULTADOS,
      }),
    })
  } catch (err) {
    console.error('[ai-chat] tavily: fetch falló:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'No se pudo conectar con Tavily en este momento. Probá de nuevo en un rato.' }
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '<sin body>')
    console.error(`[ai-chat] tavily no-ok: status=${res.status} body=${rawBody}`)

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: 'La API key de Tavily no es válida. Volvé a guardarla en Ajustes.',
      }
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: 'Se alcanzó el límite de búsquedas de Tavily por ahora. Probá de nuevo más tarde.',
      }
    }
    return {
      ok: false,
      error: `Tavily devolvió un error (código ${res.status}). Probá de nuevo en un momento.`,
    }
  }

  const data = await res.json().catch(() => null)
  const crudos = Array.isArray(data?.results) ? data.results : []

  const resultados: ResultadoBusqueda[] = crudos
    .filter((r: Record<string, unknown>) => typeof r?.url === 'string')
    .slice(0, MAX_RESULTADOS)
    .map((r: Record<string, unknown>) => ({
      titulo: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : (r.url as string),
      url: r.url as string,
      contenido:
        typeof r.content === 'string' ? r.content.trim().slice(0, MAX_LARGO_CONTENIDO) : '',
    }))

  return { ok: true, resultados }
}
