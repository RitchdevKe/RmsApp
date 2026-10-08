
import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import {
    sumTenantPaymentsInPeriod,
    computePlacementFeeDeduction,
    filterActiveRulesForLandlord,
    computeCollectedRuleDeductions,
    computeBillDeductionsForPeriod,
    computeMaintenanceFromTasksForPeriod,
    computePartialManagementInvoice,
    isAgencyFeeOnRentRule,
} from '../../utils/landlordPeriodFinancials';
import { IncomeStatementModal } from '../landlords/ActiveLandlords';
import { isRepurposedUnit } from '../../utils/repurposedUnits';
import type { User, RFTransaction, Bill } from '../../types';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PropertyRow {
    name: string;
    collected: number;
    unitCount: number;
    managementType: 'Full' | 'Partial';
}

interface PartialInvoice {
    invoiceLines: Array<{ description: string; amount: number; category: string }>;
    totalAmount: number;
    breakdown: { placementFee: number; managementFee: number; bills: number; maintenance: number };
    landlordPaybills: string[]; // unique paybills used by partial properties
}

interface DetailedStatement {
    id: string;
    landlordId: string;
    landlordName: string;
    landlord: User;
    period: string;
    /** 'full' → only Full Management props; 'partial' → only Partial; 'mixed' → both */
    statementType: 'full' | 'partial' | 'mixed';
    status: 'Paid' | 'Pending' | 'Disputed';
    totalProperties: number;
    totalUnits: number;
    occupiedUnits?: number;
    occupancyRate: number;
    // Full Management fields
    grossRent: number;
    expectedRent: number;
    isOccupancyBased: boolean;
    breakdown: {
        properties: PropertyRow[];
        deductions: Array<{ item: string; amount: number; category?: string }>;
    };
    totalDeductions: number;
    netPayout: number;
    // Portfolio-wide financials (to replicate ActiveLandlords.tsx)
    portfolioExpectedRent?: number;
    portfolioGrossRent?: number;
    portfolioActualCollected?: number;
    portfolioUnpaidRevenue?: number;
    portfolioRevenueByProperty?: Array<{ propertyId: string; propertyName: string; amount: number }>;
    // Partial Management invoice (populated when statementType !== 'full')
    partialInvoice?: PartialInvoice;
    payoutDate?: string;
}

// ── Statement Modal ────────────────────────────────────────────────────────────

const StatementDetailModal: React.FC<{
    statement: DetailedStatement;
    onClose: () => void;
}> = ({ statement, onClose }) => {
    const { systemSettings } = useData();
    const companyName: string = systemSettings?.companyName || 'TaskMe Realty';
    const companyPhone: string = systemSettings?.phone || '';
    const companyLogo: string | null = systemSettings?.logo || null;

    const handlePrint = () => {
        const printContent = document.getElementById('printable-statement');
        if (printContent) {
            const originalContents = document.body.innerHTML;
            document.body.innerHTML = printContent.innerHTML;
            window.print();
            document.body.innerHTML = originalContents;
            window.location.reload();
        }
    };

    const isPartialOnly = statement.statementType === 'partial';
    const hasFull = statement.statementType === 'full' || statement.statementType === 'mixed';
    const hasPartial = statement.statementType === 'partial' || statement.statementType === 'mixed';

    const reference = `INV-${(statement.landlord.id || '').toString().slice(-6).toUpperCase() || '------'}-${statement.period.replace(/\s+/g, '').toUpperCase()}`;
    const statusLabel = statement.status === 'Paid' ? 'PAID' : 'UNPAID';
    const statusTone = statement.status === 'Paid' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-rose-100 text-rose-700 ring-rose-200';

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-50 rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[92vh] animate-fade-in overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Toolbar */}
                <div className="px-5 py-3 border-b border-slate-200 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2">
                        <Icon name="reports" className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-slate-800 text-sm">
                            {isPartialOnly ? 'Tax Invoice' : 'Payout Statement'} · {statement.period}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handlePrint} className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary-dark mr-4">
                            <Icon name="download" className="w-4 h-4" /> Print / PDF
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Close">
                            <Icon name="close" className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-auto flex-grow bg-slate-100">
                    <div id="printable-statement" className="mx-auto bg-white rounded-xl border-2 border-slate-200 shadow-sm overflow-hidden min-w-[780px]" style={{ maxWidth: '780px' }}>
                        {/* Letterhead band */}
                        <div className="bg-gradient-to-r from-primary to-primary-dark text-white px-8 py-6 flex justify-between items-center">
                            <div className="flex items-center gap-6">
                                <div className="w-28 h-28 rounded-2xl bg-white/95 flex flex-shrink-0 items-center justify-center overflow-hidden shadow-md ring-2 ring-white/50">
                                    {companyLogo ? (
                                        <img src={companyLogo} alt={`${companyName} logo`} className="w-full h-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="text-primary font-black text-4xl tracking-tight">TM</span>
                                            <span className="text-primary/70 font-bold text-[10px] tracking-[0.2em] -mt-1">HOLDINGS</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h1 className="text-xl font-extrabold tracking-tight leading-tight uppercase text-amber-300">TASK-ME HOLDINGS LIMITED</h1>
                                    <p className="text-[13px] text-white/95 mt-0.5 font-bold tracking-tight uppercase">COMPREHENSIVE PROPERTY MANAGEMENT</p>
                                    <p className="text-[11px] text-white/80 mt-2 flex flex-col gap-0.5">
                                        <span className="flex items-center gap-1">P. O BOX 2150 - 20200</span>
                                        <span className="flex items-center gap-1">EMAIL: property@task-me.ke</span>
                                        <span className="flex items-center gap-1">Tel: 0736 712 300</span>
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200 font-bold mb-1">
                                    {isPartialOnly ? 'Partial Management' : 'Mixed Portfolio'}
                                </p>
                                <h2 className="text-lg font-bold uppercase tracking-wide leading-tight">
                                    {isPartialOnly ? 'Tax Invoice' : 'Statement & Invoice'}
                                </h2>
                                <p className="text-[11px] text-white/85 mt-1">Period · <strong>{statement.period}</strong></p>
                                <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ring-1 bg-white/90 ${statusTone.replace('bg-emerald-100', 'text-emerald-700').replace('bg-amber-100', 'text-amber-700').replace('bg-slate-100', 'text-slate-700')}`}>
                                    ● {statusLabel}
                                </span>
                            </div>
                        </div>

                        <div className="relative p-8 space-y-6">
                            {/* Watermark */}
                            <div aria-hidden className="pointer-events-none select-none absolute inset-0 flex items-center justify-center opacity-[0.04]">
                                <span className="text-[110px] font-black uppercase tracking-tighter text-slate-900 -rotate-12">{statusLabel}</span>
                            </div>
                            
                            <div className="relative">
                                {/* Bill-to + meta */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">
                                            {isPartialOnly ? 'Invoice To (Landlord)' : 'Prepared for'}
                                        </p>
                                        <h3 className="text-base font-bold text-slate-900">{statement.landlordName}</h3>
                                        <p className="text-xs text-slate-600 mt-0.5">{statement.landlord.email}</p>
                                        <p className="text-xs text-slate-600">{statement.landlord.phone}</p>
                                        {hasPartial && statement.partialInvoice?.landlordPaybills.length ? (
                                            <p className="text-xs text-orange-700 mt-1 font-semibold">
                                                Paybill(s): {statement.partialInvoice.landlordPaybills.join(', ')}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Statement details</p>
                                        <div className="text-xs text-slate-700 space-y-0.5">
                                            <p><span className="text-slate-500">Issued</span> · {new Date().toLocaleDateString()}</p>
                                            <p><span className="text-slate-500">Reference</span> · {reference}</p>
                                            <p><span className="text-slate-500">Currency</span> · KES</p>
                                            <p><span className="text-slate-500">Portfolio</span> · {statement.totalProperties} Props | {statement.totalUnits} Units | {statement.occupancyRate}% Occupied</p>
                                        </div>
                                    </div>
                                </div>

                                {/* FULL MANAGEMENT SECTION */}
                                {hasFull && (
                                    <div className="mt-6 rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr className="border-b border-slate-200">
                                                    <th colSpan={4} className="text-left px-4 py-2.5 font-bold text-slate-800 uppercase text-[11px] tracking-wider">
                                                        Full Management Properties
                                                    </th>
                                                </tr>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left px-4 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Property</th>
                                                    <th className="text-left px-4 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Units</th>
                                                    <th className="text-right px-4 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Gross Rent</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {statement.breakdown.properties
                                                    .filter(p => p.managementType !== 'Partial')
                                                    .map((prop, idx) => (
                                                        <tr key={idx} className="bg-white hover:bg-slate-50">
                                                            <td className="px-4 py-2 text-slate-700 text-xs">{prop.name}</td>
                                                            <td className="px-4 py-2 text-slate-500 text-xs">{prop.unitCount}</td>
                                                            <td className="px-4 py-2 text-right text-slate-900 tabular-nums">{(Number(prop.collected) || 0).toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                <tr className="bg-emerald-50/60 border-t border-slate-200">
                                                    <td className="px-4 py-2 text-xs font-semibold text-slate-700 italic" colSpan={2}>Subtotal · Gross Rental Revenue</td>
                                                    <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{Number(statement.grossRent || 0).toLocaleString()}</td>
                                                </tr>

                                                <tr className="bg-rose-50/60">
                                                    <td colSpan={3} className="px-4 py-2 text-[10px] font-bold text-rose-700 uppercase tracking-wider">Less: Deductions</td>
                                                </tr>
                                                {statement.breakdown.deductions.map((d, idx) => (
                                                    <tr key={idx} className="bg-white hover:bg-slate-50">
                                                        <td colSpan={2} className="px-4 py-2 pl-6 text-slate-700 text-xs">{d.item}</td>
                                                        <td className="px-4 py-2 text-right text-rose-600 tabular-nums">({Number(d.amount || 0).toLocaleString()})</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-slate-50 border-t border-slate-200">
                                                    <td className="px-4 py-3 font-semibold text-slate-700 text-xs" colSpan={2}>Total Deductions</td>
                                                    <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums">({Number(statement.totalDeductions || 0).toLocaleString()})</td>
                                                </tr>

                                                <tr className="bg-emerald-50 border-t-2 border-emerald-600">
                                                    <td className="px-4 py-4 font-extrabold uppercase text-emerald-900 tracking-wide text-xs" colSpan={2}>Net Income (Payout)</td>
                                                    <td className="px-4 py-4 text-right font-extrabold text-emerald-700 text-sm tabular-nums">KES {Number(statement.netPayout || 0).toLocaleString()}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* PARTIAL MANAGEMENT SECTION */}
                                {hasPartial && statement.partialInvoice && (
                                    <div className="mt-6 rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr className="border-b border-slate-200">
                                                    <th colSpan={3} className="text-left px-4 py-2.5 font-bold text-amber-800 uppercase text-[11px] tracking-wider">
                                                        Partial Management Invoice
                                                    </th>
                                                </tr>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left px-4 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Description</th>
                                                    <th className="text-left px-4 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Category</th>
                                                    <th className="text-right px-4 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Amount Due</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                <tr className="bg-amber-50/30">
                                                    <td colSpan={3} className="px-4 py-2 text-[10px] text-amber-700">
                                                        Tenants pay rent directly to landlord's paybill. The following amounts are due to TaskMe Realty.
                                                    </td>
                                                </tr>
                                                {statement.partialInvoice.invoiceLines.map((line, idx) => (
                                                    <tr key={idx} className="bg-white hover:bg-slate-50">
                                                        <td className="px-4 py-2 text-slate-700 text-xs">{line.description}</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">{line.category}</td>
                                                        <td className="px-4 py-2 text-right text-amber-700 font-semibold tabular-nums">{(Number(line.amount) || 0).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                                {statement.partialInvoice.invoiceLines.length === 0 && (
                                                    <tr className="bg-white">
                                                        <td colSpan={3} className="px-4 py-3 text-center text-xs text-slate-400 italic">No invoice items for this period</td>
                                                    </tr>
                                                )}
                                                <tr className="bg-amber-50 border-t-2 border-amber-600">
                                                    <td className="px-4 py-4 font-extrabold uppercase text-amber-900 tracking-wide text-xs" colSpan={2}>Total Amount Due</td>
                                                    <td className="px-4 py-4 text-right font-extrabold text-amber-700 text-sm tabular-nums">KES {Number(statement.partialInvoice.totalAmount || 0).toLocaleString()}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Payout/Payment instructions */}
                                <div className="grid grid-cols-3 gap-3 mt-6">
                                    <div className="col-span-2 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Instructions</p>
                                        <p className="text-xs text-slate-700 leading-relaxed">
                                            {hasFull && `Net payout of KES ${Number(statement.netPayout || 0).toLocaleString()} will be remitted to the landlord. `}
                                            {hasPartial && `Please remit KES ${Number(statement.partialInvoice?.totalAmount || 0).toLocaleString()} for partial management invoices. `}
                                            Please quote reference <strong>{reference}</strong> for any inquiries.
                                        </p>
                                        {companyPhone && (
                                            <p className="text-[11px] text-slate-500 mt-2">For queries, contact {companyName} · {companyPhone}</p>
                                        )}
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col items-center justify-center">
                                        <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-2">Verify</p>
                                        {/* Lightweight barcode-style strip */}
                                        <div className="flex items-end gap-[2px] h-10">
                                            {Array.from(reference).map((ch, i) => {
                                                const code = ch.charCodeAt(0);
                                                const w = (code % 3) + 1;
                                                const h = 60 + ((code * (i + 1)) % 40);
                                                return <span key={i} className="bg-slate-900 block" style={{ width: `${w}px`, height: `${h}%` }} />;
                                            })}
                                        </div>
                                        <p className="text-[9px] text-slate-500 font-mono mt-1 tracking-tight">{reference}</p>
                                    </div>
                                </div>

                                {/* Signature block */}
                                <div className="grid grid-cols-2 gap-8 pt-4">
                                    <div>
                                        <div className="h-10 border-b border-slate-300"></div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Prepared by · {companyName}</p>
                                    </div>
                                    <div>
                                        <div className="h-10 border-b border-slate-300"></div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Landlord Acknowledgment</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 px-8 py-3 text-center text-[9px] text-slate-400 uppercase tracking-widest border-t border-slate-200">
                            Generated by TaskMe Realty System
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Confirmation Modal ────────────────────────────────────────────────────────
interface ConfirmationModalProps {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isProcessing?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isProcessing = false,
    onConfirm,
    onCancel,
}) => {
    return (
        <div className="fixed inset-0 bg-slate-900/65 z-[1500] flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in border border-slate-100">
                <div className="flex items-center gap-3 text-primary mb-3">
                    <Icon name="payments" className="w-6 h-6" />
                    <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                        {isProcessing && (
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {isProcessing ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Alert Modal ───────────────────────────────────────────────────────────────
interface AlertModalProps {
    title: string;
    message: string;
    onClose: () => void;
}

const AlertModal: React.FC<AlertModalProps> = ({ title, message, onClose }) => {
    return (
        <div className="fixed inset-0 bg-slate-900/65 z-[1500] flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in border border-slate-100">
                <div className="flex items-center gap-3 text-emerald-600 mb-3">
                    <Icon name="check" className="w-6 h-6" />
                    <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">{message}</p>
                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-800 hover:bg-slate-950 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const LandlordPayouts: React.FC = () => {
    const { landlords, properties, tenants, deductionRules, bills, tasks, commissionRules, staff, rfTransactions, addRFTransaction, addBill } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatement, setSelectedStatement] = useState<DetailedStatement | null>(null);
    const [isProcessingAll, setIsProcessingAll] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [payoutStatuses, setPayoutStatuses] = useState<Record<string, 'Paid' | 'Pending' | 'Disputed'>>({});
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        isProcessing?: boolean;
        onConfirm: () => void;
    } | null>(null);
    const [alertModal, setAlertModal] = useState<{
        title: string;
        message: string;
    } | null>(null);

    const statements: DetailedStatement[] = useMemo(() => {
        const period = getCurrentMonthIso();
        const periodLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

        return landlords.map(landlord => {
            const myProperties = properties.filter(p => p.landlordId === landlord.id);
            if (myProperties.length === 0) return null;

            const fullProps = myProperties.filter(p => (p.managementType ?? 'Full') === 'Full');
            const partialProps = myProperties.filter(p => p.managementType === 'Partial');

            const statementType: DetailedStatement['statementType'] =
                fullProps.length > 0 && partialProps.length > 0 ? 'mixed' :
                partialProps.length > 0 ? 'partial' : 'full';

            // Shared unit counts
            let totalUnits = 0;
            let occupiedUnits = 0;
            myProperties.forEach(prop => {
                totalUnits += prop.units.length;
                occupiedUnits += prop.units.filter(u => u.status === 'Occupied').length;
            });

            // ── Full Management ──
            const fullTenants = tenants.filter(t => t.propertyId && fullProps.some(p => p.id === t.propertyId));
            const propertyBreakdown: PropertyRow[] = myProperties.map(prop => {
                const isPartial = prop.managementType === 'Partial';
                const propTenants = tenants.filter(t => t.propertyId === prop.id);
                const collected = isPartial ? 0 : propTenants.reduce(
                    (s, t) => s + sumTenantPaymentsInPeriod(t, period), 0
                );
                return { name: prop.name, unitCount: prop.units.length, collected, managementType: isPartial ? 'Partial' : 'Full' };
            });

            const grossRent = fullTenants.reduce((s, t) => s + sumTenantPaymentsInPeriod(t, period), 0);
            const { placementFeeDeduction, placementLines } = computePlacementFeeDeduction(fullTenants, fullProps, period);
            const activeRules = filterActiveRulesForLandlord(deductionRules, landlord.id, fullProps);
            const { lines: ruleLines } = computeCollectedRuleDeductions(activeRules, fullProps, fullTenants, period, grossRent, placementFeeDeduction);
            const { lines: billLines } = computeBillDeductionsForPeriod(bills, fullProps, period);
            const { lines: maintLines } = computeMaintenanceFromTasksForPeriod(tasks, fullProps, period);

            const deductions: Array<{ item: string; amount: number; category?: string }> = [];
            placementLines.forEach(l => deductions.push({ item: l.description, amount: l.amount, category: 'Placement Fees' }));
            ruleLines.filter(l => l.amount > 0).forEach(l => deductions.push({ item: l.description, amount: l.amount, category: 'Management & Rules' }));
            billLines.filter(l => l.amount > 0).forEach(l => deductions.push({ item: l.description, amount: l.amount, category: 'Bills & Utilities' }));
            maintLines.filter(l => l.amount > 0).forEach(l => deductions.push({ item: l.description, amount: l.amount, category: 'Maintenance' }));
            const totalDeductions = deductions.reduce((acc, d) => acc + d.amount, 0);

            // Expected rent for full-management portion (used by Income Statement KPI row).
            let expectedRent = 0;
            let isOccupancyBased = false;
            fullProps.forEach(prop => {
                if (prop.remittanceType === 'Occupancy Based') isOccupancyBased = true;
                (prop.units || []).forEach(u => {
                    if (u.status === 'Occupied') {
                        const tForUnit = fullTenants.find(t => t.unitId === u.id || String(t.unit) === String(u.name));
                        expectedRent += Number(tForUnit?.rentAmount ?? u.rent ?? prop.defaultMonthlyRent ?? 0) || 0;
                    }
                });
            });

            // ── Partial Management ──
            let partialInvoice: PartialInvoice | undefined;
            if (partialProps.length > 0) {
                const partialTenants = tenants.filter(t => t.propertyId && partialProps.some(p => p.id === t.propertyId));
                const inv = computePartialManagementInvoice(partialTenants, partialProps, bills, tasks, commissionRules, period);
                const landlordPaybills = [...new Set(partialProps.map(p => p.landlordPaybill).filter(Boolean) as string[])];
                partialInvoice = { ...inv, landlordPaybills };
            }

            // ── Portfolio-wide Financials Replication ──
            const landlordTenants = tenants.filter(t => t.propertyId && myProperties.some(p => p.id === t.propertyId));
            const occupyingStatuses = ['active', 'pending', 'pendingallocation', 'pendingpayment', 'pendingapproval', 'overdue', 'notice'];
            const normalizeUnit = (value: any) => String(value || '').trim().toLowerCase();
            const expectedOccupiedRentForProperty = (property: any) => {
                const propTenants = landlordTenants.filter(t => t.propertyId === property.id);
                const unitBased = (property.units || [])
                    .filter((unit: any) => !isRepurposedUnit(unit))
                    .reduce((sum: number, unit: any) => {
                        const unitRent = propTenants
                            .filter(t =>
                                occupyingStatuses.includes((t.status || '').toLowerCase()) &&
                                (
                                    (t.unitId && t.unitId === unit.id) ||
                                    (normalizeUnit(t.unit) && [unit.unitNumber, unit.unitTag, (unit as any).name]
                                        .some(candidate => normalizeUnit(candidate) === normalizeUnit(t.unit)))
                                )
                            )
                            .reduce((max, t) => Math.max(max, Number(t.rentAmount) || 0), 0);
                        return sum + unitRent;
                    }, 0);
                if (unitBased > 0) return unitBased;
                // Fallback: some tenants lack unit mapping — sum their rentAmount.
                return propTenants
                    .filter(t => occupyingStatuses.includes((t.status || '').toLowerCase()))
                    .reduce((s, t) => s + (Number(t.rentAmount) || 0), 0);
            };

            let portfolioExpectedRent = 0;
            let portfolioGrossRent = 0;
            let portfolioIsOccupancyBased = false;
            const portfolioRevenueByProperty: Array<{ propertyId: string; propertyName: string; amount: number }> = [];

            myProperties.forEach(p => {
                 const pTenants = landlordTenants.filter(t => t.propertyId === p.id);
                 let pRevenue = 0;
                 const pExpected = expectedOccupiedRentForProperty(p);

                 if (p.remittanceType === 'Occupancy Based') {
                     portfolioIsOccupancyBased = true;
                     pRevenue = pExpected;
                 } else {
                     pRevenue = pTenants.reduce((sum, t) => sum + sumTenantPaymentsInPeriod(t, period), 0);
                 }
                 portfolioGrossRent += pRevenue;
                 portfolioExpectedRent += pExpected;
                 portfolioRevenueByProperty.push({ propertyId: p.id, propertyName: p.name, amount: pRevenue });
            });

            const portfolioActualCollected = landlordTenants.reduce((sum, t) => sum + sumTenantPaymentsInPeriod(t, period), 0);
            const portfolioUnpaidRevenue = Math.max(0, portfolioExpectedRent - portfolioGrossRent);

            const isAlreadyPaid = bills.some(b => 
                b.category === 'Landlord payout' && 
                b.vendor === landlord.name && 
                b.status === 'Paid' &&
                b.description?.includes(periodLabel)
            );

            return {
                id: `stmt-${landlord.id}`,
                landlordId: landlord.id,
                landlordName: landlord.name,
                landlord,
                period: periodLabel,
                statementType,
                status: payoutStatuses[landlord.id] || (isAlreadyPaid ? 'Paid' : 'Pending'),
                totalProperties: myProperties.length,
                totalUnits,
                occupiedUnits,
                occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
                grossRent: portfolioGrossRent,
                expectedRent,
                isOccupancyBased: isOccupancyBased || portfolioIsOccupancyBased,
                breakdown: { properties: propertyBreakdown, deductions },
                totalDeductions,
                netPayout: portfolioGrossRent - totalDeductions,
                portfolioExpectedRent,
                portfolioGrossRent,
                portfolioActualCollected,
                portfolioUnpaidRevenue,
                portfolioRevenueByProperty,
                partialInvoice,
            } as DetailedStatement;
        }).filter((s): s is DetailedStatement => s !== null);
    }, [landlords, properties, tenants, deductionRules, bills, tasks, commissionRules, payoutStatuses]);

    const filteredStatements = useMemo(() => {
        const base = searchQuery
            ? statements.filter(s => {
                const lower = searchQuery.toLowerCase();
                return s.landlordName.toLowerCase().includes(lower) ||
                    s.breakdown.properties.some(p => p.name.toLowerCase().includes(lower));
            })
            : statements;
        return [...base].sort((a, b) => (a.landlordName || '').localeCompare(b.landlordName || '', undefined, { sensitivity: 'base' }));
    }, [statements, searchQuery]);

    // Only full-management net payouts count as pending disbursement (partial = invoice, not payout)
    const totalPendingPayout = filteredStatements
        .filter(s => s.status === 'Pending' && s.statementType !== 'partial')
        .reduce((acc, s) => acc + s.netPayout, 0);

    const totalPendingInvoices = filteredStatements
        .filter(s => s.status === 'Pending' && s.statementType !== 'full')
        .reduce((acc, s) => acc + (s.partialInvoice?.totalAmount ?? 0), 0);

    const parsePeriodToYYYYMM = (periodLabel: string): string => {
        if (/^\d{4}-\d{2}$/.test(periodLabel)) return periodLabel;
        const parts = periodLabel.split(' ');
        if (parts.length === 2) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const mIdx = monthNames.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
            if (mIdx >= 0) {
                const mStr = String(mIdx + 1).padStart(2, '0');
                return `${parts[1]}-${mStr}`;
            }
        }
        return getCurrentMonthIso();
    };

    const getMonthsBetween = (startDateStr: string, endDateStr: string): number => {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
        return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    };

    const isContractActive = (landlord: User, periodLabel: string): boolean => {
        if (!landlord.referrerId) return false;
        const contractPeriod = landlord.contractPeriod !== undefined ? landlord.contractPeriod : 12;
        if (!landlord.joinDate) return true;
        const startYYYYMM = landlord.joinDate.slice(0, 7);
        const endYYYYMM = parsePeriodToYYYYMM(periodLabel);
        const monthsPassed = getMonthsBetween(startYYYYMM, endYYYYMM);
        return monthsPassed >= 0 && monthsPassed < contractPeriod;
    };

    const getManagementFeeForStatement = (stmt: DetailedStatement): number => {
        let mgtFee = 0;
        if (stmt.breakdown?.deductions) {
            stmt.breakdown.deductions.forEach(d => {
                if (isAgencyFeeOnRentRule(d.item)) {
                    mgtFee += d.amount;
                }
            });
        }
        if (stmt.partialInvoice?.breakdown?.managementFee) {
            mgtFee += stmt.partialInvoice.breakdown.managementFee;
        }
        return mgtFee;
    };

    const processReferralCommission = (stmt: DetailedStatement) => {
        const landlord = stmt.landlord;
        if (!landlord || !landlord.referrerId) return;

        if (!isContractActive(landlord, stmt.period)) {
            console.log(`Referral contract for landlord ${stmt.landlordName} has expired.`);
            return;
        }

        const mgtFee = getManagementFeeForStatement(stmt);
        if (mgtFee <= 0) return;

        const commissionAmount = Math.round(mgtFee * 0.1);
        if (commissionAmount <= 0) return;

        const referrerId = landlord.referrerId;
        const referrerName = 
            staff.find(s => s.id === referrerId)?.name ||
            landlords.find(l => l.id === referrerId)?.name ||
            tenants.find(t => t.id === referrerId)?.name ||
            referrerId;

        const periodKey = parsePeriodToYYYYMM(stmt.period).replace('-', '');
        const reference = `COMM-L-${landlord.id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-4)}-${periodKey}`;

        const isAlreadyAwarded = rfTransactions.some(tx => tx.reference === reference);
        if (isAlreadyAwarded) {
            console.log(`Referral commission for ${stmt.landlordName} (${stmt.period}) already awarded with reference ${reference}`);
            return;
        }

        const commissionTx: RFTransaction = {
            id: `rf-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: getTodayIsoDate(),
            type: 'Referral Commission',
            category: 'Outbound',
            amount: commissionAmount,
            partyName: referrerName,
            reference: reference,
            status: 'Pending',
            description: `10% referral commission on monthly management fee for ${stmt.landlordName} (${stmt.period})`
        };

        addRFTransaction(commissionTx);
        console.log(`Successfully awarded KES ${commissionAmount} commission to ${referrerName} for referring ${stmt.landlordName}.`);
    };

    const handleDisburseAll = () => {
        if (totalPendingPayout === 0) {
            setAlertModal({
                title: 'No Pending Payouts',
                message: 'No pending Full Management payouts to disburse.'
            });
            return;
        }

        setConfirmModal({
            title: 'Confirm Disbursement',
            message: `Are you sure you want to disburse KES ${Number(totalPendingPayout).toLocaleString()} to all pending Full Management landlords?`,
            confirmText: 'Disburse All',
            cancelText: 'Cancel',
            onConfirm: () => {
                if (confirmModal) {
                    setConfirmModal(prev => prev ? { ...prev, isProcessing: true } : null);
                }
                setIsProcessingAll(true);
                setTimeout(() => {
                    const newStatuses = { ...payoutStatuses };
                    filteredStatements.forEach(s => {
                        const sStatus = s.status;
                        if (sStatus === 'Pending' && s.statementType !== 'partial') {
                            newStatuses[s.landlordId] = 'Paid';
                            
                            // Save persistent bill
                            const newBill: Bill = {
                                id: `bill-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                vendor: s.landlordName,
                                category: 'Landlord payout',
                                amount: s.netPayout,
                                invoiceDate: getTodayIsoDate(),
                                dueDate: getTodayIsoDate(),
                                status: 'Paid',
                                propertyId: 'Agency',
                                description: `Rent payout for ${s.period} (Landlord: ${s.landlordName})`
                            };
                            addBill(newBill);

                            processReferralCommission(s);
                        }
                    });
                    setPayoutStatuses(newStatuses);
                    setIsProcessingAll(false);
                    setConfirmModal(null);
                    setAlertModal({
                        title: 'Disbursement Successful',
                        message: 'All pending Full Management payouts have been processed successfully!'
                    });
                }, 2000);
            }
        });
    };

    const handleDisburseSingle = (stmt: DetailedStatement) => {
        const isInvoice = stmt.statementType === 'partial';
        const amount = isInvoice ? stmt.partialInvoice?.totalAmount ?? 0 : stmt.netPayout;
        const displayLabel = isInvoice ? 'Mark Paid' : 'Disburse';
        const confirmMessage = isInvoice
            ? `Are you sure you want to mark the invoice of KES ${Number(amount).toLocaleString()} as paid for ${stmt.landlordName}?`
            : `Are you sure you want to disburse KES ${Number(amount).toLocaleString()} to ${stmt.landlordName}?`;

        setConfirmModal({
            title: isInvoice ? 'Confirm Invoice Payment' : 'Confirm Disbursement',
            message: confirmMessage,
            confirmText: displayLabel,
            cancelText: 'Cancel',
            onConfirm: () => {
                if (confirmModal) {
                    setConfirmModal(prev => prev ? { ...prev, isProcessing: true } : null);
                }
                setProcessingId(stmt.id);
                setTimeout(() => {
                    setPayoutStatuses(prev => ({ ...prev, [stmt.landlordId]: 'Paid' }));
                    
                    // Save persistent bill
                    const newBill: Bill = {
                        id: `bill-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        vendor: stmt.landlordName,
                        category: 'Landlord payout',
                        amount: amount,
                        invoiceDate: getTodayIsoDate(),
                        dueDate: getTodayIsoDate(),
                        status: 'Paid',
                        propertyId: 'Agency',
                        description: isInvoice 
                            ? `Partial management invoice payment for ${stmt.period} (Landlord: ${stmt.landlordName})`
                            : `Rent payout for ${stmt.period} (Landlord: ${stmt.landlordName})`
                    };
                    addBill(newBill);

                    processReferralCommission(stmt);
                    setProcessingId(null);
                    setConfirmModal(null);
                    setAlertModal({
                        title: 'Success',
                        message: isInvoice
                            ? `Invoice for ${stmt.landlordName} marked as paid successfully.`
                            : `Payment to ${stmt.landlordName} processed successfully.`
                    });
                }, 1500);
            }
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Pending': return 'bg-yellow-100 text-yellow-800';
            case 'Disputed': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getTypeLabel = (type: DetailedStatement['statementType']) => {
        if (type === 'full') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Full</span>;
        if (type === 'partial') return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">Partial</span>;
        return <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Mixed</span>;
    };

    const totals = useMemo(() => {
        let gross = 0;
        let deductions = 0;
        let netPayout = 0;
        let partialInvoices = 0;
        let props = 0;
        let units = 0;

        filteredStatements.forEach(s => {
            props += s.totalProperties;
            units += s.totalUnits;
            if (s.statementType === 'partial') {
                partialInvoices += (s.partialInvoice?.totalAmount || 0);
            } else {
                gross += s.grossRent;
                deductions += s.totalDeductions;
                netPayout += s.netPayout;
                if (s.statementType === 'mixed') {
                    partialInvoices += (s.partialInvoice?.totalAmount || 0);
                }
            }
        });

        return { gross, deductions, netPayout, partialInvoices, props, units };
    }, [filteredStatements]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Landlord Payouts</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage monthly disbursements and generate statements / invoices.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="hidden md:flex flex-col gap-1 mr-2 text-right">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold">Pending Disbursement</p>
                            <p className="text-xl font-bold text-gray-800">KES {Number(totalPendingPayout).toLocaleString()}</p>
                        </div>
                        {totalPendingInvoices > 0 && (
                            <div>
                                <p className="text-xs text-orange-500 uppercase font-bold">Pending Invoices</p>
                                <p className="text-base font-bold text-orange-700">KES {Number(totalPendingInvoices).toLocaleString()}</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleDisburseAll}
                        disabled={isProcessingAll || totalPendingPayout === 0}
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
                                Disburse All (Full)
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h2 className="text-xl font-bold text-gray-800">Statements & Invoices</h2>
                    <div className="relative w-full sm:w-80">
                        <input
                            type="text"
                            placeholder="Search Landlord or Property..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
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
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Gross / Expected</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Deductions</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net Payout / Invoice</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="relative px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredStatements.map(stmt => {
                                const isPartialOnly = stmt.statementType === 'partial';
                                const invoiceAmt = stmt.partialInvoice?.totalAmount ?? 0;
                                const displayAmount = isPartialOnly ? invoiceAmt : stmt.netPayout;

                                return (
                                    <tr key={stmt.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap cursor-pointer group" onClick={() => setSelectedStatement(stmt)}>
                                            <div className="font-bold text-gray-900 group-hover:text-primary transition-colors">{stmt.landlordName}</div>
                                            <div className="text-xs text-gray-500">{stmt.period}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">{getTypeLabel(stmt.statementType)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {stmt.totalProperties} Props ({stmt.totalUnits} Units)
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                                            {isPartialOnly ? '—' : `KES ${Number(stmt.grossRent ?? 0).toLocaleString()}`}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-500">
                                            {isPartialOnly ? '—' : `- KES ${Number(stmt.totalDeductions ?? 0).toLocaleString()}`}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <span className={`text-base font-bold ${isPartialOnly ? 'text-orange-700' : 'text-gray-900'}`}>
                                                KES {Number(displayAmount ?? 0).toLocaleString()}
                                            </span>
                                            {isPartialOnly && (
                                                <p className="text-xs text-orange-500">Invoice</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(stmt.status)}`}>
                                                {stmt.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end items-center space-x-3">
                                            <button onClick={() => setSelectedStatement(stmt)} className="text-gray-600 hover:text-primary font-medium">
                                                View
                                            </button>
                                            {stmt.status === 'Pending' && (
                                                <button
                                                    onClick={() => handleDisburseSingle(stmt)}
                                                    disabled={processingId === stmt.id}
                                                    className={`px-3 py-1 text-white text-xs font-bold rounded disabled:opacity-50 ${isPartialOnly ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}
                                                >
                                                    {processingId === stmt.id ? '...' : isPartialOnly ? 'Mark Paid' : 'Disburse'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredStatements.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                                        No statements found matching your search.
                                    </td>
                                </tr>
                            )}
                            {filteredStatements.length > 0 && (
                                <tr className="bg-gray-100 font-bold border-t-2 border-gray-200">
                                    <td colSpan={2} className="px-6 py-4 text-gray-900 text-right uppercase tracking-wider text-xs">Total</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {totals.props} Props ({totals.units} Units)
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                                        KES {Number(totals.gross).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                                        - KES {Number(totals.deductions).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="text-gray-900">KES {Number(totals.netPayout).toLocaleString()}</div>
                                        {totals.partialInvoices > 0 && (
                                            <div className="text-xs text-orange-600 mt-1">Inv: KES {Number(totals.partialInvoices).toLocaleString()}</div>
                                        )}
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedStatement && (
                <IncomeStatementModal
                    landlord={selectedStatement.landlord}
                    period={selectedStatement.period}
                    totalUnits={selectedStatement.totalUnits}
                    occupiedUnits={selectedStatement.occupiedUnits || 0}
                    data={{
                        grossRevenueMonth: selectedStatement.portfolioGrossRent ?? 0,
                        expectedRevenueMonth: selectedStatement.portfolioExpectedRent ?? 0,
                        actualCollectedMonth: selectedStatement.portfolioActualCollected ?? 0,
                        isOccupancyBased: selectedStatement.isOccupancyBased,
                        unpaidRevenue: selectedStatement.portfolioUnpaidRevenue ?? 0,
                        monthlyDeductions: selectedStatement.statementType === 'partial' ? (selectedStatement.partialInvoice?.totalAmount || 0) : selectedStatement.totalDeductions,
                        netIncome: selectedStatement.statementType === 'partial' ? -(selectedStatement.partialInvoice?.totalAmount || 0) : selectedStatement.netPayout,
                        detailedDeductions: selectedStatement.statementType === 'partial'
                            ? selectedStatement.partialInvoice?.invoiceLines.map((l: any) => ({
                                category: l.category,
                                description: l.description,
                                amount: l.amount,
                            })) || []
                            : selectedStatement.breakdown.deductions.map(d => ({
                                category: d.category || 'Deductions',
                                description: d.item,
                                amount: d.amount,
                            })),
                        revenueByProperty: selectedStatement.portfolioRevenueByProperty?.map(p => ({
                            propertyId: p.propertyId,
                            propertyName: p.propertyName,
                            amount: p.amount
                        })) || [],
                    }}
                    onClose={() => setSelectedStatement(null)}
                />
            )}

            {confirmModal && (
                <ConfirmationModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    cancelText={confirmModal.cancelText}
                    isProcessing={confirmModal.isProcessing}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}

            {alertModal && (
                <AlertModal
                    title={alertModal.title}
                    message={alertModal.message}
                    onClose={() => setAlertModal(null)}
                />
            )}
        </div>
    );
};

export default LandlordPayouts;
