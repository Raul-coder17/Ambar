// Validación de zona horaria IANA, compartida entre `prompt.ts` (fechaActual)
// y `memoria.ts` (tiempoRelativo). Módulo propio, sin lógica propia de
// ninguno de los dos, para que no se importen entre sí: `prompt.ts` ya
// importa `CATEGORIA_ESTILO` de `memoria.ts`, así que si `memoria.ts`
// necesitara algo de `prompt.ts` se armaría un ciclo.

/**
 * Zona de respaldo cuando `ajustes_ia.zona_horaria` falta o es inválida (fila
 * vieja sin backfill del capturador del cliente, dato corrupto, etc.). Único
 * usuario real hoy — ver la migración `20260805000000_zona_horaria.sql` para
 * el razonamiento completo de por qué es una columna por fila y no esto; esto
 * es sólo el piso de seguridad.
 */
export const ZONA_HORARIA_DEFAULT = 'America/Mexico_City'

/**
 * Valida un identificador IANA de zona horaria. `Intl.DateTimeFormat` tira
 * `RangeError` de inmediato (sin esperar a formatear nada) si la zona no
 * existe — es la única forma de validar un IANA sin mantener la lista a
 * mano. Devuelve el default ante cualquier valor vacío, no-string o inválido.
 */
export function zonaValida(zonaHoraria: string | null | undefined): string {
  if (typeof zonaHoraria !== 'string' || !zonaHoraria.trim()) return ZONA_HORARIA_DEFAULT
  try {
    new Intl.DateTimeFormat('es-AR', { timeZone: zonaHoraria })
    return zonaHoraria
  } catch {
    return ZONA_HORARIA_DEFAULT
  }
}
