// Objetivos vigilados (Fase 5). Reemplaza el placeholder de la Fase 7.
//
// Igual que MemoriaScreen/HistorialScreen: pega directo contra las tablas
// (no una Edge Function), así que `error.message` de PostgREST ya es legible
// tal cual -- incluido el P0001 del trigger de tope de activos (Paso 1), que
// ya viene redactado en español para mostrarse sin traducir.
//
// El "Crear" de acá hace el MISMO insert que la tool `crear_objetivo`
// (_shared/tools.ts): mismo shape, mismos defaults de la migración
// (estado='activo', proxima_revision=now()) -- los dos caminos escriben la
// misma fila, sin lógica de negocio duplicada.

import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { IconTrash } from '../../lib/icons'

type Frecuencia = 'cada_6h' | 'diario' | 'semanal'
type Estado = 'activo' | 'pausado'

const OPCIONES_FRECUENCIA: { valor: Frecuencia; etiqueta: string }[] = [
  { valor: 'cada_6h', etiqueta: 'Cada 6 horas' },
  { valor: 'diario', etiqueta: 'Diario' },
  { valor: 'semanal', etiqueta: 'Semanal' },
]

// Mismo valor que MAX_LARGO_DESCRIPCION en supabase/functions/_shared/objetivos.ts
// -- duplicado a propósito, no importado: cliente (Vite) y Edge Functions
// (Deno) son dos proyectos de TypeScript distintos, mismo criterio que
// MAX_LARGO_HECHO en MemoriaScreen.
const MAX_LARGO_DESCRIPCION = 300
const TOPE_ACTIVOS = 5

interface Objetivo {
  id: number
  descripcion: string
  frecuencia: Frecuencia
  estado: Estado
  resumen_actual: string | null
  ultima_revision: string | null
}

interface Revision {
  id: number
  ocurrida_en: string
  hubo_novedad: boolean
  valor_extraido: string | null
}

const formatoFecha = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function etiquetaFrecuencia(f: Frecuencia): string {
  return OPCIONES_FRECUENCIA.find((o) => o.valor === f)?.etiqueta ?? f
}

export function ObjetivosScreen() {
  const { session } = useAuth()
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creando, setCreando] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('diario')
  const [creandoError, setCreandoError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [cambiandoId, setCambiandoId] = useState<number | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)

  const [abiertoId, setAbiertoId] = useState<number | null>(null)
  const [revisiones, setRevisiones] = useState<Record<number, Revision[]>>({})
  const [cargandoRevisionesId, setCargandoRevisionesId] = useState<number | null>(null)
  const [errorRevisiones, setErrorRevisiones] = useState<Record<number, string>>({})

  // Carga inicial, mismo patrón que MemoriaScreen/HistorialScreen.
  useEffect(() => {
    let cancelled = false

    supabase
      .from('objetivos')
      .select('id, descripcion, frecuencia, estado, resumen_actual, ultima_revision')
      .eq('user_id', session!.user.id)
      .order('creado_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError(error.message)
        } else {
          setObjetivos((data ?? []) as Objetivo[])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  const activos = objetivos.filter((o) => o.estado === 'activo').length

  async function handleCrear(e: FormEvent) {
    e.preventDefault()
    const texto = descripcion.trim()
    if (!texto || guardando) return
    if (texto.length > MAX_LARGO_DESCRIPCION) {
      setCreandoError(`Máximo ${MAX_LARGO_DESCRIPCION} caracteres.`)
      return
    }

    setGuardando(true)
    setCreandoError(null)

    const { data, error } = await supabase
      .from('objetivos')
      .insert({ user_id: session!.user.id, descripcion: texto, frecuencia })
      .select('id, descripcion, frecuencia, estado, resumen_actual, ultima_revision')
      .single()

    setGuardando(false)

    if (error) {
      // P0001 = trigger objetivos_tope_activos_insert (Paso 1): ya viene en
      // español, listo para mostrar tal cual.
      setCreandoError(error.message)
      return
    }

    setObjetivos((previos) => [data as Objetivo, ...previos])
    setDescripcion('')
    setFrecuencia('diario')
    setCreando(false)
  }

  async function alternarEstado(o: Objetivo) {
    setCambiandoId(o.id)
    setActionError(null)
    const nuevoEstado: Estado = o.estado === 'activo' ? 'pausado' : 'activo'

    const { error } = await supabase.from('objetivos').update({ estado: nuevoEstado }).eq('id', o.id)

    setCambiandoId(null)

    if (error) {
      // Mismo P0001 si se intenta reactivar estando ya en el tope.
      setActionError(error.message)
      return
    }
    setObjetivos((previos) => previos.map((x) => (x.id === o.id ? { ...x, estado: nuevoEstado } : x)))
  }

  async function borrar(id: number) {
    setBorrandoId(id)
    setActionError(null)

    const { error } = await supabase.from('objetivos').delete().eq('id', id)

    setBorrandoId(null)
    setConfirmandoId(null)

    if (error) {
      setActionError(error.message)
      return
    }
    setObjetivos((previos) => previos.filter((o) => o.id !== id))
    if (abiertoId === id) setAbiertoId(null)
  }

  function alternarHistorial(id: number) {
    if (abiertoId === id) {
      setAbiertoId(null)
      return
    }
    setAbiertoId(id)
    if (revisiones[id]) return // ya cargado, no repetir la consulta

    setCargandoRevisionesId(id)
    setErrorRevisiones((previos) => {
      const { [id]: _omit, ...resto } = previos
      return resto
    })

    supabase
      .from('objetivos_revisiones')
      .select('id, ocurrida_en, hubo_novedad, valor_extraido')
      .eq('objetivo_id', id)
      .order('ocurrida_en', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        setCargandoRevisionesId(null)
        if (error) {
          setErrorRevisiones((previos) => ({ ...previos, [id]: error.message }))
          return
        }
        setRevisiones((previas) => ({ ...previas, [id]: (data ?? []) as Revision[] }))
      })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-ink">Objetivos</p>
          <p className="mt-1 text-xs text-ink-muted">
            Pedile a Ámbar que vigile algo hablando o escribiendo, o creá uno acá. Te avisa por
            notificación solo cuando encuentra una novedad real.
          </p>
          {!loading && objetivos.length > 0 && (
            <p className="mt-1 text-[10.5px] text-ink-muted">
              {activos}/{TOPE_ACTIVOS} activos
            </p>
          )}
        </div>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="flex-shrink-0 rounded-pill bg-amber px-3 py-1.5 text-xs font-medium text-ink-inverse"
          >
            + Nuevo
          </button>
        )}
      </div>

      {creando && (
        <form
          onSubmit={handleCrear}
          className="mb-4 flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4"
        >
          <label htmlFor="obj-descripcion" className="text-sm text-ink-soft">
            Qué vigilar
          </label>
          <textarea
            id="obj-descripcion"
            autoFocus
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={MAX_LARGO_DESCRIPCION}
            rows={2}
            placeholder='Ej. "precio de la PS5 en Argentina"'
            className="resize-none rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
          />

          <label htmlFor="obj-frecuencia" className="text-sm text-ink-soft">
            Frecuencia
          </label>
          <select
            id="obj-frecuencia"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
            className="rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus:border-amber"
          >
            {OPCIONES_FRECUENCIA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>

          {creandoError && <p className="text-sm text-red-400">{creandoError}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando || !descripcion.trim()}
              className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
            >
              {guardando ? 'Creando…' : 'Crear objetivo'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreando(false)
                setCreandoError(null)
                setDescripcion('')
              }}
              disabled={guardando}
              className="rounded-input border border-border-soft px-4 py-2 text-sm text-ink-soft disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {actionError && <p className="mb-3 text-sm text-red-400">{actionError}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400">{loadError}</p>
      ) : objetivos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="ambar-ember h-11 w-11" />
          <p className="font-display text-base font-semibold text-ink">Todavía no vigilás nada</p>
          <p className="max-w-56 text-xs text-ink-muted">
            Pedile a Ámbar que vigile algo, como un precio o una noticia, o creá tu primer objetivo
            con "+ Nuevo".
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {objetivos.map((o) => {
            const activo = o.estado === 'activo'
            const abierto = abiertoId === o.id
            return (
              <div key={o.id} className="rounded-card border border-border-soft bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10.5px] ${
                          activo ? 'bg-sage/15 text-sage' : 'bg-surface-raised text-ink-muted'
                        }`}
                      >
                        {activo ? 'Activo' : 'Pausado'}
                      </span>
                      <span className="rounded-lg bg-surface-raised px-2 py-0.5 text-[10.5px] text-ink-muted">
                        {etiquetaFrecuencia(o.frecuencia)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-ink">{o.descripcion}</p>
                    <p className="mt-1 text-xs text-ink-muted">{o.resumen_actual ?? 'Todavía sin revisar.'}</p>
                    {o.ultima_revision && (
                      <p className="mt-1 text-[10.5px] text-ink-muted">
                        Última revisión: {formatoFecha.format(new Date(o.ultima_revision))}
                      </p>
                    )}
                  </div>

                  {confirmandoId === o.id ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmandoId(null)}
                        disabled={borrandoId === o.id}
                        className="text-xs text-ink-muted hover:text-ink-soft disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void borrar(o.id)}
                        disabled={borrandoId === o.id}
                        className="rounded-input bg-red-500/90 px-2.5 py-1 text-xs font-medium text-ink-inverse disabled:opacity-50"
                      >
                        {borrandoId === o.id ? 'Borrando…' : 'Borrar'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmandoId(o.id)}
                      aria-label="Borrar objetivo"
                      className="flex-shrink-0 p-1 text-ink-muted hover:text-red-400"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-border-soft pt-2.5">
                  <button
                    type="button"
                    onClick={() => void alternarEstado(o)}
                    disabled={cambiandoId === o.id}
                    className="rounded-input border border-border-soft px-2.5 py-1 text-xs text-ink-soft hover:border-amber disabled:opacity-50"
                  >
                    {cambiandoId === o.id ? 'Un momento…' : activo ? 'Pausar' : 'Reactivar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarHistorial(o.id)}
                    className="rounded-input border border-border-soft px-2.5 py-1 text-xs text-ink-soft hover:border-amber"
                  >
                    {abierto ? 'Ocultar historial' : 'Ver historial'}
                  </button>
                </div>

                {abierto && (
                  <div className="mt-2.5 flex flex-col gap-2 border-t border-border-soft pt-2.5">
                    {cargandoRevisionesId === o.id ? (
                      <p className="text-xs text-ink-muted">Cargando…</p>
                    ) : errorRevisiones[o.id] ? (
                      <p className="text-xs text-red-400">{errorRevisiones[o.id]}</p>
                    ) : (revisiones[o.id]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-ink-muted">Todavía no hay revisiones.</p>
                    ) : (
                      revisiones[o.id]!.map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
                          <span className="flex-shrink-0 text-ink-muted">
                            {formatoFecha.format(new Date(r.ocurrida_en))}
                          </span>
                          <span className={`text-right ${r.hubo_novedad ? 'text-amber-soft' : 'text-ink-muted'}`}>
                            {r.hubo_novedad ? 'Novedad — ' : ''}
                            {r.valor_extraido ?? '—'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
