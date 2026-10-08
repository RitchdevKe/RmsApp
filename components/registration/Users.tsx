
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { User, StaffProfile, TenantProfile, RenovationInvestor, Vendor, TenantApplication } from '../../types';
import Icon from '../Icon';
import { hashPassword } from '../../utils/security';
import { supabase } from '../../utils/supabaseClient';
import { canonicalizePhone, digitsOnly } from '../../utils/phone';
import { getTodayIsoDate } from '../../utils/timezone';

// Unified User Type for UI Display
interface UnifiedUser {
    id: string;
    name: string;
    username?: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    type: 'Staff' | 'Landlord' | 'Tenant' | 'Investor' | 'Vendor';
    fullObject: StaffProfile | User | TenantProfile | RenovationInvestor | Vendor;
}

// Category Configuration
interface UserCategory {
    id: string;
    title: string;
    roles: string[]; // Roles that belong to this category
    color: string;
    icon: string;
}

const ResetPasswordModal: React.FC<{ user: UnifiedUser; onClose: () => void; onSave: (plainPassword: string, passwordHash: string) => void }> = ({ user, onClose, onSave }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || !confirmPassword) return alert("Please fill all fields.");
        if (newPassword !== confirmPassword) return alert("Passwords do not match.");

        setIsSaving(true);
        try {
            const hash = await hashPassword(newPassword);
            onSave(newPassword, hash);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Reset Password</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <p className="text-sm text-gray-600 mb-4">Set a new password for <strong>{user.name}</strong> ({user.username || 'No Username'}).</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
                        <input 
                            type="password"
                            value={newPassword} 
                            onChange={e => setNewPassword(e.target.value)} 
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="Enter new password"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Confirm Password</label>
                        <input 
                            type="password"
                            value={confirmPassword} 
                            onChange={e => setConfirmPassword(e.target.value)} 
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="Confirm new password"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 disabled:opacity-50">
                            {isSaving ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const UserForm: React.FC<{ 
    existingUser?: UnifiedUser; 
    category: UserCategory;
    onClose: () => void; 
    onSave: (data: any) => void | Promise<void>;
    availableRoles: string[];
    properties: any[];
    referralOptions: any[];
}> = ({ existingUser, category, onClose, onSave, availableRoles, properties, referralOptions }) => {
    const [formData, setFormData] = useState<any>({
        name: existingUser?.name || '',
        username: existingUser?.username || '',
        email: existingUser?.email || '',
        phone: existingUser?.phone || '',
        idNumber: (existingUser?.fullObject as any)?.idNumber || '',
        kraPin: (existingUser?.fullObject as any)?.kraPin || '',
        // Default the role to the selected category (prevents accidental routing to the wrong portal)
        role: existingUser?.role || category.roles?.[0] || availableRoles[0] || 'Tenant',
        status: existingUser?.status || (category?.id === 'tenants' ? 'PendingAllocation' : 'Active'),
        // Requirement: default password for newly created users is 123456
        password: existingUser ? '' : '123456',
        
        // Tenant-specific extended fields
        alternativePhone: (existingUser?.fullObject as any)?.alternativePhone || '',
        rentStartDate: (existingUser?.fullObject as any)?.rentStartDate || (existingUser?.fullObject as any)?.onboardingDate || getTodayIsoDate(),
        nextOfKinName: (existingUser?.fullObject as any)?.nextOfKinName || '',
        nextOfKinPhone: (existingUser?.fullObject as any)?.nextOfKinPhone || '',
        nextOfKinRelationship: (existingUser?.fullObject as any)?.nextOfKinRelationship || '',
        profession: (existingUser?.fullObject as any)?.profession || '',
        workplace: (existingUser?.fullObject as any)?.workplace || '',

        // Extended Fields
        assignedPropertyId: (existingUser?.fullObject as StaffProfile)?.assignedPropertyId || '',
        referrerId: (existingUser?.fullObject as RenovationInvestor)?.referrerId || '',
        referrerType: (existingUser?.fullObject as RenovationInvestor)?.referrerType || 'Agent',
        specialty: (existingUser?.fullObject as Vendor)?.specialty || '',
        // Field Agent specific
        branch: (existingUser?.fullObject as StaffProfile)?.branch || '',
        targetSalary: (existingUser?.fullObject as any)?.payrollInfo?.baseSalary?.toString?.() || '',

        // Landlord specific
        managementType: (existingUser?.fullObject as any)?.managementType || 'Full RMS',
        contractPeriod: (existingUser?.fullObject as any)?.contractPeriod !== undefined && (existingUser?.fullObject as any)?.contractPeriod !== null
            ? String((existingUser?.fullObject as any).contractPeriod)
            : '',
        contractStartDate: String((existingUser?.fullObject as any)?.contractStartDate || '').slice(0, 10),
        mpesaShortcode: (existingUser?.fullObject as any)?.mpesaConfig?.shortcode || '',
        mpesaPasskey: (existingUser?.fullObject as any)?.mpesaConfig?.passkey || '',
        mpesaConsumerKey: (existingUser?.fullObject as any)?.mpesaConfig?.consumerKey || '',
        mpesaConsumerSecret: (existingUser?.fullObject as any)?.mpesaConfig?.consumerSecret || '',
        
        // App sharing and scope
        appScope: (existingUser?.fullObject as any)?.appScope || 
                  ((category?.id === 'field' || category?.id === 'affiliates' || category?.id === 'contractors' || category?.id === 'fundis') ? 'Both' : 'Full')
    });
    const [isSaving, setIsSaving] = useState(false);
    const [showOtherRelationship, setShowOtherRelationship] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleDigitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: digitsOnly(e.target.value) });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email) return;

        setIsSaving(true);
        try {
            let passwordHash = undefined;
            if (!existingUser && formData.password) {
                passwordHash = await hashPassword(formData.password);
            }
            await Promise.resolve(onSave({ ...formData, passwordHash, plainPassword: formData.password }));
        } catch (err) {
            console.error('User form failed', err);
            alert(err instanceof Error ? err.message : 'Something went wrong while saving.');
        } finally {
            setIsSaving(false);
        }
    };

    const isCaretaker = formData.role === 'Caretaker' || category.id === 'caretakers';
    const isInvestor = category.id === 'investors' || formData.role === 'Investor';
    const isContractor = category.id === 'contractors' || formData.role === 'Contractor';
    const isFundi = category.id === 'fundis' || formData.role === 'Fundi';
    const isAffiliate = category.id === 'affiliates' || formData.role === 'Affiliate';
    const isFieldAgent = category.id === 'field' || formData.role === 'Field Agent';
    const isTenant = category.id === 'tenants' || formData.role === 'Tenant';
    const isLandlord = category.id === 'landlords' || formData.role === 'Landlord';
    const statusOptions = isTenant
        ? ['PendingApproval', 'PendingAllocation', 'PendingPayment', 'Active', 'Overdue', 'Notice', 'Vacated', 'Inactive']
        : ['Active', 'Inactive', 'Suspended'];
    const currentRelationship = String(formData.nextOfKinRelationship ?? '');
    const isCustomRelationship = currentRelationship !== '' &&
        !['Spouse', 'Parent', 'Sibling', 'Child'].includes(currentRelationship);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg border border-gray-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">{existingUser ? 'Edit User' : `Add New ${category.title.slice(0, -1)}`}</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                            <input name="name" value={formData.name} onChange={handleChange} placeholder="John Doe" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" required />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                            <input name="username" value={formData.username} onChange={handleChange} placeholder="jdoe" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                            <input name="phone" value={formData.phone} onChange={handleDigitChange} inputMode="numeric" maxLength={12} placeholder="0712345678" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" required />
                        </div>
                        {isTenant && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Alternative Phone</label>
                                <input name="alternativePhone" value={formData.alternativePhone} onChange={handleDigitChange} inputMode="numeric" maxLength={12} placeholder="0712345678" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                            </div>
                        )}
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email *</label>
                            <input name="email" value={formData.email} onChange={handleChange} placeholder="john@example.com" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" required type="email" />
                        </div>
                        
                        {/* Specific Fields per Category */}
                        {isCaretaker && (
                             <div className="col-span-2 bg-orange-50 p-3 rounded border border-orange-100">
                                <label className="block text-xs font-bold text-orange-800 uppercase mb-1">Assigned Property</label>
                                <select 
                                    name="assignedPropertyId" 
                                    value={formData.assignedPropertyId} 
                                    onChange={handleChange} 
                                    className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-orange-500 outline-none"
                                >
                                    <option value="">-- Select Property --</option>
                                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <p className="text-[10px] text-orange-600 mt-1">Caretaker will manage tickets for this property.</p>
                            </div>
                        )}

                        {isInvestor && (
                             <div className="col-span-2 bg-yellow-50 p-3 rounded border border-yellow-100">
                                <label className="block text-xs font-bold text-yellow-800 uppercase mb-1">Referral / Attachment</label>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                     <select name="referrerType" value={formData.referrerType} onChange={handleChange} className="p-2 border rounded bg-white text-xs">
                                         <option value="Agent">Agent</option>
                                         <option value="Landlord">Landlord</option>
                                         <option value="Tenant">Tenant</option>
                                         <option value="Affiliate">Affiliate</option>
                                         <option value="System User">System User</option>
                                         <option value="Investor">Investor</option>
                                         <option value="Caretaker">Caretaker</option>
                                         <option value="Walkin">Walkin</option>
                                     </select>
                                     <select 
                                        name="referrerId" 
                                        value={formData.referrerId} 
                                        onChange={handleChange} 
                                        className="p-2 border rounded bg-white text-xs"
                                        disabled={formData.referrerType === 'Walkin'}
                                     >
                                         <option value="">-- Select Referrer --</option>
                                         {referralOptions.filter(r => 
                                             (formData.referrerType === 'Agent' && r.type === 'Staff' && r.role === 'Field Agent') ||
                                             (formData.referrerType === 'Landlord' && r.type === 'Landlord') ||
                                             (formData.referrerType === 'Tenant' && r.type === 'Tenant') ||
                                             (formData.referrerType === 'Affiliate' && r.type === 'Landlord' && r.role === 'Affiliate') ||
                                             (formData.referrerType === 'System User' && r.type === 'Staff') ||
                                             (formData.referrerType === 'Investor' && r.type === 'Investor') ||
                                             (formData.referrerType === 'Caretaker' && r.type === 'Staff' && r.role === 'Caretaker')
                                         ).map(opt => (
                                             <option key={opt.id} value={opt.id}>{opt.name}</option>
                                         ))}
                                     </select>
                                </div>
                                <p className="text-[10px] text-yellow-600">Commissions will be tracked for the selected referrer.</p>
                            </div>
                        )}

                        {(isContractor || isFundi) && (
                             <div className="col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Specialty / Service</label>
                                <input 
                                    name="specialty" 
                                    value={formData.specialty} 
                                    onChange={handleChange} 
                                    placeholder="e.g. Plumbing, Electrical..." 
                                    className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" 
                                />
                             </div>
                        )}

                        {isLandlord && (
                            <div className="col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-bold text-blue-900 border-b border-blue-200 pb-1 w-full">Management Contract &amp; M-Pesa Integration</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Management Type</label>
                                        <select 
                                            name="managementType" 
                                            value={formData.managementType} 
                                            onChange={handleChange} 
                                            className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="Full RMS">Full Management (Agency collects rent)</option>
                                            <option value="Partial RMS">Partial Management (Landlord collects rent)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Contract Start Date</label>
                                        <input
                                            type="date"
                                            name="contractStartDate"
                                            value={formData.contractStartDate}
                                            onChange={handleChange}
                                            className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Contract Duration (Months)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            name="contractPeriod"
                                            value={formData.contractPeriod}
                                            onChange={handleChange}
                                            placeholder="e.g. 12 (blank = ongoing)"
                                            className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                        />
                                        <p className="text-[10px] text-blue-700 mt-1">Referral commission accrues monthly for this duration.</p>
                                    </div>
                                    

                                    
                                    {formData.managementType === 'Partial RMS' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Shortcode</label>
                                                <input name="mpesaShortcode" value={formData.mpesaShortcode} onChange={handleChange} placeholder="e.g. 174379" className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Passkey</label>
                                                <input name="mpesaPasskey" type="password" value={formData.mpesaPasskey} onChange={handleChange} placeholder="M-Pesa Passkey" className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Consumer Key</label>
                                                <input name="mpesaConsumerKey" type="password" value={formData.mpesaConsumerKey} onChange={handleChange} placeholder="Daraja Consumer Key" className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Consumer Secret</label>
                                                <input name="mpesaConsumerSecret" type="password" value={formData.mpesaConsumerSecret} onChange={handleChange} placeholder="Daraja Consumer Secret" className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {!isContractor && !isFundi && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID Number</label>
                                    <input name="idNumber" value={formData.idNumber} onChange={handleDigitChange} inputMode="numeric" maxLength={10} placeholder="ID No." className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">KRA PIN</label>
                                    <input name="kraPin" value={formData.kraPin} onChange={handleChange} placeholder="A00..." className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                            </>
                        )}
                        {isFieldAgent && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Branch</label>
                                    <input
                                        name="branch"
                                        value={formData.branch}
                                        onChange={handleChange}
                                        placeholder="e.g. Main Branch"
                                        className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Target Salary (KES)</label>
                                    <input
                                        name="targetSalary"
                                        type="number"
                                        value={formData.targetSalary}
                                        onChange={handleChange}
                                        placeholder="0"
                                        className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {isTenant && (
                        <div className="border-t pt-4">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">KYC, Additional Contact &amp; Next of Kin</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rent Start Date</label>
                                    <input name="rentStartDate" type="date" value={formData.rentStartDate} onChange={handleChange} className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Profession / Occupation</label>
                                    <input name="profession" value={formData.profession} onChange={handleChange} placeholder="e.g. Software Engineer" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Workplace / Employer</label>
                                    <input name="workplace" value={formData.workplace} onChange={handleChange} placeholder="Company / Organization name" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Next of Kin Name</label>
                                    <input name="nextOfKinName" value={formData.nextOfKinName} onChange={handleChange} className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Next of Kin Phone</label>
                                    <input name="nextOfKinPhone" value={formData.nextOfKinPhone} onChange={handleDigitChange} inputMode="numeric" maxLength={12} placeholder="0712345678" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Relationship to Tenant</label>
                                    <select
                                        value={showOtherRelationship || isCustomRelationship ? 'Other' : currentRelationship}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === 'Other') {
                                                setShowOtherRelationship(true);
                                                setFormData({ ...formData, nextOfKinRelationship: '' });
                                            } else {
                                                setShowOtherRelationship(false);
                                                setFormData({ ...formData, nextOfKinRelationship: v });
                                            }
                                        }}
                                        className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-primary outline-none"
                                    >
                                        <option value="">-- Select --</option>
                                        <option value="Spouse">Spouse</option>
                                        <option value="Parent">Parent</option>
                                        <option value="Sibling">Sibling</option>
                                        <option value="Child">Child</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    {(showOtherRelationship || isCustomRelationship) && (
                                        <input
                                            name="nextOfKinRelationship"
                                            value={currentRelationship}
                                            onChange={handleChange}
                                            placeholder="Specify relationship"
                                            className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none mt-2"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
                            <select name="role" value={formData.role} onChange={handleChange} className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-primary outline-none">
                                {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-primary outline-none">
                                {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                         </div>
                    </div>

                    {formData.role !== 'Tenant' && (
                        <div className="bg-gray-50 p-3 rounded border border-gray-200 mt-2">
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">App Scope (Shared Access)</label>
                            <select 
                                name="appScope" 
                                value={formData.appScope} 
                                onChange={handleChange} 
                                className="w-full p-2 border rounded bg-white text-sm focus:ring-1 focus:ring-primary outline-none"
                            >
                                <option value="Full">Full RMS App Only</option>
                                <option value="Partial">Partial RMS App Only</option>
                                <option value="Both">Both Apps (Shared)</option>
                            </select>
                            <p className="text-[10px] text-gray-500 mt-1">
                                Determines which application platform this user has access to. Operations like field agents, affiliates, and contractors can work across both platforms.
                            </p>
                        </div>
                    )}

                    {!existingUser && (
                        <div className="pt-2 border-t mt-2">
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Initial Password</label>
                             <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Set initial password" className="w-full p-2 border rounded focus:ring-1 focus:ring-primary outline-none" required />
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark shadow-sm">
                            {isSaving ? 'Saving...' : existingUser ? 'Update User' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Users: React.FC = () => {
    const { 
        staff, landlords, tenants, roles, renovationInvestors, vendors, properties, applications,
        addStaff, updateStaff, deleteStaff,
        addLandlord, updateLandlord, deleteLandlord,
        addTenant, updateTenant, deleteTenant, updateProperty, updateApplication, deleteApplication,
        addRenovationInvestor, updateRenovationInvestor, deleteRenovationInvestor,
        addVendor, updateVendor, deleteVendor,
        checkPermission, currentUser,
        rawProperties, rawTenants, bills, invoices, updateBill, updateInvoice
    } = useData();

    const isSuperAdmin    = (currentUser as any)?.role === 'Super Admin';
    const isAssistantAdmin = (currentUser as any)?.role === 'Assistant Admin';

    const canCreate = isSuperAdmin || isAssistantAdmin || checkPermission('Users', 'create');
    const canEdit   = isSuperAdmin || isAssistantAdmin || checkPermission('Users', 'edit');
    const canDelete = isSuperAdmin || checkPermission('Users', 'delete');

    // UI State
    const [activeCategoryId, setActiveCategoryId] = useState('system');
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [resetUser, setResetUser] = useState<UnifiedUser | null>(null);
    const [editUser, setEditUser] = useState<UnifiedUser | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // System users can only be added by Super Admin or Assistant Admin.
    // All other categories (tenants, landlords, etc.) allow anyone with canCreate.
    const canAddCurrentCategory = activeCategoryId === 'system'
        ? (isSuperAdmin || isAssistantAdmin)
        : canCreate;

    // Roles that have their own dedicated category — excluded from System Users
    const PORTAL_ROLES = new Set(['Field Agent', 'Caretaker', 'Landlord', 'Tenant', 'Investor', 'Affiliate', 'Contractor', 'Fundi']);

    // System Users = every role that is NOT a portal/external role.
    // This includes Super Admin, plus any custom staff roles (Assistant Admin,
    // Branch Manager, Accountant, etc.) regardless of their isSystem flag.
    const systemRoleNames = useMemo(() => {
        return roles.filter(r => !PORTAL_ROLES.has(r.name)).map(r => r.name);
    }, [roles]);

    // Construct Categories with dynamic system roles
    const categories: UserCategory[] = useMemo(() => [
        { id: 'system', title: 'System Users', roles: systemRoleNames, color: 'bg-blue-500', icon: 'system-user' },
        { id: 'field', title: 'Field Agents', roles: ['Field Agent'], color: 'bg-green-500', icon: 'agent' },
        { id: 'caretakers', title: 'Caretakers', roles: ['Caretaker'], color: 'bg-orange-500', icon: 'caretaker' },
        { id: 'landlords', title: 'Landlords', roles: ['Landlord'], color: 'bg-purple-500', icon: 'landlords' },
        { id: 'tenants', title: 'Tenants', roles: ['Tenant'], color: 'bg-indigo-500', icon: 'tenants' },
        { id: 'investors', title: 'Investors', roles: ['Investor'], color: 'bg-yellow-500', icon: 'revenue' },
        { id: 'affiliates', title: 'Affiliates', roles: ['Affiliate'], color: 'bg-pink-500', icon: 'branch' },
        { id: 'contractors', title: 'Contractors', roles: ['Contractor'], color: 'bg-gray-500', icon: 'tools' },
        { id: 'fundis', title: 'Fundis', roles: ['Fundi'], color: 'bg-amber-600', icon: 'tools' },
    ], [systemRoleNames]);

    // Allow deep links like "#/registration/users?category=tenants" to pre-select a user category.
    useEffect(() => {
        const applyCategoryFromHash = () => {
            try {
                const hash = window.location.hash || '';
                const idx = hash.indexOf('?');
                if (idx === -1) return;
                const query = hash.slice(idx + 1);
                const params = new URLSearchParams(query);
                const cat = params.get('category');
                if (!cat) return;
                const exists = categories.some(c => c.id === cat);
                if (exists) {
                    setActiveCategoryId(cat);
                }
            } catch {
                // Ignore hash parsing errors; fall back to default category behavior.
            }
        };

        applyCategoryFromHash();
        window.addEventListener('hashchange', applyCategoryFromHash);
        return () => window.removeEventListener('hashchange', applyCategoryFromHash);
    }, [categories]);

    // Derived State
    const activeCategory = categories.find(c => c.id === activeCategoryId) || categories[0];

    // --- AGGREGATE ALL USERS ---
    // `staff` from context is already deduplicated (mergedStaff from DataContext),
    // so no additional dedup pass is needed here.
    const allUsers: UnifiedUser[] = useMemo(() => {
        const staffUsers: UnifiedUser[] = staff.map(s => ({
            id: s.id, name: s.name, username: s.username, email: s.email, phone: s.phone, role: s.role, status: s.status, type: 'Staff', fullObject: s
        }));
        const landlordUsers: UnifiedUser[] = landlords.map(l => ({
            id: l.id, name: l.name, username: l.username, email: l.email, phone: l.phone, role: (l.role || 'Landlord').trim(), status: l.status, type: 'Landlord', fullObject: l
        }));
        const tenantUsers: UnifiedUser[] = (rawTenants || []).map(t => ({
            id: t.id, name: t.name, username: t.username, email: t.email, phone: t.phone, role: t.role || 'Tenant', status: t.status, type: 'Tenant', fullObject: t
        }));
        const investors: UnifiedUser[] = renovationInvestors.map(i => ({
            id: i.id, name: i.name, username: i.username || '', email: i.email, phone: i.phone, role: 'Investor', status: i.status, type: 'Investor', fullObject: i
        }));
        const contractors: UnifiedUser[] = vendors.map(v => ({
            id: v.id, name: v.name, username: v.username || '', email: v.email || '', phone: v.phone || '', role: (v as any).userRole === 'Fundi' ? 'Fundi' : 'Contractor', status: 'Active', type: 'Vendor', fullObject: v
        }));

        // Cross-category dedup by email — prevents the same person appearing
        // in multiple lists (e.g. a Super Admin who was also added as a Landlord).
        // Tenants are NEVER dropped by this dedup — we never want to "lose" a
        // tenant record just because their email matches a staff/landlord row
        // or another tenant row (the tenant table is the source of truth here).
        const seenEmails = new Set<string>();
        const deduped: UnifiedUser[] = [];
        for (const u of [...staffUsers, ...landlordUsers, ...tenantUsers, ...investors, ...contractors]) {
            const eKey = (u.email || '').toLowerCase().trim();
            const isDummy = !eKey || !eKey.includes('@') || eKey === 'none@example.com' || eKey.includes('n/a') || eKey.includes('dummy');
            const isTenant = u.type === 'Tenant';

            if (isTenant || isDummy || !seenEmails.has(eKey)) {
                deduped.push(u);
                if (!isDummy && !isTenant) seenEmails.add(eKey);
            }
        }
        return deduped;
    }, [staff, landlords, rawTenants, renovationInvestors, vendors]);

    // Filter Users by Active Category Roles and appScope (for Full RMS)
    const categoryUsers = useMemo(() => {
        if (!activeCategory) return [];
        const base = allUsers.filter(u => activeCategory.roles.some(r => r.toLowerCase() === (u.role || '').toLowerCase().trim()));
        // For Tenants we show every tenant regardless of property managementType
        // or appScope — the tenant list should mirror the tenant table exactly
        // so the count matches the Dashboard total. Other categories still
        // respect the Full-RMS appScope filter.
        return base.filter(u => {
            if (u.role === 'Tenant') return true;
            const scopeRaw = (u.fullObject as any).appScope || (u.fullObject as any).app_source;
            const scope = typeof scopeRaw === 'string' ? scopeRaw.trim().toLowerCase() : '';
            return !scope || scope === 'full' || scope === 'full rms' || scope === 'both';
        });
    }, [allUsers, activeCategory, rawProperties]);

    // Track users registered strictly under the other app (Partial RMS)
    const otherAppUsers = useMemo(() => {
        if (!activeCategory) return [];
        const base = allUsers.filter(u => activeCategory.roles.some(r => r.toLowerCase() === (u.role || '').toLowerCase().trim()));
        return base.filter(u => {
            if (u.role === 'Tenant') {
                const prop = (rawProperties || []).find(p => p.id === u.fullObject.propertyId || p.name === u.fullObject.propertyName);
                const isPartialProp = prop ? prop.managementType === 'Partial' : false;
                return isPartialProp; // In Full RMS, other app means Partial RMS
            }
            const scopeRaw = (u.fullObject as any).appScope || (u.fullObject as any).app_source;
            const scope = typeof scopeRaw === 'string' ? scopeRaw.trim().toLowerCase() : '';
            return scope === 'partial' || scope === 'partial rms';
        });
    }, [allUsers, activeCategory, rawProperties]);

    // Pull users tab / state
    const [showPullSection, setShowPullSection] = useState(false);

    const handlePullUserValue = (user: UnifiedUser, targetScope: 'Full' | 'Both') => {
        if (user.type === 'Staff') {
            updateStaff(user.id, { appScope: targetScope });
            alert(`Successfully pulled ${user.name} and migrated all their staff records to Full RMS.`);
        }
        else if (user.type === 'Landlord') {
            const confirmMigrate = confirm(`Do you also want to migrate ${user.name}'s properties and tenants to Full RMS?`);
            if (confirmMigrate) {
                updateLandlord(user.id, { appScope: targetScope, managementType: 'Full RMS' });
                (rawProperties || []).filter(p => p.landlordId === user.id).forEach(prop => {
                    updateProperty(prop.id, { remittanceType: 'Occupancy Based', managementType: 'Full' });
                });
                alert(`Successfully pulled ${user.name} and migrated all their properties & tenants to Full RMS.`);
            } else {
                updateLandlord(user.id, { appScope: targetScope });
                alert(`Successfully pulled ${user.name} to Full RMS.`);
            }
        }
        else if (user.type === 'Investor') {
            updateRenovationInvestor(user.id, { appScope: targetScope });
            alert(`Successfully pulled ${user.name} to Full RMS.`);
        }
        else if (user.type === 'Vendor') {
            updateVendor(user.id, { appScope: targetScope });
            alert(`Successfully pulled ${user.name} to Full RMS.`);
        }
        else if (user.type === 'Tenant') {
            // Pull tenant from Partial to Full RMS
            const confirmMigrate = confirm(`Are you sure you want to pull tenant ${user.name} to Full RMS? Previous payments, bills, and their property/unit will also be migrated.`);
            if (confirmMigrate) {
                // Find associated property
                const prop = (rawProperties || []).find(p => p.id === user.fullObject.propertyId || p.name === user.fullObject.propertyName);
                if (prop) {
                    // Update property to Full RMS
                    updateProperty(prop.id, { 
                        managementType: 'Full', 
                        remittanceType: 'Occupancy Based' 
                    });
                }
                
                // Ensure all bills of this tenant are correctly linked to their property & unit
                (bills || []).filter(b => b.tenantId === user.id || b.tenantName === user.name).forEach(b => {
                     updateBill(b.id, { propertyId: user.fullObject.propertyId, propertyName: user.fullObject.propertyName });
                });

                // Ensure all invoices of this tenant are correctly linked
                (invoices || []).filter(inv => inv.tenantId === user.id || inv.tenantName === user.name).forEach(inv => {
                     updateInvoice(inv.id, { propertyId: user.fullObject.propertyId, propertyName: user.fullObject.propertyName });
                });

                alert(`Successfully pulled tenant ${user.name}, associated property, previous bills, and payment records to Full RMS.`);
            }
        }
    };

    // Apply Search
    const filteredUsers = useMemo(() => {
        return categoryUsers.filter(u => 
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [categoryUsers, searchQuery]);

    // --- ACTIONS ---

    const handleSaveUser = async (data: any) => {
        const { passwordHash, plainPassword, assignedPropertyId, referrerId, referrerType, specialty, managementType, contractPeriod: rawContractPeriod, contractStartDate: rawContractStartDate, mpesaShortcode, mpesaPasskey, mpesaConsumerKey, mpesaConsumerSecret, ...rest } = data;
        const contractPeriod = String(rawContractPeriod ?? '').trim() === '' ? undefined : Number(rawContractPeriod);
        const contractStartDate = String(rawContractStartDate ?? '').trim() || undefined;
        let newId = rest.id || `${activeCategory.id}-${Date.now()}`;

        // Guard: only a Super Admin may create or edit a Super Admin. This
        // mirrors the role-dropdown filter so Assistant Admins cannot escalate
        // a user to Super Admin even if the request is crafted manually.
        if (!isSuperAdmin) {
            const isEditingSuperAdmin = editUser && (editUser as any).role === 'Super Admin';
            if (rest.role === 'Super Admin' || isEditingSuperAdmin) {
                alert('Only a Super Admin can create or modify a Super Admin account.');
                return;
            }
        }

        const commonFields = {
            id: newId,
            name: rest.name,
            username: rest.username,
            email: rest.email,
            phone: canonicalizePhone(rest.phone) || rest.phone,
            idNumber: rest.idNumber || '',
            status: rest.status,
            passwordHash: passwordHash
        };


        // Enforce unique email across all user categories.
        const trimmedEmail = String(rest.email ?? '').trim().toLowerCase();
        if (trimmedEmail) {
            const emailOwner = allUsers.find(
                u => (u.email || '').toLowerCase() === trimmedEmail && u.id !== (editUser?.id ?? '')
            );
            if (emailOwner) {
                alert(`Email ${rest.email} is already registered to ${emailOwner.name}. Each user must have a unique email address.`);
                return;
            }
        }

        // Enforce unique phone across all user categories.
        const trimmedPhone = String(rest.phone ?? '').trim();
        if (trimmedPhone) {
            // 1) Check app_state (fast path, catches duplicates in UI lists)
            const phoneOwner = allUsers.find(u => u.phone === trimmedPhone && u.id !== (editUser?.id ?? ''));
            if (phoneOwner) {
                alert(`Mobile number ${trimmedPhone} is already registered to ${phoneOwner.name}. Each user must have a unique phone.`);
                return;
            }

            // 2) Check Supabase-backed tables (tenants, landlords, staff_profiles)
            try {
                const { data: phoneRows, error: phoneErr } = await supabase.rpc('check_phone_unique', {
                    p_phone: trimmedPhone,
                });
                if (phoneErr) {
                    console.warn('check_phone_unique failed (non-blocking)', phoneErr);
                } else if (Array.isArray(phoneRows) && phoneRows.length > 0) {
                    const conflict = phoneRows.find((row: any) => row.user_id !== (editUser?.id ?? ''));
                    if (conflict) {
                        alert(`Mobile number ${trimmedPhone} is already registered to ${conflict.name} (${conflict.email}). Each user must have a unique phone.`);
                        return;
                    }
                }
            } catch (e) {
                console.warn('check_phone_unique threw (non-blocking)', e);
            }
        }

        if (editUser) {
            // Update logic
            if (editUser.type === 'Staff') updateStaff(editUser.id, { ...rest, assignedPropertyId, appScope: data.appScope });
            else if (editUser.type === 'Landlord') {
                updateLandlord(editUser.id, { 
                    ...rest, 
                    managementType, 
                    contractPeriod,
                    contractStartDate,

                    appScope: data.appScope,
                    mpesaConfig: mpesaShortcode ? {
                        shortcode: mpesaShortcode,
                        passkey: mpesaPasskey,
                        consumerKey: mpesaConsumerKey,
                        consumerSecret: mpesaConsumerSecret
                    } : undefined
                });
            }
            else if (editUser.type === 'Tenant') {
                const existingTenant = tenants.find(t => t.id === editUser.id);
                const linkedApplication = applications.find(a => a.id === editUser.id);
                if (existingTenant?.status === 'PendingApproval' && linkedApplication && rest.status !== 'PendingApproval') {
                    alert('Approve this applicant from Tenants > Applications before changing their lifecycle status.');
                    return;
                }
                updateTenant(editUser.id, {
                    ...rest,
                    phone: canonicalizePhone(rest.phone) || rest.phone,
                    alternativePhone: canonicalizePhone(rest.alternativePhone) || rest.alternativePhone || undefined,
                    rentStartDate: rest.rentStartDate || undefined,
                    nextOfKinPhone: canonicalizePhone(rest.nextOfKinPhone) || rest.nextOfKinPhone || undefined,
                });
                if (existingTenant?.status === 'PendingApproval' && linkedApplication) {
                    updateApplication(editUser.id, {
                        name: rest.name,
                        email: rest.email,
                        phone: canonicalizePhone(rest.phone) || rest.phone,
                        rentStartDate: rest.rentStartDate || undefined,
                        idNumber: rest.idNumber || '',
                        kraPin: rest.kraPin || '',
                        alternativePhone: canonicalizePhone(rest.alternativePhone) || rest.alternativePhone || undefined,
                        nextOfKinName: rest.nextOfKinName || undefined,
                        nextOfKinPhone: canonicalizePhone(rest.nextOfKinPhone) || rest.nextOfKinPhone || undefined,
                        nextOfKinRelationship: rest.nextOfKinRelationship || undefined,
                    } as Partial<TenantApplication>);
                }
            }
            else if (editUser.type === 'Investor') updateRenovationInvestor(editUser.id, { ...rest, referrerId, referrerType, appScope: data.appScope });
            else if (editUser.type === 'Vendor') updateVendor(editUser.id, { ...rest, specialty, appScope: data.appScope });
            setEditUser(null);
        } else {
            // Create Auth user in Supabase so credentials work for login
            try {
                if (!plainPassword || !rest.email) {
                    throw new Error('Email and initial password are required to create a login-enabled account.');
                }

                const nameParts = String(rest.name ?? '').trim().split(/\s+/).filter(Boolean);
                const firstName = nameParts[0] ?? null;
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
                const fullName = String(rest.name ?? rest.email);

                const isCaretakerCreate =
                    activeCategory.id === 'caretakers' || String(rest.role ?? '').toLowerCase() === 'caretaker';
                const idNumRaw = typeof rest.idNumber === 'string' ? rest.idNumber : '';
                const idNumTrimmed = idNumRaw.trim();
                const pIdNumber = isCaretakerCreate ? null : (idNumTrimmed ? idNumTrimmed : null);

                const { data: createdId, error } = await supabase.rpc('admin_create_auth_user', {
                    p_email: rest.email,
                    p_password: plainPassword,
                    p_role: rest.role ?? activeCategory.roles?.[0] ?? 'Tenant',
                    p_full_name: fullName,
                    p_first_name: firstName,
                    p_last_name: lastName,
                    p_phone: rest.phone ?? null,
                    p_id_number: pIdNumber,
                });
                if (error) throw error;
                if (!createdId) {
                    throw new Error('Auth account was not created. User save cancelled to avoid app-only records.');
                }
                newId = String(createdId);
            } catch (e: any) {
                console.warn('Supabase user creation failed; cancelling user creation', e);
                alert(`Failed to create login-enabled account.\n\nNo user record was saved.\n\n${e?.message ?? e}`);
                return;
            }

            const commonFieldsWithId = { ...commonFields, id: newId, appScope: data.appScope };
            // Create Logic based on Category/Role
            if (activeCategory.id === 'landlords') {
                addLandlord({ 
                    ...commonFieldsWithId, 
                    role: 'Landlord',
                    managementType,
                    contractPeriod,
                    contractStartDate,

                    appScope: data.appScope,
                    mpesaConfig: mpesaShortcode ? {
                        shortcode: mpesaShortcode,
                        passkey: mpesaPasskey,
                        consumerKey: mpesaConsumerKey,
                        consumerSecret: mpesaConsumerSecret
                    } : undefined
                } as User);
            } else if (activeCategory.id === 'tenants') {
                addTenant({
                    ...commonFieldsWithId,
                    status: rest.status || 'PendingApproval',
                    unit: '', rentAmount: 0, rentStartDate: rest.rentStartDate || getTodayIsoDate(), onboardingDate: rest.rentStartDate || getTodayIsoDate(),
                    paymentHistory: [], outstandingBills: [], outstandingFines: [], maintenanceRequests: [],
                    alternativePhone: canonicalizePhone(rest.alternativePhone) || rest.alternativePhone || undefined,
                    nextOfKinName: rest.nextOfKinName || undefined,
                    nextOfKinPhone: canonicalizePhone(rest.nextOfKinPhone) || rest.nextOfKinPhone || undefined,
                    nextOfKinRelationship: rest.nextOfKinRelationship || undefined,
                    profession: rest.profession || undefined,
                    workplace: rest.workplace || undefined,
                } as TenantProfile);
            } else if (activeCategory.id === 'investors') {
                addRenovationInvestor({
                    ...commonFieldsWithId,
                    joinDate: getTodayIsoDate(),
                    referrerId,
                    referrerType,
                    status: 'Active',
                    appScope: data.appScope
                } as RenovationInvestor);
            } else if (activeCategory.id === 'contractors') {
                addVendor({
                    id: newId,
                    name: rest.name,
                    username: rest.username,
                    specialty: specialty || 'General',
                    rating: 5,
                    email: rest.email,
                    phone: rest.phone,
                    appScope: data.appScope,
                    // Although Vendor doesn't strictly have passwordHash in base type, 
                    // we allow saving it to enable login as requested.
                    // @ts-ignore 
                    passwordHash: passwordHash 
                } as Vendor);
            } else if (activeCategory.id === 'fundis') {
                addVendor({
                    id: newId,
                    name: rest.name,
                    username: rest.username,
                    specialty: specialty || 'General',
                    rating: 5,
                    email: rest.email,
                    phone: rest.phone,
                    userRole: 'Fundi',
                    appScope: data.appScope,
                    // @ts-ignore
                    passwordHash: passwordHash
                } as Vendor);
            } else if (activeCategory.id === 'affiliates') {
                addLandlord({ ...commonFieldsWithId, role: 'Affiliate', appScope: data.appScope } as User); // Reuse User for affiliate login
            } else {
                // Staff (System, Field, Caretaker)
                addStaff({ 
                    ...commonFieldsWithId, 
                    role: rest.role, 
                    branch: rest.branch || 'Headquarters', 
                    appScope: data.appScope,
                    payrollInfo: { 
                        baseSalary: Number(rest.targetSalary || 0) || 0, 
                        nextPaymentDate: '' 
                    }, 
                    leaveBalance: { annual: 0 },
                    assignedPropertyId // For Caretakers
                } as StaffProfile);
            }
        }
        setIsFormVisible(false);
    };

    const handleResetPassword = async (plain: string, hash: string) => {
        if (!resetUser) return;

        try {
            const { error } = await supabase.rpc('admin_reset_password', {
                p_user_id: resetUser.id,
                p_new_password: plain,
            });
            if (error) {
                console.warn('admin_reset_password failed', error);
                alert(error.message ?? 'Failed to reset password in auth.');
                return;
            }
        } catch (e: any) {
            console.warn('admin_reset_password threw', e);
            alert(e?.message ?? 'Failed to reset password in auth.');
            return;
        }

        if (resetUser.type === 'Staff') updateStaff(resetUser.id, { passwordHash: hash });
        else if (resetUser.type === 'Landlord') updateLandlord(resetUser.id, { passwordHash: hash });
        else if (resetUser.type === 'Tenant') updateTenant(resetUser.id, { passwordHash: hash });
        else if (resetUser.type === 'Investor') updateRenovationInvestor(resetUser.id, { passwordHash: hash });
        else if (resetUser.type === 'Vendor') updateVendor(resetUser.id, { passwordHash: hash } as any);
        
        setResetUser(null);
        alert(`Password for ${resetUser.name} reset successfully.`);
    };

    const handleDeleteUser = (user: UnifiedUser) => {
        if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
            if (user.type === 'Staff') deleteStaff(user.id);
            else if (user.type === 'Landlord') deleteLandlord(user.id);
            else if (user.type === 'Tenant') {
                const tenant = tenants.find(t => t.id === user.id);
                if (tenant?.propertyId && tenant?.unitId) {
                    const prop = properties.find(p => p.id === tenant.propertyId);
                    if (prop) {
                        const updatedUnits = prop.units.map(u => u.id === tenant.unitId ? { ...u, status: 'Vacant' as const } : u);
                        updateProperty(prop.id, { units: updatedUnits as any });
                    }
                }
                const linkedApplication = applications.find(a => a.id === user.id);
                if (tenant?.status === 'PendingApproval' && linkedApplication) deleteApplication(user.id);
                else deleteTenant(user.id);
            }
            else if (user.type === 'Investor') deleteRenovationInvestor(user.id);
            else if (user.type === 'Vendor') deleteVendor(user.id);
        }
    };

    // Get available roles for the current active category to populate dropdown.
    // Assistant Admins can create every role EXCEPT Super Admin — only a Super
    // Admin can grant the Super Admin role.
    const availableRolesForForm = useMemo(() => {
        const base = activeCategory?.id === 'system'
            ? systemRoleNames
            : (activeCategory?.roles ?? []);
        if (!isSuperAdmin) {
            return base.filter(r => r !== 'Super Admin');
        }
        return base;
    }, [activeCategory, systemRoleNames, isSuperAdmin]);


    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="flex justify-between items-center">
                 <div>
                    <h1 className="text-3xl font-bold text-gray-800">User Management</h1>
                    <p className="text-lg text-gray-500 mt-1">Organize users, partners, and field staff.</p>
                 </div>
                 <button onClick={() => window.location.hash = '#/settings/roles-permissions'} className="text-sm font-bold text-primary hover:underline flex items-center">
                    <Icon name="settings" className="w-4 h-4 mr-1" /> Manage Roles & Permissions
                 </button>
            </div>

            {/* Category Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {categories.map(cat => {
                    const count = allUsers.filter(u => {
                        if (!cat.roles.some(r => r.toLowerCase() === (u.role || '').toLowerCase().trim())) return false;
                        if (u.role === 'Tenant') {
                            const prop = (rawProperties || []).find(p => p.id === u.fullObject.propertyId || p.name === u.fullObject.propertyName);
                            return prop ? prop.managementType !== 'Partial' : true;
                        }
                        // Landlords are shared across both apps — count all of them regardless of appScope.
                        if (cat.id === 'landlords') return true;
                        const scopeRaw = (u.fullObject as any).appScope || (u.fullObject as any).app_source;
                        const scope = typeof scopeRaw === 'string' ? scopeRaw.trim() : scopeRaw;
                        return !scope || scope === 'Full' || scope === 'Full RMS' || scope === 'Both';
                    }).length;
                    const isActive = activeCategoryId === cat.id;

                    return (
                        <div 
                            key={cat.id} 
                            onClick={() => { setActiveCategoryId(cat.id); setSearchQuery(''); }}
                            className={`p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 relative overflow-hidden group ${
                                isActive ? 'bg-white border-primary shadow-lg transform -translate-y-1' : 'bg-white border-transparent shadow-sm hover:border-gray-200'
                            }`}
                        >
                            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity`}>
                                <Icon name={cat.icon} className={`w-16 h-16 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                            </div>
                            <div className="relative z-10 flex flex-col items-start">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 text-white shadow-md ${cat.color}`}>
                                    <Icon name={cat.icon} className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-bold text-gray-800">{cat.title}</h3>
                                <p className="text-gray-500 text-xs mt-1">{count} Users</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* List Container - Redesigned to match image */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="flex flex-col md:flex-row justify-between items-center p-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 mb-4 md:mb-0">
                         <Icon name="menu" className="w-5 h-5 text-gray-400" />
                         <h3 className="font-bold text-gray-700 text-lg">
                            {activeCategory?.title} List
                         </h3>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-grow md:w-64">
                             <input 
                                 type="text" 
                                 className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm"
                                 placeholder={`Search ${activeCategory?.title}...`}
                                 value={searchQuery}
                                 onChange={(e) => setSearchQuery(e.target.value)}
                             />
                             <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        </div>
                        {canAddCurrentCategory && (
                            <button
                                onClick={() => { setEditUser(null); setIsFormVisible(true); }}
                                className="bg-[#9D1F15] hover:bg-[#7A1810] text-white px-4 py-2 rounded text-sm font-bold flex items-center whitespace-nowrap transition-colors"
                            >
                                <Icon name="plus" className="w-4 h-4 mr-2" /> Add User
                            </button>
                        )}
                    </div>
                </div>

                {otherAppUsers.length > 0 && (
                    <div className="bg-amber-50/50 p-4 border-b border-amber-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="p-1 px-2 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                                {otherAppUsers.length} Users
                            </span>
                            <p className="text-sm font-semibold text-amber-900">
                                found space in Partial RMS App who are missing in this Full RMS App.
                            </p>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => setShowPullSection(!showPullSection)} 
                            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded transition-all flex items-center"
                        >
                            <Icon name="git-pull-request" className="w-3.5 h-3.5 mr-1" />
                            {showPullSection ? 'Hide Sync Options' : 'Review & Pull Users'}
                        </button>
                    </div>
                )}

                {showPullSection && otherAppUsers.length > 0 && (
                    <div className="bg-amber-50/30 p-4 border-b border-gray-100 space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pull Users to Full RMS Panel</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {otherAppUsers.map(user => {
                                const isSharedOptional = ['Field Agent', 'Affiliate', 'Contractor', 'Fundi'].includes(user.role);
                                return (
                                    <div key={user.id} className="p-3 bg-white rounded border border-gray-150 flex items-center justify-between shadow-xs">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{user.name}</p>
                                            <p className="text-xs text-gray-400">{user.role} &bull; {user.email || 'No Email'}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handlePullUserValue(user, 'Full')}
                                                className="text-xs bg-red-50 text-red-700 font-bold px-2 py-1.5 rounded hover:bg-red-100 transition-all border border-red-200"
                                            >
                                                Pull Here
                                            </button>
                                            {isSharedOptional && (
                                                <button
                                                    type="button"
                                                    onClick={() => handlePullUserValue(user, 'Both')}
                                                    className="text-xs bg-emerald-600 text-white font-bold px-2 py-1.5 rounded hover:bg-emerald-700 transition-all"
                                                >
                                                    Work for Both
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-white border-b border-gray-100 text-gray-500 font-bold text-xs uppercase">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Username</th>
                                <th className="px-6 py-4">Tel</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">RegDate</th>
                                <th className="px-6 py-4 text-center">Active</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.map(user => {
                                const fullObj = user.fullObject as any;
                                const regDate = fullObj.dateRegistered || fullObj.onboardingDate || fullObj.joinDate || 'N/A';
                                const isActive = user.status === 'Active';

                                return (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-800 text-sm uppercase">{user.name}</div>
                                            <div className="text-xs text-gray-500 lowercase">{user.email}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {user.username || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {user.phone}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {user.role}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {regDate}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-block px-3 py-1 rounded text-xs font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {isActive ? 'Yes' : 'No'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {canEdit && (
                                                    <button
                                                        onClick={() => { setEditUser(user); setIsFormVisible(true); }}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center transition-colors"
                                                    >
                                                        <Icon name="settings" className="w-3 h-3 mr-1" /> Edit
                                                    </button>
                                                )}

                                                {canEdit && (
                                                    <button
                                                        onClick={() => setResetUser(user)}
                                                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center transition-colors"
                                                    >
                                                        <Icon name="keys" className="w-3 h-3 mr-1" /> Set Pwd
                                                    </button>
                                                )}

                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDeleteUser(user)}
                                                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center transition-colors"
                                                    >
                                                        <Icon name="trash" className="w-3 h-3 mr-1" /> Del
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredUsers.length === 0 && (
                                <tr><td colSpan={7} className="text-center py-16 text-gray-400">No users found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {isFormVisible && activeCategory && (
                <UserForm 
                    existingUser={editUser || undefined} 
                    category={activeCategory}
                    onClose={() => { setIsFormVisible(false); setEditUser(null); }} 
                    onSave={handleSaveUser} 
                    availableRoles={availableRolesForForm}
                    properties={properties}
                    referralOptions={allUsers}
                />
            )}
            {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onSave={handleResetPassword} />}
        </div>
    );
};

export default Users;
