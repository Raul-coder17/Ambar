// La llamada a Gemini que hace el trabajo delicado de Fase 5: extraer el dato
// concreto de los resultados de Tavily Y juzgar si es una novedad real
// respecto del valor conocido, EN UNA SOLA llamada con salida estructurada
// (responseSchema) — ver PLAN_AMBAR.md, diagnóstico de Fase 5, opción D.
//
// POR QUÉ NO SE COMPARA EL TEXTO CRUDO DE TAVILY
//
// Los resultados de una búsqueda cambian de redacción, orden y hasta de
// fuente entre una revisión y la siguiente aunque el hecho subyacente sea
// idéntico — comparar ese texto tal cual genera exactamente los avisos vacíos
// que Fase 5 tiene que evitar. Por eso el propio Gemini extrae el dato Y
// juzga la significancia en el mismo paso, con instrucción explícita de ser
// conservador: sólo un dato objetivo distinto cuenta, nunca una diferencia de
// forma. Vive junto a `revisar-objetivos/index.ts` y no en `_shared/` porque,
// a diferencia de tavily.ts o embeddings.ts, ninguna otra Edge Function la
// necesita — mismo criterio que puso `rpm.ts` junto a `ai-chat/`.

const GEMINI_MODEL = 'gemini-3.1-flash-lite' // mismo modelo que ai-chat/live

export interface ResultadoTavilyResumen {
  titulo: string
  url: string
  contenido: string
}

export interface ResultadoComparacion {
  valorActual: string
  resumenActual: string
  cambioSignificativo: boolean
  mensajeNotificacion: string | null
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    valor_actual: {
      type: 'STRING',
      description: 'El dato concreto extraído (precio, fecha, disponibilidad, hecho puntual), en una frase corta.',
    },
    resumen_actual: {
      type: 'STRING',
      description: 'Frase corta de contexto sobre ese dato, para mostrar en una lista al usuario.',
    },
    cambio_significativo: {
      type: 'BOOLEAN',
      description: 'true SOLO si el dato es objetivamente distinto del valor anterior. false si es la primera revisión o si no cambió nada real.',
    },
    mensaje_notificacion: {
      type: 'STRING',
      description: 'Sólo si cambio_significativo es true: una frase breve y clara lista para mandar como notificación push.',
    },
  },
  required: ['valor_actual', 'resumen_actual', 'cambio_significativo'],
}

function armarPrompt(descripcion: string, valorAnterior: string | null, resultados: ResultadoTavilyResumen[]): string {
  const bloqueResultados = resultados.map((r, i) => `[${i + 1}] ${r.titulo}\n${r.contenido}`).join('\n\n')

  const bloqueAnterior = valorAnterior
    ? `El último dato que tenías registrado era: "${valorAnterior}".`
    : 'Todavía no tenés ningún dato registrado: ésta es la primera revisión, así que sólo estás estableciendo la línea de base.'

  return (
    `Estás vigilando esto para un usuario, revisándolo periódicamente: "${descripcion}".\n\n` +
    `${bloqueAnterior}\n\n` +
    `Estos son los resultados de una búsqueda reciente en internet:\n\n${bloqueResultados}\n\n` +
    'Extraé el dato concreto y actual que responde a lo que se está vigilando. ' +
    'Compará ese dato con el último que tenías registrado y decidí si hay un CAMBIO SIGNIFICATIVO: un dato objetivo distinto (precio, fecha, disponibilidad, un hecho nuevo), ' +
    'NUNCA una diferencia de redacción, orden, fuente o forma de decir lo mismo. Ante la duda, no es significativo. ' +
    'Si es la primera revisión (no tenías dato anterior), cambio_significativo siempre tiene que ser false. ' +
    'Si hay cambio significativo, escribí en mensaje_notificacion una frase breve y clara para avisarle al usuario qué cambió, lista para mandar como notificación push. Si no lo hay, dejalo vacío.'
  )
}

async function callGeminiJSON(apiKey: string, prompt: string): Promise<Record<string, unknown> | null> {
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingLevel: 'MINIMAL' },
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    )
  } catch (err) {
    console.error('[comparar] fetch a Gemini falló:', err instanceof Error ? err.message : err)
    return null
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '<sin body>')
    console.error(`[comparar] Gemini no-ok: status=${res.status} body=${body}`)
    return null
  }

  const data = await res.json().catch(() => null)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') {
    console.error(`[comparar] Gemini sin texto: ${JSON.stringify(data).slice(0, 300)}`)
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    console.error(`[comparar] Gemini devolvió JSON inválido: ${text.slice(0, 300)}`)
    return null
  }
}

/**
 * Devuelve null si la llamada o el parseo fallaron — el llamador lo trata
 * como "saltar este objetivo, reintentar en el próximo ciclo", igual que
 * cualquier otro fallo de red del pipeline (ver la cabecera de index.ts).
 */
export async function compararObjetivo(
  apiKey: string,
  descripcion: string,
  valorAnterior: string | null,
  resultados: ResultadoTavilyResumen[],
): Promise<ResultadoComparacion | null> {
  const parsed = await callGeminiJSON(apiKey, armarPrompt(descripcion, valorAnterior, resultados))
  if (!parsed) return null

  const valorActual = typeof parsed.valor_actual === 'string' ? parsed.valor_actual.trim() : ''
  const resumenActual = typeof parsed.resumen_actual === 'string' ? parsed.resumen_actual.trim() : ''
  if (!valorActual || !resumenActual) {
    console.error(`[comparar] Gemini devolvió campos vacíos: ${JSON.stringify(parsed).slice(0, 300)}`)
    return null
  }

  // GUARDA DE LÍNEA DE BASE, EN CÓDIGO Y NO SÓLO EN EL PROMPT: si no había
  // valor anterior, esta revisión únicamente establece el punto de partida.
  // No puede haber "novedad" respecto de algo que no existía todavía — y no
  // hay que confiar en que el modelo siempre obedezca la instrucción de
  // arriba, mismo criterio que normalizarArgsHecho/normalizarArgsPizarra.
  const cambioSignificativo = valorAnterior == null ? false : parsed.cambio_significativo === true

  const mensajeNotificacion =
    cambioSignificativo && typeof parsed.mensaje_notificacion === 'string' && parsed.mensaje_notificacion.trim()
      ? parsed.mensaje_notificacion.trim()
      : null

  return { valorActual, resumenActual, cambioSignificativo, mensajeNotificacion }
}
