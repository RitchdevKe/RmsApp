import type { Distribution, RFTransaction } from '../types';

/** Map completed interest payouts from the RF ledger into distribution rows for reports/UI. */
export function interestPayoutsAsDistributions(rfTransactions: RFTransaction[]): Distribution[] {
    return rfTransactions
        .filter((tx) => tx.type === 'Interest Payout')
        .map((tx) => ({
            id: tx.id,
            date: tx.date,
            amount: tx.amount,
            investorName: tx.partyName,
            method: /bank/i.test(String(tx.description || '')) ? 'Bank' : 'M-Pesa',
            status: tx.status === 'Completed' ? ('Paid' as const) : ('Pending' as const),
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
