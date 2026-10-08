
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Bill, Invoice, Message } from '@/types';
import { exportToCSV, printSection } from '@/utils/exportHelper';
import { communicationApi } from '@/utils/communicationApi';
import { fmtDate } from '@/utils/date';
import AgencyFeeSweepPanel from './AgencyFeeSweepPanel';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// --- TYPES ---
interface OutboundItem {
    id: string;
    originalId: string; // Bill ID, User ID (Landlord), Offboarding Record ID, etc.
    source: 'Bill' | 'Invoice' | 'System-Calculated';
    sourceType: 'Bill' | 'Maintenance' | 'Landlord Payout' | 'Deposit Refund' | 'Cleaning' | 'Security';
    date: string;
    dueDate?: string;
    recipient: string; 
    recipientPhone?: string;
    category: string;
    amount: number;
    reference: string;
    status: 'Paid' | 'Unpaid' | 'Pending' | 'Overdue';
    propertyName: string;
    description?: string;
    details?: any; // For category specific columns (e.g. unit count for landlords)
}

// --- CARD STYLE ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

interface OutboundCardProps {
    title: string;
    amount: number;
    count: number;
    pendingCount: number;
    icon: string;
    color?: string;
    onClick: () => void;
}

const PaymentCard: React.FC<OutboundCardProps> = ({ title, amount, count, pendingCount, icon, color = "text-gray-800", onClick }) => (
    <div 
        className={`${MAJOR_CARD_CLASSES} p-6 cursor-pointer group`}
        onClick={onClick}
    >
        <div className="relative z-10 flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wide group-hover:text-gray-700">{title}</p>
                <h3 className={`text-2xl font-extrabold mt-2 ${color}`}>KES {(amount/1000).toFixed(1)}k</h3>
                <p className="text-xs text-gray-400 mt-1">{count} Total • <span className="text-red-500 font-semibold">{pendingCount} Unpaid</span></p>
            </div>
            <div className="p-3 rounded-full bg-gray-50 text-gray-400 group-hover:bg-primary group-hover:text-white transition-colors">
                <Icon name={icon} className="w-6 h-6" />
            </div>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                View Details <Icon name="chevron-down" className="w-3 h-3 ml-1 -rotate-90" />
            </span>
        </div>
    </div>
);

// --- MODALS ---

const ReceiptModal: React.FC<{ item: OutboundItem; onClose: () => void }> = ({ item, onClose }) => {
    const handlePrint = () => {
        printSection('outbound-receipt', `Receipt-${item.reference}`);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1400] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div id="outbound-receipt" className="p-8 bg-white text-gray-800">
                    <div className="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 uppercase">Payment Receipt</h1>
                            <p className="text-xs text-gray-500 mt-1">TaskMe Realty</p>
                        </div>
                        <div className="text-right text-xs">
                            <p>Date: {fmtDate(item.date)}</p>
                            <p>Ref: {item.reference}</p>
                        </div>
                    </div>

                    <div className="space-y-4 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Paid To:</span>
                            <span className="font-bold">{item.recipient}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Category:</span>
                            <span>{item.category}</span>
                        </div>
                        {item.propertyName && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Property:</span>
                                <span>{item.propertyName}</span>
                            </div>
                        )}
                         <div className="flex justify-between">
                            <span className="text-gray-500">Description:</span>
                            <span className="max-w-[200px] text-right">{item.description || '-'}</span>
                        </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-dashed border-gray-300 flex justify-between items-center">
                        <span className="font-bold text-lg">Total Amount</span>
                        <span className="font-bold text-xl text-green-600">KES {item.amount.toLocaleString()}</span>
                    </div>
                    
                    <div className="mt-8 text-center text-[10px] text-gray-400">
                        <p>Electronically generated receipt.</p>
                        <p>Generated on {new Date().toLocaleString()}</p>
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-2 no-print">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Close</button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-primary text-white rounded font-bold hover:bg-primary-dark flex items-center">
                        <Icon name="download" className="w-4 h-4 mr-2"/> Print
                    </button>
                </div>
            </div>
        </div>
    );
};

const PayOutboundModal: React.FC<{
    category: string;
    item: OutboundItem;
    onClose: () => void;
    onPaymentComplete: (amount: number, ref: string, item: OutboundItem, receipt?: File) => void | Promise<void>;
}> = ({ category, item, onClose, onPaymentComplete }) => {
    const [reference, setReference] = useState('');
    const [receipt, setReceipt] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setReceipt(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        if (!reference) return alert("Please enter a transaction reference/code.");
        await onPaymentComplete(item.amount, reference, item, receipt || undefined);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">
                        Pay {item.recipient}
                    </h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <div className="flex justify-between mb-2">
                            <span className="text-sm text-blue-600 font-bold">Category</span>
                            <span className="text-sm text-blue-800">{item.category}</span>
                        </div>
                        <div className="flex justify-between mb-2">
                            <span className="text-sm text-blue-600 font-bold">Amount Due</span>
                            <span className="text-lg font-extrabold text-blue-900">KES {item.amount.toLocaleString()}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-sm text-blue-600 font-bold">Reference</span>
                            <span className="text-sm text-blue-800">{item.description || item.reference}</span>
                        </div>
                    </div>

                    {item.source === 'System-Calculated' && (
                        <div className="p-2 bg-yellow-50 border border-yellow-100 text-xs text-yellow-700 rounded">
                            <Icon name="info" className="w-3 h-3 inline mr-1"/>
                            This is a system-generated item from <strong>{item.sourceType}</strong>. Paying this will create a permanent record and update the source module.
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Code / Ref</label>
                        <input 
                            value={reference} 
                            onChange={e => setReference(e.target.value)} 
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                            placeholder="e.g. M-Pesa Code or Cheque No."
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Receipt (Optional)</label>
                        <input type="file" onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"/>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">Cancel</button>
                        <button 
                            onClick={handleSubmit} 
                            className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-sm flex items-center"
                        >
                            <Icon name="check" className="w-4 h-4 mr-2" /> Confirm Payment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const Outbound: React.FC = () => {
    const {
        bills, invoices, properties, updateBill, addBill, updateInvoice,
        tenants, landlords, tasks, offboardingRecords, addMessage, updateOffboardingRecord,
        checkPermission, currentUser, systemSettings
    } = useData();

    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canPay = isSuperAdmin || checkPermission('Financials', 'pay');

    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Filters
    const [propertyFilter, setPropertyFilter] = useState('All Properties');
    const [dateRange, setDateRange] = useState('This Month');
    
    // Modal States
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<OutboundItem | undefined>(undefined);
    const [receiptItem, setReceiptItem] = useState<OutboundItem | null>(null);

    // --- Data Aggregation Strategy (Intermarriage of modules) ---
    const aggregatedData = useMemo(() => {
        const logs: OutboundItem[] = [];

        // 1. STANDARD BILLS
        bills.forEach(b => {
            let category = 'Other payments';
            const catLower = b.category.toLowerCase();
            const vendorLower = b.vendor.toLowerCase();

            if (catLower.includes('deposit refund') || vendorLower.includes('refund')) category = 'Deposit refund';
            else if (catLower.includes('landlord') || vendorLower.includes('payout')) category = 'Landlord payout';
            else if (catLower.includes('referral')) category = 'Referral Commission';
            else if (catLower.includes('security')) category = 'Payment to security personnel';
            else if (catLower.includes('cleaning')) category = 'Payments to cleaners';
            else if (catLower.includes('maintenance') || catLower.includes('repair') || catLower.includes('contractor')) category = 'Services paid to contractors';
            else if (catLower.includes('water') || catLower.includes('electricity') || catLower.includes('garbage')) category = 'Bills';
            else if (vendorLower.includes('supply') || vendorLower.includes('hardware') || catLower.includes('vendor')) category = 'Vendor payments';
            
            const prop = properties.find(p => p.id === b.propertyId);
            const propertyName = prop ? prop.name : 'General';

            logs.push({
                id: b.id,
                originalId: b.id,
                source: 'Bill',
                sourceType: 'Bill',
                date: b.invoiceDate || b.dueDate,
                dueDate: b.dueDate,
                recipient: b.vendor,
                category,
                amount: b.amount,
                reference: b.status === 'Paid' ? `PAID-${b.id.slice(-4)}` : 'Pending',
                status: b.status === 'Paid' ? 'Paid' : b.status === 'Overdue' ? 'Overdue' : 'Unpaid',
                propertyName,
                description: b.description
            });
        });

        // 2. OUTBOUND INVOICES
        invoices.filter(i => i.category === 'Inbound').forEach(inv => {
             let category = 'Vendor payments';
             if (inv.tenantName.toLowerCase().includes('landlord') || inv.tenantName.toLowerCase().includes('owner')) {
                 category = 'Landlord payout';
             }
             logs.push({
                id: inv.id,
                originalId: inv.id,
                source: 'Invoice',
                sourceType: 'Bill',
                date: inv.dueDate,
                dueDate: inv.dueDate,
                recipient: inv.tenantName,
                category,
                amount: inv.amount,
                reference: inv.invoiceNumber,
                status: inv.status === 'Paid' ? 'Paid' : 'Unpaid',
                propertyName: 'Agency',
                description: `Invoice #${inv.invoiceNumber}`
            });
        });

        // 3. VIRTUAL: PENDING LANDLORD PAYOUTS (Calculated on the fly)
        landlords.forEach(landlord => {
            const currentMonth = getCurrentMonthIso();
            const hasBill = bills.some(b => b.vendor === landlord.name && b.invoiceDate.startsWith(currentMonth));
            
            if (!hasBill) {
                const myProps = properties.filter(p => p.landlordId === landlord.id);
                
                // Gross Rent
                let grossRent = 0;
                let totalUnits = 0;
                myProps.forEach(prop => {
                    totalUnits += prop.units.length;
                    const occupied = prop.units.filter(u => u.status === 'Occupied').length;
                    const rent = prop.defaultMonthlyRent || 25000;
                    grossRent += (occupied * rent);
                });

                // Deductions (Simplified for overview)
                const mgmtFee = grossRent * 0.08;
                const mri = grossRent * 0.075;
                const maintenance = myProps.length * 5000;
                const security = myProps.length * 10000;
                const totalDeductions = mgmtFee + mri + maintenance + security;
                
                const netPayout = grossRent - totalDeductions;

                if (netPayout > 0) {
                    logs.push({
                        id: `virt-payout-${landlord.id}`,
                        originalId: landlord.id,
                        source: 'System-Calculated',
                        sourceType: 'Landlord Payout',
                        date: getTodayIsoDate(),
                        dueDate: getTodayIsoDate(),
                        recipient: landlord.name,
                        recipientPhone: landlord.phone,
                        category: 'Landlord payout',
                        amount: netPayout,
                        reference: 'Pending',
                        status: 'Unpaid',
                        propertyName: 'Portfolio',
                        description: `Payout for ${currentMonth}`,
                        details: {
                            propertyCount: myProps.length,
                            unitCount: totalUnits,
                            grossCollected: grossRent,
                            deductions: totalDeductions
                        }
                    });
                }
            }
        });

        // 4. VIRTUAL: DEPOSIT REFUNDS (From Offboarding)
        offboardingRecords.forEach(rec => {
            // Only show if a final bill amount is set (meaning reconciliation is done) but not yet marked refunded
            if (rec.finalBillAmount && rec.finalBillAmount > 0 && !rec.depositRefunded) {
                 const hasBill = bills.some(b => b.category === 'Deposit Refund' && b.vendor === rec.tenantName);
                 if (!hasBill) {
                     const tenant = tenants.find(t => t.id === rec.tenantId);
                     logs.push({
                        id: `virt-refund-${rec.id}`,
                        originalId: rec.id,
                        source: 'System-Calculated',
                        sourceType: 'Deposit Refund',
                        date: rec.moveOutDate,
                        dueDate: rec.moveOutDate,
                        recipient: rec.tenantName,
                        recipientPhone: tenant?.phone,
                        category: 'Deposit refund',
                        amount: rec.finalBillAmount,
                        reference: 'Pending Payout',
                        status: 'Unpaid',
                        propertyName: `${rec.unit}`,
                        description: 'Security Deposit Refund',
                        details: {
                            unit: rec.unit,
                            moveOutDate: rec.moveOutDate
                        }
                    });
                 }
            }
        });

        // 5. VIRTUAL: CONTRACTOR PAYMENTS (From Completed Tasks with Costs)
        tasks.forEach(t => {
            if ((t.status === 'Completed' || t.status === 'Closed') && t.costs) {
                const totalCost = (t.costs.labor || 0) + (t.costs.materials || 0) + (t.costs.travel || 0);
                // Check if already billed? Assuming not for this view
                if (totalCost > 0) {
                    // Smart Categorization of Tasks
                    let category = 'Services paid to contractors';
                    let sourceType: OutboundItem['sourceType'] = 'Maintenance';

                    if (t.title.toLowerCase().includes('clean') || t.assignedTo.toLowerCase().includes('clean')) {
                         category = 'Payments to cleaners';
                         sourceType = 'Cleaning';
                    }
                    if (t.title.toLowerCase().includes('security') || t.title.toLowerCase().includes('guard') || t.assignedTo.toLowerCase().includes('security')) {
                         category = 'Payment to security personnel';
                         sourceType = 'Security';
                    }

                    logs.push({
                        id: `virt-task-${t.id}`,
                        originalId: t.id,
                        source: 'System-Calculated',
                        sourceType: sourceType,
                        date: t.dueDate.split('T')[0],
                        dueDate: t.dueDate.split('T')[0],
                        recipient: t.assignedTo || 'Unassigned Vendor',
                        category: category,
                        amount: totalCost,
                        reference: 'Pending',
                        status: 'Unpaid',
                        propertyName: t.property,
                        description: `Task: ${t.title}`
                    });
                }
            }
        });

        return logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [bills, invoices, properties, landlords, tenants, offboardingRecords, tasks]);

    // --- Metrics Calculation ---
    const metrics = useMemo(() => {
        const cats = {
            'Deposit refund': { amount: 0, count: 0, pending: 0, icon: 'wallet' },
            'Bills': { amount: 0, count: 0, pending: 0, icon: 'expenses' },
            'Services paid to contractors': { amount: 0, count: 0, pending: 0, icon: 'tools' },
            'Vendor payments': { amount: 0, count: 0, pending: 0, icon: 'stack' },
            'Payments to cleaners': { amount: 0, count: 0, pending: 0, icon: 'maintenance' },
            'Payment to security personnel': { amount: 0, count: 0, pending: 0, icon: 'shield' },
            'Other payments': { amount: 0, count: 0, pending: 0, icon: 'payments' },
            'Landlord payout': { amount: 0, count: 0, pending: 0, icon: 'landlords' },
        };

        aggregatedData.forEach(log => {
            const key = Object.keys(cats).find(k => k === log.category) as keyof typeof cats;
            if (key) {
                cats[key].amount += log.amount;
                cats[key].count += 1;
                if (log.status === 'Unpaid' || log.status === 'Overdue' || log.status === 'Pending') {
                    cats[key].pending += 1;
                }
            }
        });
        
        return cats;
    }, [aggregatedData]);

    // --- Filter Logic ---
    const filteredLogs = useMemo(() => {
        return aggregatedData.filter(log => {
            const matchesCategory = activeCategory === 'All' || log.category === activeCategory;
            const matchesSearch = log.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  log.reference.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesProperty = propertyFilter === 'All Properties' || log.propertyName === propertyFilter;

            let matchesDate = true;
            const logDate = new Date(log.date);
            const now = new Date();
            
            if (dateRange === 'This Month') {
                matchesDate = logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
            } else if (dateRange === 'Last Month') {
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                matchesDate = logDate.getMonth() === lastMonth.getMonth() && logDate.getFullYear() === lastMonth.getFullYear();
            } else if (dateRange === 'This Year') {
                matchesDate = logDate.getFullYear() === now.getFullYear();
            }

            return matchesCategory && matchesSearch && matchesProperty && matchesDate;
        });
    }, [aggregatedData, activeCategory, searchQuery, propertyFilter, dateRange]);

    const dashboardLogs = useMemo(() => aggregatedData.slice(0, 20), [aggregatedData]);

    // --- Handlers ---

    const handlePayNow = (item: OutboundItem) => {
        if (!canPay) return alert('You do not have permission to process payments.');
        setSelectedItem(item);
        setIsPayModalOpen(true);
    };

    const handlePaymentComplete = async (amount: number, ref: string, item: OutboundItem, receipt?: File) => {
        let notificationMsg = `Payment of KES ${amount.toLocaleString()} processed. Ref: ${ref}`;
        let notificationRecipient = { name: item.recipient, contact: item.recipientPhone || '' };

        // 1. Create Bill/Update Records for System-Calculated Items
        if (item.source === 'System-Calculated') {
            // Create persistent bill record so it appears as Paid in history
             const newBill: Bill = {
                id: `bill-auto-${Date.now()}`,
                vendor: item.recipient,
                category: item.category,
                amount: amount,
                invoiceDate: item.date,
                dueDate: item.dueDate || item.date,
                status: 'Paid',
                propertyId: 'Agency', // Or specific property if applicable
                description: `${item.description} (Ref: ${ref})`
            };
            addBill(newBill);

            // --- INTEGRATION LOGIC: UPDATE SOURCE MODULES ---
            if (item.sourceType === 'Deposit Refund') {
                updateOffboardingRecord(item.originalId, { depositRefunded: true });
                notificationMsg = `Dear ${item.recipient}, your deposit refund of KES ${amount.toLocaleString()} has been processed.`;
            } else if (item.sourceType === 'Landlord Payout') {
                 notificationMsg = `Dear ${item.recipient}, your rent revenue of KES ${amount.toLocaleString()} has been disbursed.`;
            }
            // For Maintenance/Cleaning/Security tasks, we ideally update task status or add a comment, but Bill creation is the financial record.

        } else {
            // Update existing normal Bill/Invoice
             if (item.source === 'Bill') updateBill(item.originalId, { status: 'Paid' });
             if (item.source === 'Invoice') updateInvoice(item.originalId, { status: 'Paid' });
        }

        // 2. Send Notification
        if (notificationRecipient.contact) {
            const fullMsg = `${notificationMsg} Ref: ${ref}. Thank you. - TaskMe Realty`;
            const smsResult = await communicationApi.sendSMS(notificationRecipient.contact, fullMsg, 'TASK-ME', systemSettings?.bulkSmsEnabled);
            addMessage({
                id: `msg-${Date.now()}`,
                recipient: notificationRecipient,
                content: fullMsg,
                channel: 'SMS',
                status: smsResult.success ? 'Sent' : 'Failed',
                timestamp: new Date().toLocaleString(),
                priority: 'Normal'
            });
            alert(smsResult.success
                ? `Payment recorded & SMS sent to ${notificationRecipient.name}.`
                : `Payment recorded, but SMS could not be sent to ${notificationRecipient.name}. ${smsResult.error || ''}`.trim());
        } else {
            alert("Payment recorded.");
        }

        setIsPayModalOpen(false);
        setSelectedItem(undefined);
    };

    const handleExport = () => {
        exportToCSV(filteredLogs.map(l => ({
            Date: l.date,
            Category: l.category,
            Recipient: l.recipient,
            Amount: l.amount,
            Reference: l.reference,
            Status: l.status
        })), `Outbound_Payments_${activeCategory}`);
    };

    // --- Render Helper for Dynamic Columns ---
    const renderTableHeaders = () => {
        if (activeCategory === 'Landlord payout') {
            return (
                <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Landlord</th>
                    <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Properties</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Gross Collected</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Net Payable</th>
                    <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Action</th>
                </tr>
            );
        }
        if (activeCategory === 'Deposit refund') {
            return (
                <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Move Out</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Unit</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Refund Amount</th>
                    <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Action</th>
                </tr>
            );
        }
        // Default for Bills/Other/Cleaning/Security/Vendor
        return (
            <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Recipient</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Action</th>
            </tr>
        );
    };

    const renderTableRow = (log: OutboundItem) => {
        if (activeCategory === 'Landlord payout') {
            return (
                <>
                    <td className="px-6 py-4 text-gray-600">{log.date}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{log.recipient}</td>
                    <td className="px-6 py-4 text-center text-gray-600">{log.details?.propertyCount || '-'}</td>
                    <td className="px-6 py-4 text-right text-gray-600">KES {log.details?.grossCollected?.toLocaleString() || '-'}</td>
                    <td className="px-6 py-4 text-right font-bold text-blue-600">KES {log.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${log.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{log.status}</span></td>
                </>
            );
        }
        if (activeCategory === 'Deposit refund') {
            return (
                <>
                    <td className="px-6 py-4 text-gray-600">{log.details?.moveOutDate || log.date}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{log.recipient}</td>
                    <td className="px-6 py-4 text-gray-600">{log.details?.unit || log.propertyName}</td>
                    <td className="px-6 py-4 text-right font-bold text-red-600">KES {log.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${log.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{log.status}</span></td>
                </>
            );
        }
        // Default
        return (
            <>
                <td className="px-6 py-4 text-gray-600">{log.date}</td>
                <td className="px-6 py-4 font-medium text-gray-900">
                    {log.recipient}
                    <div className="text-[10px] text-gray-400">{log.propertyName}</div>
                </td>
                <td className="px-6 py-4"><span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">{log.category}</span></td>
                <td className="px-6 py-4 text-xs text-gray-500">{log.reference}</td>
                <td className="px-6 py-4 text-right font-bold text-gray-800">KES {log.amount.toLocaleString()}</td>
                <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${log.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{log.status}</span></td>
            </>
        );
    };

    return (
        <div className="space-y-8">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    {activeCategory !== 'All' && (
                         <button onClick={() => { setActiveCategory('All'); setSearchQuery(''); }} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-2">
                            <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Outbound
                        </button>
                    )}
                    <h1 className="text-3xl font-bold text-gray-800">{activeCategory === 'All' ? 'Outbound Payments' : activeCategory}</h1>
                    <p className="text-lg text-gray-500 mt-1">
                        {activeCategory === 'All' ? 'Track expenses, payouts, and operational costs.' : 'Manage payments and settlements for this category.'}
                    </p>
                </div>
            </div>

            {/* Dashboard Grid */}
            {activeCategory === 'All' && (
                <>
                    <AgencyFeeSweepPanel />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {Object.entries(metrics).map(([key, data]: [string, any]) => (
                            <PaymentCard 
                                key={key}
                                title={key}
                                amount={data.amount}
                                count={data.count}
                                pendingCount={data.pending}
                                icon={data.icon}
                                onClick={() => { setActiveCategory(key); setSearchQuery(''); }}
                                color={key === 'Landlord payout' ? 'text-blue-800' : 'text-gray-800'}
                            />
                        ))}
                    </div>
                     
                    {/* Recent Transactions Table on Dashboard */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Outbound Transactions</h2>
                        <div className="overflow-x-auto">
                             <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    {renderTableHeaders()}
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {dashboardLogs.map((log, idx) => (
                                        <tr key={log.id || idx} className="hover:bg-gray-50 transition-colors">
                                            {renderTableRow(log)}
                                            <td className="px-6 py-4 text-right">
                                                 {log.status !== 'Paid' ? (
                                                    canPay ? <button onClick={() => handlePayNow(log)} className="text-xs font-bold bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 shadow-sm">Pay</button> : <span className="text-xs text-gray-400">—</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">Paid</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {dashboardLogs.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No recent transactions.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Detailed Category List */}
            {activeCategory !== 'All' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                        <div className="relative w-full xl:w-64 flex-shrink-0">
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary"
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                        </div>
                        
                        <div className="flex gap-3">
                            <button onClick={handleExport} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">Export CSV</button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                {renderTableHeaders()}
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {filteredLogs.map((log, idx) => (
                                    <tr key={log.id || idx} className="hover:bg-gray-50 transition-colors">
                                        {renderTableRow(log)}
                                        <td className="px-6 py-4 text-right">
                                            {log.status !== 'Paid' ? (
                                                <div className="flex justify-end gap-2">
                                                    {canPay && <button
                                                        onClick={() => handlePayNow(log)}
                                                        className="text-xs font-bold bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 shadow-sm"
                                                    >
                                                        Pay Now
                                                    </button>}
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setReceiptItem(log)}
                                                    className="text-xs text-gray-400 hover:text-primary flex items-center justify-end ml-auto font-medium"
                                                >
                                                    <Icon name="download" className="w-3 h-3 mr-1" /> Receipt
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredLogs.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400">No transactions found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            {isPayModalOpen && selectedItem && (
                <PayOutboundModal 
                    category={activeCategory} 
                    item={selectedItem} 
                    onClose={() => setIsPayModalOpen(false)} 
                    onPaymentComplete={handlePaymentComplete} 
                />
            )}
            
            {receiptItem && (
                <ReceiptModal 
                    item={receiptItem} 
                    onClose={() => setReceiptItem(null)} 
                />
            )}
        </div>
    );
};

export default Outbound;
