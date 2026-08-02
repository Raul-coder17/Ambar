-- Paso 2 de la pizarra visual: la tabla donde vive lo que Ámbar escribe en
-- pantalla durante una conversación de voz.
--
-- QUÉ ES UNA PIZARRA Y POR QUÉ NO ES MEMORIA
--
-- Una fila acá es una TARJETA: el contenido que el modelo decidió mostrar en
-- pantalla (una receta, un paso a paso, una lista) mientras la charla hablada
-- sigue. Llega como argumento de la function call `mostrar_en_pantalla`, no de
-- una transcripción — es contenido que el modelo escribió A PROPÓSITO para
-- leerse con los ojos, en markdown, distinto de lo que dijo en voz alta.
--
-- Deliberadamente NO tiene columna `embedding`, y hay tres consecuencias que
-- conviene dejar escritas acá porque son fáciles de romper después sin querer:
--
--   1. FUERA DE RAG. `buscar_memoria_vectorial` y `buscar_en_memoria` no la
--      tocan ni deben tocarla. Lo que se habló ya se guarda en
--      memoria_vectorial por turno (hallazgo A); la tarjeta es una vista de eso
--      mismo, no una fuente nueva. Indexarla haría que el mismo contenido
--      vuelva dos veces con dos marcos distintos — exactamente el problema que
--      la asimetría de RAG se tomó el trabajo de evitar entre `recuerdosRecientes`
--      y `buscar_en_memoria`.
--   2. FUERA DE LA PODA. El pendiente conocido de Fase 2 (memoria_vectorial
--      crece sin límite y en algún momento va a necesitar poda o resumen) NO
--      aplica acá. Una pizarra es un objeto que el usuario ve, navega y borra a
--      mano desde Historial; que un proceso automático se la borre por vieja
--      sería una sorpresa, no una optimización.
--   3. SIN `update`. No hay policy de update a propósito (a diferencia de
--      memoria_vectorial y memoria_hechos, que sí la tienen): una tarjeta es la
--      foto de lo que se mostró en pantalla en un momento. Editarla después
--      convertiría el historial en algo que no pasó. Se crea y se borra, nada más.
--
-- Multi-usuario con RLS igual que el resto: un usuario nunca ve ni borra las
-- pizarras de otro.

create table public.pizarras (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- El `session_id` de `sesiones_live` bajo el que se mostró la tarjeta. Es una
  -- etiqueta de AGRUPACIÓN (todas las tarjetas de una misma llamada van juntas
  -- en Historial), no una frontera de seguridad — de eso ya se encarga la RLS,
  -- igual que en la acción `tool` de la Edge Function, que tampoco lo valida
  -- contra el lock. No es FK: `sesiones_live` es un lock efímero con TTL, y la
  -- tarjeta tiene que sobrevivir a que esa fila se libere.
  --
  -- NOT NULL y no nullable a propósito: es parte del índice de dedupe de abajo,
  -- y en Postgres dos NULL nunca chocan entre sí en un índice único. Con la
  -- columna nullable, una tarjeta sin session_id se duplicaría en silencio en
  -- cada reconexión, que es justo el caso que el índice viene a tapar.
  session_id text not null,
  titulo text,
  contenido text not null,
  created_at timestamptz not null default now()
);

-- DEDUPE ANTE RECONEXIÓN.
--
-- Session resumption puede hacer que Gemini reemita una function call que ya
-- había emitido antes del corte: la conversación se retoma desde un handle, y
-- lo que estaba a medio camino se rehace. Sin esto, cada `goAway` o cada caída
-- de red podría dejar la misma receta dos o tres veces en pantalla y en la base.
--
-- El hash va sobre el contenido YA SANEADO (es lo que se inserta), así que el
-- criterio de acá y el de `normalizarArgsPizarra` no se pueden desalinear como
-- sí podría pasar si se hasheara el argumento crudo. El `23505` se trata como
-- "ya estaba", mismo patrón exacto que el índice único de memoria_hechos.
--
-- El scope es (usuario, sesión): la misma tarjeta en una llamada de mañana es
-- una tarjeta nueva, no un duplicado.
create unique index pizarras_dedupe_idx
  on public.pizarras (user_id, session_id, md5(contenido));

create index pizarras_user_created_idx
  on public.pizarras (user_id, created_at desc);

alter table public.pizarras enable row level security;

create policy "pizarras_select_own"
  on public.pizarras for select
  using (user_id = auth.uid());

create policy "pizarras_insert_own"
  on public.pizarras for insert
  with check (user_id = auth.uid());

-- Sin policy de update: ver el punto 3 de la cabecera. El borrado sí, porque es
-- la única excepción al "Historial es de sólo lectura" que se decidió a
-- propósito para las pizarras.
create policy "pizarras_delete_own"
  on public.pizarras for delete
  using (user_id = auth.uid());
