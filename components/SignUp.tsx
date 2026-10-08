// @ts-nocheck

import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import Icon from './Icon';
import { StaffProfile, TenantProfile } from '../types';
import { supabase } from '../utils/supabaseClient';
import { resolveReferralCode, generateUserReferralCode } from '../utils/referralCode';
import { getTodayIsoDate } from '../utils/timezone';

const ROLES = ['Landlord', 'Tenant', 'Investor', 'Affiliate', 'Contractor', 'Fundi', 'Field Agent', 'Caretaker'] as const;

interface SignUpProps {
    onLogin: (user: StaffProfile | TenantProfile) => void;
}

const SignUp: React.FC<SignUpProps> = ({ onLogin }) => {
    const { 
        systemSettings, 
        addTenant, addLandlord, addRenovationInvestor, addVendor, addStaff, 
        deleteTenant, deleteLandlord, deleteRenovationInvestor, deleteVendor, deleteStaff,
        tenants, landlords, renovationInvestors, vendors, staff 
    } = useData();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        idNumber: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: '' as typeof ROLES[number] | '',
        referralCode: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const { firstName, lastName, phone, idNumber, email, password, confirmPassword, role, referralCode } = formData;
            if (!email || !password) {
                setError('Email and password are required.');
                return;
            }
            if (password.length < 6) {
                setError('Password must be at least 6 characters.');
                return;
            }
            if (password !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
            if (!role) {
                setError('Please select a user type.');
                return;
            }

            const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;

            // Resolve referral code → referrer's ID (all user pools)
            let referrerId: string | undefined;
            const trimmedCode = referralCode.trim().toUpperCase();
            if (trimmedCode) {
                const allPeople = [
                    ...(tenants || []), ...(staff || []),
                    ...(landlords || []), ...(renovationInvestors || []),
                ].map((u: any) => ({ id: u.id, name: u.name || '', referralCode: u.referralCode }));
                referrerId = resolveReferralCode(trimmedCode, allPeople);
            }

            console.log('[Supabase] auth.signUp');
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        role,
                        full_name: fullName,
                        first_name: firstName,
                        last_name: lastName,
                        phone,
                        id_number: idNumber,
                        ...(referrerId ? { referrer_id: referrerId, referral_code: trimmedCode } : {}),
                    },
                },
            });

            if (signUpError) {
                setError(signUpError.message ?? 'Sign up failed');
                return;
            }

            if (!data.user) {
                setError('Sign up failed. Please try again.');
                return;
            }

            // Generate this new user's own referral code and persist it in their metadata
            const ownReferralCode = generateUserReferralCode(fullName, data.user.id);
            supabase.auth.updateUser({
                data: { own_referral_code: ownReferralCode, referral_code: ownReferralCode },
            }).catch(e => console.warn('[SignUp] Failed to store own_referral_code (non-blocking)', e));

            // Fire-and-forget welcome email — must NOT be awaited so the success
            // screen appears immediately without waiting for Edge Function cold-start.
            supabase.functions.invoke('send-email', {
                body: {
                    to: email,
                    subject: 'Welcome to TaskMe Realty',
                    html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Welcome to TaskMe Realty</h2><p>Hello ${firstName || fullName || 'there'},</p><p>Your account was created successfully.</p></div>`,
                },
            }).catch(e => console.warn('[send-email] welcome failed (non-blocking)', e));

            setSuccess(true);

            // Try auto sign-in (works if email confirmation is disabled)
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (!signInError && signInData?.user && signInData?.session) {
                const user = signInData.user;
                let resolvedRole: StaffProfile['role'] = ((user.user_metadata as any)?.role ?? role) as any;

                // Run all three independent lookups in parallel — saves 600-1500ms vs sequential.
                const [roleResult, staffResult, profResult] = await Promise.allSettled([
                    supabase.schema('app').from('user_roles').select('role:roles(name)').eq('user_id', user.id).maybeSingle(),
                    supabase.schema('app').from('staff_profiles').select('id,name,role,email,phone,branch,status').eq('id', user.id).limit(1),
                    supabase.from('profiles').select('first_name, full_name').eq('id', user.id).maybeSingle(),
                ]);

                const roleRow = roleResult.status === 'fulfilled' ? roleResult.value.data : null;
                if (roleRow?.role?.name) resolvedRole = roleRow.role.name as any;

                const staffRows = staffResult.status === 'fulfilled' ? staffResult.value.data : null;
                const staffRow = staffRows?.[0] ?? null;
                const persistedStaff = staff.find(s => s.id === user.id);

                const pickFirstWord = (s: string) => String(s ?? '').trim().split(/\s+/).filter(Boolean)[0] || '';

                let displayName: string = (staffRow?.name ?? fullName ?? user.email ?? 'User') as string;
                const prof = profResult.status === 'fulfilled' ? profResult.value.data : null;
                const first = (prof as any)?.first_name?.trim?.();
                const full = (prof as any)?.full_name?.trim?.();
                if (first) displayName = first;
                else if (full) displayName = full;

                displayName = pickFirstWord(displayName) || (user.email ? pickFirstWord(user.email.split('@')[0]) : '') || 'User';

                // Portals rely on role-specific fields (Tenant needs unit/rent/paymentHistory, etc.).
                // Keep `name` as the canonical full name for internal matching; headers use public.profiles first_name.
                let loggedIn: any = null;
                const uid = user.id;
                if (resolvedRole === 'Tenant') {
                    loggedIn = {
                        id: uid,
                        name: fullName,
                        role: 'Tenant',
                        username: '',
                        email: (user.email ?? email) as string,
                        phone: (staffRow?.phone ?? phone) as string,
                        idNumber: (idNumber ?? '') as string,
                        status: 'Active' as const,
                        unit: '',
                        rentAmount: 0,
                        onboardingDate: getTodayIsoDate(),
                        paymentHistory: [],
                        outstandingBills: [],
                        outstandingFines: [],
                        maintenanceRequests: [],
                        authUserId: uid,
                    } as any;
                } else if (resolvedRole === 'Landlord' || resolvedRole === 'Affiliate') {
                    loggedIn = {
                        id: uid,
                        name: fullName,
                        role: resolvedRole,
                        username: '',
                        email: (user.email ?? email) as string,
                        phone: (staffRow?.phone ?? phone) as string,
                        idNumber: (idNumber ?? '') as string,
                        status: 'Active' as const,
                        branch: (staffRow?.branch ?? (user.user_metadata as any)?.branch ?? 'Headquarters') as any,
                    } as any;
                } else if (resolvedRole === 'Investor') {
                    loggedIn = {
                        id: uid,
                        name: fullName,
                        role: 'Investor',
                        username: '',
                        email: (user.email ?? email) as string,
                        phone: (staffRow?.phone ?? phone) as string,
                        idNumber: (idNumber ?? '') as string,
                        status: 'Active' as const,
                        joinDate: getTodayIsoDate(),
                    } as any;
                } else if (resolvedRole === 'Contractor' || resolvedRole === 'Fundi') {
                    loggedIn = {
                        id: uid,
                        name: fullName,
                        role: resolvedRole,
                        username: '',
                        email: (user.email ?? email) as string,
                        phone: (staffRow?.phone ?? phone) as string,
                        idNumber: (idNumber ?? '') as string,
                        status: 'Active' as const,
                        specialty: (user.user_metadata as any)?.specialty || 'General',
                    } as any;
                } else {
                    // Staff roles: Field Agent, Caretaker, etc.
                    loggedIn = {
                        id: uid,
                        name: fullName,
                        role: (staffRow?.role ?? resolvedRole) as StaffProfile['role'],
                        email: (user.email ?? staffRow?.email ?? email) as string,
                        phone: (staffRow?.phone ?? phone) as string,
                        branch: (staffRow?.branch ?? (user.user_metadata as any)?.branch ?? 'Headquarters') as any,
                        status: (staffRow?.status ?? 'Active') as any,
                        avatar: displayName.split(' ').map((n: string) => n[0]).join('') || 'U',
                        salaryConfig: persistedStaff?.salaryConfig ?? { type: 'Monthly', amount: 0 },
                        bankDetails: persistedStaff?.bankDetails ?? { bankName: '', accountNumber: '', kraPin: '', defaultMethod: 'Bank' },
                        payrollInfo: persistedStaff?.payrollInfo ?? { baseSalary: 0, nextPaymentDate: '' },
                        leaveBalance: persistedStaff?.leaveBalance ?? { annual: 0 },
                        commissions: persistedStaff?.commissions ?? [],
                        deductions: persistedStaff?.deductions ?? [],
                        attendanceRecord: persistedStaff?.attendanceRecord ?? {},
                        passwordHash: '',
                    } as StaffProfile;
                }

                // Mirror signup into Supabase-backed app_state lists so "Registration -> Users" shows them.
                // This does not change UI behavior; it just ensures the user is reflected in the admin module.
                try {
                    const uid = user.id;
                    const meta: any = user.user_metadata ?? {};
                    const base: any = {
                        id: uid,
                        name: fullName,
                        username: '',
                        email,
                        phone,
                        status: 'Active',
                    };

                    if (resolvedRole === 'Tenant') {
                        deleteLandlord(uid);
                        deleteRenovationInvestor(uid);
                        deleteVendor(uid);
                        deleteStaff(uid);
                        if (!tenants.some(t => t.id === uid)) {
                            addTenant({
                                ...base,
                                // Self-registered tenants land in the Pending Approval
                                // queue until an admin reviews and allocates them.
                                status: 'PendingApproval',
                                role: 'Tenant',
                                unit: '',
                                rentAmount: 0,
                                onboardingDate: getTodayIsoDate(),
                                paymentHistory: [],
                                outstandingBills: [],
                                outstandingFines: [],
                                maintenanceRequests: [],
                                referralCode: ownReferralCode,
                                ...(referrerId ? { referrerId } : {}),
                            } as any);
                        }
                    } else if (resolvedRole === 'Landlord' || resolvedRole === 'Affiliate') {
                        deleteTenant(uid);
                        deleteRenovationInvestor(uid);
                        deleteVendor(uid);
                        deleteStaff(uid);
                        if (!landlords.some(l => l.id === uid)) {
                            addLandlord({ ...base, role: resolvedRole, referralCode: ownReferralCode, ...(referrerId ? { referrerId } : {}) } as any);
                        }
                    } else if (resolvedRole === 'Investor') {
                        deleteTenant(uid);
                        deleteLandlord(uid);
                        deleteVendor(uid);
                        deleteStaff(uid);
                        if (!renovationInvestors.some(i => i.id === uid)) {
                            addRenovationInvestor({
                                ...base,
                                role: 'Investor',
                                idNumber: meta.id_number ?? idNumber ?? '',
                                joinDate: getTodayIsoDate(),
                                status: 'Active',
                                referralCode: ownReferralCode,
                                ...(referrerId ? { referrerId } : {}),
                            } as any);
                        }
                    } else if (resolvedRole === 'Contractor' || resolvedRole === 'Fundi') {
                        deleteTenant(uid);
                        deleteLandlord(uid);
                        deleteRenovationInvestor(uid);
                        deleteStaff(uid);
                        if (!vendors.some(v => v.id === uid)) {
                            addVendor({
                                id: uid,
                                name: fullName,
                                username: '',
                                specialty: 'General',
                                rating: 5,
                                email,
                                phone,
                                referralCode: ownReferralCode,
                                userRole: resolvedRole,
                                ...(referrerId ? { referrerId } : {}),
                            } as any);
                        }
                    } else {
                        // Staff roles: Field Agent, Caretaker, etc.
                        deleteTenant(uid);
                        deleteLandlord(uid);
                        deleteRenovationInvestor(uid);
                        deleteVendor(uid);
                        if (!staff.some(s => s.id === uid)) {
                            addStaff({
                                ...base,
                                role: resolvedRole,
                                branch: 'Headquarters',
                                payrollInfo: { baseSalary: 0, nextPaymentDate: '' },
                                leaveBalance: { annual: 0 },
                                referralCode: ownReferralCode,
                                ...(referrerId ? { referrerId } : {}),
                            } as any);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to mirror signup user into app_state lists (non-blocking)', e);
                }

                onLogin(loggedIn);
                return;
            }

            // Email confirmation required — stay on success screen and link to login
        } catch (err: any) {
            setError(err?.message ?? 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = 'w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-700 text-sm';
    const selectClass = 'w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-700 text-sm';

    if (success) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center relative bg-cover bg-center py-4 px-4 overflow-y-auto" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80')` }}>
                <div className="w-full max-w-[320px] md:max-w-[360px] bg-white/95 rounded-2xl shadow-2xl relative z-10 transform transition-all duration-500 animate-fade-in border-2 border-primary">
                    <div className="bg-white p-6 text-center rounded-t-2xl">
                        <div className="mx-auto w-full h-40 flex items-center justify-center relative overflow-hidden">
                            {systemSettings.logo ? (
                                <img src={systemSettings.logo} alt="Logo" className="w-full h-full object-contain rounded-xl" />
                            ) : (
                                <Icon name="branch" className="w-24 h-24 text-primary" />
                            )}
                        </div>
                    </div>
                    <div className="px-5 py-6 text-center space-y-4">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                            <Icon name="check" className="w-6 h-6" />
                        </div>
                        <h2 className="text-base font-bold text-gray-800">Account Created</h2>
                        <p className="text-[10px] text-gray-500">
                            Your account is ready. You can now sign in.
                        </p>
                        <a href="#/" className="block w-full py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-primary to-primary-dark text-white shadow-md hover:shadow-lg transition-all text-center">
                            Sign In
                        </a>
                    </div>
                </div>
                <div className="absolute bottom-4 text-white/50 text-[10px] z-10 text-center w-full px-4">
                    &copy; {new Date().getFullYear()} {systemSettings.companyName || 'TaskMe Realty'}. All rights reserved.
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative bg-cover bg-center py-4 px-4 overflow-y-auto" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80')` }}>
            <div className="w-full max-w-[360px] md:max-w-[400px] bg-white/95 rounded-2xl shadow-2xl relative z-10 transform transition-all duration-500 animate-fade-in border-2 border-primary max-h-[90vh] overflow-hidden flex flex-col">
                <div className="bg-white p-6 text-center rounded-t-2xl flex-shrink-0">
                    <div className="mx-auto w-full h-32 flex items-center justify-center relative overflow-hidden">
                        {systemSettings.logo ? (
                            <img src={systemSettings.logo} alt="Logo" className="w-full h-full object-contain rounded-xl" />
                        ) : (
                            <Icon name="branch" className="w-20 h-20 text-primary" />
                        )}
                    </div>
                </div>

                <div className="px-5 py-4 overflow-y-auto flex-1">
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="text-center mb-3 bg-primary py-3 rounded-lg shadow-sm">
                            <h2 className="text-base font-bold text-white">Create Account</h2>
                            <p className="text-[10px] text-white/90">Sign up for TaskMe</p>
                        </div>

                        {error && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <div className="relative group">
                                <Icon name="user-circle" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                                <input
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    className={inputClass}
                                    placeholder="First name"
                                    autoComplete="given-name"
                                />
                            </div>
                            <div className="relative group">
                                <Icon name="user-circle" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                                <input
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    className={inputClass}
                                    placeholder="Last name"
                                    autoComplete="family-name"
                                />
                            </div>
                        </div>

                        <div className="relative group">
                            <Icon name="communication" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                            <input
                                name="phone"
                                type="tel"
                                value={formData.phone}
                                onChange={handleChange}
                                className={inputClass}
                                placeholder="+254 7XX XXX XXX"
                                autoComplete="tel"
                            />
                        </div>

                        <div className="relative group">
                            <Icon name="leases" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                            <input
                                name="idNumber"
                                value={formData.idNumber}
                                onChange={handleChange}
                                className={inputClass}
                                placeholder="I.D number"
                            />
                        </div>

                        <div className="relative group">
                            <Icon name="mail" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                            <input
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                className={inputClass}
                                placeholder="Email"
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div className="relative group">
                            <Icon name="shield" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                            <input
                                name="password"
                                type={showPassword ? "text" : "password"}
                                value={formData.password}
                                onChange={handleChange}
                                className={inputClass}
                                placeholder="Password"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                title={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.5a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                )}
                            </button>
                        </div>

                        <div className="relative group">
                            <Icon name="shield" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                            <input
                                name="confirmPassword"
                                type={showPassword ? "text" : "password"}
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className={inputClass}
                                placeholder="Confirm Password"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                        </div>

                        <div>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className={selectClass}
                                style={formData.role === '' ? { color: '#9ca3af' } : {}}
                                required
                            >
                                <option value="" disabled>Select User Type</option>
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>

                        {['Tenant', 'Landlord', 'Investor'].includes(formData.role) && (
                            <div className="relative group">
                                <Icon name="referral" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                                <input
                                    name="referralCode"
                                    value={formData.referralCode}
                                    onChange={e => setFormData(prev => ({ ...prev, referralCode: e.target.value.toUpperCase() }))}
                                    className={`${inputClass} font-mono tracking-widest`}
                                    placeholder="Referral code (optional)"
                                    maxLength={10}
                                    autoComplete="off"
                                />
                                {formData.referralCode.length >= 5 && (
                                    <p className="text-[10px] text-teal-600 mt-1 pl-1">Code applied — you will be linked to your referrer.</p>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-2.5 rounded-lg font-bold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all transform active:scale-95 flex justify-center items-center"
                        >
                            {isLoading ? (
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : 'Sign Up'}
                        </button>

                        <p className="text-center text-xs text-gray-600 mt-2">
                            Already have an account?{' '}
                            <a href="#/" className="font-semibold text-primary hover:text-primary-dark hover:underline transition-colors">
                                Sign in
                            </a>
                        </p>
                    </form>
                </div>
            </div>

            <div className="absolute bottom-4 text-white/50 text-[10px] z-10 text-center w-full px-4">
                &copy; {new Date().getFullYear()} {systemSettings.companyName || 'TaskMe Realty'}. All rights reserved.
            </div>
        </div>
    );
};

export default SignUp;
