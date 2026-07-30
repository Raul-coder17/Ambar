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
      // 'prompt': el SW nuevo se instala y se queda esperando; UpdateBanner.tsx
      // decide cuándo avisar y dispara el update — nunca en silencio, para no
      // recargarle la página al usuario a mitad de algo (ver PLAN_AMBAR.md,
      // "Detección de actualización").
      registerType: 'prompt',
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
