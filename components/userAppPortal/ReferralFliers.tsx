import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';

import { useData } from '../../context/DataContext';
import { websiteLinks } from '../../utils/websiteLinks';
import ReferAnyoneModal, { ReferKind } from './ReferAnyoneModal';
import AdBanners from './AdBanners';

/**
 * Shared "What's in it for me?" referral fliers used by every user portal
 * (Affiliate, Agent, Contractor, Tenant, Landlord, Caretaker).
 *
 * Commission copy matches the configured business rules:
 *  - Tenant   : min KES 200, up to 10% of 1st month rent (one-off)
 *  - Landlord : 10% of management fee, monthly for the duration of the contract
 *  - Investor : 2.5% one-off OR 5% per year for the duration of the investment
 *
 * Users can upload a custom background flyer image per card; the picture is
 * persisted in localStorage per (user, kind) so it survives reloads without a
 * backend round-trip.
 */

type Flier = {
    kind: ReferKind;
    badge: string;
    headline: string;
    amount: string;
    amountSub: string;
    bullets: string[];
    cta: string;
    gradient: string;
    accent: string;
    icon: 'tenant' | 'landlord' | 'investor' | 'security' | 'cleaning' | 'maintenance';
    sparkle: string;
};

const renderIcon = (key: Flier['icon'], size = 20, className = '') => {
    if (key === 'tenant') return <LucideIcons.UserCheck size={size} className={className} />;
    if (key === 'landlord') return <LucideIcons.Building2 size={size} className={className} />;
    if (key === 'security') return <LucideIcons.Shield size={size} className={className} />;
    if (key === 'cleaning') return <LucideIcons.Sparkles size={size} className={className} />;
    if (key === 'maintenance') return <LucideIcons.Wrench size={size} className={className} />;
    return <LucideIcons.TrendingUp size={size} className={className} />;
};

const storageKey = (userId: string, kind: ReferKind) => `taskme:flyerBg:${userId || 'anon'}:${kind}`;

const ReferralFliers: React.FC<{ heading?: string; subheading?: string; hiddenKinds?: ReferKind[] }> = ({
    heading = 'Earn With Every Referral',
    subheading = 'Share your link with anyone — tenants, landlords, or investors — and earn real cash.',
    hiddenKinds = [],
}) => {
    const { currentUser, commissionRules, properties } = useData();
    const userId = currentUser?.id || '';
    const referralCode = (currentUser as any)?.referralCode ||
        `${String(currentUser?.name ?? 'USER').split(' ')[0].toUpperCase() || 'USER'}2025`;
    const link = websiteLinks.referral(referralCode);

    const [referModal, setReferModal] = useState<null | ReferKind>(null);
    const [bgImages, setBgImages] = useState<Record<ReferKind, string | null>>({ 
        tenant: null, landlord: null, investor: null, security: null, cleaning: null, maintenance: null 
    });
    const fileInputs = {
        tenant:   useRef<HTMLInputElement>(null),
        landlord: useRef<HTMLInputElement>(null),
        investor: useRef<HTMLInputElement>(null),
        security: useRef<HTMLInputElement>(null),
        cleaning: useRef<HTMLInputElement>(null),
        maintenance: useRef<HTMLInputElement>(null),
    };

    // Load persisted background images
    useEffect(() => {
        try {
            setBgImages({
                tenant:   localStorage.getItem(storageKey(userId, 'tenant'))   || null,
                landlord: localStorage.getItem(storageKey(userId, 'landlord')) || null,
                investor: localStorage.getItem(storageKey(userId, 'investor')) || null,
                security: localStorage.getItem(storageKey(userId, 'security')) || null,
                cleaning: localStorage.getItem(storageKey(userId, 'cleaning')) || null,
                maintenance: localStorage.getItem(storageKey(userId, 'maintenance')) || null,
            });
        } catch { /* ignore */ }
    }, [userId]);

    // Derive commission values from configured rules (with sensible fallbacks)
    const allRents = useMemo(
        () => (properties || []).flatMap(p => (p?.units || []).map(u => u?.rent || p?.defaultMonthlyRent || 0)).filter(r => r > 0),
        [properties]
    );
    const avgRent = allRents.length > 0 ? Math.round(allRents.reduce((s, r) => s + r, 0) / allRents.length) : 15000;
    const maxRent = allRents.length > 0 ? Math.max(...allRents) : 80000;

    const tenantRule   = commissionRules.find(r => r.trigger === 'Tenancy Referral');
    const landlordRule = commissionRules.find(r => r.trigger === 'Property Management Referral');
    const investorRule = commissionRules.find(r => (r.trigger as string) === 'Investor Referral');

    // Tenant: min 200, up to 10% of first month's rent
    const tenantMin = Math.max(200, tenantRule?.rateType === 'KES' ? tenantRule.rateValue : 200);
    const tenantPctRate = tenantRule?.rateType === '%' ? tenantRule.rateValue : 10;
    const tenantTypical = Math.max(tenantMin, Math.round(avgRent * (tenantPctRate / 100)));
    const tenantMax     = Math.max(tenantMin, Math.round(maxRent * (tenantPctRate / 100)));

    // Landlord: 10% of monthly mgmt fee, recurring
    const landlordPct = landlordRule?.rateType === '%' ? landlordRule.rateValue : 10;
    const exampleRentRoll = 500000;
    const exampleAgencyFee = exampleRentRoll * 0.08;          // 8% mgmt fee on portfolio rent
    const landlordMonthly = Math.round(exampleAgencyFee * (landlordPct / 100));
    const landlordAnnual  = landlordMonthly * 12;

    // Investor: 2.5% one-off OR 5% per year (recurring)
    const investorOneOff = 2.5;
    const investorYearly = investorRule?.rateType === '%' ? investorRule.rateValue : 5;
    const investorOn100kOneOff = Math.round(100000 * (investorOneOff / 100));
    const investorOn100kYearly = Math.round(100000 * (investorYearly / 100));

    const fliers: Flier[] = [
        {
            kind: 'tenant',
            badge: 'PER TENANT · ONE-OFF',
            headline: 'Refer a Tenant',
            amount: `KES ${tenantTypical.toLocaleString()}`,
            amountSub: `Min KES ${tenantMin} · Up to KES ${tenantMax.toLocaleString()}`,
            bullets: [
                `Earn up to ${tenantPctRate}% of the first month's rent`,
                'Paid the moment the lease is signed',
                'No cap on how many tenants you refer',
            ],
            cta: 'Refer a Tenant',
            gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
            accent: '#10b981',
            icon: 'tenant',
            sparkle: '🏠',
        },
        {
            kind: 'landlord',
            badge: 'PER LANDLORD · RECURRING',
            headline: 'Refer a Landlord',
            amount: `KES ${landlordMonthly.toLocaleString()}`,
            amountSub: `~KES ${landlordAnnual.toLocaleString()} / year per landlord`,
            bullets: [
                `${landlordPct}% of the management fee — every single month`,
                'Paid for the entire duration of the contract',
                'Stack income from multiple landlords',
            ],
            cta: 'Refer a Landlord',
            gradient: 'from-indigo-500 via-violet-500 to-purple-500',
            accent: '#6366f1',
            icon: 'landlord',
            sparkle: '🏢',
        },
        {
            kind: 'investor',
            badge: 'PER INVESTOR · CHOOSE',
            headline: 'Refer an Investor',
            amount: `${investorOneOff}% or ${investorYearly}%/yr`,
            amountSub: `e.g. KES ${investorOn100kOneOff.toLocaleString()} once OR KES ${investorOn100kYearly.toLocaleString()}/yr on a 100K investment`,
            bullets: [
                `${investorOneOff}% one-off bonus on every deposit`,
                `OR ${investorYearly}% per year for the entire investment duration`,
                'Compounds as the investor tops up',
            ],
            cta: 'Refer an Investor',
            gradient: 'from-amber-400 via-orange-500 to-rose-500',
            accent: '#f59e0b',
            icon: 'investor',
            sparkle: '📈',
        },
    ].filter(f => !hiddenKinds.includes(f.kind));

    const handleUpload = (kind: ReferKind, file?: File) => {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert('Image too large. Please choose a picture under 2MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            setBgImages(prev => ({ ...prev, [kind]: dataUrl }));
            try { localStorage.setItem(storageKey(userId, kind), dataUrl); } catch { /* quota */ }
        };
        reader.readAsDataURL(file);
    };

    const clearBg = (kind: ReferKind) => {
        setBgImages(prev => ({ ...prev, [kind]: null }));
        try { localStorage.removeItem(storageKey(userId, kind)); } catch { /* ignore */ }
    };

    return (
        <div className="space-y-3">
            {(heading || subheading) && (
                <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                        {heading && <h3 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
                            <LucideIcons.Sparkles className="w-4 h-4 text-amber-500" />{heading}
                        </h3>}
                        {subheading && <p className="text-[11px] text-gray-500">{subheading}</p>}
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <LucideIcons.Image className="w-3 h-3" /> Tap the camera to brand your flyer
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {fliers.map((f) => {
                    const bg = bgImages[f.kind];
                    return (
                        <div
                            key={f.kind}
                            className="relative overflow-hidden rounded-2xl shadow-xl group min-h-[320px] flex flex-col transform transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                        >
                            {/* Background image (if uploaded) */}
                            {bg && (
                                <div className="absolute inset-0">
                                    <img src={bg} alt="" className="w-full h-full object-cover" />
                                </div>
                            )}
                            {/* Gradient overlay — stronger when an image is set so text stays legible */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} ${bg ? 'opacity-80 mix-blend-multiply' : 'opacity-95'}`} />
                            {/* Decorative shine */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/15 rounded-full blur-2xl pointer-events-none" />
                            <div className="absolute -bottom-12 -left-8 w-32 h-32 bg-black/20 rounded-full blur-3xl pointer-events-none" />
                            {/* Giant ghost icon */}
                            <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                                {renderIcon(f.icon, 96, 'text-white')}
                            </div>

                            {/* Upload control — top-left corner */}
                            <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => fileInputs[f.kind].current?.click()}
                                    title="Upload a background picture for this flyer"
                                    className="w-8 h-8 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur-md text-white flex items-center justify-center transition-all"
                                >
                                    <LucideIcons.Camera className="w-4 h-4" />
                                </button>
                                {bg && (
                                    <button
                                        type="button"
                                        onClick={() => clearBg(f.kind)}
                                        title="Remove background picture"
                                        className="w-8 h-8 rounded-full bg-white/30 hover:bg-red-500/80 backdrop-blur-md text-white flex items-center justify-center transition-all"
                                    >
                                        <LucideIcons.X className="w-4 h-4" />
                                    </button>
                                )}
                                <input
                                    ref={fileInputs[f.kind]}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleUpload(f.kind, e.target.files?.[0])}
                                />
                            </div>

                            {/* Content */}
                            <div className="relative p-5 pt-14 text-white flex flex-col flex-1">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[9px] font-extrabold uppercase tracking-widest bg-white/25 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/20">
                                        {f.badge}
                                    </span>
                                    <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                                        {renderIcon(f.icon, 20, 'text-white')}
                                    </div>
                                </div>

                                <h3 className="text-xl font-extrabold mb-1 drop-shadow">
                                    <span className="mr-1.5">{f.sparkle}</span>{f.headline}
                                </h3>

                                <div className="flex items-baseline gap-1.5 mb-1">
                                    <span className="text-3xl font-black tracking-tight drop-shadow-md">{f.amount}</span>
                                </div>
                                <p className="text-[10px] font-semibold opacity-90 mb-3">{f.amountSub}</p>

                                <ul className="space-y-1 mb-4 flex-1">
                                    {f.bullets.map((b, i) => (
                                        <li key={i} className="text-[11px] leading-snug flex items-start gap-1.5 opacity-95">
                                            <LucideIcons.Check className="w-3 h-3 mt-0.5 shrink-0" />
                                            <span>{b}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => setReferModal(f.kind)}
                                    className="w-full py-2.5 bg-white text-gray-900 text-xs font-extrabold rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-1.5 shadow-lg group-hover:scale-[1.02]"
                                >
                                    <LucideIcons.Plus className="w-3.5 h-3.5" />
                                    {f.cta}
                                    <LucideIcons.ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* TaskMe Professional Services referral banners */}
            <div className="pt-2">
                <AdBanners section="services" />
            </div>

            {referModal && (
                <ReferAnyoneModal
                    referrerId={userId}
                    referralCode={referralCode}
                    initialKind={referModal}
                    onClose={() => setReferModal(null)}
                />
            )}
        </div>
    );
};

export default ReferralFliers;
