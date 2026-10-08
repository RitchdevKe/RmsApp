
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { DeductionRule, User, Property, Bill, TaskStatus, Invoice } from '../../types';
import Icon from '../Icon';
import { exportToCSV } from '../../utils/exportHelper';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// --- TYPES ---
type TabType = 'properties' | 'global_rules' | 'bills' | 'history';

// --- SUB-COMPONENTS ---

// 1. Deduction Rule Form Modal
const DeductionFormModal: React.FC<{
    rule?: DeductionRule | null;
    property?: Property | null; // If adding to a specific property directly
    onClose: () => void;
    onSave: (rule: DeductionRule) => void;
    landlords: User[];
    properties: Property[];
}> = ({ rule, property, onClose, onSave, landlords, properties }) => {
    const [formData, setFormData] = useState<Partial<DeductionRule>>(rule || {
        name: '',
        type: 'Percentage',
        value: '' as any,
        frequency: 'Monthly',
        applicability: property ? 'Specific Property' : 'Global',
        targetId: property ? property.id : '',
        status: 'Active',
        description: '',
        date: new Date().toISOString().substring(0, 7)
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsedValue = parseFloat(String(formData.value ?? ''));
        if (!formData.name || isNaN(parsedValue)) {
            alert('Name and Value are required.');
            return;
        }
        onSave({ ...formData, value: parsedValue, id: rule?.id || `ded-${Date.now()}` } as DeductionRule);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800">{rule ? 'Edit Recurrent Deduction' : 'New Recurrent Deduction'}</h2>
                {property && <p className="text-sm text-gray-500 mb-4">Adding deduction for: <strong>{property.name}</strong></p>}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deduction Name</label>
                        <input name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded bg-white" placeholder="e.g. Management Fee" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select name="type" value={formData.type} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                <option value="Percentage">Percentage (%)</option>
                                <option value="Fixed">Fixed Amount</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                            <input type="number" name="value" value={formData.value} onChange={handleChange} className="w-full p-2 border rounded bg-white" placeholder="0" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                        <select name="frequency" value={formData.frequency} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="Monthly">Monthly</option>
                            <option value="Yearly">Yearly</option>
                            <option value="One-Off">One-Off</option>
                        </select>
                    </div>
                    {formData.frequency === 'One-Off' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Effective Month</label>
                            <input type="month" name="date" value={formData.date || ''} onChange={handleChange} className="w-full p-2 border rounded bg-white" />
                        </div>
                    )}
                    
                    {/* If accessed via a specific property, lock applicability to that property */}
                    {property ? (
                        <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 border border-blue-100">
                            <p><strong>Scope:</strong> Specific Property ({property.name})</p>
                            <p className="text-xs mt-1 text-blue-600">This deduction will apply ONLY to this property.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Applicability</label>
                                <select name="applicability" value={formData.applicability} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                    <option value="Global">Global (All Landlords)</option>
                                    <option value="Specific Landlord">Specific Landlord</option>
                                    <option value="Specific Property">Specific Property</option>
                                </select>
                            </div>

                            {/* Dynamic Target Selection */}
                            {formData.applicability === 'Specific Landlord' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Landlord</label>
                                    <select name="targetId" value={formData.targetId || ''} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                        <option value="">Select...</option>
                                        {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {formData.applicability === 'Specific Property' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Property</label>
                                    <select name="targetId" value={formData.targetId || ''} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                        <option value="">Select...</option>
                                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                        <textarea name="description" value={formData.description || ''} onChange={handleChange} className="w-full p-2 border rounded bg-white" rows={2} />
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white font-semibold rounded hover:bg-primary-dark">Save Deduction</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// 2. Manual Bill Entry Modal
const RecordBillModal: React.FC<{
    bill?: Bill | null;
    onClose: () => void;
    onSave: (bill: Partial<Bill>, generateInvoice: boolean) => void;
    properties: Property[];
}> = ({ bill, onClose, onSave, properties }) => {
    const [formData, setFormData] = useState<Partial<Bill>>({
        vendor: '',
        category: 'Water',
        invoiceDate: getTodayIsoDate(),
        dueDate: '',
        amount: undefined,
        propertyId: '',
        status: 'Unpaid',
    });
    const [generateInvoice, setGenerateInvoice] = useState(false);

    useEffect(() => {
        if (bill) {
            setFormData(bill);
        } else {
            // Reset if creating new
            setFormData({
                vendor: '',
                category: 'Water',
                invoiceDate: getTodayIsoDate(),
                dueDate: '',
                amount: undefined,
                propertyId: '',
                status: 'Unpaid',
            });
        }
    }, [bill]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };

    const handleSubmit = () => {
        if (!formData.vendor || !formData.amount || !formData.propertyId) {
            alert('Vendor, Amount, and Property are required.');
            return;
        }
        onSave(formData, generateInvoice);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 text-gray-800">{bill ? 'Edit Bill' : 'Record Variable Bill'}</h2>
                
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Select Property*</label>
                        <select name="propertyId" value={formData.propertyId} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="">Choose Property...</option>
                            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Bill Category</label>
                        <select name="category" value={formData.category} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="Water">Water</option>
                            <option value="Electricity">Electricity</option>
                            <option value="Garbage">Garbage Collection</option>
                            <option value="Gas">Gas</option>
                            <option value="Service Charge">Service Charge</option>
                            <option value="Cleaning service">Cleaning service</option>
                            <option value="Security service">Security service</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Renovation Repayment">Renovation Repayment</option>
                            <option value="Grass cutting">Grass cutting</option>
                            <option value="MRI">MRI</option>
                            <option value="MRI filing Fee">MRI filing Fee</option>
                            <option value="Other">Other</option>
                        </select>

                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vendor / Payee*</label>
                        <input name="vendor" value={formData.vendor} onChange={handleChange} placeholder="e.g. Nairobi Water" className="w-full p-2 border rounded" />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount (KES)*</label>
                        <input name="amount" type="number" value={formData.amount || ''} onChange={handleChange} placeholder="Amount" className="w-full p-2 border rounded" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-gray-500">Invoice Date</label>
                            <input name="invoiceDate" type="date" value={formData.invoiceDate} onChange={handleChange} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Due Date</label>
                            <input name="dueDate" type="date" value={formData.dueDate} onChange={handleChange} className="w-full p-2 border rounded" />
                        </div>
                    </div>

                    {bill && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                <option value="Unpaid">Unpaid / Due</option>
                                <option value="Initiated">Initiated</option>
                                <option value="Under Review">Under Review</option>
                                <option value="Paid">Paid</option>
                                <option value="Overdue">Overdue</option>
                            </select>
                        </div>
                    )}

                    {!bill && (
                        <div className="mt-2 pt-2 border-t">
                            <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={generateInvoice} 
                                    onChange={(e) => setGenerateInvoice(e.target.checked)} 
                                    className="h-4 w-4 text-primary rounded"
                                />
                                <span>Generate Inbound Invoice (Payable)</span>
                            </label>
                            <p className="text-xs text-gray-500 ml-6 mt-1">Automatically add to Payments &gt; Invoices</p>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark shadow-sm">{bill ? 'Update Bill' : 'Save Bill'}</button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const Deductions: React.FC = () => {
    const {
        deductionRules, addDeductionRule, updateDeductionRule, deleteDeductionRule,
        landlords, properties, tenants,
        tasks, bills, addBill, updateBill, deleteBill, addInvoice,
        checkPermission, currentUser
    } = useData();

    const [activeTab, setActiveTab] = useState<TabType>('properties');
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [isBillModalOpen, setIsBillModalOpen] = useState(false);

    const [editingRule, setEditingRule] = useState<DeductionRule | null>(null);
    const [editingBill, setEditingBill] = useState<Bill | null>(null);
    const [selectedPropertyForRule, setSelectedPropertyForRule] = useState<Property | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // State for expanding property cards in list
    const [expandedProperties, setExpandedProperties] = useState<Record<string, boolean>>({});

    const [confirmingRuleId, setConfirmingRuleId] = useState<string | null>(null);
    const [confirmingBillId, setConfirmingBillId] = useState<string | null>(null);

    // History Filter State
    const [historyMonth, setHistoryMonth] = useState(getCurrentMonthIso()); // "YYYY-MM"
    const [historyProperty, setHistoryProperty] = useState('All');

    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreateRule = isSuperAdmin || checkPermission('Landlords', 'create');
    const canEditRule = isSuperAdmin || checkPermission('Landlords', 'edit');
    const canDeleteRule = isSuperAdmin || checkPermission('Landlords', 'delete');

    const handleBack = () => {
        window.location.hash = '#/landlords/overview';
    };

    // --- Rule Management ---
    const handleAddRule = (prop?: Property) => {
        if (!canCreateRule) return alert('You do not have permission to create deduction rules.');
        setEditingRule(null);
        setSelectedPropertyForRule(prop || null);
        setIsRuleModalOpen(true);
    };

    const handleEditRule = (rule: DeductionRule) => {
        if (!canEditRule) return alert('You do not have permission to edit deduction rules.');
        setEditingRule(rule);
        // Find target property if specific, just for context
        if (rule.applicability === 'Specific Property') {
            const prop = properties.find(p => p.id === rule.targetId);
            setSelectedPropertyForRule(prop || null);
        } else {
            setSelectedPropertyForRule(null);
        }
        setIsRuleModalOpen(true);
    };

    const handleSaveRule = (rule: DeductionRule) => {
        if (editingRule && !canEditRule) return alert('You do not have permission to edit deduction rules.');
        if (!editingRule && !canCreateRule) return alert('You do not have permission to create deduction rules.');
        if (editingRule) {
            updateDeductionRule(rule.id, rule);
        } else {
            addDeductionRule(rule);
        }
        setIsRuleModalOpen(false);
    };

    const handleDeleteRule = (id: string) => {
        if (!canDeleteRule) return alert('You do not have permission to delete deduction rules.');
        setConfirmingRuleId(id);
    };

    // --- Bill Management ---
    const handleAddBill = () => {
        setEditingBill(null);
        setIsBillModalOpen(true);
    };

    const handleEditBill = (bill: Bill) => {
        setEditingBill(bill);
        setIsBillModalOpen(true);
    };

    const handleSaveBill = (billData: Partial<Bill>, generateInvoice: boolean) => {
        if (editingBill) {
            // Update Mode
            const updatedBill = { ...editingBill, ...billData };
            updateBill(editingBill.id, updatedBill);
            alert("Bill updated successfully!");
        } else {
            // Create Mode
            const newBill: Bill = {
                id: `bill-${Date.now()}`,
                status: new Date(billData.dueDate || '') < new Date() ? 'Overdue' : 'Unpaid',
                ...billData
            } as Bill;
            
            addBill(newBill);

            if (generateInvoice) {
                const invoice: Invoice = {
                    id: `inv-auto-${Date.now()}`,
                    invoiceNumber: `BILL-INV-${Date.now().toString().slice(-6)}`,
                    category: 'Inbound',
                    tenantName: newBill.vendor, // Using vendor as tenant/payee name
                    amount: newBill.amount,
                    dueDate: newBill.dueDate,
                    status: 'Due',
                    items: [{
                        description: `${newBill.category} Bill for ${properties.find(p => p.id === newBill.propertyId)?.name || 'Property'}`,
                        amount: newBill.amount,
                        quantity: 1,
                        unitPrice: newBill.amount
                    }]
                };
                addInvoice(invoice);
                alert("Bill saved and Invoice generated successfully!");
            } else {
                alert("Bill saved successfully!");
            }
        }

        setIsBillModalOpen(false);
    };

    const handleDeleteBill = (id: string) => {
        setConfirmingBillId(id);
    };

    const togglePropertyExpand = (id: string) => {
        setExpandedProperties(prev => ({...prev, [id]: !prev[id]}));
    };

    // --- DERIVED DATA ---

    // 1. Properties with their specific rules
    const propertiesWithRules = useMemo(() => {
        return properties
            .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
            .map(p => {
                const applicableRules = deductionRules.filter(r =>
                    r.applicability === 'Global' ||
                    (r.applicability === 'Specific Property' && r.targetId === p.id) ||
                    (r.applicability === 'Specific Landlord' && r.targetId === p.landlordId)
                );
                const landlordName = landlords.find(l => l.id === p.landlordId)?.name || 'Unknown';
                return { ...p, landlordName, activeRules: applicableRules };
            });
    }, [properties, deductionRules, landlords, searchQuery]);

    // 2. Combined list of Manual Bills and Maintenance Tasks
    const variableBills = useMemo(() => {
        const allItems: any[] = [];

        // Manual Bills
        bills.forEach(b => {
            const prop = properties.find(p => p.id === b.propertyId);
            if (prop?.name.toLowerCase().includes(searchQuery.toLowerCase()) || !searchQuery) {
                allItems.push({
                    id: b.id,
                    date: b.invoiceDate,
                    property: prop?.name || 'Unknown',
                    type: b.category,
                    description: `Bill: ${b.vendor}`,
                    amount: b.amount,
                    status: b.status,
                    source: 'Manual',
                    originalBill: b
                });
            }
        });

        // Automated Maintenance Bills
        tasks.filter(t => (t.status === TaskStatus.Completed || t.status === TaskStatus.Closed) && t.costs).forEach(t => {
            if (t.property.toLowerCase().includes(searchQuery.toLowerCase()) || !searchQuery) {
                const totalCost = (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
                if (totalCost > 0) {
                    allItems.push({
                        id: `task-bill-${t.id}`,
                        date: new Date(t.dueDate).toISOString().split('T')[0], // Using due date as completion proxy for list
                        property: t.property,
                        type: 'Maintenance',
                        description: `Task: ${t.title}`,
                        amount: totalCost,
                        status: 'Deducted', // Assumed deducted for completed tasks
                        source: 'Automatic'
                    });
                }
            }
        });

        return allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [bills, tasks, properties, searchQuery]);

    // 3. History Data Generation
    const historyData = useMemo(() => {
        // Since we don't have a backend with historical records, we simulate history 
        // by calculating what the deductions *would* be for the selected month/property
        // based on current rules.
        
        const selectedPropList = historyProperty === 'All' 
            ? properties 
            : properties.filter(p => p.name === historyProperty);

        let historyEntries: any[] = [];

        selectedPropList.forEach(prop => {
            // Calculate meaningful gross rent for this property for percentage calc
            // In a real scenario, this would be looking at actual collections for the specific month `historyMonth`
            // Here we use current active tenants as a proxy for the selected month
            const propGrossRent = tenants
                .filter(t => t.propertyId === prop.id && t.status === 'Active')
                .reduce((sum, t) => sum + t.rentAmount, 0);

            // 1. Rules (Recurrent Deductions)
            const rules = deductionRules.filter(r => 
                r.applicability === 'Global' || 
                (r.applicability === 'Specific Property' && r.targetId === prop.id) ||
                (r.applicability === 'Specific Landlord' && r.targetId === prop.landlordId)
            );

            rules.forEach(r => {
                historyEntries.push({
                    id: `hist-rule-${r.id}-${prop.id}`,
                    month: historyMonth,
                    property: prop.name,
                    item: r.name,
                    type: r.type,
                    value: r.value,
                    // Real calculation based on property gross rent
                    calculatedAmount: r.type === 'Percentage' ? (propGrossRent * (r.value / 100)) : r.value, 
                    status: 'Applied',
                    sourceType: 'Recurrent Deduction' // Renamed from Recurring Rule
                });
            });

            // 2. Bills (Filtered by month)
            bills.filter(b => b.propertyId === prop.id && b.invoiceDate.startsWith(historyMonth)).forEach(b => {
                historyEntries.push({
                    id: `hist-bill-${b.id}`,
                    month: historyMonth,
                    property: prop.name,
                    item: `${b.category}: ${b.vendor}`,
                    type: 'Bill',
                    value: b.amount,
                    calculatedAmount: b.amount,
                    status: b.status,
                    sourceType: 'Variable Bill'
                });
            });
        });

        return historyEntries;
    }, [historyMonth, historyProperty, properties, deductionRules, bills, tenants]);

    const handleExportHistory = () => {
        if (historyData.length === 0) {
            alert("No data to export.");
            return;
        }
        const exportData = historyData.map(h => ({
            Period: h.month,
            Property: h.property,
            Source: h.sourceType,
            Deduction: h.item,
            Type: h.type,
            Basis: h.type === 'Percentage' ? `${h.value}%` : 'Fixed',
            Amount: h.calculatedAmount,
            Status: h.status
        }));
        exportToCSV(exportData, `Deductions_History_${historyMonth}`);
    };

    const getStatusBadgeColor = (status: string) => {
        switch (status) {
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Initiated': return 'bg-blue-100 text-blue-800';
            case 'Under Review': return 'bg-yellow-100 text-yellow-800';
            case 'Overdue': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };


    return (
        <div className="space-y-8">
            <button onClick={handleBack} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
            </button>
            
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Landlord Deductions & Bills</h1>
                    <p className="text-lg text-gray-500 mt-1">Configure specific deductions per property and manage variable bills.</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm min-h-[600px]">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('properties')}
                        className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'properties' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Property Deductions
                    </button>
                    <button 
                        onClick={() => setActiveTab('global_rules')}
                        className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'global_rules' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Global Deductions
                    </button>
                    <button 
                        onClick={() => setActiveTab('bills')}
                        className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'bills' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Bills & Maintenance
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Deduction History
                    </button>
                </div>

                {/* Search Bar */}
                {activeTab !== 'history' && (
                    <div className="flex justify-between items-center mb-4">
                        <div className="relative w-full max-w-sm">
                            <input 
                                type="text" 
                                placeholder={`Search ${activeTab === 'properties' ? 'properties' : activeTab === 'global_rules' ? 'global deductions' : 'bills'}...`} 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary"
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400">
                                <Icon name="search" className="w-5 h-5" />
                            </div>
                        </div>
                        {activeTab === 'bills' && (
                            <button onClick={handleAddBill} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-md hover:bg-primary-dark shadow-sm flex items-center">
                                <Icon name="plus" className="w-4 h-4 mr-2" /> Record Bill
                            </button>
                        )}
                        {(activeTab === 'properties' || activeTab === 'global_rules') && canCreateRule && (
                             <button onClick={() => handleAddRule()} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-200 shadow-sm flex items-center">
                                <Icon name="plus" className="w-4 h-4 mr-2" /> Global Recurrent Deduction
                            </button>
                        )}
                    </div>
                )}

                {/* VIEW: GLOBAL DEDUCTIONS */}
                {activeTab === 'global_rules' && (
                    <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50/75">
                                    <tr>
                                        <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Deduction Name</th>
                                        <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Type</th>
                                        <th className="px-6 py-4 text-right font-bold text-gray-500 uppercase tracking-wider text-xs">Value</th>
                                        <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Frequency</th>
                                        <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Description</th>
                                        <th className="px-6 py-4 text-right font-bold text-gray-500 uppercase tracking-wider text-xs">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {deductionRules
                                        .filter(r => r.applicability === 'Global' && r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map(rule => (
                                            <tr key={rule.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-gray-800 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                    {rule.name}
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 font-medium">{rule.type}</td>
                                                <td className="px-6 py-4 text-right font-black text-red-600">
                                                    {rule.type === 'Percentage' ? `${rule.value}%` : `KES ${rule.value.toLocaleString()}`}
                                                </td>
                                                <td className="px-6 py-4 text-gray-600">{rule.frequency}</td>
                                                <td className="px-6 py-4 text-gray-500 max-w-xs truncate">{rule.description || '-'}</td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <div className="flex justify-end gap-3 font-semibold">
                                                        {confirmingRuleId === rule.id ? (
                                                            <div className="flex items-center gap-2">
                                                                <button 
                                                                    onClick={() => {
                                                                        deleteDeductionRule(rule.id);
                                                                        setConfirmingRuleId(null);
                                                                    }}
                                                                    className="text-xs bg-red-600 text-white font-bold px-2 py-1 rounded hover:bg-red-700 shadow-sm"
                                                                >
                                                                    Confirm
                                                                </button>
                                                                <button 
                                                                    onClick={() => setConfirmingRuleId(null)}
                                                                    className="text-xs text-gray-500 hover:underline"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {canEditRule && (
                                                                    <button 
                                                                        onClick={() => handleEditRule(rule)} 
                                                                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                )}
                                                                {canDeleteRule && (
                                                                    <button 
                                                                        onClick={() => handleDeleteRule(rule.id)} 
                                                                        className="text-xs text-red-600 hover:text-red-800 hover:underline"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    {deductionRules.filter(r => r.applicability === 'Global').length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">No global recurrent deductions configured.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* VIEW: PROPERTIES & RULES */}
                {activeTab === 'properties' && (
                    <div className="space-y-4">
                        {propertiesWithRules.map(prop => {
                            const remittanceBadgeColor = prop.remittanceType === 'Occupancy Based' 
                                ? 'bg-purple-100 text-purple-800 border-purple-200' 
                                : 'bg-green-100 text-green-800 border-green-200';

                            return (
                                <div key={prop.id} className="border border-gray-200 rounded-lg bg-white">
                                    <div 
                                        className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => togglePropertyExpand(prop.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                                                <Icon name="branch" className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                                    {prop.name}
                                                    <span className={`text-[10px] px-2 py-0.5 rounded border ${remittanceBadgeColor} uppercase tracking-wide font-bold`}>
                                                        {prop.remittanceType || 'Collection Based'}
                                                    </span>
                                                </h3>
                                                <p className="text-xs text-gray-500">Landlord: {prop.landlordName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm text-gray-600">{prop.activeRules.length} Active Deductions</span>
                                            <Icon name={expandedProperties[prop.id] ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-gray-400" />
                                        </div>
                                    </div>
                                    
                                    {expandedProperties[prop.id] && (
                                        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                                            <div className="flex justify-between items-center mb-3">
                                                <h4 className="text-xs font-bold text-gray-500 uppercase">Active Recurrent Deductions</h4>
                                                {canCreateRule && <button
                                                    onClick={(e) => { e.stopPropagation(); handleAddRule(prop); }}
                                                    className="text-xs text-primary font-bold hover:underline flex items-center"
                                                >
                                                    + Add Recurrent Deduction
                                                </button>}
                                            </div>
                                            
                                            {prop.activeRules.length > 0 ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {prop.activeRules.map(rule => (
                                                        <div key={rule.id} className={`flex justify-between items-center p-3 bg-white border rounded shadow-sm ${rule.applicability === 'Global' ? 'border-gray-200 border-l-4 border-l-gray-300' : 'border-blue-200 border-l-4 border-l-blue-500'}`}>
                                                            <div>
                                                                <p className="font-semibold text-sm text-gray-800">{rule.name}</p>
                                                                <p className="text-xs text-gray-500">
                                                                    {rule.applicability === 'Global' ? 'Global' : 'Property Specific'} • {rule.frequency}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-bold text-sm text-red-600">
                                                                    {rule.type === 'Percentage' ? `${rule.value}%` : `KES ${rule.value.toLocaleString()}`}
                                                                </p>
                                                                <div className="flex gap-2 justify-end items-center mt-1">
                                                                    {confirmingRuleId === rule.id ? (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <button 
                                                                                onClick={() => {
                                                                                    deleteDeductionRule(rule.id);
                                                                                    setConfirmingRuleId(null);
                                                                                }}
                                                                                className="text-[10px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded shadow-sm hover:bg-red-700"
                                                                            >
                                                                                Confirm
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => setConfirmingRuleId(null)}
                                                                                className="text-[10px] text-gray-500 hover:underline"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            {canEditRule && <button onClick={() => handleEditRule(rule)} className="text-[10px] text-blue-600 hover:underline">Edit</button>}
                                                                            {canDeleteRule && <button onClick={() => handleDeleteRule(rule.id)} className="text-[10px] text-red-600 hover:underline">Remove</button>}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-400 italic">No recurrent deductions configured.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {propertiesWithRules.length === 0 && <p className="text-center text-gray-500 py-8">No properties found.</p>}
                    </div>
                )}

                {/* VIEW: BILLS & MAINTENANCE */}
                {activeTab === 'bills' && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Description</th>
                                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Amount</th>
                                    <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {variableBills.map(bill => (
                                    <tr key={bill.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">{bill.date}</td>
                                        <td className="px-6 py-4 font-medium text-gray-800">{bill.property}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${bill.type === 'Maintenance' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {bill.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{bill.description}</td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600">KES {bill.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${getStatusBadgeColor(bill.status)}`}>
                                                {bill.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {bill.source === 'Manual' && (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleEditBill(bill.originalBill)} className="text-blue-600 hover:text-blue-800">
                                                        <Icon name="settings" className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteBill(bill.id)} className="text-red-500 hover:text-red-700">
                                                        <Icon name="close" className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {variableBills.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No variable bills found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VIEW: HISTORY */}
                {activeTab === 'history' && (
                    <div className="animate-fade-in">
                        {/* History Filters */}
                        <div className="flex gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filter by Month</label>
                                <input 
                                    type="month" 
                                    value={historyMonth} 
                                    onChange={(e) => setHistoryMonth(e.target.value)}
                                    className="p-2 border rounded bg-white shadow-sm w-48"
                                />
                            </div>
                            <div className="flex-grow">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filter by Property</label>
                                <select 
                                    value={historyProperty} 
                                    onChange={(e) => setHistoryProperty(e.target.value)} 
                                    className="p-2 border rounded bg-white shadow-sm w-full max-w-md"
                                >
                                    <option value="All">All Properties</option>
                                    {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="self-end">
                                <button onClick={handleExportHistory} className="flex items-center px-4 py-2 bg-gray-200 text-gray-800 font-bold rounded hover:bg-gray-300">
                                    <Icon name="download" className="w-4 h-4 mr-2" /> Download Statement
                                </button>
                            </div>
                        </div>

                        {/* History Table */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Source</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Item / Description</th>
                                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Type</th>
                                        <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase">Value / %</th>
                                        <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase">Applied Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {historyData.map(row => (
                                        <tr key={row.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-800">{row.property}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">{row.sourceType}</td>
                                            <td className="px-4 py-3 text-gray-600">{row.item}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-1 rounded ${row.type === 'Bill' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>{row.type}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-600">
                                                {row.type === 'Percentage' ? `${row.value}%` : `KES ${row.value.toLocaleString()}`}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-red-600">
                                                - KES {row.calculatedAmount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {historyData.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No deductions found for this period.</td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-gray-50">
                                    <tr>
                                        <td colSpan={5} className="px-4 py-3 text-right font-bold text-gray-700 uppercase">Total Deductions</td>
                                        <td className="px-4 py-3 text-right font-extrabold text-red-700">
                                            KES {historyData.reduce((sum, r) => sum + r.calculatedAmount, 0).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* MODALS */}
            {isRuleModalOpen && (
                <DeductionFormModal 
                    rule={editingRule} 
                    property={selectedPropertyForRule}
                    onClose={() => setIsRuleModalOpen(false)} 
                    onSave={handleSaveRule} 
                    landlords={landlords}
                    properties={properties}
                />
            )}

            {isBillModalOpen && (
                <RecordBillModal 
                    bill={editingBill}
                    onClose={() => setIsBillModalOpen(false)} 
                    onSave={handleSaveBill} 
                    properties={properties}
                />
            )}
        </div>
    );
};

export default Deductions;
