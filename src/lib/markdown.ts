// Parser de un subconjunto ACOTADO de markdown.
//
// Puro a propósito: no sabe de React ni del DOM. Devuelve una lista de bloques
// que `components/Markdown.tsx` traduce a elementos. Se aísla acá por lo mismo
// que `rpm.ts` y `_shared/memoria.ts` del lado de las Edge Functions: es la
// parte que se puede razonar —y ejecutar— sin navegador y sin login.
//
// POR QUÉ ESTO EXISTE
//
// `SYSTEM_INSTRUCTION_BASE` (modo texto) no prohíbe markdown: sólo pide
// respuestas "breves y claras". O sea que gemini-3.1-flash-lite emite
// `**negrita**` y listas con `-` con toda normalidad, y hasta ahora la app las
// mostraba CRUDAS (`{m.text}` pelado en ChatScreen e HistorialScreen). No es
// una mejora cosmética: es un bug que ya está en producción.
//
// POR QUÉ A MANO Y NO `react-markdown`
//
//   1. Bundle. El comentario de `HomeScreen.tsx` justifica un code-split entero
//      porque @google/genai pesa ~450 KB en una PWA que se abre del celular.
//      react-markdown + remark son ~100 KB y caerían en el chunk PRINCIPAL:
//      los necesita ChatScreen, que no es lazy. Esto son ~60 líneas.
//   2. Seguridad. Este texto lo genera un modelo. El renderer emite elementos
//      React y NUNCA strings de HTML (nada de `dangerouslySetInnerHTML`), así
//      que la superficie de inyección es cero por construcción, no por
//      sanitización.
//
// QUÉ ENTRA EN EL SUBCONJUNTO, Y POR QUÉ ES CHICO
//
//   `## título` · `- viñeta` · `1. numerada` · `**negrita**` · `---` · párrafos
//
// Lo que quedó AFUERA quedó afuera por algo, no por falta de tiempo:
//   - Cursiva (`*x*` / `_x_`): un asterisco suelto aparece en texto normal
//     (multiplicaciones, notas al pie) y `_` en identificadores. El riesgo de
//     mutilar texto legítimo es mayor que lo que aporta.
//   - Links: superficie de ataque (`javascript:`) sin ningún caso de uso hoy.
//   - Tablas: no entran en un teléfono en vertical.
//   - Código: no molesta, pero no se pidió. Agregarlo después es una regla más.
//
// REGLA DE ORO: lo que no se reconoce se muestra tal cual. Nunca se pierde ni
// se rompe texto — un formato no soportado degrada a párrafo, no a error.

export type Bloque =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'separador' }
  | { tipo: 'lista'; ordenada: boolean; desde: number; items: string[] }

export interface Fragmento {
  texto: string
  negrita: boolean
}

// Los cuatro se anclan a principio de línea y toleran hasta 3 espacios de
// sangría (lo mismo que hace markdown de verdad).
//
// OJO CON EL ESPACIO OBLIGATORIO después del marcador: es lo único que evita
// que "-5 grados" se convierta en una viñeta. Por eso `[ \t]+` y no `[ \t]*`.
const RE_TITULO = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/
const RE_SEPARADOR = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/
// Dos dígitos como máximo, y no es arbitrario: sin ese tope, una línea que
// arranca con un año ("2026. Fue un buen año") se vuelve una lista numerada
// que empieza en 2026. Un tope de 99 deja pasar toda lista de chat realista
// —incluidas las que continúan en "10."— y saca del camino años y precios.
const RE_NUMERADA = /^ {0,3}(\d{1,2})[.)][ \t]+(.+)$/
// Se aceptan `-` y `*` como viñeta. `*` tiene un falso positivo conocido (una
// línea que ARRANCA con "* " siendo una multiplicación), pero el modelo lo usa
// y una línea que empieza así es una viñeta en el 99% de los casos reales.
const RE_VINETA = /^ {0,3}[-*][ \t]+(.+)$/

/**
 * Parte el texto en bloques.
 *
 * Una línea en blanco cierra lo que estuviera abierto (párrafo o lista), igual
 * que en markdown. Dos listas de distinto tipo pegadas se cierran entre sí.
 */
export function parsearMarkdown(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')

  let parrafo: string[] = []
  let lista: { ordenada: boolean; desde: number; items: string[] } | null = null

  const cerrarParrafo = () => {
    if (parrafo.length === 0) return
    const junto = parrafo.join('\n').trim()
    parrafo = []
    if (junto) bloques.push({ tipo: 'parrafo', texto: junto })
  }

  const cerrarLista = () => {
    if (!lista) return
    bloques.push({ tipo: 'lista', ...lista })
    lista = null
  }

  const cerrarTodo = () => {
    cerrarParrafo()
    cerrarLista()
  }

  for (const linea of lineas) {
    if (!linea.trim()) {
      cerrarTodo()
      continue
    }

    const titulo = RE_TITULO.exec(linea)
    if (titulo) {
      cerrarTodo()
      bloques.push({ tipo: 'titulo', texto: titulo[1] })
      continue
    }

    // Antes que las viñetas: `***` no matchea RE_VINETA (no lleva espacio),
    // pero el orden deja la intención explícita en vez de depender de eso.
    if (RE_SEPARADOR.test(linea)) {
      cerrarTodo()
      bloques.push({ tipo: 'separador' })
      continue
    }

    const numerada = RE_NUMERADA.exec(linea)
    if (numerada) {
      cerrarParrafo()
      if (!lista || !lista.ordenada) {
        cerrarLista()
        // `desde` respeta el número con el que el modelo arrancó: si enumera
        // "3. 4. 5." es porque viene de algo anterior, y renumerar desde 1
        // sería contradecir lo que dijo en voz o en el texto de arriba.
        lista = { ordenada: true, desde: Number(numerada[1]), items: [] }
      }
      lista.items.push(numerada[2])
      continue
    }

    const vineta = RE_VINETA.exec(linea)
    if (vineta) {
      cerrarParrafo()
      if (!lista || lista.ordenada) {
        cerrarLista()
        lista = { ordenada: false, desde: 1, items: [] }
      }
      lista.items.push(vineta[1])
      continue
    }

    // Una línea suelta después de una lista la cierra: sin esto, el texto que
    // sigue a la lista se leería como continuación del último ítem.
    cerrarLista()
    parrafo.push(linea)
  }

  cerrarTodo()
  return bloques
}

/**
 * Parte una línea en fragmentos de negrita y no-negrita.
 *
 * `(?=\S)` + `\S` antes del cierre exigen que haya contenido real adentro: sin
 * eso, un "** " suelto o un separador de asteriscos se comerían medio párrafo.
 * Un `**` sin pareja se queda como texto literal, que es justo lo que se
 * quiere (ver la regla de oro de la cabecera).
 */
export function partirNegritas(texto: string): Fragmento[] {
  const fragmentos: Fragmento[] = []
  const re = /\*\*(?=\S)([\s\S]*?\S)\*\*/g
  let desde = 0

  for (let m = re.exec(texto); m !== null; m = re.exec(texto)) {
    if (m.index > desde) fragmentos.push({ texto: texto.slice(desde, m.index), negrita: false })
    fragmentos.push({ texto: m[1], negrita: true })
    desde = m.index + m[0].length
  }

  if (desde < texto.length) fragmentos.push({ texto: texto.slice(desde), negrita: false })
  return fragmentos
}
