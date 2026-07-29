// Pantalla del modo Live. UI mínima de 4c: conectar, hablar, escuchar,
// silenciar, cerrar.
//
// Sin cámara (4f) y sin reconexión (4e): si la conexión se cae, se muestra el
// motivo y se vuelve a abrir a mano.
//
// El aviso de la pantalla no es decorativo. En iOS, bloquear la pantalla
// suspende el AudioContext y la sesión se queda muda; el Wake Lock lo evita
// mientras el navegador lo permita, pero no está en todos lados y el sistema
// puede soltarlo igual. Decírselo al usuario es la única garantía real.

import { useLiveSession } from './useLiveSession'

export function LiveScreen({ onCerrar }: { onCerrar: () => void }) {
  const { estado, error, silenciado, turnos, hablando, abrir, cerrar, alternarSilencio } = useLiveSession()

  async function handleSalir() {
    await cerrar()
    onCerrar()
  }

  const leyenda =
    estado === 'conectando'
      ? 'Conectando…'
      : estado === 'activa'
        ? hablando
          ? 'Ámbar está hablando'
          : silenciado
            ? 'Micrófono silenciado'
            : 'Te escucho'
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
              : estado === 'conectando'
                ? 'animate-pulse bg-slate-800 ring-4 ring-slate-700'
                : 'bg-slate-900 ring-4 ring-slate-800'
          }`}
        >
          <span className="text-3xl">{silenciado && estado === 'activa' ? '🔇' : '🎙️'}</span>
        </div>

        <p className="text-sm text-slate-400">{leyenda}</p>

        {error && <p className="max-w-xs text-center text-sm text-red-400">{error}</p>}

        {estado === 'activa' && (
          <p className="max-w-xs text-center text-xs text-slate-500">
            Mantené la pantalla encendida: si se bloquea, el audio puede cortarse.
          </p>
        )}

        <div className="flex gap-3">
          {estado === 'inactiva' || estado === 'error' ? (
            <button
              onClick={abrir}
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
