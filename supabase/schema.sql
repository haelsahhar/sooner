-- Run this once in the Supabase SQL editor.

create table if not exists public.doctors (
  slug text primary key,
  name text not null,
  image_url text,
  earliest_available timestamptz,
  call_to_book boolean not null default false,
  updated_at timestamptz
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  doctor_slug text not null references public.doctors(slug) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  confirmed boolean not null default false,
  -- the earliest slot this person was last told about / last saw; alerts fire when a new one is sooner
  last_seen timestamptz,
  confirm_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email, doctor_slug)
);

create index if not exists subscriptions_doctor_idx on public.subscriptions (doctor_slug) where confirmed;

-- Only the server (service role key) touches these tables. No public policies on purpose.
alter table public.doctors enable row level security;
alter table public.subscriptions enable row level security;

-- Seed the four tracked doctors so the site and signups work before the first poll.
insert into public.doctors (slug, name) values
  ('dr-sohair-sulieman', 'Dr Sohair Sulieman'),
  ('dr-ziad-basyouny-6', 'Dr Ziad Basyouny'),
  ('dr-hassan-raza-1', 'Dr Hassan Raza'),
  ('dr-ekhlas-nasser', 'Dr Ekhlas Nasser')
on conflict (slug) do nothing;
