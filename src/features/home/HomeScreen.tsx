import { lazy, Suspense, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { ChatScreen } from '../chat/ChatScreen'
import { SettingsScreen } from '../settings/SettingsScreen'

// LiveScreen se carga aparte porque arrastra @google/genai, que solo (~450 KB
// sin comprimir) pesa más que todo el resto de la app. En el chunk principal lo
// descargaba todo el mundo, use el modo voz o no — mal negocio para una PWA que
// se abre desde el celular.
//
// El costo aparente (esperar el chunk al tocar el FAB) no se paga en la
// práctica: el service worker del PWA precachea todos los chunks del build
// apenas carga la app, así que para cuando el usuario toca el micrófono el
// archivo ya está en disco.
const LiveScreen = lazy(() => import('../live/LiveScreen').then((m) => ({ default: m.LiveScreen })))

type Tab = 'chat' | 'ajustes'

export function HomeScreen() {
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('chat')
  const [live, setLive] = useState(false)

  // LiveScreen se monta y desmonta con el modo: al desmontarse, el hook corre
  // su limpieza y suelta el lock del servidor. Mantenerla montada y oculta
  // dejaría el micrófono abierto de fondo.
  //
  // El fallback imita el fondo oscuro de LiveScreen a propósito: un Suspense
  // vacío deja ver el chat por debajo durante un instante, y en una app oscura
  // eso se ve como un parpadeo.
  if (live) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-sm text-slate-500">
            Abriendo el modo voz…
          </div>
        }
      >
        <LiveScreen onCerrar={() => setLive(false)} />
      </Suspense>
    )
  }

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

      {/* FAB provisional: el Home real con el FAB definitivo es de Fase 7. */}
      <button
        onClick={() => setLive(true)}
        aria-label="Hablar con Ámbar"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-2xl shadow-lg shadow-amber-500/20"
      >
        🎙️
      </button>
    </div>
  )
}
