-- Fase 8 (adelantada): BYOK para Spoonacular (recetas/nutrición) y TMDB
-- (películas/series).
--
-- Misma tabla que Gemini/Tavily (`ajustes_ia`), mismo patrón de cifrado
-- (AES-GCM con `AI_KEY_ENCRYPTION_SECRET`, `manage-ai-key` la cifra antes del
-- insert/update). Ninguna de las dos tiene columna de habilitación propia: son
-- aditivas, igual que Tavily — cada tool chequea directamente si su columna es
-- NULL.

alter table public.ajustes_ia
  add column spoonacular_api_key_encrypted text,
  add column tmdb_api_key_encrypted text;
