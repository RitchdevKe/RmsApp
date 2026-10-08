import React from 'react';
import PartialShellLayout from './PartialShellLayout';
import { LandlordDashboard } from './LandlordDashboard';
import { PropertiesGrid } from './PropertiesGrid';
import { TenantsList } from './TenantsList';
import { LeasesView } from './LeasesView';
import { PaymentsTable } from './PaymentsTable';
import { PayoutsTable } from './PayoutsTable';
import { ProfileSettings } from './SettingsPanel';
import { PARTIAL_MODULES } from './modules';
import { ComingSoon } from './ComingSoon';

interface Props { userId: string; email: string | null; onSignOut: () => void; }

/**
 * Landlord shell — same module tree as the agency, but the layout filters
 * out sub-modules tagged `hideForRoles: ['landlord']`. Data fetches are
 * scoped to this landlord via the `landlordUserId` prop and RLS.
 */
export const LandlordView: React.FC<Props> = ({ userId, email, onSignOut }) => {
  return (
    <PartialShellLayout
      modules={PARTIAL_MODULES}
      email={email}
      onLogout={onSignOut}
      role="landlord"
      renderContent={(m, s) => {
        switch (m) {
          case 'dashboard':
            return <LandlordDashboard userId={userId} email={email} onSignOut={onSignOut} embedded />;

          case 'properties':
            if (s === 'manage') return <PropertiesGrid landlordUserId={userId} />;
            return <ComingSoon title="Occupancy" icon="leases" description="See which units are filled vs vacant across your portfolio." />;

          case 'tenants':
            if (s === 'active')  return <TenantsList landlordUserId={userId} />;
            if (s === 'arrears') return <TenantsList landlordUserId={userId} />;
            return <ComingSoon title="Applications" icon="tenants" description="New tenant applications waiting for your review." />;

          case 'leases':
            if (s === 'renewals')     return <LeasesView landlordUserId={userId} status="renewals" />;
            if (s === 'terminations') return <LeasesView landlordUserId={userId} status="terminations" />;
            return <LeasesView landlordUserId={userId} status="active" />;

          case 'payments':
            if (s === 'inbound') return <PaymentsTable landlordUserId={userId} />;
            return <ComingSoon title={s === 'receipts' ? 'Receipts' : 'Reconciliation'} icon="payments" description="Slice 3 ships shareable receipts and unmatched-payment cleanup." />;

          case 'payouts':
            return s === 'runs'
              ? <PayoutsTable landlordUserId={userId} canManage={false} />
              : <ComingSoon title="Statements" icon="accounting" description="Downloadable monthly statements." />;

          case 'comms':
            return <ComingSoon title="Tenant inbox" icon="communication" description="Chat with your tenants — Slice 4." />;

          case 'maintenance':
            return <ComingSoon title={s === 'orders' ? 'Work orders' : 'Tickets'} icon="maintenance" description="Track maintenance requests from your tenants — Slice 4." />;

          case 'reports':
            return <ComingSoon title={s === 'arrears' ? 'Arrears aging' : 'Collections'} icon="reports" description="Charts and CSV exports for your portfolio — Slice 3." />;

          case 'settings':
            if (s === 'profile') return <ProfileSettings email={email} />;
            return <ComingSoon title="Settings" icon="settings" description="Profile is available now. Org-level settings are managed by your agency admin." />;

          default:
            return null;
        }
      }}
    />
  );
};
