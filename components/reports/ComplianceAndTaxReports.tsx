
import React, { useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { exportToCSV } from '../../utils/exportHelper';
import { computePlacementFeeDeduction, sumTenantPaymentsInPeriod } from '../../utils/landlordPeriodFinancials';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

const KpiCard: React.FC<{ title: string; value: string; color: string; icon: string }> = ({ title, value, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-center">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const TaxLiabilityCard: React.FC<{ title: string; amount: number; dueDate: string; isOverdue?: boolean }> = ({ title, amount, dueDate, isOverdue }) => (
    <div className={`p-5 rounded-xl border-l-4 shadow-sm bg-white ${isOverdue ? 'border-red-500' : 'border-blue-500'}`}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-800 mt-2">KES {Number(amount ?? 0).toLocaleString()}</h3>
            </div>
            {isOverdue && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">OVERDUE</span>}
        </div>
        <p className="text-xs text-gray-400 mt-3 font-medium flex items-center">
            <Icon name="time" className="w-3 h-3 mr-1" /> Due: {dueDate}
        </p>
    </div>
);

const ComplianceAndTaxReports: React.FC = () => {
    const { tenants, taxRecords, updateTaxRecord, properties } = useData();

    // --- Live Estimations ---
    const currentMonth = getCurrentMonthIso();
    const collectedRentThisMonth = tenants.reduce((sum, t) => sum + sumTenantPaymentsInPeriod(t, currentMonth), 0);
    const { placementFeeDeduction } = computePlacementFeeDeduction(tenants, properties, currentMonth);
    const mriTaxableBase = Math.max(0, collectedRentThisMonth - placementFeeDeduction);
    const pendingMRI = mriTaxableBase * 0.075; // 7.5% MRI Tax
    // Requirement: Pending VAT should feed from all pending MRI payments.
    const pendingVAT = pendingMRI * 0.16;

    const stats = useMemo(() => {
        const totalDue = taxRecords.filter(t => t.status === 'Due').reduce((acc, t) => acc + t.amount, 0);
        const totalPaid = taxRecords.filter(t => t.status === 'Paid').reduce((acc, t) => acc + t.amount, 0);
        return { totalDue, totalPaid };
    }, [taxRecords]);

    const handleMarkAsPaid = (recordId: string) => {
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
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Compliance & Tax Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Regulatory tracking and tax obligation summaries.</p>
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
                <TaxLiabilityCard title="WHT Arrears" amount={12000} dueDate="Overdue" isOverdue />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Total Tax Due" value={`KES ${Number(stats.totalDue ?? 0).toLocaleString()}`} color="#ef4444" icon="arrears" />
                <KpiCard title="Tax Remitted (YTD)" value={`KES ${Number(stats.totalPaid ?? 0).toLocaleString()}`} color="#10b981" icon="check" />
                <KpiCard title="Next Filing Date" value="20th Nov" color="#3b82f6" icon="time" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tax Calendar Widget */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Compliance Calendar</h3>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 rounded-lg flex flex-col items-center justify-center border border-blue-100">
                                <span className="text-[10px] font-bold text-blue-400 uppercase">Nov</span>
                                <span className="text-lg font-bold text-blue-700">20</span>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">VAT & MRI Returns Due</p>
                                <p className="text-xs text-gray-500">KRA iTax Portal</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-gray-50 rounded-lg flex flex-col items-center justify-center border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Dec</span>
                                <span className="text-lg font-bold text-gray-700">09</span>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">PAYE Remittance Due</p>
                                <p className="text-xs text-gray-500">Staff Payroll Taxes</p>
                            </div>
                        </div>
                         <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-gray-50 rounded-lg flex flex-col items-center justify-center border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Dec</span>
                                <span className="text-lg font-bold text-gray-700">15</span>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm">Housing Levy Due</p>
                                <p className="text-xs text-gray-500">1.5% Gross Salary Match</p>
                            </div>
                        </div>
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
                                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">KES {Number(tax.amount ?? 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center text-gray-500 font-mono">{tax.date}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 text-xs font-bold uppercase rounded-full ${
                                                tax.status === 'Due' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                            }`}>{tax.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {tax.status === 'Due' && (
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

export default ComplianceAndTaxReports;
