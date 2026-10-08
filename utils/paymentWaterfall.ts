import type { TenantProfile, BillItem, FineItem } from '../types';
import { LATE_FEE_BILL_PREFIX, isLateFeeInvoice } from './lateFeeInvoices';
import { ADVANCE_BILL_PREFIX } from './advanceAllocation';

/**
 * Bill / fine consumption waterfall.
 *
 * Consumes a credit pool against open invoices in this strict order
 * (priorities 4 → 10 of the project-wide deduction rule; deposit (1+3)
 * and rent (2+7) are handled upstream in tenantPaymentPosting):
 *
 *   4. Bills arrears              (invoice month < currentMonth)
 *   5. Late-fee arrears           (LATEFEE-* for months < currentMonth)
 *   6. Penalties & fines arrears  (fines with date < currentMonth)
 *   8. Current month bills
 *   9. Current month late fee     (LATEFEE-currentMonth)
 *  10. Current month penalties & fines
 *
 * Mutations are local (no I/O). Late-fee payments are tracked on a
 * per-month map so the LATEFEE-* bill generator can later show paid /
 * partial / pending invoices independently per month.
 */

const NON_BILL_PREFIXES = [ADVANCE_BILL_PREFIX, 'DEPOSIT-INST-', 'bill-backfill-'];
const RENT_DEPOSIT_TYPES = new Set([
    'Rent', 'Rent Arrears', 'Deposit', 'Deposit Installment',
    'Future Rent (Prepaid)', 'Future Rent (Partial Prepaid)',
]);

function isRegularBill(bill: BillItem): boolean {
    const id = String(bill.id || '');
    if (NON_BILL_PREFIXES.some(p => id.startsWith(p))) return false;
    if (isLateFeeInvoice(bill)) return false;
    if (RENT_DEPOSIT_TYPES.has(String(bill.type || ''))) return false;
    return true;
}

function billMonth(bill: BillItem): string {
    return String(bill.date || '').slice(0, 7);
}

function fineMonth(fine: FineItem): string {
    return String(fine.date || '').slice(0, 7);
}

export interface WaterfallResult {
    outstandingBills: BillItem[];
    outstandingFines: FineItem[];
    lateFeePaidByMonth: Record<string, number>;
    creditRemaining: number;
    consumed: {
        billsArrears: number;
        lateFeeArrears: number;
        finesArrears: number;
        currentBills: number;
        currentLateFee: number;
        currentFines: number;
    };
}

/**
 * Walk priorities 4–10 in order, consuming `creditAvailable` against
 * open invoices. Returns updated bill / fine arrays plus a refreshed
 * `lateFeePaidByMonth` map. Caller is responsible for merging back into
 * the tenant blob.
 */
export function consumeCreditAgainstBills(
    tenant: TenantProfile,
    creditAvailable: number,
    currentMonthIso: string,
    stage: 'arrears' | 'current' | 'all' = 'all',
    paymentDate: string = `${currentMonthIso}-01`
): WaterfallResult {
    let credit = Math.max(0, Math.round(Number(creditAvailable) || 0));
    const bills: BillItem[] = (tenant.outstandingBills || []).map(b => ({ ...b }));
    const fines: FineItem[] = (tenant.outstandingFines || []).map(f => ({ ...f }));
    const lateFeePaid: Record<string, number> = { ...(((tenant as any).lateFeePaidByMonth || {}) as Record<string, number>) };
    const consumed = {
        billsArrears: 0, lateFeeArrears: 0, finesArrears: 0,
        currentBills: 0, currentLateFee: 0, currentFines: 0,
    };

    const payBill = (bill: BillItem): number => {
        if (credit <= 0 || bill.status === 'Paid') return 0;
        if (bill.originalAmount === undefined || bill.originalAmount === null) {
            bill.originalAmount = bill.amount;
        }
        const owed = Math.max(0, Number(bill.amount || 0));
        if (owed <= 0) { bill.status = 'Paid'; (bill as any).datePaid = String(paymentDate || ''); return 0; }
        const apply = Math.min(credit, owed);
        credit -= apply;
        const remaining = owed - apply;
        if (remaining <= 0.5) {
            bill.status = 'Paid';
            bill.amount = owed;
            (bill as any).datePaid = String(paymentDate || '');
        } else {
            bill.amount = remaining;
            bill.description = `${bill.description || bill.type} (partial KES ${Math.round(apply).toLocaleString()} of KES ${Math.round(owed).toLocaleString()})`;
            (bill as any).lastPaymentDate = String(paymentDate || '');
        }
        return apply;
    };

    const payFine = (fine: FineItem): number => {
        if (credit <= 0 || fine.status === 'Paid') return 0;
        const owed = Math.max(0, Number(fine.amount || 0));
        if (owed <= 0) { fine.status = 'Paid'; (fine as any).datePaid = String(paymentDate || ''); return 0; }
        const apply = Math.min(credit, owed);
        credit -= apply;
        if (apply + 0.5 >= owed) {
            fine.status = 'Paid';
            (fine as any).datePaid = String(paymentDate || '');
        } else {
            fine.amount = owed - apply;
            (fine as any).lastPaymentDate = String(paymentDate || '');
        }
        return apply;
    };

    const payLateFee = (bill: BillItem): number => {
        if (credit <= 0 || bill.status === 'Paid') return 0;
        const monthIso = String(bill.id || '').slice(LATE_FEE_BILL_PREFIX.length, LATE_FEE_BILL_PREFIX.length + 7);
        const owed = Math.max(0, Number(bill.amount || 0));
        if (owed <= 0) { bill.status = 'Paid'; (bill as any).datePaid = String(paymentDate || ''); return 0; }
        const apply = Math.min(credit, owed);
        credit -= apply;
        lateFeePaid[monthIso] = (lateFeePaid[monthIso] || 0) + apply;
        // The bill itself will be regenerated by buildLateFeeInvoices on
        // the next pass; we still update inline so downstream UI in the
        // same posting sees fresh state.
        if (apply + 0.5 >= owed) {
            bill.status = 'Paid';
            (bill as any).datePaid = String(paymentDate || '');
        } else {
            bill.amount = owed - apply;
            (bill as any).lastPaymentDate = String(paymentDate || '');
        }
        return apply;
    };

    if (stage === 'arrears' || stage === 'all') {
        // ── Bucket 4: bills arrears ────────────────────────────────────────
        for (const b of bills) {
            if (credit <= 0) break;
            if (!isRegularBill(b) || b.status !== 'Pending') continue;
            if (billMonth(b) >= currentMonthIso) continue;
            consumed.billsArrears += payBill(b);
        }

        // ── Bucket 5: late-fee arrears ────────────────────────────────────
        for (const b of bills) {
            if (credit <= 0) break;
            if (!isLateFeeInvoice(b) || b.status !== 'Pending') continue;
            if (billMonth(b) >= currentMonthIso) continue;
            consumed.lateFeeArrears += payLateFee(b);
        }

        // ── Bucket 6: penalties & fines arrears ───────────────────────────
        for (const f of fines) {
            if (credit <= 0) break;
            if (f.status !== 'Pending') continue;
            if (fineMonth(f) >= currentMonthIso) continue;
            consumed.finesArrears += payFine(f);
        }
    }

    if (stage === 'current' || stage === 'all') {
        // ── Bucket 8: current month bills ─────────────────────────────────
        for (const b of bills) {
            if (credit <= 0) break;
            if (!isRegularBill(b) || b.status !== 'Pending') continue;
            if (billMonth(b) !== currentMonthIso) continue;
            consumed.currentBills += payBill(b);
        }

        // ── Bucket 9: current month late fee ──────────────────────────────
        for (const b of bills) {
            if (credit <= 0) break;
            if (!isLateFeeInvoice(b) || b.status !== 'Pending') continue;
            if (billMonth(b) !== currentMonthIso) continue;
            consumed.currentLateFee += payLateFee(b);
        }

        // ── Bucket 10: current month penalties & fines ────────────────────
        for (const f of fines) {
            if (credit <= 0) break;
            if (f.status !== 'Pending') continue;
            if (fineMonth(f) !== currentMonthIso) continue;
            consumed.currentFines += payFine(f);
        }
    }

    return {
        outstandingBills: bills,
        outstandingFines: fines,
        lateFeePaidByMonth: lateFeePaid,
        creditRemaining: credit,
        consumed,
    };
}