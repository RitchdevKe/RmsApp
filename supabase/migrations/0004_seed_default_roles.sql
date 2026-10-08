-- supabase/migrations/0004_seed_default_roles.sql

create schema if not exists app;

-- Build the same permissions object as the frontend's createMockPermissions()
create or replace function app.build_role_permissions(all_true boolean)
returns jsonb
language plpgsql
stable
as $$
declare
  modules text[] := array['Properties','Tenants','Landlords','Financials','Maintenance','Reports','Settings','Users','R-Reits'];
  actions text[] := array['create','edit','delete','view','approve','import','activate','deactivate','publish','pay','resolve','cancel'];
  result jsonb := '{}'::jsonb;
  mod text;
  act text;
  mod_obj jsonb;
begin
  foreach mod in array modules loop
    mod_obj := '{}'::jsonb;
    foreach act in array actions loop
      mod_obj := mod_obj || jsonb_build_object(act, all_true);
    end loop;
    result := result || jsonb_build_object(mod, mod_obj);
  end loop;
  return result;
end;
$$;

do $$
declare
  all_submodules text[] := array[
    'Dashboard', 'Dashboard/Dashboard', 'Dashboard/Quick Stats', 'Dashboard/Quick Search', 'Dashboard/Welcome Banner', 'Dashboard/Search & Filter Bar', 'Dashboard/House Status Alerts', 'Dashboard/Key Statistics Cards', 'Dashboard/Quick Stats Grid', 'Dashboard/Financial Health Chart', 'Dashboard/Recent Activities', 'Dashboard/Upcoming Payments', 'Dashboard/My Tasks',
    'Registration', 'Registration/Overview', 'Registration/Users', 'Registration/Payment Setup', 'Registration/Commissions', 'Registration/Geospatial Mapping', 'Registration/Properties',
    'Landlords', 'Landlords/Overview', 'Landlords/Applications', 'Landlords/Active Landlords', 'Landlords/Deductions', 'Landlords/Offboarding',
    'Tenants', 'Tenants/Overview', 'Tenants/Applications', 'Tenants/Active Tenants', 'Tenants/Fines & Penalties', 'Tenants/Tenant Insights', 'Tenants/Offboarding',
    'Operations', 'Operations/Field Agents', 'Operations/Affiliates', 'Operations/Caretakers', 'Operations/Properties', 'Operations/Maintenance', 'Operations/Task Management', 'Operations/Communications', 'Operations/Leases',
    'Payments', 'Payments/Overview', 'Payments/Inbound', 'Payments/Outbound', 'Payments/Invoices', 'Payments/Reconciliation', 'Payments/Landlord Payouts', 'Payments/Overpayments', 'Payments/Payment Processing',
    'Marketplace', 'Marketplace/Listings', 'Marketplace/Leads', 'Marketplace/Affiliates', 'Marketplace/MyFundiHub', 'Marketplace/Referral Program', 'Marketplace/Marketing Banners', 'Marketplace/Reporting',
    'R-Reits', 'R-Reits/Overview', 'R-Reits/Investment Plans', 'R-Reits/Project Accounting', 'R-Reits/Investor Dashboard', 'R-Reits/RF Payments', 'R-Reits/Portfolio Performance', 'R-Reits/Referrals', 'R-Reits/Compliance & KYC',
    'HR & Payroll', 'HR & Payroll/Staff Management', 'HR & Payroll/Payroll Processing', 'HR & Payroll/Commissions', 'HR & Payroll/Leave & Attendance', 'HR & Payroll/Performance', 'HR & Payroll/Reporting',
    'Accounting', 'Accounting/Overview', 'Accounting/Income', 'Accounting/Expenses', 'Accounting/Financial Statements', 'Accounting/Tax Compliance', 'Accounting/Reconciliation', 'Accounting/Reporting',
    'Reports & Analytics', 'Reports & Analytics/Reports', 'Reports & Analytics/Analytics',
    'User App Portal', 'User App Portal/Tenant Portal', 'User App Portal/Agent Portal', 'User App Portal/Landlords Portal', 'User App Portal/Affiliate Portal', 'User App Portal/Investors Portal', 'User App Portal/Caretaker Portal', 'User App Portal/Contractor Portal', 'User App Portal/Referral Landing', 'User App Portal/Refer & Earn', 'User App Portal/My Profile',
    'Settings', 'Settings/Profile', 'Settings/Roles', 'Settings/Permissions', 'Settings/Widgets', 'Settings/Rates & Rules', 'Settings/Constants', 'Settings/Audit Trail'
  ];
  super_admin_widgets text[] := array[
    'dash_welcome', 'dash_search', 'dash_house_alerts', 'dash_key_stats',
    'dash_quick_stats', 'dash_financial_chart', 'dash_recent_activity',
    'dash_upcoming_payments', 'dash_my_tasks'
  ];
begin
  -- Super Admin
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Super Admin',
    'Full system access',
    true,
    app.build_role_permissions(true),
    all_submodules,
    super_admin_widgets
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Branch Manager
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Branch Manager',
    'Manage properties and tenants for a branch',
    true,
    app.build_role_permissions(true),
    all_submodules,
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Accountant
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Accountant',
    'Financials only',
    true,
    app.build_role_permissions(false),
    array[
      'Dashboard', 'Dashboard/Quick Stats',
      'Payments', 'Payments/Overview', 'Payments/Inbound', 'Payments/Outbound',
      'Accounting', 'Accounting/Overview', 'Accounting/Income', 'Accounting/Expenses',
      'Reports & Analytics', 'Reports & Analytics/Reports'
    ]::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Assistant Admin
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Assistant Admin',
    'Support for Super Admin',
    true,
    app.build_role_permissions(true),
    all_submodules,
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Finance Manager
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Finance Manager',
    'Oversees all financial operations',
    true,
    app.build_role_permissions(true),
    all_submodules,
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Office Admin
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Office Admin',
    'General office management',
    true,
    app.build_role_permissions(false),
    all_submodules,
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Customer Care
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Customer Care',
    'Support and communications',
    true,
    app.build_role_permissions(false),
    array['Dashboard','Operations/Communications','Tenants/Overview','Tenants/Applications']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Tenant
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Tenant',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Tenant Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Landlord
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Landlord',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Landlords Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Field Agent
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Field Agent',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Agent Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Caretaker
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Caretaker',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Caretaker Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Investor
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Investor',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Investors Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Affiliate
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Affiliate',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Affiliate Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();

  -- Contractor
  insert into app.roles (name, description, is_system, permissions, accessible_submodules, widget_access)
  values (
    'Contractor',
    'User App Portal Access',
    false,
    app.build_role_permissions(false),
    array['User App Portal/Contractor Portal','User App Portal/Refer & Earn','User App Portal/My Profile']::text[],
    '{}'::text[]
  )
  on conflict (name) do update set
    description = excluded.description,
    is_system = excluded.is_system,
    permissions = excluded.permissions,
    accessible_submodules = excluded.accessible_submodules,
    widget_access = excluded.widget_access,
    updated_at = now();
end $$;

-- Ensure Super Admin is granted to the target email (if user already exists)
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

