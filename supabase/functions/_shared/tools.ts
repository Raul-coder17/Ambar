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
import { CATEGORIA_ESTILO, clave, esHechoDeEstilo, MAX_LARGO_HECHO, normalizarArgsHecho } from './memoria.ts'
import { MAX_LARGO_PIZARRA, normalizarArgsPizarra } from './pizarra.ts'
import { buscarRecuerdos } from './recuerdos.ts'
import { buscarRecetas } from './spoonacular.ts'
import { buscarEnInternet } from './tavily.ts'
import { buscarPeliculasSeries } from './tmdb.ts'

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
  /**
   * Sólo en modo Live: el `session_id` de la sesión de voz en curso, que el
   * cliente manda junto con cada tool call. Lo usa `mostrar_en_pantalla` para
   * agrupar las tarjetas de una misma llamada y para escopear su dedupe.
   *
   * Opcional porque en modo texto no existe (`ai-chat` no lo pasa) y ninguna
   * tool disponible en ese modo lo necesita. Se inyecta por el contexto, como
   * `encryptionSecret`, en vez de ser un parámetro más de la declaración: es
   * infraestructura del canal, no algo que el modelo deba conocer ni poder
   * inventar. Que viniera del modelo sería además un agujero — podría escribir
   * tarjetas dentro de otra sesión.
   */
  sessionId?: string
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

/**
 * El nombre de `mostrar_en_pantalla`, exportado por el mismo motivo que
 * `OLVIDAR_HECHO`: hay quien necesita reconocer la call SIN ejecutarla.
 *
 * El cliente (`useLiveSession.ts`) la reconoce por dos cosas distintas —
 * eximirla del tope de tool calls, y (en el Paso 2b) leer el `contenido` del
 * argumento para pintar la tarjeta al instante, sin esperar el round-trip a la
 * Edge Function. Igual que con OLVIDAR_HECHO, allá el literal está duplicado a
 * mano: `_shared/` es código de Deno con imports por URL y no se puede importar
 * desde el bundle de Vite.
 */
export const MOSTRAR_EN_PANTALLA = 'mostrar_en_pantalla'

export interface Tool {
  declaration: ToolDeclaration
  handler: ToolHandler
  // Si está seteado, la tool sólo se declara en ese modo (ver `toolDeclarations`).
  // Sin esto, disponible en los dos — es el caso por defecto y el de casi todas.
  soloModo?: ModoConversacion
}

// --- recordar_hecho ---------------------------------------------------------

/**
 * Se le agrega a la nota del `functionResponse` cuando el hecho guardado es una
 * instrucción de estilo (`CATEGORIA_ESTILO`).
 *
 * NO es cosmético: es el único canal que atraviesa la system instruction
 * congelada del modo Live. Esa system instruction se mintea dentro del token
 * efímero al abrir la sesión y no se puede refrescar mientras dure (hallazgo B
 * del diagnóstico de simetría, todavía sin resolver), así que un hecho de
 * estilo guardado a mitad de una charla hablada NO entra en `bloqueMemoria`
 * hasta la sesión siguiente. La nota del functionResponse sí llega al modelo en
 * ese mismo turno, y es lo que hace que el pedido tenga efecto ahora en vez de
 * la próxima vez que abra el micrófono.
 *
 * En modo texto es redundante con `bloqueMemoria` (el próximo request ya lo
 * arma de nuevo con el hecho adentro), pero se manda igual: cuesta una frase y
 * cubre el turno actual, que es justo el que el usuario está mirando.
 */
const NOTA_APLICAR_ESTILO =
  ' Aplicá esa indicación de estilo desde tu próxima respuesta y por el resto de esta conversación.'

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
            `Opcional. Una palabra para agrupar el dato: "${CATEGORIA_ESTILO}", "identidad", "preferencia", "rutina", "trabajo", "salud", "relaciones". ` +
            `Usá "${CATEGORIA_ESTILO}" SÓLO cuando el dato sea una instrucción sobre CÓMO hablarle al usuario (largo de las respuestas, tono, formalidad, idioma, qué evitar decir): ` +
            'esos hechos se le muestran aparte y con prioridad sobre tus reglas de estilo por defecto. Para todo lo demás que le guste o prefiera, usá "preferencia". ' +
            'Si ninguna encaja, no la mandes.',
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

    // D del hallazgo C: si lo que se está guardando es una instrucción de
    // estilo, la nota lleva además la orden de aplicarla ya. Se decide con el
    // mismo predicado que usa `bloqueMemoria` para renderizarla en su sección
    // propia — ver `esHechoDeEstilo` para por qué vive en memoria.ts.
    //
    // Sólo lo llevan las ramas donde el hecho quedó EN VIGOR (guardado, ya
    // estaba, o actualizado). Las de fallo real siguen con su nota genérica:
    // ahí no se guardó nada, y mandar al modelo a obedecer una indicación que
    // no se persistió es prometer algo que la próxima sesión no va a cumplir.
    const esEstilo = esHechoDeEstilo(propuesto)
    const conEstilo = (nota: string) => (esEstilo ? `${nota}${NOTA_APLICAR_ESTILO}` : nota)

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
        return { guardado: true, nota: conEstilo('Ya lo tenías anotado; borré el dato viejo que quedó obsoleto.') }
      }
      // Con una instrucción de estilo esta rama es la MÁS importante, no la
      // menos: si el usuario la está repitiendo es porque no le hiciste caso la
      // primera vez. Por eso acá no se usa `conEstilo` — se saca el "no hizo
      // falta anotarlo de nuevo", que invita justo a lo contrario de obedecer.
      return {
        guardado: false,
        nota: esEstilo
          ? `Eso ya estaba guardado.${NOTA_APLICAR_ESTILO}`
          : 'Eso ya estaba guardado, no hizo falta anotarlo de nuevo.',
      }
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
      return { guardado: true, nota: conEstilo('Actualicé el dato viejo con el nuevo.') }
    }

    const { error: errInsert } = await ctx.supabase
      .from('memoria_hechos')
      .insert({ user_id: ctx.userId, hecho: propuesto.hecho, categoria: propuesto.categoria })

    if (errInsert) {
      // 23505 = choque contra el índice único (user_id, lower(btrim(hecho))).
      // Es una carrera con otro request del mismo usuario: el hecho quedó
      // guardado igual, que es lo que importaba.
      if (errInsert.code === '23505') {
        return {
          guardado: false,
          nota: esEstilo
            ? `Eso ya estaba guardado.${NOTA_APLICAR_ESTILO}`
            : 'Eso ya estaba guardado, no hizo falta anotarlo de nuevo.',
        }
      }
      console.error('[recordar_hecho] falló el insert:', errInsert.message)
      return { guardado: false, nota: 'No pude guardar ese dato. Seguí la conversación con normalidad.' }
    }

    return { guardado: true, nota: conEstilo('Guardado. No hace falta que se lo menciones al usuario.') }
  },
}

// --- olvidar_hecho -----------------------------------------------------------

/**
 * Se le agrega a la nota del `functionResponse` cuando el borrado SÍ ocurrió.
 *
 * Es el gemelo de `NOTA_APLICAR_ESTILO` y existe por el mismo hallazgo B, pero
 * tapa el único caso que aquélla no podía tapar. El contexto congelado del modo
 * Live sólo se puede AMPLIAR, nunca restar: un hecho nuevo llega igual al modelo
 * porque el usuario lo acaba de decir y está en los turnos de la charla, pero un
 * hecho BORRADO sigue entero en `bloqueMemoria` por el resto de la sesión, y no
 * hay nada que se pueda agregar para que desaparezca — salvo la instrucción de
 * ignorarlo. Sin esto, "olvidate de que trabajo en X" y ocho minutos después
 * "¿cómo va lo de X?" es el comportamiento esperado, no un bug raro.
 *
 * Que el fallo caiga justo sobre un pedido EXPLÍCITO del usuario es lo que lo
 * hace peor que el resto de B: `recordar_hecho` se dispara sola y por inferencia,
 * ésta sólo cuando el usuario la pide directo. Y es el mismo caso que P1 ya trata
 * como sensible del lado de memoria_vectorial (ese turno no se persiste): esto es
 * la otra mitad de esa protección, la de dentro de la sesión.
 *
 * En modo texto es redundante (el próximo request arma `bloqueMemoria` de nuevo,
 * ya sin el hecho), pero se manda igual por lo mismo que NOTA_APLICAR_ESTILO:
 * cuesta una frase y cubre el turno actual.
 *
 * LÍMITE CONOCIDO Y ACEPTADO: la nota vive en los turnos de la conversación, que
 * `contextWindowCompression: { slidingWindow: {} }` SÍ comprime; el hecho viejo
 * vive en la systemInstruction, que está exenta y no envejece nunca. O sea que en
 * una llamada larga la corrección puede evaporarse mientras el error persiste.
 * Aguanta una llamada de 5-15 min; en una de 45 puede no aguantar. Si eso se
 * observa en uso real, ahí sí se justifica el re-mint con reconexión, y SÓLO para
 * esta tool (ver la sección de B en PLAN_AMBAR.md).
 */
const NOTA_IGNORAR_HECHO =
  ' Puede que ese dato siga apareciendo más arriba, en la lista de lo que sabés del usuario: ignoralo por el resto de esta conversación y no lo menciones, aunque lo veas ahí.'

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

    // Sólo esta rama lleva la nota: es la única donde la base efectivamente
    // cambió. Las de fallo (args inválidos, error de lectura, no matcheó, error
    // de delete) siguen con su nota genérica, por la misma disciplina que fijó D
    // en `recordar_hecho` — mandar al modelo a ignorar un hecho que sigue
    // guardado es prometer algo que la próxima sesión no va a cumplir. Ojo con
    // la rama de "no matcheó", que es la tentadora: ocurre justo cuando el hecho
    // SIGUE vivo y visible en la lista, pero ahí no se borró nada.
    return { borrado: true, nota: `Borrado. No hace falta que se lo menciones al usuario.${NOTA_IGNORAR_HECHO}` }
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
      'Busca en tus recuerdos de conversaciones anteriores con este usuario. Es rápida y barata: usala sin dudar. ' +
      'SIEMPRE llamala antes de decirle al usuario que no te acordás, que no sabés o que nunca hablaron de algo, ' +
      'y también cuando él dé por sabido algo que vos no tenés a mano ("lo que te conté", "eso que hablamos", ' +
      'un nombre o proyecto que menciona como conocido). Decir "no me acuerdo" sin haber buscado es un error. ' +
      'Lo único para lo que no hace falta llamarla son los datos que ya están en la lista de hechos que sabés del usuario.',
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

    // El `nota` NO es decorativo: hasta acá esta tool devolvía el `contenido`
    // pelado, sin decir que era viejo — justo el riesgo que el diseño de texto
    // se tomó el trabajo de prevenir con el marco de `bloqueMemoria`,
    // reintroducido en el otro modo.
    //
    // Y se volvió condición para el bloque de recuerdos recientes que ahora se
    // arma al abrir la sesión: los dos leen la MISMA tabla, uno por fecha y el
    // otro por similitud, así que devolver la misma fila es el caso esperado y
    // no el raro (lo más reciente es justo lo que el usuario tiende a retomar).
    // Con dos marcos distintos sobre el mismo texto —uno "de esto venían
    // hablando", el otro nada— el modelo puede leerlos como dos ocasiones
    // separadas e inventar que el tema salió dos veces. Compartiendo el mismo
    // marco de fondo, la colisión pasa a ser redundante en vez de contradictoria.
    return {
      ok: true,
      encontrado: true,
      nota: 'Son fragmentos de conversaciones ANTERIORES, no cosas que el usuario acabe de decir. Si los usás, hablá de ellos como algo que ya pasó.',
      recuerdos: recuerdos.map((r) => r.contenido),
    }
  },
}

// --- mostrar_en_pantalla (pizarra visual, Paso 2, solo Live) ----------------
//
// POR QUÉ ESTA TOOL EXISTE, Y POR QUÉ NO PODÍA SER OTRA COSA
//
// La pizarra necesita que Ámbar escriba en pantalla un contenido DISTINTO de lo
// que está diciendo en voz alta: una receta formateada mientras la charla
// sigue. En modo texto eso no haría falta (la respuesta ya se lee), pero en
// Live no hay canal de texto disponible: `gemini-3.1-flash-live-preview` es un
// modelo de audio nativo y la doc oficial de la Live API dice que ésos sólo
// admiten la modalidad de respuesta `AUDIO` — para texto hay que usar la
// transcripción de la salida, que es lo que YA usamos y no sirve para esto: es
// la transcripción literal de lo hablado, con el estilo de voz encima, no una
// tarjeta curada. Una function call es el único canal por el que puede viajar
// contenido estructurado del modelo a la pantalla.
//
// Y NO ES PERSISTENCIA EN EL CAMINO CRÍTICO. La tarjeta la pinta el cliente
// apenas VE la call, con el `contenido` del argumento, sin esperar este handler
// (mismo patrón que `olvidar_hecho`, que se marca al ver la call y no al
// responderla). Este handler sólo la GUARDA, en segundo plano respecto de lo que
// el usuario ve. Por eso las notas de acá dicen "ya está en pantalla" incluso en
// las ramas donde el insert falló: es lo que efectivamente pasó, y mandar al
// modelo a disculparse por una tarjeta que el usuario está mirando sería peor
// que perder la fila.
const mostrarEnPantallaTool: Tool = {
  declaration: {
    name: MOSTRAR_EN_PANTALLA,
    description:
      'Escribe contenido en la pantalla del usuario, como una tarjeta que queda fija mientras la conversación de voz sigue. ' +
      'Usala cuando lo que tenés para dar se sigue mejor con los ojos que con el oído y el usuario va a querer volver a mirarlo: ' +
      'una receta con sus ingredientes y pasos, una lista de opciones, un instructivo paso a paso, datos que hay que comparar. ' +
      'NO la uses para charla normal, para una respuesta corta, ni para repetir por escrito lo que acabás de decir en voz alta. ' +
      'El contenido admite formato: "## título de sección", "- viñeta", "1. numerada", "**negrita**" y "---" para separar. ' +
      'Nada de eso se pronuncia — es sólo para la pantalla, y ahí SÍ se espera que lo uses aunque en voz no puedas. ' +
      `Máximo ${MAX_LARGO_PIZARRA} caracteres de contenido: si no entra, mostrá lo esencial y ofrecé el resto hablando. ` +
      'Después de llamarla, seguí la conversación con naturalidad: no leas la tarjeta en voz alta ni la describas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo: {
          type: 'STRING',
          description: 'Opcional. Encabezado corto de la tarjeta, de pocas palabras ("Tortilla de papas", "Opciones para el finde").',
        },
        contenido: {
          type: 'STRING',
          description:
            `El contenido a mostrar, en español y con el formato de arriba. Máximo ${MAX_LARGO_PIZARRA} caracteres. ` +
            'Tiene que entenderse solo, sin lo que dijiste en voz: el usuario puede volver a mirarlo más tarde.',
        },
      },
      required: ['contenido'],
    },
  },
  soloModo: 'live',

  handler: async (args, ctx) => {
    const propuesta = normalizarArgsPizarra(args)
    if (!propuesta) {
      return {
        mostrado: false,
        nota: 'No pude mostrar nada en pantalla: el contenido vino vacío. Seguí la conversación con normalidad.',
      }
    }

    // Se le dice al modelo que se cortó para que pueda ofrecer el resto
    // hablando o mandar una segunda tarjeta. Sin esto creería que la tarjeta
    // dice todo lo que él escribió, y la conversación seguiría dando por
    // sabido algo que el usuario no tiene delante.
    const notaTruncado = propuesta.truncado
      ? ` Ojo: era más largo que el máximo y se cortó el final, así que en pantalla está incompleto. Si lo que quedó afuera importa, decilo en voz o mandá una segunda tarjeta con el resto.`
      : ''

    // La prohibición de leerla en voz alta va acá ADEMÁS de en la system
    // instruction (INSTRUCCION_ESTILO_VOZ) a propósito, y no es redundancia
    // ociosa: es el mismo caso de `NOTA_APLICAR_ESTILO`. La system instruction
    // del modo Live queda congelada dentro del token efímero al abrir la sesión
    // (hallazgo B), mientras que esta nota llega en el turno exacto en que el
    // modelo acaba de escribir la tarjeta — que es justo el turno donde la
    // tentación de recitarla es máxima.
    const NO_LEER = ' NO leas la tarjeta en voz alta ni la describas: el usuario ya la está viendo. Comentá algo breve y seguí.'

    // El session_id no lo manda el modelo, viene del contexto (ver ToolContext).
    // El fallback a '' sólo se alcanzaría por un bug del cliente: cuando llega
    // un toolCall, `sessionIdRef` ya está seteado desde antes de conectar el
    // WebSocket. Se loguea porque si pasara, el dedupe quedaría agrupando
    // tarjetas de sesiones distintas bajo la misma clave vacía.
    if (!ctx.sessionId) {
      console.error('[mostrar_en_pantalla] llegó sin session_id: el dedupe queda degradado.')
    }
    const sessionId = ctx.sessionId ?? ''

    const { error } = await ctx.supabase.from('pizarras').insert({
      user_id: ctx.userId,
      session_id: sessionId,
      titulo: propuesta.titulo,
      contenido: propuesta.contenido,
    })

    if (error) {
      // 23505 = choque contra pizarras_dedupe_idx. NO es un error: es session
      // resumption reemitiendo una call que ya se había ejecutado antes de un
      // corte (ver el comentario del índice en la migración). La tarjeta ya
      // está guardada Y ya está en pantalla, que es lo que importaba.
      if (error.code === '23505') {
        return { mostrado: true, nota: `Esa tarjeta ya estaba en pantalla.${NO_LEER}` }
      }
      // El insert falló de verdad. La tarjeta igual está en pantalla (la pintó
      // el cliente); lo que se pierde es que quede en Historial. No es algo que
      // el usuario haya pedido explícitamente ni de lo que haya que avisarle a
      // mitad de una charla hablada: se loguea y la conversación sigue.
      console.error('[mostrar_en_pantalla] falló el insert:', error.message)
      return {
        mostrado: true,
        guardado: false,
        nota: `Está en pantalla, pero no se pudo guardar para el historial. No se lo menciones al usuario.${notaTruncado}${NO_LEER}`,
      }
    }

    return { mostrado: true, nota: `Listo, ya está en pantalla.${notaTruncado}${NO_LEER}` }
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

// --- buscar_recetas (Spoonacular, backlog adelantado) -----------------------
//
// Mismo patrón BYOK que buscar_en_internet: key propia del usuario, cifrada en
// `ajustes_ia`, sin validar al guardar (ver el comentario de `manage-ai-key`).
//
// LOS INGREDIENTES PUEDEN VENIR DE LA CÁMARA. En modo Live el modelo ve lo que
// la cámara del usuario apunta (Fase 4f): si reconoce ingredientes o platos a
// simple vista, tiene que poder pasarlos acá igual que si el usuario los
// hubiera dicho en voz alta — no hace falta que los liste por su cuenta. Está
// en la description (no sólo en la system instruction) porque es una regla de
// CUÁNDO y CON QUÉ ARGUMENTOS llamar a esta tool en particular, no una regla
// general de estilo de la charla.
const buscarRecetasTool: Tool = {
  declaration: {
    name: 'buscar_recetas',
    description:
      'Busca recetas de cocina, opcionalmente con su información nutricional. Se puede buscar por ingredientes disponibles, por un plato o tipo de comida, o por los dos juntos. ' +
      'Los ingredientes pueden venir de lo que el usuario ESCRIBE O DICE, pero también de lo que vos identificás por CÁMARA en una conversación de voz (ingredientes o platos que ves en la imagen): ' +
      'en ese caso pasalos igual en `ingredientes`, no hace falta que el usuario los liste él mismo. ' +
      'Pedí `incluir_nutricion` sólo si el usuario pregunta por calorías, proteínas u otro dato nutricional.',
    parameters: {
      type: 'OBJECT',
      properties: {
        consulta: {
          type: 'STRING',
          description: 'El plato o tipo de comida a buscar, en pocas palabras (ej. "pasta", "postre de chocolate"). Opcional si mandás `ingredientes`.',
        },
        ingredientes: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            'Ingredientes que el usuario tiene disponibles o que identificaste vos por cámara. Opcional si mandás `consulta`. Al menos uno de los dos es obligatorio.',
        },
        incluir_nutricion: {
          type: 'BOOLEAN',
          description: 'true si el usuario pidió información nutricional (calorías, proteína, grasa, carbohidratos). Por defecto false.',
        },
      },
    },
  },

  handler: async (args, ctx) => {
    const consulta = typeof args.consulta === 'string' ? args.consulta.trim() : ''
    const ingredientes = Array.isArray(args.ingredientes)
      ? args.ingredientes.filter((i): i is string => typeof i === 'string' && i.trim().length > 0).map((i) => i.trim())
      : []
    const incluirNutricion = args.incluir_nutricion === true

    if (!consulta && ingredientes.length === 0) {
      return { ok: false, error: 'No se especificó ni una consulta ni ingredientes para buscar recetas.' }
    }

    const { data: settings, error } = await ctx.supabase
      .from('ajustes_ia')
      .select('spoonacular_api_key_encrypted')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (error) {
      console.error('[buscar_recetas] no se pudo leer la key de Spoonacular:', error.message)
      return { ok: false, error: 'No pude acceder a la configuración de recetas en este momento.' }
    }

    const encrypted = settings?.spoonacular_api_key_encrypted
    if (!encrypted) {
      return {
        ok: false,
        error: 'No tenés una API key de Spoonacular configurada. Guardala en Ajustes para poder buscar recetas.',
      }
    }

    let apiKey: string
    try {
      apiKey = await decryptApiKey(encrypted, ctx.encryptionSecret)
    } catch (err) {
      console.error('[buscar_recetas] no se pudo descifrar la key:', err instanceof Error ? err.message : err)
      return { ok: false, error: 'No pude leer tu key de Spoonacular. Volvé a guardarla en Ajustes.' }
    }

    return await buscarRecetas(apiKey, { consulta, ingredientes, incluirNutricion })
  },
}

// --- buscar_peliculas_series (TMDB, backlog adelantado) ---------------------
//
// PERSONALIZACIÓN CON MEMORIA: esta tool no toca `memoria_hechos` — no hace
// falta. Los hechos del usuario (género favorito, algo que le gustó) ya van
// SIEMPRE en la system instruction vía `bloqueMemoria`, idéntica en los dos
// modos. La description de acá le dice al modelo que los use para armar
// `genero`/`consulta` sin volver a preguntar; el refuerzo en SYSTEM_INSTRUCTION_BASE
// (prompt.ts) es el mismo remedio que ya se usó con recordar_hecho: reforzar en
// la system instruction lo que la description sola no bastó para lograr.
const buscarPeliculasSeriesTool: Tool = {
  declaration: {
    name: 'buscar_peliculas_series',
    description:
      'Busca o recomienda películas y series. Con `consulta` busca por título, actor o tema puntual. Sin `consulta`, arma una recomendación: ' +
      'con `genero` filtra por ese género y devuelve lo más popular; sin ninguno de los dos, devuelve lo más popular del momento en general. ' +
      'Si el usuario pide una recomendación sin dar detalles ("recomendame algo", "qué veo hoy"), fijate primero si ya sabés su género favorito o algo que le haya gustado ' +
      '(está en la lista de lo que sabés del usuario) y usalo en `genero` o `consulta` en vez de preguntarle de nuevo qué le gusta.',
    parameters: {
      type: 'OBJECT',
      properties: {
        consulta: {
          type: 'STRING',
          description: 'Título, actor o tema a buscar. Opcional.',
        },
        genero: {
          type: 'STRING',
          description: 'Género para recomendar (ej. "terror", "comedia", "ciencia ficción"). Opcional, se ignora si mandás `consulta`.',
        },
        tipo: {
          type: 'STRING',
          enum: ['pelicula', 'serie'],
          description: 'Opcional: limitar a películas o a series. Sin esto, incluye los dos tipos.',
        },
      },
    },
  },

  handler: async (args, ctx) => {
    const consulta = typeof args.consulta === 'string' ? args.consulta.trim() : ''
    const genero = typeof args.genero === 'string' ? args.genero.trim() : ''
    const tipo = args.tipo === 'pelicula' || args.tipo === 'serie' ? args.tipo : undefined

    const { data: settings, error } = await ctx.supabase
      .from('ajustes_ia')
      .select('tmdb_api_key_encrypted')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (error) {
      console.error('[buscar_peliculas_series] no se pudo leer la key de TMDB:', error.message)
      return { ok: false, error: 'No pude acceder a la configuración de películas y series en este momento.' }
    }

    const encrypted = settings?.tmdb_api_key_encrypted
    if (!encrypted) {
      return {
        ok: false,
        error: 'No tenés una API key de TMDB configurada. Guardala en Ajustes para poder buscar películas y series.',
      }
    }

    let apiKey: string
    try {
      apiKey = await decryptApiKey(encrypted, ctx.encryptionSecret)
    } catch (err) {
      console.error('[buscar_peliculas_series] no se pudo descifrar la key:', err instanceof Error ? err.message : err)
      return { ok: false, error: 'No pude leer tu key de TMDB. Volvé a guardarla en Ajustes.' }
    }

    return await buscarPeliculasSeries(apiKey, { consulta, genero, tipo })
  },
}

// ---------------------------------------------------------------------------

export const TOOLS: Tool[] = [
  recordarHecho,
  olvidarHecho,
  buscarEnMemoriaTool,
  mostrarEnPantallaTool,
  buscarEnInternetTool,
  buscarRecetasTool,
  buscarPeliculasSeriesTool,
]

export function toolDeclarations(modo: ModoConversacion): ToolDeclaration[] {
  return TOOLS.filter((t) => !t.soloModo || t.soloModo === modo).map((t) => t.declaration)
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.declaration.name === name)
}
