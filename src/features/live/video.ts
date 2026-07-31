// Captura de frames de cámara para el modo Live (4f).
//
// A diferencia de audio.ts no hay streaming continuo: se manda una foto
// suelta cada cierto tiempo. El video consume contexto mucho más rápido que
// el audio y acelera la compresión de la ventana, así que la frecuencia
// default es 0.5 fps — la mitad del máximo de 1 fps que permite la API, no
// el máximo.
//
// Igual que audio.ts: nada de este módulo sabe de Gemini ni de React, recibe
// un callback y devuelve un objeto con cerrar().
//
// `cambiarCamara()` intercambia frontal/trasera. El mismo <video> oculto y el
// mismo intervalo de captura siguen vivos durante el cambio — sólo se
// reemplaza el stream de abajo — así no hace falta reabrir nada del lado de
// quien llama ni se vuelve a pedir permiso.
//
// El stream viejo se suelta ANTES de pedir el nuevo (no al revés): con el
// orden inverso, un teléfono real (con cámara trasera confirmada) fallaba al
// cambiar de cámara — la hipótesis más probable es que muchos Android sólo
// exponen un pipe de cámara a la vez, y pedir el segundo stream mientras el
// primero sigue vivo lo hace fallar aunque la cámara pedida exista. Si el
// segundo `getUserMedia` falla, no queda cámara vieja a la que volver:
// `cambiarCamara()` apaga todo (mismo efecto que `cerrar()`) y propaga el
// error, así quien llama no se queda pensando que la cámara sigue prendida
// cuando ya no hay nada capturando.

/** Ancho pedido a la cámara; el navegador ajusta el alto para mantener el aspecto. */
const ANCHO_FRAME = 640

/** 0.5 fps: un frame cada 2 segundos. */
const INTERVALO_FRAME_MS = 2_000

const CALIDAD_JPEG = 0.7

export type FacingMode = 'user' | 'environment'

export interface Camara {
  cerrar(): Promise<void>
  /**
   * Pide un stream nuevo con el `facingMode` opuesto al actual y lo engancha
   * al mismo `<video>` oculto — cambiar de cámara no siempre se puede hacer
   * en caliente sobre el stream existente, hace falta un `getUserMedia`
   * nuevo. El stream viejo se suelta ANTES de pedir el nuevo (ver cabecera
   * del archivo: es lo que hace falta en teléfonos con un solo pipe de
   * cámara). Trade-off aceptado: si el `getUserMedia` nuevo falla, la
   * cámara queda apagada del todo — no hay stream viejo al que volver — en
   * vez de seguir en la que ya andaba. El permiso no se vuelve a pedir
   * porque ya está concedido para "cámara" en este origen, sin importar el
   * `facingMode`.
   */
  cambiarCamara(): Promise<FacingMode>
}

/**
 * Abre la cámara frontal y manda un frame JPEG en base64 cada `INTERVALO_FRAME_MS`.
 *
 * Igual que el micrófono, tiene que llamarse dentro de un gesto del usuario
 * (el toggle de la UI cuenta).
 */
export async function abrirCamara(alFrame: (base64Jpeg: string) => void): Promise<Camara> {
  let facing: FacingMode = 'user'
  let stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: ANCHO_FRAME },
  })

  // Oculto de verdad (fuera de la vista, sin ocupar layout) pero DENTRO del
  // DOM: en iOS Safari un <video> desconectado del documento no siempre
  // entrega frames nuevos a un canvas.
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.style.position = 'fixed'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'
  video.style.width = '1px'
  video.style.height = '1px'
  video.srcObject = stream
  document.body.appendChild(video)
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    for (const track of stream.getTracks()) track.stop()
    video.remove()
    throw new Error('No se pudo crear el contexto 2D del canvas.')
  }

  const intervalo = window.setInterval(() => {
    const ancho = video.videoWidth
    const alto = video.videoHeight
    // El primer tick puede caer antes de que el <video> tenga su primer frame.
    if (ancho === 0 || alto === 0) return

    canvas.width = ancho
    canvas.height = alto
    ctx.drawImage(video, 0, 0, ancho, alto)

    const dataUrl = canvas.toDataURL('image/jpeg', CALIDAD_JPEG)
    alFrame(dataUrl.slice(dataUrl.indexOf(',') + 1))
  }, INTERVALO_FRAME_MS)

  // Único punto de apagado real: lo usa `cerrar()` y, si el `getUserMedia`
  // de `cambiarCamara()` falla, también el catch de ahí abajo — sin esto
  // habría dos copias de la misma secuencia de limpieza.
  function detener() {
    clearInterval(intervalo)
    video.pause()
    video.srcObject = null
    video.remove()
    for (const track of stream.getTracks()) track.stop()
  }

  return {
    async cerrar() {
      detener()
    },
    async cambiarCamara() {
      const nuevoFacing: FacingMode = facing === 'user' ? 'environment' : 'user'

      // Soltar el stream viejo ANTES de pedir el nuevo (ver cabecera del
      // archivo): con el orden inverso, el teléfono real contra el que se
      // reprodujo el bug fallaba a pedir la trasera mientras la frontal
      // seguía viva, aunque la cámara trasera existiera.
      for (const track of stream.getTracks()) track.stop()

      let nuevoStream: MediaStream
      try {
        nuevoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nuevoFacing, width: ANCHO_FRAME },
        })
      } catch (err) {
        // No hay stream viejo al que volver (ya se soltó arriba): apagar
        // todo en vez de dejar el <video> enganchado a un stream muerto.
        detener()
        throw err
      }

      stream = nuevoStream
      facing = nuevoFacing
      video.srcObject = stream
      await video.play()

      return facing
    },
  }
}
