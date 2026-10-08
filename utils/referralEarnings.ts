import type { RFTransaction } from '../types';

type CurrentUserLike = {
    id?: string;
    name?: string;
    referralCode?: string;
} | null | undefined;

type ProfileCommission = {
    date: string;
    amount: number;
    source: string;
};

type ReferralEvidence = {
    name?: string | null;
    source?: string | null;
};

type AwardCandidate = {
    id: string;
    date: string;
    amount: number;
    source: string;
    subjectKey: string;
    origin: 'profile' | 'rf';
};

type PayoutCandidate = {
    id: string;
    date: string;
    amount: number;
    source: string;
    subjectKey: string;
};

export type ReferralEarningsEntry = {
    id: string;
    date: string;
    amount: number;
    source: string;
    subjectKey: string;
    status: 'Completed' | 'Pending';
    origin: 'profile' | 'rf';
};

export type ReferralEarningsModel = {
    totalEarned: number;
    totalPaid: number;
    nextPayout: number;
    entries: ReferralEarningsEntry[];
    subjectTotals: Record<string, { earned: number; paid: number; pending: number }>;
};

const normalizeText = (value: string | null | undefined): string => {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
};

const toAmount = (value: unknown): number => {
    return Number(value || 0) || 0;
};

const normalizeDate = (value: string | null | undefined): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toISOString().slice(0, 10);
};

const buildSubjectKey = (value: string | null | undefined): string => {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    const stripped = normalized
        .replace(/^referral commission\s*[—-]\s*/i, '')
        .replace(/^tenancy referral\s*[—-]\s*/i, '')
        .replace(/^property management referral\s*[—-]\s*/i, '')
        .replace(/^investor referral\s*[—-]\s*/i, '')
        .trim();
    const withoutTrailingContext = stripped.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (withoutTrailingContext && withoutTrailingContext !== normalized) return withoutTrailingContext;
    const parts = normalized.split(/\s+[—-]\s+/).map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : normalized;
};

const buildMatchKey = (subjectKey: string, amount: number): string => {
    return `${subjectKey || 'unknown'}|${Math.round(toAmount(amount) * 100)}`;
};

const buildEvidenceKeys = (
    profileCommissions: ProfileCommission[],
    referralEvidence: ReferralEvidence[],
): Set<string> => {
    const keys = new Set<string>();
    profileCommissions.forEach(commission => {
        const subjectKey = buildSubjectKey(commission.source);
        if (subjectKey) keys.add(subjectKey);
    });
    referralEvidence.forEach(item => {
        const nameKey = buildSubjectKey(item.name);
        const sourceKey = buildSubjectKey(item.source);
        if (nameKey) keys.add(nameKey);
        if (sourceKey) keys.add(sourceKey);
    });
    return keys;
};

const isAttributedTransaction = (
    transaction: RFTransaction,
    normalizedUserName: string,
    evidenceKeys: Set<string>,
): boolean => {
    if (transaction.type !== 'Referral Commission') return false;
    const partyName = normalizeText(transaction.partyName);
    if (normalizedUserName && partyName === normalizedUserName) return true;
    if (!partyName || partyName === 'referrer') {
        const subjectKey = buildSubjectKey(transaction.description || transaction.reference || transaction.partyName);
        return !!subjectKey && evidenceKeys.has(subjectKey);
    }
    return false;
};

export function buildReferralEarningsModel(opts: {
    currentUser: CurrentUserLike;
    profileCommissions?: Array<{ date: string; amount: number; source: string }>;
    rfTransactions?: RFTransaction[];
    referralEvidence?: ReferralEvidence[];
}): ReferralEarningsModel {
    const profileCommissions = (opts.profileCommissions || []).map(commission => ({
        date: normalizeDate(commission.date),
        amount: toAmount(commission.amount),
        source: String(commission.source || '').trim(),
    })).filter(commission => commission.amount > 0);

    const evidenceKeys = buildEvidenceKeys(profileCommissions, opts.referralEvidence || []);
    const normalizedUserName = normalizeText(opts.currentUser?.name);
    const attributedTransactions = (opts.rfTransactions || []).filter(transaction => isAttributedTransaction(transaction, normalizedUserName, evidenceKeys));

    const awards: AwardCandidate[] = [
        ...profileCommissions.map((commission, index) => ({
            id: `profile-${index}-${commission.date}-${commission.amount}`,
            date: commission.date,
            amount: commission.amount,
            source: commission.source,
            subjectKey: buildSubjectKey(commission.source),
            origin: 'profile' as const,
        })),
        ...attributedTransactions
            .filter(transaction => transaction.status === 'Pending')
            .map(transaction => ({
                id: `rf-pending-${transaction.id}`,
                date: normalizeDate(transaction.date),
                amount: toAmount(transaction.amount),
                source: String(transaction.description || transaction.reference || transaction.partyName || 'Referral Commission').trim(),
                subjectKey: buildSubjectKey(transaction.description || transaction.reference || transaction.partyName),
                origin: 'rf' as const,
            })),
    ].filter(award => award.amount > 0);

    const payouts: PayoutCandidate[] = attributedTransactions
        .filter(transaction => transaction.status === 'Completed')
        .map(transaction => ({
            id: `rf-completed-${transaction.id}`,
            date: normalizeDate(transaction.date),
            amount: toAmount(transaction.amount),
            source: String(transaction.description || transaction.reference || transaction.partyName || 'Referral Commission').trim(),
            subjectKey: buildSubjectKey(transaction.description || transaction.reference || transaction.partyName),
        }))
        .filter(payout => payout.amount > 0);

    const payoutQueues = new Map<string, PayoutCandidate[]>();
    payouts.forEach(payout => {
        const key = buildMatchKey(payout.subjectKey, payout.amount);
        const queue = payoutQueues.get(key) || [];
        queue.push(payout);
        queue.sort((left, right) => String(left.date).localeCompare(String(right.date)));
        payoutQueues.set(key, queue);
    });

    const entries: ReferralEarningsEntry[] = [];
    const sortedAwards = [...awards].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    sortedAwards.forEach(award => {
        const key = buildMatchKey(award.subjectKey, award.amount);
        const queue = payoutQueues.get(key) || [];
        let matchedIndex = -1;
        for (let index = 0; index < queue.length; index += 1) {
            if (!award.date || !queue[index].date || queue[index].date >= award.date) {
                matchedIndex = index;
                break;
            }
        }
        if (matchedIndex < 0 && queue.length > 0) matchedIndex = 0;
        if (matchedIndex >= 0) {
            queue.splice(matchedIndex, 1);
            payoutQueues.set(key, queue);
        }
        entries.push({
            id: award.id,
            date: award.date,
            amount: award.amount,
            source: award.source,
            subjectKey: award.subjectKey,
            status: matchedIndex >= 0 ? 'Completed' : 'Pending',
            origin: award.origin,
        });
    });

    payoutQueues.forEach(queue => {
        queue.forEach(payout => {
            entries.push({
                id: payout.id,
                date: payout.date,
                amount: payout.amount,
                source: payout.source,
                subjectKey: payout.subjectKey,
                status: 'Completed',
                origin: 'rf',
            });
        });
    });

    const subjectTotals = entries.reduce<Record<string, { earned: number; paid: number; pending: number }>>((acc, entry) => {
        const key = entry.subjectKey || buildSubjectKey(entry.source) || entry.id;
        const bucket = acc[key] || { earned: 0, paid: 0, pending: 0 };
        bucket.earned += entry.amount;
        if (entry.status === 'Completed') {
            bucket.paid += entry.amount;
        } else {
            bucket.pending += entry.amount;
        }
        acc[key] = bucket;
        return acc;
    }, {});

    const totalEarned = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const totalPaid = entries.reduce((sum, entry) => sum + (entry.status === 'Completed' ? entry.amount : 0), 0);
    const nextPayout = entries.reduce((sum, entry) => sum + (entry.status === 'Pending' ? entry.amount : 0), 0);

    return {
        totalEarned,
        totalPaid,
        nextPayout,
        entries: entries.sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime()),
        subjectTotals,
    };
}

export function getReferralSubjectTotals(model: ReferralEarningsModel, subject: string): { earned: number; paid: number; pending: number } {
    return model.subjectTotals[buildSubjectKey(subject)] || { earned: 0, paid: 0, pending: 0 };
}
