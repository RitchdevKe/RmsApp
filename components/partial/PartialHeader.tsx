import React from 'react';
import { useOrg } from '../../context/OrgContext';

interface Props {
  subtitle: string;
  email: string | null;
  onSignOut: () => void;
}

export const PartialHeader: React.FC<Props> = ({ subtitle, email, onSignOut }) => {
  const { org } = useOrg();
  const appName = org?.branding?.app_name || 'Partial Management';
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
          {appName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-base font-semibold">{appName}</h1>
          <p className="text-xs text-slate-500">{subtitle}</p>
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
  );
};

export const fmtKES = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n || 0);
