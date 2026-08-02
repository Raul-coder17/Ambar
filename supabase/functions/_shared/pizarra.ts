// Lógica pura (sin I/O) de la pizarra visual: el saneado de los args que manda
// Gemini en `mostrar_en_pantalla`.
//
// Vive en su propio módulo por lo mismo que `memoria.ts` está separado de
// `recuerdos.ts`: es la parte que se puede razonar y EJECUTAR contra casos de
// prueba sin red, sin Deno.serve y sin una sesión de voz abierta — que es el
// flujo más caro de probar de todo el proyecto. Mismo criterio, del otro lado
// del cliente, que separó `src/lib/markdown.ts` (parser puro) de
// `src/components/Markdown.tsx` en el Paso 1.

/**
 * Tope de contenido de una tarjeta, en caracteres.
 *
 * SIN CALIBRAR contra uso real, igual que UMBRAL_SIMILITUD y
 * MIN_LARGO_INTERCAMBIO. 1500 es el punto de partida acordado: entra una receta
 * completa con ingredientes y pasos, y no entra un ensayo que obligue a
 * scrollear una pantalla de teléfono varias veces mientras se está hablando.
 *
 * Se declara en DOS lugares a propósito y no es duplicación por descuido: acá
 * como saneado duro, y en la description de la tool como guía para el modelo.
 * La description sola no garantiza nada (el modelo puede mandar cualquier cosa,
 * igual que con el enum de `categoria` en recordar_hecho); el saneado solo
 * haría que el modelo se entere del límite recién cuando ya lo pasó.
 */
export const MAX_LARGO_PIZARRA = 1500

/**
 * Tope del título. Es un encabezado de tarjeta, no una oración: si no entra
 * acá, el modelo está usando el título para decir algo que va en el contenido.
 */
export const MAX_LARGO_TITULO = 80

/**
 * Fracción mínima del tope que un corte "lindo" (por línea o por palabra) tiene
 * que conservar para que valga la pena usarlo en vez de cortar en seco.
 *
 * Sin esto, un contenido de 1500 caracteres cuyo único salto de línea está en
 * el carácter 50 se recortaría a esos 50 caracteres: el corte quedaría
 * prolijo y la tarjeta, vacía. Con el piso, ese caso cae al corte duro, que
 * pierde una palabra por la mitad pero conserva el contenido.
 */
const PISO_CORTE_LINDO = 0.6

export interface PizarraPropuesta {
  titulo: string | null
  contenido: string
  /** Si hubo que recortar. El handler se lo dice al modelo en la nota. */
  truncado: boolean
}

/**
 * Recorta `texto` a `max` caracteres tratando de no partir una palabra.
 *
 * Prefiere cortar en un salto de línea (deja la tarjeta terminando en una
 * viñeta o un paso completo, que es lo que se ve mejor), después en un espacio,
 * y sólo si ninguno de los dos conserva lo suficiente, corta en seco.
 */
function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto

  const piso = Math.floor(max * PISO_CORTE_LINDO)
  // `max` y no `max - 1`: un salto de línea justo en la posición `max` es un
  // corte perfecto, deja exactamente `max` caracteres de contenido.
  const porLinea = texto.lastIndexOf('\n', max)
  if (porLinea >= piso) return texto.slice(0, porLinea).trimEnd()

  const porPalabra = texto.lastIndexOf(' ', max)
  if (porPalabra >= piso) return texto.slice(0, porPalabra).trimEnd()

  return texto.slice(0, max).trimEnd()
}

/**
 * Normaliza lo que Gemini mandó en la function call de `mostrar_en_pantalla`.
 *
 * Mismo criterio que `normalizarArgsHecho`: la declaración de la tool no
 * garantiza nada sobre lo que llega, y lo que no se puede usar se DEGRADA en
 * vez de romper la tarjeta entera. Por eso el contenido largo se recorta y no
 * se rechaza — una receta cortada al final sigue sirviendo, una pantalla vacía
 * no. El título largo se recorta por lo mismo.
 *
 * Devuelve null en el único caso donde no hay nada que mostrar: contenido
 * vacío. Ahí sí no hay degradación posible.
 *
 * NO valida ni escapa el markdown del contenido. No hace falta y no sería el
 * lugar: el renderer del Paso 1 emite elementos React y nunca strings de HTML,
 * así que la superficie de inyección es cero POR CONSTRUCCIÓN, y lo que no
 * reconoce lo muestra tal cual en vez de romperlo (ver la cabecera de
 * `src/lib/markdown.ts`). Sanear acá sería mutilar texto legítimo para tapar un
 * agujero que no existe.
 */
export function normalizarArgsPizarra(args: Record<string, unknown>): PizarraPropuesta | null {
  const crudo = typeof args.contenido === 'string' ? args.contenido.trim() : ''
  if (!crudo) return null

  const tituloCrudo = typeof args.titulo === 'string' ? args.titulo.trim() : ''

  return {
    titulo: tituloCrudo ? recortar(tituloCrudo, MAX_LARGO_TITULO) : null,
    contenido: recortar(crudo, MAX_LARGO_PIZARRA),
    truncado: crudo.length > MAX_LARGO_PIZARRA,
  }
}
