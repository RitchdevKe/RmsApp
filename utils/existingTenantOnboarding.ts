import { getTodayIsoDate, getCurrentMonthIso } from './timezone';
import type {
    BillItem,
    ExistingTenantFineLedgerItem,
    ExistingTenantRentLedgerItem,
    ExistingTenantSetup,
    FineItem,
    TenantProfile,
} from '../types';

function clampDueDay(day: number | undefined): number {
    const value = Number(day ?? 1);
    if (!Number.isFinite(value)) return 1;
    return Math.min(28, Math.max(1, Math.round(value)));
}

function normalizeNumber(value: unknown): number {
    return Math.max(0, Number(value || 0) || 0);
}

function normalizePeriod(period: string): string {
    const raw = String(period || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return '';
    return raw;
}

function normalizeDate(value: string, fallbackDay = 1): string {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-${String(fallbackDay).padStart(2, '0')}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return `${getCurrentMonthIso()}-${String(fallbackDay).padStart(2, '0')}`;
    }
    return parsed.toISOString().slice(0, 10);
}

function formatPaymentAmount(amount: number): string {
    return `KES ${Math.round(amount * 100) / 100}`;
}

function buildPeriodDate(period: string, dueDay: number): string {
    return `${period}-${String(clampDueDay(dueDay)).padStart(2, '0')}`;
}

function buildCurrentDueDate(dueDay: number): string {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    return `${currentMonth}-${String(clampDueDay(dueDay)).padStart(2, '0')}`;
}

function parsePaymentAmount(raw: string | number | null | undefined): number {
    if (raw == null) return 0;
    if (typeof raw === 'number') return raw;
    return parseFloat(String(raw).replace(/[^0-9.]/g, '')) || 0;
}

function sortRentLedger(rows: ExistingTenantRentLedgerItem[]): ExistingTenantRentLedgerItem[] {
    return [...rows].sort((left, right) => String(left.period || '').localeCompare(String(right.period || '')));
}

function sanitizeRentLedger(rows: ExistingTenantRentLedgerItem[]): ExistingTenantRentLedgerItem[] {
    return sortRentLedger(rows)
        .map(row => {
            const rawPaidDate = String((row as any).paidDate || '').trim();
            const paidDate = /^\d{4}-\d{2}-\d{2}$/.test(rawPaidDate) ? rawPaidDate : undefined;
            return {
                period: normalizePeriod(row.period),
                expected: normalizeNumber(row.expected),
                paid: normalizeNumber(row.paid),
                ...(paidDate ? { paidDate } : {}),
            };
        })
        .filter(row => !!row.period)
        .map(row => ({
            ...row,
            paid: Math.min(row.expected, row.paid),
        }));
}

function sanitizeFineLedger(rows: ExistingTenantFineLedgerItem[]): ExistingTenantFineLedgerItem[] {
    return [...rows]
        .map(row => ({
            date: normalizeDate(row.date),
            type: String(row.type || '').trim() || 'Fine',
            amount: normalizeNumber(row.amount),
            status: row.status === 'Paid' ? 'Paid' : 'Pending' as const,
        }));
}

export function normalizeExistingTenantSetup(setup?: ExistingTenantSetup): ExistingTenantSetup {
    const rawDepositDate = String((setup as any)?.depositPaidDate || '').trim();
    const depositPaidDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDepositDate) ? rawDepositDate : undefined;
    return {
        occupancyStartDate: normalizeDate(String(setup?.occupancyStartDate || getTodayIsoDate())),
        depositAlreadyPaid: normalizeNumber(setup?.depositAlreadyPaid),
        ...(depositPaidDate ? { depositPaidDate } : {}),
        rentLedger: sanitizeRentLedger(setup?.rentLedger || []),
        fineLedger: sanitizeFineLedger(setup?.fineLedger || []),
    };
}

export function isHistoricalPeriod(period: string, today = new Date()): boolean {
    const normalized = normalizePeriod(period);
    if (!normalized) return false;
    return normalized < today.toISOString().slice(0, 7);
}

export function buildExistingTenantSeedData(opts: {
    tenantId: string;
    rentAmount: number;
    rentDueDate?: number;
    setup?: ExistingTenantSetup;
}): Pick<TenantProfile, 'paymentHistory' | 'outstandingBills' | 'outstandingFines' | 'depositPaid' | 'activationDate' | 'onboardingDate' | 'rentStartDate' | 'nextDueDate' | 'tenantOnboardingType' | 'existingTenantSetup'> {
    const dueDay = clampDueDay(opts.rentDueDate);
    const normalizedSetup = normalizeExistingTenantSetup(opts.setup);
    const paymentHistory: TenantProfile['paymentHistory'] = [];
    const outstandingBills: BillItem[] = [];
    const outstandingFines: FineItem[] = [];

    normalizedSetup.rentLedger.forEach((row, index) => {
        const expected = row.expected > 0 ? row.expected : normalizeNumber(opts.rentAmount);
        const paid = Math.min(expected, normalizeNumber(row.paid));
        const periodEntryDate = buildPeriodDate(row.period, dueDay);
        const paymentEntryDate = row.paidDate && /^\d{4}-\d{2}-\d{2}$/.test(row.paidDate)
            ? row.paidDate
            : periodEntryDate;

        if (paid > 0) {
            paymentHistory.push({
                date: paymentEntryDate,
                amount: formatPaymentAmount(paid),
                status: 'Paid',
                method: 'Backdated Rent Payment',
                reference: `BACKFILL-${row.period}-${index + 1}`,
            });
        }

        // NOTE: Unpaid balances are intentionally NOT pushed to outstandingBills
        // as "Rent Arrears". Prior-month rent arrears are computed dynamically
        // by computeTenantArrears (utils/tenantArrears.ts) from rentStartDate +
        // paymentHistory. Storing them as bills here caused double-counting in
        // Total Invoiced / Balance Overview (the same arrears appeared both in
        // pendingBills and in the computed arrearsBreakdown).
    });


    normalizedSetup.fineLedger.forEach((row, index) => {
        if (row.amount <= 0) return;
        outstandingFines.push({
            id: `fine-backfill-${opts.tenantId}-${index + 1}`,
            type: row.type,
            amount: row.amount,
            date: normalizeDate(row.date, dueDay),
            status: row.status,
        });
    });

    // IMPORTANT: Deposit is NOT auto-backfilled at registration. Even when the
    // admin enters a "deposit already paid" amount on the existing-tenant form,
    // we no longer fabricate a DEPOSIT-BACKFILL- payment-history entry — that
    // broke the double-entry rule (paid status with no traceable payment) and
    // also caused deposits to appear as fully settled on the tenant card before
    // a real payment was recorded. Deposits must be paid via Record Manual Pay
    // or M-Pesa C2B/STK going forward.

    paymentHistory.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    outstandingBills.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    outstandingFines.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

    return {
        paymentHistory,
        outstandingBills,
        outstandingFines,
        depositPaid: 0,
        activationDate: normalizedSetup.occupancyStartDate,
        onboardingDate: normalizedSetup.occupancyStartDate,
        rentStartDate: normalizedSetup.occupancyStartDate,
        nextDueDate: buildCurrentDueDate(dueDay),
        tenantOnboardingType: 'Existing',
        existingTenantSetup: normalizedSetup,
    };
}

export function ensureExistingTenantBackdatedPayments(tenant: TenantProfile): TenantProfile {
    const originalHistory = tenant.paymentHistory || [];
    const hasBackfillReference = originalHistory.some(payment => {
        const ref = String(payment?.reference || '');
        return ref.startsWith('BACKFILL-') || ref.startsWith('DEPOSIT-BACKFILL-');
    });
    const isExistingTenant = tenant.tenantOnboardingType === 'Existing' || !!tenant.existingTenantSetup || hasBackfillReference;
    if (!isExistingTenant) return tenant;

    let changed = false;

    // Strip legacy DEPOSIT-BACKFILL- entries (no longer generated). Keep
    // BACKFILL- rent entries which are still legitimate historical-rent
    // ledger records. After stripping, if the tenant has no real (non-
    // backfill) payments left, reset depositPaid to 0 so the deposit shows
    // as unpaid until a traceable C2B/STK/manual payment is recorded.
    const strippedHistory: TenantProfile['paymentHistory'] = [];
    let depositBackfillRemoved = false;
    originalHistory.forEach(payment => {
        const ref = String(payment?.reference || '');
        if (ref.startsWith('DEPOSIT-BACKFILL-')) {
            depositBackfillRemoved = true;
            changed = true;
            return; // drop
        }
        if (ref.startsWith('BACKFILL-') && payment.method !== 'Backdated Rent Payment') {
            changed = true;
            strippedHistory.push({ ...payment, method: 'Backdated Rent Payment' });
            return;
        }
        strippedHistory.push(payment);
    });

    const refs = new Set(strippedHistory.map(payment => String(payment?.reference || '')).filter(Boolean));
    const dueDay = clampDueDay(tenant.rentDueDate);

    const setup = tenant.existingTenantSetup ? normalizeExistingTenantSetup(tenant.existingTenantSetup) : undefined;
    setup?.rentLedger.forEach((row, index) => {
        const expected = row.expected > 0 ? row.expected : normalizeNumber(tenant.rentAmount);
        const paid = Math.min(expected, normalizeNumber(row.paid));
        if (paid <= 0) return;
        const reference = `BACKFILL-${row.period}-${index + 1}`;
        if (refs.has(reference)) return;
        strippedHistory.push({
            date: row.paidDate || buildPeriodDate(row.period, dueDay),
            amount: formatPaymentAmount(paid),
            status: 'Paid',
            method: 'Backdated Rent Payment',
            reference,
        });
        refs.add(reference);
        changed = true;
    });

    // Determine if any "real" (non-backfill) payment exists. Real payments
    // are anything that does NOT carry a BACKFILL-/DEPOSIT-BACKFILL- prefix.
    const hasRealPayment = strippedHistory.some(payment => {
        const ref = String(payment?.reference || '');
        return !ref.startsWith('BACKFILL-') && !ref.startsWith('DEPOSIT-BACKFILL-');
    });

    let depositPaidOverride: number | undefined;
    if (depositBackfillRemoved && !hasRealPayment && Number(tenant.depositPaid || 0) > 0) {
        depositPaidOverride = 0;
        changed = true;
    }

    if (!changed) return tenant;
    return {
        ...tenant,
        ...(depositPaidOverride !== undefined ? { depositPaid: depositPaidOverride } : {}),
        paymentHistory: strippedHistory.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    };
}

