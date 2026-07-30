import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { IconTrash } from '../../lib/icons'

const MAX_LARGO_HECHO = 300

interface Hecho {
  id: number
  hecho: string
  categoria: string | null
}

// A diferencia de Chat/Ajustes, esto pega directo contra la tabla (no una
// Edge Function) — el `error.message` de un error de PostgREST ya es legible
// tal cual, sin el problema de "non-2xx status code" que sí tiene
// `functions.invoke` (por eso esas pantallas necesitan su propio helper para
// leer `error.context` y esta no).

export function MemoriaScreen() {
  const { session } = useAuth()
  const [hechos, setHechos] = useState<Hecho[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('memoria_hechos')
      .select('id, hecho, categoria')
      .eq('user_id', session!.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError(error.message)
        } else {
          setHechos(data ?? [])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  const empezarEdicion = useCallback((h: Hecho) => {
    setEditingId(h.id)
    setEditText(h.hecho)
    setEditError(null)
  }, [])

  const cancelarEdicion = useCallback(() => {
    setEditingId(null)
    setEditError(null)
  }, [])

  async function guardarEdicion(id: number) {
    const texto = editText.trim()
    if (!texto) {
      setEditError('No puede quedar vacío.')
      return
    }
    if (texto.length > MAX_LARGO_HECHO) {
      setEditError(`Máximo ${MAX_LARGO_HECHO} caracteres.`)
      return
    }

    setSavingId(id)
    setEditError(null)

    const { error } = await supabase.from('memoria_hechos').update({ hecho: texto }).eq('id', id)

    setSavingId(null)

    if (error) {
      setEditError(error.code === '23505' ? 'Ya tenés un hecho igual guardado.' : error.message)
      return
    }

    setHechos((previos) => previos.map((h) => (h.id === id ? { ...h, hecho: texto } : h)))
    setEditingId(null)
  }

  async function borrar(id: number) {
    setDeletingId(id)
    setActionError(null)

    const { error } = await supabase.from('memoria_hechos').delete().eq('id', id)

    setDeletingId(null)

    if (error) {
      setActionError(error.message)
      return
    }

    setHechos((previos) => previos.filter((h) => h.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
      <p className="font-display text-base font-semibold text-ink">Lo que recuerdo de ti</p>
      <p className="mt-1 mb-4 text-xs text-ink-muted">Podés corregir o borrar cualquier dato.</p>

      {actionError && <p className="mb-3 text-sm text-red-400">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400">{loadError}</p>
      ) : hechos.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no recuerdo nada de vos.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {hechos.map((h) => {
            const enEdicion = editingId === h.id
            return (
              <div key={h.id} className="rounded-card border border-border-soft bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="min-w-0 flex-1"
                    onClick={() => !enEdicion && empezarEdicion(h)}
                  >
                    {h.categoria && (
                      <span className="mb-1 inline-block rounded-lg bg-sage/15 px-2 py-0.5 text-[10.5px] text-sage">
                        {h.categoria}
                      </span>
                    )}
                    {enEdicion ? (
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={MAX_LARGO_HECHO}
                        rows={2}
                        className="w-full resize-none rounded-input border border-border-soft bg-surface-raised px-2.5 py-1.5 text-[16px] leading-5 text-ink outline-none focus:border-amber"
                      />
                    ) : (
                      <p className="cursor-pointer text-sm text-ink">{h.hecho}</p>
                    )}
                  </div>

                  {enEdicion ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelarEdicion}
                        disabled={savingId === h.id}
                        className="text-xs text-ink-muted hover:text-ink-soft disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void guardarEdicion(h.id)}
                        disabled={savingId === h.id}
                        className="rounded-input bg-amber px-2.5 py-1 text-xs font-medium text-ink-inverse disabled:opacity-50"
                      >
                        {savingId === h.id ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void borrar(h.id)
                      }}
                      disabled={deletingId === h.id}
                      aria-label="Olvidar"
                      className="flex-shrink-0 p-1 text-ink-muted hover:text-red-400 disabled:opacity-50"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {enEdicion && editError && <p className="mt-2 text-xs text-red-400">{editError}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
