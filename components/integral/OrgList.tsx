import React, { useEffect, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { CreateOrgDialog } from './CreateOrgDialog';
import { OrgDetailDialog } from './OrgDetailDialog';

const TIER_COLORS: Record<string, string> = {
  integral: 'bg-secondary/20 text-secondary border-secondary/30',
  agency: 'bg-primary/20 text-primary-light border-primary/30',
  partial: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  self_manage: 'bg-secondary/20 text-amber-200 border-amber-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'text-success',
  trial: 'text-sky-300',
  suspended: 'text-rose-300',
  archived: 'text-slate-400',
};

export const OrgList: React.FC = () => {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await (supabase as any)
      .from('organizations')
      .select('*')
      .order('tier', { ascending: true })
      .order('name', { ascending: true });
    if (error) setErr(error.message);
    setOrgs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSuspend = async (org: any) => {
    const next = org.status === 'suspended' ? 'active' : 'suspended';
    const reason = next === 'suspended' ? prompt('Reason for suspension?') || 'manual' : null;
    const { error } = await (supabase as any).rpc('set_organization_status', { _org_id: org.id, _status: next, _reason: reason });
    if (error) { alert(error.message); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Organizations</h2>
          <p className="text-xs text-slate-400">All tenants on the platform.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark rounded-md font-medium">
          + Create organization
        </button>
      </div>

      {err && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">{err}</div>}

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Tier</th>
                <th className="text-left px-4 py-2">Subdomain</th>
                <th className="text-left px-4 py-2">Mpesa</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-slate-500">{o.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${TIER_COLORS[o.tier] || 'bg-slate-700/40 text-slate-300 border-slate-700'}`}>
                      {o.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{o.primary_subdomain}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{o.mpesa_shortcode || '—'}</td>
                  <td className={`px-4 py-3 capitalize ${STATUS_COLORS[o.status]}`}>{o.status}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => setEditing(o)} className="text-xs text-primary-light hover:text-primary-light">Manage</button>
                    {o.tier !== 'integral' && (
                      <>
                        <button onClick={() => toggleSuspend(o)} className="text-xs text-secondary hover:text-amber-200">
                          {o.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </button>
                        <a
                          href={`https://${o.primary_subdomain}/`}
                          target="_blank" rel="noreferrer"
                          className="text-xs text-success hover:text-emerald-200">
                          Open
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No organizations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateOrgDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {editing && <OrgDetailDialog org={editing} onClose={() => setEditing(null)} onChanged={load} />}
    </div>
  );
};
