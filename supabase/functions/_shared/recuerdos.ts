// I/O de la búsqueda de recuerdos por similitud (RAG) contra memoria_vectorial.
//
// Separado de `memoria.ts` porque ese módulo es deliberadamente puro (sin I/O
// ni Deno.serve, ver el comentario de su cabecera) — esto en cambio le pega
// directo al RPC de Postgres. Vive en un módulo propio (no en `ai-chat/index.ts`,
// donde nació en Fase 2) porque ahora tiene DOS llamadores que no pueden
// importarse entre sí sin ciclo: el RAG automático de `ai-chat` (contra el
// último mensaje de cada request) y la tool `buscar_en_memoria` de Live
// (`tools.ts`, D3 — a demanda, cuando el modelo decide que la necesita).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { filtrarRecuerdos, TOP_K, UMBRAL_SIMILITUD, type Recuerdo } from './memoria.ts'
import { vectorLiteral } from './embeddings.ts'

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
