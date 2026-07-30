// Lógica pura (sin I/O ni Deno.serve) de la memoria: cómo se arma el bloque de
// contexto que va en la system instruction, cómo se recorta el historial y cómo
// se sanean los args del `recordar_hecho` que emite Gemini. Se aísla acá por lo
// mismo que `rpm.ts`: es la parte que se puede razonar y testear sin red.
//
// EL CAMBIO DE FONDO DE ESTA FASE
//
// Hasta Fase 1, cada request mandaba el historial COMPLETO de la conversación.
// Eso no escala (la ventana se llena, y con flash-lite se paga en latencia y en
// tokens de salida) y además se pierde entero al refrescar la página. Ahora el
// contexto se arma con tres piezas de distinta naturaleza:
//
//   (a) HECHOS       — pocos, estables, van SIEMPRE. Definen con quién está
//                      hablando el asistente. No se buscan: se mandan todos.
//   (b) RECUERDOS    — muchos, viejos, van SÓLO los que se parecen a lo que el
//                      usuario acaba de escribir (top-K por coseno). Es el RAG.
//   (c) TURNOS       — los últimos N mensajes tal cual, para que el hilo de la
//                      charla actual no se corte a mitad de una frase.
//
// (a) y (b) van en la system instruction, no en `contents`: son datos sobre el
// usuario, no cosas que él haya dicho en este chat. Meterlos como turnos falsos
// haría que el modelo los cite como si acabaran de decirse.

export interface MensajeHistorial {
  role: 'user' | 'assistant'
  text: string
}

export interface Hecho {
  hecho: string
  categoria: string | null
}

export interface Recuerdo {
  contenido: string
  similitud: number
}

/** Cuántos recuerdos como mucho se recuperan por request. */
export const TOP_K = 5

/**
 * Similitud coseno mínima para que un recuerdo entre al contexto.
 *
 * El top-K solo no alcanza: la búsqueda SIEMPRE devuelve los K más parecidos,
 * aunque el más parecido no tenga nada que ver. Sin umbral, un "hola" arrastra
 * cinco fragmentos al azar de charlas viejas y el modelo intenta hilarlos con
 * lo que se le está preguntando. 0.6 es un punto de partida conservador para
 * ajustar con uso real, no un número derivado de nada.
 */
export const UMBRAL_SIMILITUD = 0.6

/**
 * Cuántos mensajes recientes se mandan tal cual.
 *
 * 8 = unos 4 intercambios ida y vuelta. Lo que quede afuera no se pierde: ya
 * está en memoria_vectorial y vuelve por RAG si viene al caso.
 */
export const TURNOS_RECIENTES = 8

/**
 * Cuántos intercambios recientes se traen al ABRIR una sesión de voz.
 *
 * No es lo mismo que TOP_K: aquéllos se eligen por similitud contra algo que el
 * usuario dijo, y al abrir el micrófono todavía no dijo nada. En t=0 la clave
 * de recuperación correcta es la recencia, no el parecido.
 *
 * 5 es un punto de partida sin calibrar, igual que UMBRAL_SIMILITUD y
 * MIN_LARGO_INTERCAMBIO. Ojo con la granularidad: desde el hallazgo A cada
 * turno hablado es una fila, así que 5 pueden ser los últimos dos minutos de
 * una llamada larga, no las últimas 5 conversaciones.
 */
export const RECUERDOS_RECIENTES = 5

/** Largo máximo de un hecho. Un "hecho" que no entra acá es un resumen. */
export const MAX_LARGO_HECHO = 300

/**
 * Valor reservado de `categoria` para los hechos que dicen CÓMO hablarle al
 * usuario, en vez de QUÉ sabe de él.
 *
 * Es un valor convenido sobre la columna que YA existe, no una columna nueva:
 * así no hace falta migración y sirve en los dos modos sin tocar ninguna de las
 * dos Edge Functions, porque ambas arman su contexto con `bloqueMemoria`.
 *
 * El precio de elegir la columna existente es que quien decide la categoría es
 * el modelo, así que esto sólo funciona junto con la guía de `prompt.ts` y la
 * description de `categoria` en `tools.ts` — no son tres mejoras sumables, las
 * otras dos son requisito de ésta.
 */
export const CATEGORIA_ESTILO = 'estilo'

/**
 * Si un hecho es una instrucción de estilo.
 *
 * Lo usan `bloqueMemoria` (para renderizarlo en su sección propia) y el handler
 * de `recordar_hecho` (para decidir si la nota del functionResponse lleva la
 * orden de aplicarlo ya). Vive acá en vez de duplicado en cada lado por lo
 * mismo que `clave()`: si los dos criterios se desalinearan, el bloque de
 * contexto y la nota discreparían sobre el mismo hecho.
 *
 * Normaliza aunque `normalizarArgsHecho` ya guarde en minúsculas: una fila
 * escrita a mano desde el dashboard de Supabase no pasa por ahí.
 */
export function esHechoDeEstilo(hecho: Hecho): boolean {
  return hecho.categoria?.trim().toLowerCase() === CATEGORIA_ESTILO
}

/**
 * Largo mínimo (pregunta + respuesta) para que un intercambio valga guardarse
 * en memoria_vectorial.
 *
 * Existe por el modo Live: una charla hablada está llena de turnos de "sí",
 * "dale", "ajá" que como embedding no recuperan nada (ver
 * `textoDelIntercambio`) y sólo suman filas al problema de crecimiento sin
 * límite. En modo texto no se aplica: los mensajes escritos son más
 * deliberados y ahí el único filtro sigue siendo que haya una pregunta.
 *
 * 60 es un punto de partida sin calibrar contra uso real, igual que
 * UMBRAL_SIMILITUD — no es un número derivado de nada.
 */
export const MIN_LARGO_INTERCAMBIO = 60

/**
 * Recorta el historial a los últimos `max` mensajes.
 *
 * Después del recorte descarta los mensajes de asistente que hayan quedado al
 * principio: Gemini espera que `contents` arranque con un turno del usuario, y
 * un corte por cantidad puede dejar arriba la respuesta a una pregunta que ya
 * no está.
 */
export function turnosRecientes(messages: MensajeHistorial[], max = TURNOS_RECIENTES): MensajeHistorial[] {
  const utiles = messages.filter((m) => typeof m?.text === 'string' && m.text.trim().length > 0)
  const recientes = utiles.slice(-max)
  let desde = 0
  while (desde < recientes.length && recientes[desde].role === 'assistant') desde++
  return recientes.slice(desde)
}

/** Último mensaje del usuario: es el texto que se embebe para buscar recuerdos. */
export function ultimoMensajeUsuario(messages: MensajeHistorial[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === 'user' && typeof m.text === 'string' && m.text.trim()) return m.text.trim()
  }
  return ''
}

/** Descarta los recuerdos que la búsqueda devolvió pero que no vienen al caso. */
export function filtrarRecuerdos(recuerdos: Recuerdo[], umbral = UMBRAL_SIMILITUD): Recuerdo[] {
  return recuerdos.filter((r) => typeof r?.similitud === 'number' && r.similitud >= umbral && r.contenido?.trim())
}

/**
 * Texto que se guarda como una unidad en memoria_vectorial: el intercambio
 * completo, no cada mensaje por separado.
 *
 * Un embedding de "sí, dale" suelto no se parece a nada ni recupera nada útil.
 * Con la pregunta y la respuesta juntas, el vector representa el TEMA que se
 * tocó, que es lo que se quiere poder recuperar meses después.
 */
export function textoDelIntercambio(pregunta: string, respuesta: string): string {
  return `Usuario: ${pregunta.trim()}\nÁmbar: ${respuesta.trim()}`
}

/**
 * Si un intercambio de voz vale guardarse en memoria_vectorial.
 *
 * Exige las dos condiciones: que ambos lados tengan texto (un turno donde sólo
 * habló uno no es un intercambio) y que entre los dos lleguen a
 * MIN_LARGO_INTERCAMBIO. Lo llama SÓLO el modo Live — ver el comentario de esa
 * constante para por qué texto no lo usa.
 */
export function valeGuardarIntercambio(pregunta: string, respuesta: string): boolean {
  const p = pregunta.trim()
  const r = respuesta.trim()
  if (!p || !r) return false
  return p.length + r.length >= MIN_LARGO_INTERCAMBIO
}

/**
 * El bloque de memoria que se le agrega a la system instruction.
 *
 * Los hechos van con su texto exacto porque es el mismo texto que el modelo
 * tiene que mandar en `reemplaza` cuando uno queda obsoleto (ver
 * `normalizarArgsHecho`): lo que lee es la interfaz para lo que escribe.
 *
 * Devuelve '' si no hay nada — un encabezado "Lo que sabés del usuario" vacío
 * es peor que nada: le sugiere al modelo que debería saber algo.
 *
 * TRES SECCIONES, Y EL ORDEN IMPORTA
 *
 * Las instrucciones de estilo (`CATEGORIA_ESTILO`) salen de la lista general y
 * van en una sección propia, ÚLTIMA. El diagnóstico de simetría encontró que
 * como un bullet más de la lista general perdían por rango contra
 * SYSTEM_INSTRUCTION_BASE, que va primero y en imperativo ("respondé SIEMPRE...
 * de forma breve y clara"): una nota en tercera persona no le gana a un
 * "siempre" puesto antes.
 *
 * Última y no primera porque las dos Edge Functions concatenan este bloque al
 * FINAL de su system instruction (`ai-chat/index.ts`, `live/index.ts`), así que
 * el final de este string es la última línea que el modelo lee antes de
 * `contents`. Además evita cerrar la system instruction con el "si no vienen al
 * caso, ignoralos" de los recuerdos.
 *
 * Se MUEVEN, no se copian: si aparecieran en las dos secciones el modelo las
 * vería dos veces con dos marcos contradictorios (uno dice "no lo recites", el
 * otro "obedecelo").
 *
 * `recientes` es el cuarto bloque posible (asimetría de RAG): los últimos
 * intercambios por fecha, que usa SÓLO el modo Live al abrir. Es un parámetro
 * de esta función y no un string que el llamador concatene por su cuenta para
 * que el orden de las secciones —y sobre todo el invariante de que el estilo va
 * último— se siga decidiendo en un solo lugar.
 */
export function bloqueMemoria(hechos: Hecho[], recuerdos: Recuerdo[], recientes: string[] = []): string {
  const partes: string[] = []
  const estilo = hechos.filter(esHechoDeEstilo)
  const generales = hechos.filter((h) => !esHechoDeEstilo(h))

  if (generales.length > 0) {
    const lineas = generales.map((h) => (h.categoria ? `- ${h.hecho} (${h.categoria})` : `- ${h.hecho}`))
    partes.push(
      `Esto es lo que ya sabés del usuario. Usalo con naturalidad cuando venga al caso; no lo recites ni le avises que lo tenés anotado.\n${lineas.join('\n')}`,
    )
  }

  // OJO: esta sección es de recuerdos elegidos por SIMILITUD, y su texto lo
  // dice ("que se parecen a lo que acaba de escribir" — que además asume modo
  // texto). Los intercambios recientes del modo Live NO van por acá aunque
  // salgan de la misma tabla: se eligen por fecha, no por parecido, y meterlos
  // bajo este marco le diría al modelo que se parecen a algo que el usuario
  // acaba de escribir cuando todavía no escribió nada. Tienen su propia
  // sección más abajo.
  if (recuerdos.length > 0) {
    const lineas = recuerdos.map((r) => `- ${r.contenido.trim()}`)
    partes.push(
      `Fragmentos de conversaciones ANTERIORES con este usuario que se parecen a lo que acaba de escribir. Son recuerdos tuyos, no cosas que se hayan dicho recién: si los usás, hablá de ellos como algo que pasó antes. Si no vienen al caso, ignoralos.\n${lineas.join('\n')}`,
    )
  }

  if (recientes.length > 0) {
    const lineas = recientes.map((c) => `- ${c.trim()}`)
    partes.push(
      'Así venía la última conversación con este usuario, de lo más viejo a lo más reciente. Son recuerdos de charlas ANTERIORES, no cosas que se hayan dicho en ésta: si las traés a la charla, hablá de ellas como algo que ya pasó. ' +
        `Sirven para retomar el hilo; si el usuario arranca con otro tema, ignoralas.\n${lineas.join('\n')}`,
    )
  }

  if (estilo.length > 0) {
    // Sin el sufijo `(categoria)` que sí lleva la lista general: acá la
    // categoría es siempre "estilo" y no aporta nada, y además el sufijo es una
    // de las dos formas conocidas de romper el contrato de string exacto de
    // `olvidar_hecho`/`reemplaza` (el modelo copia la línea entera, categoría
    // incluida, y `clave()` no matchea). Ver el log de esa rama en tools.ts.
    const lineas = estilo.map((h) => `- ${h.hecho}`)
    partes.push(
      'Así te pidió el usuario que le hables. Son instrucciones suyas sobre CÓMO responder y tienen prioridad sobre tus reglas de estilo por defecto: si algo dicho antes contradice a una de éstas, gana ésta. ' +
        `Obedecelas en cada respuesta, incluida la próxima; no las recites ni le avises que las tenés anotadas.\n${lineas.join('\n')}`,
    )
  }

  return partes.length > 0 ? `\n\n${partes.join('\n\n')}` : ''
}

// --- Saneado de los args de `recordar_hecho` --------------------------------

export interface HechoPropuesto {
  hecho: string
  categoria: string | null
  /** Texto exacto del hecho anterior que este viene a corregir, si lo hay. */
  reemplaza: string | null
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Normaliza lo que Gemini mandó en la function call. Mismo criterio que
 * `actions.ts` de Organizador-IA: el enum de la declaración no es garantía de
 * nada, el modelo puede mandar cualquier cosa, y lo que no se puede usar se
 * degrada en vez de romper la escritura entera.
 *
 * Devuelve null si no hay un hecho aprovechable: sin `hecho` no hay nada que
 * guardar, y uno larguísimo es un resumen de la charla disfrazado de hecho
 * (para eso ya está memoria_vectorial).
 */
export function normalizarArgsHecho(args: Record<string, unknown>): HechoPropuesto | null {
  const hecho = str(args.hecho)
  if (!hecho || hecho.length > MAX_LARGO_HECHO) return null
  const reemplaza = str(args.reemplaza)
  return {
    hecho,
    categoria: str(args.categoria)?.toLowerCase() ?? null,
    // Un `reemplaza` idéntico al hecho nuevo es ruido del modelo: no reemplaza
    // nada, y dejarlo pasar haría buscar una fila para pisarla con lo mismo.
    reemplaza: reemplaza && clave(reemplaza) !== clave(hecho) ? reemplaza : null,
  }
}

/**
 * Clave de comparación de un hecho. Tiene que dar lo MISMO que el índice único
 * `(user_id, lower(btrim(hecho)))` de la migración: acá se decide si un hecho
 * ya existe, y si los dos criterios no coinciden, el insert se comería un
 * 23505 justo cuando el chequeo previo dijo que no había duplicado.
 */
export function clave(texto: string): string {
  return texto.trim().toLowerCase()
}
