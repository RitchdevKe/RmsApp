import type { TenantProfile } from '../types';
import type { BillItem } from '../types';
import { parsePaymentAmount } from './paymentReporting';
import { buildStandardTenantPaymentPosting } from './tenantPaymentPosting';
import { getProratedDepositPaidThroughMonth, getProratedDepositInstallmentDueForMonth, getProratedDepositPaidBeforeMonth } from './proratedDepositAllocation';
import { getTenantRentStartAnchor } from './tenantPaymentCycle';
import { buildLateFeeInvoices, mergeLateFeeInvoices, LATE_FEE_BILL_PREFIX } from './lateFeeInvoices';

const DEPOSIT_INST_BILL_PREFIX = 'DEPOSIT-INST-';

function monthDiff(fromIso: string, toIso: string): number {
    const [fy, fm] = fromIso.split('-').map(Number);
    const [ty, tm] = toIso.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 0;
    return (ty - fy) * 12 + (tm - fm);
}

function addMonths(iso: string, n: number): string {
    const [y, m] = iso.split('-').map(Number);
    const dt = new Date(y, (m - 1) + n, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Synthesise traceable Paid / Partial / Pending bills for each scheduled
 * prorated-deposit installment. Replaces any prior DEPOSIT-INST-* entries
 * so the ledger stays consistent across re-runs.
 */
function buildDepositInstallmentBills(tenant: TenantProfile): BillItem[] {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled || tenant.depositExempt) return [];
    const installment = Number(pd.monthlyInstallment || 0);
    const total = Number(pd.totalDepositAmount || 0);
    const duration = Number(pd.durationMonths || 0);
    if (installment <= 0 || total <= 0 || duration <= 0) return [];
    const anchor = getTenantRentStartAnchor(tenant) || tenant.onboardingDate || '';
    const anchorMonth = String(anchor).slice(0, 7);
    if (!anchorMonth) return [];
    const todayMonth = getCurrentMonthIso();
    const lastPaid = (tenant.paymentHistory || [])
        .filter(p => p?.status === 'Paid')
        .reduce((acc, p) => {
            const m = String(p.date || '').slice(0, 7);
            return m > acc ? m : acc;
        }, anchorMonth);
    const horizonMonth = todayMonth > lastPaid ? todayMonth : lastPaid;
    const monthsThrough = Math.min(duration, Math.max(1, monthDiff(anchorMonth, horizonMonth) + 1));
    const bills: BillItem[] = [];
    for (let i = 0; i < monthsThrough; i++) {
        const monthIso = addMonths(anchorMonth, i);
        const paidBefore = getProratedDepositPaidBeforeMonth(tenant, monthIso);
        if (paidBefore + 0.5 >= total) break;
        const due = getProratedDepositInstallmentDueForMonth(tenant, monthIso);
        if (due <= 0) continue;
        const paidThrough = getProratedDepositPaidThroughMonth(tenant, monthIso);
        const paidThisInst = Math.max(0, Math.min(due, paidThrough - paidBefore));
        const status: 'Paid' | 'Pending' = paidThisInst + 0.5 >= due ? 'Paid' : 'Pending';
        bills.push({
            id: `${DEPOSIT_INST_BILL_PREFIX}${monthIso}-${tenant.id}`,
            type: 'Deposit Installment',
            description: status === 'Paid'
                ? `Deposit installment ${i + 1}/${duration} — ${monthIso}`
                : `Deposit installment ${i + 1}/${duration} — partial (KES ${paidThisInst.toLocaleString()} of KES ${due.toLocaleString()})`,
            amount: status === 'Paid' ? due : Math.max(0, due - paidThisInst),
            date: `${monthIso}-01`,
            status,
        });
    }
    return bills;
}

/**
 * Recompute a tenant's depositPaid, prorated-deposit progress,
 * outstandingBills (incl. ADVANCE-* ladder) and paymentHistory order
 * by replaying every Paid payment in chronological order through the
 * current allocation rules.
 *
 * This is the manual repair counterpart to buildStandardTenantPaymentPosting:
 * tenants whose state was created under older allocation logic can be
 * brought back in line with one click — without losing the original
 * payment records.
 *
 * Returns a Partial<TenantProfile> suitable for updateTenant().
 */
export function recomputeTenantFromPaymentHistory(tenant: TenantProfile): Partial<TenantProfile> {
    const history = [...(tenant.paymentHistory || [])]
        .filter(p => p && p.status === 'Paid')
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    // Reset only the derived fields. Keep bills the user/system added
    // (rent arrears, deposit installment, recurring) but reopen them so
    // replay can mark them Paid again, and strip the future-month
    // ADVANCE-* ladder so it gets rebuilt fresh from the final surplus.
    const startAnchor = getTenantRentStartAnchor(tenant) || tenant.onboardingDate || getTodayIsoDate();
    const startAnchorFull = startAnchor.length === 7 ? `${startAnchor}-01` : startAnchor;

    let working: TenantProfile = {
        ...tenant,
        paymentHistory: [],
        depositPaid: 0,
        nextDueDate: startAnchorFull,
        proratedDeposit: tenant.proratedDeposit
            ? { ...tenant.proratedDeposit, amountPaidSoFar: 0 }
            : tenant.proratedDeposit,
        outstandingBills: (tenant.outstandingBills || [])
            .filter(b => !String(b.id || '').startsWith('ADVANCE-'))
            .filter(b => !String(b.id || '').startsWith(DEPOSIT_INST_BILL_PREFIX))
            .filter(b => !String(b.id || '').startsWith(LATE_FEE_BILL_PREFIX))
            .filter(b => {
                if (!b.date) return true;
                const startMonth = startAnchor.slice(0, 7);
                return b.date.slice(0, 7) >= startMonth;
            })
            .map(b => {
                const orig = b.originalAmount ?? b.amount;
                let cleanDesc = b.description;
                if (b.description && b.description.includes(' (partial KES')) {
                    cleanDesc = b.description.split(' (partial KES')[0];
                }
                return {
                    ...b,
                    status: 'Pending' as const,
                    amount: orig,
                    originalAmount: orig,
                    description: cleanDesc,
                };
            }),
        // Reset fine statuses so the waterfall can re-mark them as the
        // replay runs.
        outstandingFines: (tenant.outstandingFines || [])
            .filter(f => {
                if (!f.date) return true;
                const startMonth = startAnchor.slice(0, 7);
                return f.date.slice(0, 7) >= startMonth;
            })
            .map(f => ({ ...f, status: 'Pending' as const })),
    } as TenantProfile;
    // Reset per-month late-fee payment ledger (stored on tenant as a
    // loose JSON field — not in the strict TenantProfile shape yet).
    (working as any).lateFeePaidByMonth = {};

    for (const p of history) {
        const amt = parsePaymentAmount(p.amount);
        if (!(amt > 0)) continue;
        const posting = buildStandardTenantPaymentPosting(
            working,
            amt,
            String(p.date || ''),
            String(p.method || ''),
            String(p.reference || ''),
        );
        working = { ...working, ...posting.updates } as TenantProfile;
    }

    if (tenant.proratedDeposit?.enabled && working.proratedDeposit?.enabled) {
        const todayMonth = getCurrentMonthIso();
        let lastPaidMonth = todayMonth;
        for (const p of history) {
            const m = String(p.date || '').slice(0, 7);
            if (m > lastPaidMonth) lastPaidMonth = m;
        }
        const amountPaidSoFar = getProratedDepositPaidThroughMonth(working, lastPaidMonth);
        const installment = Number(working.proratedDeposit.monthlyInstallment || 0);
        const duration = Number(working.proratedDeposit.durationMonths || 0);
        working.proratedDeposit = {
            ...working.proratedDeposit,
            amountPaidSoFar,
            monthsPaid: installment > 0
                ? Math.min(duration, Math.floor((amountPaidSoFar + 0.5) / installment))
                : Math.min(duration, working.proratedDeposit.monthsPaid),
        };
        working.depositPaid = amountPaidSoFar;

        // Re-stamp deposit-installment bills so each cleared installment has
        // a Paid invoice line on the ledger (double-entry trace).
        const instBills = buildDepositInstallmentBills(working);
        working.outstandingBills = [
            ...(working.outstandingBills || []).filter(b => !String(b.id || '').startsWith(DEPOSIT_INST_BILL_PREFIX)),
            ...instBills,
        ];
    }

    // Final pass: regenerate LATEFEE-* invoices so their per-month
    // statuses reflect the rebuilt lateFeePaidByMonth map. The posting
    // loop already does this incrementally, but a final refresh ensures
    // the most-recent accrual snapshot is on the tenant.
    const lateFeeBuild = buildLateFeeInvoices(working);
    working.outstandingBills = mergeLateFeeInvoices(working.outstandingBills, lateFeeBuild.bills);

    return {
        depositPaid: working.depositPaid,
        proratedDeposit: working.proratedDeposit,
        outstandingBills: working.outstandingBills,
        paymentHistory: working.paymentHistory,
        nextDueDate: working.nextDueDate,
        ...((working as any).lateFeePaidByMonth ? { lateFeePaidByMonth: (working as any).lateFeePaidByMonth } as any : {}),
        outstandingFines: working.outstandingFines,
    };
}

import { allocateMultiOccupancyPayment } from './multiOccupancyAllocation';
import { getTodayIsoDate, getCurrentMonthIso } from './timezone';

export function recomputeMultiOccupancyGroup(main: TenantProfile, subs: TenantProfile[]): TenantProfile[] {
    // 1. Gather all payments
    const allPayments = new Map<string, any>();
    
    const processHistory = (tenant: TenantProfile, isMain: boolean) => {
        for (const p of (tenant.paymentHistory || [])) {
            if (p.status !== 'Paid') continue;
            let ref = String(p.reference || '').trim();
            const method = String(p.method || '').trim();
            const status = String(p.status || '').trim();
            if (ref.toUpperCase().startsWith('MULTI-') || method === 'Multi-Occupancy Allocation' || status === 'Multi-Occupancy Allocation') {
                continue;
            }
            let amt = Number(String(p.amount || '').replace(/[^0-9.-]+/g,""));
            // Keep payments distinct and uncombining — NEVER inflate or alter payment amounts
            const key = ref ? `${p.date}_${ref.toUpperCase()}` : `${tenant.id}_${p.date}_${amt}_${Math.random()}`;
            if (!allPayments.has(key)) {
                allPayments.set(key, {
                    date: p.date,
                    amount: amt,
                    method: p.method || 'Manual payment',
                    reference: ref,
                    original: p
                });
            }
        }
    };
    
    // Only process Main unit payment history; sub-units never hold independent payments
    processHistory(main, true);
    
    const unifiedHistory = Array.from(allPayments.values()).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    // 2. Create clean slates
    const createCleanSlate = (t: TenantProfile) => {
        const startAnchor = getTenantRentStartAnchor(t) || t.onboardingDate || getTodayIsoDate();
        const startAnchorFull = startAnchor.length === 7 ? `${startAnchor}-01` : startAnchor;
        
        let working: TenantProfile = {
            ...t,
            paymentHistory: [],
            depositPaid: 0,
            nextDueDate: startAnchorFull,
            proratedDeposit: t.proratedDeposit ? { ...t.proratedDeposit, amountPaidSoFar: 0 } : t.proratedDeposit,
            outstandingBills: (t.outstandingBills || [])
                .filter(b => !String(b.id || '').startsWith('ADVANCE-'))
                .filter(b => !String(b.id || '').startsWith(DEPOSIT_INST_BILL_PREFIX))
                .filter(b => !String(b.id || '').startsWith(LATE_FEE_BILL_PREFIX))
                .filter(b => {
                    if (!b.date) return true;
                    return b.date.slice(0, 7) >= startAnchor.slice(0, 7);
                })
                .map(b => {
                    const orig = b.originalAmount ?? b.amount;
                    let cleanDesc = b.description;
                    if (b.description && b.description.includes(' (partial KES')) {
                        cleanDesc = b.description.split(' (partial KES')[0];
                    }
                    return { ...b, status: 'Pending', amount: orig, originalAmount: orig, description: cleanDesc };
                }),
            outstandingFines: (t.outstandingFines || [])
                .filter(f => {
                    if (!f.date) return true;
                    return f.date.slice(0, 7) >= startAnchor.slice(0, 7);
                })
                .map(f => ({ ...f, status: 'Pending' })),
        } as TenantProfile;
        (working as any).lateFeePaidByMonth = {};
        return working;
    };
    
    let workingMain = createCleanSlate(main);
    let workingSubs = subs.map(createCleanSlate);
    
    // 3. Replay payments
    for (const p of unifiedHistory) {
        if (p.amount <= 0) continue;
        
        const alloc = allocateMultiOccupancyPayment(workingMain, workingSubs, p.amount, p.date);

        // SINGLE SOURCE OF TRUTH: sub-units never hold their own payments.
        // Every shilling is posted on the MAIN unit exactly as received.
        // Sub-units only report a derived status (see multiOccupancySubStatus).

        // Apply to main
        {
            const actualMainShare = p.amount;
            const posting = buildStandardTenantPaymentPosting(workingMain, actualMainShare, p.date, p.method, p.reference);

            // Merge every allocated line (main + sub shares) onto the main
            // unit's ledger — the group's money lives in one place.
            const byMonth = new Map<string, number>();
            for (const line of alloc.lines) {
                byMonth.set(line.monthIso, (byMonth.get(line.monthIso) || 0) + line.amount);
            }
            const mainLines = Array.from(byMonth.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([monthIso, amount]) => ({ monthIso, amount, kind: 'rent' }));


            
            if (alloc.unallocated > 0) {
                const curMonth = String(p.date || '').slice(0, 7);
                const existing = mainLines.find(l => l.monthIso === curMonth);
                if (existing) {
                    existing.amount += alloc.unallocated;
                } else {
                    mainLines.push({ monthIso: curMonth, amount: alloc.unallocated, kind: 'rent' });
                }
            }

            const mainPaymentEntry = {
                ...(p.original || {}),
                date: p.date,
                amount: p.original?.amount || `KES ${actualMainShare.toLocaleString()}`,
                status: 'Paid',
                method: p.method,
                reference: p.reference,
                allocationLines: mainLines,
            };
            
            workingMain = { ...workingMain, ...posting.updates, paymentHistory: [mainPaymentEntry, ...(workingMain.paymentHistory || [])] } as TenantProfile;
        }
    }
    
    // 4. Final passes
    const finalize = (working: TenantProfile, original: TenantProfile) => {
        if (original.proratedDeposit?.enabled && working.proratedDeposit?.enabled) {
            const lastPaidMonth = working.paymentHistory.length > 0
                ? String(working.paymentHistory[0].date || '').slice(0, 7) // history is un-sorted in updates (prepended), wait, let's just use now or find max
                : getCurrentMonthIso();
            
            // let's find the max date properly
            let maxMonth = getCurrentMonthIso();
            for (const p of working.paymentHistory) {
                const m = String(p.date || '').slice(0, 7);
                if (m > maxMonth) maxMonth = m;
            }
            
            const amountPaidSoFar = getProratedDepositPaidThroughMonth(working, maxMonth);
            const installment = Number(working.proratedDeposit.monthlyInstallment || 0);
            const duration = Number(working.proratedDeposit.durationMonths || 0);
            working.proratedDeposit = {
                ...working.proratedDeposit,
                amountPaidSoFar,
                monthsPaid: installment > 0
                    ? Math.min(duration, Math.floor((amountPaidSoFar + 0.5) / installment))
                    : Math.min(duration, working.proratedDeposit.monthsPaid),
            };
            working.depositPaid = amountPaidSoFar;
            const instBills = buildDepositInstallmentBills(working);
            working.outstandingBills = [
                ...(working.outstandingBills || []).filter(b => !String(b.id || '').startsWith(DEPOSIT_INST_BILL_PREFIX)),
                ...instBills,
            ];
        }
        
        const lateFeeBuild = buildLateFeeInvoices(working);
        working.outstandingBills = mergeLateFeeInvoices(working.outstandingBills, lateFeeBuild.bills);
        return working;
    };
    
    return [finalize(workingMain, main), ...workingSubs.map((ws, i) => finalize(ws, subs[i]))];
}
