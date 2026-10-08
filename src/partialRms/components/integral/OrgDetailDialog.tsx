import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

interface Org {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  primary_subdomain: string;
  branding: any;
  mpesa_shortcode: string | null;
  mpesa_callback_secret: string | null;
  ingest_secret?: string | null;
}

interface Props {
  org: Org;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'general' | 'contacts' | 'mpesa' | 'bank' | 'api' | 'members';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general',  label: 'General',  icon: '🏢' },
  { id: 'contacts', label: 'Contacts', icon: '👥' },
  { id: 'mpesa',    label: 'M-Pesa',   icon: '📱' },
  { id: 'bank',     label: 'Bank',     icon: '🏦' },
  { id: 'api',      label: 'Data API', icon: '🔌' },
  { id: 'members',  label: 'Members',  icon: '🔑' },
];

const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60";
const labelCls = "block text-[11px] uppercase tracking-wider text-slate-400 mb-1 font-medium";

export const OrgDetailDialog: React.FC<Props> = ({ org, onClose, onChanged }) => {
  const [tab, setTab] = useState<Tab>('general');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = (type: 'ok' | 'err', text: string) => {
    if (type === 'ok') { setMsg(text); setErr(null); } else { setErr(text); setMsg(null); }
    setTimeout(() => { setMsg(null); setErr(null); }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-white my-8 max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-primary-dark via-primary to-primary-light px-6 py-4 border-b-2 border-secondary flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold">{org.name}</h2>
            <p className="text-[11px] text-white/80">{org.primary_subdomain} · <span className="uppercase">{org.tier}</span> · {org.status}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 px-4 pt-3 bg-slate-900 border-b border-slate-800">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
                tab === t.id
                  ? 'bg-slate-800 text-secondary border-b-2 border-secondary -mb-px'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'general'  && <GeneralTab org={org} notify={notify} setBusy={setBusy} busy={busy} onChanged={onChanged} />}
          {tab === 'contacts' && <ContactsTab orgId={org.id} notify={notify} />}
          {tab === 'mpesa'    && <MpesaTab orgId={org.id} notify={notify} />}
          {tab === 'bank'     && <BankTab orgId={org.id} notify={notify} />}
          {tab === 'api'      && <ApiTab org={org} notify={notify} onChanged={onChanged} />}
          {tab === 'members'  && <MembersTab orgId={org.id} notify={notify} />}
        </div>

        {(msg || err) && (
          <div className="px-6 pb-4">
            {msg && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2 break-all">{msg}</div>}
            {err && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────  GENERAL  ───────────────────────────── */
const GeneralTab: React.FC<{ org: Org; notify: (t: 'ok'|'err', s: string) => void; setBusy: (b: boolean) => void; busy: boolean; onChanged: () => void }> = ({ org, notify, setBusy, busy, onChanged }) => {
  const b = org.branding || {};
  const [appName, setAppName] = useState(b.app_name || org.name);
  const [legalName, setLegalName] = useState(b.legal_name || '');
  const [registrationNo, setRegistrationNo] = useState(b.registration_no || '');
  const [taxPin, setTaxPin] = useState(b.tax_pin || '');
  const [country, setCountry] = useState(b.country || 'Kenya');
  const [city, setCity] = useState(b.city || '');
  const [address, setAddress] = useState(b.address || '');
  const [website, setWebsite] = useState(b.website || '');
  const [primaryColor, setPrimaryColor] = useState(b.primary_color || '#9D1F15');
  const [logoUrl, setLogoUrl] = useState(b.logo_url || '');

  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from('organizations')
      .update({ branding: { ...b, app_name: appName, legal_name: legalName, registration_no: registrationNo, tax_pin: taxPin, country, city, address, website, primary_color: primaryColor, logo_url: logoUrl } })
      .eq('id', org.id);
    setBusy(false);
    if (error) return notify('err', error.message);
    notify('ok', 'Organization details saved');
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>App name</label><input className={inputCls} value={appName} onChange={e => setAppName(e.target.value)} /></div>
        <div><label className={labelCls}>Legal name</label><input className={inputCls} value={legalName} onChange={e => setLegalName(e.target.value)} /></div>
        <div><label className={labelCls}>Registration no</label><input className={inputCls} value={registrationNo} onChange={e => setRegistrationNo(e.target.value)} /></div>
        <div><label className={labelCls}>KRA / Tax PIN</label><input className={inputCls} value={taxPin} onChange={e => setTaxPin(e.target.value)} /></div>
        <div><label className={labelCls}>Country</label><input className={inputCls} value={country} onChange={e => setCountry(e.target.value)} /></div>
        <div><label className={labelCls}>City</label><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Physical address</label><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} /></div>
        <div><label className={labelCls}>Website</label><input className={inputCls} value={website} onChange={e => setWebsite(e.target.value)} /></div>
        <div><label className={labelCls}>Brand color</label><input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-700 rounded-md cursor-pointer" /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Logo URL</label><input className={inputCls} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} /></div>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="px-5 py-2 text-sm rounded-md bg-primary hover:bg-primary-dark text-white font-semibold disabled:opacity-60 shadow">{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
};

/* ─────────────────────────────  CONTACTS  ───────────────────────────── */
const ContactsTab: React.FC<{ orgId: string; notify: (t: 'ok'|'err', s: string) => void }> = ({ orgId, notify }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({ full_name: '', role_title: '', phone: '', email: '', is_primary: false });

  const load = async () => {
    const { data } = await (supabase as any).from('org_contacts').select('*').eq('org_id', orgId).order('is_primary', { ascending: false }).order('created_at');
    setRows(data || []);
  };
  useEffect(() => { load(); }, [orgId]);

  const add = async () => {
    if (!draft.full_name.trim()) return notify('err', 'Name is required');
    const { error } = await (supabase as any).from('org_contacts').insert({ ...draft, org_id: orgId, email: draft.email.toLowerCase() || null });
    if (error) return notify('err', error.message);
    setDraft({ full_name: '', role_title: '', phone: '', email: '', is_primary: false });
    notify('ok', 'Contact added'); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Remove contact?')) return;
    await (supabase as any).from('org_contacts').delete().eq('id', id);
    load();
  };
  const setPrimary = async (id: string) => {
    await (supabase as any).from('org_contacts').update({ is_primary: false }).eq('org_id', orgId);
    await (supabase as any).from('org_contacts').update({ is_primary: true }).eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-secondary">Add contact person</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Full name *" value={draft.full_name} onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} />
          <input className={inputCls} placeholder="Role / title" value={draft.role_title} onChange={e => setDraft(d => ({ ...d, role_title: e.target.value }))} />
          <input className={inputCls} placeholder="Phone +2547…" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
          <input className={inputCls} placeholder="Email" type="email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
        </div>
        <div className="flex justify-between items-center">
          <label className="text-[11px] text-slate-300 inline-flex items-center gap-2">
            <input type="checkbox" checked={draft.is_primary} onChange={e => setDraft(d => ({ ...d, is_primary: e.target.checked }))} className="rounded border-slate-600 bg-slate-950" />
            Primary contact
          </label>
          <button onClick={add} className="px-4 py-2 text-sm rounded-md bg-primary hover:bg-primary-dark text-white font-semibold">+ Add contact</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-400">
            <tr><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Phone</th><th className="text-left px-3 py-2">Email</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-xs">No contacts yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-3 py-2"><div className="font-medium text-white flex items-center gap-2">{r.full_name}{r.is_primary && <span className="text-[9px] bg-secondary text-primary-dark font-bold px-1.5 py-0.5 rounded">PRIMARY</span>}</div><div className="text-[10px] text-slate-500">{r.role_title || '—'}</div></td>
                <td className="px-3 py-2 text-slate-300">{r.phone || '—'}</td>
                <td className="px-3 py-2 text-slate-300">{r.email || '—'}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  {!r.is_primary && <button onClick={() => setPrimary(r.id)} className="text-[11px] text-secondary hover:text-secondary-dark">Make primary</button>}
                  <button onClick={() => remove(r.id)} className="text-[11px] text-rose-400 hover:text-rose-300">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─────────────────────────────  M-PESA  ───────────────────────────── */
const MpesaTab: React.FC<{ orgId: string; notify: (t: 'ok'|'err', s: string) => void }> = ({ orgId, notify }) => {
  const [rows, setRows] = useState<any[]>([]);
  const empty = { label: 'Default', shortcode: '', shortcode_type: 'paybill', consumer_key: '', consumer_secret: '', passkey: '', callback_url: '', environment: 'production', is_active: true } as any;
  const [draft, setDraft] = useState<any>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await (supabase as any).from('org_mpesa_configs').select('*').eq('org_id', orgId).order('created_at');
    setRows(data || []);
  };
  useEffect(() => { load(); }, [orgId]);

  const save = async () => {
    if (!draft.shortcode.trim()) return notify('err', 'Shortcode is required');
    const payload = { ...draft, org_id: orgId };
    const op = editingId
      ? (supabase as any).from('org_mpesa_configs').update(payload).eq('id', editingId)
      : (supabase as any).from('org_mpesa_configs').insert(payload);
    const { error } = await op;
    if (error) return notify('err', error.message);
    notify('ok', editingId ? 'M-Pesa config updated' : 'M-Pesa config added');
    setDraft(empty); setEditingId(null); load();
  };
  const edit = (r: any) => { setDraft(r); setEditingId(r.id); };
  const remove = async (id: string) => { if (!confirm('Delete config?')) return; await (supabase as any).from('org_mpesa_configs').delete().eq('id', id); load(); };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-secondary">{editingId ? 'Edit M-Pesa config' : 'Add M-Pesa config'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Label</label><input className={inputCls} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></div>
          <div><label className={labelCls}>Shortcode *</label><input className={inputCls} value={draft.shortcode} onChange={e => setDraft({ ...draft, shortcode: e.target.value })} placeholder="247247" /></div>
          <div><label className={labelCls}>Type</label>
            <select className={inputCls} value={draft.shortcode_type} onChange={e => setDraft({ ...draft, shortcode_type: e.target.value })}>
              <option value="paybill">Paybill</option><option value="till">Till / Buy Goods</option><option value="b2c">B2C</option>
            </select>
          </div>
          <div><label className={labelCls}>Environment</label>
            <select className={inputCls} value={draft.environment} onChange={e => setDraft({ ...draft, environment: e.target.value })}>
              <option value="sandbox">Sandbox</option><option value="production">Production</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className={labelCls}>Callback URL</label><input className={inputCls} value={draft.callback_url || ''} onChange={e => setDraft({ ...draft, callback_url: e.target.value })} placeholder="https://…/c2b-confirmation" /></div>
          <div><label className={labelCls}>Consumer key</label><input className={inputCls} value={draft.consumer_key || ''} onChange={e => setDraft({ ...draft, consumer_key: e.target.value })} /></div>
          <div><label className={labelCls}>Consumer secret</label><input className={inputCls} type="password" value={draft.consumer_secret || ''} onChange={e => setDraft({ ...draft, consumer_secret: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Passkey (STK)</label><input className={inputCls} type="password" value={draft.passkey || ''} onChange={e => setDraft({ ...draft, passkey: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && <button onClick={() => { setDraft(empty); setEditingId(null); }} className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-800">Cancel</button>}
          <button onClick={save} className="px-5 py-2 text-sm rounded-md bg-primary hover:bg-primary-dark text-white font-semibold">{editingId ? 'Update' : 'Add'} config</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-400">
            <tr><th className="text-left px-3 py-2">Label</th><th className="text-left px-3 py-2">Shortcode</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Env</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-xs">No M-Pesa configs yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-3 py-2 font-medium text-white">{r.label}</td>
                <td className="px-3 py-2 text-slate-300 font-mono">{r.shortcode}</td>
                <td className="px-3 py-2 text-slate-300 uppercase text-[10px]">{r.shortcode_type}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${r.environment === 'production' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{r.environment}</span></td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => edit(r)} className="text-[11px] text-secondary hover:text-secondary-dark">Edit</button>
                  <button onClick={() => remove(r.id)} className="text-[11px] text-rose-400 hover:text-rose-300">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─────────────────────────────  BANK  ───────────────────────────── */
const BankTab: React.FC<{ orgId: string; notify: (t: 'ok'|'err', s: string) => void }> = ({ orgId, notify }) => {
  const [rows, setRows] = useState<any[]>([]);
  const empty = { bank_name: '', branch: '', account_name: '', account_number: '', swift_code: '', currency: 'KES', is_primary: false };
  const [draft, setDraft] = useState<any>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await (supabase as any).from('org_bank_accounts').select('*').eq('org_id', orgId).order('is_primary', { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [orgId]);

  const save = async () => {
    if (!draft.bank_name.trim() || !draft.account_number.trim() || !draft.account_name.trim()) return notify('err', 'Bank, account name and account number are required');
    const payload = { ...draft, org_id: orgId };
    const op = editingId
      ? (supabase as any).from('org_bank_accounts').update(payload).eq('id', editingId)
      : (supabase as any).from('org_bank_accounts').insert(payload);
    const { error } = await op;
    if (error) return notify('err', error.message);
    if (draft.is_primary) {
      await (supabase as any).from('org_bank_accounts').update({ is_primary: false }).eq('org_id', orgId).neq('id', editingId || '00000000-0000-0000-0000-000000000000');
    }
    notify('ok', 'Bank account saved');
    setDraft(empty); setEditingId(null); load();
  };
  const edit = (r: any) => { setDraft(r); setEditingId(r.id); };
  const remove = async (id: string) => { if (!confirm('Delete bank account?')) return; await (supabase as any).from('org_bank_accounts').delete().eq('id', id); load(); };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-secondary">{editingId ? 'Edit bank account' : 'Add bank account'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Bank name *</label><input className={inputCls} value={draft.bank_name} onChange={e => setDraft({ ...draft, bank_name: e.target.value })} placeholder="KCB, Equity…" /></div>
          <div><label className={labelCls}>Branch</label><input className={inputCls} value={draft.branch || ''} onChange={e => setDraft({ ...draft, branch: e.target.value })} /></div>
          <div><label className={labelCls}>Account name *</label><input className={inputCls} value={draft.account_name} onChange={e => setDraft({ ...draft, account_name: e.target.value })} /></div>
          <div><label className={labelCls}>Account number *</label><input className={inputCls} value={draft.account_number} onChange={e => setDraft({ ...draft, account_number: e.target.value })} /></div>
          <div><label className={labelCls}>SWIFT / BIC</label><input className={inputCls} value={draft.swift_code || ''} onChange={e => setDraft({ ...draft, swift_code: e.target.value })} /></div>
          <div><label className={labelCls}>Currency</label><input className={inputCls} value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></div>
        </div>
        <div className="flex justify-between items-center">
          <label className="text-[11px] text-slate-300 inline-flex items-center gap-2">
            <input type="checkbox" checked={draft.is_primary} onChange={e => setDraft({ ...draft, is_primary: e.target.checked })} className="rounded border-slate-600 bg-slate-950" />
            Primary payout account
          </label>
          <div className="flex gap-2">
            {editingId && <button onClick={() => { setDraft(empty); setEditingId(null); }} className="px-3 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-800">Cancel</button>}
            <button onClick={save} className="px-5 py-2 text-sm rounded-md bg-primary hover:bg-primary-dark text-white font-semibold">{editingId ? 'Update' : 'Add'} account</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-400">
            <tr><th className="text-left px-3 py-2">Bank</th><th className="text-left px-3 py-2">Account</th><th className="text-left px-3 py-2">Currency</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-xs">No bank accounts.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-3 py-2"><div className="font-medium text-white flex items-center gap-2">{r.bank_name}{r.is_primary && <span className="text-[9px] bg-secondary text-primary-dark font-bold px-1.5 py-0.5 rounded">PRIMARY</span>}</div><div className="text-[10px] text-slate-500">{r.branch || '—'}</div></td>
                <td className="px-3 py-2 text-slate-300"><div>{r.account_name}</div><div className="font-mono text-[11px]">{r.account_number}</div></td>
                <td className="px-3 py-2 text-slate-300">{r.currency}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => edit(r)} className="text-[11px] text-secondary hover:text-secondary-dark">Edit</button>
                  <button onClick={() => remove(r.id)} className="text-[11px] text-rose-400 hover:text-rose-300">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─────────────────────────────  API / DATA INGEST  ───────────────────────────── */
const ApiTab: React.FC<{ org: Org; notify: (t: 'ok'|'err', s: string) => void; onChanged: () => void }> = ({ org, notify, onChanged }) => {
  const [secret, setSecret] = useState<string | null>(org.ingest_secret || null);
  const [stats, setStats] = useState<any | null>(null);
  const [rotating, setRotating] = useState(false);

  const loadStats = async () => {
    const { data } = await (supabase as any).from('org_external_stats').select('*').eq('org_id', org.id).order('snapshot_at', { ascending: false }).limit(1).maybeSingle();
    setStats(data);
  };
  useEffect(() => { loadStats(); }, [org.id]);

  const rotate = async () => {
    setRotating(true);
    const { data, error } = await (supabase as any).rpc('rotate_org_ingest_secret', { _org_id: org.id });
    setRotating(false);
    if (error) return notify('err', error.message);
    setSecret(data); notify('ok', 'Ingest secret rotated'); onChanged();
  };

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/org-stats-ingest`;
  const exampleBody = JSON.stringify({
    landlords: 12, tenants: 88, properties: 7, units: 96,
    active_leases: 80, mtd_collected: 1234567, all_time_collected: 9876543,
    source: org.slug,
  }, null, 2);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-secondary">Live data ingest</h3>
        <p className="text-xs text-slate-400">
          The managed app posts a stats snapshot to this endpoint with an HMAC-SHA256 signature of the raw body
          using its ingest secret. Snapshots feed the Platform Hub.
        </p>

        <div>
          <label className={labelCls}>POST endpoint</label>
          <code className="block bg-black/50 border border-slate-700 rounded-md px-3 py-2 text-xs text-emerald-300 break-all">{endpoint}</code>
        </div>

        <div>
          <label className={labelCls}>Org ID (header <code>x-org-id</code>)</label>
          <code className="block bg-black/50 border border-slate-700 rounded-md px-3 py-2 text-xs text-secondary break-all">{org.id}</code>
        </div>

        <div>
          <label className={labelCls}>Ingest secret (header <code>x-signature</code> = hex HMAC-SHA256)</label>
          <div className="flex gap-2">
            <code className="flex-1 bg-black/50 border border-slate-700 rounded-md px-3 py-2 text-xs text-amber-300 break-all">{secret || '— not set —'}</code>
            <button onClick={rotate} disabled={rotating} className="px-3 py-2 text-xs rounded-md bg-primary hover:bg-primary-dark text-white font-semibold whitespace-nowrap disabled:opacity-60">
              {rotating ? 'Rotating…' : (secret ? 'Rotate' : 'Generate')}
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Example body</label>
          <pre className="bg-black/50 border border-slate-700 rounded-md px-3 py-2 text-[11px] text-slate-300 overflow-x-auto">{exampleBody}</pre>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h4 className="text-sm font-bold text-secondary mb-2">Latest snapshot</h4>
        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Received" value={new Date(stats.snapshot_at).toLocaleString()} />
            <Stat label="Landlords" value={stats.landlords} />
            <Stat label="Tenants" value={stats.tenants} />
            <Stat label="Units" value={stats.units} />
            <Stat label="Active leases" value={stats.active_leases} />
            <Stat label="MTD collected" value={`KES ${Number(stats.mtd_collected).toLocaleString()}`} />
            <Stat label="All-time collected" value={`KES ${Number(stats.all_time_collected).toLocaleString()}`} />
            <Stat label="Source" value={stats.source || '—'} />
          </div>
        ) : (
          <p className="text-xs text-slate-500">No snapshot received yet — the managed app hasn't posted to <code>/org-stats-ingest</code> for this organization.</p>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <div className="bg-black/40 rounded-md px-2.5 py-1.5">
    <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-sm text-white font-semibold truncate">{value}</div>
  </div>
);

/* ─────────────────────────────  MEMBERS  ───────────────────────────── */
const MembersTab: React.FC<{ orgId: string; notify: (t: 'ok'|'err', s: string) => void }> = ({ orgId, notify }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'admin' | 'staff' | 'viewer' | 'landlord'>('admin');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from('org_members').select('id, user_id, role, created_at').eq('org_id', orgId);
    setMembers(data || []);
  };
  useEffect(() => { load(); }, [orgId]);

  const sendInvite = async () => {
    if (!inviteEmail.trim() || invitePassword.length < 8) return notify('err', 'Email and 8+ char password required');
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-org-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ org_id: orgId, email: inviteEmail.trim().toLowerCase(), password: invitePassword, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      notify('ok', data.created ? 'User created and added' : 'User added to organization');
      setInviteEmail(''); setInvitePassword(''); load();
    } catch (e: any) { notify('err', e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-secondary">Add member</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="email@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
          <input className={inputCls} placeholder="Initial password (8+ chars)" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} className={inputCls + ' sm:w-auto'}>
            <option value="owner">Owner</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="viewer">Viewer</option><option value="landlord">Landlord</option>
          </select>
          <button type="button" onClick={() => setInvitePassword(Math.random().toString(36).slice(2, 10) + 'A1!')} className="px-3 py-2 text-xs rounded-md bg-slate-800 hover:bg-slate-700">Generate password</button>
          <button onClick={sendInvite} disabled={busy} className="ml-auto px-4 py-2 text-sm rounded-md bg-primary hover:bg-primary-dark text-white font-semibold disabled:opacity-60">{busy ? 'Adding…' : 'Add user'}</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-400">
            <tr><th className="text-left px-3 py-2">User</th><th className="text-left px-3 py-2">Role</th></tr>
          </thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={2} className="px-3 py-6 text-center text-slate-500 text-xs">No members yet.</td></tr>}
            {members.map(m => (
              <tr key={m.id} className="border-t border-slate-800">
                <td className="px-3 py-2 font-mono text-slate-300 text-xs">{m.user_id.slice(0, 8)}…</td>
                <td className="px-3 py-2 capitalize text-secondary text-xs font-semibold">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
