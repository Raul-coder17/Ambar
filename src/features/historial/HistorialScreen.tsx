import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Markdown } from '../../components/Markdown'

const LIMITE = 50
const SEPARADOR = '\nÁmbar: '

interface Intercambio {
  id: number
  created_at: string
  usuario: string
  ambar: string
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

export function HistorialScreen() {
  const { session } = useAuth()
  const [filas, setFilas] = useState<{ id: number; created_at: string; contenido: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
      <p className="font-display text-base font-semibold text-ink">Historial</p>
      <p className="mt-1 mb-4 text-xs text-ink-muted">
        Charlas pasadas, de texto y de voz. Solo lo que ya se guardó — no se actualiza mientras hablás.
      </p>

      {loading ? (
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
      )}
    </div>
  )
}
