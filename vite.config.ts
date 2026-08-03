import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: SW propio (src/sw.ts) — necesario para manejar los
      // eventos 'push' y 'notificationclick' de las notificaciones push, algo
      // que el SW autogenerado por generateSW no permite (ver PLAN_AMBAR.md,
      // "Push notifications — infraestructura"). Mismo patrón que Organizador-IA.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt': el SW nuevo se instala y se queda esperando; UpdateBanner.tsx
      // decide cuándo avisar y dispara el update — nunca en silencio, para no
      // recargarle la página al usuario a mitad de algo (ver PLAN_AMBAR.md,
      // "Detección de actualización"). Con injectManifest el listener de
      // SKIP_WAITING ya no lo da Workbox gratis: está a mano en sw.ts.
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
      // Registra el SW también en `npm run dev`: sin esto, en dev no hay SW
      // activo y las llamadas a `navigator.serviceWorker.ready` cuelgan para
      // siempre (mismo motivo que en Organizador-IA).
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'Ámbar',
        short_name: 'Ámbar',
        description: 'Asistente de voz personal',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
