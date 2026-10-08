
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { User, StaffProfile, Lead, RFTransaction } from '../../types';
import { generateUserReferralCode } from '../../utils/referralCode';
import { buildReferralEarningsModel, type ReferralEarningsEntry } from '../../utils/referralEarnings';
import { exportToCSV } from '../../utils/exportHelper';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { getTodayIsoDate } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const Chart: React.FC<{ type: 'bar'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

// Unified Affiliate Type for Display
interface AffiliateActivity {
    id: string;
    date: string;
    name: string;
    kind: 'Lead' | 'Application' | 'Tenant' | 'Payout' | 'Commission';
    status: 'Paid' | 'Pending' | 'Reversed' | 'Active' | 'Signed' | 'Lead';
    commission: number;
}

interface LiveAffiliate {
    id: string;
    name: string;
    email: string;
    role: string;
    type: string; // Freelancer, Agent, Influencer etc.
    referralCode: string;
    tier: string;
    stats: {
        leadsReferred: number;
        leasesSigned: number;
        totalEarned: number;
        totalPaid: number;
        nextPayout: number;
    };
    recentReferrals: AffiliateActivity[];
    monthlyEarnings: Array<{ month: string; amount: number }>;
}

const InviteAffiliateModal: React.FC<{ onClose: () => void; onInvite: (data: any) => void }> = ({ onClose, onInvite }) => {
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', type: 'Freelancer' });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email) return alert("Name and Email required");
        onInvite(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Invite New Affiliate</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <p className="text-sm text-gray-500 mb-4">Add a freelancer, influencer, or partner to your referral network.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                        <input 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                            className="w-full p-2 border rounded" 
                            placeholder="e.g. John Mark"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
                        <input 
                            type="email"
                            value={formData.email} 
                            onChange={e => setFormData({...formData, email: e.target.value})} 
                            className="w-full p-2 border rounded" 
                            placeholder="john@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                        <input 
                            value={formData.phone} 
                            onChange={e => setFormData({...formData, phone: e.target.value})} 
                            className="w-full p-2 border rounded" 
                            placeholder="07..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Affiliate Type</label>
                        <select 
                            value={formData.type} 
                            onChange={e => setFormData({...formData, type: e.target.value})} 
                            className="w-full p-2 border rounded bg-white"
                        >
                            <option value="Freelancer">Freelancer</option>
                            <option value="Influencer">Influencer</option>
                            <option value="Tenant">Tenant</option>
                            <option value="Partner">Corporate Partner</option>
                            <option value="Agent">External Agent</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded font-bold hover:bg-purple-700 shadow-sm">Send Invite</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AffiliatePerformanceModal: React.FC<{ affiliate: LiveAffiliate; onClose: () => void }> = ({ affiliate, onClose }) => {
    const [tab, setTab] = useState<'overview' | 'activities' | 'payouts' | 'attribution'>('overview');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Pending'>('All');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const monthlyChartData = useMemo(() => ({
        labels: affiliate.monthlyEarnings.map(m => m.month),
        datasets: [{
            label: 'Commission (KES)',
            data: affiliate.monthlyEarnings.map(m => m.amount),
            borderColor: 'rgb(147, 51, 234)',
            backgroundColor: 'rgba(147, 51, 234, 0.2)',
            fill: true,
            tension: 0.35,
        }],
    }), [affiliate.monthlyEarnings]);

    const funnelChartData = useMemo(() => ({
        labels: ['Leads', 'Conversions', 'Commissions'],
        datasets: [{
            label: affiliate.name,
            data: [
                affiliate.stats.leadsReferred,
                affiliate.stats.leasesSigned,
                affiliate.recentReferrals.filter(r => r.kind === 'Commission').length,
            ],
            backgroundColor: ['rgba(54, 162, 235, 0.55)', 'rgba(75, 192, 192, 0.55)', 'rgba(147, 51, 234, 0.55)'],
        }],
    }), [affiliate]);

    const filteredActivity = useMemo(() => {
        return affiliate.recentReferrals.filter(r => {
            if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
            if (statusFilter === 'Paid' && r.status !== 'Paid') return false;
            if (statusFilter === 'Pending' && r.status !== 'Pending') return false;
            if (fromDate && r.date < fromDate) return false;
            if (toDate && r.date > toDate) return false;
            return true;
        });
    }, [affiliate.recentReferrals, search, statusFilter, fromDate, toDate]);

    const statusPill = (status: AffiliateActivity['status']) => {
        const map: Record<string, string> = {
            Paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            Pending: 'bg-amber-100 text-amber-800 border-amber-200',
            Reversed: 'bg-red-100 text-red-800 border-red-200',
            Active: 'bg-blue-100 text-blue-800 border-blue-200',
            Signed: 'bg-slate-100 text-slate-800 border-slate-200',
            Lead: 'bg-purple-100 text-purple-800 border-purple-200',
        };
        return `px-2 py-0.5 rounded-full text-[11px] font-bold border ${map[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`;
    };

    const exportCsv = () => {
        exportToCSV(
            `affiliate-${affiliate.name.replace(/\s+/g, '_')}-activity`,
            filteredActivity.map(r => ({
                Date: r.date,
                Referral: r.name,
                Kind: r.kind,
                Status: r.status,
                'Commission (KES)': r.commission,
            })),
        );
    };

    const copyReferralLink = async () => {
        const link = `${window.location.origin}/#/r/${affiliate.referralCode}`;
        try {
            await navigator.clipboard.writeText(link);
            alert(`Copied referral link:\n${link}`);
        } catch {
            prompt('Copy referral link:', link);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1500] flex items-stretch justify-stretch backdrop-blur-sm">
            <div className="bg-gray-50 w-full h-full flex flex-col overflow-hidden">
                {/* Sticky header */}
                <div className="bg-white border-b border-gray-200 shadow-sm">
                    <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                                {affiliate.name.charAt(0)}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-2xl font-black text-gray-900">{affiliate.name}</h2>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase tracking-wide">{affiliate.tier}</span>
                                </div>
                                <p className="text-sm text-gray-500">{affiliate.type} · {affiliate.email} · Code <span className="font-mono font-bold text-gray-700">{affiliate.referralCode}</span></p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={copyReferralLink} className="px-3 py-2 text-xs font-bold bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Copy Link</button>
                            <button onClick={exportCsv} className="px-3 py-2 text-xs font-bold bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Export CSV</button>
                            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                                <Icon name="close" className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>
                    </div>
                    <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-3 pb-5">
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                            <p className="text-[10px] font-bold text-blue-700 uppercase">Leads</p>
                            <p className="text-xl font-black text-gray-900">{affiliate.stats.leadsReferred}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                            <p className="text-[10px] font-bold text-emerald-700 uppercase">Conversions</p>
                            <p className="text-xl font-black text-gray-900">{affiliate.stats.leasesSigned}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
                            <p className="text-[10px] font-bold text-purple-700 uppercase">Lifetime Commission</p>
                            <p className="text-xl font-black text-gray-900">KES {affiliate.stats.totalEarned.toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-teal-50 border border-teal-100">
                            <p className="text-[10px] font-bold text-teal-700 uppercase">Paid Out</p>
                            <p className="text-xl font-black text-gray-900">KES {affiliate.stats.totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                            <p className="text-[10px] font-bold text-amber-700 uppercase">Next Payout</p>
                            <p className="text-xl font-black text-gray-900">KES {affiliate.stats.nextPayout.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="max-w-7xl mx-auto px-6 flex gap-1 border-t border-gray-100">
                        {(['overview', 'activities', 'payouts', 'attribution'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${tab === t ? 'text-purple-700 border-purple-600' : 'text-gray-500 border-transparent hover:text-gray-800'}`}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
                        {tab === 'overview' && (
                            <>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="font-bold text-gray-800 mb-3">Monthly Commissions</h4>
                                        <div className="h-64">
                                            <Line data={monthlyChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <h4 className="font-bold text-gray-800 mb-3">Funnel</h4>
                                        <div className="h-64">
                                            <Bar data={funnelChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                    <h4 className="font-bold text-gray-800 mb-3">Latest Activity</h4>
                                    <ActivityTable rows={affiliate.recentReferrals.slice(0, 8)} statusPill={statusPill} />
                                </div>
                            </>
                        )}

                        {tab === 'activities' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="flex-1 min-w-[200px]">
                                        <label className="text-[11px] font-bold uppercase text-gray-500">Search</label>
                                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name" className="w-full mt-1 p-2 border border-gray-200 rounded-lg text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase text-gray-500">Status</label>
                                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="mt-1 p-2 border border-gray-200 rounded-lg text-sm">
                                            <option>All</option><option>Paid</option><option>Pending</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase text-gray-500">From</label>
                                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1 p-2 border border-gray-200 rounded-lg text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase text-gray-500">To</label>
                                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1 p-2 border border-gray-200 rounded-lg text-sm" />
                                    </div>
                                </div>
                                <ActivityTable rows={filteredActivity} statusPill={statusPill} />
                            </div>
                        )}

                        {tab === 'payouts' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                <h4 className="font-bold text-gray-800 mb-3">Payout History</h4>
                                <ActivityTable rows={affiliate.recentReferrals.filter(r => r.kind === 'Commission')} statusPill={statusPill} />
                            </div>
                        )}

                        {tab === 'attribution' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                <h4 className="font-bold text-gray-800 mb-3">Attribution Chain</h4>
                                <p className="text-sm text-gray-500 mb-4">Every touchpoint attributed to <strong>{affiliate.name}</strong> — from lead capture to signed tenant to commission payout.</p>
                                <ActivityTable rows={affiliate.recentReferrals.filter(r => r.kind !== 'Commission')} statusPill={statusPill} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ActivityTable: React.FC<{ rows: AffiliateActivity[]; statusPill: (s: AffiliateActivity['status']) => string }> = ({ rows, statusPill }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase font-bold text-gray-500">
                <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Referral</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Commission (KES)</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {rows.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">No activity yet.</td></tr>
                )}
                {rows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.date || '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                        <td className="px-3 py-2 text-gray-600">{r.kind}</td>
                        <td className="px-3 py-2"><span className={statusPill(r.status)}>{r.status}</span></td>
                        <td className="px-3 py-2 text-right font-bold text-gray-800">{r.commission > 0 ? r.commission.toLocaleString() : '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const AffiliateCard: React.FC<{ affiliate: LiveAffiliate; onViewPerformance: (aff: LiveAffiliate) => void }> = ({ affiliate, onViewPerformance }) => (
    <div className="bg-white p-5 rounded-xl border border-gray-100 hover:shadow-lg transition-all group flex flex-col h-full relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 bg-purple-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
        <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="flex items-center gap-3">
                 <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg shadow-sm border border-white">
                    {affiliate.name.charAt(0)}
                </div>
                <div>
                    <h3 className="font-bold text-gray-800 text-lg">{affiliate.name}</h3>
                    <p className="text-xs text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded-full w-fit">{affiliate.type}</p>
                </div>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold border border-green-200">Active</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-center text-sm mb-6 flex-grow">
            <div className="bg-gray-50 p-2 rounded border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold">Leads</p>
                <p className="font-bold text-gray-800">{affiliate.stats.leadsReferred}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold">Signed</p>
                <p className="font-bold text-blue-600">{affiliate.stats.leasesSigned}</p>
            </div>
             <div className="bg-gray-50 p-2 rounded border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold">Paid</p>
                <p className="font-bold text-green-600">{(affiliate.stats.totalEarned / 1000).toFixed(1)}k</p>
            </div>
        </div>
        
        <div className="mt-auto">
             <div className="text-xs text-gray-400 font-mono mb-2 text-center bg-gray-50 py-1 rounded border border-dashed border-gray-200">
                Code: <span className="text-gray-600 font-bold select-all">{affiliate.referralCode}</span>
            </div>
            <button 
                onClick={() => onViewPerformance(affiliate)}
                className="w-full py-2 bg-white border border-purple-200 text-purple-700 text-xs font-bold rounded hover:bg-purple-50 transition-colors shadow-sm"
            >
                View Performance
            </button>
        </div>
    </div>
);

const ReviewPayoutModal: React.FC<{
    payout: RFTransaction;
    onClose: () => void;
    onConfirm: (id: string, amount: number, reference: string, date: string) => void;
}> = ({ payout, onClose, onConfirm }) => {
    const [amount, setAmount] = useState(String(payout.amount || ''));
    const [reference, setReference] = useState(payout.reference || '');
    const [date, setDate] = useState(getTodayIsoDate());
    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Review & Pay Commission</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-4">
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm space-y-1">
                        <p className="text-gray-600">Affiliate: <span className="font-bold text-gray-800">{payout.partyName}</span></p>
                        <p className="text-gray-600">Referral: <span className="font-bold text-gray-800">{payout.description || payout.reference}</span></p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded" min={0} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payment Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reference / Note</label>
                        <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. MPESA REF or Bank TXN" className="w-full p-2 border rounded" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                    <button
                        onClick={() => {
                            const parsedAmt = parseFloat(amount) || 0;
                            if (!parsedAmt || parsedAmt <= 0) return alert('Enter a valid amount.');
                            if (!reference.trim()) return alert('Enter a payment reference.');
                            onConfirm(payout.id, parsedAmt, reference.trim(), date);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700"
                    >
                        Confirm Payment
                    </button>
                </div>
            </div>
        </div>
    );
};

const Affiliates: React.FC = () => {
    const { addLandlord, landlords, staff, leads, tenants, rfTransactions, renovationInvestors, applications, updateRFTransaction, addBill, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Marketplace', 'create');
    const canEdit = isSuperAdmin || checkPermission('Marketplace', 'edit');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [selectedAffiliate, setSelectedAffiliate] = useState<LiveAffiliate | null>(null);
    const [reviewPayout, setReviewPayout] = useState<RFTransaction | null>(null);

    const handleConfirmPayout = (id: string, amount: number, reference: string, date: string) => {
        if (!canEdit) return alert('You do not have permission to process payouts.');
        updateRFTransaction(id, { status: 'Completed' as any, amount, reference, date });
        addBill({
            id: `bill-comm-${Date.now()}`,
            vendor: reviewPayout?.partyName || '',
            category: 'Referral Commission',
            amount,
            invoiceDate: date,
            dueDate: date,
            status: 'Paid',
            description: reviewPayout?.description || reviewPayout?.reference || 'Referral Commission',
            propertyId: '',
        } as any);
        alert(`Commission of KES ${amount.toLocaleString()} paid to ${reviewPayout?.partyName}.`);
        setReviewPayout(null);
    };

    // --- AGGREGATE AFFILIATE DATA ---
    const affiliates: LiveAffiliate[] = useMemo(() => {
        // Collect all potential affiliates (Role 'Affiliate' in Landlords/Users, Role 'Field Agent' or 'Affiliate' in Staff)
        // Also map 'Landlords' with specific type logic if needed, but primarily relying on role 'Affiliate'
        const staffAffiliates = staff.filter(s => s.role === 'Field Agent' || (s.role as string) === 'Affiliate').map(s => ({...s, affiliateType: s.role === 'Field Agent' ? 'Agent' : 'Staff Affiliate'}));
        const userAffiliates = landlords.filter(l => l.role === 'Affiliate').map(l => ({...l, affiliateType: 'Freelancer'})); // Default type if not stored, can enhance User model later

        const allPotential = [...staffAffiliates, ...userAffiliates];

        return allPotential.map(user => {
            const userId = user.id;

            // 1. Leads Referred (From Leads & Applications)
            const referredLeads = leads.filter(l => l.referrerId === userId);
            const referredApps = applications.filter(a => a.referrerId === userId);
            const totalLeads = referredLeads.length + referredApps.length;

            // 2. Leases Signed (From Tenants)
            const referredTenants = tenants.filter(t => t.referrerId === userId);
            const signedCount = referredTenants.filter(t => t.status === 'Active' || t.status === 'Overdue').length;

            // 3. Build the referral earnings model — this attributes each rfTransaction
            //    Referral Commission row to the affiliate and separates paid vs pending.
            const referralEvidence = [
                ...referredTenants.map(t => ({ name: t.name, source: t.name })),
                ...referredLeads.map(l => ({ name: l.tenantName, source: l.tenantName })),
                ...referredApps.map(a => ({ name: (a as any).tenantName ?? (a as any).name, source: (a as any).tenantName ?? (a as any).name })),
            ];
            const profileCommissions = (user as any)?.commissions ?? (user as any)?.profile?.commissions ?? [];
            const earningsModel = buildReferralEarningsModel({
                currentUser: { id: user.id, name: user.name, referralCode: (user as any).referralCode },
                profileCommissions,
                rfTransactions,
                referralEvidence,
            });

            // Map earning entries into activity rows carrying real commission values.
            const earningEntries: AffiliateActivity[] = earningsModel.entries.map((e: ReferralEarningsEntry) => ({
                id: e.id,
                date: e.date,
                name: e.source || 'Referral commission',
                kind: 'Commission',
                status: e.status === 'Completed' ? 'Paid' : 'Pending',
                commission: Math.round(e.amount),
            }));

            // Also list every referral touchpoint (lead / application / signed tenant),
            // pairing with a commission amount when the earnings model has one attributed.
            const commissionByName = new Map<string, number>();
            earningsModel.entries.forEach(e => {
                const key = String(e.source || '').toLowerCase().trim();
                if (key) commissionByName.set(key, (commissionByName.get(key) || 0) + Math.round(e.amount));
            });
            const findCommission = (name?: string | null) => {
                if (!name) return 0;
                return commissionByName.get(String(name).toLowerCase().trim()) || 0;
            };

            const touchpoints: AffiliateActivity[] = [
                ...referredTenants.map(t => ({
                    id: `tenant-${t.id}`,
                    date: t.onboardingDate || '',
                    name: t.name,
                    kind: 'Tenant' as const,
                    status: (t.status === 'Active' || t.status === 'Overdue' ? 'Active' : 'Signed') as AffiliateActivity['status'],
                    commission: findCommission(t.name),
                })),
                ...referredLeads.map(l => ({
                    id: `lead-${l.id}`,
                    date: l.date || '',
                    name: l.tenantName,
                    kind: 'Lead' as const,
                    status: 'Lead' as const,
                    commission: findCommission(l.tenantName),
                })),
            ];

            const allActivity = [...earningEntries, ...touchpoints]
                .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

            // Monthly commission series (last 12 months)
            const now = new Date();
            const months: Array<{ month: string; key: string; amount: number }> = [];
            for (let i = 11; i >= 0; i -= 1) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({
                    month: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                    key: d.toISOString().slice(0, 7),
                    amount: 0,
                });
            }
            earningsModel.entries.forEach(e => {
                const key = String(e.date || '').slice(0, 7);
                const bucket = months.find(m => m.key === key);
                if (bucket) bucket.amount += Math.round(e.amount);
            });

            return {
                id: userId,
                name: user.name,
                email: user.email,
                role: user.role,
                type: (user as any).affiliateType || 'Freelancer',
                referralCode: (user as any).referralCode || generateUserReferralCode(user.name, user.id),
                tier: (user as any).affiliateTier || (user as any).tier || 'Standard',
                stats: {
                    leadsReferred: totalLeads,
                    leasesSigned: signedCount,
                    totalEarned: Math.round(earningsModel.totalEarned),
                    totalPaid: Math.round(earningsModel.totalPaid),
                    nextPayout: Math.round(earningsModel.nextPayout),
                },
                recentReferrals: allActivity,
                monthlyEarnings: months.map(({ month, amount }) => ({ month, amount })),
            };
        });
    }, [staff, landlords, leads, tenants, rfTransactions, applications]);

    // Pending referral commissions to review/payout.
    // This was previously missing and caused a runtime crash -> blank page.
    const pendingReferralPayouts = useMemo(() => {
        return (rfTransactions || [])
            .filter(tx => tx.type === 'Referral Commission' && tx.status === 'Pending')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [rfTransactions]);


    const handleInvite = (data: any) => {
        if (!canCreate) return alert('You do not have permission to invite affiliates.');
        // Register as a "Landlord" type user but with 'Affiliate' role to grant portal access
        // Ideally we'd have a generic 'User' adder, but addLandlord works for external users in this schema
        const newUser: User = {
            id: `aff-${Date.now()}`,
            name: data.name,
            email: data.email,
            phone: data.phone,
            role: 'Affiliate', // This grants them access to Affiliate Portal
            status: 'Active',
            branch: 'Headquarters',
            // @ts-ignore - injecting extra property for local logic until type updated
            affiliateType: data.type
        };
        
        addLandlord(newUser);
        alert(`Invitation sent to ${data.email} successfully! They are now registered as a ${data.type} Affiliate.`);
        setIsInviteModalOpen(false);
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Affiliate Network</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage partners, freelancers, and influencers driving growth.</p>
                </div>
                <button 
                    onClick={() => {
                        try {
                            window.location.hash = '#/registration/users?category=affiliates';
                        } catch {
                            setIsInviteModalOpen(true);
                        }
                    }}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700 shadow-md flex items-center transition-transform active:scale-95"
                >
                    <Icon name="plus" className="w-4 h-4 mr-2" /> Invite Affiliate
                </button>
            </div>

            {/* Empty State or Grid */}
            {affiliates.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border-2 border-dashed border-gray-200">
                    <div className="p-4 bg-purple-50 rounded-full mb-4">
                        <Icon name="revenue" className="w-12 h-12 text-purple-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-700">No Affiliates Yet</h3>
                    <p className="text-gray-500 max-w-md text-center mt-2">Start your referral program by inviting freelancers, agents, or influencers to promote your properties.</p>
                    <button 
                        onClick={() => {
                            try {
                                window.location.hash = '#/registration/users?category=affiliates';
                            } catch {
                                setIsInviteModalOpen(true);
                            }
                        }}
                        className="mt-6 text-purple-600 font-bold hover:underline"
                    >
                        Send First Invite
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {affiliates.map(aff => (
                        <AffiliateCard 
                            key={aff.id} 
                            affiliate={aff} 
                            onViewPerformance={setSelectedAffiliate}
                        />
                    ))}
                    
                    <button 
                        onClick={() => {
                            try {
                                window.location.hash = '#/registration/users?category=affiliates';
                            } catch {
                                setIsInviteModalOpen(true);
                            }
                        }}
                        className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 text-gray-400 hover:border-purple-500 hover:text-purple-500 transition-all min-h-[200px] bg-gray-50 hover:bg-white"
                    >
                        <Icon name="plus" className="w-10 h-10 mb-2 opacity-50" />
                        <span className="font-bold">Add New Partner</span>
                    </button>
                </div>
            )}
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">Pending Payouts</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-4 py-3">Affiliate</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Referral</th>
                                <th className="px-4 py-3 text-right">Commission</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {pendingReferralPayouts.map((t) => (
                                <tr key={t.id}>
                                    <td className="px-4 py-3 font-medium">{t.partyName}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs uppercase font-bold">Referral</td>
                                    <td className="px-4 py-3 text-gray-600">{t.description || t.reference}</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-600">KES {Number(t.amount ?? 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => setReviewPayout(t)} className="text-blue-600 hover:underline text-xs font-bold">Review</button></td>
                                </tr>
                            ))}
                            {pendingReferralPayouts.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No pending referral commissions.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isInviteModalOpen && (
                <InviteAffiliateModal 
                    onClose={() => setIsInviteModalOpen(false)}
                    onInvite={handleInvite}
                />
            )}

            {selectedAffiliate && (
                <AffiliatePerformanceModal 
                    affiliate={selectedAffiliate}
                    onClose={() => setSelectedAffiliate(null)}
                />
            )}
            {reviewPayout && (
                <ReviewPayoutModal
                    payout={reviewPayout}
                    onClose={() => setReviewPayout(null)}
                    onConfirm={handleConfirmPayout}
                />
            )}
        </div>
    );
};

export default Affiliates;
