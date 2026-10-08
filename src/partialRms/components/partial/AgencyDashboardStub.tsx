import React from 'react';
import { useOrg } from '../../context/OrgContext';

interface Props {
  email: string | null;
  onSignOut: () => void;
}

/**
 * Placeholder for the agency-side view on a Partial-tier subdomain.
 * Built out fully in the next phase (landlord roster, payout runs,
 * cross-landlord stats, fee configuration).
 */
export const AgencyDashboardStub: React.FC<Props> = ({ email, onSignOut }) => {
  const { org } = useOrg();
  const appName = org?.branding?.app_name || 'Partial Management';

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
            {appName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">{appName}</h1>
            <p className="text-xs text-slate-500">Agency console</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:inline">{email}</span>
          <button
            onClick={onSignOut}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 text-center space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Agency console · next up
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          Landlord roster & payout runs are on their way
        </h2>
        <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
          The landlord portal is already live — your landlords can sign in and see their stats and payments right now.
          The agency-side tools (invite landlords, onboard properties, run monthly payouts, set the management fee) ship next.
        </p>
        <div className="pt-2 text-xs text-slate-500">
          You're signed in as <span className="font-semibold">{email}</span>.
        </div>
      </main>
    </div>
  );
};
