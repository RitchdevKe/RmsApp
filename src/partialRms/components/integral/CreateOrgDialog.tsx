import React, { useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

type Tier = 'agency' | 'partial' | 'self_manage';

const TIER_SUBDOMAIN: Record<Tier, string> = {
  agency: 'app.task-me.ke',
  partial: 'pms.task-me.ke',
  self_manage: 'pms.sf.task-me.ke',
};

interface Contact {
  full_name: string;
  role_title: string;
  phone: string;
  email: string;
  is_primary: boolean;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const blankContact = (primary = false): Contact => ({
  full_name: '', role_title: '', phone: '', email: '', is_primary: primary,
});

export const CreateOrgDialog: React.FC<Props> = ({ onClose, onCreated }) => {
  // Identity
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tier, setTier] = useState<Tier>('partial');
  const [subdomain, setSubdomain] = useState('');
  const [legalName, setLegalName] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [taxPin, setTaxPin] = useState('');
  const [country, setCountry] = useState('Kenya');
  const [city, setCity] = useState('Nairobi');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');

  // Branding
  const [primaryColor, setPrimaryColor] = useState('#9D1F15');
  const [logoUrl, setLogoUrl] = useState('');

  // M-Pesa quick start
  const [shortcode, setShortcode] = useState('');
  const [shortcodeType, setShortcodeType] = useState<'paybill' | 'till' | 'b2c'>('paybill');

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([blankContact(true)]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateContact = (i: number, patch: Partial<Contact>) =>
    setContacts(cs => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addContact = () => setContacts(cs => [...cs, blankContact(cs.length === 0)]);
  const removeContact = (i: number) => setContacts(cs => cs.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const finalSubdomain = subdomain.trim() || TIER_SUBDOMAIN[tier];
      const branding = {
        app_name: name.trim(),
        legal_name: legalName.trim() || null,
        registration_no: registrationNo.trim() || null,
        tax_pin: taxPin.trim() || null,
        country, city,
        address: address.trim() || null,
        website: website.trim() || null,
        primary_color: primaryColor,
        logo_url: logoUrl.trim() || null,
      };

      const { data: orgId, error: rpcErr } = await (supabase as any).rpc('create_organization', {
        _name: name.trim(),
        _slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        _tier: tier,
        _primary_subdomain: finalSubdomain.toLowerCase(),
        _branding: branding,
        _mpesa_shortcode: shortcode.trim() || null,
        _mpesa_callback_secret: null,
      });
      if (rpcErr) throw rpcErr;

      // Persist contacts
      const filledContacts = contacts.filter(c => c.full_name.trim() || c.phone.trim() || c.email.trim());
      if (filledContacts.length > 0 && orgId) {
        const rows = filledContacts.map(c => ({
          org_id: orgId,
          full_name: c.full_name.trim() || '(unnamed)',
          role_title: c.role_title.trim() || null,
          phone: c.phone.trim() || null,
          email: c.email.trim().toLowerCase() || null,
          is_primary: c.is_primary,
        }));
        await (supabase as any).from('org_contacts').insert(rows);
      }

      // Persist M-Pesa shortcode as structured config if provided
      if (shortcode.trim() && orgId) {
        await (supabase as any).from('org_mpesa_configs').insert({
          org_id: orgId,
          label: 'Default',
          shortcode: shortcode.trim(),
          shortcode_type: shortcodeType,
          environment: 'production',
        });
      }

      onCreated();
    } catch (e: any) {
      setError(e?.message || 'Failed to create organization');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-white my-8 max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-primary-dark via-primary to-primary-light px-6 py-4 rounded-t-2xl flex justify-between items-center border-b-2 border-secondary">
          <div>
            <h2 className="text-lg font-bold">Register a new organization</h2>
            <p className="text-[11px] text-white/80">Full onboarding — identity, contacts and M-Pesa.</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Identity */}
          <Section title="Organization identity" hint="What we display, route and bill against.">
            <Grid>
              <Field label="Display name *">
                <input required value={name}
                  onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')); }}
                  className={inputCls} />
              </Field>
              <Field label="Slug *">
                <input required value={slug} onChange={e => setSlug(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Legal / registered name">
                <input value={legalName} onChange={e => setLegalName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Registration number">
                <input value={registrationNo} onChange={e => setRegistrationNo(e.target.value)} className={inputCls} />
              </Field>
              <Field label="KRA / Tax PIN">
                <input value={taxPin} onChange={e => setTaxPin(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Tier *">
                <select value={tier} onChange={e => setTier(e.target.value as Tier)} className={inputCls}>
                  <option value="agency">Agency (multi-landlord PMS)</option>
                  <option value="partial">Partial (single-landlord)</option>
                  <option value="self_manage">Self-manage (landlord-only)</option>
                </select>
              </Field>
              <Field label="Primary subdomain">
                <input value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder={TIER_SUBDOMAIN[tier]} className={inputCls} />
              </Field>
              <Field label="Website">
                <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" className={inputCls} />
              </Field>
              <Field label="Country">
                <input value={country} onChange={e => setCountry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="City">
                <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Physical address" span2>
                <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
              </Field>
            </Grid>
          </Section>

          {/* Branding */}
          <Section title="Branding" hint="What end users see inside their portal.">
            <Grid>
              <Field label="Brand color">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-full h-10 bg-slate-950 border border-slate-700 rounded-md cursor-pointer" />
              </Field>
              <Field label="Logo URL">
                <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className={inputCls} />
              </Field>
            </Grid>
          </Section>

          {/* M-Pesa quick start */}
          <Section title="M-Pesa quick start" hint="Optional. Full credentials are managed inside the org detail screen.">
            <Grid>
              <Field label="Shortcode">
                <input value={shortcode} onChange={e => setShortcode(e.target.value)} placeholder="e.g. 247247" className={inputCls} />
              </Field>
              <Field label="Type">
                <select value={shortcodeType} onChange={e => setShortcodeType(e.target.value as any)} className={inputCls}>
                  <option value="paybill">Paybill</option>
                  <option value="till">Till / Buy Goods</option>
                  <option value="b2c">B2C</option>
                </select>
              </Field>
            </Grid>
          </Section>

          {/* Contacts */}
          <Section
            title="Contact persons"
            hint="At least one primary contact is recommended — this is who we call when collections stall."
            action={<button type="button" onClick={addContact} className="text-xs px-3 py-1.5 rounded-md bg-secondary text-primary-dark font-bold hover:opacity-90">+ Add contact</button>}
          >
            <div className="space-y-3">
              {contacts.map((c, i) => (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-secondary">Contact #{i + 1}{c.is_primary ? ' · Primary' : ''}</span>
                    {contacts.length > 1 && (
                      <button type="button" onClick={() => removeContact(i)} className="text-xs text-rose-300 hover:text-rose-200">Remove</button>
                    )}
                  </div>
                  <Grid>
                    <Field label="Full name">
                      <input value={c.full_name} onChange={e => updateContact(i, { full_name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Role / title">
                      <input value={c.role_title} onChange={e => updateContact(i, { role_title: e.target.value })} placeholder="Director, Finance, Property Manager…" className={inputCls} />
                    </Field>
                    <Field label="Phone">
                      <input value={c.phone} onChange={e => updateContact(i, { phone: e.target.value })} placeholder="+2547…" className={inputCls} />
                    </Field>
                    <Field label="Email">
                      <input value={c.email} onChange={e => updateContact(i, { email: e.target.value })} type="email" className={inputCls} />
                    </Field>
                  </Grid>
                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                    <input type="checkbox" checked={c.is_primary}
                      onChange={e => setContacts(cs => cs.map((cc, idx) => ({ ...cc, is_primary: idx === i ? e.target.checked : (e.target.checked ? false : cc.is_primary) })))}
                      className="rounded border-slate-600 bg-slate-950" />
                    Mark as primary contact
                  </label>
                </div>
              ))}
            </div>
          </Section>

          {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">{error}</div>}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-3 flex justify-end gap-2 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-700 hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={busy} className="px-5 py-2 text-sm rounded-md bg-primary hover:bg-primary-dark text-white font-semibold disabled:opacity-60 shadow-md">
            {busy ? 'Registering…' : 'Register organization'}
          </button>
        </div>
      </form>
    </div>
  );
};

const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60";

const Section: React.FC<{ title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, action, children }) => (
  <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-secondary">{title}</h3>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
);

const Field: React.FC<{ label: string; span2?: boolean; children: React.ReactNode }> = ({ label, span2, children }) => (
  <div className={span2 ? 'sm:col-span-2' : ''}>
    <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1 font-medium">{label}</label>
    {children}
  </div>
);
