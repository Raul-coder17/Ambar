// I/O de memoria_vectorial: todas las puertas a la misma tabla.
//
//   buscarRecuerdos()     — lectura por SIMILITUD (RAG), con RETRIEVAL_QUERY.
//   recuerdosRecientes()  — lectura por FECHA, sin embedding ni RPC.
//   guardarIntercambio()  — escritura, con RETRIEVAL_DOCUMENT.
//
// Las dos primeras están juntas a propósito con la tercera: el `taskType`
// asimétrico (Fase 2) es la parte fácil de romper sin darse cuenta, y se rompe
// justamente cuando se toca un lado sin ver el otro. Acá el par queda a la
// vista — y de paso queda a la vista que la lectura por fecha NO participa de
// él (ver su comentario).
//
// Separado de `memoria.ts` porque ese módulo es deliberadamente puro (sin I/O
// ni Deno.serve, ver el comentario de su cabecera) — esto en cambio le pega
// directo al RPC de Postgres y al endpoint de embeddings.
//
// Las dos funciones nacieron dentro de `ai-chat/index.ts` y se mudaron acá por
// el mismo motivo, en dos momentos distintos: tienen llamadores en las DOS Edge
// Functions, que no pueden importarse entre sí sin ciclo.
//   - `buscarRecuerdos` (D3): el RAG automático de `ai-chat` contra el último
//     mensaje de cada request, y la tool `buscar_en_memoria` de Live
//     (`tools.ts`) a demanda.
//   - `guardarIntercambio` (hallazgo A): `ai-chat` después de contestar, y la
//     acción `guardar_intercambio` de `live/index.ts` en cada turno hablado.
//     Hasta ese hallazgo, el modo Live NO escribía en memoria_vectorial: una
//     charla de voz entera no dejaba rastro en la memoria a largo plazo.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  filtrarRecuerdos,
  RECUERDOS_RECIENTES,
  textoDelIntercambio,
  TOP_K,
  UMBRAL_SIMILITUD,
  type Recuerdo,
} from './memoria.ts'
import { generarEmbedding, vectorLiteral } from './embeddings.ts'

export async function buscarRecuerdos(supabase: SupabaseClient, embedding: number[]): Promise<Recuerdo[]> {
  const { data, error } = await supabase.rpc('buscar_memoria_vectorial', {
    consulta: vectorLiteral(embedding),
    limite: TOP_K,
  })

  if (error) {
    console.error('[recuerdos] falló la búsqueda vectorial:', error.message)
    return []
  }

  const crudos = (data ?? []) as Recuerdo[]
  const filtrados = filtrarRecuerdos(crudos)

  // Instrumentación para calibrar UMBRAL_SIMILITUD con uso real (post-Fase 2):
  // sin esto no había forma de saber si 0.6 estaba descartando recuerdos que
  // sí eran relevantes. Loguea la similitud de CADA resultado que trajo la
  // búsqueda, aunque haya quedado abajo del umbral — incluso cuando ninguno
  // sobrevive el filtro y el resultado final queda en 0.
  const similitudes = crudos
    .map((r) => `${r.similitud.toFixed(3)}${r.similitud >= UMBRAL_SIMILITUD ? '' : ' [descartado]'}`)
    .join(', ')
  console.log(`[recuerdos] disponibles=${crudos.length} usados=${filtrados.length} similitudes=[${similitudes}]`)

  return filtrados
}

/**
 * Los últimos intercambios guardados, por fecha. SIN embedding y SIN búsqueda
 * vectorial: es un `select` común.
 *
 * Es la tercera puerta de I/O sobre memoria_vectorial y la única que no pasa
 * por el RPC. Existe por la asimetría de RAG entre los dos modos: al ABRIR una
 * sesión de voz el usuario todavía no dijo nada contra qué buscar por
 * similitud, así que en t=0 la clave de recuperación correcta es la RECENCIA,
 * no el parecido. La conclusión de "no hay contra qué buscar" no era "entonces
 * nada".
 *
 * QUE NO LLEVE EMBEDDING NO ES UN OLVIDO. El par `taskType` asimétrico de las
 * otras dos funciones (RETRIEVAL_QUERY / RETRIEVAL_DOCUMENT) no aplica acá
 * porque no hay consulta que embeber: agregarle uno "por simetría" sería gastar
 * una llamada al endpoint de embeddings para ordenar por una columna.
 *
 * Devuelve en orden CRONOLÓGICO (lo más viejo primero) aunque la consulta pida
 * `desc`: el desc es para quedarse con las últimas N, pero el bloque se lee de
 * arriba a abajo y tiene que terminar en lo último que se habló.
 *
 * Best-effort como todo lo de memoria: si falla devuelve [] y la sesión abre
 * igual, sólo que sin el hilo de la charla anterior.
 */
export async function recuerdosRecientes(
  supabase: SupabaseClient,
  userId: string,
  limite = RECUERDOS_RECIENTES,
): Promise<string[]> {
  // El `user_id` explícito es redundante con RLS (el cliente se construye con
  // el JWT del usuario), igual que en `cargarHechos`: mismo criterio de no
  // depender de una sola capa para el aislamiento entre usuarios.
  const { data, error } = await supabase
    .from('memoria_vectorial')
    .select('contenido')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('[recuerdos] no se pudieron traer los recientes:', error.message)
    return []
  }

  return (data ?? [])
    .map((fila) => (fila.contenido as string | null)?.trim() ?? '')
    .filter((contenido) => contenido.length > 0)
    .reverse()
}

/**
 * Guarda un intercambio embebido en memoria_vectorial. Devuelve si la fila
 * quedó escrita.
 *
 * Best-effort como todo lo de memoria: nunca tira. Cada llamador decide cuándo
 * no llamarla — `ai-chat` la deja afuera cuando en el request se ejecutó
 * `olvidar_hecho`, y `live/index.ts` cuando el turno no pasa
 * `valeGuardarIntercambio` (ver ambos).
 */
export async function guardarIntercambio(
  supabase: SupabaseClient,
  apiKey: string,
  userId: string,
  pregunta: string,
  respuesta: string,
): Promise<boolean> {
  const contenido = textoDelIntercambio(pregunta, respuesta)
  // RETRIEVAL_DOCUMENT y no RETRIEVAL_QUERY: éste es el lado "documento" de la
  // búsqueda. Gemini entrena los dos lados de forma asimétrica y mezclarlos
  // degrada la similitud.
  const embedding = await generarEmbedding(apiKey, contenido, 'RETRIEVAL_DOCUMENT')

  // Sin embedding se guarda igual: perder el texto sería peor que perder el
  // vector (la columna es nullable justamente por esto).
  const { error } = await supabase.from('memoria_vectorial').insert({
    user_id: userId,
    contenido,
    embedding: embedding ? vectorLiteral(embedding) : null,
  })

  if (error) {
    console.error('[recuerdos] no se pudo guardar el intercambio:', error.message)
    return false
  }
  return true
}
