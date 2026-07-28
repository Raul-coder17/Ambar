import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'

export function HomeScreen() {
  const { session } = useAuth()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-slate-100">
      <p className="text-lg">
        Sesión activa: <span className="font-mono text-amber-400">{session?.user.email}</span>
      </p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:border-slate-500"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
