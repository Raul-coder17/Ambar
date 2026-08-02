// Historial: lo que quedó guardado de charlas pasadas.
//
// Desde el Paso 2c está segmentado en dos secciones que salen de tablas
// distintas y no se pueden mezclar en una sola lista:
//
//   Charlas  -> memoria_vectorial. Un intercambio por fila, de texto o de voz
//               (la tabla no guarda el origen — limitación conocida de Fase 7).
//   Pizarras -> pizarras. Las tarjetas que Ámbar escribió en pantalla durante
//               una conversación de voz. NO son un intercambio: no tienen un
//               lado "usuario", el contenido es markdown pensado para leerse, y
//               una misma charla puede tener varias o ninguna.
//
// Se cargan por separado y a demanda: la de pizarras recién consulta la tabla
// la primera vez que se abre esa pestaña. No hay motivo para pagar una query
// que la mayoría de las visitas no va a mirar.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Markdown } from '../../components/Markdown'
import { IconTrash } from '../../lib/icons'

const LIMITE = 50
const SEPARADOR = '\nÁmbar: '

type Seccion = 'charlas' | 'pizarras'

interface Intercambio {
  id: number
  created_at: string
  usuario: string
  ambar: string
}

interface FilaPizarra {
  id: number
  created_at: string
  titulo: string | null
  contenido: string
}

// Cada fila de memoria_vectorial guarda el intercambio completo con el
// formato fijo `Usuario: X\nÁmbar: Y` (textoDelIntercambio en
// _shared/memoria.ts). Si algún día cambia ese formato, o una fila vieja no
// lo respeta, devolvemos null y la mostramos como texto plano en vez de
// romper la pantalla.
function parsear(id: number, created_at: string, contenido: string): Intercambio | null {
  const idx = contenido.indexOf(SEPARADOR)
  if (idx === -1) return null
  return {
    id,
    created_at,
    usuario: contenido.slice(0, idx).replace(/^Usuario: /, ''),
    ambar: contenido.slice(idx + SEPARADOR.length),
  }
}

const formatoFecha = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// Igual que MemoriaScreen: esto pega directo contra las tablas (no una Edge
// Function), así que el `error.message` de PostgREST ya es legible tal cual y
// no hace falta el helper de `error.context` que sí necesitan Chat y Ajustes.

export function HistorialScreen() {
  const { session } = useAuth()
  const [seccion, setSeccion] = useState<Seccion>('charlas')

  const [filas, setFilas] = useState<{ id: number; created_at: string; contenido: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pizarras, setPizarras] = useState<FilaPizarra[]>([])
  // `null` = todavía no se pidió. Distinto de `[]`, que es "no hay ninguna":
  // sin esta distinción, entrar a la pestaña vacía volvería a consultar cada
  // vez que se alterna el toggle.
  const [pizarrasCargadas, setPizarrasCargadas] = useState(false)
  const [loadingPizarras, setLoadingPizarras] = useState(false)
  const [errorPizarras, setErrorPizarras] = useState<string | null>(null)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('memoria_vectorial')
      .select('id, contenido, created_at')
      .eq('user_id', session!.user.id)
      .order('created_at', { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          setFilas(data ?? [])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (seccion !== 'pizarras' || pizarrasCargadas) return
    let cancelled = false
    setLoadingPizarras(true)

    supabase
      .from('pizarras')
      .select('id, titulo, contenido, created_at')
      .eq('user_id', session!.user.id)
      .order('created_at', { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setErrorPizarras(error.message)
        } else {
          setPizarras(data ?? [])
          setPizarrasCargadas(true)
        }
        setLoadingPizarras(false)
      })

    return () => {
      cancelled = true
    }
  }, [seccion, pizarrasCargadas, session])

  /**
   * El borrado de pizarras es la ÚNICA excepción a que Historial sea de sólo
   * lectura, y fue una decisión explícita: una tarjeta es contenido que el
   * usuario acumula, no un registro de lo que pasó, así que tiene que poder
   * limpiarlas.
   *
   * A diferencia de MemoriaScreen —donde el tacho borra de una— acá hay un
   * paso de confirmación. No es inconsistencia por descuido: un hecho borrado
   * se puede volver a contar y Ámbar lo reaprende; una tarjeta es irrepetible
   * (habría que rehacer la conversación que la generó, y el modelo escribiría
   * otra cosa). Con un tacho chico en una pantalla que se scrollea con el
   * pulgar, un toque de más no debería ser definitivo.
   */
  async function borrarPizarra(id: number) {
    setBorrandoId(id)
    setErrorPizarras(null)

    const { error } = await supabase.from('pizarras').delete().eq('id', id)

    setBorrandoId(null)
    setConfirmandoId(null)

    if (error) {
      setErrorPizarras(error.message)
      return
    }
    setPizarras((previas) => previas.filter((p) => p.id !== id))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
      <p className="font-display text-base font-semibold text-ink">Historial</p>
      <p className="mt-1 mb-3 text-xs text-ink-muted">
        {seccion === 'charlas'
          ? 'Charlas pasadas, de texto y de voz. Solo lo que ya se guardó — no se actualiza mientras hablás.'
          : 'Lo que Ámbar dejó escrito en pantalla durante charlas de voz.'}
      </p>

      {/* Segmentado. Dos botones y no un <select>: son sólo dos opciones y las
          dos tienen que estar a la vista para que se entienda que existen. */}
      <div className="mb-4 flex gap-1 rounded-input border border-border-soft bg-surface p-1">
        {(
          [
            ['charlas', 'Charlas'],
            ['pizarras', 'Pizarras'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setSeccion(valor)}
            aria-pressed={seccion === valor}
            className={`flex-1 rounded-[7px] py-1.5 text-xs transition-colors ${
              seccion === valor ? 'bg-amber font-medium text-ink-inverse' : 'text-ink-muted hover:text-ink-soft'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {seccion === 'charlas' ? (
        loading ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay charlas guardadas.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filas.map((f) => {
              const intercambio = parsear(f.id, f.created_at, f.contenido)
              return (
                <div key={f.id} className="rounded-card border border-border-soft bg-surface p-3.5">
                  <p className="mb-2 text-[10.5px] text-ink-muted">{formatoFecha.format(new Date(f.created_at))}</p>
                  {intercambio ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-bubble rounded-br-[5px] bg-clay px-3 py-1.5 text-sm font-medium text-ink-inverse">
                          {intercambio.usuario}
                        </div>
                      </div>
                      <div className="flex justify-start">
                        {/* Mismo criterio que ChatScreen: markdown sólo del
                            lado de Ámbar. Esta tabla mezcla texto y voz sin
                            columna que los distinga (limitación conocida), pero
                            no hace falta: una transcripción hablada no trae
                            markdown y se renderiza igual que antes. */}
                        <div className="max-w-[85%] rounded-bubble rounded-bl-[5px] bg-surface-raised px-3 py-1.5 text-sm text-ink">
                          <Markdown texto={intercambio.ambar} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-line text-ink">{f.contenido}</p>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : loadingPizarras ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : errorPizarras && pizarras.length === 0 ? (
        <p className="text-sm text-red-400">{errorPizarras}</p>
      ) : pizarras.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no hay pizarras. Aparecen cuando Ámbar te escribe algo en pantalla hablando.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Un error que aparece DESPUÉS de haber cargado (p.ej. falló un
              borrado) va arriba de la lista, no en lugar de ella. */}
          {errorPizarras && <p className="text-sm text-red-400">{errorPizarras}</p>}

          {pizarras.map((p) => (
            <div key={p.id} className="rounded-card border border-border-soft bg-surface p-3.5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] text-ink-muted">{formatoFecha.format(new Date(p.created_at))}</p>
                  {p.titulo && <p className="mt-0.5 font-display text-sm font-semibold text-ink">{p.titulo}</p>}
                </div>

                {confirmandoId === p.id ? (
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmandoId(null)}
                      disabled={borrandoId === p.id}
                      className="text-xs text-ink-muted hover:text-ink-soft disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void borrarPizarra(p.id)}
                      disabled={borrandoId === p.id}
                      className="rounded-input bg-red-500/90 px-2.5 py-1 text-xs font-medium text-ink-inverse disabled:opacity-50"
                    >
                      {borrandoId === p.id ? 'Borrando…' : 'Borrar'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmandoId(p.id)}
                    aria-label="Borrar pizarra"
                    className="flex-shrink-0 p-1 text-ink-muted hover:text-red-400"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* El mismo renderer del Paso 1 que usa la pizarra en vivo: una
                  tarjeta se tiene que ver igual acá que cuando apareció en
                  pantalla. */}
              <div className="text-sm leading-relaxed text-ink">
                <Markdown texto={p.contenido} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
