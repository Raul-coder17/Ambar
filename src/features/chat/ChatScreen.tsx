import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useConversacion, type ChatMessage } from './ConversacionContext'
import { Markdown } from '../../components/Markdown'
import { IconSend } from '../../lib/icons'

interface AiChatResponse {
  respuesta_texto?: string
  error?: string
}

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

export function ChatScreen() {
  const { session } = useAuth()
  const { mensajes, agregarMensaje, bannerFallback, descartarBanner } = useConversacion()
  const [iaHabilitada, setIaHabilitada] = useState<boolean | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('ajustes_ia')
      .select('ia_habilitada')
      .eq('user_id', session!.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIaHabilitada(Boolean(data?.ia_habilitada))
      })

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = { role: 'user', text }
    // `history` local, no `mensajes` del Context: el setter del Context es
    // async, así que leer `mensajes` acá todavía tendría el valor de antes
    // de agregar `userMsg`. Mismo motivo por el que ya se hacía así antes de
    // levantar el estado — sólo que ahora la fuente de los turnos previos
    // (incluida charla de voz) es compartida.
    const history = [...mensajes, userMsg]
    agregarMensaje(userMsg)
    setInput('')
    setSending(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke<AiChatResponse>('ai-chat', {
      body: { messages: history },
    })

    setSending(false)

    if (error || !data) {
      const real = await mensajeDeError(error, 'No se pudo contactar al asistente. Intentá de nuevo.')
      console.error('[ai-chat] error real:', real, error)
      setError(real)
      return
    }

    if (data.error) {
      setError(data.error)
      return
    }

    agregarMensaje({ role: 'assistant', text: data.respuesta_texto ?? '' })
  }

  // Fija arriba del chat, con X para descartar — nunca desaparece sola: el
  // motivo por el que Live se cortó merece quedar a la vista hasta que el
  // usuario decida que ya lo vio, no un toast que puede perderse.
  const banner = bannerFallback && (
    <div className="flex items-start gap-3 border-b border-amber/30 bg-amber/10 px-4 py-2 text-xs text-amber-soft">
      <span className="flex-1">{bannerFallback}</span>
      <button onClick={descartarBanner} aria-label="Descartar aviso" className="shrink-0 text-amber-soft hover:text-ink">
        ✕
      </button>
    </div>
  )

  if (iaHabilitada === false) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {banner}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="text-sm text-ink-muted">Todavía no activaste la IA.</p>
          <p className="text-sm text-ink-muted">Guardá tu API key de Gemini en Ajustes para empezar a chatear.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {banner}
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[78%] rounded-bubble px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-[5px] bg-clay font-medium text-ink-inverse'
                  : 'rounded-bl-[5px] bg-surface-raised text-ink'
              }`}
            >
              {/* Sólo el lado de Ámbar se renderiza como markdown. Lo del
                  usuario se muestra tal cual escribió: interpretarle los
                  asteriscos o los guiones sería reescribirle el mensaje, y
                  desde 4g por acá también pasan transcripciones de voz, que
                  son habla y no texto formateado. */}
              {m.role === 'assistant' ? <Markdown texto={m.text} /> : m.text}
            </div>
          </div>
        ))}
        {sending && <div className="text-sm text-ink-muted">Ámbar está escribiendo…</div>}
        <div ref={listEndRef} />
      </div>

      {error && <p className="px-5 pb-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSend} className="flex items-center gap-2.5 py-3 pr-20 pl-4">
        <div className="flex flex-1 items-center rounded-pill border border-border-soft bg-surface-raised py-1.5 pr-1.5 pl-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí un mensaje…"
            disabled={sending || iaHabilitada === null}
            className="flex-1 bg-transparent text-[16px] leading-5 text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || iaHabilitada === null}
            aria-label="Enviar"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber text-ink-inverse disabled:opacity-50"
          >
            <IconSend className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
