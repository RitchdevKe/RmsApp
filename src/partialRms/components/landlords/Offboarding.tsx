// @ts-nocheck

import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { LandlordOffboardingRecord } from '@/types';
import Icon from '../Icon';
import { getTodayIsoDate } from '../../utils/timezone';

const ManageOffboardingModal: React.FC<{ 
    record: LandlordOffboardingRecord; 
    onClose: () => void; 
    onUpdate: (updatedRecord: LandlordOffboardingRecord) => void;
}> = ({ record, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'checklist' | 'documents' | 'financials' | 'completion'>('checklist');
    const [checklist, setChecklist] = useState(record.checklist || {
        tenantsNotified: false,
        legalNoticeDelivered: false,
        keysHandedOver: false,
        utilityTransferInitiated: false
    });
    const [financials, setFinancials] = useState(record.financials
        ? { ...record.financials,
            finalGrossRent: String(record.financials.finalGrossRent ?? ''),
            outstandingRepairs: String(record.financials.outstandingRepairs ?? ''),
            legalFees: String(record.financials.legalFees ?? ''),
            retainerRefund: String(record.financials.retainerRefund ?? ''),
            netPayout: record.financials.netPayout ?? 0 }
        : { finalGrossRent: '', outstandingRepairs: '', legalFees: '', retainerRefund: '', netPayout: 0 });
    const [documents, setDocuments] = useState(record.documents || []);

    // Calc Net Payout Effect
    React.useEffect(() => {
        const net = (parseFloat(String(financials.finalGrossRent)) || 0) + (parseFloat(String(financials.retainerRefund)) || 0) - (parseFloat(String(financials.outstandingRepairs)) || 0) - (parseFloat(String(financials.legalFees)) || 0);
        if (net !== financials.netPayout) {
            setFinancials(prev => ({ ...prev, netPayout: net }));
        }
    }, [financials.finalGrossRent, financials.outstandingRepairs, financials.legalFees, financials.retainerRefund]);

    const handleChecklistChange = (key: keyof typeof checklist) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleFinancialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFinancials(prev => ({ ...prev, [name]: value }));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setDocuments(prev => [...prev, { name: file.name, date: getTodayIsoDate() }]);
        }
    };

    const handleSave = () => {
        // Determine status based on progress
        let newStatus = record.status;
        const allChecklistDone = Object.values(checklist).every(Boolean);
        
        if (record.status === 'Notice Served' && checklist.tenantsNotified) newStatus = 'Handover in Progress';
        if (allChecklistDone && record.status === 'Handover in Progress') newStatus = 'Accounts Settled';
        
        onUpdate({
            ...record,
            checklist,
            financials: {
                ...financials,
                finalGrossRent: parseFloat(String(financials.finalGrossRent)) || 0,
                outstandingRepairs: parseFloat(String(financials.outstandingRepairs)) || 0,
                legalFees: parseFloat(String(financials.legalFees)) || 0,
                retainerRefund: parseFloat(String(financials.retainerRefund)) || 0,
            },
            documents,
            status: newStatus
        });
        alert("Offboarding progress saved.");
        onClose();
    };

    const handleTerminate = () => {
        if (!confirm("This will permanently terminate the contract and archive the landlord. Proceed?")) return;
        onUpdate({
            ...record,
            checklist,
            financials,
            documents,
            status: 'Contract Terminated'
        });
        onClose();
    };

    const handleDownloadStatement = () => {
        alert("Downloading Final Settlement Statement...");
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Offboarding: {record.landlordName}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                record.status === 'Contract Terminated' ? 'bg-gray-200 text-gray-700' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                                {record.status}
                            </span>
                            <span className="text-xs text-gray-500">Effective: {record.terminationDate}</span>
                        </div>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                    <button onClick={() => setActiveTab('checklist')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'checklist' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        1. Checklist
                    </button>
                    <button onClick={() => setActiveTab('documents')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'documents' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        2. Documents
                    </button>
                    <button onClick={() => setActiveTab('financials')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'financials' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        3. Financials
                    </button>
                    <button onClick={() => setActiveTab('completion')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'completion' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        4. Completion
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-grow">
                    {activeTab === 'checklist' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <h4 className="font-bold text-blue-800 mb-2 text-sm">Portfolio Overview</h4>
                                <p className="text-sm text-blue-700">
                                    Offboarding involves <strong>{record.propertyCount} properties</strong>. Ensure notice has been served to all tenants in these units.
                                </p>
                            </div>
                            
                            <div>
                                <h3 className="font-bold text-gray-800 mb-3">Operational Handover</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <label className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox" checked={checklist.legalNoticeDelivered} onChange={() => handleChecklistChange('legalNoticeDelivered')} className="h-5 w-5 text-primary rounded" />
                                        <span className="ml-3 text-gray-700">Legal Termination Notice Served</span>
                                    </label>
                                    <label className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox" checked={checklist.tenantsNotified} onChange={() => handleChecklistChange('tenantsNotified')} className="h-5 w-5 text-primary rounded" />
                                        <span className="ml-3 text-gray-700">All Tenants Notified of Change</span>
                                    </label>
                                    <label className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox" checked={checklist.utilityTransferInitiated} onChange={() => handleChecklistChange('utilityTransferInitiated')} className="h-5 w-5 text-primary rounded" />
                                        <span className="ml-3 text-gray-700">Utility Accounts Transferred</span>
                                    </label>
                                    <label className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox" checked={checklist.keysHandedOver} onChange={() => handleChecklistChange('keysHandedOver')} className="h-5 w-5 text-primary rounded" />
                                        <span className="ml-3 text-gray-700">Keys & Documents Handed Over</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'documents' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">Exit Documentation</h3>
                                <div className="relative">
                                    <input type="file" id="doc-upload" className="hidden" onChange={handleFileUpload} />
                                    <label htmlFor="doc-upload" className="cursor-pointer px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-semibold flex items-center">
                                        <Icon name="plus" className="w-4 h-4 mr-2" /> Upload Document
                                    </label>
                                </div>
                            </div>
                            
                            {documents.length > 0 ? (
                                <ul className="border rounded-lg divide-y">
                                    {documents.map((doc, idx) => (
                                        <li key={idx} className="p-3 flex justify-between items-center hover:bg-gray-50">
                                            <div className="flex items-center">
                                                <Icon name="stack" className="w-5 h-5 text-gray-400 mr-3" />
                                                <div>
                                                    <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                                                    <p className="text-xs text-gray-500">Uploaded: {doc.date}</p>
                                                </div>
                                            </div>
                                            <button className="text-primary hover:underline text-xs font-bold">View</button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-center py-10 border-2 border-dashed rounded-lg text-gray-400">
                                    <Icon name="stack" className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    <p>No documents uploaded.</p>
                                    <p className="text-xs mt-1">Upload Termination Agreement, Handover Sign-offs, etc.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'financials' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-blue-800">Final Settlement Calculator</h3>
                                    <button onClick={handleDownloadStatement} className="text-xs bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded hover:bg-blue-100">
                                        Download Statement
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-blue-600 mb-1">Final Gross Rent Collected</label>
                                        <input 
                                            type="number" 
                                            name="finalGrossRent" 
                                            value={financials.finalGrossRent} 
                                            onChange={handleFinancialChange} 
                                            className="w-full p-2 border rounded text-right" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-blue-600 mb-1">Retainer Refund (+)</label>
                                        <input 
                                            type="number" 
                                            name="retainerRefund" 
                                            value={financials.retainerRefund} 
                                            onChange={handleFinancialChange} 
                                            className="w-full p-2 border rounded text-right" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-red-600 mb-1">Outstanding Repairs (-)</label>
                                        <input 
                                            type="number" 
                                            name="outstandingRepairs" 
                                            value={financials.outstandingRepairs} 
                                            onChange={handleFinancialChange} 
                                            className="w-full p-2 border rounded text-right border-red-200" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-red-600 mb-1">Legal / Exit Fees (-)</label>
                                        <input 
                                            type="number" 
                                            name="legalFees" 
                                            value={financials.legalFees} 
                                            onChange={handleFinancialChange} 
                                            className="w-full p-2 border rounded text-right border-red-200" 
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-blue-200 flex justify-between items-center">
                                    <span className="font-bold text-blue-900">Net Final Payout</span>
                                    <span className="text-2xl font-bold text-blue-900">KES {Number(financials.netPayout ?? 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'completion' && (
                        <div className="space-y-6 text-center py-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icon name="offboarding" className="w-8 h-8 text-gray-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">Ready to Terminate?</h3>
                            <p className="text-gray-600 text-sm max-w-md mx-auto">
                                Ensure all checklists are complete, documents uploaded, and the final financial settlement of 
                                <strong> KES {Number(financials.netPayout ?? 0).toLocaleString()}</strong> has been disbursed or approved.
                            </p>
                            
                            <div className="flex flex-col gap-3 mt-6 max-w-xs mx-auto">
                                <button 
                                    onClick={handleSave}
                                    className="w-full py-2 bg-gray-200 text-gray-800 font-bold rounded-lg hover:bg-gray-300"
                                >
                                    Save Progress & Exit
                                </button>
                                <button 
                                    onClick={handleTerminate}
                                    className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg"
                                >
                                    Finalize Termination
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {activeTab !== 'completion' && (
                    <div className="p-4 border-t border-gray-100 flex justify-end">
                        <button 
                            onClick={handleSave} 
                            className="px-6 py-2 bg-primary text-white font-bold rounded-md hover:bg-primary-dark"
                        >
                            Save Progress
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const TerminateContractModal: React.FC<{ onClose: () => void; onConfirm: (record: LandlordOffboardingRecord) => void }> = ({ onClose, onConfirm }) => {
    const { landlords, properties } = useData();
    const [selectedLandlordId, setSelectedLandlordId] = useState('');
    const [reason, setReason] = useState('');
    const [date, setDate] = useState('');

    const handleSubmit = () => {
        if (!selectedLandlordId || !reason || !date) return alert("All fields required");
        const landlord = landlords.find(l => l.id === selectedLandlordId);
        if (!landlord) return;
        const realPropertyCount = properties.filter(p => p.landlordId === selectedLandlordId).length;

        const newRecord: LandlordOffboardingRecord = {
            id: `off-l-${Date.now()}`,
            landlordId: selectedLandlordId,
            landlordName: landlord.name,
            propertyCount: realPropertyCount,
            reason,
            status: 'Notice Served',
            terminationDate: date,
            checklist: { tenantsNotified: false, legalNoticeDelivered: false, keysHandedOver: false, utilityTransferInitiated: false },
            financials: { finalGrossRent: 0, outstandingRepairs: 0, legalFees: 0, retainerRefund: 0, netPayout: 0 },
            documents: []
        };
        onConfirm(newRecord);
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                <h2 className="text-xl font-bold mb-4 text-red-700">Terminate Landlord Contract</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Landlord</label>
                        <select value={selectedLandlordId} onChange={e => setSelectedLandlordId(e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">Choose...</option>
                            {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Termination</label>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full p-2 border rounded" rows={3} placeholder="e.g. Selling property, Switching agency..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700">Terminate</button>
                </div>
            </div>
        </div>
    );
};

const LandlordOffboarding: React.FC = () => {
    const { landlordOffboardingRecords, addLandlordOffboardingRecord, updateLandlordOffboardingRecord, deleteLandlordOffboardingRecord, checkPermission, currentUser, isDataLoading } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [managingRecord, setManagingRecord] = useState<LandlordOffboardingRecord | null>(null);

    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Landlords', 'create');
    const canEdit = isSuperAdmin || checkPermission('Landlords', 'edit');
    const canDelete = isSuperAdmin || checkPermission('Landlords', 'delete');

    const records = landlordOffboardingRecords;

    const handleTerminate = (record: LandlordOffboardingRecord) => {
        if (!canCreate) return alert('You do not have permission to initiate offboarding.');
        addLandlordOffboardingRecord(record);
        setIsModalOpen(false);
    };

    const handleUpdateRecord = (updated: LandlordOffboardingRecord) => {
        if (!canEdit) return alert('You do not have permission to update offboarding records.');
        updateLandlordOffboardingRecord(updated.id, updated);
        setManagingRecord(null);
    };

    const handleDeleteRecord = (id: string) => {
        if (!canDelete) return alert('You do not have permission to delete offboarding records.');
        if (!window.confirm('Remove this offboarding record?')) return;
        deleteLandlordOffboardingRecord(id);
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'Contract Terminated': return 'bg-gray-200 text-gray-700';
            case 'Accounts Settled': return 'bg-green-100 text-green-800';
            case 'Handover in Progress': return 'bg-blue-100 text-blue-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/landlords/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
            </button>
            
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Landlord Offboarding</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage contract terminations and property handovers.</p>
                </div>
                {canCreate && <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-red-600 text-white font-semibold rounded-md shadow-sm hover:bg-red-700 flex items-center">
                    <Icon name="close" className="w-4 h-4 mr-2" />
                    Terminate Contract
                </button>}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Landlord</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Reason</th>
                                <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Props</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Effective Date</th>
                                <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {records.map(r => (
                                <tr key={r.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{r.landlordName}</td>
                                    <td className="px-6 py-4 text-gray-600">{r.reason}</td>
                                    <td className="px-6 py-4 text-center text-gray-600">{r.propertyCount}</td>
                                    <td className="px-6 py-4 text-gray-600">{r.terminationDate}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(r.status)}`}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {r.status !== 'Contract Terminated' && canEdit && (
                                                <button
                                                    onClick={() => setManagingRecord(r)}
                                                    className="text-blue-600 hover:underline font-medium text-xs flex items-center"
                                                >
                                                    Manage <Icon name="settings" className="w-3 h-3 ml-1" />
                                                </button>
                                            )}
                                            {r.status === 'Contract Terminated' && <span className="text-gray-400 text-xs">Archived</span>}
                                            {canDelete && <button
                                                onClick={() => handleDeleteRecord(r.id)}
                                                className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                                                title="Remove record"
                                            >
                                                <Icon name="close" className="w-3.5 h-3.5" />
                                            </button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {isDataLoading && records.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex items-center justify-center gap-2 text-gray-400">
                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                            Loading offboarding records...
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!isDataLoading && records.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No active offboarding requests.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && <TerminateContractModal onClose={() => setIsModalOpen(false)} onConfirm={handleTerminate} />}
            
            {managingRecord && (
                <ManageOffboardingModal 
                    record={managingRecord} 
                    onClose={() => setManagingRecord(null)} 
                    onUpdate={handleUpdateRecord} 
                />
            )}
        </div>
    );
};

export default LandlordOffboarding;
