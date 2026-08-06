import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { getPushStatus, subscribeToPush, unsubscribeFromPush, type PushStatus } from '../../lib/push'

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
  const [jinaConfigurada, setJinaConfigurada] = useState(false)
  const [spoonacularConfigurada, setSpoonacularConfigurada] = useState(false)
  const [tmdbConfigurada, setTmdbConfigurada] = useState(false)
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [jinaKey, setJinaKey] = useState('')
  const [spoonacularKey, setSpoonacularKey] = useState('')
  const [tmdbKey, setTmdbKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingTavily, setSavingTavily] = useState(false)
  const [savingJina, setSavingJina] = useState(false)
  const [savingSpoonacular, setSavingSpoonacular] = useState(false)
  const [savingTmdb, setSavingTmdb] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [tavilyError, setTavilyError] = useState<string | null>(null)
  const [tavilyInfo, setTavilyInfo] = useState<string | null>(null)
  const [jinaError, setJinaError] = useState<string | null>(null)
  const [jinaInfo, setJinaInfo] = useState<string | null>(null)
  const [spoonacularError, setSpoonacularError] = useState<string | null>(null)
  const [spoonacularInfo, setSpoonacularInfo] = useState<string | null>(null)
  const [tmdbError, setTmdbError] = useState<string | null>(null)
  const [tmdbInfo, setTmdbInfo] = useState<string | null>(null)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushWorking, setPushWorking] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [testWorking, setTestWorking] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    getPushStatus()
      .then((s) => {
        if (!cancelled) setPushStatus(s)
      })
      .catch(() => {
        if (cancelled) return
        setPushStatus('default')
        setPushError('No se pudo leer el estado de las notificaciones.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('ajustes_ia')
        .select(
          'ia_habilitada, tavily_api_key_encrypted, jina_api_key_encrypted, spoonacular_api_key_encrypted, tmdb_api_key_encrypted',
        )
        .eq('user_id', session!.user.id)
        .maybeSingle()

      if (!cancelled) {
        setIaHabilitada(Boolean(data?.ia_habilitada))
        setTavilyConfigurada(Boolean(data?.tavily_api_key_encrypted))
        setJinaConfigurada(Boolean(data?.jina_api_key_encrypted))
        setSpoonacularConfigurada(Boolean(data?.spoonacular_api_key_encrypted))
        setTmdbConfigurada(Boolean(data?.tmdb_api_key_encrypted))
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

  async function handleSaveJina(e: FormEvent) {
    e.preventDefault()
    if (!jinaKey.trim() || savingJina) return

    setSavingJina(true)
    setJinaError(null)
    setJinaInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'save', apiKey: jinaKey.trim(), provider: 'jina' },
    })

    setSavingJina(false)

    if (error) {
      setJinaError(await mensajeDeError(error, 'No se pudo guardar la key de Jina.'))
      return
    }

    setJinaConfigurada(Boolean(data?.jina_habilitada))
    setJinaKey('')
    setJinaInfo('Clave de Jina guardada correctamente.')
  }

  async function handleRemoveJina() {
    if (savingJina) return
    setSavingJina(true)
    setJinaError(null)
    setJinaInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'remove', provider: 'jina' },
    })

    setSavingJina(false)

    if (error) {
      setJinaError(await mensajeDeError(error, 'No se pudo quitar la key de Jina.'))
      return
    }

    setJinaConfigurada(Boolean(data?.jina_habilitada))
    setJinaInfo('Clave de Jina quitada.')
  }

  async function handleSaveSpoonacular(e: FormEvent) {
    e.preventDefault()
    if (!spoonacularKey.trim() || savingSpoonacular) return

    setSavingSpoonacular(true)
    setSpoonacularError(null)
    setSpoonacularInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'save', apiKey: spoonacularKey.trim(), provider: 'spoonacular' },
    })

    setSavingSpoonacular(false)

    if (error) {
      setSpoonacularError(await mensajeDeError(error, 'No se pudo guardar la key de Spoonacular.'))
      return
    }

    setSpoonacularConfigurada(Boolean(data?.spoonacular_habilitada))
    setSpoonacularKey('')
    setSpoonacularInfo('Clave de Spoonacular guardada correctamente.')
  }

  async function handleRemoveSpoonacular() {
    if (savingSpoonacular) return
    setSavingSpoonacular(true)
    setSpoonacularError(null)
    setSpoonacularInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'remove', provider: 'spoonacular' },
    })

    setSavingSpoonacular(false)

    if (error) {
      setSpoonacularError(await mensajeDeError(error, 'No se pudo quitar la key de Spoonacular.'))
      return
    }

    setSpoonacularConfigurada(Boolean(data?.spoonacular_habilitada))
    setSpoonacularInfo('Clave de Spoonacular quitada.')
  }

  async function handleSaveTmdb(e: FormEvent) {
    e.preventDefault()
    if (!tmdbKey.trim() || savingTmdb) return

    setSavingTmdb(true)
    setTmdbError(null)
    setTmdbInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'save', apiKey: tmdbKey.trim(), provider: 'tmdb' },
    })

    setSavingTmdb(false)

    if (error) {
      setTmdbError(await mensajeDeError(error, 'No se pudo validar/guardar la key de TMDB.'))
      return
    }

    setTmdbConfigurada(Boolean(data?.tmdb_habilitada))
    setTmdbKey('')
    setTmdbInfo('Clave de TMDB guardada correctamente.')
  }

  async function handleRemoveTmdb() {
    if (savingTmdb) return
    setSavingTmdb(true)
    setTmdbError(null)
    setTmdbInfo(null)

    const { data, error } = await supabase.functions.invoke('manage-ai-key', {
      body: { action: 'remove', provider: 'tmdb' },
    })

    setSavingTmdb(false)

    if (error) {
      setTmdbError(await mensajeDeError(error, 'No se pudo quitar la key de TMDB.'))
      return
    }

    setTmdbConfigurada(Boolean(data?.tmdb_habilitada))
    setTmdbInfo('Clave de TMDB quitada.')
  }

  async function handleActivarPush() {
    if (!session || pushWorking) return
    setPushWorking(true)
    setPushError(null)
    setTestResult(null)
    try {
      setPushStatus(await subscribeToPush(session.user.id))
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'No se pudieron activar las notificaciones.')
    } finally {
      setPushWorking(false)
    }
  }

  async function handleDesactivarPush() {
    if (pushWorking) return
    setPushWorking(true)
    setPushError(null)
    setTestResult(null)
    try {
      setPushStatus(await unsubscribeFromPush())
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'No se pudieron desactivar las notificaciones.')
    } finally {
      setPushWorking(false)
    }
  }

  async function handleProbarPush() {
    if (testWorking) return
    setTestWorking(true)
    setTestResult(null)

    const { error } = await supabase.functions.invoke('send-test-push', { body: {} })

    setTestWorking(false)

    if (error) {
      setTestResult({ ok: false, texto: await mensajeDeError(error, 'No se pudo mandar la notificación de prueba.') })
      return
    }

    setTestResult({ ok: true, texto: 'Notificación de prueba enviada — debería llegarte en unos segundos.' })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
      <div>
        <h1 className="font-display text-lg font-semibold text-ink">Ajustes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Guardá tu propia API key de Gemini. Se cifra antes de guardarse — nunca queda en texto plano.
        </p>
      </div>

      <div>
        <h2 className="font-display text-base font-semibold text-ink">Notificaciones</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Activalas para recibir avisos de Ámbar en este dispositivo. La suscripción es por
          navegador — activala en cada uno donde quieras recibirlos.
        </p>
      </div>

      <div className="rounded-card border border-border-soft bg-surface p-4 space-y-4">
        {pushStatus === null ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : pushStatus === 'unsupported' ? (
          <p className="text-sm text-ink-muted">
            Este navegador no soporta notificaciones push.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              Estado:{' '}
              {pushStatus === 'subscribed' ? (
                <span className="text-sage">activadas</span>
              ) : pushStatus === 'denied' ? (
                <span className="text-red-400">rechazadas</span>
              ) : (
                <span className="text-ink-muted">inactivas</span>
              )}
            </p>

            {pushStatus === 'denied' ? (
              <p className="text-sm text-ink-muted">
                Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración
                del navegador (candado en la barra de direcciones → Notificaciones) y recargá.
              </p>
            ) : (
              <div className="flex gap-2">
                {pushStatus === 'subscribed' ? (
                  <button
                    type="button"
                    onClick={handleDesactivarPush}
                    disabled={pushWorking}
                    className="rounded-input border border-amber px-4 py-2 text-sm text-amber-soft disabled:opacity-50"
                  >
                    {pushWorking ? 'Procesando…' : 'Desactivar en este dispositivo'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleActivarPush}
                    disabled={pushWorking}
                    className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
                  >
                    {pushWorking ? 'Activando…' : 'Activar notificaciones'}
                  </button>
                )}
                {pushStatus === 'subscribed' && (
                  <button
                    type="button"
                    onClick={handleProbarPush}
                    disabled={testWorking}
                    className="rounded-input border border-border-soft px-4 py-2 text-sm text-ink-soft disabled:opacity-50"
                  >
                    {testWorking ? 'Enviando…' : 'Probar notificación'}
                  </button>
                )}
              </div>
            )}

            {pushError && <p className="text-sm text-red-400">{pushError}</p>}
            {testResult && (
              <p className={`text-sm ${testResult.ok ? 'text-sage' : 'text-red-400'}`}>{testResult.texto}</p>
            )}
          </>
        )}
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

      <div className="border-t border-border-soft pt-2">
        <h2 className="font-display text-base font-semibold text-ink">Lectura de páginas</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Opcional: Ámbar ya puede leer el contenido completo de un link (por ejemplo, uno que
          encontró buscando en internet) sin ninguna key, con un límite gratis más bajo. Guardá tu
          propia API key de Jina Reader si querés un límite más alto. Se cifra antes de guardarse,
          igual que las demás.
        </p>
      </div>

      <div className="rounded-card border border-border-soft bg-surface p-4">
        <p className="text-sm text-ink">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-ink-muted">cargando…</span>
          ) : jinaConfigurada ? (
            <span className="text-sage">configurada</span>
          ) : (
            <span className="text-ink-muted">no configurada (usando el límite gratis)</span>
          )}
        </p>
      </div>

      <form
        onSubmit={handleSaveJina}
        className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4"
      >
        <label htmlFor="jina-key" className="text-sm text-ink-soft">
          API key de Jina Reader
        </label>
        <input
          id="jina-key"
          type="password"
          value={jinaKey}
          onChange={(e) => setJinaKey(e.target.value)}
          placeholder="jina_..."
          autoComplete="off"
          className="rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={savingJina || !jinaKey.trim()}
            className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
          >
            {savingJina ? 'Guardando…' : 'Guardar clave'}
          </button>
          {jinaConfigurada && (
            <button
              type="button"
              onClick={handleRemoveJina}
              disabled={savingJina}
              className="rounded-input border border-amber px-4 py-2 text-sm text-amber-soft disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
      </form>

      {jinaError && <p className="-mt-3 text-sm text-red-400">{jinaError}</p>}
      {jinaInfo && <p className="-mt-3 text-sm text-sage">{jinaInfo}</p>}

      <div className="border-t border-border-soft pt-2">
        <h2 className="font-display text-base font-semibold text-ink">Recetas y nutrición</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Guardá tu API key de Spoonacular para que Ámbar pueda buscar recetas por ingredientes o
          por plato, con info nutricional si la pedís. Se cifra antes de guardarse, igual que las
          demás.
        </p>
      </div>

      <div className="rounded-card border border-border-soft bg-surface p-4">
        <p className="text-sm text-ink">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-ink-muted">cargando…</span>
          ) : spoonacularConfigurada ? (
            <span className="text-sage">configurada</span>
          ) : (
            <span className="text-ink-muted">no configurada</span>
          )}
        </p>
      </div>

      <form
        onSubmit={handleSaveSpoonacular}
        className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4"
      >
        <label htmlFor="spoonacular-key" className="text-sm text-ink-soft">
          API key de Spoonacular
        </label>
        <input
          id="spoonacular-key"
          type="password"
          value={spoonacularKey}
          onChange={(e) => setSpoonacularKey(e.target.value)}
          placeholder="Tu API key de Spoonacular"
          autoComplete="off"
          className="rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={savingSpoonacular || !spoonacularKey.trim()}
            className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
          >
            {savingSpoonacular ? 'Guardando…' : 'Guardar clave'}
          </button>
          {spoonacularConfigurada && (
            <button
              type="button"
              onClick={handleRemoveSpoonacular}
              disabled={savingSpoonacular}
              className="rounded-input border border-amber px-4 py-2 text-sm text-amber-soft disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
      </form>

      {spoonacularError && <p className="-mt-3 text-sm text-red-400">{spoonacularError}</p>}
      {spoonacularInfo && <p className="-mt-3 text-sm text-sage">{spoonacularInfo}</p>}

      <div className="border-t border-border-soft pt-2">
        <h2 className="font-display text-base font-semibold text-ink">Películas y series</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Guardá tu API key de TMDB (API Key v3) para que Ámbar pueda buscar y recomendarte
          películas y series. Se cifra antes de guardarse, igual que las demás.
        </p>
      </div>

      <div className="rounded-card border border-border-soft bg-surface p-4">
        <p className="text-sm text-ink">
          Estado:{' '}
          {loadingEstado ? (
            <span className="text-ink-muted">cargando…</span>
          ) : tmdbConfigurada ? (
            <span className="text-sage">configurada</span>
          ) : (
            <span className="text-ink-muted">no configurada</span>
          )}
        </p>
      </div>

      <form
        onSubmit={handleSaveTmdb}
        className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface p-4"
      >
        <label htmlFor="tmdb-key" className="text-sm text-ink-soft">
          API key de TMDB
        </label>
        <input
          id="tmdb-key"
          type="password"
          value={tmdbKey}
          onChange={(e) => setTmdbKey(e.target.value)}
          placeholder="Tu API Key (v3 auth) de TMDB"
          autoComplete="off"
          className="rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={savingTmdb || !tmdbKey.trim()}
            className="rounded-pill bg-amber px-4 py-2 text-sm font-medium text-ink-inverse disabled:opacity-50"
          >
            {savingTmdb ? 'Guardando…' : 'Guardar clave'}
          </button>
          {tmdbConfigurada && (
            <button
              type="button"
              onClick={handleRemoveTmdb}
              disabled={savingTmdb}
              className="rounded-input border border-amber px-4 py-2 text-sm text-amber-soft disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
      </form>

      {tmdbError && <p className="-mt-3 text-sm text-red-400">{tmdbError}</p>}
      {tmdbInfo && <p className="-mt-3 text-sm text-sage">{tmdbInfo}</p>}
    </div>
  )
}
