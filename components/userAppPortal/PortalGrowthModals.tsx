import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import type { PortalQuickAction } from './PortalShell';

/* ------------------------------------------------------------------ */
/*  Coming-Soon "Hype" Modal                                          */
/* ------------------------------------------------------------------ */

interface HypeModalProps {
    open: boolean;
    onClose: () => void;
    accent: 'chama' | 'invest' | 'gig';
    title: string;
    tagline: string;
    description: string;
    ctaLabel: string;
    bullets: { icon: React.ReactNode; label: string }[];
}

const ACCENTS: Record<HypeModalProps['accent'], { gradient: string; icon: React.ReactNode; chip: string }> = {
    chama: {
        gradient: 'from-emerald-500 via-emerald-600 to-teal-700',
        icon: <LucideIcons.Users className="w-12 h-12" strokeWidth={1.6} />,
        chip: 'bg-emerald-500/20 text-emerald-50 ring-emerald-200/40',
    },
    invest: {
        gradient: 'from-amber-500 via-orange-600 to-rose-700',
        icon: <LucideIcons.TrendingUp className="w-12 h-12" strokeWidth={1.6} />,
        chip: 'bg-amber-500/20 text-amber-50 ring-amber-200/40',
    },
    gig: {
        gradient: 'from-purple-500 via-indigo-600 to-blue-700',
        icon: <LucideIcons.Briefcase className="w-12 h-12" strokeWidth={1.6} />,
        chip: 'bg-purple-500/20 text-purple-50 ring-purple-200/40',
    },
};

const HypeModal: React.FC<HypeModalProps & { onCta?: () => void }> = ({ open, onClose, accent, title, tagline, description, ctaLabel, bullets, onCta }) => {
    const [showSoon, setShowSoon] = useState(false);
    const a = ACCENTS[accent];
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[1800] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => { setShowSoon(false); onClose(); }}
        >
            <div
                className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10"
                onClick={e => e.stopPropagation()}
            >
                {/* Hero */}
                <div className={`relative bg-gradient-to-br ${a.gradient} text-white p-6 pt-8`}>
                    <button
                        onClick={() => { setShowSoon(false); onClose(); }}
                        aria-label="Close"
                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
                    >
                        <LucideIcons.X className="w-4 h-4" />
                    </button>

                    {/* Decorative dots */}
                    <div aria-hidden className="absolute -top-6 -right-6 opacity-25 pointer-events-none">
                        <div className="grid grid-cols-6 gap-1.5">
                            {Array.from({ length: 30 }).map((_, k) => (
                                <div key={k} className="w-1.5 h-1.5 rounded-full bg-white" />
                            ))}
                        </div>
                    </div>
                    <div aria-hidden className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />

                    <div className="relative">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ring-1 ${a.chip}`}>
                            <LucideIcons.Sparkles className="w-3 h-3" />
                            {tagline}
                        </span>
                        <div className="mt-4 mb-3 w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/25 shadow-inner">
                            {a.icon}
                        </div>
                        <h2 className="text-2xl font-extrabold tracking-tight drop-shadow-sm">{title}</h2>
                    </div>
                </div>

                {/* Body */}
                <div className="bg-white p-6 space-y-5">
                    <p className="text-sm text-gray-700 leading-relaxed">{description}</p>

                    <ul className="space-y-2.5">
                        {bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                                <span className="shrink-0 w-7 h-7 rounded-lg bg-gray-50 ring-1 ring-gray-100 flex items-center justify-center text-primary">
                                    {b.icon}
                                </span>
                                <span className="pt-0.5 font-medium">{b.label}</span>
                            </li>
                        ))}
                    </ul>

                    {showSoon ? (
                        <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 p-4 text-center animate-fade-in">
                            <div className="mx-auto w-12 h-12 rounded-full bg-white shadow flex items-center justify-center mb-2">
                                <LucideIcons.Rocket className="w-6 h-6 text-primary" />
                            </div>
                            <p className="font-bold text-gray-800">Coming soon!</p>
                            <p className="text-xs text-gray-500 mt-1">
                                We're putting the final touches on this. You'll be the first to know when it launches.
                            </p>
                        </div>
                    ) : (
                        <button
                            onClick={() => { if (onCta) { onCta(); onClose(); } else { setShowSoon(true); } }}
                            className={`group w-full relative overflow-hidden rounded-2xl py-3.5 px-5 text-white font-bold text-sm
                                       bg-gradient-to-r ${a.gradient}
                                       shadow-lg hover:shadow-xl active:scale-[0.99] transition-all`}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {ctaLabel}
                                <LucideIcons.ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                            <span aria-hidden className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Hook: inject Chama + Invest&Earn into every portal                */
/* ------------------------------------------------------------------ */

export function usePortalGrowthActions(): { actions: PortalQuickAction[]; modals: React.ReactNode } {
    const [open, setOpen] = useState<null | 'chama' | 'invest' | 'gig'>(null);

    const actions = useMemo<PortalQuickAction[]>(() => [
        {
            label: 'Task-Me Chama',
            iconNode: <LucideIcons.Users className="w-full h-full" strokeWidth={1.8} />,
            onClick: () => setOpen('chama'),
            tone: 'bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-700 ring-emerald-200',
        },
        {
            label: 'Invest & Earn',
            iconNode: <LucideIcons.TrendingUp className="w-full h-full" strokeWidth={1.8} />,
            onClick: () => setOpen('invest'),
            tone: 'bg-gradient-to-br from-amber-50 to-orange-100 text-orange-700 ring-orange-200',
        },
        {
            label: 'Refer Gigs',
            iconNode: <LucideIcons.Briefcase className="w-full h-full" strokeWidth={1.8} />,
            onClick: () => setOpen('gig'),
            tone: 'bg-gradient-to-br from-purple-50 to-indigo-100 text-indigo-700 ring-indigo-200',
        },
    ], []);

    const modals = (
        <>
            <HypeModal
                open={open === 'chama'}
                onClose={() => setOpen(null)}
                accent="chama"
                tagline="Run your chama like a bank"
                title="Join Task-Me Chama"
                description="Don't run your chamas manually. Join the most advanced Chama management platform and run your chama like a bank — automated contributions, transparent books, instant payouts."
                ctaLabel="Join Now"
                bullets={[
                    { icon: <LucideIcons.Wallet className="w-4 h-4" />, label: 'Automated M-Pesa contributions & withdrawals' },
                    { icon: <LucideIcons.ShieldCheck className="w-4 h-4" />, label: 'Bank-grade transparent ledger every member can audit' },
                    { icon: <LucideIcons.PieChart className="w-4 h-4" />, label: 'Real-time savings, loans & investment dashboards' },
                ]}
            />
            <HypeModal
                open={open === 'invest'}
                onClose={() => setOpen(null)}
                accent="invest"
                tagline="Up to 30% APY"
                title="Invest & Earn"
                description="Earn up to 30% interest per year by investing in the Task-Me Renovation Fund. Withdraw your interest monthly. Invest from as little as KES 500 and watch your money build real estate."
                ctaLabel="Invest Now"
                bullets={[
                    { icon: <LucideIcons.Coins className="w-4 h-4" />, label: 'Start with just KES 500 — no minimum lock-in' },
                    { icon: <LucideIcons.CalendarClock className="w-4 h-4" />, label: 'Monthly interest payouts straight to your M-Pesa' },
                    { icon: <LucideIcons.Building2 className="w-4 h-4" />, label: 'Backed by real property renovation projects' },
                ]}
            />
            <HypeModal
                open={open === 'gig'}
                onClose={() => setOpen(null)}
                accent="gig"
                tagline="Earn 10% Commission"
                title="Refer Security & Cleaning Gigs"
                description="Refer clients to Task-Me Security (Guards & VIP), Cleaning Services or Maintenance and earn a 10% commission on the gig value once paid."
                ctaLabel="Start Referring"
                onCta={() => {
                    try { window.dispatchEvent(new CustomEvent('taskme:open-refer-modal', { detail: { kind: 'security' } })); } catch {}
                    if (!window.location.hash.includes('user-app-portal')) {
                        window.location.hash = '#/user-app-portal/tenant-portal';
                    }
                }}
                bullets={[
                    { icon: <LucideIcons.Shield className="w-4 h-4" />, label: 'Refer VIP security & residential guards' },
                    { icon: <LucideIcons.Sparkles className="w-4 h-4" />, label: 'Refer cleaning services for homes and offices' },
                    { icon: <LucideIcons.Banknote className="w-4 h-4" />, label: 'Get paid a 10% commission directly to your wallet' },
                ]}
            />
        </>
    );

    return { actions, modals };
}

export default usePortalGrowthActions;
