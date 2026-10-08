import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { buildReferralEarningsModel } from '../utils/referralEarnings';
import { getCurrentMonthIso } from '../utils/timezone';

/**
 * Aggregates a user's contextual money cards:
 *  - walletBalance     = referral commissions paid out + any commission ledger on profile, minus future withdrawals (TODO)
 *  - investmentsBalance = net inflows the user has into the Renovation Fund (Investments - Withdrawals + Interest)
 *  - chamaSavings      = placeholder until the Task-Me Chama product ships
 *
 * Everything is computed from live data already in DataContext — no mocks.
 */
export function useUserPortalFinancials() {
    const { currentUser, rfTransactions, renovationInvestors, tenants, applications, leads } = useData();

    return useMemo(() => {
        if (!currentUser) {
            return {
                walletBalance: 0,
                walletEarned: 0,
                walletPaid: 0,
                walletPending: 0,
                walletThisMonth: 0,
                investmentsBalance: 0,
                investmentsInvested: 0,
                investmentsInterest: 0,
                chamaSavings: 0,
            };
        }

        // -- WALLET (referral earnings) -------------------------------------
        const referralEvidence = [
            ...tenants.filter(t => t.referrerId === currentUser.id).map(t => ({ name: t.name })),
            ...applications.filter(a => a.referrerId === currentUser.id).map(a => ({ name: a.name })),
            ...leads.filter(l => l.referrerId === currentUser.id).map(l => ({ name: l.tenantName })),
        ];

        const model = buildReferralEarningsModel({
            currentUser,
            profileCommissions: Array.isArray((currentUser as any).commissions) ? (currentUser as any).commissions : [],
            rfTransactions,
            referralEvidence,
        });

        const thisMonthPrefix = getCurrentMonthIso();
        const walletThisMonth = model.entries
            .filter(e => String(e.date || '').startsWith(thisMonthPrefix))
            .reduce((s, e) => s + e.amount, 0);

        // -- INVESTMENTS (Renovation Fund) ----------------------------------
        const investor = renovationInvestors.find(i =>
            i.email?.toLowerCase() === currentUser.email?.toLowerCase()
            || (i.phone && currentUser.phone && i.phone.replace(/\D/g, '').slice(-9) === currentUser.phone.replace(/\D/g, '').slice(-9))
            || i.name?.toLowerCase().trim() === currentUser.name?.toLowerCase().trim()
        );

        let invested = 0;
        let withdrawn = 0;
        let interest = 0;
        if (investor) {
            const myTx = rfTransactions.filter(t => t.partyName?.toLowerCase().trim() === investor.name.toLowerCase().trim() && t.status === 'Completed');
            invested  = myTx.filter(t => t.type === 'Investment').reduce((s, t) => s + Number(t.amount || 0), 0);
            withdrawn = myTx.filter(t => t.type === 'Withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0);
            interest  = myTx.filter(t => t.type === 'Interest Payout').reduce((s, t) => s + Number(t.amount || 0), 0);
        }

        return {
            walletBalance: model.totalEarned,           // money that the user has earned in commissions
            walletEarned: model.totalEarned,
            walletPaid: model.totalPaid,
            walletPending: model.nextPayout,
            walletThisMonth,
            investmentsBalance: Math.max(0, invested - withdrawn),
            investmentsInvested: invested,
            investmentsInterest: interest,
            chamaSavings: 0,                            // Task-Me Chama is launching soon
        };
    }, [currentUser, rfTransactions, renovationInvestors, tenants, applications, leads]);
}
