// @ts-nocheck
/**
 * User App Portal — Investors
 * Mobile-first hero shell (wallet cards + quick actions) layered on top of
 * the existing rich Investor Dashboard so we keep all the live data, charts,
 * KPIs and modals without duplicating logic.
 */
import React, { useMemo } from 'react';
import * as LucideIcons from 'lucide-react';

import { useData } from '../../context/DataContext';
import PortalShell from './PortalShell';
import { usePortalGrowthActions } from './PortalGrowthModals';
import { useStandardWalletCards } from './walletCards';
import InvestorDashboard from '../r-reits/InvestorDashboard';
import ReferTenantModal from './ReferTenantModal';
import { generateUserReferralCode } from '../../utils/referralCode';
import AdBanners from './AdBanners';

const isPartialRms = () => window.location.hash.includes('/partial-rms') || window.location.pathname.includes('/partial-rms');
const go = (hash: string) => {
    let clean = hash;
    if (clean.startsWith('#/partial-rms/')) {
        clean = clean.replace('#/partial-rms/', '');
    } else if (clean.startsWith('#/')) {
        clean = clean.replace('#/', '');
    } else if (clean.startsWith('#')) {
        clean = clean.substring(1);
    }
    const prefix = isPartialRms() ? '#/partial-rms' : '#';
    window.location.hash = `${prefix}/${clean}`;
};

const InvestorsPortal: React.FC = () => {
    const { investments, withdrawals, rfTransactions, funds, currentUser } = useData();
    const growth = usePortalGrowthActions();
    const [isReferOpen, setIsReferOpen] = React.useState(false);

    const totals = useMemo(() => {
        if (!currentUser) return { total: 0, active: 0, wallet: 0, interestPaid: 0, referralEarn: 0, portfolioValue: 0, pendingPayout: 0, openProjects: 0 };
        
        // Ensure we only see variables belonging to the logged in user
        const myInvestments = investments.filter(i => i.investorName === currentUser.name || i.userId === currentUser.id);
        const myWithdrawals = withdrawals.filter(w => w.investorName === currentUser.name || w.userId === currentUser.id);
        const myRfTx        = rfTransactions.filter(t => t.partyName === currentUser.name || t.agentId === currentUser.id);

        const total       = myInvestments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const active      = myInvestments.filter(i => i.status === 'Active').reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const wallet      = myInvestments.reduce((s, i) => s + (Number(i.accruedInterest) || 0), 0);
        const interestPaid = myWithdrawals
            .filter(w => w.type === 'Interest' && w.status === 'Paid')
            .reduce((s, w) => s + (Number(w.amount) || 0), 0);
        const referralEarn = myRfTx
            .filter(t => t.type === 'Referral Commission' && t.status === 'Completed')
            .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const portfolioValue = total + wallet;
        const pendingPayout = myInvestments
            .filter(i => i.status === 'Active')
            .reduce((s, i) => s + (Number(i.amount) || 0) * 0.025, 0); 
        const openProjects = funds.filter(f => f.status === 'Active' || f.status === 'Closing Soon').length;
        return { total, active, wallet, interestPaid, referralEarn, portfolioValue, pendingPayout, openProjects };
    }, [investments, withdrawals, rfTransactions, funds, currentUser]);

    const fmt = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

    const referralCode = useMemo(() => {
        if (!currentUser) return 'INVESTOR';
        return (currentUser as any).referralCode || generateUserReferralCode(currentUser.name || 'Investor', currentUser.id || '');
    }, [currentUser]);

    return (
        <div className="space-y-3 pb-16">
            <PortalShell
                cards={[
                    {
                        label: 'Portfolio Value',
                        value: fmt(totals.portfolioValue),
                        sublabel: `${totals.openProjects} open opportunities`,
                        iconNode: <LucideIcons.LineChart className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-emerald-600 via-emerald-700 to-emerald-800',
                        trend: totals.wallet > 0 ? 'Earning' : 'Idle',
                        trendTone: totals.wallet > 0 ? 'up' : 'neutral',
                        onClick: () => go('#/r-reits/portfolio-performance'),
                    },
                    {
                        label: 'Wallet Balance',
                        value: fmt(totals.wallet),
                        sublabel: 'Available to withdraw from 5th',
                        iconNode: <LucideIcons.Wallet className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-primary via-primary to-primary-dark',
                        trend: 'Accrued',
                        trendTone: 'up',
                    },
                    {
                        label: 'Invested Capital',
                        value: fmt(totals.active),
                        sublabel: `Total ever: ${fmt(totals.total)}`,
                        iconNode: <LucideIcons.PiggyBank className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-slate-900 via-slate-800 to-slate-700',
                    },
                    {
                        label: 'Next Payout',
                        value: fmt(totals.pendingPayout),
                        sublabel: 'Modelled on tier rates',
                        iconNode: <LucideIcons.Gift className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-amber-500 via-amber-600 to-amber-700',
                        trend: '+est.',
                        trendTone: 'up',
                    },
                ]}
                actions={[
                    { label: 'Refer & Earn', iconNode: <LucideIcons.Share2 className="w-full h-full" strokeWidth={1.8} />, onClick: () => go('#/user-app-portal/refer-earn') },
                    { label: 'Refer Tenant', iconNode: <LucideIcons.UserPlus className="w-full h-full" strokeWidth={1.8} />, onClick: () => setIsReferOpen(true) },
                    ...growth.actions,
                ]}
                metrics={[
                    { label: 'Active Capital', value: fmt(totals.active),       tone: 'text-blue-600' },
                    { label: 'Interest Paid',  value: fmt(totals.interestPaid), tone: 'text-emerald-600' },
                    { label: 'Referral Earn',  value: fmt(totals.referralEarn), tone: 'text-violet-600' },
                    { label: 'Holdings',       value: investments.filter(i => i.status === 'Active').length.toString(), tone: 'text-amber-600' },
                ]}
            />
            {growth.modals}

            {/* Full investor dashboard (charts, holdings, opportunities, modals) */}
            <div className="bg-white/60 backdrop-blur rounded-3xl p-1 sm:p-2 md:p-4 border border-gray-100 shadow-sm">
                <InvestorDashboard />
            </div>

            <AdBanners />

            {isReferOpen && (
                <ReferTenantModal
                    referrerId={String(currentUser?.id ?? '')}
                    referralCode={referralCode}
                    onClose={() => setIsReferOpen(false)}
                />
            )}
        </div>
    );
};

export default InvestorsPortal;
