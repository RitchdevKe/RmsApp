import type { TenantProfile } from '../types';
import { parsePaymentAmount } from './paymentReporting';
import { computeTenantMonthlyBalance, computeTenantTotalInvoicedForMonth, expectedThroughPriorMonth, type TenantMonthlyBalance } from './tenantBalance';
import { computeSubUnitInvoicedForMonth, computeSubUnitsInvoicedTotal } from './subUnitInvoicing';
import { computeTenantArrears } from './tenantArrears';

import { getTenantRentStartAnchor } from './tenantPaymentCycle';

function isBackdatedPaymentEntry(payment: any): boolean {
    return payment?.status === 'Paid' && (
        String(payment?.method || '') === 'Backdated Opening Balance'
        || String(payment?.method || '') === 'Backdated Rent Payment'
        || String(payment?.method || '') === 'Backdated Deposit Payment'
        || String(payment?.reference || '').startsWith('BACKFILL-')
        || String(payment?.reference || '').startsWith('DEPOSIT-BACKFILL-')
    );
}

export function normalizeMultiReceiptReference(reference: any): string {
    const raw = String(reference ?? '').trim();
    const unprefixed = raw.startsWith('MULTI-') ? raw.substring(6).trim() : raw;
    return unprefixed.toUpperCase();
}

function formatPaymentAmount(amount: number): string {
    return `KES ${Math.max(0, Math.round(Number(amount || 0))).toLocaleString()}`;
}

function parseExplicitReceiptAmount(payment: any): number | null {
    const raw = payment?.receiptAmount ?? payment?.originalReceiptAmount ?? payment?.ledgerAmount;
    if (raw === undefined || raw === null || raw === '') return null;
    const amount = typeof raw === 'number' ? raw : parsePaymentAmount(raw);
    return amount > 0 ? amount : null;
}

export function buildUnifiedMultiOccupancyPaymentHistory(
    main: TenantProfile,
    subs: TenantProfile[] = [],
    ledgerReceiptAmounts: Record<string, number> = {},
): any[] {
    const cleanMainHistory = (main.paymentHistory || []).filter(p => {
        const ref = String(p?.reference || '').trim().toUpperCase();
        const method = String(p?.method || '').trim();
        const status = String(p?.status || '').trim();
        return !ref.startsWith('MULTI-') && method !== 'Multi-Occupancy Allocation' && status !== 'Multi-Occupancy Allocation';
    });

    const all: any[] = [
        ...cleanMainHistory.map((p, idx) => ({ ...p, _sourceId: main.id, _isSub: false, _seq: `m-${idx}` }))
    ];

    const grouped = new Map<string, any>();
    for (const p of all) {
        const rawRef = String(p.reference || '').trim();
        const normalizedRef = normalizeMultiReceiptReference(rawRef);
        const baseRef = rawRef.startsWith('MULTI-') ? rawRef.substring(6).trim() : rawRef;
        const entryAmount = parsePaymentAmount(p.amount);
        const key = normalizedRef
            ? `${p.date || ''}_${normalizedRef}`
            : `${p.date || ''}_${p._sourceId}_${p._seq}_${entryAmount}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                total: 0,
                mainTotal: 0,
                subTotal: 0,
                methods: new Set<string>(),
                sample: p,
                baseRef,
                normalizedRef,
                hasMain: false,
                hasMainAllocationLines: false,
                explicitReceiptAmount: null as number | null,
            });
        }

        const g = grouped.get(key);
        g.total += entryAmount;
        const isSubShare = p._isSub || rawRef.startsWith('MULTI-');
        if (!isSubShare) {
            g.hasMain = true;
            g.mainTotal += entryAmount;
            if (Array.isArray(p.allocationLines) && p.allocationLines.length > 0) {
                g.hasMainAllocationLines = true;
            }
            g.sample = p;
        } else {
            g.subTotal += entryAmount;
        }

        const explicitReceiptAmount = parseExplicitReceiptAmount(p);
        if (explicitReceiptAmount !== null) {
            g.explicitReceiptAmount = Math.max(g.explicitReceiptAmount || 0, explicitReceiptAmount);
        }
        if (p.method && p.method !== 'Multi-Occupancy Allocation' && p.method !== 'System Allocation') {
            g.methods.add(p.method);
        }
    }

    const unified = Array.from(grouped.values()).map(g => {
        const methods = Array.from(g.methods);
        const ledgerAmount = g.normalizedRef ? Number(ledgerReceiptAmounts[g.normalizedRef] || 0) : 0;
        // The payment MUST display exactly the amount recorded on the inbound
        // payments ledger or original payment record. Multi-occupancy accounting
        // must NEVER alter or inflate/deflate payment amounts.
        const displayAmountStr = ledgerAmount > 0
            ? formatPaymentAmount(ledgerAmount)
            : (g.sample?.amount || formatPaymentAmount(g.explicitReceiptAmount || g.total || 0));

        return {
            ...g.sample,
            reference: g.baseRef,
            amount: displayAmountStr,
            method: methods.length > 0 ? methods.join(', ') : (g.sample.method || 'Unknown'),
        };
    });


    unified.sort((a, b) => {
        const dA = a.date || '';
        const dB = b.date || '';
        if (dA < dB) return 1;
        if (dA > dB) return -1;
        return 0;
    });
    return unified;
}

export function getGroupAdvanceFromPriorMonths(
    main: TenantProfile,
    subs: TenantProfile[],
    monthIso: string,
    opts: {
        allTenants?: TenantProfile[];
        unifiedPaymentHistory?: any[];
    } = {}
): number {
    const activeSubs = subs.filter(s => s.status !== 'Vacated');
    const mainAnchor = getTenantRentStartAnchor(main);
    const subAnchors = activeSubs.map(s => getTenantRentStartAnchor(s)).filter(Boolean) as string[];
    const allAnchors = [mainAnchor, ...subAnchors].filter(Boolean) as string[];
    if (allAnchors.length === 0) return 0;

    // Find the earliest start month
    allAnchors.sort();
    const startMonth = allAnchors[0].slice(0, 7);
    if (monthIso < startMonth) return 0;

    const unifiedPaymentHistory = opts.unifiedPaymentHistory || buildUnifiedMultiOccupancyPaymentHistory(main, activeSubs, {});

    const backdatedPayments = unifiedPaymentHistory.reduce((sum, p: any) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    // Payments received BEFORE the group's onboarding month are advance
    // payments and must show up as credit in the onboarding month itself.
    const preStartPayments = unifiedPaymentHistory.reduce((sum, p: any) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        const ds = String(p.date || '').slice(0, 7);
        if (!ds || ds >= startMonth) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    let currentMonth = startMonth;
    // Signed carry: positive = advance credit, negative = unpaid arrears.
    // The group is the single source of truth, so both surplus AND deficit
    // roll forward here — sub-units no longer carry arrears of their own.
    let carry = backdatedPayments + preStartPayments;

    while (currentMonth < monthIso) {
        const mainTotalInvoiced = computeTenantTotalInvoicedForMonth(main, currentMonth);
        const subTotalInvoiced = opts.allTenants
            ? computeSubUnitsInvoicedTotal(opts.allTenants, main.id, currentMonth)
            : activeSubs.reduce((sum, sub) => sum + computeSubUnitInvoicedForMonth(sub, currentMonth), 0);
        const totalInvoiced = mainTotalInvoiced + subTotalInvoiced;

        const amountPaidThisMonth = unifiedPaymentHistory.reduce((sum, p: any) => {
            if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
            if (!String(p.date || '').startsWith(currentMonth)) return sum;
            return sum + parsePaymentAmount(p.amount);
        }, 0);

        carry = carry + amountPaidThisMonth - totalInvoiced;

        const [y, m] = currentMonth.split('-').map(Number);
        const nextDt = new Date(y, m, 1);
        currentMonth = `${nextDt.getFullYear()}-${String(nextDt.getMonth() + 1).padStart(2, '0')}`;
    }

    return carry;
}

/** Positive advance credit carried into `monthIso` (0 when the group is in arrears). */
export function getGroupAdvanceCreditFromPriorMonths(
    main: TenantProfile,
    subs: TenantProfile[],
    monthIso: string,
    opts: { allTenants?: TenantProfile[]; unifiedPaymentHistory?: any[] } = {},
): number {
    return Math.max(0, getGroupAdvanceFromPriorMonths(main, subs, monthIso, opts));
}

/** Unpaid group arrears carried into `monthIso` (0 when the group is in credit). */
export function getGroupArrearsFromPriorMonths(
    main: TenantProfile,
    subs: TenantProfile[],
    monthIso: string,
    opts: { allTenants?: TenantProfile[]; unifiedPaymentHistory?: any[] } = {},
): number {
    return Math.max(0, -getGroupAdvanceFromPriorMonths(main, subs, monthIso, opts));
}



export interface MultiOccupancyGroupMonthlyBalance extends TenantMonthlyBalance {
    unifiedPaymentHistory: any[];
}

export function computeMultiOccupancyGroupMonthlyBalance(
    main: TenantProfile,
    subs: TenantProfile[] = [],
    monthIso: string,
    opts: {
        mainTotalInvoiced?: number;
        subTotalInvoiced?: number;
        unifiedPaymentHistory?: any[];
        ledgerReceiptAmounts?: Record<string, number>;
        allTenants?: TenantProfile[];
    } = {},
): MultiOccupancyGroupMonthlyBalance {
    const activeSubs = subs.filter(s => s.status !== 'Vacated');
    const unifiedPaymentHistory = opts.unifiedPaymentHistory
        ?? buildUnifiedMultiOccupancyPaymentHistory(main, activeSubs, opts.ledgerReceiptAmounts || {});

    const mainTotalInvoiced = opts.mainTotalInvoiced ?? computeTenantTotalInvoicedForMonth(main, monthIso);
    const subTotalInvoiced = opts.subTotalInvoiced ?? (
        opts.allTenants
            ? computeSubUnitsInvoicedTotal(opts.allTenants, main.id, monthIso)
            : activeSubs.reduce((sum, sub) => sum + computeSubUnitInvoicedForMonth(sub, monthIso), 0)
    );
    const invoicedThisMonth = mainTotalInvoiced + subTotalInvoiced;

    const amountPaidThisMonth = unifiedPaymentHistory.reduce((sum, p: any) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        if (!String(p.date || '').startsWith(monthIso)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    // Signed carry from prior months for the whole group (single source):
    // positive = advance credit, negative = unpaid arrears re-invoiced now.
    const carry = getGroupAdvanceFromPriorMonths(main, activeSubs, monthIso, {
        allTenants: opts.allTenants,
        unifiedPaymentHistory
    });
    const advanceFromPriorMonths = Math.max(0, carry);
    const arrearsFromPriorMonths = Math.max(0, -carry);
    const totalInvoiced = opts.mainTotalInvoiced != null
        ? invoicedThisMonth
        : (invoicedThisMonth + arrearsFromPriorMonths);

    const balanceDue = totalInvoiced - amountPaidThisMonth - advanceFromPriorMonths;
    const isCredit = balanceDue < 0;

    return {
        totalInvoiced,
        backdatedPayments: 0,
        amountPaidThisMonth,
        advanceFromPriorMonths,
        balanceDue,
        isCredit,
        creditAmount: isCredit ? Math.abs(balanceDue) : 0,
        unifiedPaymentHistory,
    };

}