
import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';

import { Affiliate } from '../../types';
import Icon from '../Icon';
import AdBanners from './AdBanners';
import ReferAnyoneModal, { ReferKind } from './ReferAnyoneModal';
import { useData } from '../../context/DataContext';
import { websiteLinks } from '../../utils/websiteLinks';
import { buildReferralEarningsModel, getReferralSubjectTotals } from '../../utils/referralEarnings';
import PortalShell from './PortalShell';
import { usePortalGrowthActions } from './PortalGrowthModals';
import { useStandardWalletCards } from './walletCards';
import ReferralFliers from './ReferralFliers';
import ReferralCalculator from './ReferralCalculator';

const StatCard: React.FC<{ title: string; value: string | number; color: string; icon: string; sublabel?: string }> = ({ title, value, color, icon, sublabel }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
                {sublabel && <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>}
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const PIPELINE_META: Record<ReferKind, { label: string; color: string; gradient: string; icon: React.ReactNode }> = {
    tenant:   { label: 'Tenants',   color: '#10b981', gradient: 'from-emerald-500 to-emerald-700', icon: <LucideIcons.UserCheck className="w-4 h-4" /> },
    landlord: { label: 'Landlords', color: '#6366f1', gradient: 'from-indigo-500 to-indigo-700',   icon: <LucideIcons.Building2 className="w-4 h-4" /> },
    investor: { label: 'Investors', color: '#f59e0b', gradient: 'from-amber-500 to-rose-600',      icon: <LucideIcons.TrendingUp className="w-4 h-4" /> },
};

// Affiliate tier ladder — drives the gamified progress card.
const TIERS = [
    { name: 'Bronze',   threshold: 0,      perks: 'Welcome bonus + share links' },
    { name: 'Silver',   threshold: 5,      perks: '+1% commission boost' },
    { name: 'Gold',     threshold: 15,     perks: '+2% boost · monthly bonus' },
    { name: 'Platinum', threshold: 30,     perks: '+3% · priority leads' },
    { name: 'Diamond',  threshold: 50,     perks: '+5% · custom marketing kit' },
];

const buildShareText = (kind: ReferKind, link: string) => {
    if (kind === 'tenant')   return `Looking for a place to rent? Use my link to find verified vacant units on TaskMe — fast onboarding, secure deposits: ${link}`;
    if (kind === 'landlord') return `Own a property? Let TaskMe manage it end-to-end — automated rent collection, vetted tenants, monthly payouts. Sign up via: ${link}`;
    return `Earn up to 30% APY on the TaskMe Renovation Fund — start with as little as KES 500. Join via my link: ${link}`;
};

import type { CommissionRule, Property } from '../../types';
import { getTodayIsoDate } from '../../utils/timezone';

const EarningFliers: React.FC<{
    commissionRules: CommissionRule[];
    properties: Property[];
    onRefer: (kind: ReferKind) => void;
}> = ({ commissionRules, properties, onRefer }) => {
    const allRents = properties.flatMap(p => p.units.map(u => u.rent || p.defaultMonthlyRent || 0)).filter(r => r > 0);
    const avgRent = allRents.length > 0 ? Math.round(allRents.reduce((s, r) => s + r, 0) / allRents.length) : 15000;
    const maxRent = allRents.length > 0 ? Math.max(...allRents) : 45000;

    const tenantRule = commissionRules.find(r => r.trigger === 'Tenancy Referral');
    const landlordRule = commissionRules.find(r => r.trigger === 'Property Management Referral');
    const investorRule = commissionRules.find(r => (r.trigger as string) === 'Investor Referral');

    const tenantEarn = useMemo(() => {
        if (tenantRule) {
            if (tenantRule.rateType === '%') return Math.round(avgRent * (tenantRule.rateValue / 100));
            return tenantRule.rateValue;
        }
        return 200;
    }, [tenantRule, avgRent]);

    const tenantEarnMax = useMemo(() => {
        if (tenantRule) {
            if (tenantRule.rateType === '%') return Math.round(maxRent * (tenantRule.rateValue / 100));
            return tenantRule.rateValue;
        }
        return 200;
    }, [tenantRule, maxRent]);

    const landlordEarn = useMemo(() => {
        if (landlordRule) {
            if (landlordRule.rateType === '%') return Math.round(landlordRule.rateValue);
            return landlordRule.rateValue;
        }
        return 2500;
    }, [landlordRule]);

    const landlordAnnual = useMemo(() => {
        const exampleRentRoll = 500000;
        const agencyFee = exampleRentRoll * 0.08;
        return Math.round(agencyFee * 0.10 * 12);
    }, []);

    const investorEarn = useMemo(() => {
        if (investorRule) {
            if (investorRule.rateType === '%') return Math.round(investorRule.rateValue);
            return investorRule.rateValue;
        }
        return 2500;
    }, [investorRule]);

    const investorOn100k = useMemo(() => {
        if (investorRule) {
            if (investorRule.rateType === '%') return Math.round(100000 * (investorRule.rateValue / 100));
            return investorRule.rateValue;
        }
        return Math.round(100000 * 0.025);
    }, [investorRule]);

    type Flier = {
        kind: ReferKind;
        badge: string;
        headline: string;
        amount: string;
        sub: string;
        cta: string;
        gradient: string;
        accent: string;
        icon: 'tenant' | 'landlord' | 'investor';
    };

    const fliers: Flier[] = [
        {
            kind: 'tenant',
            badge: 'PER TENANT',
            headline: 'Refer a Renter',
            amount: `KES ${tenantEarn.toLocaleString()}`,
            sub: tenantRule?.rateType === '%'
                ? `Up to KES ${tenantEarnMax.toLocaleString()} on premium units · One-time payout on lease signing`
                : `Flat commission · One-time payout on lease signing`,
            cta: 'Refer a Tenant',
            gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
            accent: '#10b981',
            icon: 'tenant',
        },
        {
            kind: 'landlord',
            badge: 'PER LANDLORD',
            headline: 'Refer a Property Owner',
            amount: `KES ${landlordEarn.toLocaleString()}`,
            sub: `One-time sign-up bonus + up to KES ${landlordAnnual.toLocaleString()} annually from their portfolio management`,
            cta: 'Refer a Landlord',
            gradient: 'from-indigo-500 via-violet-500 to-purple-500',
            accent: '#6366f1',
            icon: 'landlord',
        },
        {
            kind: 'investor',
            badge: 'PER INVESTOR',
            headline: 'Refer an Investor',
            amount: `KES ${investorEarn.toLocaleString()}`,
            sub: `One-time bonus when they join the Renovation Fund · Earn KES ${investorOn100k.toLocaleString()} on every KES 100,000 they invest`,
            cta: 'Refer an Investor',
            gradient: 'from-amber-400 via-orange-500 to-rose-500',
            accent: '#f59e0b',
            icon: 'investor',
        },
    ];

    const renderIcon = (key: Flier['icon'], size = 20) => {
        if (key === 'tenant') return <LucideIcons.UserCheck size={size} />;
        if (key === 'landlord') return <LucideIcons.Building2 size={size} />;
        return <LucideIcons.TrendingUp size={size} />;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {fliers.map((f) => (
                <div key={f.kind} className="relative overflow-hidden rounded-2xl shadow-lg group cursor-pointer" onClick={() => onRefer(f.kind)}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-95`} />
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        {renderIcon(f.icon, 32)}
                    </div>
                    <div className="relative p-6 text-white">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
                                {f.badge}
                            </span>
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                {renderIcon(f.icon, 20)}
                            </div>
                        </div>
                        <h3 className="text-lg font-bold mb-1">{f.headline}</h3>
                        <div className="flex items-baseline gap-1.5 mb-2">
                            <span className="text-3xl font-extrabold tracking-tight">{f.amount}</span>
                            <span className="text-xs font-medium opacity-80">/referral</span>
                        </div>
                        <p className="text-xs leading-relaxed opacity-90 mb-5 min-h-[40px]">{f.sub}</p>
                        <button className="w-full py-2.5 bg-white text-gray-900 text-xs font-bold rounded-xl hover:bg-white/90 transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                            <LucideIcons.Plus className="w-3.5 h-3.5" />
                            {f.cta}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

const AffiliatePortal: React.FC = () => {
    const {
        currentUser,
        leads,
        applications,
        landlordApplications,
        renovationInvestors,
        rfTransactions,
        tenants,
        landlords,
        commissionRules,
        properties,
        addNotification,
    } = useData();

    const myId = currentUser?.id || '';

    // --- Earnings & referral evidence ----------------------------------
    const referralEvidence = useMemo(() => {
        if (!myId) return [] as Array<{ name: string; source: string }>;
        return [
            ...(applications ?? []).filter((a: any) => a?.referrerId === myId)
                .map((a: any) => ({ name: a?.name || 'Referral', source: `Application — ${a?.name || 'Referral'}` })),
            ...(tenants ?? []).filter((t: any) => t?.referrerId === myId)
                .map((t: any) => ({ name: t?.name || 'Referral', source: `Tenancy Referral — ${t?.name || 'Referral'}` })),
            ...(landlordApplications ?? []).filter((a: any) => a?.referrerId === myId)
                .map((a: any) => ({ name: a?.name || 'Landlord Referral', source: `Property Management Referral — ${a?.name || 'Landlord Referral'}` })),
            ...(landlords ?? []).filter((l: any) => l?.referrerId === myId)
                .map((l: any) => ({ name: l?.name || 'Landlord Referral', source: `Property Management Referral — ${l?.name || 'Landlord Referral'}` })),
            ...(renovationInvestors ?? []).filter((i: any) => i?.referrerId === myId)
                .map((i: any) => ({ name: i?.name || 'Investor Referral', source: `Investor Referral — ${i?.name || 'Investor Referral'}` })),
        ];
    }, [myId, applications, tenants, landlordApplications, landlords, renovationInvestors]);

    const referralEarnings = useMemo(() => buildReferralEarningsModel({
        currentUser,
        profileCommissions: Array.isArray((currentUser as any)?.commissions) ? (currentUser as any).commissions : [],
        rfTransactions,
        referralEvidence,
    }), [currentUser, rfTransactions, referralEvidence]);

    // --- Per-pipeline breakdown ---------------------------------------
    const pipeline = useMemo(() => {
        const tenantPending  = (applications ?? []).filter((a: any) => a?.referrerId === myId && a?.status !== 'Approved').length;
        const tenantSigned   = (applications ?? []).filter((a: any) => a?.referrerId === myId && a?.status === 'Approved').length +
                               (tenants ?? []).filter((t: any) => t?.referrerId === myId && t?.status === 'Active').length;

        const landlordPending = (landlordApplications ?? []).filter((a: any) => a?.referrerId === myId && a?.status === 'Pending').length;
        const landlordSigned  = (landlordApplications ?? []).filter((a: any) => a?.referrerId === myId && a?.status === 'Approved').length +
                                (landlords ?? []).filter((l: any) => l?.referrerId === myId).length;

        const investorPending = (renovationInvestors ?? []).filter((i: any) => i?.referrerId === myId && i?.status === 'Pending').length;
        const investorSigned  = (renovationInvestors ?? []).filter((i: any) => i?.referrerId === myId && ['Active', 'Verified'].includes(i?.status)).length;

        const sumEarn = (subjectFilter: (s: string) => boolean) =>
            referralEarnings.entries
                .filter(e => subjectFilter((e.source || '').toLowerCase()))
                .reduce((s, e) => s + e.amount, 0);

        return {
            tenant:   { pending: tenantPending,   signed: tenantSigned,   earned: sumEarn(s => s.includes('tenancy') || s.includes('application')) },
            landlord: { pending: landlordPending, signed: landlordSigned, earned: sumEarn(s => s.includes('property management') || s.includes('landlord')) },
            investor: { pending: investorPending, signed: investorSigned, earned: sumEarn(s => s.includes('investor')) },
        };
    }, [applications, tenants, landlordApplications, landlords, renovationInvestors, referralEarnings, myId]);

    const totalSigned = pipeline.tenant.signed + pipeline.landlord.signed + pipeline.investor.signed;
    const totalPending = pipeline.tenant.pending + pipeline.landlord.pending + pipeline.investor.pending;

    // --- Tier progress ------------------------------------------------
    const tierInfo = useMemo(() => {
        const idx = TIERS.reduce((best, t, i) => totalSigned >= t.threshold ? i : best, 0);
        const current = TIERS[idx];
        const next = TIERS[idx + 1];
        const progress = next ? Math.min(100, Math.round(((totalSigned - current.threshold) / (next.threshold - current.threshold)) * 100)) : 100;
        const toGo = next ? Math.max(0, next.threshold - totalSigned) : 0;
        return { current, next, progress, toGo };
    }, [totalSigned]);

    // --- Affiliate object (display shape) -----------------------------
    const affiliate: Affiliate = useMemo(() => {
        if (!currentUser) {
            return { id: 'aff-unknown', name: 'User', referralCode: 'REF2025', stats: { leadsReferred: 0, leasesSigned: 0, totalEarned: 0 }, referrals: [] };
        }

        const referralCode = (currentUser as any).referralCode ||
            `${String(currentUser.name ?? 'USER').split(' ')[0].toUpperCase() || 'USER'}2025`;

        const leadsReferred = (leads ?? []).filter((l: any) => l?.referrerId === myId).length + totalPending;

        const referrals = [
            ...((applications ?? []).filter((a: any) => a?.referrerId === myId).map((a: any) => ({
                date: a?.submittedDate || getTodayIsoDate(),
                name: a?.name || 'Referral',
                kind: 'Tenant' as const,
                status: a?.status === 'Approved' ? 'Signed' : 'Pending',
                commission: getReferralSubjectTotals(referralEarnings, a?.name || 'Referral').earned,
            }))),
            ...((landlordApplications ?? []).filter((a: any) => a?.referrerId === myId).map((a: any) => ({
                date: a?.date || getTodayIsoDate(),
                name: a?.name || 'Landlord Referral',
                kind: 'Landlord' as const,
                status: a?.status === 'Approved' ? 'Signed' : 'Pending',
                commission: getReferralSubjectTotals(referralEarnings, a?.name || 'Landlord Referral').earned,
            }))),
            ...((renovationInvestors ?? []).filter((i: any) => i?.referrerId === myId).map((i: any) => ({
                date: i?.joinDate || getTodayIsoDate(),
                name: i?.name || 'Investor Referral',
                kind: 'Investor' as const,
                status: ['Active', 'Verified'].includes(i?.status) ? 'Signed' : 'Pending',
                commission: getReferralSubjectTotals(referralEarnings, i?.name || 'Investor Referral').earned,
            }))),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            id: myId,
            name: currentUser.name || 'User',
            referralCode,
            stats: { leadsReferred, leasesSigned: totalSigned, totalEarned: referralEarnings.totalEarned },
            referrals: referrals as any,
        };
    }, [currentUser, leads, applications, landlordApplications, renovationInvestors, referralEarnings, myId, totalPending, totalSigned]);

    const [copyText, setCopyText] = useState('Copy Link');
    const [referModal, setReferModal] = useState<null | ReferKind>(null);
    const [shareKind, setShareKind] = useState<ReferKind>('tenant');
    const [earningsOpen, setEarningsOpen] = useState(false);

    const [withdrawnIds, setWithdrawnIds] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(`referral_withdrawn_ids_${currentUser?.id}`);
            return saved ? JSON.parse(saved) : [];
        } catch (_) {
            return [];
        }
    });

    const triggerWithdraw = () => {
        const pendingEntries = referralEarnings.entries.filter(e => e.status === 'Pending' && !withdrawnIds.includes(e.id));
        if (pendingEntries.length === 0) return;

        const updatedWithdrawn = [...withdrawnIds, ...pendingEntries.map(e => e.id)];
        setWithdrawnIds(updatedWithdrawn);
        localStorage.setItem(`referral_withdrawn_ids_${currentUser?.id}`, JSON.stringify(updatedWithdrawn));

        // Create the notifications
        const notiRoles = ['Accountant', 'Assistant Admin', 'Super Admin'];
        notiRoles.forEach((role, i) => {
            addNotification({
                id: `noti-ref-withdraw-${role}-${Date.now()}-${i}`,
                title: "Referral Commission Withdrawal Requested",
                message: `Affiliate ${currentUser?.name || 'User'} has requested a withdrawal of KES ${Math.round(referralEarnings.nextPayout).toLocaleString()}`,
                date: new Date().toISOString(),
                read: false,
                type: 'Info',
                recipientRole: role,
            });
        });

        // Add user-side feedback
        alert(`Your withdrawal request of KES ${Math.round(referralEarnings.nextPayout).toLocaleString()} has been submitted successfully.`);
    };

    const link = websiteLinks.referral(affiliate.referralCode);

    const handleCopy = (textOverride?: string) => {
        navigator.clipboard.writeText(textOverride || link).then(() => {
            setCopyText('Copied!');
            setTimeout(() => setCopyText('Copy Link'), 2000);
        });
    };

    const handleShare = (platform: 'WhatsApp' | 'SMS' | 'Email' | 'Twitter') => {
        const text = buildShareText(shareKind, link);
        const encoded = encodeURIComponent(text);
        if (platform === 'WhatsApp') window.open(`https://wa.me/?text=${encoded}`, '_blank');
        else if (platform === 'SMS')    window.open(`sms:?body=${encoded}`);
        else if (platform === 'Email')  window.open(`mailto:?subject=${encodeURIComponent('Join me on TaskMe')}&body=${encoded}`);
        else if (platform === 'Twitter')window.open(`https://twitter.com/intent/tweet?text=${encoded}`, '_blank');
    };

    const growth = usePortalGrowthActions();
    const walletTrio = useStandardWalletCards(growth);

    // QR via public service — no extra deps.
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;

    return (
        <div className="space-y-3 pb-16">
            <PortalShell
                cards={[
                    ...walletTrio,
                    {
                        label: 'Referral Pipeline',
                        value: `${totalPending + totalSigned}`,
                        sublabel: `${totalSigned} signed · ${totalPending} pending`,
                        iconNode: <LucideIcons.Users className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-slate-900 via-slate-800 to-slate-700',
                    },
                ]}
                actions={[
                    { label: 'Copy Link',     iconNode: <LucideIcons.LinkIcon className="w-full h-full" strokeWidth={1.8} />,    onClick: () => handleCopy() },
                    { label: 'Refer Tenant',  iconNode: <LucideIcons.UserCheck className="w-full h-full" strokeWidth={1.8} />,  onClick: () => setReferModal('tenant') },
                    { label: 'Refer Landlord',iconNode: <LucideIcons.Building2 className="w-full h-full" strokeWidth={1.8} />,  onClick: () => setReferModal('landlord') },
                    { label: 'Refer Investor',iconNode: <LucideIcons.TrendingUp className="w-full h-full" strokeWidth={1.8} />, onClick: () => setReferModal('investor') },
                    { label: 'WhatsApp',      iconNode: <LucideIcons.MessageCircle className="w-full h-full" strokeWidth={1.8} />, onClick: () => handleShare('WhatsApp') },
                    { label: 'My Earnings',   iconNode: <LucideIcons.Coins className="w-full h-full" strokeWidth={1.8} />, onClick: () => setEarningsOpen(true) },
                    ...growth.actions,
                ]}
                metrics={[
                    { label: 'Code',     value: affiliate.referralCode, tone: 'text-primary' },
                    { label: 'Signed',   value: totalSigned.toString(), tone: 'text-emerald-600' },
                    { label: 'Pending',  value: totalPending.toString(), tone: 'text-amber-600' },
                    { label: 'Earned',   value: `KES ${Number(affiliate.stats?.totalEarned ?? 0).toLocaleString()}` },
                ]}
            />
            {growth.modals}

            {/* Pipeline breakdown — one card per referral kind */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(Object.keys(PIPELINE_META) as ReferKind[]).map(k => {
                    const meta = PIPELINE_META[k];
                    const p = pipeline[k];
                    return (
                        <div key={k} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className={`bg-gradient-to-r ${meta.gradient} text-white px-4 py-3 flex items-center justify-between`}>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">{meta.icon}</div>
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">{meta.label}</p>
                                        <p className="text-base font-bold leading-tight">{p.signed + p.pending} total</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setReferModal(k)}
                                    className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors"
                                >
                                    + Refer
                                </button>
                            </div>
                            <div className="p-4 grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Signed</p>
                                    <p className="text-lg font-bold text-emerald-600">{p.signed}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Pending</p>
                                    <p className="text-lg font-bold text-amber-600">{p.pending}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Earned</p>
                                    <p className="text-sm font-bold text-gray-800">KES {Math.round(p.earned).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Tier progress + headline stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <StatCard title="Total Earnings" value={`KES ${Number(affiliate.stats?.totalEarned ?? 0).toLocaleString()}`} color="#10b981" icon="wallet" sublabel={`Next payout: KES ${Math.round(referralEarnings.nextPayout).toLocaleString()}`} />
                <StatCard title="Successful Referrals" value={totalSigned} color="#3b82f6" icon="check" sublabel="All pipelines combined" />
                <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-5 rounded-xl text-white shadow-md">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Current Tier</p>
                            <p className="text-2xl font-extrabold">{tierInfo.current.name}</p>
                        </div>
                        <LucideIcons.Trophy className="w-8 h-8 opacity-90" />
                    </div>
                    {tierInfo.next ? (
                        <>
                            <div className="h-2 bg-white/20 rounded-full overflow-hidden mt-2">
                                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${tierInfo.progress}%` }} />
                            </div>
                            <p className="text-[11px] mt-1.5 opacity-90">
                                {tierInfo.toGo} more {tierInfo.toGo === 1 ? 'referral' : 'referrals'} to <span className="font-bold">{tierInfo.next.name}</span>
                            </p>
                        </>
                    ) : (
                        <p className="text-[11px] mt-2 opacity-90">Top tier reached. {tierInfo.current.perks}</p>
                    )}
                </div>
            </div>

            {/* Earning Fliers — What's in it for me? */}
            <ReferralFliers />
            <ReferralCalculator />


            {/* Share toolkit & Referral history */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Referral History</h3>
                        <span className="text-xs text-gray-400">Showing latest {Math.min(affiliate.referrals.length, 50)}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 uppercase text-xs font-bold text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Name</th>
                                    <th className="px-4 py-3 text-left">Type</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right">Commission</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(affiliate.referrals as any[]).slice(0, 50).map((ref, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ref.date}</td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{ref.name || ref.tenantName}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                                ref.kind === 'Landlord' ? 'bg-indigo-100 text-indigo-700' :
                                                ref.kind === 'Investor' ? 'bg-amber-100 text-amber-700' :
                                                'bg-emerald-100 text-emerald-700'
                                            }`}>{ref.kind || 'Tenant'}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                                                ref.status === 'Signed' ? 'bg-green-100 text-green-700' :
                                                ref.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>{ref.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">KES {Number(ref.commission ?? 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {affiliate.referrals.length === 0 && (
                                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">No referrals yet — pick a category above to start.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Share toolkit */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-base font-bold text-gray-800 mb-3">Share Toolkit</h3>
                        <p className="text-[11px] text-gray-500 font-bold uppercase mb-1.5">Audience</p>
                        <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-lg mb-3">
                            {(Object.keys(PIPELINE_META) as ReferKind[]).map(k => (
                                <button key={k} onClick={() => setShareKind(k)}
                                    className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold rounded transition-all ${
                                        shareKind === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                    }`}>
                                    {PIPELINE_META[k].icon}
                                    {PIPELINE_META[k].label.slice(0, -1)}
                                </button>
                            ))}
                        </div>
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-[11px] text-gray-700 leading-relaxed mb-3">
                            {buildShareText(shareKind, link)}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => handleCopy(buildShareText(shareKind, link))} className="px-3 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-1">
                                <LucideIcons.Copy className="w-3 h-3" /> {copyText}
                            </button>
                            <button onClick={() => handleShare('WhatsApp')} className="px-3 py-2 text-xs font-bold bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center justify-center gap-1">
                                <LucideIcons.MessageCircle className="w-3 h-3" /> WhatsApp
                            </button>
                            <button onClick={() => handleShare('SMS')} className="px-3 py-2 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
                                <LucideIcons.Smartphone className="w-3 h-3" /> SMS
                            </button>
                            <button onClick={() => handleShare('Email')} className="px-3 py-2 text-xs font-bold bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1">
                                <LucideIcons.Mail className="w-3 h-3" /> Email
                            </button>
                        </div>
                    </div>

                    {/* QR Card */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
                        <h3 className="text-base font-bold text-gray-800 mb-1">Scan to Join</h3>
                        <p className="text-[11px] text-gray-500 mb-3">Print it on flyers, posters, or business cards.</p>
                        <img src={qrUrl} alt="Referral QR code" className="mx-auto rounded-lg border border-gray-100" />
                        <p className="text-[10px] font-mono text-gray-500 mt-2 break-all">{link}</p>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-5 rounded-xl text-white shadow-md text-center">
                        <h4 className="font-bold text-base mb-1">Pro Tip</h4>
                        <p className="text-xs text-indigo-100">Investors and landlords pay the biggest commissions — share the right link to the right audience.</p>
                    </div>
                </div>
            </div>

            {/* Advert Banners */}
            <AdBanners section="listings" />

            {referModal && (
                <ReferAnyoneModal
                    referrerId={affiliate.id}
                    referralCode={affiliate.referralCode}
                    initialKind={referModal}
                    onClose={() => setReferModal(null)}
                />
            )}

            {earningsOpen && (
                <div
                    className="fixed inset-0 z-[1800] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setEarningsOpen(false)}
                >
                    <div
                        className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Hero */}
                        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white p-6 pt-8">
                            <button
                                onClick={() => setEarningsOpen(false)}
                                aria-label="Close"
                                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
                            >
                                <LucideIcons.X className="w-4 h-4" />
                            </button>
                            <div aria-hidden className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ring-1 bg-emerald-500/20 text-emerald-50 ring-emerald-200/40">
                                <LucideIcons.Coins className="w-3 h-3" />
                                Mini statement
                            </span>
                            <h2 className="mt-4 text-2xl font-extrabold tracking-tight drop-shadow-sm">My Earnings</h2>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                                <div className="bg-white/15 rounded-lg p-2.5 ring-1 ring-white/15">
                                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Total</p>
                                    <p className="text-sm font-bold leading-tight">KES {Math.round(referralEarnings.totalEarned).toLocaleString()}</p>
                                </div>
                                <div className="bg-white/15 rounded-lg p-2.5 ring-1 ring-white/15">
                                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Paid</p>
                                    <p className="text-sm font-bold leading-tight">KES {Math.round(referralEarnings.totalPaid).toLocaleString()}</p>
                                </div>
                                <div className="bg-white/15 rounded-lg p-2.5 ring-1 ring-white/15">
                                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Pending</p>
                                    <p className="text-sm font-bold leading-tight">KES {Math.round(referralEarnings.nextPayout).toLocaleString()}</p>
                                </div>
                            </div>

                            {referralEarnings.nextPayout > 0 && (
                                <button
                                    onClick={triggerWithdraw}
                                    disabled={referralEarnings.entries.filter(e => e.status === 'Pending').every(e => withdrawnIds.includes(e.id))}
                                    className="mt-4 w-full bg-white text-emerald-700 hover:bg-emerald-50 active:scale-[0.98] py-2 px-4 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
                                >
                                    <LucideIcons.ArrowUpRight className="w-3.5 h-3.5" />
                                    {referralEarnings.entries.filter(e => e.status === 'Pending').every(e => withdrawnIds.includes(e.id))
                                        ? 'Withdrawal Processing...'
                                        : `Withdraw KES ${Math.round(referralEarnings.nextPayout).toLocaleString()}`
                                    }
                                </button>
                            )}
                        </div>

                        {/* Body */}
                        <div className="p-5 max-h-[60vh] overflow-y-auto">
                            {referralEarnings.entries.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                                        <LucideIcons.Wallet className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <p className="font-bold text-gray-800">No earnings yet</p>
                                    <p className="text-xs text-gray-500 mt-1">Share your referral link to start earning commissions.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-2">Date</th>
                                            <th className="text-left py-2">Source</th>
                                            <th className="text-center py-2">Status</th>
                                            <th className="text-right py-2">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {referralEarnings.entries.slice(0, 50).map(e => (
                                            <tr key={e.id}>
                                                <td className="py-2.5 text-xs text-gray-600 whitespace-nowrap">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                                                <td className="py-2.5 text-xs font-medium text-gray-800 truncate max-w-[180px]" title={e.source}>{e.source}</td>
                                                <td className="py-2.5 text-center">
                                                    {e.status === 'Completed' ? (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">Paid</span>
                                                    ) : withdrawnIds.includes(e.id) ? (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700 font-medium">Your payment is being processed</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">Pending</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 text-right text-sm font-bold text-emerald-600 whitespace-nowrap">KES {Math.round(e.amount).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AffiliatePortal;
