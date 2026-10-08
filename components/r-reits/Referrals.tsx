
import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { websiteLinks } from '../../utils/websiteLinks';

const Referrals: React.FC = () => {
    const { renovationInvestors, investments, rfTransactions, currentUser } = useData();
    const [activeTab, setActiveTab] = useState<'Investor' | 'Landlord'>('Investor');
    const [copied, setCopied] = useState(false);
    
    // Calculator State
    const [calcInvestment, setCalcInvestment] = useState(500000);
    const [calcRentRoll, setCalcRentRoll] = useState(200000);

    const referralCode = useMemo(() => {
        const u = currentUser as { id?: string; email?: string } | null;
        if (u?.id) return String(u.id).replace(/-/g, '').slice(0, 12).toUpperCase();
        if (u?.email) return u.email.split('@')[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'TASKME';
        return 'TASKME';
    }, [currentUser]);

    const investorLink = websiteLinks.invest(referralCode);
    const landlordLink = websiteLinks.landlord(referralCode);
    const currentLink = activeTab === 'Investor' ? investorLink : landlordLink;

    const liveStats = useMemo(() => {
        const referred = (renovationInvestors || []).filter(i => !!i.referrerId);
        const totalCommission = (rfTransactions || [])
            .filter(t => t.type === 'Referral Commission' && t.status === 'Completed')
            .reduce((s, t) => s + (t.amount || 0), 0);
        return { count: referred.length, commission: totalCommission };
    }, [renovationInvestors, rfTransactions]);

    const referralRows = useMemo(() => {
        const referred = (renovationInvestors || []).filter(i => !!i.referrerId);
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        return referred.map(referee => {
            const activeBalance = (investments || [])
                .filter(i => i.investorId === referee.id && i.status === 'Active')
                .reduce((s, i) => s + i.amount, 0);
            const monthlyCommission = (rfTransactions || [])
                .filter(t => {
                    if (t.type !== 'Referral Commission' || t.status !== 'Completed') return false;
                    const d = new Date(t.date);
                    if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== m) return false;
                    const blob = `${t.description || ''} ${t.partyName || ''}`.toLowerCase();
                    return blob.includes(String(referee.name || '').toLowerCase().split(/\s+/)[0] || '_');
                })
                .reduce((s, t) => s + (t.amount || 0), 0);
            return {
                name: referee.name,
                activeBalance,
                monthlyCommission,
            };
        });
    }, [renovationInvestors, investments, rfTransactions]);

    const handleCopy = () => {
        navigator.clipboard.writeText(currentLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = (platform: string) => {
        const text = activeTab === 'Investor' 
            ? "Earn 30% APY with TaskMe Renovation Funds. Secure real estate investing." 
            : "Automate your property management with TaskMe Realty.";
        const url = encodeURIComponent(currentLink);
        const encodedText = encodeURIComponent(text);
        
        if (platform === 'whatsapp') window.open(`https://wa.me/?text=${encodedText}%20${url}`, '_blank');
        if (platform === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${url}`, '_blank');
    };

    // Earnings Calcs
    const estInvestorComm = calcInvestment * 0.025; // 2.5% one-off
    const estLandlordComm = (calcRentRoll * 0.08) * 0.10 * 12; // 10% of Agency Fee (8%) * 12 Months

    const handleBack = () => {
        const isPartial = window.location.hash.includes('/partial-rms') || window.location.pathname.includes('/partial-rms');
        if (currentUser?.role === 'Investor') {
            window.location.hash = isPartial ? '#/partial-rms/r-reits/investor-dashboard' : '#/user-app-portal/investors-portal';
        } else {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.hash = isPartial ? '#/partial-rms/dashboard' : '#/dashboard';
            }
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-fade-in">
            {/* Back Navigation */}
            <div className="flex justify-between items-center">
                 <button onClick={handleBack} className="group flex items-center text-sm font-bold text-gray-500 hover:text-primary transition-colors">
                    <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back
                </button>
                <div className="bg-yellow-50 text-yellow-700 px-4 py-1.5 rounded-full text-xs font-bold border border-yellow-200 flex items-center shadow-sm">
                    <Icon name="check" className="w-4 h-4 mr-1.5" /> Gold Tier Member
                </div>
            </div>

            {/* Hero / Stats Section */}
            <div className="bg-gradient-to-br from-gray-900 via-[#1e293b] to-blue-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-12 opacity-10 transform translate-x-10 -translate-y-10">
                    <Icon name="reits" className="w-64 h-64 text-white" />
                </div>
                
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                    <div className="lg:col-span-2">
                        <h1 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">
                            Unlock <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">Passive Income</span> <br/> Through Your Network
                        </h1>
                        <p className="text-gray-300 text-lg mb-8 max-w-lg">
                            Whether you refer investors or property owners, you earn significant commissions directly to your wallet.
                        </p>
                        <div className="flex gap-6">
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Total Earned</p>
                                <p className="text-3xl font-bold text-white">KES {Number(liveStats.commission).toLocaleString()}</p>
                            </div>
                            <div className="w-px bg-gray-700"></div>
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Referred investors</p>
                                <p className="text-3xl font-bold text-white">{liveStats.count}</p>
                            </div>
                        </div>
                    </div>

                    {/* Progress Card */}
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-xl">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-gray-200">Next Tier: Platinum</span>
                            <span className="text-xs font-mono text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">+0.5% Bonus</span>
                        </div>
                        <div className="w-full bg-gray-700 h-2 rounded-full mb-4">
                            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.5)]" style={{ width: '75%' }}></div>
                        </div>
                        <p className="text-xs text-gray-400">Refer <strong>2 more investors</strong> or <strong>1 landlord</strong> to level up and increase your commission rates.</p>
                    </div>
                </div>
            </div>

            {/* Main Action Area */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Left: Campaign Selector */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="flex border-b border-gray-100">
                            <button 
                                onClick={() => setActiveTab('Investor')}
                                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'Investor' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                <Icon name="revenue" className="w-5 h-5" /> Refer Investors
                            </button>
                            <button 
                                onClick={() => setActiveTab('Landlord')}
                                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'Landlord' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                <Icon name="landlords" className="w-5 h-5" /> Refer Landlords
                            </button>
                        </div>

                        <div className="p-8">
                            <div className="flex items-start gap-4 mb-6">
                                <div className={`p-3 rounded-xl ${activeTab === 'Investor' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                    <Icon name={activeTab === 'Investor' ? 'reits' : 'branch'} className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-1">
                                        {activeTab === 'Investor' ? 'Invite to Renovation Funds' : 'Invite Property Owners'}
                                    </h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">
                                        {activeTab === 'Investor' 
                                            ? 'Earn a 2.5% commission on every shilling your friends invest. They get high-yield returns; you get instant cash.'
                                            : 'Know a landlord? Refer them to our management service and earn 10% of our agency fee every month for the life of the contract.'}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-2 rounded-xl border border-gray-200 flex items-center gap-2 mb-6">
                                <div className="flex-grow bg-white px-4 py-3 rounded-lg border border-gray-100 text-gray-600 font-mono text-sm truncate">
                                    {currentLink}
                                </div>
                                <button 
                                    onClick={handleCopy}
                                    className={`px-6 py-3 rounded-lg font-bold text-white transition-all shadow-md ${copied ? 'bg-green-600' : 'bg-gray-900 hover:bg-black'}`}
                                >
                                    {copied ? 'Copied!' : 'Copy Link'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => handleShare('whatsapp')} className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366]/10 text-[#25D366] font-bold rounded-lg hover:bg-[#25D366]/20 transition-colors">
                                    <Icon name="communication" className="w-5 h-5" /> WhatsApp
                                </button>
                                <button onClick={() => handleShare('twitter')} className="flex items-center justify-center gap-2 py-2.5 bg-[#1DA1F2]/10 text-[#1DA1F2] font-bold rounded-lg hover:bg-[#1DA1F2]/20 transition-colors">
                                    Share on X
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* History Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800">Recent Referrals</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="px-6 py-3">Name</th>
                                        <th className="px-6 py-3 text-right">Investment</th>
                                        <th className="px-6 py-3 text-right">Your Cut</th>
                                        <th className="px-6 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {referralRows.map((ref, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{ref.name}</td>
                                            <td className="px-6 py-4 text-right text-gray-500">KES {Number(ref.activeBalance ?? 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right font-bold text-green-600">+KES {Number(ref.monthlyCommission ?? 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Active</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {referralRows.length === 0 && (
                                        <tr><td colSpan={4} className="p-8 text-center text-gray-400">No referrals yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right: Calculator */}
                <div className="lg:col-span-5">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 sticky top-24">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
                                <Icon name="revenue" className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">Earnings Calculator</h3>
                            <p className="text-sm text-gray-500">Simulate your potential income</p>
                        </div>

                        {activeTab === 'Investor' ? (
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between mb-2 text-sm">
                                        <span className="text-gray-600 font-medium">Friend Invests</span>
                                        <span className="font-bold text-blue-600">KES {Number(calcInvestment ?? 0).toLocaleString()}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="5000" 
                                        max="5000000" 
                                        step="5000" 
                                        value={calcInvestment} 
                                        onChange={(e) => setCalcInvestment(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl text-center border border-blue-100">
                                    <p className="text-xs text-blue-600 uppercase font-bold mb-1">You Earn (One-Off)</p>
                                    <p className="text-3xl font-extrabold text-blue-900">KES {Number(estInvestorComm ?? 0).toLocaleString()}</p>
                                </div>
                                <p className="text-xs text-gray-400 text-center">Based on 2.5% Commission Rate</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between mb-2 text-sm">
                                        <span className="text-gray-600 font-medium">Property Rent Roll</span>
                                        <span className="font-bold text-purple-600">KES {Number(calcRentRoll ?? 0).toLocaleString()} /mo</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="50000" 
                                        max="2000000" 
                                        step="10000" 
                                        value={calcRentRoll} 
                                        onChange={(e) => setCalcRentRoll(Number(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                </div>
                                <div className="bg-purple-50 p-4 rounded-xl text-center border border-purple-100">
                                    <p className="text-xs text-purple-600 uppercase font-bold mb-1">You Earn (Per Year)</p>
                                    <p className="text-3xl font-extrabold text-purple-900">KES {Number(estLandlordComm ?? 0).toLocaleString()}</p>
                                    <p className="text-xs text-purple-700 mt-1 font-medium">Paid Monthly: KES {(Number(estLandlordComm ?? 0)/12).toLocaleString()}</p>
                                </div>
                                <p className="text-xs text-gray-400 text-center">Based on 10% of Agency Fees (Recurring)</p>
                            </div>
                        )}
                        
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <button onClick={() => handleShare('whatsapp')} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-md">
                                Start Earning Now
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Referrals;
