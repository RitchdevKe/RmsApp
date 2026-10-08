-- supabase/migrations/0003_roles_permissions_rls.sql

create schema if not exists app;

-- Roles table matches the existing frontend Role shape
create table if not exists app.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  is_system boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  accessible_submodules text[] not null default '{}'::text[],
  widget_access text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.permissions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- One role per user (can be extended later)
create table if not exists app.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references app.roles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- RLS helpers
create or replace function app.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
    where ur.user_id = p_user
      and r.name = 'Super Admin'
  );
$$;

-- Enable RLS
alter table app.roles enable row level security;
alter table app.permissions enable row level security;
alter table app.user_roles enable row level security;
alter table app.app_state enable row level security;
alter table app.staff_profiles enable row level security;

-- Roles: everyone authenticated can read; only admins can modify
drop policy if exists "roles_select_authenticated" on app.roles;
create policy "roles_select_authenticated"
on app.roles
for select
to authenticated
using (true);

drop policy if exists "roles_modify_admin" on app.roles;
create policy "roles_modify_admin"
on app.roles
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- Permissions: everyone authenticated can read; only admins can modify
drop policy if exists "permissions_select_authenticated" on app.permissions;
create policy "permissions_select_authenticated"
on app.permissions
for select
to authenticated
using (true);

drop policy if exists "permissions_modify_admin" on app.permissions;
create policy "permissions_modify_admin"
on app.permissions
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- User roles: admins can read/modify; users can read their own
drop policy if exists "user_roles_select_admin_or_self" on app.user_roles;
create policy "user_roles_select_admin_or_self"
on app.user_roles
for select
to authenticated
using (app.is_admin(auth.uid()) or user_id = auth.uid());

drop policy if exists "user_roles_modify_admin" on app.user_roles;
create policy "user_roles_modify_admin"
on app.user_roles
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- app_state: admin-only for now (JSONB store is global; tighten with org_id later)
drop policy if exists "app_state_admin_only" on app.app_state;
create policy "app_state_admin_only"
on app.app_state
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- staff_profiles: admin-only for now (expand later)
drop policy if exists "staff_profiles_admin_only" on app.staff_profiles;
create policy "staff_profiles_admin_only"
on app.staff_profiles
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- Seed default "Super Admin" role with full access
do $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from app.roles where name = 'Super Admin';
  if v_role_id is null then
    insert into app.roles (
      name,
      description,
      is_system,
      permissions,
      accessible_submodules,
      widget_access
    ) values (
      'Super Admin',
      'Full system access',
      true,
      -- permissions matrix: allow everything for all modules
      jsonb_build_object(
        'Properties', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Tenants', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Landlords', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Financials', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Maintenance', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Reports', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Settings', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'Users', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true),
        'R-Reits', jsonb_build_object('create', true, 'edit', true, 'delete', true, 'view', true, 'approve', true, 'import', true, 'activate', true, 'deactivate', true, 'publish', true, 'pay', true, 'resolve', true, 'cancel', true)
      ),
      -- Accessible submodules: include all NAVIGATION_ITEMS entries (module/submodule)
      array[
        'Dashboard/Dashboard','Dashboard/Quick Stats','Dashboard/Quick Search',
        'Registration/Overview','Registration/Users','Registration/Payment Setup','Registration/Commissions','Registration/Geospatial Mapping','Registration/Properties',
        'Landlords/Overview','Landlords/Applications','Landlords/Active Landlords','Landlords/Deductions','Landlords/Offboarding',
        'Tenants/Overview','Tenants/Applications','Tenants/Active Tenants','Tenants/Fines & Penalties','Tenants/Tenant Insights','Tenants/Offboarding',
        'Operations/Field Agents','Operations/Affiliates','Operations/Caretakers','Operations/Properties','Operations/Maintenance','Operations/Task Management','Operations/Communications','Operations/Leases',
        'Payments/Overview','Payments/Inbound','Payments/Outbound','Payments/Invoices','Payments/Reconciliation','Payments/Landlord Payouts','Payments/Overpayments','Payments/Payment Processing',
        'Marketplace/Listings','Marketplace/Leads','Marketplace/Affiliates','Marketplace/MyFundiHub','Marketplace/Referral Program','Marketplace/Marketing Banners','Marketplace/Reporting',
        'R-Reits/Overview','R-Reits/Investment Plans','R-Reits/Project Accounting','R-Reits/Investor Dashboard','R-Reits/RF Payments','R-Reits/Portfolio Performance','R-Reits/Referrals','R-Reits/Compliance & KYC',
        'HR & Payroll/Staff Management','HR & Payroll/Payroll Processing','HR & Payroll/Commissions','HR & Payroll/Leave & Attendance','HR & Payroll/Performance','HR & Payroll/Reporting',
        'Accounting/Overview','Accounting/Income','Accounting/Expenses','Accounting/Financial Statements','Accounting/Tax Compliance','Accounting/Reconciliation','Accounting/Reporting',
        'Reports & Analytics/Reports','Reports & Analytics/Analytics',
        'User App Portal/Tenant Portal','User App Portal/Agent Portal','User App Portal/Landlords Portal','User App Portal/Affiliate Portal','User App Portal/Investors Portal','User App Portal/Caretaker Portal','User App Portal/Contractor Portal','User App Portal/Referral Landing','User App Portal/Refer & Earn','User App Portal/My Profile',
        'Settings/Profile','Settings/Roles','Settings/Permissions','Settings/Widgets','Settings/Rates & Rules','Settings/Constants','Settings/Audit Trail'
      ]::text[],
      -- Widget access: allow all known widgets for dashboard + other modules
      array[
        'dash_welcome','dash_search','dash_house_alerts','dash_key_stats','dash_quick_stats','dash_financial_chart','dash_recent_activity','dash_upcoming_payments','dash_my_tasks',
        'reg_user_stats','reg_quick_actions',
        'ten_kpi','ten_status_dist','ten_lease_struct','ten_expiring','ten_financials',
        'land_kpi','land_collection','land_alerts','land_quick_actions',
        'ops_kpi','ops_nav',
        'pay_kpi','pay_income_chart','pay_methods_chart','pay_recent',
        'rep_modules','rep_health','rep_insights'
      ]::text[]
    ) returning id into v_role_id;
  end if;
end $$;

-- Auto-grant Super Admin to a specific email on signup
create or replace function app.assign_super_admin_for_email()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_role_id uuid;
begin
  if new.email = '1kevinsjames@gmail.com' then
    select id into v_role_id from app.roles where name = 'Super Admin';
    if v_role_id is not null then
      insert into app.user_roles (user_id, role_id)
      values (new.id, v_role_id)
      on conflict (user_id) do update set role_id = excluded.role_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_super_admin_for_email on auth.users;
create trigger trg_assign_super_admin_for_email
after insert on auth.users
for each row execute function app.assign_super_admin_for_email();

-- If the user already exists, grant immediately (no-op if not found)
do $$
declare
  v_user_id uuid;
  v_role_id uuid;
begin
  select id into v_user_id from auth.users where email = '1kevinsjames@gmail.com' limit 1;
  select id into v_role_id from app.roles where name = 'Super Admin' limit 1;
  if v_user_id is not null and v_role_id is not null then
    insert into app.user_roles (user_id, role_id)
    values (v_user_id, v_role_id)
    on conflict (user_id) do update set role_id = excluded.role_id;
  end if;
end $$;

