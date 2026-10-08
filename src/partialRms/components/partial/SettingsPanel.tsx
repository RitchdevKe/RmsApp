import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useOrg } from '../../context/OrgContext';

/** Agency-only mgmt-fee config. */
export const FeeSettings: React.FC = () => {
  const { org } = useOrg();
  const [pct, setPct] = useState<string>('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setPct(String((org as any)?.feature_flags?.mgmt_fee_pct ?? 10)); }, [org?.id]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const { error } = await (supabase as any).rpc('update_org_mgmt_fee_pct', { _org_id: org!.id, _pct: Number(pct) });
      if (error) throw error;
      setMsg('Saved. New payments will use this rate.');
    } catch (e: any) { setMsg('Error: ' + (e?.message || 'failed')); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold mb-1">Management fee</h2>
      <p className="text-sm text-slate-500 mb-4">Percentage retained from each collected rent payment.</p>
      <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Fee (%)</span>
          <input required type="number" min="0" max="100" step="0.1" value={pct} onChange={e => setPct(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-300 rounded" />
        </label>
        <button disabled={busy} className="px-3 py-1.5 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60">
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <div className="text-xs text-slate-600">{msg}</div>}
      </form>
    </div>
  );
};

/** Minimal profile panel for either role. */
export const ProfileSettings: React.FC<{ email: string | null }> = ({ email }) => {
  const { org } = useOrg();
  return (
    <div className="max-w-lg space-y-3">
      <h2 className="text-xl font-semibold">Profile</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2 text-sm">
        <Row label="Email" value={email || '—'} />
        <Row label="Organization" value={org?.branding?.app_name || org?.slug || '—'} />
        <Row label="Tier" value={org?.tier || '—'} />
      </div>
      <p className="text-xs text-slate-500">Detailed profile editing ships with the next phase.</p>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-800 text-right truncate">{value}</span>
  </div>
);
