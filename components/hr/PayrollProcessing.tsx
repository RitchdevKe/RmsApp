import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { StaffProfile, SalaryType, Bill } from '../../types';
import { exportToCSV, printSection } from '../../utils/exportHelper';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// --- HELPER COMPONENTS ---

const SummaryCard: React.FC<{ title: string; value: string; subtext?: string; color: string; icon: string }> = ({ title, value, subtext, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4 ${color.replace('text-', 'border-')} flex justify-between items-start`}>
        <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
            {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-2 rounded-full bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
            <Icon name={icon} className={`w-6 h-6 ${color}`} />
        </div>
    </div>
);

const PayslipModal: React.FC<{ entry: any; onClose: () => void }> = ({ entry, onClose }) => {
    const handlePrint = () => {
        printSection('printable-payslip-modal', `Payslip-${entry.staffName}-${entry.period}`);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-800">Payslip Details</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="p-8 overflow-y-auto" id="printable-payslip-modal">
                    <div className="text-center mb-6 border-b pb-4">
                        <h2 className="text-2xl font-bold text-primary uppercase tracking-widest">TaskMe Realty</h2>
                        <p className="text-gray-500 text-sm">Payslip for {entry.period}</p>
                    </div>

                    <div className="flex justify-between mb-6 text-sm">
                        <div>
                            <p className="text-gray-500">Employee</p>
                            <p className="font-bold text-gray-900">{entry.staffName}</p>
                            <p className="text-xs text-gray-500">{entry.role}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-gray-500">Payroll ID</p>
                            <p className="font-mono font-bold text-gray-900">{entry.id}</p>
                            <p className="text-xs text-gray-500">{entry.status}</p>
                        </div>
                    </div>

                    <table className="w-full text-sm mb-6">
                        <thead>
                            <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
                                <th className="py-2 px-2 text-left">Description</th>
                                <th className="py-2 px-2 text-right">Earnings</th>
                                <th className="py-2 px-2 text-right">Deductions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                             {/* Specific Logic for Field Agents (Target Based) display */}
                             {entry.metrics ? (
                                <>
                                    <tr>
                                        <td className="py-2 px-2 font-bold text-blue-600" colSpan={3}>Performance Metrics (Avg: {entry.metrics.average}%)</td>
                                    </tr>
                                    {Object.entries(entry.metrics).filter(([k]) => k !== 'average').map(([key, val]) => (
                                        <tr key={key}>
                                            <td className="py-2 px-2 pl-4 text-xs capitalize">{key.replace(/([A-Z])/g, ' $1')} ({val as React.ReactNode}%)</td>
                                            <td className="py-2 px-2 text-right text-xs">Included</td>
                                            <td className="py-2 px-2 text-right">-</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-blue-50">
                                        <td className="py-2 px-2 font-bold">Target Salary Achievement</td>
                                        <td className="py-2 px-2 text-right font-bold">{entry.gross.toLocaleString()}</td>
                                        <td className="py-2 px-2 text-right">-</td>
                                    </tr>
                                </>
                             ) : (
                                <tr>
                                    <td className="py-2 px-2">Basic Salary</td>
                                    <td className="py-2 px-2 text-right">{entry.basic.toLocaleString()}</td>
                                    <td className="py-2 px-2 text-right">-</td>
                                </tr>
                             )}
                            
                            {entry.commissions > 0 && (
                                <tr>
                                    <td className="py-2 px-2">Commissions & Bonuses</td>
                                    <td className="py-2 px-2 text-right">{entry.commissions.toLocaleString()}</td>
                                    <td className="py-2 px-2 text-right">-</td>
                                </tr>
                            )}
                            <tr>
                                <td className="py-2 px-2 text-red-600">PAYE (Tax)</td>
                                <td className="py-2 px-2 text-right">-</td>
                                <td className="py-2 px-2 text-right text-red-600">{entry.tax.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td className="py-2 px-2 text-red-600">NHIF</td>
                                <td className="py-2 px-2 text-right">-</td>
                                <td className="py-2 px-2 text-right text-red-600">{entry.nhif.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td className="py-2 px-2 text-red-600">NSSF</td>
                                <td className="py-2 px-2 text-right">-</td>
                                <td className="py-2 px-2 text-right text-red-600">{entry.nssf.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td className="py-2 px-2 text-red-600">Housing Levy</td>
                                <td className="py-2 px-2 text-right">-</td>
                                <td className="py-2 px-2 text-right text-red-600">{entry.housingLevy.toLocaleString()}</td>
                            </tr>
                             {entry.otherDeductions > 0 && (
                                <tr>
                                    <td className="py-2 px-2 text-red-600">Other Deductions</td>
                                    <td className="py-2 px-2 text-right">-</td>
                                    <td className="py-2 px-2 text-right text-red-600">{entry.otherDeductions.toLocaleString()}</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200">
                            <tr>
                                <td className="py-3 px-2">Net Pay</td>
                                <td className="py-3 px-2 text-right text-gray-400"></td>
                                <td className="py-3 px-2 text-right text-lg text-primary">KES {entry.net.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    <div className="text-center text-xs text-gray-400 mt-8">
                        <p>Funds transferred to: {entry.bankDetails}</p>
                        <p className="mt-1">Generated by TaskMe System</p>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-100">Close</button>
                    <button onClick={handlePrint} className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark shadow-sm flex items-center">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Download PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

const PayrollProcessing: React.FC = () => {
    const { staff, tenants, properties, tasks, addBill, updateStaff, offboardingRecords, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canProcessPayroll = isSuperAdmin || checkPermission('Users', 'edit');
    const [period, setPeriod] = useState(getCurrentMonthIso()); // YYYY-MM
    const [payrollStatus, setPayrollStatus] = useState<'Draft' | 'Processed' | 'Paid'>('Draft');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

    // --- LOGIC: Calculate Payroll for the period ---
    const payrollData = useMemo(() => {
        return staff.filter(s => s.status === 'Active').map(s => {
            let basic = s.salaryConfig?.amount || 0;
            const commissions = s.commissions?.reduce((sum, c) => sum + c.amount, 0) || 0;
            let gross = basic + commissions;
            let metrics: any = null;

            // --- TARGET BASED CALCULATION LOGIC FOR FIELD AGENTS ---
            if (s.salaryConfig?.type === 'Target Based' && s.role === 'Field Agent') {
                const targetSalary = s.salaryConfig.amount;
                const enabledTargets = s.salaryConfig.activeTargets || [];
                
                // 1. Identify Assigned Scope
                const assignedProps = properties.filter(p => p.assignedAgentId === s.id);
                const assignedPropIds = assignedProps.map(p => p.id);
                const assignedTenants = tenants.filter(t => t.propertyId && assignedPropIds.includes(t.propertyId));
                
                // Metrics Storage
                const metricScores: Record<string, number> = {};
                let scoreSum = 0;
                let targetCount = 0;

                // --- 1. Rent Collection Percentage ---
                if (enabledTargets.includes('Rent Collection')) {
                    const totalAssignedTenants = assignedTenants.length;
                    let paidTenantsCount = 0;
                    assignedTenants.forEach(t => {
                        const hasPaid = t.paymentHistory.some(p => p.date.startsWith(period) && p.status === 'Paid');
                        if (hasPaid) paidTenantsCount++;
                    });
                    const rate = totalAssignedTenants > 0 ? (paidTenantsCount / totalAssignedTenants) * 100 : 0;
                    metricScores['collection'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- 2. Occupancy Percentage ---
                if (enabledTargets.includes('Occupancy')) {
                    let totalUnits = 0;
                    let occupiedUnits = 0;
                    assignedProps.forEach(p => {
                        totalUnits += p.units.length;
                        occupiedUnits += p.units.filter(u => u.status === 'Occupied').length;
                    });
                    const rate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
                    metricScores['occupancy'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- 3. Percentage of Signed Leases ---
                if (enabledTargets.includes('Signed Leases')) {
                    // Assuming 'Fixed' lease type or active status implies signed lease vs 'Open'
                    const activeTenantCount = assignedTenants.length;
                    const signedLeaseCount = assignedTenants.filter(t => t.leaseType === 'Fixed').length; 
                    // Or check documents existence if that data was robust
                    const rate = activeTenantCount > 0 ? (signedLeaseCount / activeTenantCount) * 100 : 0;
                    metricScores['signedLeases'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- 4. Percentage of Completed Tasks ---
                if (enabledTargets.includes('Task Completion')) {
                    const agentTasks = tasks.filter(t => t.assignedTo === s.name); 
                    const monthlyTasks = agentTasks.filter(t => t.dueDate.startsWith(period));
                    const completedTasks = monthlyTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
                    const totalTasks = monthlyTasks.length;
                    // If no tasks assigned, 100% score (didn't fail any)
                    const rate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100;
                    metricScores['taskCompletion'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- 5. Inventory Checklist Signed ---
                if (enabledTargets.includes('Inventory Checklists')) {
                    // Look at offboarding records for this agent's properties in this month
                    const monthRecords = offboardingRecords.filter(r => 
                        r.moveOutDate.startsWith(period) && 
                        assignedPropIds.includes(tenants.find(t => t.id === r.tenantId)?.propertyId || '')
                    );
                    const totalNotices = monthRecords.length;
                    const signedChecklists = monthRecords.filter(r => r.inspectionStatus !== 'Pending').length;
                    
                    const rate = totalNotices > 0 ? (signedChecklists / totalNotices) * 100 : 100; // 100 if no notices
                    metricScores['inventoryChecklists'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- 6. Vacant Houses Locked ---
                if (enabledTargets.includes('Vacant House Locking')) {
                    const vacantUnits = assignedProps.flatMap(p => p.units.filter(u => u.status === 'Vacant'));
                    const totalVacant = vacantUnits.length;
                    const lockedVacant = vacantUnits.filter(u => u.isLocked).length;
                    
                    const rate = totalVacant > 0 ? (lockedVacant / totalVacant) * 100 : 100; // 100 if no vacancies
                    metricScores['vacantLocked'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- 7. Deposits Collected ---
                if (enabledTargets.includes('Deposit Collection')) {
                    const totalTenants = assignedTenants.length;
                    // Check tenants with depositPaid > 0 or matching rentAmount
                    const depositPaidCount = assignedTenants.filter(t => (t.depositPaid || 0) >= (t.rentAmount || 0)).length;
                    
                    const rate = totalTenants > 0 ? (depositPaidCount / totalTenants) * 100 : 0;
                    metricScores['depositsCollected'] = Math.round(rate);
                    scoreSum += rate;
                    targetCount++;
                }

                // --- Final Average Calculation ---
                const avgPerformance = targetCount > 0 ? scoreSum / targetCount : 0;
                
                // Actual Pay
                basic = targetSalary * (avgPerformance / 100);
                gross = basic + commissions;
                
                metrics = {
                    ...metricScores,
                    average: Math.round(avgPerformance)
                };
            }

            const hasSalaryAllocation =
                (s.salaryConfig?.amount ?? 0) > 0 || (s.payrollInfo?.baseSalary ?? 0) > 0;

            const otherDeductions = (s.deductions || []).reduce((sum, d) => sum + d.amount, 0);

            // Statutory (NHIF/NSSF/PAYE/Housing) only when a salary amount has been allocated to the employee
            let nssf = 0;
            let nhif = 0;
            let housingLevy = 0;
            let paye = 0;
            if (hasSalaryAllocation && gross > 0) {
                nssf = 1080; // Tier II cap approx
                nhif = 1500; // Simplified average
                housingLevy = gross * 0.015;
                const taxable = gross - nssf;
                const tax = taxable * 0.30 - 2400; // Simplified PAYE (30% minus relief)
                paye = Math.max(0, tax);
            }

            const totalDeductions = paye + nhif + nssf + housingLevy + otherDeductions;
            const net = gross - totalDeductions;

            return {
                id: s.id,
                staffName: s.name,
                role: s.role,
                department: s.department,
                basic,
                commissions,
                gross,
                paye,
                nhif,
                nssf,
                housingLevy,
                otherDeductions,
                totalDeductions,
                net,
                status: payrollStatus,
                period,
                bankDetails: s.bankDetails?.accountNumber || s.bankDetails?.mpesaNumber || 'N/A',
                metrics // Attached for Target Based
            };
        });
    }, [staff, period, payrollStatus, properties, tenants, tasks, offboardingRecords]);

    const filteredData = useMemo(() => {
        return payrollData.filter(p => 
            p.staffName.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.role.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [payrollData, searchQuery]);

    // --- SUMMARY STATS ---
    const totals = useMemo(() => {
        return payrollData.reduce((acc, curr) => ({
            gross: acc.gross + curr.gross,
            net: acc.net + curr.net,
            tax: acc.tax + curr.paye,
            statutory: acc.statutory + curr.nhif + curr.nssf + curr.housingLevy
        }), { gross: 0, net: 0, tax: 0, statutory: 0 });
    }, [payrollData]);

    const handleRunPayroll = () => {
        if (!canProcessPayroll) return alert('You do not have permission to process payroll.');
        // Simulate processing
        setPayrollStatus('Processed');
        alert("Payroll processed successfully. Please review before disbursing.");
    };

    const handleDisburse = () => {
        if (!canProcessPayroll) return alert('You do not have permission to disburse payroll.');
        if (confirm(`Confirm disbursement of KES ${totals.net.toLocaleString()} to ${payrollData.length} employees? This will create expense records.`)) {
            // 1. Create Bill Records for Accounting
            payrollData.forEach(p => {
                const bill: Bill = {
                    id: `sal-${Date.now()}-${p.id}`,
                    vendor: p.staffName,
                    category: 'Salary',
                    amount: p.net,
                    invoiceDate: getTodayIsoDate(),
                    dueDate: getTodayIsoDate(),
                    status: 'Paid',
                    propertyId: 'Agency', // Corporate expense
                    description: `Salary for ${p.period}`
                };
                addBill(bill);

                // 2. Update Staff Next Payment Date
                const currentNextDate = new Date(p.period + '-01'); // YYYY-MM-01
                const nextMonth = new Date(currentNextDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                nextMonth.setDate(25); // Set to 25th of next month
                
                updateStaff(p.id, { 
                    payrollInfo: { 
                        baseSalary: p.basic, 
                        nextPaymentDate: nextMonth.toISOString().split('T')[0] 
                    } 
                });
            });

            setPayrollStatus('Paid');
            alert("Payments disbursed successfully via registered payment methods. Expenses recorded.");
        }
    };

    const handleReset = () => {
        setPayrollStatus('Draft');
    };

    const handleExport = () => {
        const data = filteredData.map(p => ({
            Name: p.staffName,
            Role: p.role,
            Basic: p.basic,
            Gross: p.gross,
            PAYE: p.paye,
            Net_Pay: p.net,
            Status: p.status,
            Account: p.bankDetails
        }));
        exportToCSV(data, `Payroll_${period}`);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Payroll Processing</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage salaries, statutory deductions, and disbursements.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                    <label className="text-sm font-bold text-gray-600 pl-2">Period:</label>
                    <input 
                        type="month" 
                        value={period} 
                        onChange={e => { setPeriod(e.target.value); setPayrollStatus('Draft'); }} 
                        className="p-2 border rounded-lg bg-gray-50 font-medium text-gray-800 outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryCard title="Total Gross Pay" value={`KES ${(totals.gross/1000).toFixed(1)}k`} subtext="Before Deductions" color="text-gray-800" icon="stack" />
                <SummaryCard title="Net Payable" value={`KES ${(totals.net/1000).toFixed(1)}k`} subtext="To Employees" color="text-green-600" icon="wallet" />
                <SummaryCard title="Taxes (PAYE)" value={`KES ${(totals.tax/1000).toFixed(1)}k`} subtext="Remittance Due" color="text-red-600" icon="accounting" />
                <SummaryCard title="Statutory (NHIF/NSSF)" value={`KES ${(totals.statutory/1000).toFixed(1)}k`} subtext="Combined Levy" color="text-blue-600" icon="branch" />
            </div>

            {/* Main Action Area */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col xl:flex-row justify-between items-center mb-6 gap-4">
                    <div className="flex items-center gap-2 w-full xl:w-auto">
                        <div className="relative flex-grow xl:flex-grow-0">
                            <input 
                                type="text" 
                                placeholder="Search employee..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full xl:w-64 pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                            />
                            <Icon name="search" className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                        </div>
                        
                        <div className="hidden md:flex items-center space-x-2">
                             <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                payrollStatus === 'Draft' ? 'bg-gray-100 text-gray-600' :
                                payrollStatus === 'Processed' ? 'bg-blue-100 text-blue-700' :
                                'bg-green-100 text-green-700'
                             }`}>
                                {payrollStatus}
                             </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 w-full xl:w-auto justify-end">
                        <button onClick={handleExport} className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                            <Icon name="download" className="w-4 h-4 mr-2" /> Export CSV
                        </button>
                        
                        {payrollStatus === 'Draft' && (
                            <button onClick={handleRunPayroll} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md flex items-center">
                                <Icon name="settings" className="w-4 h-4 mr-2" /> Run Payroll
                            </button>
                        )}
                        
                        {payrollStatus === 'Processed' && (
                            <>
                                <button onClick={handleReset} className="px-4 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">
                                    Edit / Reset
                                </button>
                                <button onClick={handleDisburse} className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md flex items-center">
                                    <Icon name="check" className="w-4 h-4 mr-2" /> Disburse Funds
                                </button>
                            </>
                        )}
                        
                         {payrollStatus === 'Paid' && (
                             <button disabled className="px-6 py-2.5 bg-gray-100 text-green-700 border border-green-200 font-bold rounded-lg flex items-center cursor-default">
                                <Icon name="check" className="w-4 h-4 mr-2" /> Payroll Closed
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Basic / Target</th>
                                <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Allowances</th>
                                <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Gross</th>
                                <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Deductions</th>
                                <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Net Pay</th>
                                <th className="px-6 py-3 text-center font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredData.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{row.staffName}</div>
                                        <div className="text-xs text-gray-500">{row.role}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600">
                                        {row.metrics ? (
                                            <div className="flex flex-col items-end">
                                                <span>{row.basic.toLocaleString()}</span>
                                                <span className="text-[9px] text-blue-500 font-bold">Achieved: {row.metrics.average}%</span>
                                            </div>
                                        ) : (
                                            row.basic.toLocaleString()
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600">{row.commissions.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-800">{row.gross.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-red-500">-{row.totalDeductions.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-bold text-green-600">KES {row.net.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">
                                         <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            row.status === 'Draft' ? 'bg-gray-100 text-gray-500' :
                                            row.status === 'Processed' ? 'bg-blue-100 text-blue-600' :
                                            'bg-green-100 text-green-600'
                                         }`}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setSelectedEntry(row)}
                                            className="text-primary hover:text-primary-dark font-semibold text-xs border border-primary/20 px-3 py-1.5 rounded hover:bg-primary/5 transition-colors"
                                        >
                                            View Slip
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic">No employees found matching filter.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            {selectedEntry && <PayslipModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
        </div>
    );
};

export default PayrollProcessing;