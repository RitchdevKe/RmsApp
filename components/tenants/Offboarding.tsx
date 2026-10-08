import React, { useState, useMemo, useEffect } from 'react';
import { fmtDate } from '../../utils/date';
import { OffboardingRecord, TenantProfile, Bill } from '../../types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { safeAlert, safeConfirm } from '../../utils/dialogs';
import { supabase } from '../../utils/supabaseClient';
import { getTodayIsoDate } from '../../utils/timezone';

export const StartOffboardingModal: React.FC<{ 
    tenants: TenantProfile[];
    onClose: () => void; 
    onStart: (tenantId: string, noticeDate: string, moveOutDate: string) => Promise<void> | void
}> = ({ tenants, onClose, onStart }) => {
    const [step, setStep] = useState<'search' | 'details'>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTenant, setSelectedTenant] = useState<TenantProfile | null>(null);
    const [noticeDate, setNoticeDate] = useState(getTodayIsoDate());
    const [moveOutDate, setMoveOutDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filteredTenants = useMemo(() => {
        if (!searchQuery) return [];
        return tenants.filter(t => 
            t.status !== 'Vacated' && t.status !== 'Evicted' && t.status !== 'Notice' &&
            (t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             t.unit.toLowerCase().includes(searchQuery.toLowerCase()))
        ).slice(0, 5);
    }, [tenants, searchQuery]);

    const handleSelectTenant = (tenant: TenantProfile) => {
        setSelectedTenant(tenant);
        setStep('details');
        // Default move out date to 30 days from today
        const d = new Date();
        d.setDate(d.getDate() + 30);
        setMoveOutDate(d.toISOString().split('T')[0]);
    };

    const handleSubmit = async () => {
        if (selectedTenant && noticeDate && moveOutDate && !isSubmitting) {
            setIsSubmitting(true);
            try {
                await onStart(selectedTenant.id, noticeDate, moveOutDate);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-lg max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Initiate Offboarding</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                {step === 'search' && (
                    <div className="space-y-4">
                        <p className="text-gray-600 text-sm">Search for a tenant to begin the move-out process.</p>
                        <input 
                            autoFocus
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by Name or Unit..."
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/50"
                        />
                        <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                            {filteredTenants.map(t => (
                                <button 
                                    key={t.id} 
                                    onClick={() => handleSelectTenant(t)}
                                    className="w-full text-left p-3 hover:bg-gray-50 flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-bold text-gray-800">{t.name}</p>
                                        <p className="text-xs text-gray-500">{t.propertyName} - {t.unit}</p>
                                    </div>
                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">{t.status}</span>
                                </button>
                            ))}
                            {searchQuery && filteredTenants.length === 0 && (
                                <div className="p-4 text-center text-gray-500 text-sm">No active tenants found.</div>
                            )}
                        </div>
                    </div>
                )}

                {step === 'details' && selectedTenant && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p className="font-bold text-gray-800">{selectedTenant.name}</p>
                            <p className="text-sm text-gray-600">{selectedTenant.propertyName} - {selectedTenant.unit}</p>
                            <p className="text-xs text-gray-500 mt-1">Deposit Held: KES {selectedTenant.depositPaid?.toLocaleString()}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notice Given On</label>
                                <input 
                                    type="date" 
                                    value={noticeDate} 
                                    onChange={e => setNoticeDate(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Move Out Date</label>
                                <input 
                                    type="date" 
                                    value={moveOutDate} 
                                    onChange={e => setMoveOutDate(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button disabled={isSubmitting} onClick={() => setStep('search')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50">Back</button>
                            <button disabled={isSubmitting} onClick={handleSubmit} className="px-4 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700 disabled:opacity-50">
                                {isSubmitting ? 'Starting...' : 'Start Process'}
                            </button>
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
    onConfirm: (refundAmount: number) => void;
    onCancel: () => void;
}> = ({ deposit, tenantName, onConfirm, onCancel }) => {
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
        // Auto-save pending input
        if (desc && amount) {
            const val = parseFloat(amount);
            if (!isNaN(val)) total += val;
        }
        onConfirm(deposit - total);
    };

    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
    const netRefund = deposit - totalDeductions;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Deposit Reconciliation</h3>
                <p className="text-sm text-gray-600 mb-4">Calculate final refund for <strong>{tenantName}</strong>.</p>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600">Deposit Held</span>
                        <span className="font-bold text-gray-800">KES {deposit.toLocaleString()}</span>
                    </div>
                    <div className="space-y-2">
                        {deductions.map((d, i) => (
                            <div key={i} className="flex justify-between items-center text-sm text-red-600">
                                <span>- {d.desc}</span>
                                <div className="flex items-center">
                                    <span>KES {d.amount.toLocaleString()}</span>
                                    <button onClick={() => removeDeduction(i)} className="ml-2 text-gray-400 hover:text-red-500">&times;</button>
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Add Deduction</label>
                    <div className="flex gap-2">
                        <input 
                            className="flex-grow p-2 border rounded text-sm" 
                            placeholder="Item (e.g. Painting)" 
                            value={desc} 
                            onChange={e => setDesc(e.target.value)}
                        />
                        <input 
                            className="w-24 p-2 border rounded text-sm" 
                            type="number" 
                            placeholder="Amount" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)}
                        />
                        <button onClick={addDeduction} className="px-3 bg-gray-200 rounded hover:bg-gray-300 font-bold">+</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Tip: Pending input above will be auto-saved on confirm.</p>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button 
                        onClick={handleConfirm} 
                        className="px-4 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 shadow-sm"
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
    const { tenants } = useData();
    const tenant = tenants.find(t => t.id === record.tenantId);

    useEffect(() => {
        setLocalState(record);
    }, [record]);

    const steps = [
        { key: 'inspectionStatus', label: 'Pre-Exit Inspection', status: localState.inspectionStatus },
        { key: 'utilityClearance', label: 'Utility Bill Clearance', status: localState.utilityClearance ? 'Passed' : 'Pending' },
        { key: 'depositRefunded', label: 'Deposit Reconciliation', status: localState.depositRefunded ? 'Passed' : 'Pending' },
        { key: 'keysReturned', label: 'Key Handover', status: localState.keysReturned ? 'Passed' : 'Pending' },
    ];

    const handleToggleStep = async (key: string, currentVal: any) => {
        if (localState.status === 'Completed') return;
        if (key === 'depositRefunded') {
            if (currentVal) {
                // Allow unchecking deposit reconciliation
                if (await safeConfirm("Undo deposit refund status? This will clear the calculated refund amount.")) {
                    setLocalState(prev => ({ ...prev, depositRefunded: false, finalBillAmount: 0 }));
                }
            } else {
                // Open modal to calculate and set it
                setIsRecModalOpen(true);
            }
            return;
        }

        if (key === 'inspectionStatus') {
            // Cycle: Pending -> Passed -> Failed -> Pending
            const nextStatus = currentVal === 'Pending' ? 'Passed' : currentVal === 'Passed' ? 'Failed' : 'Pending';
            setLocalState(prev => ({ ...prev, inspectionStatus: nextStatus }));
        } else {
            // Toggle Boolean fields
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

    const handleSaveChanges = async () => {
        onUpdate(localState.id, localState);
        await safeAlert("Progress saved successfully.");
        onClose();
    };

    const handleComplete = async () => {
        const pending = steps.filter(s => s.status !== 'Passed').map(s => s.label);
        const msg = pending.length
            ? `Finalize offboarding with ${pending.length} step(s) still pending?\n\nPending: ${pending.join(', ')}\n\nThis will still mark the tenant as Vacated, free the unit, and archive this record.`
            : "Finalize offboarding? This will mark the tenant as Vacated, process final financials, and archive this record.";
        if (await safeConfirm(msg)) {
            onFinalize(localState);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-lg max-w-2xl w-full">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Manage Offboarding</h2>
                        <p className="text-gray-600">{localState.tenantName} - {localState.unit}</p>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-400" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wider border-b pb-2">Progress Checklist</h3>
                        <div className="space-y-4">
                            {steps.map((step, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${localState.status === 'Completed' ? 'bg-gray-50/50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}`} onClick={() => handleToggleStep(step.key, (localState as any)[step.key])}>
                                    <div className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${step.status === 'Passed' ? 'bg-green-500 text-white' : step.status === 'Failed' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                            {step.status === 'Passed' ? <Icon name="check" className="w-4 h-4" /> : step.status === 'Failed' ? <Icon name="close" className="w-4 h-4" /> : <span>{idx + 1}</span>}
                                        </div>
                                        <span className={`font-medium ${step.status !== 'Pending' ? 'text-gray-800' : 'text-gray-500'}`}>{step.label}</span>
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
                        <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wider border-b pb-2">Summary</h3>
                        <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Notice Date:</span>
                                <span className="font-medium">{localState.noticeDate}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Move Out:</span>
                                <span className="font-medium">{fmtDate(localState.moveOutDate)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Status:</span>
                                <span className="font-bold text-blue-600">{localState.status}</span>
                            </div>
                            {localState.depositRefunded && (
                                <div className="flex justify-between pt-2 mt-2 border-t border-gray-200">
                                    <span className="text-gray-600">Final Refund:</span>
                                    <span className={`font-bold ${(localState.finalBillAmount || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        KES {localState.finalBillAmount?.toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 mt-auto">
                            {localState.status === 'Completed' ? (
                                <button 
                                    onClick={onClose}
                                    className="w-full py-2 bg-gray-200 text-gray-800 font-bold rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    Close
                                </button>
                            ) : (
                                <>
                                    {steps.every(s => s.status === 'Passed') ? (
                                        <button 
                                            onClick={handleComplete}
                                            className="w-full py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md transition-colors"
                                        >
                                            Complete offboarding
                                        </button>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={handleSaveChanges}
                                                className="w-full py-2 bg-gray-200 text-gray-800 font-bold rounded-lg hover:bg-gray-300 transition-colors"
                                            >
                                                Save Progress
                                            </button>
                                            <button 
                                                onClick={handleComplete}
                                                className="w-full py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md transition-colors"
                                            >
                                                Finalize & Close
                                            </button>
                                        </>
                                    )}
                                    <button 
                                        onClick={() => onRevoke(localState.id, localState.tenantId)}
                                        className="w-full py-2 bg-white border border-red-200 text-red-600 font-bold rounded-lg hover:bg-red-50 mt-2 transition-colors"
                                    >
                                        Revoke Notice
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isRecModalOpen && (
                <ReconciliationModal 
                    deposit={tenant?.depositPaid || 0} 
                    tenantName={localState.tenantName}
                    onConfirm={handleConfirmReconciliation}
                    onCancel={() => setIsRecModalOpen(false)}
                />
            )}
        </div>
    );
};

const Offboarding: React.FC = () => {
    const { properties, offboardingRecords, tenants, addOffboardingRecord, updateOffboardingRecord, deleteOffboardingRecord, updateTenant, addBill, updateProperty, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Tenants', 'create');
    const canEdit = isSuperAdmin || checkPermission('Tenants', 'edit');
    const [isStartModalOpen, setIsStartModalOpen] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const activeRecord = useMemo(() =>
        offboardingRecords.find(r => r.id === selectedRecordId) || null
    , [offboardingRecords, selectedRecordId]);

    const filteredRecords = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return offboardingRecords;
        return offboardingRecords.filter(rec => {
            const tenant = tenants.find(t => t.id === rec.tenantId);
            const prop = tenant ? properties.find(p => p.id === tenant.propertyId) : null;
            return (
                (rec.tenantName || '').toLowerCase().includes(q) ||
                (rec.unit || '').toLowerCase().includes(q) ||
                (prop?.name || '').toLowerCase().includes(q)
            );
        });
    }, [offboardingRecords, tenants, properties, searchQuery]);

    const handleStartOffboarding = async (tenantId: string, noticeDate: string, moveOutDate: string) => {
        if (!canCreate) {
            await safeAlert('You do not have permission to initiate offboarding.');
            return;
        }
        
        // Prevent duplicate offboarding records for the same tenant
        const existingRecord = offboardingRecords.find(r => r.tenantId === tenantId && r.status !== 'Cancelled' && r.status !== 'Completed');
        if (existingRecord) {
            await safeAlert('An active offboarding process already exists for this tenant.');
            return;
        }

        const tenant = tenants.find(t => t.id === tenantId);
        if (!tenant) return;

        const start = new Date(noticeDate);
        const end = new Date(moveOutDate);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

        // 30-day Notice Rule Check
        if (diffDays < 30) {
            await safeAlert(`Notice Rejected: The notice period is only ${diffDays} days. A minimum of 30 days is required.`);
            return;
        }

        let warning = "";
        // Late Move-out Risk Warning (After 5th)
        if (end.getDate() > 5) {
            warning = "\n\nWARNING: Vacation date is after the 5th. Full month rent is now due. Deposit may be forfeited or deducted if rent remains unpaid.";
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
        await safeAlert(`Offboarding initiated for ${tenant.name}. Status set to 'Notice'.${warning}`);
    };

    const handleRevokeNotice = async (recordId: string, tenantId: string) => {
        if (!canEdit) {
            await safeAlert('You do not have permission to revoke notices.');
            return;
        }
        if (await safeConfirm("Are you sure you want to revoke the notice? The tenant will remain Active and the offboarding process will be cancelled.")) {
            updateOffboardingRecord(recordId, { status: 'Cancelled' } as any);
            // Restore main tenant
            updateTenant(tenantId, { status: 'Active', leaseEnd: undefined });
            // Restore any sub-tenants of a multi-occupancy unit that were also placed on Notice
            const mainTenant = tenants.find(t => t.id === tenantId);
            const subs = tenants.filter(t => t.mainTenantId === tenantId && t.status === 'Notice');
            subs.forEach(s => updateTenant(s.id, { status: 'Active', leaseEnd: undefined }));
            // Defensive: ensure the underlying unit is Occupied so it counts in
            // occupancy stats — multi-occupancy reversals sometimes leave the
            // unit flagged Vacant which drops the property below 100%.
            const anchor = mainTenant?.mainTenantId
                ? tenants.find(t => t.id === mainTenant.mainTenantId)
                : mainTenant;
            if (anchor?.propertyId && anchor?.unitId) {
                const property = properties.find(p => p.id === anchor.propertyId);
                if (property) {
                    const updatedUnits = property.units.map(u =>
                        u.id === anchor.unitId ? { ...u, status: 'Occupied' as const, tenantId: anchor.id } : u,
                    );
                    updateProperty(property.id, { units: updatedUnits });
                }
            }
            setSelectedRecordId(null);
            await safeAlert(`Notice revoked. ${subs.length > 0 ? `Main tenant and ${subs.length} sub-tenant(s) restored to Active.` : 'Tenant status restored to Active.'}`);
        }
    };

    const handleDeleteRecord = async (recordId: string, tenantId: string, status: string) => {
        if (!canEdit) {
            await safeAlert('You do not have permission to delete offboarding records.');
            return;
        }
        if (await safeConfirm("Are you sure you want to delete this offboarding record? If the tenant is still pending offboarding, their notice will be revoked.")) {
            deleteOffboardingRecord(recordId);
            
            if (status !== 'Completed' && status !== 'Cancelled') {
                // Restore main tenant
                updateTenant(tenantId, { status: 'Active', leaseEnd: undefined });
                
                // Restore any sub-tenants of a multi-occupancy unit that were also placed on Notice
                const mainTenant = tenants.find(t => t.id === tenantId);
                const subs = tenants.filter(t => t.mainTenantId === tenantId && t.status === 'Notice');
                subs.forEach(s => updateTenant(s.id, { status: 'Active', leaseEnd: undefined }));

                // Defensive: ensure the underlying unit is Occupied
                const anchor = mainTenant?.mainTenantId
                    ? tenants.find(t => t.id === mainTenant.mainTenantId)
                    : mainTenant;
                if (anchor?.propertyId && anchor?.unitId) {
                    const property = properties.find(p => p.id === anchor.propertyId);
                    if (property) {
                        const updatedUnits = property.units.map(u =>
                            u.id === anchor.unitId ? { ...u, status: 'Occupied' as const, tenantId: anchor.id } : u,
                        );
                        updateProperty(property.id, { units: updatedUnits });
                    }
                }
            }
        }
    };

    const handleFinalizeOffboarding = async (record: OffboardingRecord) => {
        // 1. Create financial record if refund due or owed
        if (record.finalBillAmount !== undefined) {
            if (record.finalBillAmount > 0) {
                // Positive amount = Refund Due to Tenant = Expense/Bill for Company
                const refundBill: Bill = {
                    id: `bill-ref-${Date.now()}`,
                    vendor: record.tenantName,
                    category: 'Deposit Refund', // Specific category for outbound mapping
                    amount: record.finalBillAmount,
                    invoiceDate: getTodayIsoDate(),
                    dueDate: getTodayIsoDate(),
                    status: 'Unpaid',
                    description: `Deposit Refund for ${record.unit}`,
                    propertyId: 'Agency', // Or specific property ID if available in record context
                    metadata: { grossAmount: 0, deductions: 0 } // To be populated if data available in record context
                };
                addBill(refundBill);
            } else if (record.finalBillAmount < 0) {
                // Negative amount = Tenant Owes Company (handled via existing arrears or new invoice logic, skipping here for simplicity)
                console.log("Tenant owes balance", Math.abs(record.finalBillAmount));
            }
        }

        // 2. Mark Tenant as Vacated and automatically convert them to an Affiliate
        const tenant = tenants.find(t => t.id === record.tenantId);
        
        updateTenant(record.tenantId, { 
            status: 'Vacated', 
            role: 'Affiliate',
            unitId: null as any,
            unit: '' as any,
            referralCode: tenant?.referralCode || `AFF-${record.tenantId.substring(0, 6).toUpperCase()}`
        });

        // 2b. If this was a main tenant, archive any sub-tenants attached to the same unit
        const subTenants = tenants.filter(t => t.mainTenantId === record.tenantId);
        subTenants.forEach(s => {
            updateTenant(s.id, {
                status: 'Vacated',
                unitId: null as any,
                unit: '' as any,
            } as any);
        });

        // 3. Free up the Unit — only when no active sub-tenants remain on it
        if (tenant && tenant.propertyId && tenant.unitId) {
            const remainingSubs = tenants.filter(t =>
                t.id !== record.tenantId
                && t.unitId === tenant.unitId
                && t.mainTenantId !== record.tenantId
                && t.status !== 'Vacated'
                && t.status !== 'Evicted'
            );
            if (remainingSubs.length === 0) {
                const property = properties.find(p => p.id === tenant.propertyId);
                if (property) {
                    const updatedUnits = property.units.map(u => 
                        u.id === tenant.unitId ? { ...u, status: 'Vacant' as const, tenantId: null as any } : u
                    );
                    updateProperty(property.id, { units: updatedUnits });
                }
            }
        }

        // 3b. Sync Affiliate role to Auth so they login directly to Affiliate Portal
        const targetUserId = tenant?.authUserId || tenant?.id;
        if (targetUserId) {
            (async () => {
                try {
                    const { data: roleData } = await supabase.schema('app').from('roles').select('id').eq('name', 'Affiliate').maybeSingle();
                    if (roleData?.id) {
                        await supabase.schema('app').from('user_roles').update({ role_id: roleData.id }).eq('user_id', targetUserId);
                    }
                } catch (e) {
                    console.error("Failed to update role in DB:", e);
                }
            })();
        }

        // 4. Complete Record
        updateOffboardingRecord(record.id, { status: 'Completed' });
        await safeAlert(`Offboarding finalized. ${subTenants.length ? `Main + ${subTenants.length} sub-tenant(s) archived.` : 'Tenant archived.'} ${record.finalBillAmount && record.finalBillAmount > 0 ? 'Deposit refund bill created in Payments.' : ''}`);
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Tenant Offboarding</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage move-outs, inspections, and deposit refunds.</p>
                </div>
                {canCreate && <button onClick={() => setIsStartModalOpen(true)} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm flex items-center">
                    Start Offboarding
                </button>}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
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
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Unit</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Notice Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Move Out</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{rec.tenantName}</td>
                                    <td className="px-4 py-3 text-gray-600">{rec.unit}</td>
                                    <td className="px-4 py-3 text-gray-600">{rec.noticeDate}</td>
                                    <td className="px-4 py-3 text-gray-600">{fmtDate(rec.moveOutDate)}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            rec.status === 'Completed' ? 'bg-gray-200 text-gray-700' : 
                                            rec.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {rec.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end items-center gap-3">
                                            {rec.status !== 'Cancelled' && (
                                                <button 
                                                    onClick={() => setSelectedRecordId(rec.id)}
                                                    className="text-primary hover:underline font-medium"
                                                >
                                                    Manage
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button onClick={() => handleDeleteRecord(rec.id, rec.tenantId, rec.status)} className="text-red-500 hover:text-red-700" title="Delete Offboarding Record">
                                                    <Icon name="trash" className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        {searchQuery ? 'No offboarding records match your search.' : 'No active offboarding processes.'}
                                    </td>
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
