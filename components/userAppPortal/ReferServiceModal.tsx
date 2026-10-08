import React, { useState } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import type { Lead } from '../../types';
import { getTodayIsoDate } from '../../utils/timezone';

export type ServiceRefType = 'Security' | 'Cleaning' | 'Maintenance';

interface Props {
    open: boolean;
    onClose: () => void;
    serviceType: ServiceRefType;
}

const SUBTYPES: Record<ServiceRefType, string[]> = {
    Security: ['Home Guards', 'Office Guards', 'Bodyguards', 'Bouncers', 'VIP Security'],
    Cleaning: ['House Cleaning', 'Office Cleaning', 'Government Office Cleaning', 'Post-construction Cleaning'],
    Maintenance: ['Residential Maintenance', 'Commercial Maintenance', 'Renovation', 'Interior Design'],
};

const COPY: Record<ServiceRefType, { title: string; blurb: string; color: string }> = {
    Security: { title: 'Refer Security Services', blurb: 'TaskMe Security — home & office guards, bodyguards, bouncers, VIP details.', color: 'from-slate-900 to-red-700' },
    Cleaning: { title: 'Refer Cleaning Services', blurb: 'TaskMe Cleaning — homes, offices, government facilities and more.', color: 'from-teal-600 to-cyan-600' },
    Maintenance: { title: 'Refer Maintenance Services', blurb: 'TaskMe Interiors — maintenance, renovation and interior design.', color: 'from-amber-600 to-orange-600' },
};

const ReferServiceModal: React.FC<Props> = ({ open, onClose, serviceType }) => {
    const { addLead, currentUser } = useData() as any;
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [subtype, setSubtype] = useState(SUBTYPES[serviceType][0]);
    const [estValue, setEstValue] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    if (!open) return null;

    const copy = COPY[serviceType];

    const handleSubmit = async () => {
        if (!name.trim() || !phone.trim()) {
            alert('Please provide a name and phone number.');
            return;
        }
        setSubmitting(true);
        try {
            const lead: Lead = {
                id: `svc-${serviceType.toLowerCase()}-${Date.now()}`,
                tenantName: name.trim(),
                status: 'New',
                assignedAgent: 'Services Desk',
                listingTitle: `${serviceType} — ${subtype}`,
                contact: phone.trim(),
                interest: `${serviceType} referral`,
                date: getTodayIsoDate(),
                source: 'Referral',
                notes: notes.trim(),
                referrerId: currentUser?.id,
                leadType: serviceType,
                serviceType,
                serviceSubtype: subtype,
                estimatedValue: estValue ? Number(estValue) : undefined,
                commissionPercent: 10,
            };
            await addLead(lead);
            setSubmitted(true);
        } catch (e: any) {
            alert(`Could not submit referral: ${e?.message || e}`);
        } finally {
            setSubmitting(false);
        }
    };

    const reset = () => {
        setName(''); setPhone(''); setSubtype(SUBTYPES[serviceType][0]);
        setEstValue(''); setNotes(''); setSubmitted(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={reset}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className={`bg-gradient-to-r ${copy.color} text-white p-6`}>
                    <h2 className="text-2xl font-bold">{copy.title}</h2>
                    <p className="text-white/85 text-sm mt-1">{copy.blurb}</p>
                    <div className="mt-3 inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-bold">
                        <Icon name="reits" className="w-4 h-4" /> You earn 10% of the gig value
                    </div>
                </div>

                {submitted ? (
                    <div className="p-8 text-center">
                        <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
                        <h3 className="text-lg font-bold text-gray-800">Referral submitted</h3>
                        <p className="text-sm text-gray-600 mt-2">Our services desk will contact <strong>{name}</strong> shortly. You'll see this referral track in your history and earnings will post automatically when the gig is paid.</p>
                        <button onClick={reset} className="mt-6 px-6 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90">Done</button>
                    </div>
                ) : (
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Client / Contact Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Kamau" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Phone</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XX XXX XXX" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Service</label>
                                <select value={subtype} onChange={e => setSubtype(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                                    {SUBTYPES[serviceType].map(s => (<option key={s} value={s}>{s}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Est. Gig Value (KES)</label>
                                <input type="number" value={estValue} onChange={e => setEstValue(e.target.value)} placeholder="Optional" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything the team should know…" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={reset} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200">Cancel</button>
                            <button disabled={submitting} onClick={handleSubmit} className="px-5 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-60">
                                {submitting ? 'Submitting…' : 'Submit Referral'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReferServiceModal;
