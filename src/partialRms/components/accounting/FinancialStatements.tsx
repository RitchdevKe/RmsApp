
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
import { isLateFeeType } from '@/utils/lateFees';

const FinancialStatements: React.FC = () => {
    const { tenants, bills, staff, properties, tasks, deductionRules, commissionRules, landlords } = useData();
    const [activeTab, setActiveTab] = useState<'pnl' | 'balance' | 'cashflow'>('pnl');
    const [viewMode, setViewMode] = useState<'Annual' | 'Quarterly' | 'Monthly'>('Monthly');
    
    const [financialPeriod, setFinancialPeriod] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    // --- Dynamic Data Calculation ---

    const pnlData = useMemo(() => {
        let managementFeesTotal = 0;
        let placementFeesTotal = 0;
        let lateFeesTotal = 0;
        let finesTotal = 0;

        // Late fees / Fines assessed this month - accrual method includes unpaid ones as well
        tenants.forEach(t => {
            const processFine = (f: any) => {
                if (f.date && String(f.date).startsWith(financialPeriod)) {
                    const amt = Number(f.amount) || 0;
                    if (isLateFeeType(f.type)) {
                        lateFeesTotal += amt;
                    } else {
                        finesTotal += amt;
                    }
                }
            };
            (t.existingTenantSetup?.fineLedger || (t as any).fineLedger || []).forEach(processFine);
            (t.outstandingFines || []).forEach(processFine);
        });

        // Calculate Management & Placement fees
        landlords.forEach(landlord => {
            const landlordProps = properties.filter(p => p.landlordId === landlord.id);
            if (landlordProps.length === 0) return;

            // Partial Management Revenue
            const partialProps = landlordProps.filter(p => p.managementType === 'Partial');
            if (partialProps.length > 0) {
                const partialResult = computePartialManagementInvoice(
                    tenants, partialProps, bills, tasks, commissionRules, financialPeriod
                );
                managementFeesTotal += partialResult.breakdown.managementFee;
                placementFeesTotal += partialResult.breakdown.placementFee;
            }

            // Full Management Revenue
            const fullProps = landlordProps.filter(p => p.managementType !== 'Partial');
            if (fullProps.length > 0) {
                let fullManagementFeesTotal = 0;
                fullProps.forEach(p => {
                    const propTenants = tenants.filter(t => t.propertyId === p.id);
                    const { rate, fixed } = getPropertyAgencyCommission(p, commissionRules);
                    
                    // Rent collected for this property in current period (includes rent arrears)
                    const propCollectedRent = propTenants.reduce((s, t) => s + sumTenantPaymentsInPeriod(t, financialPeriod), 0);
                    
                    // Base is expected rent for Occupancy Based, and actual collected rent for non-occupancy based
                    const propRentBase = (p.remittanceType === 'Occupancy Based')
                        ? propTenants.reduce((s, t) => s + (t.rentAmount || 0), 0)
                        : propCollectedRent;

                    // Arrears paid are added to revenue base. Fines are excluded from base because they are 100% agency revenue and accounted for globally.
                    const propTotalBase = propRentBase;
                    const fee = fixed !== null ? fixed : propTotalBase * rate;
                    fullManagementFeesTotal += fee;
                });
                managementFeesTotal += fullManagementFeesTotal;

                // Placement deduction for Full Props
                const pResult = computePlacementFeeDeduction(tenants, fullProps, financialPeriod);
                placementFeesTotal += pResult.placementFeeDeduction;
            }
        });

        const revenue = managementFeesTotal + placementFeesTotal + lateFeesTotal + finesTotal;

        // COGS (None for Agency)
        const cogs = 0;
        const grossProfit = revenue - cogs;

        // Expenses (OpEx: Salaries, Marketing, Office Rent)
        // Ensure salaries only count active staff or match period, for now just use base amount
        const salaries = staff.reduce((acc, s) => acc + (s.salaryConfig?.amount || 0), 0);
        
        // Agency Bills (Bills not assigned to a specific landlord's property)
        const otherBills = bills.filter(b => !b.propertyId && b.status === 'Paid' && b.invoiceDate.startsWith(financialPeriod)).reduce((acc, b) => acc + Number(b.amount || 0), 0);
        const expenses = salaries + otherBills;

        // Net Profit
        const netProfit = grossProfit - expenses;
        const netMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

        return { 
            revenue, 
            managementFeesTotal,
            placementFeesTotal,
            collectedFinesTotal: lateFeesTotal + finesTotal,
            lateFeesTotal,
            finesTotal,
            cogs, 
            grossProfit, 
            expenses, 
            salaries,
            otherBills,
            netProfit, 
            netMargin 
        };
    }, [tenants, bills, staff, properties, deductionRules, commissionRules, landlords, financialPeriod, tasks]);


    // 2. Balance Sheet Data
    const balanceSheetData = useMemo(() => {
        // Assets
        const cash = Math.max(0, pnlData.netProfit); // Simplified: Retained earnings as cash proxy

        // Accounts Receivable (Unpaid Fines/Late Fees)
        const unpaidFines = tenants.reduce((acc, t) => {
            let tenantUnpaid = 0;
            const processUnpaid = (f: any) => {
                if (f.status !== 'Paid') {
                    tenantUnpaid += Number(f.amount) || 0;
                }
            };
            (t.existingTenantSetup?.fineLedger || (t as any).fineLedger || []).forEach(processUnpaid);
            (t.outstandingFines || []).forEach(processUnpaid);
            return acc + tenantUnpaid;
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
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Revenue</p>
                    <p className="text-xl font-bold text-gray-900">KES {pnlData.revenue.toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold text-gray-500 uppercase">Net Profit</p>
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
                         <tr className="bg-gray-50/50 font-bold border-b border-gray-100">
                            <td className="px-4 py-3 text-gray-800">Revenue (Total)</td>
                            <td className="px-4 py-3 text-right font-bold">KES {pnlData.revenue.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">100%</td>
                        </tr>
                        <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 pl-8 text-gray-600 flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span>
                                Management Fees
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">KES {pnlData.managementFeesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.managementFeesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 pl-8 text-gray-600 flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2"></span>
                                Placement Fees
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">KES {pnlData.placementFeesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.placementFeesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 pl-8 text-gray-600 flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                                Late Fees (Accrued)
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">KES {pnlData.lateFeesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.lateFeesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 pl-8 text-gray-600 flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2"></span>
                                Fines (Accrued)
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">KES {pnlData.finesTotal.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.finesTotal/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-red-50/30">
                            <td className="px-4 py-3 pl-8 text-gray-600">Cost of Sales (Maint. & Utils)</td>
                            <td className="px-4 py-3 text-right text-red-600">(KES {pnlData.cogs.toLocaleString()})</td>
                            <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.cogs/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-gray-50 font-bold">
                            <td className="px-4 py-3 text-gray-800">Gross Profit</td>
                            <td className="px-4 py-3 text-right">KES {pnlData.grossProfit.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">{pnlData.revenue > 0 ? Math.round((pnlData.grossProfit/pnlData.revenue)*100) : 0}%</td>
                        </tr>
                        <tr className="bg-red-50/30">
                             <td className="px-4 py-3 pl-8 text-gray-600">Operating Expenses (Staff & Admin)</td>
                             <td className="px-4 py-3 text-right text-red-600">(KES {pnlData.expenses.toLocaleString()})</td>
                             <td className="px-4 py-3 text-right text-gray-500">{pnlData.revenue > 0 ? Math.round((pnlData.expenses/pnlData.revenue)*100) : 0}%</td>
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
                <div className="flex gap-3">
                    <input 
                        type="month" 
                        value={financialPeriod}
                        onChange={(e) => setFinancialPeriod(e.target.value)}
                        className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm"
                    />
                     <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="px-3 py-2 bg-white border rounded-lg text-sm font-bold shadow-sm">
                        <option>Monthly</option>
                        <option>Quarterly</option>
                        <option>Annual</option>
                     </select>
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
