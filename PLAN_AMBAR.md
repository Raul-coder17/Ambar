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

## Límites de Gemini y manejo de cuota (ya definido, no improvisar aquí)

- **Live:** sin compresión, audio-solo dura 15 min, audio+video 2 min; conexión dura ~10 min. Solución: activar context window compression (ventana deslizante) + session resumption desde el día 1. Ventana de contexto: 128k tokens.
- **Texto (flash-lite):** 500 peticiones/día, 15 RPM en capa gratis — mismo rate-limiter adaptativo que Organizador-IA.
- **Contexto en ambos modos:** RAG (solo lo relevante) + últimos turnos recientes, nunca el historial completo.
- **Fallback:** Live falla por cuota → cae a texto con aviso; texto sin cuota diaria → mensaje claro de cuándo se resetea.
