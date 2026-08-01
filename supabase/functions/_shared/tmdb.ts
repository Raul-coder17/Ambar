// Búsqueda y recomendación de películas/series vía TMDB (backlog adelantado).
//
// Mismo criterio que `tavily.ts`/`spoonacular.ts`: resultado de una tool
// pedida a propósito por el modelo, no memoria de fondo. Si falla, se devuelve
// el motivo en el mismo objeto que va como `functionResponse` en vez de
// tragarlo en silencio.
//
// Auth: API Key v3 como query param (`api_key=...`), igual que la que ya
// valida `manage-ai-key` contra GET /3/authentication — no el Read Access
// Token v4 (Bearer), que es un paso extra para el usuario sin nada que aporte
// para este uso.
//
// PERSONALIZACIÓN CON MEMORIA: esta tool NO lee `memoria_hechos` por su
// cuenta — no hace falta, porque los hechos del usuario (género favorito, algo
// que le gustó) ya van SIEMPRE en la system instruction (`bloqueMemoria`,
// idéntico en los dos modos). Es el modelo quien decide, mirando esa lista,
// qué pasar en `genero` o `consulta` sin volver a preguntarle al usuario. Ver
// la guía agregada en `prompt.ts`.

const TMDB_BASE = 'https://api.themoviedb.org/3'
const MAX_RESULTADOS = 5

// TMDB tiene un catálogo fijo de géneros por tipo (movie/tv), con IDs propios
// que no siempre coinciden entre los dos. Se hardcodea acá en vez de pedir
// `/genre/movie/list` + `/genre/tv/list` en cada llamada: son ~15-19 géneros
// por tipo, prácticamente estáticos, y así se ahorran dos requests por
// búsqueda. Claves en español, normalizadas (sin tildes, minúsculas) en
// `idsDeGenero`.
const GENEROS_PELICULA: Record<string, number> = {
  accion: 28,
  aventura: 12,
  animacion: 16,
  comedia: 35,
  crimen: 80,
  documental: 99,
  drama: 18,
  familia: 10751,
  fantasia: 14,
  historia: 36,
  terror: 27,
  musica: 10402,
  misterio: 9648,
  romance: 10749,
  'ciencia ficcion': 878,
  suspenso: 53,
  thriller: 53,
  belica: 10752,
  guerra: 10752,
  western: 37,
}

const GENEROS_SERIE: Record<string, number> = {
  accion: 10759,
  aventura: 10759,
  animacion: 16,
  comedia: 35,
  crimen: 80,
  documental: 99,
  drama: 18,
  familia: 10751,
  infantil: 10762,
  misterio: 9648,
  'ciencia ficcion': 10765,
  fantasia: 10765,
  guerra: 10768,
  western: 37,
}

// Sin tildes ni mayúsculas, para matchear "acción"/"Acción"/"accion" contra las
// claves de GENEROS_PELICULA/GENEROS_SERIE. Reemplaza a mano los acentos
// españoles en vez de descomponer con NFD + rango de marcas combinantes: es
// menos elegante pero evita un regex con caracteres Unicode no imprimibles
// (frágil de editar a mano, y algunos editores lo corrompen en el guardado).
const ACENTOS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

function sinTildes(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACENTOS[c] ?? c)
}

function idsDeGenero(genero: string, tipo: 'pelicula' | 'serie' | undefined): { movie?: number; tv?: number } {
  const clave = sinTildes(genero)
  const movie = GENEROS_PELICULA[clave]
  const tv = GENEROS_SERIE[clave]
  if (tipo === 'pelicula') return movie != null ? { movie } : {}
  if (tipo === 'serie') return tv != null ? { tv } : {}
  return { ...(movie != null ? { movie } : {}), ...(tv != null ? { tv } : {}) }
}

export interface ResultadoTitulo {
  titulo: string
  tipo: 'pelicula' | 'serie'
  anio?: string
  resumen?: string
  calificacion?: number
}

export type ResultadoTmdb =
  | { ok: true; resultados: ResultadoTitulo[] }
  | { ok: false; error: string }

interface OpcionesBusqueda {
  consulta?: string
  genero?: string
  tipo?: 'pelicula' | 'serie'
}

function mapItem(item: Record<string, unknown>, tipoForzado?: 'pelicula' | 'serie'): ResultadoTitulo | null {
  const mediaType = tipoForzado ?? (item.media_type === 'tv' ? 'serie' : item.media_type === 'movie' ? 'pelicula' : undefined)
  if (!mediaType) return null

  const titulo = typeof item.title === 'string' ? item.title : typeof item.name === 'string' ? item.name : undefined
  if (!titulo) return null

  const fecha =
    typeof item.release_date === 'string' ? item.release_date : typeof item.first_air_date === 'string' ? item.first_air_date : ''

  return {
    titulo,
    tipo: mediaType,
    anio: fecha.slice(0, 4) || undefined,
    resumen: typeof item.overview === 'string' && item.overview.trim() ? item.overview.trim().slice(0, 300) : undefined,
    calificacion: typeof item.vote_average === 'number' ? Math.round(item.vote_average * 10) / 10 : undefined,
  }
}

async function fetchTmdb(path: string, params: URLSearchParams, apiKey: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  params.set('api_key', apiKey)
  params.set('language', 'es-ES')
  params.set('include_adult', 'false')

  let res: Response
  try {
    res = await fetch(`${TMDB_BASE}${path}?${params.toString()}`)
  } catch (err) {
    console.error('[tmdb] fetch falló:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'No se pudo conectar con TMDB en este momento. Probá de nuevo en un rato.' }
  }

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '<sin body>')
    console.error(`[tmdb] no-ok: status=${res.status} path=${path} body=${rawBody}`)

    if (res.status === 401) {
      return { ok: false, error: 'La API key de TMDB no es válida. Volvé a guardarla en Ajustes.' }
    }
    if (res.status === 429) {
      return { ok: false, error: 'Se alcanzó el límite de uso de TMDB por ahora. Probá de nuevo en un momento.' }
    }
    return { ok: false, error: `TMDB devolvió un error (código ${res.status}). Probá de nuevo en un momento.` }
  }

  const data = await res.json().catch(() => null)
  return data ? { ok: true, data } : { ok: false, error: 'TMDB devolvió una respuesta vacía.' }
}

export async function buscarPeliculasSeries(apiKey: string, opts: OpcionesBusqueda): Promise<ResultadoTmdb> {
  // 1) Búsqueda por título/actor/tema: /search/multi, filtrando a movie/tv.
  if (opts.consulta?.trim()) {
    const params = new URLSearchParams({ query: opts.consulta.trim() })
    const resp = await fetchTmdb('/search/multi', params, apiKey)
    if (!resp.ok) return resp

    const crudos = Array.isArray(resp.data.results) ? resp.data.results : []
    let resultados = crudos.map((r: Record<string, unknown>) => mapItem(r)).filter((r: unknown): r is ResultadoTitulo => r !== null)
    if (opts.tipo) resultados = resultados.filter((r) => r.tipo === opts.tipo)

    return { ok: true, resultados: resultados.slice(0, MAX_RESULTADOS) }
  }

  // 2) Sin consulta: recomendación. Con género, /discover filtrado y ordenado
  // por popularidad; sin género, /trending como fallback general.
  if (opts.genero?.trim()) {
    const ids = idsDeGenero(opts.genero.trim(), opts.tipo)
    if (ids.movie == null && ids.tv == null) {
      return {
        ok: false,
        error: `No reconozco el género "${opts.genero.trim()}". Probá con uno más común (acción, comedia, terror, drama, etc.).`,
      }
    }

    const pedidos: Promise<{ tipo: 'pelicula' | 'serie'; resp: Awaited<ReturnType<typeof fetchTmdb>> }>[] = []
    if (ids.movie != null) {
      const params = new URLSearchParams({ with_genres: String(ids.movie), sort_by: 'popularity.desc' })
      pedidos.push(fetchTmdb('/discover/movie', params, apiKey).then((resp) => ({ tipo: 'pelicula' as const, resp })))
    }
    if (ids.tv != null) {
      const params = new URLSearchParams({ with_genres: String(ids.tv), sort_by: 'popularity.desc' })
      pedidos.push(fetchTmdb('/discover/tv', params, apiKey).then((resp) => ({ tipo: 'serie' as const, resp })))
    }

    const respuestas = await Promise.all(pedidos)
    const primerError = respuestas.find((r) => !r.resp.ok)
    if (primerError && !primerError.resp.ok) return primerError.resp

    const combinados: ResultadoTitulo[] = []
    for (const { tipo, resp } of respuestas) {
      if (!resp.ok) continue
      const crudos = Array.isArray(resp.data.results) ? resp.data.results : []
      for (const r of crudos) {
        const item = mapItem(r as Record<string, unknown>, tipo)
        if (item) combinados.push(item)
      }
    }
    combinados.sort((a, b) => (b.calificacion ?? 0) - (a.calificacion ?? 0))

    return { ok: true, resultados: combinados.slice(0, MAX_RESULTADOS) }
  }

  // 3) Ni consulta ni género: lo más popular ahora, como último recurso.
  const resp = await fetchTmdb('/trending/all/week', new URLSearchParams(), apiKey)
  if (!resp.ok) return resp
  const crudos = Array.isArray(resp.data.results) ? resp.data.results : []
  let resultados = crudos.map((r: Record<string, unknown>) => mapItem(r)).filter((r: unknown): r is ResultadoTitulo => r !== null)
  if (opts.tipo) resultados = resultados.filter((r) => r.tipo === opts.tipo)

  return { ok: true, resultados: resultados.slice(0, MAX_RESULTADOS) }
}
