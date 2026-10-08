
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { LandlordApplication, User, Property } from '../../types';
import { exportToCSV } from '../../utils/exportHelper';
import Icon from '../Icon';
import SearchableSelect from '../common/SearchableSelect';
import { getTodayIsoDate } from '../../utils/timezone';

// Extended type to include fields needed for UI but maybe not in core type yet
export interface ExtendedLandlordApp extends Omit<LandlordApplication, 'status'> {
    status: 'Pending' | 'Approved' | 'Rejected' | 'Active';
    phone?: string;
    idNumber?: string;
    notes?: string;
    location?: string;
    paymentConfig?: any;
    propertyIds?: string[];
    // For unified view
    type?: 'Active' | 'Application';
    source?: string;
    referrerId?: string;
    referralCode?: string;
    contractPeriod?: number;
}

export const NewApplicationModal: React.FC<{ 
    application?: ExtendedLandlordApp;
    onClose: () => void; 
    onSave: (app: ExtendedLandlordApp) => void;
}> = ({ application, onClose, onSave }) => {
    const { properties, landlords, tenants, staff, vendors, renovationInvestors } = useData();
    const [activeTab, setActiveTab] = useState<'info' | 'portfolio' | 'financials'>('info');

    // Core Data
    const [formData, setFormData] = useState({
        name: application?.name || '', 
        email: application?.email || '', 
        phone: application?.phone || '', 
        idNumber: application?.idNumber || '', 
        location: application?.location || '', 
        notes: application?.notes || '',
        propertyUsageType: (application as any)?.propertyUsageType || 'Residential',
        buildingType: (application as any)?.buildingType || 'Apartment',
        source: application?.source || '',
        referrerId: application?.referrerId || '',
        referralCode: application?.referralCode || '',
        contractPeriod: application?.contractPeriod !== undefined ? application.contractPeriod : 12,
    });

    // Property Selection
    const [selectedProperties, setSelectedProperties] = useState<string[]>(application?.propertyIds || []);
    
    // Financials
    const [paymentMethod, setPaymentMethod] = useState<'Bank' | 'SACCO' | 'M-Pesa'>(application?.paymentConfig?.method || 'Bank');
    const [paymentDetails, setPaymentDetails] = useState(application?.paymentConfig?.details || {
        bankName: '', accountNumber: '', bankBranch: '',
        saccoName: '', saccoMemberNo: '',
        mpesaPhone: ''
    });

    const renderReferrerSelect = () => {
        const source = formData.source;
        if (!source || source === 'Walk-in' || source === 'Website') return null;

        let options: {id: string, name: string, sub?: string}[] = [];
        let label = "Select Referrer";

        if (source === 'Tenant') {
            options = tenants.map(t => ({ id: t.id, name: t.name, sub: t.unit }));
            label = "Select Referring Tenant";
        } else if (source === 'Landlord') {
            options = landlords.map(l => ({ id: l.id, name: l.name }));
            label = "Select Referring Landlord";
        } else if (source === 'Affiliate') {
            options = landlords.filter(l => l.role === 'Affiliate').map(l => ({ id: l.id, name: l.name, sub: 'Affiliate' }));
            label = "Select Affiliate";
        } else if (source === 'Agent') {
             options = staff.filter(s => s.role === 'Field Agent').map(s => ({ id: s.id, name: s.name, sub: 'Agent' }));
             label = "Select Agent";
        } else if (source === 'Contractor') {
             options = vendors.map(v => ({ id: v.id, name: v.name, sub: v.specialty }));
             label = "Select Contractor";
        } else if (source === 'Caretaker') {
             options = staff.filter(s => s.role === 'Caretaker').map(s => ({ id: s.id, name: s.name, sub: s.branch }));
             label = "Select Caretaker";
        } else if (source === 'Investor') {
             options = renovationInvestors.map(i => ({ id: i.id, name: i.name, sub: 'Investor' }));
             label = "Select Investor";
        } else if (source === 'Posters') {
              return (
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Poster Location / ID</label>
                      <input 
                         name="referrerId" 
                         value={formData.referrerId || ''} 
                         onChange={handleChange} 
                         placeholder="e.g. CBD-001" 
                         className="w-full p-2.5 border rounded-lg bg-white text-sm"
                      />
                  </div>
              );
        } else if (source === 'Referral') {
              return (
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Referrer Name / Details</label>
                      <input 
                         name="referrerId" 
                         value={formData.referrerId || ''} 
                         onChange={handleChange} 
                         placeholder="Name of referrer" 
                         className="w-full p-2.5 border rounded-lg bg-white text-sm"
                      />
                  </div>
              );
        }

        return (
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <SearchableSelect
                    value={formData.referrerId || ''}
                    onChange={(v) => setFormData({ ...formData, referrerId: v })}
                    options={options.map(opt => ({ value: opt.id, label: opt.name, sub: opt.sub }))}
                    placeholder="-- Select Person --"
                />
            </div>
        );
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handlePropertyToggle = (propId: string) => {
        setSelectedProperties(prev => 
            prev.includes(propId) ? prev.filter(id => id !== propId) : [...prev, propId]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email) {
            alert('Name and Email are required.');
            return;
        }

        const newApp = { 
            id: application?.id || `l-app-${Date.now()}`,
            ...formData,
            status: application?.status || 'Pending',
            date: application?.date || getTodayIsoDate(),
            proposedProperties: [], // Kept for type compatibility
            propertyIds: selectedProperties,
            paymentConfig: {
                method: paymentMethod,
                details: paymentDetails
            },
            type: application?.type || 'Application'
        } as ExtendedLandlordApp;
        onSave(newApp);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800">{application ? 'Edit Record' : 'New Landlord Application'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" className="w-5 h-5" /></button>
                </div>
                
                {/* Tabs */}
                <div className="flex border-b bg-white px-6">
                    {['info', 'portfolio', 'financials'].map(tab => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-3 text-sm font-bold capitalize border-b-2 transition-colors ${
                                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'info' ? 'Basic Info' : tab}
                        </button>
                    ))}
                </div>

                <div className="p-8 overflow-y-auto flex-grow">
                    <form id="appForm" onSubmit={handleSubmit}>
                         {activeTab === 'info' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                    <input name="name" value={formData.name} onChange={handleChange} className="w-full p-2.5 border rounded-lg" required />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                        <input name="email" type="email" value={formData.email} onChange={handleChange} className="w-full p-2.5 border rounded-lg" required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                        <input name="phone" value={formData.phone} onChange={handleChange} className="w-full p-2.5 border rounded-lg" placeholder="07..." />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ID / Passport Number</label>
                                    <input name="idNumber" value={formData.idNumber} onChange={handleChange} className="w-full p-2.5 border rounded-lg" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Location / Residence</label>
                                    <input name="location" value={formData.location} onChange={handleChange} className="w-full p-2.5 border rounded-lg" placeholder="e.g. Westlands" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Property Usage</label>
                                        <select name="propertyUsageType" value={formData.propertyUsageType} onChange={handleChange} className="w-full p-2.5 border rounded-lg bg-white">
                                            <option value="Residential">Residential</option>
                                            <option value="Commercial">Commercial</option>
                                            <option value="Mixed Use">Mixed Use</option>
                                            <option value="Airbnb">Airbnb</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Building Type</label>
                                        <select name="buildingType" value={formData.buildingType} onChange={handleChange} className="w-full p-2.5 border rounded-lg bg-white">
                                            <option value="Standalone">Standalone</option>
                                            <option value="Apartment">Apartment</option>
                                            <option value="Single Unit">Single Unit</option>
                                            <option value="Bungalow">Bungalow</option>
                                            <option value="Maisonette">Maisonette</option>
                                            <option value="Gated Community">Gated Community</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio Summary / Notes</label>
                                    <textarea name="notes" value={formData.notes} onChange={handleChange} className="w-full p-2.5 border rounded-lg" rows={3} placeholder="Additional details..." />
                                </div>
                                <div className="border-t pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Lead Source & Referral</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                                            <select name="source" value={formData.source} onChange={handleChange} className="w-full p-2.5 border rounded-lg bg-white text-sm">
                                                <option value="">-- Select Lead Source --</option>
                                                <option value="Walk-in">Walk-in</option>
                                                <option value="Website">Website</option>
                                                <option value="Agent">Agent</option>
                                                <option value="Affiliate">Affiliate</option>
                                                <option value="Contractor">Contractor</option>
                                                <option value="Caretaker">Caretaker</option>
                                                <option value="Investor">Investor</option>
                                                <option value="Tenant">Tenant Referral</option>
                                                <option value="Landlord">Landlord Referral</option>
                                                <option value="Referral">General Referral</option>
                                                <option value="Posters">Posters / Ads</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Referral Code</label>
                                            <input name="referralCode" value={formData.referralCode} onChange={handleChange} className="w-full p-2.5 border rounded-lg text-sm" placeholder="Optional code" />
                                        </div>
                                    </div>
                                    {formData.source && formData.source !== 'Walk-in' && formData.source !== 'Website' && (
                                        <div className="mt-4">
                                            {renderReferrerSelect()}
                                        </div>
                                    )}
                                    <div className="mt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Contract Period (Months)</label>
                                        <input 
                                            name="contractPeriod" 
                                            type="number" 
                                            min={1} 
                                            value={formData.contractPeriod} 
                                            onChange={(e) => setFormData(prev => ({ ...prev, contractPeriod: e.target.value ? parseInt(e.target.value) : 12 }))} 
                                            className="w-full p-2.5 border rounded-lg text-sm" 
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Duration of the contract. The referrer receives 10% of the management fee monthly during this period.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'portfolio' && (
                             <div className="space-y-4">
                                <p className="text-sm text-gray-500 mb-2">Select properties to associate (optional).</p>
                                <div className="border rounded-lg max-h-60 overflow-y-auto bg-gray-50 divide-y divide-gray-200">
                                    {properties.map(p => (
                                        <label key={p.id} className="flex items-center p-3 hover:bg-white cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 rounded text-primary focus:ring-primary border-gray-300"
                                                checked={selectedProperties.includes(p.id)}
                                                onChange={() => handlePropertyToggle(p.id)}
                                            />
                                            <div className="ml-3">
                                                <p className="text-sm font-bold text-gray-800">{p.name}</p>
                                                <p className="text-xs text-gray-500">{p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || '')}</p>
                                            </div>
                                        </label>
                                    ))}
                                    {properties.length === 0 && <p className="p-4 text-center text-gray-400 text-sm">No properties available.</p>}
                                </div>
                                <div className="mt-2 text-right text-xs text-gray-500">
                                    Selected: {selectedProperties.length}
                                </div>
                            </div>
                        )}

                        {activeTab === 'financials' && (
                             <div className="space-y-6">
                                <div className="flex justify-between items-center bg-gray-100 p-2 rounded-lg">
                                    {['Bank', 'SACCO', 'M-Pesa'].map(method => (
                                        <button
                                            key={method}
                                            type="button"
                                            onClick={() => setPaymentMethod(method as any)}
                                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                                                paymentMethod === method 
                                                ? 'bg-white shadow text-gray-900' 
                                                : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>

                                <div className="p-4 border rounded-xl bg-white">
                                    {paymentMethod === 'Bank' && (
                                        <div className="space-y-3">
                                            <input placeholder="Bank Name" className="w-full p-2 border rounded" value={paymentDetails.bankName} onChange={e => setPaymentDetails({...paymentDetails, bankName: e.target.value})} />
                                            <input placeholder="Account Number" className="w-full p-2 border rounded" value={paymentDetails.accountNumber} onChange={e => setPaymentDetails({...paymentDetails, accountNumber: e.target.value})} />
                                            <input placeholder="Branch Code (Optional)" className="w-full p-2 border rounded" value={paymentDetails.bankBranch} onChange={e => setPaymentDetails({...paymentDetails, bankBranch: e.target.value})} />
                                        </div>
                                    )}
                                    {paymentMethod === 'SACCO' && (
                                        <div className="space-y-3">
                                            <input placeholder="SACCO Name" className="w-full p-2 border rounded" value={paymentDetails.saccoName} onChange={e => setPaymentDetails({...paymentDetails, saccoName: e.target.value})} />
                                            <input placeholder="Member Number" className="w-full p-2 border rounded" value={paymentDetails.saccoMemberNo} onChange={e => setPaymentDetails({...paymentDetails, saccoMemberNo: e.target.value})} />
                                        </div>
                                    )}
                                    {paymentMethod === 'M-Pesa' && (
                                        <div className="space-y-3">
                                            <input placeholder="Registered Mobile Number" className="w-full p-2 border rounded" value={paymentDetails.mpesaPhone} onChange={e => setPaymentDetails({...paymentDetails, mpesaPhone: e.target.value})} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium">Cancel</button>
                    <button type="submit" form="appForm" className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark font-medium shadow-sm">{application ? 'Update Record' : 'Submit Application'}</button>
                </div>
            </div>
        </div>
    );
};

const ReviewApplicationModal: React.FC<{ 
    application: ExtendedLandlordApp; 
    onClose: () => void; 
    onApprove: (app: ExtendedLandlordApp) => void;
    onReject: (app: ExtendedLandlordApp) => void;
}> = ({ application, onClose, onApprove, onReject }) => {
    return (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Review Application</h2>
                        <p className="text-sm text-gray-500">Submitted on {application.date}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" className="w-6 h-6" /></button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
                            {application.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">{application.name}</h3>
                            <div className="text-sm text-gray-600 space-y-1 mt-1">
                                <p className="flex items-center"><Icon name="mail" className="w-4 h-4 mr-2 opacity-60" /> {application.email}</p>
                                <p className="flex items-center"><Icon name="communication" className="w-4 h-4 mr-2 opacity-60" /> {application.phone || 'N/A'}</p>
                                <p className="flex items-center"><Icon name="user-circle" className="w-4 h-4 mr-2 opacity-60" /> ID: {application.idNumber || 'N/A'}</p>
                                {application.location && <p className="flex items-center"><Icon name="branch" className="w-4 h-4 mr-2 opacity-60" /> {application.location}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-6">
                        <h4 className="text-sm font-bold text-gray-700 uppercase mb-2">Application Notes</h4>
                        <p className="text-gray-600 text-sm leading-relaxed">{application.notes || 'No additional notes provided.'}</p>
                    </div>
                    
                    {application.propertyIds && application.propertyIds.length > 0 && (
                        <div className="mb-6">
                             <h4 className="text-sm font-bold text-gray-700 uppercase mb-2">Requested Properties ({application.propertyIds.length})</h4>
                             <div className="flex flex-wrap gap-2">
                                {application.propertyIds.map(pid => (
                                    <span key={pid} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded border border-blue-100">{pid}</span>
                                ))}
                             </div>
                        </div>
                    )}
                    
                    {application.paymentConfig && (
                        <div className="mb-6 border-t pt-4">
                             <h4 className="text-sm font-bold text-gray-700 uppercase mb-2">Payment Preference</h4>
                             <p className="text-sm text-gray-600">Method: <strong>{application.paymentConfig.method}</strong></p>
                        </div>
                    )}
                    
                    {(application.source || application.referralCode || application.contractPeriod !== undefined) && (
                        <div className="mb-6 border-t pt-4">
                             <h4 className="text-sm font-bold text-gray-700 uppercase mb-2">Referral & Contract Details</h4>
                             <div className="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                                 {application.source && <p>Lead Source: <strong>{application.source}</strong></p>}
                                 {application.referralCode && <p>Referral Code: <strong>{application.referralCode}</strong></p>}
                                 {application.referrerId && <p>Referrer ID/Name: <strong>{application.referrerId}</strong></p>}
                                 {application.contractPeriod !== undefined && <p>Contract Duration: <strong>{application.contractPeriod} Months</strong></p>}
                             </div>
                        </div>
                    )}

                    <div className="border rounded-lg p-4 flex items-center justify-between bg-white">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 rounded text-yellow-700"><Icon name="stack" className="w-5 h-5" /></div>
                            <div>
                                <p className="text-sm font-medium text-gray-800">Supporting Documents</p>
                                <p className="text-xs text-gray-500">Title deeds, ID copies etc.</p>
                            </div>
                        </div>
                        <button className="text-sm text-blue-600 font-medium hover:underline">View (0)</button>
                    </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button 
                        onClick={() => onReject(application)}
                        className="px-6 py-2 bg-white border border-red-200 text-red-600 font-bold rounded-lg hover:bg-red-50 shadow-sm"
                    >
                        Reject
                    </button>
                    <button 
                        onClick={() => onApprove(application)}
                        className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg flex items-center"
                    >
                        <Icon name="check" className="w-4 h-4 mr-2" /> Approve & Create User
                    </button>
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: number; color: string; icon: string }> = ({ title, value, color, icon }) => (
    <div className={`bg-white p-4 rounded-xl shadow-sm border-l-4 border-${color}-500 flex items-center justify-between`}>
        <div>
            <p className="text-xs text-gray-500 uppercase font-bold">{title}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
        <div className={`p-3 rounded-full bg-${color}-50 text-${color}-600`}>
            <Icon name={icon} className="w-6 h-6" style={{ color }} />
        </div>
    </div>
);

const Applications: React.FC = () => {
    const { 
        landlordApplications, landlords, properties, staff, commissionRules,
        addLandlordApplication, updateLandlordApplication, deleteLandlordApplication,
        addLandlord, updateLandlord, deleteLandlord, updateProperty, addRFTransaction, updateStaff,
        checkPermission, currentUser
    } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';

    const canEdit   = isSuperAdmin || checkPermission('Landlords', 'edit');
    const canDelete = isSuperAdmin || checkPermission('Landlords', 'delete');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Pending' | 'Approved' | 'Rejected'>('All');
    
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [reviewApp, setReviewApp] = useState<ExtendedLandlordApp | null>(null);
    const [editApp, setEditApp] = useState<ExtendedLandlordApp | undefined>(undefined);

    // Unified List of Landlords and Applications
    const unifiedList: ExtendedLandlordApp[] = useMemo(() => {
        // Active Landlords (Users) — exclude affiliates: they share the same
        // storage table but must not surface in the Landlords module.
        const actives: ExtendedLandlordApp[] = landlords
            .filter(l => String((l as any).role || '').trim().toLowerCase() !== 'affiliate')
            .map(l => ({
                id: l.id,
                name: l.name,
                email: l.email,
                phone: l.phone,
                idNumber: l.idNumber,
                status: 'Active',
                date: 'N/A',
                proposedProperties: [],
                propertyIds: properties.filter(p => p.landlordId === l.id).map(p => p.id),
                type: 'Active',
                source: l.source,
                referrerId: l.referrerId,
                referralCode: l.referralCode,
                contractPeriod: l.contractPeriod
            }));

        // Applications — same guard in case an affiliate accidentally lands here.
        const apps: ExtendedLandlordApp[] = landlordApplications
            .filter(a => String((a as any).role || '').trim().toLowerCase() !== 'affiliate')
            .map(a => ({
                ...a,
                type: 'Application'
            })) as ExtendedLandlordApp[];

        return [...actives, ...apps];
    }, [landlords, landlordApplications, properties]);

    const filteredList = useMemo(() => 
        unifiedList.filter(a => {
            const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.email.toLowerCase().includes(searchQuery.toLowerCase());
            
            // Map 'Active' filter to user status 'Active', others to Application status
            const matchesFilter = filterStatus === 'All' || a.status === filterStatus || (filterStatus === 'Active' && a.status === 'Active');
            
            return matchesSearch && matchesFilter;
        })
    , [unifiedList, searchQuery, filterStatus]);

    const stats = useMemo(() => ({
        total: unifiedList.length,
        active: unifiedList.filter(l => l.status === 'Active').length,
        pending: unifiedList.filter(a => a.status === 'Pending').length,
        approved: unifiedList.filter(a => a.status === 'Approved').length,
        rejected: unifiedList.filter(a => a.status === 'Rejected').length
    }), [unifiedList]);

    const handleExport = () => {
        const data = filteredList.map(a => ({ Name: a.name, Email: a.email, Phone: a.phone, Status: a.status, Type: a.type }));
        exportToCSV(data, 'Landlord_Registry');
    };

    const handleSaveNew = (app: ExtendedLandlordApp) => {
        if (app.type === 'Active') {
             // Updating Active Landlord
             const updatedUser: Partial<User> = {
                 name: app.name,
                 email: app.email,
                 phone: app.phone || '',
                 idNumber: app.idNumber || '',
                 source: app.source || '',
                 referrerId: app.referrerId || '',
                 referralCode: app.referralCode || '',
                 contractPeriod: app.contractPeriod !== undefined ? app.contractPeriod : 12,
             };
             updateLandlord(app.id, updatedUser);
             alert("Landlord profile updated successfully.");
        } else {
             // Handling Application
             if (editApp && editApp.id && !editApp.id.startsWith('user-l-')) {
                 updateLandlordApplication(editApp.id, app as unknown as LandlordApplication);
                 alert("Application updated successfully.");
             } else {
                 addLandlordApplication(app as unknown as LandlordApplication);
                 alert("Application added successfully.");
             }
        }
        setIsNewModalOpen(false);
        setEditApp(undefined);
    };

    const handleEdit = (app: ExtendedLandlordApp) => {
        setEditApp(app);
        setIsNewModalOpen(true);
    };

    const handleDelete = (record: ExtendedLandlordApp) => {
        if (!window.confirm(`Are you sure you want to delete ${record.name}?`)) return;

        if (record.type === 'Active') {
            const linkedProps = properties.filter(p => p.landlordId === record.id);
            if (linkedProps.length > 0) {
                const forceDelete = window.confirm(
                    `${record.name} owns ${linkedProps.length} property(s). These will be unlinked (not deleted). Proceed?`
                );
                if (!forceDelete) {
                    return;
                }
                linkedProps.forEach(p => updateProperty(p.id, { landlordId: '' }));
            }
            deleteLandlord(record.id);
            const matchingApp = landlordApplications.find(a => a.email === record.email);
            if (matchingApp) deleteLandlordApplication(matchingApp.id);
            alert("Landlord and any linked application deleted. Properties have been unlinked.");
        } else {
            deleteLandlordApplication(record.id);
            alert("Application deleted.");
        }
    };

    const handleApprove = (app: ExtendedLandlordApp) => {
        // 1. Update Application Status
        updateLandlordApplication(app.id, { status: 'Approved' });
        
        // 2. Create User Record if not exists
        const exists = landlords.some(l => l.email === app.email);
        let activeLandlordId = '';
        if (!exists) {
            const newLandlordId = `user-l-${Date.now()}`;
            activeLandlordId = newLandlordId;
            const newUser: User = {
                id: newLandlordId,
                name: app.name,
                email: app.email,
                phone: app.phone || '',
                idNumber: app.idNumber || '',
                role: 'Landlord',
                status: 'Active',
                joinDate: getTodayIsoDate(),
                branch: 'Headquarters',
                source: app.source || '',
                referrerId: app.referrerId || '',
                referralCode: app.referralCode || '',
                contractPeriod: app.contractPeriod !== undefined ? app.contractPeriod : 12,
            };
            addLandlord(newUser);
            alert(`${app.name} has been approved and added as an Active Landlord.`);
        } else {
            const existingLandlord = landlords.find(l => l.email === app.email);
            if (existingLandlord) {
                activeLandlordId = existingLandlord.id;
                updateLandlord(existingLandlord.id, {
                    source: app.source || '',
                    referrerId: app.referrerId || '',
                    referralCode: app.referralCode || '',
                    contractPeriod: app.contractPeriod !== undefined ? app.contractPeriod : 12,
                    joinDate: existingLandlord.joinDate || getTodayIsoDate(),
                });
            }
            alert("Application approved (User updated with referral and contract details).");
        }

        // Link any draft properties registered with this application to the active landlord
        if (activeLandlordId) {
            const landlordProperties = (properties || []).filter(p => p.landlordId === app.id);
            landlordProperties.forEach(p => {
                try {
                    updateProperty(p.id, { landlordId: activeLandlordId });
                } catch (e) {
                    console.warn(`[Applications] failed to link property ${p.id} to landlord`, e);
                }
            });
        }

        // 3. Auto-assign Property Management Referral commission if referred
        const referrerId = (app as any).referrerId as string | undefined;
        if (referrerId) {
            const staffRef = staff.find(s => s.id === referrerId);
            const landlordRef = landlords.find(l => l.id === referrerId);
            const allPeople = [...tenants, ...(renovationInvestors as any[])];
            const otherRef = allPeople.find((p: any) => p.id === referrerId);
            const referrerObj = staffRef || landlordRef || otherRef;

            const referralConfig = referrerObj?.referralConfig || (app as any).referralConfig;

            // Base amount for landlord referral is the total rent roll/estimated rent of proposed properties or first property
            const landlordProperties = (properties || []).filter(p => p.landlordId === app.id);
            const totalPropertiesRent = landlordProperties.reduce((sum, p) => {
                const unitsRent = (p.units || []).reduce((uSum, u) => uSum + (u.rent || 0), 0);
                return sum + (unitsRent || p.defaultMonthlyRent || 0);
            }, 0);
            const baseAmount = totalPropertiesRent || 150000; // default 150k rent roll base if none yet

            let commissionAmount = 0;
            if (referralConfig && referralConfig.rateValue > 0) {
                commissionAmount = referralConfig.rateType === '%'
                    ? Math.round((referralConfig.rateValue / 100) * baseAmount)
                    : referralConfig.rateValue;
            } else {
                const rule = commissionRules.find(r => r.trigger === 'Property Management Referral');
                if (rule && rule.rateValue > 0) {
                    commissionAmount = rule.rateType === '%'
                        ? Math.round((rule.rateValue / 100) * baseAmount)
                        : rule.rateValue;
                } else {
                    commissionAmount = 1000; // default landlord referral commission KES
                }
            }

            if (commissionAmount > 0) {
                const today = getTodayIsoDate();
                const source = `Property Management Referral — ${app.name}`;
                if (staffRef) {
                    updateStaff(referrerId, {
                        commissions: [
                            { date: today, amount: commissionAmount, source },
                            ...(staffRef.commissions || []),
                        ],
                    });
                } else if (landlordRef) {
                    updateLandlord(referrerId, {
                        commissions: [
                            { date: today, amount: commissionAmount, source },
                            ...((landlordRef as any).commissions || []),
                        ],
                    } as any);
                } else {
                    addRFTransaction({
                        id: `rft-ref-${Date.now()}`,
                        date: today,
                        type: 'Referral Commission',
                        category: 'Outbound',
                        amount: commissionAmount,
                        partyName: referrerObj?.name || 'Referrer',
                        description: source,
                        reference: `REF-${app.id.slice(0, 8).toUpperCase()}`,
                        status: 'Pending',
                        notes: `Auto-generated on approval of landlord ${app.name}`,
                    } as any);
                }
            }
        }

        setReviewApp(null);
    };

    const handleReject = (app: ExtendedLandlordApp) => {
        updateLandlordApplication(app.id, { status: 'Rejected' });
        setReviewApp(null);
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Landlord Registry</h1>
                    <p className="text-gray-500 mt-1">Manage active landlords and vet potential property owners.</p>
                </div>
                <button
                    onClick={() => {
                        try {
                            window.location.hash = '#/registration/users?category=landlords';
                        } catch {
                            setEditApp(undefined);
                            setIsNewModalOpen(true);
                        }
                    }}
                    className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-md hover:bg-primary-dark transition-colors flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Add Record
                </button>
            </div>

            {/* Dashboard Headers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div onClick={() => setFilterStatus('All')} className="cursor-pointer">
                    <StatCard title="Total Records" value={stats.total} color="gray" icon="stack" />
                </div>
                <div onClick={() => setFilterStatus('Active')} className="cursor-pointer">
                    <StatCard title="Active Landlords" value={stats.active} color="green" icon="landlords" />
                </div>
                <div onClick={() => setFilterStatus('Pending')} className="cursor-pointer">
                    <StatCard title="Pending Review" value={stats.pending} color="yellow" icon="time" />
                </div>
                <div onClick={() => setFilterStatus('Approved')} className="cursor-pointer">
                    <StatCard title="Approved Apps" value={stats.approved} color="blue" icon="check" />
                </div>
                <div onClick={() => setFilterStatus('Rejected')} className="cursor-pointer">
                    <StatCard title="Rejected" value={stats.rejected} color="red" icon="close" />
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                {/* Toolbar */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg overflow-x-auto">
                        {['All', 'Active', 'Pending', 'Approved', 'Rejected'].map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status as any)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                                    filterStatus === status ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-grow md:flex-grow-0">
                            <input 
                                placeholder="Search registry..." 
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                                className="pl-9 pr-4 py-2 border rounded-lg w-full md:w-64 focus:ring-primary focus:border-primary"
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                        </div>
                        <button onClick={handleExport} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50">
                            Export
                        </button>
                    </div>
                </div>

                {/* List View */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date / Join</th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredList.map((app) => (
                                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${app.type === 'Active' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                            {app.type === 'Active' ? 'Landlord' : 'Applicant'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 mr-3">
                                                {app.name.charAt(0)}
                                            </div>
                                            <div className="font-bold text-gray-900">{app.name}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900">{app.email}</div>
                                        <div className="text-xs text-gray-500">{app.phone || 'No phone'}</div>
                                        {app.source && (
                                            <div className="mt-1 flex items-center gap-1">
                                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium">
                                                    Source: {app.source}
                                                </span>
                                                {app.contractPeriod !== undefined && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-50 border border-purple-100 text-purple-700 font-medium">
                                                        {app.contractPeriod} Months
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{app.date}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full inline-block min-w-[80px] ${
                                            app.status === 'Approved' || app.status === 'Active' ? 'bg-green-100 text-green-800' : 
                                            app.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                                            'bg-red-100 text-red-800'
                                        }`}>
                                            {app.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {app.status === 'Pending' ? (
                                                <button 
                                                    onClick={() => setReviewApp(app)} 
                                                    className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md text-xs font-bold shadow-sm transition-colors"
                                                >
                                                    Review
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => setReviewApp(app)} 
                                                    className="text-gray-600 hover:text-gray-900 font-medium text-sm"
                                                >
                                                    Details
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button
                                                    onClick={() => handleEdit(app)}
                                                    className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100"
                                                    title="Edit"
                                                >
                                                    <Icon name="settings" className="w-4 h-4" />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => handleDelete(app)}
                                                    className="text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                                                    title="Delete"
                                                >
                                                    <Icon name="close" className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500 flex flex-col items-center justify-center">
                                        <Icon name="search" className="w-12 h-12 text-gray-300 mb-2" />
                                        <p>No records found matching your criteria.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {isNewModalOpen && <NewApplicationModal application={editApp} onClose={() => { setIsNewModalOpen(false); setEditApp(undefined); }} onSave={handleSaveNew} />}
            {reviewApp && <ReviewApplicationModal application={reviewApp} onClose={() => setReviewApp(null)} onApprove={handleApprove} onReject={handleReject} />}
        </div>
    );
};

export default Applications;
