import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import Icon from '../Icon';
import { getTodayIsoDate } from '../../utils/timezone';
import {
  SectionHeader, ListCard, ListSkeleton, EmptyState, MoneyCell, StatusPill,
  FilterChips, FAB, DetailDrawer, fmtKES, KpiCard,
} from './ui/primitives';

interface Props { landlordUserId: string | null; }

interface Property { id: string; name: string; address: string | null; landlord_user_id: string; }
interface Unit { id: string; property_id: string; label: string; unit_tag: string; rent_amount: number; bedrooms: number | null; }
interface Lease {
  id: string; unit_id: string; tenant_name: string; tenant_email: string | null; tenant_phone: string | null;
  rent_amount: number; deposit_amount: number; start_date: string; end_date: string | null; status: string;
}

type Filter = 'all' | 'has_vacancy' | 'full';

export const PropertiesGrid: React.FC<Props> = ({ landlordUserId }) => {
  const { org } = useOrg();
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
          const { data: ls } = await (supabase as any).from('leases').select('*')
            .in('unit_id', unitIds).order('start_date', { ascending: false });
          setLeases(ls || []);
        } else setLeases([]);
      } else { setUnits([]); setLeases([]); }
    } catch (e: any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [org?.id, landlordUserId]);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() => properties.map(p => {
    const pu = units.filter(u => u.property_id === p.id);
    const occupied = pu.filter(u => leases.some(l => l.unit_id === u.id && l.status === 'active')).length;
    const monthlyRent = pu.reduce((s, u) => {
      const active = leases.find(l => l.unit_id === u.id && l.status === 'active');
      return s + Number(active?.rent_amount || 0);
    }, 0);
    return { p, units: pu, occupied, vacant: pu.length - occupied, monthlyRent };
  }), [properties, units, leases]);

  const totals = useMemo(() => ({
    properties: enriched.length,
    units: enriched.reduce((s, e) => s + e.units.length, 0),
    occupied: enriched.reduce((s, e) => s + e.occupied, 0),
    monthly: enriched.reduce((s, e) => s + e.monthlyRent, 0),
  }), [enriched]);

  const filtered = enriched.filter(e => {
    if (filter === 'has_vacancy' && e.vacant === 0) return false;
    if (filter === 'full' && e.vacant > 0) return false;
    if (query.trim()) {
      const s = query.toLowerCase();
      if (![e.p.name, e.p.address || ''].some(v => v.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const open = openId ? enriched.find(e => e.p.id === openId) || null : null;

  return (
    <div className="space-y-5 relative pb-24 md:pb-6">
      <SectionHeader
        title="Properties"
        subtitle={landlordUserId ? 'Your portfolio.' : 'Every property in this workspace.'}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Properties" value={totals.properties} icon="leases" tone="neutral" />
        <KpiCard label="Units"      value={totals.units}      icon="leases" tone="neutral" />
        <KpiCard label="Occupied"   value={`${totals.occupied}/${totals.units}`} icon="tenants" tone="success" />
        <KpiCard label="Monthly billed" value={fmtKES(totals.monthly)} icon="payments" tone="info" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: enriched.length },
            { value: 'has_vacancy', label: 'Has vacancy', count: enriched.filter(e => e.vacant > 0).length },
            { value: 'full', label: 'Fully let', count: enriched.filter(e => e.units.length > 0 && e.vacant === 0).length },
          ]}
        />
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search property…"
          className="px-3 py-2 text-sm border border-slate-300 rounded-full bg-white w-full sm:w-64 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{error}</div>}

      {loading ? <ListSkeleton rows={4} /> :
        filtered.length === 0 ? (
          <EmptyState
            icon="leases"
            title={enriched.length === 0 ? 'No properties yet' : 'No matches'}
            description={enriched.length === 0
              ? 'Add your first property to start tracking units, tenants and rent collection.'
              : 'Try a different filter or search term.'}
            action={enriched.length === 0 ? { label: 'Add property', onClick: () => setCreating(true) } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(e => (
              <PropertyCard key={e.p.id} data={e} onOpen={() => setOpenId(e.p.id)} />
            ))}
          </div>
        )}

      <FAB icon="plus" label="New property" onClick={() => setCreating(true)} />

      <PropertyDrawer
        data={open}
        leases={open ? leases.filter(l => open.units.some(u => u.id === l.unit_id)) : []}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />

      <NewPropertyDrawer
        open={creating}
        onClose={() => setCreating(false)}
        landlordUserId={landlordUserId}
        onCreated={load}
      />
    </div>
  );
};

/* ---------- Property card ---------- */

const PropertyCard: React.FC<{
  data: { p: Property; units: Unit[]; occupied: number; vacant: number; monthlyRent: number };
  onOpen: () => void;
}> = ({ data, onOpen }) => {
  const { p, units, occupied, vacant, monthlyRent } = data;
  const pct = units.length ? Math.round((occupied / units.length) * 100) : 0;
  return (
    <div
      onClick={onOpen}
      className="group bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-slate-300 hover:shadow-sm active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
          <div className="text-xs text-slate-500 truncate mt-0.5">{p.address || 'No address set'}</div>
        </div>
        <StatusPill tone={vacant === 0 && units.length > 0 ? 'success' : vacant > 0 ? 'warning' : 'neutral'}>
          {units.length === 0 ? 'Empty' : vacant === 0 ? 'Full' : `${vacant} vacant`}
        </StatusPill>
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between text-xs text-slate-500 mb-1.5">
          <span>{occupied}/{units.length} units occupied</span>
          <span className="font-semibold text-slate-700 tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[11px] text-slate-500">Monthly rent</span>
        <MoneyCell amount={monthlyRent} />
      </div>
    </div>
  );
};

/* ---------- Drawer with units & leases ---------- */

const PropertyDrawer: React.FC<{
  data: { p: Property; units: Unit[]; occupied: number; vacant: number; monthlyRent: number } | null;
  leases: Lease[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}> = ({ data, leases, onClose, onChanged }) => {
  const { org } = useOrg();
  const [addUnit, setAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ label: '', unit_tag: '', rent_amount: '', bedrooms: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [leaseFor, setLeaseFor] = useState<Unit | null>(null);

  if (!data) return null;
  const { p, units } = data;

  const submitUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { error } = await (supabase as any).from('units').insert({
        org_id: org!.id, property_id: p.id,
        label: unitForm.label, unit_tag: unitForm.unit_tag,
        rent_amount: Number(unitForm.rent_amount) || 0,
        bedrooms: unitForm.bedrooms ? Number(unitForm.bedrooms) : null,
      });
      if (error) throw error;
      setUnitForm({ label: '', unit_tag: '', rent_amount: '', bedrooms: '' });
      setAddUnit(false);
      await onChanged();
    } catch (e: any) { setErr(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <DetailDrawer
        open={!!data}
        onClose={onClose}
        title={p.name}
        subtitle={p.address || 'No address'}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Units"    value={String(units.length)} />
            <Stat label="Occupied" value={`${data.occupied}/${units.length}`} />
            <Stat label="Rent"     value={fmtKES(data.monthlyRent)} />
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">Units</h4>
            <button
              onClick={() => setAddUnit(v => !v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
            >
              {addUnit ? 'Cancel' : '+ Add unit'}
            </button>
          </div>

          {addUnit && (
            <form onSubmit={submitUnit} className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Field label="Label"        value={unitForm.label}        onChange={v => setUnitForm({ ...unitForm, label: v })} placeholder="A1" required />
              <Field label="M-Pesa tag"   value={unitForm.unit_tag}     onChange={v => setUnitForm({ ...unitForm, unit_tag: v })} placeholder="A1" required mono />
              <Field label="Rent (KSh)"   value={unitForm.rent_amount}  onChange={v => setUnitForm({ ...unitForm, rent_amount: v })} type="number" required />
              <Field label="Bedrooms"     value={unitForm.bedrooms}     onChange={v => setUnitForm({ ...unitForm, bedrooms: v })} type="number" />
              <button disabled={busy} className="col-span-2 px-3 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-white disabled:opacity-60">
                {busy ? 'Saving…' : 'Save unit'}
              </button>
              {err && <div className="col-span-2 text-xs text-rose-600">{err}</div>}
            </form>
          )}

          {units.length === 0 ? (
            <EmptyState icon="leases" title="No units yet" description="Add the first unit to start placing tenants." />
          ) : (
            <div className="space-y-2">
              {units.map(u => {
                const active = leases.find(l => l.unit_id === u.id && l.status === 'active');
                return (
                  <ListCard
                    key={u.id}
                    title={<span>{u.label} <span className="ml-1 text-[11px] font-mono text-slate-500">{u.unit_tag}</span></span>}
                    subtitle={active ? `Occupied · ${active.tenant_name}` : `Vacant · ${u.bedrooms ?? '?'} bd`}
                    meta={<MoneyCell amount={u.rent_amount} size="sm" />}
                    metaSub={active
                      ? <StatusPill tone="success">Active</StatusPill>
                      : <button onClick={() => setLeaseFor(u)} className="text-[11px] font-semibold text-primary hover:underline">+ Lease</button>}
                  />
                );
              })}
            </div>
          )}
        </div>
      </DetailDrawer>

      <NewLeaseDrawer
        unit={leaseFor}
        onClose={() => setLeaseFor(null)}
        onCreated={async () => { setLeaseFor(null); await onChanged(); }}
      />
    </>
  );
};

/* ---------- Helpers ---------- */

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
    <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">{value}</div>
  </div>
);

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; mono?: boolean;
}> = ({ label, value, onChange, type = 'text', placeholder, required, mono }) => (
  <label className="text-xs text-slate-600">
    <span className="block mb-1 font-medium text-slate-500">{label}</span>
    <input
      type={type} value={value} placeholder={placeholder} required={required}
      onChange={e => onChange(e.target.value)}
      className={`w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none ${mono ? 'font-mono' : ''}`}
    />
  </label>
);

/* ---------- New property drawer ---------- */

const NewPropertyDrawer: React.FC<{
  open: boolean; onClose: () => void;
  landlordUserId: string | null; onCreated: () => Promise<void>;
}> = ({ open, onClose, landlordUserId, onCreated }) => {
  const { org } = useOrg();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const landlord = landlordUserId || (await supabase.auth.getUser()).data.user?.id;
      if (!landlord) throw new Error('No landlord');
      const { error } = await (supabase as any).from('properties').insert({
        org_id: org!.id, landlord_user_id: landlord, name, address: address || null,
      });
      if (error) throw error;
      setName(''); setAddress('');
      await onCreated();
      onClose();
    } catch (e: any) { setErr(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <DetailDrawer open={open} onClose={onClose} title="New property" subtitle="Group rentable units under a building or estate.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Property name" value={name} onChange={setName} required placeholder="Riverside Apartments" />
        <Field label="Address" value={address} onChange={setAddress} placeholder="Riverside Drive, Nairobi" />
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <button disabled={busy} className="w-full px-4 py-2.5 rounded-full bg-primary text-white font-semibold text-sm hover:bg-primary-dark disabled:opacity-60">
          {busy ? 'Creating…' : 'Create property'}
        </button>
      </form>
    </DetailDrawer>
  );
};

/* ---------- New lease drawer ---------- */

const NewLeaseDrawer: React.FC<{
  unit: Unit | null; onClose: () => void; onCreated: () => Promise<void>;
}> = ({ unit, onClose, onCreated }) => {
  const { org } = useOrg();
  const [form, setForm] = useState({ tenant_name: '', tenant_email: '', tenant_phone: '', rent_amount: '', deposit_amount: '', start_date: getTodayIsoDate() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (unit) setForm(f => ({ ...f, rent_amount: String(unit.rent_amount || '') }));
  }, [unit]);

  if (!unit) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { error } = await (supabase as any).from('leases').insert({
        org_id: org!.id, unit_id: unit.id,
        tenant_name: form.tenant_name,
        tenant_email: form.tenant_email || null,
        tenant_phone: form.tenant_phone || null,
        rent_amount: Number(form.rent_amount) || 0,
        deposit_amount: Number(form.deposit_amount) || 0,
        start_date: form.start_date, status: 'active',
      });
      if (error) throw error;
      await onCreated();
    } catch (e: any) { setErr(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <DetailDrawer
      open={!!unit}
      onClose={onClose}
      title={`New lease · ${unit.label}`}
      subtitle={<span className="font-mono">{unit.unit_tag}</span>}
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Tenant name" value={form.tenant_name} onChange={v => setForm({ ...form, tenant_name: v })} required /></div>
        <Field label="Email"  value={form.tenant_email} onChange={v => setForm({ ...form, tenant_email: v })} type="email" placeholder="tenant@…" />
        <Field label="Phone"  value={form.tenant_phone} onChange={v => setForm({ ...form, tenant_phone: v })} placeholder="07…" />
        <Field label="Rent"   value={form.rent_amount}    onChange={v => setForm({ ...form, rent_amount: v })} type="number" required />
        <Field label="Deposit" value={form.deposit_amount} onChange={v => setForm({ ...form, deposit_amount: v })} type="number" />
        <div className="col-span-2"><Field label="Start date" value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} type="date" required /></div>
        {err && <div className="col-span-2 text-xs text-rose-600">{err}</div>}
        <button disabled={busy} className="col-span-2 w-full px-4 py-2.5 rounded-full bg-primary text-white font-semibold text-sm hover:bg-primary-dark disabled:opacity-60">
          {busy ? 'Creating…' : 'Create lease'}
        </button>
      </form>
    </DetailDrawer>
  );
};

/* ---------- Plus icon for primitives that referenced it ---------- */
// (Icon is imported above; nothing else needed here)
export default PropertiesGrid;
