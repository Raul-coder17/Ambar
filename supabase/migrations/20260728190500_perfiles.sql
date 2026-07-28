-- Perfil mínimo por usuario, 1:1 con auth.users.
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  created_at timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create policy "Los usuarios ven su propio perfil"
  on public.perfiles for select
  using (auth.uid() = id);

create policy "Los usuarios actualizan su propio perfil"
  on public.perfiles for update
  using (auth.uid() = id);

-- Crea el perfil automáticamente al registrarse.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
