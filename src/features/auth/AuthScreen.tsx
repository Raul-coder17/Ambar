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
    <div className="flex min-h-svh items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6"
      >
        <h1 className="text-xl font-semibold text-slate-100">
          {mode === 'login' ? 'Entrar a Ámbar' : 'Crear cuenta'}
        </h1>

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm text-slate-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-amber-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm text-slate-400">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-amber-500"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-amber-500 px-3 py-2 font-medium text-slate-950 disabled:opacity-50"
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
          className="w-full text-sm text-slate-400 hover:text-slate-200"
        >
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
        </button>
      </form>
    </div>
  )
}
