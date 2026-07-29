// El ciclo de vida de una sesión Live, del lado del cliente.
//
// ALCANCE (4c): conectar, hablar, escuchar, silenciar, cerrar. Más el latido
// que mantiene vivo el lock del servidor.
//
// 4d agregó el puente de tools: cuando llega un toolCall se ejecuta contra la
// Edge Function `live` (acción 'tool') y se responde con sendToolResponse().
//
// LO QUE TODAVÍA NO ESTÁ, A PROPÓSITO:
//   - resumption/reconexión (4e): si la conexión se cae, la sesión termina con
//     un mensaje. No hay reintentos ni handles todavía.
//   - cámara (4f) y fallback a texto (4g).

import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality, type LiveServerMessage, type LiveServerToolCall } from '@google/genai'
import { supabase } from '../../lib/supabase'
import { abrirCaptura, crearReproductor, type Captura, type Reproductor } from './audio'

/** El SDK no exporta el tipo de la sesión con un nombre estable: se deriva. */
type SesionLive = Awaited<ReturnType<GoogleGenAI['live']['connect']>>

export type EstadoLive = 'inactiva' | 'conectando' | 'activa' | 'error'

export interface TurnoLive {
  rol: 'usuario' | 'ambar'
  texto: string
}

/** Cada cuánto se le avisa al servidor que la sesión sigue viva (TTL: 90s). */
const LATIDO_MS = 30_000

// Tope de higiene, no de seguridad: nada del lado del servidor depende de
// esto (la RLS ya escopea cada tool al usuario dueño del JWT). Sólo evita que
// una sesión de voz larga entre en un loop de tool calls sin fin.
const TOPE_TOOL_CALLS = 30

interface RespuestaAbrir {
  token: string
  model: string
  session_id: string
  expira_en: string
  handle_previo: string | null
}

/**
 * Lee el body de una respuesta no-2xx de una Edge Function.
 *
 * supabase-js descarta el body en `error.message` (deja "non-2xx status code");
 * el mensaje real y el `motivo` tipado viven en `error.context`, la Response
 * cruda. Mismo patrón que ChatScreen y SettingsScreen.
 */
async function cuerpoDeError(error: unknown): Promise<{ error?: string; motivo?: string } | null> {
  const ctx = (error as { context?: Response } | undefined)?.context
  if (!ctx || typeof ctx.clone !== 'function') return null
  try {
    return await ctx.clone().json()
  } catch {
    return null
  }
}

export function useLiveSession() {
  const [estado, setEstado] = useState<EstadoLive>('inactiva')
  const [error, setError] = useState<string | null>(null)
  const [silenciado, setSilenciado] = useState(false)
  const [turnos, setTurnos] = useState<TurnoLive[]>([])
  const [hablando, setHablando] = useState(false)

  const sesionRef = useRef<SesionLive | null>(null)
  const capturaRef = useRef<Captura | null>(null)
  const reproductorRef = useRef<Reproductor | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const latidoRef = useRef<number | null>(null)
  const toolCallsRef = useRef(0)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  // Distingue un cierre pedido por el usuario de una caída de la conexión: sin
  // esto, cerrar a mano se reportaría como error.
  const cerrandoRef = useRef(false)
  // Se acumulan las transcripciones parciales y se vuelcan al terminar el turno.
  const parcialRef = useRef<{ usuario: string; ambar: string }>({ usuario: '', ambar: '' })

  // --- limpieza ------------------------------------------------------------

  const soltarWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => { /* ya soltado */ })
    wakeLockRef.current = null
  }, [])

  const pedirWakeLock = useCallback(async () => {
    // No está en todos lados (Safari lo soporta recién en versiones recientes).
    // Si no está, la sesión anda igual: sólo se apaga la pantalla, y por eso la
    // UI avisa que conviene mantenerla encendida.
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      /* denegado o pestaña oculta: no es motivo para cortar la sesión */
    }
  }, [])

  const limpiar = useCallback(async () => {
    if (latidoRef.current !== null) {
      clearInterval(latidoRef.current)
      latidoRef.current = null
    }
    soltarWakeLock()

    try { sesionRef.current?.close() } catch { /* ya cerrada */ }
    sesionRef.current = null

    await capturaRef.current?.cerrar()
    capturaRef.current = null

    await reproductorRef.current?.cerrar()
    reproductorRef.current = null

    // Liberar el lock del servidor. Si esto no llega, el TTL de 90s lo suelta
    // igual — por eso no se reintenta ni se le muestra el error al usuario.
    const sessionId = sessionIdRef.current
    sessionIdRef.current = null
    if (sessionId) {
      await supabase.functions.invoke('live', { body: { action: 'cerrar', session_id: sessionId } }).catch(() => {})
    }
  }, [soltarWakeLock])

  const terminarConError = useCallback(
    async (mensaje: string) => {
      setError(mensaje)
      setEstado('error')
      setHablando(false)
      await limpiar()
    },
    [limpiar],
  )

  // --- tools -----------------------------------------------------------------
  //
  // Gemini puede mandar varias functionCalls juntas en un mismo toolCall; se
  // ejecutan todas en paralelo (Promise.all) y se responden juntas también,
  // cada una con el `id` que trajo — es lo que Gemini usa para matchear
  // respuesta con pedido (en modo texto no hace falta: ahí no hay más de una
  // call pendiente a la vez dentro del mismo request).
  const responderToolCall = useCallback(async (toolCall: LiveServerToolCall) => {
    const llamadas = toolCall.functionCalls ?? []
    if (llamadas.length === 0) return

    const respuestas = await Promise.all(
      llamadas.map(async (call) => {
        const nombre = call.name ?? ''
        toolCallsRef.current += 1

        if (toolCallsRef.current > TOPE_TOOL_CALLS) {
          return { id: call.id, name: nombre, response: { error: 'Se alcanzó el límite de herramientas de esta sesión de voz.' } }
        }

        const { data, error } = await supabase.functions.invoke<{ result?: Record<string, unknown>; error?: string }>(
          'live',
          { body: { action: 'tool', name: nombre, args: call.args ?? {} } },
        )

        if (error || !data) {
          const cuerpo = await cuerpoDeError(error)
          return { id: call.id, name: nombre, response: { error: cuerpo?.error ?? 'La herramienta falló al ejecutarse.' } }
        }
        if (data.error) {
          return { id: call.id, name: nombre, response: { error: data.error } }
        }
        return { id: call.id, name: nombre, response: data.result ?? {} }
      }),
    )

    sesionRef.current?.sendToolResponse({ functionResponses: respuestas })
  }, [])

  // --- mensajes del servidor ----------------------------------------------

  const alMensaje = useCallback((m: LiveServerMessage) => {
    if (m.toolCall) void responderToolCall(m.toolCall)

    const contenido = m.serverContent

    // El usuario interrumpió: hay que tirar TODO el audio ya encolado. Sin
    // esto Ámbar sigue hablando encima del usuario.
    if (contenido?.interrupted) {
      reproductorRef.current?.interrumpir()
      setHablando(false)
    }

    for (const parte of contenido?.modelTurn?.parts ?? []) {
      const datos = parte.inlineData?.data
      if (datos) {
        reproductorRef.current?.encolar(datos)
        setHablando(true)
      }
    }

    const entrada = contenido?.inputTranscription?.text
    if (entrada) parcialRef.current.usuario += entrada

    const salida = contenido?.outputTranscription?.text
    if (salida) parcialRef.current.ambar += salida

    if (contenido?.turnComplete) {
      setHablando(false)
      const { usuario, ambar } = parcialRef.current
      parcialRef.current = { usuario: '', ambar: '' }
      setTurnos((previos) => {
        const nuevos = [...previos]
        if (usuario.trim()) nuevos.push({ rol: 'usuario', texto: usuario.trim() })
        if (ambar.trim()) nuevos.push({ rol: 'ambar', texto: ambar.trim() })
        return nuevos
      })
    }
  }, [responderToolCall])

  // --- abrir ---------------------------------------------------------------

  const abrir = useCallback(async () => {
    if (estado === 'conectando' || estado === 'activa') return

    setError(null)
    setTurnos([])
    parcialRef.current = { usuario: '', ambar: '' }
    cerrandoRef.current = false
    toolCallsRef.current = 0
    setEstado('conectando')

    // 1) El micrófono PRIMERO, antes de pedir el token.
    //
    // El token trae newSessionExpireTime de 60 segundos: si primero pidiéramos
    // el token y después el permiso, un usuario que duda frente al diálogo del
    // navegador se queda con un token vencido antes de conectar.
    try {
      capturaRef.current = await abrirCaptura((base64) => {
        // Los chunks que salen antes de que la sesión esté lista se descartan:
        // el usuario todavía no empezó a hablar.
        sesionRef.current?.sendRealtimeInput({
          audio: { data: base64, mimeType: 'audio/pcm;rate=16000' },
        })
      })
    } catch {
      setEstado('error')
      setError('No pude acceder al micrófono. Revisá los permisos del navegador y volvé a intentar.')
      return
    }

    reproductorRef.current = crearReproductor()
    await reproductorRef.current.reanudar()

    // 2) Token efímero + lock, contra la Edge Function.
    const { data, error: errFn } = await supabase.functions.invoke<RespuestaAbrir>('live', {
      body: { action: 'abrir' },
    })

    if (errFn || !data) {
      const cuerpo = await cuerpoDeError(errFn)
      await limpiar()
      setEstado('error')
      setError(cuerpo?.error ?? 'No se pudo abrir el modo voz. Intentá de nuevo.')
      return
    }

    sessionIdRef.current = data.session_id

    // 3) Conectar con el SDK.
    //
    // OJO CON EL ORDEN: `setupComplete` llega ANTES de que `connect()` resuelva,
    // así que dentro de los callbacks NO se puede usar la sesión todavía. Por eso
    // sesionRef se asigna después del await y los callbacks no la asumen.
    const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: 'v1alpha' } })

    try {
      const sesion = await ai.live.connect({
        model: data.model,
        // El fieldMask del token fija modelo, personalidad, voz, compresión y
        // transcripciones: lo que se manda acá no las pisa. Se declara igual
        // responseModalities porque el SDK lo pide para armar el setup.
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: alMensaje,
          onerror: () => {
            if (!cerrandoRef.current) {
              void terminarConError('Se cortó la conexión de voz. Volvé a abrirla para seguir.')
            }
          },
          onclose: () => {
            // Un cierre que no pedimos es el fin de la sesión: en 4c no hay
            // reconexión (eso es 4e), así que se informa y se limpia.
            if (!cerrandoRef.current) {
              void terminarConError('La sesión de voz se cerró. Volvé a abrirla para seguir.')
            }
          },
        },
      })

      sesionRef.current = sesion
    } catch {
      await limpiar()
      setEstado('error')
      setError('No se pudo conectar el modo voz. Intentá de nuevo en un momento.')
      return
    }

    setEstado('activa')
    void pedirWakeLock()

    // 4) Latido: renueva el TTL del lock mientras la sesión viva.
    latidoRef.current = window.setInterval(async () => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return

      const { data: latido } = await supabase.functions.invoke<{ vigente: boolean }>('live', {
        body: { action: 'latir', session_id: sessionId },
      })

      // vigente=false significa que otra sesión tomó el lock. No es un error de
      // red y no se reintenta: esta sesión dejó de ser la dueña y se cierra.
      if (latido && latido.vigente === false) {
        void terminarConError('Se abrió otra sesión de voz en otro dispositivo. Esta se cerró.')
      }
    }, LATIDO_MS)
  }, [estado, alMensaje, limpiar, pedirWakeLock, terminarConError])

  // --- cerrar / silenciar --------------------------------------------------

  const cerrar = useCallback(async () => {
    cerrandoRef.current = true
    setEstado('inactiva')
    setHablando(false)
    setSilenciado(false)
    await limpiar()
  }, [limpiar])

  const alternarSilencio = useCallback(() => {
    setSilenciado((previo) => {
      const nuevo = !previo
      capturaRef.current?.silenciar(nuevo)
      return nuevo
    })
  }, [])

  // --- pantalla bloqueada / pestaña oculta ---------------------------------

  useEffect(() => {
    if (estado !== 'activa') return

    // Volver a la pestaña: el navegador suelta el wake lock al ocultarla, y iOS
    // además suspende el AudioContext cuando se bloquea la pantalla. Las dos
    // cosas hay que rehacerlas a mano al volver.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState !== 'visible') return
      void pedirWakeLock()
      void reproductorRef.current?.reanudar()
    }

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [estado, pedirWakeLock])

  // Cerrar la pestaña con una sesión abierta dejaría el lock tomado hasta que
  // venza el TTL. `sendBeacon` no sirve acá porque hace falta el JWT, así que
  // se hace el mejor intento posible con la limpieza normal.
  useEffect(() => {
    const alSalir = () => {
      if (sessionIdRef.current) {
        cerrandoRef.current = true
        void limpiar()
      }
    }
    window.addEventListener('pagehide', alSalir)
    return () => window.removeEventListener('pagehide', alSalir)
  }, [limpiar])

  return { estado, error, silenciado, turnos, hablando, abrir, cerrar, alternarSilencio }
}
