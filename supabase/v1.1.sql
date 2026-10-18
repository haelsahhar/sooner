-- Version 1.1 upgrade. Run once in the Supabase SQL editor (safe to run again).

-- Every listing on the clinic's HotDoc page is now stored, not just the four featured doctors.
alter table public.doctors add column if not exists profession text;
-- false once a doctor disappears from the clinic's HotDoc page
alter table public.doctors add column if not exists active boolean not null default true;

-- One row that remembers whether HotDoc has been reachable, so outage alerts go out once, not every 10 minutes.
create table if not exists public.poller_status (
  id smallint primary key default 1 check (id = 1),
  consecutive_failures integer not null default 0,
  failing_since timestamptz,
  last_error text,
  alerted_at timestamptz,
  last_success_at timestamptz
);
insert into public.poller_status (id) values (1) on conflict (id) do nothing;

alter table public.poller_status enable row level security;
