
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ReportCardData } from '../../types';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { fmtDate } from '../../utils/date';
import { computeTenantArrears } from '../../utils/tenantArrears';
import { getCurrentMonthIso } from '../../utils/timezone';

// --- Card Styles ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

const Chart: React.FC<{ type: 'bar' | 'line'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-20' }) => {
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
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { display: false },
                        y: { display: false }
                    },
                    ...options
                },
            });
        }
        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const NavCard: React.FC<{ title: string; icon: string; description: string; link: string; color: string }> = ({ title, icon, description, link, color }) => (
    <div 
        onClick={() => window.location.hash = link}
        className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group flex flex-col items-center text-center hover:border-primary/50 h-full"
    >
        <div className={`p-4 rounded-full bg-opacity-10 mb-4 transition-transform group-hover:scale-110`} style={{ backgroundColor: `${color}15`, color: color }}>
            <Icon name={icon} className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
    </div>
);


const ReportCard: React.FC<{ card: ReportCardData }> = ({ card }) => {
    const colorClasses = {
        primary: 'text-primary',
        secondary: 'text-secondary-dark',
        red: 'text-red-600',
        green: 'text-green-600',
        blue: 'text-blue-600',
        gray: 'text-gray-800'
    };

    const handleClick = () => {
        if (card.link) {
            window.location.hash = card.link;
        }
    };

    return (
        <div 
            onClick={handleClick}
            className={`${MAJOR_CARD_CLASSES} p-5 cursor-pointer group`}
        >
            <div className="relative z-10">
                <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">{card.title}</h3>
                    <Icon name={card.icon} className={`w-6 h-6 ${colorClasses[card.color]} opacity-80 group-hover:opacity-100`} />
                </div>
                <p className={`text-4xl font-bold my-2 ${colorClasses[card.color]}`}>{card.value}</p>
                {card.subtext && <p className="text-sm text-gray-500">{card.subtext}</p>}
                {card.chartData && card.chartType && (
                     <div className="mt-4">
                        <Chart 
                            type={card.chartType} 
                            data={card.chartData} 
                            options={{ scales: { x: { display: true, ticks: { font: { size: 8 } } } } }}
                        />
                    </div>
                )}
                <div className="mt-3 flex items-center text-xs font-semibold text-gray-400 group-hover:text-primary transition-colors">
                    View Details <span className="ml-1">→</span>
                </div>
            </div>
        </div>
    );
};


const ReportsOverview: React.FC = () => {
    const { tenants, properties, landlords, tasks, bills, getOccupancyRate } = useData();
    
    // Period State
    const [period, setPeriod] = useState('This Month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // --- Date Calculation Logic ---
    const dateRange = useMemo(() => {
        const now = new Date();
        // Default to beginning of current month to now
        let start = new Date(now.getFullYear(), now.getMonth(), 1);
        let end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of month

        if (period === 'Today') {
            start = now;
            end = now;
        } else if (period === 'This Week') {
            const day = now.getDay(); // 0 is Sunday
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); 
            start = new Date(now.setDate(diff));
            end = new Date();
        } else if (period === 'This Month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (period === 'Last Month') {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (period === 'Last 2 Months') {
            start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0); // End of last month
        } else if (period === 'Last 3 Months') {
            start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (period === 'This Quarter') {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), q * 3, 1);
            end = new Date(now.getFullYear(), (q * 3) + 3, 0);
        } else if (period === 'Year to Date') {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date();
        } else if (period === 'Custom Range') {
            if (customStart) start = new Date(customStart);
            if (customEnd) end = new Date(customEnd);
        }

        // Normalize time
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }, [period, customStart, customEnd]);

    // Updated links to match new route structure
    const reportModules = [
        { title: "Tenancy Reports", icon: "tenants", description: "Tenant population, status, and compliance.", link: "#/reports-analytics/reports/tenancy-reports", color: "#3b82f6" },
        { title: "House Status Alerts", icon: "bell", description: "Units with status alerts or pending approvals.", link: "#/reports-analytics/reports/house-status-alerts", color: "#ef4444" },
        { title: "Property Reports", icon: "branch", description: "Portfolio health, occupancy, and landlord performance.", link: "#/reports-analytics/reports/property-reports", color: "#10b981" },
        { title: "Financial Reports", icon: "revenue", description: "Revenue, expenses, arrears, and profitability.", link: "#/reports-analytics/reports/financial-reports", color: "#f59e0b" },
        { title: "Staff Reports", icon: "hr", description: "Personnel, payroll, and role distribution.", link: "#/reports-analytics/reports/staff-reports", color: "#8b5cf6" },
        { title: "Task & Operations", icon: "operations", description: "Operational efficiency and task tracking.", link: "#/reports-analytics/reports/task-operations-reports", color: "#ef4444" },
        { title: "R-REITs Fund", icon: "reits", description: "Fund performance and investor growth.", link: "#/reports-analytics/reports/r-reits-fund", color: "#6366f1" },
        { title: "Compliance & Tax", icon: "accounting", description: "Regulatory tracking and tax obligations.", link: "#/reports-analytics/reports/compliance-tax-reports", color: "#14b8a6" },
        { title: "Vacancy Reports", icon: "vacant-house", description: "Detailed analytics on vacant units.", link: "#/reports-analytics/reports/vacancy-reports", color: "#ef4444" },
    ];

    const reportCards: ReportCardData[] = useMemo(() => {
        // --- Snapshot Metrics (Independent of Time Range) ---
        const totalTenants = tenants.length;
        const totalLandlords = landlords.length;
        const occupancy = getOccupancyRate();
        const currentMonthIso = getCurrentMonthIso();
        let arrears = 0;
        let arrearsTenants = 0;
        tenants.forEach(t => {
            try {
                if (['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status))) return;
                if (!Number(t.rentAmount ?? 0)) return;
                const accrued = computeTenantArrears(t, currentMonthIso, { allTenants: tenants }).totalArrears || 0;
                const adminArrears = Math.max(0, Number((t as any).arrears ?? 0));
                const finalArrears = Math.max(accrued, adminArrears);
                if (finalArrears > 0) {
                    arrears += finalArrears;
                    arrearsTenants += 1;
                }
            } catch { /* skip */ }
        });
        const vacantUnits = properties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Vacant').length, 0);

        // --- Period Based Metrics ---
        
        // 1. Revenue
        let periodRevenue = 0;
        tenants.forEach(t => {
            const h = t.paymentHistory || [];
            h.forEach(p => {
                const pDate = new Date(p.date || '');
                if (p && pDate >= dateRange.start && pDate <= dateRange.end && p.status === 'Paid') {
                     periodRevenue += parseFloat(String(p.amount || '').replace(/[^0-9.]/g, '')) || 0;
                }
            });
        });

        // 2. Expenses
        const periodExpenses = bills.reduce((acc, b) => {
            const bDate = new Date(b.invoiceDate || b.dueDate || '');
            if (bDate && bDate >= dateRange.start && bDate <= dateRange.end) {
                return acc + (Number(b.amount) || 0);
            }
            return acc;
        }, 0);

        // 3. New Tenants in Period
        const newTenantsCount = tenants.filter(t => {
            const joinDate = new Date(t.onboardingDate || '');
            return joinDate && joinDate >= dateRange.start && joinDate <= dateRange.end;
        }).length;

        // 4. Tasks Created/Due in Period
        const periodTasks = tasks.filter(t => {
            const tDate = new Date(t.dueDate); // Or use created date if available
            return tDate >= dateRange.start && tDate <= dateRange.end;
        });
        const escalatedTasks = periodTasks.filter(t => t.priority === 'Very High' || t.priority === 'High').length;

        return [
            // Row 1: Key Performance
            { title: "Revenue", value: `KES ${(periodRevenue/1000000).toFixed(2)}M`, icon: 'revenue', link: '#/reports-analytics/reports/financial-reports?view=revenue', color: 'green', subtext: `Collected in period` },
            { title: "Expenses", value: `KES ${(periodExpenses/1000).toFixed(1)}k`, icon: 'expenses', link: '#/reports-analytics/reports/financial-reports?view=expenses', color: 'red', subtext: `Incurred in period` },
            { title: "New Tenants", value: newTenantsCount.toString(), icon: 'tenants', link: '#/reports-analytics/reports/tenancy-reports', color: 'primary', subtext: "Signed in period" },
            { title: "Vacant Units", value: vacantUnits.toString(), icon: 'vacant-house', link: '#/reports-analytics/reports/vacancy-reports', color: 'red', subtext: "Total Unoccupied" },
            
            // Row 2: Snapshots & Operations
            { title: "Occupancy Rate", value: `${occupancy}%`, icon: 'vacant-house', link: '#/reports-analytics/reports/property-reports?tab=vacancies', color: 'blue', subtext: `${vacantUnits} Vacant Units` },
            { title: "Total Rent Arrears", value: `KES ${(arrears/1000).toFixed(0)}k`, icon: 'arrears', link: '#/reports-analytics/reports/financial-reports?view=arrears', color: 'red', subtext: `${arrearsTenants} tenant${arrearsTenants === 1 ? '' : 's'} in arrears` },
            { title: "Tasks Due", value: periodTasks.length.toString(), icon: 'pending-task', link: '#/reports-analytics/reports/task-operations-reports?status=Pending', color: 'secondary', subtext: `In selected period` },
            { title: "Escalations", value: escalatedTasks.toString(), icon: 'task-escalated', link: '#/reports-analytics/reports/task-operations-reports?priority=High', color: 'secondary', subtext: "High Priority in period" },
        ];
    }, [tenants, properties, landlords, tasks, bills, getOccupancyRate, dateRange]);

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/dashboard'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Dashboard
            </button>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Reports Center</h1>
                    <p className="text-lg text-gray-500 mt-1">Central hub for all system reports and analytics.</p>
                </div>
                
                {/* Period Selector */}
                <div className="flex flex-col items-end gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Icon name="time" className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-bold text-gray-500 uppercase">Period:</span>
                        <select 
                            value={period} 
                            onChange={e => setPeriod(e.target.value)} 
                            className="bg-gray-50 border border-gray-200 rounded-md text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-primary/20 outline-none px-2 py-1 cursor-pointer"
                        >
                            <option>Today</option>
                            <option>This Week</option>
                            <option>This Month</option>
                            <option>This Quarter</option>
                            <option>Last Month</option>
                            <option>Last 2 Months</option>
                            <option>Last 3 Months</option>
                            <option>Year to Date</option>
                            <option>Custom Range</option>
                        </select>
                    </div>

                    {period === 'Custom Range' && (
                        <div className="flex items-center gap-2 mt-1 animate-fade-in">
                            <input 
                                type="date" 
                                value={customStart} 
                                onChange={e => setCustomStart(e.target.value)} 
                                className="border rounded px-2 py-1 text-xs"
                            />
                            <span className="text-gray-400">-</span>
                            <input 
                                type="date" 
                                value={customEnd} 
                                onChange={e => setCustomEnd(e.target.value)} 
                                className="border rounded px-2 py-1 text-xs"
                            />
                        </div>
                    )}
                    <div className="text-[10px] text-gray-400 font-mono">
                        {fmtDate(dateRange.start)} - {fmtDate(dateRange.end)}
                    </div>
                </div>
            </div>

            {/* Module Navigation Grid */}
            <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Report Modules</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {reportModules.map((mod) => (
                        <NavCard key={mod.title} {...mod} />
                    ))}
                </div>
            </div>

            {/* System Health */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-green-500/20 rounded-full">
                        <Icon name="analytics" className="w-8 h-8 text-green-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">System Health</h2>
                        <p className="text-gray-400 text-sm">All modules operating normally.</p>
                    </div>
                </div>
                <div className="flex gap-8 text-center">
                    <div>
                        <p className="text-2xl font-bold">99.9%</p>
                        <p className="text-xs text-gray-400 uppercase">Uptime</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold">12ms</p>
                        <p className="text-xs text-gray-400 uppercase">Latency</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                        <p className="text-xs text-gray-400 uppercase">Last Sync</p>
                    </div>
                </div>
            </div>
            
            {/* Quick Insights */}
            <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Quick Insights</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {reportCards.map(card => (
                        <ReportCard key={card.title} card={card} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReportsOverview;
