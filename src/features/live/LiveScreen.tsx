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
// pasar desapercibido. Después de 4f se sumó "Cambiar cámara" (frontal ↔
// trasera), visible sólo mientras la cámara está prendida; la franja dice
// cuál de las dos está activa en cada momento.
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
// La pizarra (Paso 2b) reorganizó el layout, que es la opción A del diseño: el
// bloque central pasó a ser de las tarjetas, y el círculo de estado —que hasta
// acá era el protagonista— se redujo al header. El razonamiento es el mismo que
// justificaba el círculo grande, aplicado al caso nuevo: en una pantalla que se
// mira de reojo mientras se habla, lo que ocupa el centro tiene que ser lo que
// hay para leer. Cuando NO hay tarjetas, el centro vuelve a ser del estado.
//
// El aviso de la pantalla no es decorativo. En iOS, bloquear la pantalla
// suspende el AudioContext y la sesión se queda muda; el Wake Lock lo evita
// mientras el navegador lo permita, pero no está en todos lados y el sistema
// puede soltarlo igual. Decírselo al usuario es la única garantía real.

import { useCallback } from 'react'
import { useLiveSession, type EstadoLive } from './useLiveSession'
import { PizarraPanel } from './PizarraPanel'
import { useConversacion } from '../chat/ConversacionContext'

/**
 * El círculo de estado, ya reducido al header.
 *
 * Conserva las mismas variantes que tenía en grande, incluida la respiración
 * cuando Ámbar habla: es el mismo motivo de marca que la brasa del header y el
 * FAB, no una coincidencia. Lo único que cambió es la escala.
 */
function IndicadorEstado({
  estado,
  hablando,
  silenciado,
}: {
  estado: EstadoLive
  hablando: boolean
  silenciado: boolean
}) {
  const clases =
    estado === 'activa'
      ? hablando
        ? 'animate-[ambar-breathe_3.2s_ease-in-out_infinite] bg-amber/30 ring-2 ring-amber'
        : silenciado
          ? 'bg-surface-raised ring-2 ring-border-soft'
          : 'bg-amber/10 ring-2 ring-amber/50'
      : estado === 'conectando' || estado === 'reconectando'
        ? 'animate-pulse bg-surface-raised ring-2 ring-border-soft'
        : estado === 'conflicto'
          ? 'bg-amber/10 ring-2 ring-amber/40'
          : 'bg-surface ring-2 ring-border-soft'

  return (
    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all ${clases}`}>
      <span className="text-base">
        {estado === 'conflicto' ? '⚠️' : silenciado && estado === 'activa' ? '🔇' : '🎙️'}
      </span>
    </div>
  )
}

export function LiveScreen({ onCerrar }: { onCerrar: (irAChat?: boolean) => void }) {
  const { mostrarBannerFallback, pizarras } = useConversacion()

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
    camaraFacing,
    abrir,
    cerrar,
    alternarSilencio,
    alternarCamara,
    alternarCamaraFacing,
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
    <div className="fixed inset-0 z-50 flex flex-col bg-base text-ink">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3">
        <IndicadorEstado estado={estado} hablando={hablando} silenciado={silenciado} />
        <div className="min-w-0">
          <h1 className="font-display text-sm font-medium text-amber-soft">Modo voz</h1>
          <p className="truncate text-xs text-ink-muted">{leyenda}</p>
        </div>
        <button
          onClick={handleSalir}
          className="ml-auto flex-shrink-0 rounded-input border border-border-soft px-3 py-1.5 text-xs text-ink-soft hover:border-amber"
        >
          Salir
        </button>
      </header>

      {/* Indicador de cámara: no alcanza con el ícono del sistema operativo,
          que se puede pasar por alto. Esta franja es imposible de ignorar. */}
      {camaraActiva && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-amber/30 bg-amber/10 px-4 py-1.5 text-xs text-amber-soft">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber" />
          {camaraFacing === 'environment' ? 'Cámara trasera activa' : 'Cámara frontal activa'} — Ámbar puede verte
        </div>
      )}

      {/* El bloque central. Con tarjetas es de la pizarra; sin ellas vuelve a
          ser del estado de la sesión, que es lo único que hay para mirar. */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        {pizarras.length > 0 ? (
          <PizarraPanel pizarras={pizarras} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-ink-muted">{leyenda}</p>
            {estado === 'activa' && (
              <p className="max-w-xs text-xs text-ink-muted">
                Si Ámbar escribe algo para que mires —una receta, una lista— te lo va a dejar acá.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-col items-center gap-3 px-4 pb-3">
        {error && <p className="max-w-xs text-center text-sm text-red-400">{error}</p>}

        {estado === 'conflicto' && esperaSegundos !== null && (
          <p className="max-w-xs text-center text-xs text-ink-muted">
            También se libera sola en {esperaSegundos}s si no hacés nada.
          </p>
        )}

        {estado === 'activa' && (
          <p className="max-w-xs text-center text-xs text-ink-muted">
            Mantené la pantalla encendida: si se bloquea, el audio puede cortarse.
          </p>
        )}

        {/* `flex-wrap`: con la cámara prendida son cuatro botones, y desde que
            el bloque central se lo lleva el espacio ya no hay lugar para
            ponerlos todos en una fila en un teléfono angosto. */}
        <div className="flex flex-wrap justify-center gap-2">
          {estado === 'conflicto' ? (
            <button
              onClick={() => void abrir(true)}
              className="rounded-pill bg-amber px-6 py-3 text-sm font-medium text-ink-inverse"
            >
              Cerrar la otra sesión y continuar acá
            </button>
          ) : estado === 'inactiva' || estado === 'error' ? (
            <button
              onClick={() => void abrir()}
              className="rounded-pill bg-amber px-6 py-3 text-sm font-medium text-ink-inverse"
            >
              {estado === 'error' ? 'Volver a conectar' : 'Empezar a hablar'}
            </button>
          ) : (
            <>
              <button
                onClick={alternarSilencio}
                disabled={estado !== 'activa'}
                className="rounded-pill border border-border-soft px-5 py-2.5 text-sm text-ink-soft hover:border-amber disabled:opacity-50"
              >
                {silenciado ? 'Activar micrófono' : 'Silenciar'}
              </button>
              <button
                onClick={() => void alternarCamara()}
                disabled={estado !== 'activa'}
                className="rounded-pill border border-border-soft px-5 py-2.5 text-sm text-ink-soft hover:border-amber disabled:opacity-50"
              >
                {camaraActiva ? 'Apagar cámara' : 'Prender cámara'}
              </button>
              {camaraActiva && (
                <button
                  onClick={() => void alternarCamaraFacing()}
                  disabled={estado !== 'activa'}
                  className="rounded-pill border border-border-soft px-5 py-2.5 text-sm text-ink-soft hover:border-amber disabled:opacity-50"
                >
                  Cambiar cámara
                </button>
              )}
              <button
                onClick={cerrar}
                className="rounded-pill bg-red-500/90 px-5 py-2.5 text-sm font-medium text-ink-inverse"
              >
                Cortar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transcripción: además de ser útil para seguir la charla, es la prueba
          visible de que las transcripciones están llegando — que es lo que
          alimenta el fallback a texto (4g) y la memoria.

          Se achicó al llegar la pizarra: con tarjetas en pantalla, esto pasó a
          ser lo secundario. `max-h-40` en vez de `max-h-56`. */}
      <div className="max-h-40 flex-shrink-0 space-y-2 overflow-y-auto border-t border-border-soft px-4 py-3">
        {turnos.length === 0 ? (
          <p className="text-center text-xs text-ink-muted">La transcripción va a aparecer acá.</p>
        ) : (
          turnos.map((t, i) => (
            <div key={i} className={`flex ${t.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-bubble px-3 py-1.5 text-sm ${
                  t.rol === 'usuario' ? 'bg-amber/20 text-amber-soft' : 'bg-surface-raised text-ink'
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
