// @ts-nocheck
/**
 * Shared "money trio" hero cards used across every user-app portal
 * (except Landlord). Returns the three PortalShell card configs for:
 *   - Wallet Balance       (referral commissions paid in)
 *   - Investments Balance  (Renovation Fund net position)
 *   - My Chama Savings     (Task-Me Chama — coming soon)
 *
 * Drop the result into a PortalShell `cards={[...]}` array.
 */
import React from 'react';
import * as LucideIcons from 'lucide-react';
import { useUserPortalFinancials } from '../../hooks/useUserPortalFinancials';
import { usePortalGrowthActions } from './PortalGrowthModals';

const fmt = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;

export function useStandardWalletCards(growth?: ReturnType<typeof usePortalGrowthActions>) {
    const wallet = useUserPortalFinancials();
    const chamaClick  = growth?.actions?.[0]?.onClick;
    const investClick = growth?.actions?.[1]?.onClick;

    return [
        {
            label: 'Wallet Balance',
            value: fmt(wallet.walletBalance),
            sublabel: wallet.walletPending > 0
                ? `${fmt(wallet.walletPending)} pending payout`
                : 'Total commissions earned',
            iconNode: <LucideIcons.Wallet className="w-full h-full" strokeWidth={1.6} />,
            gradient: 'from-primary via-primary to-primary-dark',
            trend: wallet.walletThisMonth > 0 ? `+${Math.round(wallet.walletThisMonth).toLocaleString()} MTD` : 'KES 0 MTD',
            trendTone: (wallet.walletThisMonth > 0 ? 'up' : 'neutral') as 'up' | 'neutral',
        },
        {
            label: 'Investments Balance',
            value: fmt(wallet.investmentsBalance),
            sublabel: wallet.investmentsInterest > 0
                ? `${fmt(wallet.investmentsInterest)} interest earned`
                : 'Renovation Fund balance',
            iconNode: <LucideIcons.TrendingUp className="w-full h-full" strokeWidth={1.6} />,
            gradient: 'from-amber-600 via-orange-600 to-rose-700',
            onClick: investClick,
        },
        {
            label: 'My Chama Savings',
            value: fmt(wallet.chamaSavings),
            sublabel: 'Task-Me Chama · launching soon',
            iconNode: <LucideIcons.Users className="w-full h-full" strokeWidth={1.6} />,
            gradient: 'from-emerald-600 via-emerald-700 to-teal-800',
            onClick: chamaClick,
        },
    ];
}
