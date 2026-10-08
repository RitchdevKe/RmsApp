-- Normalized contractors (service providers) alongside app.staff_profiles for employees.
-- Frontend may still use app_state vendors; this table enables SQL/RPC/reporting and future sync.

create table if not exists app.contractors (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null default '',
  specialty text not null default 'General',
  status text not null default 'Active' check (status in ('Active', 'Suspended', 'Terminated')),
  rating numeric default 5,
  verified boolean default false,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app.contractors_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contractors_set_updated_at on app.contractors;
create trigger trg_contractors_set_updated_at
before update on app.contractors
for each row execute function app.contractors_set_updated_at();

alter table app.contractors enable row level security;

drop policy if exists contractors_select_authenticated on app.contractors;
create policy contractors_select_authenticated
on app.contractors for select
to authenticated
using (true);

drop policy if exists contractors_admin_all on app.contractors;
create policy contractors_admin_all
on app.contractors for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

drop policy if exists contractors_own_row on app.contractors;
create policy contractors_own_row
on app.contractors for select
to authenticated
using (id = auth.uid());
