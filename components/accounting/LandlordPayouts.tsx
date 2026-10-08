
import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { sumTenantPaymentsInPeriod, getPropertyAgencyCommission } from '../../utils/landlordPeriodFinancials';
import { getCurrentMonthIso } from '../../utils/timezone';


// Extended interface for the comprehensive view
interface DetailedStatement {
    id: string;
    landlordId: string;
    landlordName: string;
    period: string;
    status: 'Paid' | 'Pending' | 'Disputed';
    
    // Financials
    totalProperties: number;
    totalUnits: number;
    occupancyRate: number;
    
    // Breakdown
    grossRent: number;
    breakdown: {
        properties: Array<{ name: string, collected: number, unitCount: number }>;
        deductions: Array<{ item: string, amount: number }>;
    };
    
    totalDeductions: number;
    netPayout: number;
    payoutDate?: string;
}

const StatementDetailModal: React.FC<{ statement: DetailedStatement, onClose: () => void }> = ({ statement, onClose }) => {
    
    const handlePrint = () => {
        const printContent = document.getElementById('printable-statement');
        if (printContent) {
            const originalContents = document.body.innerHTML;
            document.body.innerHTML = printContent.innerHTML;
            window.print();
            document.body.innerHTML = originalContents;
            window.location.reload(); // Reload to restore event listeners
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Printable Area */}
                <div id="printable-statement" className="p-8 overflow-y-auto flex-grow bg-white">
                    {/* Statement Header */}
                    <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 uppercase tracking-wide">Statement</h1>
                            <p className="text-gray-500 mt-1">Period: {statement.period}</p>
                            <div className={`mt-2 inline-flex items-center px-3 py-1 rounded border text-sm font-bold uppercase tracking-wider ${statement.status === 'Paid' ? 'border-green-500 text-green-700 bg-green-50' : 'border-yellow-500 text-yellow-700 bg-yellow-50'}`}>
                                {statement.status}
                            </div>
                        </div>
                        <div className="text-right">
                            <h2 className="text-xl font-bold text-primary">TaskMe Realty</h2>
                            <p className="text-sm text-gray-600">123 Property Lane, Nairobi</p>
                            <p className="text-sm text-gray-600">finance@taskme.re</p>
                            <p className="text-sm text-gray-600">+254 700 000 000</p>
                        </div>
                    </div>

                    {/* Recipient Info */}
                    <div className="flex justify-between mb-8">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Payee (Landlord)</p>
                            <p className="text-lg font-bold text-gray-800">{statement.landlordName}</p>
                            <p className="text-sm text-gray-600">ID: {statement.landlordId}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Portfolio Summary</p>
                            <p className="text-sm text-gray-800">{statement.totalProperties} Properties | {statement.totalUnits} Units</p>
                            <p className="text-sm text-gray-600">Occupancy Rate: {statement.occupancyRate}%</p>
                        </div>
                    </div>

                    {/* Revenue Table */}
                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-800 uppercase border-b border-gray-200 pb-2 mb-3">1. Gross Revenue</h3>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500 text-left">
                                    <th className="py-2">Property</th>
                                    <th className="py-2 text-center">Units</th>
                                    <th className="py-2 text-right">Collected Rent</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {statement.breakdown.properties.map((prop, idx) => (
                                    <tr key={idx}>
                                        <td className="py-3 font-medium text-gray-800">{prop.name}</td>
                                        <td className="py-3 text-center text-gray-600">{prop.unitCount}</td>
                                        <td className="py-3 text-right font-medium">KES {prop.collected.toLocaleString()}</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50 font-bold">
                                    <td className="py-3 pl-2">Total Gross Revenue</td>
                                    <td></td>
                                    <td className="py-3 text-right pr-2">KES {statement.grossRent.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Deductions Table */}
                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-800 uppercase border-b border-gray-200 pb-2 mb-3">2. Deductions & Fees</h3>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500 text-left">
                                    <th className="py-2">Description</th>
                                    <th className="py-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {statement.breakdown.deductions.map((deduction, idx) => (
                                    <tr key={idx}>
                                        <td className="py-3 text-gray-700">{deduction.item}</td>
                                        <td className="py-3 text-right text-red-600 font-medium">- KES {deduction.amount.toLocaleString()}</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50 font-bold">
                                    <td className="py-3 pl-2">Total Deductions</td>
                                    <td className="py-3 text-right text-red-600 pr-2">- KES {statement.totalDeductions.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Net Payable */}
                    <div className="flex justify-end mt-4">
                        <div className="bg-gray-100 p-6 rounded-lg w-full md:w-1/2 text-right border border-gray-300">
                            <p className="text-sm font-semibold text-gray-500 uppercase mb-1">Net Payable Amount</p>
                            <p className="text-3xl font-extrabold text-gray-900 border-t-2 border-gray-800 pt-2 inline-block">
                                KES {statement.netPayout.toLocaleString()}
                            </p>
                        </div>
                    </div>
                    
                    <div className="mt-12 text-center text-xs text-gray-400">
                        <p>Generated by TaskMe Realty System on {new Date().toLocaleString()}</p>
                        <p>This is a system generated document and does not require a signature.</p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-100">
                        Close
                    </button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark flex items-center">
                        <Icon name="download" className="w-4 h-4 mr-2"/> Print / Download PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

const LandlordPayouts: React.FC = () => {
    const { landlords, properties, tenants, commissionRules } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatement, setSelectedStatement] = useState<DetailedStatement | null>(null);
    const [isProcessingAll, setIsProcessingAll] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    
    // Local state to handle status updates since we are simulating 'Disburse'
    const [payoutStatuses, setPayoutStatuses] = useState<Record<string, 'Paid' | 'Pending' | 'Disputed'>>({});

    const period = getCurrentMonthIso();
    const periodLabel = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    // --- Dynamic Statement Generation (actual collections only) ---
    const statements: DetailedStatement[] = useMemo(() => {
        return landlords.map(landlord => {
            // 1. Get Properties
            const myProperties = properties.filter(p => p.landlordId === landlord.id);
            
            // 2. Gross = cash actually collected from tenants this period
            let grossRent = 0;
            let totalUnits = 0;
            let occupiedUnits = 0;
            let mgmtFee = 0;
            const propertyBreakdown: DetailedStatement['breakdown']['properties'] = [];

            myProperties.forEach(prop => {
                totalUnits += prop.units.length;
                occupiedUnits += prop.units.filter(u => u.status === 'Occupied').length;

                const propTenants = tenants.filter(t => t.propertyId === prop.id);
                const collected = propTenants.reduce(
                    (sum, t) => sum + sumTenantPaymentsInPeriod(t, period),
                    0
                );

                const { rate, fixed } = getPropertyAgencyCommission(prop, commissionRules || []);
                mgmtFee += fixed !== null ? (collected > 0 ? fixed : 0) : collected * rate;

                grossRent += collected;
                propertyBreakdown.push({
                    name: prop.name,
                    unitCount: prop.units.length,
                    collected
                });
            });

            // 3. Deductions derived from the actual collected amount
            const deductions = [];
            if (mgmtFee > 0) deductions.push({ item: 'Management Commission', amount: mgmtFee });

            const mri = grossRent * 0.075;
            if (mri > 0) deductions.push({ item: 'Monthly Rental Income Tax (7.5%)', amount: mri });

            const totalDeductions = deductions.reduce((acc, d) => acc + d.amount, 0);

            return {
                id: `stmt-${landlord.id}`,
                landlordId: landlord.id,
                landlordName: landlord.name,
                period: periodLabel,
                status: payoutStatuses[landlord.id] || 'Pending', // Use local status or default to Pending
                totalProperties: myProperties.length,
                totalUnits,
                occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
                grossRent,
                breakdown: {
                    properties: propertyBreakdown,
                    deductions
                },
                totalDeductions,
                netPayout: grossRent - totalDeductions
            };
        }).filter(stmt => stmt.totalProperties > 0); // Only show active landlords
    }, [landlords, properties, tenants, commissionRules, payoutStatuses, period, periodLabel]);


    // --- Filter Logic ---
    const filteredStatements = useMemo(() => {
        if (!searchQuery) return statements;
        const lower = searchQuery.toLowerCase();
        return statements.filter(s => 
            s.landlordName.toLowerCase().includes(lower) || 
            s.breakdown.properties.some(p => p.name.toLowerCase().includes(lower))
        );
    }, [statements, searchQuery]);

    const totalPending = filteredStatements
        .filter(s => s.status === 'Pending')
        .reduce((acc, s) => acc + s.netPayout, 0);

    const handleDisburseAll = () => {
        if (totalPending === 0) {
            alert("No pending payouts to disburse.");
            return;
        }

        if (window.confirm(`Are you sure you want to disburse KES ${totalPending.toLocaleString()} to ${filteredStatements.filter(s => s.status === 'Pending').length} landlords?`)) {
            setIsProcessingAll(true);
            
            // Simulate API call
            setTimeout(() => {
                const newStatuses = { ...payoutStatuses };
                filteredStatements.forEach(s => {
                    if (s.status === 'Pending') {
                        newStatuses[s.landlordId] = 'Paid';
                    }
                });
                setPayoutStatuses(newStatuses);
                setIsProcessingAll(false);
                alert("Disbursement Successful! All pending statements have been processed.");
            }, 2000);
        }
    };

    const handleDisburseSingle = (stmt: DetailedStatement) => {
        if (window.confirm(`Confirm disbursement of KES ${stmt.netPayout.toLocaleString()} to ${stmt.landlordName}?`)) {
            setProcessingId(stmt.id);
            setTimeout(() => {
                setPayoutStatuses(prev => ({...prev, [stmt.landlordId]: 'Paid'}));
                setProcessingId(null);
                alert(`Payment to ${stmt.landlordName} processed successfully.`);
            }, 1500);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Pending': return 'bg-yellow-100 text-yellow-800';
            case 'Disputed': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Landlord Payouts</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage monthly disbursements and generate comprehensive statements.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="text-right hidden md:block mr-2">
                        <p className="text-xs text-gray-500 uppercase font-bold">Pending Disbursement</p>
                        <p className="text-xl font-bold text-gray-800">KES {totalPending.toLocaleString()}</p>
                    </div>
                    <button 
                        onClick={handleDisburseAll}
                        disabled={isProcessingAll || totalPending === 0}
                        className="px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center transition-all"
                    >
                        {isProcessingAll ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing...
                            </>
                        ) : (
                            <>
                                <Icon name="payments" className="w-5 h-5 mr-2" />
                                Disburse All
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h2 className="text-xl font-bold text-gray-800">Payout Statements</h2>
                    <div className="relative w-full sm:w-80">
                        <input 
                            type="text" 
                            placeholder="Search Landlord or Property..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Icon name="search" className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Landlord</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Gross Rent</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Deductions</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net Payout</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="relative px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredStatements.map(stmt => (
                                <tr key={stmt.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap cursor-pointer group" onClick={() => setSelectedStatement(stmt)}>
                                        <div className="font-bold text-gray-900 group-hover:text-primary transition-colors">{stmt.landlordName}</div>
                                        <div className="text-xs text-gray-500">{stmt.period}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {stmt.totalProperties} Props ({stmt.totalUnits} Units)
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                                        KES {stmt.grossRent.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-500">
                                        - KES {stmt.totalDeductions.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-base font-bold text-gray-900">KES {stmt.netPayout.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(stmt.status)}`}>
                                            {stmt.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end items-center space-x-3">
                                        <button 
                                            onClick={() => setSelectedStatement(stmt)}
                                            className="text-gray-600 hover:text-primary font-medium"
                                        >
                                            View
                                        </button>
                                        {stmt.status === 'Pending' && (
                                            <button 
                                                onClick={() => handleDisburseSingle(stmt)}
                                                disabled={processingId === stmt.id}
                                                className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {processingId === stmt.id ? '...' : 'Disburse'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredStatements.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                                        No statements found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {selectedStatement && <StatementDetailModal statement={selectedStatement} onClose={() => setSelectedStatement(null)} />}
        </div>
    );
};

export default LandlordPayouts;
