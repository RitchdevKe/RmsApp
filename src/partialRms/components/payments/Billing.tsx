
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { Bill } from '@/types';
import { getTodayIsoDate } from '../../utils/timezone';

// New Type for Status
type BillStatus = 'Due' | 'Paid' | 'Overdue';

const statusClasses: Record<BillStatus, string> = {
    Due: 'bg-yellow-100 text-yellow-800',
    Paid: 'bg-green-100 text-green-800',
    Overdue: 'bg-red-100 text-red-800',
};

// Reusable component for bill cards with status display
const BillCard: React.FC<{ title: string; status: BillStatus; children: React.ReactNode }> = ({ title, status, children }) => {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusClasses[status]}`}>
                    {status}
                </span>
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    );
};

// Component for meter-based bills like Water and Electricity
const MeteredBill: React.FC<{ title: string; unit: string; category: string }> = ({ title, unit, category }) => {
    const { addBill, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canPay = isSuperAdmin || checkPermission('Financials', 'pay');
    const [cost, setCost] = useState('');
    const [prev, setPrev] = useState('');
    const [curr, setCurr] = useState('');
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState<BillStatus>('Due');

    const canCalculate = !isNaN(parseFloat(cost)) && !isNaN(parseFloat(prev)) && !isNaN(parseFloat(curr)) && parseFloat(curr) > parseFloat(prev) && parseFloat(cost) > 0;

    useEffect(() => {
        if (canCalculate) {
            const c = parseFloat(cost);
            const p = parseFloat(prev);
            const u = parseFloat(curr);
            setTotal((u - p) * c);
        } else {
            setTotal(0);
        }
    }, [cost, prev, curr, canCalculate]);

    const handleMarkAsPaid = () => {
        const newBill: Bill = {
            id: `util-${Date.now()}`,
            vendor: `${title} Authority`, // Simple default
            category: category,
            amount: total,
            invoiceDate: getTodayIsoDate(),
            dueDate: getTodayIsoDate(),
            status: 'Paid',
            propertyId: 'General' // In real app, select property
        };
        addBill(newBill);
        setStatus('Paid');
        alert(`Payment of KES ${Number(total ?? 0).toLocaleString()} for ${title} recorded and marked as paid.`);
    };

    const handleReset = () => {
        setCost('');
        setPrev('');
        setCurr('');
        setStatus('Due');
    };

    return (
        <BillCard title={title} status={status}>
            <div className="grid grid-cols-2 gap-2">
                <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={`Cost / ${unit}`} className="p-2 border rounded" disabled={status === 'Paid'} />
                <input type="number" value={prev} onChange={(e) => setPrev(e.target.value)} placeholder="Prev Reading" className="p-2 border rounded" disabled={status === 'Paid'} />
                <input type="number" value={curr} onChange={(e) => setCurr(e.target.value)} placeholder="Current Reading" className="p-2 border rounded col-span-2" disabled={status === 'Paid'} />
            </div>
            <div className="text-center pt-4 border-t">
                <p className="text-gray-500">Current Bill</p>
                <p className={`text-3xl font-bold ${status === 'Paid' ? 'text-gray-500' : 'text-primary'}`}>
                    KES {Number(total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
            </div>
            {status === 'Paid' ? (
                 <button
                    onClick={handleReset}
                    className="w-full mt-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
                >
                    Create New Bill
                </button>
            ) : (
                <button
                    onClick={handleMarkAsPaid}
                    disabled={!canCalculate || !canPay}
                    className="w-full mt-2 px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {canPay ? 'Record Payment' : 'No Permission'}
                </button>
            )}
        </BillCard>
    );
};

// Component for fixed amount bills
const FixedBill: React.FC<{ title: string, category: string }> = ({ title, category }) => {
    const { addBill, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const hasPayPerm = isSuperAdmin || checkPermission('Financials', 'pay');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState<BillStatus>('Due');

    const handleMarkAsPaid = () => {
        if (!hasPayPerm) { alert('You do not have permission to record payments.'); return; }
        if (!amount || parseFloat(amount) <= 0) {
            alert("Please enter a valid amount.");
            return;
        }
        const val = parseFloat(amount);
        const newBill: Bill = {
            id: `util-${Date.now()}`,
            vendor: `${title} Provider`,
            category: category,
            amount: val,
            invoiceDate: getTodayIsoDate(),
            dueDate: getTodayIsoDate(),
            status: 'Paid',
            propertyId: 'General'
        };
        addBill(newBill);
        setStatus('Paid');
        alert(`Payment of KES ${Number(val ?? 0).toLocaleString()} for ${title} recorded.`);
    };
    
    const handleReset = () => {
        setAmount('');
        setStatus('Due');
    };

    const canSubmit = !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;

    return (
        <BillCard title={title} status={status}>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter Bill Amount" className="w-full p-2 border rounded" disabled={status === 'Paid'} />
            {status === 'Paid' ? (
                <button
                    onClick={handleReset}
                    className="w-full mt-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
                >
                    Create New Bill
                </button>
            ) : (
                 <button
                    onClick={handleMarkAsPaid}
                    disabled={!canSubmit || !hasPayPerm}
                    className="w-full mt-2 px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {hasPayPerm ? 'Record Payment' : 'No Permission'}
                </button>
            )}
        </BillCard>
    );
};

const Billing: React.FC = () => {
    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/payments/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Billing Management</h1>
                <p className="text-lg text-gray-500 mt-1">Manage and process recurring property and utility bills. Payments recorded here appear in Expenses.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <MeteredBill title="Water Bills" unit="m³" category="Water" />
                <MeteredBill title="Electricity Bills" unit="KWh" category="Electricity" />
                <MeteredBill title="Gas Bills" unit="m³" category="Gas" />
                <FixedBill title="Garbage Collection Bill" category="Garbage" />
                <FixedBill title="Service Charge" category="Service Charge" />
                <FixedBill title="General Maintenance Bill" category="Maintenance" />
            </div>
        </div>
    );
};

export default Billing;
