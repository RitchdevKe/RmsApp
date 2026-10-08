import React from 'react';

export const ShellLoading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  </div>
);
