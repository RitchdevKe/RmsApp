
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { exportToCSV } from '@/utils/exportHelper';
import { computePlacementFeeDeduction, sumTenantPaymentsInPeriod } from '@/utils/landlordPeriodFinancials';
import { getTodayIsoDate } from '../../utils/timezone';

const TaxLiabilityCard: React.FC<{ title: string; amount: number; dueDate: string; isOverdue?: boolean }> = ({ title, amount, dueDate, isOverdue }) => (
    <div className={`p-5 rounded-xl border-l-4 shadow-sm bg-white ${isOverdue ? 'border-red-500' : 'border-blue-500'}`}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-800 mt-2">KES {amount.toLocaleString()}</h3>
            </div>
            {isOverdue && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">OVERDUE</span>}
        </div>
        <p className="text-xs text-gray-400 mt-3 font-medium flex items-center">
            <Icon name="time" className="w-3 h-3 mr-1" /> Due: {dueDate}
        </p>
    </div>
);

const TaxCompliance: React.FC = () => {
    const { tenants, taxRecords, updateTaxRecord, properties, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canPay = isSuperAdmin || checkPermission('Financials', 'pay');

    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);

    // --- Live Estimations ---
    // MRI base should exclude rent taken as placement fee and exclude Partial Management properties (as agency doesn't collect rent for them directly)
    const collectedRentThisMonth = tenants.reduce((sum, t) => {
         const prop = properties.find(p => p.id === t.propertyId);
         if (prop?.managementType === 'Partial') return sum;
         return sum + sumTenantPaymentsInPeriod(t, currentMonth);
    }, 0);
    const fullMgmtProps = properties.filter(p => p.managementType !== 'Partial');
    const { placementFeeDeduction } = computePlacementFeeDeduction(tenants, fullMgmtProps, currentMonth);
    const mriTaxableBase = Math.max(0, collectedRentThisMonth - placementFeeDeduction);
    const pendingMRI = mriTaxableBase * 0.075;
    // Requirement: Pending VAT should feed from all pending MRI payments.
    const pendingVAT = pendingMRI * 0.16;

    const whtArrears = useMemo(
        () => taxRecords
            .filter(r => r.status === 'Due' && /wht|withholding/i.test(`${r.type} ${r.description}`))
            .reduce((sum, r) => sum + (r.amount || 0), 0),
        [taxRecords]
    );

    const complianceCalendar = useMemo(() => {
        const upcoming = taxRecords
            .filter(r => r.status === 'Due')
            .map(r => ({ ...r, due: new Date(r.date) }))
            .filter(r => !isNaN(r.due.getTime()))
            .sort((a, b) => a.due.getTime() - b.due.getTime())
            .slice(0, 3);
        return upcoming;
    }, [taxRecords]);

    const handleMarkAsPaid = (recordId: string) => {
        if (!canPay) return alert('You do not have permission to mark tax records as paid.');
        updateTaxRecord(recordId, { status: 'Paid' });
        alert(`Record marked as paid.`);
    };

    const handleExportReport = () => {
        if (taxRecords.length === 0) {
            alert("No tax records to export.");
            return;
        }
        const exportData = taxRecords.map(t => ({
            Type: t.type,
            Description: t.description,
            Amount: t.amount,
            DueDate: t.date,
            Status: t.status
        }));
        exportToCSV(exportData, `Tax_Compliance_Report_${getTodayIsoDate()}`);
    };

    return (
        <div className="space-y-8 pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Tax & Compliance</h1>
                    <p className="text-lg text-gray-500 mt-1">Automated liability estimation and remittance tracking.</p>
                </div>
                <button 
                    onClick={handleExportReport}
                    className="bg-primary text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-primary-dark transition-colors flex items-center"
                >
                    <Icon name="download" className="w-4 h-4 mr-2"/> Tax Report
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TaxLiabilityCard title="Pending MRI (Current Month)" amount={pendingMRI} dueDate="20th Next Month" />
                <TaxLiabilityCard title="Pending VAT Liability" amount={pendingVAT} dueDate="20th Next Month" />
                <TaxLiabilityCard title="WHT Arrears" amount={whtArrears} dueDate={whtArrears > 0 ? "Overdue" : "Up to date"} isOverdue={whtArrears > 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tax Calendar Widget */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Compliance Calendar</h3>
                    <div className="space-y-4">
                        {complianceCalendar.map(item => (
                            <div key={item.id} className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-50 rounded-lg flex flex-col items-center justify-center border border-blue-100">
                                    <span className="text-[10px] font-bold text-blue-400 uppercase">{item.due.toLocaleString('default', { month: 'short' })}</span>
                                    <span className="text-lg font-bold text-blue-700">{item.due.getDate()}</span>
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">{item.type} Due</p>
                                    <p className="text-xs text-gray-500 truncate">{item.description}</p>
                                </div>
                            </div>
                        ))}
                        {complianceCalendar.length === 0 && (
                            <p className="text-sm text-gray-400">No pending due records.</p>
                        )}
                    </div>
                </div>

                {/* Tax Ledger */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Tax Obligations Ledger</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs">Tax Type</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs">Description</th>
                                    <th className="px-4 py-3 text-right font-bold text-gray-500 uppercase text-xs">Amount Due</th>
                                    <th className="px-4 py-3 text-center font-bold text-gray-500 uppercase text-xs">Due Date</th>
                                    <th className="px-4 py-3 text-center font-bold text-gray-500 uppercase text-xs">Status</th>
                                    <th className="px-4 py-3 text-right font-bold text-gray-500 uppercase text-xs">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {taxRecords.map(tax => (
                                    <tr key={tax.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-bold text-gray-700">{tax.type}</td>
                                        <td className="px-4 py-3 text-gray-600">{tax.description}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">KES {tax.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center text-gray-500 font-mono">{tax.date}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 text-xs font-bold uppercase rounded-full ${
                                                tax.status === 'Due' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {tax.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {tax.status === 'Due' && canPay && (
                                                <button onClick={() => handleMarkAsPaid(tax.id)} className="text-blue-600 hover:text-blue-800 text-xs font-bold underline">
                                                    Mark Paid
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {taxRecords.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">No tax records found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaxCompliance;
