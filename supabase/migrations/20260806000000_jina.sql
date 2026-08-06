-- BYOK para la key de Jina Reader (lectura de páginas web, tool `leer_pagina`).
--
-- Misma tabla que las demás keys (`ajustes_ia`), mismo patrón de cifrado
-- (AES-GCM con `AI_KEY_ENCRYPTION_SECRET`, `manage-ai-key` la cifra antes del
-- insert/update). Aditiva y sin columna de habilitación propia, igual que
-- Tavily/Spoonacular/TMDB: la key es opcional de verdad acá (Jina Reader
-- funciona sin key en su tier gratis), así que `leer_pagina` chequea
-- directamente si la columna es NULL y sigue igual sin fallar.

alter table public.ajustes_ia
  add column jina_api_key_encrypted text;
