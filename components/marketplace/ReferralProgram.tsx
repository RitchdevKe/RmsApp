
import React, { useMemo, useState } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { websiteLinks } from '../../utils/websiteLinks';
import { generateUnitReferralCode, generateUserReferralCode } from '../../utils/referralCode';

const ReferralProgram: React.FC = () => {
    const { leads, rfTransactions, currentUser, commissionRules, properties } = useData();
    const [copied, setCopied] = useState(false);
    const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
    const [vacantSearch, setVacantSearch] = useState('');

    const referralLeads = useMemo(
        () => (leads || []).filter(l => l.source === 'Referral'),
        [leads]
    );

    const stats = useMemo(() => {
        const successful = referralLeads.filter(l => l.status === 'Closed').length;
        const pending = referralLeads.filter(l => !['Closed', 'Lost'].includes(l.status)).length;
        const totalEarned = (rfTransactions || [])
            .filter(t => t.type === 'Referral Commission' && t.status === 'Completed')
            .reduce((s, t) => s + (t.amount || 0), 0);
        return { successful, pending, totalEarned };
    }, [referralLeads, rfTransactions]);

    const heroRate = useMemo(() => {
        const rule = (commissionRules || []).find(r => String(r.description || '').toLowerCase().includes('referral'))
            || (commissionRules || []).find(r => r.rateType === 'KES')
            || (commissionRules || [])[0];
        if (!rule) return { label: 'Earn on every qualified referral', amount: null as number | null, isPct: false };
        if (rule.rateType === '%') return { label: `Up to ${rule.rateValue}% on qualifying referrals`, amount: rule.rateValue, isPct: true };
        return { label: `KES ${Number(rule.rateValue).toLocaleString()} per qualifying referral`, amount: rule.rateValue, isPct: false };
    }, [commissionRules]);

    const referralCode = useMemo(() => {
        const u = currentUser as { id?: string; name?: string; email?: string; referralCode?: string } | null;
        if ((u as any)?.referralCode) return (u as any).referralCode as string;
        if (u?.id && u?.name) return generateUserReferralCode(u.name, u.id);
        if (u?.id) return generateUserReferralCode(u.email?.split('@')[0] || 'User', u.id);
        return 'TASKME';
    }, [currentUser]);

    const referralLink = websiteLinks.referral(referralCode);

    const recentActivity = useMemo(() => {
        const rows: { label: string; amount: number }[] = [];
        (rfTransactions || [])
            .filter(t => t.type === 'Referral Commission' && t.status === 'Completed')
            .slice(0, 6)
            .forEach(t => {
                rows.push({
                    label: `${t.partyName || 'Referral'} — ${t.description || t.reference || 'Commission'}`,
                    amount: t.amount || 0,
                });
            });
        if (rows.length === 0) {
            referralLeads
                .filter(l => l.status === 'Closed')
                .slice(0, 6)
                .forEach(l => {
                    rows.push({ label: `${l.tenantName} (closed lead)`, amount: 0 });
                });
        }
        return rows;
    }, [rfTransactions, referralLeads]);

    const tierLabel = useMemo(() => {
        const n = stats.successful;
        if (n >= 15) return 'Platinum Tier';
        if (n >= 6) return 'Gold Tier';
        if (n >= 1) return 'Bronze Tier';
        return 'Starter';
    }, [stats.successful]);

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const vacantUnits = useMemo(() =>
        properties.flatMap(p => p.units
            .filter(u => u.status === 'Vacant')
            .map(u => ({
                id: u.id,
                title: `${u.unitNumber} at ${p.name}`,
                rent: u.rent || p.defaultMonthlyRent || 0,
                location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''),
                type: (u as any).unitType || p.type || '',
            }))
        )
    , [properties]);

    const filteredVacantUnits = useMemo(() => {
        const q = vacantSearch.trim().toLowerCase();
        if (!q) return vacantUnits;
        return vacantUnits.filter(u =>
            u.title.toLowerCase().includes(q) ||
            (u.location || '').toLowerCase().includes(q) ||
            (u.type || '').toLowerCase().includes(q)
        );
    }, [vacantUnits, vacantSearch]);

    const getUnitCode = (unitId: string): string => {
        const u = currentUser as { id?: string; name?: string } | null;
        if (!u?.id || !u?.name) return referralCode;
        const prop = properties.find(p => p.units.some(x => x.id === unitId));
        const unit = prop?.units.find(x => x.id === unitId);
        if (!unit) return referralCode;
        return generateUnitReferralCode(u.name, unit.unitNumber, u.id);
    };

    const buildShareLink = (type: 'unit' | 'fund', id: string) => {
        if (type === 'unit') {
            const prop = properties.find(p => p.units.some(u => u.id === id));
            const unit = prop?.units.find(u => u.id === id);
            if (prop && unit) return websiteLinks.property(prop.id, getUnitCode(id), unit.unitNumber);
            return websiteLinks.unit(id, getUnitCode(id), prop?.websiteListingUrl);
        } else {
            return websiteLinks.invest(referralCode);
        }
    };

    const handleCopyShare = (type: 'unit' | 'fund', id: string) => {
        navigator.clipboard.writeText(buildShareLink(type, id));
        setCopiedShareId(id);
        setTimeout(() => setCopiedShareId(null), 2000);
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Refer & Earn Rewards</h1>
                <p className="text-lg text-gray-500 mt-1">Growth stats from your live leads and recorded commission payouts.</p>
            </div>

            <div className="bg-gradient-to-r from-primary to-primary-dark rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Icon name="revenue" className="w-40 h-40 text-white" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2 text-yellow-300 font-bold uppercase text-xs tracking-widest">
                        <Icon name="check" className="w-4 h-4" /> {tierLabel}
                    </div>
                    <h2 className="text-4xl font-extrabold mb-4">
                        {heroRate.amount != null && heroRate.isPct
                            ? `Earn up to ${heroRate.amount}% per referral`
                            : heroRate.amount != null
                                ? `Earn KES ${Number(heroRate.amount).toLocaleString()} per referral`
                                : heroRate.label}
                    </h2>
                    <p className="text-blue-100 max-w-lg mb-8">
                        Share your unique link. Successful referrals and commissions are reflected from Referral-source leads and RF “Referral Commission” transactions.
                    </p>

                    <div className="bg-white p-2 rounded-xl shadow-lg max-w-md flex items-center">
                        <input
                            type="text"
                            readOnly
                            value={referralLink}
                            className="flex-grow p-3 text-gray-600 text-sm outline-none font-mono bg-transparent"
                        />
                        <button
                            onClick={handleCopy}
                            className={`px-6 py-2 rounded-lg font-bold text-white transition-all ${copied ? 'bg-green-600' : 'bg-gray-900 hover:bg-black'}`}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Shareable Vacancy Links */}
            {vacantUnits.length > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-1">Share Vacant Units</h3>
                    <p className="text-xs text-gray-500 mb-3">Copy a direct link to any vacant unit — your referral code is embedded automatically.</p>
                    <div className="relative mb-3">
                        <Icon name="search" className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={vacantSearch}
                            onChange={e => setVacantSearch(e.target.value)}
                            placeholder="Search by location or house type..."
                            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-primary focus:border-primary outline-none"
                        />
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {filteredVacantUnits.map(u => {
                            const unitCode = getUnitCode(u.id);
                            return (
                                <div key={u.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{u.title}</p>
                                        <p className="text-xs text-gray-500">KES {u.rent.toLocaleString()} / mo · {u.location}</p>
                                        <p className="text-[10px] font-mono text-primary mt-0.5">Code: <span className="font-bold select-all">{unitCode}</span></p>
                                    </div>
                                    <button
                                        onClick={() => handleCopyShare('unit', u.id)}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copiedShareId === u.id ? 'bg-green-100 text-green-700' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                    >
                                        {copiedShareId === u.id ? 'Copied!' : 'Copy Link'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase">Total Earned (Commissions)</p>
                    <p className="text-3xl font-extrabold text-green-600 mt-2">KES {stats.totalEarned.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase">Successful Referrals (Closed)</p>
                    <p className="text-3xl font-extrabold text-blue-600 mt-2">{stats.successful}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase">Open Referral Leads</p>
                    <p className="text-3xl font-extrabold text-orange-500 mt-2">{stats.pending}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Reward tiers (illustrative)</h3>
                    <p className="text-xs text-gray-500 mb-4">Use commission rules under Registration for official rates; tiers shown here follow successful closed referrals.</p>
                    <div className="space-y-4">
                        <div className={`flex items-center p-3 rounded-lg border ${stats.successful < 6 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                            <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center font-bold text-yellow-800 mr-4">1</div>
                            <div className="flex-grow">
                                <h4 className="font-bold text-gray-700">Active growth</h4>
                                <p className="text-xs text-gray-500">1–5 closed referrals</p>
                            </div>
                            {stats.successful < 6 && <Icon name="check" className="w-5 h-5 text-green-600" />}
                        </div>
                        <div className={`flex items-center p-3 rounded-lg border ${stats.successful >= 6 && stats.successful < 15 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center font-bold text-white mr-4">2</div>
                            <div className="flex-grow">
                                <h4 className="font-bold text-gray-800">Gold track</h4>
                                <p className="text-xs text-gray-500">6–14 closed referrals</p>
                            </div>
                            {stats.successful >= 6 && stats.successful < 15 && <Icon name="check" className="w-5 h-5 text-green-600" />}
                        </div>
                        <div className={`flex items-center p-3 rounded-lg border ${stats.successful >= 15 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200 border-dashed'}`}>
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 mr-4">3</div>
                            <div className="flex-grow">
                                <h4 className="font-bold text-gray-800">Platinum track</h4>
                                <p className="text-xs text-gray-500">15+ closed referrals</p>
                            </div>
                            {stats.successful >= 15 && <Icon name="check" className="w-5 h-5 text-green-600" />}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-gray-800 mb-2">Recent commission activity</h3>
                        <p className="text-4xl font-extrabold text-gray-900 mb-6">
                            KES {recentActivity.reduce((s, r) => s + r.amount, 0).toLocaleString()}{' '}
                            <span className="text-sm font-medium text-gray-500">from latest payouts</span>
                        </p>

                        <div className="space-y-2">
                            {recentActivity.map((row, i) => (
                                <div key={i} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                                    <span className="truncate pr-2">{row.label}</span>
                                    <span className="font-bold text-green-600 shrink-0">+{row.amount.toLocaleString()}</span>
                                </div>
                            ))}
                            {recentActivity.length === 0 && (
                                <p className="text-sm text-gray-500">No commission payouts recorded yet. Close referral leads or log RF “Referral Commission” transactions.</p>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-gray-400 mt-6">
                        Withdrawals are processed through your finance workflow; use RF Payments for ledger entries.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ReferralProgram;