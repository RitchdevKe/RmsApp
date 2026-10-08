
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from './Icon';
import { QuickStat, RecentActivity, UpcomingPayment, TaskStatus, TaskPriority } from '../types';
import { QUICK_STATS_DATA } from '../constants';
import { useData } from '../context/DataContext';
import { useProfileFirstName } from '../hooks/useProfileFirstName';
import { supabase } from '../utils/supabaseClient';
import { computeTenantArrears } from '../utils/tenantArrears';
import { getEffectiveRentForMonth, parsePaymentAmount } from '../utils/paymentReporting';

interface KeyStat {
  title: string;
  totalValue: string;
  todayStat: string;
  weekStat: string;
  monthStat: string;
  icon: string;
  reportUrl: string;
  expected?: number;
  collected?: number;
  percentage?: number;
}

// New Task interface for the "My Tasks" card
interface MyTask {
  id: string;
  title: string;
  priority: TaskPriority;
}

const navigate = (url: string) => {
    window.location.hash = url;
};

// --- Custom Card Styles ---

// Major Cards: Top 8px Primary, Bottom 4px Secondary, Sides 3px Secondary + Vignette Effect
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

// Small Cards: Clean, simple card style for grid items
const SMALL_CARD_CLASSES = "bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 flex flex-col relative overflow-hidden group";

const KeyStatCard: React.FC<{ stat: KeyStat }> = ({ stat }) => {
  const isPerformance = stat.title === 'MTD Collection Performance';

  return (
    <div className={`${MAJOR_CARD_CLASSES} p-5 flex flex-col`}>
      <div className="relative z-10 flex-grow">
        <p className="text-gray-500 font-medium">{stat.title}</p>
        
        {isPerformance ? (
          <div className="my-2">
            <p className="text-4xl font-bold text-gray-850">{stat.totalValue}</p>
            <div className="mt-2 text-xs text-gray-500 font-medium flex justify-between">
              <span>Collected: KES {stat.collected?.toLocaleString()}</span>
              <span>Target: KES {stat.expected?.toLocaleString()}</span>
            </div>
            {/* Elegant Collection Progress Bar */}
            <div className="w-full bg-gray-100 h-2 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-secondary h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, stat.percentage || 0)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-4xl font-bold text-gray-800 my-2">{stat.totalValue}</p>
        )}
        
        <hr className="my-2 border-gray-200/60" />
        <div className="space-y-2 text-sm mt-2">
          <div className="flex justify-between items-center text-gray-600">
            <span>Today</span>
            <span className="font-semibold text-gray-800">{stat.todayStat}{!isPerformance && stat.icon}</span>
          </div>
          <div className="flex justify-between items-center text-gray-600">
            <span>This week</span>
            <span className="font-semibold text-gray-800">{stat.weekStat}{!isPerformance && stat.icon}</span>
          </div>
          <div className="flex justify-between items-center text-gray-600">
            <span>This month</span>
            <span className="font-semibold text-gray-800">{stat.monthStat}{!isPerformance && stat.icon}</span>
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={() => navigate(stat.reportUrl)}
            className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors duration-200 flex items-center group"
          >
            View Report <span className="ml-1 transform group-hover:translate-x-1 transition-transform">→</span>
          </button>
      </div>
    </div>
  );
};


const QuickStatGridCard: React.FC<{ item: QuickStat }> = ({ item }) => {
  const colorClasses = {
    green: { // Positive
      text: 'text-secondary-dark',
      viewButton: 'text-secondary-dark hover:text-secondary'
    },
    red: { // Negative
      text: 'text-primary',
      viewButton: 'text-primary hover:text-primary-dark'
    },
    blue: { // Neutral
      text: 'text-gray-700',
      viewButton: 'text-gray-600 hover:text-gray-800'
    },
  };
  const growthIcon = item.color === 'red' ? '📉' : '📈';
  const currentColors = colorClasses[item.color];
  const reportUrl = item.reportUrl || '#/dashboard/stats';

  return (
    <div className={`${SMALL_CARD_CLASSES}`}>
      <div className="relative z-10 flex-grow">
        <div className="flex items-start justify-between">
          <h3 className="font-medium text-sm text-gray-600 pr-2">{item.title}</h3>
          <span className="text-xl">{item.icon}</span>
        </div>
        
        <p className={`text-2xl font-bold my-1 ${currentColors.text}`}>{item.thisMonth}</p>
        
        <hr className="my-2 border-gray-200/60" />
        
        <div className="space-y-1 text-xs mt-auto pt-1">
          <div className="flex justify-between items-center text-gray-500">
            <span>Today</span>
            <span className="font-semibold text-gray-700 flex items-center">{item.today} <span className="ml-1 text-sm">{growthIcon}</span></span>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <span>This Week</span>
            <span className="font-semibold text-gray-700 flex items-center">{item.thisWeek} <span className="ml-1 text-sm">{growthIcon}</span></span>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <span>This Month</span>
            <span className="font-semibold text-gray-700 flex items-center">{item.thisMonth} <span className="ml-1 text-sm">{growthIcon}</span></span>
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-2 pt-2 border-t border-gray-100">
        <button
            onClick={() => navigate(reportUrl)}
            className={`text-sm font-semibold ${currentColors.viewButton} transition-colors duration-200 flex items-center group`}
        >
          View <span className="ml-1 transform group-hover:translate-x-1 transition-transform">→</span>
        </button>
      </div>
    </div>
  );
};


const RecentActivityItem: React.FC<{ item: RecentActivity }> = ({ item }) => (
    <button 
        onClick={() => item.link ? navigate(item.link) : null}
        className={`w-full text-left flex items-start space-x-4 p-2 border-b border-gray-100 last:border-b-0 hover:bg-white/60 rounded-lg transition-colors duration-200 group ${item.link ? 'cursor-pointer' : 'cursor-default'}`}
    >
        <div className={`w-2.5 h-2.5 mt-1.5 rounded-full flex-shrink-0 ${item.color}`} />
        <div className="flex-1">
            <p className="text-sm text-gray-800 group-hover:text-primary transition-colors">{item.description}</p>
            <p className="text-xs text-gray-400">{item.time}</p>
        </div>
        {item.link && (
            <Icon name="chevron-down" className="w-4 h-4 text-gray-300 -rotate-90 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
    </button>
);

const UpcomingPaymentItem: React.FC<{item: UpcomingPayment}> = ({item}) => {
    const [remindStatus, setRemindStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [notifyStatus, setNotifyStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

    const isOverdue = item.status === 'Overdue';
    const statusClasses = isOverdue 
        ? 'bg-primary/10 text-primary-dark' 
        : 'bg-secondary/20 text-secondary-dark';
    
    const handleAction = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (isOverdue) {
            if (remindStatus !== 'idle') return;
            setRemindStatus('sending');
            // Simulate API call
            setTimeout(() => {
                setRemindStatus('sent');
                // Reset after 3 seconds
                setTimeout(() => setRemindStatus('idle'), 3000);
            }, 800);
        } else {
            if (notifyStatus !== 'idle') return;
            setNotifyStatus('sending');
            // Simulate API call
            setTimeout(() => {
                setNotifyStatus('sent');
                // Reset after 3 seconds
                setTimeout(() => setNotifyStatus('idle'), 3000);
            }, 800);
        }
    };

    const handleRowClick = () => {
        if (item.id) {
            navigate(`#/tenants/active-tenants?tenantId=${item.id}`);
        }
    };

    const getButtonLabel = () => {
        if (isOverdue) {
            if (remindStatus === 'sending') return 'Sending...';
            if (remindStatus === 'sent') return 'Sent!';
            return 'Remind';
        } else {
            if (notifyStatus === 'sending') return 'Sending...';
            if (notifyStatus === 'sent') return 'Sent!';
            return 'Notify';
        }
    };

    return (
        <div 
            onClick={handleRowClick}
            className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0 hover:bg-white/60 transition-colors px-2 rounded-lg cursor-pointer group"
        >
            <div>
                <p className="font-medium text-gray-800 group-hover:text-primary transition-colors">{item.name} - <span className="text-gray-500 font-normal">{item.unit}</span></p>
                <p className="text-sm text-gray-500">{item.amount} - {item.dueDate}</p>
            </div>
            <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses}`}>{item.status}</span>
                <button 
                    onClick={handleAction}
                    disabled={remindStatus !== 'idle' || notifyStatus !== 'idle'}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 min-w-[70px] ${
                        isOverdue 
                        ? 'bg-primary text-white hover:bg-primary-dark disabled:bg-primary/70' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-100'
                    }`}
                >
                    {getButtonLabel()}
                </button>
            </div>
        </div>
    )
};

const MyTasksCard: React.FC<{ tasks: MyTask[] }> = ({ tasks }) => {
    const priorityColors = {
        'Very High': 'bg-red-600',
        'High': 'bg-red-500',
        'Medium': 'bg-yellow-500',
        'Low': 'bg-blue-500',
    };
    return (
        <div className={`${MAJOR_CARD_CLASSES} p-6 flex flex-col h-full`}>
            <div className="relative z-10 flex flex-col h-full">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">My Tasks</h2>
                <div className="space-y-3 flex-grow overflow-y-auto max-h-96 pr-2">
                    {tasks.length > 0 ? tasks.map(task => (
                        <div key={task.id} className="flex items-start space-x-3 p-2 bg-gray-50/80 rounded-md hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => navigate('#/general-operations/task-management')}>
                            <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${priorityColors[task.priority] || 'bg-gray-400'}`}></div>
                            <p className="text-sm text-gray-700">{task.title}</p>
                        </div>
                    )) : (
                        <p className="text-sm text-gray-500 text-center py-4">No pending tasks assigned to you.</p>
                    )}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                    <button onClick={() => navigate('#/general-operations/task-management')} className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors duration-200 flex items-center group">
                        View All Tasks <span className="ml-1 transform group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

const Chart: React.FC<{ type: 'line' | 'bar' | 'pie'; data: any; options?: any; }> = ({ type, data, options }) => {
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
                    plugins: { legend: { position: 'bottom' } },
                    ...options
                },
            });
        }
        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [type, data, options]);

    return <div className="relative h-72"><canvas ref={canvasRef}></canvas></div>;
};


const Dashboard: React.FC = () => {
    const data = useData() as any;
    const tenants = Array.isArray(data?.tenants) ? data.tenants : [];
    const properties = Array.isArray(data?.properties) ? data.properties : [];
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const externalTransactions = Array.isArray(data?.externalTransactions) ? data.externalTransactions : [];
    const roles = Array.isArray(data?.roles) ? data.roles : [];
    const currentUser = data?.currentUser ?? null;
    const isDataLoading = !!data?.isDataLoading;
    const getTotalRevenue = typeof data?.getTotalRevenue === 'function' ? data.getTotalRevenue : () => 0;
    const getOccupancyRate = typeof data?.getOccupancyRate === 'function' ? data.getOccupancyRate : () => 0;
    const { firstName, loading: profileLoading } = useProfileFirstName({ nameFallback: currentUser?.name });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilterBtn, setActiveFilterBtn] = useState<string | null>(null);
    const [activeDatePeriod, setActiveDatePeriod] = useState<string | null>(null);
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');
    const [lateFeeStatus, setLateFeeStatus] = useState<'Pending' | 'Paid'>('Pending');
    const [collectionsVsArrears, setCollectionsVsArrears] = useState<{ labels: string[]; collectionsM: number[]; arrearsM: number[] }>({ labels: [], collectionsM: [], arrearsM: [] });

    type RecentDbPayment = {
        id: string; created_at: string; source: 'stk' | 'c2b' | 'manual';
        amount: number; transaction_id: string | null; bill_ref_number: string | null;
        msisdn: string | null; first_name: string | null; last_name: string | null;
        matched_tenant_id: string | null;
    };
    const [recentDbPayments, setRecentDbPayments] = useState<RecentDbPayment[]>([]);
    const [mtdCollectionStats, setMtdCollectionStats] = useState({ today: 0, week: 0, month: 0, loaded: false });

    // Cache-backed fast UI rendering layers
    const [cache, setCache] = useState<any>(null);
    const userCacheSuffix = currentUser?.id || currentUser?.email || 'anonymous';
    const CACHE_KEY = `full_rms_dash_cache_v4_${userCacheSuffix}`;
    const hasCache = !!cache;

    // Load Cache on mounted session / change of user context
    useEffect(() => {
        if (!currentUser) return;
        try {
            const stored = localStorage.getItem(CACHE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed) {
                    setCache(parsed);
                    if (parsed.recentDbPayments) setRecentDbPayments(parsed.recentDbPayments);
                    if (parsed.mtdCollectionStats) setMtdCollectionStats(parsed.mtdCollectionStats);
                    if (parsed.collectionsVsArrears) setCollectionsVsArrears(parsed.collectionsVsArrears);
                }
            }
        } catch (e) {
            console.warn('[Dashboard Cache] Error reading cache:', e);
        }
    }, [currentUser, CACHE_KEY]);
    
    
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const { data } = await supabase
                    .from('payments')
                    .select('id,created_at,source,amount,transaction_id,bill_ref_number,msisdn,first_name,last_name,matched_tenant_id')
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(15);
                if (!cancelled && data) setRecentDbPayments(data as RecentDbPayment[]);
            } catch (e) {
                console.error('[Dashboard] Failed to load recent payments:', e);
            }

            try {
                const now = new Date();
                const startOfMonthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                
                const { data: mtdData, error } = await supabase
                    .from('payments')
                    .select('amount, created_at')
                    .eq('status', 'completed')
                    .gte('created_at', startOfMonthIso);

                if (error) throw error;

                if (!cancelled && mtdData) {
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay());
                    startOfWeek.setHours(0,0,0,0);
                    
                    let today = 0, week = 0, month = 0;
                    mtdData.forEach((p: any) => {
                        const amt = Number(p.amount || 0);
                        const dt = new Date(p.created_at).getTime();
                        month += amt;
                        if (dt >= startOfWeek.getTime()) week += amt;
                        if (dt >= todayStart) today += amt;
                    });
                    setMtdCollectionStats({ today, week, month, loaded: true });
                } else {
                    if (!cancelled) setMtdCollectionStats({ today: 0, week: 0, month: 0, loaded: true });
                }
            } catch (e) {
                console.error('[Dashboard] Failed to load mtd stats:', e);
                if (!cancelled) setMtdCollectionStats({ today: 0, week: 0, month: 0, loaded: true });
            }
        };
        load();
        const ch = supabase
            .channel('dash-recent-payments')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, (payload) => {
                const amt = Number(payload.new?.amount || 0);
                // Optimistic UI update: instantly increment the UI counters without hitting DB
                if (amt > 0 && !cancelled) {
                    setMtdCollectionStats(prev => ({
                        ...prev,
                        today: prev.today + amt,
                        week: prev.week + amt,
                        month: prev.month + amt
                    }));
                }
            })
            .subscribe();
        return () => { cancelled = true; supabase.removeChannel(ch); };
    }, []);

    const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse ${className}`}>
            <div className="h-3 w-28 bg-gray-200 rounded mb-3"></div>
            <div className="h-7 w-36 bg-gray-200 rounded mb-2"></div>
            <div className="h-3 w-20 bg-gray-200 rounded"></div>
        </div>
    );

    // --- Helper: Date Logic for "Today", "Week", "Month" Stats ---
    const getGrowthStats = (data: any[], dateField: string) => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0,0,0,0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        let countToday = 0;
        let countWeek = 0;
        let countMonth = 0;

        if (Array.isArray(data)) {
            data.forEach(item => {
                if (!item || !item[dateField]) return;
                const itemDate = new Date(item[dateField]).getTime();
                if (isNaN(itemDate)) return;
                if (itemDate >= todayStart) countToday++;
                if (itemDate >= startOfWeek.getTime()) countWeek++;
                if (itemDate >= startOfMonth) countMonth++;
            });
        }

        return { today: countToday, week: countWeek, month: countMonth };
    };

    // --- Live Data Generators ---

    // 1. Recent Activities (Payments from paymentHistory + C2B externalTransactions + Tasks)
    const recentActivities = useMemo(() => {
        type TimedActivity = RecentActivity & { _ts: number };
        const all: TimedActivity[] = [];

        // All tenant paymentHistory entries (all methods: Manual, STK, C2B-reconciled)
        tenants.forEach(t => {
            if (!t) return;
            (t.paymentHistory || []).forEach(p => {
                if (!p || !p.date) return;
                const ts = new Date(p.date).getTime();
                all.push({
                    category: 'Payment',
                    description: `${t.name || 'Tenant'} paid ${p.amount || 0} via ${p.method || 'payment'}`,
                    time: p.date,
                    color: 'bg-green-500',
                    link: `#/tenants/active-tenants?tenantId=${t.id}`,
                    _ts: isNaN(ts) ? 0 : ts,
                });
            });
        });

        // STK / C2B / Manual from the payments Supabase table (authoritative source for M-Pesa callbacks)
        // Deduplicate against paymentHistory entries already rendered above.
        const historyRefs = new Set(
            tenants.flatMap(t => (t && t.paymentHistory || []).map(p => p && p.reference).filter(Boolean))
        );
        recentDbPayments.forEach(p => {
            if (!p) return;
            const ref = p.transaction_id ?? p.bill_ref_number ?? p.id;
            if (ref && historyRefs.has(ref)) return;
            const ts = new Date(p.created_at).getTime();
            if (isNaN(ts)) return;
            const matchedTenant = tenants.find(t => t && t.id === p.matched_tenant_id);
            const senderName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.msisdn || 'Unknown';
            const sourceLabel = p.source === 'stk' ? 'STK' : p.source === 'c2b' ? 'C2B' : 'Manual';
            const description = matchedTenant
                ? `${matchedTenant.name || 'Tenant'} paid KES ${Number(p.amount || 0).toLocaleString()} via M-Pesa ${sourceLabel}`
                : `M-Pesa ${sourceLabel} — ${senderName} paid KES ${Number(p.amount || 0).toLocaleString()}`;
            all.push({ category: 'Payment', description, time: p.created_at, color: 'bg-green-500', link: '#/payments/inbound', _ts: ts });
        });

        // Tasks (recent open tasks)
        tasks.slice(0, 5).forEach(t => {
            if (!t) return;
            all.push({
                category: 'Maintenance',
                description: `${t.title || 'Task'} (${t.status || 'Pending'})`,
                time: t.dueDate || 'Scheduled',
                color: 'bg-blue-500',
                link: '#/maintenance/work-orders',
                _ts: t.dueDate ? new Date(t.dueDate).getTime() : 0,
            });
        });

        // Sort by most recent first, return top 5
        all.sort((a, b) => b._ts - a._ts);
        return all.slice(0, 5).map(({ _ts, ...rest }) => rest);
    }, [tenants, tasks, recentDbPayments]);

    // 2. Upcoming Payments (Overdue & Due Soon)
    const upcomingPayments = useMemo(() => {
        const list: UpcomingPayment[] = [];
        const today = new Date().getDate();

        tenants.forEach(t => {
            if (!t) return;
            const rentAmt = Number(t.rentAmount || 0);
            if (t.status === 'Overdue') {
                list.push({
                    id: t.id,
                    name: t.name || 'Tenant',
                    unit: t.unit || '',
                    amount: `KES ${rentAmt.toLocaleString()}`,
                    dueDate: `Overdue`,
                    status: 'Overdue'
                });
            } else {
                 const isDueSoon = t.rentDueDate && (t.rentDueDate <= 5);
                 if(isDueSoon) {
                    list.push({
                        id: t.id,
                        name: t.name || 'Tenant',
                        unit: t.unit || '',
                        amount: `KES ${rentAmt.toLocaleString()}`,
                        dueDate: `Due Day ${t.rentDueDate}`,
                        status: 'Due Soon'
                    });
                 }
            }
        });
        return list.slice(0, 5); // Top 5
    }, [tenants]);

    // 3. My Tasks
    const myTasks: MyTask[] = useMemo(() => {
        return tasks
            .filter(t => t && t.status !== TaskStatus.Completed && t.status !== TaskStatus.Closed)
            .slice(0, 5)
            .map(t => ({
                id: t.id,
                title: t.title || 'Task',
                priority: t.priority || TaskPriority.Medium
            }));
    }, [tasks]);

    // 4. House Status Alerts
    const houseStatusAlerts = useMemo(() => {
        const alerts: { tenantId: string; name: string; unit: string; statuses: string[] }[] = [];
        tenants.forEach(t => {
            if (!t) return;
            if (t.houseStatus && t.houseStatus.length > 0) {
                alerts.push({ tenantId: t.id, name: t.name || 'Tenant', unit: t.unit || '', statuses: t.houseStatus });
            }
            if (t.status === 'PendingApproval') {
                alerts.push({ tenantId: t.id, name: t.name || 'Tenant', unit: t.unit || 'Pending unit', statuses: ['Pending Approval'] });
            }
        });
        return alerts;
    }, [tenants]);

    // Calculated Data for Key Stats
    const tenantGrowth = useMemo(() => getGrowthStats(tenants || [], 'onboardingDate'), [tenants]);
    const revenueGrowth = useMemo(() => {
        const allPayments = (tenants || [])
            .filter(t => t && Array.isArray(t.paymentHistory))
            .flatMap(t => t.paymentHistory || []);
        return getGrowthStats(allPayments, 'date');
    }, [tenants]);

    const currentMonthIso = useMemo(() => getCurrentMonthIso(), []);

    const cachedMtdPerformance = isDataLoading ? cache?.mtdPerformance : null;

    const mtdPerformance = useMemo(() => {
        if (isDataLoading && cachedMtdPerformance) {
            return cachedMtdPerformance;
        }
        let expectedRent = 0;
        let totalArrears = 0;

        tenants.forEach(t => {
            if (!t) return;
            const isOccupied = !['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status || ''));
            if (isOccupied && Number(t.rentAmount ?? 0) > 0) {
                expectedRent += getEffectiveRentForMonth(t, currentMonthIso);
                const accrued = computeTenantArrears(t, currentMonthIso, { allTenants: tenants }).totalArrears || 0;
                const adminArrears = Math.max(0, Number((t as any).arrears ?? 0));
                totalArrears += Math.max(accrued, adminArrears);
            }
        });

        const targetExpected = expectedRent + totalArrears;
        
        let collectedToday = mtdCollectionStats.today;
        let collectedWeek = mtdCollectionStats.week;
        let collectedMonth = mtdCollectionStats.month;

        const percentage = targetExpected > 0 ? (collectedMonth / targetExpected) * 100 : 0;

        return {
            expected: targetExpected,
            collected: collectedMonth,
            percentage,
            today: collectedToday,
            week: collectedWeek,
            month: collectedMonth,
            loaded: mtdCollectionStats.loaded
        };
    }, [tenants, currentMonthIso, mtdCollectionStats, isDataLoading, cachedMtdPerformance]);

    const totalTenants = tenants.length;
    const totalUnits = properties.reduce((acc, p) => acc + (p.units?.length || 0), 0);
    const occupancyRate = getOccupancyRate();
    const revenue = getTotalRevenue();

    // Cache-backed fast getters
    const displayTotalTenants = isDataLoading && cache ? (cache.totalTenants ?? 0) : totalTenants;
    const displayTotalUnits = isDataLoading && cache ? (cache.totalUnits ?? 0) : totalUnits;
    const occupancyReady = !isDataLoading && properties.length > 0;
    const displayOccupancyRate = occupancyReady ? occupancyRate : null;
    const displayRevenue = isDataLoading && cache ? (cache.revenue ?? 0) : revenue;

    const displayTenantGrowth = (isDataLoading && cache) ? (cache.tenantGrowth ?? { today: 0, week: 0, month: 0 }) : tenantGrowth;
    const displayRevenueGrowth = (isDataLoading && cache) ? (cache.revenueGrowth ?? { today: 0, week: 0, month: 0 }) : revenueGrowth;

    const displayRecentActivities = (isDataLoading && cache) ? (cache.recentActivities ?? []) : recentActivities;
    const displayUpcomingPayments = (isDataLoading && cache) ? (cache.upcomingPayments ?? []) : upcomingPayments;
    const displayMyTasks = (isDataLoading && cache) ? (cache.myTasks ?? []) : myTasks;

    const hasTenants = (isDataLoading && cache) ? ((cache.totalTenants ?? 0) > 0) : (!isDataLoading && totalTenants > 0);
    const hasUnits = occupancyReady && totalUnits > 0;
    const hasRevenue = (isDataLoading && cache) ? ((cache.revenue ?? 0) > 0) : (!isDataLoading && revenue > 0);
    
    // Automatic cache persistence effect
    useEffect(() => {
        if (!isDataLoading && tenants.length > 0) {
            const snapshot = {
                totalTenants: tenants.length,
                totalUnits: properties.reduce((acc, p) => acc + (p.units?.length || 0), 0),
                occupancyRate: getOccupancyRate(),
                revenue: getTotalRevenue(),
                tenantGrowth,
                revenueGrowth,
                mtdCollectionStats,
                collectionsVsArrears,
                recentDbPayments,
                recentActivities,
                upcomingPayments,
                myTasks,
                mtdPerformance,
                pendingTasksCount: tasks.filter(t => t.status === TaskStatus.Pending).length
            };
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
                setCache(snapshot);
            } catch (e) {
                console.warn('[Dashboard Cache] Error writing cache:', e);
            }
        }
    }, [
        isDataLoading,
        tenants,
        properties,
        tasks,
        tenantGrowth,
        revenueGrowth,
        mtdCollectionStats,
        collectionsVsArrears,
        recentDbPayments,
        recentActivities,
        upcomingPayments,
        myTasks,
        mtdPerformance,
        CACHE_KEY
    ]);

    const keyStats: KeyStat[] = [
        { 
            title: 'Total Active Tenants', 
            totalValue: hasTenants ? displayTotalTenants.toString() : (isDataLoading && !cache ? 'Loading…' : '0'),
            todayStat: hasTenants ? `+${displayTenantGrowth.today}` : '0',
            weekStat: hasTenants ? `+${displayTenantGrowth.week}` : '0',
            monthStat: hasTenants ? `+${displayTenantGrowth.month}` : '0',
            icon: '📈', 
            reportUrl: '#/reports/tenancy-reports' 
        },
        { 
            title: 'Portfolio Occupancy', 
            totalValue: hasUnits ? `${displayOccupancyRate ?? 0}%` : (isDataLoading && !cache ? 'Loading…' : '0%'),
            todayStat: hasUnits ? 'Stable' : '0',
            weekStat: hasUnits ? 'Stable' : '0',
            monthStat: hasUnits ? 'Stable' : '0',
            icon: '🏠', 
            reportUrl: '#/reports/property-reports?tab=vacancies' 
        },
        { 
            title: 'MTD Collection Performance', 
            totalValue: !mtdPerformance.loaded && (!cache || !cache.mtdPerformance) ? 'Loading…' : `${mtdPerformance.percentage.toFixed(1)}%`,
            todayStat: !mtdPerformance.loaded && (!cache || !cache.mtdPerformance) ? '—' : `KES ${mtdPerformance.today.toLocaleString()}`,
            weekStat: !mtdPerformance.loaded && (!cache || !cache.mtdPerformance) ? '—' : `KES ${mtdPerformance.week.toLocaleString()}`,
            monthStat: !mtdPerformance.loaded && (!cache || !cache.mtdPerformance) ? '—' : `KES ${mtdPerformance.month.toLocaleString()}`,
            icon: '💰', 
            reportUrl: '#/reports/financial-reports?view=revenue',
            expected: mtdPerformance.expected,
            collected: mtdPerformance.collected,
            percentage: mtdPerformance.percentage,
        },
    ];

    // Update Quick Stats Data dynamically
    const dynamicQuickStats = QUICK_STATS_DATA.map(stat => {
        if (stat.title === "Total Tenants") return { 
            ...stat, 
            thisMonth: hasTenants ? displayTotalTenants.toString() : (isDataLoading && !cache ? 'Loading…' : '0'),
            today: hasTenants ? `+${displayTenantGrowth.today}` : '0',
            thisWeek: hasTenants ? `+${displayTenantGrowth.week}` : '0',
            reportUrl: '#/reports/tenancy-reports' 
        };
        if (stat.title === "Occupancy Rate") return { ...stat, thisMonth: hasUnits ? `${displayOccupancyRate ?? 0}%` : (isDataLoading && !cache ? 'Loading…' : '0%'), reportUrl: '#/reports/property-reports?tab=vacancies' };
        if (stat.title === "Revenue (MTD)") return { 
            ...stat, 
            thisMonth: hasRevenue ? `KES ${(displayRevenue/1000000).toFixed(1)}M` : (isDataLoading && !cache ? 'Loading…' : '0'),
            today: hasRevenue ? `+${displayRevenueGrowth.today}` : '0',
            thisWeek: hasRevenue ? `+${displayRevenueGrowth.week}` : '0',
            reportUrl: '#/reports/financial-reports?view=revenue' 
        };
        if (stat.title === "Pending Tasks") return { 
            ...stat, 
            thisMonth: isDataLoading && cache ? (cache.pendingTasksCount ?? '0') : tasks.filter(t => t.status === TaskStatus.Pending).length.toString(), 
            reportUrl: '#/reports/task-operations-reports' 
        };
        return stat;
    });

    useEffect(() => {
        let cancelled = false;

        const loadCollections = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser();
                const userId = authData?.user?.id;
                if (!userId) {
                    if (!cancelled) setCollectionsVsArrears({ labels: [], collectionsM: [], arrearsM: [] });
                    return;
                }

                const now = new Date();
                const months: Array<{ y: number; m: number; key: string; label: string; start: string; end: string }> = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
                    const y = d.getUTCFullYear();
                    const m = d.getUTCMonth();
                    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
                    const label = d.toLocaleString(undefined, { month: 'short' });
                    const start = new Date(Date.UTC(y, m, 1)).toISOString();
                    const end = new Date(Date.UTC(y, m + 1, 1)).toISOString();
                    months.push({ y, m, key, label, start, end });
                }

                const startAll = months[0]?.start;
                const endAll = months[months.length - 1]?.end;
                if (!startAll || !endAll) {
                    if (!cancelled) setCollectionsVsArrears({ labels: [], collectionsM: [], arrearsM: [] });
                    return;
                }

                const { data, error } = await supabase
                    .from('payments')
                    .select('amount, created_at')
                    .eq('status', 'completed')
                    .gte('created_at', startAll)
                    .lt('created_at', endAll);

                if (error) throw error;

                const sums: Record<string, number> = {};
                (data || []).forEach((p: any) => {
                    const iso = String(p.created_at || '');
                    const ym = iso.slice(0, 7);
                    sums[ym] = (sums[ym] || 0) + Number(p.amount ?? 0);
                });

                const labels = months.map(x => x.label);
                const collectionsM = months.map(x => Number(((sums[x.key] || 0) / 1_000_000).toFixed(2)));

                const arrearsM = months.map(x => {
                    const total = tenants.reduce((acc, t) => {
                        if (!t || ['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status || ''))) return acc;
                        return acc + computeTenantArrears(t, x.key).totalArrears;
                    }, 0);
                    return Number((total / 1_000_000).toFixed(2));
                });

                if (!cancelled) setCollectionsVsArrears({ labels, collectionsM, arrearsM });
            } catch (e) {
                console.warn('[Dashboard] Failed to load collections', e);
                if (!cancelled) setCollectionsVsArrears({ labels: [], collectionsM: [], arrearsM: [] });
            }
        };

        loadCollections();
        const onFocus = () => { if (!cancelled) loadCollections(); };
        window.addEventListener('focus', onFocus);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', onFocus);
        };
    }, [tenants]);

    const COLLECTIONS_VS_ARREARS_CHART_DATA = useMemo(() => {
        const labels = collectionsVsArrears.labels.length > 0 ? collectionsVsArrears.labels : ['June', 'July', 'Aug', 'Sep', 'Oct', 'Nov'];
        const collections = collectionsVsArrears.collectionsM.length > 0 ? collectionsVsArrears.collectionsM : [0, 0, 0, 0, 0, 0];
        const arrears = collectionsVsArrears.arrearsM.length > 0 ? collectionsVsArrears.arrearsM : [0, 0, 0, 0, 0, 0];
        return {
            labels,
            datasets: [{
                label: 'Collections (KES M)',
                data: collections,
                borderColor: '#9D1F15', // primary
                backgroundColor: 'rgba(157, 31, 21, 0.1)',
                fill: true,
                tension: 0.4
            }, {
                label: 'Arrears (KES M)',
                data: arrears,
                borderColor: '#F39C2A', // secondary
                backgroundColor: 'rgba(243, 156, 42, 0.1)',
                fill: true,
                tension: 0.4
            }]
        };
    }, [collectionsVsArrears]);

    const handleSearch = () => {
        if (searchQuery.trim()) {
            window.location.hash = `#/dashboard/search?q=${encodeURIComponent(searchQuery.trim())}`;
        }
    };

    const handleQuickFilterClick = (filter: string) => {
        if (filter === 'Vacant Units') {
            window.location.hash = '#/reports-analytics/reports/vacancy-reports';
            return;
        }
        setActiveFilterBtn(prev => prev === filter ? null : filter);
        setActiveDatePeriod(null);
        setCustomDateFrom('');
        setCustomDateTo('');
        if (filter !== 'Late Fee') setLateFeeStatus('Pending');

        // Late Fee and Arrears intentionally ignore the date-range chip
        // (they always sweep all relevant periods). Navigate immediately
        // so the user doesn't have to pick a time period to see results.
        if (filter === 'Arrears' || filter === 'Late Fee') {
            const params = new URLSearchParams();
            params.set('filters', filter);
            if (filter === 'Late Fee') params.set('late_fee_status', lateFeeStatus);
            window.location.hash = `#/dashboard/search?${params.toString()}`;
        }
    };

    const handleTimePeriodSelect = (period: string) => {
        if (!activeFilterBtn) return;
        if (period === 'Custom') { setActiveDatePeriod('Custom'); return; }
        setActiveDatePeriod(period);
        const params = new URLSearchParams();
        params.set('filters', activeFilterBtn);
        params.set('dr', period);
        if (activeFilterBtn === 'Late Fee') params.set('late_fee_status', lateFeeStatus);
        window.location.hash = `#/dashboard/search?${params.toString()}`;
    };

    const handleCustomDateApply = () => {
        if (!activeFilterBtn || !customDateFrom || !customDateTo) return alert('Select both From and To dates.');
        const params = new URLSearchParams();
        params.set('filters', activeFilterBtn);
        params.set('dr', 'Custom');
        params.set('dr_from', customDateFrom);
        params.set('dr_to', customDateTo);
        if (activeFilterBtn === 'Late Fee') params.set('late_fee_status', lateFeeStatus);
        window.location.hash = `#/dashboard/search?${params.toString()}`;
    };

    const timePeriodButtons = useMemo(() => {
        // Generates: Today, Yesterday, +5 previous days by date (e.g., 10/04/2026)
        const today = new Date();
        const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const iso = (d: Date) => d.toISOString().split('T')[0];
        const days = Array.from({ length: 5 }, (_, i) => {
            const d = new Date(today); d.setDate(today.getDate() - i);
            return { label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fmt(d), value: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `Day:${iso(d)}` };
        });
        return [...days,
            { label: 'This Week', value: 'This Week' },
            { label: 'Last Week', value: 'Last Week' },
            { label: 'This Month', value: 'This Month' },
            { label: 'This Quarter', value: 'This Quarter' },
            { label: 'This Year', value: 'This Year' },
            { label: 'Custom Range', value: 'Custom' },
        ];
    }, []);

    const FILTER_BUTTONS = [
        { label: 'Paid', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
        { label: 'Unpaid', color: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
        { label: 'Arrears', color: 'bg-red-100 text-red-800 hover:bg-red-200' },
        { label: 'Late Fee', color: 'bg-rose-100 text-rose-800 hover:bg-rose-200' },
        { label: 'Unpaid Fines', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200' },
        { label: 'Paid Fines', color: 'bg-teal-100 text-teal-800 hover:bg-teal-200' },
        { label: 'Deposits Paid', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
        { label: 'Deposit Refunds', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' },
        { label: 'Unpaid Deposit', color: 'bg-pink-100 text-pink-800 hover:bg-pink-200' },
        { label: 'Partial Payments', color: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200' },
        { label: 'Vacant Units', color: 'bg-purple-100 text-purple-800 hover:bg-purple-200' },
    ];

    // Helper for widget permission check
    const canView = (widgetId: string) => {
        // If current user is undefined (shouldn't happen here), return false
        if (!currentUser) return false;
        
        // Super Admin always has full access
        if (currentUser.role === 'Super Admin') return true;
        
        const roleDef = roles.find(r => r.name === currentUser.role);
        
        // If role definition not found or widgetAccess is entirely empty/missing, 
        // fallback to true for backward compatibility so we don't show a blank page.
        if (!roleDef || !roleDef.widgetAccess || roleDef.widgetAccess.length === 0) {
            return true;
        }
        
        return roleDef.widgetAccess.includes(widgetId);
    };

  return (
    <div className="space-y-8 pb-8">
      {/* Welcome Message */}
      {canView('dash_welcome') && (
        <div>
            <h1 className="text-3xl font-bold text-gray-800">
            Welcome back <span className="text-primary">{profileLoading ? 'Loading...' : ((firstName ?? '').trim() ? (firstName as string).trim() : 'User')},</span>
            </h1>
            <p className="text-lg text-gray-500 mt-1">
            Here is your portfolio performance overview.
            </p>
        </div>
      )}

      {/* Search & Filter Bar */}
      {canView('dash_search') && (
        <div className={`${MAJOR_CARD_CLASSES} p-4`}>
            <div className="relative z-10">
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="relative flex-grow">
                        <input
                        type="text"
                        placeholder="Search by Tenant ID, Name..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary-light focus:border-primary-light"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Icon name="search" className="w-5 h-5 text-gray-400" />
                        </div>
                    </div>
                    <button onClick={handleSearch} className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors duration-300 shadow-sm flex items-center justify-center">
                        Search
                    </button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    {FILTER_BUTTONS.map(btn => (
                        <button 
                            key={btn.label} 
                            onClick={() => handleQuickFilterClick(btn.label)}
                            className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 shadow-sm ${
                                activeFilterBtn === btn.label
                                    ? 'bg-gray-800 text-white ring-2 ring-offset-1 ring-gray-700'
                                    : btn.color
                            }`}
                        >
                            {btn.label}{activeFilterBtn === btn.label ? ' ▾' : ''}
                        </button>
                    ))}
                </div>

                {activeFilterBtn && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Filter <span className="text-primary">{activeFilterBtn}</span> by period:</span>
                            <button onClick={() => { setActiveFilterBtn(null); setActiveDatePeriod(null); setLateFeeStatus('Pending'); }} className="ml-auto text-xs text-gray-400 hover:text-red-500 font-bold">✕ Close</button>
                        </div>
                        {activeFilterBtn === 'Late Fee' && (
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Late fee status:</span>
                                {([
                                    { value: 'Pending' as const, label: 'Unpaid Late Fee' },
                                    { value: 'Paid' as const, label: 'Paid Late Fee' },
                                ]).map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => setLateFeeStatus(option.value)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                                            lateFeeStatus === option.value
                                                ? 'bg-rose-600 text-white border-rose-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {timePeriodButtons.map(btn => (
                                <button
                                    key={btn.value}
                                    onClick={() => handleTimePeriodSelect(btn.value)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                                        activeDatePeriod === btn.value
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                                    }`}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                        {activeDatePeriod === 'Custom' && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <label className="text-xs font-medium text-gray-600">From:</label>
                                <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} className="p-1.5 border rounded text-sm" />
                                <label className="text-xs font-medium text-gray-600">To:</label>
                                <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} className="p-1.5 border rounded text-sm" />
                                <button onClick={handleCustomDateApply} className="px-4 py-1.5 bg-primary text-white text-sm font-bold rounded hover:bg-primary-dark">Apply</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* House Status Alerts (New Widget) */}
      {canView('dash_house_alerts') && houseStatusAlerts.length > 0 && (
          <div className="bg-red-50 border-l-8 border-red-500 p-4 rounded-xl shadow-sm animate-fade-in border-t border-b border-r border-gray-200">
              <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-red-800 flex items-center">
                      <Icon name="bell" className="w-5 h-5 mr-2" />
                      House Status Alerts ({houseStatusAlerts.length})
                  </h3>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                  {houseStatusAlerts.map(alert => {
                      const isPending = alert.statuses.includes('Pending Approval');
                      const link = isPending 
                          ? `#/tenants/applications?tenantId=${alert.tenantId}`
                          : `#/tenants/active-tenants?tenantId=${alert.tenantId}`;
                      return (
                          <div key={alert.tenantId} onClick={() => navigate(link)} className="bg-white p-3 rounded shadow-sm border border-red-100 min-w-[200px] cursor-pointer hover:border-red-300">
                              <p className="font-bold text-gray-800 text-sm">{alert.unit}</p>
                              <p className="text-xs text-gray-500">{alert.name}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                  {alert.statuses.map(s => <span key={s} className="text-[10px] bg-red-100 text-red-800 px-1 rounded">{s}</span>)}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* Key Stats Cards */}
      {canView('dash_key_stats') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isDataLoading && !hasCache
                ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                )
                : keyStats.map(stat => <KeyStatCard key={stat.title} stat={stat} />)}
        </div>
      )}

      {/* Quick Stats Grid */}
      {canView('dash_quick_stats') && (
        <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Stats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isDataLoading && !hasCache
                    ? (
                        <>
                            <SkeletonCard className="p-4" />
                            <SkeletonCard className="p-4" />
                            <SkeletonCard className="p-4" />
                            <SkeletonCard className="p-4" />
                        </>
                    )
                    : dynamicQuickStats.map(item => <QuickStatGridCard key={item.title} item={item} />)}
            </div>
        </div>
      )}

      {/* Financial Health Chart */}
      {canView('dash_financial_chart') && (
        <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Financial Health</h2>
            <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                <div className="relative z-10">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2 text-center">Monthly Collections vs. Arrears</h3>
                    <Chart type="line" data={COLLECTIONS_VS_ARREARS_CHART_DATA} />
                </div>
            </div>
        </div>
      )}
      
      {/* Recent Activities, Upcoming Payments & My Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activities */}
        {canView('dash_recent_activity') && (
            <div className={`${MAJOR_CARD_CLASSES} p-6 flex flex-col h-full`}>
            <div className="relative z-10 flex flex-col h-full">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Activities</h2>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2 flex-grow">
                    {displayRecentActivities.length > 0 ? (
                    displayRecentActivities.map((item, index) => <RecentActivityItem key={index} item={item} />)
                    ) : (
                    <p className="text-gray-500 text-sm py-4 text-center">No recent activities.</p>
                    )}
                </div>
            </div>
            </div>
        )}

        {/* Upcoming Payments */}
        {canView('dash_upcoming_payments') && (
            <div className={`${MAJOR_CARD_CLASSES} p-6 flex flex-col h-full`}>
            <div className="relative z-10 flex flex-col h-full">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Upcoming Payments</h2>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2 flex-grow">
                    {displayUpcomingPayments.length > 0 ? (
                        displayUpcomingPayments.map((item, index) => <UpcomingPaymentItem key={index} item={item} />)
                    ) : (
                        <p className="text-gray-500 text-sm py-4 text-center">No upcoming payments due soon.</p>
                    )}
                </div>
            </div>
            </div>
        )}

        {/* My Tasks */}
        {canView('dash_my_tasks') && (
            <MyTasksCard tasks={displayMyTasks} />
        )}
      </div>

    </div>
  );
};

import { RouteErrorBoundary } from './common/RouteErrorBoundary';
import { getCurrentMonthIso } from '../utils/timezone';
const DashboardWithBoundary: React.FC = () => (
  <RouteErrorBoundary routeName="Dashboard / Overview">
    <Dashboard />
  </RouteErrorBoundary>
);

export default DashboardWithBoundary;
