create table if not exists public.marketplace_listings (
  id text primary key,
  payload jsonb not null,
  source text not null default 'Managed',
  status text not null default 'Draft',
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.marketplace_listings to authenticated;
grant all on public.marketplace_listings to service_role;

alter table public.marketplace_listings enable row level security;

drop policy if exists "authenticated manage marketplace listings" on public.marketplace_listings;
create policy "authenticated manage marketplace listings"
  on public.marketplace_listings for all to authenticated
  using (true) with check (true);

create index if not exists marketplace_listings_status_source_idx
  on public.marketplace_listings(status, source);