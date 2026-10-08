import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import { fmtKES } from './PartialHeader';
import { getTodayIsoDate } from '../../utils/timezone';

interface Props {
  /** When provided, restricts properties to those owned by this landlord. Agency admins pass null. */
  landlordUserId: string | null;
}

interface Property { id: string; name: string; address: string | null; landlord_user_id: string; }
interface Unit { id: string; property_id: string; label: string; unit_tag: string; rent_amount: number; bedrooms: number | null; }
interface Lease { id: string; unit_id: string; tenant_name: string; tenant_email: string | null; tenant_phone: string | null; rent_amount: number; deposit_amount: number; start_date: string; end_date: string | null; status: string; }

export const PropertiesManager: React.FC<Props> = ({ landlordUserId }) => {
  const { org } = useOrg();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPropId, setOpenPropId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true); setError(null);
    try {
      let q = (supabase as any).from('properties').select('*').eq('org_id', org.id);
      if (landlordUserId) q = q.eq('landlord_user_id', landlordUserId);
      const { data: props, error: e1 } = await q.order('created_at', { ascending: false });
      if (e1) throw e1;
      setProperties(props || []);
      const propIds = (props || []).map((p: Property) => p.id);
      if (propIds.length) {
        const { data: us } = await (supabase as any).from('units').select('*').in('property_id', propIds);
        setUnits(us || []);
        const unitIds = (us || []).map((u: Unit) => u.id);
        if (unitIds.length) {
          const { data: ls } = await (supabase as any).from('leases').select('*').in('unit_id', unitIds).order('start_date', { ascending: false });
          setLeases(ls || []);
        } else { setLeases([]); }
      } else { setUnits([]); setLeases([]); }
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally { setLoading(false); }
  }, [org?.id, landlordUserId]);

  useEffect(() => { load(); }, [load]);

  const createProperty = async (data: { name: string; address: string }) => {
    if (!org?.id) return;
    const landlord = landlordUserId || (await supabase.auth.getUser()).data.user?.id;
    if (!landlord) throw new Error('No landlord');
    const { error } = await (supabase as any).from('properties').insert({
      org_id: org.id, landlord_user_id: landlord, name: data.name, address: data.address || null,
    });
    if (error) throw error;
    await load();
  };

  const createUnit = async (propId: string, data: { label: string; unit_tag: string; rent_amount: number; bedrooms: number | null }) => {
    if (!org?.id) return;
    const { error } = await (supabase as any).from('units').insert({
      org_id: org.id, property_id: propId, label: data.label, unit_tag: data.unit_tag,
      rent_amount: data.rent_amount, bedrooms: data.bedrooms,
    });
    if (error) throw error;
    await load();
  };

  const createLease = async (unitId: string, data: { tenant_name: string; tenant_email: string; tenant_phone: string; rent_amount: number; deposit_amount: number; start_date: string }) => {
    if (!org?.id) return;
    const { error } = await (supabase as any).from('leases').insert({
      org_id: org.id, unit_id: unitId, tenant_name: data.tenant_name,
      tenant_email: data.tenant_email || null, tenant_phone: data.tenant_phone || null,
      rent_amount: data.rent_amount, deposit_amount: data.deposit_amount,
      start_date: data.start_date, status: 'active',
    });
    if (error) throw error;
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Properties & Leases</h2>
          <p className="text-sm text-slate-500">Manage properties, units and tenant leases.</p>
        </div>
        <NewPropertyButton onCreate={createProperty} />
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{error}</div>}
      {loading ? <div className="text-sm text-slate-400">Loading…</div> :
        properties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
            No properties yet. Add one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map(p => (
              <PropertyCard
                key={p.id} property={p}
                units={units.filter(u => u.property_id === p.id)}
                leases={leases}
                open={openPropId === p.id}
                onToggle={() => setOpenPropId(openPropId === p.id ? null : p.id)}
                onAddUnit={(d) => createUnit(p.id, d)}
                onAddLease={createLease}
              />
            ))}
          </div>
        )
      }
    </div>
  );
};

const PropertyCard: React.FC<{
  property: Property; units: Unit[]; leases: Lease[]; open: boolean; onToggle: () => void;
  onAddUnit: (d: { label: string; unit_tag: string; rent_amount: number; bedrooms: number | null }) => Promise<void>;
  onAddLease: (unitId: string, d: any) => Promise<void>;
}> = ({ property, units, leases, open, onToggle, onAddUnit, onAddLease }) => {
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ label: '', unit_tag: '', rent_amount: '', bedrooms: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submitUnit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await onAddUnit({
        label: unitForm.label, unit_tag: unitForm.unit_tag,
        rent_amount: Number(unitForm.rent_amount) || 0,
        bedrooms: unitForm.bedrooms ? Number(unitForm.bedrooms) : null,
      });
      setUnitForm({ label: '', unit_tag: '', rent_amount: '', bedrooms: '' }); setAddingUnit(false);
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50" onClick={onToggle}>
        <div className="text-left">
          <div className="text-sm font-semibold">{property.name}</div>
          <div className="text-xs text-slate-500">{property.address || 'No address'} · {units.length} unit{units.length !== 1 ? 's' : ''}</div>
        </div>
        <span className="text-xs text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Units</h4>
            <button onClick={() => setAddingUnit(v => !v)} className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white">
              {addingUnit ? 'Cancel' : '+ Add unit'}
            </button>
          </div>
          {addingUnit && (
            <form onSubmit={submitUnit} className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 rounded bg-slate-50">
              <input required placeholder="Label (A1)" value={unitForm.label} onChange={e => setUnitForm({ ...unitForm, label: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
              <input required placeholder="M-Pesa tag" value={unitForm.unit_tag} onChange={e => setUnitForm({ ...unitForm, unit_tag: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded font-mono" />
              <input required type="number" placeholder="Rent" value={unitForm.rent_amount} onChange={e => setUnitForm({ ...unitForm, rent_amount: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
              <input type="number" placeholder="Beds" value={unitForm.bedrooms} onChange={e => setUnitForm({ ...unitForm, bedrooms: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
              <button disabled={busy} className="px-3 py-1.5 text-sm rounded bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
              {err && <div className="col-span-full text-xs text-rose-600">{err}</div>}
            </form>
          )}
          {units.length === 0 ? (
            <div className="text-xs text-slate-400">No units yet.</div>
          ) : (
            <div className="space-y-2">
              {units.map(u => (
                <UnitRow key={u.id} unit={u} leases={leases.filter(l => l.unit_id === u.id)} onAddLease={(d) => onAddLease(u.id, d)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UnitRow: React.FC<{ unit: Unit; leases: Lease[]; onAddLease: (d: any) => Promise<void> }> = ({ unit, leases, onAddLease }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ tenant_name: '', tenant_email: '', tenant_phone: '', rent_amount: String(unit.rent_amount || ''), deposit_amount: '', start_date: getTodayIsoDate() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = leases.find(l => l.status === 'active');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await onAddLease({
        ...form, rent_amount: Number(form.rent_amount) || 0,
        deposit_amount: Number(form.deposit_amount) || 0,
      });
      setAdding(false);
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {unit.label} <span className="text-xs font-mono text-slate-500 ml-2">{unit.unit_tag}</span>
          </div>
          <div className="text-xs text-slate-500">
            Rent {fmtKES(unit.rent_amount)} · {unit.bedrooms ?? '?'} bd ·{' '}
            {active ? <span className="text-emerald-600">Occupied — {active.tenant_name}</span> : <span className="text-slate-400">Vacant</span>}
          </div>
        </div>
        {!active && (
          <button onClick={() => setAdding(v => !v)} className="text-xs px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white">
            {adding ? 'Cancel' : '+ Lease'}
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          <input required placeholder="Tenant name" value={form.tenant_name} onChange={e => setForm({ ...form, tenant_name: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
          <input type="email" placeholder="Tenant email" value={form.tenant_email} onChange={e => setForm({ ...form, tenant_email: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
          <input placeholder="Phone (07…)" value={form.tenant_phone} onChange={e => setForm({ ...form, tenant_phone: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
          <input required type="number" placeholder="Rent" value={form.rent_amount} onChange={e => setForm({ ...form, rent_amount: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
          <input type="number" placeholder="Deposit" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
          <input required type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
          <button disabled={busy} className="col-span-full px-3 py-1.5 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60">{busy ? 'Saving…' : 'Create lease'}</button>
          {err && <div className="col-span-full text-xs text-rose-600">{err}</div>}
        </form>
      )}
    </div>
  );
};

const NewPropertyButton: React.FC<{ onCreate: (d: { name: string; address: string }) => Promise<void> }> = ({ onCreate }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''); const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await onCreate({ name, address }); setName(''); setAddress(''); setOpen(false); }
    catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm">+ New property</button>;
  return (
    <form onSubmit={submit} className="flex gap-2 items-center">
      <input required placeholder="Property name" value={name} onChange={e => setName(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
      <input placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
      <button disabled={busy} className="px-3 py-1.5 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60">{busy ? '…' : 'Save'}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">Cancel</button>
      {err && <div className="text-xs text-rose-600">{err}</div>}
    </form>
  );
};
