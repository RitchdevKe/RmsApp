
import React, { useState, useMemo } from 'react';
import { Invoice } from '../../types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

// --- INBOUND INVOICE MODAL (Upload Bill) ---
const UploadInboundInvoiceModal: React.FC<{ initialInvoice?: Invoice | null; onClose: () => void; onSave: (invoice: Invoice) => void; }> = ({ initialInvoice, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        vendorName: initialInvoice?.tenantName || '',
        reference: initialInvoice?.invoiceNumber || '', // Invoice Number
        dueDate: initialInvoice?.dueDate || '',
        items: initialInvoice?.items?.map(i => ({
            description: i.description,
            quantity: i.quantity || '' as any,
            unitPrice: i.unitPrice || '' as any,
            amount: i.amount
        })) || [{ description: '', quantity: '' as any, unitPrice: '' as any, amount: 0 }]
    });
    const [file, setFile] = useState<File | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...formData.items];
        (newItems[index] as any)[field] = value;
        
        // Auto-calculate total for the item
        if(field === 'quantity' || field === 'unitPrice') {
             newItems[index].amount = (newItems[index].quantity || 0) * (newItems[index].unitPrice || 0);
        }
        
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setFormData(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: '' as any, unitPrice: '' as any, amount: 0 }] }));
    };

    const removeItem = (index: number) => {
        if (formData.items.length > 1) {
            setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFile(e.target.files[0]);
    };

    const totalAmount = formData.items.reduce((sum, item) => sum + item.amount, 0);

    const handleSubmit = () => {
        if (!formData.vendorName || !formData.dueDate || totalAmount <= 0) {
            alert('Vendor Name, Due Date and at least one item with valid amount are required.');
            return;
        }
        const newInvoice: Invoice = {
            id: initialInvoice?.id || `inv-in-${Date.now()}`,
            invoiceNumber: formData.reference || (initialInvoice?.invoiceNumber ?? `BILL-${Date.now()}`),
            category: 'Inbound',
            tenantName: formData.vendorName, // Vendor acts as Tenant Name in list
            amount: totalAmount,
            dueDate: formData.dueDate,
            status: initialInvoice?.status || 'Due',
            items: formData.items,
            attachmentUrl: file ? URL.createObjectURL(file) : initialInvoice?.attachmentUrl
        };
        onSave(newInvoice);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">{initialInvoice ? 'Edit Inbound Invoice' : 'Upload Inbound Invoice'}</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Details</label>
                        <input name="vendorName" value={formData.vendorName} onChange={handleChange} placeholder="Vendor Name / Payee*" className="w-full p-2 border rounded" />
                        <input name="reference" value={formData.reference} onChange={handleChange} placeholder="Invoice Number / Reference" className="w-full p-2 border rounded" />
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Attachment</label>
                            <input type="file" onChange={handleFileChange} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"/>
                            {initialInvoice?.attachmentUrl && !file && <p className="text-xs text-green-600 mt-1">Current file attached</p>}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Payment Details</label>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Due Date*</label>
                            <input name="dueDate" type="date" value={formData.dueDate} onChange={handleChange} className="w-full p-2 border rounded" />
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <h3 className="font-semibold text-gray-700 text-sm mb-2">Line Items / Services:</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="p-2 rounded-l">Description</th>
                                <th className="p-2 w-20">Qty</th>
                                <th className="p-2 w-24">Unit Price</th>
                                <th className="p-2 w-24 text-right">Total</th>
                                <th className="p-2 w-10 rounded-r"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.items.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="p-2">
                                        <input 
                                            value={item.description} 
                                            onChange={e => handleItemChange(index, 'description', e.target.value)} 
                                            placeholder="Service / Item Description" 
                                            className="w-full p-1 border rounded" 
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={item.quantity ?? ''} 
                                            onChange={e => handleItemChange(index, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value))} 
                                            placeholder="1"
                                            className="w-full p-1 border rounded text-center" 
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            value={item.unitPrice ?? ''} 
                                            onChange={e => handleItemChange(index, 'unitPrice', e.target.value === '' ? '' : parseFloat(e.target.value))} 
                                            placeholder="0"
                                            className="w-full p-1 border rounded text-right" 
                                        />
                                    </td>
                                    <td className="p-2 text-right font-semibold">{Number(item.amount ?? 0).toLocaleString()}</td>
                                    <td className="p-2 text-center">
                                        <button onClick={() => removeItem(index)} className="text-red-500 font-bold hover:bg-red-50 rounded px-1">&times;</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button onClick={addItem} className="mt-2 text-sm font-semibold text-primary hover:underline">+ Add Item</button>
                </div>

                 <div className="flex justify-end items-center border-t pt-4 mb-6">
                    <div className="text-right">
                        <p className="text-gray-600">Total Payable:</p>
                        <p className="text-2xl font-bold text-primary">KES {Number(totalAmount ?? 0).toLocaleString()}</p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md">{initialInvoice ? 'Update Invoice' : 'Upload & Save'}</button>
                </div>
            </div>
        </div>
    );
};

// --- OUTBOUND INVOICE CREATOR MODAL (Professional Invoice) ---
const CreateOutboundInvoiceModal: React.FC<{ initialInvoice?: Invoice | null; onClose: () => void; onSave: (invoice: Invoice) => void; }> = ({ initialInvoice, onClose, onSave }) => {
    const { tenants, landlords, systemSettings } = useData();
    const [clientMode, setClientMode] = useState<'Existing' | 'New'>('Existing');
    const [selectedTenantId, setSelectedTenantId] = useState('');
    
    const [formData, setFormData] = useState({
        tenantName: initialInvoice?.tenantName || '', // Recipient
        email: initialInvoice?.email || '',
        phone: initialInvoice?.phone || '',
        billingAddress: initialInvoice?.billingAddress || '',
        dueDate: initialInvoice?.dueDate || '',
        items: initialInvoice?.items?.map(i => ({...i, quantity: i.quantity || '' as any, unitPrice: i.unitPrice || '' as any})) || [{ description: '', amount: 0, quantity: '' as any, unitPrice: '' as any }]
    });

    const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTenantSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const tId = e.target.value;
        setSelectedTenantId(tId);
        
        if (tId) {
            const tenant = tenants.find(t => t.id === tId);
            if (tenant) {
                setFormData(prev => ({
                    ...prev,
                    tenantName: tenant.name,
                    email: tenant.email,
                    phone: tenant.phone,
                    billingAddress: `${tenant.propertyName} - ${tenant.unit}`
                }));
            } else {
                const landlord = landlords.find(l => l.id === tId);
                if (landlord) {
                    setFormData(prev => ({
                        ...prev,
                        tenantName: landlord.name,
                        email: landlord.email,
                        phone: landlord.phone,
                        billingAddress: `Landlord - ${landlord.branch || 'Headquarters'}`
                    }));
                }
            }
        }
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...formData.items];
        (newItems[index] as any)[field] = value;
        
        // Recalculate line total
        if(field === 'quantity' || field === 'unitPrice') {
            const qty = newItems[index].quantity || 1;
            const price = newItems[index].unitPrice || 0;
            newItems[index].amount = qty * price;
        }
        
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setFormData(prev => ({ ...prev, items: [...prev.items, { description: '', amount: 0, quantity: '' as any, unitPrice: '' as any }] }));
    };

    const removeItem = (index: number) => {
        if (formData.items.length > 1) {
            setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
        }
    };

    // --- FETCH DEBTS LOGIC ---
    const fetchOutstandingItems = () => {
        let tenant = null;

        if (clientMode === 'Existing' && selectedTenantId) {
            tenant = tenants.find(t => t.id === selectedTenantId);
        } else if (formData.tenantName) {
            // Fallback for new clients or manual text matching
             const query = formData.tenantName.toLowerCase();
             tenant = tenants.find(p => p.name.toLowerCase() === query);
        }

        if (!tenant) {
            alert(clientMode === 'Existing' 
                ? "Please select a tenant from the dropdown." 
                : "Tenant not found matching this name. Only existing tenants track arrears."
            );
            return;
        }

        const newItems = [];

        // 1. Check Rent Arrears
        if (tenant.status === 'Overdue' && tenant.rentAmount > 0) {
            newItems.push({
                description: `Rent Arrears - ${tenant.unit}`,
                amount: tenant.rentAmount, 
                quantity: 1,
                unitPrice: tenant.rentAmount
            });
        }

        // 2. Outstanding Bills
        if (tenant.outstandingBills) {
            tenant.outstandingBills.forEach(bill => {
                if (bill.status === 'Pending') {
                    newItems.push({
                        description: `${bill.type} Bill (${bill.date})`,
                        amount: bill.amount,
                        quantity: 1,
                        unitPrice: bill.amount
                    });
                }
            });
        }

        // 3. Outstanding Fines
        if (tenant.outstandingFines) {
            tenant.outstandingFines.forEach(fine => {
                if (fine.status === 'Pending') {
                    newItems.push({
                        description: `Fine: ${fine.type}`,
                        amount: fine.amount,
                        quantity: 1,
                        unitPrice: fine.amount
                    });
                }
            });
        }

        if (newItems.length > 0) {
            // Check if we already have items, if only one empty item, replace it
            let finalItems = [...formData.items];
            if (finalItems.length === 1 && !finalItems[0].description && finalItems[0].amount === 0) {
                finalItems = newItems;
            } else {
                finalItems = [...finalItems, ...newItems];
            }
            setFormData(prev => ({ ...prev, items: finalItems }));
            alert(`Added ${newItems.length} outstanding items for ${tenant!.name}.`);
        } else {
            alert(`No outstanding arrears or bills found for ${tenant.name}.`);
        }
    };

    const totalAmount = formData.items.reduce((sum, item) => sum + (item.amount || 0), 0);

    const handleSubmit = () => {
        if (!formData.tenantName || !formData.dueDate) {
            alert('Recipient Name and Due Date are required.');
            return;
        }
        if (totalAmount <= 0) {
            alert('Invoice total cannot be zero.');
            return;
        }

        const newInvoice: Invoice = {
            id: initialInvoice?.id || `inv-out-${Date.now()}`,
            invoiceNumber: initialInvoice?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
            category: 'Outbound',
            tenantName: formData.tenantName,
            email: formData.email,
            phone: formData.phone,
            billingAddress: formData.billingAddress,
            amount: totalAmount,
            dueDate: formData.dueDate,
            status: initialInvoice?.status || 'Due',
            items: formData.items
        };
        onSave(newInvoice);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">{initialInvoice ? 'Edit Invoice' : 'Create Professional Invoice'}</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-gray-700 text-sm mb-2">Bill To:</h3>
                            <div className="flex gap-4 mb-2 text-sm">
                                <label className="flex items-center cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="clientMode" 
                                        checked={clientMode === 'Existing'} 
                                        onChange={() => setClientMode('Existing')} 
                                        className="mr-2"
                                    />
                                    Existing
                                </label>
                                <label className="flex items-center cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="clientMode" 
                                        checked={clientMode === 'New'} 
                                        onChange={() => { setClientMode('New'); setSelectedTenantId(''); setFormData(prev => ({...prev, tenantName: '', email: '', phone: '', billingAddress: ''})) }} 
                                        className="mr-2"
                                    />
                                    New Client
                                </label>
                            </div>

                            <div className="flex gap-2">
                                {clientMode === 'Existing' ? (
                                    <select 
                                        value={selectedTenantId} 
                                        onChange={handleTenantSelect} 
                                        className="w-full p-2 border rounded bg-white"
                                    >
                                        <option value="">Select Tenant/Landlord...</option>
                                        <optgroup label="Tenants">
                                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>)}
                                        </optgroup>
                                        <optgroup label="Landlords">
                                            {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                        </optgroup>
                                    </select>
                                ) : (
                                    <input 
                                        name="tenantName" 
                                        value={formData.tenantName} 
                                        onChange={handleHeaderChange} 
                                        placeholder="Client / Tenant Name*" 
                                        className="w-full p-2 border rounded" 
                                    />
                                )}
                                
                                {clientMode === 'Existing' && (
                                    <button 
                                        onClick={fetchOutstandingItems}
                                        className="bg-secondary/20 text-secondary-dark px-3 py-2 rounded text-xs font-bold hover:bg-secondary/30 whitespace-nowrap border border-secondary/20"
                                        title="Auto-fill arrears, fines, and bills for this tenant"
                                        type="button"
                                    >
                                        Fetch Debts
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <input name="email" value={formData.email} onChange={handleHeaderChange} placeholder="Email Address" className="w-full p-2 border rounded" />
                        <input name="phone" value={formData.phone} onChange={handleHeaderChange} placeholder="Phone Number" className="w-full p-2 border rounded" />
                        <input name="billingAddress" value={formData.billingAddress} onChange={handleHeaderChange} placeholder="Billing Address" className="w-full p-2 border rounded" />
                    </div>
                    <div className="space-y-3">
                        <h3 className="font-semibold text-gray-700 text-sm">Invoice Details:</h3>
                         <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Due Date*</label>
                            <input name="dueDate" type="date" value={formData.dueDate} onChange={handleHeaderChange} className="w-full p-2 border rounded" />
                        </div>
                        <div className="p-3 bg-gray-50 rounded text-sm">
                            <p className="font-semibold text-gray-600">{initialInvoice ? `Invoice # ${initialInvoice.invoiceNumber}` : 'Invoice # will be auto-generated.'}</p>
                            <p className="text-xs text-gray-500 mt-1">Company details (TaskMe Realty) will be added automatically.</p>
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <h3 className="font-semibold text-gray-700 text-sm mb-2">Line Items:</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="p-2 rounded-l">Description</th>
                                <th className="p-2 w-20">Qty</th>
                                <th className="p-2 w-24">Price</th>
                                <th className="p-2 w-24 text-right">Total</th>
                                <th className="p-2 w-10 rounded-r"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.items.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="p-2"><input value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} placeholder="Item Description" className="w-full p-1 border rounded" /></td>
                                    <td className="p-2"><input type="number" value={item.quantity ?? ''} onChange={e => handleItemChange(index, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="1" className="w-full p-1 border rounded text-center" /></td>
                                    <td className="p-2"><input type="number" value={item.unitPrice ?? ''} onChange={e => handleItemChange(index, 'unitPrice', e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0" className="w-full p-1 border rounded text-right" /></td>
                                    <td className="p-2 text-right font-semibold">{Number(item.amount ?? 0).toLocaleString()}</td>
                                    <td className="p-2 text-center"><button onClick={() => removeItem(index)} className="text-red-500 font-bold">&times;</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button onClick={addItem} className="mt-2 text-sm font-semibold text-primary hover:underline">+ Add Item</button>
                </div>

                <div className="flex justify-end items-center border-t pt-4 mb-6">
                    <div className="text-right">
                        <p className="text-gray-600">Total Amount Due:</p>
                        <p className="text-2xl font-bold text-primary">KES {Number(totalAmount ?? 0).toLocaleString()}</p>
                    </div>
                </div>

                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">{initialInvoice ? 'Update Invoice' : 'Generate Invoice'}</button>
                </div>
            </div>
        </div>
    );
};

// --- INVOICE PREVIEW & SEND MODAL ---
const InvoicePreviewModal: React.FC<{ invoice: Invoice; onClose: () => void; }> = ({ invoice, onClose }) => {
    const { systemSettings, tenants, properties } = useData();
    const [linkCopied, setLinkCopied] = useState(false);

    // Resolve the paybill account reference (unit tag) for this invoice's tenant.
    // The tenant types this exact string at the M-Pesa Paybill account prompt;
    // the C2B confirmation callback uses it to match payment → unit → tenant.
    const invoiceTenant = tenants.find(t => t.name === invoice.tenantName);
    const invoiceUnit = invoiceTenant
        ? properties
            .find(p => p.id === invoiceTenant.propertyId)
            ?.units?.find(u => u.id === invoiceTenant.unitId)
        : undefined;
    const unitTag = invoiceUnit?.unitTag || invoiceTenant?.unit || '';
    const paybill = systemSettings?.agencyPaybill;
    
    // Simulated Link Generation
    const paymentLink = `https://portal.taskme.re/pay/${invoice.id}`;
    const messageBody = `Dear ${invoice.tenantName}, please find your invoice #${invoice.invoiceNumber} for KES ${Number(invoice.amount ?? 0).toLocaleString()}. Pay securely here: ${paymentLink}`;

    const handleSendEmail = () => {
        const subject = encodeURIComponent(`Invoice ${invoice.invoiceNumber} from TaskMe Realty`);
        const body = encodeURIComponent(messageBody);
        window.open(`mailto:${invoice.email || ''}?subject=${subject}&body=${body}`, '_blank');
    };

    const handleSendSMS = () => {
        const body = encodeURIComponent(messageBody);
        window.open(`sms:${invoice.phone || ''}?&body=${body}`, '_blank');
    };

    const handleWhatsApp = () => {
        const body = encodeURIComponent(messageBody);
        // Standard WhatsApp API format
        window.open(`https://wa.me/?text=${body}`, '_blank');
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(paymentLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Action Bar */}
                <div className="bg-gray-50 p-4 border-b flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="font-bold text-gray-700">Preview: {invoice.invoiceNumber}</h2>
                        <span className="text-xs text-gray-500">Share via link to collect payment faster</span>
                    </div>
                    
                    <div className="flex gap-2">
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 px-2 sm:hidden self-end absolute top-4 right-4">&times;</button>
                    </div>
                </div>

                {/* Share Section */}
                <div className="bg-blue-50 p-4 border-b border-blue-100 flex flex-wrap gap-3 justify-center sm:justify-start">
                     <button onClick={handleCopyLink} className={`flex items-center px-3 py-2 rounded text-sm font-medium transition-colors ${linkCopied ? 'bg-green-100 text-green-700' : 'bg-white text-gray-700 hover:bg-gray-100 border'}`}>
                        <Icon name="stack" className="w-4 h-4 mr-2" /> {linkCopied ? 'Link Copied' : 'Copy Link'}
                    </button>
                     <button onClick={handleWhatsApp} className="flex items-center px-3 py-2 rounded text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200">
                        <Icon name="communication" className="w-4 h-4 mr-2" /> WhatsApp
                    </button>
                    <button onClick={handleSendSMS} className="flex items-center px-3 py-2 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 border">
                        <Icon name="communication" className="w-4 h-4 mr-2" /> SMS
                    </button>
                     <button onClick={handleSendEmail} className="flex items-center px-3 py-2 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 border">
                        <Icon name="mail" className="w-4 h-4 mr-2" /> Email
                    </button>
                </div>

                {/* Invoice Preview */}
                <div className="p-8 overflow-y-auto bg-white text-sm">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                             <h1 className="text-2xl font-bold text-primary uppercase tracking-wider">Invoice</h1>
                             <p className="text-gray-500">#{invoice.invoiceNumber}</p>
                             <div className="mt-4">
                                <p className="font-bold text-gray-700">Billed To:</p>
                                <p className="text-gray-600">{invoice.tenantName}</p>
                                <p className="text-gray-600">{invoice.billingAddress}</p>
                                <p className="text-gray-600">{invoice.phone}</p>
                             </div>
                        </div>
                        <div className="text-right">
                            {systemSettings.logo ? (
                                <img src={systemSettings.logo} alt="Company Logo" className="h-16 object-contain ml-auto mb-2" />
                            ) : (
                                <h2 className="text-lg font-bold text-gray-800">{systemSettings.companyName || 'TaskMe Realty'}</h2>
                            )}
                            {systemSettings.address && <p className="text-gray-500">{systemSettings.address}</p>}
                            {systemSettings.phone && <p className="text-gray-500">{systemSettings.phone}</p>}
                            <div className="mt-4 bg-gray-100 p-3 rounded">
                                <p className="text-xs text-gray-500 uppercase font-bold">Amount Due</p>
                                <p className="text-xl font-bold text-primary">KES {Number(invoice.amount ?? 0).toLocaleString()}</p>
                                <p className="text-xs text-red-500 mt-1">Due: {invoice.dueDate}</p>
                            </div>
                        </div>
                    </div>

                    <table className="w-full mb-8">
                        <thead>
                            <tr className="border-b-2 border-gray-800">
                                <th className="text-left py-2 uppercase text-xs font-bold text-gray-600">Description</th>
                                <th className="text-center py-2 uppercase text-xs font-bold text-gray-600">Qty</th>
                                <th className="text-right py-2 uppercase text-xs font-bold text-gray-600">Price</th>
                                <th className="text-right py-2 uppercase text-xs font-bold text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoice.items?.map((item, i) => (
                                <tr key={i}>
                                    <td className="py-3 text-gray-700">{item.description}</td>
                                    <td className="py-3 text-center text-gray-600">{item.quantity}</td>
                                    <td className="py-3 text-right text-gray-600">{Number(item.unitPrice ?? 0).toLocaleString()}</td>
                                    <td className="py-3 text-right font-medium text-gray-800">{Number(item.amount ?? 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="flex justify-end">
                        <div className="w-1/2 border-t border-gray-300 pt-2">
                             <div className="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span>KES {Number(invoice.amount ?? 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Pay by M-Pesa Paybill — shows the Unit Tag as the account reference.
                        The C2B confirmation callback matches this account back to the unit/tenant. */}
                    {(paybill || unitTag) && (
                        <div className="mt-8 border-t-2 border-dashed border-gray-300 pt-5">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Pay by M-Pesa Paybill</p>
                            <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded-r-lg">
                                <ol className="text-sm text-gray-800 space-y-2">
                                    <li><span className="font-bold">1.</span> Go to M-PESA &rsaquo; Lipa na M-PESA &rsaquo; Pay Bill</li>
                                    <li className="flex items-center gap-2">
                                        <span className="font-bold">2.</span>
                                        <span>Business No:</span>
                                        <span className="font-mono font-bold bg-white px-3 py-1 rounded border text-green-700 tracking-wider">{paybill || '— set agency paybill —'}</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="font-bold">3.</span>
                                        <span>Account No:</span>
                                        <span className="font-mono font-bold bg-white px-3 py-1 rounded border text-green-700 tracking-wider">{unitTag || '— set unit tag —'}</span>
                                    </li>
                                    <li><span className="font-bold">4.</span> Amount: <span className="font-bold">KES {Number(invoice.amount ?? 0).toLocaleString()}</span></li>
                                    <li><span className="font-bold">5.</span> Enter your M-PESA PIN and confirm.</li>
                                </ol>
                                <p className="text-[11px] text-gray-500 mt-3 italic">
                                    Important: the account number above must be entered exactly. Wrong accounts delay reconciliation.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 border-t text-right">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-black">Close Preview</button>
                </div>
            </div>
        </div>
    );
};

const Invoices: React.FC = () => {
    const { invoices, addInvoice, updateInvoice } = useData();
    const [activeTab, setActiveTab] = useState<'Inbound' | 'Outbound'>('Outbound');
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateOutboundOpen, setIsCreateOutboundOpen] = useState(false);
    const [isUploadInboundOpen, setIsUploadInboundOpen] = useState(false);
    const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            const matchesTab = inv.category === activeTab;
            const matchesSearch = inv.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [invoices, activeTab, searchQuery]);

    const handleSaveInvoice = (invoice: Invoice) => {
        if (editingInvoice) {
            updateInvoice(invoice.id, invoice);
        } else {
            addInvoice(invoice);
        }
        setIsCreateOutboundOpen(false);
        setIsUploadInboundOpen(false);
        setEditingInvoice(null);
    };

    const handleEdit = (inv: Invoice) => {
        setEditingInvoice(inv);
        if (inv.category === 'Outbound') setIsCreateOutboundOpen(true);
        else setIsUploadInboundOpen(true);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Invoices</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage receivables (Outbound) and payables (Inbound).</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => { setEditingInvoice(null); setIsUploadInboundOpen(true); }} 
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-md shadow-sm hover:bg-gray-50 flex items-center"
                    >
                        <Icon name="download" className="w-4 h-4 mr-2" /> Upload Bill
                    </button>
                    <button 
                        onClick={() => { setEditingInvoice(null); setIsCreateOutboundOpen(true); }} 
                        className="px-4 py-2 bg-primary text-white font-bold rounded-md shadow-sm hover:bg-primary-dark flex items-center"
                    >
                        <Icon name="plus" className="w-4 h-4 mr-2" /> Create Invoice
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button 
                        onClick={() => setActiveTab('Outbound')}
                        className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'Outbound' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Outbound (Receivables)
                    </button>
                    <button 
                        onClick={() => setActiveTab('Inbound')}
                        className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'Inbound' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Inbound (Payables)
                    </button>
                </div>

                {/* Search */}
                <div className="mb-4 relative w-full max-w-md">
                    <input 
                        type="text" 
                        placeholder="Search by Name or Invoice #..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary"
                    />
                    <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Invoice #</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">{activeTab === 'Outbound' ? 'Billed To' : 'Vendor'}</th>
                                <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredInvoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{inv.dueDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-700">{inv.invoiceNumber}</td>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{inv.tenantName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-800">KES {Number(inv.amount ?? 0).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                            inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 
                                            inv.status === 'Overdue' ? 'bg-red-100 text-red-800' : 
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-3">
                                        <button onClick={() => setPreviewInvoice(inv)} className="text-blue-600 hover:underline">View</button>
                                        <button onClick={() => handleEdit(inv)} className="text-gray-500 hover:text-gray-700">Edit</button>
                                    </td>
                                </tr>
                            ))}
                            {filteredInvoices.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No invoices found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {isCreateOutboundOpen && (
                <CreateOutboundInvoiceModal 
                    initialInvoice={editingInvoice}
                    onClose={() => { setIsCreateOutboundOpen(false); setEditingInvoice(null); }} 
                    onSave={handleSaveInvoice} 
                />
            )}
            {isUploadInboundOpen && (
                <UploadInboundInvoiceModal 
                    initialInvoice={editingInvoice}
                    onClose={() => { setIsUploadInboundOpen(false); setEditingInvoice(null); }} 
                    onSave={handleSaveInvoice} 
                />
            )}
            {previewInvoice && (
                <InvoicePreviewModal 
                    invoice={previewInvoice} 
                    onClose={() => setPreviewInvoice(null)} 
                />
            )}
        </div>
    );
};

export default Invoices;
