import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import {
  SectionHeader, ListCard, ListSkeleton, EmptyState, Avatar, MoneyCell, StatusPill, fmtKES,
} from './ui/primitives';

interface Props {
  landlordUserId?: string | null;
  /** which lifecycle view: 'active' | 'renewals' | 'terminations' */
  status: 'active' | 'renewals' | 'terminations';
}

interface Lease {
  id: string; unit_id: string; status: string;
  tenant_name: string; tenant_email: string | null; tenant_phone: string | null;
  rent_amount: number; deposit_amount: number;
  start_date: string; end_date: string | null;
  property_name?: string | null; unit_tag?: string | null;
}

const STATUS_FOR: Record<Props['status'], string[]> = {
  active: ['active'],
  renewals: ['active'],          // active + ending within 60 days
  terminations: ['terminated', 'ended', 'cancelled'],
};

const TITLE: Record<Props['status'], { title: string; subtitle: string }> = {
  active:       { title: 'Active leases',  subtitle: 'Every lease currently in force.' },
  renewals:     { title: 'Renewals',       subtitle: 'Leases ending within the next 60 days.' },
  terminations: { title: 'Terminations',   subtitle: 'Recently ended or cancelled leases.' },
};

export const LeasesView: React.FC<Props> = ({ landlordUserId, status }) => {
  const { org } = useOrg();
  const [leases, setLeases] = useState<Lease[] | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    (async () => {
      setLeases(null);
      let propsQ = (supabase as any).from('properties').select('id, name, landlord_user_id').eq('org_id', org.id);
      if (landlordUserId) propsQ = propsQ.eq('landlord_user_id', landlordUserId);
      const { data: props } = await propsQ;
      const propIds = (props || []).map((p: any) => p.id);
      if (propIds.length === 0) { setLeases([]); return; }
      const propName = new Map<string, string>();
      (props || []).forEach((p: any) => propName.set(p.id, p.name));

      const { data: units } = await (supabase as any).from('units')
        .select('id, unit_tag, property_id').in('property_id', propIds);
      const unitIds = (units || []).map((u: any) => u.id);
      const unitMeta = new Map<string, { tag: string | null; pid: string }>();
      (units || []).forEach((u: any) => unitMeta.set(u.id, { tag: u.unit_tag, pid: u.property_id }));

      if (unitIds.length === 0) { setLeases([]); return; }

      const wanted = STATUS_FOR[status];
      const { data: ls } = await (supabase as any).from('leases')
        .select('*').eq('org_id', org.id).in('status', wanted).in('unit_id', unitIds)
        .order('start_date', { ascending: false });

      const out: Lease[] = (ls || []).map((l: any) => {
        const meta = unitMeta.get(l.unit_id);
        return {
          ...l,
          unit_tag: meta?.tag || null,
          property_name: meta ? propName.get(meta.pid) || null : null,
        };
      });
      setLeases(out);
    })();
  }, [org?.id, landlordUserId, status]);

  const filtered = useMemo(() => {
    if (!leases) return null;
    if (status !== 'renewals') return leases;
    const now = Date.now();
    const horizon = now + 60 * 24 * 60 * 60 * 1000;
    return leases.filter(l => {
      if (!l.end_date) return false;
      const t = new Date(l.end_date).getTime();
      return t >= now && t <= horizon;
    });
  }, [leases, status]);

  const conf = TITLE[status];

  return (
    <div className="space-y-5">
      <SectionHeader title={conf.title} subtitle={conf.subtitle} />

      {filtered === null ? <ListSkeleton rows={5} /> :
        filtered.length === 0 ? (
          <EmptyState
            icon="leases"
            title={
              status === 'active' ? 'No active leases'
                : status === 'renewals' ? 'No upcoming renewals'
                : 'No terminated leases'
            }
            description={
              status === 'active' ? 'Create a lease from Properties to start tracking tenancy.'
                : status === 'renewals' ? 'Leases ending in the next 60 days will appear here.'
                : 'Ended or cancelled leases will be archived here.'
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(l => <LeaseRow key={l.id} lease={l} variant={status} />)}
          </div>
        )}
    </div>
  );
};

const LeaseRow: React.FC<{ lease: Lease; variant: Props['status'] }> = ({ lease, variant }) => {
  const days = lease.end_date
    ? Math.round((new Date(lease.end_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  let pill: React.ReactNode;
  if (variant === 'renewals' && days !== null) {
    pill = <StatusPill tone={days <= 14 ? 'danger' : days <= 30 ? 'warning' : 'info'}>{days}d left</StatusPill>;
  } else if (variant === 'terminations') {
    pill = <StatusPill tone="neutral">{lease.status}</StatusPill>;
  } else {
    pill = <StatusPill tone="success">Active</StatusPill>;
  }

  return (
    <ListCard
      leading={<Avatar name={lease.tenant_name} />}
      title={lease.tenant_name || 'Unnamed tenant'}
      subtitle={
        `${lease.property_name || '—'} · Unit ${lease.unit_tag || '—'} · ` +
        `from ${new Date(lease.start_date).toLocaleDateString('en-KE', { dateStyle: 'medium' })}` +
        (lease.end_date ? ` → ${new Date(lease.end_date).toLocaleDateString('en-KE', { dateStyle: 'medium' })}` : '')
      }
      meta={<MoneyCell amount={lease.rent_amount} size="sm" />}
      metaSub={pill}
    />
  );
};

export default LeasesView;
