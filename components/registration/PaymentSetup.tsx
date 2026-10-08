
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { supabase } from '../../utils/supabaseClient';
import { getSupabaseSession } from '../../utils/supabaseClient';
import { useData } from '../../context/DataContext';

const PaymentSetup: React.FC = () => {
    const { properties, landlords, systemSettings, updateSystemSettings } = useData();
    const [activeTab, setActiveTab] = useState<'paybills' | 'mpesa' | 'airtel' | 'bank'>('paybills');
    const [stkTestPhone, setStkTestPhone] = useState('');
    const [stkTestBusy, setStkTestBusy] = useState(false);
    const [stkTestMsg, setStkTestMsg] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const session = await getSupabaseSession();
            const p = (session?.user?.user_metadata as any)?.phone;
            if (!cancelled && p) setStkTestPhone(String(p));
        })();
        return () => { cancelled = true; };
    }, []);

    // Agency primary paybill (editable, persisted in systemSettings)
    const [agencyPaybill, setAgencyPaybill] = useState(systemSettings?.agencyPaybill || '');
    const [agencyPaybillSaved, setAgencyPaybillSaved] = useState(false);

    // Keep local field in sync if systemSettings loads asynchronously
    useEffect(() => {
        if (systemSettings?.agencyPaybill) setAgencyPaybill(systemSettings.agencyPaybill);
    }, [systemSettings?.agencyPaybill]);

    const handleSaveAgencyPaybill = () => {
        updateSystemSettings({ ...systemSettings, agencyPaybill });
        setAgencyPaybillSaved(true);
        setTimeout(() => setAgencyPaybillSaved(false), 2500);
    };

    // M-Pesa Mock State
    const [mpesaConfig, setMpesaConfig] = useState({
        paybill: systemSettings?.agencyPaybill || '522522',
        till: '',
        consumerKey: '••••••••••••••••••••',
        consumerSecret: '••••••••••••••••••••',
        passkey: '••••••••••••••••••••',
        environment: 'Sandbox (Testing)',
        logic: 'C2B Paybill'
    });

    // Airtel Mock State
    const [airtelConfig, setAirtelConfig] = useState({
        partnerId: 'PARTNER123',
        clientId: '••••••••••••••••••••',
        clientSecret: '••••••••••••••••••••',
        grantType: 'CLIENT_CREDENTIALS',
        environment: 'OpenAPI Sandbox'
    });

    // Bank Accounts Array State
    const [bankAccounts, setBankAccounts] = useState([
        { id: 'ba1', bankName: 'KCB Bank', accountName: 'TaskMe Realty Ltd', accountNumber: '1100 0000 00', branch: 'NAIROBI CBD BRANCH' }
    ]);
    const [newBank, setNewBank] = useState({ bankName: '', accountName: '', accountNumber: '', branch: '' });
    const [isAddingBank, setIsAddingBank] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Partial management properties — derive from context
    const partialProperties = properties.filter(p => p.managementType === 'Partial');

    const handleMpesaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setMpesaConfig({ ...mpesaConfig, [e.target.name]: e.target.value });
    };

    const handleAirtelChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setAirtelConfig({ ...airtelConfig, [e.target.name]: e.target.value });
    };

    const handleNewBankChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewBank({ ...newBank, [e.target.name]: e.target.value });
    };

    const handleAddOrUpdateBank = () => {
        if (!newBank.bankName || !newBank.accountNumber) {
            alert('Please fill in at least Bank Name and Account Number.');
            return;
        }
        if (editingId) {
            setBankAccounts(prev => prev.map(acc => acc.id === editingId ? { ...acc, ...newBank } : acc));
            alert('Bank account updated successfully.');
        } else {
            setBankAccounts([...bankAccounts, { id: `ba-${Date.now()}`, ...newBank }]);
            alert('Bank account added successfully.');
        }
        setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
        setIsAddingBank(false);
        setEditingId(null);
    };

    const handleEditBank = (bank: typeof bankAccounts[0]) => {
        setNewBank({ bankName: bank.bankName, accountName: bank.accountName, accountNumber: bank.accountNumber, branch: bank.branch });
        setEditingId(bank.id);
        setIsAddingBank(true);
    };

    const removeBankAccount = (id: string) => {
        if (confirm('Are you sure you want to remove this bank account?')) {
            setBankAccounts(prev => prev.filter(acc => acc.id !== id));
            if (editingId === id) {
                setIsAddingBank(false);
                setEditingId(null);
                setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
            }
        }
    };

    const handleCancelBankForm = () => {
        setIsAddingBank(false);
        setEditingId(null);
        setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
    };

    const handleSave = () => {
        alert('Settings Saved Successfully!');
    };

    const handleTestStk = async () => {
        setStkTestMsg(null);
        const session = await getSupabaseSession();
        const uid = session?.user?.id;
        if (!uid) {
            setStkTestMsg('Sign in first. Test STK uses your account id for the payment row in public.payments.');
            return;
        }
        if (!/^(2547|07)\d{8}$/.test(stkTestPhone.replace(/\s/g, ''))) {
            setStkTestMsg('Enter a valid Kenyan M-Pesa number (07… or 2547…).');
            return;
        }
        setStkTestBusy(true);
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone: stkTestPhone, amount: 1, leaseId: null, userId: uid },
            });
            if (error) throw error;
            const id = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!id) throw new Error('CheckoutRequestID missing from STK response');
            setStkTestMsg(`STK push sent. CheckoutRequestID: ${id}. Approve on the handset.`);
        } catch (e: any) {
            let msg = e?.message ?? 'STK request failed.';
            try {
                const ctx = e?.context;
                if (ctx && typeof ctx.json === 'function') {
                    const body = await ctx.json();
                    if (body?.error) msg = String(body.error);
                }
            } catch { /* ignore */ }
            setStkTestMsg(msg);
        } finally {
            setStkTestBusy(false);
        }
    };

    const tabBaseClass = "flex items-center justify-center gap-2 px-6 py-3.5 text-[15px] font-bold border rounded-2xl transition-all cursor-pointer whitespace-nowrap";

    return (
        <div className="w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:pr-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
                <div>
                    <h1 className="text-[36px] font-extrabold text-[#3B1214] tracking-tight">Payment Gateways</h1>
                    <div className="flex items-center gap-3 mt-2">
                        <div className="w-8 h-8 rounded-full bg-[#EAE2E2] flex-shrink-0"></div>
                        <p className="text-[16px] font-medium text-[#7A8699]">Configure rent routing, bank channels, and mobile checkout integrations.</p>
                    </div>
                </div>
            </div>

            <div className="mb-12">
                <button
                    onClick={handleSave}
                    className="bg-[#A81F1F] text-white font-bold text-[15px] px-8 py-3.5 rounded-xl hover:bg-[#8F1A1A] transition-colors shadow-md shadow-[#A81F1F]/20"
                >
                    Save All Changes
                </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-3 mb-10 overflow-x-auto pb-2">
                <div
                    onClick={() => setActiveTab('paybills')}
                    className={`${tabBaseClass} ${activeTab === 'paybills' ? 'bg-[#FAF7FF] text-[#6D32E5] border-[#E9D9FF]' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-50'}`}
                >
                    Gateway Directory
                </div>
                <div
                    onClick={() => setActiveTab('mpesa')}
                    className={`${tabBaseClass} ${activeTab === 'mpesa' ? 'bg-[#E8FBEE] text-[#1D915A] border-[#CDEBD8]' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-50'}`}
                >
                    <Icon name="edit" className="w-4 h-4 opacity-70" />
                    M-Pesa Integration
                </div>
                <div
                    onClick={() => setActiveTab('airtel')}
                    className={`${tabBaseClass} ${activeTab === 'airtel' ? 'bg-[#FEF2F2] text-[#D82C2C] border-[#FDE0E0]' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-50'}`}
                >
                    <Icon name="download" className="w-4 h-4 opacity-70" />
                    Airtel Money API
                </div>
                <div
                    onClick={() => setActiveTab('bank')}
                    className={`${tabBaseClass} ${activeTab === 'bank' ? 'bg-[#F0F6FF] text-[#1268F3] border-[#D6E8FF]' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-50'}`}
                >
                    <Icon name="folder" className="w-4 h-4 opacity-70" />
                    Settlement Accounts
                    <span className="ml-1 px-2.5 py-0.5 bg-[#D6E8FF] text-[#1268F3] rounded-full text-[11px] font-extrabold">{bankAccounts.length}</span>
                </div>
            </div>

            <div className="bg-white">

                {/* ── Gateway Directory (Paybills) ─────────────────────────────────────── */}
                {activeTab === 'paybills' && (
                    <div className="max-w-[900px] space-y-12 animate-fade-in-up">
                        {/* Information Card */}
                        <div className="bg-[#FAF8FF] p-8 rounded-[24px] border border-[#F2EEFA] flex items-start gap-5">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-[#F2EEFA] flex-shrink-0 mt-0.5">
                                <Icon name="info" className="w-5 h-5 text-[#6D32E5]" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-[#1C1635] text-[18px] mb-2">Real-time Settlement Routing</h3>
                                <p className="text-[#514B6B] text-[15px] leading-relaxed">
                                    Configure your <strong className="font-semibold text-[#1C1635]">Primary Collection Gateway</strong>. In this self-managed ecosystem, tenant payments route instantly to your specified channels. Individual property overrides allow directing income to specific landlord accounts or secondary paybills.
                                </p>
                            </div>
                        </div>

                        {/* Main Portfolio Gateway */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#E8FBEE] flex items-center justify-center">
                                    <div className="w-3 h-3 rounded-full bg-[#1D915A]"></div>
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-[#111827] text-[18px]">Main Portfolio Gateway</h4>
                                    <p className="text-[#6B7280] text-[14px]">Primary shortcode for all self-managed assets</p>
                                </div>
                                <div className="ml-auto">
                                    <span className="px-4 py-2 bg-[#E8FBEE] text-[#1D915A] font-extrabold text-[11px] tracking-widest rounded-full uppercase">Default Global</span>
                                </div>
                            </div>
                            
                            <div className="bg-[#FAF9F6] border border-[#F2EFEA] rounded-[32px] p-8">
                                <label className="block text-[12px] font-extrabold text-[#8A837A] uppercase tracking-widest mb-3">M-Pesa / Mobile Money Shortcode</label>
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <input
                                        type="text"
                                        value={agencyPaybill}
                                        onChange={e => setAgencyPaybill(e.target.value)}
                                        placeholder="e.g. 522522"
                                        className="w-full sm:flex-1 bg-white border border-[#EBE8E3] rounded-2xl px-6 py-4 font-mono text-[#111827] text-[17px] font-bold shadow-sm outline-none focus:border-[#8A837A] placeholder-gray-300 transition-all"
                                    />
                                    <button
                                        onClick={handleSaveAgencyPaybill}
                                        className="w-full sm:w-auto bg-[#2C0A0A] text-white font-bold text-[15px] px-8 py-4 rounded-2xl hover:bg-[#1A0505] transition-colors shadow-sm whitespace-nowrap"
                                    >
                                        {agencyPaybillSaved ? 'Updated!' : 'Update Shortcode'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Property Channel Overrides */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#FFF5ED]"></div>
                                <div>
                                    <h4 className="font-extrabold text-[#111827] text-[18px]">Property Channel Overrides</h4>
                                    <p className="text-[#6B7280] text-[14px]">Direct settlement logic per asset</p>
                                </div>
                                <div className="ml-auto flex items-center gap-4">
                                    <span className="px-4 py-2 bg-[#FFF5ED] text-[#E07223] font-extrabold text-[11px] tracking-widest rounded-full uppercase">Custom Routing</span>
                                    <span className="text-[11px] font-extrabold tracking-widest text-gray-400 uppercase">{partialProperties.length} Entities</span>
                                </div>
                            </div>

                            {partialProperties.length === 0 ? (
                                <div className="border-2 border-dashed border-[#E5E7EB] rounded-[32px] p-20 flex flex-col items-center justify-center text-center bg-white mt-4">
                                    <div className="w-16 h-16 bg-[#FAF9F6] rounded-[20px] mb-6 flex items-center justify-center"></div>
                                    <h5 className="font-extrabold text-gray-900 text-[18px] mb-2">No assets requiring specific routing</h5>
                                    <p className="text-gray-500 text-[15px] max-w-sm leading-relaxed">
                                        Register a property to enable individual collection gateways and landlord-direct payouts.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {partialProperties.map(prop => {
                                        const landlord = landlords.find(l => l.id === prop.landlordId);
                                        return (
                                            <div key={prop.id} className="border border-[#E5E7EB] rounded-2xl p-6 bg-white flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-extrabold text-[#111827] text-[16px]">{prop.name}</span>
                                                    </div>
                                                    <p className="text-[14px] text-[#6B7280]">
                                                        Owner: <span className="font-bold text-[#374151]">{landlord?.name || '—'}</span>
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-6 sm:justify-end">
                                                    <div className="text-left sm:text-right">
                                                        <p className="text-[11px] font-extrabold text-[#9CA3AF] uppercase tracking-widest mb-1.5">Gateway</p>
                                                        <p className="font-mono font-bold text-[#D97736] text-[16px]">
                                                            {prop.landlordPaybill || <span className="text-gray-400 font-medium font-sans text-sm">Default Global</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── M-Pesa Integration ────────────────────────────────────── */}
                {activeTab === 'mpesa' && (
                    <div className="max-w-[1100px] space-y-12 animate-fade-in-up">
                        <div className="bg-[#E8FBEE] p-8 rounded-[24px] border border-[#CDEBD8] flex items-start gap-5">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-[#CDEBD8] flex-shrink-0 mt-0.5">
                                <Icon name="info" className="w-5 h-5 text-[#1D915A]" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-[#0D5B37] text-[18px] mb-2">M-Pesa Daraja C2B Integration</h3>
                                <p className="text-[#15784A] text-[15px] leading-relaxed">
                                    Configure secure automated checkouts. Rent collection can be automated via STK push, sending instant prompts to tenant handsets on their billing dates.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-12">
                            {/* Left Column Fields */}
                            <div className="flex-1 space-y-12">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Traffic Environment</label>
                                        <input
                                            value={mpesaConfig.environment}
                                            readOnly
                                            className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none focus:border-[#1E9961]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Shortcode Logic</label>
                                        <input
                                            value={mpesaConfig.logic}
                                            readOnly
                                            className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none focus:border-[#1E9961]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Business Number</label>
                                        <input
                                            name="paybill"
                                            value={mpesaConfig.paybill}
                                            onChange={handleMpesaChange}
                                            className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none focus:border-[#1E9961]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Till Number <span className="text-[#9CA3AF]">(Secondary)</span></label>
                                        <input
                                            name="till"
                                            value={mpesaConfig.till}
                                            onChange={handleMpesaChange}
                                            placeholder="e.g. 123456"
                                            className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none focus:border-[#1E9961] placeholder:text-gray-300"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-10 h-10 rounded-2xl bg-[#F3F4F6]"></div>
                                        <h4 className="font-extrabold text-[#111827] text-[18px]">Daraja App Credentials</h4>
                                    </div>
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Consumer Key</label>
                                            <input
                                                name="consumerKey"
                                                type="text"
                                                value={mpesaConfig.consumerKey}
                                                onChange={handleMpesaChange}
                                                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-800 text-[18px] tracking-widest outline-none focus:border-[#1E9961]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Consumer Secret</label>
                                            <input
                                                name="consumerSecret"
                                                type="text"
                                                value={mpesaConfig.consumerSecret}
                                                onChange={handleMpesaChange}
                                                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-800 text-[18px] tracking-widest outline-none focus:border-[#1E9961]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Lipa Na M-Pesa Passkey</label>
                                            <input
                                                name="passkey"
                                                type="text"
                                                value={mpesaConfig.passkey}
                                                onChange={handleMpesaChange}
                                                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-800 text-[18px] tracking-widest outline-none focus:border-[#1E9961]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column Phone Mockup */}
                            <div className="lg:w-[360px] flex-shrink-0 lg:pt-0 pt-8">
                                <div className="bg-[#2B0E0E] rounded-[48px] p-8 relative shadow-2xl overflow-hidden min-h-[550px] flex flex-col">
                                    <div className="flex items-center gap-4 mb-10 mt-6 relative z-10 pl-2">
                                        <div className="w-12 h-12 rounded-full bg-[rgba(163,22,22,0.2)] flex items-center justify-center border border-[rgba(163,22,22,0.3)]">
                                            <div className="w-3 h-3 rounded-full bg-[#DE2828]"></div>
                                        </div>
                                        <h4 className="font-extrabold text-white text-[24px] leading-tight tracking-tight">Sandbox<br/>Pilot</h4>
                                    </div>

                                    <div className="bg-[#160606]/40 border border-[#A31616]/20 rounded-[28px] p-6 relative z-10 backdrop-blur-sm shadow-inner flex-1 flex flex-col justify-center">
                                        <label className="block text-[10px] uppercase font-extrabold text-white/50 tracking-widest mb-6">Manual STK Trigger</label>
                                        
                                        <div className="mb-6">
                                            <label className="block text-[10px] uppercase font-extrabold text-white/70 tracking-widest mb-2 px-1">Phone Number</label>
                                            <input
                                                type="tel"
                                                value={stkTestPhone}
                                                onChange={e => setStkTestPhone(e.target.value)}
                                                placeholder="07XXXXXXXX"
                                                className="w-full bg-[#130303] border border-[#421313] rounded-xl px-4 py-4 text-white text-[15px] font-bold outline-none focus:border-[#DE2828] placeholder:text-white/20 text-center tracking-widest"
                                            />
                                        </div>
                                        
                                        <button
                                            onClick={handleTestStk}
                                            disabled={stkTestBusy}
                                            className="w-full bg-[#A82020] text-white font-extrabold text-[15px] py-4 rounded-xl shadow-[0_0_20px_rgba(168,32,32,0.3)] hover:bg-[#C92929] transition-all disabled:opacity-50 tracking-wide"
                                        >
                                            {stkTestBusy ? 'Executing...' : 'Execute Push (KES 1)'}
                                        </button>

                                        {stkTestMsg && (
                                            <p className="text-[12px] text-white/80 mt-6 leading-relaxed bg-[#130303]/80 p-4 rounded-xl border border-[#A82020]/30 text-center">{stkTestMsg}</p>
                                        )}
                                    </div>

                                    <p className="text-[12px] text-white/40 italic mt-8 text-center leading-relaxed relative z-10 px-4">
                                        Production keys are stored in encrypted environment variables. Test pushes will use the configured sandbox shortcode.
                                    </p>

                                    {/* Decorative background glow */}
                                    <div className="absolute top-0 right-0 w-72 h-72 bg-[#A82020]/20 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Airtel Money API ──────────────────────────────────────── */}
                {activeTab === 'airtel' && (
                    <div className="max-w-[1100px] space-y-12 animate-fade-in-up">
                        <div className="bg-[#FEF2F2] p-8 rounded-[24px] border border-[#FDE0E0] flex items-start gap-5">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-[#FDE0E0] flex-shrink-0 mt-0.5">
                                <Icon name="info" className="w-5 h-5 text-[#C22323]" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-[#7F1D1D] text-[18px] mb-2">Airtel Money OpenAPI</h3>
                                <p className="text-[#991B1B] text-[15px] leading-relaxed">
                                    Configure secondary mobile gateways for multi-channel reach. Supports B2C and C2B payment flows across East Africa.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
                            {/* Left Column Configuration */}
                            <div className="flex-1 space-y-10">
                                <div>
                                    <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">API Environment</label>
                                    <input
                                        value={airtelConfig.environment}
                                        readOnly
                                        className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Vendor Partner ID</label>
                                    <input
                                        name="partnerId"
                                        value={airtelConfig.partnerId}
                                        onChange={handleAirtelChange}
                                        className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none focus:border-[#D42B2B]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Grant Protocol</label>
                                    <input
                                        name="grantType"
                                        value={airtelConfig.grantType}
                                        readOnly
                                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-5 py-4 text-gray-500 text-[15px] font-bold outline-none"
                                    />
                                </div>
                            </div>

                            {/* Right Column Secure Keys */}
                            <div className="flex-1">
                                <div className="bg-[#FAFAFB] border border-[#F0F2F5] rounded-[32px] p-10 h-full">
                                    <h4 className="font-extrabold text-gray-900 text-[18px] mb-10">Secure Auth Keys</h4>
                                    
                                    <div className="space-y-10">
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Public ID</label>
                                            <input
                                                name="clientId"
                                                type="text"
                                                value={airtelConfig.clientId}
                                                onChange={handleAirtelChange}
                                                className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-900 text-[18px] tracking-widest shadow-sm outline-none focus:border-[#D42B2B]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Security Secret</label>
                                            <input
                                                name="clientSecret"
                                                type="text"
                                                value={airtelConfig.clientSecret}
                                                onChange={handleAirtelChange}
                                                className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-900 text-[18px] tracking-widest shadow-sm outline-none focus:border-[#D42B2B]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Bank Accounts (Settlement) ─────────────────────────────────────────── */}
                {activeTab === 'bank' && (
                    <div className="max-w-[1100px] space-y-12 animate-fade-in-up">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-[#F3F4F6] pb-8">
                            <div>
                                <h3 className="font-extrabold text-[#111827] text-[22px]">Relational Accounts</h3>
                                <p className="text-[#6B7280] text-[15px] mt-1.5 font-medium">Manage bank destinations for bulk settlement and escrow transfers.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingId(null);
                                    setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
                                    setIsAddingBank(true);
                                }}
                                className="px-8 py-4 bg-[#2A0808] text-white text-[15px] font-bold rounded-2xl hover:bg-[#1A0505] transition-colors shadow-sm whitespace-nowrap"
                            >
                                New Settlement Account
                            </button>
                        </div>

                        {isAddingBank && (
                            <div className="p-10 bg-[#FAFAFB] border border-[#E5E7EB] rounded-[32px] shadow-sm animate-fade-in-up mb-10">
                                <h4 className="font-extrabold text-gray-900 text-[18px] mb-8">{editingId ? 'Edit Relational Account' : 'Register Relational Account'}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Bank Name</label>
                                        <input name="bankName" value={newBank.bankName} onChange={handleNewBankChange} className="w-full bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 text-[15px] font-bold shadow-sm outline-none focus:border-[#1268F3]" placeholder="e.g. Equity Bank" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Account Name</label>
                                        <input name="accountName" value={newBank.accountName} onChange={handleNewBankChange} className="w-full bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 text-[15px] font-bold shadow-sm outline-none focus:border-[#1268F3]" placeholder="e.g. TaskMe Realty Ltd" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Account Number</label>
                                        <input name="accountNumber" value={newBank.accountNumber} onChange={handleNewBankChange} className="w-full bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 text-[15px] font-mono font-bold shadow-sm outline-none focus:border-[#1268F3]" placeholder="0000 0000 00" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Branch</label>
                                        <input name="branch" value={newBank.branch} onChange={handleNewBankChange} className="w-full bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 text-[15px] font-bold shadow-sm outline-none focus:border-[#1268F3]" placeholder="e.g. Westlands" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-4 mt-10">
                                    <button onClick={handleCancelBankForm} className="px-8 py-4 bg-white border border-[#E5E7EB] text-gray-700 rounded-2xl hover:bg-gray-50 font-bold text-[15px] transition-colors">Cancel</button>
                                    <button onClick={handleAddOrUpdateBank} className="px-8 py-4 bg-[#1268F3] text-white rounded-2xl hover:bg-[#0E52C2] font-bold text-[15px] shadow-sm transition-colors">
                                        {editingId ? 'Save Changes' : 'Confirm Registration'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {bankAccounts.map(bank => (
                                <div key={bank.id} className="border border-[#E5E7EB] rounded-[32px] p-8 bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative group flex flex-col justify-between" style={{ minHeight: '220px' }}>
                                    <div className="absolute top-8 right-8 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEditBank(bank)} className="w-10 h-10 bg-[#F0F6FF] text-[#1268F3] rounded-xl flex items-center justify-center hover:bg-[#D6E8FF] transition-colors" title="Edit">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                            </svg>
                                        </button>
                                        <button onClick={() => removeBankAccount(bank.id)} className="w-10 h-10 bg-[#FEF2F2] text-[#D82C2C] rounded-xl flex items-center justify-center hover:bg-[#FDE0E0] transition-colors" title="Remove">
                                            <Icon name="close" className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div>
                                        <div className="w-12 h-12 rounded-2xl bg-[#F0F6FF] flex items-center justify-center mb-6">
                                            <Icon name="folder" className="w-6 h-6 text-[#1268F3]" />
                                        </div>
                                        <h4 className="font-extrabold text-[#111827] text-[18px] mb-1">{bank.bankName}</h4>
                                        <p className="font-mono font-bold text-gray-500 tracking-widest text-[14px]">{bank.accountNumber}</p>
                                    </div>
                                    
                                    <div className="mt-8 pt-6 border-t border-[#F3F4F6]">
                                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5">Beneficiary Name</p>
                                        <p className="font-bold text-gray-900 text-[14px]">{bank.accountName}</p>
                                        <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mt-1">{bank.branch}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentSetup;
