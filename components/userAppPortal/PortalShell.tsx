import React from 'react';
import Icon from '../Icon';

export interface PortalWalletCard {
    label: string;          // e.g. "Rent Balance"
    value: string;          // e.g. "KES 12,500"
    sublabel?: string;      // e.g. "Due 5 Jun"
    /** Tailwind gradient classes, e.g. "from-primary to-primary-dark" */
    gradient?: string;
    /** Legacy: name from <Icon name=... />. Prefer `iconNode` for richer art. */
    icon?: string;
    /** Preferred: a React node (typically a Lucide icon) rendered inside the card. */
    iconNode?: React.ReactNode;
    /** Small chip above the value, e.g. "+12% MoM". */
    trend?: string;
    /** Tone for the trend chip: 'up' | 'down' | 'neutral'. */
    trendTone?: 'up' | 'down' | 'neutral';
    onClick?: () => void;
}

export interface PortalQuickAction {
    label: string;
    /** Legacy name passed to <Icon name=...>. */
    icon?: string;
    /** Preferred: React node (Lucide) used as the action art. */
    iconNode?: React.ReactNode;
    onClick: () => void;
    /** Tailwind classes for the icon bubble bg+fg, e.g. "bg-emerald-100 text-emerald-600". */
    tone?: string;
    badge?: string | number;
}

interface PortalShellProps {
    /** Up to 4 hero wallet cards (snap-scroll on mobile, grid on desktop). */
    cards?: PortalWalletCard[];
    /** Quick action grid below the cards. */
    actions?: PortalQuickAction[];
    /** Optional secondary sub-stat row (compact KPIs). */
    metrics?: { label: string; value: string; tone?: string }[];
    /** Title for the quick actions section. Defaults to "Quick Actions". */
    actionsTitle?: string;
    /** Optional CTA shown next to the actions title (e.g. "See all"). */
    actionsCta?: { label: string; onClick: () => void };
    children?: React.ReactNode;
}

const TONE_PRESETS = [
    'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 ring-emerald-200',
    'bg-gradient-to-br from-sky-50 to-sky-100 text-sky-700 ring-sky-200',
    'bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 ring-violet-200',
    'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 ring-amber-200',
    'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 ring-rose-200',
    'bg-gradient-to-br from-cyan-50 to-cyan-100 text-cyan-700 ring-cyan-200',
    'bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 ring-indigo-200',
    'bg-gradient-to-br from-fuchsia-50 to-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
];

const CARD_GRADIENTS = [
    'from-primary via-primary to-primary-dark',
    'from-slate-900 via-slate-800 to-slate-700',
    'from-secondary via-secondary to-secondary-dark',
    'from-emerald-600 via-emerald-700 to-emerald-800',
];

const TREND_TONES: Record<NonNullable<PortalWalletCard['trendTone']>, string> = {
    up: 'bg-emerald-500/25 text-emerald-50 ring-emerald-200/40',
    down: 'bg-rose-500/25 text-rose-50 ring-rose-200/40',
    neutral: 'bg-white/20 text-white ring-white/30',
};

const renderArt = (node?: React.ReactNode, fallback?: string, className = 'w-5 h-5') => {
    if (node) return <span className={className}>{node}</span>;
    return <Icon name={fallback || 'wallet'} className={className} />;
};

const PortalShell: React.FC<PortalShellProps> = ({
    cards = [],
    actions = [],
    metrics,
    actionsTitle = 'Quick Actions',
    actionsCta,
    children,
}) => {
    return (
        <div className="relative space-y-3 -mt-5 animate-fade-in">
            {/* Decorative background mesh — sits behind cards, ignored by pointer events */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-72 overflow-hidden -z-10">
                <div className="absolute -top-24 -left-12 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -top-16 right-0 w-80 h-80 rounded-full bg-secondary/10 blur-3xl" />
            </div>

            {/* Wallet / hero cards — horizontal snap-scroll on mobile, grid on md+ */}
            {cards.length > 0 && (
                <div
                    className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4
                               md:overflow-visible md:mx-0 md:px-0
                               md:grid md:gap-3"
                    style={{
                        gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, minmax(0, 1fr))`,
                    }}
                >
                    {cards.map((c, i) => {
                        const grad = c.gradient || CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                        const tone = c.trendTone || 'neutral';
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={c.onClick}
                                className={`group snap-start shrink-0 w-[82%] sm:w-[58%] md:w-auto
                                            relative overflow-hidden rounded-2xl p-4 pt-5 text-left text-white
                                            shadow-[0_16px_32px_-12px_rgba(0,0,0,0.3)]
                                            bg-gradient-to-br ${grad}
                                            ring-1 ring-white/10
                                            ${c.onClick ? 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)] active:scale-[0.99] cursor-pointer' : ''}`}
                            >
                                {/* Glassy sheen */}
                                <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 opacity-60" />
                                {/* Sweeping highlight on hover */}
                                {c.onClick && (
                                    <div aria-hidden className="absolute -inset-1 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12" />
                                )}
                                {/* Halo icon */}
                                <div aria-hidden className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                                    {renderArt(c.iconNode, c.icon, 'w-44 h-44')}
                                </div>
                                {/* Dotted corner pattern */}
                                <div aria-hidden className="absolute right-3 top-3 opacity-30 pointer-events-none">
                                    <div className="grid grid-cols-4 gap-1">
                                        {Array.from({ length: 12 }).map((_, k) => (
                                            <div key={k} className="w-1 h-1 rounded-full bg-white/60" />
                                        ))}
                                    </div>
                                </div>

                                <div className="relative z-10">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25 shadow-inner">
                                                {renderArt(c.iconNode, c.icon, 'w-4 h-4')}
                                            </div>
                                            <p className="text-sm font-semibold opacity-95 truncate">{c.label}</p>
                                        </div>
                                        {c.trend && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${TREND_TONES[tone]}`}>
                                                {c.trend}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[26px] leading-tight font-extrabold tracking-tight break-words drop-shadow-sm">
                                        {c.value}
                                    </p>
                                    {c.sublabel && (
                                        <p className="text-xs opacity-85 mt-1.5 flex items-center gap-1">
                                            <span className="inline-block w-1 h-1 rounded-full bg-white/70" />
                                            {c.sublabel}
                                        </p>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Premium metric strip */}
            {metrics && metrics.length > 0 && (
                <div className="relative bg-gradient-to-br from-white via-white to-slate-50/80 backdrop-blur rounded-2xl shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] border border-gray-100/80 px-3 py-3 overflow-hidden">
                    {/* Subtle decorative orb */}
                    <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 w-32 h-32 rounded-full bg-gradient-to-br from-primary/5 to-secondary/5 blur-2xl" />
                    <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 divide-x divide-gray-100/80">
                        {metrics.map((m, i) => {
                            const accents = [
                                'from-rose-500 to-orange-500',
                                'from-amber-500 to-pink-500',
                                'from-emerald-500 to-teal-500',
                                'from-sky-500 to-indigo-500',
                            ];
                            const accent = accents[i % accents.length];
                            return (
                                <div key={i} className="min-w-0 relative pl-3 sm:pl-4 group">
                                    <span className={`absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-full bg-gradient-to-b ${accent} shadow-[0_0_8px_rgba(0,0,0,0.08)]`} />
                                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 truncate">{m.label}</p>
                                    <p className={`text-lg sm:text-xl font-extrabold tracking-tight truncate mt-0.5 ${m.tone || 'text-gray-900'}`}>{m.value}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Quick actions grid */}
            {actions.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-primary to-secondary" />
                            <h3 className="font-bold text-gray-800 text-sm tracking-tight">{actionsTitle}</h3>
                        </div>
                        {actionsCta && (
                            <button
                                onClick={actionsCta.onClick}
                                className="text-[11px] font-bold text-primary hover:underline"
                            >
                                {actionsCta.label}
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                        {actions.map((a, i) => {
                            const tone = a.tone || TONE_PRESETS[i % TONE_PRESETS.length];
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={a.onClick}
                                    className="group flex flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl p-1"
                                    title={a.label}
                                >
                                    <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center
                                                     transition-all duration-200
                                                     group-hover:-translate-y-0.5 group-hover:shadow-lg
                                                     group-active:scale-95
                                                     ring-1 shadow-sm ${tone}`}>
                                        {renderArt(a.iconNode, a.icon, 'w-6 h-6')}
                                        {a.badge !== undefined && a.badge !== '' && (
                                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                                                             rounded-full bg-rose-500 text-white text-[10px]
                                                             font-bold flex items-center justify-center border-2 border-white shadow">
                                                {a.badge}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                        {a.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {children}
        </div>
    );
};

export default PortalShell;
