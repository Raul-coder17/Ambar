import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

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
  const [iaHabilitada, setIaHabilitada] = useState<boolean | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
  }, [messages])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = { role: 'user', text }
    const history = [...messages, userMsg]
    setMessages(history)
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

    setMessages([...history, { role: 'assistant', text: data.respuesta_texto ?? '' }])
  }

  if (iaHabilitada === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-slate-100">
        <p className="text-sm text-slate-400">Todavía no activaste la IA.</p>
        <p className="text-sm text-slate-400">Guardá tu API key de Gemini en Ajustes para empezar a chatear.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col text-slate-100">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-100'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && <div className="text-sm text-slate-500">Ámbar está escribiendo…</div>}
        <div ref={listEndRef} />
      </div>

      {error && <p className="px-4 pb-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-800 px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí un mensaje…"
          disabled={sending || iaHabilitada === null}
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || iaHabilitada === null}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
