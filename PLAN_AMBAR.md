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
- **Fase 2: implementada y desplegada, PENDIENTE de validación en vivo** (2026-07-28). Migración `20260728230000_memoria.sql` aplicada contra la base remota (pgvector habilitado, `memoria_vectorial` y `memoria_hechos` creadas con RLS, RPC `buscar_memoria_vectorial` verificada aceptando un vector de 768 dimensiones vía PostgREST) y `ai-chat` redesplegada con los cinco módulos. Falta lo que la marca como Hecha: que Raúl compruebe en vivo que (1) contarle un dato personal lo guarda en `memoria_hechos`, (2) ese dato se usa en un mensaje posterior, y (3) un tema hablado antes vuelve por RAG en una conversación nueva.
- **Fase 3: implementada y desplegada, PENDIENTE de validación en vivo** (2026-07-28). Migración `20260728240000_tavily.sql` aplicada contra la base remota (columna `tavily_api_key_encrypted` en `ajustes_ia`), `manage-ai-key` y `ai-chat` redesplegadas. Ambas respondieron 401 a un smoke test sin auth (arrancaron bien, sin error de boot). Falta lo que la marca como Hecha: que Raúl guarde su key de Tavily en Ajustes y le pida a Ámbar algo que necesite información actual, y confirme que (1) la tool se dispara, (2) trae resultados reales, y (3) si la key falta o es inválida el asistente lo explica en vez de fallar en silencio.
- **Fase 4d: implementada y desplegada, PENDIENTE de validación en vivo** (2026-07-28). `live` redesplegada con `TOOLS_HABILITADAS = true` y la acción `tool`; smoke test sin auth devolvió 401 (arrancó bien, sin error de boot). `tsc --noEmit` sin errores en el cliente. Falta lo que la marca como Hecha: que Raúl abra el modo voz y confirme que (1) pedirle a Ámbar que busque algo la hace avisar en voz antes de buscar y después responder con el resultado real, (2) contarle un dato personal de pasada lo guarda en `memoria_hechos` igual que en modo texto, y (3) la sesión no se cuelga esperando una respuesta si algo de lo anterior falla.
- **Fase 4e: implementada y desplegada, PENDIENTE de validación en vivo** (2026-07-28). `live` redesplegada con la persistencia de `handle` en `abrir`; smoke test sin auth devolvió 401 (arrancó bien, sin error de boot). `tsc --noEmit` sin errores en el cliente. Falta lo que la marca como Hecha: que Raúl mantenga una sesión de voz abierta más de 30 minutos y confirme que (1) al recibir un `goAway` la charla sigue sin corte perceptible, (2) forzar un corte de red (o esperar un cierre real del socket) dispara "Reconectando…" en la UI y la sesión vuelve sola con backoff, (3) una sesión de más de ~30 min sigue reconectando bien tras pedir un token nuevo, y (4) si se agotan los reintentos, la sesión se cierra con un mensaje claro en vez de quedar colgada o mostrando pantalla en blanco.
- **Fase 4f: implementada, PENDIENTE de validación en vivo** (2026-07-28). Sólo cliente — no tocó ninguna Edge Function ni migración, así que no hubo nada que desplegar. `tsc --noEmit` sin errores. Falta lo que la marca como Hecha: que Raúl abra una sesión de voz, prenda la cámara con el toggle y confirme que (1) sólo se puede prender con la sesión activa, (2) Ámbar reacciona de verdad a lo que ve, (3) cambiar de pestaña la apaga sola y no vuelve a prenderse sola al volver, y (4) la franja "Cámara activa" es un indicador claro en el uso real.
- **Fase 4g: implementada y desplegada, PENDIENTE de validación en vivo** (2026-07-28). Migración `20260729010000_forzar_sesion_live.sql` aplicada contra la base remota, `live` redesplegada con soporte para `forzar` en `abrir`. `tsc -b` sin errores en el cliente. Ver "Decisiones técnicas — Fase 4g" para el detalle completo (historial compartido, fallback a texto, y el flujo de `sesion_activa`/forzar).
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

## Decisiones técnicas — Fase 2

- **Modelo de embeddings: `gemini-embedding-2`, 768 dimensiones**, vía `:embedContent` con la MISMA key BYOK de Gemini que ya guarda el usuario (es otro modelo del mismo proveedor: no se agregó una key nueva). Dos motivos para el modelo: es el actual (reemplaza a `gemini-embedding-001`) y **renormaliza solo** cuando se piden menos dimensiones que las 3072 por defecto — el `001` obligaba a normalizar a mano. Y dos para las 768: es una de las tres medidas recomendadas por Google (768/1536/3072) y el límite de pgvector para índices HNSW/ivfflat es **2000 dimensiones**, así que con las 3072 por defecto no habría forma de indexar sin pasar el tipo a `halfvec`.
- **`taskType` asimétrico:** `RETRIEVAL_QUERY` al embeber lo que el usuario acaba de escribir, `RETRIEVAL_DOCUMENT` al guardar el intercambio. Gemini entrena los dos lados por separado y mezclarlos degrada la similitud.
- **Los embeddings NO cuentan en `ia_uso` ni en `ia_llamadas_log`.** Esos contadores miden el RPD/RPM de `gemini-3.1-flash-lite`; el modelo de embeddings tiene su propia cuota. Consecuencia práctica: un 429 del endpoint de embeddings no dice nada del presupuesto de mensajes del chat, así que no se traduce al español ni se le muestra al usuario — se loguea y listo.
- **Toda la memoria es best-effort.** `embeddings.ts` no propaga ninguna excepción hacia arriba: devuelve `null` y loguea. Si el endpoint está caído, sin cuota o devuelve basura, el chat contesta igual, sólo que sin RAG en ese turno. La memoria es un extra sobre la conversación, no un requisito de ella.
- **Esquema (migración `20260728230000_memoria.sql`):**
  - `create extension vector with schema extensions` (convención de Supabase, no en `public`). Por eso el tipo va calificado como `extensions.vector` en todos lados: `public` es el único schema garantizado en el `search_path` de las funciones.
  - `memoria_vectorial` (`id`, `user_id`, `contenido`, `embedding extensions.vector(768)` **nullable**, `created_at`). El embedding es nullable a propósito: si falla el endpoint, el texto del intercambio se guarda igual y sólo se pierde la búsqueda por similitud sobre esa fila — perder el texto sería peor que perder el vector. Índice HNSW `vector_cosine_ops` **parcial** (`where embedding is not null`) para no indexar esas filas.
  - `memoria_hechos` (`id`, `user_id`, `hecho`, `categoria` opcional y libre, `created_at`, `updated_at` con el trigger `set_updated_at` que ya existía de Fase 1). Índice **único** en `(user_id, lower(btrim(hecho)))`: la primera línea de defensa contra duplicados es el contexto (el modelo ve los hechos que ya existen antes de proponer uno nuevo), el índice es el respaldo para que "Se llama Raúl" y "se llama Raúl " no terminen como dos filas.
  - RPC `buscar_memoria_vectorial(consulta, limite)`, `security invoker` (respeta RLS) — el operador `<=>` no se puede expresar desde `supabase-js`. Devuelve `similitud` (1 − distancia coseno, o sea 1 = idéntico) en vez de la distancia cruda, para que razonar con "más alto es más parecido" no genere errores de signo. El `limite` se clampea a 20 en el SQL.
  - RLS igual que `ajustes_ia`: las 4 policies (`select`/`insert`/`update`/`delete`) contra `auth.uid()` en ambas tablas.
- **Cómo se arma el contexto** (`memoria.ts`, lógica pura, sin I/O). Antes se mandaba el historial COMPLETO en cada request. Ahora son tres piezas de distinta naturaleza:
  - **(a) Hechos** — pocos y estables, van **todos** y **siempre**. No se buscan.
  - **(b) Recuerdos** — top-K por similitud coseno contra el último mensaje del usuario. `TOP_K = 5` **más un umbral de `UMBRAL_SIMILITUD = 0.6`**. El top-K solo no alcanza: la búsqueda siempre devuelve los K más parecidos aunque el más parecido no tenga nada que ver, y sin umbral un "hola" arrastra cinco fragmentos al azar de charlas viejas. El 0.6 es un punto de partida conservador para ajustar con uso real, no un número derivado de nada.
  - **(c) Turnos recientes** — los últimos `TURNOS_RECIENTES = 8` mensajes (unos 4 intercambios). Después del recorte se descartan los mensajes de asistente que hayan quedado al principio: Gemini espera que `contents` arranque con un turno del usuario.
  - (a) y (b) van en la **system instruction**, no en `contents`: son datos *sobre* el usuario, no cosas que él haya dicho en este chat. Meterlos como turnos falsos haría que el modelo los cite como si acabaran de decirse. El texto del bloque se lo dice explícitamente ("son recuerdos tuyos, no cosas que se hayan dicho recién").
- **Qué se guarda en `memoria_vectorial`: el intercambio completo** (`Usuario: … / Ámbar: …`), no cada mensaje por separado. Un embedding de "sí, dale" suelto no se parece a nada ni recupera nada útil; con pregunta y respuesta juntas el vector representa el TEMA que se tocó, que es lo que se quiere poder recuperar meses después. Sólo se guarda cuando hubo respuesta de verdad: los avisos de cuota o de `finishReason` no son conversación.
- **La escritura va en segundo plano** con `EdgeRuntime.waitUntil()` (patrón de background task de Supabase), después de haberle contestado al usuario — así el embedding del intercambio no se paga en latencia del chat. Hay fallback para cuando la función corre fuera de Supabase.
- **Extracción de hechos: tool `recordar_hecho`, NO una segunda llamada a Gemini.** Es el patrón de `ai-assistant/actions.ts` de Organizador-IA (el modelo emite una function call y se sanean los args antes de tocar la base, porque el enum de la declaración no garantiza nada). Se descartó la alternativa de una pasada aparte con `responseMimeType: application/json` + `responseSchema` (el patrón de `extract-from-photo`) porque costaría una llamada a Gemini por **cada** mensaje: partiría al medio la cuota diaria de flash-lite y pesaría sobre el freno de 15 RPM. Con la tool se gasta un turno extra sólo cuando hay algo que anotar.
  - La ventaja de fondo que la pasada aparte no tenía: los hechos ya guardados van en la system instruction **de este mismo request**, así que el modelo está mirando la lista cuando decide. No vuelve a proponer algo que ya está, y sabe qué texto exacto pasar en `reemplaza`.
  - `reemplaza` (opcional) es cómo se **actualiza** un hecho viejo: lleva el texto exacto del anterior, copiado de la lista que el modelo tiene a la vista. Casos resueltos en el handler: el hecho ya existía (no se hace nada); existía y además venía a reemplazar a otro (se borra el obsoleto, porque "renombrar" la fila vieja chocaría con el índice único); reemplaza a uno existente (update, sin perder la categoría si el modelo la omitió en la corrección); no existe (insert, con el `23505` de una carrera tratado como "ya estaba").
  - Los hechos del usuario se traen enteros para comparar en JS en vez de consultar uno por uno: son pocos (ya van todos en cada request) y así se evita un `ilike` con el texto crudo del modelo, donde un `%` se volvería un comodín. `clave()` en `memoria.ts` replica a propósito el `lower(btrim(hecho))` del índice único — si los dos criterios se desalinearan, el insert se comería un 23505 justo cuando el chequeo previo dijo que no había duplicado.
- **Sin tabla de mensajes todavía.** Los turnos recientes siguen saliendo del array que manda el cliente (se pierde al refrescar, igual que en Fase 1); la Edge Function ahora lo recorta en vez de mandarlo entero. No se perdió nada de valor: `memoria_vectorial` guarda el texto de cada intercambio, así que la vista Historial de Fase 7 puede construirse sobre eso o sobre su propia tabla cuando toque.
- **Sin UI nueva.** Fase 2 es sólo backend; la vista Memoria (editable) es de Fase 7. Hoy no hay forma de ver ni borrar un hecho desde la app — sólo desde el dashboard de Supabase.
- **Pendientes conocidos que NO se hicieron acá:** (1) `memoria_vectorial` crece sin límite, no hay poda ni resumen de lo viejo; (2) no hay forma de que el usuario le diga a Ámbar "olvidate de esto" (`reemplaza` cubre corregir, no borrar); (3) `UMBRAL_SIMILITUD` y `TURNOS_RECIENTES` están sin calibrar contra uso real; (4) los módulos puros (`memoria.ts`) no tienen tests, siguiendo lo que ya venía haciendo Ámbar — Organizador-IA sí testea los suyos con `deno test`.

## Decisiones técnicas — Fase 3

- **`manage-ai-key` se extendió en vez de crear una función nueva.** El body ahora acepta `provider: 'gemini' | 'tavily'` (default `'gemini'`, por compatibilidad con el cliente de Fase 1 que no lo manda). Un solo lugar sabe cómo cifrar y tocar `ajustes_ia`, en vez de duplicar CORS/auth/cifrado en `manage-tavily-key`. La rama de cada provider solo decide qué columna(s) escribe:
  - `gemini`: valida contra `GET /v1beta/models` antes de cifrar, y su upsert incluye `ia_habilitada` (gatea si el chat corre en absoluto).
  - `tavily`: **no se valida al guardar** — Tavily no tiene un endpoint de "solo probar la key" sin gastar una búsqueda real contra `/search`, y no vale la pena pagar esa unidad de cuota (~1000/mes gratis) solo para validar. Si la key es inválida, `buscar_en_internet` lo va a reportar con un mensaje claro la primera vez que se use de verdad — ya estaba en el alcance pedido ("manejo de error claro"), así que no hacía falta la validación anticipada para cumplirlo.
  - Consecuencia de que Tavily no tenga su propio flag de habilitación: guardar/quitar su key nunca toca `gemini_api_key_encrypted` ni `ia_habilitada` — el upsert de cada provider solo lista sus propias columnas, así que Postgres deja las demás intactas (`ON CONFLICT DO UPDATE` parcial).
- **Esquema (migración `20260728240000_tavily.sql`):** una sola columna nueva, `ajustes_ia.tavily_api_key_encrypted` (misma tabla que Gemini, mismo patrón de cifrado). Sin columna de habilitación: la tool chequea directamente si la columna es `NULL`.
- **Descifrado factorizado a `ai-chat/crypto.ts`.** Hasta Fase 2, `decryptApiKey` vivía inline en `index.ts` (la única llamadora). Ahora `tools.ts` también necesita descifrar — la key de Tavily de un usuario dentro del handler de la tool — así que se movió a un módulo compartido dentro del mismo bundle de la función, en vez de duplicar el cifrado AES-GCM en dos archivos.
- **`buscar_en_internet` recibe el `encryptionSecret` por `ToolContext`, no lo lee de `Deno.env` directamente.** Mismo criterio que ya regía para `supabase` y `userId`: las tools reciben sus dependencias inyectadas desde `index.ts` en vez de ir a buscarlas por su cuenta, así el registro de tools no asume que corre dentro de un `Deno.serve` con acceso directo al entorno.
- **`buscar_en_internet` NO usa el patrón best-effort de `embeddings.ts`.** La memoria vectorial es un extra de fondo que nunca debe romper el chat si falla; buscar en internet es un pedido explícito del modelo (una function call), así que si falla tiene que enterarse con un motivo claro — para poder explicárselo al usuario — en vez de que el error se trague en silencio y el modelo invente una respuesta. Por eso `tavily.ts` devuelve `{ ok: false, error }` en vez de `null`, y ese objeto se manda tal cual como `functionResponse`.
- **Parámetros de la búsqueda:** `max_results: 5`. **Autenticación contra Tavily:** header `Authorization: Bearer <key>`, no `api_key` en el body (es la forma vigente de la API de Tavily; poner la key en el body es el patrón viejo).
- **Sin UI de "probar la búsqueda" en Ajustes.** El campo de Tavily es guardar/quitar nomás, igual que Gemini — no hay una acción de "buscar algo de prueba" desde Ajustes; eso se valida desde el chat.
- **Pendiente conocido:** igual que con Gemini, si el usuario nunca guardó una key de Tavily, la tool sigue estando declarada y Gemini puede intentar llamarla igual — el handler responde con el mensaje de "no tenés key configurada" en vez de que el registro la oculte condicionalmente. Se decidió así por simplicidad (el registro de tools no tiene lógica hoy de "tools condicionales por usuario"); si en el futuro hay más tools opcionales por BYOK, puede valer la pena filtrar `toolDeclarations()` por lo que el usuario tiene configurado.

### Ajustes de calidad post-validación en vivo (2026-07-28)

La primera prueba en vivo mostró un problema real: al preguntar por el lanzamiento y precio de un juego, Ámbar contestó "no hay información oficial" cuando el dato SÍ existía y era buscable — recién lo encontró cuando Raúl insistió y le pidió que buscara mejor. Diagnóstico: la búsqueda era demasiado superficial y el modelo se conformaba con el primer intento. Cuatro ajustes, sin tocar la arquitectura de la tool (BYOK y manejo de errores ya validados):

- **`search_depth: 'advanced'`** en vez de `'basic'` (en `tavily.ts`). Mejor extracción de contenido por parte de Tavily — menos probable que un precio o una fecha puntual se pierdan del resumen. Consume más cuota por búsqueda, pero el free tier (~1000/mes) da margen de sobra para este uso.
- **Truncado de contenido subido de 500 a 2000 caracteres** (`MAX_LARGO_CONTENIDO` en `tavily.ts`). 500 resultaba demasiado corto en la práctica: cortaba el `content` de Tavily antes del dato puntual, que no siempre viene al principio del extracto.
- **Instrucción explícita de reintentar la búsqueda**, agregada a `SYSTEM_INSTRUCTION_BASE` en `index.ts` (no a la description de la tool): para preguntas sobre fechas, precios, lanzamientos o eventos recientes, si la primera búsqueda no responde con confianza, el modelo tiene que reformular la consulta (términos distintos, agregar el año actual) y buscar de nuevo antes de concluir que no hay información. Va en la system instruction y no en la tool porque es una regla de CÓMO responder una vez que ya decidió buscar, no de CUÁNDO llamar a la tool.
- **Fecha actual del sistema en la system instruction** (`fechaActual()` en `index.ts`, formateada en español vía `Intl`, zona UTC). Sin esto el modelo asume el año de su corte de entrenamiento al razonar sobre "el año actual" — necesario tanto para responder bien como para reformular búsquedas con el año correcto.

Mismo patrón de falta de proactividad apareció con `recordar_hecho` (Fase 2): al contarle de pasada que un juego es su favorito, Ámbar no lo guardó — recién lo hizo cuando Raúl se lo pidió explícitamente ("no se te olvide que..."). El objetivo de la memoria es que lo reconozca sola.

- **Sección nueva en `SYSTEM_INSTRUCTION_BASE`** (no se tocó la description de la tool en `tools.ts`, que ya tenía esta guía y no alcanzó): instruye a llamar `recordar_hecho` por cuenta propia apenas aparece una preferencia (gustos, disgustos, favoritos) o un dato personal durable, sin esperar a que el usuario lo pida. Con 3 ejemplos concretos que SÍ deberían disparar el guardado ("mi juego favorito es tal", "siempre hago tal cosa los domingos", "no me gusta tal otra") y una aclaración de qué NO guardar: estados transitorios de un solo momento que dejan de ser ciertos después de la charla ("hoy ando cansado", "se me antoja pizza ahorita"). Mismo razonamiento que con `buscar_en_internet`: la system instruction pesa más que la description de una tool para este tipo de guía de comportamiento, así que reforzar ahí es el remedio, no cambiar `reemplaza` ni el resto del handler.

## Decisiones técnicas — Fase 4d

- **`TOOLS_HABILITADAS = true`** en `live/index.ts` — era la única línea pendiente, tal como quedó documentado en 4b: ahora hay quien conteste un `toolCall`, así que declarar las tools en el token ya no deja la sesión colgada.
- **Acción nueva `tool` en la misma Edge Function `live`**, no una función aparte — mismo criterio que ya regía para `abrir`/`latir`/`cerrar`: un solo lugar con el bloque de CORS/auth. Recibe `{action:'tool', name, args}`, arma el mismo `ToolContext {supabase, userId, encryptionSecret}` que usa `ai-chat`, llama `findTool(name)` y ejecuta `tool.handler()`. Responde `{result}` en éxito o `{error}` si la tool no existe o el handler tira.
- **Por qué la ejecución vive en el servidor y no en el navegador**: `recordar_hecho` y `buscar_en_internet` tocan la base y descifran keys BYOK con el `encryptionSecret` — igual que en modo texto, esa lógica no puede vivir en el cliente. El WebSocket de audio sigue yendo directo navegador↔Google (eso no cambió); sólo el tramo de tools pasa por Supabase.
- **`action:'tool'` NO valida `session_id` contra el lock de `sesiones_live`.** La RLS de Postgres ya escopea todo al usuario dueño del JWT (mismo mecanismo que protege `ai-chat`), así que cruzar contra el lock no agregaría seguridad — sólo sería higiene, y esa parte ya la cubre el tope de tool calls del lado del cliente.
- **Cliente (`useLiveSession.ts`): `alMensaje` reacciona a `m.toolCall`.** Un `toolCall` puede traer varias `functionCalls` juntas; se ejecutan todas con `Promise.all` (un POST a `live` por cada una) y se responden juntas con `session.sendToolResponse({ functionResponses })`, cada una con el `id` que Gemini mandó — es lo que usa para matchear respuesta con pedido. Modo texto no necesita este matching (ahí no hay más de una call pendiente a la vez dentro del mismo request), pero Live sí.
- **Si el POST a `live` falla** (red, 500, tool desconocida), se responde igual con un `functionResponse` de error en vez de dejar a Gemini esperando — un `toolCall` sin respuesta cuelga la sesión, y en voz eso se percibe como que Ámbar se quedó mudo.
- **Tope de 30 tool calls por sesión, sólo del lado del cliente** (`toolCallsRef`, se resetea en cada `abrir()`) — higiene, no seguridad, tal como se pidió: no hay tabla ni columna nueva en Supabase para esto. Al superarlo, las llamadas siguientes se resuelven localmente con un `functionResponse` de error sin pegarle al servidor; la sesión de voz sigue abierta, sólo se cortan las tools.
- **La instrucción de avisar en voz antes de una tool lenta ya estaba** en `INSTRUCCION_ESTILO_VOZ` (`prompt.ts`, agregada en la Fase 4 original) con `buscar_en_internet` como ejemplo explícito — no hizo falta tocarla para 4d.
- **Pendiente conocido:** el tope de 30 y el criterio de "higiene, no seguridad" quedan sin validar en vivo con una sesión real que dispare varias tools seguidas — eso es parte de la validación en vivo de esta fase, no algo resuelto en el código.

## Decisiones técnicas — Fase 4e

- **`contextWindowCompression: { slidingWindow: {} }` no se tocó** — ya estaba fijado en el token desde Fase 4b (`buildSetup()` en `live/index.ts`), tal como pedía el plan original ("activar desde el inicio, no como afterthought"). Esta fase sólo lo confirmó, no lo modificó.
- **El esquema de `sesiones_live` (migración de 4b) ya traía media Fase 4e resuelta sin saberlo**: la columna `resumption_handle`, la RPC `latir_sesion_live(session_id, handle)` (ya aceptaba un handle opcional) y que `reclamar_sesion_live` devolviera `handle_previo`. Todo esto se diseñó en 4b previendo esta fase — acá sólo faltaba que el cliente lo usara.
- **El handle se persiste vía el latido de 30s, no en cada `sessionResumptionUpdate`.** Esos mensajes llegan muy seguido (potencialmente varias veces por turno); escribir a la base en cada uno sería un `UPDATE` por mensaje sin necesidad. El cliente guarda el `newHandle` más reciente en una ref (`handleRef`) y lo manda en el body de cada `latir` — el servidor ya sabía qué hacer con él desde 4b.
- **Excepción a "sólo por heartbeat": al pedir un token nuevo a mitad de una reconexión** (`intentarReconectar` en `useLiveSession.ts`), el cliente manda su `handle` en el mismo body de `abrir`, y el servidor lo persiste ahí también (bloque nuevo en `live/index.ts`, antes sólo declarado en el tipo del body y sin usar). Es gratis: ya se está hablando con el servidor por otro motivo (re-mint), así que aprovechar esa llamada para no depender del próximo latido (que puede tardar hasta 30s más) no cuesta una request extra.
- **`goAway` no es un error: dispara `reconectar(true)` desde `alMensaje`.** `inmediato=true` antepone un intento con demora 0 a la lista de reintentos — reconectar ya mismo, antes de que la conexión vieja se caiga sola, es lo que evita que el usuario note el corte. Si ese intento inmediato falla, cae en el mismo backoff de 1s/2s/4s que un cierre inesperado (no se inventó un esquema de reintentos aparte para `goAway`: reusar el mecanismo ya construido es más simple y no contradice lo pedido).
- **Cierre/error inesperado del socket: backoff 1s → 2s → 4s, máximo 3 intentos** (`REINTENTOS_RECONEXION_MS`), disparado desde los callbacks `onerror`/`onclose` que arma `conectarSesion`. Si los 3 fallan, cierre limpio vía `terminarConError` con un mensaje explícito — sin fallback a texto (eso es 4g).
- **Vencimiento de token: se usa `expira_en`, el timestamp que ya devuelve el servidor, no un "~30 min" reimplementado en el cliente.** Evita duplicar la constante `TOKEN_VIDA_MS` que sólo vive en `live/index.ts`; si el servidor cambia la vida del token algún día, el cliente no se desincroniza. Si el token no venció, `intentarReconectar` reconecta directo con el mismo token (recordar: "reanudar una sesión no cuenta como uso", por eso el token con `uses:1` alcanza para todas las reconexiones dentro de su ventana de 30 min).
- **Contador de generación (`generacionRef`) para no disparar una reconexión fantasma.** Sin esto, el socket viejo que se abandona a propósito al reconectar (por `goAway` o porque el intento anterior tardó) eventualmente dispara su propio `onclose`, y ese evento tardío volvería a llamar a `reconectar()` encima de una reconexión que ya había funcionado. Cada llamada a `conectarSesion` incrementa el contador y sus callbacks sólo actúan si su número de generación sigue siendo el vigente al momento de dispararse.
- **`reconectandoRef` evita reintentos en paralelo** si dos disparadores llegan casi juntos (p.ej. un `goAway` seguido, milisegundos después, del `onclose` real del socket viejo antes de que la generación se actualizara).
- **Indirección vía `reconectarRef` en vez de que `alMensaje`/`conectarSesion` dependan directo de `reconectar`.** `alMensaje` está declarada antes que `reconectar` en el archivo y ambas se realimentan (`reconectar` reconecta llamando a `conectarSesion`, que a su vez puede volver a disparar `reconectar` desde sus callbacks) — usar una ref actualizada por `useEffect` evita tanto la referencia circular en el orden de declaración como atar la identidad de los callbacks de `ai.live.connect` a que `reconectar` se recree en cada render.
- **Nuevo estado `'reconectando'` en `EstadoLive`**, distinto de `'conectando'` (que es sólo el primer handshake). `LiveScreen` lo trata visualmente casi igual que `'conectando'` (círculo pulsante) pero con su propio texto ("Reconectando…"), y deja el botón "Cortar" disponible para que el usuario pueda cancelar una reconexión en curso.
- **Si el usuario cierra la sesión mientras se está reconectando**, `cerrar()` marca `cerrandoRef.current = true`; el loop de `reconectar()` lo chequea entre cada intento y antes de decidir el resultado final, así que no pisa el estado `'inactiva'` que `cerrar()` ya dejó con un `'error'` tardío.
- **Pendiente conocido:** los números del backoff (1s/2s/4s, 3 intentos) y el criterio de "goAway sólo agrega un intento inmediato antes del mismo backoff" quedan sin calibrar contra una caída real — eso es parte de la validación en vivo de esta fase, no algo resuelto en el código.

## Decisiones técnicas — Fase 4f

- **Módulo nuevo `video.ts`, mismo criterio que `audio.ts`**: no sabe de Gemini ni de React, recibe un callback (`alFrame`) y devuelve un objeto con `cerrar()`. `abrirCamara()` pide `getUserMedia({ video: { facingMode:'user', width:640 } })`, arma un `<video>` oculto + `<canvas>` internos y manda un frame JPEG en base64 cada `INTERVALO_FRAME_MS`.
- **0.5 fps por default (`INTERVALO_FRAME_MS = 2000`), no el máximo de 1 fps que permite la API** — tal como se pidió: el video consume contexto mucho más rápido que el audio y acelera la compresión de la ventana deslizante (Fase 4e).
- **`toDataURL('image/jpeg', 0.7)`**, calidad fija sin UI para ajustarla — no se pidió que fuera configurable y hacerlo variable habría sido una superficie nueva sin necesidad concreta todavía.
- **El `<video>` interno SÍ se agrega al DOM** (oculto con `position:fixed; opacity:0; width:1px; height:1px`), no se deja desconectado. En iOS Safari un `<video>` fuera del documento no siempre entrega frames nuevos a un `canvas.drawImage` — mismo tipo de cuidado por iOS que ya aparece en `audio.ts` (gesto de usuario para el `AudioContext`) y en `useLiveSession.ts` (Wake Lock/`AudioContext` suspendidos al bloquear pantalla).
- **Envío con `session.sendRealtimeInput({ video: { data, mimeType: 'image/jpeg' } })`** — se verificó el tipo `LiveSendRealtimeInputParameters` del SDK (`@google/genai`): `video` es un `BlobImageUnion` (`{ data?: string; mimeType?: string }`), mismo shape que ya se usa para `audio`.
- **Toggle sólo habilitado con `estado === 'activa'`** (decisión confirmada con Raúl antes de escribir código, dos alternativas posibles y ninguna obvia). No tiene sentido pedir permiso de cámara para una sesión que todavía no existe o que se está reconectando; `LiveScreen` deshabilita el botón fuera de `'activa'` y `alternarCamara()` repite el mismo chequeo del lado del hook por si se llama desde otro lugar.
- **Apagado automático sin auto-reactivación** (decisión confirmada con Raúl, la alternativa era retomarla sola como el Wake Lock/`AudioContext`): tanto al ocultar la pestaña (`visibilitychange` → `hidden`) como al entrar en `'reconectando'` la cámara se apaga sola vía `apagarCamara()`, pero **no vuelve a prenderse sola** al volver a la pestaña ni cuando la reconexión funciona — el usuario tiene que tocar el toggle otra vez a propósito. Es el criterio contrario al del Wake Lock/reproductor de audio (esos sí se retoman solos), a propósito: la cámara es sensible a privacidad de una forma que el micrófono ya abierto no lo es del mismo modo, y el toggle explícito pierde sentido si el sistema la puede volver a prender sin una acción nueva del usuario.
- **Un único punto de apagado: `apagarCamara()`** en `useLiveSession.ts`, llamado desde `limpiar()` (fin de cualquier sesión), desde `reconectar()` (deja de haber sesión activa) y desde el handler de `visibilitychange`. Evita tres implementaciones distintas de "soltar el stream y poner `camaraActiva` en `false`".
- **Indicador visual: franja ámbar pulsante debajo del header** ("Cámara activa — Ámbar puede verte") en vez de depender sólo del ícono de cámara del sistema operativo — tal como se pidió, ese ícono es fácil de pasar por alto en una pantalla que ya tiene su propio indicador de estado (el círculo del micrófono).
- **Sin miniatura de lo que ve la cámara.** No se pidió y hubiera significado mantener un `<video>` visible en vez de oculto — se puede agregar después si hace falta.
- **Pendiente conocido:** igual que el resto de Fase 4, esto queda sin validar en vivo — falta que Raúl confirme que (1) el toggle sólo aparece disponible con la sesión activa, (2) Ámbar reacciona a lo que la cámara ve, (3) la cámara se apaga sola al cambiar de pestaña y no vuelve a prenderse sola al volver, y (4) el indicador visual es notorio en el uso real.

## Decisiones técnicas — Fase 4g

- **`ConversacionContext` nuevo** (`src/features/chat/ConversacionContext.tsx`), montado en `HomeScreen` por ENCIMA del `if (live) {...}` que alterna entre `ChatScreen` y `LiveScreen` — es lo único que necesitaba cambiar para que el historial sobreviva a que las dos pantallas se monten y desmonten turnándose. Sigue siendo **sólo en memoria**, igual que el `messages` local que reemplaza: nada nuevo se persiste en Supabase (eso es la vista Historial de Fase 7). `ChatScreen` pasó de `useState<ChatMessage[]>` local a leer/escribir `mensajes`/`agregarMensaje` del Context — mismo patrón de "armar `history` en una variable local antes de disparar el request" que ya usaba, porque el setter del Context sigue siendo asíncrono.
- **La transcripción de Live se empuja al historial compartido en cada `turnComplete`**, no sólo al cerrar la sesión (`useLiveSession.ts`, dentro de `alMensaje`): apenas se arma `{usuario, ambar}` para el estado local `turnos`, los mismos textos se mandan a `agregarMensaje` con `role: 'user'`/`'assistant'`. Así un fallback a mitad de charla no pierde nada de lo ya hablado, y el modo texto ve la charla de voz como si el usuario la hubiera escrito.
- **Fallback a texto: un solo punto de disparo, `terminarConError`.** Ya era el único lugar que cerraba Live por una causa involuntaria (reconexión agotada, heartbeat que detecta que otro dispositivo tomó el lock); se le agregó una llamada a `opciones.alFallback` al final, después de `limpiar()`. `LiveScreen` arma ese callback (`mostrarBannerFallback` + `onCerrar(true)`) y se lo pasa a `useLiveSession({ alFallback })`. Consecuencia: **cualquier** terminación involuntaria cae a texto, no sólo las tres mencionadas originalmente en el pedido — se sumó también el caso de `conectarSesion()` fallando en el primer intento de `abrir()` (no tenía motivo tipado, pero es igual de "Live falló al abrir" en espíritu) y el heartbeat detectando que otro dispositivo tomó el lock a mitad de sesión. La única excepción real es el permiso de micrófono denegado: pasa ANTES de hablar con el servidor, no es uno de los motivos tipados, y el usuario sólo necesita conceder el permiso — no ameritaba cerrarle Live y mandarlo a texto.
- **Mensajes del banner: se reusa el `error` que ya arma cada camino, con un sufijo si hace falta.** `conAvisoFallback()` en `useLiveSession.ts` le agrega " Seguimos por texto." a cualquier mensaje que no lo mencione ya — el de `sin_cuota` (redactado en 4d) ya lo traía, así que no se duplica.
- **`sesion_activa` NO cae a texto — nuevo estado `'conflicto'` en `EstadoLive`.** Es una decisión del usuario, no un fallo de Live. `LiveScreen` muestra un botón dedicado ("Cerrar la otra sesión y continuar acá") en vez del genérico "Volver a conectar", más cuánto falta para que el lock se libere solo (`espera_segundos`, ya lo devolvía el 409 desde 4b).
- **Mecanismo de "forzar" (migración `20260729010000_forzar_sesion_live.sql`): se extendió `reclamar_sesion_live` con `p_forzar boolean default false`**, en vez de una RPC aparte — reusa el mismo `INSERT ... ON CONFLICT DO UPDATE ... WHERE` ya validado en 4b, sólo que el `WHERE` también se cumple cuando `p_forzar` es true, sin importar de quién sea la fila. Sigue siendo seguro porque `security invoker` + `auth.uid()` ya escopean todo al usuario dueño del JWT: forzar sólo puede tumbar TU propia sesión en otro dispositivo, nunca la de otro usuario. Hubo que hacer `drop function` antes del `create`: agregar un parámetro nuevo por `create or replace` crea una sobrecarga en vez de reemplazar, y una llamada con un solo argumento hubiera quedado ambigua entre las dos firmas.
  - El cliente nunca activa `forzar` sin que el usuario lo pida: `abrir(forzar = false)` es el default, y el único lugar que llama `abrir(true)` es el botón nuevo del estado `'conflicto'`. Ojo con `onClick={abrir}` — pasa el evento del click como primer argumento, que es "truthy" y hubiera forzado sin querer; los `onClick` de los botones de abrir ahora son `() => void abrir()` explícito.
- **`live/index.ts`** sólo necesitó pasar `p_forzar: Boolean(body.forzar)` al llamar la RPC — el resto de la lógica de `abrir` (validar key, mintear token, persistir handle) no se tocó.
- **Banner: fijo arriba de `ChatScreen`, con botón para descartarlo, nunca se oculta solo** (decisión confirmada con Raúl en el checkpoint de esta fase) — el motivo por el que Live se cortó tiene que quedar visible hasta que el usuario decida que ya lo vio, no como un toast que se puede perder. Vive en el mismo `ConversacionContext` (`bannerFallback`/`mostrarBannerFallback`/`descartarBanner`) porque es el mismo tipo de dato que el historial: algo que Live produce y que ChatScreen muestra.
- **`onCerrar` de `LiveScreen` ahora acepta un argumento opcional `irAChat`.** El cierre manual (botón "Salir") lo llama sin argumentos, igual que siempre. El fallback automático llama `onCerrar(true)`, y `HomeScreen` fuerza la pestaña a "Chat" en ese caso — si el usuario hubiera estado en Ajustes antes de abrir Live, no tendría sentido dejarlo ahí cuando lo que acaba de pasar (y el banner que lo explica) vive en el chat.
- **Desplegado:** migración `20260729010000_forzar_sesion_live.sql` aplicada contra la base remota (confirmado con `supabase migration list`), `live` redesplegada. Smoke test sin auth devolvió 401 (arrancó bien, sin error de boot). `tsc -b` sin errores.
- **Pendiente conocido:** falta lo que la marca como Hecha — que Raúl confirme en vivo (1) que un mensaje de texto ve una charla de voz previa como si el usuario la hubiera escrito, (2) que forzar cierre de la otra sesión funciona con dos pestañas/dispositivos reales, (3) que al menos uno de los motivos de fallback (agotar reintentos es el más fácil de simular) cierra Live, muestra el banner y deja la transcripción en el chat, y (4) que el banner se lee bien y el botón de descartar funciona.

## Límites de Gemini y manejo de cuota (ya definido, no improvisar aquí)

- **Live:** sin compresión, audio-solo dura 15 min, audio+video 2 min; conexión dura ~10 min. Solución: activar context window compression (ventana deslizante) + session resumption desde el día 1. Ventana de contexto: 128k tokens.
- **Texto (flash-lite):** 500 peticiones/día, 15 RPM en capa gratis — mismo rate-limiter adaptativo que Organizador-IA.
- **Contexto en ambos modos:** RAG (solo lo relevante) + últimos turnos recientes, nunca el historial completo.
- **Fallback:** Live falla por cuota → cae a texto con aviso; texto sin cuota diaria → mensaje claro de cuándo se resetea.
