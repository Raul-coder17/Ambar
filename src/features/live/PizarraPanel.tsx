// La pizarra: las tarjetas que Ámbar escribe en pantalla durante una charla
// hablada, con navegación entre ellas.
//
// Ocupa el bloque central de `LiveScreen` (opción A del diseño): es lo que el
// usuario mira mientras habla, así que se lleva el espacio, y el indicador de
// estado de la sesión se reduce al header. El resto de la pantalla —leyenda,
// botones, transcripción— no cambió de lugar.
//
// El contenido se renderiza con el `<Markdown>` del Paso 1, que es exactamente
// para lo que se construyó primero y por separado: acá el texto viene como
// argumento de una function call, o sea generado por un modelo, y ese renderer
// emite elementos React y nunca strings de HTML. La superficie de inyección es
// cero por construcción, no por sanitización.
//
// NO tiene estado propio de datos: las tarjetas viven en `ConversacionContext`
// para sobrevivir al desmontaje de LiveScreen en un fallback a texto. Acá sólo
// vive cuál se está mirando.

import { useEffect, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import type { Pizarra } from '../chat/ConversacionContext'

export function PizarraPanel({ pizarras }: { pizarras: Pizarra[] }) {
  const [indice, setIndice] = useState(pizarras.length - 1)

  // Cuando llega una tarjeta nueva, saltar a ella. Es lo que el usuario espera
  // (Ámbar acaba de decir "te lo dejé en pantalla") y además evita el bug de
  // quedarse en un índice que sigue siendo válido pero ya no es el actual.
  //
  // La dependencia es `length` y no el array: `agregarPizarra` devuelve el
  // MISMO array cuando la tarjeta está duplicada (ver su dedupe), así que una
  // reemisión por reconexión no mueve al usuario de donde estaba mirando.
  useEffect(() => {
    setIndice(pizarras.length - 1)
  }, [pizarras.length])

  // Defensa por si el índice quedó fuera de rango: preferible mostrar la última
  // que romper la pantalla entera en medio de una llamada.
  const actual = pizarras[indice] ?? pizarras[pizarras.length - 1]
  if (!actual) return null

  const hayVarias = pizarras.length > 1

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-card border border-border-soft bg-surface">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-soft px-3.5 py-2.5">
        <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
          {actual.titulo ?? 'En pantalla'}
        </p>

        {hayVarias && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              onClick={() => setIndice((i) => i - 1)}
              disabled={indice <= 0}
              aria-label="Tarjeta anterior"
              className="rounded-input border border-border-soft px-2 py-0.5 text-sm text-ink-soft hover:border-amber disabled:opacity-40"
            >
              ‹
            </button>
            {/* `tabular-nums` para que el contador no cambie de ancho al pasar
                de 9 a 10 y empuje los botones de al lado. */}
            <span className="text-[10.5px] tabular-nums text-ink-muted">
              {indice + 1}/{pizarras.length}
            </span>
            <button
              onClick={() => setIndice((i) => i + 1)}
              disabled={indice >= pizarras.length - 1}
              aria-label="Tarjeta siguiente"
              className="rounded-input border border-border-soft px-2 py-0.5 text-sm text-ink-soft hover:border-amber disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* El scroll vive acá adentro y no en la pantalla: la tarjeta puede ser
          larga (hasta 1500 caracteres) y el resto de LiveScreen —botones,
          transcripción— tiene que quedarse quieto donde el usuario lo dejó
          mientras habla. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 text-sm leading-relaxed text-ink">
        <Markdown texto={actual.contenido} />
      </div>
    </div>
  )
}
