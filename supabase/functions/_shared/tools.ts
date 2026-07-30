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
import { generarEmbedding } from './embeddings.ts'
import { clave, MAX_LARGO_HECHO, normalizarArgsHecho } from './memoria.ts'
import { buscarRecuerdos } from './recuerdos.ts'
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

export type ModoConversacion = 'texto' | 'live'

/**
 * El nombre de `olvidar_hecho`, exportado porque hay quien necesita reconocer
 * la call SIN ejecutarla: `ai-chat/index.ts` la detecta en el loop para no
 * guardar ese intercambio en memoria_vectorial (P1, ver el comentario de
 * `seOlvidoUnHecho` allá).
 *
 * El cliente (`useLiveSession.ts`) hace lo mismo para el modo Live pero con su
 * propio literal: no puede importar de `_shared/` (código de Deno, con imports
 * por URL) desde el bundle de Vite.
 */
export const OLVIDAR_HECHO = 'olvidar_hecho'

export interface Tool {
  declaration: ToolDeclaration
  handler: ToolHandler
  // Si está seteado, la tool sólo se declara en ese modo (ver `toolDeclarations`).
  // Sin esto, disponible en los dos — es el caso por defecto y el de casi todas.
  soloModo?: ModoConversacion
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
      console.error('[recordar_hecho] no se pudieron leer los hechos:', error.message)
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
        console.error('[recordar_hecho] falló el update:', errUpdate.message)
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
      console.error('[recordar_hecho] falló el insert:', errInsert.message)
      return { guardado: false, nota: 'No pude guardar ese dato. Seguí la conversación con normalidad.' }
    }

    return { guardado: true, nota: 'Guardado. No hace falta que se lo menciones al usuario.' }
  },
}

// --- olvidar_hecho -----------------------------------------------------------

const olvidarHecho: Tool = {
  declaration: {
    name: OLVIDAR_HECHO,
    description:
      'Borra un dato que ya tenías guardado del usuario, cuando él te pide explícitamente que lo olvides o que ya no es cierto ' +
      '("olvídate de que...", "ya no es cierto que...", "borra ese dato"). ' +
      'NO la llames por tu cuenta: a diferencia de recordar_hecho, esta tool solo se usa cuando el usuario lo pide directo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hecho: {
          type: 'STRING',
          description:
            'El texto EXACTO del hecho a borrar, copiado tal cual de la lista de lo que sabés del usuario.',
        },
      },
      required: ['hecho'],
    },
  },

  handler: async (args, ctx) => {
    const propuesto = normalizarArgsHecho(args)
    if (!propuesto) {
      return {
        borrado: false,
        nota: `No pude identificar qué borrar: el texto vino vacío o pasa los ${MAX_LARGO_HECHO} caracteres. Seguí la conversación con normalidad.`,
      }
    }

    const { data: existentes, error } = await ctx.supabase
      .from('memoria_hechos')
      .select('id, hecho')
      .eq('user_id', ctx.userId)

    if (error) {
      console.error('[olvidar_hecho] no se pudieron leer los hechos:', error.message)
      return { borrado: false, nota: 'No pude acceder a la memoria en este momento. Seguí la conversación con normalidad.' }
    }

    const porClave = new Map((existentes ?? []).map((f) => [clave(f.hecho as string), f.id as number]))
    const aBorrarId = porClave.get(clave(propuesto.hecho))

    if (aBorrarId == null) {
      // S3: el string que mandó el modelo, para poder ver POR QUÉ no matcheó.
      // El contrato de esta tool es el texto EXACTO del hecho, y hay dos formas
      // conocidas de fallarlo que sin este log son indistinguibles de "el dato
      // ya no estaba": que el modelo copie el sufijo de categoría que agrega
      // `bloqueMemoria` ("le gusta X (preferencia)") o que copie del bloque de
      // recuerdos en vez del de hechos (sólo pasa en modo texto, que es el
      // único donde van los dos).
      //
      // Se loguea el recibido y el conteo, NO las claves disponibles: eso
      // volcaría la lista entera de hechos del usuario a los logs.
      console.log(
        `[olvidar_hecho] no matcheó ningún hecho: recibido="${propuesto.hecho.slice(0, 120)}" disponibles=${porClave.size}`,
      )
      return {
        borrado: false,
        nota: 'No encontré ese dato guardado. Puede que ya no esté, o que el texto no coincida exacto con lo que tenés anotado.',
      }
    }

    const { error: errDelete } = await ctx.supabase
      .from('memoria_hechos')
      .delete()
      .eq('id', aBorrarId)
      .eq('user_id', ctx.userId)

    if (errDelete) {
      console.error('[olvidar_hecho] falló el delete:', errDelete.message)
      return { borrado: false, nota: 'No pude borrar ese dato. Seguí la conversación con normalidad.' }
    }

    return { borrado: true, nota: 'Borrado. No hace falta que se lo menciones al usuario.' }
  },
}

// --- buscar_en_memoria (D3, solo Live) --------------------------------------
//
// El modo texto ya dispara RAG automático contra el último mensaje del
// usuario en CADA request (`buscarRecuerdos` en `ai-chat/index.ts`, vía
// `_shared/recuerdos.ts`) — no necesita pedirlo. Live no tiene ese
// automatismo: al abrir la sesión el usuario todavía no dijo nada contra qué
// buscar (ver el comentario en `live/index.ts`), así que esta tool le da
// acceso a la misma memoria vectorial pero A DEMANDA, cuando la charla
// hablada lo necesita a mitad de turno.
//
// Reusa `buscarRecuerdos` (mismo TOP_K, mismo UMBRAL_SIMILITUD) en vez de
// reimplementar la llamada al RPC — es la decisión D3 del diagnóstico
// original de Fase 4, confirmada pero nunca construida hasta ahora.
//
// `soloModo: 'live'` es lo único que la mantiene fuera de `toolDeclarations`
// en modo texto (ver más abajo): en texto sería redundante con el RAG
// automático que ya corre en cada mensaje.

const buscarEnMemoriaTool: Tool = {
  declaration: {
    name: 'buscar_en_memoria',
    description:
      'Busca en tus recuerdos de conversaciones anteriores con este usuario algo que se haya hablado antes y que no ' +
      'esté en la lista de hechos que ya sabés de él. Usala cuando la charla necesite ese contexto y no lo tengas a mano. ' +
      'No la uses para datos que ya están en la lista de hechos: para eso no hace falta buscar nada.',
    parameters: {
      type: 'OBJECT',
      properties: {
        consulta: {
          type: 'STRING',
          description: 'Qué buscar en la memoria, en pocas palabras (el tema o dato que necesitás recordar).',
        },
      },
      required: ['consulta'],
    },
  },
  soloModo: 'live',

  handler: async (args, ctx) => {
    const consulta = typeof args.consulta === 'string' ? args.consulta.trim() : ''
    if (!consulta) {
      return { ok: false, error: 'No se especificó qué buscar en la memoria.' }
    }

    // Misma key BYOK de Gemini que ya usa el resto de la memoria (Fase 2): el
    // embedding de la consulta es del mismo proveedor que el chat, no hace
    // falta una key nueva.
    const { data: settings, error } = await ctx.supabase
      .from('ajustes_ia')
      .select('gemini_api_key_encrypted')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (error || !settings?.gemini_api_key_encrypted) {
      console.error('[buscar_en_memoria] no se pudo leer la key de Gemini:', error?.message)
      return { ok: false, error: 'No pude acceder a la memoria en este momento.' }
    }

    let apiKey: string
    try {
      apiKey = await decryptApiKey(settings.gemini_api_key_encrypted, ctx.encryptionSecret)
    } catch (err) {
      console.error('[buscar_en_memoria] no se pudo descifrar la key:', err instanceof Error ? err.message : err)
      return { ok: false, error: 'No pude leer tu key de Gemini.' }
    }

    const embedding = await generarEmbedding(apiKey, consulta, 'RETRIEVAL_QUERY')
    if (!embedding) {
      return { ok: false, error: 'No pude buscar en la memoria en este momento.' }
    }

    const recuerdos = await buscarRecuerdos(ctx.supabase, embedding)
    if (recuerdos.length === 0) {
      return { ok: true, encontrado: false, nota: 'No encontré nada en la memoria sobre eso.' }
    }

    return { ok: true, encontrado: true, recuerdos: recuerdos.map((r) => r.contenido) }
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
      console.error('[buscar_en_internet] no se pudo leer la key de Tavily:', error.message)
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
      console.error('[buscar_en_internet] no se pudo descifrar la key:', err instanceof Error ? err.message : err)
      return { ok: false, error: 'No pude leer tu key de Tavily. Volvé a guardarla en Ajustes.' }
    }

    return await buscarEnInternet(apiKey, query)
  },
}

// ---------------------------------------------------------------------------

export const TOOLS: Tool[] = [recordarHecho, olvidarHecho, buscarEnMemoriaTool, buscarEnInternetTool]

export function toolDeclarations(modo: ModoConversacion): ToolDeclaration[] {
  return TOOLS.filter((t) => !t.soloModo || t.soloModo === modo).map((t) => t.declaration)
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.declaration.name === name)
}
