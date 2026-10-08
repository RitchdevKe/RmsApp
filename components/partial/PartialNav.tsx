import React from 'react';

export type PartialTab = 'dashboard' | 'properties' | 'payments' | 'payouts';

interface Props {
  active: PartialTab;
  onChange: (tab: PartialTab) => void;
  tabs?: PartialTab[];
}

const LABELS: Record<PartialTab, string> = {
  dashboard: 'Dashboard',
  properties: 'Properties & Leases',
  payments: 'Payments',
  payouts: 'Payouts',
};

export const PartialNav: React.FC<Props> = ({ active, onChange, tabs }) => {
  const all = tabs ?? (['dashboard', 'properties', 'payments', 'payouts'] as PartialTab[]);
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto">
        {all.map((t) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              active === t
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
    </nav>
  );
};
