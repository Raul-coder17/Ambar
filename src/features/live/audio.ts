// Captura y reproducción de audio para el modo Live.
//
// Dos AudioContext separados a propósito: la Live API manda 16 kHz para arriba
// y devuelve 24 kHz para abajo. Un solo contexto obligaría a remuestrear uno de
// los dos lados a mano en el hilo principal.
//
// Nada de este módulo sabe de Gemini ni de React: recibe callbacks y devuelve
// objetos con `cerrar()`. Eso es lo que hace que el hook pueda testearse (y
// razonarse) sin levantar una sesión real.

import { crearWorkletUrl, MUESTRAS_POR_CHUNK, NOMBRE_PROCESADOR, SAMPLE_RATE_ENTRADA } from './pcmWorklet'

/** Sample rate del audio que devuelve la Live API. */
const SAMPLE_RATE_SALIDA = 24000

/**
 * Colchón antes de arrancar la reproducción de un chunk que llegó tarde.
 * Sin esto, un chunk que llega cuando el cursor ya pasó se programa en el
 * pasado y el navegador lo tira: se escucha como un salto en la voz.
 */
const COLCHON_S = 0.06

function base64AInt16(base64: string): Int16Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  // El PCM viene little-endian, que es el orden nativo de toda plataforma donde
  // esto corre; por eso alcanza con reinterpretar el buffer.
  return new Int16Array(bytes.buffer)
}

function int16ABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  // De a bloques: `String.fromCharCode(...bytes)` con un chunk grande revienta
  // el límite de argumentos del stack.
  const PASO = 0x8000
  for (let i = 0; i < bytes.length; i += PASO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + PASO))
  }
  return btoa(binario)
}

// --- Captura ---------------------------------------------------------------

export interface Captura {
  silenciar(valor: boolean): void
  cerrar(): Promise<void>
}

/**
 * Abre el micrófono y entrega chunks de PCM 16 kHz ya en base64.
 *
 * Tiene que llamarse dentro de un gesto del usuario: los navegadores no dejan
 * crear ni reanudar un AudioContext fuera de uno (en iOS es taxativo).
 */
export async function abrirCaptura(alChunk: (base64: string) => void): Promise<Captura> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // Ámbar sale por el parlante y el micrófono la vuelve a escuchar; sin
      // cancelación de eco el VAD interpreta su propia voz como que el usuario
      // la interrumpió. Ayuda, no siempre alcanza: con parlante fuerte conviene
      // auriculares.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  // Se PIDE 16 kHz. Si el navegador da otra cosa (Safari suele dar 48 kHz), el
  // worklet remuestrea: por eso no se chequea ni se falla acá.
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE_ENTRADA })
  const url = crearWorkletUrl()

  try {
    await ctx.audioWorklet.addModule(url)
  } finally {
    // El módulo ya quedó cargado en el contexto; la URL no hace falta más.
    URL.revokeObjectURL(url)
  }

  const fuente = ctx.createMediaStreamSource(stream)
  const nodo = new AudioWorkletNode(ctx, NOMBRE_PROCESADOR, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: {
      sampleRateSalida: SAMPLE_RATE_ENTRADA,
      muestrasPorChunk: MUESTRAS_POR_CHUNK,
    },
  })

  nodo.port.onmessage = (e: MessageEvent<ArrayBuffer>) => alChunk(int16ABase64(e.data))
  fuente.connect(nodo)

  return {
    silenciar(valor) {
      nodo.port.postMessage({ tipo: 'mute', valor })
      // Además del worklet, se corta el track: es lo que apaga el indicador de
      // micrófono del sistema operativo, que es la señal en la que el usuario
      // realmente confía.
      for (const track of stream.getAudioTracks()) track.enabled = !valor
    },
    async cerrar() {
      nodo.port.onmessage = null
      try { fuente.disconnect() } catch { /* ya desconectado */ }
      try { nodo.disconnect() } catch { /* ya desconectado */ }
      for (const track of stream.getTracks()) track.stop()
      await ctx.close().catch(() => { /* ya cerrado */ })
    },
  }
}

// --- Reproducción ----------------------------------------------------------

export interface Reproductor {
  encolar(base64: string): void
  /** Corta todo lo que está sonando y lo que está programado. */
  interrumpir(): void
  reanudar(): Promise<void>
  cerrar(): Promise<void>
}

/**
 * Reproduce los chunks de 24 kHz en orden, encolándolos contra un cursor.
 *
 * El cursor es lo que hace que se escuche continuo: los chunks llegan por red
 * más rápido que el tiempo real, así que programarlos todos en `currentTime` los
 * haría sonar todos encima. Cada uno arranca donde terminó el anterior.
 */
export function crearReproductor(): Reproductor {
  // Sin `sampleRate` fijo: se deja el nativo del dispositivo y los buffers se
  // crean a 24 kHz. Cuando no coinciden, el navegador remuestrea solo — que es
  // justo lo que salva a iOS, donde forzar el rate del contexto no es confiable.
  const ctx = new AudioContext()
  const sonando = new Set<AudioBufferSourceNode>()
  let cursor = 0

  return {
    encolar(base64) {
      const int16 = base64AInt16(base64)
      if (int16.length === 0) return

      const f32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000

      const buffer = ctx.createBuffer(1, f32.length, SAMPLE_RATE_SALIDA)
      buffer.copyToChannel(f32, 0)

      const fuente = ctx.createBufferSource()
      fuente.buffer = buffer
      fuente.connect(ctx.destination)

      const ahora = ctx.currentTime
      if (cursor < ahora + COLCHON_S) cursor = ahora + COLCHON_S
      fuente.start(cursor)
      cursor += buffer.duration

      sonando.add(fuente)
      fuente.onended = () => sonando.delete(fuente)
    },

    interrumpir() {
      // Esto es lo que se siente cuando el usuario interrumpe a Ámbar. Sin
      // esto, el audio ya encolado sigue sonando mientras el usuario habla —
      // el defecto más notorio de una integración Live mal hecha.
      for (const fuente of sonando) {
        try { fuente.stop() } catch { /* ya terminó */ }
      }
      sonando.clear()
      cursor = 0
    },

    async reanudar() {
      if (ctx.state === 'suspended') await ctx.resume().catch(() => { /* sin gesto todavía */ })
    },

    async cerrar() {
      this.interrumpir()
      await ctx.close().catch(() => { /* ya cerrado */ })
    },
  }
}
