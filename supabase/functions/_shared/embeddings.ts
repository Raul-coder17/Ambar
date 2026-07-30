// Embeddings de Gemini para la memoria vectorial (Fase 2).
//
// Usa la MISMA key BYOK que ya guardó el usuario para el chat: es otro modelo
// del mismo proveedor, no hace falta una key nueva.
//
// REGLA DE ORO DE ESTE MÓDULO: nada de acá tira una excepción hacia arriba.
// La memoria es un extra sobre la conversación, no un requisito de ella — si
// el endpoint de embeddings está caído, sin cuota o devuelve basura, el chat
// tiene que seguir contestando igual, sólo que sin RAG en ese turno. Por eso
// todo devuelve `null` y loguea, en vez de propagar el error al loop principal.

// gemini-embedding-2: modelo actual de embeddings (multimodal). Reemplaza a
// gemini-embedding-001, que obligaba a renormalizar a mano el vector cuando se
// pedían menos dimensiones que las 3072 por defecto; el 2 renormaliza solo.
const EMBEDDING_MODEL = 'gemini-embedding-2'

// Tiene que coincidir con `extensions.vector(768)` de la migración. 768 es una
// de las tres medidas recomendadas por Google y entra en el límite de 2000
// dimensiones de los índices HNSW de pgvector (3072 no entraría).
export const EMBEDDING_DIMS = 768

// El taskType cambia el vector que sale para el MISMO texto: Gemini entrena
// asimétricamente pregunta vs. documento. Usar el que corresponde de cada lado
// es lo que hace que la búsqueda funcione bien.
export type TaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'

export async function generarEmbedding(
  apiKey: string,
  texto: string,
  taskType: TaskType,
): Promise<number[] | null> {
  const limpio = texto.trim()
  if (!limpio) return null

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: limpio }] },
          taskType,
          outputDimensionality: EMBEDDING_DIMS,
        }),
      },
    )

    if (!res.ok) {
      // Sin traducción al español ni mensaje al usuario: esto no se le muestra.
      // El embeddings tiene su propia cuota, separada de la de flash-lite, así
      // que un 429 acá no dice nada del presupuesto de mensajes del chat.
      const body = await res.text().catch(() => '<sin body>')
      console.error(`[embeddings] no-ok: status=${res.status} body=${body}`)
      return null
    }

    const data = await res.json()
    const values = data?.embedding?.values
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
      console.error(`[embeddings] forma inesperada: ${JSON.stringify(data).slice(0, 300)}`)
      return null
    }
    return values as number[]
  } catch (err) {
    console.error('[embeddings] falló:', err instanceof Error ? err.message : err)
    return null
  }
}

// pgvector se escribe como '[0.1,0.2,…]'. Va como string y no como array de JS
// porque PostgREST serializaría un array a la sintaxis de array de Postgres
// ('{…}'), que no es la del tipo vector.
export function vectorLiteral(valores: number[]): string {
  return `[${valores.join(',')}]`
}
