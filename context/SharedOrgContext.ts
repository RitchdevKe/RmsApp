import { createContext } from 'react';
import { ShellKind, OrgTier } from '../utils/orgHost';

export interface ResolvedOrg {
  id: string;
  slug: string;
  name: string;
  tier: OrgTier;
  status: 'active' | 'trial' | 'suspended' | 'archived';
  primary_subdomain: string;
  branding: {
    app_name?: string;
    primary_color?: string;
    logo_url?: string | null;
  };
}

export interface OrgContextValue {
  shell: ShellKind;          // What subdomain this browser is on
  org: ResolvedOrg | null;   // The org row matching the hostname (null if unknown host)
  loading: boolean;
  error: string | null;
  reload: () => void;
  setOrgOverride: (orgId: string | null) => Promise<void>;
}

export const SharedOrgContext = createContext<OrgContextValue | null>(null);
