# Graph Report - Ámbar  (2026-08-03)

## Corpus Check
- 57 files · ~78,737 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 536 nodes · 815 edges · 37 communities (27 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3272dcc1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Memoria y RAG texto-Live
- Edge Function ai-chat
- Chat y renderer de markdown
- Dependencias del proyecto
- Decisiones y bugs del modo Live
- Shell de la app y auth
- Edge Function live y pizarra
- BYOK, cifrado y setup base
- Config TypeScript del cliente
- Config TypeScript de build
- Tools externas y mockup
- Captura y reproduccion de audio
- Cliente de TMDB
- Configuracion de oxlint
- Identidad visual y shell HTML
- Migracion de ajustes y cuotas
- Edge Function de keys BYOK
- Camara y video
- Cliente de Spoonacular
- Plantilla Vite + React
- Migracion de memoria
- Migracion de sesiones Live
- Cliente de Tavily
- Migracion de perfiles
- tsconfig raiz
- Migracion de key de Tavily
- Migracion Spoonacular y TMDB
- Migracion de pizarras
- Placeholder de Objetivos
- Icono de la app
- memoria.ts
- recuerdos.ts
- send-test-push/index.ts
- sw.ts
- 20260803000000_push_subscriptions.sql

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `react` - 15 edges
3. `compilerOptions` - 15 edges
4. `useAuth()` - 13 edges
5. `Edge Function live` - 12 edges
6. `HomeScreen.tsx (shell autenticado)` - 12 edges
7. `useLiveSession()` - 11 edges
8. `compilerOptions` - 11 edges
9. `supabase` - 10 edges
10. `_shared/tools.ts (registro compartido de tools)` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Pantalla de chat del mockup` --references--> `Tool recordar_hecho`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
- `Pantalla de memoria del mockup` --references--> `Tabla memoria_hechos`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
- `Pantalla de ajustes del mockup` --references--> `BYOK (clave de API propia por usuario, cifrada)`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
- `Carga de Fraunces + Karla por <link> de Google Fonts` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `meta theme-color #0f1a2e` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Circuito de memoria compartido texto↔Live** — plan_ambar_shared_memoria, plan_ambar_shared_recuerdos, plan_ambar_shared_embeddings, plan_ambar_memoria_vectorial, plan_ambar_memoria_hechos, plan_ambar_bloque_memoria [EXTRACTED 1.00]
- **Registro de tools compartido entre ai-chat y live** — plan_ambar_shared_tools, plan_ambar_recordar_hecho, plan_ambar_olvidar_hecho, plan_ambar_buscar_en_internet, plan_ambar_buscar_en_memoria, plan_ambar_buscar_recetas, plan_ambar_buscar_peliculas_series, plan_ambar_mostrar_en_pantalla [EXTRACTED 1.00]
- **Flujo completo de la pizarra visual (tool → base → pantalla → historial)** — plan_ambar_mostrar_en_pantalla, plan_ambar_shared_pizarra, plan_ambar_pizarras, plan_ambar_pizarra_panel, plan_ambar_markdown_component, plan_ambar_historial_screen [EXTRACTED 1.00]

## Communities (37 total, 10 thin omitted)

### Community 0 - "Memoria y RAG texto-Live"
Cohesion: 0.07
Nodes (52): Pantalla de memoria del mockup, Edge Function ai-chat, Asimetría de RAG texto↔Live, bloqueMemoria (armado del contexto en system instruction), Tool buscar_en_memoria (soloModo live), RPC buscar_memoria_vectorial, Tool buscar_peliculas_series, CATEGORIA_ESTILO (hechos de estilo con prioridad) (+44 more)

### Community 1 - "Edge Function ai-chat"
Cohesion: 0.10
Nodes (14): callGemini(), CORS_HEADERS, GeminiCandidate, GeminiContent, GeminiError, GeminiPart, mensajeCuotaCorta(), mensajeCuotaDiaria() (+6 more)

### Community 2 - "Chat y renderer de markdown"
Cohesion: 0.09
Nodes (22): useConversacion(), abrirCaptura(), Captura, crearReproductor(), int16ABase64(), Reproductor, LiveScreen(), crearWorkletUrl() (+14 more)

### Community 3 - "Dependencias del proyecto"
Cohesion: 0.10
Nodes (20): @google/genai, dependencies, @google/genai, react, react-dom, react-router-dom, @supabase/supabase-js, name (+12 more)

### Community 4 - "Decisiones y bugs del modo Live"
Cohesion: 0.08
Nodes (42): audio.ts (captura y reproducción de audio), Bug: cambio a cámara trasera fallaba en Android (un pipe por vez), Bug de layout: h-full contra flex-grow, Bug de layout: min-h-svh vs h-svh (tab bar desaparecía), Tool buscar_recetas, Cambio de cámara frontal/trasera, ChatScreen.tsx, ConversacionContext.tsx (historial compartido en memoria) (+34 more)

### Community 5 - "Shell de la app y auth"
Cohesion: 0.06
Nodes (56): react, App(), Root(), Inline(), Markdown(), UpdateBanner(), AuthContext, AuthContextValue (+48 more)

### Community 6 - "Edge Function live y pizarra"
Cohesion: 0.10
Nodes (20): normalizarArgsPizarra(), PizarraPropuesta, recortar(), buscarEnInternet(), ResultadoBusqueda, ResultadoTavily, buscarEnInternetTool, buscarEnMemoriaTool (+12 more)

### Community 7 - "BYOK, cifrado y setup base"
Cohesion: 0.08
Nodes (31): Pantalla de ajustes del mockup, AI_KEY_ENCRYPTION_SECRET (secret del proyecto), Tabla ajustes_ia, Ámbar (asistente de voz PWA multiusuario), AuthContext.tsx, AuthScreen.tsx, BYOK (clave de API propia por usuario, cifrada), Cifrado AES-GCM de las keys BYOK (+23 more)

### Community 8 - "Config TypeScript del cliente"
Cohesion: 0.07
Nodes (26): DOM, src, vite/client, vite-plugin-pwa/react, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+18 more)

### Community 9 - "Config TypeScript de build"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 10 - "Tools externas y mockup"
Cohesion: 0.14
Nodes (15): Pantalla de chat del mockup, showScreen() del mockup, Tab bar de 4 pestañas del mockup, Tool buscar_en_internet, gemini-embedding-2 a 768 dimensiones, Fase 2 — Memoria (hechos + RAG vectorial), Fase 3 — Búsqueda web (Tavily), Memoria best-effort (nunca rompe el chat) (+7 more)

### Community 11 - "Captura y reproduccion de audio"
Cohesion: 0.10
Nodes (21): oxlint, devDependencies, oxlint, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom (+13 more)

### Community 12 - "Cliente de TMDB"
Cohesion: 0.23
Nodes (11): ACENTOS, buscarPeliculasSeries(), fetchTmdb(), GENEROS_PELICULA, GENEROS_SERIE, idsDeGenero(), mapItem(), OpcionesBusqueda (+3 more)

### Community 13 - "Configuracion de oxlint"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 14 - "Identidad visual y shell HTML"
Cohesion: 0.29
Nodes (8): Carga de Fraunces + Karla por <link> de Google Fonts, meta viewport de index.html, index.html (shell de la PWA), meta theme-color #0f1a2e, Brasa que respira (.ember + @keyframes breathe), FAB de voz del mockup, Paleta y variables del mockup (azul marino + ámbar), pulseFab() del mockup

### Community 15 - "Migracion de ajustes y cuotas"
Cohesion: 0.29
Nodes (5): ajustes_ia_set_updated_at, public.ajustes_ia, public.ia_llamadas_log, public.ia_uso, public.set_updated_at()

### Community 16 - "Edge Function de keys BYOK"
Cohesion: 0.33
Nodes (3): bytesToBase64(), CORS_HEADERS, encryptApiKey()

### Community 17 - "Camara y video"
Cohesion: 0.15
Nodes (15): buildSetup(), CORS_HEADERS, errorResponse(), FIELD_MASK, jsonResponse(), mintearToken(), Motivo, decryptApiKey() (+7 more)

### Community 18 - "Cliente de Spoonacular"
Cohesion: 0.40
Nodes (5): buscarRecetas(), extraerNutriente(), NutrientesReceta, ResultadoReceta, ResultadoSpoonacular

### Community 19 - "Plantilla Vite + React"
Cohesion: 0.40
Nodes (5): Oxlint configuration (type-aware linting), React Compiler, React + TypeScript + Vite (template base), @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC)

### Community 20 - "Migracion de memoria"
Cohesion: 0.40
Nodes (3): memoria_hechos_set_updated_at, public.memoria_hechos, public.memoria_vectorial

### Community 22 - "Cliente de Tavily"
Cohesion: 0.12
Nodes (15): ES2022, WebWorker, compilerOptions, isolatedModules, lib, module, moduleDetection, moduleResolution (+7 more)

### Community 23 - "Migracion de perfiles"
Cohesion: 0.67
Nodes (3): on_auth_user_created, public.handle_new_user(), public.perfiles

### Community 32 - "memoria.ts"
Cohesion: 0.22
Nodes (9): bloqueMemoria(), clave(), esHechoDeEstilo(), HechoPropuesto, MensajeHistorial, normalizarArgsHecho(), Recuerdo, turnosRecientes() (+1 more)

### Community 33 - "recuerdos.ts"
Cohesion: 0.42
Nodes (7): generarEmbedding(), TaskType, vectorLiteral(), filtrarRecuerdos(), textoDelIntercambio(), buscarRecuerdos(), guardarIntercambio()

## Knowledge Gaps
- **180 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+175 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Shell de la app y auth` to `Chat y renderer de markdown`, `Configuracion de oxlint`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `_shared/tools.ts (registro compartido de tools)` connect `Memoria y RAG texto-Live` to `Tools externas y mockup`, `Decisiones y bugs del modo Live`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `Edge Function live` connect `Memoria y RAG texto-Live` to `Decisiones y bugs del modo Live`, `BYOK, cifrado y setup base`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _180 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Memoria y RAG texto-Live` be split into smaller, more focused modules?**
  _Cohesion score 0.07013574660633484 - nodes in this community are weakly interconnected._
- **Should `Edge Function ai-chat` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Chat y renderer de markdown` be split into smaller, more focused modules?**
  _Cohesion score 0.08858858858858859 - nodes in this community are weakly interconnected._