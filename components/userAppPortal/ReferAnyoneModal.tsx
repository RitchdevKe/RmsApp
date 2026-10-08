import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';

import { useData } from '../../context/DataContext';
import { isUnitSafelyVacant } from '../../utils/unitOccupancy';
import { TenantApplication, LandlordApplication, RenovationInvestor } from '../../types';
import Icon from '../Icon';
import { getTodayIsoDate } from '../../utils/timezone';

/**
 * Comprehensive referral modal for affiliates.
 *
 * One modal, three pipelines — Tenant / Landlord / Investor — each writing
 * into the right DataContext store (`applications`, `landlordApplications`,
 * `renovationInvestors`) with `referrerId` + `referralCode` stamped so
 * commissions are attributed correctly downstream by
 * `utils/referralEarnings.ts` and the approval handlers in
 * `components/landlords/Applications.tsx` & `components/tenants/Applications.tsx`.
 */

export type ReferKind = 'tenant' | 'landlord' | 'investor' | 'security' | 'cleaning' | 'maintenance';

interface Props {
    referrerId: string;
    referralCode: string;
    initialKind?: ReferKind;
    onClose: () => void;
}

const KIND_META: Record<ReferKind, { label: string; icon: React.ReactNode; accent: string; commission: string; tag: string }> = {
    tenant: {
        label: 'Tenant',
        icon: <LucideIcons.UserCheck className="w-4 h-4" />,
        accent: 'from-emerald-500 to-emerald-700',
        commission: 'Earn minimum KES 200, up to 10% of the first month\'s rent — paid once the lease is signed.',
        tag: 'bg-emerald-100 text-emerald-700',
    },
    landlord: {
        label: 'Landlord',
        icon: <LucideIcons.Building2 className="w-4 h-4" />,
        accent: 'from-indigo-500 to-indigo-700',
        commission: 'Earn 10% of the management fee — paid monthly for the entire duration of the contract.',
        tag: 'bg-indigo-100 text-indigo-700',
    },
    investor: {
        label: 'Investor',
        icon: <LucideIcons.TrendingUp className="w-4 h-4" />,
        accent: 'from-amber-500 to-rose-600',
        commission: 'Earn 2.5% one-off OR 5% per year — paid for the entire duration of the investment.',
        tag: 'bg-amber-100 text-amber-700',
    },
    security: {
        label: 'Security',
        icon: <LucideIcons.Shield className="w-4 h-4" />,
        accent: 'from-slate-700 to-slate-900',
        commission: 'Earn 10% of the value of the security gig.',
        tag: 'bg-slate-100 text-slate-700',
    },
    cleaning: {
        label: 'Cleaning',
        icon: <LucideIcons.Sparkles className="w-4 h-4" />,
        accent: 'from-cyan-500 to-cyan-700',
        commission: 'Earn 10% of the value of the cleaning gig.',
        tag: 'bg-cyan-100 text-cyan-700',
    },
    maintenance: {
        label: 'Maintenance',
        icon: <LucideIcons.Wrench className="w-4 h-4" />,
        accent: 'from-orange-500 to-orange-700',
        commission: 'Earn 10% of the value of the maintenance gig.',
        tag: 'bg-orange-100 text-orange-700',
    },
};

const ReferAnyoneModal: React.FC<Props> = ({ referrerId, referralCode, initialKind = 'tenant', onClose }) => {
    const { properties, tenants, addApplication, addLandlordApplication, addRenovationInvestor, addLead } = useData() as any;
    const [kind, setKind] = useState<ReferKind>(initialKind);
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [submittedName, setSubmittedName] = useState('');

    // Shared fields
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [notes, setNotes] = useState('');

    // Tenant-specific
    const [propertyFilter, setPropertyFilter] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');

    // Landlord-specific
    const [location, setLocation] = useState('');
    const [proposedCount, setProposedCount] = useState<number | ''>('');
    const [propertyUsageType, setPropertyUsageType] = useState<'Residential' | 'Commercial' | 'Mixed Use' | 'Airbnb'>('Residential');
    const [buildingType, setBuildingType] = useState<'Standalone' | 'Apartment' | 'Single Unit' | 'Bungalow' | 'Maisonette' | 'Gated Community' | 'Other'>('Apartment');

    // Investor-specific
    const [investorType, setInvestorType] = useState<'Individual' | 'Chama' | 'Sacco' | 'Corporate'>('Individual');
    const [targetAmount, setTargetAmount] = useState<number | ''>('');
    const [residency, setResidency] = useState('');

    // Service-specific (Security / Cleaning / Maintenance)
    const SERVICE_SUBTYPES: Record<'security' | 'cleaning' | 'maintenance', string[]> = {
        security: ['Home Guards', 'Office Guards', 'Bodyguards', 'Bouncers', 'VIP Security'],
        cleaning: ['House Cleaning', 'Office Cleaning', 'Government Office Cleaning', 'Post-construction Cleaning'],
        maintenance: ['Residential Maintenance', 'Commercial Maintenance', 'Renovation', 'Interior Design'],
    };
    const [serviceSubtype, setServiceSubtype] = useState<string>('');
    const [estValue, setEstValue] = useState<number | ''>('');
    const [maintProperty, setMaintProperty] = useState('');
    const [maintLocation, setMaintLocation] = useState('');

    React.useEffect(() => {
        if (kind === 'security' || kind === 'cleaning' || kind === 'maintenance') {
            setServiceSubtype(SERVICE_SUBTYPES[kind][0]);
        } else {
            setServiceSubtype('');
        }
    }, [kind]);

    const vacantUnits = useMemo(() => {
        return properties.flatMap(p =>
            (p.units || [])
                .filter(u => isUnitSafelyVacant(u, tenants, p))
                .map(u => ({
                    id: u.id,
                    unitNumber: u.unitNumber,
                    propertyId: p.id,
                    propertyName: p.name,
                    rent: u.rent || (p as any).defaultMonthlyRent || 0,
                }))
        );
    }, [properties, tenants]);

    const propertyOptions = useMemo(() => {
        const seen = new Set<string>();
        return vacantUnits.reduce<{ id: string; name: string }[]>((acc, u) => {
            if (!seen.has(u.propertyId)) {
                seen.add(u.propertyId);
                acc.push({ id: u.propertyId, name: u.propertyName });
            }
            return acc;
        }, []);
    }, [vacantUnits]);

    const displayedUnits = useMemo(() =>
        propertyFilter ? vacantUnits.filter(u => u.propertyId === propertyFilter) : vacantUnits,
    [vacantUnits, propertyFilter]);

    const selectedUnit = vacantUnits.find(u => u.id === selectedUnitId);

    const reset = () => {
        setName(''); setPhone(''); setEmail(''); setIdNumber(''); setNotes('');
        setPropertyFilter(''); setSelectedUnitId('');
        setLocation(''); setProposedCount('');
        setPropertyUsageType('Residential'); setBuildingType('Apartment');
        setInvestorType('Individual'); setTargetAmount(''); setResidency('');
    };

    const switchKind = (k: ReferKind) => {
        if (k === kind) return;
        setKind(k);
        setStep('form');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) return;
        const today = getTodayIsoDate();

        if (kind === 'tenant') {
            const app: TenantApplication = {
                id: `APP-REF-T-${Date.now()}`,
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                idNumber: idNumber.trim() || undefined,
                status: 'New',
                submittedDate: today,
                source: 'Referral',
                referrerId,
                referralCode,
                ...(selectedUnit ? {
                    propertyId: selectedUnit.propertyId,
                    propertyName: selectedUnit.propertyName,
                    unitId: selectedUnit.id,
                    unit: selectedUnit.unitNumber,
                    referredUnitId: selectedUnit.id,
                    rentAmount: selectedUnit.rent,
                } : {}),
            };
            addApplication(app);
        } else if (kind === 'landlord') {
            const propCount = typeof proposedCount === 'number' ? proposedCount : Number(proposedCount) || 0;
            const app: LandlordApplication = {
                id: `APP-REF-L-${Date.now()}`,
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                idNumber: idNumber.trim() || undefined,
                status: 'Pending',
                date: today,
                proposedProperties: propCount > 0 ? Array.from({ length: propCount }, (_, i) => `Proposed Property ${i + 1}`) : [],
                notes: notes.trim() || undefined,
                location: location.trim() || undefined,
                propertyUsageType,
                buildingType,
                referrerId,
            };
            addLandlordApplication(app);
        } else if (kind === 'investor') {
            const investor: RenovationInvestor = {
                id: `INV-REF-${Date.now()}`,
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                idNumber: idNumber.trim(),
                status: 'Pending',
                joinDate: today,
                investorType,
                residency: residency.trim() || undefined,
                referrerId,
                referrerType: 'Affiliate',
                referralCode,
                ...(typeof targetAmount === 'number' && targetAmount > 0
                    ? { paymentDetails: { mpesaNumber: phone.trim() } }
                    : {}),
            };
            addRenovationInvestor(investor);
        } else if (kind === 'security' || kind === 'cleaning' || kind === 'maintenance') {
            const label = kind.charAt(0).toUpperCase() + kind.slice(1);
            const listingSuffix = kind === 'maintenance' && (maintProperty || maintLocation)
                ? ` — ${[maintProperty, maintLocation].filter(Boolean).join(', ')}`
                : '';
            const lead: any = {
                id: `LEAD-REF-${Date.now()}`,
                tenantName: name.trim(),
                status: 'New',
                assignedAgent: 'Services Desk',
                listingTitle: `${label} — ${serviceSubtype || 'Service Gig'}${listingSuffix}`,
                contact: phone.trim(),
                email: email.trim(),
                date: today,
                source: 'Referral',
                referrerId,
                leadType: label,
                serviceType: label,
                serviceSubtype: serviceSubtype || undefined,
                estimatedValue: typeof estValue === 'number' ? estValue : undefined,
                notes: notes.trim() || undefined,
                commissionPercent: 10,
                ...(kind === 'maintenance' ? { propertyName: maintProperty || undefined, location: maintLocation || undefined } : {}),
            };
            if (typeof addLead === 'function') {
                addLead(lead);
            }
        }

        setSubmittedName(name.trim());
        setStep('success');
    };

    const meta = KIND_META[kind];

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`bg-gradient-to-r ${meta.accent} px-6 py-4 flex justify-between items-center shrink-0 rounded-t-2xl`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
                            {meta.icon}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Refer Anyone, Earn Anywhere</h3>
                            <p className="text-xs text-white/80">Tenants · Landlords · Investors · Services</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* Kind tabs */}
                <div className="px-6 pt-4 shrink-0">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-gray-100 p-1 rounded-xl">
                        {(['tenant', 'landlord', 'investor', 'security', 'cleaning', 'maintenance'] as ReferKind[]).map(k => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => switchKind(k)}
                                className={`flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                                    kind === k
                                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {KIND_META[k].icon}
                                {KIND_META[k].label}
                            </button>
                        ))}
                    </div>
                    <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-semibold ${meta.tag} flex items-center gap-1.5`}>
                        <LucideIcons.Sparkles className="w-3 h-3" />
                        {meta.commission}
                    </div>
                </div>

                {step === 'success' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LucideIcons.Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-800 mb-2">Referral Submitted!</h4>
                        <p className="text-sm text-gray-600 mb-1">
                            <span className="font-bold">{submittedName}</span> has been added as a{' '}
                            <span className="font-bold">{meta.label.toLowerCase()}</span> referral.
                        </p>
                        <p className="text-xs text-gray-400 mt-2 mb-6 max-w-xs">
                            Your referral code{' '}
                            <span className="font-mono font-bold text-primary">{referralCode}</span>
                            {' '}is linked. You'll earn commission once they are onboarded.
                        </p>
                        <div className="flex gap-2 w-full max-w-xs">
                            <button
                                onClick={() => { reset(); setStep('form'); }}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Refer another
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                                    <input required value={name} onChange={e => setName(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder={kind === 'landlord' ? 'e.g. John Mwangi' : kind === 'investor' ? 'e.g. Acme Chama' : 'e.g. Jane Doe'} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone *</label>
                                    <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="07..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID / Reg. No.</label>
                                    <input value={idNumber} onChange={e => setIdNumber(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="Optional" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="name@email.com (optional)" />
                                </div>
                            </div>

                            {/* Kind-specific section */}
                            {kind === 'tenant' && (
                                <div className="border-t pt-4">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Preferred Unit
                                        <span className="text-gray-400 font-normal normal-case ml-1">(optional)</span>
                                    </p>
                                    <p className="text-xs text-gray-400 mb-3">Pick a vacant unit so commission is locked to the unit price.</p>
                                    {propertyOptions.length > 1 && (
                                        <select value={propertyFilter}
                                            onChange={e => { setPropertyFilter(e.target.value); setSelectedUnitId(''); }}
                                            className="w-full p-3 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20 mb-3">
                                            <option value="">All Properties ({vacantUnits.length} vacant)</option>
                                            {propertyOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    )}
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-50">
                                            <input type="radio" name="unitPicker" checked={!selectedUnitId}
                                                onChange={() => setSelectedUnitId('')} className="w-4 h-4 accent-primary shrink-0" />
                                            <span className="text-sm text-gray-500 italic">No preference — let the team decide</span>
                                        </label>
                                        {displayedUnits.length > 0 ? displayedUnits.map(u => (
                                            <label key={u.id}
                                                className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                                                    selectedUnitId === u.id ? 'border-primary bg-primary/5' : 'border-gray-100 hover:bg-gray-50'
                                                }`}>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <input type="radio" name="unitPicker" value={u.id}
                                                        checked={selectedUnitId === u.id}
                                                        onChange={() => setSelectedUnitId(u.id)}
                                                        className="w-4 h-4 accent-primary shrink-0" />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-800 truncate">Unit {u.unitNumber}</p>
                                                        <p className="text-xs text-gray-500 truncate">{u.propertyName}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded shrink-0 whitespace-nowrap">
                                                    KES {Number(u.rent).toLocaleString()}/mo
                                                </span>
                                            </label>
                                        )) : (
                                            <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">No vacant units.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {kind === 'landlord' && (
                                <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                                        <input value={location} onChange={e => setLocation(e.target.value)}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                            placeholder="e.g. Kileleshwa, Nairobi" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1"># Properties</label>
                                        <input type="number" min={0} value={proposedCount}
                                            onChange={e => setProposedCount(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                            placeholder="e.g. 2" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Lead Type</label>
                                        <div className="flex h-[46px] items-center px-3 border rounded-xl bg-gray-50">
                                            <span className="text-xs text-gray-600">Property Management</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Property Usage</label>
                                        <select value={propertyUsageType} onChange={e => setPropertyUsageType(e.target.value as any)}
                                            className="w-full p-3 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20">
                                            <option value="Residential">Residential</option>
                                            <option value="Commercial">Commercial</option>
                                            <option value="Mixed Use">Mixed Use</option>
                                            <option value="Airbnb">Airbnb</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Building Type</label>
                                        <select value={buildingType} onChange={e => setBuildingType(e.target.value as any)}
                                            className="w-full p-3 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20">
                                            <option value="Standalone">Standalone</option>
                                            <option value="Apartment">Apartment</option>
                                            <option value="Single Unit">Single Unit</option>
                                            <option value="Bungalow">Bungalow</option>
                                            <option value="Maisonette">Maisonette</option>
                                            <option value="Gated Community">Gated Community</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes</label>
                                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
                                            placeholder="Anything the team should know (urgency, current agent, etc.)" />
                                    </div>
                                </div>
                            )}

                            {kind === 'investor' && (
                                <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Investor Type</label>
                                        <select value={investorType} onChange={e => setInvestorType(e.target.value as any)}
                                            className="w-full p-3 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20">
                                            <option>Individual</option>
                                            <option>Chama</option>
                                            <option>Sacco</option>
                                            <option>Corporate</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Target Amount (KES)</label>
                                        <input type="number" min={0} value={targetAmount}
                                            onChange={e => setTargetAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                            placeholder="e.g. 50000" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Residency / City</label>
                                        <input value={residency} onChange={e => setResidency(e.target.value)}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                            placeholder="e.g. Nairobi" />
                                    </div>
                                </div>
                            )}

                            {(kind === 'security' || kind === 'cleaning' || kind === 'maintenance') && (
                                <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Service</label>
                                        <select value={serviceSubtype} onChange={e => setServiceSubtype(e.target.value)}
                                            className="w-full p-3 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20">
                                            {SERVICE_SUBTYPES[kind].map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    {kind === 'maintenance' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Property / Site</label>
                                                <input value={maintProperty} onChange={e => setMaintProperty(e.target.value)}
                                                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                                    placeholder="e.g. Green Court Apartments" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                                                <input value={maintLocation} onChange={e => setMaintLocation(e.target.value)}
                                                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                                    placeholder="e.g. Kilimani, Nairobi" />
                                            </div>
                                        </>
                                    )}
                                    <div className={kind === 'maintenance' ? 'sm:col-span-2' : 'sm:col-span-2'}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                            {kind === 'maintenance' ? 'Estimated Cost (KES)' : 'Estimated Gig Value (KES)'}
                                        </label>
                                        <input type="number" min={0} value={estValue}
                                            onChange={e => setEstValue(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                            placeholder="Optional" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes</label>
                                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                                            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
                                            placeholder="Anything the team should know" />
                                    </div>
                                </div>
                            )}
                        </div>


                        <div className="flex gap-3 px-6 pb-6 pt-2 shrink-0">
                            <button type="button" onClick={onClose}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                            <button type="submit"
                                className={`flex-[2] py-3 bg-gradient-to-r ${meta.accent} text-white font-bold rounded-xl shadow-sm hover:opacity-95 transition`}>
                                Submit {meta.label} Referral
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ReferAnyoneModal;
