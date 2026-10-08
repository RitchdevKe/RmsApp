import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { TenantApplication } from '../../types';
import { isUnitSafelyVacant } from '../../utils/unitOccupancy';
import { getTodayIsoDate } from '../../utils/timezone';

interface ReferTenantModalProps {
    referrerId: string;
    referralCode: string;
    onClose: () => void;
    /** When provided, only units belonging to these property IDs are shown (landlord-restricted mode). */
    restrictToPropertyIds?: string[];
}

const ReferTenantModal: React.FC<ReferTenantModalProps> = ({
    referrerId,
    referralCode,
    onClose,
    restrictToPropertyIds,
}) => {
    const { properties, tenants, addApplication, systemSettings } = useData();
    const officeLine = ((systemSettings as any)?.phone || '').trim() || '0736 712 300';

    const [step, setStep] = useState<'form' | 'success'>('form');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [propertyFilter, setPropertyFilter] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [submittedName, setSubmittedName] = useState('');

    const isRestricted = restrictToPropertyIds && restrictToPropertyIds.length > 0;

    const vacantUnits = useMemo(() => {
        const sourcePops = isRestricted
            ? properties.filter(p => restrictToPropertyIds!.includes(p.id))
            : properties;
        return sourcePops.flatMap(p =>
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
    }, [properties, tenants, restrictToPropertyIds, isRestricted]);

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
        propertyFilter ? vacantUnits.filter(u => u.propertyId === propertyFilter) : vacantUnits
    , [vacantUnits, propertyFilter]);

    const selectedUnit = vacantUnits.find(u => u.id === selectedUnitId);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) return;

        const app: TenantApplication = {
            id: `APP-REF-${Date.now()}`,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            idNumber: idNumber.trim() || undefined,
            status: 'New',
            submittedDate: getTodayIsoDate(),
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
        setSubmittedName(name.trim());
        setStep('success');
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[2000] flex justify-end backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white shadow-2xl w-full sm:w-[min(94vw,560px)] h-full flex flex-col border-l-4 border-secondary animate-slide-in-right overscroll-contain"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-primary px-6 py-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <Icon name="tenants" className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Refer a Tenant</h3>
                            <p className="text-xs text-white/70">They'll appear in Applications for review</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {step === 'success' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="check" className="w-8 h-8 text-green-600" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-800 mb-2">Referral Submitted!</h4>
                        <p className="text-sm text-gray-600 mb-1">
                            <span className="font-bold">{submittedName}</span> has been added to the applicant queue.
                        </p>
                        <p className="text-xs text-gray-400 mt-2 mb-6 max-w-xs">
                            Your referral code{' '}
                            <span className="font-mono font-bold text-primary">{referralCode}</span>
                            {' '}is linked. You'll earn commission when they become an active tenant.
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full max-w-xs py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                        <div className="p-6 space-y-4">
                            {/* Referral code badge */}
                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-2">
                                <Icon name="star" className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-xs text-gray-600">
                                    Your referral code{' '}
                                    <span className="font-mono font-bold text-primary">{referralCode}</span>
                                    {' '}will be linked to this application.
                                </span>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                                <Icon name="communication" className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-800">
                                    Our office will reach out from the Agency line{' '}
                                    <a href={`tel:${officeLine.replace(/\s/g,'')}`} className="font-bold underline">{officeLine}</a>.
                                    Please share this number with your referral so they recognise the call.
                                </p>
                            </div>

                            {/* Tenant Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                                    <input
                                        required
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="e.g. Jane Doe"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone *</label>
                                    <input
                                        required
                                        type="tel"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="07..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID Number</label>
                                    <input
                                        value={idNumber}
                                        onChange={e => setIdNumber(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        placeholder="jane@email.com (optional)"
                                    />
                                </div>
                            </div>

                            {/* Unit Picker */}
                            <div className="border-t pt-4">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                                    Preferred Unit
                                    <span className="text-gray-400 font-normal normal-case ml-1">(optional)</span>
                                </p>
                                <p className="text-xs text-gray-400 mb-3">
                                    {isRestricted
                                        ? 'Select from your vacant units below.'
                                        : 'Filter by property or browse all vacant units.'}
                                </p>

                                {/* Property filter — only shown if multiple properties */}
                                {propertyOptions.length > 1 && (
                                    <select
                                        value={propertyFilter}
                                        onChange={e => { setPropertyFilter(e.target.value); setSelectedUnitId(''); }}
                                        className="w-full p-3 border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20 mb-3"
                                    >
                                        <option value="">All Properties ({vacantUnits.length} vacant)</option>
                                        {propertyOptions.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                )}

                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {/* No preference option */}
                                    <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="radio"
                                            name="unitPicker"
                                            checked={!selectedUnitId}
                                            onChange={() => setSelectedUnitId('')}
                                            className="w-4 h-4 accent-primary shrink-0"
                                        />
                                        <span className="text-sm text-gray-500 italic">No preference — let the team decide</span>
                                    </label>

                                    {displayedUnits.length > 0 ? displayedUnits.map(u => (
                                        <label
                                            key={u.id}
                                            className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                                                selectedUnitId === u.id
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-gray-100 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="radio"
                                                    name="unitPicker"
                                                    value={u.id}
                                                    checked={selectedUnitId === u.id}
                                                    onChange={() => setSelectedUnitId(u.id)}
                                                    className="w-4 h-4 accent-primary shrink-0"
                                                />
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
                                        <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
                                            No vacant units{propertyFilter ? ' in this property' : ''}.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>

                        {/* Sticky footer */}
                        <div className="flex gap-3 px-6 pb-6 pt-2 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-[2] py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark shadow-sm transition-colors"
                            >
                                Submit Referral
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ReferTenantModal;
