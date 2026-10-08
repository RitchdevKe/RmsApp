/* Module map type shared by AgencyConsole / LandlordView.
   Adds optional roles filter, badge slot, and a flag for which top-5
   modules surface in the mobile bottom tab bar. */

export type PartialRole = 'owner' | 'admin' | 'staff' | 'landlord';

export interface PartialSubModule {
  key: string;
  name: string;
  /** Hide for these roles (e.g. landlord). */
  hideForRoles?: PartialRole[];
}

export interface PartialModule {
  key: string;
  name: string;
  icon: string;
  subModules: PartialSubModule[];
  hideForRoles?: PartialRole[];
  /** If true, surfaces in mobile bottom tab bar. Pick 5 max. */
  primary?: boolean;
}

export function filterModulesForRole(modules: PartialModule[], role: PartialRole): PartialModule[] {
  return modules
    .filter(m => !m.hideForRoles?.includes(role))
    .map(m => ({
      ...m,
      subModules: m.subModules.filter(s => !s.hideForRoles?.includes(role)),
    }))
    .filter(m => m.subModules.length > 0);
}
