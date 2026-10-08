// @ts-nocheck

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { TenantApplication, RecurringBillSettings, TenantProfile, Unit, Property, ExistingTenantSetup, TenantOnboardingType, BillItem, LeaseTermType, LEASE_TERM_LABELS, LEASE_TERM_MONTHS } from '../../types';
import Icon from '../Icon';
import { uploadToBucket } from '../../utils/supabaseStorage';
import { supabase } from '../../utils/supabaseClient';
import { followStkPaymentCompletion } from '../../utils/stkPaymentFollowup';
import { getMonthlyRentStatus } from '../../utils/rentSchedule';
import { canonicalizePhone, digitsOnly } from '../../utils/phone';
import { resolveReferralCode } from '../../utils/referralCode';
import { calculateProratedFirstMonthRent, getTenantProrationAnchor } from '../../utils/tenantPaymentCycle';
import { buildStandardTenantPaymentPosting } from '../../utils/tenantPaymentPosting';
import { isTenantRentCoveredForMonth } from '../../utils/paymentReporting';
import { fmtDate } from '../../utils/date';
import { computeTenantCardBalance } from '../../utils/tenantCardBalance';
import { buildExistingTenantSeedData, isHistoricalPeriod, normalizeExistingTenantSetup } from '../../utils/existingTenantOnboarding';
import LiveCameraCapture from './LiveCameraCapture';
import SearchableSelect from '../common/SearchableSelect';
import { safeAlert, safeConfirm } from '../../utils/dialogs';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// Helper type to unify TenantProfile and TenantApplication for the UI
export type UnifiedRecord = Omit<Partial<TenantApplication> & Partial<TenantProfile>, 'status'> & {
    status?: string;
    recordType: 'Tenant' | 'Application';
    displayStatus: string;
    submittedDate?: string;
    referrerId?: string; // Added to track specific person
};

const APP_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(162,53,74,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden p-4 flex items-center justify-between min-h-[110px]";
const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(val ?? '').trim());

/** Add N calendar months to an ISO date, returning an ISO (YYYY-MM-DD) string. */
const addMonthsIso = (startIso: string, months: number): string => {
    const start = new Date(startIso);
    if (!startIso || Number.isNaN(start.getTime())) return '';
    const day = start.getDate();
    const end = new Date(start.getFullYear(), start.getMonth() + Math.max(1, Math.round(months)), 1);
    // Clamp to the last day of the target month (e.g. 31 Jan + 1 month → 28/29 Feb).
    const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(day, lastDay));
    const y = end.getFullYear();
    const m = String(end.getMonth() + 1).padStart(2, '0');
    const d = String(end.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/** Resolve the lease length in months from the selected term type. */
const resolveLeaseTermMonths = (
    termType: LeaseTermType | undefined,
    manualMonths?: number | string,
): number => {
    if (termType === 'Manual') {
        const n = Number(manualMonths);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
    }
    return LEASE_TERM_MONTHS[(termType as Exclude<LeaseTermType, 'Manual'>) || 'Yearly'] ?? 12;
};

/** Infer the term type from an existing start/end pair (legacy records). */
const inferLeaseTerm = (
    record: { leaseStartDate?: string; leaseEnd?: string; leaseTermType?: LeaseTermType; leaseTermMonths?: number } | null | undefined,
): { leaseTermType: LeaseTermType; leaseTermMonths: number } => {
    if (record?.leaseTermType) {
        return {
            leaseTermType: record.leaseTermType,
            leaseTermMonths: resolveLeaseTermMonths(record.leaseTermType, record.leaseTermMonths),
        };
    }
    const start = record?.leaseStartDate ? new Date(record.leaseStartDate) : null;
    const end = record?.leaseEnd ? new Date(record.leaseEnd) : null;
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const months = Math.max(1, Math.round(
            (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
        ));
        const preset = (Object.keys(LEASE_TERM_MONTHS) as Array<Exclude<LeaseTermType, 'Manual'>>)
            .find(k => LEASE_TERM_MONTHS[k] === months);
        return preset
            ? { leaseTermType: preset, leaseTermMonths: months }
            : { leaseTermType: 'Manual', leaseTermMonths: months };
    }
    return { leaseTermType: 'Yearly', leaseTermMonths: 12 };
};

/** Realign lease dates to a new rent start date, preserving the lease term length. */
const syncLeaseDatesToRentStart = (
    record: { leaseStartDate?: string; leaseEnd?: string; leaseTermType?: LeaseTermType; leaseTermMonths?: number } | null | undefined,
    newStartIso: string,
): { leaseStartDate: string; leaseEnd: string } => {
    const start = new Date(newStartIso);
    if (!newStartIso || Number.isNaN(start.getTime())) {
        return {
            leaseStartDate: String(record?.leaseStartDate || ''),
            leaseEnd: String(record?.leaseEnd || ''),
        };
    }
    const { leaseTermMonths } = inferLeaseTerm(record);
    return {
        leaseStartDate: newStartIso,
        leaseEnd: addMonthsIso(newStartIso, leaseTermMonths),
    };
};



const getPreviousMonthIso = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
};

const buildHistoricalFineDate = (dueDay?: number) => {
    const resolvedDay = Math.min(28, Math.max(1, Number(dueDay ?? 1) || 1));
    return `${getPreviousMonthIso()}-${String(resolvedDay).padStart(2, '0')}`;
};

const buildDefaultExistingTenantSetup = (source?: Partial<UnifiedRecord>): ExistingTenantSetup => normalizeExistingTenantSetup({
    occupancyStartDate: String(source?.rentStartDate || source?.onboardingDate || getTodayIsoDate()),
    depositAlreadyPaid: Number(source?.depositPaid || 0),
    rentLedger: [{
        period: getPreviousMonthIso(),
        expected: Number(source?.rentAmount || 0),
        paid: 0,
    }],
    fineLedger: [],
});

// Build a list of YYYY-MM periods starting at the occupancy month and ending
// at last month (inclusive). Current and future months are skipped because
// the ongoing month is handled by normal billing, not the historical ledger.
const buildHistoricalPeriods = (occupancyStartIso: string): string[] => {
    const raw = String(occupancyStartIso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) && !/^\d{4}-\d{2}$/.test(raw)) return [];
    const startMonth = raw.slice(0, 7);
    const currentMonth = getCurrentMonthIso();
    if (startMonth >= currentMonth) return [];
    const [sy, sm] = startMonth.split('-').map(Number);
    const [cy, cm] = currentMonth.split('-').map(Number);
    const out: string[] = [];
    let y = sy, m = sm;
    while (y < cy || (y === cy && m < cm)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
};

// Regenerate the rent ledger from an occupancy start date while preserving
// any paid/paidDate the user already entered for matching months.
const rebuildRentLedgerFromOccupancy = (
    occupancyStartIso: string,
    rentAmount: number,
    existingRows: ExistingTenantSetup['rentLedger'],
): ExistingTenantSetup['rentLedger'] => {
    const periods = buildHistoricalPeriods(occupancyStartIso);
    if (periods.length === 0) return existingRows; // nothing to autofill
    const byPeriod = new Map(existingRows.map(r => [r.period, r]));
    return periods.map(period => {
        const prev = byPeriod.get(period);
        return {
            period,
            expected: Number(prev?.expected ?? rentAmount) || rentAmount,
            paid: Number(prev?.paid ?? 0) || 0,
            ...(prev?.paidDate ? { paidDate: prev.paidDate } : {}),
        };
    });
};

function tenantFullyAllocated(t: Partial<TenantProfile>): boolean {
    return !!t.propertyId && !!t.unitId && !!String(t.unit ?? '').trim() && !!String(t.propertyName ?? '').trim();
}

// Arrears text copied to keep Applications card internals aligned with Active Tenants cards.
const getArrearsText = (tenant: TenantProfile) => {
    if (tenant.status !== 'Overdue') return null;

    const rentBills = tenant.outstandingBills?.filter(b =>
        (b.type === 'Rent Arrears' || b.type === 'Rent' || (b.description && b.description.toLowerCase().includes('rent'))) &&
        b.status === 'Pending',
    );

    if (rentBills && rentBills.length > 0) {
        const months = [...new Set(rentBills.map(b => new Date(b.date).toLocaleString('default', { month: 'long' })))];
        if (months.length > 0) return `Backdated Rent (${months.join(', ')})`;
    }

    return 'Backdated Rent';
};

// --- MOVE TENANT MODAL ---
const MoveTenantModal: React.FC<{
    tenant: TenantProfile;
    onClose: () => void;
    onMove: (propertyId: string, unitId: string, propertyName: string, unitName: string) => void;
    properties: Property[];
}> = ({ tenant, onClose, onMove, properties }) => {
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');

    const activeProperty = properties.find(p => p.id === selectedPropertyId);
    const availableUnits = activeProperty?.units.filter(u => u.status === 'Vacant') || [];

    const handleConfirm = () => {
        if (!selectedPropertyId || !selectedUnitId) return alert("Please select a property and unit.");
        const unitName = activeProperty?.units.find(u => u.id === selectedUnitId)?.unitNumber || '';
        const propertyName = activeProperty?.name || '';
        onMove(selectedPropertyId, selectedUnitId, propertyName, unitName);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-4 text-gray-800">Move Tenant</h3>
                <p className="text-sm text-gray-600 mb-4">Moving <strong>{tenant.name}</strong> from {tenant.propertyName} ({tenant.unit})</p>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Property</label>
                        <SearchableSelect
                            value={selectedPropertyId}
                            onChange={(v) => { setSelectedPropertyId(v); setSelectedUnitId(''); }}
                            options={properties.map(p => ({ value: p.id, label: p.name }))}
                            placeholder="Select Property"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Unit</label>
                        <select 
                            className="w-full p-2 border rounded bg-white disabled:bg-gray-100" 
                            value={selectedUnitId} 
                            onChange={e => setSelectedUnitId(e.target.value)}
                            disabled={!selectedPropertyId}
                        >
                            <option value="">Select Unit</option>
                            {availableUnits.map(u => <option key={u.id} value={u.id}>{u.unitNumber} ({u.rent} KES)</option>)}
                        </select>
                        {selectedPropertyId && availableUnits.length === 0 && <p className="text-xs text-red-500 mt-1">No vacant units available.</p>}
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                    <button onClick={handleConfirm} className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Confirm Move</button>
                </div>
            </div>
        </div>
    );
};

export const ApplicationFormModal: React.FC<{ 
    record?: UnifiedRecord; 
    onClose: () => void; 
    onSave: (data: UnifiedRecord) => void;
    properties: Property[];
}> = ({ record, onClose, onSave, properties }) => {
    const { tenants, landlords, staff, vendors, renovationInvestors } = useData(); // Context for referrer lookups
    // Open on 'lease' tab when tenant has no unit assigned yet so the user
    // lands directly on the Rent & Deposit / proration section.
    const needsUnitSetup = !record?.unitId && !record?.unit;
    const [activeTab, setActiveTab] = useState<'details' | 'lease' | 'documents'>(needsUnitSetup ? 'lease' : 'details');
    
    // File inputs refs (reused)
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cameraTarget, setCameraTarget] = useState<null | { kind: 'profile' } | { kind: 'doc'; docType: string; docKey?: string }>(null);

    const defaultRecurringBills: RecurringBillSettings = {
        serviceCharge: 0, garbage: 0, security: 0, waterFixed: 0, other: 0
    };

    // Form State
    const [formData, setFormData] = useState<UnifiedRecord>({
        ...record,
        recurringBills: record?.recurringBills || defaultRecurringBills,
        // Ensure legacy rent data is captured
        rentAmount: record?.rentAmount || 0,
        depositPaid: record?.depositPaid || 0,
        // Start date
        rentStartDate: record?.rentStartDate || record?.onboardingDate || getTodayIsoDate(),
        rentDueDate: record?.rentDueDate ?? 1,
        rentGraceDays: record?.rentGraceDays ?? 4,
        leaseStartDate: (record as any)?.leaseStartDate || getTodayIsoDate(),
        leaseTermType: inferLeaseTerm(record as any).leaseTermType,
        leaseTermMonths: inferLeaseTerm(record as any).leaseTermMonths,
        leaseEnd: (record as any)?.leaseEnd || addMonthsIso(
            (record as any)?.leaseStartDate || getTodayIsoDate(),
            inferLeaseTerm(record as any).leaseTermMonths,
        ),

        source: record?.source || '',
        // Deposit special cases
        depositExempt: record?.depositExempt || false,
        depositMonths: record?.depositMonths ?? 1,
        proratedDeposit: record?.proratedDeposit,
        rentExtension: record?.rentExtension,
        tenantOnboardingType: (record?.tenantOnboardingType === 'Existing' || !!record?.existingTenantSetup) ? 'Existing' : 'New',
        existingTenantSetup: normalizeExistingTenantSetup(record?.existingTenantSetup || buildDefaultExistingTenantSetup(record)),
    });

    const ensureLeaseDates = (prev: any) => {
        const hasStart = !!String(prev.leaseStartDate || '').trim();
        const startIso = hasStart ? String(prev.leaseStartDate) : getTodayIsoDate();
        const term = inferLeaseTerm(prev);
        const endIso = String(prev.leaseEnd || '').trim() || addMonthsIso(startIso, term.leaseTermMonths);
        return {
            ...prev,
            leaseStartDate: startIso,
            leaseEnd: endIso,
            leaseTermType: term.leaseTermType,
            leaseTermMonths: term.leaseTermMonths,
        };
    };

    /** Lease term selection — recomputes leaseEnd from the lease/rent start date. */
    const applyLeaseTerm = (termType: LeaseTermType, manualMonths?: number | string) => {
        setFormData(prev => {
            const months = resolveLeaseTermMonths(termType, manualMonths ?? (prev as any).leaseTermMonths);
            const startIso = String(prev.leaseStartDate || prev.rentStartDate || getTodayIsoDate());
            return {
                ...prev,
                leaseTermType: termType,
                leaseTermMonths: months,
                leaseStartDate: startIso,
                leaseEnd: addMonthsIso(startIso, months),
            } as any;
        });
    };

    // Manual lease-duration entry (months or years) for the "Manual" lease type.
    const initialTerm = inferLeaseTerm(record as any);
    const [manualTermUnit, setManualTermUnit] = useState<'months' | 'years'>(
        initialTerm.leaseTermMonths % 12 === 0 && initialTerm.leaseTermMonths >= 12 ? 'years' : 'months',
    );
    const [manualTermValue, setManualTermValue] = useState<string>(
        String(initialTerm.leaseTermMonths % 12 === 0 && initialTerm.leaseTermMonths >= 12
            ? initialTerm.leaseTermMonths / 12
            : initialTerm.leaseTermMonths),
    );


    // Rent Due Calculation State
    const [rentDue, setRentDue] = useState(0);
    const [calcNote, setCalcNote] = useState('');

    const tenantOnboardingType: TenantOnboardingType = formData.tenantOnboardingType === 'Existing' ? 'Existing' : 'New';
    const existingTenantSetup = useMemo(
        () => normalizeExistingTenantSetup(formData.existingTenantSetup || buildDefaultExistingTenantSetup(formData)),
        [formData.existingTenantSetup, formData.rentStartDate, formData.onboardingDate, formData.depositPaid, formData.rentAmount],
    );

    const setExistingTenantSetup = (updater: (setup: ExistingTenantSetup) => ExistingTenantSetup) => {
        setFormData(prev => ({
            ...prev,
            tenantOnboardingType: 'Existing',
            existingTenantSetup: normalizeExistingTenantSetup(
                updater(normalizeExistingTenantSetup(prev.existingTenantSetup || buildDefaultExistingTenantSetup(prev))),
            ),
        }));
    };

    const addExistingRentLedgerRow = () => {
        setExistingTenantSetup(setup => ({
            ...setup,
            rentLedger: [
                ...setup.rentLedger,
                {
                    period: getPreviousMonthIso(),
                    expected: Number(formData.rentAmount || 0),
                    paid: 0,
                },
            ],
        }));
    };

    const updateExistingRentLedgerRow = (index: number, field: 'period' | 'expected' | 'paid' | 'paidDate', value: string) => {
        setExistingTenantSetup(setup => ({
            ...setup,
            rentLedger: setup.rentLedger.map((row, rowIndex) => {
                if (rowIndex !== index) return row;
                if (field === 'period') return { ...row, period: value };
                if (field === 'expected') return { ...row, expected: value === '' ? 0 : parseFloat(value) || 0 };
                if (field === 'paidDate') return { ...row, paidDate: value || undefined };
                return { ...row, paid: value === '' ? 0 : parseFloat(value) || 0 };
            }),
        }));
    };

    const removeExistingRentLedgerRow = (index: number) => {
        setExistingTenantSetup(setup => ({
            ...setup,
            rentLedger: setup.rentLedger.filter((_, rowIndex) => rowIndex !== index),
        }));
    };

    const addExistingFineLedgerRow = () => {
        setExistingTenantSetup(setup => ({
            ...setup,
            fineLedger: [
                ...setup.fineLedger,
                {
                    date: buildHistoricalFineDate(formData.rentDueDate),
                    type: 'Late Fee',
                    amount: 0,
                    status: 'Pending',
                },
            ],
        }));
    };

    const updateExistingFineLedgerRow = (index: number, field: 'date' | 'type' | 'amount' | 'status', value: string) => {
        setExistingTenantSetup(setup => ({
            ...setup,
            fineLedger: setup.fineLedger.map((row, rowIndex) => {
                if (rowIndex !== index) return row;
                if (field === 'date') return { ...row, date: value };
                if (field === 'type') return { ...row, type: value };
                if (field === 'amount') return { ...row, amount: value === '' ? 0 : parseFloat(value) || 0 };
                return { ...row, status: value === 'Paid' ? 'Paid' : 'Pending' };
            }),
        }));
    };

    const removeExistingFineLedgerRow = (index: number) => {
        setExistingTenantSetup(setup => ({
            ...setup,
            fineLedger: setup.fineLedger.filter((_, rowIndex) => rowIndex !== index),
        }));
    };

    // Handle Property/Unit Selection
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>(record?.propertyId || '');
    const [selectedUnitId, setSelectedUnitId] = useState<string>(record?.unitId || '');

    // ── Multi-Occupancy state ────────────────────────────────────────────
    // When `occupancyType === 'Multi'`, the primary property/unit above is
    // treated as the Main unit, and `subUnits` lists additional Sub units.
    // Each Sub will be created as its own tenant record linked via mainTenantId.
    type SubUnitDraft = { propertyId: string; unitId: string; rent: number };
    // Sticky multi-occupancy:
    //  - any record persisted as `occupancyType === 'Main'`
    //  - OR an applicant draft that already has sub-unit drafts on file
    //  …both load as 'Multi' so the user can come back and add/remove units.
    const hasSubDrafts = Array.isArray((record as any)?._subUnitDrafts) && (record as any)._subUnitDrafts.length > 0;
    const recordOccupancy = String((record as any)?.occupancyType || '');
    const hasPersistedSubs = !!record?.id && Array.isArray(tenants) && tenants.some(t =>
        t.mainTenantId === record.id && t.status !== 'Vacated' && t.status !== 'Evicted'
    );
    const initialOccupancy: 'Single' | 'Multi' =
        (recordOccupancy === 'Main' || recordOccupancy === 'Multi' || hasSubDrafts || hasPersistedSubs) ? 'Multi' : 'Single';
    const [occupancyType, setOccupancyType] = useState<'Single' | 'Multi'>(initialOccupancy);
    const [subUnits, setSubUnits] = useState<SubUnitDraft[]>(() => {
        // Hydrate from saved Sub tenants tied to this Main (edit mode), or
        // from `_subUnitDrafts` persisted on the applicant when no Sub tenant
        // records exist yet (Pending Approval / re-opened application).
        if (initialOccupancy !== 'Multi') return [];
        if (record?.id && Array.isArray(tenants) && tenants.length > 0) {
            const fromTenants = tenants
                .filter(t => t.mainTenantId === record.id && t.status !== 'Vacated' && t.status !== 'Evicted')
                .map(t => ({ propertyId: t.propertyId || '', unitId: t.unitId || '', rent: Number(t.rentAmount || 0) }));
            if (fromTenants.length > 0) return fromTenants;
        }
        if (hasSubDrafts) {
            return ((record as any)._subUnitDrafts as SubUnitDraft[]).map(s => ({
                propertyId: s.propertyId || '',
                unitId: s.unitId || '',
                rent: Number(s.rent || 0),
            }));
        }
        return [];
    });

    const hasHydratedRef = React.useRef(false);

    useEffect(() => {
        hasHydratedRef.current = false;
    }, [record?.id]);

    useEffect(() => {
        if (hasHydratedRef.current) return;
        if (initialOccupancy !== 'Multi' && !hasPersistedSubs) return;

        let resolved: SubUnitDraft[] | null = null;
        if (record?.id && Array.isArray(tenants) && tenants.length > 0) {
            const fromTenants = tenants
                .filter(t => t.mainTenantId === record.id)
                .map(t => ({ propertyId: t.propertyId || '', unitId: t.unitId || '', rent: Number(t.rentAmount || 0) }));
            if (fromTenants.length > 0) {
                resolved = fromTenants;
            }
        }

        if (!resolved && hasSubDrafts) {
            resolved = ((record as any)._subUnitDrafts as SubUnitDraft[]).map(s => ({
                propertyId: s.propertyId || '',
                unitId: s.unitId || '',
                rent: Number(s.rent || 0),
            }));
        }

        if (resolved) {
            setOccupancyType('Multi');
            setSubUnits(resolved);
            hasHydratedRef.current = true;
        }
    }, [tenants, record, initialOccupancy, hasSubDrafts, hasPersistedSubs]);

    const addSubUnit = () => setSubUnits(prev => [...prev, { propertyId: '', unitId: '', rent: 0 }]);
    const removeSubUnit = (idx: number) => setSubUnits(prev => prev.filter((_, i) => i !== idx));
    const updateSubUnit = (idx: number, patch: Partial<SubUnitDraft>) => setSubUnits(prev => prev.map((s, i) => {
        if (i !== idx) return s;
        const next = { ...s, ...patch };
        if (patch.propertyId !== undefined && patch.propertyId !== s.propertyId) {
            next.unitId = '';
            next.rent = 0;
        }
        if (patch.unitId !== undefined && patch.unitId !== s.unitId) {
            const prop = properties.find(p => p.id === next.propertyId);
            const unit = prop?.units.find(u => u.id === patch.unitId);
            next.rent = Number(unit?.rent || prop?.defaultMonthlyRent || 0);
        }
        return next;
    }));


    // Initialize IDs based on name match if IDs missing (for legacy data)
    useEffect(() => {
        if (!selectedPropertyId && record?.property) {
            const prop = properties.find(p => p.name === record.property);
            if (prop) setSelectedPropertyId(prop.id);
        }
    }, [record, properties, selectedPropertyId]);

    useEffect(() => {
        if (selectedPropertyId && !selectedUnitId && record?.unit) {
            const prop = properties.find(p => p.id === selectedPropertyId);
            const unit = prop?.units.find(u => u.unitNumber === record.unit);
            if (unit) setSelectedUnitId(unit.id);
        }
    }, [selectedPropertyId, record, properties, selectedUnitId]);

    const activeProperty = properties.find(p => p.id === selectedPropertyId);

    // Units actually occupied: any non-Vacated tenant assigned to this property,
    // excluding the record being edited (so a tenant can keep their own unit).
    const occupiedUnitIds = useMemo(() => {
        const OCCUPYING = ['Active', 'Pending', 'PendingAllocation', 'PendingPayment', 'Overdue', 'Notice'];
        return new Set(
            tenants
                .filter(t =>
                    t.propertyId === selectedPropertyId &&
                    t.id !== record?.id &&
                    OCCUPYING.includes(t.status)
                )
                .map(t => t.unitId)
                .filter(Boolean)
        );
    }, [tenants, selectedPropertyId, record?.id]);

    // Filter units: Vacant AND not actually occupied (cross-reference tenants as source of truth);
    // also always include the current tenant's own unit so they can keep it when editing.
    const availableUnits = activeProperty?.units.filter(u =>
        (u.status === 'Vacant' && !occupiedUnitIds.has(u.id)) ||
        (record?.recordType === 'Tenant' && u.id === record?.unitId)
    ) || [];

    const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedPropertyId(e.target.value);
        setSelectedUnitId(''); // Reset unit when property changes
        const prop = properties.find(p => p.id === e.target.value);
        setFormData(prev => ({ 
            ...prev, 
            propertyId: e.target.value, 
            propertyName: prop?.name, 
            property: prop?.name, // Legacy support
            rentAmount: 0 // Reset rent on property change
        }));
    };

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const uId = e.target.value;
        setSelectedUnitId(uId);
        const unit = activeProperty?.units.find(u => u.id === uId);
        const rent = unit?.rent || activeProperty?.defaultMonthlyRent || 0;
        const depositMonths = activeProperty?.deposit?.months ?? 1;

        setFormData(prev => ({
            ...prev,
            unitId: uId,
            unit: unit?.unitNumber,
            rentAmount: rent,
            depositMonths,
            // Expected deposit — drives invoicing and the "Fully Paid" check.
            // depositPaid stays at whatever the tenant has actually paid
            // (default 0); it must not be pre-filled to the full amount or
            // the card will falsely show the deposit as settled.
            depositExpected: prev.depositExempt ? 0 : rent * depositMonths,
            depositPaid: prev.depositPaid && Number(prev.depositPaid) > 0 ? prev.depositPaid : 0,
        }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            if ((name === 'rentStartDate' || name === 'onboardingDate') && next.existingTenantSetup) {
                next.existingTenantSetup = {
                    ...next.existingTenantSetup,
                    occupancyStartDate: value
                };
            }
            // Rent Start Date is the single source of truth for the tenancy —
            // realign the lease dates (keeping the existing term length) so the
            // tenant profile never shows a stale lease start.
            if (name === 'rentStartDate' && value) {
                const synced = syncLeaseDatesToRentStart(prev as any, value);
                (next as any).leaseStartDate = synced.leaseStartDate;
                (next as any).leaseEnd = synced.leaseEnd;
            }
            return next;
        });
    };


    // Digit-only guard for phone/ID fields. Strips anything non-numeric.
    const handleDigitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: digitsOnly(value) }));
    };

    const STANDARD_RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Child'];
    const currentRelationship = String((formData as any).nextOfKinRelationship ?? '');
    const isCustomRelationship = currentRelationship.length > 0 && !STANDARD_RELATIONSHIPS.includes(currentRelationship);
    // Tracks whether the "Other" option is active so the free-text box appears
    // even before the user has typed a value.
    const [showOtherRelationship, setShowOtherRelationship] = useState<boolean>(isCustomRelationship);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        // Allow empty string so the user can delete the whole number without it
        // snapping back to 0 (the "malignant zero" problem).
        setFormData(prev => ({ ...prev, [name]: value === '' ? '' : parseFloat(value) }));
    };

    const handleRecurringBillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        // Allow empty string for better UX, convert to 0 on use
        const numValue = value === '' ? 0 : parseFloat(value);
        setFormData(prev => ({
            ...prev,
            recurringBills: {
                ...(prev.recurringBills || defaultRecurringBills),
                [name]: numValue
            }
        }));
    };

    const uploadProfilePicFile = async (file: File) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
                const path = `${user.id}/tenant-pic-${Date.now()}.${ext}`;
                const url = await uploadToBucket('profile-pictures', path, file);
                if (record?.recordType === 'Tenant') setFormData(prev => ({ ...prev, avatar: url }));
                else setFormData(prev => ({ ...prev, profilePicture: url }));
            } else {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (record?.recordType === 'Tenant') setFormData(prev => ({ ...prev, avatar: reader.result as string }));
                    else setFormData(prev => ({ ...prev, profilePicture: reader.result as string }));
                };
                reader.readAsDataURL(file);
            }
        } catch (err) {
            console.warn('Upload failed, using base64', err);
            const reader = new FileReader();
            reader.onloadend = () => {
                if (record?.recordType === 'Tenant') setFormData(prev => ({ ...prev, avatar: reader.result as string }));
                else setFormData(prev => ({ ...prev, profilePicture: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            await uploadProfilePicFile(e.target.files[0]);
            e.target.value = '';
        }
    };


    // Rent Calculation Logic
    useEffect(() => {
        if (formData.rentAmount && formData.rentStartDate) {
            const date = new Date(formData.rentStartDate);
            const day = date.getDate();
            const monthlyRent = formData.rentAmount;

            let calculated = 0;
            let note = "";

            if (day <= 10) {
                // 1st to 10th: Full Rent
                calculated = monthlyRent;
                note = "Full month rent charged (joined 1st-10th)";
            } else {
                // 11th onward: Prorated rent
                const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                const daysRemaining = Math.max(0, lastDay - day);
                calculated = (monthlyRent / 30) * daysRemaining;
                note = `Prorated: ${daysRemaining} days remaining`;
            }
            
            setRentDue(Math.round(calculated));
            setCalcNote(note);
        } else {
            setRentDue(0);
            setCalcNote("");
        }
    }, [formData.rentAmount, formData.rentStartDate]);

    const handleSubmit = () => {
        if (!formData.name || !formData.phone) return alert("Name and Phone are required");
        if (!selectedPropertyId || !selectedUnitId) return alert("Property and Unit are required");

        // Multi-occupancy validation
        if (occupancyType === 'Multi') {
            if (subUnits.length === 0) return alert("Multi-Occupancy requires at least one sub unit.");
            const invalid = subUnits.find(s => !s.propertyId || !s.unitId);
            if (invalid) return alert("Each sub unit needs both a property and a unit selected.");
            const dupes = new Set<string>();
            for (const s of [...subUnits.map(s => s.unitId), selectedUnitId]) {
                if (dupes.has(s)) return alert("A unit can only appear once across Main + sub units.");
                dupes.add(s);
            }
        }


        const leaseSigned = !!formData.leaseSigned;
        if (leaseSigned) {
            const docs = Array.isArray(formData.documents) ? formData.documents : [];
            const hasSignedLease = docs.some(d => String(d?.type ?? '') === 'Signed Lease Agreement' && String(d?.url ?? '').trim());
            if (!hasSignedLease) {
                alert('Lease is marked as signed. Please upload the signed lease document.');
                return;
            }
        }

        const activePropertyResolved = properties.find(p => p.id === selectedPropertyId);
        const activeUnitResolved = activePropertyResolved?.units?.find(u => u.id === selectedUnitId);

        const resolvedPropertyName = activePropertyResolved?.name ?? formData.propertyName ?? formData.property ?? '';
        const resolvedUnitNumber = activeUnitResolved?.unitNumber ?? formData.unit ?? '';

        // The value explicitly saved in the tenant form is authoritative.
        // Falling back to the unit's catalogue rent here used to replace an
        // edited 6,000 with the old unit rent (for example ROSE/24 at 5,500).
        const enteredRent = Number(formData.rentAmount);
        const resolvedRent = Number.isFinite(enteredRent) && enteredRent >= 0
            ? enteredRent
            : (activeUnitResolved?.rent ?? activePropertyResolved?.defaultMonthlyRent ?? 0);

        const normalizedExistingSetup = tenantOnboardingType === 'Existing'
            ? normalizeExistingTenantSetup(formData.existingTenantSetup || buildDefaultExistingTenantSetup(formData))
            : undefined;

        if (tenantOnboardingType === 'Existing') {
            const hasInvalidHistoricalPeriod = normalizedExistingSetup!.rentLedger.some(entry => !isHistoricalPeriod(entry.period));
            if (hasInvalidHistoricalPeriod) {
                alert('Historical rent rows must use previous months only.');
                return;
            }
            const hasFutureFine = normalizedExistingSetup!.fineLedger.some(entry => Number(entry.amount || 0) > 0 && entry.date > getTodayIsoDate());
            if (hasFutureFine) {
                alert('Historical fine rows cannot be dated in the future.');
                return;
            }
        }

        const payload = {
            ...(leaseSigned ? ensureLeaseDates(formData) : formData),
            tenantOnboardingType,
            existingTenantSetup: normalizedExistingSetup,
            onboardingDate: formData.rentStartDate || formData.onboardingDate, // Ensure onboardingDate stays in sync with rentStartDate
        };

        // Status lifecycle for Tenant records:
        //   • Existing Active/Overdue/Notice/etc. tenants keep their status.
        //   • New tenant with unit allocated but no payment → PendingPayment.
        //   • Tenant without a unit → PendingAllocation.
        //   • Applications keep their own status (formData.status).
        let resolvedStatus: TenantProfile['status'] | string = formData.status;
        if (formData.recordType === 'Tenant') {
            const hasUnit = !!(selectedPropertyId && selectedUnitId);
            const hasPaid = Array.isArray(formData.paymentHistory) && formData.paymentHistory.some(p => p?.status === 'Paid');
            const currentStatus = String(record?.status || formData.status || '');
            const isLifecyclePending = ['PendingApproval', 'Pending', 'PendingAllocation', 'PendingPayment', ''].includes(currentStatus);
            if (isLifecyclePending || !record?.id) {
                resolvedStatus = tenantOnboardingType === 'Existing'
                    ? (hasUnit ? 'Active' : 'PendingAllocation')
                    : (hasUnit ? 'PendingPayment' : 'PendingAllocation');
            } else {
                resolvedStatus = currentStatus;
            }
        }

        // Coerce any fields the user may have left blank back to safe numeric defaults.
        const safeNum = (v: unknown, fallback: number) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? fallback : n; };

        onSave({
            ...payload,
            propertyId: selectedPropertyId,
            // Ensure UI allocation checks (ActiveTenants tenantFullyAllocated) evaluate correctly.
            propertyName: resolvedPropertyName,
            property: resolvedPropertyName, // legacy
            unitId: selectedUnitId,
            unit: resolvedUnitNumber,
            status: resolvedStatus,
            rentAmount: resolvedRent,
            rentDueDate:   safeNum(payload.rentDueDate,   1),
            rentGraceDays: safeNum(payload.rentGraceDays, 4),
            depositMonths: safeNum(payload.depositMonths, 1),
            depositExpected: payload.depositExempt ? 0 : safeNum(payload.depositExpected, safeNum(payload.rentAmount, resolvedRent) * safeNum(payload.depositMonths, 1)),
            // Multi-occupancy hand-off — parent handleSave creates Sub records.
            occupancyType: occupancyType === 'Multi' ? 'Main' : 'Single',
            _subUnitDrafts: occupancyType === 'Multi' ? subUnits : undefined,

        });
    };

    const upsertDoc = (name: string, type: string, url: string) => {
        setFormData(prev => {
            const docs = Array.isArray(prev.documents) ? [...prev.documents] : [];
            const idx = docs.findIndex(d => String(d?.type) === type);
            const next = { name, type, url };
            if (idx >= 0) docs[idx] = next;
            else docs.push(next);
            let out: any = { ...prev, documents: docs };
            if (type === 'Signed Lease Agreement' && !!prev.leaseSigned) {
                out = ensureLeaseDates(out);
            }
            return out;
        });
    };

    const uploadDocFile = async (file: File, docType: string, docKey?: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                alert('Please sign in to upload documents.');
                return;
            }
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const safeKey = String(docKey || docType).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const path = `${user.id}/tenant-doc-${safeKey}-${Date.now()}.${ext}`;
            const url = await uploadToBucket('documents', path, file);
            upsertDoc(docType, docKey || docType, url);
        } catch (err: any) {
            console.warn('Document upload failed', err);
            alert(err?.message ?? 'Document upload failed.');
        }
    };

    const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string, docKey?: string) => {
        if (!e.target.files || !e.target.files[0]) return;
        await uploadDocFile(e.target.files[0], docType, docKey);
        e.target.value = '';
    };


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
            // Using Staff (Agents) as affiliates for this context or Landlords with Affiliate role
            options = landlords.filter(l => l.role === 'Affiliate').map(l => ({ id: l.id, name: l.name, sub: 'Affiliate' }));
            // Also include staff agents if needed, but keeping it clean
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
             // Posters might imply a specific campaign or location, simple input for now or select list of campaigns
             return (
                 <div className="md:col-span-2">
                     <label className="block text-xs font-medium text-gray-700 mb-1">Poster Location / ID</label>
                     <input 
                        name="referrerId" 
                        value={formData.referrerId || ''} 
                        onChange={handleChange} 
                        placeholder="e.g. CBD-001" 
                        className="w-full p-2 border rounded bg-white"
                     />
                 </div>
             );
        } else if (source === 'Referral') {
             // General Referral
             return (
                 <div className="md:col-span-2">
                     <label className="block text-xs font-medium text-gray-700 mb-1">Referrer Name / Details</label>
                     <input 
                        name="referrerId" 
                        value={formData.referrerId || ''} 
                        onChange={handleChange} 
                        placeholder="Name of referrer" 
                        className="w-full p-2 border rounded bg-white"
                     />
                 </div>
             );
        }

        return (
            <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <SearchableSelect
                    value={formData.referrerId || ''}
                    onChange={(v) => setFormData(prev => ({ ...prev, referrerId: v }))}
                    options={options.map(opt => ({ value: opt.id, label: opt.name, sub: opt.sub }))}
                    placeholder="-- Select Person --"
                />
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold">{record ? `Edit ${record.recordType}` : 'New Application'}</h2>
                        {record?.recordType === 'Tenant' && <p className="text-xs text-blue-600 font-bold">Active Tenant Record</p>}
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    <button onClick={() => setActiveTab('details')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Details</button>
                    <button onClick={() => setActiveTab('lease')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'lease' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Property & Rent</button>
                    <button onClick={() => setActiveTab('documents')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'documents' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Documents</button>
                </div>

                {/* Content */}
                <div className="space-y-4">
                    {activeTab === 'details' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Full Name*</label>
                                    <input name="name" value={formData.name || ''} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">ID Number</label>
                                    <input name="idNumber" value={formData.idNumber || ''} onChange={handleDigitChange} inputMode="numeric" maxLength={10} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">KRA PIN</label>
                                    <input name="kraPin" value={formData.kraPin || ''} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Primary Phone*</label>
                                    <input name="phone" value={formData.phone || ''} onChange={handleDigitChange} inputMode="numeric" maxLength={12} placeholder="0712345678" className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Alternative Phone</label>
                                    <input name="alternativePhone" value={(formData as any).alternativePhone || ''} onChange={handleDigitChange} inputMode="numeric" maxLength={12} placeholder="0712345678" className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                                    <input name="email" value={formData.email || ''} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>

                                {/* Alternative contact + Next of Kin (all optional) */}
                                <div className="md:col-span-2 border-t pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-gray-800 mb-3">Next of Kin</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Next of Kin Full Name</label>
                                            <input name="nextOfKinName" value={(formData as any).nextOfKinName || ''} onChange={handleChange} className="w-full p-2 border rounded" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Next of Kin Phone</label>
                                            <input name="nextOfKinPhone" value={(formData as any).nextOfKinPhone || ''} onChange={handleDigitChange} inputMode="numeric" maxLength={12} placeholder="0712345678" className="w-full p-2 border rounded" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Relationship to Tenant</label>
                                            <select
                                                value={showOtherRelationship || isCustomRelationship ? 'Other' : currentRelationship}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    if (v === 'Other') {
                                                        setShowOtherRelationship(true);
                                                        setFormData(prev => ({ ...prev, nextOfKinRelationship: '' } as any));
                                                    } else {
                                                        setShowOtherRelationship(false);
                                                        setFormData(prev => ({ ...prev, nextOfKinRelationship: v } as any));
                                                    }
                                                }}
                                                className="w-full p-2 border rounded bg-white"
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
                                                    className="w-full p-2 border rounded mt-2"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Source & Referral Section */}
                                <div className="md:col-span-2 border-t pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-gray-800 mb-3">Lead Source</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">How did they find us?</label>
                                            <select name="source" value={formData.source} onChange={handleChange} className="w-full p-2 border rounded bg-white">
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
                                        {renderReferrerSelect()}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'lease' && (
                        <div className="space-y-4">
                            <div className={`rounded-lg border p-4 ${tenantOnboardingType === 'Existing' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Onboarding Type</label>
                                        <select
                                            value={tenantOnboardingType}
                                            onChange={e => {
                                                const nextType = e.target.value === 'Existing' ? 'Existing' : 'New';
                                                setFormData(prev => {
                                                    if (nextType !== 'Existing') {
                                                        return { ...prev, tenantOnboardingType: nextType };
                                                    }
                                                    const baseSetup = normalizeExistingTenantSetup(prev.existingTenantSetup || buildDefaultExistingTenantSetup(prev));
                                                    const rebuilt = rebuildRentLedgerFromOccupancy(
                                                        baseSetup.occupancyStartDate,
                                                        Number(prev.rentAmount || 0),
                                                        baseSetup.rentLedger,
                                                    );
                                                    return {
                                                        ...prev,
                                                        tenantOnboardingType: nextType,
                                                        existingTenantSetup: normalizeExistingTenantSetup({
                                                            ...baseSetup,
                                                            rentLedger: rebuilt.length > 0 ? rebuilt : baseSetup.rentLedger,
                                                        }),
                                                    };
                                                });
                                            }}
                                            className="w-full p-2 border rounded bg-white"
                                        >
                                            <option value="New">New Tenant</option>
                                            <option value="Existing">Existing Tenant</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Occupancy</label>
                                        <select
                                            value={occupancyType}
                                            onChange={e => {
                                                const next = e.target.value === 'Multi' ? 'Multi' : 'Single';
                                                setOccupancyType(next);
                                                if (next === 'Multi' && subUnits.length === 0) {
                                                    addSubUnit();
                                                }
                                            }}
                                            className="w-full p-2 border rounded bg-white"
                                        >
                                            <option value="Single">Single Unit</option>
                                            <option value="Multi">Multi-Occupancy</option>
                                        </select>
                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                            {occupancyType === 'Multi'
                                                ? 'Primary unit below is the Main. Add sub-units further down.'
                                                : 'One unit per tenant.'}
                                        </p>
                                    </div>

                                    {tenantOnboardingType === 'Existing' && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Historical Occupancy Start</label>
                                            <input
                                                type="date"
                                                value={existingTenantSetup.occupancyStartDate}
                                                max={getTodayIsoDate()}
                                                onChange={e => {
                                                    const nextDate = e.target.value;
                                                    setExistingTenantSetup(setup => {
                                                        const rebuilt = rebuildRentLedgerFromOccupancy(
                                                            nextDate,
                                                            Number(formData.rentAmount || 0),
                                                            setup.rentLedger,
                                                        );
                                                        return {
                                                            ...setup,
                                                            occupancyStartDate: nextDate,
                                                            rentLedger: rebuilt.length > 0 ? rebuilt : setup.rentLedger,
                                                        };
                                                    });
                                                }}
                                                className="w-full p-2 border rounded bg-white"
                                            />
                                            <p className="text-[11px] text-gray-500 mt-1">Auto-fills the rent ledger below with every month from this date through last month.</p>
                                        </div>
                                    )}
                                </div>

                                {tenantOnboardingType === 'Existing' && (
                                    <div className="space-y-4 mt-4">
                                        <div className="grid grid-cols-1 gap-4">
                                            <p className="text-xs text-amber-800 bg-white border border-amber-200 rounded p-3">
                                                Existing tenants activate immediately after unit allocation. Enter only prior-month rent rows and any historical fines or late fees that should carry forward. All payment entries are now recorded under Active Tenants &gt; Record Manual Pay / M-Pesa Push.
                                            </p>
                                        </div>


                                        <div className="bg-white border border-amber-200 rounded-lg p-4">
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-800">Historical Rent Ledger</h4>
                                                    <p className="text-xs text-gray-500">Backdate previous months as paid, unpaid, or partial.</p>
                                                </div>
                                                <button type="button" onClick={addExistingRentLedgerRow} className="px-3 py-1.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 hover:bg-amber-200">Add Month</button>
                                            </div>

                                            <div className="space-y-3">
                                                {existingTenantSetup.rentLedger.map((row, index) => {
                                                    const expected = Number(row.expected || 0);
                                                    const statusLabel = `Expected KES ${expected.toLocaleString()}`;

                                                    return (
                                                        <div key={`existing-rent-${index}`} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-gray-600 mb-1">Month</label>
                                                                <input
                                                                    type="month"
                                                                    value={row.period}
                                                                    max={getPreviousMonthIso()}
                                                                    onChange={e => updateExistingRentLedgerRow(index, 'period', e.target.value)}
                                                                    className="w-full p-2 border rounded"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-gray-600 mb-1">Expected Rent</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={row.expected || ''}
                                                                    onChange={e => updateExistingRentLedgerRow(index, 'expected', e.target.value)}
                                                                    className="w-full p-2 border rounded"
                                                                />
                                                            </div>

                                                            <div className="flex items-center justify-between gap-3 md:justify-end">
                                                                <span className="text-xs font-semibold text-gray-600">{statusLabel}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeExistingRentLedgerRow(index)}
                                                                    disabled={existingTenantSetup.rentLedger.length === 1}
                                                                    className="px-3 py-2 text-xs font-semibold rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        </div>

                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="bg-white border border-amber-200 rounded-lg p-4">
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-800">Historical Fines & Late Fees</h4>
                                                    <p className="text-xs text-gray-500">Add prior penalties and mark whether each one is already paid.</p>
                                                </div>
                                                <button type="button" onClick={addExistingFineLedgerRow} className="px-3 py-1.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 hover:bg-amber-200">Add Charge</button>
                                            </div>

                                            {existingTenantSetup.fineLedger.length === 0 ? (
                                                <p className="text-xs text-gray-500">No historical fines recorded yet.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {existingTenantSetup.fineLedger.map((row, index) => (
                                                        <div key={`existing-fine-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-gray-600 mb-1">Date</label>
                                                                <input
                                                                    type="date"
                                                                    value={row.date}
                                                                    onChange={e => updateExistingFineLedgerRow(index, 'date', e.target.value)}
                                                                    className="w-full p-2 border rounded"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-gray-600 mb-1">Type</label>
                                                                <input
                                                                    type="text"
                                                                    value={row.type}
                                                                    onChange={e => updateExistingFineLedgerRow(index, 'type', e.target.value)}
                                                                    className="w-full p-2 border rounded"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-gray-600 mb-1">Amount</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={row.amount || ''}
                                                                    onChange={e => updateExistingFineLedgerRow(index, 'amount', e.target.value)}
                                                                    className="w-full p-2 border rounded"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[11px] font-medium text-gray-600 mb-1">Status</label>
                                                                <select
                                                                    value={row.status}
                                                                    onChange={e => updateExistingFineLedgerRow(index, 'status', e.target.value)}
                                                                    className="w-full p-2 border rounded bg-white"
                                                                >
                                                                    <option value="Pending">Pending</option>
                                                                    <option value="Paid">Paid</option>
                                                                </select>
                                                            </div>
                                                            <button type="button" onClick={() => removeExistingFineLedgerRow(index)} className="px-3 py-2 text-xs font-semibold rounded bg-red-50 text-red-700 hover:bg-red-100">Remove</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Property</label>
                                    <SearchableSelect
                                        value={selectedPropertyId}
                                        onChange={(v) => handlePropertyChange({ target: { value: v } } as any)}
                                        options={properties.map(p => ({ value: p.id, label: p.name }))}
                                        placeholder="-- Choose Property --"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Unit</label>
                                    <select value={selectedUnitId} onChange={handleUnitChange} disabled={!selectedPropertyId} className="w-full p-2 border rounded bg-white">
                                        <option value="">-- Choose Unit --</option>
                                        {availableUnits.map(u => (
                                            <option key={u.id} value={u.id}>{u.unitNumber} ({u.status})</option>
                                        ))}
                                    </select>
                                    {record?.recordType === 'Tenant' && selectedUnitId !== record.unitId && selectedUnitId && (
                                        <p className="text-xs text-orange-600 mt-1 font-bold">⚠️ Reallocation: Tenant will be moved to this unit.</p>
                                    )}
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Rent Start Date</label>
                                    <input type="date" name="rentStartDate" value={formData.rentStartDate} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Rent</label>
                                    <input type="number" name="rentAmount" value={formData.rentAmount ?? ''} placeholder="e.g. 15000" onChange={handleAmountChange} className="w-full p-2 border rounded font-bold" />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Lease Type</label>
                                    <select
                                        value={(formData as any).leaseTermType || 'Yearly'}
                                        onChange={e => applyLeaseTerm(e.target.value as LeaseTermType)}
                                        className="w-full p-2 border rounded bg-white"
                                    >
                                        {(Object.keys(LEASE_TERM_LABELS) as LeaseTermType[]).map(key => (
                                            <option key={key} value={key}>{LEASE_TERM_LABELS[key]}</option>
                                        ))}
                                    </select>
                                </div>

                                {(formData as any).leaseTermType === 'Manual' ? (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Lease Duration</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                value={manualTermValue}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setManualTermValue(val);
                                                    const months = manualTermUnit === 'years' ? Number(val || 0) * 12 : Number(val || 0);
                                                    applyLeaseTerm('Manual', months);
                                                }}
                                                placeholder="e.g. 18"
                                                className="w-full p-2 border rounded"
                                            />
                                            <select
                                                value={manualTermUnit}
                                                onChange={e => {
                                                    const unit = e.target.value as 'months' | 'years';
                                                    setManualTermUnit(unit);
                                                    const months = unit === 'years' ? Number(manualTermValue || 0) * 12 : Number(manualTermValue || 0);
                                                    applyLeaseTerm('Manual', months);
                                                }}
                                                className="p-2 border rounded bg-white"
                                            >
                                                <option value="months">Months</option>
                                                <option value="years">Years</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Lease Ends</label>
                                        <input
                                            type="date"
                                            value={(formData as any).leaseEnd || ''}
                                            onChange={e => setFormData(prev => ({ ...prev, leaseEnd: e.target.value } as any))}
                                            className="w-full p-2 border rounded"
                                        />
                                    </div>
                                )}

                                {(formData as any).leaseTermType === 'Manual' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Lease Ends</label>
                                        <input
                                            type="date"
                                            value={(formData as any).leaseEnd || ''}
                                            onChange={e => setFormData(prev => ({ ...prev, leaseEnd: e.target.value } as any))}
                                            className="w-full p-2 border rounded"
                                        />
                                    </div>
                                )}

                                

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Rent due day (1–28)</label>
                                    <input
                                        type="number"
                                        name="rentDueDate"
                                        min={1}
                                        max={28}
                                        value={formData.rentDueDate ?? ''}
                                        placeholder="1"
                                        onChange={handleAmountChange}
                                        className="w-full p-2 border rounded"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-0.5">Default 1st. Late logic uses this plus grace.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Grace period (days)</label>
                                    <input
                                        type="number"
                                        name="rentGraceDays"
                                        min={0}
                                        max={28}
                                        value={formData.rentGraceDays ?? ''}
                                        placeholder="4"
                                        onChange={handleAmountChange}
                                        className="w-full p-2 border rounded"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-0.5">e.g. 5 → fees accrue from day due+6.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-blue-600 mb-1">Rent Due (Invoiced)</label>
                                    <input type="number" className="w-full p-2 border rounded bg-blue-50 font-bold text-blue-800" value={rentDue} disabled />
                                    <p className="text-[10px] text-gray-500 mt-1 italic">{calcNote}</p>
                                </div>
                            </div>

                            {/* ── Multi-Occupancy: Sub Units ──────────────────────────────────── */}
                            {occupancyType === 'Multi' && (
                                <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <h4 className="text-sm font-bold text-indigo-900">Sub Units</h4>
                                            <p className="text-[11px] text-indigo-700">All rent, bills, deposit and fines from these units accumulate to the Main unit above. Payments are applied to oldest sub-unit arrears first.</p>
                                        </div>
                                        <button type="button" onClick={addSubUnit} className="px-3 py-1.5 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700">+ Add Sub Unit</button>
                                    </div>
                                    {subUnits.length === 0 ? (
                                        <p className="text-xs text-indigo-700 italic">No sub-units yet. Click "Add Sub Unit" to attach one.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {subUnits.map((sub, idx) => {
                                                const subProp = properties.find(p => p.id === sub.propertyId);
                                                const OCCUPYING = ['Active', 'Pending', 'PendingAllocation', 'PendingPayment', 'Overdue', 'Notice'];
                                                const subOccupied = new Set(
                                                    tenants
                                                        .filter(t => t.propertyId === sub.propertyId && t.id !== record?.id && OCCUPYING.includes(t.status))
                                                        .map(t => t.unitId)
                                                        .filter(Boolean)
                                                );
                                                // Disallow picking the Main unit or another already-picked sub unit.
                                                const otherPickedUnitIds = new Set<string>([
                                                    selectedUnitId,
                                                    ...subUnits.filter((_, i) => i !== idx).map(s => s.unitId).filter(Boolean),
                                                ]);
                                                const subAvailable = (subProp?.units || []).filter(u =>
                                                    (u.status === 'Vacant' && !subOccupied.has(u.id) && !otherPickedUnitIds.has(u.id))
                                                );
                                                return (
                                                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-white border border-indigo-200 rounded p-2">
                                                        <div className="md:col-span-4">
                                                            <label className="block text-[11px] font-medium text-gray-700 mb-1">Property</label>
                                                            <SearchableSelect
                                                                value={sub.propertyId}
                                                                onChange={(v) => updateSubUnit(idx, { propertyId: v })}
                                                                options={properties.map(p => ({ value: p.id, label: p.name }))}
                                                                placeholder="-- Choose --"
                                                            />
                                                        </div>
                                                        <div className="md:col-span-4">
                                                            <label className="block text-[11px] font-medium text-gray-700 mb-1">Unit</label>
                                                            <select value={sub.unitId} disabled={!sub.propertyId} onChange={e => updateSubUnit(idx, { unitId: e.target.value })} className="w-full p-2 border rounded bg-white text-sm">
                                                                <option value="">-- Choose --</option>
                                                                {subAvailable.map(u => <option key={u.id} value={u.id}>{u.unitNumber}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="md:col-span-3">
                                                            <label className="block text-[11px] font-medium text-gray-700 mb-1">Rent (KES)</label>
                                                            <input type="number" value={sub.rent || ''} onChange={e => updateSubUnit(idx, { rent: Number(e.target.value || 0) })} className="w-full p-2 border rounded text-sm" />
                                                        </div>
                                                        <div className="md:col-span-1 flex justify-end">
                                                            <button type="button" onClick={() => removeSubUnit(idx)} className="px-2 py-2 text-xs font-semibold rounded bg-red-50 text-red-700 hover:bg-red-100">×</button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* ── Deposit Configuration ──────────────────────────────────────────── */}
                            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h4 className="text-xs font-bold text-gray-700 mb-3">Deposit Configuration</h4>

                                {/* Deposit Exempt */}
                                <label className="flex items-center gap-2 cursor-pointer mb-3">
                                    <input
                                        type="checkbox"
                                        checked={!!formData.depositExempt}
                                        onChange={e => {
                                            const exempt = e.target.checked;
                                            setFormData(prev => ({
                                                ...prev,
                                                depositExempt: exempt,
                                                depositPaid: exempt ? 0 : (prev.rentAmount || 0) * (prev.depositMonths ?? 1),
                                                proratedDeposit: exempt ? undefined : prev.proratedDeposit,
                                                rentExtension: exempt ? undefined : prev.rentExtension,
                                            }));
                                        }}
                                        className="h-4 w-4 text-primary rounded border-gray-300"
                                    />
                                    <span className="text-sm font-semibold text-gray-700">Deposit Exempt</span>
                                    <span className="text-xs text-gray-500 ml-1">— tenant pays rent only, no deposit collected</span>
                                </label>

                                {!formData.depositExempt && (<>
                                    {/* Deposit Months */}
                                    <div className="mb-3">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Deposit Months</label>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <input
                                                type="number"
                                                min={1}
                                                max={12}
                                                value={formData.depositMonths ?? ''}
                                                disabled={!!formData.proratedDeposit?.enabled}
                                                onChange={e => {
                                                    const raw = e.target.value;
                                                    if (raw === '') {
                                                        setFormData(prev => ({ ...prev, depositMonths: '' as any }));
                                                        return;
                                                    }
                                                    const months = Math.max(1, parseInt(raw) || 1);
                                                    setFormData(prev => {
                                                        const rent = Number(prev.rentAmount) || 0;
                                                        const newExpected = prev.depositExempt ? 0 : rent * months;
                                                        return {
                                                            ...prev,
                                                            depositMonths: months,
                                                            // Keep depositExpected in sync so downstream views
                                                            // (Active Tenants card, invoicing, allocations) reflect
                                                            // the edit globally.
                                                            depositExpected: newExpected,
                                                            // Cap depositPaid at the new expected amount.
                                                            depositPaid: Math.min(Number(prev.depositPaid) || 0, newExpected) || (prev.depositPaid ? Math.min(Number(prev.depositPaid), newExpected) : 0),
                                                        };
                                                    });
                                                }}
                                                className="w-20 p-2 border rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => {
                                                        const months = Math.max(1, Number(prev.depositMonths) || 1);
                                                        const rent = Number(prev.rentAmount) || 0;
                                                        const newExpected = prev.depositExempt ? 0 : rent * months;
                                                        return {
                                                            ...prev,
                                                            depositMonths: months,
                                                            depositExpected: newExpected,
                                                            depositPaid: Math.min(Number(prev.depositPaid) || 0, newExpected),
                                                            proratedDeposit: prev.proratedDeposit?.enabled ? {
                                                                ...prev.proratedDeposit,
                                                                totalDepositAmount: newExpected,
                                                                durationMonths: months,
                                                                monthlyInstallment: months > 0 ? Math.ceil(newExpected / months) : newExpected,
                                                            } : prev.proratedDeposit,
                                                        };
                                                    });
                                                }}
                                                className="px-3 py-1.5 text-xs font-bold bg-primary text-white rounded hover:bg-primary-dark shadow-sm"
                                            >
                                                Recalculate
                                            </button>
                                            <span className="text-xs text-gray-500">
                                                × KES {(formData.rentAmount || 0).toLocaleString()} = <strong>KES {((formData.depositMonths ?? 1) * (formData.rentAmount || 0)).toLocaleString()}</strong>
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1">Click <strong>Recalculate</strong> to propagate the new deposit total to the tenant card, invoicing and allocations after saving.</p>
                                        {(formData.depositMonths ?? 1) > 1 && !formData.proratedDeposit?.enabled && (
                                            <p className="text-xs text-indigo-600 mt-1 font-medium">Multi-month deposit: full amount collected at first payment.</p>
                                        )}
                                    </div>


                                    {/* Prorated Deposit */}
                                    <label className={`flex items-center gap-2 cursor-pointer mb-2 ${(formData.depositMonths ?? 1) > 1 && !formData.proratedDeposit?.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={!!formData.proratedDeposit?.enabled}
                                            onChange={e => {
                                                const enabled = e.target.checked;
                                                const total = (formData.rentAmount || 0) * (formData.depositMonths ?? 1);
                                                const dur = formData.depositMonths ?? 1;
                                                const installment = dur > 0 ? Math.ceil(total / dur) : total;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    proratedDeposit: enabled ? {
                                                        enabled: true,
                                                        totalDepositAmount: total,
                                                        monthlyInstallment: installment,
                                                        durationMonths: dur,
                                                        monthsPaid: 0,
                                                        amountPaidSoFar: 0,
                                                    } : undefined,
                                                    depositPaid: enabled ? 0 : (prev.rentAmount || 0) * (prev.depositMonths ?? 1),
                                                    rentExtension: enabled ? undefined : prev.rentExtension,
                                                }));
                                            }}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                        <span className="text-sm font-semibold text-gray-700">Prorated Deposit</span>
                                        <span className="text-xs text-gray-500 ml-1">— paid in monthly installments alongside rent</span>
                                    </label>

                                    {formData.proratedDeposit?.enabled && (
                                        <div className="ml-6 grid grid-cols-3 gap-3 mb-3 p-3 bg-white border border-indigo-100 rounded-lg">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Total Deposit (KES)</label>
                                                <input
                                                    type="number" min={0}
                                                    value={formData.proratedDeposit.totalDepositAmount}
                                                    onChange={e => {
                                                        const total = parseFloat(e.target.value) || 0;
                                                        const dur = formData.proratedDeposit!.durationMonths;
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            proratedDeposit: {
                                                                ...prev.proratedDeposit!,
                                                                totalDepositAmount: total,
                                                                monthlyInstallment: dur > 0 ? Math.ceil(total / dur) : total,
                                                            },
                                                        }));
                                                    }}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Monthly Installment</label>
                                                <input
                                                    type="number" min={0}
                                                    value={formData.proratedDeposit.monthlyInstallment}
                                                    onChange={e => setFormData(prev => ({
                                                        ...prev,
                                                        proratedDeposit: { ...prev.proratedDeposit!, monthlyInstallment: parseFloat(e.target.value) || 0 },
                                                    }))}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Duration (months)</label>
                                                <input
                                                    type="number" min={1} max={24}
                                                    value={formData.proratedDeposit.durationMonths}
                                                    onChange={e => {
                                                        const dur = Math.max(1, parseInt(e.target.value) || 1);
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            proratedDeposit: {
                                                                ...prev.proratedDeposit!,
                                                                durationMonths: dur,
                                                                monthlyInstallment: Math.ceil(prev.proratedDeposit!.totalDepositAmount / dur),
                                                            },
                                                        }));
                                                    }}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Rent Extension */}
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input
                                            type="checkbox"
                                            checked={!!formData.rentExtension?.enabled}
                                            onChange={e => {
                                                const enabled = e.target.checked;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    rentExtension: enabled ? {
                                                        enabled: true,
                                                        rentDeferredUntil: (() => {
                                                            const d = new Date();
                                                            d.setMonth(d.getMonth() + 1);
                                                            d.setDate(1);
                                                            return d.toISOString().split('T')[0];
                                                        })(),
                                                        depositPaidUpfront: (prev.rentAmount || 0) * (prev.depositMonths ?? 1),
                                                        originalGraceDays: prev.rentGraceDays ?? 4,
                                                    } : undefined,
                                                    proratedDeposit: enabled ? undefined : prev.proratedDeposit,
                                                }));
                                            }}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                        <span className="text-sm font-semibold text-gray-700">Rent Extension</span>
                                        <span className="text-xs text-gray-500 ml-1">— deposit paid now, first rent deferred to a set date (no grace after)</span>
                                    </label>

                                    {formData.rentExtension?.enabled && (
                                        <div className="ml-6 grid grid-cols-2 gap-3 p-3 bg-white border border-orange-100 rounded-lg">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Deposit Paid Upfront (KES)</label>
                                                <input
                                                    type="number" min={0}
                                                    value={formData.rentExtension.depositPaidUpfront}
                                                    onChange={e => setFormData(prev => ({
                                                        ...prev,
                                                        rentExtension: { ...prev.rentExtension!, depositPaidUpfront: parseFloat(e.target.value) || 0 },
                                                    }))}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">First Rent Due Date</label>
                                                <input
                                                    type="date"
                                                    value={formData.rentExtension.rentDeferredUntil}
                                                    onChange={e => setFormData(prev => ({
                                                        ...prev,
                                                        rentExtension: { ...prev.rentExtension!, rentDeferredUntil: e.target.value },
                                                    }))}
                                                    className="w-full p-1.5 border rounded text-sm"
                                                />
                                                <p className="text-[10px] text-orange-600 mt-1">No grace after this date. Subsequent rent follows standard 1st-of-month schedule.</p>
                                            </div>
                                        </div>
                                    )}
                                </>)}
                            </div>

                            {/* Utility Deposits */}
                            <div className="bg-teal-50 p-4 rounded-lg border border-teal-100 mt-4">
                                <h3 className="text-sm font-bold text-teal-800 mb-1">Utility Deposits (One-Time, Refundable)</h3>
                                <p className="text-xs text-teal-600 mb-3">Collected once at start of tenancy — separate from security deposit and monthly bills.</p>
                                {(['water', 'electricity'] as const).map(key => {
                                    const dep = (formData as any)[`${key}Deposit`] as { required: boolean; exempt: boolean; amount: number; paid: number } | undefined;
                                    const propDefault = (activeProperty as any)?.utilityDeposit?.[key];
                                    const isRequired = dep?.required ?? false;
                                    const isExempt = dep?.exempt ?? false;
                                    return (
                                        <div key={key} className="mb-3 p-3 bg-white border border-teal-100 rounded-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isRequired}
                                                        onChange={e => {
                                                            const enabled = e.target.checked;
                                                            setFormData((prev: any) => ({
                                                                ...prev,
                                                                [`${key}Deposit`]: {
                                                                    required: enabled,
                                                                    exempt: enabled ? false : true,
                                                                    amount: enabled ? (propDefault?.amount ?? 0) : 0,
                                                                    paid: 0,
                                                                },
                                                            }));
                                                        }}
                                                        className="h-4 w-4 text-teal-600 rounded"
                                                    />
                                                    <span className="capitalize text-sm font-semibold text-gray-700">{key} Deposit</span>
                                                </label>
                                                {propDefault?.required && !isRequired && (
                                                    <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">Property default: KES {(propDefault.amount || 0).toLocaleString()}</span>
                                                )}
                                            </div>
                                            {isRequired && (
                                                <div className="flex items-center gap-4 ml-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={isExempt}
                                                            onChange={e => {
                                                                const exempt = e.target.checked;
                                                                setFormData((prev: any) => ({
                                                                    ...prev,
                                                                    [`${key}Deposit`]: { ...((prev as any)[`${key}Deposit`] || {}), exempt, amount: exempt ? 0 : (propDefault?.amount ?? 0) },
                                                                }));
                                                            }}
                                                            className="h-4 w-4 rounded border-gray-300"
                                                        />
                                                        <span className="text-xs text-gray-600">Exempt</span>
                                                    </label>
                                                    {!isExempt && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">Amount (KES):</span>
                                                            <input
                                                                type="number" min={0}
                                                                value={dep?.amount || ''}
                                                                onChange={e => {
                                                                    const val = Number(e.target.value) || 0;
                                                                    setFormData((prev: any) => ({
                                                                        ...prev,
                                                                        [`${key}Deposit`]: { ...((prev as any)[`${key}Deposit`] || {}), amount: val },
                                                                    }));
                                                                }}
                                                                placeholder="0"
                                                                className="w-28 p-1.5 border rounded text-sm font-semibold"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Recurring Bills */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
                                <h3 className="text-sm font-bold text-gray-800 mb-3">Recurring Monthly Charges</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {['serviceCharge', 'garbage', 'security', 'waterFixed'].map(key => (
                                        <div key={key}>
                                            <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                                            <input 
                                                type="number" 
                                                name={key} 
                                                // If value is 0, show empty string to allow typing
                                                value={(formData.recurringBills as any)?.[key] === 0 ? '' : (formData.recurringBills as any)?.[key]} 
                                                onChange={handleRecurringBillChange} 
                                                placeholder="0"
                                                className="w-full p-1 pl-2 border rounded text-sm" 
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'documents' && (
                        <div className="space-y-4">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Profile Picture</label>
                                    <div className="flex items-center gap-4">
                                        <div 
                                            className="w-20 h-20 rounded-full bg-gray-100 border flex items-center justify-center overflow-hidden cursor-pointer"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            {formData.profilePicture || formData.avatar ? (
                                                <img src={formData.profilePicture || formData.avatar} alt="Profile" className="w-full h-full object-cover" />
                                            ) : <Icon name="user-circle" className="w-10 h-10 text-gray-400" />}
                                        </div>
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleProfilePicUpload} />
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm text-primary hover:underline">Upload Photo</button>
                                        <button type="button" onClick={() => setCameraTarget({ kind: 'profile' })} className="text-sm text-primary hover:underline flex items-center gap-1">
                                            <Icon name="task-request" className="w-4 h-4" /> Take Live Photo
                                        </button>
                                    </div>
                                </div>
                             </div>

                             <div className="border-t pt-4">
                                 <h4 className="text-sm font-bold text-gray-700 mb-3">Required Documents</h4>
                                 <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                     <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                         <input
                                             type="checkbox"
                                             checked={!!formData.leaseSigned}
                                             onChange={(e) =>
                                                 setFormData(prev => (e.target.checked
                                                     ? ensureLeaseDates({ ...prev, leaseSigned: true })
                                                     : { ...prev, leaseSigned: false }))
                                             }
                                         />
                                         Lease signed
                                     </label>
                                     <p className="text-xs text-gray-500 mt-1">
                                         If checked, a signed lease document must be uploaded below; otherwise the lease is treated as unsigned.
                                     </p>
                                     {!!formData.leaseSigned && (
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                             <div>
                                                 <label className="block text-xs font-bold text-gray-500 mb-1">Lease Start Date</label>
                                                 <input
                                                     type="date"
                                                     name="leaseStartDate"
                                                     value={String((formData as any).leaseStartDate || '')}
                                                     onChange={handleChange}
                                                     className="w-full p-2 border rounded bg-white"
                                                 />
                                             </div>
                                             <div>
                                                 <label className="block text-xs font-bold text-gray-500 mb-1">Lease Expiry Date</label>
                                                 <input
                                                     type="date"
                                                     name="leaseEnd"
                                                     value={String((formData as any).leaseEnd || '')}
                                                     onChange={handleChange}
                                                     className="w-full p-2 border rounded bg-white"
                                                 />
                                             </div>
                                         </div>
                                     )}
                                 </div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     {[
                                         'Full Picture', 
                                         'ID Front', 
                                         'ID Back', 
                                         'Lease Agreement', 
                                         'Inventory Checklist'
                                     ].map((doc, idx) => {
                                         const uploaded = Array.isArray(formData.documents) && formData.documents.some(d => String(d?.type ?? '') === doc && String(d?.url ?? '').trim());
                                         return (
                                         <div key={idx} className="border border-dashed border-gray-300 rounded p-3 hover:bg-gray-50 transition-colors">
                                             <label className="block text-xs font-bold text-gray-500 mb-1">{doc}</label>
                                             <input
                                                 type="file"
                                                 accept="image/*,.pdf"
                                                 onChange={(e) => handleDocUpload(e, doc)}
                                                 className="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300"
                                             />
                                             <button
                                                 type="button"
                                                 onClick={() => setCameraTarget({ kind: 'doc', docType: doc })}
                                                 className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                             >
                                                 <Icon name="task-request" className="w-3.5 h-3.5" /> Take Live Photo
                                             </button>
                                             {uploaded && <p className="text-[10px] text-green-700 font-bold mt-1">Uploaded</p>}
                                         </div>
                                         );
                                     })}
                                     <div className={`border border-dashed rounded p-3 transition-colors ${formData.leaseSigned ? 'border-green-400 hover:bg-green-50/40' : 'border-gray-300 hover:bg-gray-50'}`}>
                                         <label className="block text-xs font-bold text-gray-500 mb-1">Signed Lease (required if signed)</label>
                                         <input
                                             type="file"
                                             accept=".pdf,image/*"
                                             onChange={(e) => handleDocUpload(e, 'Signed Lease', 'Signed Lease Agreement')}
                                             className="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300"
                                         />
                                         <button
                                             type="button"
                                             onClick={() => setCameraTarget({ kind: 'doc', docType: 'Signed Lease', docKey: 'Signed Lease Agreement' })}
                                             className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                         >
                                             <Icon name="task-request" className="w-3.5 h-3.5" /> Take Live Photo
                                         </button>
                                         {Array.isArray(formData.documents) && formData.documents.some(d => String(d?.type ?? '') === 'Signed Lease Agreement' && String(d?.url ?? '').trim()) && (
                                             <p className="text-[10px] text-green-700 font-bold mt-1">Uploaded</p>
                                         )}
                                     </div>
                                 </div>
                             </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-primary text-white font-medium rounded hover:bg-primary-dark shadow-sm">Save Record</button>
                </div>
            </div>
            {cameraTarget && (
                <LiveCameraCapture
                    title={cameraTarget.kind === 'profile' ? 'Profile Picture' : cameraTarget.docType}
                    facingMode={cameraTarget.kind === 'profile' ? 'user' : 'environment'}
                    onCapture={async (file) => {
                        if (cameraTarget.kind === 'profile') {
                            await uploadProfilePicFile(file);
                        } else {
                            await uploadDocFile(file, cameraTarget.docType, cameraTarget.docKey);
                        }
                    }}
                    onClose={() => setCameraTarget(null)}
                />
            )}
        </div>
    );
};

const AppRecordPaymentModal: React.FC<{
    record: UnifiedRecord;
    onClose: () => void;
    onRecord: (amount: number, method: string, reference: string, date: string) => void;
}> = ({ record, onClose, onRecord }) => {
    const rent = Number(record.rentAmount || 0);
    const isApp = record.recordType === 'Application';

    // For tenant records: compute prorated first-month rent (mirrors ActiveTenants card logic)
    const effectiveRent = (() => {
        if (isApp) return rent;
        const currentMonthIso = getCurrentMonthIso();
        const rentStartAnchor = getTenantProrationAnchor(record as Partial<TenantProfile>);
        const activationMonth = rentStartAnchor ? String(rentStartAnchor).slice(0, 7) : null;
        if (activationMonth !== currentMonthIso) return rent;
        const firstMonthRent = Number((record as any).firstMonthRent || 0);
        if (firstMonthRent > 0) return firstMonthRent;
        return calculateProratedFirstMonthRent(rent, rentStartAnchor);
    })();

    // For tenant records: compute deposit still owed (mirrors ActiveTenants depositOwed logic)
    const depositOwedForModal = (() => {
        if (isApp) return 0; // handled separately below via depositAmt
        if (record.depositExempt) return 0;
        if (record.rentExtension?.enabled) return 0;
        if (record.proratedDeposit?.enabled) {
            const fullyPaid = (record.proratedDeposit.amountPaidSoFar ?? 0) >= record.proratedDeposit.totalDepositAmount;
            return fullyPaid ? 0 : (record.proratedDeposit.monthlyInstallment || 0);
        }
        const depMonths = Number(record.depositMonths ?? 1);
        const expected = Number((record as any).depositExpected ?? 0) > 0
            ? Number((record as any).depositExpected)
            : rent * depMonths;
        return Math.max(0, expected - Number(record.depositPaid || 0));
    })();

    // Compute expected first payment based on deposit mode
    const firstPaymentAmount = (() => {
        if (record.depositExempt) return effectiveRent;
        if (record.rentExtension?.enabled) return record.rentExtension.depositPaidUpfront || 0;
        if (record.proratedDeposit?.enabled) return effectiveRent + (record.proratedDeposit.monthlyInstallment || 0);
        if (isApp) {
            const depositMonths = record.depositMonths ?? 1;
            const depositAmt = Number(record.depositPaid || 0) || rent * depositMonths;
            return rent + depositAmt;
        }
        const utilDep = (['water', 'electricity'] as const).reduce((s, k) => {
            const d = (record as any)[`${k}Deposit`] as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
            if (!d?.required || d?.exempt) return s;
            return s + Math.max(0, (d.amount || 0) - (d.paid || 0));
        }, 0);
        return effectiveRent + depositOwedForModal + utilDep;
    })();

    const [amount, setAmount] = useState(String(firstPaymentAmount));
    const [method, setMethod] = useState('Cash');
    const [reference, setReference] = useState('');
    const [date, setDate] = useState(getTodayIsoDate());
    const handleSubmit = (e?: React.MouseEvent) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const val = parseFloat(amount);
        if (!Number.isFinite(val) || val <= 0) return alert('Enter a valid amount.');
        if (!reference.trim()) return alert('Reference is required.');
        onRecord(val, method, reference.trim(), date);
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-[2100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 mb-3">Record Payment</h3>
                <p className="text-xs text-gray-500 mb-2">{record.name} • {record.recordType}</p>
                {isApp && (
                    <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded p-2 mb-3">
                        {record.rentExtension?.enabled
                            ? `Deposit only: KES ${(record.rentExtension.depositPaidUpfront || 0).toLocaleString()} (rent deferred to ${record.rentExtension.rentDeferredUntil})`
                            : record.proratedDeposit?.enabled
                                ? `Rent KES ${rent.toLocaleString()} + deposit installment KES ${(record.proratedDeposit.monthlyInstallment || 0).toLocaleString()}`
                                : record.depositExempt
                                    ? `Rent only: KES ${rent.toLocaleString()} (deposit exempt)`
                                    : `Rent + deposit: KES ${firstPaymentAmount.toLocaleString()}`}
                    </p>
                )}
                <div className="space-y-3">
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded" placeholder="Amount" />
                    <select value={method} onChange={e => setMethod(e.target.value)} className="w-full p-2 border rounded bg-white">
                        <option>Cash</option>
                        <option>Bank Transfer</option>
                        <option>M-Pesa (Manual)</option>
                        <option>Cheque</option>
                    </select>
                    <input value={reference} onChange={e => setReference(e.target.value)} className="w-full p-2 border rounded" placeholder="Reference" />
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
                </div>
                <div className="flex justify-end gap-2 mt-5">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancel</button>
                    <button type="button" onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white rounded font-bold">Record</button>
                </div>
            </div>
        </div>
    );
};

const AppMpesaModal: React.FC<{
    record: UnifiedRecord;
    getPaymentUserId: (record: UnifiedRecord) => string | null;
    onClose: () => void;
    onPaid: (amount: number, reference: string) => void;
}> = ({ record, getPaymentUserId, onClose, onPaid }) => {
    const [phone, setPhone] = useState(record.phone || '');
    const [amount, setAmount] = useState(() => {
        const baseRent = Number(record.rentAmount || 0);
        const isApp = record.recordType === 'Application';
        // Prorated rent for tenant activation month
        const stkEffectiveRent = (() => {
            if (isApp) return baseRent;
            const currentMonthIso = getCurrentMonthIso();
            const rentStartAnchor = getTenantProrationAnchor(record as Partial<TenantProfile>);
            const activationMonth = rentStartAnchor ? String(rentStartAnchor).slice(0, 7) : null;
            if (activationMonth !== currentMonthIso) return baseRent;
            const firstMonthRent = Number((record as any).firstMonthRent || 0);
            if (firstMonthRent > 0) return firstMonthRent;
            return calculateProratedFirstMonthRent(baseRent, rentStartAnchor);
        })();
        // Deposit owed for tenant
        const stkDepositOwed = (() => {
            if (isApp) return Number(record.depositPaid || 0);
            if (record.depositExempt) return 0;
            if (record.rentExtension?.enabled) return 0;
            if (record.proratedDeposit?.enabled) {
                const fullyPaid = (record.proratedDeposit.amountPaidSoFar ?? 0) >= record.proratedDeposit.totalDepositAmount;
                return fullyPaid ? 0 : (record.proratedDeposit.monthlyInstallment || 0);
            }
            const depMonths = Number(record.depositMonths ?? 1);
            const expected = Number((record as any).depositExpected ?? 0) > 0
                ? Number((record as any).depositExpected)
                : baseRent * depMonths;
            return Math.max(0, expected - Number(record.depositPaid || 0));
        })();
        const stkUtilDep = (['water', 'electricity'] as const).reduce((s, k) => {
            const d = (record as any)[`${k}Deposit`] as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
            if (!d?.required || d?.exempt) return s;
            return s + Math.max(0, (d.amount || 0) - (d.paid || 0));
        }, 0);
        return String(stkEffectiveRent + stkDepositOwed + stkUtilDep);
    });
    const [checkoutId, setCheckoutId] = useState<string | null>(null);
    const [step, setStep] = useState<'input' | 'processing' | 'timed_out'>('input');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const userId = getPaymentUserId(record);

    useEffect(() => {
        if (!userId || !checkoutId) return;
        return followStkPaymentCompletion(supabase, userId, checkoutId, (row) => {
            const status = String(row.status ?? '');
            if (status === 'completed') {
                onPaid(parseFloat(amount) || 0, String(row.transaction_id ?? checkoutId));
            } else if (status === 'failed' || status === 'cancelled') {
                setError(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('input');
                setBusy(false);
                setCheckoutId(null);
            } else if (status === 'timed_out') {
                setStep('timed_out');
                setBusy(false);
            }
        });
    }, [userId, checkoutId, amount, onPaid, record]);

    const handlePay = async () => {
        if (!userId) {
            setError('This record is not linked to a login-enabled user yet. Use manual payment or link user first.');
            return;
        }
        if (!/^(2547|07)\d{8}$/.test(phone.replace(/\s/g, ''))) {
            setError('Enter a valid Kenyan mobile number.');
            return;
        }
        const roundedAmt = Math.round(parseFloat(amount) || 0);
        if (!Number.isFinite(roundedAmt) || roundedAmt < 1) {
            setError('Enter a valid amount (minimum KES 1).');
            return;
        }
        if (roundedAmt > 150_000) {
            setError('Amount exceeds the M-Pesa per-transaction limit of KES 150,000.');
            return;
        }
        setError(null);
        setBusy(true);
        setStep('processing');
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone, amount: Math.round(parseFloat(amount) || 0), leaseId: record.id ?? null, userId },
            });
            if (invokeError) throw invokeError;
            const id = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!id) throw new Error('CheckoutRequestID missing from STK response');
            setCheckoutId(id);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to initiate STK.');
            setStep('input');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[2100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 mb-3">M-Pesa Payment</h3>
                <p className="text-xs text-gray-500 mb-4">{record.name} • {record.recordType}</p>
                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded mb-3">{error}</p>}
                {step === 'input' ? (
                    <div className="space-y-3">
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-2 border rounded" placeholder="07..." />
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded" placeholder="Amount" />
                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancel</button>
                            <button onClick={handlePay} disabled={busy} className="px-4 py-2 bg-green-700 text-white rounded font-bold disabled:opacity-50">
                                {busy ? 'Sending...' : 'Send STK'}
                            </button>
                        </div>
                    </div>
                ) : step === 'timed_out' ? (
                    <div className="py-4 text-center">
                        <div className="text-4xl mb-3">⏱</div>
                        <p className="font-semibold text-gray-700 mb-1">Taking longer than expected</p>
                        <p className="text-xs text-gray-500 mb-4">
                            No confirmation received. Check your M-Pesa messages — if it went through, use <strong>Record Payment</strong> with the M-Pesa code.
                        </p>
                        <div className="flex gap-2 justify-center">
                            <button
                                type="button"
                                onClick={() => { setStep('input'); setCheckoutId(null); setError(null); }}
                                className="px-4 py-2 bg-gray-100 rounded font-medium text-sm"
                            >
                                Try Again
                            </button>
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded font-medium text-sm">
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="py-6 text-center">
                        <p className="font-semibold text-gray-800">Check your phone</p>
                        <p className="text-sm text-gray-500 mt-1">Approve the STK prompt to complete payment.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const ProfileHubModal: React.FC<{
    record: UnifiedRecord;
    onClose: () => void;
    onManualPay: () => void;
    onStkPay: () => void;
    onEdit: () => void;
    onMove?: () => void;
    onDelete?: () => void;
    onApprove?: () => void;
    onReverseAllocation?: () => void;
    isApproved?: boolean;
    canApprove?: boolean;
}> = React.memo(({ record, onClose, onManualPay, onStkPay, onEdit, onMove, onDelete, onApprove, onReverseAllocation, isApproved = false, canApprove = false }) => {
    const { properties, tenants, staff, landlords, renovationInvestors } = useData();
    // Treat self-signup / referral tenants in PendingApproval like applications
    // so they get the same Approve banner + button flow.
    const tenantStatusStr = String((record as any).status ?? (record as any).displayStatus ?? '');
    const isPendingApprovalTenant = record.recordType === 'Tenant' && tenantStatusStr === 'PendingApproval';
    const isApp = record.recordType === 'Application' || isPendingApprovalTenant;
    const payDisabled = isApp && !isApproved;

    const referredUnitLabel = useMemo(() => {
        const uid = (record as any).referredUnitId as string | undefined;
        if (!uid) return null;
        for (const prop of (properties || [])) {
            const unit = prop.units?.find(u => u.id === uid);
            if (unit) return `${unit.unitNumber}${unit.unitType ? ' (' + unit.unitType + ')' : ''} — ${prop.name}`;
        }
        return null;
    }, [(record as any).referredUnitId, properties]);

    const referrerName = useMemo(() => {
        const rid = record.referrerId;
        if (!rid) return null;
        const allPeople: any[] = [...(tenants || []), ...(staff || []), ...(landlords || []), ...(renovationInvestors || [])];
        return allPeople.find(p => p.id === rid)?.name ?? null;
    }, [record.referrerId, tenants, staff, landlords, renovationInvestors]);

    return (
        <div className="fixed inset-0 bg-black/60 z-[2150] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">View Profile</h3>
                        <p className="text-xs text-gray-500 mt-1">{record.name} • {record.propertyName || record.property} • {record.unit}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 font-bold">
                        <Icon name="close" className="w-4 h-4" />
                    </button>
                </div>

                {isApp && (referredUnitLabel || referrerName) && (
                    <div className="mb-3 p-3 bg-teal-50 border border-teal-100 rounded-lg text-xs space-y-1">
                        {referrerName && (
                            <p className="text-teal-800">
                                <span className="font-bold">Referred by:</span> {referrerName}
                            </p>
                        )}
                        {referredUnitLabel && (
                            <p className="text-teal-800">
                                <span className="font-bold">Referred for:</span> {referredUnitLabel}
                                {isApp && !isApproved && <span className="ml-1 text-teal-600 italic">(can be changed at approval)</span>}
                            </p>
                        )}
                    </div>
                )}

                {isApp && (
                    <div className="mt-1">
                        <button
                            type="button"
                            onClick={onApprove}
                            disabled={!canApprove || isApproved}
                            className={`w-full py-3 rounded-lg font-bold transition-colors shadow-sm ${
                                isApproved
                                    ? 'bg-green-50 text-green-800 border border-green-200 cursor-not-allowed'
                                    : 'bg-primary text-white hover:bg-primary-dark border border-primary/20'
                            } ${(!canApprove || isApproved) ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            {isApproved ? 'Approved' : ((record as any).tenantOnboardingType === 'Existing' && record.unitId ? 'Approve → Activate' : (record.unitId ? 'Approve → Pending Payment' : 'Approve → Pending Allocation'))}
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                        type="button"
                        onClick={onManualPay}
                        disabled={payDisabled}
                        className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        Record Manual Pay
                    </button>
                    <button
                        type="button"
                        onClick={onStkPay}
                        disabled={payDisabled}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 shadow-md transition-colors"
                    >
                        M-Pesa Push
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-5">
                    <button type="button" onClick={onEdit} className="flex-1 px-4 py-2 bg-gray-100 text-gray-800 rounded font-bold text-xs hover:bg-gray-200">
                        Edit Details
                    </button>
                    {onMove && (
                        <button type="button" onClick={onMove} className="px-4 py-2 bg-blue-50 text-blue-800 rounded font-bold text-xs hover:bg-blue-100">
                            Move
                        </button>
                    )}
                    {onDelete && (
                        <button type="button" onClick={onDelete} className="px-4 py-2 bg-red-50 text-red-700 rounded font-bold text-xs hover:bg-red-100">
                            Delete
                        </button>
                    )}
                </div>
                {onReverseAllocation && (
                    <div className="mt-3 pt-3 border-t border-dashed border-orange-200">
                        <button
                            type="button"
                            onClick={onReverseAllocation}
                            className="w-full py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded font-bold text-xs hover:bg-orange-100 transition-colors"
                        >
                            Reverse Allocation
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
ProfileHubModal.displayName = 'ProfileHubModal';

const readTenantProfileIdFromHash = () => {
    const hash = window.location.hash;
    if (!hash.includes('tenantId=')) return null;
    return decodeURIComponent(hash.split('tenantId=')[1].split('&')[0] || '') || null;
};

const ProfileHubController: React.FC<{
    unifiedList: UnifiedRecord[];
    canPay: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    isSuperAdmin: boolean;
    onManualPay: (record: UnifiedRecord) => void;
    onStkPay: (record: UnifiedRecord) => void;
    onEdit: (record: UnifiedRecord) => void;
    onMove: (record: TenantProfile) => void;
    onDelete: (record: UnifiedRecord) => void;
    onApprove: (record: UnifiedRecord) => void;
    onReverseAllocation: (record: UnifiedRecord) => void;
}> = ({ unifiedList, canPay, canEdit, canDelete, canApprove, isSuperAdmin, onManualPay, onStkPay, onEdit, onMove, onDelete, onApprove, onReverseAllocation }) => {
    const [profileHubRecordId, setProfileHubRecordId] = useState<string | null>(() => readTenantProfileIdFromHash());
    // Direct lookup against raw context so the profile modal can render on the
    // first paint — before the parent's unifiedList useMemo has finished for
    // very large tenant/application sets (e.g. when arriving via deep-link
    // from the Dashboard's House Status alert).
    const { tenants: rawTenants, applications: rawApplications } = useData();

    const profileHubRecord = useMemo(() => {
        if (!profileHubRecordId) return null;
        const fromList = unifiedList.find(r => r.id === profileHubRecordId);
        if (fromList) return fromList;
        const t = rawTenants.find(x => x.id === profileHubRecordId);
        if (t) return { ...t, recordType: 'Tenant', displayStatus: t.status, submittedDate: t.onboardingDate } as UnifiedRecord;
        const a = rawApplications.find(x => x.id === profileHubRecordId);
        if (a) return { ...a, recordType: 'Application', displayStatus: a.status } as UnifiedRecord;
        return null;
    }, [profileHubRecordId, unifiedList, rawTenants, rawApplications]);


    const handleCloseProfileHub = useCallback(() => {
        setProfileHubRecordId(null);
        if (window.location.hash.includes('tenantId=')) {
            window.history.replaceState(null, '', '#/tenants/applications');
        }
    }, []);

    useEffect(() => {
        const syncFromHash = () => setProfileHubRecordId(prev => {
            const next = readTenantProfileIdFromHash();
            return prev === next ? prev : next;
        });
        const openFromEvent = (event: Event) => {
            const next = String((event as CustomEvent).detail || '');
            setProfileHubRecordId(prev => prev === (next || null) ? prev : (next || null));
        };

        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        window.addEventListener('popstate', syncFromHash);
        window.addEventListener('tenant-profile-hub-change', openFromEvent as EventListener);
        return () => {
            window.removeEventListener('hashchange', syncFromHash);
            window.removeEventListener('popstate', syncFromHash);
            window.removeEventListener('tenant-profile-hub-change', openFromEvent as EventListener);
        };
    }, []);

    if (!profileHubRecord) return null;

    return (
        <ProfileHubModal
            record={profileHubRecord}
            onClose={handleCloseProfileHub}
            onManualPay={canPay ? () => {
                if (profileHubRecord.recordType === 'Application' && String((profileHubRecord as any).status ?? '') !== 'Approved') {
                    safeAlert('Please approve the application first.');
                    return;
                }
                handleCloseProfileHub();
                onManualPay(profileHubRecord);
            } : undefined}
            onStkPay={canPay ? () => {
                if (profileHubRecord.recordType === 'Application' && String((profileHubRecord as any).status ?? '') !== 'Approved') {
                    safeAlert('Please approve the application first.');
                    return;
                }
                handleCloseProfileHub();
                onStkPay(profileHubRecord);
            } : undefined}
            onEdit={canEdit ? () => {
                handleCloseProfileHub();
                onEdit(profileHubRecord);
            } : undefined}
            onMove={
                canEdit && profileHubRecord.recordType === 'Tenant'
                    ? () => {
                        handleCloseProfileHub();
                        onMove(profileHubRecord as TenantProfile);
                    }
                    : undefined
            }
            onDelete={canDelete ? () => {
                handleCloseProfileHub();
                onDelete(profileHubRecord);
            } : undefined}
            onApprove={canApprove ? () => onApprove(profileHubRecord) : undefined}
            isApproved={(() => {
                const s = String((profileHubRecord as any).status ?? (profileHubRecord as any).displayStatus ?? '');
                if (profileHubRecord.recordType === 'Application') return s === 'Approved';
                return s !== 'PendingApproval';
            })()}
            canApprove={canApprove && (
                profileHubRecord.recordType === 'Application' ||
                (profileHubRecord.recordType === 'Tenant' &&
                    String((profileHubRecord as any).status ?? (profileHubRecord as any).displayStatus ?? '') === 'PendingApproval')
            )}
            onReverseAllocation={
                isSuperAdmin && profileHubRecord.recordType === 'Tenant' && !!profileHubRecord.propertyId && !!profileHubRecord.unitId
                    ? () => { handleCloseProfileHub(); onReverseAllocation(profileHubRecord); }
                    : undefined
            }
        />
    );
};

const Applications: React.FC = () => {
    const { applications, tenants, properties, staff, landlords, renovationInvestors, commissionRules, addApplication, updateApplication, addTenant, updateTenant, updateStaff, updateLandlord, addRFTransaction, updateProperty, deleteTenant, deleteApplication, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate  = isSuperAdmin || checkPermission('Tenants', 'create');
    const canEdit    = isSuperAdmin || checkPermission('Tenants', 'edit');
    const canDelete  = isSuperAdmin || checkPermission('Tenants', 'delete');
    const canApprove = isSuperAdmin || checkPermission('Tenants', 'approve');
    const canPay     = isSuperAdmin || checkPermission('Tenants', 'pay');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<UnifiedRecord | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'All' | 'Applicants' | 'Active' | 'PendingApproval' | 'PendingAllocation' | 'PendingPayment'>('All');
    const [moveTenant, setMoveTenant] = useState<TenantProfile | null>(null);
    const [manualPayRecord, setManualPayRecord] = useState<UnifiedRecord | null>(null);
    const [stkPayRecord, setStkPayRecord] = useState<UnifiedRecord | null>(null);
    const openProfileHub = useCallback((id?: string) => {
        if (!id) return;
        const nextHash = `#/tenants/applications?tenantId=${encodeURIComponent(id)}`;
        window.dispatchEvent(new CustomEvent('tenant-profile-hub-change', { detail: id }));
        if (window.location.hash !== nextHash) {
            window.history.pushState(null, '', nextHash);
        }
    }, []);

    const closeProfileHub = useCallback(() => {
        window.dispatchEvent(new CustomEvent('tenant-profile-hub-change', { detail: '' }));
        if (window.location.hash.includes('tenantId=')) {
            window.history.replaceState(null, '', '#/tenants/applications');
        }
    }, []);

    const buildExistingSeed = (source: {
        id?: string;
        rentAmount?: unknown;
        rentDueDate?: unknown;
        existingTenantSetup?: ExistingTenantSetup;
        tenantOnboardingType?: TenantOnboardingType;
    }) => {
        if (source.tenantOnboardingType !== 'Existing' || !source.id) return null;
        return buildExistingTenantSeedData({
            tenantId: source.id,
            rentAmount: Number(source.rentAmount || 0),
            rentDueDate: Number(source.rentDueDate ?? 1),
            setup: source.existingTenantSetup,
        });
    };

    // When approving an application whose record already exists as a tenant
    // (e.g. self-registered via referral/agent who paid before approval),
    // the approval payload must NOT wipe pre-existing payment_history,
    // outstanding bills/fines, maintenance requests, or accrued depositPaid.
    // baseFields hard-codes empty arrays so we strip them and merge prior
    // state from the existing tenant row.
    const preservePriorTenantState = (
        payload: Partial<TenantProfile>,
        prior: TenantProfile,
    ): Partial<TenantProfile> => {
        const merged: Partial<TenantProfile> = { ...payload };

        const priorHistory = Array.isArray(prior.paymentHistory) ? prior.paymentHistory : [];
        if (priorHistory.length > 0) {
            const newHist = Array.isArray(payload.paymentHistory) ? payload.paymentHistory : [];
            // Keep prior history; prepend any new entries the payload introduced.
            const seenRefs = new Set(priorHistory.map(p => String((p as any).reference || '')));
            const extras = newHist.filter(p => !seenRefs.has(String((p as any).reference || '')));
            merged.paymentHistory = [...extras, ...priorHistory];
        }

        const priorBills = Array.isArray(prior.outstandingBills) ? prior.outstandingBills : [];
        const newBills = Array.isArray(payload.outstandingBills) ? payload.outstandingBills : [];
        if (priorBills.length > 0 || newBills.length > 0) {
            const seenIds = new Set(priorBills.map(b => String(b.id)));
            const toAdd = newBills.filter(b => !seenIds.has(String(b.id)));
            merged.outstandingBills = [...priorBills, ...toAdd];
        }

        if (Array.isArray(prior.outstandingFines) && prior.outstandingFines.length > 0) {
            merged.outstandingFines = prior.outstandingFines;
        }
        if (Array.isArray(prior.maintenanceRequests) && prior.maintenanceRequests.length > 0) {
            merged.maintenanceRequests = prior.maintenanceRequests;
        }

        const priorDepositPaid = Number(prior.depositPaid || 0);
        const newDepositPaid = Number(payload.depositPaid || 0);
        if (priorDepositPaid > newDepositPaid) {
            merged.depositPaid = priorDepositPaid;
        }

        return merged;
    };

    const handleAddNew = () => {
        // Redirect to primary registration flow for Tenants (Registration > Users),
        // treating this button as a shortcut to the main registration module.
        try {
            window.location.hash = '#/registration/users?category=tenants';
        } catch {
            // Fallback: keep legacy behavior if hash navigation is unavailable
            setSelectedRecord({ recordType: 'Application', displayStatus: 'New' });
            setIsModalOpen(true);
        }
    };

    const handleEdit = (record: UnifiedRecord) => {
        setSelectedRecord(record);
        setIsModalOpen(true);
    };

    const canonicalizePhone = (p: string | undefined | null): string => {
        if (!p) return '';
        const digits = p.replace(/\D/g, '');
        return digits.length > 9 ? digits.slice(-9) : digits;
    };

    const handleApproveApplication = (record: UnifiedRecord) => {
        if (!record.id) return;
        const approvalStatus = String((record as any).status ?? (record as any).displayStatus ?? '');
        const isPendingApprovalTenantRecord = record.recordType === 'Tenant' && approvalStatus === 'PendingApproval';
        // Allow both: real Application rows AND self-signup/referral Tenants stuck in PendingApproval
        if (record.recordType !== 'Application' && !isPendingApprovalTenantRecord) return;

        const hasUnit = !!(record.propertyId && record.unitId);
        const tenantOnboardingType: TenantOnboardingType = (record as any).tenantOnboardingType === 'Existing' ? 'Existing' : 'New';
        const existingTenantSetup = tenantOnboardingType === 'Existing'
            ? normalizeExistingTenantSetup((record as any).existingTenantSetup || buildDefaultExistingTenantSetup(record))
            : undefined;

        // ── Resolve referrer: explicit referrerId takes priority, then try
        // resolving a referralCode left by self-registration. ─────────────────
        const resolvedReferrerId = (() => {
            if ((record as any).referrerId) return (record as any).referrerId as string;
            const code = (record as any).referralCode as string | undefined;
            if (!code) return undefined;
            const people = [
                ...tenants,
                ...(staff as any[]),
                ...(landlords as any[]),
                ...(renovationInvestors as any[]),
            ] as Array<{ id: string; name: string; referralCode?: string }>;
            return resolveReferralCode(code, people);
        })();

        const alreadyTenant = tenants.find(t => 
            t.id === record.id || 
            (record.authUserId && t.id === record.authUserId) ||
            (record.authUserId && t.authUserId === record.authUserId) ||
            (record.email && t.email && t.email.toLowerCase() === record.email.toLowerCase()) ||
            (record.phone && t.phone && canonicalizePhone(t.phone) === canonicalizePhone(record.phone))
        );
        const targetTenantId = alreadyTenant ? alreadyTenant.id : record.id;
        const targetAuthUserId = alreadyTenant ? (alreadyTenant.authUserId || (alreadyTenant.id.length > 20 ? alreadyTenant.id : undefined)) : record.authUserId;

        const uniqueById = <T extends { id?: string }>(arr: T[]): T[] => {
            const seen = new Set<string>();
            return arr.filter(item => {
                if (!item.id) return true;
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });
        };

        const uniquePaymentHistory = uniqueById([
            ...(alreadyTenant?.paymentHistory || []),
            ...(Array.isArray((record as any).paymentHistory) ? (record as any).paymentHistory : [])
        ]);
        const uniqueOutstandingBills = uniqueById([
            ...(alreadyTenant?.outstandingBills || []),
            ...(Array.isArray((record as any).outstandingBills) ? (record as any).outstandingBills : [])
        ]);
        const uniqueOutstandingFines = uniqueById([
            ...(alreadyTenant?.outstandingFines || []),
            ...(Array.isArray((record as any).outstandingFines) ? (record as any).outstandingFines : [])
        ]);
        const uniqueMaintenanceRequests = uniqueById([
            ...(alreadyTenant?.maintenanceRequests || []),
            ...(Array.isArray((record as any).maintenanceRequests) ? (record as any).maintenanceRequests : [])
        ]);

        // ── Shared identity fields (both paths) ──────────────────────────────
        const baseFields: Partial<TenantProfile> = {
            id:                     targetTenantId,
            name:                   record.name,
            username:               '',
            email:                  String(record.email  || ''),
            phone:                  String(record.phone  || ''),
            alternativePhone:       (record as any).alternativePhone      || undefined,
            nextOfKinName:          (record as any).nextOfKinName         || undefined,
            nextOfKinPhone:         (record as any).nextOfKinPhone        || undefined,
            nextOfKinRelationship:  (record as any).nextOfKinRelationship || undefined,
            idNumber:               String(record.idNumber || ''),
            leaseSigned:            !!(record as any).leaseSigned,
            leaseStartDate:         (record as any).leaseStartDate,
            leaseEnd:               (record as any).leaseEnd,
            authUserId:             targetAuthUserId,
            avatar:                 record.avatar,
            profilePicture:         (record as any).profilePicture,
            kraPin:                 record.kraPin,
            rentStartDate:          (record as any).rentStartDate || record.onboardingDate || getTodayIsoDate(),
            onboardingDate:         getTodayIsoDate(),
            paymentHistory:         uniquePaymentHistory,
            outstandingBills:       uniqueOutstandingBills,
            outstandingFines:       uniqueOutstandingFines,
            maintenanceRequests:    uniqueMaintenanceRequests,
            // Carry referrer from the application so commission can be
            // attributed later when the tenant reaches Active status.
            referrerId:             resolvedReferrerId,
            tenantOnboardingType,
            existingTenantSetup,
            occupancyType:          (record as any).occupancyType || undefined,
            mainTenantId:           (record as any).mainTenantId || undefined,
            _subUnitDrafts:         (record as any)._subUnitDrafts || undefined,
        };

        if (hasUnit) {
            // ── Path A: unit pre-allocated → PendingPayment ──────────────────
            const prop = properties.find(p => p.id === record.propertyId);
            const unit = prop?.units?.find(u => u.id === record.unitId);
            if (!prop || !unit) {
                alert('Could not find property/unit to approve this application.');
                return;
            }

            const resolvedPropertyName = (record.propertyName || (record as any).property || prop.name || '').toString();
            const resolvedUnitNumber   = (record.unit || unit.unitNumber || '').toString();
            const rentAmount           = Number(record.rentAmount || unit.rent || prop.defaultMonthlyRent || 0);
            const isDepositExempt      = !!(record as any).depositExempt;
            const depositMonths        = Number((record as any).depositMonths ?? 1);
            const proratedDeposit      = (record as any).proratedDeposit as TenantProfile['proratedDeposit'];
            const rentExtension        = (record as any).rentExtension  as TenantProfile['rentExtension'];

            if (rentAmount <= 0) {
                alert('Rent must be set before approving.');
                return;
            }
            if (!isDepositExempt && !proratedDeposit?.enabled && !rentExtension?.enabled && rentAmount * depositMonths <= 0) {
                alert('Deposit amount cannot be determined. Set the rent amount or mark tenant as Deposit Exempt.');
                return;
            }

            // Proration: first-month rent based on join day
            const rentStartAnchor = getTenantProrationAnchor({
                rentStartDate: (record as any).rentStartDate || baseFields.rentStartDate,
            });
            const firstMonthRent = calculateProratedFirstMonthRent(rentAmount, rentStartAnchor);

            // Pre-compute next due date (advanced by payment webhook on actual payment)
            const dueDay  = Math.min(28, Math.max(1, Number((record as any).rentDueDate ?? 1)));
            let graceDays = Number((record as any).rentGraceDays ?? 4);
            let nextDueDateIso: string;
            const rentStartDateToUse = String((record as any).rentStartDate || baseFields.rentStartDate || getTodayIsoDate());
            
            if (rentExtension?.enabled) {
                nextDueDateIso = rentExtension.rentDeferredUntil;
                graceDays = 0;
            } else {
                // User requirement: "Last due date for the first month should always be the rent start date date."
                nextDueDateIso = rentStartDateToUse;
            }

            const depositExpected = isDepositExempt
                ? 0
                : rentExtension?.enabled
                    ? (rentExtension.depositPaidUpfront || 0)
                    : proratedDeposit?.enabled
                        ? (proratedDeposit.totalDepositAmount || 0)
                        : rentAmount * depositMonths;

            // depositPaid starts at 0 — recorded only via actual payment.
            // Exception: rent-extension upfront deposit is pre-collected.
            const depositPaid = rentExtension?.enabled
                ? (rentExtension.depositPaidUpfront || 0)
                : Number((record as any).depositPaid || 0);
            const existingSeed = buildExistingSeed({
                id: record.id,
                rentAmount,
                rentDueDate: (record as any).rentDueDate,
                existingTenantSetup,
                tenantOnboardingType,
            });

            // Mark unit as Occupied
            updateProperty(prop.id, {
                units: prop.units.map(u =>
                    u.id === record.unitId ? { ...u, status: 'Occupied' as const } : u
                ) as Unit[],
            });

            const tenantPayload: Partial<TenantProfile> = tenantOnboardingType === 'Existing' && existingSeed
                ? {
                    ...baseFields,
                    status:        'Active',
                    activationDate: existingSeed.activationDate,
                    propertyId:    record.propertyId,
                    propertyName:  resolvedPropertyName,
                    unitId:        record.unitId,
                    unit:          resolvedUnitNumber,
                    rentAmount,
                    rentDueDate:     (record as any).rentDueDate,
                    rentGraceDays:   graceDays,
                    depositPaid:     existingSeed.depositPaid,
                    depositExpected,
                    rentStartDate:   existingSeed.rentStartDate,
                    onboardingDate:  existingSeed.onboardingDate,
                    nextDueDate:     existingSeed.nextDueDate,
                    paymentHistory:  existingSeed.paymentHistory,
                    outstandingBills: existingSeed.outstandingBills,
                    outstandingFines: existingSeed.outstandingFines,
                    depositExempt:   isDepositExempt || undefined,
                    depositMonths:   depositMonths > 1 ? depositMonths : undefined,
                    proratedDeposit: proratedDeposit?.enabled ? proratedDeposit : undefined,
                    rentExtension:   rentExtension?.enabled  ? rentExtension   : undefined,
                }
                : (() => {
                    // #7: When tenant joins mid-month and BOTH deposit + rent are owed,
                    // pre-record next-month's full rent as a Pending bill dated to the
                    // next month's due day, so it appears under the next month's charges
                    // immediately (and not only when the rent cycle ticks over).
                    const needsNextMonthBill = !rentExtension?.enabled && firstMonthRent > 0 && firstMonthRent < rentAmount;
                    const seededBills: BillItem[] = needsNextMonthBill
                        ? [{
                            id: `RENT-NEXTMONTH-${record.id}-${nextDueDateIso}`,
                            type: 'Rent',
                            amount: rentAmount,
                            date: nextDueDateIso,
                            status: 'Pending',
                            description: `Rent for ${nextDueDateIso.slice(0, 7)} (charged at registration)`,
                        }]
                        : [];
                    return {
                        ...baseFields,
                        status:        'PendingPayment' as const,
                        propertyId:    record.propertyId,
                        propertyName:  resolvedPropertyName,
                        unitId:        record.unitId,
                        unit:          resolvedUnitNumber,
                        rentAmount,
                        firstMonthRent:  firstMonthRent !== rentAmount ? firstMonthRent : undefined,
                        rentDueDate:     (record as any).rentDueDate,
                        rentGraceDays:   graceDays,
                        depositPaid,
                        depositExpected,
                        rentStartDate:   (record as any).rentStartDate || baseFields.rentStartDate,
                        nextDueDate:     nextDueDateIso,
                        outstandingBills: [ ...(baseFields.outstandingBills || []), ...seededBills ],
                        depositExempt:   isDepositExempt || undefined,
                        depositMonths:   depositMonths > 1 ? depositMonths : undefined,
                        proratedDeposit: proratedDeposit?.enabled ? proratedDeposit : undefined,
                        rentExtension:   rentExtension?.enabled  ? rentExtension   : undefined,
                    };
                })();

            // If prior C2B payments already exist (e.g. tenant paid before approval
            // via paybill + unit account no.), replay them through the standard
            // posting engine so depositPaid / outstandingBills / status reflect
            // what's actually been received. Fully-paid → auto-promote to Active.
            let finalTenantPayload: any = tenantPayload;
            const priorPaidPayments = (tenantOnboardingType !== 'Existing' && Array.isArray(uniquePaymentHistory))
                ? [...uniquePaymentHistory]
                    .filter((p: any) => p && p.status === 'Paid')
                    .sort((a: any, b: any) => String(a?.date || '').localeCompare(String(b?.date || '')))
                : [];
            if (priorPaidPayments.length > 0) {
                let working: any = { ...tenantPayload, paymentHistory: [], depositPaid: 0 };
                for (const p of priorPaidPayments) {
                    const amt = Number((p as any).amount) || 0;
                    if (!(amt > 0)) continue;
                    const posting = buildStandardTenantPaymentPosting(
                        working as TenantProfile,
                        amt,
                        String((p as any).date || getTodayIsoDate()),
                        String((p as any).method || ''),
                        String((p as any).reference || ''),
                    );
                    working = { ...working, ...posting.updates };
                }
                finalTenantPayload = working;
            }

            const alreadyTenant = tenants.find(t => t.id === targetTenantId);
            if (alreadyTenant) {
                updateTenant(targetTenantId, preservePriorTenantState(finalTenantPayload, alreadyTenant) as any);
            } else {
                addTenant(finalTenantPayload as TenantProfile);
            }

            const subDrafts = (record as any)._subUnitDrafts as Array<{ propertyId: string; unitId: string; rent: number }> | undefined;
            if (Array.isArray(subDrafts) && subDrafts.length > 0) {
                const existingSubs = tenants.filter(t => t.mainTenantId === targetTenantId);
                let currentProperties = [...properties];
                subDrafts.forEach((sub, idx) => {
                    const subPropIdx = currentProperties.findIndex(p => p.id === sub.propertyId);
                    if (subPropIdx === -1) return;
                    const subProp = currentProperties[subPropIdx];
                    const subUnit = subProp?.units?.find(u => u.id === sub.unitId);
                    if (!subProp || !subUnit) return;
                    const existing = existingSubs.find(s => s.unitId === sub.unitId);
                    const subTenant: TenantProfile = {
                        id: existing?.id || `tenant-sub-${Date.now()}-${idx}`,
                        name: record.name || '',
                        email: String(record.email || ''),
                        phone: '', // Sub-tenants do not need a duplicate phone number; avoid unique constraint errors
                        idNumber: '', // Sub-tenants do not need a duplicate ID number; avoid unique constraint errors
                        status: (tenantPayload.status as TenantProfile['status']) || 'PendingPayment',
                        propertyId: subProp.id,
                        propertyName: subProp.name,
                        unitId: subUnit.id,
                        unit: subUnit.unitNumber,
                        rentAmount: Number(sub.rent || subUnit.rent || 0),
                        rentDueDate: (record as any).rentDueDate ?? 1,
                        rentGraceDays: graceDays,
                        depositPaid: 0,
                        depositExpected: 0,
                        depositExempt: true,
                        rentStartDate: tenantPayload.rentStartDate || getTodayIsoDate(),
                        onboardingDate: tenantPayload.onboardingDate || getTodayIsoDate(),
                        paymentHistory: existing?.paymentHistory || [],
                        outstandingBills: existing?.outstandingBills || [],
                        outstandingFines: existing?.outstandingFines || [],
                        maintenanceRequests: existing?.maintenanceRequests || [],
                        occupancyType: 'Sub',
                        mainTenantId: targetTenantId,
                        authUserId: targetAuthUserId,
                    };
                    // Mark sub unit occupied
                    const updatedSubUnits = subProp.units.map(u => u.id === subUnit.id ? { ...u, status: 'Occupied' as const, tenantId: subTenant.id } : u);
                    const updatedProp = { ...subProp, units: updatedSubUnits as Unit[] };
                    currentProperties[subPropIdx] = updatedProp;
                    updateProperty(subProp.id, { units: updatedSubUnits as Unit[] });
                    if (existing) {
                        updateTenant(existing.id, subTenant);
                    } else {
                        addTenant(subTenant);
                    }
                });
            }

            if (record.recordType === 'Application') {
                deleteApplication(record.id, { keepTenant: true, keepAuthUser: true });
            }
            closeProfileHub();
            const becameActive = (finalTenantPayload?.status as string) === 'Active';
            alert(tenantOnboardingType === 'Existing'
                ? `${record.name} approved and activated as an existing tenant.`
                : becameActive
                    ? `${record.name} approved. Prior payments cover deposit + first rent — tenant is now Active.`
                    : `${record.name} approved and moved to Pending Payment. Record their payment to activate.`);

        } else {
            // ── Path B: no unit yet → PendingAllocation ──────────────────────
            const tenantPayload: Partial<TenantProfile> = {
                ...baseFields,
                status:     'PendingAllocation',
                unit:       '',
                rentAmount: Number(record.rentAmount || 0),
            };

            const alreadyTenant = tenants.find(t => t.id === targetTenantId);
            if (alreadyTenant) {
                updateTenant(targetTenantId, preservePriorTenantState(tenantPayload, alreadyTenant) as any);
            } else {
                addTenant(tenantPayload as TenantProfile);
            }
            if (record.recordType === 'Application') {
                deleteApplication(record.id, { keepTenant: true, keepAuthUser: true });
            }
            closeProfileHub();
            alert(tenantOnboardingType === 'Existing'
                ? `${record.name} approved and moved to Pending Allocation. Assign a unit to activate this existing tenant.`
                : `${record.name} approved and moved to Pending Allocation. Assign a unit to proceed to payment.`);
        }
    };

    const handleReverseAllocation = async (record: UnifiedRecord) => {
        if (record.recordType !== 'Tenant' || !record.id) return;
        if (!record.propertyId && !record.unitId) {
            await safeAlert('This tenant has no current allocation to reverse.');
            return;
        }
        if (!(await safeConfirm(`Reverse allocation for ${record.name}? The unit will be marked Vacant and the tenant will be set to Pending Allocation.`))) return;
        
        let updatedProp: Property | undefined;
        if (record.propertyId) {
            const prop = properties.find(p => p.id === record.propertyId);
            if (prop && record.unitId) {
                const updatedUnits = prop.units.map(u => u.id === record.unitId ? { ...u, status: 'Vacant' as const } : u);
                updatedProp = { ...prop, units: updatedUnits as Unit[] };
                updateProperty(prop.id, { units: updatedUnits as Unit[] });
                try {
                    const { error: propErr } = await supabase.schema('app').rpc('upsert_properties_bulk', { p_properties: [updatedProp] });
                    if (propErr) {
                        console.error('[Reverse Allocation] upsert_properties_bulk failed:', propErr.message);
                        await safeAlert(`Failed to save property unit vacancy: ${propErr.message}`);
                        return;
                    }
                } catch (e: any) {
                    console.error('[Reverse Allocation] upsert_properties_error:', e);
                    await safeAlert(`Failed to save property unit vacancy: ${e?.message || 'Network error'}`);
                    return;
                }
            }
        }
        const reverseNote = `Allocation to ${record.propertyName || ''} - ${record.unit || ''} reversed by Super Admin on ${fmtDate(new Date())}`;
        const tenantToUpdate = tenants.find(t => t.id === record.id);
        if (tenantToUpdate) {
            const updatedTenant = {
                ...tenantToUpdate,
                propertyId: undefined,
                unitId: undefined,
                unit: '',
                propertyName: '',
                status: 'PendingAllocation' as const,
                notes: [...(tenantToUpdate.notes || []), reverseNote],
            };
            updateTenant(record.id, {
                propertyId: undefined,
                unitId: undefined,
                unit: '',
                propertyName: '',
                status: 'PendingAllocation',
                notes: [...(tenantToUpdate.notes || []), reverseNote],
            } as any);
            try {
                const { error: tenantErr } = await supabase.schema('app').rpc('upsert_tenants_bulk', { p_tenants: [updatedTenant] });
                if (tenantErr) {
                    console.error('[Reverse Allocation] upsert_tenants_bulk failed:', tenantErr.message);
                    await safeAlert(`Failed to save tenant: ${tenantErr.message}`);
                    return;
                }
            } catch (e: any) {
                console.error('[Reverse Allocation] upsert_tenants_error:', e);
                await safeAlert(`Failed to save tenant: ${e?.message || 'Network error'}`);
                return;
            }
        }
        await safeAlert(`Allocation reversed. ${record.name} is now unallocated.`);
    };

    const handleMoveClick = (tenant: TenantProfile) => {
        setMoveTenant(tenant);
    };

    const handleMoveSubmit = async (propertyId: string, unitId: string, propertyName: string, unitName: string) => {
        if (moveTenant) {
            const isSameProp = moveTenant.propertyId === propertyId;
            const newProp = properties.find(p => p.id === propertyId);
            
            let updatedOldProp: Property | undefined;
            let updatedNewProp: Property | undefined;
            
            if (isSameProp) {
                // Same property — vacate old + occupy new in one atomic update to avoid
                // stale-closure conflict when two updateProperty calls are batched.
                const prop = properties.find(p => p.id === propertyId);
                if (prop) {
                    const updatedUnits = prop.units.map(u => {
                        if (u.id === moveTenant.unitId) return { ...u, status: 'Vacant' as const };
                        if (u.id === unitId) return { ...u, status: 'Occupied' as const };
                        return u;
                    });
                    updatedNewProp = { ...prop, units: updatedUnits as Unit[] };
                    updateProperty(propertyId, { units: updatedUnits as Unit[] });
                }
            } else {
                // Different properties — safe to update separately.
                if (moveTenant.propertyId) {
                    const oldProp = properties.find(p => p.id === moveTenant.propertyId);
                    if (oldProp) {
                        const updatedUnits = oldProp.units.map(u => u.id === moveTenant.unitId ? { ...u, status: 'Vacant' as const } : u);
                        updatedOldProp = { ...oldProp, units: updatedUnits as Unit[] };
                        updateProperty(oldProp.id, { units: updatedUnits as Unit[] });
                    }
                }
                if (newProp) {
                    const updatedUnits = newProp.units.map(u => u.id === unitId ? { ...u, status: 'Occupied' as const } : u);
                    updatedNewProp = { ...newProp, units: updatedUnits as Unit[] };
                    updateProperty(propertyId, { units: updatedUnits as Unit[] });
                }
            }

            // Persist property changes to backend
            try {
                const propsToUpsert = [updatedOldProp, updatedNewProp].filter(Boolean) as Property[];
                if (propsToUpsert.length > 0) {
                    const { error: propErr } = await supabase.schema('app').rpc('upsert_properties_bulk', { p_properties: propsToUpsert });
                    if (propErr) {
                        console.error('[Move Tenant] upsert_properties_bulk failed:', propErr.message);
                        await safeAlert(`Failed to save property changes: ${propErr.message}`);
                        return;
                    }
                }
            } catch (e: any) {
                console.error('[Move Tenant] upsert_properties_error:', e);
                await safeAlert(`Failed to save property changes: ${e?.message || 'Network error'}`);
                return;
            }

            const targetUnit = newProp?.units.find(u => u.id === unitId);
            const targetRent = Number(targetUnit?.rent ?? 0) || 0;

            // 3. Update Tenant
            const moveNote = `Moved from ${moveTenant.propertyName} - ${moveTenant.unit} to ${propertyName} - ${unitName} on ${fmtDate(new Date())}`;
            const updatedTenant = {
                ...moveTenant,
                propertyId,
                unitId,
                propertyName,
                unit: unitName,
                rentAmount: targetRent,
                notes: [...(moveTenant.notes || []), moveNote]
            };
            
            updateTenant(moveTenant.id, {
                propertyId,
                unitId,
                propertyName,
                unit: unitName,
                // Auto-populate rent from the selected unit (supports variable rent per unit type/floor).
                rentAmount: targetRent,
                notes: [...(moveTenant.notes || []), moveNote]
            });

            try {
                const { error: tenantErr } = await supabase.schema('app').rpc('upsert_tenants_bulk', { p_tenants: [updatedTenant] });
                if (tenantErr) {
                    console.error('[Move Tenant] upsert_tenants_bulk failed:', tenantErr.message);
                    await safeAlert(`Failed to save tenant: ${tenantErr.message}`);
                    return;
                }
            } catch (e: any) {
                console.error('[Move Tenant] upsert_tenants_error:', e);
                await safeAlert(`Failed to save tenant: ${e?.message || 'Network error'}`);
                return;
            }

            setMoveTenant(null);
            await safeAlert("Tenant moved successfully.");
        }
    };

    const handleDelete = async (record: UnifiedRecord) => {
        if (!record.id) return;
        
        const confirmMsg = record.recordType === 'Tenant' 
            ? `Are you sure you want to delete tenant ${record.name}? This will free up the unit.`
            : `Are you sure you want to delete application for ${record.name}?`;
            
        if (await safeConfirm(confirmMsg)) {
            if (record.recordType === 'Tenant') {
                if (record.propertyId && record.unitId) {
                    const prop = properties.find(p => p.id === record.propertyId);
                    if (prop) {
                        const updatedUnits = prop.units.map(u => u.id === record.unitId ? { ...u, status: 'Vacant' as const } : u);
                        const updatedProp = { ...prop, units: updatedUnits as any };
                        updateProperty(prop.id, { units: updatedUnits as any });
                        try {
                            const { error: propErr } = await supabase.schema('app').rpc('upsert_properties_bulk', { p_properties: [updatedProp] });
                            if (propErr) {
                                console.error('[Delete Tenant] upsert_properties_bulk failed:', propErr.message);
                                await safeAlert(`Failed to save property unit vacancy: ${propErr.message}`);
                                return;
                            }
                        } catch (e: any) {
                            console.error('[Delete Tenant] upsert_properties_error:', e);
                            await safeAlert(`Failed to save property unit vacancy: ${e?.message || 'Network error'}`);
                            return;
                        }
                    }
                }
                deleteTenant(record.id);
            } else {
                deleteApplication(record.id);
            }
            await safeAlert(`${record.recordType} deleted successfully.`);
        }
    };

    const handleSave = (data: UnifiedRecord) => {
        // --- 1. Handle Active Tenant (Reallocation, Edit, or brand-new Tenant) ---
        if (data.recordType === 'Tenant') {
            const oldRecord = data.id ? tenants.find(t => t.id === data.id) : undefined;
            const shouldActivateExistingTenant = data.tenantOnboardingType === 'Existing'
                && !!data.propertyId
                && !!data.unitId
                && (!oldRecord || ['PendingApproval', 'Pending', 'PendingAllocation', 'PendingPayment', ''].includes(String(oldRecord.status || '')));
            const existingSeed = shouldActivateExistingTenant
                ? buildExistingSeed({
                    id: data.id,
                    rentAmount: data.rentAmount,
                    rentDueDate: data.rentDueDate,
                    existingTenantSetup: data.existingTenantSetup,
                    tenantOnboardingType: data.tenantOnboardingType,
                })
                : null;

            // Check for Property/Unit Change (Reallocation) via Edit Modal
            if (oldRecord && (oldRecord.propertyId !== data.propertyId || oldRecord.unitId !== data.unitId)) {
                const isSamePropEdit = oldRecord.propertyId === data.propertyId;
                if (isSamePropEdit && oldRecord.propertyId) {
                    const prop = properties.find(p => p.id === oldRecord.propertyId);
                    if (prop) {
                        const updatedUnits = prop.units.map(u => {
                            if (u.id === oldRecord.unitId) return { ...u, status: 'Vacant' as const };
                            if (u.id === data.unitId) return { ...u, status: 'Occupied' as const };
                            return u;
                        });
                        updateProperty(prop.id, { units: updatedUnits as Unit[] });
                    }
                } else {
                    if (oldRecord.propertyId && oldRecord.unitId) {
                        const oldProp = properties.find(p => p.id === oldRecord.propertyId);
                        if (oldProp) {
                            const updatedUnits = oldProp.units.map(u => u.id === oldRecord.unitId ? { ...u, status: 'Vacant' as const } : u);
                            updateProperty(oldProp.id, { units: updatedUnits as Unit[] });
                        }
                    }
                    const newProp = properties.find(p => p.id === data.propertyId);
                    if (newProp) {
                        const updatedUnits = newProp.units.map(u => u.id === data.unitId ? { ...u, status: 'Occupied' as const } : u);
                        updateProperty(newProp.id, { units: updatedUnits as Unit[] });
                    }
                }
            }

            if (oldRecord) {
                const tenantUpdates: Partial<TenantProfile> = {
                    ...(data as Partial<TenantProfile>),
                    propertyId: data.propertyId,
                    propertyName: data.propertyName,
                    unitId: data.unitId,
                    unit: data.unit,
                    status: data.status as TenantProfile['status'],
                };
                // When the admin edits Rent Start Date on an Active/Existing
                // tenant, recompute the prorated first-month rent and reset
                // nextDueDate to the next due day so subsequent rent /
                // arrears calculations honour the new anchor instead of the
                // stale firstMonthRent / nextDueDate from the previous date.
                const oldStart = String((oldRecord as any).rentStartDate || '').trim();
                const newStart = String((data as any).rentStartDate || '').trim();
                if (newStart && newStart !== oldStart) {
                    const newRent = Number((data as any).rentAmount || oldRecord.rentAmount || 0);
                    const prorated = calculateProratedFirstMonthRent(newRent, newStart);
                    (tenantUpdates as any).firstMonthRent = prorated !== newRent ? prorated : undefined;
                    (tenantUpdates as any).rentStartDate = newStart;
                    (tenantUpdates as any).onboardingDate = newStart; // ensure onboardingDate tracks rentStartDate too
                    if (oldRecord.existingTenantSetup) {
                        (tenantUpdates as any).existingTenantSetup = {
                            ...oldRecord.existingTenantSetup,
                            occupancyStartDate: newStart,
                        };
                    }
                    const syncedLease = syncLeaseDatesToRentStart(oldRecord as any, newStart);
                    (tenantUpdates as any).leaseStartDate = syncedLease.leaseStartDate;
                    (tenantUpdates as any).leaseEnd = syncedLease.leaseEnd;


                    const start = new Date(newStart);
                    if (!Number.isNaN(start.getTime())) {
                        // User request: Last due date for the first month should always be the rent start date date.
                        // Setting nextDueDate to newStart guarantees the first invoice aligns with rentStartDate.
                        tenantUpdates.nextDueDate = newStart;
                        
                        // Remove any existing pre-seed invoice safely
                        let updatedBills = [...(Array.isArray(oldRecord.outstandingBills) ? oldRecord.outstandingBills : [])];
                        const countBefore = updatedBills.length;
                        updatedBills = updatedBills.filter(b => !b.id.startsWith('RENT-NEXTMONTH-'));
                        if (updatedBills.length !== countBefore) {
                            tenantUpdates.outstandingBills = updatedBills;
                        }
                    }
                }

                if (existingSeed) {
                    Object.assign(tenantUpdates, existingSeed, { status: 'Active' as const });
                } else if (data.tenantOnboardingType === 'Existing') {
                    // Editing an already-active existing tenant: changes to the
                    // Historical Occupancy Start (or rent ledger / deposit
                    // backfill / fine ledger) must propagate to the live
                    // tenant so prior-month arrears recompute against the new
                    // anchor. Rebuild the seed and merge the historical
                    // fields, preserving real (non-backfill) payments.
                    const reseed = buildExistingSeed({
                        id: data.id,
                        rentAmount: data.rentAmount,
                        rentDueDate: data.rentDueDate,
                        existingTenantSetup: data.existingTenantSetup,
                        tenantOnboardingType: data.tenantOnboardingType,
                    });
                    if (reseed) {
                        const priorHistory = Array.isArray(oldRecord.paymentHistory) ? oldRecord.paymentHistory : [];
                        const realPayments = priorHistory.filter(p => {
                            const ref = String((p as any)?.reference || '');
                            const method = String((p as any)?.method || '');
                            return !(
                                ref.startsWith('BACKFILL-')
                                || ref.startsWith('DEPOSIT-BACKFILL-')
                                || method === 'Backdated Rent Payment'
                                || method === 'Backdated Deposit Payment'
                                || method === 'Backdated Opening Balance'
                            );
                        });
                        const mergedHistory = [...realPayments, ...reseed.paymentHistory]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        Object.assign(tenantUpdates, {
                            // A manually edited rent start date is authoritative.
                            // The historical seed may still contain the previous
                            // occupancyStartDate, so it must never overwrite it.
                            rentStartDate:    newStart || reseed.rentStartDate,
                            onboardingDate:   reseed.onboardingDate ?? oldRecord.onboardingDate,
                            activationDate:   reseed.activationDate ?? oldRecord.activationDate,
                            // If they edited to a new start date, that date takes precedence for nextDueDate
                            nextDueDate:      data.rentStartDate && data.rentStartDate !== oldStart ? data.rentStartDate : (reseed.nextDueDate ?? oldRecord.nextDueDate),
                            // CRITICAL: Preserve real deposit paid. reseed.depositPaid is hardcoded to 0!
                            depositPaid:      Math.max(Number(oldRecord.depositPaid || 0), Number(reseed.depositPaid || 0)),
                            paymentHistory:   mergedHistory,
                            outstandingFines: reseed.outstandingFines,
                            existingTenantSetup: reseed.existingTenantSetup,
                            tenantOnboardingType: 'Existing',
                        });
                        if (newStart && (tenantUpdates as any).existingTenantSetup) {
                            (tenantUpdates as any).existingTenantSetup = {
                                ...(tenantUpdates as any).existingTenantSetup,
                                occupancyStartDate: newStart,
                            };
                        }
                    }
                }
                updateTenant(oldRecord.id, tenantUpdates as TenantProfile);
                safeAlert(existingSeed
                    ? 'Existing tenant activated successfully.'
                    : (oldRecord.unitId !== data.unitId ? 'Tenant reallocated successfully!' : 'Tenant details updated.'));
            } else {
                // Brand-new tenant created directly (no application path). Previously
                // this hit updateTenant with an id that didn't exist and silently
                // dropped the record — see bug #13 ("tenants saved but invisible").
                const newTenant = {
                    ...data,
                    id: data.id || `tenant-${Date.now()}`,
                    paymentHistory: Array.isArray(data.paymentHistory) ? data.paymentHistory : [],
                    outstandingBills: Array.isArray((data as any).outstandingBills) ? (data as any).outstandingBills : [],
                    outstandingFines: Array.isArray((data as any).outstandingFines) ? (data as any).outstandingFines : [],
                    maintenanceRequests: Array.isArray((data as any).maintenanceRequests) ? (data as any).maintenanceRequests : [],
                    rentStartDate: (data as any).rentStartDate || (data as any).onboardingDate || getTodayIsoDate(),
                    onboardingDate: (data as any).onboardingDate || (data as any).rentStartDate || getTodayIsoDate(),
                } as TenantProfile;
                if (existingSeed) {
                    Object.assign(newTenant, existingSeed, { status: 'Active' as const });
                }
                if (newTenant.propertyId && newTenant.unitId) {
                    const newProp = properties.find(p => p.id === newTenant.propertyId);
                    if (newProp) {
                        const updatedUnits = newProp.units.map(u => u.id === newTenant.unitId ? { ...u, status: 'Occupied' } : u);
                        updateProperty(newProp.id, { units: updatedUnits as Unit[] });
                    }
                }
                addTenant(newTenant);
                safeAlert(existingSeed ? 'Existing tenant added and activated.' : 'Tenant added.');
            }
        }
        // --- 2. Handle Application ---
        else {
            if (data.id && applications.find(a => a.id === data.id)) {
                updateApplication(data.id, data as TenantApplication);
                
                // Propagate rent fields, including Rent Start Date, to the matching tenant profile if already active/onboarded
                const normalizedEmail = String((data as any).email || '').trim().toLowerCase();
                const normalizedPhone = String((data as any).phone || '').replace(/\D/g, '').slice(-9);
                const matchingTenant = tenants.find(t =>
                    t.id === data.id
                    || (!!normalizedEmail && String(t.email || '').trim().toLowerCase() === normalizedEmail)
                    || (!!normalizedPhone && String(t.phone || '').replace(/\D/g, '').slice(-9) === normalizedPhone)
                );
                if (matchingTenant) {
                    const newStart = String((data as any).rentStartDate || '').trim();
                    const oldStart = String(matchingTenant.rentStartDate || '').trim();
                    const tenantUpdates: Partial<TenantProfile> = {
                        rentAmount: data.rentAmount,
                        rentDueDate: data.rentDueDate,
                        rentGraceDays: data.rentGraceDays,
                        depositExpected: data.depositExpected,
                        depositMonths: data.depositMonths,
                        depositExempt: data.depositExempt,
                        occupancyType: (data as any).occupancyType,
                        mainTenantId: (data as any).mainTenantId,
                        _subUnitDrafts: (data as any)._subUnitDrafts,
                    };
                    if (newStart && newStart !== oldStart) {
                        const newRent = Number((data as any).rentAmount || matchingTenant.rentAmount || 0);
                        const prorated = calculateProratedFirstMonthRent(newRent, newStart);
                        (tenantUpdates as any).firstMonthRent = prorated !== newRent ? prorated : undefined;
                        (tenantUpdates as any).rentStartDate = newStart;
                        (tenantUpdates as any).onboardingDate = newStart;
                        if (matchingTenant.existingTenantSetup) {
                            (tenantUpdates as any).existingTenantSetup = {
                                ...matchingTenant.existingTenantSetup,
                                occupancyStartDate: newStart,
                            };
                        }
                        const syncedLease = syncLeaseDatesToRentStart(matchingTenant as any, newStart);
                        (tenantUpdates as any).leaseStartDate = syncedLease.leaseStartDate;
                        (tenantUpdates as any).leaseEnd = syncedLease.leaseEnd;

                        const start = new Date(newStart);
                        if (!Number.isNaN(start.getTime())) {
                            tenantUpdates.nextDueDate = newStart;
                        }
                    }
                    updateTenant(matchingTenant.id, tenantUpdates);
                }
            } else {
                addApplication({ ...data, id: `app-${Date.now()}`, submittedDate: getTodayIsoDate(), status: 'New' } as TenantApplication);
            }
        }

        // --- 3. Multi-Occupancy: create/update/cleanup Sub tenant records linked to the Main ---
        const subDrafts = (data as any)._subUnitDrafts as Array<{ propertyId: string; unitId: string; rent: number }> | undefined;
        if (data.recordType === 'Tenant') {
            const mainId = data.id; // stable id assigned before save; never infer from stale tenant state
            if (!mainId) return;
            const existingSubs = tenants.filter(t => t.mainTenantId === mainId);

            if (data.occupancyType === 'Single' || !Array.isArray(subDrafts) || subDrafts.length === 0) {
                // If toggled back to Single occupancy, vacate and delete all associated Sub tenants
                existingSubs.forEach(s => {
                    if (s.propertyId && s.unitId) {
                        const p = properties.find(p => p.id === s.propertyId);
                        if (p) {
                            const u = p.units.map(uu => uu.id === s.unitId ? { ...uu, status: 'Vacant' as const } : uu);
                            updateProperty(p.id, { units: u as Unit[] });
                        }
                    }
                    deleteTenant(s.id);
                });
            } else if (Array.isArray(subDrafts) && subDrafts.length > 0) {
                let currentProperties = [...properties];
                // Remove any prior Subs for this Main that are no longer in the draft list
                const keepUnitIds = new Set(subDrafts.map(s => s.unitId));
                existingSubs.forEach(s => {
                    if (!keepUnitIds.has(s.unitId || '')) {
                        if (s.propertyId && s.unitId) {
                            const propIdx = currentProperties.findIndex(p => p.id === s.propertyId);
                            if (propIdx !== -1) {
                                const p = currentProperties[propIdx];
                                const u = p.units.map(uu => uu.id === s.unitId ? { ...uu, status: 'Vacant' as const } : uu);
                                const updatedProp = { ...p, units: u as Unit[] };
                                currentProperties[propIdx] = updatedProp;
                                updateProperty(p.id, { units: u as Unit[] });
                            }
                        }
                        deleteTenant(s.id);
                    }
                });
                // Create / update sub records
                subDrafts.forEach((sub, idx) => {
                    const subPropIdx = currentProperties.findIndex(p => p.id === sub.propertyId);
                    if (subPropIdx === -1) return;
                    const subProp = currentProperties[subPropIdx];
                    const subUnit = subProp?.units.find(u => u.id === sub.unitId);
                    if (!subProp || !subUnit) return;
                    const existing = existingSubs.find(s => s.unitId === sub.unitId);
                    const subTenant: TenantProfile = {
                        id: existing?.id || `tenant-sub-${Date.now()}-${idx}`,
                        name: data.name || '',
                        email: data.email || '',
                        phone: '', // Sub-tenants do not need a duplicate phone number; avoid unique constraint errors
                        idNumber: '', // Sub-tenants do not need a duplicate ID number; avoid unique constraint errors
                        status: (data.status as TenantProfile['status']) || 'Active',
                        propertyId: subProp.id,
                        propertyName: subProp.name,
                        unitId: subUnit.id,
                        unit: subUnit.unitNumber,
                        rentAmount: Number(sub.rent || subUnit.rent || 0),
                        rentDueDate: data.rentDueDate ?? 1,
                        rentGraceDays: data.rentGraceDays ?? 4,
                        depositPaid: 0,
                        depositExpected: 0,
                        depositExempt: true, // Deposit consolidated on Main
                        rentStartDate: data.rentStartDate || getTodayIsoDate(),
                        onboardingDate: data.onboardingDate || getTodayIsoDate(),
                        paymentHistory: existing?.paymentHistory || [],
                        outstandingBills: existing?.outstandingBills || [],
                        outstandingFines: existing?.outstandingFines || [],
                        maintenanceRequests: existing?.maintenanceRequests || [],
                        occupancyType: 'Sub',
                        mainTenantId: mainId,
                        authUserId: data.authUserId,
                    };
                    // Mark sub unit occupied
                    const updatedSubUnits = subProp.units.map(u => u.id === subUnit.id ? { ...u, status: 'Occupied' as const, tenantId: subTenant.id } : u);
                    const updatedProp = { ...subProp, units: updatedSubUnits as Unit[] };
                    currentProperties[subPropIdx] = updatedProp;
                    updateProperty(subProp.id, { units: updatedSubUnits as Unit[] });
                    if (existing) {
                        updateTenant(existing.id, subTenant);
                    } else {
                        addTenant(subTenant);
                    }
                });
            }
        }

        setIsModalOpen(false);
    };


    const getPaymentUserId = (record: UnifiedRecord): string | null => {
        if (record.recordType === 'Tenant') {
            const t = tenants.find(x => x.id === record.id);
            if (!t) return null;
            if (t.authUserId && isUuid(t.authUserId)) return t.authUserId;
            if (isUuid(t.id)) return t.id;
            const targetCanonical = canonicalizePhone(t.phone);
            const byPhone = targetCanonical
                ? tenants.find(x => canonicalizePhone(x.phone) === targetCanonical && x.authUserId && isUuid(x.authUserId))
                : undefined;
            return byPhone?.authUserId ?? null;
        }
        if (record.recordType === 'Application') {
            const authUserId = (record as any).authUserId;
            if (authUserId && isUuid(authUserId)) return authUserId;
            // For applications created by other flows that don't include authUserId yet,
            // STK polling cannot be completed reliably.
            return null;
        }
        const recordCanonical = canonicalizePhone(record.phone);
        const byPhone = recordCanonical
            ? tenants.find(
                x => canonicalizePhone(x.phone) === recordCanonical && ((x.authUserId && isUuid(x.authUserId)) || isUuid(x.id)),
            )
            : undefined;
        if (!byPhone) return null;
        return byPhone.authUserId && isUuid(byPhone.authUserId) ? byPhone.authUserId : (isUuid(byPhone.id) ? byPhone.id : null);
    };

    const applyPaidState = (record: UnifiedRecord, amount: number, reference: string, method: string, date?: string) => {
        const paymentDate = (date && String(date).trim()) ? String(date).trim() : getTodayIsoDate();
        if (record.recordType === 'Tenant' && record.id) {
            const t = tenants.find(x => x.id === record.id);
            if (!t) return;
            const posting = buildStandardTenantPaymentPosting(t, amount, paymentDate, method, reference);
            const activatedNow = t.status !== 'Active' && posting.updates.status === 'Active';
            updateTenant(record.id, posting.updates);
            // ── Auto-assign Tenancy Referral commission on first activation ──────
            // Covers all referrer pools: staff, landlords/affiliates, investors, tenants.
            if (activatedNow && t.referrerId) {
                const staffReferrer = staff.find(s => s.id === t.referrerId);
                const landlordReferrer = landlords.find(l => l.id === t.referrerId);
                const allPeople = [...tenants, ...(renovationInvestors as any[])];
                const otherReferrer = allPeople.find((p: any) => p.id === t.referrerId);
                const referrerObj = staffReferrer || landlordReferrer || otherReferrer;

                const referralConfig = referrerObj?.referralConfig || (t as any).referralConfig;

                let commissionAmount = 0;
                if (referralConfig && referralConfig.rateValue > 0) {
                    commissionAmount = referralConfig.rateType === '%'
                        ? Math.round((t.rentAmount || 0) * (referralConfig.rateValue / 100))
                        : referralConfig.rateValue;
                } else {
                    const rule = commissionRules.find(r => r.trigger === 'Tenancy Referral');
                    if (rule && rule.rateValue > 0) {
                        commissionAmount = rule.rateType === '%'
                            ? Math.round((t.rentAmount || 0) * (rule.rateValue / 100))
                            : rule.rateValue;
                    } else {
                        commissionAmount = 200; // default KES
                    }
                }

                if (commissionAmount > 0) {
                    const today = getTodayIsoDate();
                    const source = `Tenancy Referral — ${t.name}`;

                    if (staffReferrer) {
                        updateStaff(t.referrerId, {
                            commissions: [
                                { date: today, amount: commissionAmount, source },
                                ...(staffReferrer.commissions || []),
                            ],
                        });
                    } else if (landlordReferrer) {
                        updateLandlord(t.referrerId, {
                            commissions: [
                                { date: today, amount: commissionAmount, source },
                                ...((landlordReferrer as any).commissions || []),
                            ],
                        } as any);
                    } else if (otherReferrer) {
                        // Tenants / Investors — log via rfTransactions ledger
                        addRFTransaction({
                            id: `rft-ref-${Date.now()}`,
                            date: today,
                            type: 'Referral Commission',
                            category: 'Outbound',
                            amount: commissionAmount,
                            partyName: (otherReferrer as any).name || 'Referrer',
                            description: source,
                            reference: `REF-${t.id.slice(0, 8).toUpperCase()}`,
                            status: 'Pending',
                            notes: `Auto-generated on activation of ${t.name}`,
                        } as any);
                    }
                }
            }
            return;
        }
        if (record.recordType === 'Application' && record.id) {
            const app = applications.find(a => a.id === record.id) ?? (record as any as TenantApplication);
            if (!app) return;

            if (String(app.status ?? '') !== 'Approved') {
                safeAlert('Please approve the application first, then record the payment.');
                return;
            }

            if (!app.propertyId || !app.unitId) {
                safeAlert('Property and unit allocation are required to activate the tenant.');
                return;
            }

            const prop = properties.find(p => p.id === app.propertyId);
            const unit = prop?.units?.find(u => u.id === app.unitId);
            if (!prop || !unit) {
                safeAlert('Could not find the property/unit for this application.');
                return;
            }

            const rentAmount = Number(app.rentAmount || unit.rent || prop.defaultMonthlyRent || 0);
            const isDepositExempt = !!(app as any).depositExempt;
            const appDepositMonths = Number((app as any).depositMonths ?? 1);
            const appProrated = (app as any).proratedDeposit as TenantProfile['proratedDeposit'];
            const appRentExtension = (app as any).rentExtension as TenantProfile['rentExtension'];

            // ── Proration: first-month rent based on join day ─────────────────
            // Day 1–9  → full month; Day 10–24 → prorated remainder;
            // Day 25+  → prorated days + next full month.
            const firstMonthRent = calculateProratedFirstMonthRent(rentAmount, getTenantProrationAnchor(app));

            // ── Compute expected first payment ────────────────────────────────
            let depositPaid = 0;
            let nextDueDateIso: string;
            let graceDays = Number(app.rentGraceDays ?? 4);

            if (isDepositExempt) {
                depositPaid = 0;
                const dueDay = Math.min(28, Math.max(1, Number(app.rentDueDate ?? 1)));
                const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(dueDay); d.setHours(0, 0, 0, 0);
                nextDueDateIso = d.toISOString().split('T')[0];
            } else if (appRentExtension?.enabled) {
                depositPaid = 0;
                nextDueDateIso = appRentExtension.rentDeferredUntil;
                graceDays = 0;
            } else if (appProrated?.enabled) {
                depositPaid = 0;
                const dueDay = Math.min(28, Math.max(1, Number(app.rentDueDate ?? 1)));
                const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(dueDay); d.setHours(0, 0, 0, 0);
                nextDueDateIso = d.toISOString().split('T')[0];
            } else {
                depositPaid = 0;
                const dueDay = Math.min(28, Math.max(1, Number(app.rentDueDate ?? 1)));
                const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(dueDay); d.setHours(0, 0, 0, 0);
                nextDueDateIso = d.toISOString().split('T')[0];
            }

            const existingActiveSameUnit = tenants.find(
                t => t.propertyId === app.propertyId && t.unitId === app.unitId && t.status === 'Active' && t.id !== app.id,
            );
            if (existingActiveSameUnit) {
                safeAlert('This unit is already allocated to an active tenant.');
                return;
            }

            // 1) Mark unit as occupied.
            const updatedUnits = prop.units.map(u => (u.id === app.unitId ? { ...u, status: 'Occupied' } : u));
            updateProperty(prop.id, { units: updatedUnits as any });

            let resolvedProratedDeposit = appProrated?.enabled
                ? {
                    ...appProrated,
                }
                : undefined;

            const alreadyTenant = tenants.find(t => 
                t.id === app.id || 
                (app.authUserId && t.id === app.authUserId) ||
                (app.authUserId && t.authUserId === app.authUserId) ||
                (app.email && t.email && t.email.toLowerCase() === app.email.toLowerCase()) ||
                (app.phone && t.phone && canonicalizePhone(t.phone) === canonicalizePhone(app.phone))
            );
            const targetTenantId = alreadyTenant ? alreadyTenant.id : app.id;
            const targetAuthUserId = alreadyTenant ? (alreadyTenant.authUserId || (alreadyTenant.id.length > 20 ? alreadyTenant.id : undefined)) : app.authUserId;

            const uniquePaymentHistory = uniqueId([
                ...(alreadyTenant?.paymentHistory || []),
                ...(Array.isArray((app as any).paymentHistory) ? (app as any).paymentHistory : [])
            ]);
            const uniqueOutstandingBills = uniqueById([
                ...(alreadyTenant?.outstandingBills || []),
                ...(Array.isArray((app as any).outstandingBills) ? (app as any).outstandingBills : [])
            ]);
            const uniqueOutstandingFines = uniqueById([
                ...(alreadyTenant?.outstandingFines || []),
                ...(Array.isArray((app as any).outstandingFines) ? (app as any).outstandingFines : [])
            ]);
            const uniqueMaintenanceRequests = uniqueById([
                ...(alreadyTenant?.maintenanceRequests || []),
                ...(Array.isArray((app as any).maintenanceRequests) ? (app as any).maintenanceRequests : [])
            ]);

            // 2) Upsert TenantProfile.
            const tenantPayload: Partial<TenantProfile> = {
                id: targetTenantId,
                name: app.name,
                username: '',
                email: String(app.email || ''),
                phone: String(app.phone || ''),
                alternativePhone: (app as any).alternativePhone || undefined,
                nextOfKinName: (app as any).nextOfKinName || undefined,
                nextOfKinPhone: (app as any).nextOfKinPhone || undefined,
                nextOfKinRelationship: (app as any).nextOfKinRelationship || undefined,
                idNumber: String(app.idNumber || ''),
                status: 'Active',
                activationDate: getTodayIsoDate(),
                propertyId: app.propertyId,
                propertyName: app.propertyName || prop.name,
                unitId: app.unitId,
                unit: app.unit || unit.unitNumber,
                rentAmount: rentAmount,
                firstMonthRent: firstMonthRent !== rentAmount ? firstMonthRent : undefined,
                rentDueDate: app.rentDueDate,
                rentGraceDays: graceDays,
                depositPaid,
                rentStartDate: app.rentStartDate || getTodayIsoDate(),
                depositExpected: isDepositExempt
                    ? 0
                    : appRentExtension?.enabled
                        ? (appRentExtension.depositPaidUpfront || 0)
                        : appProrated?.enabled
                            ? (appProrated.totalDepositAmount || 0)
                            : (rentAmount * appDepositMonths),
                onboardingDate: getTodayIsoDate(),
                nextDueDate: nextDueDateIso,
                leaseSigned: !!app.leaseSigned,
                leaseStartDate: app.leaseStartDate,
                leaseEnd: app.leaseEnd,
                paymentHistory: uniquePaymentHistory,
                // #7: pre-seed next-month rent as a Pending bill when first-month is prorated.
                outstandingBills: (!appRentExtension?.enabled && firstMonthRent > 0 && firstMonthRent < rentAmount)
                    ? uniqueById([
                        ...uniqueOutstandingBills,
                        {
                            id: `RENT-NEXTMONTH-${targetTenantId}-${nextDueDateIso}`,
                            type: 'Rent',
                            amount: rentAmount,
                            date: nextDueDateIso,
                            status: 'Pending' as const,
                            description: `Rent for ${nextDueDateIso.slice(0, 7)} (charged at registration)`,
                        }
                    ])
                    : uniqueOutstandingBills,
                outstandingFines: uniqueOutstandingFines,
                maintenanceRequests: uniqueMaintenanceRequests,
                authUserId: targetAuthUserId,
                avatar: app.avatar,
                profilePicture: (app as any).profilePicture,
                kraPin: app.kraPin,
                // Deposit special-case fields
                depositExempt: isDepositExempt || undefined,
                depositMonths: appDepositMonths > 1 ? appDepositMonths : undefined,
                proratedDeposit: resolvedProratedDeposit,
                rentExtension: appRentExtension?.enabled ? appRentExtension : undefined,
                occupancyType: (app as any).occupancyType || undefined,
                mainTenantId: (app as any).mainTenantId || undefined,
                _subUnitDrafts: (app as any)._subUnitDrafts || undefined,
            };

            const baseTenant: TenantProfile = {
                ...(alreadyTenant || {} as TenantProfile),
                ...(tenantPayload as TenantProfile),
                id: targetTenantId,
                status: 'PendingPayment',
                activationDate: (alreadyTenant as any)?.activationDate,
                depositPaid: Number(alreadyTenant?.depositPaid ?? tenantPayload.depositPaid ?? 0),
                nextDueDate: nextDueDateIso,
                paymentHistory: uniquePaymentHistory,
                outstandingBills: uniqueOutstandingBills,
                outstandingFines: uniqueOutstandingFines,
                maintenanceRequests: uniqueMaintenanceRequests,
            };
            const posting = buildStandardTenantPaymentPosting(baseTenant, amount, paymentDate, method, reference);
            const tenantUpdates: Partial<TenantProfile> = {
                ...tenantPayload,
                ...posting.updates,
                depositPaid: Number(posting.updates.depositPaid ?? alreadyTenant?.depositPaid ?? tenantPayload.depositPaid ?? 0),
            };
            if (appRentExtension?.enabled && Number(amount || 0) + 0.01 >= Number(appRentExtension.depositPaidUpfront || 0)) {
                tenantUpdates.depositPaid = Number(appRentExtension.depositPaidUpfront || 0);
                tenantUpdates.status = 'Active';
                (tenantUpdates as any).activationDate = paymentDate;
            }
            if (alreadyTenant) {
                updateTenant(targetTenantId, tenantUpdates as any);
            } else {
                addTenant(tenantUpdates as TenantProfile);
            }

            // Create/update sub records
            const subDrafts = (app as any)._subUnitDrafts as Array<{ propertyId: string; unitId: string; rent: number }> | undefined;
            if (Array.isArray(subDrafts) && subDrafts.length > 0) {
                const existingSubs = tenants.filter(t => t.mainTenantId === targetTenantId);
                let currentProperties = [...properties];
                subDrafts.forEach((sub, idx) => {
                    const subPropIdx = currentProperties.findIndex(p => p.id === sub.propertyId);
                    if (subPropIdx === -1) return;
                    const subProp = currentProperties[subPropIdx];
                    const subUnit = subProp?.units?.find(u => u.id === sub.unitId);
                    if (!subProp || !subUnit) return;
                    const existing = existingSubs.find(s => s.unitId === sub.unitId);
                    const subTenant: TenantProfile = {
                        id: existing?.id || `tenant-sub-${Date.now()}-${idx}`,
                        name: app.name || '',
                        email: String(app.email || ''),
                        phone: '', // Sub-tenants do not need a duplicate phone number; avoid unique constraint errors
                        idNumber: '', // Sub-tenants do not need a duplicate ID number; avoid unique constraint errors
                        status: (tenantUpdates.status as TenantProfile['status']) || 'Active',
                        propertyId: subProp.id,
                        propertyName: subProp.name,
                        unitId: subUnit.id,
                        unit: subUnit.unitNumber,
                        rentAmount: Number(sub.rent || subUnit.rent || 0),
                        rentDueDate: app.rentDueDate ?? 1,
                        rentGraceDays: graceDays,
                        depositPaid: 0,
                        depositExpected: 0,
                        depositExempt: true,
                        rentStartDate: tenantUpdates.rentStartDate || getTodayIsoDate(),
                        onboardingDate: tenantUpdates.onboardingDate || getTodayIsoDate(),
                        paymentHistory: existing?.paymentHistory || [],
                        outstandingBills: existing?.outstandingBills || [],
                        outstandingFines: existing?.outstandingFines || [],
                        maintenanceRequests: existing?.maintenanceRequests || [],
                        occupancyType: 'Sub',
                        mainTenantId: targetTenantId,
                        authUserId: targetAuthUserId,
                    };
                    // Mark sub unit occupied
                    const updatedSubUnits = subProp.units.map(u => u.id === subUnit.id ? { ...u, status: 'Occupied' as const, tenantId: subTenant.id } : u);
                    const updatedProp = { ...subProp, units: updatedSubUnits as Unit[] };
                    currentProperties[subPropIdx] = updatedProp;
                    updateProperty(subProp.id, { units: updatedSubUnits as Unit[] });
                    if (existing) {
                        updateTenant(existing.id, subTenant);
                    } else {
                        addTenant(subTenant);
                    }
                });
            }

            // 3) Remove the application so it effectively "moves" into Active tenants.
            deleteApplication(app.id);
            return;
        }

        if (record.id) {
            updateApplication(record.id, { status: 'Approved' } as Partial<TenantApplication>);
        }
    };

    // --- Combine Data Sources ---
    const unifiedList: UnifiedRecord[] = useMemo(() => {
        const applicationIds = new Set(applications.map(a => a.id));
        const activeTenants: UnifiedRecord[] = tenants
            .filter(t => !(t.status === 'PendingApproval' && applicationIds.has(t.id)))
            .map(t => ({
            ...t,
            recordType: 'Tenant',
            displayStatus: t.status,
            submittedDate: t.onboardingDate
        }));

        const applicantRecords: UnifiedRecord[] = applications.map(a => ({
            ...a,
            recordType: 'Application',
            displayStatus: a.status
        }));

        return [...activeTenants, ...applicantRecords].sort((a,b) => new Date(b.submittedDate || '').getTime() - new Date(a.submittedDate || '').getTime());
    }, [tenants, applications]);

    const filteredList = useMemo(() => {
        return unifiedList.filter(item => {
            const matchesSearch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  (item.unit || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  (item.propertyName || item.property || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType =
                filterType === 'All' ||
                (filterType === 'Applicants' && item.recordType === 'Application') ||
                (filterType === 'Active' && item.recordType === 'Tenant' && item.displayStatus === 'Active') ||
                (filterType === 'PendingApproval' && item.recordType === 'Tenant' && item.displayStatus === 'PendingApproval') ||
                (filterType === 'PendingAllocation' && item.recordType === 'Tenant' && item.displayStatus === 'PendingAllocation') ||
                (filterType === 'PendingPayment' && item.recordType === 'Tenant' && (item.displayStatus === 'PendingPayment' || item.displayStatus === 'Pending'));
            return matchesSearch && matchesType;
        });
    }, [unifiedList, searchQuery, filterType]);
    // Defer the (potentially large) applicant grid so the profile modal — when
    // opened via deep-link (e.g. from the Dashboard's Pending Approval alert) —
    // paints on the first frame instead of waiting for every card to render.
    const deferredFilteredList = React.useDeferredValue(filteredList);

    const getStatusColor = (status: string, type: string) => {
        if (type === 'Tenant') {
            if (status === 'Active') return 'bg-green-100 text-green-800';
            if (status === 'Overdue') return 'bg-red-100 text-red-800';
            return 'bg-gray-100 text-gray-800';
        } else {
            if (status === 'Approved') return 'bg-blue-100 text-blue-800';
            if (status === 'New') return 'bg-purple-100 text-purple-800';
            return 'bg-yellow-100 text-yellow-800';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Master Registry</h1>
                    <p className="text-lg text-gray-500 mt-1">Unified view of all Applicants and Active Tenants. Manage details and reallocate units.</p>
                </div>
                {canCreate && (
                <button onClick={handleAddNew} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm flex items-center space-x-2">
                    <Icon name="register" className="w-5 h-5"/>
                    <span>New Application</span>
                </button>
                )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-4">
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search name, unit..." 
                            className="p-2 border rounded-lg w-64 focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <select 
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                            className="p-2 border rounded-lg bg-white"
                        >
                            <option value="All">All Records</option>
                            <option value="Applicants">Applicants</option>
                            <option value="Active">Active Tenants</option>
                            <option value="PendingApproval">Pending Approval</option>
                            <option value="PendingAllocation">Pending Allocation</option>
                            <option value="PendingPayment">Pending Payment</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {deferredFilteredList.map(record => {
                        const currentMonthIso = getCurrentMonthIso();
                        const isApplication = record.recordType === 'Application';
                        const tenant = record as any as TenantProfile;

                        const isAllocated = !isApplication ? tenantFullyAllocated(tenant) : false;
                        const isPaid = !isApplication && Array.isArray(tenant.paymentHistory)
                            ? isTenantRentCoveredForMonth(tenant, currentMonthIso)
                            : false;

                        const rentAmountForApps = Number(record.rentAmount || 0);

                        // For applications: show the deposit *owed*, not what's already been paid.
                        // Exempt → 0; rent extension → deposit upfront amount; prorated → monthly installment;
                        // multi-month / standard → rent × depositMonths (default 1).
                        const depositForApps = (() => {
                            if (!isApplication) return Number((record as any).depositPaid || 0);
                            if ((record as any).depositExempt) return 0;
                            if ((record as any).rentExtension?.enabled) {
                                return Number((record as any).rentExtension.depositPaidUpfront || 0);
                            }
                            if ((record as any).proratedDeposit?.enabled) {
                                return Number((record as any).proratedDeposit.monthlyInstallment || 0);
                            }
                            const depositMonths = Number((record as any).depositMonths ?? 1);
                            const stored = Number((record as any).depositPaid || 0);
                            return stored > 0 ? stored : rentAmountForApps * depositMonths;
                        })();

                        const rentDisplay = isApplication
                            ? rentAmountForApps
                            : Number(isAllocated ? (tenant.rentAmount ?? 0) : 0);

                        const automatedLateFine = (() => {
                            if (isApplication || !isAllocated) return 0;
                            const stat = getMonthlyRentStatus(tenant, { isRentPaidThisMonth: isPaid, asOfMonthIso: currentMonthIso });
                            const [cY, cM] = currentMonthIso.split('-').map(Number);
                            const pDate = new Date(cY, cM - 2, 1);
                            const pIso = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
                            const pStat = getMonthlyRentStatus(tenant, { asOfMonthIso: pIso });
                            return Math.max(0, stat.automatedLateFine - pStat.automatedLateFine);
                        })();

                        const pendingBills = !isApplication && isAllocated
                            ? (tenant.outstandingBills?.filter(b => b.status === 'Pending').reduce((s, b) => s + b.amount, 0) || 0)
                            : 0;

                        const pendingFines = !isApplication && isAllocated
                            ? (tenant.outstandingFines?.filter(f => f.status === 'Pending').reduce((s, f) => s + f.amount, 0) || 0)
                            : 0;

                        // --- Tenant: prorated first-month rent (mirrors ActiveTenants card logic) ---
                        const cardActivationMonth = !isApplication
                            ? (() => {
                                const anchor = getTenantProrationAnchor(tenant as Partial<TenantProfile>);
                                return anchor ? String(anchor).slice(0, 7) : null;
                            })()
                            : null;
                        const cardFirstMonthRent = !isApplication ? Number((tenant as any).firstMonthRent || 0) : 0;
                        const cardProratedRentOnTheFly = (() => {
                            if (isApplication || cardActivationMonth !== currentMonthIso) return 0;
                            const anchor = getTenantProrationAnchor(tenant as Partial<TenantProfile>);
                            return calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), anchor);
                        })();
                        const cardEffectiveRent = !isApplication
                            ? (cardActivationMonth === currentMonthIso
                                ? (cardFirstMonthRent > 0 ? cardFirstMonthRent : cardProratedRentOnTheFly)
                                : Number(tenant.rentAmount || 0))
                            : rentAmountForApps;

                        // --- Tenant: deposit owed (mirrors ActiveTenants card logic) ---
                        const depositOwed = (() => {
                            if (isApplication || !isAllocated) return 0;
                            if (tenant.depositExempt) return 0;
                            if (tenant.rentExtension?.enabled) return 0;
                            if (tenant.proratedDeposit?.enabled) {
                                const fullyPaid = (tenant.proratedDeposit.amountPaidSoFar ?? 0) >= tenant.proratedDeposit.totalDepositAmount;
                                return fullyPaid ? 0 : (tenant.proratedDeposit.monthlyInstallment || 0);
                            }
                            const depMonths = Number((tenant as any).depositMonths ?? 1);
                            const expected = Number((tenant as any).depositExpected ?? 0) > 0
                                ? Number((tenant as any).depositExpected)
                                : (Number(tenant.rentAmount || 0) * depMonths);
                            return Math.max(0, expected - Number(tenant.depositPaid || 0));
                        })();

                        const rentDue = isApplication
                            ? rentAmountForApps
                            : (!isAllocated ? 0 : (isPaid ? 0 : cardEffectiveRent));

                        // Utility deposits owed (water + electricity), for both applications and tenants
                        const utilityDepositOwed = (['water', 'electricity'] as const).reduce((sum, key) => {
                            const dep = (record as any)[`${key}Deposit`] as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
                            if (!dep?.required || dep?.exempt) return sum;
                            return sum + Math.max(0, (dep.amount || 0) - (dep.paid || 0));
                        }, 0);

                        // Total Due is sourced from the shared helper so the figure
                        // shown here matches Active Tenants > Balance Overview exactly.
                        // Applications (not yet allocated tenants) keep the simple
                        // rent + deposit + utility deposit estimate.
                        const cardBalanceForApps = !isApplication
                            ? computeTenantCardBalance(tenant, currentMonthIso, { automatedLateFine, isAllocated })
                            : null;
                        const totalDue = isApplication
                            ? (rentAmountForApps + depositForApps + utilityDepositOwed)
                            : (cardBalanceForApps?.totalDue ?? 0);

                        const arrearsText = !isApplication ? getArrearsText(tenant) : null;

                        return (
                            <div
                                key={record.id}
                                className={APP_CARD_CLASSES}
                                onClick={() => openProfileHub(record.id)}
                            >
                                <div className="flex flex-col h-full w-full">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold border border-gray-200 uppercase">
                                                {record.avatar ? String(record.avatar).charAt(0) : (record.name?.charAt(0) ?? '?')}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-800">{record.name}</h3>
                                                <p className="text-xs text-gray-500">{record.unit} • {record.propertyName || record.property}</p>
                                {record.recordType === 'Application' && (record as any).referredUnitId && (
                                    <p className="text-[10px] text-teal-600 font-bold mt-0.5">Referred unit set</p>
                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                !isAllocated ? 'bg-yellow-100 text-yellow-800' :
                                                    tenant.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                        tenant.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {!isAllocated ? 'Pending Allocation' : tenant.status}
                                            </span>
                                            {!isApplication && tenant.houseStatus && tenant.houseStatus.length > 0 && (
                                                <div className="flex flex-wrap gap-1 justify-end">
                                                    {tenant.houseStatus.slice(0, 2).map((status: string) => (
                                                        <span key={status} className="text-[9px] bg-red-50 text-red-600 px-1 rounded border border-red-100">
                                                            {status}
                                                        </span>
                                                    ))}
                                                    {tenant.houseStatus.length > 2 && <span className="text-[9px] text-gray-400">+{tenant.houseStatus.length - 2}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-sm mt-auto border-t pt-3 mb-3">
                                        <div>
                                            <p className="text-xs text-gray-400 uppercase font-bold">Rent</p>
                                            <p className="font-semibold">KES {Number(rentDisplay ?? 0).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 uppercase font-bold">
                                                {isApplication
                                                    ? ((record as any).depositExempt
                                                        ? 'Total Due'
                                                        : (record as any).rentExtension?.enabled
                                                            ? 'Deposit Due'
                                                            : (record as any).proratedDeposit?.enabled
                                                                ? 'Rent + Installment'
                                                                : 'Rent + Deposit')
                                                    : (cardBalanceForApps?.isCredit ? 'Advance Payment' : 'Total Due')}
                                            </p>
                                            <p className={`font-semibold ${cardBalanceForApps?.isCredit ? 'text-emerald-600' : totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                KES {Number(cardBalanceForApps?.isCredit ? cardBalanceForApps.creditAmount : totalDue ?? 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    {arrearsText && (
                                        <div className="mb-2 text-xs text-red-600 font-bold bg-red-50 p-1 rounded text-center border border-red-100">
                                            {arrearsText}
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openProfileHub(record.id);
                                            }}
                                            className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded border border-gray-200 transition-colors"
                                        >
                                            View Profile
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {deferredFilteredList.length === 0 && (
                        <div className="col-span-full text-center py-12 text-gray-500">No records found.</div>
                    )}
                </div>
            </div>
            
            {isModalOpen && (
                <ApplicationFormModal 
                    record={selectedRecord} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={handleSave} 
                    properties={properties}
                />
            )}
            <ProfileHubController
                unifiedList={unifiedList}
                canPay={canPay}
                canEdit={canEdit}
                canDelete={canDelete}
                canApprove={canApprove}
                isSuperAdmin={isSuperAdmin}
                onManualPay={setManualPayRecord}
                onStkPay={setStkPayRecord}
                onEdit={handleEdit}
                onMove={handleMoveClick}
                onDelete={handleDelete}
                onApprove={handleApproveApplication}
                onReverseAllocation={handleReverseAllocation}
            />
            
            {moveTenant && (
                <MoveTenantModal 
                    tenant={moveTenant}
                    onClose={() => setMoveTenant(null)}
                    onMove={handleMoveSubmit}
                    properties={properties}
                />
            )}
            {manualPayRecord && (
                <AppRecordPaymentModal
                    record={manualPayRecord}
                    onClose={() => setManualPayRecord(null)}
                    onRecord={(amount, method, reference, date) => {
                        applyPaidState(manualPayRecord, amount, reference, method, date);
                        setManualPayRecord(null);
                    }}
                />
            )}
            {stkPayRecord && (
                <AppMpesaModal
                    record={stkPayRecord}
                    getPaymentUserId={getPaymentUserId}
                    onClose={() => setStkPayRecord(null)}
                    onPaid={(amount, reference) => {
                        applyPaidState(stkPayRecord, amount, reference, 'M-Pesa');
                        setStkPayRecord(null);
                    }}
                />
            )}
        </div>
    );
};

export default Applications;
