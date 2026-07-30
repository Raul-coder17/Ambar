import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'

// supabase-js descarta el body de una respuesta no-2xx en error.message (deja
// solo "non-2xx status code"). El mensaje real, ya traducido al español, vive
// en el body de la función — lo leemos de error.context (la Response cruda).
async function mensajeDeError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | undefined)?.context
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = await ctx.clone().json()
      if (typeof body?.error === 'string') return body.error
    } catch {
      /* sin body JSON legible: usamos el mensaje genérico */
    }
  }
  return fallback
}

export function SettingsScreen() {
  const { session } = useAuth()
  const [iaHabilitada, setIaHabilitada] = useState(false)
  const [tavilyConfigurada, setTavilyConfigurada] = useState(false)
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingTavily, setSavingTavily] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [tavilyError, setTavilyError] = useState<string | null>(null)
  const [tavilyInfo, setTavilyInfo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('ajustes_ia')
        .select('ia_habilitada, tavily_api_key_encrypted')
        .eq('user_id', session!.user.id)
        .maybeSingle()

      if (!cancelled) {
        setIaHabilitada(Boolean(data?.ia_habilitada))
        setTavilyConfigurada(Boolean(data?.tavily_api_key_encrypted))
        setLoadingEstado(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!apiKey.trim() || saving) return

    setSaving(true)
    setError(null)
    setInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'save', apiKey: apiKey.trim(), provider: 'gemini' },
    })

    setSaving(false)

    if (error) {
      setError(await mensajeDeError(error, 'No se pudo validar/guardar la key.'))
      return
    }

    setIaHabilitada(Boolean(data?.ia_habilitada))
    setApiKey('')
    setInfo('Clave guardada y activada correctamente.')
  }

  async function handleRemove() {
    if (saving) return
    setSaving(true)
    setError(null)
    setInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'remove', provider: 'gemini' },
    })

    setSaving(false)

    if (error) {
      setError(await mensajeDeError(error, 'No se pudo desactivar la IA.'))
      return
    }

    setIaHabilitada(Boolean(data?.ia_habilitada))
    setInfo('IA desactivada.')
  }

  async function handleSaveTavily(e: FormEvent) {
    e.preventDefault()
    if (!tavilyKey.trim() || savingTavily) return

    setSavingTavily(true)
    setTavilyError(null)
    setTavilyInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'save', apiKey: tavilyKey.trim(), provider: 'tavily' },
    })

    setSavingTavily(false)

    if (error) {
      setTavilyError(await mensajeDeError(error, 'No se pudo guardar la key de Tavily.'))
      return
    }

    setTavilyConfigurada(Boolean(data?.tavily_habilitada))
    setTavilyKey('')
    setTavilyInfo('Clave de Tavily guardada correctamente.')
  }

  async function handleRemoveTavily() {
    if (savingTavily) return
    setSavingTavily(true)
    setTavilyError(null)
    setTavilyInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'remove', provider: 'tavily' },
    })

    setSavingTavily(false)

    if (error) {
      setTavilyError(await mensajeDeError(error, 'No se pudo quitar la key de Tavily.'))
      return
    }

    setTavilyConfigurada(Boolean(data?.tavily_habilitada))
    setTavilyInfo('Clave de Tavily quitada.')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
      <div>
        <h1 className="font-display text-lg font-semibold text-ink">Ajustes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Guardá tu propia API key de Gemini. Se cifra antes de guardarse — nunca queda en texto plano.
        </p>
      </div>

      <div className="rounded-card border border-border-soft bg-surface p-4">
        <p className="text-sm text-ink">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-ink-muted">cargando…</span>
          ) : iaHabilitada ? (
            <span className="text-sage">activada</span>
          ) : (
            <span className="text-ink-muted">desactivada</span>
          )}
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4">
        <label htmlFor="gemini-key" className="text-sm text-ink-soft">
          API key de Gemini
        </label>
        <input
          id="gemini-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          autoComplete="off"
          className="rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar clave'}
          </button>
          {iaHabilitada && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="rounded-input border border-amber px-4 py-2 text-sm text-amber-soft disabled:opacity-50"
            >
              Desactivar
            </button>
          )}
        </div>
      </form>

      {error && <p className="-mt-3 text-sm text-red-400">{error}</p>}
      {info && <p className="-mt-3 text-sm text-sage">{info}</p>}

      <div className="border-t border-border-soft pt-2">
        <h2 className="font-display text-base font-semibold text-ink">Búsqueda web</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Guardá tu API key de Tavily para que Ámbar pueda buscar en internet. Se cifra antes de
          guardarse, igual que la de Gemini.
        </p>
      </div>

      <div className="rounded-card border border-border-soft bg-surface p-4">
        <p className="text-sm text-ink">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-ink-muted">cargando…</span>
          ) : tavilyConfigurada ? (
            <span className="text-sage">configurada</span>
          ) : (
            <span className="text-ink-muted">no configurada</span>
          )}
        </p>
      </div>

      <form
        onSubmit={handleSaveTavily}
        className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4"
      >
        <label htmlFor="tavily-key" className="text-sm text-ink-soft">
          API key de Tavily
        </label>
        <input
          id="tavily-key"
          type="password"
          value={tavilyKey}
          onChange={(e) => setTavilyKey(e.target.value)}
          placeholder="tvly-..."
          autoComplete="off"
          className="rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={savingTavily || !tavilyKey.trim()}
            className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
          >
            {savingTavily ? 'Guardando…' : 'Guardar clave'}
          </button>
          {tavilyConfigurada && (
            <button
              type="button"
              onClick={handleRemoveTavily}
              disabled={savingTavily}
              className="rounded-input border border-amber px-4 py-2 text-sm text-amber-soft disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
      </form>

      {tavilyError && <p className="-mt-3 text-sm text-red-400">{tavilyError}</p>}
      {tavilyInfo && <p className="-mt-3 text-sm text-sage">{tavilyInfo}</p>}
    </div>
  )
}
