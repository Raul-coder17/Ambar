// Registro de tools (function-calling) para el chat de texto.
//
// Fase 1 dejó la arquitectura lista con el registro VACÍO. Fase 2 le mete la
// primera tool real: `recordar_hecho`, que es cómo se llena `memoria_hechos`.
// Fase 3 agrega acá `buscar_en_internet` (Tavily); el modo Live (Fase 4) reusa
// este mismo registro — mismo código, dos entradas.
//
// POR QUÉ UNA TOOL Y NO UNA SEGUNDA LLAMADA A GEMINI
//
// Organizador-IA extrae datos de texto libre de esta misma forma: el modelo
// emite una function call y `actions.ts` sanea los args antes de tocar la base
// (el enum de la declaración no garantiza nada). La alternativa era una pasada
// aparte con `responseMimeType: application/json` + `responseSchema` (el patrón
// de `extract-from-photo`), pero costaría una llamada a Gemini por CADA
// mensaje: partiría al medio la cuota diaria de flash-lite y pesaría sobre el
// freno de 15 RPM. Así se gasta un turno extra sólo cuando hay algo que anotar.
//
// Y hay una ventaja que la pasada aparte no tiene: los hechos que el usuario ya
// tiene guardados VAN en la system instruction de este mismo request (ver
// `bloqueMemoria`). El modelo está mirando la lista cuando decide, así que no
// vuelve a proponer algo que ya está — y sabe qué texto exacto pasar en
// `reemplaza` cuando un hecho quedó viejo.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptApiKey } from './crypto.ts'
import { clave, MAX_LARGO_HECHO, normalizarArgsHecho } from './memoria.ts'
import { buscarEnInternet } from './tavily.ts'

export interface ToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolContext {
  supabase: SupabaseClient
  userId: string
  // Necesario para descifrar la key de Tavily guardada por el usuario dentro
  // del handler de `buscar_en_internet` (ver más abajo).
  encryptionSecret: string
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>

export interface Tool {
  declaration: ToolDeclaration
  handler: ToolHandler
}

// --- recordar_hecho ---------------------------------------------------------

const recordarHecho: Tool = {
  declaration: {
    name: 'recordar_hecho',
    description:
      'Guarda un dato duradero sobre el usuario para acordarte en futuras conversaciones: cómo se llama, a qué se dedica, con quién vive, qué prefiere, qué le molesta, rutinas o cosas que repite. ' +
      'Llamala apenas aparece el dato, sin pedir permiso ni avisar que lo estás anotando. ' +
      'NO la llames para: cosas de una sola vez que se resuelven en esta charla, datos que ya figuran en la lista de lo que sabés del usuario, ni resúmenes de lo que se acaba de hablar (eso se guarda solo por otro lado). ' +
      'Si un dato que ya tenías quedó viejo, llamala igual con el dato nuevo y poné en `reemplaza` el texto exacto del viejo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hecho: {
          type: 'STRING',
          description: `El dato, en español, en tercera persona y como una frase corta que se entienda sola dentro de un año ("se llama Raúl", "prefiere respuestas breves", "trabaja de noche"). Máximo ${MAX_LARGO_HECHO} caracteres.`,
        },
        categoria: {
          type: 'STRING',
          description:
            'Opcional. Una palabra para agrupar el dato: "identidad", "preferencia", "rutina", "trabajo", "salud", "relaciones". Si ninguna encaja, no la mandes.',
        },
        reemplaza: {
          type: 'STRING',
          description:
            'Opcional. Sólo si este dato deja obsoleto uno que ya tenías: el texto EXACTO del hecho viejo, copiado tal cual de la lista de lo que sabés del usuario.',
        },
      },
      required: ['hecho'],
    },
  },

  handler: async (args, ctx) => {
    const propuesto = normalizarArgsHecho(args)
    if (!propuesto) {
      return {
        guardado: false,
        nota: `No pude guardar eso: el hecho vino vacío o pasa los ${MAX_LARGO_HECHO} caracteres. Si es un resumen de la charla, no hace falta guardarlo. Seguí la conversación con normalidad.`,
      }
    }

    // Los hechos del usuario son pocos (van TODOS en cada request), así que
    // traerlos enteros y comparar acá sale más barato que una consulta por
    // cada caso. Además evita `ilike` con el texto crudo del modelo, donde un
    // '%' en el hecho se volvería un comodín.
    const { data: existentes, error } = await ctx.supabase
      .from('memoria_hechos')
      .select('id, hecho')
      .eq('user_id', ctx.userId)

    if (error) {
      console.error('[ai-chat] recordar_hecho: no se pudieron leer los hechos:', error.message)
      return { guardado: false, nota: 'No pude acceder a la memoria en este momento. Seguí la conversación con normalidad.' }
    }

    const porClave = new Map((existentes ?? []).map((f) => [clave(f.hecho as string), f.id as number]))
    const yaEstaId = porClave.get(clave(propuesto.hecho))
    const aPisarId = propuesto.reemplaza ? porClave.get(clave(propuesto.reemplaza)) : undefined

    // El hecho nuevo YA estaba. Si además venía a reemplazar a otro, ese otro
    // quedó obsoleto y hay que sacarlo: no se puede "renombrar" la fila vieja
    // al texto nuevo porque chocaría con el índice único.
    if (yaEstaId != null) {
      if (aPisarId != null && aPisarId !== yaEstaId) {
        await ctx.supabase.from('memoria_hechos').delete().eq('id', aPisarId).eq('user_id', ctx.userId)
        return { guardado: true, nota: 'Ya lo tenías anotado; borré el dato viejo que quedó obsoleto.' }
      }
      return { guardado: false, nota: 'Eso ya estaba guardado, no hizo falta anotarlo de nuevo.' }
    }

    // Corrección de un hecho existente: se pisa la fila, y el trigger
    // memoria_hechos_set_updated_at deja constancia de cuándo cambió.
    if (aPisarId != null) {
      const cambios: Record<string, unknown> = { hecho: propuesto.hecho }
      // Sin categoría nueva se conserva la vieja: el modelo suele mandarla en
      // la primera pasada y omitirla en la corrección, y perderla ahí sería un
      // efecto colateral de haber corregido otra cosa.
      if (propuesto.categoria) cambios.categoria = propuesto.categoria

      const { error: errUpdate } = await ctx.supabase
        .from('memoria_hechos')
        .update(cambios)
        .eq('id', aPisarId)
        .eq('user_id', ctx.userId)

      if (errUpdate) {
        console.error('[ai-chat] recordar_hecho: falló el update:', errUpdate.message)
        return { guardado: false, nota: 'No pude actualizar ese dato. Seguí la conversación con normalidad.' }
      }
      return { guardado: true, nota: 'Actualicé el dato viejo con el nuevo.' }
    }

    const { error: errInsert } = await ctx.supabase
      .from('memoria_hechos')
      .insert({ user_id: ctx.userId, hecho: propuesto.hecho, categoria: propuesto.categoria })

    if (errInsert) {
      // 23505 = choque contra el índice único (user_id, lower(btrim(hecho))).
      // Es una carrera con otro request del mismo usuario: el hecho quedó
      // guardado igual, que es lo que importaba.
      if (errInsert.code === '23505') {
        return { guardado: false, nota: 'Eso ya estaba guardado, no hizo falta anotarlo de nuevo.' }
      }
      console.error('[ai-chat] recordar_hecho: falló el insert:', errInsert.message)
      return { guardado: false, nota: 'No pude guardar ese dato. Seguí la conversación con normalidad.' }
    }

    return { guardado: true, nota: 'Guardado. No hace falta que se lo menciones al usuario.' }
  },
}

// --- buscar_en_internet (Fase 3) --------------------------------------------

const buscarEnInternetTool: Tool = {
  declaration: {
    name: 'buscar_en_internet',
    description:
      'Busca información actual en internet: noticias, precios, eventos recientes, o cualquier dato específico que cambie con el tiempo y que no puedas saber con certeza. ' +
      'No la uses para lo que ya sabés, para charla general, ni para datos que ya están en la memoria del usuario.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'La búsqueda a hacer, en pocas palabras clave (como la escribirías en un buscador).',
        },
      },
      required: ['query'],
    },
  },

  handler: async (args, ctx) => {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) {
      return { ok: false, error: 'No se especificó qué buscar.' }
    }

    const { data: settings, error } = await ctx.supabase
      .from('ajustes_ia')
      .select('tavily_api_key_encrypted')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (error) {
      console.error('[ai-chat] buscar_en_internet: no se pudo leer la key de Tavily:', error.message)
      return { ok: false, error: 'No pude acceder a la configuración de búsqueda en este momento.' }
    }

    const encrypted = settings?.tavily_api_key_encrypted
    if (!encrypted) {
      return {
        ok: false,
        error: 'No tenés una API key de Tavily configurada. Guardala en Ajustes para poder buscar en internet.',
      }
    }

    let apiKey: string
    try {
      apiKey = await decryptApiKey(encrypted, ctx.encryptionSecret)
    } catch (err) {
      console.error('[ai-chat] buscar_en_internet: no se pudo descifrar la key:', err instanceof Error ? err.message : err)
      return { ok: false, error: 'No pude leer tu key de Tavily. Volvé a guardarla en Ajustes.' }
    }

    return await buscarEnInternet(apiKey, query)
  },
}

// ---------------------------------------------------------------------------

export const TOOLS: Tool[] = [recordarHecho, buscarEnInternetTool]

export function toolDeclarations(): ToolDeclaration[] {
  return TOOLS.map((t) => t.declaration)
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.declaration.name === name)
}
