// @ts-nocheck

import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import Icon from './Icon';
import { User, StaffProfile, TenantProfile } from '../types';
import { supabase } from '../utils/supabaseClient';
import { getTodayIsoDate } from '../utils/timezone';

interface AuthProps {
    onLogin: (user: Partial<User> | StaffProfile | TenantProfile) => void;
}

type AuthView = 'login' | 'forgot' | 'verify-reset' | 'new-password';

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const {
        systemSettings,
        updateSystemSettings,
        staff,
        landlords,
        tenants,
        renovationInvestors,
        vendors,
        addTenant,
        addLandlord,
        addRenovationInvestor,
        addVendor,
        addStaff,
        setCurrentUser,
        addAuditLog,
    } = useData();
    const [view, setView] = useState<AuthView>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loginAttempts, setLoginAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [saasKey, setSaasKey] = useState('');

    // Prewarm Supabase TCP+TLS connection the moment the login page mounts,
    // before the user types anything — eliminates connection setup overhead from signInWithPassword.
    useEffect(() => {
        supabase.auth.getSession().catch(() => {});
    }, []);

    // Form States
    const [loginData, setLoginData] = useState({ identifier: '', password: '' });
    const [resetData, setResetData] = useState({ identifier: '', code: '', newPassword: '' });

    const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => setLoginData({ ...loginData, [e.target.name]: e.target.value });
    
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (lockedUntil !== null && Date.now() < lockedUntil) {
            const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
            alert(`Too many failed login attempts. Please wait ${remaining} seconds before trying again.`);
            return;
        }

        setIsLoading(true);
        try {
            const { identifier, password } = loginData;

            // Allow login via email or phone.
            let loginEmail = identifier.trim();
            if (!loginEmail.includes('@')) {
                // Treat identifier as phone: resolve to email using app_state lists.
                const byPhone =
                    staff.find(s => s.phone === loginEmail) ||
                    landlords.find(l => l.phone === loginEmail) ||
                    tenants.find(t => t.phone === loginEmail) ||
                    renovationInvestors.find(i => i.phone === loginEmail) ||
                    vendors.find(v => v.phone === loginEmail);

                if (!byPhone?.email) {
                    alert('No user found for this phone number.');
                    return;
                }
                loginEmail = byPhone.email;
            }

            console.log('[Supabase] auth.signInWithPassword');
            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (error || !data.user) {
                const next = loginAttempts + 1;
                setLoginAttempts(next);
                if (next >= 5) {
                    setLockedUntil(Date.now() + 5 * 60 * 1000);
                    alert('Too many failed login attempts. Your account is locked for 5 minutes.');
                } else {
                    const rawMsg = String(error?.message ?? '').trim();
                    const isUsefulMsg = rawMsg.length > 3 && rawMsg !== '{}' && rawMsg !== 'null';
                    alert(isUsefulMsg ? rawMsg : 'Login failed. Please check your credentials and try again.');
                }
                return;
            }

            const user = data.user;

            // ── Fast path: user found in local cache → call onLogin() NOW, refine in background ──
            // For existing users whose data is already loaded, this eliminates the DB round-trip
            // from the perceived login delay.  The 3 queries still run but do not block the UI.
            {
                const _uid  = user.id;
                const _meta: any = user.user_metadata ?? {};
                const _pick = (s: string) => String(s ?? '').trim().split(/\s+/).filter(Boolean)[0] || '';
                const _cached: any =
                    staff.find(s => s.id === _uid) ||
                    tenants.find(t => t.id === _uid) ||
                    landlords.find(l => l.id === _uid) ||
                    renovationInvestors.find(i => i.id === _uid) ||
                    (vendors as any[]).find(v => v.id === _uid) ||
                    null;

                if (_cached) {
                    const earlyRole = ((_cached.role ?? _meta.role ?? 'Super Admin')) as StaffProfile['role'];
                    const earlyPic  = _cached.avatar || _cached.profilePicture || _cached.avatarUrl;
                    const earlyObj: any = { ..._cached, role: earlyRole };
                    if (earlyPic) earlyObj.profilePicture = earlyPic;
                    setLoginAttempts(0);
                    setLockedUntil(null);
                    onLogin(earlyObj);
                    try {
                        addAuditLog({
                            id: `login-${_uid}-${Date.now()}`,
                            timestamp: new Date().toISOString(),
                            action: 'Login',
                            user: String(earlyObj.name || earlyObj.email || _uid),
                        });
                    } catch {}

                    // Background: confirm role + display name from DB; patch if different.
                    const _needsStaff = earlyRole !== 'Tenant' && earlyRole !== 'Caretaker';
                    (async () => {
                        const [rr, pr, sr] = await Promise.all([
                            Promise.resolve(supabase.schema('app').from('user_roles').select('role:roles(name)').eq('user_id', _uid).maybeSingle()).catch(() => ({ data: null })),
                            Promise.resolve(supabase.from('profiles').select('first_name, full_name').eq('id', _uid).maybeSingle()).catch(() => ({ data: null })),
                            _needsStaff
                                ? Promise.resolve(supabase.schema('app').from('staff_profiles').select('id,name,role,email,phone,branch,status').eq('id', _uid).limit(1)).catch(() => ({ data: [] as any[] }))
                                : Promise.resolve({ data: [] as any[] }),
                        ]);
                        const dbRole   = ((rr  as any).data?.role?.name ?? earlyRole) as StaffProfile['role'];
                        const dbFirst  = ((pr  as any).data as any)?.first_name?.trim?.() || null;
                        const dbFull   = ((pr  as any).data as any)?.full_name?.trim?.()  || null;
                        const staffRow = Array.isArray((sr as any).data) ? ((sr as any).data[0] ?? null) : null;
                        const dbName   = dbFirst ? _pick(dbFirst) : (dbFull ? _pick(dbFull) : String(earlyObj.name ?? ''));
                        if (dbRole !== earlyRole || dbName !== String(earlyObj.name ?? '')) {
                            setCurrentUser((prev: any) => prev ? { ...prev, role: dbRole, name: dbName } : prev);
                        }
                        // profiles upsert (non-blocking)
                        const looksLikeEmail = (s: string) => s.includes('@');
                        const cf = String(staffRow?.name ?? _meta.full_name ?? dbName ?? '').trim();
                        const sf = cf && !looksLikeEmail(cf) ? cf : null;
                        const si = sf ? (sf.split(/\s+/).filter(Boolean)[0] || null) : null;
                        if (si && (!dbFirst || looksLikeEmail(String(dbFirst ?? '')))) {
                            try {
                                await supabase.from('profiles').upsert({
                                    id: _uid, role: dbRole, first_name: si, full_name: sf,
                                    phone: (staffRow?.phone ?? _meta.phone ?? null) || null,
                                    email: user.email ?? null,
                                }, { onConflict: 'id' });
                            } catch { /* non-blocking */ }
                        }
                    })().catch(() => {});

                    return; // fast path complete — skip the DB-gated slow path below
                }
            }

            // Metadata fast path #2: even if no cached profile is loaded yet, advance the UI
            // immediately using the role hint from user_metadata, then refine in background.
            // This eliminates 3 DB round-trips from perceived login latency.
            const _meta2: any = user.user_metadata ?? {};
            const _metaRoleHint: string = String(_meta2.role ?? '').trim();
            if (_metaRoleHint) {
                const _pickWord = (s: string) => String(s ?? '').trim().split(/\s+/).filter(Boolean)[0] || '';
                const _earlyName = _pickWord(String(_meta2.full_name ?? user.email ?? 'User')) || 'User';
                const _earlyUser: any = {
                    id: user.id,
                    name: _earlyName,
                    email: user.email ?? '',
                    phone: String(_meta2.phone ?? '') ?? '',
                    role: _metaRoleHint,
                    status: 'Active',
                    branch: String(_meta2.branch ?? 'Headquarters'),
                    authUserId: user.id,
                };
                setLoginAttempts(0);
                setLockedUntil(null);
                onLogin(_earlyUser);
                try {
                    addAuditLog({
                        id: `login-${user.id}-${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        action: 'Login',
                        user: String(_earlyUser.name || _earlyUser.email || user.id),
                    });
                } catch {}
                // Background: confirm role + name from DB; patch via setCurrentUser if different.
                (async () => {
                    try {
                        const [rr, pr] = await Promise.all([
                            Promise.resolve(supabase.schema('app').from('user_roles').select('role:roles(name)').eq('user_id', user.id).maybeSingle()).catch(() => ({ data: null })),
                            Promise.resolve(supabase.from('profiles').select('first_name, full_name').eq('id', user.id).maybeSingle()).catch(() => ({ data: null })),
                        ]);
                        const dbRole = ((rr as any).data?.role?.name ?? _metaRoleHint) as any;
                        const dbFirst = ((pr as any).data as any)?.first_name?.trim?.() || null;
                        const dbFull = ((pr as any).data as any)?.full_name?.trim?.() || null;
                        const dbName = dbFirst ? _pickWord(dbFirst) : (dbFull ? _pickWord(dbFull) : _earlyName);
                        if (dbRole !== _metaRoleHint || dbName !== _earlyName) {
                            setCurrentUser((prev: any) => prev ? { ...prev, role: dbRole, name: dbName } : prev);
                        }
                    } catch { /* non-blocking */ }
                })();
                return;
            }

            // Triple-parallel fetch: user_roles + profiles + staff_profiles all fire together.
            // metadata role is used as a hint to decide whether to include staff_profiles;
            // the DB-resolved role (from user_roles) is used afterwards to decide which result to keep.
            let resolvedRole: StaffProfile['role'] = ((user.user_metadata as any)?.role ?? 'Super Admin') as any;
            let profFirst: string | null = null;
            let profFull: string | null = null;
            const metaRole = String((user.user_metadata as any)?.role ?? '');
            const metaNeedsStaff = metaRole !== 'Tenant' && metaRole !== 'Caretaker';

            console.log('[Supabase] parallel: user_roles + profiles + staff_profiles', { userId: user.id });
            const [roleResult, profileResult, staffResult] = await Promise.all([
                Promise.resolve(supabase.schema('app').from('user_roles').select('role:roles(name)').eq('user_id', user.id).maybeSingle()).catch(() => ({ data: null, error: null })),
                Promise.resolve(supabase.from('profiles').select('first_name, full_name').eq('id', user.id).maybeSingle()).catch(() => ({ data: null, error: null })),
                metaNeedsStaff
                    ? Promise.resolve(supabase.schema('app').from('staff_profiles').select('id,name,role,email,phone,branch,status').eq('id', user.id).limit(1)).catch(() => ({ data: [] as any[], error: null }))
                    : Promise.resolve({ data: [] as any[], error: null }),
            ]);

            if ((roleResult as any).data?.role?.name) {
                resolvedRole = (roleResult as any).data.role.name as any;
            }
            profFirst = ((profileResult as any).data as any)?.first_name?.trim?.() || null;
            profFull = ((profileResult as any).data as any)?.full_name?.trim?.() || null;

            // Use the prefetched staff_profiles result if the resolved role confirms it's needed.
            let staffRow: any = null;
            if (resolvedRole !== 'Tenant' && resolvedRole !== 'Caretaker') {
                const staffRows = (staffResult as any).data;
                staffRow = Array.isArray(staffRows) ? (staffRows[0] ?? null) : null;
            }

            const persistedStaff = staff.find(s => s.id === user.id);
            const pickFirstWord = (s: string) => String(s ?? '').trim().split(/\s+/).filter(Boolean)[0] || '';

            // Resolve display name
            let displayName: string = (user.email ?? 'User') as string;
            if (profFirst) displayName = profFirst;
            else if (profFull) displayName = profFull;
            else displayName = (staffRow?.name ?? user.email ?? 'User') as string;

            const fullNameForRecord: string = String(
                profFull || staffRow?.name || (user.user_metadata as any)?.full_name || user.email || 'User',
            );

            // Permanent UX: always greet by first name.
            displayName = pickFirstWord(displayName) || (user.email ? pickFirstWord(user.email.split('@')[0]) : '') || 'User';

            // profiles UPSERT — fire non-blocking; does not affect login outcome so we don't await
            try {
                const looksLikeEmail = (s: string) => s.includes('@');
                const candidateFull = String(staffRow?.name ?? (user.user_metadata as any)?.full_name ?? displayName ?? '').trim();
                const safeFull = candidateFull && !looksLikeEmail(candidateFull) ? candidateFull : null;
                const safeFirst = safeFull ? (safeFull.split(/\s+/).filter(Boolean)[0] || null) : null;
                const needUpsert =
                    !profFirst ||
                    looksLikeEmail(String(profFirst)) ||
                    (!profFull || looksLikeEmail(String(profFull)));
                if (needUpsert && safeFirst) {
                    const meta: any = user.user_metadata ?? {};
                    const idNumRaw = String(meta.id_number ?? '').trim();
                    const row: Record<string, unknown> = {
                        id: user.id,
                        role: resolvedRole,
                        first_name: safeFirst,
                        full_name: safeFull,
                        phone: (staffRow?.phone ?? meta.phone ?? null) || null,
                        email: user.email ?? null,
                    };
                    if (idNumRaw) row.id_number = idNumRaw;
                    supabase.from('profiles').upsert(row, { onConflict: 'id' }).catch(() => {});
                }
            } catch {
                // non-blocking — ignore
            }

            // Build the right "currentUser" object per role (portals rely on role-specific fields).
            let loggedIn: any = null;
            const uid = user.id;
            const meta: any = user.user_metadata ?? {};

            if (resolvedRole === 'Tenant') {
                const existingTenant = tenants.find(t => t.id === uid);
                loggedIn = existingTenant
                    ? { ...existingTenant, role: 'Tenant' }
                    : {
                        id: uid,
                        name: fullNameForRecord,
                        username: '',
                        email: (user.email ?? '') as string,
                        phone: String(meta.phone ?? '') as string,
                        idNumber: String(meta.id_number ?? '') as string,
                        status: 'Active' as const,
                        unit: '',
                        rentAmount: 0,
                        onboardingDate: getTodayIsoDate(),
                        paymentHistory: [],
                        outstandingBills: [],
                        outstandingFines: [],
                        maintenanceRequests: [],
                        role: 'Tenant',
                        authUserId: uid,
                    };
            } else if (resolvedRole === 'Landlord' || resolvedRole === 'Affiliate') {
                const existingLandlord = landlords.find(l => l.id === uid);
                loggedIn = existingLandlord
                    ? { ...existingLandlord, role: resolvedRole }
                    : {
                        id: uid,
                        name: fullNameForRecord,
                        username: '',
                        email: (user.email ?? '') as string,
                        phone: String(meta.phone ?? '') as string,
                        idNumber: String(meta.id_number ?? '') as string,
                        status: 'Active' as const,
                        branch: (staffRow?.branch ?? meta.branch ?? 'Headquarters') as any,
                        role: resolvedRole,
                    };
            } else if (resolvedRole === 'Investor') {
                const existingInvestor = renovationInvestors.find(i => i.id === uid);
                loggedIn = existingInvestor
                    ? { ...existingInvestor, role: 'Investor' }
                    : {
                        id: uid,
                        name: fullNameForRecord,
                        username: '',
                        email: (user.email ?? '') as string,
                        phone: String(meta.phone ?? '') as string,
                        idNumber: String(meta.id_number ?? '') as string,
                        status: 'Active' as const,
                        joinDate: getTodayIsoDate(),
                        role: 'Investor',
                    };
            } else if (resolvedRole === 'Contractor') {
                const existingVendor = vendors.find(v => v.id === uid);
                loggedIn = existingVendor
                    ? { ...(existingVendor as any), role: 'Contractor' }
                    : {
                        id: uid,
                        name: fullNameForRecord,
                        username: '',
                        email: (user.email ?? '') as string,
                        phone: String(meta.phone ?? '') as string,
                        idNumber: String(meta.id_number ?? '') as string,
                        role: 'Contractor',
                        status: 'Active' as const,
                    };
            } else {
                // Staff roles: Field Agent, Caretaker, Accountants, etc.
                const existingStaff = staff.find(s => s.id === uid);
                loggedIn = existingStaff
                    ? { ...existingStaff, role: resolvedRole }
                    : {
                        id: uid,
                        name: fullNameForRecord,
                        role: resolvedRole,
                        email: (user.email ?? staffRow?.email ?? 'unknown@example.com') as string,
                        phone: (staffRow?.phone ?? meta.phone ?? '') as string,
                        branch: (staffRow?.branch ?? meta.branch ?? 'Headquarters') as any,
                        status: (staffRow?.status ?? 'Active') as any,
                        avatar: String(fullNameForRecord).split(' ').map((n: string) => n[0]).join('') || 'U',
                        salaryConfig: persistedStaff?.salaryConfig ?? { type: 'Monthly', amount: 0 },
                        bankDetails: persistedStaff?.bankDetails ?? { bankName: '', accountNumber: '', kraPin: '', defaultMethod: 'Bank' },
                        payrollInfo: persistedStaff?.payrollInfo ?? { baseSalary: 0, nextPaymentDate: '' },
                        leaveBalance: persistedStaff?.leaveBalance ?? { annual: 0 },
                        commissions: persistedStaff?.commissions ?? [],
                        deductions: persistedStaff?.deductions ?? [],
                        attendanceRecord: persistedStaff?.attendanceRecord ?? {},
                        passwordHash: '',
                    };
            }

            // Attach persisted profile picture (stored in app_state user lists) so it "sticks" across re-login.
            const anyId = user.id;
            const fromLists: any =
                staff.find(s => s.id === anyId) ||
                landlords.find(l => l.id === anyId) ||
                tenants.find(t => t.id === anyId) ||
                renovationInvestors.find(i => i.id === anyId) ||
                vendors.find(v => v.id === anyId) ||
                null;
            const pic = fromLists?.avatar || fromLists?.profilePicture || fromLists?.avatarUrl;
            if (pic) (loggedIn as any).profilePicture = pic;

            // Ensure users signing in through public signup are reflected in app_state user lists.
            // This backfills records when signup auto-signin is skipped due to email confirmation.
            try {
                const uid = user.id;
                const meta: any = user.user_metadata ?? {};
                const base: any = {
                    id: uid,
                    name: fullNameForRecord || user.email || 'User',
                    username: '',
                    email: (user.email ?? '') as string,
                    phone: (staffRow?.phone ?? meta.phone ?? '') as string,
                    idNumber: (meta.id_number ?? '') as string,
                    status: 'Active',
                };

                // Backfill: ensure the user appears in the correct app_state list.
                // NOTE: We do NOT call delete functions here — those call admin_delete_auth_user
                // which would delete the user's own auth account. Cross-category dedup is
                // handled by the allUsers memo in Users.tsx and the mergedStaff logic in DataContext.
                if (resolvedRole === 'Tenant') {
                    if (!tenants.some(t => t.id === uid)) {
                        addTenant({
                            ...base,
                            // Tenants created via login backfill have not yet
                            // been reviewed by an admin → Pending Approval.
                            status: 'PendingApproval',
                            role: 'Tenant',
                            unit: '',
                            rentAmount: 0,
                            onboardingDate: getTodayIsoDate(),
                            paymentHistory: [],
                            outstandingBills: [],
                            outstandingFines: [],
                            maintenanceRequests: [],
                        } as any);
                    }
                } else if (resolvedRole === 'Landlord' || resolvedRole === 'Affiliate') {
                    if (!landlords.some(l => l.id === uid)) {
                        addLandlord({ ...base, role: resolvedRole } as any);
                    }
                } else if (resolvedRole === 'Investor') {
                    if (!renovationInvestors.some(i => i.id === uid)) {
                        addRenovationInvestor({
                            ...base,
                            role: 'Investor',
                            joinDate: getTodayIsoDate(),
                            status: 'Active',
                        } as any);
                    }
                } else if (resolvedRole === 'Contractor') {
                    if (!vendors.some(v => v.id === uid)) {
                        addVendor({
                            id: uid,
                            name: base.name,
                            username: '',
                            specialty: 'General',
                            rating: 5,
                            email: base.email,
                            phone: base.phone,
                        } as any);
                    }
                } else {
                    // Staff roles: Field Agent, Caretaker, Super Admin, Accountants, etc.
                    if (!staff.some(s => s.id === uid)) {
                        addStaff({
                            ...base,
                            role: resolvedRole,
                            branch: (staffRow?.branch ?? meta.branch ?? 'Headquarters') as any,
                            payrollInfo: { baseSalary: 0, nextPaymentDate: '' },
                            leaveBalance: { annual: 0 },
                        } as any);
                    }
                }
            } catch (e) {
                console.warn('Failed to backfill signed-in user into app_state lists (non-blocking)', e);
            }

            setLoginAttempts(0);
            setLockedUntil(null);
            onLogin(loggedIn);
            try {
                addAuditLog({
                    id: `login-${(loggedIn as any)?.id || ''}-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    action: 'Login',
                    user: String((loggedIn as any)?.name || (loggedIn as any)?.email || 'User'),
                });
            } catch {}
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetData.identifier) return alert('Please enter your registered phone number.');
        // SMS password reset is pending SMS provider integration.
        // When SMS is live, an OTP will be sent to the phone number here.
        // For now, advance to the code entry screen so the UI flow is ready.
        setView('verify-reset');
    };

    const handleVerifyCode = (e: React.FormEvent) => {
        e.preventDefault();
        // Placeholder: SMS OTP verification will validate the code here.
        // Advance to new-password entry once code is confirmed.
        setView('new-password');
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetData.newPassword || resetData.newPassword.length < 6) {
            return alert('Password must be at least 6 characters.');
        }
        // When SMS OTP integration is live, this will call supabase.auth.updateUser
        // after the OTP token exchange. For now, inform the user.
        alert('SMS password reset is coming soon. Please contact support to reset your password.');
        setView('login');
    };

    if (systemSettings?.saasBillingPreventsLogin && typeof window !== 'undefined' && window.location.hostname === 'app.task-me.ke') {
        return (
            <div id="maintenance-banner-page" className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-6">
                <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-4 border-amber-500 overflow-hidden">
                    <div className="bg-amber-50 p-6 text-center border-b border-amber-100 flex flex-col items-center">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
                            <Icon name="shield" className="w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-extrabold text-amber-700">Under Maintenance</h2>
                    </div>
                    <div className="p-8 text-center space-y-3">
                        <p className="text-gray-700 font-medium text-base">
                            This app is undergoing maintenance. Try again in a few minutes.
                        </p>
                        <p className="text-gray-500 text-sm italic">
                            Sorry for the inconveniences.
                        </p>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen w-full flex items-center justify-center relative bg-cover bg-center py-4 px-4 overflow-y-auto" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80')` }}>
            {/* Added border-2 border-primary to the main card */}
            <div className="w-full max-w-[320px] md:max-w-[360px] bg-white/95 rounded-2xl shadow-2xl relative z-10 transform transition-all duration-500 animate-fade-in border-2 border-primary">
                {/* Header - Company logo pulled from Settings > Profile > Company Branding */}
                <div className="bg-white p-6 text-center rounded-t-2xl">
                    <div className="mx-auto w-full h-40 flex items-center justify-center relative overflow-hidden">
                        {systemSettings?.logo ? (
                            <img src={systemSettings.logo} alt={`${systemSettings.companyName || 'Company'} logo`} className="w-full h-full object-contain rounded-xl" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm font-medium">
                                {systemSettings?.companyName || 'Company Logo'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Content - Compact */}
                <div className="px-5 py-6">
                    {view === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="text-center mb-4 bg-primary py-3 rounded-lg shadow-sm">
                                <h2 className="text-base font-bold text-white">Welcome Back</h2>
                                <p className="text-[10px] text-white/90">Sign in to your account</p>
                            </div>

                            <div className="space-y-3">
                                <div className="relative group">
                                    <Icon name="user-circle" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                                    <input 
                                        name="identifier" 
                                        value={loginData.identifier} 
                                        onChange={handleLoginChange}
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-700 font-medium text-sm"
                                        placeholder="Username, Email or Phone"
                                        required
                                        autoFocus
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                    />
                                </div>
                                <div className="relative group">
                                    <Icon name="shield" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                                    <input 
                                        type={showPassword ? "text" : "password"}
                                        name="password" 
                                        value={loginData.password} 
                                        onChange={handleLoginChange}
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-700 text-sm"
                                        placeholder="Password"
                                        required
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
                            </div>

                            <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                <label className="flex items-center text-gray-500 cursor-pointer">
                                    <input type="checkbox" className="mr-1.5 rounded text-primary focus:ring-primary w-3 h-3" />
                                    Remember me
                                </label>
                                <button type="button" onClick={() => setView('forgot')} className="font-semibold text-primary hover:text-primary-dark hover:underline transition-colors">
                                    Forgot Password?
                                </button>
                            </div>

                            <button 
                                disabled={isLoading} 
                                className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-2.5 rounded-lg font-bold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all transform active:scale-95 flex justify-center items-center"
                            >
                                {isLoading ? (
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : 'Login'}
                            </button>

                            <p className="text-center text-xs text-gray-600 mt-3">
                                Don't have an account?{' '}
                                <a href="#/signup" className="font-semibold text-primary hover:text-primary-dark hover:underline transition-colors">
                                    Sign up here
                                </a>
                            </p>
                        </form>
                    )}

                    {view === 'forgot' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="text-center">
                                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2 text-green-600">
                                    <Icon name="communication" className="w-5 h-5" />
                                </div>
                                <h2 className="text-base font-bold text-gray-800">Reset via SMS</h2>
                                <p className="text-[10px] text-gray-500 mt-1">Enter your registered phone number. A reset code will be sent by SMS.</p>
                            </div>
                            <form onSubmit={handleForgotPassword} className="space-y-3">
                                <input
                                    type="tel"
                                    value={resetData.identifier}
                                    onChange={(e) => setResetData({...resetData, identifier: e.target.value})}
                                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm"
                                    placeholder="+254 7XX XXX XXX"
                                    required
                                    autoFocus
                                />
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-[10px] text-yellow-700 text-center">
                                    SMS reset is pending integration — contact support if urgent.
                                </div>
                                <button disabled={isLoading} className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-bold hover:bg-black transition-colors text-sm">
                                    {isLoading ? 'Sending...' : 'Send SMS Code'}
                                </button>
                            </form>
                            <button onClick={() => setView('login')} className="w-full text-center text-xs text-gray-500 hover:text-gray-800">
                                &larr; Back to Login
                            </button>
                        </div>
                    )}

                    {view === 'verify-reset' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="text-center">
                                <h2 className="text-base font-bold text-gray-800">Verify Identity</h2>
                                <p className="text-[10px] text-gray-500 mt-1">Enter the 4-digit code sent to you.</p>
                            </div>
                            <form onSubmit={handleVerifyCode} className="space-y-3">
                                <input 
                                    value={resetData.code}
                                    onChange={(e) => setResetData({...resetData, code: e.target.value})}
                                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary outline-none text-center text-xl tracking-widest letter-spacing-4"
                                    placeholder="0 0 0 0"
                                    maxLength={4}
                                    required
                                    autoFocus
                                />
                                <button disabled={isLoading} className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-bold hover:bg-black transition-colors text-sm">
                                    {isLoading ? 'Verifying...' : 'Verify Code'}
                                </button>
                            </form>
                        </div>
                    )}

                    {view === 'new-password' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="text-center">
                                <h2 className="text-base font-bold text-gray-800">New Password</h2>
                                <p className="text-[10px] text-gray-500 mt-1">Create a new secure password.</p>
                            </div>
                            <form onSubmit={handleResetPassword} className="space-y-3">
                                <input 
                                    type="password"
                                    value={resetData.newPassword}
                                    onChange={(e) => setResetData({...resetData, newPassword: e.target.value})}
                                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm"
                                    placeholder="New Password"
                                    required
                                    autoFocus
                                />
                                <button disabled={isLoading} className="w-full bg-green-600 text-white py-2.5 rounded-lg font-bold hover:bg-green-700 transition-colors text-sm">
                                    {isLoading ? 'Updating...' : 'Set Password'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="absolute bottom-4 text-white/50 text-[10px] z-10 text-center w-full px-4">
                &copy; {new Date().getFullYear()} {systemSettings.companyName || 'TaskMe Realty'}. All rights reserved.
            </div>
        </div>
    );
};

export default Auth;
