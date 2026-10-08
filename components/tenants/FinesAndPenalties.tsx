import React, { useMemo, useState } from 'react';
import { FineRule } from '../../types';
import { useData } from '../../context/DataContext';

const BASIS_OPTIONS: FineRule['basis'][] = [
    'Fixed Fee',
    'Percentage',
    'Fixed Daily',
    'Percentage of Rent',
    'Percentage of Arrears',
];

const LATE_TYPES = new Set(['late fee', 'late rent', 'late payment fine', 'late payment']);

const FinesAndPenalties: React.FC = () => {
    const { fines, addFine, updateFine, deleteFine, properties } = useData() as any;
    const [isEditing, setIsEditing] = useState(false);
    const [currentFine, setCurrentFine] = useState<Partial<FineRule>>({});
    const [saving, setSaving] = useState(false);

    const propertyOptions = useMemo(() => {
        const list = Array.isArray(properties) ? properties : [];
        return [{ id: 'ALL', name: 'All Properties' }, ...list.map((p: any) => ({ id: p.id, name: p.name }))];
    }, [properties]);

    const handleAddNew = () => {
        setCurrentFine({
            type: 'Late Fee',
            basis: 'Fixed Daily',
            description: '',
            appliesTo: 'Tenant',
            propertyId: 'ALL',
            graceDays: 5,
            capType: 'none',
            capValue: 0,
            active: true,
        });
        setIsEditing(true);
    };

    const handleEdit = (fine: FineRule) => {
        setCurrentFine({
            propertyId: 'ALL',
            graceDays: 5,
            capType: 'none',
            capValue: 0,
            active: true,
            ...fine,
        });
        setIsEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload: FineRule = {
                id: currentFine.id || `fine-${Date.now()}`,
                type: currentFine.type || 'Late Fee',
                basis: (currentFine.basis || 'Fixed Daily') as FineRule['basis'],
                value: Number(currentFine.value || 0),
                description: currentFine.description || '',
                appliesTo: currentFine.appliesTo || 'Tenant',
                propertyId: currentFine.propertyId || 'ALL',
                graceDays: Number(currentFine.graceDays ?? 5),
                capType: (currentFine.capType || 'none') as FineRule['capType'],
                capValue: Number(currentFine.capValue || 0),
                active: currentFine.active !== false,
            };
            if (currentFine.id) {
                await updateFine(currentFine.id, payload);
            } else {
                await addFine(payload);
            }
            setIsEditing(false);
        } finally {
            setSaving(false);
        }
    };

    const propertyNameFor = (id?: string) => {
        if (!id || id === 'ALL') return 'All properties';
        return propertyOptions.find(p => p.id === id)?.name || id;
    };

    const formatAmount = (fine: FineRule) => {
        switch (fine.basis) {
            case 'Fixed Fee': return `KES ${Number(fine.value || 0).toLocaleString()}`;
            case 'Fixed Daily': return `KES ${Number(fine.value || 0).toLocaleString()} / day`;
            case 'Percentage': return `${fine.value}%`;
            case 'Percentage of Rent': return `${fine.value}% of rent`;
            case 'Percentage of Arrears': return `${fine.value}% of arrears`;
            default: return String(fine.value);
        }
    };

    const isLate = (fine: FineRule) => LATE_TYPES.has(String(fine.type || '').toLowerCase());

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/tenants/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Fines &amp; Penalties Configuration</h1>
                <p className="text-lg text-gray-500 mt-1">
                    Configure automated fines. Late fees can be set as a fixed daily amount, a percentage of rent, or a percentage of arrears — per property or across all properties. Changes are saved globally and apply to every future invoice run.
                </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800">Rules</h2>
                    <button onClick={handleAddNew} className="px-4 py-2 bg-primary text-white rounded shadow-sm hover:bg-primary/90 font-semibold">+ Add Rule</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase text-gray-500 border-b">
                                <th className="py-2 pr-4">Type</th>
                                <th className="py-2 pr-4">Property</th>
                                <th className="py-2 pr-4">Basis</th>
                                <th className="py-2 pr-4 text-right">Amount</th>
                                <th className="py-2 pr-4">Grace</th>
                                <th className="py-2 pr-4">Cap</th>
                                <th className="py-2 pr-4">Status</th>
                                <th className="py-2 pr-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(fines || []).length === 0 && (
                                <tr><td colSpan={8} className="py-6 text-center text-gray-500">No rules yet. Click "Add Rule" to create your first late-fee rule.</td></tr>
                            )}
                            {(fines || []).map((fine: FineRule) => (
                                <tr key={fine.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 pr-4">
                                        <div className="font-semibold text-gray-800">{fine.type}</div>
                                        {fine.description && <div className="text-xs text-gray-500">{fine.description}</div>}
                                    </td>
                                    <td className="py-3 pr-4 text-gray-700">{propertyNameFor(fine.propertyId)}</td>
                                    <td className="py-3 pr-4 text-gray-700">{fine.basis}</td>
                                    <td className="py-3 pr-4 text-right font-semibold text-red-600">{formatAmount(fine)}</td>
                                    <td className="py-3 pr-4 text-gray-700">{isLate(fine) ? `${fine.graceDays ?? 5}d` : '—'}</td>
                                    <td className="py-3 pr-4 text-gray-700">
                                        {fine.capType && fine.capType !== 'none' && fine.capValue
                                            ? (fine.capType === 'fixed' ? `KES ${Number(fine.capValue).toLocaleString()}` : `${fine.capValue}% of rent`)
                                            : '—'}
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${fine.active === false ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                                            {fine.active === false ? 'Disabled' : 'Active'}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 text-right">
                                        <button onClick={() => handleEdit(fine)} className="text-primary text-sm hover:underline font-medium mr-3">Edit</button>
                                        <button onClick={() => { if (window.confirm(`Delete "${fine.type}"?`)) deleteFine(fine.id); }} className="text-red-500 hover:text-red-700 text-sm hover:underline font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isEditing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">{currentFine.id ? 'Edit' : 'New'} Fine Rule</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type</label>
                                <input placeholder="e.g. Late Fee" value={currentFine.type || ''} onChange={e => setCurrentFine({ ...currentFine, type: e.target.value })} className="w-full p-2 border rounded" />
                                <p className="text-xs text-gray-500 mt-1">Use "Late Fee" (or "Late Rent") for rules that auto-charge on unpaid rent.</p>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input placeholder="Short note shown on invoices" value={currentFine.description || ''} onChange={e => setCurrentFine({ ...currentFine, description: e.target.value })} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Property Scope</label>
                                <select value={currentFine.propertyId || 'ALL'} onChange={e => setCurrentFine({ ...currentFine, propertyId: e.target.value })} className="w-full p-2 border rounded bg-white">
                                    {propertyOptions.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Charge Basis</label>
                                <select value={currentFine.basis || 'Fixed Daily'} onChange={e => setCurrentFine({ ...currentFine, basis: e.target.value as FineRule['basis'] })} className="w-full p-2 border rounded bg-white">
                                    {BASIS_OPTIONS.map(b => (<option key={b} value={b}>{b}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {currentFine.basis === 'Fixed Fee' || currentFine.basis === 'Fixed Daily' ? 'Amount (KES)' : 'Percentage (%)'}
                                </label>
                                <input type="number" placeholder="0" value={currentFine.value ?? ''} onChange={e => setCurrentFine({ ...currentFine, value: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Grace Days</label>
                                <input type="number" min={0} value={currentFine.graceDays ?? 5} onChange={e => setCurrentFine({ ...currentFine, graceDays: parseInt(e.target.value, 10) || 0 })} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cap Type</label>
                                <select value={currentFine.capType || 'none'} onChange={e => setCurrentFine({ ...currentFine, capType: e.target.value as FineRule['capType'] })} className="w-full p-2 border rounded bg-white">
                                    <option value="none">No cap</option>
                                    <option value="fixed">Fixed KES cap</option>
                                    <option value="percent_rent">% of monthly rent</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cap Value</label>
                                <input type="number" value={currentFine.capValue ?? 0} onChange={e => setCurrentFine({ ...currentFine, capValue: parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded" disabled={!currentFine.capType || currentFine.capType === 'none'} />
                            </div>
                            <div className="col-span-2 flex items-center gap-2">
                                <input id="fine-active" type="checkbox" checked={currentFine.active !== false} onChange={e => setCurrentFine({ ...currentFine, active: e.target.checked })} />
                                <label htmlFor="fine-active" className="text-sm text-gray-700">Rule is active</label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 font-semibold disabled:opacity-60">
                                {saving ? 'Saving…' : 'Save & Sync Globally'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinesAndPenalties;
