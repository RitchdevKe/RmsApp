import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { getRentDueDay, getRentGraceDays } from '../../utils/rentSchedule';
import { isRepurposedUnit } from '../../utils/repurposedUnits';
import { computeTenantArrears } from '../../utils/tenantArrears';
import { getCurrentMonthIso } from '../../utils/timezone';

const Chart: React.FC<{ type: 'bar' | 'doughnut' | 'line'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
                    },
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const InsightMetricCard: React.FC<{ title: string; value: string; subLabel: string; icon: string; color: string }> = ({ title, value, subLabel, icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm text-gray-400 font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-black text-gray-800 mt-1">{value}</h3>
            </div>
            <div className="p-2 rounded-full bg-opacity-10" style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color }} />
            </div>
        </div>
        <div className="mt-3 text-xs font-semibold text-gray-500">{subLabel}</div>
    </div>
);

const TenantInsights: React.FC = () => {
    const { tenants, properties, tasks, landlords } = useData();
    const [selectedLandlordId, setSelectedLandlordId] = useState<string>('All');
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('All');

    // Reset property filter when landlord changes
    useEffect(() => { setSelectedPropertyId('All'); }, [selectedLandlordId]);

    const landlordProperties = useMemo(() => {
        return selectedLandlordId === 'All'
            ? properties
            : properties.filter(p => p.landlordId === selectedLandlordId);
    }, [properties, selectedLandlordId]);

    const scopedProperties = useMemo(() => {
        return selectedPropertyId === 'All'
            ? landlordProperties
            : landlordProperties.filter(p => p.id === selectedPropertyId);
    }, [landlordProperties, selectedPropertyId]);

    const filteredTenants = useMemo(() => {
        return tenants.filter(t => scopedProperties.some(p => p.id === t.propertyId));
    }, [tenants, scopedProperties]);

    // 1. Unit Type Demand
    const unitTypeData = useMemo(() => {
        const typeCounts: Record<string, number> = {};
        filteredTenants.forEach(t => {
            const unitProp = scopedProperties.find(p => p.id === t.propertyId)?.units.find(u => u.id === t.unitId);
            const type = unitProp ? (unitProp.unitType || (unitProp.bedrooms > 0 ? `${unitProp.bedrooms} Bedroom` : 'Studio')) : 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        return typeCounts;
    }, [filteredTenants, scopedProperties]);

    // 2. Lease Expiry Forecast (Next 6 Months)
    const expiryForecast = useMemo(() => {
        const counts = new Array(6).fill(0);
        const now = new Date();
        filteredTenants.forEach(t => {
            if (t.leaseEnd) {
                const date = new Date(t.leaseEnd);
                const diffMonth = (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
                if (diffMonth >= 0 && diffMonth < 6) counts[diffMonth]++;
            }
        });
        const labels = counts.map((_, i) => {
            const d = new Date();
            d.setMonth(now.getMonth() + i);
            return d.toLocaleString('default', { month: 'short' });
        });
        return { labels, counts };
    }, [filteredTenants]);

    // 3. At-Risk
    const atRiskTenants = useMemo(() => {
        return filteredTenants.filter(t =>
            t.status === 'Overdue' ||
            t.status === 'Notice' ||
            (t.leaseEnd && new Date(t.leaseEnd) < new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000))
        ).map(t => ({
            id: t.id,
            name: t.name,
            unit: t.unit,
            riskFactor: t.status === 'Overdue' ? 'Arrears' : t.status === 'Notice' ? 'Moving Out' : 'Expiring Lease',
            amount: t.status === 'Overdue' ? t.rentAmount : 0
        }));
    }, [filteredTenants]);

    const currentMonthPrefix = getCurrentMonthIso();

    const paymentCompliance = useMemo(() => {
        const pool = filteredTenants.filter(t => ['Active', 'Notice', 'Overdue'].includes(t.status));
        if (pool.length === 0) return 0;
        const compliant = pool.filter(t => {
            const dueDay = getRentDueDay(t);
            const graceDays = getRentGraceDays(t);
            const lateStartDay = dueDay + graceDays;
            const paidThisMonth = (t.paymentHistory || [])
                .filter(p => p.date.startsWith(currentMonthPrefix) && p.status === 'Paid')
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            if (!paidThisMonth.length) return false;
            const payDom = new Date(paidThisMonth[0].date).getDate();
            return payDom <= lateStartDay;
        }).length;
        return Math.round((compliant / pool.length) * 100);
    }, [filteredTenants, currentMonthPrefix]);

    const retentionRate = useMemo(() => {
        const longTenants = filteredTenants.filter(t => {
            if (!t.onboardingDate) return false;
            const ageDays = (Date.now() - new Date(t.onboardingDate).getTime()) / 86400000;
            return ageDays >= 365;
        });
        if (longTenants.length === 0) return 100;
        const stillThere = longTenants.filter(t => ['Active', 'Notice', 'Overdue'].includes(t.status)).length;
        return Math.round((stillThere / longTenants.length) * 100);
    }, [filteredTenants]);

    const avgTenancy = useMemo(() => {
        const active = filteredTenants.filter(t => t.onboardingDate && ['Active', 'Notice', 'Overdue'].includes(t.status));
        if (active.length === 0) return '—';
        let totalYears = 0;
        for (const t of active) {
            const start = new Date(t.onboardingDate!).getTime();
            totalYears += (Date.now() - start) / (365.25 * 86400000);
        }
        return `${(totalYears / active.length).toFixed(1)} Yrs`;
    }, [filteredTenants]);

    const maintSatisfaction = useMemo(() => {
        let resolved = 0;
        let total = 0;
        for (const t of filteredTenants) {
            for (const r of t.requests || []) {
                total++;
                if (r.status === 'Converted to Task' || r.status === 'Approved') resolved++;
            }
        }
        if (total === 0) return { scoreLabel: '—', subLabel: 'No request data' };
        const ratio = resolved / total;
        const outOf5 = Math.min(5, Math.max(0, ratio * 5));
        return { scoreLabel: `${outOf5.toFixed(1)}/5.0`, subLabel: `${Math.round(ratio * 100)}% closed` };
    }, [filteredTenants]);

    const expiryChartData = {
        labels: expiryForecast.labels,
        datasets: [{ label: 'Leases Expiring', data: expiryForecast.counts, backgroundColor: '#F39C2A', borderRadius: 4, barThickness: 20 }]
    };

    const unitPreferenceChartData = {
        labels: Object.keys(unitTypeData),
        datasets: [{
            data: Object.values(unitTypeData),
            backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'],
            borderWidth: 0
        }]
    };

    const paymentBehaviorChartData = useMemo(() => {
        const labels = ['On-Time', 'Late (<7 Days)', 'Late (>7 Days)', 'Default'];
        let onTime = 0, lateShort = 0, lateLong = 0, def = 0;
        const billable = filteredTenants.filter(t => ['Active', 'Notice', 'Overdue'].includes(t.status));
        for (const t of billable) {
            const dueDay = getRentDueDay(t);
            const graceDays = getRentGraceDays(t);
            const lateStartDay = dueDay + graceDays;
            const paidThisMonth = (t.paymentHistory || [])
                .filter(p => p.date.startsWith(currentMonthPrefix) && p.status === 'Paid')
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const todayDom = new Date().getDate();
            if (!paidThisMonth.length) {
                if (t.status === 'Overdue' && todayDom > lateStartDay) { def++; continue; }
                const daysLatePotential = todayDom - lateStartDay;
                if (daysLatePotential <= 0) onTime++;
                else if (daysLatePotential <= 7) lateShort++;
                else lateLong++;
                continue;
            }
            const payDom = new Date(paidThisMonth[0].date).getDate();
            const daysLateActual = payDom - lateStartDay;
            if (daysLateActual <= 0) onTime++;
            else if (daysLateActual <= 7) lateShort++;
            else lateLong++;
        }
        const sum = onTime + lateShort + lateLong + def || 1;
        const pct = (n: number) => Math.round((n / sum) * 100);
        return {
            labels,
            datasets: [{
                data: [pct(onTime), pct(lateShort), pct(lateLong), pct(def)],
                backgroundColor: ['#10b981', '#facc15', '#f97316', '#ef4444'],
                borderWidth: 0,
            }],
        };
    }, [filteredTenants, currentMonthPrefix]);

    // Per-property real data breakdown
    const propertyRows = useMemo(() => {
        const safeNum = (v: any): number => {
            if (v == null) return 0;
            const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
            return Number.isFinite(n) ? n : 0;
        };
        return scopedProperties.map(p => {
            const propTenants = tenants.filter(t => t.propertyId === p.id);
            const activeInProp = propTenants.filter(t => ['Active', 'Notice', 'Overdue'].includes(t.status));
            const unitsTotal = (p.units || []).length;
            const unitsOccupied = (p.units || []).filter(u => u.status === 'Occupied').length;
            const unitsRepurposed = (p.units || []).filter(u => isRepurposedUnit(u)).length;
            const unitsVacant = Math.max(0, unitsTotal - unitsOccupied - unitsRepurposed);
            const occupancyPct = unitsTotal ? Math.round((unitsOccupied / unitsTotal) * 100) : 0;
            const expectedRent = activeInProp.reduce((s, t) => s + safeNum(t.rentAmount), 0);
            const collectedMTD = activeInProp.reduce((s, t) => {
                const paidThisMonth = (t.paymentHistory || [])
                    .filter((pay: any) => typeof pay?.date === 'string' && pay.date.startsWith(currentMonthPrefix) && pay.status === 'Paid')
                    .reduce((sum: number, pay: any) => sum + safeNum(pay.amount), 0);
                return s + paidThisMonth;
            }, 0);
            const arrears = activeInProp.reduce((s, t) => {
                try {
                    const b = computeTenantArrears(t as any, currentMonthPrefix);
                    return s + (b?.totalArrears || 0);
                } catch { return s; }
            }, 0);
            const leaseMonthsRemaining = activeInProp
                .filter(t => t.leaseEnd)
                .map(t => Math.max(0, (new Date(t.leaseEnd as string).getTime() - Date.now()) / (30 * 86400000)));
            const avgLeaseMonths = leaseMonthsRemaining.length
                ? Math.round(leaseMonthsRemaining.reduce((s, v) => s + v, 0) / leaseMonthsRemaining.length)
                : 0;
            return {
                id: p.id,
                name: p.name,
                unitsTotal,
                unitsOccupied,
                unitsVacant,
                unitsRepurposed,
                occupancyPct,
                activeTenants: activeInProp.length,
                expectedRent,
                collectedMTD,
                arrears,
                avgLeaseMonths,
            };
        }).sort((a, b) => b.expectedRent - a.expectedRent);
    }, [scopedProperties, tenants, currentMonthPrefix]);

    return (
        <div className="space-y-8 animate-fade-in p-2 md:p-4">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                <div>
                    <button onClick={() => window.location.hash = '#/tenants/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                        <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
                    </button>
                    <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Tenant Insights</h1>
                    <p className="text-lg text-gray-500 mt-1">Deep analytics on tenant behavior, lease health, and retention.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border shadow-sm">
                        <Icon name="user" className="w-5 h-5 text-gray-400 ml-1" />
                        <span className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Landlord:</span>
                        <select
                            value={selectedLandlordId}
                            onChange={(e) => setSelectedLandlordId(e.target.value)}
                            className="outline-none text-sm bg-transparent border-none text-gray-700 pr-5 font-bold cursor-pointer min-w-[140px]"
                        >
                            <option value="All">All Landlords</option>
                            {landlords.map(ll => (<option key={ll.id} value={ll.id}>{ll.name}</option>))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border shadow-sm">
                        <Icon name="properties" className="w-5 h-5 text-gray-400 ml-1" />
                        <span className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Property:</span>
                        <select
                            value={selectedPropertyId}
                            onChange={(e) => setSelectedPropertyId(e.target.value)}
                            className="outline-none text-sm bg-transparent border-none text-gray-700 pr-5 font-bold cursor-pointer min-w-[160px]"
                        >
                            <option value="All">All Properties</option>
                            {landlordProperties.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <InsightMetricCard title="Retention Rate" value={`${retentionRate}%`} subLabel={`${filteredTenants.filter(t => ['Active','Notice','Overdue'].includes(t.status)).length} active tenants`} icon="check" color="#10b981" />
                <InsightMetricCard title="Avg. Tenancy" value={avgTenancy} subLabel="Across active tenants" icon="leases" color="#3b82f6" />
                <InsightMetricCard title="Payment Compliance" value={`${paymentCompliance}%`} subLabel="This month, paid on time" icon="payments" color="#f59e0b" />
                <InsightMetricCard title="Maint. Satisfaction" value={maintSatisfaction.scoreLabel} subLabel={maintSatisfaction.subLabel} icon="maintenance" color="#8b5cf6" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Lease Expiry Forecast</h3>
                        <button className="text-sm text-primary hover:underline font-bold" onClick={() => window.location.hash = '#/leases/renewals'}>View Renewals</button>
                    </div>
                    <Chart type="bar" data={expiryChartData} height="h-72" />
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Unit Type Demand</h3>
                    <div className="flex items-center justify-center h-64">
                        <Chart type="doughnut" data={unitPreferenceChartData} options={{ cutout: '70%' }} height="h-56" />
                    </div>
                    <p className="text-center text-xs text-gray-500 mt-4">Distribution of occupied units by type.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Habits</h3>
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="w-full md:w-1/2">
                            <Chart type="doughnut" data={paymentBehaviorChartData} options={{ cutout: '60%', plugins: { legend: { display: false } } }} height="h-48" />
                        </div>
                        <div className="w-full md:w-1/2 space-y-3">
                            {paymentBehaviorChartData.labels.map((label, i) => (
                                <div key={label} className="flex justify-between items-center">
                                    <div className="flex items-center">
                                        <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: paymentBehaviorChartData.datasets[0].backgroundColor[i] }}></span>
                                        <span className="text-sm text-gray-600 font-semibold">{label}</span>
                                    </div>
                                    <span className="font-extrabold text-gray-800">{paymentBehaviorChartData.datasets[0].data[i]}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">At-Risk Tenants</h3>
                        <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">{atRiskTenants.length} Flagged</span>
                    </div>
                    <div className="overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                        {atRiskTenants.length > 0 ? (
                            <ul className="space-y-2">
                                {atRiskTenants.map(t => (
                                    <li key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => window.location.hash = `#/tenants/active-tenants?tenantId=${t.id}`}>
                                        <div>
                                            <p className="font-bold text-sm text-gray-800">{t.name}</p>
                                            <p className="text-xs text-gray-500">{t.unit}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded border ${
                                                t.riskFactor === 'Arrears' ? 'bg-red-50 text-red-700 border-red-200' :
                                                t.riskFactor === 'Moving Out' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                'bg-yellow-50 text-yellow-700 border-yellow-200'
                                            }`}>
                                                {t.riskFactor}
                                            </span>
                                            {t.amount > 0 && <p className="text-xs text-red-600 font-bold mt-1">KES {t.amount.toLocaleString()}</p>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 text-sm text-center py-8">No tenants currently flagged as high risk.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Real per-property data */}
            <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Property Data</h3>
                        <p className="text-xs text-gray-500">Live figures per property — occupancy, rent, collections and arrears.</p>
                    </div>
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">{propertyRows.length} properties</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase font-bold text-gray-500 border-b">
                                <th className="py-2 pr-4">Property</th>
                                <th className="py-2 px-2 text-center">Units</th>
                                <th className="py-2 px-2 text-center">Occupied</th>
                                <th className="py-2 px-2 text-center">Vacant</th>
                                <th className="py-2 px-2 text-center">Repurposed</th>
                                <th className="py-2 px-2 text-center">Occupancy</th>
                                <th className="py-2 px-2 text-center">Tenants</th>
                                <th className="py-2 px-2 text-right">Expected (KES)</th>
                                <th className="py-2 px-2 text-right">Collected MTD (KES)</th>
                                <th className="py-2 px-2 text-right">Arrears (KES)</th>
                                <th className="py-2 pl-2 text-center">Avg Lease (mo)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {propertyRows.length === 0 ? (
                                <tr><td colSpan={11} className="py-8 text-center text-gray-400">No properties in current filter.</td></tr>
                            ) : propertyRows.map(r => (
                                <tr key={r.id} className="hover:bg-gray-50">
                                    <td className="py-2 pr-4 font-semibold text-gray-800">{r.name}</td>
                                    <td className="py-2 px-2 text-center text-gray-700">{r.unitsTotal}</td>
                                    <td className="py-2 px-2 text-center text-emerald-700 font-semibold">{r.unitsOccupied}</td>
                                    <td className="py-2 px-2 text-center text-amber-700 font-semibold">{r.unitsVacant}</td>
                                    <td className="py-2 px-2 text-center text-blue-700 font-semibold">{r.unitsRepurposed}</td>
                                    <td className="py-2 px-2 text-center">
                                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${r.occupancyPct >= 90 ? 'bg-emerald-50 text-emerald-700' : r.occupancyPct >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{r.occupancyPct}%</span>
                                    </td>
                                    <td className="py-2 px-2 text-center text-gray-700">{r.activeTenants}</td>
                                    <td className="py-2 px-2 text-right text-gray-800 font-semibold">{Number(r.expectedRent || 0).toLocaleString()}</td>
                                    <td className="py-2 px-2 text-right text-emerald-700 font-semibold">{Number(r.collectedMTD || 0).toLocaleString()}</td>
                                    <td className="py-2 px-2 text-right text-red-600 font-semibold">{Number(r.arrears || 0).toLocaleString()}</td>
                                    <td className="py-2 pl-2 text-center text-gray-700">{r.avgLeaseMonths}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TenantInsights;
