// Búsqueda de recetas y nutrición vía Spoonacular (backlog adelantado).
//
// Mismo criterio que `tavily.ts`: esto es el RESULTADO de una tool que el
// modelo pidió a propósito, no memoria de fondo — si falla, Gemini tiene que
// enterarse con un motivo claro para poder explicárselo al usuario en vez de
// inventar una respuesta. No se traga errores en silencio.

const COMPLEX_SEARCH_URL = 'https://api.spoonacular.com/recipes/complexSearch'
const MAX_RESULTADOS = 5

export interface NutrientesReceta {
  calorias?: string
  proteina?: string
  grasa?: string
  carbohidratos?: string
}

export interface ResultadoReceta {
  titulo: string
  url: string
  nutricion?: NutrientesReceta
}

export type ResultadoSpoonacular =
  | { ok: true; resultados: ResultadoReceta[] }
  | { ok: false; error: string }

function extraerNutriente(nutrientes: unknown[], nombre: string): string | undefined {
  const n = nutrientes.find(
    (x) => typeof (x as Record<string, unknown>)?.name === 'string' && (x as Record<string, unknown>).name === nombre,
  ) as Record<string, unknown> | undefined
  if (!n) return undefined
  const amount = n.amount
  const unit = n.unit ?? ''
  return typeof amount === 'number' ? `${amount}${unit}` : undefined
}

export async function buscarRecetas(
  apiKey: string,
  opts: { consulta?: string; ingredientes?: string[]; incluirNutricion?: boolean },
): Promise<ResultadoSpoonacular> {
  const params = new URLSearchParams({
    apiKey,
    number: String(MAX_RESULTADOS),
    // 'es' pide títulos y resultados en español cuando Spoonacular tiene
    // traducción disponible; si no, cae al inglés sin romper la búsqueda.
    language: 'es',
  })
  if (opts.consulta?.trim()) params.set('query', opts.consulta.trim())
  if (opts.ingredientes && opts.ingredientes.length > 0) {
    params.set('includeIngredients', opts.ingredientes.join(','))
  }
  if (opts.incluirNutricion) params.set('addRecipeNutrition', 'true')

  let res: Response
  try {
    res = await fetch(`${COMPLEX_SEARCH_URL}?${params.toString()}`)
  } catch (err) {
    console.error('[spoonacular] fetch falló:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'No se pudo conectar con Spoonacular en este momento. Probá de nuevo en un rato.' }
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '<sin body>')
    console.error(`[spoonacular] no-ok: status=${res.status} body=${rawBody}`)

    if (res.status === 401) {
      return { ok: false, error: 'La API key de Spoonacular no es válida. Volvé a guardarla en Ajustes.' }
    }
    if (res.status === 402) {
      return {
        ok: false,
        error: 'Se alcanzó el límite diario de Spoonacular por ahora. Probá de nuevo mañana.',
      }
    }
    return {
      ok: false,
      error: `Spoonacular devolvió un error (código ${res.status}). Probá de nuevo en un momento.`,
    }
  }

  const data = await res.json().catch(() => null)
  const crudos = Array.isArray(data?.results) ? data.results : []

  const resultados: ResultadoReceta[] = crudos.slice(0, MAX_RESULTADOS).map((r: Record<string, unknown>) => {
    const id = r.id
    const nutrientes = Array.isArray((r.nutrition as Record<string, unknown>)?.nutrients)
      ? ((r.nutrition as Record<string, unknown>).nutrients as unknown[])
      : []

    const nutricion: NutrientesReceta | undefined =
      opts.incluirNutricion && nutrientes.length > 0
        ? {
            calorias: extraerNutriente(nutrientes, 'Calories'),
            proteina: extraerNutriente(nutrientes, 'Protein'),
            grasa: extraerNutriente(nutrientes, 'Fat'),
            carbohidratos: extraerNutriente(nutrientes, 'Carbohydrates'),
          }
        : undefined

    return {
      titulo: typeof r.title === 'string' ? r.title : 'Receta sin título',
      url: typeof id === 'number' ? `https://spoonacular.com/recipes/-${id}` : '',
      ...(nutricion ? { nutricion } : {}),
    }
  })

  return { ok: true, resultados }
}
