// Pantalla del modo Live. UI mínima de 4c: conectar, hablar, escuchar,
// silenciar, cerrar.
//
// 4e agregó el estado 'reconectando': mientras `useLiveSession` reintenta la
// conexión (goAway, o un cierre/error inesperado del socket) esta pantalla
// muestra "Reconectando…" en vez de quedarse en blanco o mostrar un error
// prematuro. Si los reintentos se agotan, recién ahí pasa a 'error'.
//
// 4f agregó el toggle de cámara, apagado por default y sólo habilitado con
// sesión activa. La franja ámbar debajo del header es el indicador — a
// propósito no es sólo el ícono de cámara del sistema operativo, que puede
// pasar desapercibido.
//
// 4g agregó dos cosas:
//   - El estado 'conflicto' (motivo `sesion_activa`): en vez del botón
//     genérico "Volver a conectar", esta pantalla ofrece "Cerrar la otra
//     sesión y continuar acá" — la única salida de 'conflicto' que no pasa
//     por el fallback a texto.
//   - `alFallback`, que le pasamos a `useLiveSession`: cuando Live termina
//     por cualquier otro motivo involuntario, mostramos el banner en el
//     historial compartido y cerramos esta pantalla — el usuario aparece en
//     ChatScreen con la transcripción de lo que ya se habló.
//
// El aviso de la pantalla no es decorativo. En iOS, bloquear la pantalla
// suspende el AudioContext y la sesión se queda muda; el Wake Lock lo evita
// mientras el navegador lo permita, pero no está en todos lados y el sistema
// puede soltarlo igual. Decírselo al usuario es la única garantía real.

import { useCallback } from 'react'
import { useLiveSession } from './useLiveSession'
import { useConversacion } from '../chat/ConversacionContext'

export function LiveScreen({ onCerrar }: { onCerrar: (irAChat?: boolean) => void }) {
  const { mostrarBannerFallback } = useConversacion()

  const alFallback = useCallback(
    (mensaje: string) => {
      mostrarBannerFallback(mensaje)
      onCerrar(true)
    },
    [mostrarBannerFallback, onCerrar],
  )

  const {
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
  } = useLiveSession({ alFallback })

  async function handleSalir() {
    await cerrar()
    onCerrar()
  }

  const leyenda =
    estado === 'conectando'
      ? 'Conectando…'
      : estado === 'reconectando'
        ? 'Reconectando…'
        : estado === 'activa'
          ? hablando
            ? 'Ámbar está hablando'
            : silenciado
              ? 'Micrófono silenciado'
              : 'Te escucho'
          : estado === 'conflicto'
            ? 'Ya tenés otra sesión abierta'
            : estado === 'error'
              ? 'Se cortó'
              : 'Listo para hablar'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-sm font-medium text-amber-400">Modo voz</h1>
        <button
          onClick={handleSalir}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
        >
          Salir
        </button>
      </header>

      {/* Indicador de cámara: no alcanza con el ícono del sistema operativo,
          que se puede pasar por alto. Esta franja es imposible de ignorar. */}
      {camaraActiva && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Cámara activa — Ámbar puede verte
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* El círculo es el único indicador de estado: en una pantalla que se
            mira de reojo mientras se habla, un texto chico no se lee. */}
        <div
          className={`flex h-32 w-32 items-center justify-center rounded-full transition-all ${
            estado === 'activa'
              ? hablando
                ? 'scale-110 bg-amber-500/30 ring-4 ring-amber-500'
                : silenciado
                  ? 'bg-slate-800 ring-4 ring-slate-700'
                  : 'bg-amber-500/10 ring-4 ring-amber-500/50'
              : estado === 'conectando' || estado === 'reconectando'
                ? 'animate-pulse bg-slate-800 ring-4 ring-slate-700'
                : estado === 'conflicto'
                  ? 'bg-amber-500/10 ring-4 ring-amber-500/40'
                  : 'bg-slate-900 ring-4 ring-slate-800'
          }`}
        >
          <span className="text-3xl">{estado === 'conflicto' ? '⚠️' : silenciado && estado === 'activa' ? '🔇' : '🎙️'}</span>
        </div>

        <p className="text-sm text-slate-400">{leyenda}</p>

        {error && <p className="max-w-xs text-center text-sm text-red-400">{error}</p>}

        {estado === 'conflicto' && esperaSegundos !== null && (
          <p className="max-w-xs text-center text-xs text-slate-500">
            También se libera sola en {esperaSegundos}s si no hacés nada.
          </p>
        )}

        {estado === 'activa' && (
          <p className="max-w-xs text-center text-xs text-slate-500">
            Mantené la pantalla encendida: si se bloquea, el audio puede cortarse.
          </p>
        )}

        <div className="flex gap-3">
          {estado === 'conflicto' ? (
            <button
              onClick={() => void abrir(true)}
              className="rounded-full bg-amber-500 px-6 py-3 text-sm font-medium text-slate-950"
            >
              Cerrar la otra sesión y continuar acá
            </button>
          ) : estado === 'inactiva' || estado === 'error' ? (
            <button
              onClick={() => void abrir()}
              className="rounded-full bg-amber-500 px-6 py-3 text-sm font-medium text-slate-950"
            >
              {estado === 'error' ? 'Volver a conectar' : 'Empezar a hablar'}
            </button>
          ) : (
            <>
              <button
                onClick={alternarSilencio}
                disabled={estado !== 'activa'}
                className="rounded-full border border-slate-700 px-6 py-3 text-sm hover:border-slate-500 disabled:opacity-50"
              >
                {silenciado ? 'Activar micrófono' : 'Silenciar'}
              </button>
              <button
                onClick={() => void alternarCamara()}
                disabled={estado !== 'activa'}
                className="rounded-full border border-slate-700 px-6 py-3 text-sm hover:border-slate-500 disabled:opacity-50"
              >
                {camaraActiva ? 'Apagar cámara' : 'Prender cámara'}
              </button>
              <button
                onClick={cerrar}
                className="rounded-full bg-red-500/90 px-6 py-3 text-sm font-medium text-slate-950"
              >
                Cortar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transcripción: además de ser útil para seguir la charla, es la prueba
          visible de que las transcripciones están llegando — que es lo que va a
          alimentar el fallback a texto (4g) y la memoria. */}
      <div className="max-h-56 space-y-2 overflow-y-auto border-t border-slate-800 px-4 py-3">
        {turnos.length === 0 ? (
          <p className="text-center text-xs text-slate-600">La transcripción va a aparecer acá.</p>
        ) : (
          turnos.map((t, i) => (
            <div key={i} className={`flex ${t.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  t.rol === 'usuario' ? 'bg-amber-500/20 text-amber-100' : 'bg-slate-800 text-slate-200'
                }`}
              >
                {t.texto}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
