
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Message, User, TenantProfile, StaffProfile } from '@/types';
import Icon from '../Icon';

interface MessagesProps {
    channelFilter?: string;
    folderFilter?: 'Inbox' | 'Sent';
}

export const ComposeModal: React.FC<{ onClose: () => void; onSend: (to: string, content: string, channel: string, isGroup?: boolean, groupCount?: number) => void }> = ({ onClose, onSend }) => {
    const { tenants, landlords, staff, properties, renovationInvestors, investments } = useData();
    
    // Mode State
    const [recipientMode, setRecipientMode] = useState<'Individual' | 'Group'>('Individual');
    
    // --- Individual Mode States ---
    const [individualTab, setIndividualTab] = useState<'Direct' | 'Search'>('Direct');
    const [directRecipient, setDirectRecipient] = useState(''); // For manual input
    const [selectedContact, setSelectedContact] = useState<{id: string, name: string, phone: string, label?: string} | null>(null); // For database selection
    
    // Individual Search Filters
    const [indivCategory, setIndivCategory] = useState('Tenants');
    const [indivFilter, setIndivFilter] = useState('All');
    const [indivSearchQuery, setIndivSearchQuery] = useState('');

    // --- Group Mode States ---
    const [groupCategory, setGroupCategory] = useState<string>('Tenants');
    const [groupFilter, setGroupFilter] = useState<string>('All');
    const [selectedProperty, setSelectedProperty] = useState<string>('');
    // IDs explicitly unchecked by the user. Anything NOT in this set is included.
    const [excludedRecipientIds, setExcludedRecipientIds] = useState<Set<string>>(new Set());
    const [groupListSearch, setGroupListSearch] = useState('');

    // Message State
    const [content, setContent] = useState('');
    const [channel, setChannel] = useState('SMS');

    // --- HELPER: Agent Performance Calculation ---
    const getAgentPerformance = (agentId: string) => {
        const agentProps = properties.filter(p => p.assignedAgentId === agentId);
        if (agentProps.length === 0) return 0;
        let totalUnits = 0;
        let occupiedUnits = 0;
        agentProps.forEach(p => {
            totalUnits += p.units.length;
            occupiedUnits += p.units.filter(u => u.status === 'Occupied').length;
        });
        return totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    };

    // --- UNIFIED FILTERING LOGIC ---
    // Returns a list of standardized objects { id, name, phone, meta }
    const getFilteredContacts = (category: string, filter: string, propId?: string) => {
        let rawList: any[] = [];
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        if (category === 'Tenants') {
            switch (filter) {
                case 'All': rawList = tenants; break;
                case 'By Property': rawList = tenants.filter(t => t.propertyName === propId); break;
                case 'Arrears': rawList = tenants.filter(t => {
                    if (!['Active', 'Overdue', 'Notice'].includes(t.status)) return false;
                    const currentMonthIso = now.toISOString().slice(0, 7);
                    const hasPaidThisMonth = (t.paymentHistory || []).some(p =>
                        p.date?.startsWith(currentMonthIso) && p.status === 'Paid'
                    );
                    return !hasPaidThisMonth;
                }); break;
                case 'Fines (Unpaid)': rawList = tenants.filter(t => t.outstandingFines.some(f => f.status === 'Pending')); break;
                case 'Fines (Paid)': rawList = tenants.filter(t => t.outstandingFines.some(f => f.status === 'Paid')); break;
                case 'Deposits (Unpaid)': rawList = tenants.filter(t =>
                    !['Vacated', 'Evicted'].includes(t.status) &&
                    !t.depositExempt &&
                    (!t.depositPaid || t.depositPaid <= 0)
                ); break;
                case 'Deposits (Paid)': rawList = tenants.filter(t => t.depositPaid > 0); break;
                case 'Rent Balances': rawList = tenants.filter(t => {
                    if (!['Active', 'Overdue', 'Notice'].includes(t.status) || !t.rentAmount) return false;
                    const currentMonthIso = now.toISOString().slice(0, 7);
                    const hasPaidThisMonth = (t.paymentHistory || []).some(p =>
                        p.date?.startsWith(currentMonthIso) && p.status === 'Paid'
                    );
                    return !hasPaidThisMonth;
                }); break;
                case 'New Tenants': rawList = tenants.filter(t => new Date(t.onboardingDate) >= thirtyDaysAgo); break;
                case 'Evicted': rawList = tenants.filter(t => t.status === 'Evicted'); break;
                default: rawList = tenants;
            }
            return rawList.map(t => ({ id: t.id, name: t.name, phone: t.phone, label: `${t.unit} • ${t.status}` }));
        } 
        else if (category === 'Investors') {
            rawList = renovationInvestors.filter((inv) => {
                if (filter === 'All') return true;
                const invInvestments = investments.filter((i) => i.investorId === inv.id);
                const total = invInvestments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
                if (filter === 'Below 5k') return total < 5000;
                if (filter === '5k - 10k') return total >= 5000 && total < 10000;
                if (filter === '10k - 50k') return total >= 10000 && total < 50000;
                if (filter === '50k - 100k') return total >= 50000 && total < 100000;
                if (filter === 'Above 100k') return total >= 100000;
                if (filter === '6 Month Term' || filter === '12 Month Term' || filter === '18 Month Term') {
                    return false;
                }
                return true;
            });
            return rawList.map(i => ({ id: i.id, name: i.name, phone: i.phone, label: i.investorType || 'Individual' }));
        }
        else if (category === 'Agents') {
            const agents = staff.filter(s => s.role === 'Field Agent');
            rawList = agents.filter(agent => {
                const perf = getAgentPerformance(agent.id);
                if (filter === 'All') return true;
                if (filter === 'Active') return agent.status === 'Active';
                if (filter === 'Inactive') return agent.status !== 'Active';
                if (filter === 'Below 30% Target') return perf < 30;
                if (filter === '30% - 50% Target') return perf >= 30 && perf < 50;
                if (filter === '50% - 75% Target') return perf >= 50 && perf < 75;
                if (filter === 'Above 75% Target') return perf >= 75;
                return true;
            });
            return rawList.map(a => ({ id: a.id, name: a.name, phone: a.phone, label: `${a.branch} • Agent` }));
        }
        else if (category === 'Staff') {
            if (filter === 'All') rawList = staff;
            else if (filter === 'Managers') rawList = staff.filter(s => s.role === 'Branch Manager' || s.department === 'Management');
            else if (filter === 'Finance') rawList = staff.filter(s => s.role === 'Accountant' || s.department === 'Administration');
            else if (filter === 'Cleaners') rawList = staff.filter(s => s.department === 'Cleaning');
            else if (filter === 'Security') rawList = staff.filter(s => s.department === 'Security');
            else if (filter === 'R-Reits Staff') rawList = staff.filter(s => s.department === 'R-Reits');
            return rawList.map(s => ({ id: s.id, name: s.name, phone: s.phone, label: s.role }));
        }
        else if (category === 'Affiliates') {
            const affiliateLandlordIds = properties.filter(p => p.ownership === 'Affiliate').map(p => p.landlordId);
            const affiliates = landlords.filter(l => affiliateLandlordIds.includes(l.id));
            
            rawList = affiliates.filter(aff => {
                if (filter === 'All') return true;
                if (filter === 'Active') return aff.status === 'Active';
                if (filter === 'Inactive') return aff.status !== 'Active';
                const propCount = properties.filter(p => p.landlordId === aff.id).length;
                if (filter === 'Performing') return propCount > 2;
                if (filter === 'Non Performing') return propCount <= 2;
                return true;
            });
            return rawList.map(a => ({ id: a.id, name: a.name, phone: a.phone, label: 'Affiliate' }));
        }
        else if (category === 'Caretakers') {
            rawList = staff.filter(s => s.role === 'Caretaker');
            return rawList.map(c => ({ id: c.id, name: c.name, phone: c.phone, label: 'Caretaker' }));
        }
        else if (category === 'Landlords') {
             rawList = landlords;
             return rawList.map(l => ({ id: l.id, name: l.name, phone: l.phone, label: 'Landlord' }));
        }

        return [];
    };

    // Derived Lists
    const groupRecipients = useMemo(() => getFilteredContacts(groupCategory, groupFilter, selectedProperty), [groupCategory, groupFilter, selectedProperty, tenants, staff, landlords, renovationInvestors]);
    // Final list after the user has unchecked anyone they don't want included.
    const finalGroupRecipients = useMemo(
        () => groupRecipients.filter(r => !excludedRecipientIds.has(r.id)),
        [groupRecipients, excludedRecipientIds],
    );
    const visibleGroupRecipients = useMemo(() => {
        const q = groupListSearch.trim().toLowerCase();
        if (!q) return groupRecipients;
        return groupRecipients.filter(r =>
            (r.name || '').toLowerCase().includes(q) ||
            (r.phone || '').toLowerCase().includes(q) ||
            (r.label || '').toLowerCase().includes(q)
        );
    }, [groupRecipients, groupListSearch]);

    // Whenever the filter/category/property changes, reset the exclusion set
    // so it doesn't carry stale IDs from a previous filter.
    useEffect(() => {
        setExcludedRecipientIds(new Set());
        setGroupListSearch('');
    }, [groupCategory, groupFilter, selectedProperty]);

    const toggleRecipient = (id: string) => {
        setExcludedRecipientIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const selectAllRecipients = () => setExcludedRecipientIds(new Set());
    const deselectAllRecipients = () =>
        setExcludedRecipientIds(new Set(groupRecipients.map(r => r.id)));

    const individualSearchResults = useMemo(() => {
        if (individualTab === 'Direct') return [];
        const contacts = getFilteredContacts(indivCategory, indivFilter);
        if (!indivSearchQuery) return contacts;
        return contacts.filter(c => c.name.toLowerCase().includes(indivSearchQuery.toLowerCase()) || c.phone.includes(indivSearchQuery));
    }, [individualTab, indivCategory, indivFilter, indivSearchQuery, tenants, staff, landlords, renovationInvestors]);


    const handleSend = () => {
        if (recipientMode === 'Individual') {
            if (individualTab === 'Direct' && !directRecipient) return alert("Please enter a recipient.");
            if (individualTab === 'Search' && !selectedContact) return alert("Please select a contact.");
            if (!content) return alert("Message content required.");
            
            const toName = individualTab === 'Direct' ? directRecipient : selectedContact!.name;
            onSend(toName, content, channel, false, 1);
        } else {
            if (finalGroupRecipients.length === 0) return alert("No recipients selected. Check at least one person in the list.");
            if (!content) return alert("Message content required.");

            onSend(`${groupCategory} - ${groupFilter}`, content, channel, true, finalGroupRecipients.length);
        }
    };

    const handleCategoryChange = (cat: string, isGroup: boolean) => {
        if (isGroup) {
            setGroupCategory(cat);
            setGroupFilter('All');
            setSelectedProperty('');
        } else {
            setIndivCategory(cat);
            setIndivFilter('All');
            setIndivSearchQuery('');
            setSelectedContact(null);
        }
    };

    // Render Filter Options (Shared Logic)
    const renderFilterOptions = (category: string) => (
        <>
            <option value="All">All {category}</option>
            
            {category === 'Tenants' && (
                <>
                    <option value="By Property">By Property</option>
                    <option value="New Tenants">New Tenants</option>
                    <option value="Arrears">In Arrears</option>
                    <option value="Rent Balances">With Rent Balances</option>
                    <option value="Fines (Unpaid)">Unpaid Fines</option>
                    <option value="Fines (Paid)">Paid Fines</option>
                    <option value="Deposits (Unpaid)">Unpaid Deposits</option>
                    <option value="Deposits (Paid)">Paid Deposits</option>
                    <option value="Evicted">Evicted Tenants</option>
                </>
            )}

            {category === 'Investors' && (
                <>
                    <optgroup label="Duration">
                        <option value="6 Month Term">6 Month Term</option>
                        <option value="12 Month Term">12 Month Term</option>
                        <option value="18 Month Term">18 Month Term</option>
                    </optgroup>
                    <optgroup label="Amount Invested">
                        <option value="Below 5k">Below 5,000</option>
                        <option value="5k - 10k">5,000 - 10,000</option>
                        <option value="10k - 50k">10,000 - 50,000</option>
                        <option value="50k - 100k">50,000 - 100,000</option>
                        <option value="Above 100k">Above 100,000</option>
                    </optgroup>
                </>
            )}

            {category === 'Agents' && (
                <>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <optgroup label="Performance">
                        <option value="Below 30% Target">Below 30% Target</option>
                        <option value="30% - 50% Target">30% - 50% Target</option>
                        <option value="50% - 75% Target">50% - 75% Target</option>
                        <option value="Above 75% Target">Above 75% Target</option>
                    </optgroup>
                </>
            )}

            {category === 'Staff' && (
                <>
                    <option value="Managers">Managers</option>
                    <option value="Finance">Finance</option>
                    <option value="Cleaners">Cleaners</option>
                    <option value="Security">Security</option>
                    <option value="R-Reits Staff">R-Reits Staff</option>
                </>
            )}

            {category === 'Affiliates' && (
                <>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Performing">Performing</option>
                    <option value="Non Performing">Non Performing</option>
                </>
            )}
        </>
    );

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800">New Message</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Mode Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setRecipientMode('Individual')}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${recipientMode === 'Individual' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
                        >
                            Individual
                        </button>
                        <button 
                            onClick={() => setRecipientMode('Group')}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${recipientMode === 'Group' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
                        >
                            Group Broadcast
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Channel</label>
                        <div className="flex gap-2">
                            {['SMS', 'Email', 'WhatsApp', 'App'].map(c => (
                                <button 
                                    key={c}
                                    onClick={() => setChannel(c)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${channel === c ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    {recipientMode === 'Individual' ? (
                        <div className="space-y-4">
                             {/* Sub-Tabs for Individual */}
                            <div className="flex border-b border-gray-200">
                                <button 
                                    onClick={() => setIndividualTab('Direct')} 
                                    className={`mr-4 pb-2 text-sm font-medium transition-colors ${individualTab === 'Direct' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}
                                >
                                    Direct Input
                                </button>
                                <button 
                                    onClick={() => setIndividualTab('Search')} 
                                    className={`mr-4 pb-2 text-sm font-medium transition-colors ${individualTab === 'Search' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}
                                >
                                    Search Contacts
                                </button>
                            </div>

                            {individualTab === 'Direct' ? (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Recipient</label>
                                    <input 
                                        value={directRecipient} 
                                        onChange={e => setDirectRecipient(e.target.value)} 
                                        placeholder="Name or Phone Number" 
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                                            <select 
                                                value={indivCategory} 
                                                onChange={e => handleCategoryChange(e.target.value, false)}
                                                className="w-full p-2.5 border rounded-lg bg-white text-sm"
                                            >
                                                <option>Tenants</option>
                                                <option>Landlords</option>
                                                <option>Staff</option>
                                                <option>Agents</option>
                                                <option>Investors</option>
                                                <option>Affiliates</option>
                                                <option>Caretakers</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filter Sub-Group</label>
                                            <select 
                                                value={indivFilter} 
                                                onChange={e => { setIndivFilter(e.target.value); setSelectedContact(null); }}
                                                className="w-full p-2.5 border rounded-lg bg-white text-sm"
                                            >
                                                {renderFilterOptions(indivCategory)}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Person</label>
                                        <div className="relative">
                                            <input 
                                                value={indivSearchQuery}
                                                onChange={e => setIndivSearchQuery(e.target.value)}
                                                placeholder={`Search ${indivCategory}...`}
                                                className="w-full p-2.5 pl-8 border rounded-lg text-sm mb-2"
                                            />
                                            <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                                        </div>
                                        
                                        <div className="border rounded-lg max-h-40 overflow-y-auto bg-gray-50 divide-y divide-gray-100">
                                            {individualSearchResults.length > 0 ? (
                                                individualSearchResults.map(contact => (
                                                    <div 
                                                        key={contact.id} 
                                                        onClick={() => setSelectedContact(contact)}
                                                        className={`p-2 cursor-pointer flex justify-between items-center ${selectedContact?.id === contact.id ? 'bg-primary/10 text-primary' : 'hover:bg-white text-gray-700'}`}
                                                    >
                                                        <div>
                                                            <p className="text-sm font-bold">{contact.name}</p>
                                                            <p className="text-xs opacity-70">{contact.phone}</p>
                                                        </div>
                                                        <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600">{contact.label}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs text-center p-4 text-gray-400">No contacts found.</p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {selectedContact && (
                                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                                            <span className="text-sm text-green-800">To: <strong>{selectedContact.name}</strong></span>
                                            <button onClick={() => setSelectedContact(null)} className="text-xs text-red-500 font-bold hover:underline">Change</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Group Selection Mode */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                                    <select 
                                        value={groupCategory} 
                                        onChange={e => handleCategoryChange(e.target.value, true)}
                                        className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-primary/20 outline-none"
                                    >
                                        <option>Tenants</option>
                                        <option>Landlords</option>
                                        <option>Investors</option>
                                        <option>Agents</option>
                                        <option>Staff</option>
                                        <option>Affiliates</option>
                                        <option>Caretakers</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filter Group</label>
                                    <select 
                                        value={groupFilter} 
                                        onChange={e => setGroupFilter(e.target.value)}
                                        className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-primary/20 outline-none"
                                    >
                                        {renderFilterOptions(groupCategory)}
                                    </select>
                                </div>
                            </div>

                            {groupFilter === 'By Property' && groupCategory === 'Tenants' && (
                                <div className="animate-fade-in">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Property</label>
                                    <select 
                                        value={selectedProperty} 
                                        onChange={e => setSelectedProperty(e.target.value)}
                                        className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-primary/20 outline-none"
                                    >
                                        <option value="">-- Choose Property --</option>
                                        {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="border rounded-lg bg-white">
                                <div className="flex items-center justify-between p-2 border-b bg-gray-50 text-xs">
                                    <span className="font-bold text-gray-700">
                                        Recipients: {finalGroupRecipients.length} of {groupRecipients.length}
                                    </span>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={selectAllRecipients} className="text-primary font-semibold hover:underline">Select all</button>
                                        <span className="text-gray-300">|</span>
                                        <button type="button" onClick={deselectAllRecipients} className="text-red-500 font-semibold hover:underline">Clear</button>
                                    </div>
                                </div>
                                <div className="p-2 border-b">
                                    <input
                                        value={groupListSearch}
                                        onChange={e => setGroupListSearch(e.target.value)}
                                        placeholder={`Search ${groupCategory.toLowerCase()}...`}
                                        className="w-full p-2 border rounded text-sm focus:ring-1 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                                    {visibleGroupRecipients.length === 0 ? (
                                        <p className="text-xs text-center p-4 text-gray-400">
                                            {groupRecipients.length === 0 ? 'No recipients match this filter.' : 'No matches for your search.'}
                                        </p>
                                    ) : (
                                        visibleGroupRecipients.map(r => {
                                            const included = !excludedRecipientIds.has(r.id);
                                            return (
                                                <label key={r.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300"
                                                        checked={included}
                                                        onChange={() => toggleRecipient(r.id)}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                                                        <p className="text-xs text-gray-500 truncate">{r.phone}{r.label ? ` · ${r.label}` : ''}</p>
                                                    </div>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Message</label>
                        <textarea 
                            value={content} 
                            onChange={e => setContent(e.target.value)} 
                            placeholder="Type your message..." 
                            rows={5}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                        />
                    </div>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">Cancel</button>
                    <button onClick={handleSend} className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md flex items-center">
                        <Icon name="communication" className="w-4 h-4 mr-2" /> 
                        {recipientMode === 'Group' ? 'Broadcast' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Messages: React.FC<MessagesProps> = ({ channelFilter, folderFilter }) => {
    const { messages, addMessage, tenants } = useData();
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [activeFolder, setActiveFolder] = useState<'Inbox' | 'Sent' | 'Archived'>('Inbox');
    const [activeChannel, setActiveChannel] = useState<string | 'All'>(channelFilter || 'All');
    const [replyText, setReplyText] = useState('');

    useEffect(() => {
        if (folderFilter) {
            setActiveFolder(folderFilter);
        }
    }, [folderFilter]);

    // Reset selection when changing filters
    const handleChannelChange = (c: string) => {
        setActiveChannel(c);
        setSelectedMessage(null);
    };

    const filteredMessages = useMemo(() => {
        return messages.filter(m => {
            const matchesChannel = activeChannel === 'All' || m.channel === activeChannel;
            const matchesSearch = m.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  m.recipient.name.toLowerCase().includes(searchTerm.toLowerCase());
            
            // Logic for Inbox vs Sent based on 'isIncoming' or 'status'
            // Assuming outgoing messages have status 'Sent' and incoming don't, or using the 'isIncoming' flag if available in type (added in previous context update, assumed here)
            // Fallback logic: if no 'isIncoming', assume 'Sent' status means outbound.
            const isSent = m.status === 'Sent' || m.isIncoming === false;
            const isInbox = m.isIncoming === true; // Mock logic, requires updated type or logic

            let matchesFolder = true;
            if (activeFolder === 'Inbox') matchesFolder = isInbox;
            else if (activeFolder === 'Sent') matchesFolder = isSent;
            
            return matchesChannel && matchesSearch && matchesFolder; 
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [messages, activeChannel, searchTerm, activeFolder]);

    const handleSendMessage = (to: string, content: string, channel: string, isGroup = false, count = 1) => {
        const newMessage: Message = {
            id: `msg-${Date.now()}`,
            recipient: { 
                name: to, 
                contact: isGroup ? `${count} Recipients` : to 
            },
            content,
            channel: channel as any,
            status: 'Sent',
            timestamp: new Date().toLocaleString(),
            priority: 'Normal',
            isIncoming: false
        };
        addMessage(newMessage);
        setIsComposeOpen(false);
        alert(`Message sent via ${channel} to ${isGroup ? count + ' recipients' : to}`);
    };

    const handleReply = () => {
        if (!selectedMessage || !replyText.trim()) return;
        
        const channel = selectedMessage.channel === 'SMS' ? 'SMS' : selectedMessage.channel === 'Email' ? 'Email' : selectedMessage.channel === 'WhatsApp' ? 'WhatsApp' : 'App';
        
        const newMessage: Message = {
            id: `msg-${Date.now()}`,
            recipient: selectedMessage.recipient,
            content: replyText,
            channel: channel as any,
            status: 'Sent',
            timestamp: new Date().toLocaleString(),
            priority: 'Normal',
            isIncoming: false
        };
        
        addMessage(newMessage);
        setReplyText('');
        alert(`Reply sent via ${channel}`);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/general-operations/communications'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Communication
            </button>
            <div className="flex h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 bg-gray-50 border-r flex flex-col">
                    <div className="p-4">
                        <button 
                            onClick={() => setIsComposeOpen(true)}
                            className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary-dark transition-all flex items-center justify-center"
                        >
                            <Icon name="plus" className="w-5 h-5 mr-2" /> Compose
                        </button>
                    </div>
                    
                    <nav className="flex-grow px-2 space-y-1 overflow-y-auto">
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Folders</div>
                        <button onClick={() => setActiveFolder('Inbox')} className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeFolder === 'Inbox' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>
                            <Icon name="mail" className="w-4 h-4 mr-3" /> Inbox
                        </button>
                        <button onClick={() => setActiveFolder('Sent')} className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeFolder === 'Sent' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>
                            <Icon name="communication" className="w-4 h-4 mr-3" /> Sent
                        </button>

                        <div className="mt-6 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Channels</div>
                        {['All', 'App', 'SMS', 'Email', 'WhatsApp'].map(c => (
                             <button 
                                key={c} 
                                onClick={() => handleChannelChange(c)} 
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeChannel === c ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                <span className={`w-2 h-2 rounded-full mr-3 ${c === 'SMS' ? 'bg-green-500' : c === 'Email' ? 'bg-blue-500' : c === 'WhatsApp' ? 'bg-green-600' : c === 'App' ? 'bg-indigo-500' : 'bg-gray-400'}`}></span>
                                {c}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Message List */}
                <div className="w-80 border-r flex flex-col bg-white">
                    <div className="p-4 border-b">
                        <div className="relative">
                            <input 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search messages..." 
                                className="w-full pl-9 pr-4 py-2 border rounded-lg bg-gray-50 text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                            <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto">
                        {filteredMessages.map(msg => (
                            <div 
                                key={msg.id} 
                                onClick={() => setSelectedMessage(msg)}
                                className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${selectedMessage?.id === msg.id ? 'bg-blue-50 border-l-4 border-l-primary' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-gray-800 text-sm truncate w-32" title={msg.recipient.name}>{msg.recipient.name}</span>
                                    <span className="text-[10px] text-gray-500">{msg.timestamp.split(',')[0]}</span>
                                </div>
                                <p className="text-xs text-gray-500 line-clamp-2">{msg.content}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border`}>{msg.channel}</span>
                                    {msg.priority === 'High' && <span className="text-[10px] text-red-600 font-bold">! High</span>}
                                </div>
                            </div>
                        ))}
                        {filteredMessages.length === 0 && (
                            <div className="p-8 text-center text-gray-400 text-sm">No messages found.</div>
                        )}
                    </div>
                </div>

                {/* Detail View */}
                <div className="flex-grow flex flex-col bg-gray-50/50">
                    {selectedMessage ? (
                        <>
                            <div className="p-6 border-b bg-white flex justify-between items-start shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                                        {selectedMessage.recipient.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">{selectedMessage.recipient.name}</h2>
                                        <p className="text-sm text-gray-500 flex items-center">
                                            <Icon name={selectedMessage.channel === 'Email' ? 'mail' : 'communication'} className="w-3 h-3 mr-1" /> 
                                            {selectedMessage.recipient.contact}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sent via {selectedMessage.channel}</p>
                                    <p className="text-sm text-gray-600">{selectedMessage.timestamp}</p>
                                </div>
                            </div>
                            
                            <div className="flex-grow p-8 overflow-y-auto">
                                <div className={`p-6 rounded-xl border shadow-sm max-w-2xl ${selectedMessage.isIncoming ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-100 ml-auto'}`}>
                                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedMessage.content}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-white border-t flex gap-3">
                                 <input 
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    className="flex-grow p-3 border rounded-lg bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-primary/20" 
                                    placeholder={`Reply to ${selectedMessage.recipient.name}...`} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                                    disabled={selectedMessage.recipient.name.startsWith('Group:')}
                                 />
                                 <button 
                                    onClick={handleReply}
                                    disabled={selectedMessage.recipient.name.startsWith('Group:')}
                                    className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:bg-gray-300 disabled:cursor-not-allowed"
                                 >
                                     Reply
                                 </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Icon name="mail" className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select a message to read</p>
                        </div>
                    )}
                </div>

                {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} onSend={handleSendMessage} />}
            </div>
        </div>
    );
};

export default Messages;
