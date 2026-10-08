
import React, { useState, useMemo } from 'react';
import { Bill, ExpenseCategory, LedgerEntry } from '@/types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const RecordExpenseModal: React.FC<{ onClose: () => void; onSave: (bill: Partial<Bill>) => void; properties: Property[] }> = ({ onClose, onSave, properties }) => {
    const [formData, setFormData] = useState<Partial<Bill>>({
        vendor: '',
        category: 'Maintenance',
        invoiceDate: getTodayIsoDate(),
        dueDate: '',
        amount: undefined,
        propertyId: 'Agency'
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };

    const handleSubmit = () => {
        if (!formData.vendor || !formData.dueDate || !formData.amount) {
            alert('Vendor, Due Date, and Amount are required.');
            return;
        }
        onSave(formData);
    };

    const categories: ExpenseCategory[] = [
        'Maintenance', 'Transaction Costs', 'Tax', 'Legal', 'Marketing', 'Office Rent', 'Other'
    ];

    return (
        <div className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-6 text-gray-800">Record New Expense</h2>
                <div className="space-y-4">
                    <input name="vendor" value={formData.vendor} onChange={handleChange} placeholder="Payee / Vendor Name *" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none" />
                    
                    <select name="propertyId" value={formData.propertyId} onChange={handleChange} className="w-full p-3 border rounded-xl bg-white focus:ring-2 focus:ring-primary/20 outline-none">
                        <option value="Agency">Agency (Overhead)</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name} (Portfolio)</option>)}
                    </select>

                    <select name="category" value={formData.category} onChange={handleChange} className="w-full p-3 border rounded-xl bg-white focus:ring-2 focus:ring-primary/20 outline-none">
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    
                    <input name="amount" type="number" value={formData.amount || ''} onChange={handleChange} placeholder="Amount (KES) *" className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none" />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-gray-500 font-bold uppercase mb-1 ml-1">Invoice Date</label>
                            <input name="invoiceDate" type="date" value={formData.invoiceDate} onChange={handleChange} className="w-full p-3 border rounded-xl" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-bold uppercase mb-1 ml-1">Due Date</label>
                            <input name="dueDate" type="date" value={formData.dueDate} onChange={handleChange} className="w-full p-3 border rounded-xl" />
                        </div>
                    </div>
                </div>
                <div className="mt-8 flex justify-end space-x-3">
                    <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 rounded-xl text-gray-700 font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark shadow-md transition-colors">Save Expense</button>
                </div>
            </div>
        </div>
    );
};

const Expenses: React.FC = () => {
    const { staff, bills, addBill, updateBill, deleteBill, checkPermission, properties, tenants, tasks, offboardingRecords } = useData();
    const canPay    = checkPermission('Financials', 'pay');
    const canDelete = checkPermission('Financials', 'delete');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [viewMode, setViewMode] = useState<'agency' | 'landlord'>('agency');

    const handleSaveBill = (newBillData: Partial<Bill>) => {
        const newBill: Bill = {
            id: `bill-${Date.now()}`,
            status: new Date(newBillData.dueDate!) < new Date() ? 'Overdue' : 'Due',
            propertyId: newBillData.propertyId || 'Agency',
            ...newBillData
        } as Bill;
        addBill(newBill);
        setIsModalOpen(false);
    };

    const handlePayBill = (expenseId: string) => {
        if (window.confirm("Confirm payment? Funds will be deducted.")) {
            updateBill(expenseId, { status: 'Paid' });
        }
    };

    // Helper: compute effective gross salary for a staff member.
    // For Target Based staff the gross = targetSalary × (avgPerformanceScore / 100).
    // For all other types the gross = salaryConfig.amount (stored base salary).
    const computeEffectiveGross = useMemo(() => {
        const period = getCurrentMonthIso(); // current YYYY-MM
        return (s: typeof staff[0]): number => {
            const baseAmount = s.salaryConfig?.amount || s.payrollInfo?.baseSalary || 0;
            if (s.salaryConfig?.type !== 'Target Based' || s.role !== 'Field Agent') return baseAmount;

            const targetSalary = baseAmount;
            const enabledTargets = s.salaryConfig.activeTargets || [];
            const assignedProps = properties.filter(p => p.assignedAgentId === s.id);
            const assignedPropIds = assignedProps.map(p => p.id);
            const assignedTenants = tenants.filter(t => t.propertyId && assignedPropIds.includes(t.propertyId));
            let scoreSum = 0, targetCount = 0;

            if (enabledTargets.includes('Rent Collection')) {
                const total = assignedTenants.length;
                const paid = assignedTenants.filter(t => (t.paymentHistory || []).some(p => p?.date?.startsWith(period) && p.status === 'Paid')).length;
                scoreSum += total > 0 ? (paid / total) * 100 : 0; targetCount++;
            }
            if (enabledTargets.includes('Occupancy')) {
                let total = 0, occupied = 0;
                assignedProps.forEach(p => { total += p.units.length; occupied += p.units.filter(u => u.status === 'Occupied').length; });
                scoreSum += total > 0 ? (occupied / total) * 100 : 0; targetCount++;
            }
            if (enabledTargets.includes('Signed Leases')) {
                const total = assignedTenants.length;
                scoreSum += total > 0 ? (assignedTenants.filter(t => t.leaseType === 'Fixed').length / total) * 100 : 0; targetCount++;
            }
            if (enabledTargets.includes('Task Completion')) {
                const agentTasks = tasks.filter(t => t.assignedTo === s.name && t.dueDate.startsWith(period));
                scoreSum += agentTasks.length > 0 ? (agentTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length / agentTasks.length) * 100 : 100; targetCount++;
            }
            if (enabledTargets.includes('Inventory Checklists')) {
                const records = offboardingRecords.filter(r => r.moveOutDate.startsWith(period) && assignedPropIds.includes(tenants.find(t => t.id === r.tenantId)?.propertyId || ''));
                scoreSum += records.length > 0 ? (records.filter(r => r.inspectionStatus !== 'Pending').length / records.length) * 100 : 100; targetCount++;
            }
            if (enabledTargets.includes('Vacant House Locking')) {
                const vacant = assignedProps.flatMap(p => p.units.filter(u => u.status === 'Vacant'));
                scoreSum += vacant.length > 0 ? (vacant.filter(u => u.isLocked).length / vacant.length) * 100 : 100; targetCount++;
            }
            if (enabledTargets.includes('Deposit Collection')) {
                const total = assignedTenants.length;
                scoreSum += total > 0 ? (assignedTenants.filter(t => (t.depositPaid || 0) >= (t.rentAmount || 0)).length / total) * 100 : 0; targetCount++;
            }

            const avgPerformance = targetCount > 0 ? scoreSum / targetCount : 0;
            return Math.round(targetSalary * (avgPerformance / 100));
        };
    }, [staff, properties, tenants, tasks, offboardingRecords]);

    // --- Generate Unified Expense Ledger ---
    const expensesLedger = useMemo(() => {
        const ledger: LedgerEntry[] = [];
        // 1. Salaries — use target-achieved gross for Target Based staff (Only Agency overhead)
        if (viewMode === 'agency') {
            staff.forEach(s => {
                if (s.status === 'Active') {
                    const effectiveGross = computeEffectiveGross(s);
                    const isTargetBased = s.salaryConfig?.type === 'Target Based';
                    ledger.push({
                        id: `salary-${s.id}`,
                        date: s.payrollInfo?.nextPaymentDate || getTodayIsoDate(),
                        property: s.branch || 'Headquarters',
                        description: `Salary: ${s.name}${isTargetBased ? ' (Target Based)' : ''}`,
                        totalAmount: effectiveGross,
                        agencyAmount: effectiveGross,
                        landlordAmount: 0,
                        category: 'Salary',
                        type: 'Expense'
                    });
                }
            });
        }

        // 2. Bills
        bills.forEach(b => {
            const isAgencyBill = !b.propertyId || b.propertyId === 'Agency';
            if ((viewMode === 'agency' && isAgencyBill) || (viewMode === 'landlord' && !isAgencyBill)) {
                
                const propName = isAgencyBill ? 'General / Overhead' : properties.find(p => p.id === b.propertyId)?.name || 'Unknown Property';
                ledger.push({
                    id: b.id,
                    date: b.dueDate,
                    property: propName,
                    description: `${b.category}: ${b.vendor}`,
                    totalAmount: b.amount,
                    agencyAmount: isAgencyBill ? b.amount : 0,
                    landlordAmount: isAgencyBill ? 0 : b.amount,
                    category: b.category,
                    type: 'Expense'
                });
            }
        });
        
        // 3. Maintenance Tasks (If Landlord View)
        if (viewMode === 'landlord') {
            tasks.forEach(t => {
                if ((t.status === 'Completed' || t.status === 'Closed') && t.costs) {
                    const totalCost = (t.costs.labor || 0) + (t.costs.materials || 0) + (t.costs.travel || 0);
                    if (totalCost > 0) {
                         const propName = properties.find(p => p.id === t.propertyId)?.name || 'Unknown Property';
                         ledger.push({
                             id: `task-${t.id}`,
                             date: t.dueDate,
                             property: propName,
                             description: `Maintenance Task: ${t.title}`,
                             totalAmount: totalCost,
                             agencyAmount: 0,
                             landlordAmount: totalCost,
                             category: 'Maintenance',
                             type: 'Expense'
                         });
                    }
                }
            });
        }

        return ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [staff, bills, tasks, properties, computeEffectiveGross, viewMode]);

    const filteredExpenses = useMemo(() => {
        return expensesLedger.filter(item => {
            const matchesSearch = item.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
            return matchesSearch && matchesCategory;
        });
    }, [expensesLedger, searchQuery, activeCategory]);

    const totalExpenses = filteredExpenses.reduce((sum, item) => sum + item.totalAmount, 0);

    // --- Analytics Data ---
    const categoryData = useMemo(() => {
        const counts: Record<string, number> = {};
        expensesLedger.forEach(l => counts[l.category] = (counts[l.category] || 0) + l.totalAmount);
        return counts;
    }, [expensesLedger]);

    const topVendors = useMemo(() => {
        const vendors: Record<string, number> = {};
        bills.forEach(b => {
             const isAgencyBill = !b.propertyId || b.propertyId === 'Agency';
             if ((viewMode === 'agency' && isAgencyBill) || (viewMode === 'landlord' && !isAgencyBill)) {
                 vendors[b.vendor] = (vendors[b.vendor] || 0) + b.amount;
             }
        });
        return Object.entries(vendors).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [bills, viewMode]);

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Expenses</h1>
                    <p className="text-lg text-gray-500 mt-1">Cost control and vendor management.</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('agency')}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${viewMode === 'agency' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}
                        >
                            Agency View
                        </button>
                        <button
                            onClick={() => setViewMode('landlord')}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${viewMode === 'landlord' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}
                        >
                            Portfolio View
                        </button>
                    </div>
                
                    <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-md flex items-center transition-transform active:scale-95">
                        <Icon name="plus" className="w-5 h-5 mr-2" /> Record Expense
                    </button>
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Burn (This Month)</p>
                    <h3 className="text-3xl font-extrabold text-gray-800 mt-2">KES {totalExpenses.toLocaleString()}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Top Category</p>
                    {(() => {
                        const allTotal = Object.values(categoryData).reduce((s, v) => s + v, 0);
                        const [topCat, topAmt] = Object.entries(categoryData).sort((a, b) => b[1] - a[1])[0] ?? ['—', 0];
                        const pct = allTotal > 0 ? Math.round((topAmt / allTotal) * 100) : 0;
                        return (
                            <>
                                <h3 className="text-3xl font-extrabold text-blue-600 mt-2 truncate">{topCat}</h3>
                                <p className="text-xs text-gray-500 mt-1">{pct}% of total spend</p>
                            </>
                        );
                    })()}
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pending Bills</p>
                    <h3 className="text-3xl font-extrabold text-orange-500 mt-2">{bills.filter(b => b.status !== 'Paid').length}</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Visualizations */}
                <div className="lg:col-span-1 space-y-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Expense Breakdown</h3>
                        <div className="h-64 flex justify-center">
                            <Pie data={{
                                labels: Object.keys(categoryData),
                                datasets: [{
                                    data: Object.values(categoryData),
                                    backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#64748b']
                                }]
                            }} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Top Vendors</h3>
                        <div className="space-y-4">
                            {topVendors.map(([name, amount], idx) => (
                                <div key={idx} className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-600">{idx + 1}</div>
                                        <span className="text-sm font-semibold text-gray-700">{name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-gray-800">KES {(amount/1000).toFixed(1)}k</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Ledger Table */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <h3 className="text-xl font-bold text-gray-800">Detailed Expense Log</h3>
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search..."
                            className="pl-4 pr-4 py-2 border rounded-lg w-full md:w-64 focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs">Date</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs">Description</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs">Category</th>
                                    <th className="px-4 py-3 text-right font-bold text-gray-500 uppercase text-xs">Amount</th>
                                    <th className="px-4 py-3 text-right font-bold text-gray-500 uppercase text-xs">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredExpenses.map(entry => (
                                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-gray-600">{entry.date}</td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{entry.description}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium">{entry.category}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-red-600">KES {entry.totalAmount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right">
                                            {entry.id.startsWith('bill') && canPay && (
                                                <button onClick={() => handlePayBill(entry.id)} className="text-blue-600 hover:underline text-xs font-bold mr-3">Pay</button>
                                            )}
                                            {entry.id.startsWith('bill') && canDelete && (
                                                <button onClick={() => deleteBill(entry.id)} className="text-gray-400 hover:text-red-500"><Icon name="close" className="w-4 h-4"/></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {isModalOpen && <RecordExpenseModal onClose={() => setIsModalOpen(false)} onSave={handleSaveBill} />}
        </div>
    );
};

export default Expenses;
