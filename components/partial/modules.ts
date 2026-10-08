import type { PartialModule } from './moduleMap';

/**
 * Full Partial sidebar tree. AgencyConsole + LandlordView both consume this;
 * PartialShellLayout filters by role using `hideForRoles` flags.
 *
 * `primary: true` surfaces a module in the mobile bottom tab bar (cap 5).
 */
export const PARTIAL_MODULES: PartialModule[] = [
  {
    key: 'dashboard', name: 'Dashboard', icon: 'dashboard', primary: true,
    subModules: [{ key: 'overview', name: 'Overview' }],
  },
  {
    key: 'properties', name: 'Properties', icon: 'leases', primary: true,
    subModules: [
      { key: 'manage',    name: 'Properties & Units' },
      { key: 'occupancy', name: 'Occupancy' },
    ],
  },
  {
    key: 'tenants', name: 'Tenants', icon: 'tenants', primary: true,
    subModules: [
      { key: 'active',       name: 'Active tenants' },
      { key: 'applications', name: 'Applications' },
      { key: 'arrears',      name: 'Arrears watch' },
    ],
  },
  {
    key: 'leases', name: 'Leases', icon: 'leases',
    subModules: [
      { key: 'active',       name: 'Active leases' },
      { key: 'renewals',     name: 'Renewals' },
      { key: 'terminations', name: 'Terminations' },
    ],
  },
  {
    key: 'payments', name: 'Payments', icon: 'payments', primary: true,
    subModules: [
      { key: 'inbound',  name: 'Inbound (M-Pesa)' },
      { key: 'receipts', name: 'Receipts' },
      { key: 'reconcile', name: 'Reconciliation' },
    ],
  },
  {
    key: 'payouts', name: 'Payouts', icon: 'accounting',
    subModules: [
      { key: 'runs',       name: 'Runs & history' },
      { key: 'statements', name: 'Statements' },
    ],
  },
  {
    key: 'comms', name: 'Communications', icon: 'communication',
    subModules: [
      { key: 'inbox',     name: 'Tenant inbox' },
      { key: 'broadcast', name: 'Broadcast', hideForRoles: ['landlord'] },
    ],
  },
  {
    key: 'maintenance', name: 'Maintenance', icon: 'maintenance',
    subModules: [
      { key: 'tickets', name: 'Tickets' },
      { key: 'orders',  name: 'Work orders' },
      { key: 'vendors', name: 'Vendors', hideForRoles: ['landlord'] },
    ],
  },
  {
    key: 'reports', name: 'Reports', icon: 'reports',
    subModules: [
      { key: 'collections', name: 'Collections' },
      { key: 'arrears',     name: 'Arrears aging' },
      { key: 'landlords',   name: 'Landlord performance', hideForRoles: ['landlord'] },
    ],
  },
  {
    key: 'settings', name: 'Settings', icon: 'settings', primary: true,
    subModules: [
      { key: 'profile',  name: 'Profile' },
      { key: 'org',      name: 'Organization', hideForRoles: ['landlord'] },
      { key: 'mpesa',    name: 'M-Pesa & fees', hideForRoles: ['landlord'] },
      { key: 'branding', name: 'Branding',      hideForRoles: ['landlord'] },
      { key: 'team',     name: 'Team & roles',  hideForRoles: ['landlord'] },
    ],
  },
];
