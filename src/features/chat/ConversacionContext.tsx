// Fase 4g: historial de mensajes compartido entre texto y Live.
//
// Hasta acá `messages` vivía como estado local de ChatScreen — se perdía al
// desmontar/refrescar, y el modo Live no tenía forma de escribir ahí. Este
// Context es lo mínimo para que ambos modos lean y escriban el mismo array:
// sigue siendo sólo en memoria (nada nuevo se persiste en Supabase; eso es
// la vista Historial de Fase 7), sólo que ahora vive por encima de
// ChatScreen y LiveScreen en vez de adentro de uno solo.
//
// También vive acá el aviso del fallback a texto (banner): es el mismo tipo
// de estado — algo que Live produce y que ChatScreen tiene que mostrar — así
// que no ameritaba un Context aparte.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface ConversacionContextValue {
  mensajes: ChatMessage[]
  agregarMensaje: (mensaje: ChatMessage) => void
  bannerFallback: string | null
  mostrarBannerFallback: (mensaje: string) => void
  descartarBanner: () => void
}

const ConversacionContext = createContext<ConversacionContextValue | null>(null)

export function ConversacionProvider({ children }: { children: ReactNode }) {
  const [mensajes, setMensajes] = useState<ChatMessage[]>([])
  const [bannerFallback, setBannerFallback] = useState<string | null>(null)

  const agregarMensaje = useCallback((mensaje: ChatMessage) => {
    setMensajes((previos) => [...previos, mensaje])
  }, [])

  const mostrarBannerFallback = useCallback((mensaje: string) => {
    setBannerFallback(mensaje)
  }, [])

  const descartarBanner = useCallback(() => setBannerFallback(null), [])

  return (
    <ConversacionContext.Provider
      value={{ mensajes, agregarMensaje, bannerFallback, mostrarBannerFallback, descartarBanner }}
    >
      {children}
    </ConversacionContext.Provider>
  )
}

export function useConversacion() {
  const ctx = useContext(ConversacionContext)
  if (!ctx) throw new Error('useConversacion debe usarse dentro de <ConversacionProvider>.')
  return ctx
}
