-- Da incollare in Supabase > SQL Editor > New query > Run.

create table if not exists public.stars (
  id          bigint generated always as identity primary key,
  x           real not null check (x >= 0 and x <= 1),
  y           real not null check (y >= 0 and y <= 1),
  message     text not null check (char_length(btrim(message)) between 1 and 280),
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false   -- moderazione: true = stella nascosta
);

alter table public.stars enable row level security;

-- Chiunque può leggere le stelle non nascoste.
drop policy if exists "leggi stelle visibili" on public.stars;
create policy "leggi stelle visibili" on public.stars
  for select to anon, authenticated
  using (hidden = false);

-- Chiunque può aggiungere una stella, ma non può nasconderla né modificarla/cancellarla.
drop policy if exists "aggiungi stella" on public.stars;
create policy "aggiungi stella" on public.stars
  for insert to anon, authenticated
  with check (hidden = false);

-- Gli utenti anonimi possono scrivere solo queste colonne.
revoke all on public.stars from anon, authenticated;
grant select (id, x, y, message, created_at) on public.stars to anon, authenticated;
grant insert (x, y, message) on public.stars to anon, authenticated;
