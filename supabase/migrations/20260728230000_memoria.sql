-- Fase 2: memoria. Dos fuentes distintas, con propósitos distintos:
--
--   memoria_vectorial -> RAG. Un embedding por intercambio (lo que dijo el
--     usuario + lo que contestó Ámbar). Es lo que permite recuperar "aquella
--     vez que hablamos de X" sin mandar el historial entero.
--   memoria_hechos    -> hechos estructurados, en texto plano y en español
--     ("se llama Raúl", "prefiere respuestas cortas"). Van SIEMPRE en el
--     contexto, no se buscan: son pocos y son los que definen con quién está
--     hablando el asistente.
--
-- Las dos se llenan desde `ai-chat` y las dos son por usuario, con RLS igual
-- que ajustes_ia: un usuario nunca ve ni escribe la memoria de otro.

-- pgvector. Se crea en el schema `extensions` (convención de Supabase, no en
-- public) y por eso el tipo va calificado como `extensions.vector` en todos
-- lados: `public` es el único schema garantizado en el search_path de las
-- funciones de abajo.
create extension if not exists vector with schema extensions;

-- ============================================================
-- memoria_vectorial: embeddings de los intercambios (RAG)
-- ============================================================

-- 768 dimensiones y no las 3072 por defecto de gemini-embedding-2: el límite
-- de pgvector para índices HNSW/ivfflat es 2000 dimensiones, así que con 3072
-- no habría forma de indexar sin pasar a `halfvec`. 768 es una de las tres
-- medidas recomendadas por Google (768/1536/3072) y el modelo renormaliza solo
-- al truncar, cosa que gemini-embedding-001 obligaba a hacer a mano.
create table public.memoria_vectorial (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contenido text not null,
  -- Nullable a propósito: si el endpoint de embeddings falla o está sin cuota,
  -- el texto del intercambio se guarda igual y sólo se pierde la búsqueda por
  -- similitud sobre esa fila. Perder el texto sería peor que perder el vector.
  embedding extensions.vector(768),
  created_at timestamptz not null default now()
);

-- Índice de similitud coseno. Parcial (`where embedding is not null`) para no
-- indexar las filas que quedaron sin vector.
create index memoria_vectorial_embedding_idx
  on public.memoria_vectorial
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index memoria_vectorial_user_created_idx
  on public.memoria_vectorial (user_id, created_at desc);

alter table public.memoria_vectorial enable row level security;

create policy "memoria_vectorial_select_own"
  on public.memoria_vectorial for select
  using (user_id = auth.uid());

create policy "memoria_vectorial_insert_own"
  on public.memoria_vectorial for insert
  with check (user_id = auth.uid());

create policy "memoria_vectorial_update_own"
  on public.memoria_vectorial for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "memoria_vectorial_delete_own"
  on public.memoria_vectorial for delete
  using (user_id = auth.uid());

-- ============================================================
-- memoria_hechos: hechos clave del usuario
-- ============================================================

create table public.memoria_hechos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  hecho text not null,
  -- Opcional y libre (no un enum): "identidad", "preferencia", "rutina"…
  -- Sirve para agrupar en la vista Memoria (Fase 7) y para que el propio
  -- modelo ordene lo que guarda, pero nada de la lógica depende del valor.
  categoria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedup duro por (usuario, hecho normalizado). La primera línea de defensa es
-- el contexto —el modelo VE los hechos que ya existen antes de proponer uno
-- nuevo, así que rara vez repite— pero un índice único evita que un "Se llama
-- Raúl" vs "se llama Raúl " termine como dos filas.
create unique index memoria_hechos_user_hecho_idx
  on public.memoria_hechos (user_id, lower(btrim(hecho)));

create trigger memoria_hechos_set_updated_at
  before update on public.memoria_hechos
  for each row
  execute function public.set_updated_at();

alter table public.memoria_hechos enable row level security;

create policy "memoria_hechos_select_own"
  on public.memoria_hechos for select
  using (user_id = auth.uid());

create policy "memoria_hechos_insert_own"
  on public.memoria_hechos for insert
  with check (user_id = auth.uid());

create policy "memoria_hechos_update_own"
  on public.memoria_hechos for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "memoria_hechos_delete_own"
  on public.memoria_hechos for delete
  using (user_id = auth.uid());

-- ============================================================
-- Búsqueda por similitud coseno
-- ============================================================

-- El operador `<=>` no se puede expresar desde supabase-js, así que la
-- búsqueda vive acá. `security invoker` => corre con el rol del usuario y RLS
-- ya recorta a sus propias filas; el `user_id = auth.uid()` explícito es
-- redundante con RLS pero le da al planner el filtro por adelantado.
--
-- Devuelve `similitud` (1 - distancia coseno, o sea 1 = idéntico) en vez de la
-- distancia cruda porque es lo que se usa para el umbral del lado de la Edge
-- Function, y razonar con "más alto es más parecido" evita errores de signo.
create function public.buscar_memoria_vectorial(
  consulta extensions.vector(768),
  limite integer default 5
)
returns table (contenido text, similitud double precision, created_at timestamptz)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select mv.contenido,
         1 - (mv.embedding <=> consulta) as similitud,
         mv.created_at
    from memoria_vectorial mv
   where mv.user_id = auth.uid()
     and mv.embedding is not null
   order by mv.embedding <=> consulta
   limit greatest(1, least(limite, 20));
$$;

grant execute on function public.buscar_memoria_vectorial(extensions.vector, integer) to authenticated;
