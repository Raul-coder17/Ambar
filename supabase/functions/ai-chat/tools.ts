// Registro de tools (function-calling) para el chat de texto.
//
// Fase 1 deja la arquitectura lista pero SIN tools reales todavía: `TOOLS`
// vacío hace que `index.ts` no mande `tools` a Gemini y el loop nunca
// encuentre una function call que ejecutar. Fase 3 agrega acá la primera
// tool real (`buscar_en_internet`, Tavily); el modo Live (Fase 4) reusa este
// mismo registro, mismo código, dos entradas.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolContext {
  supabase: SupabaseClient
  userId: string
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>

export interface Tool {
  declaration: ToolDeclaration
  handler: ToolHandler
}

export const TOOLS: Tool[] = []

export function toolDeclarations(): ToolDeclaration[] {
  return TOOLS.map((t) => t.declaration)
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.declaration.name === name)
}
