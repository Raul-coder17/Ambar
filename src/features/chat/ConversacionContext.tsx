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
//
// Y desde el Paso 2b, las PIZARRAS: las tarjetas que Ámbar escribe en pantalla
// durante una charla hablada. Viven acá y no adentro de `useLiveSession` por el
// mismo motivo que los mensajes: `LiveScreen` se desmonta entera cuando Live
// cae a texto (ver `alFallback`), y con ella se iría el hook y todo su estado.
// Una receta que el usuario tenía en pantalla no debería evaporarse porque se
// cortó la conexión de voz.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

/** Una tarjeta de la pizarra. `contenido` es markdown del subconjunto del Paso 1. */
export interface Pizarra {
  titulo: string | null
  contenido: string
}

interface ConversacionContextValue {
  mensajes: ChatMessage[]
  agregarMensaje: (mensaje: ChatMessage) => void
  pizarras: Pizarra[]
  agregarPizarra: (pizarra: Pizarra) => void
  bannerFallback: string | null
  mostrarBannerFallback: (mensaje: string) => void
  descartarBanner: () => void
}

const ConversacionContext = createContext<ConversacionContextValue | null>(null)

export function ConversacionProvider({ children }: { children: ReactNode }) {
  const [mensajes, setMensajes] = useState<ChatMessage[]>([])
  const [pizarras, setPizarras] = useState<Pizarra[]>([])
  const [bannerFallback, setBannerFallback] = useState<string | null>(null)

  const agregarMensaje = useCallback((mensaje: ChatMessage) => {
    setMensajes((previos) => [...previos, mensaje])
  }, [])

  /**
   * DEDUPE, y por qué acá además de en la base.
   *
   * Session resumption puede hacer que Gemini reemita una function call que ya
   * había emitido antes de un corte, y el cliente pinta la tarjeta apenas VE la
   * call — sin esperar al insert, que es justamente lo que hace que aparezca al
   * instante. O sea que el índice único de `pizarras` protege la tabla pero no
   * la pantalla: sin este chequeo, una reconexión dejaría la misma receta dos
   * veces en el carrusel.
   *
   * Se comprobó además que dos calls IDÉNTICAS pueden llegar en el mismo
   * `toolCall` (la validación del Paso 2a dejó un hueco en la secuencia de ids:
   * dos intentos de insert, una sola fila). `responderToolCall` las despacha en
   * paralelo con Promise.all, así que ahí el dedupe de la base resuelve una y
   * rechaza la otra — pero las dos pasan por acá antes.
   *
   * La clave es el contenido mismo, no un hash de él: es el equivalente exacto
   * del `md5(contenido)` del índice, sin necesitar crypto y sin la posibilidad
   * de colisión que un hash sí tiene. Son a lo sumo un puñado de strings de
   * 1500 caracteres por sesión.
   *
   * LÍMITE CONOCIDO: el índice de la base escopea por `session_id` y éste no.
   * Si en la misma sesión de la app se abre Live dos veces y en las dos sale la
   * misma tarjeta exacta, la base guarda dos filas (son dos sesiones) y la
   * pantalla muestra una. Es el comportamiento deseado de los dos lados: en la
   * pantalla ya está, y en el historial fueron dos charlas distintas.
   */
  const agregarPizarra = useCallback((pizarra: Pizarra) => {
    setPizarras((previas) => (previas.some((p) => p.contenido === pizarra.contenido) ? previas : [...previas, pizarra]))
  }, [])

  const mostrarBannerFallback = useCallback((mensaje: string) => {
    setBannerFallback(mensaje)
  }, [])

  const descartarBanner = useCallback(() => setBannerFallback(null), [])

  return (
    <ConversacionContext.Provider
      value={{ mensajes, agregarMensaje, pizarras, agregarPizarra, bannerFallback, mostrarBannerFallback, descartarBanner }}
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
