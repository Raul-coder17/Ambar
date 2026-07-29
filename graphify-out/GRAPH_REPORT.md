# Graph Report - .  (2026-07-29)

## Corpus Check
- Corpus is ~34,410 words - fits in a single context window. You may not need a graph.

## Summary
- 356 nodes · 483 edges · 30 communities (23 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.82)
- Token cost: 165,201 input · 0 output

## Community Hubs (Navigation)
- Audio de Live (captura/reproducción)
- Auth y Chat (UI React)
- Shell PWA y Fases Iniciales (plan)
- Memoria y Tools (plan, Fase 2-4d)
- Edge Function ai-chat (loop Gemini)
- Config TypeScript (app)
- Dependencias (package.json)
- DevDependencias (package.json)
- Config TypeScript (node/vite)
- Fases de Live y Fallback (plan)
- Registro de Tools (texto+Live)
- Edge Function live (setup y token)
- Config de Lint (oxlint)
- Embeddings y RAG (recuerdos)
- Lógica pura de memoria (memoria.ts)
- Migración: ajustes_ia
- Edge Function manage-ai-key
- Migración: memoria vectorial
- Migración: sesiones_live
- System Instructions (prompt.ts)
- Migración: perfiles
- Fase 5: Objetivos Vigilados (plan)
- tsconfig raíz
- Fase 6: Check-in Diario (plan)
- Migración: Tavily
- audio.ts (mención en plan)
- Búsqueda Web Tavily (concepto, plan)
- Ícono PWA (imagen)

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `compilerOptions` - 15 edges
3. `react` - 10 edges
4. `useLiveSession()` - 10 edges
5. `Ámbar (asistente de voz PWA)` - 10 edges
6. `Edge Function ai-chat` - 10 edges
7. `useAuth()` - 9 edges
8. `tools.ts (registro compartido de tools)` - 8 edges
9. `useConversacion()` - 7 edges
10. `supabase` - 7 edges

## Surprising Connections (you probably didn't know these)
- `index.html (entry shell de Ámbar)` --references--> `Tema/acento de color (theme-color, Fase 7)`  [INFERRED]
  index.html → PLAN_AMBAR.md
- `index.html (entry shell de Ámbar)` --conceptually_related_to--> `PWA (Progressive Web App)`  [AMBIGUOUS]
  index.html → PLAN_AMBAR.md
- `index.html (entry shell de Ámbar)` --conceptually_related_to--> `Ámbar (asistente de voz PWA)`  [INFERRED]
  index.html → PLAN_AMBAR.md
- `React + TypeScript + Vite (template base)` --conceptually_related_to--> `React + TypeScript + Vite + Tailwind (stack frontend Ámbar)`  [INFERRED]
  README.md → PLAN_AMBAR.md
- `index.html (entry shell de Ámbar)` --references--> `Icono placeholder public/icon.svg`  [EXTRACTED]
  index.html → PLAN_AMBAR.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo de reconexión y fallback del modo Live** — plan_ambar_uselivesession, plan_ambar_livescreen, plan_ambar_session_resumption, plan_ambar_fallback_a_texto, plan_ambar_conversacioncontext [INFERRED 0.85]
- **Registro compartido de tool-calling (texto + Live)** — plan_ambar_tools_ts, plan_ambar_buscar_en_internet, plan_ambar_recordar_hecho, plan_ambar_olvidar_hecho, plan_ambar_buscar_en_memoria, plan_ambar_ai_chat, plan_ambar_live_function [INFERRED 0.85]
- **Subsistema de memoria (hechos estructurados + RAG vectorial)** — plan_ambar_memoria_hechos, plan_ambar_memoria_vectorial, plan_ambar_memoria_ts, plan_ambar_recuerdos_ts, plan_ambar_rag [INFERRED 0.80]

## Communities (30 total, 7 thin omitted)

### Community 0 - "Audio de Live (captura/reproducción)"
Cohesion: 0.10
Nodes (20): useConversacion(), abrirCaptura(), Captura, crearReproductor(), int16ABase64(), Reproductor, LiveScreen(), crearWorkletUrl() (+12 more)

### Community 1 - "Auth y Chat (UI React)"
Cohesion: 0.13
Nodes (20): react, Gate(), AuthContext, AuthContextValue, AuthProvider(), useAuth(), AuthScreen(), Mode (+12 more)

### Community 2 - "Shell PWA y Fases Iniciales (plan)"
Cohesion: 0.08
Nodes (30): index.html (entry shell de Ámbar), script src=/src/main.tsx, #root mount point, Tabla ajustes_ia, Ámbar (asistente de voz PWA), AuthScreen.tsx, BYOK (Bring Your Own Key), Fase 0 — Setup base (+22 more)

### Community 3 - "Memoria y Tools (plan, Fase 2-4d)"
Cohesion: 0.11
Nodes (27): Edge Function ai-chat, Tool buscar_en_internet, Tool buscar_en_memoria (D3), RPC buscar_memoria_vectorial, ai-chat/crypto.ts, Fase 2 — Memoria, Fase 3 — Búsqueda web (Tavily), Fase 4d — Puente de tools en Live (+19 more)

### Community 4 - "Edge Function ai-chat (loop Gemini)"
Cohesion: 0.10
Nodes (14): callGemini(), CORS_HEADERS, GeminiCandidate, GeminiContent, GeminiError, GeminiPart, mensajeCuotaCorta(), mensajeCuotaDiaria() (+6 more)

### Community 5 - "Config TypeScript (app)"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+15 more)

### Community 6 - "Dependencias (package.json)"
Cohesion: 0.10
Nodes (20): @google/genai, dependencies, @google/genai, react, react-dom, react-router-dom, @supabase/supabase-js, name (+12 more)

### Community 7 - "DevDependencias (package.json)"
Cohesion: 0.10
Nodes (21): oxlint, devDependencies, oxlint, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom (+13 more)

### Community 8 - "Config TypeScript (node/vite)"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 9 - "Fases de Live y Fallback (plan)"
Cohesion: 0.14
Nodes (18): ChatScreen.tsx, Context window compression (sliding window), ConversacionContext.tsx, Fallback automático a modo texto, Fase 4 — Modo Live (Gemini Live), Fase 4e — Resumption/reconexión, Fase 4f — Cámara, Fase 4g — Historial compartido + fallback (+10 more)

### Community 10 - "Registro de Tools (texto+Live)"
Cohesion: 0.14
Nodes (14): buscarEnInternet(), ResultadoBusqueda, ResultadoTavily, buscarEnInternetTool, buscarEnMemoriaTool, findTool(), ModoConversacion, olvidarHecho (+6 more)

### Community 11 - "Edge Function live (setup y token)"
Cohesion: 0.19
Nodes (11): buildSetup(), CORS_HEADERS, errorResponse(), FIELD_MASK, jsonResponse(), mintearToken(), Motivo, decryptApiKey() (+3 more)

### Community 12 - "Config de Lint (oxlint)"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 13 - "Embeddings y RAG (recuerdos)"
Cohesion: 0.33
Nodes (7): guardarIntercambio(), generarEmbedding(), TaskType, vectorLiteral(), filtrarRecuerdos(), textoDelIntercambio(), buscarRecuerdos()

### Community 14 - "Lógica pura de memoria (memoria.ts)"
Cohesion: 0.25
Nodes (7): clave(), HechoPropuesto, MensajeHistorial, normalizarArgsHecho(), Recuerdo, turnosRecientes(), ultimoMensajeUsuario()

### Community 15 - "Migración: ajustes_ia"
Cohesion: 0.29
Nodes (5): ajustes_ia_set_updated_at, public.ajustes_ia, public.ia_llamadas_log, public.ia_uso, public.set_updated_at()

### Community 16 - "Edge Function manage-ai-key"
Cohesion: 0.40
Nodes (3): bytesToBase64(), CORS_HEADERS, encryptApiKey()

### Community 17 - "Migración: memoria vectorial"
Cohesion: 0.40
Nodes (3): memoria_hechos_set_updated_at, public.memoria_hechos, public.memoria_vectorial

### Community 19 - "System Instructions (prompt.ts)"
Cohesion: 0.83
Nodes (3): fechaActual(), systemInstructionBase(), systemInstructionLive()

### Community 20 - "Migración: perfiles"
Cohesion: 0.67
Nodes (3): on_auth_user_created, public.handle_new_user(), public.perfiles

### Community 21 - "Fase 5: Objetivos Vigilados (plan)"
Cohesion: 0.67
Nodes (3): Fase 5 — Objetivos vigilados, Objetivos vigilados (scheduled actions), pg_cron

## Ambiguous Edges - Review These
- `PWA (Progressive Web App)` → `index.html (entry shell de Ámbar)`  [AMBIGUOUS]
  index.html · relation: conceptually_related_to

## Knowledge Gaps
- **143 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `PWA (Progressive Web App)` and `index.html (entry shell de Ámbar)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Organizador-IA (proyecto hermano, fuente de patrones)` connect `Shell PWA y Fases Iniciales (plan)` to `Fases de Live y Fallback (plan)`, `Memoria y Tools (plan, Fase 2-4d)`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `Edge Function ai-chat` connect `Memoria y Tools (plan, Fase 2-4d)` to `Shell PWA y Fases Iniciales (plan)`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `react` connect `Auth y Chat (UI React)` to `Audio de Live (captura/reproducción)`, `Config de Lint (oxlint)`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Audio de Live (captura/reproducción)` be split into smaller, more focused modules?**
  _Cohesion score 0.09848484848484848 - nodes in this community are weakly interconnected._
- **Should `Auth y Chat (UI React)` be split into smaller, more focused modules?**
  _Cohesion score 0.1310483870967742 - nodes in this community are weakly interconnected._