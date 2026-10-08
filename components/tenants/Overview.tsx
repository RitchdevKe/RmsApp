
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { computeTenantArrears } from '../../utils/tenantArrears';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { getCurrentMonthIso } from '../../utils/timezone';

// --- Card Styles ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

// Helper Chart Component
const Chart: React.FC<{ type: 'bar' | 'pie' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = "h-64" }) => {
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

interface InsightCardProps {
    title: string;
    value: string | number;
    subtext: string;
    color: string;
    icon: string;
    link: string;
    onClick: (link: string) => void;
}

const InsightCard: React.FC<InsightCardProps> = ({ title, value, subtext, color, icon, link, onClick }) => (
    <div 
        onClick={() => onClick(link)}
        className={`${MAJOR_CARD_CLASSES} p-5 cursor-pointer group`} 
    >
        <div className="relative z-10 flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wide group-hover:text-gray-700">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-800 mt-2">{value}</h3>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className="p-3 rounded-full bg-gray-50 group-hover:bg-gray-100 transition-colors">
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const TenantsOverview: React.FC = () => {
    const { tenants, applications, tasks, properties, getOccupancyRate, currentUser, roles } = useData();

    const canView = (widgetId: string) => {
        if (!currentUser) return false;
        if ((currentUser as any).role === 'Super Admin') return true;
        const roleDef = roles.find(r => r.name === (currentUser as any).role);
        if (!roleDef) return false;
        return (roleDef.widgetAccess || []).includes(widgetId);
    };
    const [searchQuery, setSearchQuery] = useState('');

    // --- Comprehensive Calculations ---
    const stats = useMemo(() => {
        const now = new Date();
        const warningDate = new Date();
        warningDate.setDate(now.getDate() + 60);

        // Basic Counts
        const currentMonthIso = getCurrentMonthIso();
        const totalTenants = tenants.length;
        const activeTenants = tenants.filter(t => t.status === 'Active').length;
        
        const overdueTenantsList = tenants.filter(t => {
            if (['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status))) return false;
            if (!Number(t.rentAmount ?? 0)) return false;
            try {
                const accrued = computeTenantArrears(t, currentMonthIso, { allTenants: tenants }).totalArrears || 0;
                const adminArrears = Math.max(0, Number((t as any).arrears ?? 0));
                return Math.max(accrued, adminArrears) > 0;
            } catch { return false; }
        });
        
        const overdueTenants = overdueTenantsList.length;
        const noticeTenants = tenants.filter(t => t.status === 'Notice').length;
        
        // Leasing
        const fixedLeases = tenants.filter(t => t.leaseType === 'Fixed').length;
        const openLeases = tenants.filter(t => t.leaseType === 'Open').length;
        const expiringSoon = tenants.filter(t => t.leaseEnd && new Date(t.leaseEnd) > now && new Date(t.leaseEnd) <= warningDate).length;
        
        // Applications
        const pendingApps = applications.filter(a => a.status === 'New' || a.status === 'Under Review').length;
        
        // Financials
        const totalDeposits = tenants.reduce((sum, t) => sum + (t.depositPaid || 0), 0);
        
        const arrearsVolume = overdueTenantsList.reduce((sum, t) => sum + (t.arrears || t.rentAmount || 0), 0);
        
        // Operations
        const maintenanceReqs = tasks.filter(t => t.source === 'Internal' && t.status !== 'Completed' && t.status !== 'Closed').length;
        
        // Derived Metrics
        const occupancyRate = getOccupancyRate();
        const paymentCompliance = totalTenants > 0 ? Math.round(((totalTenants - overdueTenants) / totalTenants) * 100) : 100;
        
        // Average Stay (Mock - would use onboarding date diff in real app)
        const avgStay = "1.2 Years"; 

        return {
            totalTenants,
            activeTenants,
            overdueTenants,
            noticeTenants,
            fixedLeases,
            openLeases,
            expiringSoon,
            occupancyRate,
            pendingApps,
            totalDeposits,
            arrearsVolume,
            overdueTenantsList,
            maintenanceReqs,
            paymentCompliance,
            avgStay
        };
    }, [tenants, applications, tasks, getOccupancyRate]);

    // --- Card Configuration ---
    const allCards = [
        { 
            id: 'total_tenants',
            title: "Total Tenants", 
            value: stats.totalTenants, 
            subtext: "Active Profiles", 
            color: "#3b82f6", 
            icon: "tenants", 
            link: '#/tenants/active-tenants' 
        },
        { 
            id: 'occupancy',
            title: "Occupancy Rate", 
            value: `${stats.occupancyRate}%`, 
            subtext: "Portfolio Wide", 
            color: "#10b981", 
            icon: "vacant-house",
            link: '#/analytics/occupancy-tenancy'
        },
        { 
            id: 'pending_apps',
            title: "Pending Applications", 
            value: stats.pendingApps, 
            subtext: "Needs Review", 
            color: "#8b5cf6", 
            icon: "register",
            link: '#/tenants/applications'
        },
        { 
            id: 'maintenance',
            title: "Open Requests", 
            value: stats.maintenanceReqs, 
            subtext: "Tenant Reported", 
            color: "#f59e0b", 
            icon: "maintenance",
            link: '#/maintenance/request-intake'
        },
        { 
            id: 'arrears_count',
            title: "Late Payers", 
            value: stats.overdueTenants, 
            subtext: stats.overdueTenants > 0 
                ? `${stats.overdueTenantsList.slice(0, 2).map(t => t.name).join(', ')}${stats.overdueTenants > 2 ? '...' : ''}`
                : "No Tenants in Arrears", 
            color: "#ef4444", 
            icon: "arrears",
            link: '#/reports/financial-reports'
        },
        { 
            id: 'arrears_vol',
            title: "Arrears Volume", 
            value: `KES ${stats.arrearsVolume.toLocaleString()}`, 
            subtext: "Total Outstanding", 
            color: "#ef4444", 
            icon: "payments",
            link: '#/accounting/income'
        },
        { 
            id: 'deposits',
            title: "Deposits Held", 
            value: `KES ${(stats.totalDeposits/1000000).toFixed(2)}M`, 
            subtext: "Liability Account", 
            color: "#0ea5e9", 
            icon: "wallet",
            link: '#/accounting/financial-statements'
        },
        { 
            id: 'compliance',
            title: "Payment Compliance", 
            value: `${stats.paymentCompliance}%`, 
            subtext: "On-time Rate", 
            color: "#22c55e", 
            icon: "check",
            link: '#/analytics/financial-performance'
        },
        { 
            id: 'expiring',
            title: "Expiring Soon", 
            value: stats.expiringSoon, 
            subtext: "Next 60 Days", 
            color: "#eab308", 
            icon: "leases",
            link: '#/general-operations/leases/renewals'
        },
        { 
            id: 'month_month',
            title: "Month-to-Month", 
            value: stats.openLeases, 
            subtext: "Unsecured Revenue", 
            color: "#6366f1", 
            icon: "leases",
            link: '#/general-operations/leases/active-leases'
        },
        { 
            id: 'notices',
            title: "On Notice", 
            value: stats.noticeTenants, 
            subtext: "Move-outs Pending", 
            color: "#f97316", 
            icon: "offboarding",
            link: '#/tenants/offboarding'
        },
        { 
            id: 'avg_stay',
            title: "Avg. Stay", 
            value: stats.avgStay, 
            subtext: "Retention Metric", 
            color: "#14b8a6", 
            icon: "analytics",
            link: '#/reports/tenancy-reports'
        }
    ];

    const filteredCards = useMemo(() => {
        if (!searchQuery) return allCards;
        return allCards.filter(c => 
            c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            c.subtext.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery, allCards]);

    // --- Chart Data ---
    const statusDistributionData = {
        labels: ['Active', 'Overdue', 'Notice'],
        datasets: [{
            data: [stats.activeTenants, stats.overdueTenants, stats.noticeTenants],
            backgroundColor: ['#22c55e', '#ef4444', '#f59e0b', '#000000'], // Added black as a placeholder for unexpected status if any
            borderWidth: 0
        }]
    };

    const leaseTypeData = {
        labels: ['Fixed Term', 'Month-to-Month'],
        datasets: [{
            label: 'Tenants',
            data: [stats.fixedLeases, stats.openLeases],
            backgroundColor: ['#3b82f6', '#8b5cf6'],
            borderRadius: 4
        }]
    };

    const navigateTo = (path: string) => {
        window.location.hash = path;
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Tenants Overview</h1>
                    <p className="text-lg text-gray-500 mt-1">High-level metrics and status of your tenancy portfolio.</p>
                </div>
                <div className="relative w-full md:w-64">
                    <input 
                        type="text" 
                        placeholder="Filter stats (e.g. 'Deposit', 'Lease')..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary shadow-sm"
                    />
                    <div className="absolute left-3 top-2.5 text-gray-400">
                        <Icon name="search" className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* Searchable KPI Grid */}
            {canView('ten_kpi') && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCards.map(card => (
                    <InsightCard 
                        key={card.id}
                        {...card}
                        onClick={navigateTo}
                    />
                ))}
                {filteredCards.length === 0 && (
                    <p className="col-span-full text-center text-gray-500 py-8">No insights match your search.</p>
                )}
            </div>}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {canView('ten_status_dist') && <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                    <div className="relative z-10">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Tenant Status Distribution</h3>
                        <div className="flex items-center justify-center">
                             <div className="w-full max-w-xs">
                                <Chart type="doughnut" data={statusDistributionData} options={{ cutout: '65%', plugins: { legend: { position: 'bottom' } } }} height="h-64" />
                             </div>
                        </div>
                    </div>
                </div>}
                {canView('ten_lease_struct') && <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                    <div className="relative z-10">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Lease Structure</h3>
                        <Chart type="bar" data={leaseTypeData} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} height="h-64" />
                    </div>
                </div>}
            </div>

            {/* Bottom Section: Actionable Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Expiring Leases List */}
                {canView('ten_expiring') && <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                                Expiring Leases (60 Days)
                            </h3>
                            <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">{stats.expiringSoon}</span>
                        </div>
                        {stats.expiringSoon > 0 ? (
                            <div className="text-sm text-gray-600 space-y-2">
                                 <p>Several leases are approaching expiry. Check the <button onClick={() => navigateTo('#/general-operations/leases/renewals')} className="text-primary font-semibold hover:underline">Renewals</button> module to initiate offers.</p>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 italic">No leases expiring in the immediate future.</p>
                        )}
                         <button onClick={() => navigateTo('#/general-operations/leases/active-leases')} className="mt-4 w-full py-2 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded transition-colors">
                            View Active Leases
                        </button>
                    </div>
                </div>}

                 {/* Financial Health Shortcut */}
                {canView('ten_financials') && <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                Collections & Arrears
                            </h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                            You have <strong className="text-red-600">{stats.overdueTenants} tenants</strong> marked as overdue.
                        </p>
                        <div className="space-y-2 max-h-40 overflow-y-auto mb-4 pr-1 custom-scrollbar">
                            {stats.overdueTenantsList.map(t => (
                                <div key={t.id} className="flex justify-between items-center p-2 rounded bg-red-50 border border-red-100">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-gray-800 truncate">{t.name}</p>
                                        <p className="text-[10px] text-gray-500 truncate">{t.unit}</p>
                                    </div>
                                    <p className="text-[11px] font-bold text-red-600 ml-2">KES {(t.arrears || t.rentAmount || 0).toLocaleString()}</p>
                                </div>
                            ))}
                            {stats.overdueTenants === 0 && (
                                <p className="text-xs text-gray-400 italic">No tenants currently in arrears.</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => navigateTo('#/tenants/active-tenants')} className="flex-1 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded transition-colors shadow-sm">
                                Review Arrears
                            </button>
                             <button onClick={() => navigateTo('#/general-operations/communications/automation')} className="flex-1 py-2 text-xs font-bold text-primary border border-primary hover:bg-primary/5 rounded transition-colors">
                                Auto-Reminders
                            </button>
                        </div>
                    </div>
                </div>}

                 {/* Quick Actions */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-md text-white flex flex-col justify-center border-t-[8px] border-t-primary border-b-[4px] border-b-secondary overflow-hidden relative">
                    <div className="relative z-10">
                        <h3 className="font-bold text-lg mb-1">Quick Actions</h3>
                        <p className="text-gray-400 text-sm mb-4">Manage tenant lifecycle</p>
                        
                        <div className="space-y-2">
                            <button onClick={() => navigateTo('#/tenants/applications')} className="w-full text-left px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm flex items-center">
                                <span className="mr-2">+</span> New Application
                            </button>
                            <button onClick={() => navigateTo('#/tenants/offboarding')} className="w-full text-left px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm flex items-center">
                                <span className="mr-2">→</span> Offboard Tenant
                            </button>
                            <button onClick={() => navigateTo('#/tenants/fines-penalties')} className="w-full text-left px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm flex items-center">
                                <span className="mr-2">!</span> Manage Fines
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TenantsOverview;
