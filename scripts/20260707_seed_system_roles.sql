-- =====================================================================
-- Seed / refresh the two built-in system roles used by the RMS UI.
-- Safe to run repeatedly — uses ON CONFLICT on the role name.
--
-- Fills:
--   • permissions           (action matrix per module — what Roles & Permissions renders)
--   • accessible_submodules (routes/menu access — what Permissions renders)
--   • widget_access         (dashboard widgets — what Widgets renders)
-- =====================================================================

BEGIN;

-- Super Admin — full unrestricted access
INSERT INTO app.roles (id, name, description, is_system, permissions, accessible_submodules, widget_access)
VALUES (
    gen_random_uuid(),
    'Super Admin',
    'Full unrestricted access to every module, action and dashboard widget.',
    TRUE,
    jsonb_build_object(
        'Properties',  jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Tenants',     jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Landlords',   jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Financials',  jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Maintenance', jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Reports',     jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Settings',    jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'Users',       jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true),
        'R-Reits',     jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',true,'resolve',true,'cancel',true)
    ),
    ARRAY[
        'dashboard','overview',
        'registration/properties','registration/landlords','registration/tenants',
        'tenants/active-tenants','tenants/applications','tenants/offboarding','tenants/fines','tenants/insights','tenants/portal',
        'landlords/active-landlords','landlords/onboarding','landlords/offboarding',
        'payments/inbound','payments/outbound','payments/reconciliation',
        'operations/tasks','operations/communications','operations/communications/automations','operations/workflows','operations/reporting','operations/audit-trail','operations/escalation-rules',
        'marketplace/affiliates','marketplace/listings','marketplace/leads','marketplace/fundi-jobs',
        'settings/profile','settings/company-structure','settings/roles','settings/permissions','settings/widgets','settings/rates-and-rules','settings/constants','settings/audit-trail',
        'partial-rms/tenants','partial-rms/landlords','partial-rms/payments'
    ]::text[],
    ARRAY[
        'quick-stats','revenue-chart','occupancy','arrears','tasks-overview','recent-activity',
        'lease-expiry','collections','tenant-insights','affiliate-earnings','system-health','audit-feed'
    ]::text[]
)
ON CONFLICT (name) DO UPDATE
SET description           = EXCLUDED.description,
    is_system             = TRUE,
    permissions           = EXCLUDED.permissions,
    accessible_submodules = EXCLUDED.accessible_submodules,
    widget_access         = EXCLUDED.widget_access;


-- Assistant Admin — near-full access, no destructive actions on core modules
INSERT INTO app.roles (id, name, description, is_system, permissions, accessible_submodules, widget_access)
VALUES (
    gen_random_uuid(),
    'Assistant Admin',
    'Operational admin: full view/edit/approve, no delete on Properties/Landlords/Financials/Users.',
    TRUE,
    jsonb_build_object(
        'Properties',  jsonb_build_object('create',true,'edit',true,'delete',false,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',true,'pay',false,'resolve',true,'cancel',true),
        'Tenants',     jsonb_build_object('create',true,'edit',true,'delete',false,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',false,'pay',true,'resolve',true,'cancel',true),
        'Landlords',   jsonb_build_object('create',true,'edit',true,'delete',false,'view',true,'approve',true,'import',true,'activate',true,'deactivate',true,'publish',false,'pay',false,'resolve',true,'cancel',true),
        'Financials',  jsonb_build_object('create',true,'edit',true,'delete',false,'view',true,'approve',true,'import',true,'activate',false,'deactivate',false,'publish',false,'pay',true,'resolve',true,'cancel',true),
        'Maintenance', jsonb_build_object('create',true,'edit',true,'delete',true,'view',true,'approve',true,'import',false,'activate',true,'deactivate',true,'publish',false,'pay',true,'resolve',true,'cancel',true),
        'Reports',     jsonb_build_object('create',true,'edit',false,'delete',false,'view',true,'approve',false,'import',true,'activate',false,'deactivate',false,'publish',true,'pay',false,'resolve',false,'cancel',false),
        'Settings',    jsonb_build_object('create',false,'edit',true,'delete',false,'view',true,'approve',false,'import',false,'activate',false,'deactivate',false,'publish',false,'pay',false,'resolve',false,'cancel',false),
        'Users',       jsonb_build_object('create',true,'edit',true,'delete',false,'view',true,'approve',true,'import',false,'activate',true,'deactivate',true,'publish',false,'pay',false,'resolve',false,'cancel',false),
        'R-Reits',     jsonb_build_object('create',false,'edit',false,'delete',false,'view',true,'approve',false,'import',false,'activate',false,'deactivate',false,'publish',false,'pay',false,'resolve',false,'cancel',false)
    ),
    ARRAY[
        'dashboard','overview',
        'registration/properties','registration/landlords','registration/tenants',
        'tenants/active-tenants','tenants/applications','tenants/offboarding','tenants/fines','tenants/insights',
        'landlords/active-landlords','landlords/onboarding',
        'payments/inbound','payments/outbound',
        'operations/tasks','operations/communications','operations/communications/automations','operations/workflows','operations/reporting',
        'marketplace/affiliates','marketplace/listings','marketplace/leads',
        'settings/profile','settings/roles','settings/permissions','settings/widgets','settings/rates-and-rules'
    ]::text[],
    ARRAY[
        'quick-stats','revenue-chart','occupancy','arrears','tasks-overview','recent-activity',
        'lease-expiry','collections','tenant-insights'
    ]::text[]
)
ON CONFLICT (name) DO UPDATE
SET description           = EXCLUDED.description,
    is_system             = TRUE,
    permissions           = EXCLUDED.permissions,
    accessible_submodules = EXCLUDED.accessible_submodules,
    widget_access         = EXCLUDED.widget_access;

COMMIT;

-- Verify
SELECT name, is_system,
       jsonb_object_keys(permissions) AS module
FROM app.roles
WHERE name IN ('Super Admin', 'Assistant Admin')
ORDER BY name, module;
