import React, { Suspense } from 'react';
import { useOrg } from '../../context/OrgContext';
import { ShellLoading } from './ShellLoading';
import { ComingSoonShell } from './ComingSoonShell';
import { IntegralShell } from './IntegralShell';
import { PartialShell } from './PartialShell';

// The full existing TaskMe app — only loaded for the Agency shell so other
// subdomains don't pay the cost of its lazy-chunk graph.
const AgencyApp = React.lazy(() => import('../../App'));

/**
 * Top-level shell selector. Reads the resolved org tier and renders the
 * matching app shell. `app.task-me.ke` (and any unknown host in dev) gets
 * the existing TaskMe Agency app, unchanged. Other subdomains render
 * their tier-specific shell.
 */
export const RootShell: React.FC = () => {
  const { shell, org, loading, error } = useOrg();

  // Only block UI when we have nothing to render with. OrgProvider seeds a
  // cached/synthetic org synchronously for preview hosts and repeat visits,
  // so the login page paints instantly without a "Resolving organization…"
  // splash.
  if (loading && !org) return null;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold text-slate-900">Couldn't load organization</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (org?.status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-slate-900">Service suspended</h1>
          <p className="text-sm text-slate-600">
            This organization is currently suspended. Please contact your administrator
            to restore access.
          </p>
        </div>
      </div>
    );
  }

  // Effective tier: prefer the DB org (source of truth), fall back to host detection
  const tier = org?.tier ?? (shell === 'unknown' ? 'agency' : shell);

  if (tier === 'integral') return <IntegralShell />;

  if (tier === 'partial') return <PartialShell />;

  if (tier === 'self_manage') {
    return (
      <ComingSoonShell
        tierLabel="Self-Manage"
        phase="Phase 3"
        description="A white-labelled property-management platform for landlords running their own units. You manage your tenants and collections; we keep the system running for a flat SAAS fee."
      />
    );
  }

  // Agency (default) — render the existing TaskMe Realty app exactly as-is
  return (
    <Suspense fallback={null}>
      <AgencyApp />
    </Suspense>
  );
};
