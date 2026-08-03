/// <reference lib="webworker" />
//
// Service worker propio (estrategia injectManifest de vite-plugin-pwa).
// Además del precache de Workbox, maneja las notificaciones Web Push.
// Payload y botones de acción reales llegan recién en Fase 5 (objetivos
// vigilados) — acá sólo la infraestructura genérica (título/cuerpo/url).

import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[]
}

// Punto de inyección del manifiesto de precache (lo completa el build).
precacheAndRoute(self.__WB_MANIFEST)

// Toma control cuanto antes para que la app recién cargada ya tenga SW activo.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// No hay skipWaiting() automático en 'install': con registerType 'prompt' el SW
// nuevo se queda a propósito en estado "esperando" hasta que la UI (ver
// UpdateBanner.tsx) avise al usuario y este confirme. Recién ahí
// virtual:pwa-register/react manda este mensaje para pasar a 'activate' sin
// tener que cerrar todas las pestañas.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

// Notificación push: el payload viene como JSON desde la Edge Function con
// { title, body, url, tag }. Si no se puede parsear, mostramos un texto
// genérico.
self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title ?? 'Ámbar'
  const body = payload.body ?? 'Tenés una notificación nueva.'
  const url = payload.url ?? '/'
  const tag = payload.tag ?? 'ambar'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url },
      tag,
    }),
  )
})

// Click en el cuerpo de la notificación: enfoca una pestaña abierta de la app
// (navegándola a la url del payload) o abre una nueva.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data?.url as string) ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
