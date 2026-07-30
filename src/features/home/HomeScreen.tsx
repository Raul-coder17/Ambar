import { lazy, Suspense, useCallback, useState } from 'react'
import { NavLink, Navigate, Routes, Route, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { ChatScreen } from '../chat/ChatScreen'
import { ConversacionProvider } from '../chat/ConversacionContext'
import { SettingsScreen } from '../settings/SettingsScreen'
import { MemoriaScreen } from '../memoria/MemoriaScreen'
import { ObjetivosScreen } from '../objetivos/ObjetivosScreen'
import { IconAjustes, IconChat, IconMemoria, IconMic, IconObjetivos } from '../../lib/icons'

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

const TABS = [
  { to: '/chat', label: 'Hablar', Icon: IconChat },
  { to: '/memoria', label: 'Memoria', Icon: IconMemoria },
  { to: '/objetivos', label: 'Objetivos', Icon: IconObjetivos },
  { to: '/ajustes', label: 'Ajustes', Icon: IconAjustes },
] as const

function HomeScreenInterior() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [live, setLive] = useState(false)

  // `irAChat` (4g): cuando LiveScreen se cierra por un fallback a texto (no
  // por el botón "Salir"), queremos aterrizar en la pestaña Chat aunque el
  // usuario hubiera estado en otra pestaña antes de abrir Live — es donde
  // vive la transcripción y el banner que acaba de aparecer.
  const cerrarLive = useCallback(
    (irAChat?: boolean) => {
      setLive(false)
      if (irAChat) navigate('/chat')
    },
    [navigate],
  )

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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-base text-sm text-ink-muted">
            Abriendo el modo voz…
          </div>
        }
      >
        <LiveScreen onCerrar={cerrarLive} />
      </Suspense>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-base">
      <header className="flex flex-shrink-0 items-center gap-3 px-5 pt-5 pb-3">
        <div className="ambar-ember h-9 w-9 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-semibold text-ink">Ámbar</p>
          <p className="truncate text-xs text-ink-muted">Escuchando cuando quieras</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          title={session?.user.email}
          className="ml-auto flex-shrink-0 rounded-input border border-border-soft px-3 py-1.5 text-xs text-ink-soft hover:border-amber"
        >
          Salir
        </button>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat" element={<ChatScreen />} />
          <Route path="memoria" element={<MemoriaScreen />} />
          <Route path="objetivos" element={<ObjetivosScreen />} />
          <Route path="ajustes" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>

      {/* Flota sobre el resto de la UI, siempre presente sin importar la
          pestaña activa — igual que en mockup.html, donde vive afuera de
          los <div class="screen">. */}
      <button
        onClick={() => setLive(true)}
        aria-label="Hablar con Ámbar"
        className="ambar-fab fixed right-5 bottom-24 z-10 flex h-14 w-14 items-center justify-center text-ink-inverse"
      >
        <IconMic className="h-6 w-6" />
      </button>

      <nav className="flex flex-shrink-0 border-t border-border-soft bg-surface px-2 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-1 text-[10.5px] ${
                isActive ? 'text-amber-soft' : 'text-ink-muted'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

// El historial compartido (4g) tiene que vivir por ENCIMA del if/else de
// arriba: ChatScreen y LiveScreen se montan y desmontan turnándose, y el
// Context es justamente lo que sobrevive a eso.
export function HomeScreen() {
  return (
    <ConversacionProvider>
      <HomeScreenInterior />
    </ConversacionProvider>
  )
}
