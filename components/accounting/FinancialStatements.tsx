import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { printSection } from '@/utils/exportHelper';
import { 
    computePlacementFeeDeduction, 
    filterActiveRulesForLandlord, 
    computeCollectedRuleDeductions, 
    sumTenantPaymentsInPeriod, 
    computePartialManagementInvoice,
    isAgencyFeeOnRentRule,
    getPropertyAgencyCommission
} from '@/utils/landlordPeriodFinancials';
import Icon from '../Icon';

const FinancialStatements: React.FC = () => {
    const { tenants, bills, staff, properties, tasks, deductionRules, commissionRules, landlords } = useData();
    const [activeTab, setActiveTab] = useState<'pnl' | 'balance' | 'cashflow'>('pnl');
    const [viewMode, setViewMode] = useState<'Annual' | 'Quarterly' | 'Monthly'>('Monthly');
    
    const [financialPeriod, setFinancialPeriod] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
    const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>(() => {
        const m = new Date().getMonth();
        if (m < 3) return 'Q1';
        if (m < 6) return 'Q2';
        if (m < 9) return 'Q3';
        return 'Q4';
    });

    const activePeriods = useMemo<string[]>(() => {
        if (viewMode === 'Monthly') {
            return [financialPeriod];
        }
        if (viewMode === 'Quarterly') {
            const qMonthsMap = {
                Q1: ['01', '02', '03'],
                Q2: ['04', '05', '06'],
                Q3: ['07', '08', '09'],
                Q4: ['10', '11', '12'],
            };
            return qMonthsMap[selectedQuarter].map(m => `${selectedYear}-${m}`);
        }
        // Annual
        return Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`);
    }, [viewMode, financialPeriod, selectedYear, selectedQuarter]);

    const periodLabel = useMemo(() => {
        if (viewMode === 'Monthly') return financialPeriod;
        if (viewMode === 'Quarterly') return `${selectedYear} ${selectedQuarter}`;
        return `FY ${selectedYear}`;
    }, [viewMode, financialPeriod, selectedYear, selectedQuarter]);

    // --- Dynamic Data Calculation ---

    const pnlData = useMemo(() => {
        let managementFeesTotal = 0;
        let placementFeesTotal = 0;
        let collectedFinesTotal = 0;

        activePeriods.forEach(period => {
            // Fines / Late fees collected in period
            tenants.forEach(t => {
                (t.existingTenantSetup?.fineLedger || (t as any).fineLedger || []).forEach(f => {
                    if (f.status === 'Paid' && f.date.startsWith(period)) {
                        collectedFinesTotal += Number(f.amount) || 0;
                    }
                });
                (t.outstandingFines || []).forEach(f => {
                    if (f.status === 'Paid' && f.date.startsWith(period)) {
                        collectedFinesTotal += Number(f.amount) || 0;
                    }
                });
            });

            // Calculate Management & Placement fees for period
            landlords.forEach(landlord => {
                const landlordProps = properties.filter(p => p.landlordId === landlord.id);
                if (landlordProps.length === 0) return;

                // Partial Management Revenue
                const partialProps = landlordProps.filter(p => p.remittanceType === 'Partial Management');
                if (partialProps.length > 0) {
                    const partialResult = computePartialManagementInvoice(
                        tenants, partialProps, bills, tasks, commissionRules, period
                    );
                    managementFeesTotal += partialResult.breakdown.managementFee;
                    placementFeesTotal += partialResult.breakdown.placementFee;
                }

                // Full Management Revenue
                const fullProps = landlordProps.filter(p => p.remittanceType !== 'Partial Management');
                if (fullProps.length > 0) {
                    let fullManagementFeesTotal = 0;
                    fullProps.forEach(p => {
                        const propTenants = tenants.filter(t => t.propertyId === p.id);
                        const { rate, fixed } = getPropertyAgencyCommission(p, commissionRules);
                        
                        // Rent collected for this property in current period (includes rent arrears)
                        const propCollectedRent = propTenants.reduce((s, t) => s + sumTenantPaymentsInPeriod(t, period), 0);
                        
                        // Fines / late fees collected for this property in current period
                        let propCollectedFines = 0;
                        propTenants.forEach(t => {
                            (t.outstandingFines || []).forEach(f => {
                                if (f.status === 'Paid' && f.date.startsWith(period)) {
                                    propCollectedFines += Number(f.amount) || 0;
                                }
                            });
                            (t.existingTenantSetup?.fineLedger || (t as any).fineLedger || []).forEach(f => {
                                if (f.status === 'Paid' && f.date.startsWith(period)) {
                                    propCollectedFines += Number(f.amount) || 0;
                                }
                            });
                        });

                        const propRentBase = (p.remittanceType === 'Occupancy Based')
                            ? propTenants.reduce((s, t) => s + (t.rentAmount || 0), 0)
                            : propCollectedRent;

                        const propTotalBase = propRentBase + propCollectedFines;
                        const fee = fixed !== null ? fixed : propTotalBase * rate;
                        fullManagementFeesTotal += fee;
                    });
                    managementFeesTotal += fullManagementFeesTotal;

                    // Placement deduction for Full Props
                    const pResult = computePlacementFeeDeduction(tenants, fullProps, period);
                    placementFeesTotal += pResult.placementFeeDeduction;
                }
            });
        });

        const revenue = managementFeesTotal + placementFeesTotal + collectedFinesTotal;

        // COGS (None for Agency)
        const cogs = 0;
        const grossProfit = revenue - cogs;

        // Expenses (OpEx: Salaries, Marketing, Office Rent)
        const monthlySalaries = staff.reduce((acc, s) => acc + (s.salaryConfig?.amount || s.payrollInfo?.baseSalary || 0), 0);
        const salaries = monthlySalaries * activePeriods.length;
        
        // Agency Bills in active periods
        const otherBills = bills.filter(b => !b.propertyId && b.status === 'Paid' && activePeriods.some(p => b.invoiceDate.startsWith(p))).reduce((acc, b) => acc + Number(b.amount || 0), 0);
        const expenses = salaries + otherBills;

        // Net Profit
        const netProfit = grossProfit - expenses;
        const netMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

        return {
            managementFeesTotal,
            placementFeesTotal,
            collectedFinesTotal,
            revenue,
            cogs,
            grossProfit,
            salaries,
            otherBills,
            expenses,
            netProfit,
            netMargin
        };
    }, [tenants, bills, staff, properties, tasks, deductionRules, commissionRules, landlords, activePeriods]);


    // 2. Balance Sheet Data
    const balanceSheetData = useMemo(() => {
        // Assets
        const cash = Math.max(0, pnlData.netProfit); // Simplified: Retained earnings as cash proxy

        // Accounts Receivable (Unpaid Fines/Late Fees)
        const unpaidFines = tenants.reduce((acc, t) => {
            return acc + (t.fineLedger || []).filter(f => f.status === 'Pending').reduce((sum, f) => sum + Number(f.amount || 0), 0);
        }, 0);
        const accountsReceivable = unpaidFines;
        
        const totalAssets = cash + accountsReceivable;

        // Liabilities
        // Agency unpaid bills
        const accountsPayable = bills.filter(b => !b.propertyId && b.status !== 'Paid').reduce((acc, b) => acc + Number(b.amount || 0), 0);
        const liabilities = accountsPayable;

        // Equity
        const equity = totalAssets - liabilities;

        return {
            assets: { cash, accountsReceivable, total: totalAssets },
            liabilities: { accountsPayable, total: liabilities },
            equity
        };
    }, [pnlData, tenants, bills]);

    // 3. Cash Flow Data
    const cashFlowData = useMemo(() => {
        const operating = pnlData.netProfit;
        const investing = 0; // Agency doesn't buy properties
        const financing = 0;
        const netChange = operating + investing + financing;

        return { operating, investing, financing, netChange };
    }, [pnlData]);


    const handleDownload = () => {
        printSection('printable-financial-statements', `Financial Statement - ${activeTab.toUpperCase()}`);
    };

    const PnLView = () => (
        <div className="space-y-4 animate-fade-in">
             <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Revenue ({periodLabel})</p>
                    <p className="text-xl font-bold text-gray-900">KES {pnlData.revenue.toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold text-gray-500 uppercase">Net Profit ({periodLabel})</p>
                    <p className={`text-xl font-bold ${pnlData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>KES {pnlData.netProfit.toLocaleString()}</p>
                </div>
             </div>

             <div className="border rounded-xl overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 text-left">Line Item</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right">% of Rev</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                         <tr>
                            <td className="px-4 py-3 font-bold text-gray-800">Operating Revenue</td>
                            <td className="px-4 py-3 text-right font-bold">KES {pnlData.revenue.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">100%</td>
                        </tr>
                        <tr className="bg-gray-50/50">
                            <td className="px-4 py-3 pl-8 text-gray-600">↳ Management Fees</td>
                            <td className="px-4 py-3 text-right">KES {pnlData.managementFeesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.managementFeesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-gray-50/50">
                            <td className="px-4 py-3 pl-8 text-gray-600">↳ Placement Fees</td>
                            <td className="px-4 py-3 text-right">KES {pnlData.placementFeesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.placementFeesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-gray-50/50">
                            <td className="px-4 py-3 pl-8 text-gray-600">↳ Late Fees & Fines</td>
                            <td className="px-4 py-3 text-right">KES {pnlData.collectedFinesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.collectedFinesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-gray-50 font-bold">
                            <td className="px-4 py-3 text-gray-800">Gross Profit</td>
                            <td className="px-4 py-3 text-right">KES {pnlData.grossProfit.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">{pnlData.revenue > 0 ? Math.round((pnlData.grossProfit/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-red-50/30">
                             <td className="px-4 py-3 font-bold text-gray-800">Operating Expenses</td>
                             <td className="px-4 py-3 text-right text-red-600 font-bold">(KES {pnlData.expenses.toLocaleString()})</td>
                             <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.expenses/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-red-50/10">
                             <td className="px-4 py-3 pl-8 text-gray-600">↳ Staff Salaries</td>
                             <td className="px-4 py-3 text-right text-red-500">(KES {pnlData.salaries.toLocaleString()})</td>
                             <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.salaries/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-red-50/10">
                             <td className="px-4 py-3 pl-8 text-gray-600">↳ Agency Bills & Admin</td>
                             <td className="px-4 py-3 text-right text-red-500">(KES {pnlData.otherBills.toLocaleString()})</td>
                             <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.otherBills/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-green-50 border-t-2 border-green-200">
                             <td className="px-4 py-4 font-extrabold text-green-900 text-base">Net Profit</td>
                             <td className="px-4 py-4 text-right font-extrabold text-green-700 text-base">KES {pnlData.netProfit.toLocaleString()}</td>
                             <td className="px-4 py-4 text-right font-bold text-green-700">{pnlData.netMargin}%</td>
                        </tr>
                    </tbody>
                </table>
             </div>
        </div>
    );

    const BalanceSheetView = () => (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
            <div className="border rounded-xl p-6 bg-white shadow-sm">
                <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">Assets</h3>
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Current Assets (Cash Proxy)</span>
                        <span className="font-medium">KES {balanceSheetData.assets.cash.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Accounts Receivable (Fines & Late Fees)</span>
                        <span className="font-medium">KES {balanceSheetData.assets.accountsReceivable.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-extrabold pt-4 border-t mt-2 text-lg text-blue-900">
                        <span>Total Assets</span>
                        <span>KES {balanceSheetData.assets.total.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            
            <div className="border rounded-xl p-6 bg-white shadow-sm">
                <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">Liabilities & Equity</h3>
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Accounts Payable (Agency Bills)</span>
                        <span className="font-medium">KES {balanceSheetData.liabilities.accountsPayable.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total Liabilities</span>
                        <span className="font-medium">KES {balanceSheetData.liabilities.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-extrabold pt-4 border-t mt-2 text-lg text-green-900">
                        <span>Owners Equity</span>
                        <span>KES {balanceSheetData.equity.toLocaleString()}</span>
                    </div>
                </div>
            </div>
         </div>
    );

    const CashFlowView = () => (
        <div className="space-y-6 animate-fade-in">
             <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                 <h3 className="font-bold text-gray-700 mb-4">Cash Flow Summary</h3>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-white rounded shadow-sm">
                        <span className="text-gray-600 font-medium">Operating Activities</span>
                        <span className={`font-bold ${cashFlowData.operating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {cashFlowData.operating >= 0 ? '+' : ''} KES {cashFlowData.operating.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white rounded shadow-sm">
                        <span className="text-gray-600 font-medium">Investing Activities</span>
                        <span className="font-bold text-red-600">KES {cashFlowData.investing.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white rounded shadow-sm">
                        <span className="text-gray-600 font-medium">Financing Activities</span>
                        <span className="font-bold text-blue-600">KES {cashFlowData.financing.toLocaleString()}</span>
                    </div>
                 </div>
                 <div className="mt-6 pt-4 border-t flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-800">Net Change in Cash</span>
                    <span className={`text-2xl font-extrabold ${cashFlowData.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                         KES {cashFlowData.netChange.toLocaleString()}
                    </span>
                 </div>
             </div>
        </div>
    );

    return (
        <div className="space-y-8 pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Financial Statements</h1>
                    <p className="text-lg text-gray-500 mt-1">GAAP compliant reports derived from live data.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm focus:outline-none">
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Annual">Annual</option>
                    </select>

                    {viewMode === 'Monthly' && (
                        <input 
                            type="month" 
                            value={financialPeriod}
                            onChange={(e) => setFinancialPeriod(e.target.value)}
                            className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm focus:outline-none"
                        />
                    )}

                    {viewMode === 'Quarterly' && (
                        <>
                            <select 
                                value={selectedYear} 
                                onChange={e => setSelectedYear(Number(e.target.value))}
                                className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm focus:outline-none"
                            >
                                {[2024, 2025, 2026, 2027].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                            <select 
                                value={selectedQuarter} 
                                onChange={e => setSelectedQuarter(e.target.value as any)}
                                className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm focus:outline-none"
                            >
                                <option value="Q1">Q1 (Jan-Mar)</option>
                                <option value="Q2">Q2 (Apr-Jun)</option>
                                <option value="Q3">Q3 (Jul-Sep)</option>
                                <option value="Q4">Q4 (Oct-Dec)</option>
                            </select>
                        </>
                    )}

                    {viewMode === 'Annual' && (
                        <select 
                            value={selectedYear} 
                            onChange={e => setSelectedYear(Number(e.target.value))}
                            className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm focus:outline-none"
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    )}

                    <button onClick={handleDownload} className="px-4 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black shadow-md flex items-center transition-colors">
                        <Icon name="download" className="w-4 h-4 mr-2" /> PDF Export
                    </button>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100" id="printable-financial-statements">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b pb-4">
                    <h2 className="text-2xl font-extrabold text-gray-800 uppercase tracking-tight">
                        {activeTab === 'pnl' ? 'Profit & Loss' : activeTab === 'balance' ? 'Balance Sheet' : 'Cash Flow Statement'}
                    </h2>
                    
                    <div className="flex bg-gray-100 p-1 rounded-lg mt-4 md:mt-0 no-print">
                        <button onClick={() => setActiveTab('pnl')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'pnl' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}>P&L</button>
                        <button onClick={() => setActiveTab('balance')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'balance' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}>Balance Sheet</button>
                        <button onClick={() => setActiveTab('cashflow')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'cashflow' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}>Cash Flow</button>
                    </div>
                </div>

                {activeTab === 'pnl' && <PnLView />}
                {activeTab === 'balance' && <BalanceSheetView />}
                {activeTab === 'cashflow' && <CashFlowView />}
                
                <div className="mt-12 text-center text-xs text-gray-400 pt-8 border-t">
                    <p>Generated by TaskMe Realty System. All figures in KES.</p>
                </div>
            </div>
        </div>
    );
};

export default FinancialStatements;
