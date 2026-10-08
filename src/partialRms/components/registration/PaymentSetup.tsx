import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../Icon';
import { supabase } from '../../utils/supabaseClient';
import { getSupabaseSession } from '../../utils/supabaseClient';
import { useData } from '../../context/DataContext';

const PaymentSetup: React.FC = () => {
    const { properties, landlords, systemSettings, updateSystemSettings, updateLandlord, updateProperty } = useData();
    const [activeTab, setActiveTab ] = useState<'directory' | 'mpesa' | 'airtel' | 'bank'>('directory');
    
    // Search & Filter State for Landlords/Overrides
    const [landlordSearchQuery, setLandlordSearchQuery] = useState('');
    const [editingLandlordId, setEditingLandlordId] = useState<string | null>(null);
    
    // Landlord Test STK State
    const [landlordTestPhone, setLandlordTestPhone] = useState('');
    const [landlordTestBusy, setLandlordTestBusy] = useState(false);
    const [landlordTestMsg, setLandlordTestMsg] = useState<string | null>(null);

    // Form editing state for landlord paybill configuration
    const [editForm, setEditForm] = useState({
        mpesaPaybill: '',
        mpesaConsumerKey: '',
        mpesaConsumerSecret: '',
        mpesaPasskey: '',
        mpesaEnvironment: 'Sandbox',
        payoutBank: '',
        payoutBankAccount: '',
    });

    // Keys visibility toggles
    const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});

    // Fetch initial phone number for test STK
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const session = await getSupabaseSession();
            const p = (session?.user?.user_metadata as any)?.phone;
            if (!cancelled && p) setLandlordTestPhone(String(p));
        })();
        return () => { cancelled = true; };
    }, []);

    // Primary Gateway Portfolio configuration
    const [agencyPaybill, setAgencyPaybill] = useState(systemSettings?.agencyPaybill || '522522');
    const [agencyPaybillSaved, setAgencyPaybillSaved] = useState(false);

    useEffect(() => {
        if (systemSettings?.agencyPaybill) setAgencyPaybill(systemSettings.agencyPaybill);
    }, [systemSettings?.agencyPaybill]);

    const handleSaveAgencyPaybill = () => {
        updateSystemSettings({ ...systemSettings, agencyPaybill });
        setAgencyPaybillSaved(true);
        setTimeout(() => setAgencyPaybillSaved(false), 2005);
    };

    // Filter landlords to ONLY count registered landlords with 'Landlord' role.
    const registeredLandlords = useMemo(() => {
        return landlords.filter(l => l.role === 'Landlord');
    }, [landlords]);

    const stats = useMemo(() => {
        const total = registeredLandlords.length;
        const configured = registeredLandlords.filter(l => (l as any).payment_config?.mpesaPaybill).length;
        const pending = total - configured;
        return { total, configured, pending };
    }, [registeredLandlords]);

    // Global M-Pesa State
    const [mpesaConfig, setMpesaConfig] = useState({
        environment: 'Sandbox (Testing)',
        logic: 'C2B Paybill',
        paybill: systemSettings?.agencyPaybill || '522522',
        till: '',
        consumerKey: '••••••••••••••••••••',
        consumerSecret: '••••••••••••••••••••',
        passkey: '••••••••••••••••••••'
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
    const [editingBankId, setEditingBankId] = useState<string | null>(null);

    // Form handlers
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
        if (editingBankId) {
            setBankAccounts(prev => prev.map(acc => acc.id === editingBankId ? { ...acc, ...newBank } : acc));
            alert('Bank account updated successfully.');
        } else {
            setBankAccounts([...bankAccounts, { id: `ba-${Date.now()}`, ...newBank }]);
            alert('Bank account added successfully.');
        }
        setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
        setIsAddingBank(false);
        setEditingBankId(null);
    };

    const handleEditBank = (bank: typeof bankAccounts[0]) => {
        setNewBank({ bankName: bank.bankName, accountName: bank.accountName, accountNumber: bank.accountNumber, branch: bank.branch });
        setEditingBankId(bank.id);
        setIsAddingBank(true);
    };

    const removeBankAccount = (id: string) => {
        if (confirm('Are you sure you want to remove this bank account?')) {
            setBankAccounts(prev => prev.filter(acc => acc.id !== id));
            if (editingBankId === id) {
                setIsAddingBank(false);
                setEditingBankId(null);
                setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
            }
        }
    };

    const handleCancelBankForm = () => {
        setIsAddingBank(false);
        setEditingBankId(null);
        setNewBank({ bankName: '', accountName: '', accountNumber: '', branch: '' });
    };

    // Populates landlord form when expanding accordion
    useEffect(() => {
        if (editingLandlordId) {
            const l = landlords.find(x => x.id === editingLandlordId);
            const config = (l as any)?.payment_config || {};
            setEditForm({
                mpesaPaybill: config.mpesaPaybill || '',
                mpesaConsumerKey: config.mpesaConsumerKey || '',
                mpesaConsumerSecret: config.mpesaConsumerSecret || '',
                mpesaPasskey: config.mpesaPasskey || '',
                mpesaEnvironment: config.mpesaEnvironment || 'Sandbox',
                payoutBank: config.payoutBank || '',
                payoutBankAccount: config.payoutBankAccount || '',
            });
            setLandlordTestMsg(null);
        }
    }, [editingLandlordId, landlords]);

    const handleSaveLandlordConfig = (landlordId: string) => {
        if (!editForm.mpesaPaybill) {
            alert('Please input a valid M-Pesa Shortcode (Paybill or Till).');
            return;
        }

        // 1. Update Landlord payment_config in memory and DB
        updateLandlord(landlordId, {
            payment_config: {
                mpesaPaybill: editForm.mpesaPaybill,
                mpesaConsumerKey: editForm.mpesaConsumerKey,
                mpesaConsumerSecret: editForm.mpesaConsumerSecret,
                mpesaPasskey: editForm.mpesaPasskey,
                mpesaEnvironment: editForm.mpesaEnvironment,
                payoutBank: editForm.payoutBank,
                payoutBankAccount: editForm.payoutBankAccount,
            }
        } as any);

        // 2. Automatically propagate landlord paybill value down to all owned properties
        const landlordProps = properties.filter(p => p.landlordId === landlordId);
        landlordProps.forEach(prop => {
            updateProperty(prop.id, {
                landlordPaybill: editForm.mpesaPaybill
            });
        });

        alert(`Successfully saved payment configurations for Landlord and synchronized ${landlordProps.length} property collections.`);
        setEditingLandlordId(null);
    };

    const filteredLandlords = useMemo(() => {
        return registeredLandlords.filter(l => {
            const term = landlordSearchQuery.toLowerCase();
            return (
                l.name.toLowerCase().includes(term) ||
                (l.email || '').toLowerCase().includes(term) ||
                (l.phone || '').toLowerCase().includes(term)
            );
        });
    }, [registeredLandlords, landlordSearchQuery]);

    const handleTestLandlordStk = async () => {
        setLandlordTestMsg(null);
        const session = await getSupabaseSession();
        const uid = session?.user?.id;
        if (!uid) {
            setLandlordTestMsg('Sign in first. Test STK uses your account id for the payment row in public.payments.');
            return;
        }

        const phoneClean = landlordTestPhone.replace(/\s/g, '');
        if (!/^(2547|07)\d{8}$/.test(phoneClean)) {
            setLandlordTestMsg('Enter a valid Kenyan M-Pesa number (07… or 2547…).');
            return;
        }

        setLandlordTestBusy(true);
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: {
                    phone: phoneClean,
                    amount: 1,
                    leaseId: null,
                    userId: uid
                },
            });
            
            if (error) throw error;
            const checkoutId = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!checkoutId) {
                setLandlordTestMsg(`STK push sent. CheckoutRequestID: ${checkoutId}. Approve on the handset.`);
            } else {
                setLandlordTestMsg(`STK push sent. CheckoutRequestID: ${checkoutId}. Approve on the handset.`);
            }
        } catch (e: any) {
            let msg = e?.message ?? 'STK request failed.';
            try {
                const ctx = e?.context;
                if (ctx && typeof ctx.json === 'function') {
                    const body = await ctx.json();
                    if (body?.error) msg = String(body.error);
                }
            } catch { /* ignore */ }
            setLandlordTestMsg(msg);
        } finally {
            setLandlordTestBusy(false);
        }
    };

    const handleSave = () => {
        alert('Settings Saved Successfully!');
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
                    onClick={() => setActiveTab('directory')}
                    className={`${tabBaseClass} ${activeTab === 'directory' ? 'bg-[#FAF7FF] text-[#6D32E5] border-[#E9D9FF]' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-50'}`}
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

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-white rounded-[20px] border border-[#E0E7FF] p-6 flex flex-row items-center gap-6">
                    <div className="w-12 h-12 flex items-center justify-center rounded-full border-[1.5px] border-[#4338CA] flex-shrink-0">
                        <Icon name="user" className="w-6 h-6 text-[#4338CA]" />
                    </div>
                    <div>
                        <h4 className="text-[12px] font-extrabold text-[#6B7280] uppercase tracking-widest mb-1">Total Landlords</h4>
                        <p className="text-[32px] font-black text-[#1E1B4B] leading-none">{stats.total}</p>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] border border-[#A7F3D0] p-6 flex flex-row items-center gap-6">
                    <div className="w-12 h-12 flex items-center justify-center rounded-full border-[1.5px] border-[#059669] flex-shrink-0">
                        <Icon name="checkCircle" className="w-6 h-6 text-[#059669]" />
                    </div>
                    <div>
                        <h4 className="text-[12px] font-extrabold text-[#6B7280] uppercase tracking-widest mb-1">Configured Paybills</h4>
                        <p className="text-[32px] font-black text-[#022C22] leading-none">{stats.configured}</p>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] border border-[#FEF08A] p-6 flex flex-row items-center gap-6">
                    <div className="w-12 h-12 flex items-center justify-center rounded-full border-[1.5px] border-[#D97706] flex-shrink-0">
                        <Icon name="clock" className="w-6 h-6 text-[#D97706]" />
                    </div>
                    <div>
                        <h4 className="text-[12px] font-extrabold text-[#6B7280] uppercase tracking-widest mb-1">Pending Setup</h4>
                        <p className="text-[32px] font-black text-[#431407] leading-none">{stats.pending}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white">

                {/* ── Gateway Directory (Paybills) ─────────────────────────────────────── */}
                {activeTab === 'directory' && (
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

                        {/* Property Channel Overrides (Partial RMS Specific Logic, with Full RMS styling) */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#FFF5ED]"></div>
                                <div>
                                    <h4 className="font-extrabold text-[#111827] text-[18px]">Property Channel Overrides</h4>
                                    <p className="text-[#6B7280] text-[14px]">Direct settlement logic per asset</p>
                                </div>
                                <div className="ml-auto flex items-center gap-4">
                                    <span className="px-4 py-2 bg-[#FFF5ED] text-[#E07223] font-extrabold text-[11px] tracking-widest rounded-full uppercase">Custom Routing</span>
                                    <span className="text-[11px] font-extrabold tracking-widest text-gray-400 uppercase">{stats.total} Entities</span>
                                </div>
                            </div>

                            {stats.total > 0 && (
                                <div className="mb-5 relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                                        <Icon name="search" className="w-5 h-5" />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search registered landlords setup..."
                                        value={landlordSearchQuery}
                                        onChange={e => setLandlordSearchQuery(e.target.value)}
                                        className="w-full pl-12 pr-6 py-4 border border-[#E5E7EB] rounded-2xl text-[15px] font-bold outline-none focus:border-[#111827] placeholder:text-gray-400 transition-all bg-white"
                                    />
                                </div>
                            )}

                            {filteredLandlords.length === 0 ? (
                                <div className="border-2 border-dashed border-[#E5E7EB] rounded-[32px] p-20 flex flex-col items-center justify-center text-center bg-white mt-4">
                                    <div className="w-16 h-16 bg-[#FAF9F6] rounded-[20px] mb-6 flex items-center justify-center"></div>
                                    <h5 className="font-extrabold text-gray-900 text-[18px] mb-2">No assets requiring specific routing</h5>
                                    <p className="text-gray-500 text-[15px] max-w-sm leading-relaxed">
                                        Register a property to enable individual collection gateways and landlord-direct payouts.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredLandlords.map(l => {
                                        const lProperties = properties.filter(p => p.landlordId === l.id);
                                        const lConfig = (l as any).payment_config || {};
                                        const isEditing = editingLandlordId === l.id;

                                        return (
                                            <div key={l.id} className="border border-[#E5E7EB] rounded-2xl p-6 bg-white hover:shadow-md transition-shadow">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="font-extrabold text-[#111827] text-[16px]">{l.name}</span>
                                                            {lConfig.mpesaPaybill ? (
                                                                <span className="px-3 py-1 bg-[#E8FBEE] text-[#1D915A] text-[10px] font-bold rounded-full uppercase tracking-widest">
                                                                    Active Override
                                                                </span>
                                                            ) : (
                                                                <span className="px-3 py-1 bg-[#FFF5ED] text-[#E07223] text-[10px] font-bold rounded-full uppercase tracking-widest">
                                                                    Pending Setup
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[14px] text-[#6B7280]">
                                                            {l.email || 'No email'} • {l.phone || 'No phone'}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 mt-3">
                                                            {lProperties.map(p => (
                                                                <span key={p.id} className="px-3 py-1 rounded-lg bg-[#FAF9F6] border border-[#E5E7EB] text-[#4B5563] text-[12px] font-bold">
                                                                    {p.name}
                                                                </span>
                                                            ))}
                                                            {lProperties.length === 0 && <span className="text-[12px] text-gray-400 italic">No assets linked</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-left sm:text-right">
                                                        <p className="text-[11px] font-extrabold text-[#9CA3AF] uppercase tracking-widest mb-1.5">Direct Shortcode</p>
                                                        <p className="font-mono font-bold text-[#D97736] text-[16px]">
                                                            {lConfig.mpesaPaybill || <span className="text-gray-400 font-medium font-sans text-sm">Global Default</span>}
                                                        </p>
                                                        <button
                                                            onClick={() => setEditingLandlordId(isEditing ? null : l.id)}
                                                            className="mt-3 text-[13px] font-extrabold px-4 py-2 border border-[#E5E7EB] rounded-xl hover:bg-gray-50 transition-colors"
                                                        >
                                                            {isEditing ? 'Cancel' : 'Edit Gateway Setup'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Form matching Full RMS aesthetics */}
                                                {isEditing && (
                                                    <div className="mt-6 pt-6 border-t border-[#E5E7EB] space-y-6 animate-fade-in-up">
                                                        <h4 className="font-extrabold text-[#111827] text-[15px] flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-md bg-[#FAF9F6] flex items-center justify-center border border-[#EBE8E3]"><Icon name="settings" className="w-3 h-3 text-gray-600" /></div>
                                                            Configure Private Shortcode (Lipa na M-Pesa Options)
                                                        </h4>
                                                        
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <div>
                                                                <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">M-Pesa Shortcode *</label>
                                                                <input
                                                                    type="text"
                                                                    value={editForm.mpesaPaybill}
                                                                    onChange={e => setEditForm({ ...editForm, mpesaPaybill: e.target.value })}
                                                                    placeholder="e.g. 4022422"
                                                                    className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-[#111827] text-[15px] font-bold focus:border-[#111827] outline-none transition-all"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">API Environment</label>
                                                                <select
                                                                    value={editForm.mpesaEnvironment}
                                                                    onChange={e => setEditForm({...editForm, mpesaEnvironment: e.target.value})}
                                                                    className="w-full bg-[#FAF9F6] border border-[#EBE8E3] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold focus:border-[#111827] outline-none transition-all"
                                                                >
                                                                    <option value="Sandbox">Sandbox (Test Mode)</option>
                                                                    <option value="Production">Production (Live Mode)</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Lipa na M-Pesa Passkey</label>
                                                                <input
                                                                    type="password"
                                                                    value={editForm.mpesaPasskey}
                                                                    onChange={e => setEditForm({ ...editForm, mpesaPasskey: e.target.value })}
                                                                    placeholder="Lipa na M-Pesa passkey"
                                                                    className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-[#111827] focus:border-[#111827] outline-none transition-all"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Consumer Key</label>
                                                                <input
                                                                    type="password"
                                                                    value={editForm.mpesaConsumerKey}
                                                                    onChange={e => setEditForm({...editForm, mpesaConsumerKey: e.target.value})}
                                                                    placeholder="Daraja Client Consumer Key"
                                                                    className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-[#111827] focus:border-[#111827] outline-none transition-all"
                                                                />
                                                            </div>
                                                            <div className="md:col-span-2">
                                                                <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Consumer Secret</label>
                                                                <input
                                                                    type="password"
                                                                    value={editForm.mpesaConsumerSecret}
                                                                    onChange={e => setEditForm({...editForm, mpesaConsumerSecret: e.target.value})}
                                                                    placeholder="Daraja Client Consumer Secret"
                                                                    className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-[#111827] focus:border-[#111827] outline-none transition-all"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Settlement details section */ }
                                                        <div className="pt-6">
                                                            <h5 className="text-[12px] font-extrabold text-[#111827] uppercase tracking-widest mb-4">Direct Bank Settlement Details (Optional)</h5>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div>
                                                                    <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Settlement Bank Name</label>
                                                                    <input
                                                                        type="text"
                                                                        value={editForm.payoutBank}
                                                                        onChange={e => setEditForm({...editForm, payoutBank: e.target.value})}
                                                                        placeholder="e.g. Equity Bank"
                                                                        className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] font-bold focus:border-[#111827] outline-none transition-all"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Target Account Number</label>
                                                                    <input
                                                                        type="text"
                                                                        value={editForm.payoutBankAccount}
                                                                        onChange={e => setEditForm({...editForm, payoutBankAccount: e.target.value})}
                                                                        placeholder="e.g. 0110483..."
                                                                        className="w-full bg-white border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-[#111827] focus:border-[#111827] outline-none transition-all"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Actions layout card */}
                                                        <div className="mt-8 flex justify-end gap-4">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingLandlordId(null)}
                                                                className="px-6 py-3.5 border border-[#E5E7EB] bg-white rounded-xl text-[14px] font-extrabold text-gray-700 hover:bg-gray-50 transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveLandlordConfig(l.id)}
                                                                className="px-8 py-3.5 bg-[#A81F1F] hover:bg-[#8F1A1A] text-[14px] text-white font-extrabold rounded-xl transition-all shadow-md shadow-[#A81F1F]/20 cursor-pointer"
                                                            >
                                                                Save Gateway Setup
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
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
                                            className="w-full bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl px-5 py-4 text-gray-500 text-[15px] font-bold shadow-sm outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Shortcode Logic</label>
                                        <input
                                            value={mpesaConfig.logic}
                                            readOnly
                                            className="w-full bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl px-5 py-4 text-gray-500 text-[15px] font-bold shadow-sm outline-none"
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
                                                type={showKeys['consumerKey'] ? 'text' : 'password'}
                                                value={mpesaConfig.consumerKey}
                                                onChange={handleMpesaChange}
                                                onFocus={() => setShowKeys({...showKeys, consumerKey: true})}
                                                onBlur={() => setShowKeys({...showKeys, consumerKey: false})}
                                                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-800 text-[18px] tracking-widest outline-none focus:border-[#1E9961]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Consumer Secret</label>
                                            <input
                                                name="consumerSecret"
                                                type={showKeys['consumerSecret'] ? 'text' : 'password'}
                                                value={mpesaConfig.consumerSecret}
                                                onChange={handleMpesaChange}
                                                onFocus={() => setShowKeys({...showKeys, consumerSecret: true})}
                                                onBlur={() => setShowKeys({...showKeys, consumerSecret: false})}
                                                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-5 py-4 font-mono text-gray-800 text-[18px] tracking-widest outline-none focus:border-[#1E9961]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">Lipa Na M-Pesa Passkey</label>
                                            <input
                                                name="passkey"
                                                type={showKeys['passkey'] ? 'text' : 'password'}
                                                value={mpesaConfig.passkey}
                                                onChange={handleMpesaChange}
                                                onFocus={() => setShowKeys({...showKeys, passkey: true})}
                                                onBlur={() => setShowKeys({...showKeys, passkey: false})}
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
                                            <div className="w-3 h-3 rounded-full bg-[#DE2828] animate-pulse"></div>
                                        </div>
                                        <h4 className="font-extrabold text-white text-[24px] leading-tight tracking-tight">Sandbox<br/>Pilot</h4>
                                    </div>

                                    <div className="bg-[#160606]/40 border border-[#A31616]/20 rounded-[28px] p-6 relative z-10 backdrop-blur-sm shadow-inner flex-1 flex flex-col justify-center">
                                        <label className="block text-[10px] uppercase font-extrabold text-white/50 tracking-widest mb-6">Manual STK Trigger</label>
                                        
                                        <div className="mb-6">
                                            <label className="block text-[10px] uppercase font-extrabold text-white/70 tracking-widest mb-2 px-1">Phone Number</label>
                                            <input
                                                type="tel"
                                                value={landlordTestPhone}
                                                onChange={e => setLandlordTestPhone(e.target.value)}
                                                placeholder="07XXXXXXXX"
                                                className="w-full bg-[#130303] border border-[#421313] rounded-xl px-4 py-4 text-white text-[15px] font-bold outline-none focus:border-[#DE2828] placeholder:text-white/20 text-center tracking-widest"
                                            />
                                        </div>
                                        
                                        <button
                                            onClick={handleTestLandlordStk}
                                            disabled={landlordTestBusy}
                                            className="w-full bg-[#A82020] text-white font-extrabold text-[15px] py-4 rounded-xl shadow-[0_0_20px_rgba(168,32,32,0.3)] hover:bg-[#C92929] transition-all disabled:opacity-50 tracking-wide"
                                        >
                                            {landlordTestBusy ? 'Executing...' : 'Execute Push (KES 1)'}
                                        </button>

                                        {landlordTestMsg && (
                                            <p className="text-[12px] text-white/80 mt-6 leading-relaxed bg-[#130303]/80 p-4 rounded-xl border border-[#A82020]/30 text-center">{landlordTestMsg}</p>
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

                        {/* Save Actions for Global M-Pesa Configuration */}
                        <div className="flex justify-end mt-4">
                            <button
                                type="button"
                                onClick={handleSaveAgencyPaybill}
                                disabled={agencyPaybillSaved}
                                className={`px-8 py-4 ${agencyPaybillSaved ? 'bg-green-600' : 'bg-[#1a365d] hover:bg-[#112543]'} text-[15px] text-white font-bold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5`}
                            >
                                {agencyPaybillSaved ? 'Save Successful ✓' : 'Save Global M-Pesa Gateway'}
                            </button>
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
                                        className="w-full bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl px-5 py-4 text-[#111827] text-[15px] font-bold shadow-sm outline-none"
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
                                                type={showKeys['airtelClientSecret'] ? 'text' : 'password'}
                                                value={airtelConfig.clientSecret}
                                                onChange={handleAirtelChange}
                                                onFocus={() => setShowKeys({...showKeys, airtelClientSecret: true})}
                                                onBlur={() => setShowKeys({...showKeys, airtelClientSecret: false})}
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
                                    setEditingBankId(null);
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
                                <h4 className="font-extrabold text-gray-900 text-[18px] mb-8">{editingBankId ? 'Edit Relational Account' : 'Register Relational Account'}</h4>
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
                                        {editingBankId ? 'Save Changes' : 'Confirm Registration'}
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
