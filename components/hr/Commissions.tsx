
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { getTodayIsoDate } from '../../utils/timezone';

export interface CommissionRecord {
    id: string;
    recipientName: string;
    role: string;
    date: string;
    amount: number;
    source: string;
    status: 'Paid' | 'Pending';
}

const HRCommissions: React.FC = () => {
    const { staff, landlords, rfTransactions, users } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('All');

    const commissionsList = useMemo(() => {
        const list: CommissionRecord[] = [];
        const seenKeys = new Set<string>();

        // 1. Staff commissions
        staff.forEach(s => {
            (s.commissions || []).forEach((c, idx) => {
                const key = `staff-${s.id}-${c.date}-${c.amount}-${c.source}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    list.push({
                        id: key,
                        recipientName: s.name || 'Staff Member',
                        role: s.role || 'Staff',
                        date: c.date || getTodayIsoDate(),
                        amount: Number(c.amount) || 0,
                        source: c.source || 'Performance Commission',
                        status: 'Paid'
                    });
                }
            });

            // Staff referrals
            (s.referrals || []).forEach((r, idx) => {
                if (r.commission && r.commission > 0) {
                    const key = `staff-ref-${s.id}-${r.date}-${r.commission}-${r.tenantName}`;
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        list.push({
                            id: key,
                            recipientName: s.name || 'Staff Member',
                            role: s.role || 'Staff',
                            date: r.date || getTodayIsoDate(),
                            amount: Number(r.commission) || 0,
                            source: `Tenant Referral: ${r.tenantName}`,
                            status: r.status === 'Signed' ? 'Paid' : 'Pending'
                        });
                    }
                }
            });
        });

        // 2. Landlord commissions
        landlords.forEach(l => {
            ((l as any).commissions || []).forEach((c: any, idx: number) => {
                const key = `landlord-${l.id}-${c.date}-${c.amount}-${c.source}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    list.push({
                        id: key,
                        recipientName: `${l.name} (Landlord)`,
                        role: 'Landlord',
                        date: c.date || getTodayIsoDate(),
                        amount: Number(c.amount) || 0,
                        source: c.source || 'Property Referral Commission',
                        status: 'Paid'
                    });
                }
            });
        });

        // 3. RF Transactions (Referral / Affiliate / Agent Commission payments)
        (rfTransactions || []).forEach(t => {
            const isComm = t.type === 'Referral Commission' || 
                           (t.description && t.description.toLowerCase().includes('commission'));
            if (isComm && Number(t.amount) > 0) {
                const key = `rf-${t.id}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    list.push({
                        id: key,
                        recipientName: t.partyName || 'Affiliate / Agent',
                        role: 'Affiliate Partner',
                        date: t.date || getTodayIsoDate(),
                        amount: Number(t.amount) || 0,
                        source: t.description || t.reference || 'Referral Commission',
                        status: t.status === 'Completed' ? 'Paid' : 'Pending'
                    });
                }
            }
        });

        // 4. Users commissions
        (users || []).forEach(u => {
            const userComms = (u as any).commissions || (u as any).profile?.commissions || [];
            userComms.forEach((c: any, idx: number) => {
                const key = `user-${u.id}-${c.date}-${c.amount}-${c.source}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    list.push({
                        id: key,
                        recipientName: u.name || (u as any).fullName || 'App User',
                        role: u.role || 'User',
                        date: c.date || getTodayIsoDate(),
                        amount: Number(c.amount) || 0,
                        source: c.source || 'Referral Bonus',
                        status: 'Paid'
                    });
                }
            });
        });

        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [staff, landlords, rfTransactions, users]);

    // Role options for filter
    const roleOptions = useMemo(() => {
        const set = new Set<string>();
        commissionsList.forEach(c => set.add(c.role));
        return Array.from(set);
    }, [commissionsList]);

    const filteredCommissions = useMemo(() => {
        return commissionsList.filter(c => {
            const matchesSearch = c.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 c.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 c.role.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'All' || c.role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [commissionsList, searchQuery, roleFilter]);

    const totalCommissionsEarned = useMemo(() => {
        return commissionsList.reduce((sum, c) => sum + c.amount, 0);
    }, [commissionsList]);

    const uniqueEarnersCount = useMemo(() => {
        return new Set(commissionsList.map(c => c.recipientName)).size;
    }, [commissionsList]);

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/hr-payroll/staff-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Staff Management
            </button>
            
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Commissions & Bonuses</h1>
                <p className="text-lg text-gray-500 mt-1">Track real-time commission earnings, referral payouts, and performance bonuses.</p>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase text-gray-400">Total Commissions Paid</p>
                        <p className="text-2xl font-black text-green-600 mt-1">KES {totalCommissionsEarned.toLocaleString()}</p>
                    </div>
                    <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                        <Icon name="payments" className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase text-gray-400">Commission Records</p>
                        <p className="text-2xl font-black text-blue-600 mt-1">{commissionsList.length}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                        <Icon name="check" className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase text-gray-400">Active Beneficiaries</p>
                        <p className="text-2xl font-black text-purple-600 mt-1">{uniqueEarnersCount}</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                        <Icon name="user-circle" className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search beneficiary, role, or source..."
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                    />
                </div>

                {roleOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">Role:</span>
                        <select
                            value={roleFilter}
                            onChange={e => setRoleFilter(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 focus:outline-none shadow-sm"
                        >
                            <option value="All">All Roles</option>
                            {roleOptions.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {filteredCommissions.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-gray-50/80 uppercase text-gray-500 font-bold text-xs border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Beneficiary</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Source / Trigger</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredCommissions.map(comm => (
                                    <tr key={comm.id} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="px-6 py-4 text-gray-600 font-medium whitespace-nowrap">{comm.date}</td>
                                        <td className="px-6 py-4 font-semibold text-gray-800">{comm.recipientName}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                                                {comm.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{comm.source}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold ${comm.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                {comm.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-green-600 whitespace-nowrap">
                                            KES {comm.amount.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <Icon name="payments" className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No commission records found matching criteria.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HRCommissions;
