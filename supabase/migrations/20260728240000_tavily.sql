-- Fase 3: BYOK para la key de Tavily (búsqueda web).
--
-- Misma tabla que la key de Gemini (`ajustes_ia`), mismo patrón de cifrado
-- (AES-GCM con `AI_KEY_ENCRYPTION_SECRET`, `manage-ai-key` la valida/cifra
-- antes del insert/update). A diferencia de Gemini, no hay `tavily_habilitada`:
-- la key de Tavily es aditiva, no un requisito para que el chat funcione, así
-- que la tool `buscar_en_internet` chequea directamente si la columna es NULL.

alter table public.ajustes_ia
  add column tavily_api_key_encrypted text;
