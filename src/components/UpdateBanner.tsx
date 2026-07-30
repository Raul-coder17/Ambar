import { useRegisterSW } from 'virtual:pwa-register/react'

// Aviso de "hay una versión nueva" — mismo patrón que Organizador-IA
// (PLAN_AMBAR.md, "Detección de actualización").
//
// Con registerType 'prompt' (vite.config.ts) el SW nuevo instala y se queda
// esperando; nunca se activa solo. `useRegisterSW` nos avisa de eso vía
// `needRefresh`, y `updateServiceWorker(true)` es quien manda el postMessage
// SKIP_WAITING que el SW generado por Workbox ya sabe escuchar de fábrica
// (no hace falta un service worker propio para esto) — al terminar
// 'activate', recarga la página sin que el usuario tenga que cerrar la app.
//
// "Ahora no" no rechaza el update, solo oculta el aviso: el SW nuevo sigue
// esperando y basta recargar (o cerrar y volver a abrir) para que se aplique.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-40 flex w-[min(360px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-card border border-border-soft bg-surface px-4 py-3 shadow-lg shadow-black/30"
    >
      <span className="flex-1 text-sm text-ink">Hay una versión nueva de Ámbar.</span>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="shrink-0 text-xs text-ink-muted hover:text-ink-soft"
      >
        Ahora no
      </button>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-input bg-amber px-3 py-1.5 text-xs font-medium text-ink-inverse"
      >
        Actualizar
      </button>
    </div>
  )
}
