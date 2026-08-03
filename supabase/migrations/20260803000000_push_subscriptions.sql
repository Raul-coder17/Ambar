-- Suscripciones Web Push por usuario/navegador. Infraestructura base para
-- Fase 5 (objetivos vigilados) — por ahora sin contenido de objetivos, sólo
-- lo necesario para poder mandar (y validar) un push genérico. Mismo esquema
-- que push_subscriptions de Organizador-IA.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Lo que va a consultar la Edge Function de envío: suscripciones por usuario.
create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

-- ============================================================
-- RLS: push_subscriptions (scopeada al dueño; el service_role la bypassa)
-- ============================================================

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on push_subscriptions for select
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
  on push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_own"
  on push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own"
  on push_subscriptions for delete
  using (user_id = auth.uid());
