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
   * nuevo. Sólo se apaga el stream viejo y se pisa el estado una vez que el
   * nuevo ya está andando: si el pedido falla (p.ej. el dispositivo no tiene
   * cámara trasera), todo queda como estaba. El permiso no se vuelve a pedir
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

  return {
    async cerrar() {
      clearInterval(intervalo)
      video.pause()
      video.srcObject = null
      video.remove()
      for (const track of stream.getTracks()) track.stop()
    },
    async cambiarCamara() {
      const nuevoFacing: FacingMode = facing === 'user' ? 'environment' : 'user'
      const nuevoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nuevoFacing, width: ANCHO_FRAME },
      })

      for (const track of stream.getTracks()) track.stop()
      stream = nuevoStream
      facing = nuevoFacing
      video.srcObject = stream
      await video.play()

      return facing
    },
  }
}
