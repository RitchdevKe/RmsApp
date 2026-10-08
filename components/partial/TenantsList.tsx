import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import {
  SectionHeader, ListCard, ListSkeleton, EmptyState, Avatar, MoneyCell, StatusPill,
  FilterChips, DetailDrawer, KpiCard, fmtKES,
} from './ui/primitives';

interface Props { landlordUserId?: string | null; }

interface Row {
  lease_id: string;
  tenant_name: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  unit_tag: string | null;
  property_name: string | null;
  rent_amount: number;
  paid_mtd: number;
  status: string | null;
}

type Filter = 'all' | 'current' | 'arrears';

export const TenantsList: React.FC<Props> = ({ landlordUserId }) => {
  const { org } = useOrg();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    (async () => {
      setRows(null);
      let propsQ = (supabase as any).from('properties').select('id, name, landlord_user_id').eq('org_id', org.id);
      if (landlordUserId) propsQ = propsQ.eq('landlord_user_id', landlordUserId);
      const { data: props } = await propsQ;
      const propIds = (props || []).map((p: any) => p.id);
      if (propIds.length === 0) { setRows([]); return; }
      const propName = new Map<string, string>();
      (props || []).forEach((p: any) => propName.set(p.id, p.name));

      const { data: units } = await (supabase as any).from('units')
        .select('id, unit_tag, property_id').in('property_id', propIds);
      const unitIds = (units || []).map((u: any) => u.id);
      const unitMeta = new Map<string, { tag: string | null; pid: string }>();
      (units || []).forEach((u: any) => unitMeta.set(u.id, { tag: u.unit_tag, pid: u.property_id }));

      const { data: leases } = unitIds.length
        ? await (supabase as any).from('leases')
          .select('id, unit_id, tenant_name, tenant_email, tenant_phone, rent_amount, status')
          .eq('org_id', org.id).eq('status', 'active').in('unit_id', unitIds)
        : { data: [] };

      const leaseIds = (leases || []).map((l: any) => l.id);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const paidByLease = new Map<string, number>();
      if (leaseIds.length) {
        const { data: pays } = await (supabase as any).from('partial_payments')
          .select('lease_id, amount').eq('org_id', org.id)
          .gte('paid_at', monthStart.toISOString()).in('lease_id', leaseIds);
        (pays || []).forEach((p: any) => {
          paidByLease.set(p.lease_id, (paidByLease.get(p.lease_id) || 0) + Number(p.amount || 0));
        });
      }

      const out: Row[] = (leases || []).map((l: any) => {
        const meta = unitMeta.get(l.unit_id);
        return {
          lease_id: l.id,
          tenant_name: l.tenant_name, tenant_email: l.tenant_email, tenant_phone: l.tenant_phone,
          unit_tag: meta?.tag || null,
          property_name: meta ? propName.get(meta.pid) || null : null,
          rent_amount: Number(l.rent_amount || 0),
          paid_mtd: Number(paidByLease.get(l.id) || 0),
          status: l.status,
        };
      });
      setRows(out);
    })();
  }, [org?.id, landlordUserId]);

  const enriched = (rows || []).map(r => ({
    ...r,
    outstanding: Math.max(0, r.rent_amount - r.paid_mtd),
  }));

  const counts = useMemo(() => ({
    all: enriched.length,
    current: enriched.filter(r => r.outstanding === 0).length,
    arrears: enriched.filter(r => r.outstanding > 0).length,
  }), [enriched]);

  const totals = useMemo(() => ({
    rentRoll: enriched.reduce((s, r) => s + r.rent_amount, 0),
    collected: enriched.reduce((s, r) => s + r.paid_mtd, 0),
    arrears: enriched.reduce((s, r) => s + r.outstanding, 0),
  }), [enriched]);

  const filtered = enriched.filter(r => {
    if (filter === 'current' && r.outstanding > 0) return false;
    if (filter === 'arrears' && r.outstanding === 0) return false;
    if (query.trim()) {
      const s = query.toLowerCase();
      if (![r.tenant_name, r.tenant_phone, r.tenant_email, r.unit_tag, r.property_name]
        .some(v => (v || '').toLowerCase().includes(s))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Tenants"
        subtitle={landlordUserId ? 'Tenants on your properties.' : 'Every active tenant in this workspace.'}
      />

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Monthly rent roll" value={fmtKES(totals.rentRoll)} icon="payments"  tone="info" />
        <KpiCard label="Collected MTD"     value={fmtKES(totals.collected)} icon="accounting" tone="success" />
        <KpiCard label="Outstanding"       value={fmtKES(totals.arrears)}   icon="reports"   tone={totals.arrears > 0 ? 'danger' : 'neutral'} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'current', label: 'Current', count: counts.current },
            { value: 'arrears', label: 'In arrears', count: counts.arrears },
          ]}
        />
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search tenant, unit, phone…"
          className="px-3 py-2 text-sm border border-slate-300 rounded-full bg-white w-full sm:w-72 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      {rows === null ? <ListSkeleton rows={5} /> :
        filtered.length === 0 ? (
          <EmptyState
            icon="tenants"
            title={enriched.length === 0 ? 'No active tenants' : 'No matches'}
            description={enriched.length === 0
              ? 'Once you create leases in Properties, tenants will appear here.'
              : 'Adjust the filter or search to see more.'}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <ListCard
                key={r.lease_id}
                onClick={() => setOpen(r)}
                leading={<Avatar name={r.tenant_name || r.tenant_phone || '?'} />}
                title={r.tenant_name || 'Unnamed tenant'}
                subtitle={`${r.property_name || '—'} · Unit ${r.unit_tag || '—'}${r.tenant_phone ? ` · ${r.tenant_phone}` : ''}`}
                meta={<MoneyCell amount={r.rent_amount} size="sm" />}
                metaSub={
                  r.outstanding > 0
                    ? <StatusPill tone="danger">{fmtKES(r.outstanding)} due</StatusPill>
                    : <StatusPill tone="success">Paid</StatusPill>
                }
              />
            ))}
          </div>
        )}

      <TenantDrawer row={open} onClose={() => setOpen(null)} />
    </div>
  );
};

const TenantDrawer: React.FC<{ row: Row & { outstanding?: number } | null; onClose: () => void }> = ({ row, onClose }) => {
  if (!row) return null;
  const outstanding = Math.max(0, row.rent_amount - row.paid_mtd);
  const callHref = row.tenant_phone ? `tel:${row.tenant_phone}` : undefined;
  const smsHref  = row.tenant_phone ? `sms:${row.tenant_phone}` : undefined;
  const waHref   = row.tenant_phone ? `https://wa.me/${row.tenant_phone.replace(/[^0-9]/g, '')}` : undefined;

  return (
    <DetailDrawer
      open={!!row}
      onClose={onClose}
      title={row.tenant_name || 'Tenant'}
      subtitle={`${row.property_name || '—'} · Unit ${row.unit_tag || '—'}`}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Rent"        value={fmtKES(row.rent_amount)} />
          <StatBox label="Paid MTD"    value={fmtKES(row.paid_mtd)} tone="success" />
          <StatBox label="Outstanding" value={fmtKES(outstanding)} tone={outstanding > 0 ? 'danger' : 'neutral'} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ActionLink href={callHref} disabled={!callHref} label="Call" />
          <ActionLink href={smsHref}  disabled={!smsHref}  label="SMS" />
          <ActionLink href={waHref}   disabled={!waHref}   label="WhatsApp" external />
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
          <Row2 label="Email" value={row.tenant_email || '—'} />
          <Row2 label="Phone" value={row.tenant_phone || '—'} mono />
          <Row2 label="M-Pesa unit tag" value={row.unit_tag || '—'} mono />
          <Row2 label="Status" value={<StatusPill tone="success">{row.status || 'active'}</StatusPill>} />
        </div>
      </div>
    </DetailDrawer>
  );
};

const StatBox: React.FC<{ label: string; value: string; tone?: 'success' | 'danger' | 'neutral' }> = ({ label, value, tone = 'neutral' }) => {
  const t = tone === 'success' ? 'text-emerald-700' : tone === 'danger' ? 'text-rose-700' : 'text-slate-900';
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-0.5 ${t}`}>{value}</div>
    </div>
  );
};

const ActionLink: React.FC<{ href?: string; label: string; disabled?: boolean; external?: boolean }> = ({ href, label, disabled, external }) => (
  <a
    href={disabled ? undefined : href}
    target={external ? '_blank' : undefined}
    rel={external ? 'noreferrer' : undefined}
    aria-disabled={disabled}
    className={`text-center py-2.5 rounded-full text-xs font-semibold border transition ${
      disabled
        ? 'bg-slate-100 border-slate-200 text-slate-400 pointer-events-none'
        : 'bg-white border-slate-200 text-slate-800 hover:border-primary hover:text-primary'
    }`}
  >
    {label}
  </a>
);

const Row2: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className={`text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

export default TenantsList;
