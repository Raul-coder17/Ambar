# Graph Report - Ámbar  (2026-08-01)

## Corpus Check
- 52 files · ~75,345 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 450 nodes · 652 edges · 37 communities (29 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0a9fc51d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Edge Function ai-chat
- Shell React y pantallas
- Arquitectura BYOK, memoria y fases (plan)
- Tools de recetas y películas (Spoonacular/TMDB)
- Config TypeScript de la app
- Fase 4: cámara y Live (plan)
- Dependencias de runtime
- Tooling y devDependencies
- Config de Vite y Node
- Cliente Live (pantalla y hook)
- Audio Live (cliente)
- Configuración de Oxlint
- Diagnóstico de simetría texto↔Live (plan)
- Fase 7: rediseño UI (plan)
- Shell HTML y mockup visual
- Migración de ajustes IA
- Visión general del proyecto (plan)
- Edge Function manage-ai-key
- Template README (dependencias)
- Migración de memoria
- Migración de sesiones Live
- Tool de búsqueda web (Tavily)
- Migración de perfiles
- Raíz de tsconfig
- Migración de Tavily
- Migración de Spoonacular y TMDB
- Mockup de Objetivos
- Alcance del proyecto (plan)
- Ícono placeholder
- memoria.ts
- recuerdos.ts
- Poda de memoria_vectorial (plan pendiente)
- _shared/tools.ts
- spoonacular.ts
- 20260801100000_pizarras.sql

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `react` - 15 edges
3. `compilerOptions` - 15 edges
4. `useAuth()` - 13 edges
5. `Fase 2 — Memoria` - 12 edges
6. `useLiveSession()` - 11 edges
7. `supabase` - 9 edges
8. `Fase 7 — UI/UX completo` - 9 edges
9. `useConversacion()` - 7 edges
10. `_shared/tools.ts` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Pantalla de chat del mockup` --references--> `tool buscar_en_internet`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
- `Carga de Fraunces + Karla por <link> de Google Fonts` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `meta theme-color #0f1a2e` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `Pantalla de chat del mockup` --references--> `tool recordar_hecho`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
- `Pantalla de memoria del mockup` --references--> `tabla memoria_hechos`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sistema de memoria dual (hechos + RAG vectorial)** — plan_ambar_memoria_vectorial, plan_ambar_memoria_hechos, plan_ambar_rag_automatico_texto, plan_ambar_buscar_en_memoria, plan_ambar_recuerdos_recientes_al_abrir [INFERRED 0.85]
- **Patrón BYOK/tool compartido** — plan_ambar_buscar_en_internet, plan_ambar_buscar_recetas, plan_ambar_buscar_peliculas_series, plan_ambar_manage_ai_key, plan_ambar_byok [EXTRACTED 1.00]
- **Hallazgos del diagnóstico de simetría texto↔Live** — plan_ambar_hallazgo_a, plan_ambar_hallazgo_b, plan_ambar_hallazgo_c, plan_ambar_asimetria_rag_texto_live, plan_ambar_diagnostico_simetria_memoria [EXTRACTED 1.00]

## Communities (37 total, 8 thin omitted)

### Community 0 - "Edge Function ai-chat"
Cohesion: 0.10
Nodes (14): callGemini(), CORS_HEADERS, GeminiCandidate, GeminiContent, GeminiError, GeminiPart, mensajeCuotaCorta(), mensajeCuotaDiaria() (+6 more)

### Community 1 - "Shell React y pantallas"
Cohesion: 0.08
Nodes (41): react, App(), Root(), Inline(), Markdown(), UpdateBanner(), AuthContext, AuthContextValue (+33 more)

### Community 2 - "Arquitectura BYOK, memoria y fases (plan)"
Cohesion: 0.18
Nodes (14): Pantalla de chat del mockup, Pantalla de memoria del mockup, showScreen() del mockup, Tab bar de 4 pestañas del mockup, tool buscar_en_memoria (D3), Fase 2 — Memoria, tabla memoria_hechos, tabla memoria_vectorial (+6 more)

### Community 3 - "Tools de recetas y películas (Spoonacular/TMDB)"
Cohesion: 0.10
Nodes (20): normalizarArgsPizarra(), PizarraPropuesta, recortar(), buscarEnInternet(), ResultadoBusqueda, ResultadoTavily, buscarEnInternetTool, buscarEnMemoriaTool (+12 more)

### Community 4 - "Config TypeScript de la app"
Cohesion: 0.08
Nodes (24): DOM, src, vite/client, vite-plugin-pwa/react, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+16 more)

### Community 5 - "Fase 4: cámara y Live (plan)"
Cohesion: 0.08
Nodes (31): ai-chat/index.ts, Asimetría de RAG texto↔Live, Bug: cambiarCamara() fallaba en Android con cámara trasera, Bug: zoom automático iOS Safari en inputs, Cámara/video en Live, Cambio de cámara frontal/trasera, CATEGORIA_ESTILO = 'estilo', context window compression (sliding window) (+23 more)

### Community 6 - "Dependencias de runtime"
Cohesion: 0.10
Nodes (20): @google/genai, dependencies, @google/genai, react, react-dom, react-router-dom, @supabase/supabase-js, name (+12 more)

### Community 7 - "Tooling y devDependencies"
Cohesion: 0.10
Nodes (21): oxlint, devDependencies, oxlint, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom (+13 more)

### Community 8 - "Config de Vite y Node"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 9 - "Cliente Live (pantalla y hook)"
Cohesion: 0.07
Nodes (28): ChatMessage, ConversacionContext, ConversacionContextValue, ConversacionProvider(), Pizarra, useConversacion(), abrirCaptura(), Captura (+20 more)

### Community 10 - "Audio Live (cliente)"
Cohesion: 0.15
Nodes (15): buildSetup(), CORS_HEADERS, errorResponse(), FIELD_MASK, jsonResponse(), mintearToken(), Motivo, decryptApiKey() (+7 more)

### Community 11 - "Configuración de Oxlint"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 12 - "Diagnóstico de simetría texto↔Live (plan)"
Cohesion: 0.21
Nodes (13): Pantalla de ajustes del mockup, tool buscar_en_internet, BYOK (Bring Your Own Key), Fase 0 — Setup base, Fase 1 — Modo texto + tool-calling básico, Fase 3 — Búsqueda web (Tavily), gemini-3.1-flash-lite, Gemini Live API (+5 more)

### Community 13 - "Fase 7: rediseño UI (plan)"
Cohesion: 0.31
Nodes (9): Bug de layout: composer no anclado (h-full), Bug de layout: tab bar desaparecía (min-h-svh → h-svh), Fase 7 — UI/UX completo, HistorialScreen nueva, HomeScreen.tsx, MemoriaScreen real (editable), Router real con react-router-dom, Tokens vía @theme de Tailwind v4 (+1 more)

### Community 14 - "Shell HTML y mockup visual"
Cohesion: 0.29
Nodes (8): Carga de Fraunces + Karla por <link> de Google Fonts, meta viewport de index.html, index.html (shell de la PWA), meta theme-color #0f1a2e, Brasa que respira (.ember + @keyframes breathe), FAB de voz del mockup, Paleta y variables del mockup (azul marino + ámbar), pulseFab() del mockup

### Community 15 - "Migración de ajustes IA"
Cohesion: 0.29
Nodes (5): ajustes_ia_set_updated_at, public.ajustes_ia, public.ia_llamadas_log, public.ia_uso, public.set_updated_at()

### Community 16 - "Visión general del proyecto (plan)"
Cohesion: 0.38
Nodes (7): Ámbar (asistente de voz PWA), Arquitectura general, Instalación y configuración de Graphify, Modo Live (Gemini Live), Modo texto (gemini-3.1-flash-lite), Objetivo del proyecto, Reglas de trabajo del proyecto

### Community 17 - "Edge Function manage-ai-key"
Cohesion: 0.33
Nodes (3): bytesToBase64(), CORS_HEADERS, encryptApiKey()

### Community 18 - "Template README (dependencias)"
Cohesion: 0.40
Nodes (5): Oxlint configuration (type-aware linting), React Compiler, React + TypeScript + Vite (template base), @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC)

### Community 19 - "Migración de memoria"
Cohesion: 0.40
Nodes (3): memoria_hechos_set_updated_at, public.memoria_hechos, public.memoria_vectorial

### Community 21 - "Tool de búsqueda web (Tavily)"
Cohesion: 0.23
Nodes (11): ACENTOS, buscarPeliculasSeries(), fetchTmdb(), GENEROS_PELICULA, GENEROS_SERIE, idsDeGenero(), mapItem(), OpcionesBusqueda (+3 more)

### Community 22 - "Migración de perfiles"
Cohesion: 0.67
Nodes (3): on_auth_user_created, public.handle_new_user(), public.perfiles

### Community 31 - "memoria.ts"
Cohesion: 0.22
Nodes (9): bloqueMemoria(), clave(), esHechoDeEstilo(), HechoPropuesto, MensajeHistorial, normalizarArgsHecho(), Recuerdo, turnosRecientes() (+1 more)

### Community 32 - "recuerdos.ts"
Cohesion: 0.42
Nodes (7): generarEmbedding(), TaskType, vectorLiteral(), filtrarRecuerdos(), textoDelIntercambio(), buscarRecuerdos(), guardarIntercambio()

### Community 33 - "Poda de memoria_vectorial (plan pendiente)"
Cohesion: 0.29
Nodes (8): Fase 5 — Objetivos vigilados, Fase 6 — Check-in diario, Instrumentación de RAG (logging de similitud), _shared/memoria.ts, MIN_LARGO_INTERCAMBIO = 60, pg_cron, Poda de memoria_vectorial (plan pendiente), UMBRAL_SIMILITUD = 0.6

### Community 34 - "_shared/tools.ts"
Cohesion: 0.33
Nodes (7): tool buscar_peliculas_series, tool buscar_recetas, Fase 8 — Backlog de herramientas adicionales, _shared/prompt.ts, Spoonacular (recetas/nutrición), TMDB (películas/series), _shared/tools.ts

### Community 35 - "spoonacular.ts"
Cohesion: 0.40
Nodes (5): buscarRecetas(), extraerNutriente(), NutrientesReceta, ResultadoReceta, ResultadoSpoonacular

## Knowledge Gaps
- **149 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+144 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Shell React y pantallas` to `Cliente Live (pantalla y hook)`, `Configuración de Oxlint`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `Poda de memoria_vectorial (plan pendiente)` connect `Poda de memoria_vectorial (plan pendiente)` to `Arquitectura BYOK, memoria y fases (plan)`, `Diagnóstico de simetría texto↔Live (plan)`, `Fase 4: cámara y Live (plan)`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Fase 2 — Memoria` connect `Arquitectura BYOK, memoria y fases (plan)` to `Poda de memoria_vectorial (plan pendiente)`, `Diagnóstico de simetría texto↔Live (plan)`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _149 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Edge Function ai-chat` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Shell React y pantallas` be split into smaller, more focused modules?**
  _Cohesion score 0.07622504537205081 - nodes in this community are weakly interconnected._
- **Should `Tools de recetas y películas (Spoonacular/TMDB)` be split into smaller, more focused modules?**
  _Cohesion score 0.10276679841897234 - nodes in this community are weakly interconnected._