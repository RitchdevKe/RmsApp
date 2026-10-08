import React from 'react';
import { useOrg } from '../../context/OrgContext';

interface Props {
  tierLabel: string;
  phase: 'Phase 2' | 'Phase 3' | 'Phase 4';
  description: string;
}

/**
 * Placeholder shell for tiers that aren't built yet (Partial, Self-Manage).
 * The subdomain routes correctly to its own shell; only the UI is pending.
 */
export const ComingSoonShell: React.FC<Props> = ({ tierLabel, phase, description }) => {
  const { org } = useOrg();
  const appName = org?.branding?.app_name || tierLabel;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-white px-6">
      <div className="max-w-xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium uppercase tracking-wider">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {phase} · Coming soon
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{appName}</h1>
        <p className="text-lg text-slate-300 leading-relaxed">{description}</p>
        <div className="pt-4 text-sm text-slate-400">
          You're on <code className="bg-white/10 px-2 py-0.5 rounded">{org?.primary_subdomain || window.location.host}</code>
        </div>
        <a
          href="https://app.task-me.ke"
          className="inline-block mt-4 px-5 py-2.5 rounded-md bg-white text-slate-900 text-sm font-medium hover:bg-slate-100 transition"
        >
          Go to the main app
        </a>
      </div>
    </div>
  );
};
