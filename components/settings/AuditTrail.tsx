// @ts-nocheck

import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

// --- Extended Types for Audit View ---
interface AuditLog {
    id: string;
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    module: 'Auth' | 'Tenants' | 'Finance' | 'Settings' | 'Properties' | 'Reports';
    details: string;
    timestamp: Date;
    ip: string;
    location: string;
    device: string;
    status: 'Success' | 'Failed' | 'Warning';
}

function inferModuleFromAction(action: string): AuditLog['module'] {
    const a = action.toLowerCase();
    if (a.includes('tenant') || a.includes('lease')) return 'Tenants';
    if (a.includes('payment') || a.includes('invoice') || a.includes('payout') || a.includes('bill')) return 'Finance';
    if (a.includes('property') || a.includes('unit')) return 'Properties';
    if (a.includes('report')) return 'Reports';
    if (a.includes('login') || a.includes('logout') || a.includes('password') || a.includes('auth')) return 'Auth';
    return 'Settings';
}

const StatCard: React.FC<{ title: string; value: string | number; subtext: string; icon: string; color: string }> = ({ title, value, subtext, icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className={`text-2xl font-extrabold mt-1 text-gray-800`}>{value}</h3>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-3 rounded-xl bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const AuditTrail: React.FC = () => {
    const { currentUser, auditLogs, tenants, properties, applications, offboardingRecords, bills, invoices, vendors, staff, landlords } = useData() as any;

    // East Africa Time (UTC+3). All audit timestamps are displayed in EAT.
    const fmtEAT = (d: Date) => d.toLocaleString('en-GB', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [moduleFilter, setModuleFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');

    const allLogs = useMemo((): AuditLog[] => {
        const fromAudit: AuditLog[] = (auditLogs || [])
            .map(e => {
                const ts = new Date(e.timestamp);
                return {
                    id: e.id,
                    userId: e.user,
                    userName: e.user,
                    userRole: 'User',
                    action: e.action,
                    module: inferModuleFromAction(e.action),
                    details: e.action,
                    timestamp: isNaN(ts.getTime()) ? new Date() : ts,
                    ip: '—',
                    location: '—',
                    device: '—',
                    status: 'Success',
                };
            });

        // Synthesize an audit feed from live app data so the trail reflects
        // real activity across every user even before explicit audit hooks
        // are wired into each mutation point.
        const synth: AuditLog[] = [];
        const push = (
            partial: Partial<AuditLog> & { timestamp: Date; action: string; details: string; userName: string }
        ) => {
            synth.push({
                id: partial.id || `${partial.action}-${partial.userName}-${partial.timestamp.getTime()}-${synth.length}`,
                userId: partial.userId || partial.userName,
                userName: partial.userName,
                userRole: partial.userRole || 'User',
                action: partial.action,
                module: partial.module || inferModuleFromAction(partial.action),
                details: partial.details,
                timestamp: partial.timestamp,
                ip: partial.ip || '—',
                location: partial.location || '—',
                device: partial.device || '—',
                status: partial.status || 'Success',
            });
        };
        const safeDate = (s?: string): Date | null => {
            if (!s) return null;
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        };

        (tenants || []).forEach((t: any) => {
            const onboard = safeDate(t.onboardingDate || t.leaseStartDate);
            if (onboard) push({
                timestamp: onboard,
                action: 'Tenant Onboarded',
                details: `${t.name} — ${t.propertyName || ''} ${t.unit || ''}`.trim(),
                userName: t.onboardedBy || t.agentName || t.assignedAgent || 'System',
                userRole: 'Agent',
                module: 'Tenants',
            });
            // Note: payment notifications are intentionally NOT part of the audit trail.
            (t.outstandingFines || []).forEach((f: any) => {
                const fd = safeDate(f.date);
                if (!fd) return;
                push({
                    timestamp: fd,
                    action: f.status === 'Paid' ? 'Fine Settled' : 'Fine Issued',
                    details: `${t.name} — ${f.type} KES ${Number(f.amount || 0).toLocaleString()}`,
                    userName: f.issuedBy || 'System',
                    userRole: 'Finance',
                    module: 'Finance',
                });
            });
        });

        (applications || []).forEach((a: any) => {
            const ad = safeDate(a.appliedDate || a.createdAt || a.submittedAt);
            if (!ad) return;
            push({
                timestamp: ad,
                action: `Application ${a.status || 'Submitted'}`,
                details: `${a.name || a.applicantName || 'Applicant'} — ${a.propertyName || ''} ${a.unitNumber || ''}`.trim(),
                userName: a.reviewedBy || a.name || a.applicantName || 'Applicant',
                userRole: a.reviewedBy ? 'Agent' : 'Applicant',
                module: 'Tenants',
            });
        });

        (offboardingRecords || []).forEach((o: any) => {
            const od = safeDate(o.exitDate || o.date || o.createdAt);
            if (!od) return;
            push({
                timestamp: od,
                action: 'Tenant Offboarded',
                details: `${o.tenantName || o.name || 'Tenant'} — ${o.reason || 'Lease ended'}`,
                userName: o.processedBy || 'Management',
                userRole: 'Management',
                module: 'Tenants',
            });
        });

        (properties || []).forEach((p: any) => {
            const pd = safeDate(p.createdAt || p.registeredAt || p.dateAdded);
            if (pd) push({
                timestamp: pd,
                action: 'Property Registered',
                details: `${p.name} — ${p.units?.length || 0} units`,
                userName: p.registeredBy || p.landlordName || 'Management',
                userRole: 'Management',
                module: 'Properties',
            });
        });

        (bills || []).forEach((b: any) => {
            const bd = safeDate(b.issuedDate || b.date || b.createdAt);
            if (!bd) return;
            push({
                timestamp: bd,
                action: `Bill ${b.status || 'Issued'}`,
                details: `${b.tenantName || b.payeeName || 'Tenant'} — KES ${Number(b.amount || 0).toLocaleString()}`,
                userName: b.issuedBy || 'Finance',
                userRole: 'Finance',
                module: 'Finance',
            });
        });

        (invoices || []).forEach((i: any) => {
            const id = safeDate(i.issuedDate || i.date || i.createdAt);
            if (!id) return;
            push({
                timestamp: id,
                action: `Invoice ${i.status || 'Issued'}`,
                details: `${i.landlordName || i.payeeName || ''} — KES ${Number(i.amount || i.total || 0).toLocaleString()}`,
                userName: i.issuedBy || 'Finance',
                userRole: 'Finance',
                module: 'Finance',
            });
        });

        [...(vendors || []), ...(staff || []), ...(landlords || [])].forEach((u: any) => {
            const ud = safeDate(u.joinedDate || u.createdAt || u.registeredAt);
            if (!ud) return;
            push({
                timestamp: ud,
                action: 'User Registered',
                details: `${u.name} — ${u.role || u.userRole || 'User'}`,
                userName: u.registeredBy || 'System',
                userRole: 'Management',
                module: 'Auth',
            });
        });

        return [...fromAudit, ...synth]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }, [auditLogs, tenants, properties, applications, offboardingRecords, bills, invoices, vendors, staff, landlords]);

    // 2. Filter based on Role
    const isSuperAdmin = currentUser?.role === 'Super Admin';
    
    const userLogs = useMemo(() => {
        if (!currentUser) return allLogs;
        if (isSuperAdmin) return allLogs;
        const uid = (currentUser as { id?: string }).id;
        const uname = (currentUser as { name?: string }).name;
        return allLogs.filter(log => (uid && log.userId === uid) || (uname && log.userName === uname));
    }, [allLogs, currentUser, isSuperAdmin]);

    // 3. Apply Search and UI Filters
    const filteredLogs = useMemo(() => {
        return userLogs.filter(log => {
            const matchesSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  log.ip.includes(searchQuery);
            const matchesModule = moduleFilter === 'All' || log.module === moduleFilter;
            const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
            
            return matchesSearch && matchesModule && matchesStatus;
        });
    }, [userLogs, searchQuery, moduleFilter, statusFilter]);

    // 4. Analytics Calculations
    const stats = useMemo(() => {
        const today = new Date().toDateString();
        const loginsToday = userLogs.filter(l => l.action === 'Login' && l.timestamp.toDateString() === today).length;
        const failedActions = userLogs.filter(l => l.action.toLowerCase().includes('fail') || l.action.toLowerCase().includes('error')).length;
        const totalActions = userLogs.length;
        const distinctLocations = new Set(userLogs.map(l => l.location)).size;

        // Activity by Hour (Bar Chart)
        const hours = Array(24).fill(0);
        userLogs.forEach(l => {
            hours[l.timestamp.getHours()]++;
        });

        // Module Usage (Doughnut)
        const moduleCounts: Record<string, number> = {};
        userLogs.forEach(l => {
            moduleCounts[l.module] = (moduleCounts[l.module] || 0) + 1;
        });

        return { loginsToday, failedActions, totalActions, distinctLocations, hours, moduleCounts };
    }, [userLogs]);

    // Charts Config
    const activityChartData = {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [{
            label: 'Activity Volume',
            data: stats.hours,
            backgroundColor: '#3b82f6',
            borderRadius: 4,
        }]
    };

    const moduleChartData = {
        labels: Object.keys(stats.moduleCounts),
        datasets: [{
            data: Object.values(stats.moduleCounts),
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#64748b'],
            borderWidth: 0
        }]
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">
                        {isSuperAdmin ? 'Global Audit Trail' : 'My Activity Log'}
                    </h1>
                    <p className="text-lg text-gray-500 mt-1">
                        {isSuperAdmin 
                            ? 'Monitor all system access, security events, and user activities.' 
                            : 'Review your login history and actions performed.'}
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 shadow-sm flex items-center">
                        <Icon name="shield" className="w-4 h-4 mr-2 text-green-600" />
                        System Status: Secure
                    </div>
                </div>
            </div>

            {/* Analytics Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title={isSuperAdmin ? "Total Logins (24h)" : "My Logins (24h)"}
                    value={stats.loginsToday}
                    subtext="Successful authentication events"
                    icon="keys"
                    color="#10b981"
                />
                <StatCard 
                    title="Total Activities" 
                    value={stats.totalActions}
                    subtext="Last 7 Days"
                    icon="analytics"
                    color="#3b82f6"
                />
                <StatCard 
                    title="Security Flags" 
                    value={stats.failedActions}
                    subtext="Failed attempts or errors"
                    icon="shield"
                    color="#ef4444"
                />
                <StatCard 
                    title="Locations" 
                    value={stats.distinctLocations}
                    subtext="Unique access points"
                    icon="branch"
                    color="#8b5cf6"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Activity Volume Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Activity by Hour (24h)</h3>
                    <div className="h-64">
                        <Bar 
                            data={activityChartData} 
                            options={{ 
                                responsive: true, 
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: { x: { grid: { display: false } } }
                            }} 
                        />
                    </div>
                </div>

                {/* Module Distribution Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Action Distribution</h3>
                    <div className="h-64 flex justify-center">
                        <Doughnut 
                            data={moduleChartData} 
                            options={{ 
                                cutout: '70%', 
                                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } 
                            }} 
                        />
                    </div>
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters Toolbar */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <h3 className="font-bold text-gray-700">Detailed Logs</h3>
                    <div className="flex flex-wrap gap-3 w-full md:w-auto">
                        <div className="relative flex-grow md:flex-grow-0">
                            <input 
                                type="text" 
                                placeholder="Search logs..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary w-full md:w-64"
                            />
                            <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        </div>
                        <select 
                            value={moduleFilter} 
                            onChange={e => setModuleFilter(e.target.value)}
                            className="p-2 border rounded-lg text-sm bg-white"
                        >
                            <option value="All">All Modules</option>
                            <option value="Auth">Auth & Security</option>
                            <option value="Finance">Finance</option>
                            <option value="Tenants">Tenants</option>
                            <option value="Settings">Settings</option>
                        </select>
                        <select 
                            value={statusFilter} 
                            onChange={e => setStatusFilter(e.target.value)}
                            className="p-2 border rounded-lg text-sm bg-white"
                        >
                            <option value="All">All Statuses</option>
                            <option value="Success">Success</option>
                            <option value="Failed">Failed</option>
                            <option value="Warning">Warning</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-white text-gray-500 uppercase text-xs font-bold border-b">
                            <tr>
                                <th className="px-6 py-4">Timestamp</th>
                                {isSuperAdmin && <th className="px-6 py-4">User</th>}
                                <th className="px-6 py-4">Action</th>
                                <th className="px-6 py-4">Module</th>
                                <th className="px-6 py-4">Details</th>
                                {isSuperAdmin && <th className="px-6 py-4">Location / IP</th>}
                                <th className="px-6 py-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredLogs.slice(0, 50).map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-gray-600 font-mono text-xs whitespace-nowrap">
                                        {fmtEAT(log.timestamp)} <span className="text-gray-400">EAT</span>
                                    </td>
                                    {isSuperAdmin && (
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-800">{log.userName}</div>
                                            <div className="text-xs text-gray-500">{log.userRole}</div>
                                        </td>
                                    )}
                                    <td className="px-6 py-4 font-medium text-gray-800">{log.action}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                                            {log.module}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate" title={log.details}>
                                        {log.details}
                                        <div className="text-[10px] text-gray-400 mt-0.5">{log.device}</div>
                                    </td>
                                    {isSuperAdmin && (
                                        <td className="px-6 py-4 text-xs text-gray-500">
                                            <div>{log.location}</div>
                                            <div className="font-mono text-gray-400">{log.ip}</div>
                                        </td>
                                    )}
                                    <td className="px-6 py-4 text-right">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            log.status === 'Success' ? 'bg-green-100 text-green-700' :
                                            log.status === 'Failed' ? 'bg-red-100 text-red-700' :
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={isSuperAdmin ? 7 : 5} className="p-8 text-center text-gray-400">
                                        No logs found matching your criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 text-center">
                    Showing most recent 50 logs of {filteredLogs.length} total events.
                </div>
            </div>
        </div>
    );
};

export default AuditTrail;
