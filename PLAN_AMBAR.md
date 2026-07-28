# Ámbar — Plan de implementación

> Asistente de voz PWA, independiente de Misaribot y de Organizador-IA. Este documento es la fuente de verdad del proyecto: toda sesión nueva de Claude Code debe leerlo primero.

## Reglas de trabajo (aplican a todo el proyecto)

- Un ítem a la vez. No avanzar al siguiente sin confirmación explícita de Raúl.
- Para bugs o comportamiento inesperado: diagnóstico primero (investigar y reportar causa raíz sin tocar código) → decidir juntos → luz verde explícita antes de implementar.
- Cambios quirúrgicos: no tocar lógica que no se pidió.
- Checkpoint de git antes de cambios riesgosos.
- Ante ambigüedad, parar y preguntar — nunca improvisar.
- Documentación dual siempre: este `.md` actualizado + espacio de Notion en paralelo.
- Nada se marca "Hecho" sin validación en vivo (probado de verdad, no solo revisado en el código).
- Acciones de CLI/deploy (`supabase functions deploy`, etc.): Code las corre directamente y reporta al terminar, en vez de pedirle a Raúl que las pegue en una terminal.

## Objetivo

Asistente de voz PWA multi-usuario, con personalidad, memoria persistente y capacidad de investigar en internet. Cada usuario usa su propia clave de API (BYOK). Dos modos de conversación que comparten el mismo historial y memoria: **Live** (Gemini Live — audio nativo, cámara, tool-calling) y **texto** (gemini-3.1-flash-lite — respuestas rápidas).

## Alcance actual — qué SÍ y qué NO

**Sí, para esta primera versión:**
- Auth + BYOK (claves cifradas en Supabase)
- Modo texto y modo Live, ambos con tool-calling
- Memoria: hechos estructurados + RAG por vectores (pgvector)
- Búsqueda web vía Tavily
- Objetivos vigilados (scheduled actions vía pg_cron)
- Check-in diario opcional
- UI completa: Home (chat + FAB Live), Historial, Memoria, Objetivos, Ajustes

**NO por ahora (fuera de alcance, no diseñar para esto todavía):**
- Conexión con otras apps de Raúl (Organizador-IA, SmartHome Pro, SpendWise)
- Cambiar de personalidad a media conversación
- Herramientas adicionales del backlog (Jina Reader, Wolfram Alpha, OpenWeatherMap, GNews/NewsAPI) — se agregan después de que el núcleo funcione, mismo patrón BYOK/tool

## Stack

- **Frontend:** PWA — React + TypeScript + Vite + Tailwind (mismo patrón que Organizador-IA)
- **Backend:** Supabase (Auth + Postgres + pgvector + Edge Functions + pg_cron)
- **Modelo Live:** Gemini Live API (audio nativo, cámara, tool-calling)
- **Modelo texto:** gemini-3.1-flash-lite (mismos límites que Organizador-IA: 500 peticiones/día, 15 RPM en capa gratis)
- **Búsqueda web:** Tavily (BYOK, capa gratis ~1,000/mes)
- **BYOK:** todas las claves de servicios externas cifradas en Supabase, nunca expuestas directo al cliente

## Arquitectura general

- Cliente PWA ↔ Supabase (Auth, Postgres, pgvector) para todo el estado de la app
- Modo Live: Edge Function genera un token efímero a partir de la clave cifrada del usuario; el cliente abre la conexión WebSocket de Gemini Live con ese token (la clave real nunca llega al cliente)
- Modo texto: Edge Function hace la llamada REST a Gemini con la clave descifrada, mismo patrón que Organizador-IA
- Tools (Tavily, etc.): viven en Edge Functions, se llaman igual desde modo Live que desde modo texto — mismo código, dos entradas
- Objetivos vigilados: `pg_cron` dispara una Edge Function periódica que consulta Tavily y notifica solo si hay novedad

## Fases de implementación (orden sugerido)

### Fase 0 — Setup base
- Repo, estructura PWA (Vite+React+TS+Tailwind), configuración de PWA (manifest, service worker básico)
- Proyecto Supabase nuevo: Auth, schema inicial (usuarios, perfiles)
- Registro/login básico
- Documentación inicial: este `.md` + espacio en Notion

### Fase 1 — Modo texto + tool-calling básico
- Chat de texto funcional con gemini-3.1-flash-lite vía Edge Function
- BYOK: UI para que el usuario guarde su clave de Gemini (cifrada)
- Function-calling básico (aunque sea sin tools reales todavía, dejar la arquitectura lista)
- Rate-limiter adaptativo (reusar el patrón de Organizador-IA)
- Se elige empezar aquí porque es la arquitectura más simple — valida BYOK, Edge Functions y tool-calling antes de meterle la complejidad de streaming de Live

### Fase 2 — Memoria
- Esquema pgvector: tabla de embeddings de conversación (RAG)
- Tabla de hechos estructurados (nombre, preferencias, cosas recurrentes) que se actualiza conforme avanza la charla
- Integrar ambas fuentes de memoria al armar el contexto de cada request (nunca mandar historial completo)

### Fase 3 — Búsqueda web (Tavily)
- Primera tool real: `buscar_en_internet(query)`
- BYOK para clave de Tavily
- Validar en vivo con el modo texto antes de pasar a Live

### Fase 4 — Modo Live (Gemini Live)
- Conexión WebSocket, audio nativo
- Activar **context window compression** y **session resumption** desde el inicio (no como afterthought)
- Cámara/video
- Reusar las mismas tools (Tavily) ya construidas en Fase 3
- Bloquear en cliente más de 1 sesión Live activa por usuario
- Fallback automático a modo texto si Live falla por cuota/límite de sesión

### Fase 5 — Objetivos vigilados (scheduled actions)
- Esquema de "objetivos" (activo/pausado, qué vigilar, frecuencia)
- `pg_cron` + Edge Function que corre la consulta y notifica por push solo si hay novedad
- Vista "Objetivos" en la UI

### Fase 6 — Check-in diario
- Modo opcional de reflexión diaria, guardado en memoria vectorial
- Resumen semanal

### Fase 7 — UI/UX completo
- Home: chat de texto + FAB flotante para Live
- Vistas de Historial, Memoria (editable), Ajustes
- Navegación tab bar (patrón AppShell de Organizador-IA)
- Modo oscuro + acento propio (color a definir/confirmar con Raúl antes de esta fase, puede cambiar)

### Fase 8 — Backlog de herramientas adicionales
- Jina Reader, Wolfram Alpha, OpenWeatherMap, GNews/NewsAPI — mismo patrón BYOK/tool, una a la vez

## Decisiones técnicas — Fase 0

- **Package manager:** npm (viene con el Node del sistema, sin justificación para pnpm/yarn todavía).
- **Tailwind v4** vía `@tailwindcss/vite` (sin `tailwind.config.js`, todo por CSS-first config — no se necesitó tocar nada extra, `@import "tailwindcss";` en `src/index.css` basta).
- **PWA** vía `vite-plugin-pwa`, `registerType: 'autoUpdate'`, estrategia `generateSW` (default del plugin). Esto ya genera un service worker con precache de los assets del build — es el mínimo de un PWA instalable, no hay lógica de runtime caching para llamadas a la API ni estrategia offline custom todavía (eso es de una fase posterior si se decide).
- **Icono:** placeholder SVG simple en `public/icon.svg` (círculo ámbar sobre fondo oscuro) — reemplazar cuando haya identidad visual definida (Fase 7 menciona definir acento de color).
- **Estructura de carpetas:**
  ```
  src/
    lib/
      supabase.ts        # cliente único de Supabase, lee VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    features/
      auth/
        AuthContext.tsx  # provider de sesión (supabase.auth.getSession + onAuthStateChange)
        AuthScreen.tsx   # login/registro con email+password, un solo form que alterna modo
      home/
        HomeScreen.tsx   # placeholder post-login, se reemplaza en Fase 7 por el Home real (chat + FAB Live)
    App.tsx              # Gate: AuthProvider + render condicional (AuthScreen vs HomeScreen)
  ```
  Se eligió `features/` en vez de `components/` plano porque el plan ya anticipa varias áreas (auth, chat, memoria, objetivos) que van a crecer cada una con su propia lógica — mejor separarlas desde ahora que reorganizar después.
- **Auth:** email + password (no magic link) — más simple de probar en Fase 0, sin dependencia de que llegue un correo. Se puede añadir magic link/OAuth después sin romper nada porque `AuthScreen` es la única pieza que sabe cómo autenticar.
- **Router:** `react-router-dom` instalado desde ya (está en el stack por las fases futuras de UI con tab bar), pero **no está wireado todavía** — Fase 0 usa un simple `if (session)` porque solo hay dos pantallas.
- **Git:** repo local + remoto en GitHub (`<pendiente URL>`).
- **Supabase:** proyecto creado vía CLI (`npx supabase`) con un Personal Access Token del usuario, no vía dashboard manual.
- **Notion:** pospuesto — no se creó espacio en esta fase, este `.md` es la única fuente de verdad por ahora.

## Límites de Gemini y manejo de cuota (ya definido, no improvisar aquí)

- **Live:** sin compresión, audio-solo dura 15 min, audio+video 2 min; conexión dura ~10 min. Solución: activar context window compression (ventana deslizante) + session resumption desde el día 1. Ventana de contexto: 128k tokens.
- **Texto (flash-lite):** 500 peticiones/día, 15 RPM en capa gratis — mismo rate-limiter adaptativo que Organizador-IA.
- **Contexto en ambos modos:** RAG (solo lo relevante) + últimos turnos recientes, nunca el historial completo.
- **Fallback:** Live falla por cuota → cae a texto con aviso; texto sin cuota diaria → mensaje claro de cuándo se resetea.
