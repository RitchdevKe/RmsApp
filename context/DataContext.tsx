
import React, { useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TenantProfile, Property, User, Unit, Task, TenantApplication, StaffProfile, FineRule, OffboardingRecord, GeospatialData, CommissionRule, DataContextType, LandlordApplication, LandlordOffboardingRecord, DeductionRule, Bill, BillItem, Invoice, Vendor, Message, CommunicationTemplate, Workflow, CommunicationAutomationRule, AuditLogEntry, EscalationRule, ExternalTransaction, Overpayment, SystemSettings, PreventiveTask, IncomeSource, Fund, Investment, WithdrawalRequest, RenovationInvestor, RFTransaction, RenovationProjectBill, Notification, Quotation, Role, RolePermissions, ScheduledReport, TaxRecord, MarketplaceListing, Lead, FundiJob, MarketingBannerTemplate } from '../types';
import { GEOSPATIAL_DATA as INITIAL_GEOSPATIAL_DATA } from '../constants';
import { websiteApi } from '../utils/websiteApi';
import { supabase, getSupabaseSession, bustSessionCache } from '../utils/supabaseClient';
import { ensureExistingTenantBackdatedPayments } from '../utils/existingTenantOnboarding';
import { buildStandardTenantPaymentPosting, shouldAutoActivateOnboardedTenant } from '../utils/tenantPaymentPosting';
import { SharedDataContext as DataContext } from './SharedDataContext';
import { isRepurposedUnit } from '../utils/repurposedUnits';
import { isUnitOccupiedByTenant, isUnitSafelyVacant, getUnitVacatingInfo } from '../utils/unitOccupancy';
import { enforceSingleTenantPerUnit } from '../utils/tenantDataIntegrity';
import { fetchAllCompletedPayments, PAYMENTS_QUERY_KEY, DEFAULT_PAYMENT_WINDOW_DAYS } from '../utils/payments';
import { getTodayIsoDate } from '../utils/timezone';

const isSupabaseEnabled = !!supabase;

// ── Batch-settled signal ─────────────────────────────────────────────────────
// Individual queryFns are disabled (enabled: false) until the batch RPC has
// settled. This prevents 38+ fallback queries from firing simultaneously on
// mount. Once the batch resolves or rejects, _setBatchSettled() notifies all
// waiting hooks via React state so they re-render with enabled: true.
// By that time the batch has already populated the cache via setQueryData, so
// the individual queryFns never actually run — React Query sees fresh cache.
let _globalBatchSettled = false;
const _batchSettledListeners = new Set<() => void>();

function _setBatchSettled() {
  if (_globalBatchSettled) return;
  _globalBatchSettled = true;
  _batchSettledListeners.forEach(fn => fn());
  _batchSettledListeners.clear();
}

function _resetBatchSettled() {
  _globalBatchSettled = false;
}

function useBatchSettled(): boolean {
  const [settled, setSettled] = useState(_globalBatchSettled);
  useEffect(() => {
    if (_globalBatchSettled) { setSettled(true); return; }
    const notify = () => setSettled(true);
    _batchSettledListeners.add(notify);
    return () => { _batchSettledListeners.delete(notify); };
  }, []);
  return settled;
}

// Maps each blob key to its individual normalized-table load RPC.
// Used by the fallback queryFn when the primary load_all_app_state() batch fails.
// tm_listings_v12 has no RPC (derived client-side from properties) — fallback returns [].
const BLOB_KEY_TO_RPC: Record<string, string> = {
  tm_tenants_v12:                   'load_tenants',
  tm_properties_v12:                'load_properties',
  tm_landlords_v12:                 'load_landlords',
  tm_staff_v12:                     'load_staff',
  tm_vendors_v12:                   'load_vendors',
  tm_external_transactions_v12:     'load_external_transactions',
  tm_audit_logs_v12:                'load_audit_logs',
  tm_tasks_v12:                     'load_tasks',
  tm_bills_v12:                     'load_bills',
  tm_invoices_v12:                  'load_invoices',
  tm_fines_v12:                     'load_fine_rules',
  tm_overpayments_v12:              'load_overpayments',
  tm_quotations_v12:                'load_quotations',
  tm_landlord_applications_v12:     'load_landlord_applications',
  tm_applications_v12:              'load_tenant_applications',
  tm_offboarding_v12:               'load_offboarding_records',
  tm_landlord_offboarding_v12:      'load_landlord_offboarding_records',
  tm_commissions_v12:               'load_commission_rules',
  tm_deductions_v12:                'load_deduction_rules',
  tm_income_sources_v12:            'load_income_sources',
  tm_preventive_tasks_v12:          'load_preventive_tasks',
  tm_funds_v12:                     'load_funds',
  tm_investments_v12:               'load_investments',
  tm_withdrawals_v12:               'load_withdrawal_requests',
  tm_renovation_investors_v12:      'load_renovation_investors',
  tm_rf_transactions_v12:           'load_rf_transactions',
  tm_renovation_project_bills_v12:  'load_renovation_project_bills',
  tm_messages_v12:                  'load_messages',
  tm_notifications_v12:             'load_notifications',
  tm_templates_v12:                 'load_communication_templates',
  tm_workflows_v12:                 'load_workflows',
  tm_automation_rules_v12:          'load_automation_rules',
  tm_escalation_rules_v12:          'load_escalation_rules',
  tm_scheduled_reports_v12:         'load_scheduled_reports',
  tm_tax_records_v12:               'load_tax_records',
  tm_leads_v12:                     'load_leads',
  tm_fundi_jobs_v12:                'load_fundi_jobs',
  tm_marketing_banners_v12:         'load_marketing_banners',
  tm_system_settings_v12:           'load_system_settings',
  tm_geospatial_v12:                'load_geospatial_data',
};

// ── Payment → tenant merge (single source of truth) ──────────────────────────
// public.payments.matched_tenant_id is the durable link between a receipt and a
// tenant (house unit). Once a payment carries that id it must ALWAYS render on
// that tenant, so we fold the payments table into every tenant list BEFORE the
// list is published to the UI. This removes the old "tenant paints unpaid, then
// payments pop in a few seconds later" flash.
export function mergePaymentsIntoTenantList<T extends { id: string; paymentHistory?: any[] }>(
  tenantList: T[],
  dbPayments: any[],
): T[] {
  if (!Array.isArray(tenantList) || tenantList.length === 0) return tenantList;
  if (!Array.isArray(dbPayments) || dbPayments.length === 0) return tenantList;

  const byTenant = new Map<string, any[]>();
  for (const p of dbPayments) {
    if (!p?.matched_tenant_id) continue;
    if (String(p.status || 'completed') !== 'completed') continue;
    const list = byTenant.get(p.matched_tenant_id);
    if (list) list.push(p); else byTenant.set(p.matched_tenant_id, [p]);
  }
  if (byTenant.size === 0) return tenantList;

  let changed = false;
  const next = tenantList.map(t => {
    const mine = byTenant.get(t.id);
    if (!mine || mine.length === 0) return t;

    let updated: any = t;
    const existingRefs = new Set(
      (t.paymentHistory || [])
        .map((p: any) => String(p?.reference || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const sorted = [...mine].sort(
      (a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime(),
    );

    let added = false;
    for (const p of sorted) {
      const ref = String(p.transaction_id || p.checkout_request_id || p.id || '').trim();
      if (!ref || existingRefs.has(ref.toLowerCase())) continue;
      const method =
        p.source === 'c2b' ? 'M-Pesa (C2B)'
        : p.source === 'stk' ? 'M-Pesa (STK)'
        : p.source === 'manual' ? (p.result_desc || 'Manual')
        : 'M-Pesa';
      const posting = buildStandardTenantPaymentPosting(
        updated,
        Number(p.amount ?? 0),
        String(p.created_at || '').split('T')[0],
        method,
        ref,
      );
      updated = { ...updated, ...posting.updates };
      existingRefs.add(ref.toLowerCase());
      added = true;
    }

    if (!added) return t;
    changed = true;
    return updated as T;
  });

  return changed ? next : tenantList;
}

// Critical-path keys: fetched in parallel at startup, before anything else.
// Tenants + properties are here (not in the background queue) because every
// primary screen — dashboard, tenants, payments — depends on them.
const STAGE1_KEYS = [
  'tm_system_settings_v12',
  'tm_notifications_v12',
  'tm_staff_v12',
  'tm_geospatial_v12',
  'tm_marketing_banners_v12',
  'tm_scheduled_reports_v12',
  'tm_tenants_v12',
  'tm_properties_v12',
];

function useSupabaseBackedState<T>(

  emptyValue: T,
  key: string,
  options?: { skipPersist?: boolean }
): [T, React.Dispatch<React.SetStateAction<T>>, { loading: boolean; error: string | null }] {
  const [value, setValue] = useState<T>(() => {
    if (options?.skipPersist) return emptyValue;
    try {
      const cached = localStorage.getItem('taskme_cache_' + key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (e) {
      console.warn('Error reading cache for ' + key, e);
    }
    return emptyValue;
  });
  const queryClient = useQueryClient();
  const batchSettled = useBatchSettled();
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // enabled: batchSettled — individual queries are disabled until the batch RPC
  // has had a chance to populate the cache. If the batch succeeds (the common
  // path) these queryFns never run. If the batch fails they run as fallback.
  //
  // staleTime: Infinity means once data is in cache (from batch or a prior
  // individual fetch), this queryFn is never called again on that session.
  const {
    data: fetchedValue,
    isLoading,
    error,
  } = useQuery<T>({
    queryKey: ['full_app_state', key],
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    // skipPersist keys are auto-derived in-memory (e.g. marketplaceListings).
    // Running the query returns emptyValue and races with the derivation effect,
    // wiping the auto-generated state. Disable the query for these keys.
    enabled: batchSettled && !options?.skipPersist,
    queryFn: async () => {
      const session = await getSupabaseSession();
      if (!session) throw new Error('SESSION_EXPIRED');
      const rpcName = BLOB_KEY_TO_RPC[key];
      if (!rpcName) {
        console.log('[Supabase] fallback load (no RPC for key, returning empty)', { key });
        return emptyValue;
      }
      console.log('[Supabase] normalized fallback load (batch miss)', { key, rpcName });
      const { data, error } = await supabase.schema('app').rpc(rpcName);
      if (error) throw error;
      return (data ?? emptyValue) as T;
    },
  });

  useEffect(() => {
    // skipPersist keys are auto-derived in-memory (e.g. marketplaceListings).
    // Never let the query cache override them — the derivation effect owns state.
    if (fetchedValue !== undefined && !options?.skipPersist) {
      setValue(fetchedValue);
      try {
        localStorage.setItem('taskme_cache_' + key, JSON.stringify(fetchedValue));
      } catch (e) {
        // ignore
      }
    }
  }, [fetchedValue]);  // options?.skipPersist is stable (constant at call site)

  const upsertMutation = useMutation({
    mutationFn: async (next: T) => {
      // All blobs are now in normalized tables with dual-write wrappers.
      // Blob writes are globally disabled — normalized table RPCs handle persistence.
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['full_app_state', key], next);
      queryClient.setQueryData<Record<string, unknown>>(['full_all_app_state'], (old) => {
        if (!old) return old;
        return { ...old, [key]: next };
      });
    },
  });

  const persistAndSetValue: React.Dispatch<React.SetStateAction<T>> = (updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : (updater as any);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { upsertMutation.mutate(next); }, 1200);
      return next;
    });
  };

  // skipPersist keys are pure in-memory derived state (e.g. marketplaceListings).
  // Returning raw setValue avoids the debounce/mutation/setQueryData chain, which
  // would cause the batch distribution useEffect to re-run and fight with the
  // derivation effect that owns this state.
  return [value, options?.skipPersist ? setValue : persistAndSetValue, { loading: isLoading, error: (error as any)?.message ?? null }];
}

// ── Session persistence helpers ─────────────────────────────────────────────
// Stores the logged-in user in localStorage so a page refresh within the TTL
// window does not kick the user back to the login screen.
const SESSION_CACHE_KEY = 'taskme_session_cache';
const SESSION_TTL_MS    = 24 * 60 * 60 * 1000; // 24 hours

function getInitialUser(): User | StaffProfile | TenantProfile | null {
    try {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { user: unknown; storedAt: number };
        if (!parsed?.user || typeof parsed.storedAt !== 'number') return null;
        if (Date.now() - parsed.storedAt > SESSION_TTL_MS) {
            localStorage.removeItem(SESSION_CACHE_KEY);
            return null;
        }
        return parsed.user as User | StaffProfile | TenantProfile;
    } catch {
        return null;
    }
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // ── Session gate — prevents batch/individual queries before login ─────────
    const [hasSession, setHasSession] = React.useState(false);
    React.useEffect(() => {
      getSupabaseSession().then(s => setHasSession(!!s));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setHasSession(!!session);
        if (!session) _resetBatchSettled();
      });
      return () => subscription.unsubscribe();
    }, []);

    // Current User — lazy-initialised from localStorage so refresh is seamless.
    const [currentUser, setCurrentUser] = useState<User | StaffProfile | TenantProfile | null>(getInitialUser);

    // Verify the Supabase session on mount; clear cache if expired or user mismatch.
    React.useEffect(() => {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        if (!raw) return;
        try {
            const { user } = JSON.parse(raw) as { user: { id?: string } };
            if (!user?.id) { localStorage.removeItem(SESSION_CACHE_KEY); return; }
            getSupabaseSession().then(session => {
                if (!session || (session.user?.id !== (user as any).id && session.user?.email?.toLowerCase() !== (user as any).email?.toLowerCase())) {
                    localStorage.removeItem(SESSION_CACHE_KEY);
                    setCurrentUser(null);
                }
            }).catch(() => {});
        } catch {
            localStorage.removeItem(SESSION_CACHE_KEY);
        }
    }, []);

    // Persist currentUser to localStorage on every change (refreshes the TTL).
    React.useEffect(() => {
        if (currentUser) {
            try {
                localStorage.setItem(
                    SESSION_CACHE_KEY,
                    JSON.stringify({ user: currentUser, storedAt: Date.now() }),
                );
            } catch { /* localStorage unavailable — ignore */ }
        }
    }, [currentUser]);

    // Core Data (start empty; Supabase becomes source of truth)
    const [tenants, _rawSetTenants, tenantsStatus] = useSupabaseBackedState<TenantProfile[]>([], 'tm_tenants_v12');
    // Wrapped setter: persists to the app_state blob (via _rawSetTenants) AND
    // dual-writes to public.tenants (via app.upsert_tenants_bulk) so that
    // backend RPCs like check_phone_unique and record_c2b_payment's tenant
    // resolver have a normalized source of truth. See migration 0029.
    const _tenantsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedTenants = React.useRef<TenantProfile[]>([]);
    // Serialize normalized-table writes. Previously a slow older bulk upsert
    // could finish after a newer one and restore the old status/rent/allocation.
    const _tenantWriteChain = React.useRef<Promise<void>>(Promise.resolve());
    // Ids that have been permanently deleted this session. Nothing may write
    // them back — not a pending debounced upsert, not the rehydrate-from-
    // applications effect. Without this a queued write fired after the delete
    // silently re-inserted the row (tenants "coming back" after deletion).
    const _deletedTenantIds = React.useRef<Set<string>>(new Set());
    const _flushTenantsRef = React.useRef<() => void>(() => {});
    // Flush any queued tenant write immediately when the tab is hidden or
    // closed, so a vacate/evict/move performed just before navigating away is
    // never lost (which made the change appear to "revert" on next load).
    React.useEffect(() => {
        const flush = () => { try { _flushTenantsRef.current(); } catch { /* noop */ } };
        const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('beforeunload', flush);
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
    const setTenants: React.Dispatch<React.SetStateAction<TenantProfile[]>> = React.useCallback((updater) => {
      _rawSetTenants(prev => {
        const rawNext = typeof updater === 'function' ? (updater as (p: TenantProfile[]) => TenantProfile[])(prev) : updater;
        const next = enforceSingleTenantPerUnit(rawNext).filter(t => !_deletedTenantIds.current.has(t.id));
        if (Array.isArray(next)) {
          const prevById = new Map<string, TenantProfile>(prev.map(t => [t.id, t]));
          const changed = next.filter(t => {
            const p = prevById.get(t.id);
            // Reference inequality is sufficient: React immutable update patterns
            // always allocate a new object for mutated tenants and preserve the
            // original reference for untouched ones — no need for JSON.stringify.
            return !p || p !== t;
          });
          if (changed.length > 0) {
            _pendingChangedTenants.current = [
              ..._pendingChangedTenants.current.filter(t => !changed.some((c: TenantProfile) => c.id === t.id)),
              ...changed,
            ];
            if (_tenantsUpsertTimer.current) clearTimeout(_tenantsUpsertTimer.current);
            const doWrite = () => {
              _tenantWriteChain.current = _tenantWriteChain.current.then(async () => {
                const toWrite = _pendingChangedTenants.current.filter(t => !_deletedTenantIds.current.has(t.id));
                if (toWrite.length === 0) return;
                _pendingChangedTenants.current = [];
                try {
                // Persist the FULL tenant record (including notes, notices,
                // requests, maintenanceRequests, collectionHistory) so any edit
                // made in the UI survives reload. Previously these arrays were
                // stripped to keep payloads small, which caused edits to revert.
                  const { error } = await supabase.schema('app').rpc('upsert_tenants_bulk', { p_tenants: toWrite as unknown as object });
                  if (error) throw error;

                // ── Payment-history reconciliation ─────────────────────────
                // C2B / STK callbacks append rows to public.tenants.payment_history
                // server-side. Our debounced bulk-upsert can ship a stale
                // paymentHistory array that (depending on the RPC version)
                // may overwrite those server-appended entries. To guarantee
                // the tenant profile always shows every receipt, re-fetch
                // payment_history for the tenants we just wrote and merge
                // any server-only entries back into local state.
                try {
                  const ids = toWrite.map(t => t.id).filter(Boolean);
                  if (ids.length > 0) {
                    const { data: rows } = await supabase
                      .from('tenants')
                      .select('id, payment_history')
                      .in('id', ids);
                    if (Array.isArray(rows) && rows.length > 0) {
                      _rawSetTenants(prev => prev.map(t => {
                        const row = rows.find((r: any) => r.id === t.id);
                        if (!row) return t;
                        const serverHistory: any[] = Array.isArray(row.payment_history) ? row.payment_history : [];
                        const localHistory: any[] = Array.isArray(t.paymentHistory) ? t.paymentHistory : [];
                        const isSynthetic = (p: any) => {
                          const ref = String(p?.reference || '').trim().toUpperCase();
                          const method = String(p?.method || '').trim();
                          const status = String(p?.status || '').trim();
                          return ref.startsWith('MULTI-') || method === 'Multi-Occupancy Allocation' || status === 'Multi-Occupancy Allocation';
                        };
                        const cleanServerHistory = serverHistory.filter(p => !isSynthetic(p));
                        const cleanLocalHistory = localHistory.filter(p => !isSynthetic(p));
                        const localRefs = new Set(cleanLocalHistory.map(p => String(p?.reference || '').trim()).filter(Boolean));
                        const serverOnly = cleanServerHistory.filter(p => {
                          const ref = String(p?.reference || '').trim();
                          return ref && !localRefs.has(ref);
                        });
                        return { ...t, paymentHistory: [...serverOnly, ...cleanLocalHistory] };
                      }));
                    }
                  }
                } catch (e) {
                  console.warn('[tenants] payment_history reconcile failed:', (e as Error)?.message);
                }
                } catch (e) {
                  // Keep the newest version of each failed record queued and
                  // retry; never silently discard a user edit.
                  const queuedIds = new Set(_pendingChangedTenants.current.map(t => t.id));
                  _pendingChangedTenants.current = [
                    ...toWrite.filter(t => !queuedIds.has(t.id) && !_deletedTenantIds.current.has(t.id)),
                    ..._pendingChangedTenants.current,
                  ];
                  console.warn('[tenants] upsert_tenants_bulk error:', (e as Error)?.message);
                  if (_tenantsUpsertTimer.current) clearTimeout(_tenantsUpsertTimer.current);
                  _tenantsUpsertTimer.current = setTimeout(doWrite, 1500);
                }
              }).catch(e => console.warn('[tenants] serialized write error:', (e as Error)?.message));
            };
            _flushTenantsRef.current = () => {
              if (_tenantsUpsertTimer.current) clearTimeout(_tenantsUpsertTimer.current);
              _tenantsUpsertTimer.current = null;
              if (_pendingChangedTenants.current.length > 0) doWrite();
            };
            _tenantsUpsertTimer.current = setTimeout(doWrite, 250);
          }
        }
        return next;
      });
    }, [_rawSetTenants]);

    const _unitIntegrityCleaned = React.useRef(false);
    React.useEffect(() => {
        if (_unitIntegrityCleaned.current || tenants.length === 0) return;
        const cleaned = enforceSingleTenantPerUnit(tenants);
        if (cleaned !== tenants) {
            _unitIntegrityCleaned.current = true;
            setTenants(cleaned);
        }
    }, [tenants, setTenants]);

    // Onboarding activation sweep: tenants who have fully paid their
    // onboarding month rent + deposit must read as Active, including those
    // whose rent start date falls in a future month (nothing is invoiced for
    // the current month, so the payment-time activation check never fires).
    const _activationSweepDone = React.useRef(false);
    React.useEffect(() => {
        if (_activationSweepDone.current || tenants.length === 0) return;
        const today = getTodayIsoDate();
        let changed = false;
        const next = tenants.map(t => {
            if (!shouldAutoActivateOnboardedTenant(t)) return t;
            changed = true;
            return { ...t, status: 'Active' as const, activationDate: (t as any).activationDate || today };
        });
        _activationSweepDone.current = true;
        if (changed) setTenants(next);
    }, [tenants, setTenants]);



    // Automated Purger: Permanently remove synthetic multi-occupancy payments everywhere and sync paymentHistory with inbound payments table
    const _multiPurgeDone = React.useRef(false);
    React.useEffect(() => {
        if (_multiPurgeDone.current || tenants.length === 0) return;

        (async () => {
            // Defer this maintenance sweep so it never blocks first paint /
            // login. It only repairs historical data, so a few seconds of
            // delay is harmless.
            await new Promise<void>(resolve => {
                const w = window as any;
                if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve(), { timeout: 8000 });
                else setTimeout(() => resolve(), 4000);
            });
            try {
                // Reuse the payments already fetched on the critical path —
                // a second full pass here was doubling startup Disk-IO.
                let inboundData: any[] =
                    (queryClient.getQueryData([PAYMENTS_QUERY_KEY, DEFAULT_PAYMENT_WINDOW_DAYS]) as any[]) || [];
                if (inboundData.length === 0) {
                    try {
                        inboundData = await fetchAllCompletedPayments(DEFAULT_PAYMENT_WINDOW_DAYS);
                    } catch { /* fallback */ }
                }


                const referenceMap = new Map<string, number>();
                referenceMap.set('UDJ8M1FM0E', 1500);
                referenceMap.set('UE68M3AINE', 700);

                if (inboundData && Array.isArray(inboundData)) {
                    for (const row of inboundData) {
                        const amt = Number(row.amount || 0);
                        if (amt > 0) {
                            if (row.transaction_id) referenceMap.set(String(row.transaction_id).trim().toUpperCase(), amt);
                            if (row.checkout_request_id) referenceMap.set(String(row.checkout_request_id).trim().toUpperCase(), amt);
                        }
                    }
                }

                let dirty = false;
                const cleanedTenants = tenants.map(t => {
                    const history = t.paymentHistory || [];
                    if (t.occupancyType === 'Sub') {
                        if (history.length > 0) {
                            dirty = true;
                            return { ...t, paymentHistory: [] };
                        }
                        return t;
                    }

                    let historyChanged = false;
                    const cleanHistory = history
                        .filter((p: any) => {
                            const ref = String(p?.reference || '').trim().toUpperCase();
                            const method = String(p?.method || '').trim();
                            const status = String(p?.status || '').trim();
                            return !ref.startsWith('MULTI-') && method !== 'Multi-Occupancy Allocation' && status !== 'Multi-Occupancy Allocation';
                        })
                        .map((p: any) => {
                            const ref = String(p?.reference || '').trim().toUpperCase();
                            if (referenceMap.has(ref)) {
                                const exactAmt = referenceMap.get(ref)!;
                                const expectedStr = `KES ${exactAmt.toLocaleString()}`;
                                if (p.amount !== expectedStr) {
                                    historyChanged = true;
                                    return { ...p, amount: expectedStr, rawAmount: exactAmt };
                                }
                            }
                            return p;
                        });

                    if (cleanHistory.length !== history.length || historyChanged) {
                        dirty = true;
                        return { ...t, paymentHistory: cleanHistory };
                    }
                    return t;
                });

                if (dirty) {
                    _multiPurgeDone.current = true;
                    _rawSetTenants(cleanedTenants);

                    await supabase.from('payments')
                        .delete()
                        .or('transaction_id.ilike.MULTI-%,status.eq.Multi-Occupancy Allocation,checkout_request_id.eq.Multi-occupancy sub allocation');

                    for (const t of cleanedTenants) {
                        const orig = tenants.find(x => x.id === t.id);
                        if (orig && orig.paymentHistory !== t.paymentHistory) {
                            await supabase.from('tenants')
                                .update({ payment_history: t.paymentHistory })
                                .eq('id', t.id);
                        }
                    }
                } else {
                    _multiPurgeDone.current = true;
                }
            } catch (e) {
                console.warn('[DataContext] Purging synthetic multi payments error:', e);
            }
        })();
    }, [tenants, _rawSetTenants]);

    // ── One-time migration: grace period 5 → 4 days ──────────────────────────
    const _graceMigrated = React.useRef(false);
    React.useEffect(() => {
        if (_graceMigrated.current || tenants.length === 0) return;
        if (localStorage.getItem('taskme_grace_migrated_v4')) { _graceMigrated.current = true; return; }
        _graceMigrated.current = true;
        const affected = tenants.filter(t => t.rentGraceDays === 5);
        if (affected.length > 0) {
            setTenants(prev => prev.map(t => t.rentGraceDays === 5 ? { ...t, rentGraceDays: 4 } : t));
            console.log(`[migration] grace 5→4: updated ${affected.length} tenant(s)`);
        }
        localStorage.setItem('taskme_grace_migrated_v4', '1');
    }, [tenants, setTenants]);
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────


    // ── Global real-time completed payments synchronizer ─────────────────────
    React.useEffect(() => {
        if (!hasSession || tenantsStatus.loading || tenants.length === 0) return;

        let active = true;

        const mergeDbPaymentsIntoTenants = (dbPaymentsList: any[]) => {
            if (!Array.isArray(dbPaymentsList) || dbPaymentsList.length === 0) return;
            setTenants(prev => mergePaymentsIntoTenantList(prev, dbPaymentsList));
        };

        // The full payments set is already folded in during the critical-path
        // load, so we only re-apply what is in cache (cheap, no network) as a
        // safety net and then rely on realtime for anything new.
        const cached = (queryClient.getQueryData([PAYMENTS_QUERY_KEY, DEFAULT_PAYMENT_WINDOW_DAYS]) as any[]) || [];
        if (cached.length > 0) mergeDbPaymentsIntoTenants(cached);


        // 2. Real-time subscription for instant payment linking
        const channel = supabase
            .channel('global_payments_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'payments' },
                (payload) => {
                    if (!active) return;
                    const p = payload.new as any;
                    if (p && p.status === 'completed' && p.matched_tenant_id) {
                        mergeDbPaymentsIntoTenants([p]);
                    }
                }
            )
            .subscribe();

        return () => {
            active = false;
            channel.unsubscribe();
        };
    }, [hasSession, tenantsStatus.loading, tenants.length === 0]);

    const [properties, _rawSetProperties, propertiesStatus] = useSupabaseBackedState<Property[]>([], 'tm_properties_v12');
    const _propertiesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedProperties = React.useRef<Property[]>([]);
    const _flushPropertiesRef = React.useRef<() => void>(() => {});
    React.useEffect(() => {
      const flush = () => { try { _flushPropertiesRef.current(); } catch { /* noop */ } };
      const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
      window.addEventListener('beforeunload', flush);
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('beforeunload', flush);
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }, []);
    const setProperties: React.Dispatch<React.SetStateAction<Property[]>> = React.useCallback((updater) => {
      _rawSetProperties(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Property[]) => Property[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Property>(prev.map(p => [p.id, p]));
          const changed = next.filter(p => { const q = prevById.get(p.id); return !q || q !== p; });
          if (changed.length > 0) {
            _pendingChangedProperties.current = [
              ..._pendingChangedProperties.current.filter(p => !changed.some((c: Property) => c.id === p.id)),
              ...changed,
            ];
            if (_propertiesUpsertTimer.current) clearTimeout(_propertiesUpsertTimer.current);
            const doWrite = async () => {
              const toWrite = _pendingChangedProperties.current;
              _pendingChangedProperties.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_properties_bulk', { p_properties: toWrite as unknown as object });
                if (error) console.warn('[properties] upsert_properties_bulk failed:', error.message);
              } catch (e) {
                console.warn('[properties] upsert_properties_bulk error:', (e as Error)?.message);
              }
            };
            _flushPropertiesRef.current = () => {
              if (_propertiesUpsertTimer.current) clearTimeout(_propertiesUpsertTimer.current);
              _propertiesUpsertTimer.current = null;
              if (_pendingChangedProperties.current.length > 0) void doWrite();
            };
            _propertiesUpsertTimer.current = setTimeout(doWrite, 500);
          }
        }
        return next;
      });
    }, [_rawSetProperties]);
    const [landlords, _rawSetLandlords, landlordsStatus] = useSupabaseBackedState<User[]>([], 'tm_landlords_v12');
    const _landlordsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedLandlords = React.useRef<User[]>([]);
    const setLandlords: React.Dispatch<React.SetStateAction<User[]>> = React.useCallback((updater) => {
      _rawSetLandlords(prev => {
        const next = typeof updater === 'function' ? (updater as (p: User[]) => User[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, User>(prev.map(u => [u.id, u]));
          const changed = next.filter(u => { const q = prevById.get(u.id); return !q || q !== u; });
          if (changed.length > 0) {
            _pendingChangedLandlords.current = [
              ..._pendingChangedLandlords.current.filter(u => !changed.some((c: User) => c.id === u.id)),
              ...changed,
            ];
            if (_landlordsUpsertTimer.current) clearTimeout(_landlordsUpsertTimer.current);
            _landlordsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedLandlords.current;
              _pendingChangedLandlords.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_landlords_bulk', { p_landlords: toWrite as unknown as object });
                if (error) console.warn('[landlords] upsert_landlords_bulk failed:', error.message);
              } catch (e) {
                console.warn('[landlords] upsert_landlords_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetLandlords]);
    const [tasks, _rawSetTasks, tasksStatus] = useSupabaseBackedState<Task[]>([], 'tm_tasks_v12');
    const _tasksUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedTasks = React.useRef<Task[]>([]);
    const setTasks: React.Dispatch<React.SetStateAction<Task[]>> = React.useCallback((updater) => {
      _rawSetTasks(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Task[]) => Task[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Task>(prev.map(t => [t.id, t]));
          const changed = next.filter(t => { const q = prevById.get(t.id); return !q || q !== t; });
          if (changed.length > 0) {
            _pendingChangedTasks.current = [
              ..._pendingChangedTasks.current.filter(t => !changed.some((c: Task) => c.id === t.id)),
              ...changed,
            ];
            if (_tasksUpsertTimer.current) clearTimeout(_tasksUpsertTimer.current);
            _tasksUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedTasks.current;
              _pendingChangedTasks.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_tasks_bulk', { p_tasks: toWrite as unknown as object });
                if (error) console.warn('[tasks] upsert_tasks_bulk failed:', error.message);
              } catch (e) {
                console.warn('[tasks] upsert_tasks_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetTasks]);
    const [bills, _rawSetBills, billsStatus] = useSupabaseBackedState<Bill[]>([], 'tm_bills_v12');
    const _billsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedBills = React.useRef<Bill[]>([]);
    const setBills: React.Dispatch<React.SetStateAction<Bill[]>> = React.useCallback((updater) => {
      _rawSetBills(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Bill[]) => Bill[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Bill>(prev.map(b => [b.id, b]));
          const changed = next.filter(b => { const q = prevById.get(b.id); return !q || q !== b; });
          if (changed.length > 0) {
            _pendingChangedBills.current = [
              ..._pendingChangedBills.current.filter(b => !changed.some((c: Bill) => c.id === b.id)),
              ...changed,
            ];
            if (_billsUpsertTimer.current) clearTimeout(_billsUpsertTimer.current);
            _billsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedBills.current;
              _pendingChangedBills.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_bills_bulk', { p_bills: toWrite as unknown as object });
                if (error) console.warn('[bills] upsert_bills_bulk failed:', error.message);
              } catch (e) {
                console.warn('[bills] upsert_bills_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetBills]);
    const [invoices, _rawSetInvoices, invoicesStatus] = useSupabaseBackedState<Invoice[]>([], 'tm_invoices_v12');
    const _invoicesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedInvoices = React.useRef<Invoice[]>([]);
    const setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>> = React.useCallback((updater) => {
      _rawSetInvoices(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Invoice[]) => Invoice[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Invoice>(prev.map(i => [i.id, i]));
          const changed = next.filter(i => { const q = prevById.get(i.id); return !q || q !== i; });
          if (changed.length > 0) {
            _pendingChangedInvoices.current = [
              ..._pendingChangedInvoices.current.filter(i => !changed.some((c: Invoice) => c.id === i.id)),
              ...changed,
            ];
            if (_invoicesUpsertTimer.current) clearTimeout(_invoicesUpsertTimer.current);
            _invoicesUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedInvoices.current;
              _pendingChangedInvoices.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_invoices_bulk', { p_invoices: toWrite as unknown as object });
                if (error) console.warn('[invoices] upsert_invoices_bulk failed:', error.message);
              } catch (e) {
                console.warn('[invoices] upsert_invoices_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetInvoices]);
    const [quotations, _rawSetQuotations, quotationsStatus] = useSupabaseBackedState<Quotation[]>([], 'tm_quotations_v12');
    const _quotationsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedQuotations = React.useRef<Quotation[]>([]);
    const setQuotations: React.Dispatch<React.SetStateAction<Quotation[]>> = React.useCallback((updater) => {
      _rawSetQuotations(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Quotation[]) => Quotation[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Quotation>(prev.map(q => [q.id, q]));
          const changed = next.filter(q => { const r = prevById.get(q.id); return !r || r !== q; });
          if (changed.length > 0) {
            _pendingChangedQuotations.current = [
              ..._pendingChangedQuotations.current.filter(q => !changed.some((c: Quotation) => c.id === q.id)),
              ...changed,
            ];
            if (_quotationsUpsertTimer.current) clearTimeout(_quotationsUpsertTimer.current);
            _quotationsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedQuotations.current;
              _pendingChangedQuotations.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_quotations_bulk', { p_quotations: toWrite as unknown as object });
                if (error) console.warn('[quotations] upsert_quotations_bulk failed:', error.message);
              } catch (e) {
                console.warn('[quotations] upsert_quotations_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetQuotations]); 
    const [applications, _rawSetApplications, applicationsStatus] = useSupabaseBackedState<TenantApplication[]>([], 'tm_applications_v12');
    const _applicationsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedApplications = React.useRef<TenantApplication[]>([]);
    const setApplications: React.Dispatch<React.SetStateAction<TenantApplication[]>> = React.useCallback((updater) => {
      _rawSetApplications(prev => {
        const next = typeof updater === 'function' ? (updater as (p: TenantApplication[]) => TenantApplication[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, TenantApplication>(prev.map(a => [a.id, a]));
          const changed = next.filter(a => { const q = prevById.get(a.id); return !q || q !== a; });
          if (changed.length > 0) {
            _pendingChangedApplications.current = [
              ..._pendingChangedApplications.current.filter(a => !changed.some((c: TenantApplication) => c.id === a.id)),
              ...changed,
            ];
            if (_applicationsUpsertTimer.current) clearTimeout(_applicationsUpsertTimer.current);
            _applicationsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedApplications.current;
              _pendingChangedApplications.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_tenant_applications_bulk', { p_apps: toWrite as unknown as object });
                if (error) console.warn('[applications] upsert_tenant_applications_bulk failed:', error.message);
              } catch (e) {
                console.warn('[applications] upsert_tenant_applications_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetApplications]);
    const [landlordApplications, _rawSetLandlordApplications, landlordApplicationsStatus] = useSupabaseBackedState<LandlordApplication[]>([], 'tm_landlord_applications_v12');
    const _landlordAppsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedLandlordApps = React.useRef<LandlordApplication[]>([]);
    const setLandlordApplications: React.Dispatch<React.SetStateAction<LandlordApplication[]>> = React.useCallback((updater) => {
      _rawSetLandlordApplications(prev => {
        const next = typeof updater === 'function' ? (updater as (p: LandlordApplication[]) => LandlordApplication[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, LandlordApplication>(prev.map(a => [a.id, a]));
          const changed = next.filter(a => { const q = prevById.get(a.id); return !q || q !== a; });
          if (changed.length > 0) {
            _pendingChangedLandlordApps.current = [
              ..._pendingChangedLandlordApps.current.filter(a => !changed.some((c: LandlordApplication) => c.id === a.id)),
              ...changed,
            ];
            if (_landlordAppsUpsertTimer.current) clearTimeout(_landlordAppsUpsertTimer.current);
            _landlordAppsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedLandlordApps.current;
              _pendingChangedLandlordApps.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_landlord_applications_bulk', { p_apps: toWrite as unknown as object });
                if (error) console.warn('[landlord_apps] upsert_landlord_applications_bulk failed:', error.message);
              } catch (e) {
                console.warn('[landlord_apps] upsert_landlord_applications_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetLandlordApplications]);
    const [staff, _rawSetStaff, staffStatus] = useSupabaseBackedState<StaffProfile[]>([], 'tm_staff_v12');
    const _staffUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedStaff = React.useRef<StaffProfile[]>([]);
    const setStaff: React.Dispatch<React.SetStateAction<StaffProfile[]>> = React.useCallback((updater) => {
      _rawSetStaff(prev => {
        const next = typeof updater === 'function' ? (updater as (p: StaffProfile[]) => StaffProfile[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, StaffProfile>(prev.map(s => [s.id, s]));
          const changed = next.filter(s => { const q = prevById.get(s.id); return !q || q !== s; });
          if (changed.length > 0) {
            _pendingChangedStaff.current = [
              ..._pendingChangedStaff.current.filter(s => !changed.some((c: StaffProfile) => c.id === s.id)),
              ...changed,
            ];
            if (_staffUpsertTimer.current) clearTimeout(_staffUpsertTimer.current);
            _staffUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedStaff.current;
              _pendingChangedStaff.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_staff_bulk', { p_staff: toWrite as unknown as object });
                if (error) console.warn('[staff] upsert_staff_bulk failed:', error.message);
              } catch (e) {
                console.warn('[staff] upsert_staff_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetStaff]);
    const [fines, _rawSetFines, finesStatus] = useSupabaseBackedState<FineRule[]>([], 'tm_fines_v12');
    const _finesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedFines = React.useRef<FineRule[]>([]);
    const setFines: React.Dispatch<React.SetStateAction<FineRule[]>> = React.useCallback((updater) => {
      _rawSetFines(prev => {
        const next = typeof updater === 'function' ? (updater as (p: FineRule[]) => FineRule[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, FineRule>(prev.map(f => [f.id, f]));
          const changed = next.filter(f => { const q = prevById.get(f.id); return !q || q !== f; });
          if (changed.length > 0) {
            _pendingChangedFines.current = [
              ..._pendingChangedFines.current.filter(f => !changed.some((c: FineRule) => c.id === f.id)),
              ...changed,
            ];
            if (_finesUpsertTimer.current) clearTimeout(_finesUpsertTimer.current);
            _finesUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedFines.current;
              _pendingChangedFines.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_fine_rules_bulk', { p_fines: toWrite as unknown as object });
                if (error) console.warn('[fines] upsert_fine_rules_bulk failed:', error.message);
              } catch (e) {
                console.warn('[fines] upsert_fine_rules_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetFines]); 

    // ── Fines & Penalties are manually managed. No auto-seeding or hardcoded rules.
    //    (Removed prior Lock Fee auto-seed so deleted rules stay deleted.)

    const [offboardingRecords, _rawSetOffboardingRecords, offboardingStatus] = useSupabaseBackedState<OffboardingRecord[]>([], 'tm_offboarding_v12');
    const _offboardingUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedOffboarding = React.useRef<OffboardingRecord[]>([]);
    const setOffboardingRecords: React.Dispatch<React.SetStateAction<OffboardingRecord[]>> = React.useCallback((updater) => {
      _rawSetOffboardingRecords(prev => {
        const next = typeof updater === 'function' ? (updater as (p: OffboardingRecord[]) => OffboardingRecord[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, OffboardingRecord>(prev.map(o => [o.id, o]));
          const changed = next.filter(o => { const q = prevById.get(o.id); return !q || q !== o; });
          if (changed.length > 0) {
            _pendingChangedOffboarding.current = [
              ..._pendingChangedOffboarding.current.filter(o => !changed.some((c: OffboardingRecord) => c.id === o.id)),
              ...changed,
            ];
            if (_offboardingUpsertTimer.current) clearTimeout(_offboardingUpsertTimer.current);
            _offboardingUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedOffboarding.current;
              _pendingChangedOffboarding.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_offboarding_records_bulk', { p_records: toWrite as unknown as object });
                if (error) console.warn('[offboarding] upsert_offboarding_records_bulk failed:', error.message);
              } catch (e) {
                console.warn('[offboarding] upsert_offboarding_records_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetOffboardingRecords]);
    const [landlordOffboardingRecords, _rawSetLandlordOffboarding, landlordOffboardingStatus] = useSupabaseBackedState<LandlordOffboardingRecord[]>([], 'tm_landlord_offboarding_v12');
    const _llOffboardingUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedLlOffboarding = React.useRef<LandlordOffboardingRecord[]>([]);
    const setLandlordOffboardingRecords: React.Dispatch<React.SetStateAction<LandlordOffboardingRecord[]>> = React.useCallback((updater) => {
      _rawSetLandlordOffboarding(prev => {
        const next = typeof updater === 'function' ? (updater as (p: LandlordOffboardingRecord[]) => LandlordOffboardingRecord[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, LandlordOffboardingRecord>(prev.map(o => [o.id, o]));
          const changed = next.filter(o => { const q = prevById.get(o.id); return !q || q !== o; });
          if (changed.length > 0) {
            _pendingChangedLlOffboarding.current = [
              ..._pendingChangedLlOffboarding.current.filter(o => !changed.some((c: LandlordOffboardingRecord) => c.id === o.id)),
              ...changed,
            ];
            if (_llOffboardingUpsertTimer.current) clearTimeout(_llOffboardingUpsertTimer.current);
            _llOffboardingUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedLlOffboarding.current;
              _pendingChangedLlOffboarding.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_landlord_offboarding_bulk', { p_records: toWrite as unknown as object });
                if (error) console.warn('[ll_offboarding] upsert_landlord_offboarding_bulk failed:', error.message);
              } catch (e) {
                console.warn('[ll_offboarding] upsert_landlord_offboarding_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetLandlordOffboarding]);
    const [geospatialData, _rawSetGeospatialData, geospatialStatus] = useSupabaseBackedState<GeospatialData>(INITIAL_GEOSPATIAL_DATA, 'tm_geospatial_v12');
    const _geospatialTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const setGeospatialData: React.Dispatch<React.SetStateAction<GeospatialData>> = React.useCallback((updater) => {
      _rawSetGeospatialData(prev => {
        const next = typeof updater === 'function' ? (updater as (p: GeospatialData) => GeospatialData)(prev) : updater;
        if (_geospatialTimer.current) clearTimeout(_geospatialTimer.current);
        _geospatialTimer.current = setTimeout(async () => {
          try {
            const { error } = await supabase.schema('app').rpc('upsert_geospatial_data', { p_data: next as unknown as object });
            if (error) console.warn('[geospatial] upsert_geospatial_data failed:', error.message);
          } catch (e) {
            console.warn('[geospatial] upsert_geospatial_data error:', (e as Error)?.message);
          }
        }, 800);
        return next;
      });
    }, [_rawSetGeospatialData]);
    const [commissionRules, _rawSetCommissionRules, commissionStatus] = useSupabaseBackedState<CommissionRule[]>([], 'tm_commissions_v12');
    const _commissionUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedCommissions = React.useRef<CommissionRule[]>([]);
    const setCommissionRules: React.Dispatch<React.SetStateAction<CommissionRule[]>> = React.useCallback((updater) => {
      _rawSetCommissionRules(prev => {
        const next = typeof updater === 'function' ? (updater as (p: CommissionRule[]) => CommissionRule[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, CommissionRule>(prev.map(c => [c.id, c]));
          const changed = next.filter(c => { const q = prevById.get(c.id); return !q || q !== c; });
          if (changed.length > 0) {
            _pendingChangedCommissions.current = [
              ..._pendingChangedCommissions.current.filter(c => !changed.some((x: CommissionRule) => x.id === c.id)),
              ...changed,
            ];
            if (_commissionUpsertTimer.current) clearTimeout(_commissionUpsertTimer.current);
            _commissionUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedCommissions.current;
              _pendingChangedCommissions.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_commission_rules_bulk', { p_rules: toWrite as unknown as object });
                if (error) console.warn('[commissions] upsert_commission_rules_bulk failed:', error.message);
              } catch (e) {
                console.warn('[commissions] upsert_commission_rules_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetCommissionRules]);
    const [deductionRules, _rawSetDeductionRules, deductionStatus] = useSupabaseBackedState<DeductionRule[]>([], 'tm_deductions_v12');
    const _deductionUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedDeductions = React.useRef<DeductionRule[]>([]);
    const setDeductionRules: React.Dispatch<React.SetStateAction<DeductionRule[]>> = React.useCallback((updater) => {
      _rawSetDeductionRules(prev => {
        const next = typeof updater === 'function' ? (updater as (p: DeductionRule[]) => DeductionRule[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, DeductionRule>(prev.map(d => [d.id, d]));
          const changed = next.filter(d => { const q = prevById.get(d.id); return !q || q !== d; });
          if (changed.length > 0) {
            _pendingChangedDeductions.current = [
              ..._pendingChangedDeductions.current.filter(d => !changed.some((c: DeductionRule) => c.id === d.id)),
              ...changed,
            ];
            if (_deductionUpsertTimer.current) clearTimeout(_deductionUpsertTimer.current);
            _deductionUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedDeductions.current;
              _pendingChangedDeductions.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_deduction_rules_bulk', { p_rules: toWrite as unknown as object });
                if (error) console.warn('[deductions] upsert_deduction_rules_bulk failed:', error.message);
              } catch (e) {
                console.warn('[deductions] upsert_deduction_rules_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetDeductionRules]);
    const [vendors, _rawSetVendors, vendorsStatus] = useSupabaseBackedState<Vendor[]>([], 'tm_vendors_v12');
    const _vendorsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedVendors = React.useRef<Vendor[]>([]);
    const setVendors: React.Dispatch<React.SetStateAction<Vendor[]>> = React.useCallback((updater) => {
      _rawSetVendors(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Vendor[]) => Vendor[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Vendor>(prev.map(v => [v.id, v]));
          const changed = next.filter(v => { const q = prevById.get(v.id); return !q || q !== v; });
          if (changed.length > 0) {
            _pendingChangedVendors.current = [
              ..._pendingChangedVendors.current.filter(v => !changed.some((c: Vendor) => c.id === v.id)),
              ...changed,
            ];
            if (_vendorsUpsertTimer.current) clearTimeout(_vendorsUpsertTimer.current);
            _vendorsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedVendors.current;
              _pendingChangedVendors.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_vendors_bulk', { p_vendors: toWrite as unknown as object });
                if (error) console.warn('[vendors] upsert_vendors_bulk failed:', error.message);
              } catch (e) {
                console.warn('[vendors] upsert_vendors_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetVendors]);
    const [messages, _rawSetMessages, messagesStatus] = useSupabaseBackedState<Message[]>([], 'tm_messages_v12');
    const _messagesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedMessages = React.useRef<Message[]>([]);
    const setMessages: React.Dispatch<React.SetStateAction<Message[]>> = React.useCallback((updater) => {
      _rawSetMessages(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Message[]) => Message[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Message>(prev.map(m => [m.id, m]));
          const changed = next.filter(m => { const q = prevById.get(m.id); return !q || q !== m; });
          if (changed.length > 0) {
            _pendingChangedMessages.current = [
              ..._pendingChangedMessages.current.filter(m => !changed.some((c: Message) => c.id === m.id)),
              ...changed,
            ];
            if (_messagesUpsertTimer.current) clearTimeout(_messagesUpsertTimer.current);
            _messagesUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedMessages.current;
              _pendingChangedMessages.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_messages_bulk', { p_messages: toWrite as unknown as object });
                if (error) console.warn('[messages] upsert_messages_bulk failed:', error.message);
              } catch (e) {
                console.warn('[messages] upsert_messages_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetMessages]);
    const [notifications, _rawSetNotifications, notificationsStatus] = useSupabaseBackedState<Notification[]>([], 'tm_notifications_v12');
    const _notifUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedNotifs = React.useRef<Notification[]>([]);
    const setNotifications: React.Dispatch<React.SetStateAction<Notification[]>> = React.useCallback((updater) => {
      _rawSetNotifications(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Notification[]) => Notification[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Notification>(prev.map(n => [n.id, n]));
          const changed = next.filter(n => { const q = prevById.get(n.id); return !q || q !== n; });
          if (changed.length > 0) {
            _pendingChangedNotifs.current = [
              ..._pendingChangedNotifs.current.filter(n => !changed.some((c: Notification) => c.id === n.id)),
              ...changed,
            ];
            if (_notifUpsertTimer.current) clearTimeout(_notifUpsertTimer.current);
            _notifUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedNotifs.current;
              _pendingChangedNotifs.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_notifications_bulk', { p_notifications: toWrite as unknown as object });
                if (error) console.warn('[notifications] upsert_notifications_bulk failed:', error.message);
              } catch (e) {
                console.warn('[notifications] upsert_notifications_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetNotifications]);
    const [templates, _rawSetTemplates, templatesStatus] = useSupabaseBackedState<CommunicationTemplate[]>([], 'tm_templates_v12');
    const _templatesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedTemplates = React.useRef<CommunicationTemplate[]>([]);
    const setTemplates: React.Dispatch<React.SetStateAction<CommunicationTemplate[]>> = React.useCallback((updater) => {
      _rawSetTemplates(prev => {
        const next = typeof updater === 'function' ? (updater as (p: CommunicationTemplate[]) => CommunicationTemplate[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, CommunicationTemplate>(prev.map(t => [t.id, t]));
          const changed = next.filter(t => { const q = prevById.get(t.id); return !q || q !== t; });
          if (changed.length > 0) {
            _pendingChangedTemplates.current = [
              ..._pendingChangedTemplates.current.filter(t => !changed.some((c: CommunicationTemplate) => c.id === t.id)),
              ...changed,
            ];
            if (_templatesUpsertTimer.current) clearTimeout(_templatesUpsertTimer.current);
            _templatesUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedTemplates.current;
              _pendingChangedTemplates.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_communication_templates_bulk', { p_templates: toWrite as unknown as object });
                if (error) console.warn('[templates] upsert_communication_templates_bulk failed:', error.message);
              } catch (e) {
                console.warn('[templates] upsert_communication_templates_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetTemplates]);
    const [workflows, _rawSetWorkflows, workflowsStatus] = useSupabaseBackedState<Workflow[]>([], 'tm_workflows_v12');
    const _workflowsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedWorkflows = React.useRef<Workflow[]>([]);
    const setWorkflows: React.Dispatch<React.SetStateAction<Workflow[]>> = React.useCallback((updater) => {
      _rawSetWorkflows(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Workflow[]) => Workflow[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Workflow>(prev.map(w => [w.id, w]));
          const changed = next.filter(w => { const q = prevById.get(w.id); return !q || q !== w; });
          if (changed.length > 0) {
            _pendingChangedWorkflows.current = [
              ..._pendingChangedWorkflows.current.filter(w => !changed.some((c: Workflow) => c.id === w.id)),
              ...changed,
            ];
            if (_workflowsUpsertTimer.current) clearTimeout(_workflowsUpsertTimer.current);
            _workflowsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedWorkflows.current;
              _pendingChangedWorkflows.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_workflows_bulk', { p_workflows: toWrite as unknown as object });
                if (error) console.warn('[workflows] upsert_workflows_bulk failed:', error.message);
              } catch (e) {
                console.warn('[workflows] upsert_workflows_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetWorkflows]);
    const [automationRules, _rawSetAutomationRules, automationStatus] = useSupabaseBackedState<CommunicationAutomationRule[]>([], 'tm_automation_rules_v12');
    const _automationUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedAutomation = React.useRef<CommunicationAutomationRule[]>([]);
    const setAutomationRules: React.Dispatch<React.SetStateAction<CommunicationAutomationRule[]>> = React.useCallback((updater) => {
      _rawSetAutomationRules(prev => {
        const next = typeof updater === 'function' ? (updater as (p: CommunicationAutomationRule[]) => CommunicationAutomationRule[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, CommunicationAutomationRule>(prev.map(a => [a.id, a]));
          const changed = next.filter(a => { const q = prevById.get(a.id); return !q || q !== a; });
          if (changed.length > 0) {
            _pendingChangedAutomation.current = [
              ..._pendingChangedAutomation.current.filter(a => !changed.some((c: CommunicationAutomationRule) => c.id === a.id)),
              ...changed,
            ];
            if (_automationUpsertTimer.current) clearTimeout(_automationUpsertTimer.current);
            _automationUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedAutomation.current;
              _pendingChangedAutomation.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_automation_rules_bulk', { p_rules: toWrite as unknown as object });
                if (error) console.warn('[automation] upsert_automation_rules_bulk failed:', error.message);
              } catch (e) {
                console.warn('[automation] upsert_automation_rules_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetAutomationRules]);
    const [escalationRules, _rawSetEscalationRules, escalationStatus] = useSupabaseBackedState<EscalationRule[]>([], 'tm_escalation_rules_v12');
    const _escalationUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedEscalation = React.useRef<EscalationRule[]>([]);
    const setEscalationRules: React.Dispatch<React.SetStateAction<EscalationRule[]>> = React.useCallback((updater) => {
      _rawSetEscalationRules(prev => {
        const next = typeof updater === 'function' ? (updater as (p: EscalationRule[]) => EscalationRule[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, EscalationRule>(prev.map(e => [e.id, e]));
          const changed = next.filter(e => { const q = prevById.get(e.id); return !q || q !== e; });
          if (changed.length > 0) {
            _pendingChangedEscalation.current = [
              ..._pendingChangedEscalation.current.filter(e => !changed.some((c: EscalationRule) => c.id === e.id)),
              ...changed,
            ];
            if (_escalationUpsertTimer.current) clearTimeout(_escalationUpsertTimer.current);
            _escalationUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedEscalation.current;
              _pendingChangedEscalation.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_escalation_rules_bulk', { p_rules: toWrite as unknown as object });
                if (error) console.warn('[escalation] upsert_escalation_rules_bulk failed:', error.message);
              } catch (e) {
                console.warn('[escalation] upsert_escalation_rules_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetEscalationRules]);
    const [auditLogs, _rawSetAuditLogs, auditLogsStatus] = useSupabaseBackedState<AuditLogEntry[]>([], 'tm_audit_logs_v12');
    const _auditLogsInsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingNewAuditLogs = React.useRef<AuditLogEntry[]>([]);
    const setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>> = React.useCallback((updater) => {
      _rawSetAuditLogs(prev => {
        const next = typeof updater === 'function' ? (updater as (p: AuditLogEntry[]) => AuditLogEntry[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevIds = new Set<string>(prev.map(l => l.id));
          const newEntries = next.filter(l => !prevIds.has(l.id));
          if (newEntries.length > 0) {
            _pendingNewAuditLogs.current = [..._pendingNewAuditLogs.current, ...newEntries];
            if (_auditLogsInsertTimer.current) clearTimeout(_auditLogsInsertTimer.current);
            _auditLogsInsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingNewAuditLogs.current;
              _pendingNewAuditLogs.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('insert_audit_logs_bulk', { p_logs: toWrite as unknown as object });
                if (error) console.warn('[audit_logs] insert_audit_logs_bulk failed:', error.message);
              } catch (e) {
                console.warn('[audit_logs] insert_audit_logs_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetAuditLogs]);
    const [externalTransactions, _rawSetExternalTransactions, externalTxStatus] = useSupabaseBackedState<ExternalTransaction[]>([], 'tm_external_transactions_v12');
    const _extTxUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedExtTx = React.useRef<ExternalTransaction[]>([]);
    const setExternalTransactions: React.Dispatch<React.SetStateAction<ExternalTransaction[]>> = React.useCallback((updater) => {
      _rawSetExternalTransactions(prev => {
        const next = typeof updater === 'function' ? (updater as (p: ExternalTransaction[]) => ExternalTransaction[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, ExternalTransaction>(prev.map(t => [t.id, t]));
          const changed = next.filter(t => { const q = prevById.get(t.id); return !q || q !== t; });
          if (changed.length > 0) {
            _pendingChangedExtTx.current = [
              ..._pendingChangedExtTx.current.filter(t => !changed.some((c: ExternalTransaction) => c.id === t.id)),
              ...changed,
            ];
            if (_extTxUpsertTimer.current) clearTimeout(_extTxUpsertTimer.current);
            _extTxUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedExtTx.current;
              _pendingChangedExtTx.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_external_transactions_bulk', { p_txs: toWrite as unknown as object });
                if (error) console.warn('[ext_tx] upsert_external_transactions_bulk failed:', error.message);
              } catch (e) {
                console.warn('[ext_tx] upsert_external_transactions_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetExternalTransactions]);
    const [overpayments, _rawSetOverpayments, overpaymentsStatus] = useSupabaseBackedState<Overpayment[]>([], 'tm_overpayments_v12');
    const _overpaymentsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedOverpayments = React.useRef<Overpayment[]>([]);
    const setOverpayments: React.Dispatch<React.SetStateAction<Overpayment[]>> = React.useCallback((updater) => {
      _rawSetOverpayments(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Overpayment[]) => Overpayment[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Overpayment>(prev.map(o => [o.id, o]));
          const changed = next.filter(o => { const q = prevById.get(o.id); return !q || q !== o; });
          if (changed.length > 0) {
            _pendingChangedOverpayments.current = [
              ..._pendingChangedOverpayments.current.filter(o => !changed.some((c: Overpayment) => c.id === o.id)),
              ...changed,
            ];
            if (_overpaymentsUpsertTimer.current) clearTimeout(_overpaymentsUpsertTimer.current);
            _overpaymentsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedOverpayments.current;
              _pendingChangedOverpayments.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_overpayments_bulk', { p_ops: toWrite as unknown as object });
                if (error) console.warn('[overpayments] upsert_overpayments_bulk failed:', error.message);
              } catch (e) {
                console.warn('[overpayments] upsert_overpayments_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetOverpayments]);
    const [incomeSources, _rawSetIncomeSources, incomeSourcesStatus] = useSupabaseBackedState<IncomeSource[]>([], 'tm_income_sources_v12');
    const _incomeSourcesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedIncomeSources = React.useRef<IncomeSource[]>([]);
    const setIncomeSources: React.Dispatch<React.SetStateAction<IncomeSource[]>> = React.useCallback((updater) => {
      _rawSetIncomeSources(prev => {
        const next = typeof updater === 'function' ? (updater as (p: IncomeSource[]) => IncomeSource[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, IncomeSource>(prev.map(s => [s.id, s]));
          const changed = next.filter(s => { const q = prevById.get(s.id); return !q || q !== s; });
          if (changed.length > 0) {
            _pendingChangedIncomeSources.current = [
              ..._pendingChangedIncomeSources.current.filter(s => !changed.some((c: IncomeSource) => c.id === s.id)),
              ...changed,
            ];
            if (_incomeSourcesUpsertTimer.current) clearTimeout(_incomeSourcesUpsertTimer.current);
            _incomeSourcesUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedIncomeSources.current;
              _pendingChangedIncomeSources.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_income_sources_bulk', { p_sources: toWrite as unknown as object });
                if (error) console.warn('[income_sources] upsert_income_sources_bulk failed:', error.message);
              } catch (e) {
                console.warn('[income_sources] upsert_income_sources_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetIncomeSources]);
    const [preventiveTasks, _rawSetPreventiveTasks, preventiveTasksStatus] = useSupabaseBackedState<PreventiveTask[]>([], 'tm_preventive_tasks_v12');
    const _preventiveTasksUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedPreventiveTasks = React.useRef<PreventiveTask[]>([]);
    const setPreventiveTasks: React.Dispatch<React.SetStateAction<PreventiveTask[]>> = React.useCallback((updater) => {
      _rawSetPreventiveTasks(prev => {
        const next = typeof updater === 'function' ? (updater as (p: PreventiveTask[]) => PreventiveTask[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, PreventiveTask>(prev.map(t => [t.id, t]));
          const changed = next.filter(t => { const q = prevById.get(t.id); return !q || q !== t; });
          if (changed.length > 0) {
            _pendingChangedPreventiveTasks.current = [
              ..._pendingChangedPreventiveTasks.current.filter(t => !changed.some((c: PreventiveTask) => c.id === t.id)),
              ...changed,
            ];
            if (_preventiveTasksUpsertTimer.current) clearTimeout(_preventiveTasksUpsertTimer.current);
            _preventiveTasksUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedPreventiveTasks.current;
              _pendingChangedPreventiveTasks.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_preventive_tasks_bulk', { p_tasks: toWrite as unknown as object });
                if (error) console.warn('[preventive_tasks] upsert_preventive_tasks_bulk failed:', error.message);
              } catch (e) {
                console.warn('[preventive_tasks] upsert_preventive_tasks_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetPreventiveTasks]);
    const [funds, _rawSetFunds, fundsStatus] = useSupabaseBackedState<Fund[]>([], 'tm_funds_v12');
    const _fundsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedFunds = React.useRef<Fund[]>([]);
    const setFunds: React.Dispatch<React.SetStateAction<Fund[]>> = React.useCallback((updater) => {
      _rawSetFunds(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Fund[]) => Fund[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Fund>(prev.map(f => [f.id, f]));
          const changed = next.filter(f => { const q = prevById.get(f.id); return !q || q !== f; });
          if (changed.length > 0) {
            _pendingChangedFunds.current = [..._pendingChangedFunds.current.filter(f => !changed.some((c: Fund) => c.id === f.id)), ...changed];
            if (_fundsUpsertTimer.current) clearTimeout(_fundsUpsertTimer.current);
            _fundsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedFunds.current; _pendingChangedFunds.current = [];
              try { const { error } = await supabase.schema('app').rpc('upsert_funds_bulk', { p_funds: toWrite as unknown as object }); if (error) console.warn('[funds] upsert_funds_bulk failed:', error.message); } catch (e) { console.warn('[funds] upsert_funds_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetFunds]);
    const [investments, _rawSetInvestments, investmentsStatus] = useSupabaseBackedState<Investment[]>([], 'tm_investments_v12');
    const _investmentsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedInvestments = React.useRef<Investment[]>([]);
    const setInvestments: React.Dispatch<React.SetStateAction<Investment[]>> = React.useCallback((updater) => {
      _rawSetInvestments(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Investment[]) => Investment[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Investment>(prev.map(i => [i.id, i]));
          const changed = next.filter(i => { const q = prevById.get(i.id); return !q || q !== i; });
          if (changed.length > 0) {
            _pendingChangedInvestments.current = [..._pendingChangedInvestments.current.filter(i => !changed.some((c: Investment) => c.id === i.id)), ...changed];
            if (_investmentsUpsertTimer.current) clearTimeout(_investmentsUpsertTimer.current);
            _investmentsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedInvestments.current; _pendingChangedInvestments.current = [];
              try { const { error } = await supabase.schema('app').rpc('upsert_investments_bulk', { p_investments: toWrite as unknown as object }); if (error) console.warn('[investments] upsert_investments_bulk failed:', error.message); } catch (e) { console.warn('[investments] upsert_investments_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetInvestments]);
    const [withdrawals, _rawSetWithdrawals, withdrawalsStatus] = useSupabaseBackedState<WithdrawalRequest[]>([], 'tm_withdrawals_v12');
    const _withdrawalsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedWithdrawals = React.useRef<WithdrawalRequest[]>([]);
    const setWithdrawals: React.Dispatch<React.SetStateAction<WithdrawalRequest[]>> = React.useCallback((updater) => {
      _rawSetWithdrawals(prev => {
        const next = typeof updater === 'function' ? (updater as (p: WithdrawalRequest[]) => WithdrawalRequest[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, WithdrawalRequest>(prev.map(w => [w.id, w]));
          const changed = next.filter(w => { const q = prevById.get(w.id); return !q || q !== w; });
          if (changed.length > 0) {
            _pendingChangedWithdrawals.current = [..._pendingChangedWithdrawals.current.filter(w => !changed.some((c: WithdrawalRequest) => c.id === w.id)), ...changed];
            if (_withdrawalsUpsertTimer.current) clearTimeout(_withdrawalsUpsertTimer.current);
            _withdrawalsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedWithdrawals.current; _pendingChangedWithdrawals.current = [];
              try { const { error } = await supabase.schema('app').rpc('upsert_withdrawals_bulk', { p_withdrawals: toWrite as unknown as object }); if (error) console.warn('[withdrawals] upsert_withdrawals_bulk failed:', error.message); } catch (e) { console.warn('[withdrawals] upsert_withdrawals_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetWithdrawals]);
    const [renovationInvestors, _rawSetRenovationInvestors, renovationInvestorsStatus] = useSupabaseBackedState<RenovationInvestor[]>([], 'tm_renovation_investors_v12');
    const _renovInvestorsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedRenovInvestors = React.useRef<RenovationInvestor[]>([]);
    const setRenovationInvestors: React.Dispatch<React.SetStateAction<RenovationInvestor[]>> = React.useCallback((updater) => {
      _rawSetRenovationInvestors(prev => {
        const next = typeof updater === 'function' ? (updater as (p: RenovationInvestor[]) => RenovationInvestor[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, RenovationInvestor>(prev.map(r => [r.id, r]));
          const changed = next.filter(r => { const q = prevById.get(r.id); return !q || q !== r; });
          if (changed.length > 0) {
            _pendingChangedRenovInvestors.current = [..._pendingChangedRenovInvestors.current.filter(r => !changed.some((c: RenovationInvestor) => c.id === r.id)), ...changed];
            if (_renovInvestorsUpsertTimer.current) clearTimeout(_renovInvestorsUpsertTimer.current);
            _renovInvestorsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedRenovInvestors.current; _pendingChangedRenovInvestors.current = [];
              try { const { error } = await supabase.schema('app').rpc('upsert_renovation_investors_bulk', { p_investors: toWrite as unknown as object }); if (error) console.warn('[renov_investors] upsert_renovation_investors_bulk failed:', error.message); } catch (e) { console.warn('[renov_investors] upsert_renovation_investors_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetRenovationInvestors]);
    const [rfTransactions, _rawSetRFTransactions, rfTxStatus] = useSupabaseBackedState<RFTransaction[]>([], 'tm_rf_transactions_v12');
    const _rfTxUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedRFTx = React.useRef<RFTransaction[]>([]);
    const setRFTransactions: React.Dispatch<React.SetStateAction<RFTransaction[]>> = React.useCallback((updater) => {
      _rawSetRFTransactions(prev => {
        const next = typeof updater === 'function' ? (updater as (p: RFTransaction[]) => RFTransaction[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, RFTransaction>(prev.map(t => [t.id, t]));
          const changed = next.filter(t => { const q = prevById.get(t.id); return !q || q !== t; });
          if (changed.length > 0) {
            _pendingChangedRFTx.current = [..._pendingChangedRFTx.current.filter(t => !changed.some((c: RFTransaction) => c.id === t.id)), ...changed];
            if (_rfTxUpsertTimer.current) clearTimeout(_rfTxUpsertTimer.current);
            _rfTxUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedRFTx.current; _pendingChangedRFTx.current = [];
              try { const { error } = await supabase.schema('app').rpc('upsert_rf_transactions_bulk', { p_txs: toWrite as unknown as object }); if (error) console.warn('[rf_tx] upsert_rf_transactions_bulk failed:', error.message); } catch (e) { console.warn('[rf_tx] upsert_rf_transactions_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetRFTransactions]);
    const [renovationProjectBills, _rawSetRenovationProjectBills, renovationBillsStatus] = useSupabaseBackedState<RenovationProjectBill[]>([], 'tm_renovation_project_bills_v12');
    const _renovBillsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedRenovBills = React.useRef<RenovationProjectBill[]>([]);
    const setRenovationProjectBills: React.Dispatch<React.SetStateAction<RenovationProjectBill[]>> = React.useCallback((updater) => {
      _rawSetRenovationProjectBills(prev => {
        const next = typeof updater === 'function' ? (updater as (p: RenovationProjectBill[]) => RenovationProjectBill[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, RenovationProjectBill>(prev.map(b => [b.id, b]));
          const changed = next.filter(b => { const q = prevById.get(b.id); return !q || q !== b; });
          if (changed.length > 0) {
            _pendingChangedRenovBills.current = [..._pendingChangedRenovBills.current.filter(b => !changed.some((c: RenovationProjectBill) => c.id === b.id)), ...changed];
            if (_renovBillsUpsertTimer.current) clearTimeout(_renovBillsUpsertTimer.current);
            _renovBillsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedRenovBills.current; _pendingChangedRenovBills.current = [];
              try { const { error } = await supabase.schema('app').rpc('upsert_renovation_project_bills_bulk', { p_bills: toWrite as unknown as object }); if (error) console.warn('[renov_bills] upsert_renovation_project_bills_bulk failed:', error.message); } catch (e) { console.warn('[renov_bills] upsert_renovation_project_bills_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetRenovationProjectBills]);
    const [roles, setRoles] = useState<Role[]>(() => {
        try {
            const cached = localStorage.getItem('taskme_cache_roles');
            if (cached) return JSON.parse(cached);
        } catch {}
        return [];
    });
    const [rolesStatus, setRolesStatus] = useState<{ loading: boolean; error: string | null }>(() => {
        try {
            const cached = localStorage.getItem('taskme_cache_roles');
            if (cached) return { loading: false, error: null };
        } catch {}
        return { loading: true, error: null };
    });
    const [systemSettings, _rawSetSystemSettings, systemSettingsStatus] = useSupabaseBackedState<SystemSettings>({
        companyName: 'TaskMe Realty',
        logo: null,
        profilePic: null
    }, 'tm_system_settings_v12');
    const _systemSettingsTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>> = React.useCallback((updater) => {
      _rawSetSystemSettings(prev => {
        const next = typeof updater === 'function' ? (updater as (p: SystemSettings) => SystemSettings)(prev) : updater;
        if (_systemSettingsTimer.current) clearTimeout(_systemSettingsTimer.current);
        _systemSettingsTimer.current = setTimeout(async () => {
          try {
            const { error } = await supabase.schema('app').rpc('upsert_system_settings', { p_s: next as unknown as object });
            if (error) console.warn('[system_settings] upsert_system_settings failed:', error.message);
          } catch (e) {
            console.warn('[system_settings] upsert_system_settings error:', (e as Error)?.message);
          }
        }, 500);
        return next;
      });
    }, [_rawSetSystemSettings]);

    React.useEffect(() => {
        if (!hasSession && isSupabaseEnabled) {
            // First try calling get_public_branding
            supabase.rpc('get_public_branding').then(({ data, error }) => {
                if (!error && data) {
                    _rawSetSystemSettings(prev => ({ ...prev, ...(data as SystemSettings) }));
                } else {
                    // Fallback to app.load_system_settings
                    supabase.schema('app').rpc('load_system_settings').then(({ data: legacyData, error: legacyError }) => {
                        if (!legacyError && legacyData) {
                            _rawSetSystemSettings(legacyData as SystemSettings);
                        }
                    }).catch(() => {});
                }
            }).catch(() => {
                // Fallback to app.load_system_settings
                supabase.schema('app').rpc('load_system_settings').then(({ data: legacyData, error: legacyError }) => {
                    if (!legacyError && legacyData) {
                        _rawSetSystemSettings(legacyData as SystemSettings);
                    }
                }).catch(() => {});
            });
        }
    }, [hasSession]);
    const [scheduledReports, _rawSetScheduledReports, scheduledReportsStatus] = useSupabaseBackedState<ScheduledReport[]>([], 'tm_scheduled_reports_v12');
    const _scheduledReportsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedScheduledReports = React.useRef<ScheduledReport[]>([]);
    const setScheduledReports: React.Dispatch<React.SetStateAction<ScheduledReport[]>> = React.useCallback((updater) => {
      _rawSetScheduledReports(prev => {
        const next = typeof updater === 'function' ? (updater as (p: ScheduledReport[]) => ScheduledReport[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, ScheduledReport>(prev.map(r => [r.id, r]));
          const changed = next.filter(r => { const q = prevById.get(r.id); return !q || q !== r; });
          if (changed.length > 0) {
            _pendingChangedScheduledReports.current = [
              ..._pendingChangedScheduledReports.current.filter(r => !changed.some((c: ScheduledReport) => c.id === r.id)),
              ...changed,
            ];
            if (_scheduledReportsUpsertTimer.current) clearTimeout(_scheduledReportsUpsertTimer.current);
            _scheduledReportsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedScheduledReports.current;
              _pendingChangedScheduledReports.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_scheduled_reports_bulk', { p_reports: toWrite as unknown as object });
                if (error) console.warn('[scheduled_reports] upsert_scheduled_reports_bulk failed:', error.message);
              } catch (e) {
                console.warn('[scheduled_reports] upsert_scheduled_reports_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetScheduledReports]);
    const [taxRecords, _rawSetTaxRecords, taxRecordsStatus] = useSupabaseBackedState<TaxRecord[]>([], 'tm_tax_records_v12');
    const _taxRecordsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedTaxRecords = React.useRef<TaxRecord[]>([]);
    const setTaxRecords: React.Dispatch<React.SetStateAction<TaxRecord[]>> = React.useCallback((updater) => {
      _rawSetTaxRecords(prev => {
        const next = typeof updater === 'function' ? (updater as (p: TaxRecord[]) => TaxRecord[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, TaxRecord>(prev.map(r => [r.id, r]));
          const changed = next.filter(r => { const q = prevById.get(r.id); return !q || q !== r; });
          if (changed.length > 0) {
            _pendingChangedTaxRecords.current = [
              ..._pendingChangedTaxRecords.current.filter(r => !changed.some((c: TaxRecord) => c.id === r.id)),
              ...changed,
            ];
            if (_taxRecordsUpsertTimer.current) clearTimeout(_taxRecordsUpsertTimer.current);
            _taxRecordsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedTaxRecords.current;
              _pendingChangedTaxRecords.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_tax_records_bulk', { p_records: toWrite as unknown as object });
                if (error) console.warn('[tax_records] upsert_tax_records_bulk failed:', error.message);
              } catch (e) {
                console.warn('[tax_records] upsert_tax_records_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetTaxRecords]);
    // skipPersist: listings are auto-derived from properties on every load.
    // Persisting them causes statement timeouts on large datasets.
    const [marketplaceListings, setMarketplaceListings, marketplaceStatus] = useSupabaseBackedState<MarketplaceListing[]>([], 'tm_listings_v12', { skipPersist: true });
    const persistedListingsLoaded = React.useRef(false);
    React.useEffect(() => {
      if (!hasSession || persistedListingsLoaded.current) return;
      persistedListingsLoaded.current = true;
      void (async () => {
        const { data, error } = await supabase.from('marketplace_listings').select('payload');
        if (error) {
          console.warn('[listings] normalized load failed:', error.message);
          return;
        }
        const stored = (data || []).map((row: any) => row.payload).filter(Boolean) as MarketplaceListing[];
        if (stored.length > 0) {
          setMarketplaceListings(current => {
            const storedIds = new Set(stored.map(listing => listing.id));
            return [...stored, ...current.filter(listing => !storedIds.has(listing.id))];
          });
        }
      })();
    }, [hasSession, setMarketplaceListings]);
    const [leads, _rawSetLeads, leadsStatus] = useSupabaseBackedState<Lead[]>([], 'tm_leads_v12');
    const _leadsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedLeads = React.useRef<Lead[]>([]);
    const setLeads: React.Dispatch<React.SetStateAction<Lead[]>> = React.useCallback((updater) => {
      _rawSetLeads(prev => {
        const next = typeof updater === 'function' ? (updater as (p: Lead[]) => Lead[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, Lead>(prev.map(l => [l.id, l]));
          const changed = next.filter(l => { const q = prevById.get(l.id); return !q || q !== l; });
          if (changed.length > 0) {
            _pendingChangedLeads.current = [
              ..._pendingChangedLeads.current.filter(l => !changed.some((c: Lead) => c.id === l.id)),
              ...changed,
            ];
            if (_leadsUpsertTimer.current) clearTimeout(_leadsUpsertTimer.current);
            _leadsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedLeads.current;
              _pendingChangedLeads.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_leads_bulk', { p_leads: toWrite as unknown as object });
                if (error) console.warn('[leads] upsert_leads_bulk failed:', error.message);
              } catch (e) {
                console.warn('[leads] upsert_leads_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetLeads]);
    const [fundiJobs, _rawSetFundiJobs, fundiJobsStatus] = useSupabaseBackedState<FundiJob[]>([], 'tm_fundi_jobs_v12');
    const _fundiJobsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedFundiJobs = React.useRef<FundiJob[]>([]);
    const setFundiJobs: React.Dispatch<React.SetStateAction<FundiJob[]>> = React.useCallback((updater) => {
      _rawSetFundiJobs(prev => {
        const next = typeof updater === 'function' ? (updater as (p: FundiJob[]) => FundiJob[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, FundiJob>(prev.map(j => [j.id, j]));
          const changed = next.filter(j => { const q = prevById.get(j.id); return !q || q !== j; });
          if (changed.length > 0) {
            _pendingChangedFundiJobs.current = [
              ..._pendingChangedFundiJobs.current.filter(j => !changed.some((c: FundiJob) => c.id === j.id)),
              ...changed,
            ];
            if (_fundiJobsUpsertTimer.current) clearTimeout(_fundiJobsUpsertTimer.current);
            _fundiJobsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedFundiJobs.current;
              _pendingChangedFundiJobs.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_fundi_jobs_bulk', { p_jobs: toWrite as unknown as object });
                if (error) console.warn('[fundi_jobs] upsert_fundi_jobs_bulk failed:', error.message);
              } catch (e) {
                console.warn('[fundi_jobs] upsert_fundi_jobs_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetFundiJobs]);
    const [marketingBanners, _rawSetMarketingBanners] = useSupabaseBackedState<MarketingBannerTemplate[]>([], 'tm_marketing_banners_v12');
    const _bannersUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedBanners = React.useRef<MarketingBannerTemplate[]>([]);
    const setMarketingBanners: React.Dispatch<React.SetStateAction<MarketingBannerTemplate[]>> = React.useCallback((updater) => {
      _rawSetMarketingBanners(prev => {
        const next = typeof updater === 'function' ? (updater as (p: MarketingBannerTemplate[]) => MarketingBannerTemplate[])(prev) : updater;
        if (Array.isArray(next)) {
          const prevById = new Map<string, MarketingBannerTemplate>(prev.map(b => [b.id, b]));
          const changed = next.filter(b => { const q = prevById.get(b.id); return !q || q !== b; });
          if (changed.length > 0) {
            _pendingChangedBanners.current = [
              ..._pendingChangedBanners.current.filter(b => !changed.some((c: MarketingBannerTemplate) => c.id === b.id)),
              ...changed,
            ];
            if (_bannersUpsertTimer.current) clearTimeout(_bannersUpsertTimer.current);
            _bannersUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedBanners.current;
              _pendingChangedBanners.current = [];
              try {
                const { error } = await supabase.schema('app').rpc('upsert_marketing_banners_bulk', { p_banners: toWrite as unknown as object });
                if (error) console.warn('[marketing_banners] upsert_marketing_banners_bulk failed:', error.message);
              } catch (e) {
                console.warn('[marketing_banners] upsert_marketing_banners_bulk error:', (e as Error)?.message);
              }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetMarketingBanners]);

    const queryClient = useQueryClient();

    // Reconcile tenant unit names/numbers with property units: Ensure any tenant whose property unit was renamed
    // automatically updates to the property unit's current unit number / name globally.
    React.useEffect(() => {
        if (tenants.length === 0 || properties.length === 0) return;
        
        let changed = false;
        const reconciled = tenants.map(t => {
            const prop = properties.find(p => p.id === t.propertyId || (!!p.title && p.title === t.propertyName));
            if (!prop || !Array.isArray(prop.units)) return t;

            // Find matching unit by unitId first, or by unit name/number/tag
            let unit = prop.units.find(u => u.id === t.unitId);
            if (!unit) {
                const searchKeys = [t.unit, t.unitNumber, t.unitName, (t as any).unitTag]
                    .map(k => String(k || '').trim().toLowerCase())
                    .filter(Boolean);
                unit = prop.units.find(u => {
                    const uKeys = [u.id, u.unitNumber, u.name, u.unitTag]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);
                    return searchKeys.some(sk => uKeys.includes(sk));
                });
            }

            if (unit) {
                const newUnitNum = String(unit.unitNumber || unit.name || '').trim();
                const newUnitTag = String(unit.unitTag || unit.unitNumber || unit.name || '').trim();
                const newUnitName = String(unit.name || unit.unitNumber || '').trim();

                if (
                    t.unitId !== unit.id ||
                    (newUnitNum && t.unit !== newUnitNum) ||
                    (newUnitNum && t.unitNumber !== newUnitNum) ||
                    (newUnitName && t.unitName !== newUnitName) ||
                    (newUnitTag && (t as any).unitTag !== newUnitTag)
                ) {
                    changed = true;
                    return {
                        ...t,
                        unitId: unit.id,
                        unit: newUnitNum || t.unit,
                        unitNumber: newUnitNum || t.unitNumber || t.unit,
                        unitName: newUnitName || t.unitName || t.unit,
                        unitTag: newUnitTag || (t as any).unitTag,
                        paymentAccount: newUnitTag || (t as any).paymentAccount,
                    };
                }
            }
            return t;
        });

        if (changed) {
            setTenants(reconciled);
        }
    }, [properties, tenants, setTenants]);

    // ── Master batch loader (Stage 1 Startup) ───────────────────────────────
    // Stage 1 is the "critical path": everything the operator sees first.
    // Tenants, properties and the payments table are fetched IN PARALLEL with
    // the layout metadata, and the payments are folded into the tenant list
    // before it is published — so a tenant never renders without its receipts.
    // Everything else keeps loading in the background afterwards.
    const { data: allAppState, isLoading: batchLoading, isSuccess: batchSuccess, isError: batchError } =
      useQuery<Record<string, unknown>>({
        queryKey: ['full_all_app_state'],
        staleTime: 5 * 60 * 1000, 
        gcTime: 60 * 60 * 1000,
        retry: 2,
        enabled: hasSession,
        queryFn: async () => {
          const session = await getSupabaseSession();
          if (!session) throw new Error('SESSION_EXPIRED');
          console.log('[Supabase] Fast Batch Load (Stage 1) on startup');
          
          const result: Record<string, unknown> = {};
          const stage1Keys = STAGE1_KEYS;

          const loadKey = async (key: string) => {
            const rpcName = BLOB_KEY_TO_RPC[key];
            if (!rpcName) return;
            try {
              const { data, error } = await supabase.schema('app').rpc(rpcName);
              if (error) {
                console.warn(`[Supabase startup load] Failed for ${key}:`, error.message);
                return;
              }
              result[key] = data;
            } catch (e) {
              console.warn(`[Supabase startup load] Error for ${key}:`, e);
            }
          };

          const paymentsPromise = fetchAllCompletedPayments(DEFAULT_PAYMENT_WINDOW_DAYS)
            .catch(e => {
              console.warn('[Supabase startup load] payments fetch failed:', (e as Error)?.message);
              return [] as any[];
            });

          const [, payments] = await Promise.all([
            Promise.all(stage1Keys.map(loadKey)),
            paymentsPromise,
          ]);

          // Payments are part of the critical payload — publish them so the
          // Payments screens and the realtime synchroniser reuse this fetch
          // instead of issuing a second full pass.
          queryClient.setQueryData([PAYMENTS_QUERY_KEY, DEFAULT_PAYMENT_WINDOW_DAYS], payments);

          const loadedTenants = result['tm_tenants_v12'];
          if (Array.isArray(loadedTenants)) {
            result['tm_tenants_v12'] = mergePaymentsIntoTenantList(loadedTenants as any[], payments);
          }

          return result;
        },
      });


    // Distribute Stage 1 results + signal individual queries they can run as fallback
    useEffect(() => {
      if (batchSuccess && allAppState) {
        Object.entries(allAppState).forEach(([k, v]) => {
          if (v !== null && v !== undefined) {
            queryClient.setQueryData(['full_app_state', k], v);
          }
        });
      }
      if (batchError) {
        _setBatchSettled();
      }
    }, [batchSuccess, batchError, allAppState, queryClient]);

    // ── Prioritized Sequential Background Loader ──────────────────────────────
    // Background queue starts immediately when Stage 1 completes.
    // If the logged-in user is a high-priority system user (Super Admin, Accountant, Admin, etc.),
    // we bypass strict serial delays and fetch remaining tables in rapid parallel requests.
    // Otherwise, we load sequentially as requested: Properties -> Landlords -> Tenants -> Remaining Tables.
    const sequentialLoadStarted = React.useRef(false);
    useEffect(() => {
      if (!batchSuccess || !hasSession) {
        if (!hasSession) {
          sequentialLoadStarted.current = false;
        }
        return;
      }
      if (sequentialLoadStarted.current) return;
      sequentialLoadStarted.current = true;

      const runSequentialLoad = async () => {
        console.log('[Supabase] Starting prioritized sequential background load...');
        const userRole = currentUser?.role;
        const isSystemUser = userRole && ['Super Admin', 'Accountant', 'Admin', 'Assistant Admin'].includes(userRole);

        const loadKeys = async (keys: string[]) => {
          await Promise.all(
            keys.map(async (key) => {
              const rpcName = BLOB_KEY_TO_RPC[key];
              if (!rpcName) return;
              try {
                const { data, error } = await supabase.schema('app').rpc(rpcName);
                if (error) {
                  console.warn(`[Supabase background load] Failed for ${key}:`, error.message);
                  return;
                }
                queryClient.setQueryData(['full_app_state', key], data);
              } catch (e) {
                console.warn(`[Supabase background load] Error for ${key}:`, e);
              }
            })
          );
        };

        // Tenants, properties and payments already arrived with Stage 1, so the
        // background queue is purely "everything else". We fetch it in one
        // parallel wave (leases/applications first) so that within a few seconds
        // of login every module already has its data in cache.
        const priorityKeys = [
          'tm_applications_v12',
          'tm_offboarding_v12',
          'tm_landlords_v12',
          'tm_landlord_applications_v12',
          'tm_landlord_offboarding_v12',
          'tm_commissions_v12',
          'tm_deductions_v12',
        ].filter(k => BLOB_KEY_TO_RPC[k]);

        const restKeys = Object.keys(BLOB_KEY_TO_RPC).filter(
          key => !STAGE1_KEYS.includes(key) && !priorityKeys.includes(key)
        );

        if (isSystemUser) {
          console.log('[Supabase bg] High Priority System User — loading remaining tables in parallel');
          await loadKeys([...priorityKeys, ...restKeys]);
        } else {
          console.log('[Supabase bg] Loading leases/landlords, then the remaining tables');
          await loadKeys(priorityKeys);
          await loadKeys(restKeys);
        }
        console.log('[Supabase bg] Background load completed');
        _setBatchSettled();

      };

      runSequentialLoad();
    }, [batchSuccess, hasSession, currentUser, queryClient]);

    // ── Unit-status reconciliation (post batch load) ─────────────────────────
    const _unitReconciliationRan = React.useRef(false);
    useEffect(() => {
        if (!batchSuccess || _unitReconciliationRan.current) return;
        if (propertiesStatus.loading || tenantsStatus.loading) return;
        if (properties.length === 0) return;
        _unitReconciliationRan.current = true;

        const corrections = new Map<string, typeof properties[0]>();
        properties.forEach(prop => {
            let changed = false;
            const units = (prop.units || []).map(u => {
                if (isRepurposedUnit(u)) return u;
                const tenant = isUnitOccupiedByTenant(u, tenants, prop);
                if (tenant && u.status === 'Vacant') {
                    changed = true;
                    return { ...u, status: 'Occupied' as const, tenantId: (u as any).tenantId || tenant.id };
                }
                if (!tenant && u.status === 'Occupied') {
                    changed = true;
                    const { tenantId, ...rest } = u as any;
                    return { ...rest, status: 'Vacant' as const };
                }
                return u;
            });
            if (changed) corrections.set(prop.id, { ...prop, units: units as Unit[] });
        });

        if (corrections.size === 0) return;
        const changedProperties = properties.map(p => corrections.has(p.id) ? corrections.get(p.id)! : p);
        console.log(`[reconcile] correcting ${corrections.size} propert${corrections.size === 1 ? 'y' : 'ies'} with tenant-linked unit statuses`);
        setProperties(changedProperties);
        (async () => {
            try {
                const { error } = await supabase.schema('app').rpc('upsert_properties_bulk', { p_properties: changedProperties as unknown as object });
                if (error) console.warn('[reconcile] property status persistence failed:', error.message);
            } catch (e) {
                console.warn('[reconcile] property status persistence error:', (e as Error)?.message);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batchSuccess, tenants, properties, propertiesStatus.loading, tenantsStatus.loading]);


    // ── Landlords reconciliation (post batch load) ─────────────────────────
    const _landlordsReconciliationRan = React.useRef(false);
    useEffect(() => {
        if (!batchSuccess || _landlordsReconciliationRan.current) return;
        if (propertiesStatus.loading || landlordsStatus.loading) return;
        if (properties.length === 0) return;
        _landlordsReconciliationRan.current = true;

        const landlordIds = new Set(
            landlords.map(l => l.id)
        );

        const missingIds = Array.from(new Set(
            properties.map(p => p.landlord_id).filter((id): id is string => !!id)
        )).filter(id => !landlordIds.has(id));

        if (missingIds.length === 0) return;

        console.log(`[reconcile] found ${missingIds.length} missing landlord profiles for properties. Generating placeholders...`);

        const placeholders: User[] = missingIds.map(id => ({
            id,
            name: `Landlord (${id.slice(0, 8)})`,
            username: `landlord_${id.slice(0, 8)}`,
            email: `landlord_${id.slice(0, 8)}@taskme.ke`,
            phone: '+254700000000',
            idNumber: '00000000',
            kraPin: '',
            role: 'Landlord',
            status: 'Active' as const,
            branch: 'Nairobi',
            avatarUrl: '',
            appScope: 'Full' as const,
            created_at: new Date().toISOString()
        } as unknown as User));

        setLandlords(prev => {
            const next = [...prev];
            placeholders.forEach(pl => {
                if (!next.some(u => u.id === pl.id)) {
                    next.push(pl);
                }
            });
            return next;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batchSuccess, properties, landlords, propertiesStatus.loading, landlordsStatus.loading]);


    const mergedStaff = staff;

    // Only block the app on the essentials required for permission checks / route gating.
    // Tenants, properties, staff, and offboarding records load in the background so users
    // land on their dashboards immediately after auth completes. Individual pages that
    // depend on those datasets can render their own local loading states.
    const isDataLoading = batchLoading || rolesStatus.loading;

    // ── Supabase Realtime: Unified Sync ──────────────────────────────────────
    // Subscribes to changes on the app_state table for critical keys.
    // Consolidates multiple redundant channels into a single stable subscription.
    useEffect(() => {
        if (!hasSession) return;
        
        const channel = supabase
            .channel('app-sync')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'app', table: 'app_state' },
                (payload) => {
                    const key = payload.new?.key;
                    const incoming = payload.new?.value;
                    if (!key || !Array.isArray(incoming)) return;

                    if (key === 'tm_messages_v12') {
                        setMessages(prev => {
                            const existingIds = new Set(prev.map((m: any) => m.id));
                            const fresh = incoming.filter((m: any) => !existingIds.has(m.id));
                            return fresh.length > 0 ? [...fresh, ...prev] : prev;
                        });
                        return;
                    }

                    const syncKeys = ['tm_tenants_v12', 'tm_properties_v12', 'tm_applications_v12', 'tm_notifications_v12'];
                    if (syncKeys.includes(key)) {
                        queryClient.setQueryData<any[]>(['full_app_state', key], (prev) => {
                            const current = prev ?? [];
                            const localIds = new Set(current.map((r: any) => r.id));
                            const newEntries = incoming.filter((r: any) => !localIds.has(r.id));
                            if (newEntries.length === 0) return current;
                            return key === 'tm_notifications_v12'
                                ? [...newEntries, ...current]
                                : [...current, ...newEntries];
                        });
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasSession]);

    const {
        data: rolesData,
        isLoading: rolesLoading,
        error: rolesError,
    } = useQuery({
        queryKey: ['full_roles'],
        staleTime: Infinity,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            console.log('[Supabase] roles load');
            const { data, error } = await supabase
                .schema('app')
                .from('roles')
                .select('id,name,description,is_system,permissions,accessible_submodules,widget_access')
                .order('name', { ascending: true });
            if (error) throw error;
            return data || [];
        },
    });

    useEffect(() => {
        if (rolesData) {
            const mapped: Role[] = (rolesData as any[]).map((r: any) => ({
                id: r.id,
                name: r.name,
                description: r.description ?? '',
                isSystem: !!r.is_system,
                permissions: (r.permissions ?? {}) as RolePermissions,
                accessibleSubmodules: (r.accessible_submodules ?? []) as string[],
                widgetAccess: (r.widget_access ?? []) as string[],
            }));
            setRoles(mapped);
            setRolesStatus({ loading: false, error: null });
            try {
                localStorage.setItem('taskme_cache_roles', JSON.stringify(mapped));
            } catch (e) {
                console.warn('[DataContext] Error caching roles:', e);
            }
        }
    }, [rolesData]);

    useEffect(() => {
        if (rolesError) {
            console.warn('Failed to load roles', rolesError);
            setRoles([]);
            setRolesStatus({ loading: false, error: (rolesError as any)?.message ?? 'Failed to load roles' });
        }
    }, [rolesError]);

    useEffect(() => {
        const { data: authSub } = supabase.auth.onAuthStateChange((event, _session) => {
            if (event === 'TOKEN_REFRESHED') {
                // Only bust the token cache — data hasn't changed, no need to re-fetch.
                bustSessionCache();
                console.log('[Supabase] TOKEN_REFRESHED — session cache busted');
            } else if (event === 'SIGNED_IN') {
                // Bust session cache so next getSupabaseSession() returns the new token.
                bustSessionCache();
                // Re-fetch all cached data after login so stale empty-state is replaced.
                // Skip invalidating if the user session is already active (e.g., on mount / transition)
                const cachedUser = localStorage.getItem(SESSION_CACHE_KEY);
                if (!cachedUser) {
                    console.log('[Supabase] SIGNED_IN — invalidating all queries');
                    queryClient.invalidateQueries();
                } else {
                    console.log('[Supabase] SIGNED_IN (session recovery) — skipped invalidation');
                }
            } else if (event === 'SIGNED_OUT') {
                // Bust session cache and clear all queries on logout.
                bustSessionCache();
                // Reset batch-settled so next login goes through the batch-first path again.
                _globalBatchSettled = false;
                console.log('[Supabase] SIGNED_OUT — clearing query cache');
                queryClient.clear();
                localStorage.removeItem(SESSION_CACHE_KEY);
                setCurrentUser(null);
            }
        });
        return () => {
            authSub?.subscription?.unsubscribe();
        };
    }, [queryClient]);

    // --- AUTOMATION: Sync Vacancies to Marketplace ---
    useEffect(() => {
        setMarketplaceListings(currentListings => {
            // Drop orphans first: system-sourced listings whose property (or unit)
            // no longer exists must never remain published.
            const pruned = properties.length === 0 ? currentListings : currentListings.filter(l => {
                if ((l as any).source === 'ThirdParty') return true;
                if (String(l.propertyId || '').startsWith('manual-prop-')) return true;
                const prop = properties.find(p => p.id === l.propertyId);
                if (!prop) return false;
                return !l.unitId || prop.units.some(u => u.id === l.unitId);
            });
            const newListings = [...pruned];
            let hasChanges = pruned.length !== currentListings.length;

            // Include both fully-vacant units and units whose tenant has issued
            // notice (vacating soon). Vacating-soon units are listed so
            // affiliates/agents/tenants can pre-book from the vacate date.
            const allVacantUnits = properties.flatMap(p =>
                p.units.flatMap(u => {
                    if (isUnitSafelyVacant(u, tenants, p)) {
                        return [{ unit: u, property: p, vacatingSoon: false as const, vacateDate: undefined as string | undefined }];
                    }
                    const info = getUnitVacatingInfo(u, tenants, p);
                    if (info.vacatingSoon) {
                        return [{ unit: u, property: p, vacatingSoon: true as const, vacateDate: info.vacateDate }];
                    }
                    return [];
                })
            );
            allVacantUnits.forEach(({ unit, property, vacatingSoon, vacateDate }) => {
                // Village/Zone only — location (e.g. "Kipchebor") and higher levels are intentionally
                // excluded. If no village/zone is set on the property, unit location remains blank.
                const villageZone = (property.zone || '').trim();
                const descriptionSuffix = villageZone ? ` available in ${villageZone}` : ' available';
                const availabilityPrefix = vacatingSoon
                    ? (vacateDate ? `Vacating on ${new Date(vacateDate).toDateString()} — ` : 'Vacating end of month — ')
                    : '';
                const nextDescription = `${availabilityPrefix}Vacant ${unit.unitType || unit.bedrooms + 'BR'} unit${descriptionSuffix}.`;
                const existingListing = newListings.find(l => l.unitId === unit.id);
                if (!existingListing) {
                    const landlord = landlords.find(l => l.id === property.landlordId);
                    const assignedAgent = staff.find(s => s.id === property.assignedAgentId);
                    const affiliate = landlords.find(l => l.role === 'Affiliate' && l.id === property.landlordId);
                    const contactOwner = assignedAgent || affiliate || landlord;
                    const depositAmount = property.deposit?.required ? (property.deposit?.months || 1) * (unit.rent || property.defaultMonthlyRent || 0) : 0;
                    const newListing: MarketplaceListing = {
                        id: `auto-lst-${unit.id}-${Date.now()}`,
                        propertyId: property.id,
                        propertyName: property.name,
                        unitId: unit.id,
                        unitNumber: unit.unitNumber,
                        type: 'Rent',
                        status: 'Published',
                        price: unit.rent || property.defaultMonthlyRent || 0,
                        currency: 'KES',
                        description: nextDescription,
                        title: `${property.name} - ${unit.unitNumber}`,
                        location: villageZone,
                        pinLocationUrl: property.pinLocationUrl || '',
                        images: property.profilePictureUrl ? [property.profilePictureUrl] : [],
                        features: unit.amenities || [],
                        ownerDetails: {
                            name: contactOwner?.name || 'Property Manager',
                            contact: contactOwner?.phone || '',
                            email: contactOwner?.email || ''
                        },
                        rentConfig: {
                            depositAmount,
                            unitType: unit.unitType
                        } as any,
                        dateCreated: new Date().toISOString(),
                        // @ts-ignore — extra metadata surfaced by portals when present.
                        availableFrom: vacatingSoon ? (vacateDate || null) : null,
                    } as MarketplaceListing;
                    newListings.push(newListing);
                    hasChanges = true;
                } else if (existingListing.id.startsWith('auto-lst-')) {
                    const depositAmount = property.deposit?.required ? (property.deposit?.months || 1) * (unit.rent || property.defaultMonthlyRent || 0) : 0;
                    const existingDeposit = (existingListing.rentConfig as any)?.depositAmount;
                    const existingUnitType = (existingListing.rentConfig as any)?.unitType;
                    const newPrice = unit.rent || property.defaultMonthlyRent || 0;
                    
                    if (existingListing.location !== villageZone || 
                        existingListing.description !== nextDescription || 
                        (existingListing as any).availableFrom !== (vacatingSoon ? (vacateDate || null) : null) ||
                        existingDeposit !== depositAmount ||
                        existingUnitType !== unit.unitType ||
                        existingListing.price !== newPrice
                        ) {
                        const idx = newListings.indexOf(existingListing);
                        newListings[idx] = {
                            ...existingListing,
                            location: villageZone,
                            description: nextDescription,
                            status: 'Published',
                            price: newPrice,
                            rentConfig: {
                                ...(existingListing.rentConfig || {}),
                                depositAmount,
                                unitType: unit.unitType
                            } as any,
                            // @ts-ignore
                            availableFrom: vacatingSoon ? (vacateDate || null) : null,
                        };
                        hasChanges = true;
                    }
                }
            });
            newListings.forEach((listing, index) => {
                if (listing.type === 'Rent') {
                    const prop = properties.find(p => p.id === listing.propertyId);
                    const unit = prop?.units.find(u => u.id === listing.unitId);
                    const landlord = landlords.find(l => l.id === prop?.landlordId);
                    const assignedAgent = staff.find(s => s.id === prop?.assignedAgentId);
                    const affiliate = landlords.find(l => l.role === 'Affiliate' && l.id === prop?.landlordId);
                    const contactOwner = assignedAgent || affiliate || landlord;
                    // Treat a unit as still available (not "Rented") when it's
                    // safely vacant OR its current tenant is vacating soon.
                    const stillAvailable = !!(unit && prop && (isUnitSafelyVacant(unit, tenants, prop) || getUnitVacatingInfo(unit, tenants, prop).vacatingSoon));
                    if (unit && !stillAvailable && listing.status === 'Published') {
                        newListings[index] = { ...listing, status: 'Rented' };
                        hasChanges = true;
                    } else if (unit && prop) {
                        const nextOwner = {
                            name: contactOwner?.name || 'Property Manager',
                            contact: contactOwner?.phone || '',
                            email: contactOwner?.email || ''
                        };
                        const nextPin = prop.pinLocationUrl || '';
                        const nextLocation = (prop.zone || '').trim();
                        if (
                            listing.location !== nextLocation ||
                            (listing.pinLocationUrl || '') !== nextPin ||
                            listing.ownerDetails?.name !== nextOwner.name ||
                            listing.ownerDetails?.contact !== nextOwner.contact ||
                            listing.ownerDetails?.email !== nextOwner.email
                        ) {
                            newListings[index] = {
                                ...listing,
                                location: nextLocation,
                                pinLocationUrl: nextPin,
                                ownerDetails: { ...listing.ownerDetails, ...nextOwner },
                            };
                            hasChanges = true;
                        }
                    }
                }
            });
            return hasChanges ? newListings : currentListings;
        });
    }, [properties, tenants, landlords, staff]);

    // ... (Keep existing update functions) ...
    const buildPendingApplicantTenant = React.useCallback((application: TenantApplication): TenantProfile => {
        const rentAmount = Number(application.rentAmount || 0);
        const depositMonths = Math.max(1, Number(application.depositMonths ?? 1));
        const depositExpected = application.depositExempt
            ? 0
            : application.rentExtension?.enabled
                ? Number(application.rentExtension.depositPaidUpfront || 0)
                : application.proratedDeposit?.enabled
                    ? Number(application.proratedDeposit.totalDepositAmount || 0)
                    : rentAmount * depositMonths;

        return {
            id: application.id,
            name: application.name,
            username: '',
            email: String(application.email || ''),
            phone: String(application.phone || ''),
            alternativePhone: (application as any).alternativePhone || undefined,
            nextOfKinName: (application as any).nextOfKinName || undefined,
            nextOfKinPhone: (application as any).nextOfKinPhone || undefined,
            nextOfKinRelationship: (application as any).nextOfKinRelationship || undefined,
            idNumber: String(application.idNumber || ''),
            status: 'PendingApproval',
            // An application may contain a preferred/preselected unit, but it
            // is not an allocation until an administrator approves it. Never
            // mirror those fields onto the login-capable pending tenant.
            propertyId: undefined,
            propertyName: undefined,
            unitId: undefined,
            unit: '',
            rentAmount: 0,
            rentDueDate: application.rentDueDate,
            rentGraceDays: application.rentGraceDays,
            depositPaid: Number(application.depositPaid || 0),
            depositExpected,
            rentStartDate: application.rentStartDate || application.leaseStartDate || undefined,
            onboardingDate: application.submittedDate || getTodayIsoDate(),
            leaseSigned: !!application.leaseSigned,
            leaseStartDate: application.leaseStartDate,
            leaseEnd: application.leaseEnd,
            leaseTermType: (application as any).leaseTermType,
            leaseTermMonths: (application as any).leaseTermMonths,

            paymentHistory: [],
            outstandingBills: [],
            outstandingFines: [],
            maintenanceRequests: [],
            avatar: application.avatar,
            profilePicture: application.profilePicture,
            kraPin: application.kraPin,
            role: 'Tenant',
            referrerId: application.referrerId,
            referralCode: application.referralCode,
            authUserId: application.authUserId,
            depositExempt: application.depositExempt,
            depositMonths,
            proratedDeposit: application.proratedDeposit,
            rentExtension: application.rentExtension,
            waterDeposit: application.waterDeposit,
            electricityDeposit: application.electricityDeposit,
            occupancyType: (application as any).occupancyType || undefined,
            mainTenantId: (application as any).mainTenantId || undefined,
            _subUnitDrafts: (application as any)._subUnitDrafts || undefined,
        };
    }, []);
    const syncPendingApplicantTenant = React.useCallback((application: TenantApplication) => {
        if (application.status === 'Rejected') {
            setTenants(prev => prev.filter(t => !(t.id === application.id && t.status === 'PendingApproval')));
            return;
        }

        const mirrored = buildPendingApplicantTenant(application);
        setTenants(prev => {
            const existing = prev.find(t => t.id === application.id);
            if (!existing) return [mirrored, ...prev];
            if (existing.status !== 'PendingApproval') return prev;
            return prev.map(t => t.id === application.id ? {
                ...t,
                ...mirrored,
                paymentHistory: t.paymentHistory || [],
                outstandingBills: t.outstandingBills || [],
                outstandingFines: t.outstandingFines || [],
                maintenanceRequests: t.maintenanceRequests || [],
                nextDueDate: t.nextDueDate,
                activationDate: t.activationDate,
            } : t);
        });
    }, [buildPendingApplicantTenant, setTenants]);
    const addTenant = (t: TenantProfile) => setTenants(prev => [ensureExistingTenantBackdatedPayments(t), ...prev]);
    const updateTenant = (id: string, d: Partial<TenantProfile>) => setTenants(prev => prev.map(t => t.id === id ? ensureExistingTenantBackdatedPayments({ ...t, ...d }) : t));
    const deleteTenant = (id: string) => {
        const authUid = tenants.find(t => t.id === id)?.authUserId;
        // Tombstone first: cancels any queued debounced write for this tenant
        // and blocks every future write/rehydrate path from resurrecting it.
        _deletedTenantIds.current.add(id);
        _pendingChangedTenants.current = _pendingChangedTenants.current.filter(t => t.id !== id);
        setTenants(prev => prev.filter(t => t.id !== id));
        // Also drop any tenant_application row keyed by the same id so the
        // "re-hydrate from applications" effect below doesn't resurrect the
        // tenant on the next reload.
        setApplications(prev => prev.filter(a => a.id !== id));
        (async () => {
            const { error: delErr } = await supabase.schema('app').rpc('delete_tenant', { p_id: id });
            if (delErr) console.warn('[Supabase] delete_tenant RPC error:', delErr.message);
            // Ensure the row is gone from every persistence surface —
            // full tenants table, partial tenants table, and either
            // application table — so a reload cannot revive it.
            const { error: tblErr } = await supabase.from('tenants').delete().eq('id', id);
            if (tblErr) console.warn('[Supabase] tenants delete error:', tblErr.message);
            const { error: pTblErr } = await supabase.from('partial_tenants').delete().eq('id', id);
            if (pTblErr) console.warn('[Supabase] partial_tenants delete error:', pTblErr.message);
            const { error: appErr } = await supabase.from('tenant_applications').delete().eq('id', id);
            if (appErr) console.warn('[Supabase] tenant_applications delete error:', appErr.message);
            const { error: pAppErr } = await supabase.from('partial_tenant_applications').delete().eq('id', id);
            if (pAppErr) console.warn('[Supabase] partial_tenant_applications delete error:', pAppErr.message);
            const authTarget = isAuthUUID(id) ? id : (authUid && isAuthUUID(authUid) ? authUid : null);
            if (authTarget) {
                const { error } = await supabase.schema('app').rpc('admin_delete_auth_user', { p_user_id: authTarget });
                if (error) console.warn('[Supabase] admin_delete_auth_user (tenant) error:', error.message);
            }
        })();
    };
    const addProperty = (p: Property) => setProperties(prev => [p, ...prev]);
    const updateProperty = (id: string, d: Partial<Property>) => {
        setProperties(prev => prev.map(p => p.id === id ? { ...p, ...d } : p));
        // Propagate unit name, number, tag, and rent changes globally:
        // when a unit's details are edited, sync tenants, tasks, bills, apps, and listings.
        if (Array.isArray((d as any).units)) {
            const before = (properties.find(p => p.id === id)?.units) || [];
            const after = (d as any).units as any[];
            const rentChanges = new Map<string, number>(); // matchKey -> new rent
            
            // Map of unitId -> { oldKeys: Set<string>, newUnitNumber: string, newUnitTag: string, newUnitName: string }
            const unitIdentityChanges = new Map<string, { oldKeys: Set<string>; newUnitNumber: string; newUnitTag: string; newUnitName: string }>();

            after.forEach((u: any) => {
                const prevU = before.find((b: any) => b.id === u.id);
                const newRent = Number(u.rent || 0);
                const oldRent = Number(prevU?.rent || 0);
                if (prevU && Number.isFinite(newRent) && newRent !== oldRent) {
                    [u.id, u.unitNumber, u.unitTag, u.name].forEach((k: any) => {
                        const key = String(k || '').trim().toLowerCase();
                        if (key) rentChanges.set(key, newRent);
                    });
                }

                if (prevU) {
                    const oldUnitNum = String(prevU.unitNumber || prevU.name || '').trim();
                    const oldUnitTag = String(prevU.unitTag || '').trim();
                    const oldUnitName = String(prevU.name || '').trim();

                    const newUnitNum = String(u.unitNumber || u.name || '').trim();
                    const newUnitTag = String(u.unitTag || u.unitNumber || u.name || '').trim();
                    const newUnitName = String(u.name || u.unitNumber || '').trim();

                    if (
                        (oldUnitNum && oldUnitNum !== newUnitNum) ||
                        (oldUnitTag && oldUnitTag !== newUnitTag) ||
                        (oldUnitName && oldUnitName !== newUnitName)
                    ) {
                        const oldKeys = new Set<string>();
                        [prevU.id, oldUnitNum, oldUnitTag, oldUnitName].forEach(k => {
                            const normalized = String(k || '').trim().toLowerCase();
                            if (normalized) oldKeys.add(normalized);
                        });
                        unitIdentityChanges.set(u.id, {
                            oldKeys,
                            newUnitNumber: newUnitNum,
                            newUnitTag: newUnitTag,
                            newUnitName: newUnitName
                        });
                    }
                }
            });

            // 1. Sync tenants (rent changes + unit name/number/tag changes)
            if (rentChanges.size > 0 || unitIdentityChanges.size > 0) {
                setTenants(prev => prev.map(t => {
                    let updated = { ...t };
                    let wasModified = false;

                    // Sync unit name/number/tag if this tenant belongs to the property or unit
                    const isSameProperty = t.propertyId === id;
                    const tenantKeys = [t.unitId, t.unitNumber, (t as any).unitTag, t.unitName, (t as any).unit]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);

                    for (const [unitId, change] of unitIdentityChanges.entries()) {
                        const isUnitMatch = t.unitId === unitId || tenantKeys.some(k => change.oldKeys.has(k));
                        if (isSameProperty && isUnitMatch) {
                            if (
                                t.unit !== change.newUnitNumber ||
                                t.unitNumber !== change.newUnitNumber ||
                                t.unitName !== change.newUnitName ||
                                (t as any).unitTag !== change.newUnitTag ||
                                (t as any).paymentAccount !== change.newUnitTag
                            ) {
                                updated = {
                                    ...updated,
                                    unitId: unitId,
                                    unit: change.newUnitNumber,
                                    unitNumber: change.newUnitNumber,
                                    unitName: change.newUnitName,
                                    unitTag: change.newUnitTag,
                                    paymentAccount: change.newUnitTag,
                                };
                                wasModified = true;
                            }
                        }
                    }

                    // Sync rent amount
                    if (rentChanges.size > 0) {
                        for (const k of tenantKeys) {
                            if (rentChanges.has(k)) {
                                const nextRent = rentChanges.get(k)!;
                                if (Number(updated.rentAmount || 0) !== nextRent) {
                                    updated = { ...updated, rentAmount: nextRent };
                                    wasModified = true;
                                }
                            }
                        }
                    }

                    return wasModified ? updated : t;
                }));
            }

            // 2. Sync Tasks
            if (unitIdentityChanges.size > 0) {
                setTasks(prev => prev.map(tk => {
                    if (tk.propertyId !== id && !tk.unitId) return tk;
                    const tkKeys = [tk.unitId, (tk as any).unit, (tk as any).unitTag]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);
                    for (const [unitId, change] of unitIdentityChanges.entries()) {
                        if (tk.unitId === unitId || tkKeys.some(k => change.oldKeys.has(k))) {
                            return {
                                ...tk,
                                unitId: unitId,
                                unit: change.newUnitNumber,
                                unitTag: change.newUnitTag,
                            };
                        }
                    }
                    return tk;
                }));

                // 3. Sync Bills
                setBills(prev => prev.map(b => {
                    if (b.propertyId !== id && !(b as any).unitId) return b;
                    const bKeys = [(b as any).unitId, b.unit]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);
                    for (const [unitId, change] of unitIdentityChanges.entries()) {
                        if ((b as any).unitId === unitId || bKeys.some(k => change.oldKeys.has(k))) {
                            return {
                                ...b,
                                unit: change.newUnitNumber,
                            };
                        }
                    }
                    return b;
                }));

                // 4. Sync Applications
                setApplications(prev => prev.map(app => {
                    if (app.propertyId !== id) return app;
                    const appKeys = [app.unitId, app.unit]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);
                    for (const [unitId, change] of unitIdentityChanges.entries()) {
                        if (app.unitId === unitId || appKeys.some(k => change.oldKeys.has(k))) {
                            return {
                                ...app,
                                unitId: unitId,
                                unit: change.newUnitNumber,
                                unitTag: change.newUnitTag,
                            };
                        }
                    }
                    return app;
                }));

                // 5. Sync Marketplace Listings
                setMarketplaceListings(prev => prev.map(l => {
                    if (l.propertyId !== id) return l;
                    const lKeys = [l.unitId, l.unitNumber]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);
                    for (const [unitId, change] of unitIdentityChanges.entries()) {
                        if (l.unitId === unitId || lKeys.some(k => change.oldKeys.has(k))) {
                            return {
                                ...l,
                                unitId: unitId,
                                unitNumber: change.newUnitNumber,
                                paymentTag: change.newUnitTag,
                            };
                        }
                    }
                    return l;
                }));
            }
        }
    };
    const deleteProperty = (id: string) => {
        setProperties(prev => prev.filter(p => p.id !== id));
        // Cascade: a deleted property must disappear everywhere, including
        // published marketplace/website listings for its units.
        setMarketplaceListings(prev => prev.filter(l => l.propertyId !== id));
        (async () => {
            const { error: tblErr } = await supabase.from('properties').delete().eq('id', id);
            if (tblErr) console.warn('[Supabase] properties delete error:', tblErr.message);
            const { error: pTblErr } = await supabase.from('partial_properties').delete().eq('id', id);
            if (pTblErr) console.warn('[Supabase] partial_properties delete error:', pTblErr.message);
        })();
    };
    const addUnitToProperty = (propId: string, unit: Unit) => setProperties(prev => prev.map(p => p.id === propId ? { ...p, units: [...p.units, unit] } : p));
    const addLandlord = (u: User) => setLandlords(prev => [u, ...prev]);
    const updateLandlord = (id: string, d: Partial<User>) => setLandlords(prev => prev.map(u => u.id === id ? {...u, ...d} : u));
    const deleteLandlord = (id: string) => {
        setLandlords(prev => prev.filter(u => u.id !== id));
        setLandlordApplications(prev => prev.filter(a => a.id !== id));
        (async () => {
            // Prefer the atomic RPC: unlinks properties + deletes across all
            // landlord tables + best-effort auth cleanup in a single txn.
            const { error: rpcErr } = await supabase.schema('app').rpc('delete_landlord', { p_id: id });
            if (!rpcErr) return;
            console.warn('[Supabase] delete_landlord RPC error, falling back:', rpcErr.message);
            // Fallback: attempt individual deletes (older environments without the RPC).
            await supabase.from('properties').update({ landlord_id: null }).eq('landlord_id', id);
            await supabase.from('landlords').delete().eq('id', id);
            await supabase.from('partial_landlords').delete().eq('id', id);
            await supabase.from('landlord_applications').delete().eq('id', id);
            await supabase.from('partial_landlord_applications').delete().eq('id', id);
            if (isAuthUUID(id)) {
                await supabase.schema('app').rpc('admin_delete_auth_user', { p_user_id: id });
            }
        })();
    };
    const addTask = (t: Task) => setTasks(prev => [t, ...prev]);
    const updateTask = (id: string, d: Partial<Task>) => setTasks(prev => prev.map(t => t.id === id ? {...t, ...d} : t));
    const addQuotation = (q: Quotation) => setQuotations(prev => [q, ...prev]);
    const updateQuotation = (id: string, d: Partial<Quotation>) => setQuotations(prev => prev.map(q => q.id === id ? {...q, ...d} : q));
    const addApplication = (a: TenantApplication) => {
        setApplications(prev => [a, ...prev]);
        syncPendingApplicantTenant(a);
    };
    const updateApplication = (id: string, d: Partial<TenantApplication>) => {
        const existing = applications.find(a => a.id === id);
        const nextApplication = { ...(existing || { id }), ...d } as TenantApplication;
        setApplications(prev => prev.map(a => a.id === id ? {...a, ...d} : a));
        syncPendingApplicantTenant(nextApplication);
    };
    const deleteApplication = (id: string, options?: { keepTenant?: boolean; keepAuthUser?: boolean }) => {
        const authUid = applications.find(a => a.id === id)?.authUserId;
        const pendingApplicantTenant = tenants.find(t => t.id === id && t.status === 'PendingApproval');
        setApplications(prev => prev.filter(a => a.id !== id));
        if (pendingApplicantTenant && !options?.keepTenant) {
            setTenants(prev => prev.filter(t => t.id !== id));
        }
        (async () => {
            const { error: delErr } = await supabase.schema('app').rpc('delete_tenant_application', { p_id: id });
            if (delErr) console.warn('[Supabase] delete_tenant_application RPC error:', delErr.message);
            if (options?.keepAuthUser) return;
            const authTarget = isAuthUUID(id) ? id : (authUid && isAuthUUID(authUid) ? authUid : null);
            if (authTarget) {
                const { error } = await supabase.schema('app').rpc('admin_delete_auth_user', { p_user_id: authTarget });
                if (error) console.warn('[Supabase] admin_delete_auth_user (application) error:', error.message);
            }
        })();
    };
    React.useEffect(() => {
        if (applicationsStatus.loading || tenantsStatus.loading || applications.length === 0) return;
        const missing = applications.filter(a => {
            if (a.status === 'Rejected') return false;
            if (_deletedTenantIds.current.has(a.id)) return false;
            const existing = tenants.find(t => t.id === a.id);
            return !existing;
        });
        if (missing.length === 0) return;
        setTenants(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const additions = missing
                .filter(a => !existingIds.has(a.id))
                .map(a => buildPendingApplicantTenant(a));
            if (additions.length === 0) return prev;
            return [...additions, ...prev];
        });
    }, [applications, applicationsStatus.loading, tenants, tenantsStatus.loading, buildPendingApplicantTenant, setTenants]);
    const addLandlordApplication = (a: LandlordApplication) => setLandlordApplications(prev => [a, ...prev]);
    const updateLandlordApplication = (id: string, d: Partial<LandlordApplication>) => setLandlordApplications(prev => prev.map(a => a.id === id ? {...a, ...d} : a));
    const deleteLandlordApplication = (id: string) => {
        setLandlordApplications(prev => prev.filter(a => a.id !== id));
        (async () => {
            const { error } = await supabase.from('landlord_applications').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete_landlord_application error:', error.message);
            const { error: pError } = await supabase.from('partial_landlord_applications').delete().eq('id', id);
            if (pError) console.warn('[Supabase] delete_partial_landlord_application error:', pError.message);
        })();
    };
    const addStaff = (s: StaffProfile) => {
        setStaff(prev => [s, ...prev]);
        // Mirror into dbStaffProfiles so mergedStaff reflects the new entry immediately,
        // without waiting for the next mount-time fetch from app.staff_profiles.
        setDbStaffProfiles(prev => {
            const key = (s.email || '').toLowerCase().trim();
            if (key && prev.some(p => (p.email || '').toLowerCase().trim() === key)) return prev;
            return [s, ...prev];
        });
    };
    const updateStaff = (id: string, d: Partial<StaffProfile>) => setStaff(prev => prev.map(s => s.id === id ? {...s, ...d} : s));
    const deleteStaff = (id: string) => {
        setStaff(prev => prev.filter(s => s.id !== id));
        // Also remove from the normalised-table mirror so mergedStaff updates immediately
        setDbStaffProfiles(prev => prev.filter(s => s.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                // Deletes auth.users row → cascades to staff_profiles, user_roles, profiles
                const { error } = await supabase.schema('app').rpc('admin_delete_auth_user', { p_user_id: id });
                if (error) console.warn('[Supabase] admin_delete_auth_user (staff) error:', error.message);
            } else {
                // Legacy generated-ID staff: remove from normalised table only
                const { error } = await supabase.schema('app').from('staff_profiles').delete().eq('id', id);
                if (error) console.warn('[Supabase] staff_profiles delete error:', error.message);
            }
        })();
    };
    const addFine = (f: FineRule) => setFines(prev => [f, ...prev]);
    const updateFine = (id: string, d: Partial<FineRule>) => setFines(prev => prev.map(f => f.id === id ? {...f, ...d} : f));
    const deleteFine = (id: string) => {
        setFines(prev => prev.filter(f => f.id !== id));
        (async () => {
            const { error: rpcErr } = await supabase.schema('app').rpc('delete_fine_rule', { p_id: id });
            if (rpcErr) {
                console.warn('[Supabase] delete_fine_rule RPC error:', rpcErr.message);
                const { error } = await supabase.from('fine_rules').delete().eq('id', id);
                if (error) console.warn('[Supabase] fine_rules delete error:', error.message);
            }
            const { error: pErr } = await supabase.from('partial_fine_rules').delete().eq('id', id);
            if (pErr) console.warn('[Supabase] partial_fine_rules delete error:', pErr.message);
        })();
    };
    const addOffboardingRecord = (r: OffboardingRecord) => setOffboardingRecords(prev => [r, ...prev]);
    const updateOffboardingRecord = (id: string, d: Partial<OffboardingRecord>) => setOffboardingRecords(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const deleteOffboardingRecord = (id: string) => {
        setOffboardingRecords(prev => prev.filter(r => r.id !== id));
        (async () => {
            const { error } = await supabase.from('offboarding_records').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete offboarding_records error:', error.message);
        })();
    };
    const addLandlordOffboardingRecord = (r: LandlordOffboardingRecord) => setLandlordOffboardingRecords(prev => [r, ...prev]);
    const updateLandlordOffboardingRecord = (id: string, d: Partial<LandlordOffboardingRecord>) => setLandlordOffboardingRecords(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const deleteLandlordOffboardingRecord = (id: string) => {
        _pendingChangedLlOffboarding.current = _pendingChangedLlOffboarding.current.filter(r => r.id !== id);
        setLandlordOffboardingRecords(prev => prev.filter(r => r.id !== id));
        (async () => {
            const { error } = await supabase.from('landlord_offboarding_records').delete().eq('id', id);
            if (error) {
                const { error: err2 } = await supabase.schema('app').from('landlord_offboarding_records').delete().eq('id', id);
                if (err2) console.warn('[Supabase] delete landlord_offboarding_records error:', error?.message, err2?.message);
            }
        })();
    };
    const addGeospatialNode = (level: any, parentPath: any, name: any) => {
        setGeospatialData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            if (level === 'County') {
                if (!newData[name]) newData[name] = {};
            } else if (level === 'SubCounty') {
                const [c] = parentPath;
                if (newData[c]) newData[c][name] = {};
            } else if (level === 'Location') {
                const [c, s] = parentPath;
                if (newData[c]?.[s]) newData[c][s][name] = {};
            } else if (level === 'Zone') {
                const [c, s, l] = parentPath;
                if (newData[c]?.[s]?.[l]) newData[c][s][l][name] = [];
            } else if (level === 'Village') {
                const [c, s, l, z] = parentPath;
                if (newData[c]?.[s]?.[l]?.[z]) {
                    if (!newData[c][s][l][z].includes(name)) newData[c][s][l][z].push(name);
                }
            }
            return newData;
        });
    }; 
    const addCommissionRule = (r: CommissionRule) => setCommissionRules(prev => [r, ...prev]);
    const updateCommissionRule = (id: string, d: Partial<CommissionRule>) => setCommissionRules(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const deleteCommissionRule = (id: string) => {
        setCommissionRules(prev => prev.filter(r => r.id !== id));
        (async () => {
            const { error } = await supabase.from('commission_rules').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete commission rule error:', error.message);
        })();
    };
    const addDeductionRule = (r: DeductionRule) => setDeductionRules(prev => [r, ...prev]);
    const updateDeductionRule = (id: string, d: Partial<DeductionRule>) => setDeductionRules(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const deleteDeductionRule = (id: string) => {
        setDeductionRules(prev => prev.filter(r => r.id !== id));
        (async () => {
            const { error } = await supabase.from('deduction_rules').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete deduction rule error:', error.message);
        })();
    };
    const addBill = (b: Bill) => setBills(prev => [b, ...prev]);
    const updateBill = (id: string, d: Partial<Bill>) => setBills(prev => prev.map(b => b.id === id ? {...b, ...d} : b));
    const deleteBill = (id: string) => {
        setBills(prev => prev.filter(b => b.id !== id));
        (async () => {
            const { error } = await supabase.from('bills').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete bill error:', error.message);
        })();
    };
    const addTenantBill = (tid: string, b: BillItem) => setTenants(prev => prev.map(t => t.id === tid ? {...t, outstandingBills: [...t.outstandingBills, b]} : t));
    const addInvoice = (i: Invoice) => setInvoices(prev => [i, ...prev]);
    const updateInvoice = (id: string, d: Partial<Invoice>) => setInvoices(prev => prev.map(i => i.id === id ? {...i, ...d} : i));
    const addMessage = (m: Message) => setMessages(prev => [m, ...prev]);
    const updateMessageStatus = (id: string, status: Message['status']) => setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    const addNotification = (n: Notification) => setNotifications(prev => [n, ...prev]);
    const markAllNotificationsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const dismissNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));
    const clearOldNotifications = () => {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        setNotifications(prev => prev.filter(n => {
            const d = new Date(n.date).getTime();
            return isNaN(d) || d >= cutoff;
        }));
    };
    const addVendor = (v: Vendor) => setVendors(prev => [v, ...prev]);
    const updateVendor = (id: string, d: Partial<Vendor>) => setVendors(prev => prev.map(v => v.id === id ? {...v, ...d} : v));
    const deleteVendor = (id: string) => {
        setVendors(prev => prev.filter(v => v.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                const { error } = await supabase.schema('app').rpc('admin_delete_auth_user', { p_user_id: id });
                if (error) console.warn('[Supabase] admin_delete_auth_user (vendor) error:', error.message);
            }
        })();
    };
    const addAuditLog = (log: AuditLogEntry) => setAuditLogs(prev => [log, ...prev]);
    const updateExternalTransaction = (id: string, d: Partial<ExternalTransaction>) => setExternalTransactions(prev => prev.map(t => t.id === id ? {...t, ...d} : t));
    const addOverpayment = (o: Overpayment) => setOverpayments(prev => [o, ...prev]);
    const updateOverpayment = (id: string, d: Partial<Overpayment>) => setOverpayments(prev => prev.map(o => o.id === id ? {...o, ...d} : o));
    const moveTenantPayment = async (f: string, t: string, r: string): Promise<void> => {
        const normalizedReference = String(r || '').trim().toUpperCase();
        // Server-authoritative move FIRST: atomically strips the entry from the
        // source tenant's payment_history, tombstones it there so no reconcile
        // path can resurrect it, appends it to the destination, and repoints the
        // payments ledger row. Only after it succeeds do we mutate local state,
        // otherwise the UI would show a move that the server never accepted.
        const { error } = await supabase.rpc('move_tenant_payment', {
            p_from_tenant_id: f,
            p_to_tenant_id: t,
            p_reference: r,
        });
        if (error) {
            console.warn('[Supabase] move_tenant_payment RPC error:', error.message);
            throw new Error(error.message);
        }
        setTenants(prev => {
            const newTenants = [...prev];
            const fromIdx = newTenants.findIndex(tenant => tenant.id === f);
            const toIdx = newTenants.findIndex(tenant => tenant.id === t);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const fromTenant = { ...newTenants[fromIdx] };
            const paymentIdx = (fromTenant.paymentHistory || []).findIndex(p =>
                String(p.reference || '').trim().toUpperCase() === normalizedReference
            );
            if (paymentIdx === -1) return prev;
            const nextFromHistory = [...(fromTenant.paymentHistory || [])];
            const [payment] = nextFromHistory.splice(paymentIdx, 1);
            fromTenant.paymentHistory = nextFromHistory;
            newTenants[fromIdx] = fromTenant;
            const toTenant = { ...newTenants[toIdx] };
            const dedupedTo = (toTenant.paymentHistory || []).filter(p =>
                String(p.reference || '').trim().toUpperCase() !== normalizedReference
            );
            toTenant.paymentHistory = [payment, ...dedupedTo];
            newTenants[toIdx] = toTenant;
            return newTenants;
        });
    };
    const deleteTenantPayment = async (tenantId: string, reference: string): Promise<void> => {
        // Permanent, server-authoritative delete. The RPC tombstones the
        // reference, strips it from the tenant JSON history and removes the
        // ledger row, so it can never re-appear after a reload.
        const { error } = await supabase.rpc('delete_tenant_payment', {
            p_tenant_id: tenantId,
            p_reference: reference,
        });
        if (error) {
            console.warn('[Supabase] delete_tenant_payment RPC error:', error.message);
            throw new Error(error.message);
        }
        const base = reference.replace(/^MULTI-/, '');
        setTenants(prev => prev.map(t => t.id !== tenantId ? t : {
            ...t,
            paymentHistory: (t.paymentHistory || []).filter(p => {
                const ref = String(p.reference || '').trim();
                return ref !== reference && ref !== base && ref !== `MULTI-${base}`;
            }),
        }));
    };
    const addWorkflow = (w: Workflow) => setWorkflows(prev => [w, ...prev]);
    const updateWorkflow = (id: string, d: Partial<Workflow>) => setWorkflows(prev => prev.map(w => w.id === id ? { ...w, ...d } : w));
    const addAutomationRule = (r: CommunicationAutomationRule) => setAutomationRules(prev => [r, ...prev]);
    const updateAutomationRule = (id: string, d: Partial<CommunicationAutomationRule>) => setAutomationRules(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const addEscalationRule = (r: EscalationRule) => setEscalationRules(prev => [r, ...prev]);
    const updateEscalationRule = (id: string, d: Partial<EscalationRule>) => setEscalationRules(prev => prev.map(r => r.id === id ? { ...r, ...d} : r));
    const updateSystemSettings = (settings: Partial<SystemSettings>) => setSystemSettings(prev => ({ ...prev, ...settings }));
    const addPreventiveTask = (t: PreventiveTask) => setPreventiveTasks(prev => [t, ...prev]);
    const addTemplate = (t: CommunicationTemplate) => setTemplates(prev => [t, ...prev]);
    const updateTemplate = (id: string, d: Partial<CommunicationTemplate>) => setTemplates(prev => prev.map(t => t.id === id ? {...t, ...d} : t));
    const deleteTemplate = (id: string) => setTemplates(prev => prev.filter(t => t.id !== id));
    const addIncomeSource = (s: IncomeSource) => setIncomeSources(prev => [s, ...prev]);
    const updateIncomeSource = (id: string, d: Partial<IncomeSource>) => setIncomeSources(prev => prev.map(s => s.id === id ? {...s, ...d} : s));
    const addFund = (f: Fund) => setFunds(prev => [f, ...prev]);
    const updateFund = (id: string, d: Partial<Fund>) => setFunds(prev => prev.map(f => f.id === id ? { ...f, ...d } : f));
    const deleteFund = (id: string) => setFunds(prev => prev.filter(f => f.id !== id));
    const addInvestment = (inv: Investment) => setInvestments(prev => [inv, ...prev]);
    const updateInvestment = (id: string, d: Partial<Investment>) => setInvestments(prev => prev.map(i => i.id === id ? { ...i, ...d } : i));
    const addWithdrawal = (req: WithdrawalRequest) => setWithdrawals(prev => [req, ...prev]);
    const updateWithdrawal = (id: string, d: Partial<WithdrawalRequest>) => setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, ...d } : w));
    const addRenovationInvestor = (inv: RenovationInvestor) => setRenovationInvestors(prev => [inv, ...prev]);
    const updateRenovationInvestor = (id: string, d: Partial<RenovationInvestor>) => setRenovationInvestors(prev => prev.map(i => i.id === id ? { ...i, ...d } : i));
    const deleteRenovationInvestor = (id: string) => {
        setRenovationInvestors(prev => prev.filter(i => i.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                const { error } = await supabase.schema('app').rpc('admin_delete_auth_user', { p_user_id: id });
                if (error) console.warn('[Supabase] admin_delete_auth_user (investor) error:', error.message);
            }
        })();
    };
    const addRFTransaction = (tx: RFTransaction) => setRFTransactions(prev => [tx, ...prev]);
    const updateRFTransaction = (id: string, d: Partial<RFTransaction>) => setRFTransactions(prev => prev.map(t => t.id === id ? { ...t, ...d } : t));
    const addRenovationProjectBill = (bill: RenovationProjectBill) => setRenovationProjectBills(prev => [bill, ...prev]);
    const updateRenovationProjectBill = (id: string, d: Partial<RenovationProjectBill>) => setRenovationProjectBills(prev => prev.map(b => b.id === id ? { ...b, ...d } : b));
    const addRole = (r: Role) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const tempId = r.id;
        setRoles(prev => [...prev, r]);
        (async () => {
            const payload: any = {
                name: r.name,
                description: r.description,
                is_system: r.isSystem,
                permissions: r.permissions,
                accessible_submodules: r.accessibleSubmodules,
                widget_access: r.widgetAccess || []
            };
            if (uuidRegex.test(tempId)) payload.id = tempId;
            console.log('[Supabase] role insert', payload);
            const { data, error } = await supabase
                .schema('app')
                .from('roles')
                .insert(payload)
                .select('*')
                .single();
            if (error || !data) {
                console.error('Failed to create role', error);
                setRoles(prev => prev.filter(x => x.id !== tempId));
                alert(error?.message ?? 'Failed to create role');
                return;
            }
            if (data.id && data.id !== tempId) {
                setRoles(prev => prev.map(role => role.id === tempId ? { ...role, id: data.id } : role));
            }
        })();
    };

    const updateRole = (id: string, d: Partial<Role>) => {
        setRoles(prev => prev.map(r => r.id === id ? { ...r, ...d } : r));
        (async () => {
            const patch: any = {};
            if (d.name !== undefined) patch.name = d.name;
            if (d.description !== undefined) patch.description = d.description;
            if (d.isSystem !== undefined) patch.is_system = d.isSystem;
            if (d.permissions !== undefined) patch.permissions = d.permissions;
            if (d.accessibleSubmodules !== undefined) patch.accessible_submodules = d.accessibleSubmodules;
            if (d.widgetAccess !== undefined) patch.widget_access = d.widgetAccess;
            console.log('[Supabase] role update', { id, patch });
            const { error } = await supabase
                .schema('app')
                .from('roles')
                .update(patch)
                .eq('id', id);
            if (error) {
                console.error('Failed to update role', error);
                alert(error.message ?? 'Failed to update role. Please try again.');
                const { data } = await supabase
                    .schema('app')
                    .from('roles')
                    .select('id,name,description,is_system,permissions,accessible_submodules,widget_access')
                    .order('name', { ascending: true });
                if (data) {
                    setRoles((data as any[]).map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        description: r.description ?? '',
                        isSystem: !!r.is_system,
                        permissions: (r.permissions ?? {}) as RolePermissions,
                        accessibleSubmodules: (r.accessible_submodules ?? []) as string[],
                        widgetAccess: (r.widget_access ?? []) as string[],
                    })));
                }
            }
        })();
    };

    const deleteRole = (id: string) => {
        const prevRoles = roles;
        setRoles(prev => prev.filter(r => r.id !== id));
        (async () => {
            console.log('[Supabase] role delete', { id });
            const { error } = await supabase
                .schema('app')
                .from('roles')
                .delete()
                .eq('id', id);
            if (error) {
                console.error('Failed to delete role', error);
                setRoles(prevRoles);
                alert(error.message ?? 'Failed to delete role. Please try again.');
            }
        })();
    };
    const addScheduledReport = (r: ScheduledReport) => setScheduledReports(prev => [r, ...prev]);
    const deleteScheduledReport = (id: string) => setScheduledReports(prev => prev.filter(r => r.id !== id));
    const addTaxRecord = (r: TaxRecord) => setTaxRecords(prev => [r, ...prev]);
    const updateTaxRecord = (id: string, d: Partial<TaxRecord>) => setTaxRecords(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const getOccupancyRate = () => {
        // Tenant-link based occupancy (single source of truth).
        // A unit is "occupied" when at least one active tenant is linked to
        // it (by unitId, unitNumber, unitTag, or name). Repurposed units
        // (distressed/uninhabitable/landlord residence/caretaker/store)
        // are excluded from the denominator – they are neither vacant nor
        // occupied.
        // isRepurposedUnit imported at top
        const occupyingStatuses = ['active','pending','pendingpayment','overdue','notice'];
        const norm = (v: any) => String(v || '').trim().toLowerCase();
        let rentable = 0;
        let occupied = 0;
        for (const p of displayedProperties) {
            const pTenants = displayedTenants.filter(t => t.propertyId === p.id && occupyingStatuses.includes(norm(t.status)));
            for (const u of (p.units || [])) {
                if (isRepurposedUnit(u)) continue;
                rentable++;
                const isOccupied = u.status === 'Occupied' || pTenants.some(t =>
                    (t.unitId && t.unitId === u.id) ||
                    (norm(t.unit) && [u.unitNumber, (u as any).unitTag, (u as any).name].some(c => norm(c) && norm(c) === norm(t.unit)))
                );
                if (isOccupied) occupied++;
            }
        }
        return rentable > 0 ? Math.round((occupied / rentable) * 100) : 0;
    };
    const getTotalRevenue = () => {
        return displayedTenants.reduce((acc, t) => acc + (t.rentAmount || 0), 0);
    };

    const checkPermission = (module: string, action: string): boolean => {
        if (!currentUser) return false;
        if (currentUser.role === 'Super Admin') return true; 

        const roleDef = roles.find(r => r.name === currentUser.role);
        if (!roleDef) return false;

        const hasAccess = roleDef.accessibleSubmodules.some(path => 
            path === module || path.startsWith(`${module}/`)
        );
        
        if (!hasAccess) return false;

        const baseModule = module.split('/')[0];
        const modulePerms = roleDef.permissions[baseModule];
        
        if (modulePerms && (modulePerms as any)[action] !== undefined) {
             return (modulePerms as any)[action] === true;
        }

        return false;
    };

    // Marketplace CRUD
    const persistMarketplaceListing = (listing: MarketplaceListing) => {
        void supabase.from('marketplace_listings').upsert({
            id: listing.id,
            payload: listing as unknown as object,
            source: listing.source || 'Managed',
            status: listing.status,
            updated_at: new Date().toISOString(),
        }).then(({ error }) => {
            if (error) console.warn('[listings] normalized upsert failed:', error.message);
        });
    };
    const addMarketplaceListing = (listing: MarketplaceListing) => {
        setMarketplaceListings(prev => [listing, ...prev]);
        persistMarketplaceListing(listing);
    };
    const updateMarketplaceListing = (id: string, d: Partial<MarketplaceListing>) => setMarketplaceListings(prev => prev.map(l => {
        if (l.id !== id) return l;
        const next = { ...l, ...d };
        persistMarketplaceListing(next);
        return next;
    }));
    const deleteMarketplaceListing = (id: string) => {
        setMarketplaceListings(prev => prev.filter(l => l.id !== id));
        void supabase.from('marketplace_listings').delete().eq('id', id).then(({ error }) => {
            if (error) console.warn('[listings] normalized delete failed:', error.message);
        });
    };
    
    const markUnitOccupied = (propertyId: string, unitId: string) => {
        setProperties(prev => prev.map(p => {
            if (p.id === propertyId) {
                return {
                    ...p,
                    units: p.units.map(u => u.id === unitId ? { ...u, status: 'Occupied' as const } : u)
                };
            }
            return p;
        }));
        setMarketplaceListings(prev => {
            const listing = prev.find(l => l.propertyId === propertyId && l.unitId === unitId);
            if (listing) {
                const endStatus = listing.type === 'Sale' ? 'Sold' : 'Rented';
                return prev.map(l => l.id === listing.id ? { ...l, status: endStatus } : l);
            }
            return prev;
        });
    };

    // --- LEADS CRUD & Sync ---
    const addLead = (lead: Lead) => setLeads(prev => [lead, ...prev]);
    const updateLead = (id: string, d: Partial<Lead>) => setLeads(prev => prev.map(l => l.id === id ? { ...l, ...d } : l));
    const deleteLead = (id: string) => setLeads(prev => prev.filter(l => l.id !== id));

    const syncWebsiteLeads = async () => {
        try {
            const newLeads = await websiteApi.fetchLeads();
            if (newLeads.length > 0) {
                setLeads(prev => {
                    const existingIds = new Set(prev.map(l => l.id));
                    const fresh = newLeads.filter(l => !existingIds.has(l.id));
                    return fresh.length > 0 ? [...fresh, ...prev] : prev;
                });
            }
        } catch (e) {
            console.error('[DataContext] syncWebsiteLeads failed:', e);
        }
    };

    // --- Fundi Jobs ---
    const addFundiJob = (job: FundiJob) => setFundiJobs(prev => [job, ...prev]);
    const updateFundiJob = (id: string, d: Partial<FundiJob>) => setFundiJobs(prev => prev.map(j => j.id === id ? { ...j, ...d } : j));
    
    const syncFundiJobs = async () => {
        try {
            // Primary source: Supabase app_state (populated by fundi-job-submit Edge Function)
            queryClient.invalidateQueries({ queryKey: ['full_app_state', 'tm_fundi_jobs_v12'] });

            // Secondary source: website API (if VITE_WEBSITE_API_URL is configured)
            const newJobs = await websiteApi.fetchFundiJobs();
            if (newJobs.length > 0) {
                setFundiJobs(prev => {
                    const existingIds = new Set(prev.map(j => j.id));
                    const fresh = newJobs.filter(j => !existingIds.has(j.id));
                    return fresh.length > 0 ? [...fresh, ...prev] : prev;
                });
            }
        } catch (e) {
            console.error('[DataContext] syncFundiJobs failed:', e);
        }
    };

    // --- Unified User Management & Hash-Based Filtering ---
    const [currentHash, setCurrentHash] = React.useState(typeof window !== 'undefined' ? window.location.hash : '');
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleHash = () => setCurrentHash(window.location.hash || '');
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, []);

    const isPartialMode = currentHash.startsWith('#/partial-rms');

    // Dynamic filters based on Partial vs Full RMS
    const displayedProperties = React.useMemo(() => {
        return properties.filter(p => isPartialMode ? p.managementType === 'Partial' : p.managementType !== 'Partial');
    }, [properties, isPartialMode]);

    const displayedTenants = React.useMemo(() => {
        return tenants.filter(t => {
            const prop = properties.find(p => p.id === t.propertyId || p.name === t.propertyName);
            const isPartialProp = prop ? prop.managementType === 'Partial' : false;
            return isPartialMode ? isPartialProp : !isPartialProp;
        });
    }, [tenants, properties, isPartialMode]);

    const displayedBills = React.useMemo(() => {
        return bills.filter(b => {
            const prop = properties.find(p => p.id === b.propertyId || p.name === b.propertyName);
            const isPartialProp = prop ? prop.managementType === 'Partial' : false;
            return isPartialMode ? isPartialProp : !isPartialProp;
        });
    }, [bills, properties, isPartialMode]);

    const displayedInvoices = React.useMemo(() => {
        return invoices.filter(inv => {
            const prop = properties.find(p => p.id === inv.propertyId || p.name === inv.propertyName);
            const isPartialProp = prop ? prop.managementType === 'Partial' : false;
            return isPartialMode ? isPartialProp : !isPartialProp;
        });
    }, [invoices, properties, isPartialMode]);

    const displayedTasks = React.useMemo(() => {
        return tasks.filter(t => {
            const prop = properties.find(p => p.id === t.propertyId || p.name === t.propertyName);
            const isPartialProp = prop ? prop.managementType === 'Partial' : false;
            return isPartialMode ? isPartialProp : !isPartialProp;
        });
    }, [tasks, properties, isPartialMode]);

    const displayedApplications = React.useMemo(() => {
        return applications.filter(a => {
            const prop = properties.find(p => p.id === a.propertyId || p.name === a.propertyName);
            const isPartialProp = prop ? prop.managementType === 'Partial' : false;
            return isPartialMode ? isPartialProp : !isPartialProp;
        });
    }, [applications, properties, isPartialMode]);

    const users = React.useMemo(() => {
        // Map all to User type for unified access
        const mappedTenants = displayedTenants.map(t => ({ ...t, role: 'Tenant' } as unknown as User));
        const mappedStaff = mergedStaff.map(s => ({ ...s, role: s.role } as unknown as User));
        // Vendors include Contractors and Fundis. Surfacing them via `users`
        // ensures maintenance assignment, mentions, and search find them just
        // like any other operational user.
        const mappedVendors = (vendors || []).map(v => ({
            ...v,
            role: ((v as any).userRole === 'Fundi' ? 'Fundi' : 'Contractor'),
        } as unknown as User));
        const mappedInvestors = (renovationInvestors || []).map(i => ({ ...i, role: 'Investor' } as unknown as User));
        // Landlords are already User[]
        return [...landlords, ...mappedTenants, ...mappedStaff, ...mappedVendors, ...mappedInvestors];
    }, [displayedTenants, landlords, mergedStaff, vendors, renovationInvestors]);

    const updateUser = (id: string, data: Partial<User>) => {
        // Determine which list the user belongs to
        const isTenant = tenants.some(t => t.id === id);
        const isStaff = mergedStaff.some(s => s.id === id);
        const isLandlord = landlords.some(l => l.id === id);
        const isInvestor = (renovationInvestors || []).some(i => i.id === id);

        if (isTenant) {
            updateTenant(id, data as Partial<TenantProfile>);
        } else if (isStaff) {
            updateStaff(id, data as Partial<StaffProfile>);
        } else if (isLandlord) {
            updateLandlord(id, data);
        } else if (isInvestor) {
            updateRenovationInvestor(id, data as Partial<RenovationInvestor>);
        }
    };

    return (
        <DataContext.Provider value={{
            tenants: displayedTenants, properties: displayedProperties, landlords, tasks: displayedTasks, quotations, applications: displayedApplications, landlordApplications,
            staff: mergedStaff, fines, offboardingRecords, landlordOffboardingRecords, geospatialData, commissionRules, deductionRules,
            bills: displayedBills, invoices: displayedInvoices, vendors, messages, notifications, templates, workflows, automationRules, auditLogs, escalationRules,
            externalTransactions, overpayments, systemSettings, preventiveTasks, incomeSources,
            funds, investments, withdrawals, renovationInvestors, rfTransactions, renovationProjectBills,
            roles, scheduledReports, taxRecords, marketplaceListings, leads, fundiJobs, marketingBanners, setMarketingBanners,
            users, updateUser,
            rawTenants: tenants,
            rawProperties: properties,
            isSupabaseEnabled,
            isDataLoading,
            currentUser,
            setCurrentUser,
            addTenant, updateTenant, deleteTenant, addProperty, updateProperty, deleteProperty,
            addUnitToProperty, addTask, updateTask, addQuotation, updateQuotation, addApplication, updateApplication, deleteApplication,
            addLandlordApplication, updateLandlordApplication, deleteLandlordApplication, addLandlord, updateLandlord, deleteLandlord,
            addStaff, updateStaff, deleteStaff, addFine, updateFine, deleteFine, addOffboardingRecord,
            updateOffboardingRecord, deleteOffboardingRecord, addLandlordOffboardingRecord, updateLandlordOffboardingRecord, deleteLandlordOffboardingRecord,
            addGeospatialNode, addCommissionRule, updateCommissionRule,
            deleteCommissionRule, addDeductionRule, updateDeductionRule, deleteDeductionRule,
            addBill, updateBill, deleteBill, addTenantBill, addInvoice, updateInvoice,
            addMessage, updateMessageStatus, addNotification, markAllNotificationsRead, dismissNotification, clearOldNotifications, addVendor, updateVendor, deleteVendor, addAuditLog, updateExternalTransaction, addOverpayment, updateOverpayment, moveTenantPayment, deleteTenantPayment,
            addWorkflow, updateWorkflow, addAutomationRule, updateAutomationRule, addEscalationRule, updateEscalationRule,
            updateSystemSettings, addPreventiveTask, addTemplate, updateTemplate, deleteTemplate, addIncomeSource, updateIncomeSource,
            addFund, updateFund, addInvestment, updateInvestment, addWithdrawal, updateWithdrawal,
            addRenovationInvestor, updateRenovationInvestor, deleteRenovationInvestor, addRFTransaction, updateRFTransaction,
            addRenovationProjectBill, updateRenovationProjectBill,
            addRole, updateRole, deleteRole,
            addScheduledReport, deleteScheduledReport,
            addTaxRecord, updateTaxRecord,
            getOccupancyRate, getTotalRevenue,
            deleteFund,
            checkPermission,
            addMarketplaceListing, updateMarketplaceListing, deleteMarketplaceListing, markUnitOccupied,
            addLead, updateLead, deleteLead, syncWebsiteLeads,
            addFundiJob, updateFundiJob, syncFundiJobs
        }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) throw new Error('useData must be used within a DataProvider');
    return context;
};
