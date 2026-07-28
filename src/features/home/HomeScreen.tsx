import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { ChatScreen } from '../chat/ChatScreen'
import { SettingsScreen } from '../settings/SettingsScreen'

type Tab = 'chat' | 'ajustes'

export function HomeScreen() {
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <div className="flex min-h-svh flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('chat')}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === 'chat' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setTab('ajustes')}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === 'ajustes' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
            }`}
          >
            Ajustes
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-slate-500 sm:inline">{session?.user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{tab === 'chat' ? <ChatScreen /> : <SettingsScreen />}</main>
    </div>
  )
}
