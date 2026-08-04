# Graph Report - .  (2026-08-04)

## Corpus Check
- 18 files · ~85,727 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 565 nodes · 813 edges · 48 communities (37 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Chat de Texto (ai-chat)
- Shell de la App
- Audio de Modo Live
- Bugs de Layout Fase 7
- Config TypeScript (app)
- Comparación de Objetivos (Gemini)
- Módulo Objetivos + Tools
- Dependencias de Runtime
- Dependencias de Desarrollo
- Config TypeScript (node/vite)
- Config TypeScript (service worker)
- Fase 4: Modo Live
- Pantalla de Ajustes + Push
- Objetivo y Alcance del Proyecto
- Integración TMDB
- Fase 1: BYOK y Rate Limiter
- Fase 5: Diseño de Objetivos + Push
- Diagnóstico de Simetría de Memoria
- Config de Lint
- Fase 2: Memoria (hechos)
- Pantalla de Objetivos (UI)
- Mockup y Shell HTML
- Fase 8: Recetas y Películas
- Migración: ajustes_ia
- Asimetría de RAG
- Edge Function manage-ai-key
- Migración: objetivos
- Fase 3: Búsqueda Web (Tavily)
- Integración Spoonacular
- Referencias de README
- Migración: memoria
- Migración: sesiones_live
- Edge Function send-test-push
- Módulo Pizarra Visual
- Migración: perfiles
- Mockup: Chat y Tab Bar
- Config TypeScript (raíz)
- Service Worker
- Migración: tavily
- Migración: spoonacular/tmdb
- Migración: pizarras
- Migración: push_subscriptions
- Mockup: Pantalla Memoria
- Mockup: Pantalla Objetivos
- Ícono de la App

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `react` - 16 edges
3. `compilerOptions` - 15 edges
4. `Ámbar (asistente de voz PWA)` - 14 edges
5. `compilerOptions` - 12 edges
6. `Fase 7 — UI/UX completo` - 12 edges
7. `useAuth()` - 11 edges
8. `useLiveSession()` - 11 edges
9. `Fase 4 — Modo Live (Gemini Live)` - 10 edges
10. `revisarUno()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Pantalla de ajustes del mockup` --references--> `BYOK (Bring Your Own Key)`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
- `Carga de Fraunces + Karla por <link> de Google Fonts` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `meta theme-color #0f1a2e` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `Root()` --calls--> `useAuth()`  [EXTRACTED]
  src/App.tsx → src/features/auth/AuthContext.tsx
- `HomeScreenInterior()` --calls--> `useAuth()`  [EXTRACTED]
  src/features/home/HomeScreen.tsx → src/features/auth/AuthContext.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Registro compartido de tools (TOOLS[]) usado por texto y Live** — plan_ambar_tool_recordar_hecho, plan_ambar_tool_olvidar_hecho, plan_ambar_tool_buscar_en_internet, plan_ambar_tool_buscar_en_memoria, plan_ambar_tool_mostrar_en_pantalla, plan_ambar_tool_buscar_recetas, plan_ambar_tool_buscar_peliculas_series, supabase_functions__shared_tools_module [EXTRACTED 1.00]
- **Bugs de layout diagnosticados y corregidos con medición getBoundingClientRect en Fase 7** — plan_ambar_bug_layout_h_full, plan_ambar_bug_layout_min_h_svh, plan_ambar_bug_fab_composer_overlap, plan_ambar_bug_zoom_ios [EXTRACTED 1.00]
- **Ciclo de diagnóstico de simetría de memoria texto↔Live y sus hallazgos** — plan_ambar_diagnostico_simetria_memoria, plan_ambar_hallazgo_a_memoria_live, plan_ambar_hallazgo_b_system_instruction_congelada, plan_ambar_hallazgo_c_instrucciones_estilo, plan_ambar_asimetria_rag, plan_ambar_causa_raiz_olvidar_hecho [EXTRACTED 1.00]

## Communities (48 total, 11 thin omitted)

### Community 0 - "Chat de Texto (ai-chat)"
Cohesion: 0.05
Nodes (45): callGemini(), CORS_HEADERS, GeminiCandidate, GeminiContent, GeminiError, GeminiPart, mensajeCuotaCorta(), mensajeCuotaDiaria() (+37 more)

### Community 1 - "Shell de la App"
Cohesion: 0.07
Nodes (44): react, App(), Root(), Inline(), Markdown(), UpdateBanner(), AuthContext, AuthContextValue (+36 more)

### Community 2 - "Audio de Modo Live"
Cohesion: 0.09
Nodes (23): useConversacion(), abrirCaptura(), Captura, crearReproductor(), int16ABase64(), Reproductor, LiveScreen(), crearWorkletUrl() (+15 more)

### Community 3 - "Bugs de Layout Fase 7"
Cohesion: 0.08
Nodes (32): Bug: FAB de voz tapando el composer de Chat, Bug de layout: composer flotante (h-full/flex en HomeScreen), Bug de layout: tab bar desaparecía (min-h-svh vs h-svh), Bug: zoom automático de iOS Safari en inputs, Detección de actualización de la PWA, Dirección de diseño visual Fase 7 (mockup, tokens, brasa), Fase 4g — Historial compartido, forzar sesión y fallback, Fase 7 — UI/UX completo (+24 more)

### Community 4 - "Config TypeScript (app)"
Cohesion: 0.07
Nodes (26): DOM, ES2023, src, vite/client, vite-plugin-pwa/react, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions (+18 more)

### Community 5 - "Comparación de Objetivos (Gemini)"
Cohesion: 0.14
Nodes (21): armarPrompt(), callGeminiJSON(), compararObjetivo(), RESPONSE_SCHEMA, ResultadoComparacion, ResultadoTavilyResumen, hayMargenTavily(), hoyPacifico() (+13 more)

### Community 6 - "Módulo Objetivos + Tools"
Cohesion: 0.11
Nodes (21): esFrecuenciaValida(), Frecuencia, FRECUENCIAS, NOMBRE_FRECUENCIA, normalizarArgsObjetivo(), ObjetivoPropuesto, buscarEnInternetTool, buscarEnMemoriaTool (+13 more)

### Community 7 - "Dependencias de Runtime"
Cohesion: 0.10
Nodes (20): @google/genai, dependencies, @google/genai, react, react-dom, react-router-dom, @supabase/supabase-js, name (+12 more)

### Community 8 - "Dependencias de Desarrollo"
Cohesion: 0.10
Nodes (21): oxlint, devDependencies, oxlint, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom (+13 more)

### Community 9 - "Config TypeScript (node/vite)"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 10 - "Config TypeScript (service worker)"
Cohesion: 0.12
Nodes (16): ES2022, WebWorker, compilerOptions, isolatedModules, lib, module, moduleDetection, moduleResolution (+8 more)

### Community 11 - "Fase 4: Modo Live"
Cohesion: 0.19
Nodes (15): Bug: cambio de cámara fallaba en Android (orden de streams), Cambio de cámara frontal/trasera, Context window compression (sliding window), Fase 4 — Modo Live (Gemini Live), Fase 4d — Tool-calling en Live, Fase 4e — Reconexión y session resumption, Fase 4f — Cámara/video en Live, gemini-3.1-flash-lite (+7 more)

### Community 12 - "Pantalla de Ajustes + Push"
Cohesion: 0.31
Nodes (11): SettingsScreen(), getPushStatus(), hasDbSubscription(), isPushSupported(), keyToBase64(), PushStatus, subscribeToPush(), swReadyOrNull() (+3 more)

### Community 13 - "Objetivo y Alcance del Proyecto"
Cohesion: 0.20
Nodes (12): Alcance actual (qué sí / qué no), Ámbar (asistente de voz PWA), Arquitectura general, Fase 0 — Setup base, Fase 6 — Check-in diario, Gemini Live API, Instalación y configuración de Graphify, Objetivo del proyecto (+4 more)

### Community 14 - "Integración TMDB"
Cohesion: 0.23
Nodes (11): ACENTOS, buscarPeliculasSeries(), fetchTmdb(), GENEROS_PELICULA, GENEROS_SERIE, idsDeGenero(), mapItem(), OpcionesBusqueda (+3 more)

### Community 15 - "Fase 1: BYOK y Rate Limiter"
Cohesion: 0.22
Nodes (10): Pantalla de ajustes del mockup, BYOK (Bring Your Own Key), Fase 1 — Modo texto + tool-calling básico, Rate-limiter adaptativo (RPM + cuota diaria aprendida), Tabla ajustes_ia, Tabla ia_llamadas_log, Tabla ia_uso, _shared/crypto.ts (+2 more)

### Community 16 - "Fase 5: Diseño de Objetivos + Push"
Cohesion: 0.24
Nodes (10): Bug: toggle de push mentía 'activadas', Fase 5 — Objetivos vigilados, pg_cron (scheduled actions), Diseño de poda de memoria_vectorial (pendiente de implementar), Push notifications — infraestructura base, RPC podar_memoria_vectorial (diseñado, sin implementar), Tabla push_subscriptions, lib/push.ts (+2 more)

### Community 17 - "Diagnóstico de Simetría de Memoria"
Cohesion: 0.33
Nodes (10): Causa raíz: olvidar_hecho funcionaba en Live pero el dato resucitaba en texto, Diagnóstico de simetría de memoria texto↔Live, Hallazgo A — Live no escribía memoria_vectorial, Hallazgo B — system instruction congelada en Live, Hallazgo C — instrucciones de estilo se renderizan como trivia, NOTA_APLICAR_ESTILO (canal del functionResponse), NOTA_IGNORAR_HECHO (gemelo de D para olvidar_hecho), Tabla memoria_vectorial (+2 more)

### Community 18 - "Config de Lint"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 19 - "Fase 2: Memoria (hechos)"
Cohesion: 0.31
Nodes (9): Fase 2 — Memoria, gemini-embedding-2, Diseño de olvidar_hecho (tool nueva post-Fase 4), RPC buscar_memoria_vectorial, S1 — contrato de string exacto frágil (olvidar_hecho/reemplaza), Tabla memoria_hechos, Tool olvidar_hecho, Tool recordar_hecho (+1 more)

### Community 20 - "Pantalla de Objetivos (UI)"
Cohesion: 0.28
Nodes (8): Estado, etiquetaFrecuencia(), formatoFecha, Frecuencia, Objetivo, ObjetivosScreen(), OPCIONES_FRECUENCIA, Revision

### Community 21 - "Mockup y Shell HTML"
Cohesion: 0.29
Nodes (8): Carga de Fraunces + Karla por <link> de Google Fonts, meta viewport de index.html, index.html (shell de la PWA), meta theme-color #0f1a2e, Brasa que respira (.ember + @keyframes breathe), FAB de voz del mockup, Paleta y variables del mockup (azul marino + ámbar), pulseFab() del mockup

### Community 22 - "Fase 8: Recetas y Películas"
Cohesion: 0.25
Nodes (8): Fase 8 — Backlog de herramientas adicionales, Spoonacular (recetas/nutrición), Diseño de Spoonacular y TMDB (Fase 8 adelantada), TMDB (películas/series), Tool buscar_peliculas_series, Tool buscar_recetas, _shared/spoonacular.ts, _shared/tmdb.ts

### Community 23 - "Migración: ajustes_ia"
Cohesion: 0.29
Nodes (5): ajustes_ia_set_updated_at, public.ajustes_ia, public.ia_llamadas_log, public.ia_uso, public.set_updated_at()

### Community 24 - "Asimetría de RAG"
Cohesion: 0.38
Nodes (7): Asimetría de RAG texto↔Live, Diseño de buscar_en_memoria (D3), Instrumentación de RAG (logging de similitud), P1 — no guardar intercambio tras ejecutar olvidar_hecho, Tool buscar_en_memoria, _shared/recuerdos.ts (I/O de memoria vectorial), Edge Function ai-chat

### Community 25 - "Edge Function manage-ai-key"
Cohesion: 0.33
Nodes (3): bytesToBase64(), CORS_HEADERS, encryptApiKey()

### Community 26 - "Migración: objetivos"
Cohesion: 0.48
Nodes (6): objetivos_tope_activos_insert, objetivos_tope_activos_update, public.chequear_tope_objetivos_activos(), public.objetivos, public.objetivos_revisiones, public.tavily_uso

### Community 27 - "Fase 3: Búsqueda Web (Tavily)"
Cohesion: 0.47
Nodes (6): Ajustes de calidad: búsqueda profunda + proactividad de recordar_hecho, Fase 3 — Búsqueda web (Tavily), S3 — logging con prefijos por unidad, Tool buscar_en_internet, _shared/embeddings.ts, _shared/tavily.ts

### Community 28 - "Integración Spoonacular"
Cohesion: 0.40
Nodes (5): buscarRecetas(), extraerNutriente(), NutrientesReceta, ResultadoReceta, ResultadoSpoonacular

### Community 29 - "Referencias de README"
Cohesion: 0.40
Nodes (5): Oxlint configuration (type-aware linting), React Compiler, React + TypeScript + Vite (template base), @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC)

### Community 30 - "Migración: memoria"
Cohesion: 0.40
Nodes (3): memoria_hechos_set_updated_at, public.memoria_hechos, public.memoria_vectorial

### Community 33 - "Módulo Pizarra Visual"
Cohesion: 0.67
Nodes (3): normalizarArgsPizarra(), PizarraPropuesta, recortar()

### Community 34 - "Migración: perfiles"
Cohesion: 0.67
Nodes (3): on_auth_user_created, public.handle_new_user(), public.perfiles

### Community 35 - "Mockup: Chat y Tab Bar"
Cohesion: 0.67
Nodes (3): Pantalla de chat del mockup, showScreen() del mockup, Tab bar de 4 pestañas del mockup

## Knowledge Gaps
- **212 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+207 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Ámbar (asistente de voz PWA)` connect `Objetivo y Alcance del Proyecto` to `Bugs de Layout Fase 7`, `Fase 4: Modo Live`, `Fase 1: BYOK y Rate Limiter`, `Fase 5: Diseño de Objetivos + Push`, `Fase 2: Memoria (hechos)`, `Fase 8: Recetas y Películas`, `Fase 3: Búsqueda Web (Tavily)`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `react` connect `Shell de la App` to `Config de Lint`, `Audio de Modo Live`, `Pantalla de Objetivos (UI)`, `Pantalla de Ajustes + Push`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `Fase 7 — UI/UX completo` connect `Bugs de Layout Fase 7` to `Objetivo y Alcance del Proyecto`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _212 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chat de Texto (ai-chat)` be split into smaller, more focused modules?**
  _Cohesion score 0.054563492063492064 - nodes in this community are weakly interconnected._
- **Should `Shell de la App` be split into smaller, more focused modules?**
  _Cohesion score 0.07231638418079096 - nodes in this community are weakly interconnected._
- **Should `Audio de Modo Live` be split into smaller, more focused modules?**
  _Cohesion score 0.08534850640113797 - nodes in this community are weakly interconnected._