// El ciclo de vida de una sesión Live, del lado del cliente.
//
// ALCANCE (4c): conectar, hablar, escuchar, silenciar, cerrar. Más el latido
// que mantiene vivo el lock del servidor.
//
// 4d agregó el puente de tools: cuando llega un toolCall se ejecuta contra la
// Edge Function `live` (acción 'tool') y se responde con sendToolResponse().
//
// 4e agregó resumption + reconexión:
//   - Cada `sessionResumptionUpdate` actualiza `handleRef`; se persiste en el
//     servidor vía el latido de 30s (no en cada update — ver el comentario de
//     `latir_sesion_live` en la migración de sesiones_live).
//   - `goAway` reconecta de inmediato (no es un error).
//   - Un cierre/error inesperado del socket reconecta con backoff 1s→2s→4s
//     (3 intentos). Si el token venció, se pide uno nuevo antes de reconectar.
//   - Si todos los intentos fallan, cierre limpio con mensaje claro (sin
//     fallback a texto — eso es 4g).
//
// 4f agregó la cámara, apagada por default y sólo disponible con sesión
// activa (`alternarCamara`). Se apaga sola —sin reactivarse— al ocultar la
// pestaña o al entrar en 'reconectando': el usuario tiene que volver a
// prenderla a propósito. Ver `apagarCamara` para el único punto de apagado.
//
// 4g agregó dos cosas:
//   - Cada turno completo (`turnComplete`) se empuja también al historial
//     compartido (`ConversacionContext`), no sólo al estado local `turnos` —
//     así el modo texto ve la charla de voz como si el usuario la hubiera
//     escrito.
//   - Fallback a texto: `terminarConError` (toda terminación involuntaria:
//     abrir() falló, se agotaron los reintentos de 4e, o el heartbeat avisó
//     que otro dispositivo tomó el lock) ahora también dispara
//     `opciones.alFallback`, que LiveScreen usa para mostrar el banner y
//     cerrarse. La ÚNICA terminación que NO cae acá es `sesion_activa`: ese
//     motivo entra en el estado 'conflicto' (ver `abrir`) porque no es un
//     fallo de Live, es una decisión que le toca al usuario (forzar el
//     cierre de la otra sesión, o no).

import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality, type LiveServerMessage, type LiveServerToolCall } from '@google/genai'
import { supabase } from '../../lib/supabase'
import { abrirCaptura, crearReproductor, type Captura, type Reproductor } from './audio'
import { abrirCamara, type Camara } from './video'
import { useConversacion } from '../chat/ConversacionContext'

/** El SDK no exporta el tipo de la sesión con un nombre estable: se deriva. */
type SesionLive = Awaited<ReturnType<GoogleGenAI['live']['connect']>>

export type EstadoLive = 'inactiva' | 'conectando' | 'activa' | 'reconectando' | 'conflicto' | 'error'

export interface TurnoLive {
  rol: 'usuario' | 'ambar'
  texto: string
}

/** Cada cuánto se le avisa al servidor que la sesión sigue viva (TTL: 90s). */
const LATIDO_MS = 30_000

// Backoff para reconectar tras un cierre/error inesperado del socket: 3
// intentos, esperando 1s/2s/4s antes de cada uno. Un `goAway` antepone un
// intento con demora 0 (reconectar YA, antes de que la conexión vieja se
// caiga) y si ese falla, cae en esta misma lista.
const REINTENTOS_RECONEXION_MS = [1_000, 2_000, 4_000]

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
async function cuerpoDeError(
  error: unknown,
): Promise<{ error?: string; motivo?: string; espera_segundos?: number | null } | null> {
  const ctx = (error as { context?: Response } | undefined)?.context
  if (!ctx || typeof ctx.clone !== 'function') return null
  try {
    return await ctx.clone().json()
  } catch {
    return null
  }
}

/**
 * Todo mensaje de una terminación involuntaria de Live termina en el banner
 * de fallback — pero algunos ya lo dicen explícitamente (p.ej. el 429 de
 * cuota, redactado desde Fase 4d) y no hace falta duplicarlo.
 */
function conAvisoFallback(mensaje: string): string {
  return /seguimos por texto/i.test(mensaje) ? mensaje : `${mensaje} Seguimos por texto.`
}

interface OpcionesLiveSession {
  /**
   * Se llama cuando Live termina de forma involuntaria por cualquier motivo
   * MENOS `sesion_activa` (ese tiene su propio flujo, ver estado 'conflicto').
   * `mensaje` ya viene listo para mostrar en el banner de ChatScreen.
   */
  alFallback?: (mensaje: string) => void
}

export function useLiveSession(opciones?: OpcionesLiveSession) {
  const { agregarMensaje } = useConversacion()

  const [estado, setEstado] = useState<EstadoLive>('inactiva')
  const [error, setError] = useState<string | null>(null)
  const [silenciado, setSilenciado] = useState(false)
  const [turnos, setTurnos] = useState<TurnoLive[]>([])
  const [hablando, setHablando] = useState(false)
  const [camaraActiva, setCamaraActiva] = useState(false)
  // Sólo se usa con estado === 'conflicto': cuánto falta para que el TTL de
  // la otra sesión venza solo, como alternativa a forzar el cierre ya mismo.
  const [esperaSegundos, setEsperaSegundos] = useState<number | null>(null)

  const sesionRef = useRef<SesionLive | null>(null)
  const capturaRef = useRef<Captura | null>(null)
  const reproductorRef = useRef<Reproductor | null>(null)
  const camaraRef = useRef<Camara | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const latidoRef = useRef<number | null>(null)
  const toolCallsRef = useRef(0)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  // Distingue un cierre pedido por el usuario de una caída de la conexión: sin
  // esto, cerrar a mano se reportaría como error.
  const cerrandoRef = useRef(false)
  // Se acumulan las transcripciones parciales y se vuelcan al terminar el turno.
  const parcialRef = useRef<{ usuario: string; ambar: string }>({ usuario: '', ambar: '' })

  // --- resumption + reconexión (4e) ----------------------------------------
  //
  // El handle más reciente que mandó el servidor. Se persiste vía heartbeat,
  // no en cada update (ver comentario de `latir_sesion_live`).
  const handleRef = useRef<string | null>(null)
  // Token y modelo vigentes: hace falta guardarlos para poder reconectar sin
  // pedir uno nuevo si todavía no venció.
  const tokenRef = useRef<string | null>(null)
  const modelRef = useRef<string | null>(null)
  const expiraEnRef = useRef<string | null>(null)
  // Evita que dos disparadores de reconexión (p.ej. un goAway seguido del
  // onclose del socket viejo cuando por fin se cae) arranquen dos loops de
  // reintentos en paralelo.
  const reconectandoRef = useRef(false)
  // Un `onclose`/`onerror` de un socket que ya abandonamos (porque reconectar
  // armó uno nuevo) no debe disparar OTRA reconexión encima de la que ya
  // funcionó. Cada conexión se marca con un número de generación al crearse;
  // el callback sólo actúa si su generación sigue siendo la vigente.
  const generacionRef = useRef(0)
  // Indirección para que `alMensaje` (definida antes que `reconectar` más
  // abajo) y los callbacks de `conectarSesion` puedan llamar siempre a la
  // versión más reciente de `reconectar` sin quedar atados a su identidad de
  // useCallback ni crear una referencia circular en el orden de declaración.
  const reconectarRef = useRef<(inmediato: boolean) => void>(() => {})

  // --- fallback a texto (4g) -------------------------------------------------
  //
  // Misma indirección por ref que `reconectarRef`: `opciones.alFallback`
  // puede cambiar de identidad en cada render de LiveScreen (es un callback
  // que cierra sobre `onCerrar`), y no queremos que eso invalide `terminarConError`.
  const alFallbackRef = useRef<((mensaje: string) => void) | undefined>(opciones?.alFallback)
  useEffect(() => {
    alFallbackRef.current = opciones?.alFallback
  }, [opciones?.alFallback])

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

  // Único punto de apagado de la cámara: se llama desde acá (fin de sesión),
  // desde `reconectar` (deja de haber sesión activa mientras se reintenta) y
  // desde el handler de `visibilitychange` (pestaña oculta). Ninguno de esos
  // casos reactiva la cámara sola — eso sólo lo hace `alternarCamara`.
  const apagarCamara = useCallback(async () => {
    const camara = camaraRef.current
    camaraRef.current = null
    setCamaraActiva(false)
    await camara?.cerrar()
  }, [])

  const limpiar = useCallback(async () => {
    if (latidoRef.current !== null) {
      clearInterval(latidoRef.current)
      latidoRef.current = null
    }
    soltarWakeLock()
    await apagarCamara()

    try { sesionRef.current?.close() } catch { /* ya cerrada */ }
    sesionRef.current = null

    // Fin del ciclo de vida de esta sesión: nada de lo que quede en refs de
    // resumption/reconexión sirve para la próxima vez que se abra.
    reconectandoRef.current = false
    handleRef.current = null
    tokenRef.current = null
    modelRef.current = null
    expiraEnRef.current = null

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
  }, [soltarWakeLock, apagarCamara])

  /**
   * Punto único de terminación involuntaria de Live (abrir() falló,
   * reconectar() agotó los reintentos, o el heartbeat avisó que otro
   * dispositivo tomó el lock). Por eso, y sólo acá, se dispara el fallback a
   * texto (4g) — `cerrar()` (el corte manual del usuario) nunca pasa por
   * acá, así que nunca produce el banner.
   */
  const terminarConError = useCallback(
    async (mensaje: string) => {
      setError(mensaje)
      setEstado('error')
      setHablando(false)
      await limpiar()
      alFallbackRef.current?.(mensaje)
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

    // `resumable=false` viene con `newHandle` vacío en momentos donde no se
    // puede retomar (p.ej. el modelo generando) — no hay nada que guardar ahí,
    // el handle anterior sigue siendo el mejor que tenemos.
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
      handleRef.current = m.sessionResumptionUpdate.newHandle
    }

    // No es un error: es Google avisando con anticipación (`timeLeft`) que va
    // a cortar esta conexión pronto. Reconectar ya mismo, antes de que se
    // caiga sola, es lo que hace que el usuario no note el corte.
    if (m.goAway) {
      reconectarRef.current(true)
    }

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
      const usuarioTexto = usuario.trim()
      const ambarTexto = ambar.trim()

      setTurnos((previos) => {
        const nuevos = [...previos]
        if (usuarioTexto) nuevos.push({ rol: 'usuario', texto: usuarioTexto })
        if (ambarTexto) nuevos.push({ rol: 'ambar', texto: ambarTexto })
        return nuevos
      })

      // Al historial compartido (4g) apenas se completa el turno — no sólo
      // al cerrar la sesión — para que un fallback a mitad de charla no
      // pierda nada de lo ya hablado.
      if (usuarioTexto) agregarMensaje({ role: 'user', text: usuarioTexto })
      if (ambarTexto) agregarMensaje({ role: 'assistant', text: ambarTexto })
    }
  }, [responderToolCall, agregarMensaje])

  // --- conectar / reconectar (4e) ------------------------------------------
  //
  // Lógica de conexión compartida entre el primer `connect()` de `abrir()` y
  // cada intento de `reconectar()`: arma el setup con el handle de resumption
  // vigente (si hay uno) y cablea los callbacks. `onerror`/`onclose` no
  // llaman a `terminarConError` directo como en 4c/4d — ahora disparan
  // `reconectar()` salvo que el cierre haya sido pedido por el usuario o que
  // esta conexión ya haya sido reemplazada por otra más nueva (ver
  // `generacionRef`: sin ese chequeo, el socket viejo que estamos abandonando
  // a propósito dispararía una segunda reconexión encima de la que ya
  // funcionó).
  const conectarSesion = useCallback(
    async (token: string, model: string): Promise<SesionLive> => {
      const miGeneracion = ++generacionRef.current
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } })

      return ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          // El fieldMask del token deja afuera `sessionResumption` a propósito
          // (ver FIELD_MASK en live/index.ts): es la única pieza de setup que
          // el cliente aporta, y es lo que le dice a Gemini qué charla retomar.
          ...(handleRef.current ? { sessionResumption: { handle: handleRef.current } } : {}),
        },
        callbacks: {
          onmessage: alMensaje,
          onerror: () => {
            if (cerrandoRef.current || generacionRef.current !== miGeneracion) return
            reconectarRef.current(false)
          },
          onclose: () => {
            if (cerrandoRef.current || generacionRef.current !== miGeneracion) return
            reconectarRef.current(false)
          },
        },
      })
    },
    [alMensaje],
  )

  /** Un solo intento de reconexión: re-mintea el token si venció y conecta. */
  const intentarReconectar = useCallback(async (): Promise<boolean> => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return false

    // `expira_en` es el dato preciso que ya manda el servidor — más confiable
    // que reimplementar acá los "~30 min" del token (`TOKEN_VIDA_MS` vive sólo
    // en live/index.ts).
    const tokenVencido =
      !tokenRef.current || !modelRef.current || !expiraEnRef.current || Date.now() >= new Date(expiraEnRef.current).getTime()

    if (tokenVencido) {
      const { data, error: errFn } = await supabase.functions.invoke<RespuestaAbrir>('live', {
        body: { action: 'abrir', session_id: sessionId, handle: handleRef.current ?? undefined },
      })
      if (errFn || !data) return false

      tokenRef.current = data.token
      modelRef.current = data.model
      expiraEnRef.current = data.expira_en
    }

    const sesionAnterior = sesionRef.current
    try {
      sesionRef.current = await conectarSesion(tokenRef.current!, modelRef.current!)
    } catch {
      return false
    }
    try { sesionAnterior?.close() } catch { /* ya caída */ }
    return true
  }, [conectarSesion])

  /**
   * Orquesta la reconexión completa: `inmediato` agrega un intento con demora
   * 0 al principio (caso `goAway`, avisado con anticipación); si falla, cae
   * en el mismo backoff de 1s/2s/4s que usa un cierre/error inesperado.
   */
  const reconectar = useCallback(
    async (inmediato: boolean) => {
      if (cerrandoRef.current || reconectandoRef.current) return
      reconectandoRef.current = true
      setEstado('reconectando')
      // La cámara sólo se ofrece con sesión activa: al reconectar deja de
      // haberla, así que se apaga acá y no se reactiva sola cuando la
      // reconexión funcione — mismo criterio conservador que el apagado por
      // `visibilitychange`.
      await apagarCamara()

      const demoras = inmediato ? [0, ...REINTENTOS_RECONEXION_MS] : REINTENTOS_RECONEXION_MS
      let ok = false

      for (const demora of demoras) {
        if (demora > 0) await esperar(demora)
        if (cerrandoRef.current) { ok = false; break }
        ok = await intentarReconectar()
        if (ok) break
      }

      reconectandoRef.current = false

      // El usuario cerró la sesión mientras se reconectaba: `cerrar()` ya
      // dejó todo en el estado correcto, no hay que pisarlo con nada acá.
      if (cerrandoRef.current) return

      if (ok) {
        setEstado('activa')
      } else {
        await terminarConError(conAvisoFallback('Se cortó la conexión de voz y no se pudo reconectar.'))
      }
    },
    [intentarReconectar, terminarConError, apagarCamara],
  )

  useEffect(() => {
    reconectarRef.current = reconectar
  }, [reconectar])

  // --- abrir ---------------------------------------------------------------

  /**
   * `forzar` (4g): sólo lo manda el botón "Cerrar la otra sesión y continuar
   * acá" que aparece en estado 'conflicto'. En el uso normal (botón "Empezar
   * a hablar"/"Volver a conectar") nunca se pasa — OJO al cablear el
   * `onClick`: no alcanza con `onClick={abrir}`, el evento del click no es
   * un `boolean` pero sí es "truthy", así que forzaría sin querer.
   */
  const abrir = useCallback(async (forzar = false) => {
    if (estado === 'conectando' || estado === 'activa' || estado === 'reconectando') return

    setError(null)
    setEsperaSegundos(null)
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
      // Fallo del lado del navegador, ni siquiera llega a pedirle nada al
      // servidor: no es uno de los motivos tipados de 4g (sin_key/sin_cuota/
      // sesion_activa/live_no_disponible), así que no dispara el fallback a
      // texto — el usuario sólo tiene que conceder el permiso y reintentar.
      setEstado('error')
      setError('No pude acceder al micrófono. Revisá los permisos del navegador y volvé a intentar.')
      return
    }

    reproductorRef.current = crearReproductor()
    await reproductorRef.current.reanudar()

    // 2) Token efímero + lock, contra la Edge Function.
    const { data, error: errFn } = await supabase.functions.invoke<RespuestaAbrir>('live', {
      body: { action: 'abrir', ...(forzar ? { forzar: true } : {}) },
    })

    if (errFn || !data) {
      const cuerpo = await cuerpoDeError(errFn)

      // `sesion_activa` NO cae a texto: es una decisión del usuario, no un
      // fallo de Live. Queda en 'conflicto' con la opción de forzar el
      // cierre de la otra sesión (mismo `abrir`, con forzar=true).
      if (cuerpo?.motivo === 'sesion_activa') {
        await limpiar()
        setEstado('conflicto')
        setEsperaSegundos(typeof cuerpo.espera_segundos === 'number' ? cuerpo.espera_segundos : null)
        setError(cuerpo.error ?? 'Ya tenés una sesión de voz abierta en otro dispositivo.')
        return
      }

      await terminarConError(conAvisoFallback(cuerpo?.error ?? 'No se pudo abrir el modo voz.'))
      return
    }

    sessionIdRef.current = data.session_id
    tokenRef.current = data.token
    modelRef.current = data.model
    expiraEnRef.current = data.expira_en
    // Si el servidor retomó una fila que quedó de una sesión que murió sin
    // liberarse (crash, batería, cierre de golpe), acá viene su handle: seguir
    // la charla donde iba en vez de arrancar de cero.
    handleRef.current = data.handle_previo ?? null

    // 3) Conectar con el SDK.
    //
    // OJO CON EL ORDEN: `setupComplete` llega ANTES de que `connect()` resuelva,
    // así que dentro de los callbacks NO se puede usar la sesión todavía. Por eso
    // sesionRef se asigna después del await y los callbacks no la asumen.
    try {
      sesionRef.current = await conectarSesion(data.token, data.model)
    } catch {
      await terminarConError(conAvisoFallback('No se pudo conectar el modo voz.'))
      return
    }

    setEstado('activa')
    void pedirWakeLock()

    // 4) Latido: renueva el TTL del lock mientras la sesión viva.
    latidoRef.current = window.setInterval(async () => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return

      const { data: latido } = await supabase.functions.invoke<{ vigente: boolean }>('live', {
        // El handle viaja acá y no en cada `sessionResumptionUpdate`: esos
        // mensajes llegan muy seguido, y el latido cada 30s alcanza (ver
        // `latir_sesion_live` en la migración de sesiones_live).
        body: { action: 'latir', session_id: sessionId, handle: handleRef.current ?? undefined },
      })

      // vigente=false significa que otra sesión tomó el lock. No es un error de
      // red y no se reintenta: esta sesión dejó de ser la dueña y se cierra.
      if (latido && latido.vigente === false) {
        void terminarConError(conAvisoFallback('Se abrió otra sesión de voz en otro dispositivo. Esta se cerró.'))
      }
    }, LATIDO_MS)
  }, [estado, conectarSesion, limpiar, pedirWakeLock, terminarConError])

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

  /**
   * Sólo funciona con sesión activa: no tiene sentido pedir permiso de
   * cámara para una sesión que todavía no existe o que se está reconectando.
   * `LiveScreen` ya deshabilita el botón fuera de 'activa'; este chequeo es
   * el mismo criterio del lado del hook, por si se llama desde otro lado.
   */
  const alternarCamara = useCallback(async () => {
    if (camaraRef.current) {
      await apagarCamara()
      return
    }
    if (estado !== 'activa') return

    try {
      camaraRef.current = await abrirCamara((base64) => {
        sesionRef.current?.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } })
      })
      setCamaraActiva(true)
    } catch {
      setError('No pude acceder a la cámara. Revisá los permisos del navegador y volvé a intentar.')
    }
  }, [estado, apagarCamara])

  // --- pantalla bloqueada / pestaña oculta ---------------------------------

  useEffect(() => {
    if (estado !== 'activa') return

    // Volver a la pestaña: el navegador suelta el wake lock al ocultarla, y iOS
    // además suspende el AudioContext cuando se bloquea la pantalla. Las dos
    // cosas hay que rehacerlas a mano al volver.
    //
    // La cámara va al revés: ocultar la pestaña la apaga (no debe quedar viva
    // en segundo plano) y volver a verla NO la reactiva sola — el usuario
    // tiene que prenderla a propósito otra vez con el toggle.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        void apagarCamara()
        return
      }
      void pedirWakeLock()
      void reproductorRef.current?.reanudar()
    }

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [estado, pedirWakeLock, apagarCamara])

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

  return {
    estado,
    error,
    esperaSegundos,
    silenciado,
    turnos,
    hablando,
    camaraActiva,
    abrir,
    cerrar,
    alternarSilencio,
    alternarCamara,
  }
}
