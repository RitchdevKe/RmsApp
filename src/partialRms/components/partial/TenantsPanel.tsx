import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useOrg } from '../../context/OrgContext';

interface Props {
  /** When set, scope to leases on properties owned by this landlord. When null/undefined, scope to whole org. */
  landlordUserId?: string | null;
}

interface Row {
  lease_id: string;
  tenant_name: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  unit_tag: string | null;
  rent_amount: number | null;
  status: string | null;
  property_name: string | null;
}

/**
 * Slim tenants directory for Partial portal. Lists active leases scoped
 * to either a single landlord (landlord portal) or the whole agency org.
 */
export const TenantsPanel: React.FC<Props> = ({ landlordUserId }) => {
  const { org } = useOrg();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!org?.id) return;
    (async () => {
      setLoading(true);
      // Properties in scope
      let propsQuery = (supabase as any).from('partial_properties').select('id, name, landlord_user_id').eq('org_id', org.id);
      if (landlordUserId) propsQuery = propsQuery.eq('landlord_user_id', landlordUserId);

      const [propsRes, unitsRes, leasesRes] = await Promise.all([
        propsQuery,
        (supabase as any).from('partial_units').select('id, unit_tag, property_id').eq('org_id', org.id),
        (supabase as any).from('partial_leases').select('id, unit_id, tenant_name, tenant_email, tenant_phone, rent_amount, status').eq('org_id', org.id).eq('status', 'active')
      ]);

      const props = propsRes.data || [];
      const propIds = props.map((p: any) => p.id);
      if (propIds.length === 0) { setRows([]); setLoading(false); return; }

      const propNameById = new Map<string, string>();
      props.forEach((p: any) => propNameById.set(p.id, p.name));

      const filteredUnits = (unitsRes.data || []).filter((u: any) => propIds.includes(u.property_id));
      const unitIds = filteredUnits.map((u: any) => u.id);
      const unitMeta = new Map<string, { tag: string | null; pid: string }>();
      filteredUnits.forEach((u: any) => unitMeta.set(u.id, { tag: u.unit_tag, pid: u.property_id }));

      const filteredLeases = (leasesRes.data || []).filter((l: any) => unitIds.includes(l.unit_id));

      const out: Row[] = filteredLeases.map((l: any) => {
        const meta = unitMeta.get(l.unit_id);
        return {
          lease_id: l.id,
          tenant_name: l.tenant_name, tenant_email: l.tenant_email, tenant_phone: l.tenant_phone,
          unit_tag: meta?.tag || null,
          rent_amount: l.rent_amount,
          status: l.status,
          property_name: meta ? propNameById.get(meta.pid) || null : null,
        };
      });
      setRows(out);
      setLoading(false);
    })();
  }, [org?.id, landlordUserId]);

  const filtered = rows.filter(r => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.tenant_name, r.tenant_email, r.tenant_phone, r.unit_tag, r.property_name]
      .some(v => (v || '').toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Tenants</h2>
          <p className="text-sm text-slate-500">{landlordUserId ? 'Tenants on your properties.' : 'All active tenants across the agency.'}</p>
        </div>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search tenant, unit, property…"
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md w-64 max-w-full"
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? <div className="p-6 text-sm text-slate-400">Loading…</div> :
          filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No tenants found.</div> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5">Tenant</th>
                    <th className="text-left px-4 py-2.5">Contact</th>
                    <th className="text-left px-4 py-2.5">Property / Unit</th>
                    <th className="text-right px-4 py-2.5">Rent</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.lease_id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium">{r.tenant_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        <div>{r.tenant_email || ''}</div>
                        <div>{r.tenant_phone || ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="font-medium text-slate-800">{r.property_name || '—'}</div>
                        <div className="text-slate-500">Unit {r.unit_tag || '—'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.rent_amount != null
                          ? new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(Number(r.rent_amount))
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] uppercase">{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>
    </div>
  );
};

export default TenantsPanel;
