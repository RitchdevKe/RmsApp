import React, { useState, useMemo, useEffect } from 'react';
import { fmtDate } from '../../../../utils/date';
import { OffboardingRecord, TenantProfile, Bill } from '../../types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { isAgencyRevenueStream } from '@/utils/revenueSplit';
import { getTodayIsoDate } from '../../utils/timezone';

export const StartOffboardingModal: React.FC<{ 
    tenants: TenantProfile[];
    onClose: () => void; 
    onStart: (tenantId: string, noticeDate: string, moveOutDate: string) => void 
}> = ({ tenants, onClose, onStart }) => {
    const [step, setStep] = useState<'search' | 'details'>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTenant, setSelectedTenant] = useState<TenantProfile | null>(null);
    const [noticeDate, setNoticeDate] = useState(getTodayIsoDate());
    const [moveOutDate, setMoveOutDate] = useState('');
    const { properties, landlords } = useData();

    const filteredTenants = useMemo(() => {
        if (!searchQuery) return [];
        return tenants.filter(t => 
            t.status !== 'Vacated' && t.status !== 'Evicted' &&
            (t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             t.unit.toLowerCase().includes(searchQuery.toLowerCase()))
        ).slice(0, 5);
    }, [tenants, searchQuery]);

    const handleSelectTenant = (tenant: TenantProfile) => {
        setSelectedTenant(tenant);
        setStep('details');
        const d = new Date();
        d.setDate(d.getDate() + 30);
        setMoveOutDate(d.toISOString().split('T')[0]);
    };

    const handleSubmit = () => {
        if (selectedTenant && noticeDate && moveOutDate) {
            onStart(selectedTenant.id, noticeDate, moveOutDate);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white p-6 rounded-xl shadow-lg max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Initiate Offboarding</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full-transition"><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                {step === 'search' && (
                    <div className="space-y-4">
                        <p className="text-gray-600 text-sm">Search for an active tenant to begin the move-out process.</p>
                        <input 
                            autoFocus
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by Name or Unit..."
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                        <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg divide-y">
                            {filteredTenants.map(t => {
                                const prop = properties.find(p => p.id === t.propertyId);
                                const ll = prop && prop.landlordId ? landlords.find(l => l.id === prop.landlordId) : null;
                                return (
                                    <button 
                                        key={t.id} 
                                        onClick={() => handleSelectTenant(t)}
                                        className="w-full text-left p-3 hover:bg-gray-50 flex justify-between items-center transition-colors"
                                    >
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{t.name}</p>
                                            <p className="text-xs text-gray-500">{t.propertyName} - Unit {t.unit}</p>
                                            {ll && <p className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100/40 inline-block font-semibold mt-1">Landlord: {ll.name}</p>}
                                        </div>
                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">{t.status}</span>
                                    </button>
                                );
                            })}
                            {searchQuery && filteredTenants.length === 0 && (
                                <div className="p-4 text-center text-gray-500 text-sm">No active tenants found.</div>
                            )}
                        </div>
                    </div>
                )}

                {step === 'details' && selectedTenant && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <p className="font-bold text-gray-800">{selectedTenant.name}</p>
                            <p className="text-sm text-gray-600">{selectedTenant.propertyName} - Unit {selectedTenant.unit}</p>
                            <p className="text-xs text-brand font-semibold mt-1">Deposit Held: KES {selectedTenant.depositPaid?.toLocaleString()}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Notice Given On</label>
                                <input 
                                    type="date" 
                                    value={noticeDate} 
                                    onChange={e => setNoticeDate(e.target.value)}
                                    className="w-full p-2 border rounded-lg focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Move Out Date</label>
                                <input 
                                    type="date" 
                                    value={moveOutDate} 
                                    onChange={e => setMoveOutDate(e.target.value)}
                                    className="w-full p-2 border rounded-lg focus:ring-primary"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setStep('search')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
                            <button onClick={handleSubmit} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors">Start Process</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const ReconciliationModal: React.FC<{
    deposit: number;
    tenantName: string;
    depositHolderName?: string;
    depositHolderType?: 'Agency' | 'Landlord';
    onConfirm: (refundAmount: number) => void;
    onCancel: () => void;
}> = ({ deposit, tenantName, depositHolderName, depositHolderType, onConfirm, onCancel }) => {
    const [deductions, setDeductions] = useState<Array<{desc: string, amount: number}>>([]);
    const [desc, setDesc] = useState('');
    const [amount, setAmount] = useState('');

    const addDeduction = () => {
        if (desc && amount) {
            setDeductions([...deductions, { desc, amount: parseFloat(amount) }]);
            setDesc('');
            setAmount('');
        }
    };

    const removeDeduction = (index: number) => {
        setDeductions(deductions.filter((_, i) => i !== index));
    };

    const handleConfirm = () => {
        let total = deductions.reduce((sum, d) => sum + d.amount, 0);
        if (desc && amount) {
            const val = parseFloat(amount);
            if (!isNaN(val)) total += val;
        }
        onConfirm(deposit - total);
    };

    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
    const netRefund = deposit - totalDeductions;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4 animate-fade-in">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Deposit Reconciliation</h3>
                <p className="text-sm text-gray-600 mb-4">Calculate final refund for <strong>{tenantName}</strong>.</p>
                
                <div className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600 font-semibold text-sm">Deposit Held</span>
                        <span className="font-extrabold text-gray-800">KES {deposit.toLocaleString()}</span>
                    </div>
                    {depositHolderType && (
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                            <span className="text-gray-500 text-xs uppercase font-bold tracking-wider">Held In</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${depositHolderType === 'Agency' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {depositHolderType === 'Agency' ? 'Agency Vault' : 'Landlord Vault'} {depositHolderName ? `(${depositHolderName})` : ''}
                            </span>
                        </div>
                    )}
                    <div className="space-y-2">
                        {deductions.map((d, i) => (
                            <div key={i} className="flex justify-between items-center text-sm text-red-600">
                                <span>- {d.desc}</span>
                                <div className="flex items-center">
                                    <span>KES {d.amount.toLocaleString()}</span>
                                    <button onClick={() => removeDeduction(i)} className="ml-2 text-gray-400 hover:text-red-500 font-extrabold text-lg">&times;</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between items-center font-bold text-lg">
                        <span>Net Refund</span>
                        <span className={netRefund < 0 ? 'text-red-600' : 'text-green-600'}>KES {netRefund.toLocaleString()}</span>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Add Deduction</label>
                    <div className="flex gap-2">
                        <input 
                            className="flex-grow p-2 border rounded-lg text-sm" 
                            placeholder="Item (e.g. Painting)" 
                            value={desc} 
                            onChange={e => setDesc(e.target.value)}
                        />
                        <input 
                            className="w-24 p-2 border rounded-lg text-sm" 
                            type="number" 
                            placeholder="Amount" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)}
                        />
                        <button onClick={addDeduction} className="px-3 bg-gray-200 rounded-lg hover:bg-gray-300 font-bold">+</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Tip: Pending input above will be auto-saved on confirm.</p>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button 
                        onClick={handleConfirm} 
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-sm"
                    >
                        Confirm Refund
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ManageOffboardingModal: React.FC<{ 
    record: OffboardingRecord; 
    onClose: () => void;
    onUpdate: (id: string, data: Partial<OffboardingRecord>) => void;
    onRevoke: (recordId: string, tenantId: string) => void;
    onFinalize: (record: OffboardingRecord) => void;
}> = ({ record, onClose, onUpdate, onRevoke, onFinalize }) => {
    const [isRecModalOpen, setIsRecModalOpen] = useState(false);
    const [localState, setLocalState] = useState<OffboardingRecord>(record);
    const { tenants, properties, landlords } = useData();
    const tenant = tenants.find(t => t.id === record.tenantId);
    
    const prop = tenant ? properties.find(p => p.id === tenant.propertyId) : null;
    const ll = prop?.landlordId ? landlords.find(l => l.id === prop.landlordId) : null;
    
    let depositHolderType: 'Agency' | 'Landlord' = 'Landlord';
    if (isAgencyRevenueStream(prop, 'deposit')) {
        depositHolderType = 'Agency';
    }

    useEffect(() => {
        setLocalState(record);
    }, [record]);

    const steps = [
        { key: 'inspectionStatus', label: 'Pre-Exit Inspection', status: localState.inspectionStatus },
        { key: 'utilityClearance', label: 'Utility Bill Clearance', status: localState.utilityClearance ? 'Passed' : 'Pending' },
        { key: 'depositRefunded', label: 'Deposit Reconciliation', status: localState.depositRefunded ? 'Passed' : 'Pending' },
        { key: 'keysReturned', label: 'Key Handover', status: localState.keysReturned ? 'Passed' : 'Pending' },
    ];

    const handleToggleStep = (key: string, currentVal: any) => {
        if (key === 'depositRefunded') {
            if (currentVal) {
                if (window.confirm("Undo deposit refund status? This will clear the calculated refund amount.")) {
                    setLocalState(prev => ({ ...prev, depositRefunded: false, finalBillAmount: 0 }));
                }
            } else {
                setIsRecModalOpen(true);
            }
            return;
        }

        if (key === 'inspectionStatus') {
            const nextStatus = currentVal === 'Pending' ? 'Passed' : currentVal === 'Passed' ? 'Failed' : 'Pending';
            setLocalState(prev => ({ ...prev, inspectionStatus: nextStatus }));
        } else {
            // @ts-ignore
            setLocalState(prev => ({ ...prev, [key]: !prev[key] }));
        }
    };

    const handleConfirmReconciliation = (amount: number) => {
        setLocalState(prev => ({ 
            ...prev, 
            depositRefunded: true, 
            finalBillAmount: amount 
        }));
        setIsRecModalOpen(false);
    };

    const handleSaveChanges = () => {
        onUpdate(localState.id, localState);
        alert("Progress saved successfully.");
        onClose();
    };

    const handleComplete = () => {
        const pending = steps.filter(s => s.status !== 'Passed').map(s => s.label);
        const msg = pending.length
            ? `Finalize offboarding with ${pending.length} step(s) still pending?\n\nPending: ${pending.join(', ')}\n\nThis will still mark the tenant as Vacated, free the unit, and archive this record.`
            : "Finalize offboarding? This will mark the tenant as Vacated, update escrow balances, and archive this record.";
        if (window.confirm(msg)) {
            onFinalize(localState);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white p-6 rounded-xl shadow-lg max-w-2xl w-full">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Manage Offboarding</h2>
                        <p className="text-gray-600 font-semibold">{localState.tenantName} - Unit {localState.unit}</p>
                        {ll && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100/40 px-2.5 py-0.5 rounded font-bold inline-block mt-1">
                                Retained Escrow Landlord: {ll.name}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-400" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider border-b pb-2">Progress Checklist</h3>
                        <div className="space-y-4">
                            {steps.map((step, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleToggleStep(step.key, (localState as any)[step.key])}>
                                    <div className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 text-xs font-bold ${step.status === 'Passed' ? 'bg-green-500 text-white' : step.status === 'Failed' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                            {step.status === 'Passed' ? <Icon name="check" className="w-3.5 h-3.5" /> : step.status === 'Failed' ? <Icon name="close" className="w-3.5 h-3.5" /> : <span>{idx + 1}</span>}
                                        </div>
                                        <span className={`font-semibold text-sm ${step.status !== 'Pending' ? 'text-gray-800' : 'text-gray-500'}`}>{step.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${step.status === 'Passed' ? 'bg-green-100 text-green-700' : step.status === 'Failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {step.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider border-b pb-2">Summary</h3>
                        <div className="bg-gray-50 p-4 rounded-xl text-sm space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Notice Date:</span>
                                <span className="font-semibold text-gray-800">{localState.noticeDate}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Move Out:</span>
                                <span className="font-semibold text-gray-800">{fmtDate(localState.moveOutDate)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Status:</span>
                                <span className="font-bold text-blue-600">{localState.status}</span>
                            </div>
                            {localState.depositRefunded && (
                                <div className="flex justify-between pt-2 mt-2 border-t border-gray-200">
                                    <span className="text-gray-600">Final Refund:</span>
                                    <span className={`font-black ${(localState.finalBillAmount || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        KES {localState.finalBillAmount?.toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 mt-auto">
                            <button 
                                onClick={handleSaveChanges}
                                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-850 font-bold rounded-lg transition-colors border text-sm"
                            >
                                Save Progress
                            </button>
                            
                            {localState.status !== 'Completed' && (
                                <button 
                                    onClick={handleComplete}
                                    className="w-full py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md transition-colors text-sm"
                                >
                                    Finalize & Close
                                </button>
                            )}
                             <button 
                                onClick={() => onRevoke(localState.id, localState.tenantId)}
                                className="w-full py-2 bg-white border border-red-200 text-red-600 font-bold rounded-lg hover:bg-red-50 mt-2 transition-colors text-sm"
                            >
                                Revoke Notice
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isRecModalOpen && (
                <ReconciliationModal 
                    deposit={tenant?.depositPaid || 0} 
                    tenantName={localState.tenantName}
                    depositHolderName={ll?.name}
                    depositHolderType={depositHolderType}
                    onConfirm={handleConfirmReconciliation}
                    onCancel={() => setIsRecModalOpen(false)}
                />
            )}
        </div>
    );
};

const Offboarding: React.FC = () => {
    const { offboardingRecords, tenants, addOffboardingRecord, updateOffboardingRecord, updateTenant, addBill, landlords, properties, updateProperty, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Tenants', 'create');
    const canEdit = isSuperAdmin || checkPermission('Tenants', 'edit');
    const [isStartModalOpen, setIsStartModalOpen] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
    const [selectedLandlordId, setSelectedLandlordId] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');

    const activeRecord = useMemo(() => 
        offboardingRecords.find(r => r.id === selectedRecordId) || null
    , [offboardingRecords, selectedRecordId]);

    // --- Filter records by landlord + search dynamically ---
    const filteredRecords = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return offboardingRecords.filter(rec => {
            const tenant = tenants.find(t => t.id === rec.tenantId);
            const prop = tenant ? properties.find(p => p.id === tenant.propertyId) : null;
            if (selectedLandlordId !== 'All') {
                if (!prop || prop.landlordId !== selectedLandlordId) return false;
            }
            if (q) {
                const hay = `${rec.tenantName || ''} ${rec.unit || ''} ${prop?.name || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [offboardingRecords, tenants, properties, selectedLandlordId, searchQuery]);

    const handleStartOffboarding = (tenantId: string, noticeDate: string, moveOutDate: string) => {
        if (!canCreate) return alert('You do not have permission to initiate offboarding.');
        const tenant = tenants.find(t => t.id === tenantId);
        if (!tenant) return;

        const start = new Date(noticeDate);
        const end = new Date(moveOutDate);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

        if (diffDays < 30) {
            alert(`Notice Rejected: The notice period is only ${diffDays} days. A minimum of 30 days is required.`);
            return;
        }

        let warning = "";
        if (end.getDate() > 5) {
            warning = "\n\nWARNING: Departure date is after the 5th. Full month rent is now due. Deposit may be deducted if rent remains unpaid.";
        }

        const newRecord: OffboardingRecord = {
            id: `off-${Date.now()}`,
            tenantId: tenant.id,
            tenantName: tenant.name,
            unit: tenant.unit,
            noticeDate,
            moveOutDate,
            status: 'Notice Given',
            inspectionStatus: 'Pending',
            utilityClearance: false,
            depositRefunded: false,
            keysReturned: false
        };

        addOffboardingRecord(newRecord);
        updateTenant(tenant.id, { status: 'Notice', leaseEnd: moveOutDate });
        
        setIsStartModalOpen(false);
        alert(`Offboarding initiated for ${tenant.name}. Status set to 'Notice'.${warning}`);
    };

    const handleRevokeNotice = (recordId: string, tenantId: string) => {
        if (!canEdit) return alert('You do not have permission to revoke notices.');
        if (window.confirm("Are you sure you want to revoke the notice? The tenant will remain Active and the offboarding process will be cancelled.")) {
            updateOffboardingRecord(recordId, { status: 'Cancelled' } as any);
            updateTenant(tenantId, { status: 'Active', leaseEnd: undefined });
            // Multi-occupancy: also restore any sub-tenants that were placed on Notice
            const mainTenant = tenants.find(t => t.id === tenantId);
            const subs = tenants.filter(t => t.mainTenantId === tenantId && t.status === 'Notice');
            subs.forEach(s => updateTenant(s.id, { status: 'Active', leaseEnd: undefined }));
            // Ensure the underlying unit is flagged Occupied again so it counts
            // in occupancy stats (some flows flip it to Vacant preemptively).
            const anchor = mainTenant?.mainTenantId
                ? tenants.find(t => t.id === mainTenant.mainTenantId)
                : mainTenant;
            if (anchor?.propertyId && anchor?.unitId) {
                const prop = properties.find(p => p.id === anchor.propertyId);
                if (prop) {
                    const updatedUnits = prop.units.map(u =>
                        u.id === anchor.unitId ? { ...u, status: 'Occupied' as const, tenantId: anchor.id } : u,
                    );
                    updateProperty(prop.id, { units: updatedUnits as any });
                }
            }
            setSelectedRecordId(null);
            alert(`Notice revoked. ${subs.length > 0 ? `Main tenant and ${subs.length} sub-tenant(s) restored to Active.` : 'Tenant status restored to Active.'}`);
        }
    };

    const handleFinalizeOffboarding = (record: OffboardingRecord) => {
        if (record.finalBillAmount !== undefined) {
            if (record.finalBillAmount > 0) {
                const prop = properties.find(p => p.id === record.propertyId);
                const isAgencyHeld = isAgencyRevenueStream(prop, 'deposit');

                const refundBill: Bill = {
                    id: `bill-ref-${Date.now()}`,
                    vendor: record.tenantName,
                    category: 'Deposit Refund',
                    amount: record.finalBillAmount,
                    invoiceDate: getTodayIsoDate(),
                    dueDate: getTodayIsoDate(),
                    status: 'Unpaid',
                    description: `Deposit Refund for ${record.unit} ${isAgencyHeld ? '(Agency Funds)' : '(Landlord Funds)'}`,
                    propertyId: isAgencyHeld ? 'Agency' : (record.propertyId || 'Agency'),
                    metadata: { grossAmount: 0, deductions: 0 }
                };
                addBill(refundBill);
            }
        }

        const tenant = tenants.find(t => t.id === record.tenantId);
        const prop = properties.find(p => p.id === tenant?.propertyId);

        // Archive sub-tenants first
        const subTenants = tenants.filter(t => t.mainTenantId === record.tenantId && t.status !== 'Vacated' && t.status !== 'Evicted');
        subTenants.forEach(s => {
            updateTenant(s.id, { status: 'Vacated', unitId: undefined as any, unit: '' as any } as any);
        });

        if (tenant && prop && tenant.unitId) {
            const remainingSubs = tenants.filter(t =>
                t.id !== record.tenantId
                && t.unitId === tenant.unitId
                && t.mainTenantId !== record.tenantId
                && t.status !== 'Vacated'
                && t.status !== 'Evicted'
            );
            if (remainingSubs.length === 0) {
                const updatedUnits = prop.units.map(u => 
                    u.id === tenant.unitId ? { ...u, status: 'Vacant' as const, tenantId: undefined } : u
                );
                updateProperty(prop.id, { units: updatedUnits as any });
            }
        }

        updateTenant(record.tenantId, { status: 'Vacated', unitId: undefined as any, unit: '' as any } as any);
        updateOffboardingRecord(record.id, { status: 'Completed' });
        alert(`Offboarding finalized. ${subTenants.length ? `Main + ${subTenants.length} sub-tenant(s) archived.` : 'Tenant archived.'} ${record.finalBillAmount && record.finalBillAmount > 0 ? 'Deposit refund bill logged under payments.' : ''}`);
    };

    return (
        <div className="space-y-8 animate-fade-in p-2 md:p-4">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div>
                    <button onClick={() => window.location.hash = '#/partial-rms/tenants/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                        <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
                    </button>
                    <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Tenant Offboarding <span className="text-sm font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded ml-1 uppercase">Partial RMS</span></h1>
                    <p className="text-lg text-gray-500 mt-1">Manage move-outs, inspections, and direct landlord deposit refunds.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border shadow-sm">
                        <Icon name="user" className="w-5 h-5 text-gray-400 ml-1" />
                        <span className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Landlord:</span>
                        <select
                            value={selectedLandlordId}
                            onChange={(e) => setSelectedLandlordId(e.target.value)}
                            className="outline-none text-sm bg-transparent border-none text-gray-700 pr-5 font-bold cursor-pointer min-w-[140px]"
                        >
                            <option value="All">All Landlords</option>
                            {landlords.map(ll => (
                                <option key={ll.id} value={ll.id}>{ll.name}</option>
                            ))}
                        </select>
                    </div>

                    {canCreate && (
                        <button onClick={() => setIsStartModalOpen(true)} className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-sm transition-colors whitespace-nowrap">
                            Start Offboarding
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                    <div className="relative flex-1 max-w-md">
                        <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by tenant, unit, or property..."
                            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 outline-none"
                        />
                    </div>
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="text-xs text-gray-500 hover:text-gray-800 font-semibold">Clear</button>
                    )}
                </div>
                 <div className="overflow-x-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-250">
                        <thead className="bg-gray-50/70">
                            <tr>
                                <th className="px-4 py-3.5 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Tenant</th>
                                <th className="px-4 py-3.5 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Unit</th>
                                <th className="px-4 py-3.5 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Notice Date</th>
                                <th className="px-4 py-3.5 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Move Out</th>
                                <th className="px-4 py-3.5 text-center font-bold text-gray-500 uppercase tracking-wider text-xs">Status</th>
                                <th className="px-4 py-3.5 text-right font-bold text-gray-500 uppercase tracking-wider text-xs">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRecords.map(rec => {
                                const tenant = tenants.find(t => t.id === rec.tenantId);
                                const prop = tenant ? properties.find(p => p.id === tenant.propertyId) : null;
                                const ll = prop && prop.landlordId ? landlords.find(l => l.id === prop.landlordId) : null;

                                return (
                                    <tr key={rec.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <p className="font-bold text-gray-900">{rec.tenantName}</p>
                                            <div className="flex flex-col gap-1 mt-1">
                                                {ll && <span className="text-[9px] text-emerald-800 bg-emerald-50 px-1 py-0.5 border border-emerald-100/50 rounded inline-block font-semibold w-max">Landlord: {ll.name}</span>}
                                                {isAgencyRevenueStream(prop, 'deposit') ? (
                                                    <span className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-bold w-max">
                                                        🏦 Deposit Held by Agency
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded font-bold w-max">
                                                        🏠 Deposit Held by Landlord (Digital Payout Release Required)
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-gray-600 font-semibold">{rec.unit}</td>
                                        <td className="px-4 py-4 text-gray-500 font-medium">{rec.noticeDate}</td>
                                        <td className="px-4 py-4 text-gray-500 font-medium">{fmtDate(rec.moveOutDate)}</td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wide ${
                                                rec.status === 'Completed' ? 'bg-gray-100 text-gray-700' : 
                                                rec.status === 'Cancelled' ? 'bg-red-50 text-red-700' :
                                                'bg-yellow-50 text-yellow-800 border border-yellow-100/60'
                                            }`}>
                                                {rec.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {rec.status !== 'Cancelled' && (
                                                <button 
                                                    onClick={() => setSelectedRecordId(rec.id)}
                                                    className="text-primary hover:underline font-bold"
                                                >
                                                    Manage
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">No active offboarding processes matches the selected filter.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                 </div>
            </div>
            
            {isStartModalOpen && (
                <StartOffboardingModal 
                    tenants={tenants}
                    onClose={() => setIsStartModalOpen(false)} 
                    onStart={handleStartOffboarding} 
                />
            )}

            {activeRecord && (
                <ManageOffboardingModal 
                    record={activeRecord}
                    onClose={() => setSelectedRecordId(null)}
                    onUpdate={updateOffboardingRecord}
                    onRevoke={handleRevokeNotice}
                    onFinalize={handleFinalizeOffboarding}
                />
            )}
        </div>
    );
};

export default Offboarding;
