// Lógica pura (sin I/O) de los objetivos vigilados: las frecuencias válidas y
// el saneado de los args que manda Gemini en `crear_objetivo`. Vive en su
// propio módulo, compartido entre la tool (Paso 2), la Edge Function de
// revisión periódica (Paso 3) y la UI (Paso 5), para que las tres hablen del
// mismo vocabulario de frecuencias sin repetirlo tres veces.

/**
 * Set fijo de frecuencias, no un intervalo libre — tiene que calzar con el
 * check constraint de la columna `frecuencia` en la migración. Acota el peor
 * caso de gasto de Tavily (Paso 3) y simplifica el cron (Paso 4), que sólo
 * necesita mirar `proxima_revision`, no reinterpretar un intervalo por fila.
 */
export const FRECUENCIAS = ['cada_6h', 'diario', 'semanal'] as const
export type Frecuencia = (typeof FRECUENCIAS)[number]

/** Confirmado con Raúl como punto de partida conservador. */
export const FRECUENCIA_DEFAULT: Frecuencia = 'diario'

/** Cómo se lee cada frecuencia en una frase dirigida al usuario. */
export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  cada_6h: 'cada 6 horas',
  diario: 'una vez por día',
  semanal: 'una vez por semana',
}

/**
 * Largo máximo de la descripción de un objetivo.
 *
 * Mismo orden de magnitud que MAX_LARGO_HECHO (memoria.ts): es una frase que
 * describe qué vigilar ("precio de la PS5 en Argentina"), no un párrafo. Más
 * largo que eso es la charla completa disfrazada de descripción.
 */
export const MAX_LARGO_DESCRIPCION = 300

export interface ObjetivoPropuesto {
  descripcion: string
  frecuencia: Frecuencia
}

function esFrecuenciaValida(v: unknown): v is Frecuencia {
  return typeof v === 'string' && (FRECUENCIAS as readonly string[]).includes(v)
}

/**
 * Normaliza lo que Gemini mandó en `crear_objetivo`. Mismo criterio que
 * `normalizarArgsHecho`/`normalizarArgsPizarra`: la declaración de la tool no
 * garantiza nada sobre lo que llega. Una frecuencia inválida o ausente se
 * DEGRADA al default en vez de rechazar el objetivo entero por un detalle que
 * no es el que importa — sólo la descripción es indispensable.
 *
 * Devuelve null únicamente si no hay descripción aprovechable: sin eso no hay
 * nada que vigilar.
 */
export function normalizarArgsObjetivo(args: Record<string, unknown>): ObjetivoPropuesto | null {
  const descripcion = typeof args.descripcion === 'string' ? args.descripcion.trim() : ''
  if (!descripcion || descripcion.length > MAX_LARGO_DESCRIPCION) return null

  const frecuencia = esFrecuenciaValida(args.frecuencia) ? args.frecuencia : FRECUENCIA_DEFAULT

  return { descripcion, frecuencia }
}
