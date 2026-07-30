import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

type Mode = 'login' | 'signup'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

    if (mode === 'signup') {
      setNotice('Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión.')
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-base px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="ambar-ember h-12 w-12" />
          <div>
            <p className="font-display text-2xl font-semibold text-ink">Ámbar</p>
            <p className="mt-0.5 text-sm text-ink-muted">Escuchando cuando quieras</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-card border border-border-soft bg-surface p-6"
        >
          <h1 className="font-display text-lg font-semibold text-ink">
            {mode === 'login' ? 'Entrar a Ámbar' : 'Crear cuenta'}
          </h1>

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm text-ink-soft">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-input border border-border-soft bg-surface-raised px-3 py-2 text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-amber"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-pill bg-amber px-3 py-2.5 font-medium text-ink-inverse disabled:opacity-50"
          >
            {submitting ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Registrarme'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
              setNotice(null)
            }}
            className="w-full text-sm text-ink-muted hover:text-ink-soft"
          >
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
          </button>
        </form>
      </div>
    </div>
  )
}
