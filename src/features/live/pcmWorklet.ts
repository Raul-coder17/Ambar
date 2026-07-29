// El AudioWorkletProcessor que captura el micrófono, como texto fuente.
//
// POR QUÉ UN WORKLET Y NO UN ScriptProcessorNode
//
// ScriptProcessorNode está deprecado y corre en el hilo principal: con React
// re-renderizando al lado, produce cortes audibles en la captura. El worklet
// corre en el hilo de audio, donde nada de la UI lo puede frenar.
//
// POR QUÉ EL CÓDIGO VA COMO STRING Y SE CARGA POR BLOB URL
//
// `audioWorklet.addModule()` necesita una URL a un módulo JS suelto, no un
// import. Las alternativas eran pelear con el manejo de assets de Vite y con el
// precache del service worker del PWA — y ese es justo el tipo de bug que anda
// en `npm run dev` y falla en producción, cuando ya es tarde. Un Blob URL no
// depende de nada del build.
//
// El costo: TypeScript no chequea nada de lo que hay acá adentro. Por eso el
// código es deliberadamente corto y sin dependencias.
//
// EL RESAMPLEO NO ES OPCIONAL
//
// La Live API quiere PCM de 16 kHz. Se le pide 16 kHz al AudioContext, pero
// Safari/iOS históricamente ignora ese pedido y entrega 48 kHz igual. Si eso
// pasa y mandamos las muestras crudas, Gemini escucha todo acelerado y no
// entiende nada. El worklet lee `sampleRate` (el real, global del scope de
// audio) y remuestrea cuando hace falta.

/** Sample rate que exige la Live API para el audio de entrada. */
export const SAMPLE_RATE_ENTRADA = 16000

/** ~100ms por chunk. Más chico multiplica los mensajes; más grande se siente en la latencia. */
export const MUESTRAS_POR_CHUNK = 1600

export const NOMBRE_PROCESADOR = 'captura-pcm'

const FUENTE = `
class CapturaPCM extends AudioWorkletProcessor {
  constructor(opciones) {
    super()
    const o = opciones.processorOptions
    this.salida = o.sampleRateSalida
    this.muestrasPorChunk = o.muestrasPorChunk
    // \`sampleRate\` es global en el scope del worklet y es el rate REAL del
    // contexto — no el que pedimos, el que el navegador terminó dando.
    this.ratio = sampleRate / this.salida
    this.necesarias = Math.ceil(this.muestrasPorChunk * this.ratio)
    this.acumulado = new Float32Array(this.necesarias * 2)
    this.escritas = 0
    this.silenciado = false

    this.port.onmessage = (e) => {
      if (e.data && e.data.tipo === 'mute') this.silenciado = Boolean(e.data.valor)
    }
  }

  process(entradas) {
    const canal = entradas[0] && entradas[0][0]
    // Sin canal el nodo sigue vivo igual: devolver false lo mataría para
    // siempre y un hueco momentáneo del stream no es motivo para eso.
    if (!canal) return true

    // Silenciado: se descarta el audio acá, en el hilo de audio. No alcanza con
    // no mandarlo desde JS — así no sale nada del dispositivo y además no se
    // gastan tokens mandando silencio.
    if (this.silenciado) {
      this.escritas = 0
      return true
    }

    if (this.escritas + canal.length > this.acumulado.length) this.escritas = 0
    this.acumulado.set(canal, this.escritas)
    this.escritas += canal.length

    while (this.escritas >= this.necesarias) {
      const salida = new Int16Array(this.muestrasPorChunk)
      for (let i = 0; i < this.muestrasPorChunk; i++) {
        // Interpolación lineal. Para voz alcanza de sobra: el error de un
        // filtro más elaborado no se escucha, y acá cada ciclo cuenta.
        const pos = i * this.ratio
        const base = Math.floor(pos)
        const frac = pos - base
        const a = this.acumulado[base] || 0
        const b = base + 1 < this.escritas ? this.acumulado[base + 1] : a
        const m = a + (b - a) * frac
        const clamp = m < -1 ? -1 : m > 1 ? 1 : m
        salida[i] = clamp < 0 ? clamp * 0x8000 : clamp * 0x7fff
      }

      // El buffer se transfiere en vez de copiarse.
      this.port.postMessage(salida.buffer, [salida.buffer])

      const sobrante = this.escritas - this.necesarias
      this.acumulado.copyWithin(0, this.necesarias, this.escritas)
      this.escritas = sobrante
    }

    return true
  }
}

registerProcessor(${JSON.stringify(NOMBRE_PROCESADOR)}, CapturaPCM)
`

/**
 * Crea el Blob URL del worklet. Quien lo llama es dueño de revocarlo
 * (`URL.revokeObjectURL`) cuando cierra el contexto de audio.
 */
export function crearWorkletUrl(): string {
  return URL.createObjectURL(new Blob([FUENTE], { type: 'application/javascript' }))
}
