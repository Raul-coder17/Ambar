# Graph Report - .  (2026-08-01)

## Corpus Check
- 11 files · ~61,765 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 428 nodes · 578 edges · 31 communities (23 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 172,371 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `compilerOptions` - 15 edges
3. `react` - 13 edges
4. `Fase 2 — Memoria` - 12 edges
5. `useAuth()` - 11 edges
6. `Fase 7 — UI/UX completo` - 9 edges
7. `supabase` - 7 edges
8. `useLiveSession()` - 7 edges
9. `_shared/tools.ts` - 7 edges
10. `guardarIntercambio()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Carga de Fraunces + Karla por <link> de Google Fonts` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `meta theme-color #0f1a2e` --shares_data_with--> `Paleta y variables del mockup (azul marino + ámbar)`  [INFERRED]
  index.html → mockup/mockup.html
- `Pantalla de chat del mockup` --references--> `tool buscar_en_internet`  [INFERRED]
  mockup/mockup.html → PLAN_AMBAR.md
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

## Communities (31 total, 8 thin omitted)

### Community 0 - "Edge Function ai-chat"
Cohesion: 0.05
Nodes (45): callGemini(), CORS_HEADERS, GeminiCandidate, GeminiContent, GeminiError, GeminiPart, mensajeCuotaCorta(), mensajeCuotaDiaria() (+37 more)

### Community 1 - "Shell React y pantallas"
Cohesion: 0.08
Nodes (38): react, App(), Root(), UpdateBanner(), AuthContext, AuthContextValue, AuthProvider(), useAuth() (+30 more)

### Community 2 - "Arquitectura BYOK, memoria y fases (plan)"
Cohesion: 0.07
Nodes (42): Pantalla de ajustes del mockup, Pantalla de chat del mockup, Pantalla de memoria del mockup, showScreen() del mockup, Tab bar de 4 pestañas del mockup, tool buscar_en_internet, tool buscar_en_memoria (D3), tool buscar_peliculas_series (+34 more)

### Community 3 - "Tools de recetas y películas (Spoonacular/TMDB)"
Cohesion: 0.08
Nodes (29): buscarRecetas(), extraerNutriente(), NutrientesReceta, ResultadoReceta, ResultadoSpoonacular, ACENTOS, buscarPeliculasSeries(), fetchTmdb() (+21 more)

### Community 4 - "Config TypeScript de la app"
Cohesion: 0.08
Nodes (24): DOM, src, vite/client, vite-plugin-pwa/react, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+16 more)

### Community 5 - "Fase 4: cámara y Live (plan)"
Cohesion: 0.12
Nodes (22): ai-chat/index.ts, Bug: cambiarCamara() fallaba en Android con cámara trasera, Bug: zoom automático iOS Safari en inputs, Cámara/video en Live, Cambio de cámara frontal/trasera, context window compression (sliding window), Fallback automático Live→texto, Fase 4 — Modo Live (Gemini Live) (+14 more)

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
Cohesion: 0.16
Nodes (14): LiveScreen(), conAvisoFallback(), cuerpoDeError(), esperar(), EstadoLive, OpcionesLiveSession, REINTENTOS_RECONEXION_MS, RespuestaAbrir (+6 more)

### Community 10 - "Audio Live (cliente)"
Cohesion: 0.16
Nodes (5): abrirCaptura(), Captura, int16ABase64(), Reproductor, crearWorkletUrl()

### Community 11 - "Configuración de Oxlint"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 12 - "Diagnóstico de simetría texto↔Live (plan)"
Cohesion: 0.25
Nodes (9): Asimetría de RAG texto↔Live, CATEGORIA_ESTILO = 'estilo', Diagnóstico de simetría de memoria texto↔Live, Hallazgo B: system instruction congelada en Live, Hallazgo B: causa real y cierre, Hallazgo C: instrucciones de estilo renderizadas como trivia, NOTA_APLICAR_ESTILO (D), NOTA_IGNORAR_HECHO (+1 more)

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

### Community 22 - "Migración de perfiles"
Cohesion: 0.67
Nodes (3): on_auth_user_created, public.handle_new_user(), public.perfiles

## Knowledge Gaps
- **143 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Shell React y pantallas` to `Cliente Live (pantalla y hook)`, `Configuración de Oxlint`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `Poda de memoria_vectorial (plan pendiente)` connect `Arquitectura BYOK, memoria y fases (plan)` to `Fase 4: cámara y Live (plan)`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Edge Function ai-chat` be split into smaller, more focused modules?**
  _Cohesion score 0.05406746031746032 - nodes in this community are weakly interconnected._
- **Should `Shell React y pantallas` be split into smaller, more focused modules?**
  _Cohesion score 0.07896575821104122 - nodes in this community are weakly interconnected._
- **Should `Arquitectura BYOK, memoria y fases (plan)` be split into smaller, more focused modules?**
  _Cohesion score 0.06852497096399536 - nodes in this community are weakly interconnected._
- **Should `Tools de recetas y películas (Spoonacular/TMDB)` be split into smaller, more focused modules?**
  _Cohesion score 0.07862903225806452 - nodes in this community are weakly interconnected._