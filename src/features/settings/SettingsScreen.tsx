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
    <div className="flex flex-col gap-6 px-4 py-6 text-slate-100">
      <div>
        <h1 className="text-lg font-semibold">Ajustes</h1>
        <p className="mt-1 text-sm text-slate-400">
          Guardá tu propia API key de Gemini. Se cifra antes de guardarse — nunca queda en texto plano.
        </p>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-slate-500">cargando…</span>
          ) : iaHabilitada ? (
            <span className="text-emerald-400">activada</span>
          ) : (
            <span className="text-slate-500">desactivada</span>
          )}
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <label htmlFor="gemini-key" className="text-sm text-slate-300">
          API key de Gemini
        </label>
        <input
          id="gemini-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          autoComplete="off"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[16px] leading-5 text-slate-100 outline-none focus:border-amber-500"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar clave'}
          </button>
          {iaHabilitada && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:border-slate-500 disabled:opacity-50"
            >
              Desactivar
            </button>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}

      <div className="border-t border-slate-800 pt-6">
        <h2 className="text-base font-semibold">Búsqueda web</h2>
        <p className="mt-1 text-sm text-slate-400">
          Guardá tu API key de Tavily para que Ámbar pueda buscar en internet. Se cifra antes de
          guardarse, igual que la de Gemini.
        </p>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-slate-500">cargando…</span>
          ) : tavilyConfigurada ? (
            <span className="text-emerald-400">configurada</span>
          ) : (
            <span className="text-slate-500">no configurada</span>
          )}
        </p>
      </div>

      <form onSubmit={handleSaveTavily} className="flex flex-col gap-3">
        <label htmlFor="tavily-key" className="text-sm text-slate-300">
          API key de Tavily
        </label>
        <input
          id="tavily-key"
          type="password"
          value={tavilyKey}
          onChange={(e) => setTavilyKey(e.target.value)}
          placeholder="tvly-..."
          autoComplete="off"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[16px] leading-5 text-slate-100 outline-none focus:border-amber-500"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={savingTavily || !tavilyKey.trim()}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
          >
            {savingTavily ? 'Guardando…' : 'Guardar clave'}
          </button>
          {tavilyConfigurada && (
            <button
              type="button"
              onClick={handleRemoveTavily}
              disabled={savingTavily}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:border-slate-500 disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
      </form>

      {tavilyError && <p className="text-sm text-red-400">{tavilyError}</p>}
      {tavilyInfo && <p className="text-sm text-emerald-400">{tavilyInfo}</p>}
    </div>
  )
}
