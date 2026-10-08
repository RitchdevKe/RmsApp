import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { websiteLinks } from '../../utils/websiteLinks';
import { generateUnitReferralCode, generateUserReferralCode } from '../../utils/referralCode';
import { buildReferralEarningsModel } from '../../utils/referralEarnings';
import ReferServiceModal, { ServiceRefType } from './ReferServiceModal';
import { isUnitSafelyVacant } from '../../utils/unitOccupancy';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

const ReferAndGrow: React.FC = () => {
    const { properties, funds, currentUser, tenants, renovationInvestors, leads, applications, rfTransactions, commissionRules } = useData();
    const [activeTab, setActiveTab] = useState<'Campaigns' | 'Calculator' | 'History'>('Campaigns');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [vacantSearch, setVacantSearch] = useState('');
    const [serviceModal, setServiceModal] = useState<ServiceRefType | null>(null);

    // --- CURRENT USER DATA ---
    const user = useMemo(() => {
        if (!currentUser) return { name: "User", referralCode: "REF2025", tier: "Silver", points: 0 };
        return {
            name: currentUser.name || "User",
            referralCode: (currentUser as any).referralCode || generateUserReferralCode(currentUser.name || '', currentUser.id),
            tier: "Silver",
            points: 1250,
            referralConfig: (currentUser as any).referralConfig
        };
    }, [currentUser]);

    // --- COMMISSION LOGIC ---
    const getCommission = (rent: number) => {
        // 1. User Override
        if (user.referralConfig && user.referralConfig.rateValue > 0) {
            if (user.referralConfig.rateType === '%') return rent * (user.referralConfig.rateValue / 100);
            return user.referralConfig.rateValue;
        }
        // 2. Global Rule
        const rule = commissionRules.find(r => r.trigger === 'Tenancy Referral');
        if (rule) {
            if (rule.rateType === '%') return rent * (rule.rateValue / 100);
            return rule.rateValue;
        }
        // 3. Default
        return 200;
    };

    // --- LIVE REFERRAL TRACKING ---
    const referralHistory = useMemo(() => {
        if (!currentUser) return [];
        const myId = currentUser.id;

        const tenantRefs = tenants.filter(t => t.referrerId === myId).map(t => ({
            date: t.onboardingDate,
            type: 'Tenant',
            detail: `${t.name} (Unit ${t.unit})`,
            status: 'Successful',
            earned: getCommission(t.rentAmount) // Use dynamic calc
        }));
        // ... rest of history logic ...
        const investorRefs = renovationInvestors.filter(i => i.referrerId === myId).map(i => ({
            date: i.joinDate,
            type: 'Investor',
            detail: i.name,
            status: i.status === 'Active' ? 'Successful' : 'Pending',
            earned: i.status === 'Active' ? 2500 : 0 
        }));

        const leadRefs = leads.filter(l => l.referrerId === myId).map(l => ({
            date: l.date || getTodayIsoDate(),
            type: 'Lead',
            detail: l.tenantName,
            status: l.status === 'New' ? 'Pending' : l.status,
            earned: 0
        }));

        const appRefs = applications.filter(a => a.referrerId === myId).map(a => ({
            date: a.submittedDate,
            type: 'Application',
            detail: `${a.name} (${a.property})`,
            status: a.status === 'Approved' ? 'Successful' : 'Pending',
            earned: 0
        }));

        return [...tenantRefs, ...investorRefs, ...leadRefs, ...appRefs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [currentUser, tenants, renovationInvestors, leads, applications, commissionRules]); // Added commissionRules dependency

    const referralEarnings = useMemo(() => {
        if (!currentUser) return buildReferralEarningsModel({ currentUser: null });
        return buildReferralEarningsModel({
            currentUser,
            profileCommissions: Array.isArray((currentUser as any).commissions) ? (currentUser as any).commissions : [],
            rfTransactions,
            referralEvidence: referralHistory.map(item => ({ name: item.detail, source: item.detail })),
        });
    }, [currentUser, rfTransactions, referralHistory]);

    const totalEarned = referralEarnings.totalEarned;
    const totalPaid = referralEarnings.totalPaid;
    const balanceDue = referralEarnings.nextPayout;
    const nextPayout = referralEarnings.nextPayout;
    const earnedThisMonth = useMemo(() => {
        const prefix = getCurrentMonthIso();
        return referralEarnings.entries
            .filter(e => String(e.date || '').startsWith(prefix))
            .reduce((s, e) => s + e.amount, 0);
    }, [referralEarnings]);

    // --- CALCULATOR STATE ---
    const [calcState, setCalcState] = useState({
        tenantsReferred: 5,
        landlordsReferred: 1,
        landlordPortfolioValue: 500000, // Monthly Rent Roll
        investorsReferred: 2,
        investmentAmount: 100000 // Per Investor
    });

    // --- DERIVED DATA ---
    
    // 1. Vacant Units for Referral (REAL DATA)
    const vacantUnits = useMemo(() => {
        return properties.flatMap(p => p.units
            .filter(u => isUnitSafelyVacant(u, tenants, p))
            .map(u => {
                const rent = u.rent || p.defaultMonthlyRent || 0;
                const depReq = (p as any).deposit?.required !== false;
                const depMonths = Number((p as any).deposit?.months || 1);
                return {
                    id: u.id,
                    propertyId: p.id,
                    unitNumber: u.unitNumber,
                    title: `${u.unitNumber} at ${p.name}`,
                    rent,
                    deposit: depReq && rent > 0 ? rent * depMonths : 0,
                    location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''),
                    pinLocationUrl: p.pinLocationUrl || '',
                    image: p.profilePictureUrl,
                    type: (u as any).unitType || (p as any).defaultUnitType || p.type,
                };
            })
        );
    }, [properties, tenants]);


    const filteredVacantUnits = useMemo(() => {
        const q = vacantSearch.trim().toLowerCase();
        if (!q) return vacantUnits;
        return vacantUnits.filter(u =>
            (u.location || '').toLowerCase().includes(q) ||
            (u.type || '').toLowerCase().includes(q) ||
            u.title.toLowerCase().includes(q)
        );
    }, [vacantUnits, vacantSearch]);

    // 2. Active Funds for Referral
    const activeFunds = useMemo(() => funds.filter(f => f.status === 'Active').slice(0, 2), [funds]);

    // 3. Calculator Logic
    const potentialEarnings = useMemo(() => {
        // Tenant: Dynamic based on avg rent of vacant units or flat rate
        const avgRent = vacantUnits.length > 0 ? vacantUnits.reduce((sum, u) => sum + u.rent, 0) / vacantUnits.length : 15000;
        const tenantCommPerUnit = getCommission(avgRent);
        const tenantComm = calcState.tenantsReferred * tenantCommPerUnit;
        
        // Landlord: 10% of Agency Fee (Assuming 8% Agency Fee on Rent Roll) per month * 12 months
        const agencyFee = calcState.landlordPortfolioValue * 0.08;
        const landlordCommMonthly = agencyFee * 0.10;
        const landlordCommAnnual = landlordCommMonthly * 12 * calcState.landlordsReferred;

        // Investor: 2.5% One-off OR 5% Yearly. Let's show max potential (5% yearly)
        const investorCapital = calcState.investorsReferred * calcState.investmentAmount;
        const investorComm = investorCapital * 0.05;

        return {
            total: tenantComm + landlordCommAnnual + investorComm,
            breakdown: { tenant: tenantComm, landlord: landlordCommAnnual, investor: investorComm }
        };
    }, [calcState, vacantUnits, commissionRules, user]);

    const getUnitCode = (unit: any): string => {
        if (!currentUser?.id || !currentUser?.name) return user.referralCode;
        return generateUnitReferralCode(currentUser.name, unit.unitNumber, currentUser.id);
    };

    const copyToClipboard = async (text: string, successId: string) => {
        const safe = String(text ?? '').trim();
        if (!safe) return alert('No link available to copy.');
        try {
            await navigator.clipboard.writeText(safe);
            setCopiedId(successId);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            window.prompt('Copy this link:', safe);
        }
    };

    const handleShareUnit = (unit: any) => {
        const unitCode = getUnitCode(unit);
        const shareUrl = websiteLinks.property(unit.propertyId, unitCode, unit.unitNumber);
        const msg = `Hey! Check out this ${unit.type} at ${unit.location} going for KES ${Number(unit.rent ?? 0).toLocaleString()}. \n\nInterested? Book it here using my referral code *${unitCode}* to get priority processing! \n\nLink: ${shareUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleCopyUnit = async (unit: any) => {
        const unitCode = getUnitCode(unit);
        const url = websiteLinks.property(unit.propertyId, unitCode, unit.unitNumber);
        await copyToClipboard(url, unit.id);
    };

    const handleCopyLandlord = async () => {
        const url = websiteLinks.landlord(user.referralCode);
        await copyToClipboard(url, 'landlord');
    };

    const handleCopyInvestor = async (fundId: string) => {
        const url = websiteLinks.invest(user.referralCode);
        await copyToClipboard(url, fundId);
    };

    const handleInviteInvestor = (fundName: string) => {
        const shareUrl = websiteLinks.invest(user.referralCode);
        const msg = `Invest in ${fundName} with TaskMe Realty and earn 30% APY! Use my referral code *${user.referralCode}* when signing up. \n\nJoin here: ${shareUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleInviteLandlord = () => {
        const shareUrl = websiteLinks.landlord(user.referralCode);
        const msg = `Are you a landlord? Let TaskMe Realty manage your property. Use my code *${user.referralCode}* for a discount on management fees! \n\nGet a quote: ${shareUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    };

    return (
        <div className="space-y-8 pb-20 bg-gray-50 min-h-screen p-6">
            {/* Header / Hero */}
            <div className="relative bg-[#0F172A] rounded-3xl p-8 text-white overflow-hidden shadow-2xl">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <Icon name="revenue" className="w-96 h-96 text-white transform translate-x-1/4 -translate-y-1/4" />
                </div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start gap-12">
                    <div className="flex-1 space-y-6">
                        <div className="inline-flex items-center gap-2 bg-[#FFD700]/10 text-[#FFD700] px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-[#FFD700]/20">
                            <Icon name="check" className="w-3 h-3" /> {user.tier} Member
                        </div>
                        
                        <div>
                            <h1 className="text-5xl font-extrabold mb-4 tracking-tight">Refer & Grow Rich</h1>
                            <p className="text-blue-100/80 max-w-xl text-lg leading-relaxed">
                                Turn your network into net worth. Earn commissions for every tenant, landlord, or investor you bring to TaskMe.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                            <div className="bg-white/5 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10">
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">TOTAL EARNED</p>
                                <p className="text-xl lg:text-2xl font-bold text-[#4CAF50]">KES {Number(totalEarned ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10">
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">THIS MONTH</p>
                                <p className="text-xl lg:text-2xl font-bold text-[#FFD700]">KES {Number(earnedThisMonth ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10">
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">TOTAL PAID</p>
                                <p className="text-xl lg:text-2xl font-bold text-white">KES {Number(totalPaid ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10">
                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">BALANCE</p>
                                <p className="text-xl lg:text-2xl font-bold text-orange-300">KES {Number(balanceDue ?? 0).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Gamification Card */}
                    <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 w-full lg:w-96 shadow-xl">
                        <div className="flex justify-between items-center text-sm mb-4">
                            <span className="font-bold text-white">Next Tier: Gold</span>
                            <span className="text-[#FFD700] font-bold bg-[#FFD700]/10 px-2 py-1 rounded">1250 / 2000 XP</span>
                        </div>
                        <div className="w-full bg-gray-700/50 h-3 rounded-full mb-4 overflow-hidden">
                            <div className="bg-gradient-to-r from-[#FFD700] to-[#FFA000] h-full rounded-full" style={{ width: '62%' }}></div>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                            Refer <span className="text-white font-bold">3 more tenants</span> to unlock Gold status and earn <span className="text-[#FFD700] font-bold">5% bonus</span> on all payouts!
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-center sticky top-4 z-20">
                <div className="bg-white p-1.5 rounded-full shadow-lg border border-gray-100 inline-flex">
                    {['Campaigns', 'Calculator', 'History'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
                                activeTab === tab 
                                    ? 'bg-[#0F172A] text-white shadow-md transform scale-105' 
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* TAB: CAMPAIGNS */}
            {activeTab === 'Campaigns' && (
                <div className="space-y-16 animate-fade-in max-w-7xl mx-auto">
                    
                    {/* 1. Vacant Houses */}
                    <section>
                        <div className="flex items-start gap-4 mb-8">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shadow-sm"><Icon name="vacant-house" className="w-8 h-8" /></div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Fill a Vacancy</h2>
                                <p className="text-gray-500 mt-1">Refer a tenant to any of these units and earn <span className="font-bold text-green-600 bg-green-50 px-1 rounded">KES 200</span> instantly.</p>
                            </div>
                        </div>
                        
                        <div className="relative mb-6">
                            <Icon name="search" className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={vacantSearch}
                                onChange={e => setVacantSearch(e.target.value)}
                                placeholder="Search by location or house type..."
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-primary focus:border-primary outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {filteredVacantUnits.map(unit => (
                                <div key={unit.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 group flex flex-col h-full">
                                    <div className="h-56 bg-gray-100 relative flex items-center justify-center overflow-hidden">
                                        {unit.image ? (
                                            <img src={unit.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <Icon name="branch" className="w-20 h-20 text-gray-300" />
                                        )}
                                        <div className="absolute top-4 right-4 bg-[#22C55E] text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wide shadow-sm">
                                            Available
                                        </div>
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-gray-900 text-lg line-clamp-1">{unit.title}</h3>
                                        </div>
                                        <p className="text-sm text-gray-500 mb-6 flex items-center gap-1">
                                            <Icon name="map-pin" className="w-4 h-4" /> {unit.location}
                                        </p>
                                        {unit.pinLocationUrl && (
                                            <a
                                                href={unit.pinLocationUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center text-xs font-bold text-blue-700 hover:text-blue-800 mb-3"
                                            >
                                                <Icon name="map-pin" className="w-3 h-3 mr-1" /> Open map pin
                                            </a>
                                        )}
                                        
                                        <div className="mt-auto space-y-4">
                                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                                <div>
                                                    <span className="text-lg font-bold text-[#0F172A]">KES {unit.rent.toLocaleString()}</span>
                                                    {Number((unit as any).deposit ?? 0) > 0 && (
                                                        <p className="text-[11px] text-gray-500 mt-0.5">Deposit: <span className="font-semibold text-gray-700">KES {Number((unit as any).deposit).toLocaleString()}</span></p>
                                                    )}
                                                </div>
                                                <span className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full font-medium shadow-sm">{unit.type}</span>
                                            </div>

                                            <button 
                                                onClick={() => handleShareUnit(unit)} 
                                                className="w-full py-3.5 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#128C7E] flex items-center justify-center transition-all shadow-md hover:shadow-lg active:scale-95"
                                            >
                                                <Icon name="communication" className="w-5 h-5 mr-2" /> Share via WhatsApp
                                            </button>
                                            <button
                                                onClick={() => handleCopyUnit(unit)}
                                                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 flex items-center justify-center transition-all active:scale-95"
                                            >
                                                <Icon name="copy" className="w-4 h-4 mr-2" /> {copiedId === unit.id ? 'Copied!' : 'Copy Link'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredVacantUnits.length === 0 && (
                                <div className="col-span-full py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Icon name="check" className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <p className="text-gray-500 font-medium">No vacant units available to refer right now.</p>
                                    <p className="text-sm text-gray-400">Check back later!</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 2. Landlords */}
                    <section>
                        <div className="flex items-start gap-4 mb-8">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shadow-sm"><Icon name="landlords" className="w-8 h-8" /></div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Refer a Landlord</h2>
                                <p className="text-gray-500 mt-1">Earn <span className="font-bold text-purple-600 bg-purple-50 px-1 rounded">10% of our Agency Fee</span> monthly for the entire contract duration.</p>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-[#F8F5FF] to-white border border-purple-100 p-8 md:p-10 rounded-3xl flex flex-col lg:flex-row items-center gap-12 shadow-sm">
                            <div className="flex-1 space-y-6">
                                <div>
                                    <h3 className="text-3xl font-bold text-[#4A148C] mb-3">Passive Income Stream</h3>
                                    <p className="text-[#6A1B9A] text-lg leading-relaxed opacity-80">
                                        Know a property owner struggling with management? Refer them to TaskMe. If they sign up, you get paid every month they stay with us.
                                    </p>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[
                                        'Recurring monthly commission',
                                        'Transparent tracking dashboard',
                                        'No cap on earnings',
                                        'Dedicated account manager'
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center text-sm text-gray-700 bg-white p-3 rounded-xl border border-purple-50 shadow-sm">
                                            <div className="bg-green-100 p-1 rounded-full mr-3">
                                                <Icon name="check" className="w-3 h-3 text-green-600" />
                                            </div>
                                            {item}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button 
                                        onClick={handleInviteLandlord} 
                                        className="px-8 py-4 bg-[#7B1FA2] text-white font-bold rounded-xl hover:bg-[#6A1B9A] shadow-lg shadow-purple-200 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <Icon name="communication" className="w-5 h-5" /> Send Proposal
                                    </button>
                                    <button
                                        onClick={handleCopyLandlord}
                                        className="px-8 py-4 bg-purple-50 text-purple-700 font-bold rounded-xl border border-purple-200 hover:bg-purple-100 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <Icon name="copy" className="w-5 h-5" /> {copiedId === 'landlord' ? 'Copied!' : 'Copy Link'}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="w-full lg:w-96 bg-white p-8 rounded-3xl shadow-xl border border-purple-50 text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-400 to-indigo-500"></div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">POTENTIAL EARNINGS</p>
                                <p className="text-5xl font-extrabold text-[#1a237e] mb-4 tracking-tight">KES 5,000</p>
                                <div className="inline-block bg-purple-50 text-purple-700 text-xs font-bold px-4 py-2 rounded-full mb-2">
                                    PER MONTH
                                </div>
                                <p className="text-xs text-gray-400 mt-4 px-4">Based on an average apartment block with 20 units.</p>
                            </div>
                        </div>
                    </section>

                    {/* 3. R-REITS */}
                    <section>
                        <div className="flex items-start gap-4 mb-8">
                            <div className="p-3 bg-orange-50 text-orange-600 rounded-xl shadow-sm"><Icon name="reits" className="w-8 h-8" /></div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Refer an Investor</h2>
                                <p className="text-gray-500 mt-1">Earn <span className="font-bold text-orange-600 bg-orange-50 px-1 rounded">2.5% One-off</span> or <span className="font-bold text-orange-600 bg-orange-50 px-1 rounded">5% Yearly</span> on invested capital.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {activeFunds.map(fund => (
                                <div key={fund.id} className="bg-white border border-gray-200 p-8 rounded-2xl hover:shadow-xl transition-all duration-300 group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-500"></div>
                                    
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-6">
                                            <h3 className="font-bold text-xl text-gray-900">{fund.name}</h3>
                                            <span className="text-xs bg-[#E8F5E9] text-[#2E7D32] px-3 py-1.5 rounded-lg font-bold border border-green-100 shadow-sm">{fund.targetApy} APY</span>
                                        </div>
                                        
                                        <p className="text-gray-600 mb-8 leading-relaxed text-sm min-h-[60px]">{fund.description}</p>
                                        
                                        <div className="space-y-2">
                                            <button 
                                                onClick={() => handleInviteInvestor(fund.name)} 
                                                className="w-full py-3.5 border-2 border-[#F97316] text-[#F97316] font-bold rounded-xl hover:bg-[#FFF7ED] transition-colors flex items-center justify-center gap-2 group-hover:bg-[#F97316] group-hover:text-white"
                                            >
                                                <Icon name="communication" className="w-5 h-5" /> Invite Investor
                                            </button>
                                            <button
                                                onClick={() => handleCopyInvestor(fund.id)}
                                                className="w-full py-2.5 bg-orange-50 text-orange-700 text-sm font-bold rounded-xl border border-orange-200 hover:bg-orange-100 flex items-center justify-center transition-all active:scale-95"
                                            >
                                                <Icon name="copy" className="w-4 h-4 mr-2" /> {copiedId === fund.id ? 'Copied!' : 'Copy Link'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 4-6. Service Referrals: Security, Cleaning, Maintenance */}
                    <section>
                        <div className="flex items-start gap-4 mb-8">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shadow-sm"><Icon name="reits" className="w-8 h-8" /></div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">Refer Services & Earn 10%</h2>
                                <p className="text-gray-500 mt-1">Refer anyone who needs security, cleaning or maintenance. You earn <span className="font-bold text-emerald-600 bg-emerald-50 px-1 rounded">10% of the gig value</span> once the service is paid for.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Security */}
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-red-800 text-white p-6 shadow-lg hover:shadow-2xl transition-shadow">
                                <div className="absolute -right-8 -top-8 w-40 h-40 bg-red-500/20 rounded-full blur-2xl"></div>
                                <div className="relative z-10 space-y-4">
                                    <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                        <Icon name="userPlus" className="w-3.5 h-3.5" /> Per Gig · One-off
                                    </div>
                                    <h3 className="text-2xl font-extrabold leading-tight">🛡️ Refer Security</h3>
                                    <p className="text-white/85 text-sm leading-relaxed">TaskMe Security handles home &amp; office guards, bodyguards, bouncers and VIP details.</p>
                                    <div className="text-4xl font-black tracking-tight">10%</div>
                                    <p className="text-xs text-white/70">of the total gig value, paid on completion.</p>
                                    <ul className="space-y-1.5 text-sm">
                                        <li className="flex gap-2"><span>✓</span> Trained &amp; vetted personnel</li>
                                        <li className="flex gap-2"><span>✓</span> Residential, corporate, VIP</li>
                                        <li className="flex gap-2"><span>✓</span> No cap — refer unlimited gigs</li>
                                    </ul>
                                    <button onClick={() => setServiceModal('Security')} className="w-full py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-white/90 transition-all active:scale-95 flex items-center justify-center gap-2">
                                        + Refer Security →
                                    </button>
                                </div>
                            </div>

                            {/* Cleaning */}
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-600 text-white p-6 shadow-lg hover:shadow-2xl transition-shadow">
                                <div className="absolute -right-8 -top-8 w-40 h-40 bg-cyan-300/30 rounded-full blur-2xl"></div>
                                <div className="relative z-10 space-y-4">
                                    <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                        <Icon name="userPlus" className="w-3.5 h-3.5" /> Per Gig · One-off
                                    </div>
                                    <h3 className="text-2xl font-extrabold leading-tight">🧽 Refer Cleaning</h3>
                                    <p className="text-white/90 text-sm leading-relaxed">TaskMe Cleaning covers houses, offices, government facilities and post-construction cleanups.</p>
                                    <div className="text-4xl font-black tracking-tight">10%</div>
                                    <p className="text-xs text-white/80">of the cleaning services gig, credited automatically.</p>
                                    <ul className="space-y-1.5 text-sm">
                                        <li className="flex gap-2"><span>✓</span> Homes, offices &amp; institutions</li>
                                        <li className="flex gap-2"><span>✓</span> One-off or recurring contracts</li>
                                        <li className="flex gap-2"><span>✓</span> Stack income across referrals</li>
                                    </ul>
                                    <button onClick={() => setServiceModal('Cleaning')} className="w-full py-3 bg-white text-teal-700 font-bold rounded-xl hover:bg-white/90 transition-all active:scale-95 flex items-center justify-center gap-2">
                                        + Refer Cleaning →
                                    </button>
                                </div>
                            </div>

                            {/* Maintenance */}
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 via-orange-500 to-orange-600 text-white p-6 shadow-lg hover:shadow-2xl transition-shadow">
                                <div className="absolute -right-8 -top-8 w-40 h-40 bg-yellow-300/30 rounded-full blur-2xl"></div>
                                <div className="relative z-10 space-y-4">
                                    <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                        <Icon name="userPlus" className="w-3.5 h-3.5" /> Per Gig · One-off
                                    </div>
                                    <h3 className="text-2xl font-extrabold leading-tight">🛠️ Refer Maintenance</h3>
                                    <p className="text-white/90 text-sm leading-relaxed">TaskMe Interiors delivers maintenance, renovation and interior design for residential &amp; commercial.</p>
                                    <div className="text-4xl font-black tracking-tight">10%</div>
                                    <p className="text-xs text-white/80">of the maintenance / renovation gig value.</p>
                                    <ul className="space-y-1.5 text-sm">
                                        <li className="flex gap-2"><span>✓</span> Small repairs to full renovations</li>
                                        <li className="flex gap-2"><span>✓</span> Interior design &amp; fit-outs</li>
                                        <li className="flex gap-2"><span>✓</span> Residential &amp; commercial</li>
                                    </ul>
                                    <button onClick={() => setServiceModal('Maintenance')} className="w-full py-3 bg-white text-orange-700 font-bold rounded-xl hover:bg-white/90 transition-all active:scale-95 flex items-center justify-center gap-2">
                                        + Refer Maintenance →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            <ReferServiceModal open={!!serviceModal} onClose={() => setServiceModal(null)} serviceType={serviceModal || 'Security'} />


            {/* TAB: CALCULATOR */}
            {activeTab === 'Calculator' && (
                <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-200 animate-fade-in max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-900 mb-3">Income Simulator</h2>
                        <p className="text-gray-500">Adjust the sliders to see your potential monthly and annual earnings.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        <div className="space-y-10">
                            {/* Sliders */}
                            <div>
                                <div className="flex justify-between mb-4 items-end">
                                    <label className="text-sm font-bold text-gray-700">Vacant Houses Filled</label>
                                    <div className="text-right">
                                        <span className="text-2xl font-bold text-blue-600">{calcState.tenantsReferred}</span>
                                        <span className="text-xs text-gray-400 block">units</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" min="0" max="50" value={calcState.tenantsReferred} 
                                    onChange={e => setCalcState({...calcState, tenantsReferred: parseInt(e.target.value)})}
                                    className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700"
                                />
                                <p className="text-xs text-gray-500 mt-2 font-medium">Commission: KES 200 per unit</p>
                            </div>

                            <div>
                                <div className="flex justify-between mb-4 items-end">
                                    <label className="text-sm font-bold text-gray-700">Landlords Referred</label>
                                    <div className="text-right">
                                        <span className="text-2xl font-bold text-purple-600">{calcState.landlordsReferred}</span>
                                        <span className="text-xs text-gray-400 block">landlords</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" min="0" max="10" value={calcState.landlordsReferred} 
                                    onChange={e => setCalcState({...calcState, landlordsReferred: parseInt(e.target.value)})}
                                    className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-purple-600 hover:accent-purple-700"
                                />
                                <p className="text-xs text-gray-500 mt-2 font-medium">Portfolio Rent Roll: KES {calcState.landlordPortfolioValue.toLocaleString()}/mo</p>
                            </div>

                            <div>
                                <div className="flex justify-between mb-4 items-end">
                                    <label className="text-sm font-bold text-gray-700">Investors Referred</label>
                                    <div className="text-right">
                                        <span className="text-2xl font-bold text-orange-600">{calcState.investorsReferred}</span>
                                        <span className="text-xs text-gray-400 block">investors</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" min="0" max="20" value={calcState.investorsReferred} 
                                    onChange={e => setCalcState({...calcState, investorsReferred: parseInt(e.target.value)})}
                                    className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-600 hover:accent-orange-700"
                                />
                                <p className="text-xs text-gray-500 mt-2 font-medium">Avg Investment: KES {Number(calcState.investmentAmount ?? 0).toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Result */}
                        <div className="bg-gray-50 p-8 rounded-3xl border border-gray-200 flex flex-col justify-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <Icon name="revenue" className="w-48 h-48 text-gray-900" />
                            </div>
                            
                            <h3 className="text-gray-500 font-bold uppercase text-xs tracking-widest text-center mb-6 z-10">Estimated Annual Earnings</h3>
                            <div className="text-center mb-10 z-10">
                                <span className="text-6xl font-extrabold text-gray-900 tracking-tight">KES {Number(potentialEarnings.total ?? 0).toLocaleString()}</span>
                            </div>
                            
                            <div className="space-y-4 text-sm z-10">
                                <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                                    <span className="text-gray-600 font-medium">Tenant Comm.</span>
                                    <span className="font-bold text-blue-600 text-lg">KES {Number(potentialEarnings.breakdown?.tenant ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                                    <span className="text-gray-600 font-medium">Landlord Comm.</span>
                                    <span className="font-bold text-purple-600 text-lg">KES {Number(potentialEarnings.breakdown?.landlord ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                                    <span className="text-gray-600 font-medium">Investor Comm.</span>
                                    <span className="font-bold text-orange-600 text-lg">KES {Number(potentialEarnings.breakdown?.investor ?? 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'History' && (
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-200 animate-fade-in max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-2xl font-bold text-gray-900">Referral History</h3>
                        <button className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                            <Icon name="download" className="w-4 h-4" /> Export CSV
                        </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 rounded-l-xl">Date</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4">Details</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-right rounded-r-xl">Earned</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {referralHistory.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-gray-600 font-medium">{item.date}</td>
                                        <td className="px-6 py-4">
                                            <span className={`text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wide ${
                                                item.type === 'Tenant' ? 'bg-blue-100 text-blue-700' :
                                                item.type === 'Investor' ? 'bg-orange-100 text-orange-700' :
                                                'bg-purple-100 text-purple-700'
                                            }`}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{item.detail}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                                                item.status === 'Successful' || item.status === 'Active' 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                    item.status === 'Successful' || item.status === 'Active' ? 'bg-green-500' : 'bg-yellow-500'
                                                }`}></span>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-900">KES {item.earned.toLocaleString()}</td>
                                    </tr>
                                ))}
                                {referralHistory.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center">
                                            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Icon name="info" className="w-8 h-8 text-gray-400" />
                                            </div>
                                            <p className="text-gray-900 font-bold text-lg mb-1">No referrals yet</p>
                                            <p className="text-gray-500">Share your referral link to start earning commissions!</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReferAndGrow;
