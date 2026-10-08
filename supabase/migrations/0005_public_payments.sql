-- supabase/migrations/0005_public_payments.sql
--
-- Real payments ledger for M-Pesa STK push (sandbox/prod)

-- Needed for uuid_generate_v4()
create extension if not exists "uuid-ossp";

-- Generic updated_at trigger helper (public schema)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lease_id uuid null,
  amount numeric not null,
  phone text not null,
  checkout_request_id text not null,
  transaction_id text null,
  status text not null check (status in ('pending','completed','failed','cancelled')),
  result_code integer null,
  result_desc text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payments_set_updated_at on public.payments;
create trigger trg_payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

-- Users can only see their own payments
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
on public.payments
for select
to authenticated
using (user_id = auth.uid());

-- Authenticated users can insert their own payments
drop policy if exists "payments_insert_own" on public.payments;
create policy "payments_insert_own"
on public.payments
for insert
to authenticated
with check (user_id = auth.uid());

