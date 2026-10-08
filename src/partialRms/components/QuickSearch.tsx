
import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Icon from './Icon';
import { SearchResult } from '@/types';
import { useData } from '../context/DataContext';
import { exportToCSV, printSection } from '@/utils/exportHelper';
import { fmtDate } from '@/utils/date';
import { getMonthlyRentStatus, getRentDueDay } from '@/utils/rentSchedule';
import { isLateFeeType } from '@/utils/lateFees';
import { buildLateFeeInvoices } from '@/utils/lateFeeInvoices';
import { computeTenantArrears } from '@/utils/tenantArrears';

// --- Helper Functions ---

const getDaysOverdue = (rentDueDate: number) => {
    const now = new Date();
    const dueDay = rentDueDate || 5;
    let dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
    
    // If today is before the due day, the arrears are likely from previous month
    if (now.getDate() < dueDay) {
        dueDate = new Date(now.getFullYear(), now.getMonth() - 1, dueDay);
    }
    
    const diffTime = Math.abs(now.getTime() - dueDate.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { days, date: fmtDate(dueDate) };
};

const QuickSearch: React.FC = () => {
    const { tenants, properties, externalTransactions } = useData();
    const queryClient = useQueryClient();

    useEffect(() => {
        queryClient.invalidateQueries({ queryKey: ['partial_app_state', 'tm_tenants_v11'] });
    }, []);

    const [query, setQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string>('All');
    const [activeDateRange, setActiveDateRange] = useState<string>('');
    const [customDrFrom, setCustomDrFrom] = useState('');
    const [customDrTo, setCustomDrTo] = useState('');
    const [activeDatePeriod, setActiveDatePeriod] = useState<string | null>(null);
    const [lateFeeStatus, setLateFeeStatus] = useState<'Pending' | 'Paid'>('Pending');
    const [results, setResults] = useState<SearchResult[]>([]);
    
    // Updated Filters
    const FILTERS = ['Paid', 'Unpaid', 'Arrears', 'Late Fee', 'Unpaid Fines', 'Paid Fines', 'Deposits Paid', 'Deposit Refunds', 'Unpaid Deposit', 'Partial Payments'];

    // Intelligent Keyword Mapping
    const KEYWORD_MAP: Record<string, string> = {
        'paid': 'Paid',
        'payment': 'Paid',
        'payments': 'Paid',
        'unpaid': 'Unpaid',
        'not paid': 'Unpaid',
        'no payment': 'Unpaid',
        'arrears': 'Arrears',
        'debt': 'Arrears',
        'overdue': 'Arrears',
        'late fee': 'Late Fee',
        'late fees': 'Late Fee',
        'late rent': 'Late Fee',
        'late payment fine': 'Late Fee',
        'fine': 'Unpaid Fines',
        'fines': 'Unpaid Fines',
        'unpaid fines': 'Unpaid Fines',
        'paid fines': 'Paid Fines',
        'penalty': 'Unpaid Fines',
        'penalties': 'Unpaid Fines',
        'deposit': 'Deposits Paid',
        'deposits': 'Deposits Paid',
        'deposit paid': 'Deposits Paid',
        'refund': 'Deposit Refunds',
        'refunds': 'Deposit Refunds',
        'deposit refunds': 'Deposit Refunds'
    };

    // Handle URL Query Params & Hash Changes
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash;
            const queryString = hash.includes('?') ? hash.split('?')[1] : '';
            const urlParams = new URLSearchParams(queryString);
            const q = urlParams.get('q');
            const f = urlParams.get('filters');
            const dr = urlParams.get('dr') || '';
            const drFrom = urlParams.get('dr_from') || '';
            const drTo = urlParams.get('dr_to') || '';
            const lateFeeStatusParam = urlParams.get('late_fee_status');
            const resolvedLateFeeStatus = lateFeeStatusParam === 'Paid' ? 'Paid' : 'Pending';

            setActiveDateRange(dr);
            setActiveDatePeriod(dr || null);
            setCustomDrFrom(drFrom);
            setCustomDrTo(drTo);
            setLateFeeStatus(resolvedLateFeeStatus);

            if (q) {
                const lowerQ = q.toLowerCase().trim();
                if (KEYWORD_MAP[lowerQ]) {
                    setActiveFilter(KEYWORD_MAP[lowerQ]);
                    setQuery('');
                } else {
                    setQuery(q);
                    if (!f) setActiveFilter('All');
                }
            } else if (f) {
                setActiveFilter(f.split(',')[0]);
                setQuery('');
            } else {
                setActiveFilter('All');
                setQuery('');
            }
        };

        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    // Intelligent Switching on Local Search Input
    useEffect(() => {
        const lowerQ = query.toLowerCase().trim();
        if (KEYWORD_MAP[lowerQ] && activeFilter !== KEYWORD_MAP[lowerQ]) {
            setActiveFilter(KEYWORD_MAP[lowerQ]);
            setQuery('');
        }
    }, [query, activeFilter]);

    // --- Date Range Helper ---
    const parseFlexDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;
        const isoPlain = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoPlain) return new Date(+isoPlain[1], +isoPlain[2] - 1, +isoPlain[3]);
        let d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
        const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmy) { d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]); if (!isNaN(d.getTime())) return d; }
        const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdy) { d = new Date(+mdy[3], +mdy[1] - 1, +mdy[2]); if (!isNaN(d.getTime())) return d; }
        return null;
    };

    const startOfDay = (date: Date) => {
        const value = new Date(date);
        value.setHours(0, 0, 0, 0);
        return value;
    };

    const endOfDay = (date: Date) => {
        const value = new Date(date);
        value.setHours(23, 59, 59, 999);
        return value;
    };

    const getDateRangeBounds = (): { start: Date; end: Date } | null => {
        if (!activeDateRange) return null;
        const today = startOfDay(new Date());

        if (activeDateRange === 'Today') return { start: today, end: endOfDay(today) };
        if (activeDateRange === 'Yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
        }
        if (activeDateRange.startsWith('Day:')) {
            const specific = parseFlexDate(activeDateRange.slice(4));
            if (!specific) return null;
            return { start: startOfDay(specific), end: endOfDay(specific) };
        }
        if (activeDateRange === 'This Week') {
            const dow = today.getDay();
            const diff = dow === 0 ? 6 : dow - 1;
            const start = new Date(today);
            start.setDate(today.getDate() - diff);
            return { start: startOfDay(start), end: endOfDay(today) };
        }
        if (activeDateRange === 'Last Week') {
            const dow = today.getDay();
            const diff = dow === 0 ? 6 : dow - 1;
            const end = new Date(today);
            end.setDate(today.getDate() - diff - 1);
            const start = new Date(end);
            start.setDate(end.getDate() - 6);
            return { start: startOfDay(start), end: endOfDay(end) };
        }
        if (activeDateRange === 'This Month') {
            return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
        }
        if (activeDateRange === 'Last Month') {
            return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)) };
        }
        if (activeDateRange === 'This Quarter') {
            const q = Math.floor(today.getMonth() / 3);
            return { start: new Date(today.getFullYear(), q * 3, 1), end: endOfDay(new Date(today.getFullYear(), q * 3 + 3, 0)) };
        }
        if (activeDateRange === 'This Year') {
            return { start: new Date(today.getFullYear(), 0, 1), end: endOfDay(new Date(today.getFullYear(), 11, 31)) };
        }
        if (activeDateRange === 'Custom' && customDrFrom && customDrTo) {
            const from = parseFlexDate(customDrFrom);
            const to = parseFlexDate(customDrTo);
            if (!from || !to) return null;
            return { start: startOfDay(from), end: endOfDay(to) };
        }
        return null;
    };

    const isDateInRange = (date: Date): boolean => {
        const bounds = getDateRangeBounds();
        if (!bounds) return true;
        const target = startOfDay(date);
        return target >= bounds.start && target <= bounds.end;
    };

    const isInDateRange = (dateStr?: string): boolean => {
        if (!activeDateRange) return true;
        if (!dateStr) return false;
        const parsed = parseFlexDate(dateStr);
        if (!parsed) return false;
        return isDateInRange(parsed);
    };

    const getPeriodKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const getPeriodLabel = (date: Date) => date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

    // --- Data Processing for Specific Views ---

    const tableData = useMemo(() => {
        const lowerQ = query.toLowerCase();
        
        // Filter tenants first based on search query
        const searchedTenants = tenants.filter(t => 
            !query || 
            t.name.toLowerCase().includes(lowerQ) ||
            t.idNumber.includes(lowerQ) ||
            t.unit.toLowerCase().includes(lowerQ) || 
            (t.propertyName && t.propertyName.toLowerCase().includes(lowerQ))
        );

        const buildPaidByPeriod = (tenant: any) => {
            const paidByPeriod: Record<string, number> = {};
            (tenant.paymentHistory || []).forEach((payment: any) => {
                const parsed = parseFlexDate(payment.date);
                if (!parsed) return;
                const periodKey = getPeriodKey(parsed);
                paidByPeriod[periodKey] = (paidByPeriod[periodKey] || 0) + (parseFloat(payment.amount.replace(/[^0-9.]/g, '')) || 0);
            });
            return paidByPeriod;
        };

        const getBillingPeriodsForTenant = (
            tenant: any,
            opts?: { lookbackMonths?: number; includeCurrentMonth?: boolean; ignoreDateBounds?: boolean }
        ) => {
            const now = startOfDay(new Date());
            const bounds = opts?.ignoreDateBounds ? null : getDateRangeBounds();
            const activationDate = parseFlexDate((tenant as any).activationDate || tenant.onboardingDate || '');
            const activationMonth = activationDate ? new Date(activationDate.getFullYear(), activationDate.getMonth(), 1) : null;

            let startMonth: Date;
            let endMonth: Date;

            if (bounds) {
                startMonth = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
                endMonth = new Date(bounds.end.getFullYear(), bounds.end.getMonth(), 1);
            } else {
                const includeCurrentMonth = opts?.includeCurrentMonth !== false;
                const lookbackMonths = opts?.lookbackMonths ?? 0;
                const endOffset = includeCurrentMonth ? 0 : 1;
                endMonth = new Date(now.getFullYear(), now.getMonth() - endOffset, 1);
                startMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - lookbackMonths, 1);
            }

            const periods: Array<{ key: string; label: string; dueDate: Date }> = [];
            for (let cursor = new Date(startMonth); cursor <= endMonth; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
                if (activationMonth && cursor < activationMonth) continue;
                const dueDate = new Date(cursor.getFullYear(), cursor.getMonth(), getRentDueDay(tenant));
                if (dueDate > now) continue;
                if (bounds && !isDateInRange(dueDate)) continue;
                periods.push({ key: getPeriodKey(cursor), label: getPeriodLabel(cursor), dueDate });
            }
            return periods;
        };

        if (activeFilter === 'Paid') {
            const historyEntries = searchedTenants.flatMap(t =>
                t.paymentHistory
                    .filter(p => p.status === 'Paid' && isInDateRange(p.date))
                    .map(p => ({
                        id: `${t.id}-${p.reference}`,
                        tenant: t.name,
                        property: `${t.propertyName} - ${t.unit}`,
                        amountDisplay: p.amount,
                        val: parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0,
                        date: p.date,
                        method: p.method
                    }))
            );
            // Dedup set: all references already captured in paymentHistory across ALL tenants
            const historyRefs = new Set(
                tenants.flatMap(t => t.paymentHistory.flatMap(p => [p.reference, (p as any).transactionCode].filter(Boolean)))
            );
            // Merge matched M-Pesa C2B transactions not already in paymentHistory
            const externalEntries = (externalTransactions || [])
                .filter(tx =>
                    tx.matched &&
                    tx.type === 'M-Pesa' &&
                    isInDateRange(tx.date) &&
                    !historyRefs.has(tx.reference) &&
                    !(tx.transactionCode && historyRefs.has(tx.transactionCode))
                )
                .map(tx => {
                    const matched = tenants.find(t => t.id === tx.matchedTenantId);
                    return {
                        id: `ext-${tx.id}`,
                        tenant: matched?.name ?? tx.name,
                        property: matched ? `${matched.propertyName} - ${matched.unit}` : tx.account,
                        amountDisplay: `KES ${Number(tx.amount).toLocaleString()}`,
                        val: Number(tx.amount) || 0,
                        date: tx.date,
                        method: 'M-Pesa C2B'
                    };
                });
            return [...historyEntries, ...externalEntries]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        if (activeFilter === 'Unpaid') {
            const todayRef = startOfDay(new Date());
            const currentMonthKey = getPeriodKey(todayRef);
            return searchedTenants.flatMap(t => {
                if (!['Active', 'Overdue', 'Notice'].includes(t.status)) return [];
                if (!Number(t.rentAmount ?? 0)) return [];
                const paidByPeriod = buildPaidByPeriod(t);
                const periods = getBillingPeriodsForTenant(t, { lookbackMonths: 0, includeCurrentMonth: true });
                if (!periods.length) return [];
                const pendingBills = (t.outstandingBills ?? [])
                    .filter((b: any) => b.status === 'Pending')
                    .reduce((sum: number, b: any) => sum + Number(b.amount ?? 0), 0);
                return periods
                    .filter(period => (paidByPeriod[period.key] || 0) === 0)
                    .map(period => {
                        const rent = Number(t.rentAmount || 0);
                        const bills = period.key === currentMonthKey ? pendingBills : 0;
                        const daysOverdue = Math.max(0, Math.floor((todayRef.getTime() - startOfDay(period.dueDate).getTime()) / 86400000));
                        return {
                            id: `${t.id}-${period.key}`,
                            tenant: t.name,
                            property: `${t.propertyName} - ${t.unit}`,
                            amountDisplay: `KES ${(rent + bills).toLocaleString()}`,
                            val: rent + bills,
                            rent,
                            bills,
                            totalDue: rent + bills,
                            dueDate: fmtDate(period.dueDate),
                            daysOverdue,
                            status: t.status,
                            period: period.label
                        };
                    });
            });
        }

        if (activeFilter === 'Arrears') {
            // Arrears intentionally ignores the date-range chip — every
            // tenant carrying unpaid rent from prior months should surface
            // regardless of the period filter. Sweep up to 23 months back
            // and exclude the current month (current-month dues are
            // covered by the "Unpaid" filter, not "Arrears").
            return searchedTenants.flatMap(t => {
                if (['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status))) return [];
                if (!Number(t.rentAmount ?? 0)) return [];
                const currentMonth = getPeriodKey(new Date());
                const arrears = computeTenantArrears(t, currentMonth);
                const missed = arrears.items.filter(item => item.kind === 'rent');
                const accruedArrears = arrears.totalArrears;
                const adminArrears = Math.max(0, Number((t as any).arrears ?? 0));
                const finalArrears = Math.max(accruedArrears, adminArrears);
                if (finalArrears <= 0) return [];
                const rentStartDate = t.rentStartDate || t.activationDate || t.onboardingDate || (t as any).onboarding_date || '';
                const latestDueDate = missed.length ? new Date(`${missed[missed.length - 1].monthIso}-${String(getRentDueDay(t)).padStart(2, '0')}T00:00:00`) : new Date();
                const daysOverdue = Math.max(0, Math.floor((startOfDay(new Date()).getTime() - startOfDay(latestDueDate).getTime()) / 86400000));
                return [{
                    id: t.id,
                    tenant: t.name,
                    property: `${t.propertyName} - ${t.unit}`,
                    amountDisplay: `KES ${finalArrears.toLocaleString()}`,
                    val: finalArrears,
                    monthsMissed: missed.length || (finalArrears > 0 && adminArrears > accruedArrears ? 1 : 0),
                    daysOverdue,
                    dueDate: rentStartDate ? fmtDate(rentStartDate) : '—'
                }];
            });
        }

        if (activeFilter === 'Late Fee') {
            const todayRef = startOfDay(new Date());
            const todayKey = getPeriodKey(todayRef);
            const todayIso = todayRef.toISOString().split('T')[0];

            return searchedTenants
                .flatMap(t => {
                    const monthlyStatus = getMonthlyRentStatus(t);

                    // Pull late-fee amount strictly from the per-month
                    // LATEFEE-* invoices: this excludes super-admin
                    // waived months and subtracts any portion already
                    // paid via the waterfall, so the column reflects
                    // the actual outstanding late-fee balance — not
                    // any rent balance.
                    const lateFeeBuild = buildLateFeeInvoices(t);
                    const lateFeeOutstanding = lateFeeBuild.breakdown.reduce(
                        (sum, m) => sum + Math.max(0, Number(m.remaining || 0)),
                        0,
                    );
                    const pendingRows = lateFeeOutstanding > 0
                        ? [{
                            id: `${t.id}-${todayKey}`,
                            tenant: t.name,
                            property: `${t.propertyName} - ${t.unit}`,
                            type: 'Late Rent',
                            amountDisplay: `KES ${Math.round(lateFeeOutstanding).toLocaleString()}`,
                            val: lateFeeOutstanding,
                            date: todayIso,
                            status: 'Pending',
                            period: getPeriodLabel(todayRef),
                            daysLate: monthlyStatus.daysLateThisMonth
                        }]
                        : [];

                    const recordedRows = (t.outstandingFines ?? [])
                        .filter(f => isLateFeeType(f.type) && isInDateRange(f.date))
                        .map(f => {
                            const parsedFineDate = parseFlexDate(f.date);
                            return {
                                id: f.id,
                                tenant: t.name,
                                property: `${t.propertyName} - ${t.unit}`,
                                type: f.type,
                                amountDisplay: `KES ${f.amount.toLocaleString()}`,
                                val: f.amount,
                                date: f.date,
                                status: f.status,
                                period: parsedFineDate ? getPeriodLabel(parsedFineDate) : '—',
                                daysLate: 0
                            };
                        });

                    return [...pendingRows, ...recordedRows].filter(row => row.status === lateFeeStatus);
                })
                .sort((a, b) => {
                    const left = parseFlexDate(a.date)?.getTime() || 0;
                    const right = parseFlexDate(b.date)?.getTime() || 0;
                    return right - left;
                });
        }

        if (activeFilter === 'Unpaid Fines') {
            return searchedTenants
                .filter(t => t.outstandingFines.some(f => f.status === 'Pending' && isInDateRange(f.date)))
                .flatMap(t => t.outstandingFines
                    .filter(f => f.status === 'Pending' && isInDateRange(f.date))
                    .map(fine => ({
                        id: fine.id,
                        tenant: t.name,
                        property: `${t.propertyName} - ${t.unit}`,
                        type: fine.type,
                        amountDisplay: `KES ${fine.amount.toLocaleString()}`,
                        val: fine.amount,
                        date: fine.date,
                        status: fine.status
                    })));
        }

        if (activeFilter === 'Paid Fines') {
            return searchedTenants
                .filter(t => t.outstandingFines.some(f => f.status === 'Paid' && isInDateRange(f.date)))
                .flatMap(t => t.outstandingFines
                    .filter(f => f.status === 'Paid' && isInDateRange(f.date))
                    .map(fine => ({
                        id: fine.id,
                        tenant: t.name,
                        property: `${t.propertyName} - ${t.unit}`,
                        type: fine.type,
                        amountDisplay: `KES ${fine.amount.toLocaleString()}`,
                        val: fine.amount,
                        date: fine.date,
                        status: fine.status
                    })));
        }

        if (activeFilter === 'Deposits Paid') {
            return searchedTenants
                .filter(t => t.depositPaid > 0 && ['Active', 'Overdue', 'Notice'].includes(t.status) && isInDateRange(t.onboardingDate))
                .map(t => ({
                    id: t.id,
                    tenant: t.name,
                    property: `${t.propertyName} - ${t.unit}`,
                    amountDisplay: `KES ${t.depositPaid.toLocaleString()}`,
                    val: t.depositPaid,
                    date: t.onboardingDate,
                    status: 'Held'
                }));
        }

        if (activeFilter === 'Deposit Refunds') {
            return searchedTenants
                .filter(t => t.depositPaid > 0 && ['Vacated', 'Evicted', 'Blacklisted'].includes(t.status) && isInDateRange(t.leaseEnd))
                .map(t => ({
                    id: t.id,
                    tenant: t.name,
                    property: `${t.propertyName} - ${t.unit}`,
                    amountDisplay: `KES ${t.depositPaid.toLocaleString()}`,
                    val: t.depositPaid,
                    date: t.leaseEnd || 'N/A',
                    status: 'Refund Pending'
                }));
        }

        if (activeFilter === 'Unpaid Deposit') {
            return searchedTenants
                .filter(t => (!t.depositPaid || t.depositPaid === 0) && ['Active', 'Overdue', 'Notice'].includes(t.status) && isInDateRange(t.onboardingDate))
                .map(t => ({
                    id: t.id,
                    tenant: t.name,
                    property: `${t.propertyName} - ${t.unit}`,
                    amountDisplay: `KES ${t.rentAmount.toLocaleString()}`,
                    val: t.rentAmount,
                    date: t.onboardingDate || 'N/A',
                    status: t.status
                }));
        }

        if (activeFilter === 'Partial Payments') {
            const now = new Date();
            const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            return searchedTenants.flatMap(t => {
                if (!['Active', 'Overdue', 'Notice'].includes(t.status)) return [];
                if (!Number(t.rentAmount ?? 0)) return [];
                // Group all payment entries by billing period (YYYY-MM)
                const byPeriod: Record<string, { totalPaid: number; latestDate: string; methods: string[] }> = {};
                t.paymentHistory.forEach(p => {
                    const parsed = parseFlexDate(p.date);
                    if (!parsed) return;
                    const periodKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
                    if (!byPeriod[periodKey]) byPeriod[periodKey] = { totalPaid: 0, latestDate: p.date, methods: [] };
                    const paid = parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0;
                    byPeriod[periodKey].totalPaid += paid;
                    if (new Date(p.date) > new Date(byPeriod[periodKey].latestDate)) {
                        byPeriod[periodKey].latestDate = p.date;
                    }
                    if (p.method && !byPeriod[periodKey].methods.includes(p.method)) {
                        byPeriod[periodKey].methods.push(p.method);
                    }
                });

                return Object.entries(byPeriod)
                    .filter(([periodKey, { totalPaid, latestDate }]) => {
                        if (totalPaid <= 0 || totalPaid >= Number(t.rentAmount)) return false;
                        // Default (no date range): show current month partials only
                        // With date range: filter by the latest payment date in that period
                        if (!activeDateRange) return periodKey === currentPeriod;
                        return isInDateRange(latestDate);
                    })
                    .map(([periodKey, { totalPaid, latestDate, methods }]) => {
                        const [yr, mo] = periodKey.split('-');
                        const period = new Date(+yr, +mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
                        return {
                            id: `${t.id}-${periodKey}`,
                            tenant: t.name,
                            property: `${t.propertyName} - ${t.unit}`,
                            amountDisplay: `KES ${totalPaid.toLocaleString()}`,
                            val: totalPaid,
                            expected: Number(t.rentAmount),
                            shortfall: Number(t.rentAmount) - totalPaid,
                            date: latestDate,
                            period,
                            method: methods.join(', ') || '—'
                        };
                    })
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            });
        }

        return [];
    }, [tenants, query, activeFilter, activeDateRange, customDrFrom, customDrTo, lateFeeStatus]);

    // --- Calculate Totals ---
    const summaryStats = useMemo(() => {
        if (activeFilter === 'All') return null;

        const count = tableData.length;
        const totalAmount = tableData.reduce((sum, row: any) => sum + (row.val || 0), 0);

        return { count, totalAmount };
    }, [tableData, activeFilter]);


    // --- Generic Search Logic (Fallback) ---
    useEffect(() => {
        if (activeFilter !== 'All') return;

        if (query.length > 1) {
             const lowerQ = query.toLowerCase();
             const searchResults: SearchResult[] = [];

             tenants.filter(t => !['Vacated', 'Evicted', 'Blacklisted', 'Inactive'].includes(t.status)).forEach(t => {
                 if (t.name.toLowerCase().includes(lowerQ) || t.unit.toLowerCase().includes(lowerQ)) {
                     searchResults.push({ id: t.id, type: 'Tenant', title: t.name, subtitle: `${t.propertyName} - ${t.unit}`, status: t.status });
                 }
             });
             
             properties.forEach(p => {
                 if (p.name.toLowerCase().includes(lowerQ)) {
                     searchResults.push({ id: p.id, type: 'Property', title: p.name, subtitle: p.branch, status: p.status });
                 }
             });

             setResults(searchResults);
        } else {
            setResults([]);
        }
    }, [query, activeFilter, tenants, properties]);


    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    };

    const handleExportCSV = () => {
        if (activeFilter === 'All' || tableData.length === 0) {
            alert("No data to export for this view.");
            return;
        }
        exportToCSV(tableData, `${activeFilter}_Report`);
    };

    const handlePrint = () => {
        if (activeFilter === 'All') {
            window.print();
        } else {
            printSection('quick-search-results', `${activeFilter} Report`);
        }
    };

    const timePeriodButtons = useMemo(() => {
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
            { label: 'Last Month', value: 'Last Month' },
            { label: 'This Quarter', value: 'This Quarter' },
            { label: 'This Year', value: 'This Year' },
            { label: 'Custom Range', value: 'Custom' },
        ];
    }, []);

    const handleTimePeriodSelect = (period: string) => {
        if (period === 'Custom') { setActiveDatePeriod('Custom'); return; }
        setActiveDatePeriod(period);
        setActiveDateRange(period);
        setCustomDrFrom('');
        setCustomDrTo('');
    };

    const handleCustomDateApply = () => {
        if (!customDrFrom || !customDrTo) return alert('Select both From and To dates.');
        setActiveDateRange('Custom');
        setActiveDatePeriod('Custom');
    };

    const clearPeriod = () => {
        setActiveDatePeriod(null);
        setActiveDateRange('');
        setCustomDrFrom('');
        setCustomDrTo('');
    };

    const toggleFilter = (filter: string) => {
        setActiveFilter(prev => prev === filter ? 'All' : filter);
        setQuery('');
        setActiveDatePeriod(null);
        setActiveDateRange('');
        setCustomDrFrom('');
        setCustomDrTo('');
        setLateFeeStatus('Pending');
    };

    const emptyStateColSpan = activeFilter === 'Unpaid' || activeFilter === 'Partial Payments' || activeFilter === 'Late Fee' ? 8 : 6;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center no-print">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Quick Search & Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Find records and generate instant operational lists.</p>
                </div>
                <button 
                    onClick={() => window.location.hash = '#/partial-rms/dashboard'} 
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg shadow-sm transition-colors flex items-center"
                >
                    <span className="mr-2">←</span> Back
                </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 no-print">
                <div className="flex flex-wrap gap-2">
                    {FILTERS.map(filter => {
                        const isActive = activeFilter === filter;
                        return (
                            <button 
                                key={filter} 
                                onClick={() => toggleFilter(filter)}
                                className={`px-4 py-2 text-sm rounded-full focus:outline-none transition-all duration-200 shadow-sm ${
                                isActive 
                                    ? 'bg-primary text-white font-bold transform scale-105' 
                                    : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {filter}{isActive ? ' ▾' : ''}
                            </button>
                        );
                    })}
                </div>

                {activeFilter !== 'All' && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                Filter <span className="text-primary">{activeFilter}</span> by period:
                            </span>
                            <button onClick={() => clearPeriod()} className="ml-auto text-xs text-gray-400 hover:text-red-500 font-bold">✕ Clear Period</button>
                        </div>
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
                                <input type="date" value={customDrFrom} onChange={e => setCustomDrFrom(e.target.value)} className="p-1.5 border rounded text-sm" />
                                <label className="text-xs font-medium text-gray-600">To:</label>
                                <input type="date" value={customDrTo} onChange={e => setCustomDrTo(e.target.value)} className="p-1.5 border rounded text-sm" />
                                <button onClick={handleCustomDateApply} className="px-4 py-1.5 bg-primary text-white text-sm font-bold rounded hover:bg-primary-dark">Apply</button>
                            </div>
                        )}
                        {activeFilter === 'Late Fee' && (
                            <div className="flex flex-wrap items-center gap-2 mt-3">
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
                                                ? 'bg-red-600 text-white border-red-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            <div className="flex flex-col md:flex-row items-center gap-2 mt-4">
                <div className="relative flex-grow w-full">
                    <input
                        type="text"
                        value={query}
                        onChange={handleSearchInput}
                        placeholder={`Search ${activeFilter === 'All' ? 'everything' : 'within ' + activeFilter}...`}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-primary-light focus:border-primary-light text-lg shadow-sm"
                    />
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Icon name="search" className="w-6 h-6 text-gray-400" />
                    </div>
                </div>
                {activeFilter !== 'All' && (
                    <div className="flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={handleExportCSV}
                            className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-sm flex items-center justify-center whitespace-nowrap transition-colors"
                        >
                            <Icon name="download" className="w-5 h-5 mr-2" /> CSV
                        </button>
                        <button 
                            onClick={handlePrint}
                            className="flex-1 md:flex-none px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-sm flex items-center justify-center whitespace-nowrap transition-colors"
                        >
                            <Icon name="download" className="w-5 h-5 mr-2" /> PDF / Print
                        </button>
                    </div>
                )}
            </div>
            </div>

            {/* --- SUMMARY TOTALS --- */}
            <div id="quick-search-results">
                {activeFilter !== 'All' && summaryStats && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in mb-6">
                        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-gray-400">
                            <p className="text-sm text-gray-500 font-medium uppercase">Count</p>
                            <p className="text-2xl font-bold text-gray-800">{summaryStats.count} Records</p>
                        </div>
                        <div className={`bg-white p-4 rounded-xl shadow-sm border-l-4 ${
                            activeFilter.includes('Arrears') || activeFilter.includes('Unpaid') || activeFilter.includes('Refunds') || activeFilter.includes('Late') ? 'border-red-500' : 
                            'border-green-500'
                        }`}>
                            <p className="text-sm text-gray-500 font-medium uppercase">
                                Total {activeFilter}
                            </p>
                            <p className={`text-2xl font-bold ${
                                activeFilter.includes('Arrears') || activeFilter.includes('Unpaid') || activeFilter.includes('Refunds') || activeFilter.includes('Late') ? 'text-red-600' : 
                                'text-green-600'
                            }`}>KES {summaryStats.totalAmount.toLocaleString()}</p>
                        </div>
                    </div>
                )}

                {activeFilter === 'All' ? (
                    // GENERIC RESULTS
                    <div className="bg-white p-6 rounded-xl shadow-sm min-h-[300px]">
                        {results.length > 0 ? (
                            <div>
                                <h3 className="text-md font-semibold text-gray-500 uppercase tracking-wider border-b pb-2 mb-3">Top Results</h3>
                                <ul className="space-y-2">
                                    {results.map(result => (
                                        <li key={result.id}>
                                            <button onClick={() => { /* Navigate to profile */ }} className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors">
                                                <div>
                                                    <p className="font-semibold text-gray-800">{result.title}</p>
                                                    <p className="text-sm text-gray-500">{result.subtitle}</p>
                                                </div>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800`}>{result.status}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-400 flex flex-col items-center justify-center h-full">
                                <Icon name="search" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Use filters above or type to search across the platform.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    // SPECIFIC TABLES
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    {activeFilter === 'Paid' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Amount Paid</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Method</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Date</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Unpaid' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Rent</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Bills</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Total Due</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Due Date</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Days Overdue</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Arrears' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Total Outstanding</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Months in Arrears</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Days Overdue</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Rent Start Date</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Late Fee' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Period</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Type</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Amount</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Date</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Days Late</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    )}
                                    {(activeFilter === 'Unpaid Fines' || activeFilter === 'Paid Fines') && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Type</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Amount</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Date</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Deposits Paid' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Deposit Held</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Paid On</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Deposit Refunds' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Refund Amount</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Move Out Date</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Unpaid Deposit' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Rent Amount</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Move In Date</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    )}
                                    {activeFilter === 'Partial Payments' && (
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Period</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Paid</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Expected</th>
                                            <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase">Shortfall</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Last Payment</th>
                                            <th className="px-6 py-3 text-center font-medium text-gray-500 uppercase">Method</th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {tableData.map((row: any) => (
                                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                            {activeFilter === 'Paid' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-green-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.method}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.date}</td>
                                                </>
                                            )}
                                            {activeFilter === 'Unpaid' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-right text-gray-700">KES {(row.rent || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right text-gray-500">
                                                        {row.bills > 0
                                                            ? <span className="text-orange-600 font-semibold">KES {row.bills.toLocaleString()}</span>
                                                            : <span className="text-gray-300">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-red-600">KES {(row.totalDue || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.dueDate}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">{row.daysOverdue}d overdue</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center"><span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">{row.status}</span></td>
                                                </>
                                            )}
                                            {activeFilter === 'Arrears' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-red-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">{row.monthsMissed} {row.monthsMissed === 1 ? 'Month' : 'Months'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-bold">{row.daysOverdue} Days</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.dueDate}</td>
                                                </>
                                            )}
                                            {activeFilter === 'Late Fee' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-center"><span className="px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold">{row.period}</span></td>
                                                    <td className="px-6 py-4 text-gray-800">{row.type}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-red-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{fmtDate(row.date)}</td>
                                                    <td className="px-6 py-4 text-center">{row.daysLate > 0 ? <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-bold">{row.daysLate} Days</span> : <span className="text-gray-300">—</span>}</td>
                                                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${row.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{row.status}</span></td>
                                                </>
                                            )}
                                            {(activeFilter === 'Unpaid Fines' || activeFilter === 'Paid Fines') && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-gray-800">{row.type}</td>
                                                    <td className={`px-6 py-4 text-right font-bold ${activeFilter === 'Paid Fines' ? 'text-green-600' : 'text-orange-600'}`}>{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.date}</td>
                                                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs ${activeFilter === 'Paid Fines' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{row.status}</span></td>
                                                </>
                                            )}
                                            {activeFilter === 'Deposits Paid' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-blue-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.date}</td>
                                                    <td className="px-6 py-4 text-center"><span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">{row.status}</span></td>
                                                </>
                                            )}
                                            {activeFilter === 'Deposit Refunds' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-red-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.date}</td>
                                                    <td className="px-6 py-4 text-center"><span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">{row.status}</span></td>
                                                </>
                                            )}
                                            {activeFilter === 'Unpaid Deposit' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-pink-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.date}</td>
                                                    <td className="px-6 py-4 text-center"><span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">{row.status}</span></td>
                                                </>
                                            )}
                                            {activeFilter === 'Partial Payments' && (
                                                <>
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.tenant}</td>
                                                    <td className="px-6 py-4 text-gray-500">{row.property}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">{row.period}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-yellow-600">{row.amountDisplay}</td>
                                                    <td className="px-6 py-4 text-right text-gray-500">KES {(row.expected || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-red-600">KES {(row.shortfall || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{fmtDate(row.date)}</td>
                                                    <td className="px-6 py-4 text-center text-gray-500">{row.method}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                    {tableData.length === 0 && (
                                        <tr>
                                            <td colSpan={emptyStateColSpan} className="px-6 py-12 text-center text-gray-500">
                                                No records found for {activeFilter}.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuickSearch;
