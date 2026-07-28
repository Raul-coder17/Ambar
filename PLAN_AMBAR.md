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

## Estado

- **Fase 0: validada en vivo** (2026-07-28). Proyecto Supabase `ambar` (ref `zrqcnykrrshpbauhhcef`, región `sa-east-1`). Registro probado end-to-end contra el backend real (signup crea el usuario, el trigger crea su fila en `perfiles`, login con email sin confirmar devuelve el error real de Supabase "Email not confirmed"). Repo en https://github.com/Raul-coder17/Ambar.
- **Fase 1: validada en vivo** (2026-07-28). Migración aplicada contra la base remota, ambas Edge Functions (`manage-ai-key`, `ai-chat`) desplegadas. Flujo completo probado por Raúl contra el backend real: guardar la key de Gemini en Ajustes, y chat de texto funcionando con `gemini-3.1-flash-lite`.
- Password de la base de datos generado por Code durante el setup — **no está guardado en ningún archivo del repo**. Se lo pasé a Raúl en el chat de la sesión donde se creó; si se pierde, se resetea desde el dashboard de Supabase (Project Settings → Database).
- `AI_KEY_ENCRYPTION_SECRET` generado por Code y seteado como secret del proyecto Supabase vía CLI (`supabase secrets set`) — **no está guardado en ningún archivo del repo ni se mostró en el chat**. Es distinto del password de la base de datos: protege las API keys de Gemini/Tavily de todos los usuarios, no solo el acceso de Raúl. Si se pierde no hay forma de recuperarlo (no de resetearlo sin invalidar las keys ya guardadas: un reset requeriría que cada usuario vuelva a guardar su key desde Ajustes).

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

## Decisiones técnicas — Fase 1

- **Cifrado de la key BYOK:** AES-GCM con un secret de 32 bytes (`AI_KEY_ENCRYPTION_SECRET`, generado con `openssl rand -base64 32` y seteado como secret de la Edge Function vía `supabase secrets set` — nunca en el repo, nunca mostrado en el chat). El payload guardado en `ajustes_ia.gemini_api_key_encrypted` es `iv_base64.ciphertext_base64`; se cifra/descifra con `crypto.subtle` (Web Crypto, disponible nativo en Deno). Mismo patrón exacto que `manage-ai-key` de Organizador-IA.
- **Validación de la key:** antes de cifrar y guardar, `manage-ai-key` la prueba contra `GET /v1beta/models` de Gemini — si no es válida, no se guarda nada.
- **Esquema (migración `20260728200000_ajustes_ia.sql`):**
  - `ajustes_ia` (1 fila por usuario): `gemini_api_key_encrypted`, `ia_habilitada`, `cuota_diaria_aprendida` + `cuota_diaria_aprendida_modelo` (la cuota aprendida de un 429 solo vale para el modelo bajo el que se aprendió — si Raúl cambia de modelo, se reaprende sola del próximo 429 real).
  - `ia_uso` (contador diario, día calculado en `America/Los_Angeles` para coincidir con el reset de cuota de Gemini) + RPC `incrementar_uso_ia()` / `uso_ia_hoy()`, ambas `security invoker` (respetan RLS).
  - `ia_llamadas_log` (marca de tiempo por llamada real a Gemini) para el freno de RPM — la Edge Function poda sus propias marcas más viejas que la ventana en cada chequeo.
  - Nombres en español para ser consistentes con `perfiles` (a diferencia de Organizador-IA, que usa `user_ai_settings`/`ai_usage` en inglés).
- **Rate-limiter adaptativo:** dos mecanismos independientes, igual que Organizador-IA:
  - **RPM (15, hardcodeado):** freno proactivo con ventana deslizante de 60s (`decideRpmSlot` en `rpm.ts`, lógica pura). No se "aprende": no hay una forma confiable de derivarlo de un 429 con esa granularidad.
  - **Cuota diaria (aprendida, no hardcodeada en 500):** se lee del propio body del primer 429 real de Gemini (`quotaValue`) y se guarda en `ajustes_ia.cuota_diaria_aprendida`. Preflight: si ya se alcanzó la cuota aprendida de hoy, la Edge Function responde al instante sin gastar una llamada real.
- **Edge Function `ai-chat`:** REST a `gemini-3.1-flash-lite` (`generateContent`), mismo modelo y mismo `thinkingConfig: { thinkingLevel: 'MINIMAL' }` que Organizador-IA (el modelo 3.1 gasta budget de salida razonando por defecto; con function-calling puede agotarlo antes de emitir parts). Loop de hasta 5 turnos.
- **Arquitectura de function-calling (lista, sin tools reales):** `tools.ts` define un registro `TOOLS: Tool[]` (declaración + handler) vacío. `ai-chat/index.ts` arma `tools: [{ functionDeclarations }]` en el payload a Gemini **solo si el registro no está vacío** — con `TOOLS = []` no se manda `tools` en absoluto, así que el loop de despacho existe pero nunca se ejecuta todavía. Fase 3 agrega ahí `buscar_en_internet` (Tavily); Fase 4 (Live) reusa el mismo registro.
- **Historial de chat:** sin persistencia (eso es Fase 2 — memoria). El array de mensajes vive en el estado de React de `ChatScreen` y se manda completo en cada request; se pierde al refrescar la página. No hay reconstrucción de turnos `functionCall`/`functionResponse` entre requests todavía porque no hay acciones que confirmar/cancelar como en Organizador-IA (eso solo aparece junto con tools reales).
- **System instruction:** placeholder mínimo ("Sos Ámbar, el asistente personal del usuario. Respondé siempre en español, de forma breve y clara.") — la personalidad real no está definida en el alcance de esta fase, se revisita cuando se diseñe.
- **Frontend:** sin router todavía (sigue el patrón de Fase 0). `HomeScreen` agregó un toggle de estado simple entre pestañas "Chat" y "Ajustes" — no es la navegación tab-bar real, eso es Fase 7. `ChatScreen` bloquea el input y muestra un aviso si `ia_habilitada` es `false`.
- **Manejo de errores en el cliente:** `supabase-js` descarta el body de una respuesta no-2xx en `error.message` (queda "non-2xx status code"); el mensaje real ya traducido al español se lee de `error.context` (la `Response` cruda). Mismo patrón que `AssistantDrawer`/`SettingsPage` de Organizador-IA.

## Límites de Gemini y manejo de cuota (ya definido, no improvisar aquí)

- **Live:** sin compresión, audio-solo dura 15 min, audio+video 2 min; conexión dura ~10 min. Solución: activar context window compression (ventana deslizante) + session resumption desde el día 1. Ventana de contexto: 128k tokens.
- **Texto (flash-lite):** 500 peticiones/día, 15 RPM en capa gratis — mismo rate-limiter adaptativo que Organizador-IA.
- **Contexto en ambos modos:** RAG (solo lo relevante) + últimos turnos recientes, nunca el historial completo.
- **Fallback:** Live falla por cuota → cae a texto con aviso; texto sin cuota diaria → mensaje claro de cuándo se resetea.
