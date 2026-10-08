
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from './Icon';
import { useData } from '../context/DataContext';
import { exportToCSV, printSection } from '@/utils/exportHelper';
import { fmtDate } from '@/utils/date';
import { isUnitOccupiedByTenant } from '@/utils/unitOccupancy';
import { isRepurposedUnit } from '@/utils/repurposedUnits';

const navigate = (url: string) => {
    window.location.hash = url;
};

// --- Card Styles ---
// Major Cards: Top 8px Primary, Bottom 4px Secondary, Sides 3px Secondary + Vignette Effect
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";
const SMALL_CARD_CLASSES = "bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 flex flex-col relative overflow-hidden group";

interface InteractiveKpiCardProps {
    stat: {
        title: string;
        value: string | number;
        change?: string;
        changeType?: 'increase' | 'decrease' | 'neutral';
        period?: string;
        link: string;
    };
}

const KpiCard: React.FC<InteractiveKpiCardProps> = ({ stat }) => (
    <div 
        onClick={() => navigate(stat.link)}
        className={`${SMALL_CARD_CLASSES} cursor-pointer`}
    >
        <div className="relative z-10 flex-grow">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-500 font-medium text-sm group-hover:text-primary transition-colors">{stat.title}</p>
                    <p className="text-3xl font-bold text-gray-800 my-1">{stat.value}</p>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon name="chevron-down" className="w-4 h-4 text-gray-400 -rotate-90" />
                </div>
            </div>
            <div className="flex items-center text-xs mt-2">
                <span className={`font-semibold ${
                    stat.changeType === 'increase' ? 'text-green-600' : 
                    stat.changeType === 'decrease' ? 'text-red-600' : 'text-gray-500'
                }`}>
                    {stat.changeType === 'increase' ? '▲' : stat.changeType === 'decrease' ? '▼' : '•'} {stat.change}
                </span>
                <span className="text-gray-400 ml-1">{stat.period}</span>
            </div>
        </div>
    </div>
);

const Chart: React.FC<{ type: 'line' | 'bar' | 'pie'; data: any; options?: any; }> = ({ type, data, options }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;

        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                    },
                    ...options
                },
            });
        }

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };
    }, [type, data, options]);

    return <div className="relative h-72"><canvas ref={canvasRef}></canvas></div>;
};

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; reportUrl: string; }> = ({ title, children, defaultOpen = false, reportUrl }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-white rounded-xl shadow-sm mb-6">
            <div className="w-full flex justify-between items-center p-4 text-left border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                <div className="flex items-center space-x-4">
                    <button onClick={() => navigate(reportUrl)} className="text-sm font-semibold text-primary hover:text-primary-dark">View Report →</button>
                    <button onClick={() => setIsOpen(!isOpen)} className="p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-light">
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
            </div>
            {isOpen && (
                <div className="p-4 bg-gray-50/30">
                    {children}
                </div>
            )}
        </div>
    );
};


const QuickStats: React.FC = () => {
    const { tenants, tasks, properties, staff, bills } = useData();
    const [dateRange, setDateRange] = useState('Last 30 Days');
    const [branch, setBranch] = useState('All Branches');

    // --- Helper: Check if date is within selected range ---
    const isInRange = (dateStr?: string) => {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        const now = new Date();
        
        // Check for invalid dates
        if (isNaN(date.getTime())) return false;

        // Reset times for accurate date comparison
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        switch (dateRange) {
            case 'Today':
                return compareDate.getTime() === today.getTime();
            case 'This Week': {
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                return compareDate >= startOfWeek;
            }
            case 'Last Two Weeks': {
                const twoWeeksAgo = new Date(today);
                twoWeeksAgo.setDate(today.getDate() - 14);
                return compareDate >= twoWeeksAgo;
            }
            case 'Last 30 Days': {
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 30);
                return compareDate >= thirtyDaysAgo;
            }
            case '90 Days': {
                const ninetyDaysAgo = new Date(today);
                ninetyDaysAgo.setDate(today.getDate() - 90);
                return compareDate >= ninetyDaysAgo;
            }
            case 'This Year':
                return date.getFullYear() === now.getFullYear();
            default:
                return true;
        }
    };

    // --- Helper: Check if item belongs to selected branch ---
    const isInBranch = (propertyId?: string) => {
        if (branch === 'All Branches') return true;
        if (!propertyId) return false; // Orphaned items
        const property = properties.find(p => p.id === propertyId);
        return property?.branch === branch;
    };

    const selectedBranchProperties = useMemo(() => {
        return branch === 'All Branches' ? properties : properties.filter(p => p.branch === branch);
    }, [properties, branch]);

    const selectedBranchPropertyIds = useMemo(() => new Set(selectedBranchProperties.map(p => p.id)), [selectedBranchProperties]);
    const selectedBranchPropertyNames = useMemo(() => new Set(selectedBranchProperties.map(p => p.name)), [selectedBranchProperties]);
    const activeFieldAgents = useMemo(() => {
        return staff.filter(s => s.role === 'Field Agent' && s.status === 'Active' && (branch === 'All Branches' || s.branch === branch));
    }, [staff, branch]);
    const availableBranches = useMemo(() => {
        return Array.from(new Set(properties.map(p => String(p.branch || '').trim()).filter(Boolean))).sort();
    }, [properties]);

    // --- Live Data Calculations ---

    // 1. Membership & Tenants
    const membershipStats = useMemo(() => {
        // Filter Logic
        const filteredTenants = tenants.filter(t => isInBranch(t.propertyId));
        
        const newTenants = filteredTenants.filter(t => isInRange(t.onboardingDate)).length;
        const totalTenants = filteredTenants.length;
        
        // Churn: Tenants who vacated in range
        const churned = filteredTenants.filter(t => (t.status === 'Vacated' || t.status === 'Evicted') && isInRange(t.leaseEnd)).length;
        
        // Occupancy Rate for selected branch
        const branchProperties = branch === 'All Branches' ? properties : properties.filter(p => p.branch === branch);
        // Occupancy: count a unit as occupied if it has ANY active linked tenant
        // (main OR sub-occupancy). This defensively fixes stale unit.status values
        // left behind by reversed offboarding on multi-occupancy units.
        const rentableUnits = branchProperties.flatMap(p => p.units.filter(u => !isRepurposedUnit(u)).map(u => ({ u, p })));
        const totalUnits = rentableUnits.length;
        const occupiedUnits = rentableUnits.filter(({ u, p }) => u.status === 'Occupied' || isUnitOccupiedByTenant(u, tenants, p)).length;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        return {
            stats: [
                { title: 'Total Tenants', value: totalTenants, change: newTenants > 0 ? `+${newTenants}` : '0', changeType: 'increase', period: 'new in range', link: '#/partial-rms/reports/tenancy-reports' },
                { title: 'Occupancy Rate', value: `${occupancyRate}%`, change: 'Stable', changeType: 'neutral', period: branch === 'All Branches' ? 'portfolio wide' : 'branch specific', link: '#/partial-rms/reports/property-reports?tab=vacancies' },
                { title: 'New Sign-ups', value: newTenants, change: 'Growth', changeType: 'increase', period: 'in selection', link: '#/partial-rms/tenants/applications' },
                { title: 'Leases Ended', value: churned, change: totalTenants > 0 ? `${((churned/totalTenants)*100).toFixed(1)}%` : '0%', changeType: 'decrease', period: 'churn rate', link: '#/partial-rms/tenants/offboarding' },
            ],
            occupancyRate,
            totalTenants,
            newTenants
        };
    }, [tenants, properties, dateRange, branch]);

    // 2. Financial Performance
    const financialStats = useMemo(() => {
        const scopedTenants = tenants.filter(t => !!t.propertyId && selectedBranchPropertyIds.has(t.propertyId));

        let revenue = 0;
        let countPayments = 0;

        scopedTenants.forEach(t => {
            (t.paymentHistory || []).forEach(p => {
                if (p.status !== 'Paid' || !isInRange(p.date)) return;
                revenue += parseFloat(String(p.amount || '0').replace(/[^0-9.]/g, '')) || 0;
                countPayments++;
            });
        });

        const paidBillsInRange = bills.filter(b => {
            if (!selectedBranchPropertyIds.has(b.propertyId)) return false;
            if (b.status !== 'Paid') return false;
            return isInRange(b.invoiceDate || b.dueDate);
        });

        const billExpenses = paidBillsInRange.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

        const completedTasksInRange = tasks.filter(t => {
            if (!selectedBranchPropertyNames.has(t.property)) return false;
            if (!['Completed', 'Closed'].includes(t.status)) return false;
            return isInRange(t.dueDate);
        });

        const maintenanceExpenses = completedTasksInRange.reduce(
            (sum, t) => sum + (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0),
            0
        );

        const expenses = billExpenses + maintenanceExpenses;

        const overdueRent = scopedTenants.reduce((sum, t) => {
            return sum + (t.status === 'Overdue' ? Number(t.rentAmount || 0) : 0);
        }, 0);

        const pendingTenantBills = scopedTenants.reduce((sum, t) => {
            return sum + (t.outstandingBills || []).reduce((billSum, bill) => {
                return bill.status === 'Pending' ? billSum + (Number(bill.amount) || 0) : billSum;
            }, 0);
        }, 0);

        const outstanding = overdueRent + pendingTenantBills;
        const netProfit = revenue - expenses;
        const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        return {
            stats: [
                { title: 'Revenue', value: `KES ${(revenue/1000).toFixed(1)}K`, change: `${countPayments} paid txns`, changeType: 'increase', period: 'in range', link: '#/partial-rms/reports/financial-reports?view=revenue' },
                { title: 'Expenses', value: `KES ${(expenses/1000).toFixed(1)}K`, change: `${paidBillsInRange.length + completedTasksInRange.length} live entries`, changeType: 'decrease', period: 'bills + maintenance', link: '#/partial-rms/reports/financial-reports?view=expenses' },
                { title: 'Outstanding', value: `KES ${(outstanding/1000).toFixed(1)}K`, change: `${scopedTenants.filter(t => t.status === 'Overdue').length} overdue tenants`, changeType: 'decrease', period: 'current receivables', link: '#/partial-rms/reports/financial-reports?view=arrears' },
                { title: 'Net Profit', value: `KES ${(netProfit/1000).toFixed(1)}K`, change: `${margin.toFixed(1)}%`, changeType: netProfit > 0 ? 'increase' : netProfit < 0 ? 'decrease' : 'neutral', period: 'margin', link: '#/partial-rms/reports/financial-reports?view=net' },
            ],
            revenue,
            expenses,
            outstanding,
            netProfit
        };
    }, [tenants, bills, tasks, selectedBranchPropertyIds, selectedBranchPropertyNames, dateRange]);

    // 3. Operational Activity
    const operationalStats = useMemo(() => {
        const parseTaskTimestamp = (timestamp?: string) => {
            if (!timestamp) return null;
            const parsed = new Date(timestamp);
            return isNaN(parsed.getTime()) ? null : parsed;
        };

        const filteredTasks = tasks.filter(t => branch === 'All Branches' || selectedBranchPropertyNames.has(t.property));

        const completedTasksInRange = filteredTasks.filter(t => {
            if (!['Completed', 'Closed'].includes(t.status)) return false;
            const resolutionEvent = [...(t.history || [])].reverse().find(entry => {
                const event = String(entry.event || '').toLowerCase();
                return event.includes('completed') || event.includes('closed');
            });
            return isInRange(resolutionEvent?.timestamp || t.dueDate);
        });

        const completed = completedTasksInRange.length;
        const openTasks = filteredTasks.filter(t => !['Completed', 'Closed'].includes(t.status));
        const open = openTasks.length;
        const highPriorityOpen = openTasks.filter(t => ['High', 'Very High'].includes(String(t.priority))).length;

        const spend = completedTasksInRange.reduce((acc, t) => acc + (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0), 0);

        const resolutionDays = completedTasksInRange.reduce<number[]>((acc, t) => {
            const createdEvent = (t.history || []).find(entry => String(entry.event || '').toLowerCase().includes('task created'));
            const resolvedEvent = [...(t.history || [])].reverse().find(entry => {
                const event = String(entry.event || '').toLowerCase();
                return event.includes('completed') || event.includes('closed');
            });
            const createdAt = parseTaskTimestamp(createdEvent?.timestamp);
            const resolvedAt = parseTaskTimestamp(resolvedEvent?.timestamp || t.dueDate);
            if (!createdAt || !resolvedAt || resolvedAt < createdAt) return acc;
            acc.push((resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
            return acc;
        }, []);

        const avgResolutionDays = resolutionDays.length > 0
            ? resolutionDays.reduce((sum, days) => sum + days, 0) / resolutionDays.length
            : null;

        return [
            { title: 'Active Tasks', value: open, change: `${highPriorityOpen} high priority`, changeType: highPriorityOpen > 0 ? 'decrease' : 'neutral', period: 'open now', link: '#/partial-rms/general-operations/task-management' },
            { title: 'Completed', value: completed, change: `${filteredTasks.length > 0 ? Math.round((completed/filteredTasks.length)*100) : 0}%`, changeType: 'increase', period: 'resolved in range', link: '#/partial-rms/general-operations/reporting' },
            { title: 'Maint. Spend', value: `KES ${Number(spend ?? 0).toLocaleString()}`, change: `${completedTasksInRange.length} resolved tasks`, changeType: 'decrease', period: 'completed task costs', link: '#/partial-rms/maintenance/cost-tracking' },
            { title: 'Avg Resolution', value: avgResolutionDays === null ? '—' : `${avgResolutionDays.toFixed(1)} Days`, change: resolutionDays.length === 0 ? 'No timestamps' : `${resolutionDays.length} tasks`, changeType: avgResolutionDays !== null && avgResolutionDays <= 2 ? 'increase' : 'neutral', period: 'avg time to resolve', link: '#/partial-rms/general-operations/reporting' },
        ];
    }, [tasks, selectedBranchPropertyNames, branch, dateRange]);

    // --- AI Insights Calculation ---
    const aiInsights = useMemo(() => {
        const scopedTenants = tenants.filter(t => !!t.propertyId && selectedBranchPropertyIds.has(t.propertyId));
        const activeScopedTenants = scopedTenants.filter(t => !['Vacated', 'Evicted', 'Blacklisted', 'Inactive'].includes(t.status));
        const overdueCount = activeScopedTenants.filter(t => t.status === 'Overdue').length;
        const netPosition = financialStats.netProfit;
        const revenue = financialStats.revenue;
        const outstanding = financialStats.outstanding;
        const vacancies = selectedBranchProperties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Vacant').length, 0);
        const upcomingCutoff = new Date();
        upcomingCutoff.setDate(upcomingCutoff.getDate() + 60);
        const expiringLeases = activeScopedTenants.filter(t => {
            if (!t.leaseEnd) return false;
            const leaseEnd = new Date(t.leaseEnd);
            if (isNaN(leaseEnd.getTime())) return false;
            return leaseEnd >= new Date() && leaseEnd <= upcomingCutoff;
        }).length;
        const activeAgentCount = activeFieldAgents.length;
        const collectionPressure = revenue > 0 ? (outstanding / revenue) * 100 : outstanding > 0 ? 100 : 0;
        const scopeLabel = branch === 'All Branches' ? 'the full portfolio' : branch;
        const today = fmtDate(new Date());

        let summaryText = `TaskMe AI analysis for ${scopeLabel} as of ${today}. `;
        summaryText += `Occupancy is ${membershipStats.occupancyRate}% with ${vacancies} vacant unit${vacancies === 1 ? '' : 's'}. `;
        if (overdueCount === 0) summaryText += 'Collections are stable with no overdue tenant accounts.';
        else summaryText += `${overdueCount} overdue tenant account${overdueCount === 1 ? '' : 's'} require follow-up, representing KES ${(outstanding/1000).toFixed(1)}k in current receivables.`;

        const priorities = [];
        if (outstanding > 0) {
            priorities.push({ text: `Recover **KES ${(outstanding/1000).toFixed(1)}k** in receivables from **${overdueCount}** overdue tenant account${overdueCount === 1 ? '' : 's'}.`, level: 'HIGH' });
        } else {
            priorities.push({ text: `Protect the current positive collection position with **0 overdue accounts** in ${scopeLabel}.`, level: 'HIGH' });
        }

        if (vacancies > 0) {
            priorities.push({ text: `Deploy **${activeAgentCount}** active field agent${activeAgentCount === 1 ? '' : 's'} to fill **${vacancies}** vacant unit${vacancies === 1 ? '' : 's'}.`, level: 'MEDIUM' });
        } else {
            priorities.push({ text: `Maintain **${membershipStats.occupancyRate}%** occupancy across ${scopeLabel} and keep vacancy churn low.`, level: 'MEDIUM' });
        }

        if (expiringLeases > 0) {
            priorities.push({ text: `Prioritize renewal outreach for **${expiringLeases}** lease${expiringLeases === 1 ? '' : 's'} expiring within 60 days.`, level: 'LOW' });
        } else {
            priorities.push({ text: `Monitor operating efficiency and preserve the current **KES ${(netPosition/1000).toFixed(1)}k** net position.`, level: 'LOW' });
        }

        return {
            summaryText,
            netPosition,
            arrearsCount: overdueCount,
            riskScore: collectionPressure >= 50 || overdueCount > 5 ? 'High' : overdueCount > 0 || vacancies > 0 ? 'Moderate' : 'Optimal',
            priorities,
            marketWatch: [
                { category: 'Net Position', status: netPosition > 0 ? 'Steady' : netPosition < 0 ? 'High' : 'Watch', value: `KES ${(netPosition/1000).toFixed(0)}k` },
                { category: 'Receivables Pressure', status: collectionPressure >= 50 ? 'High' : collectionPressure > 0 ? 'Watch' : 'Optimal', value: `${collectionPressure.toFixed(1)}%` },
                { category: 'Lease Renewals', status: expiringLeases > 0 ? 'Watch' : 'Steady', value: `${expiringLeases} due` }
            ]
        };
    }, [tenants, selectedBranchPropertyIds, selectedBranchProperties, membershipStats, financialStats, activeFieldAgents, branch]);

    // --- Real Chart Data (top-level hooks) ---
    const cashFlowChartData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        const incomeData = new Array(12).fill(0);
        const expenseData = new Array(12).fill(0);

        const scopedTenants = (tenants || []).filter(t => !!t.propertyId && selectedBranchPropertyIds.has(t.propertyId));

        scopedTenants.forEach(t => {
            (t.paymentHistory || []).forEach(p => {
                const d = new Date(p.date);
                if (d.getFullYear() === currentYear && p.status === 'Paid') {
                    incomeData[d.getMonth()] += parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0;
                }
            });
        });

        (bills || []).forEach((b: any) => {
            const d = new Date(b.invoiceDate || b.dueDate || 0);
            if (d.getFullYear() === currentYear && b.status === 'Paid' && selectedBranchPropertyIds.has(b.propertyId)) {
                expenseData[d.getMonth()] += b.amount || 0;
            }
        });

        (tasks || []).forEach(t => {
            const d = new Date(t.dueDate);
            if (isNaN(d.getTime())) return;
            if (d.getFullYear() !== currentYear) return;
            if (!['Completed', 'Closed'].includes(t.status)) return;
            if (!selectedBranchPropertyNames.has(t.property)) return;
            expenseData[d.getMonth()] += (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
        });

        const idx = new Date().getMonth();
        const start = Math.max(0, idx - 5);
        return {
            labels: months.slice(start, idx + 1),
            datasets: [
                { label: 'Income', data: incomeData.slice(start, idx + 1), borderColor: '#10b981' },
                { label: 'Expenses', data: expenseData.slice(start, idx + 1), borderColor: '#ef4444' }
            ]
        };
    }, [tenants, bills, tasks, selectedBranchPropertyIds, selectedBranchPropertyNames]);

    const tenantGrowthChartData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const counts = new Array(12).fill(0);
        const currentYear = new Date().getFullYear();

        const scopedTenants = (tenants || []).filter(t => !!t.propertyId && selectedBranchPropertyIds.has(t.propertyId));

        scopedTenants.forEach(t => {
            try {
                const d = new Date(t.onboardingDate);
                if (!isNaN(d.getTime()) && d.getFullYear() === currentYear && isInRange(t.onboardingDate)) counts[d.getMonth()]++;
            } catch (_) {}
        });
        const idx = new Date().getMonth();
        const start = Math.max(0, idx - 5);
        return {
            labels: months.slice(start, idx + 1),
            datasets: [{ label: 'New Tenants', data: counts.slice(start, idx + 1), backgroundColor: '#3b82f6' }]
        };
    }, [tenants, selectedBranchPropertyIds, dateRange]);

    const agentPerformanceChartData = useMemo(() => {
        const scopedCompletedTasks = (tasks || []).filter(t => {
            if (!['Completed', 'Closed'].includes(t.status)) return false;
            if (branch !== 'All Branches' && !selectedBranchPropertyNames.has(t.property)) return false;
            return isInRange(t.dueDate);
        });

        const performanceRows = activeFieldAgents.map(agent => {
            const completedTasks = scopedCompletedTasks.filter(t => t.assignedTo === agent.name).length;
            return { name: agent.name, completedTasks };
        });

        if (performanceRows.length === 0) {
            return { labels: ['No active field agents'], datasets: [{ label: 'Completed Tasks', data: [0], backgroundColor: '#8b5cf6' }] };
        }

        const sortedRows = performanceRows.sort((a, b) => b.completedTasks - a.completedTasks || a.name.localeCompare(b.name));
        return {
            labels: sortedRows.map(row => row.name),
            datasets: [{ label: 'Completed Tasks', data: sortedRows.map(row => row.completedTasks), backgroundColor: '#8b5cf6' }]
        };
    }, [tasks, activeFieldAgents, selectedBranchPropertyNames, branch, dateRange]);

    const occupancyChartData = useMemo(() => {
        const occupied = selectedBranchProperties.reduce((acc, p) => acc + (p.units || []).filter(u => u.status === 'Occupied').length, 0);
        const vacant = selectedBranchProperties.reduce((acc, p) => acc + (p.units || []).filter(u => u.status === 'Vacant').length, 0);
        return {
            labels: ['Occupied', 'Vacant'],
            datasets: [{ label: 'Units', data: [occupied, vacant], backgroundColor: ['#10b981', '#f59e0b'] }]
        };
    }, [selectedBranchProperties]);

    const maintenanceChartData = useMemo(() => {
        const cats: Record<string, number> = { Plumbing: 0, Electrical: 0, Structural: 0, Other: 0 };

        const scopedTasks = (tasks || []).filter(t => {
            if (branch !== 'All Branches' && !selectedBranchPropertyNames.has(t.property)) return false;
            return isInRange(t.dueDate);
        });

        scopedTasks.forEach(t => {
            const title = (t.title || '').toLowerCase();
            if (title.includes('plumb') || title.includes('leak') || title.includes('tap')) cats.Plumbing++;
            else if (title.includes('electric') || title.includes('power') || title.includes('light')) cats.Electrical++;
            else if (title.includes('struct') || title.includes('wall') || title.includes('roof')) cats.Structural++;
            else if (t.title) cats.Other++;
        });
        return {
            labels: ['Plumbing', 'Electrical', 'Structural', 'Other'],
            datasets: [{ label: 'Requests', data: [cats.Plumbing, cats.Electrical, cats.Structural, cats.Other], backgroundColor: '#f59e0b' }]
        };
    }, [tasks, selectedBranchPropertyNames, branch, dateRange]);

    const paymentDistributionChartData = useMemo(() => {
        const methods: Record<string, number> = { 'M-Pesa': 0, Bank: 0, Cash: 0 };

        const scopedTenants = (tenants || []).filter(t => !!t.propertyId && selectedBranchPropertyIds.has(t.propertyId));

        scopedTenants.forEach(t => {
            (t.paymentHistory || []).filter(p => p.status === 'Paid' && isInRange(p.date)).forEach(p => {
                const m = (p.method || '').toLowerCase();
                if (m.includes('mpesa') || m.includes('m-pesa')) methods['M-Pesa']++;
                else if (m.includes('bank') || m.includes('transfer')) methods.Bank++;
                else methods.Cash++;
            });
        });
        return {
            labels: ['M-Pesa', 'Bank', 'Cash'],
            datasets: [{ data: [methods['M-Pesa'], methods.Bank, methods.Cash], backgroundColor: ['#10b981', '#3b82f6', '#9ca3af'] }]
        };
    }, [tenants, selectedBranchPropertyIds, dateRange]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'dateRange') setDateRange(value);
        if (name === 'branch') setBranch(value);
    };

    const handleExport = (type: 'CSV' | 'PDF') => {
        const exportData = [
            ...membershipStats.stats.map(s => ({ Category: 'Membership', ...s })),
            ...financialStats.stats.map(s => ({ Category: 'Financial', ...s })),
            ...operationalStats.map(s => ({ Category: 'Operational', ...s }))
        ];

        if (type === 'CSV') {
            exportToCSV(exportData, `QuickStats_Report_${branch}`);
        } else {
            printSection('quick-stats-content', `Quick Stats Report - ${branch}`);
        }
    };

    return (
        <div className="space-y-8 pb-8" id="quick-stats-content">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Quick Stats & Analytics</h1>
                <p className="text-lg text-gray-500 mt-1">Real-time performance metrics based on live system data.</p>
            </div>

            {/* Filters */}
            <div className={`${MAJOR_CARD_CLASSES} p-4 flex flex-col sm:flex-row gap-4 items-center flex-wrap no-print`}>
                <div className="relative z-10 w-full flex flex-col sm:flex-row gap-4 items-center">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Icon name="search" className="w-5 h-5 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">Filter View:</span>
                    </div>
                    
                    <select name="dateRange" value={dateRange} onChange={handleFilterChange} className="w-full sm:w-auto px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md focus:ring-primary focus:border-primary font-medium text-gray-700">
                        <option>Today</option>
                        <option>This Week</option>
                        <option>Last Two Weeks</option>
                        <option>Last 30 Days</option>
                        <option>90 Days</option>
                        <option>This Year</option>
                    </select>

                    <select name="branch" value={branch} onChange={handleFilterChange} className="w-full sm:w-auto px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md focus:ring-primary focus:border-primary font-medium text-gray-700">
                        <option>All Branches</option>
                        {availableBranches.map(branchName => (
                            <option key={branchName} value={branchName}>{branchName}</option>
                        ))}
                    </select>

                    <div className="flex-grow"></div>
                    
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={() => handleExport('CSV')} className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm">CSV</button>
                        <button onClick={() => handleExport('PDF')} className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark shadow-sm">PDF Report</button>
                    </div>
                </div>
            </div>
            
            {/* Membership Section */}
            <CollapsibleSection title="Membership & User Insights" defaultOpen reportUrl="#/partial-rms/reports/tenancy-reports">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {membershipStats.stats.map((stat, i) => (
                        <KpiCard key={i} stat={stat as any} />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                        <div className="relative z-10">
                            <h4 className="font-semibold mb-4 text-center text-gray-600">Tenant Growth Trend</h4>
                            <Chart type="bar" data={tenantGrowthChartData} />
                        </div>
                    </div>
                    <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                        <div className="relative z-10">
                            <h4 className="font-semibold mb-4 text-center text-gray-600">Agent Performance</h4>
                            <Chart type="bar" data={agentPerformanceChartData} />
                        </div>
                    </div>
                </div>
            </CollapsibleSection>
            
            {/* Financial Section */}
            <CollapsibleSection title="Financial Performance" defaultOpen reportUrl="#/partial-rms/reports/financial-reports">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {financialStats.stats.map((stat, i) => (
                        <KpiCard key={i} stat={stat as any} />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                        <div className="relative z-10">
                            <h4 className="font-semibold mb-4 text-center text-gray-600">Cash Flow (In vs Out)</h4>
                            <Chart type="line" data={cashFlowChartData} />
                        </div>
                    </div>
                    <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                        <div className="relative z-10">
                            <h4 className="font-semibold mb-4 text-center text-gray-600">Payment Methods</h4>
                            <div className="flex items-center justify-center">
                                <div className="w-64">
                                    <Chart type="pie" data={paymentDistributionChartData} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* Operations Section */}
            <CollapsibleSection title="Operational Activity" defaultOpen reportUrl="#/partial-rms/reports/task-operations-reports">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {operationalStats.map((stat, i) => (
                        <KpiCard key={i} stat={stat as any} />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                        <div className="relative z-10">
                            <h4 className="font-semibold mb-4 text-center text-gray-600">Occupancy vs Vacancy</h4>
                            <div className="flex items-center justify-center">
                                <div className="w-64">
                                    <Chart type="pie" data={occupancyChartData} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                        <div className="relative z-10">
                            <h4 className="font-semibold mb-4 text-center text-gray-600">Maintenance Categories</h4>
                            <Chart type="bar" data={maintenanceChartData} options={{ scales: { x: { stacked: true }, y: { stacked: true } } }}/>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* AI Intelligence Section */}
            <CollapsibleSection title="TaskMe AI Intelligence" defaultOpen reportUrl="#/partial-rms/analytics/overview">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative overflow-hidden">
                    {/* Decorative Background Element */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500"></div>
                    
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                                 <Icon name="analytics" className="w-6 h-6" /> 
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Daily Intelligence Briefing</h3>
                                <p className="text-xs text-gray-500">Updated: {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                        </div>
                        <button className="text-sm font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
                            Refresh
                        </button>
                    </div>

                    {/* Summary Text */}
                    <div className="bg-purple-50/50 border border-purple-100 p-4 rounded-xl mb-8">
                        <p className="text-purple-900 text-sm font-medium italic">
                            "{aiInsights.summaryText}"
                        </p>
                    </div>

                    {/* 3 Key Metrics Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="p-4 border rounded-xl bg-white shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                 <p className="text-xs font-bold text-gray-400 uppercase">Net Position</p>
                                 <Icon name="revenue" className="w-4 h-4 text-green-500" />
                            </div>
                            <p className="text-2xl font-bold text-gray-800">KES {(aiInsights.netPosition/1000).toFixed(0)}k</p>
                        </div>
                        <div className="p-4 border rounded-xl bg-white shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                 <p className="text-xs font-bold text-gray-400 uppercase">Arrears Count</p>
                                 <Icon name="arrears" className={`w-4 h-4 ${aiInsights.arrearsCount > 0 ? 'text-red-500' : 'text-green-500'}`} />
                            </div>
                            <p className="text-2xl font-bold text-gray-800">{aiInsights.arrearsCount}</p>
                        </div>
                         <div className="p-4 border rounded-xl bg-white shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                 <p className="text-xs font-bold text-gray-400 uppercase">Risk Score</p>
                                 <Icon name="analytics" className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-2xl font-bold text-gray-800">{aiInsights.riskScore}</p>
                        </div>
                    </div>

                    {/* Two Cards: Strategic Priorities & Market Watch */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Strategic Priorities */}
                        <div className="border border-gray-200 rounded-xl p-5 bg-white">
                            <h4 className="font-bold text-gray-700 flex items-center mb-4">
                                <Icon name="check" className="w-5 h-5 mr-2 text-gray-400" /> Strategic Priorities
                            </h4>
                            <div className="space-y-4">
                                {aiInsights.priorities.map((p, i) => (
                                    <div key={i} className="flex justify-between items-start pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                                        <div className="flex items-start gap-3">
                                            <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${p.level === 'HIGH' ? 'bg-red-500' : p.level === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
                                            <p className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: p.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}></p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                            p.level === 'HIGH' ? 'bg-red-100 text-red-700' : 
                                            p.level === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 
                                            'bg-blue-100 text-blue-700'
                                        }`}>{p.level}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Market Watch / Pulse */}
                        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50">
                            <h4 className="font-bold text-gray-700 flex items-center mb-4">
                                <Icon name="analytics" className="w-5 h-5 mr-2 text-gray-400" /> Performance Pulse
                            </h4>
                            <div className="space-y-4">
                                 {aiInsights.marketWatch.map((m, i) => (
                                    <div key={i} className="flex justify-between items-center py-2">
                                        <span className="text-sm text-gray-500 font-medium">{m.category}</span>
                                        <div className="flex items-center gap-4">
                                            <span className={`text-xs px-2 py-1 rounded font-bold ${
                                                m.status === 'Excellent' || m.status === 'Optimal' || m.status === 'Steady' ? 'bg-green-100 text-green-700' : 
                                                m.status === 'High' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'
                                            }`}>
                                                {m.status}
                                            </span>
                                            <span className="text-sm font-bold text-gray-800 min-w-[60px] text-right">{m.value}</span>
                                        </div>
                                    </div>
                                 ))}
                            </div>
                        </div>
                    </div>

                </div>
            </CollapsibleSection>

        </div>
    );
};

export default QuickStats;
