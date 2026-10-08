
import React, { useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import Icon from '../../Icon';

const NavCard: React.FC<{ title: string; icon: string; description: string; link: string; color: string }> = ({ title, icon, description, link, color }) => (
    <div 
        onClick={() => window.location.hash = link}
        className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group flex flex-col items-center text-center hover:border-primary/50"
    >
        <div className={`p-4 rounded-full bg-opacity-10 mb-4 transition-transform group-hover:scale-110`} style={{ backgroundColor: `${color}15`, color: color }}>
            <Icon name={icon} className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
    </div>
);

const StatCard: React.FC<{ title: string; value: string | number; subtext: string; color: string; icon: string }> = ({ title, value, subtext, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const LeasesOverview: React.FC = () => {
    const { tenants, getOccupancyRate } = useData();

    // Stats Calculation
    const stats = useMemo(() => {
        const totalLeases = tenants.filter(t => t.status === 'Active' || t.status === 'Overdue' || t.status === 'Notice').length;
        
        const now = new Date();
        const ninetyDays = new Date();
        ninetyDays.setDate(now.getDate() + 90);
        
        const expiring = tenants.filter(t => t.leaseEnd && new Date(t.leaseEnd) > now && new Date(t.leaseEnd) <= ninetyDays).length;
        
        const occupancy = getOccupancyRate();
        
        // Mock average lease length for demo as data might be missing
        const avgLeaseLength = "12 Months";

        return { totalLeases, expiring, occupancy, avgLeaseLength };
    }, [tenants, getOccupancyRate]);

    const modules = [
        { title: "Active Leases", icon: "leases", description: "View and manage current active lease agreements.", link: "#/operations/leases/active-leases", color: "#10b981" },
        { title: "Renewals", icon: "time", description: "Track expiring leases and process renewals.", link: "#/operations/leases/renewals", color: "#f59e0b" },
        { title: "Amendments", icon: "settings", description: "Modify terms of existing lease contracts.", link: "#/operations/leases/amendments", color: "#3b82f6" },
        { title: "Missing Leases", icon: "arrears", description: "Tenants without valid lease documentation.", link: "#/operations/leases/tenants-without-leases", color: "#ef4444" },
        { title: "Lease Documents", icon: "stack", description: "Digital vault for stored lease files.", link: "#/operations/leases/lease-documents", color: "#6366f1" },
        { title: "Templates", icon: "register", description: "Manage standard lease agreement templates.", link: "#/operations/leases/lease-templates", color: "#8b5cf6" },
        { title: "Terminations", icon: "offboarding", description: "Process move-outs and lease terminations.", link: "#/operations/leases/terminations", color: "#f97316" },
        { title: "E-Signature", icon: "check", description: "Track digital signature status.", link: "#/operations/leases/esignature", color: "#06b6d4" },
        { title: "Reporting", icon: "analytics", description: "Lease analytics and retention metrics.", link: "#/operations/leases/reporting", color: "#14b8a6" },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Lease Management</h1>
                <p className="text-lg text-gray-500 mt-1">Central hub for all tenancy contracts and documentation.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Active Leases" value={stats.totalLeases} subtext="Current Agreements" color="#3b82f6" icon="leases" />
                <StatCard title="Occupancy Rate" value={`${stats.occupancy}%`} subtext="Portfolio Wide" color="#10b981" icon="vacant-house" />
                <StatCard title="Expiring Soon" value={stats.expiring} subtext="Next 90 Days" color="#f59e0b" icon="time" />
                <StatCard title="Avg. Term" value={stats.avgLeaseLength} subtext="Standard Contract" color="#8b5cf6" icon="stack" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {modules.map((mod) => (
                    <NavCard key={mod.title} {...mod} />
                ))}
            </div>
        </div>
    );
};

export default LeasesOverview;
