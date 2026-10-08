
import React, { useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TenantProfile, Property, User, Unit, Task, TenantApplication, StaffProfile, FineRule, OffboardingRecord, GeospatialData, CommissionRule, DataContextType, LandlordApplication, LandlordOffboardingRecord, DeductionRule, Bill, BillItem, Invoice, Vendor, Message, CommunicationTemplate, Workflow, CommunicationAutomationRule, AuditLogEntry, EscalationRule, ExternalTransaction, Overpayment, SystemSettings, PreventiveTask, IncomeSource, Fund, Investment, WithdrawalRequest, RenovationInvestor, RFTransaction, RenovationProjectBill, Notification, Quotation, Role, RolePermissions, ScheduledReport, TaxRecord, MarketplaceListing, Lead, FundiJob, MarketingBannerTemplate } from '@/types';
import { GEOSPATIAL_DATA as INITIAL_GEOSPATIAL_DATA } from '@/constants';
import { supabase, getSupabaseSession, bustSessionCache } from '../utils/supabaseClient';
import { ensureExistingTenantBackdatedPayments } from '@/utils/existingTenantOnboarding';
import { SharedDataContext as DataContext } from '../../../context/SharedDataContext';
import { isRepurposedUnit } from '../../../utils/repurposedUnits';
import { isUnitOccupiedByTenant, isUnitSafelyVacant } from '../../../utils/unitOccupancy';
import { enforceSingleTenantPerUnit } from '../../../utils/tenantDataIntegrity';
import { fetchAllCompletedPayments } from '@/utils/payments';
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
// tm_listings_v11 has no RPC (derived client-side from properties) — fallback returns [].
const BLOB_KEY_TO_RPC: Record<string, string> = {
  tm_tenants_v11:                   'partial_load_tenants',
  tm_properties_v11:                'partial_load_properties',
  tm_landlords_v11:                 'partial_load_landlords',
  tm_staff_v11:                     'partial_load_staff',
  tm_vendors_v11:                   'partial_load_vendors',
  tm_external_transactions_v11:     'partial_load_external_transactions',
  tm_audit_logs_v11:                'partial_load_audit_logs',
  tm_tasks_v11:                     'partial_load_tasks',
  tm_bills_v11:                     'partial_load_bills',
  tm_invoices_v11:                  'partial_load_invoices',
  tm_fines_v11:                     'partial_load_fine_rules',
  tm_overpayments_v11:              'partial_load_overpayments',
  tm_quotations_v11:                'partial_load_quotations',
  tm_landlord_applications_v11:     'partial_load_landlord_applications',
  tm_applications_v11:              'partial_load_tenant_applications',
  tm_offboarding_v11:               'partial_load_offboarding_records',
  tm_landlord_offboarding_v11:      'partial_load_landlord_offboarding_records',
  tm_commissions_v11:               'partial_load_commission_rules',
  tm_deductions_v11:                'partial_load_deduction_rules',
  tm_income_sources_v11:            'partial_load_income_sources',
  tm_preventive_tasks_v11:          'partial_load_preventive_tasks',
  tm_funds_v11:                     'partial_load_funds',
  tm_investments_v11:               'partial_load_investments',
  tm_withdrawals_v11:               'partial_load_withdrawal_requests',
  tm_renovation_investors_v11:      'partial_load_renovation_investors',
  tm_rf_transactions_v11:           'partial_load_rf_transactions',
  tm_renovation_project_bills_v11:  'partial_load_renovation_project_bills',
  tm_messages_v11:                  'partial_load_messages',
  tm_notifications_v11:             'partial_load_notifications',
  tm_templates_v11:                 'partial_load_communication_templates',
  tm_workflows_v11:                 'partial_load_workflows',
  tm_automation_rules_v11:          'partial_load_automation_rules',
  tm_escalation_rules_v11:          'partial_load_escalation_rules',
  tm_scheduled_reports_v11:         'partial_load_scheduled_reports',
  tm_tax_records_v11:               'partial_load_tax_records',
  tm_leads_v11:                     'partial_load_leads',
  tm_fundi_jobs_v11:                'partial_load_fundi_jobs',
  tm_marketing_banners_v11:         'partial_load_marketing_banners',
  tm_system_settings_v11:           'partial_load_system_settings',
  tm_geospatial_v11:                'partial_load_geospatial_data',
};

function useSupabaseBackedState<T>(
  emptyValue: T,
  key: string,
  options?: { skipPersist?: boolean }
): [T, React.Dispatch<React.SetStateAction<T>>, { loading: boolean; error: string | null }] {
  const [value, setValue] = useState<T>(emptyValue);
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
    queryKey: ['partial_app_state_v2', key],
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
      const { data, error } = await supabase.rpc(rpcName);
      if (error) throw error;
      return (data ?? emptyValue) as T;
    },
  });

  useEffect(() => {
    // skipPersist keys are auto-derived in-memory (e.g. marketplaceListings).
    // Never let the query cache override them — the derivation effect owns state.
    if (fetchedValue !== undefined && !options?.skipPersist) {
      setValue(fetchedValue);
    }
  }, [fetchedValue]);  // options?.skipPersist is stable (constant at call site)

  const upsertMutation = useMutation({
    mutationFn: async (next: T) => {
      // All blobs are now in normalized tables with dual-write wrappers.
      // Blob writes are globally disabled — normalized table RPCs handle persistence.
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['partial_app_state_v2', key], next);
      queryClient.setQueryData<Record<string, unknown>>(['partial_all_app_state_v2'], (old) => {
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
    const [tenants, _rawSetTenants, tenantsStatus] = useSupabaseBackedState<TenantProfile[]>([], 'tm_tenants_v11');
    // Wrapped setter: persists to the app_state blob (via _rawSetTenants) AND
    // dual-writes to public.tenants (via app.upsert_tenants_bulk) so that
    // backend RPCs like check_phone_unique and record_c2b_payment's tenant
    // resolver have a normalized source of truth. See migration 0029.
    const _tenantsUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedTenants = React.useRef<TenantProfile[]>([]);
    const setTenants: React.Dispatch<React.SetStateAction<TenantProfile[]>> = React.useCallback((updater) => {
      _rawSetTenants(prev => {
        const rawNext = typeof updater === 'function' ? (updater as (p: TenantProfile[]) => TenantProfile[])(prev) : updater;
        const next = enforceSingleTenantPerUnit(rawNext);
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
            _tenantsUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedTenants.current;
              _pendingChangedTenants.current = [];
              try {
                // Persist the FULL tenant record (including notes, notices,
                // requests, maintenanceRequests, collectionHistory) so any edit
                // made in the UI survives reload.
                const { error } = await supabase.rpc('partial_upsert_tenants_bulk', { p_tenants: toWrite as unknown as object });
                if (error) console.warn('[tenants] upsert_tenants_bulk failed:', error.message);

                // Payment-history reconciliation — see full-RMS DataContext
                // for the rationale. Server-side C2B / STK callbacks may
                // append entries to partial_tenants.payment_history that
                // the debounced write would otherwise clobber.
                try {
                  const ids = toWrite.map(t => t.id).filter(Boolean);
                  if (ids.length > 0) {
                    const { data: rows } = await supabase
                      .from('partial_tenants')
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
                console.warn('[tenants] upsert_tenants_bulk error:', (e as Error)?.message);
              }
            }, 3500);
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

    // Automated Purger: Permanently remove synthetic multi-occupancy payments everywhere and sync paymentHistory with inbound payments table
    const _multiPurgeDone = React.useRef(false);
    React.useEffect(() => {
        if (_multiPurgeDone.current || tenants.length === 0) return;

        (async () => {
            try {
                let inboundData: any[] = [];
                try {
                    inboundData = await fetchAllCompletedPayments(180);
                } catch { /* fallback */ }

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

                    await supabase.from('partial_rms_payments')
                        .delete()
                        .or('transaction_id.ilike.MULTI-%,status.eq.Multi-Occupancy Allocation,checkout_request_id.eq.Multi-occupancy sub allocation');

                    for (const t of cleanedTenants) {
                        const orig = tenants.find(x => x.id === t.id);
                        if (orig && orig.paymentHistory !== t.paymentHistory) {
                            await supabase.from('partial_tenants')
                                .update({ payment_history: t.paymentHistory })
                                .eq('id', t.id);
                        }
                    }
                } else {
                    _multiPurgeDone.current = true;
                }
            } catch (e) {
                console.warn('[DataContext partialRms] Purging synthetic multi payments error:', e);
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
            _rawSetTenants(prev => {
                if (!Array.isArray(prev) || prev.length === 0) return prev;
                let changed = false;
                const next = prev.map(t => {
                    const history = [...(t.paymentHistory || [])];
                    const existingRefs = new Set(history.map(p => String(p?.reference || '').trim().toLowerCase()).filter(Boolean));
                    const myDbPayments = dbPaymentsList.filter(p => p.matched_tenant_id === t.id);
                    let added = false;
                    for (const p of myDbPayments) {
                        const ref = String(p.transaction_id || p.checkout_request_id || p.id || '').trim();
                        const refLower = ref.toLowerCase();
                        if (ref && !existingRefs.has(refLower)) {
                            const v_method = p.source === 'c2b' ? 'M-Pesa (C2B)' : p.source === 'stk' ? 'M-Pesa (STK)' : p.source === 'manual' ? (p.result_desc || 'Manual') : 'M-Pesa';
                            history.push({
                                date: String(p.created_at || '').split('T')[0],
                                amount: `KES ${Number(p.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
                                status: 'Paid',
                                method: v_method,
                                reference: ref
                            });
                            existingRefs.add(refLower);
                            added = true;
                        }
                    }
                    if (added) {
                        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        changed = true;
                        return { ...t, paymentHistory: history };
                    }
                    return t;
                });
                return changed ? next : prev;
            });
        };

        // 1. Initial fetch of all completed payments
        supabase
            .from('partial_rms_payments')
            .select('id, amount, created_at, source, transaction_id, checkout_request_id, result_desc, matched_tenant_id')
            .eq('status', 'completed')
            .not('matched_tenant_id', 'is', null)
            .then(({ data, error }) => {
                if (active && data) {
                    mergeDbPaymentsIntoTenants(data);
                }
            });

        // 2. Real-time subscription for instant payment linking
        const channel = supabase
            .channel('global_partial_payments_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'partial_rms_payments' },
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

    const [properties, _rawSetProperties, propertiesStatus] = useSupabaseBackedState<Property[]>([], 'tm_properties_v11');
    const _propertiesUpsertTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const _pendingChangedProperties = React.useRef<Property[]>([]);
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
            _propertiesUpsertTimer.current = setTimeout(async () => {
              const toWrite = _pendingChangedProperties.current;
              _pendingChangedProperties.current = [];
              try {
                const { error } = await supabase.rpc('partial_upsert_properties_bulk', { p_properties: toWrite as unknown as object });
                if (error) console.warn('[properties] upsert_properties_bulk failed:', error.message);
              } catch (e) {
                console.warn('[properties] upsert_properties_bulk error:', (e as Error)?.message);
              }
            }, 3500);
          }
        }
        return next;
      });
    }, [_rawSetProperties]);
    const [landlords, _rawSetLandlords, landlordsStatus] = useSupabaseBackedState<User[]>([], 'tm_landlords_v11');
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
                const { error } = await supabase.rpc('partial_upsert_landlords_bulk', { p_landlords: toWrite as unknown as object });
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
    const [tasks, _rawSetTasks, tasksStatus] = useSupabaseBackedState<Task[]>([], 'tm_tasks_v11');
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
                const { error } = await supabase.rpc('partial_upsert_tasks_bulk', { p_tasks: toWrite as unknown as object });
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
    const [bills, _rawSetBills, billsStatus] = useSupabaseBackedState<Bill[]>([], 'tm_bills_v11');
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
                const { error } = await supabase.rpc('partial_upsert_bills_bulk', { p_bills: toWrite as unknown as object });
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
    const [invoices, _rawSetInvoices, invoicesStatus] = useSupabaseBackedState<Invoice[]>([], 'tm_invoices_v11');
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
                const { error } = await supabase.rpc('partial_upsert_invoices_bulk', { p_invoices: toWrite as unknown as object });
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
    const [quotations, _rawSetQuotations, quotationsStatus] = useSupabaseBackedState<Quotation[]>([], 'tm_quotations_v11');
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
                const { error } = await supabase.rpc('partial_upsert_quotations_bulk', { p_quotations: toWrite as unknown as object });
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
    const [applications, _rawSetApplications, applicationsStatus] = useSupabaseBackedState<TenantApplication[]>([], 'tm_applications_v11');
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
                const { error } = await supabase.rpc('partial_upsert_tenant_applications_bulk', { p_apps: toWrite as unknown as object });
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
    const [landlordApplications, _rawSetLandlordApplications, landlordApplicationsStatus] = useSupabaseBackedState<LandlordApplication[]>([], 'tm_landlord_applications_v11');
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
                const { error } = await supabase.rpc('partial_upsert_landlord_applications_bulk', { p_apps: toWrite as unknown as object });
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
    const [staff, _rawSetStaff, staffStatus] = useSupabaseBackedState<StaffProfile[]>([], 'tm_staff_v11');
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
                const { error } = await supabase.rpc('partial_upsert_staff_bulk', { p_staff: toWrite as unknown as object });
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
    const [fines, _rawSetFines, finesStatus] = useSupabaseBackedState<FineRule[]>([], 'tm_fines_v11');
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
                const { error } = await supabase.rpc('partial_upsert_fine_rules_bulk', { p_fines: toWrite as unknown as object });
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

    const [offboardingRecords, _rawSetOffboardingRecords, offboardingStatus] = useSupabaseBackedState<OffboardingRecord[]>([], 'tm_offboarding_v11');
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
                const { error } = await supabase.rpc('partial_upsert_offboarding_records_bulk', { p_records: toWrite as unknown as object });
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
    const [landlordOffboardingRecords, _rawSetLandlordOffboarding, landlordOffboardingStatus] = useSupabaseBackedState<LandlordOffboardingRecord[]>([], 'tm_landlord_offboarding_v11');
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
                const { error } = await supabase.rpc('partial_upsert_landlord_offboarding_bulk', { p_records: toWrite as unknown as object });
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
    const [geospatialData, _rawSetGeospatialData, geospatialStatus] = useSupabaseBackedState<GeospatialData>(INITIAL_GEOSPATIAL_DATA, 'tm_geospatial_v11');
    const _geospatialTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const setGeospatialData: React.Dispatch<React.SetStateAction<GeospatialData>> = React.useCallback((updater) => {
      _rawSetGeospatialData(prev => {
        const next = typeof updater === 'function' ? (updater as (p: GeospatialData) => GeospatialData)(prev) : updater;
        if (_geospatialTimer.current) clearTimeout(_geospatialTimer.current);
        _geospatialTimer.current = setTimeout(async () => {
          try {
            const { error } = await supabase.rpc('partial_upsert_geospatial_data', { p_data: next as unknown as object });
            if (error) console.warn('[geospatial] upsert_geospatial_data failed:', error.message);
          } catch (e) {
            console.warn('[geospatial] upsert_geospatial_data error:', (e as Error)?.message);
          }
        }, 800);
        return next;
      });
    }, [_rawSetGeospatialData]);
    const [commissionRules, _rawSetCommissionRules, commissionStatus] = useSupabaseBackedState<CommissionRule[]>([], 'tm_commissions_v11');
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
                const { error } = await supabase.rpc('partial_upsert_commission_rules_bulk', { p_rules: toWrite as unknown as object });
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
    const [deductionRules, _rawSetDeductionRules, deductionStatus] = useSupabaseBackedState<DeductionRule[]>([], 'tm_deductions_v11');
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
                const { error } = await supabase.rpc('partial_upsert_deduction_rules_bulk', { p_rules: toWrite as unknown as object });
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
    const [vendors, _rawSetVendors, vendorsStatus] = useSupabaseBackedState<Vendor[]>([], 'tm_vendors_v11');
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
                const { error } = await supabase.rpc('partial_upsert_vendors_bulk', { p_vendors: toWrite as unknown as object });
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
    const [messages, _rawSetMessages, messagesStatus] = useSupabaseBackedState<Message[]>([], 'tm_messages_v11');
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
                const { error } = await supabase.rpc('partial_upsert_messages_bulk', { p_messages: toWrite as unknown as object });
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
    const [notifications, _rawSetNotifications, notificationsStatus] = useSupabaseBackedState<Notification[]>([], 'tm_notifications_v11');
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
                const { error } = await supabase.rpc('partial_upsert_notifications_bulk', { p_notifications: toWrite as unknown as object });
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
    const [templates, _rawSetTemplates, templatesStatus] = useSupabaseBackedState<CommunicationTemplate[]>([], 'tm_templates_v11');
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
                const { error } = await supabase.rpc('partial_upsert_communication_templates_bulk', { p_templates: toWrite as unknown as object });
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
    const [workflows, _rawSetWorkflows, workflowsStatus] = useSupabaseBackedState<Workflow[]>([], 'tm_workflows_v11');
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
                const { error } = await supabase.rpc('partial_upsert_workflows_bulk', { p_workflows: toWrite as unknown as object });
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
    const [automationRules, _rawSetAutomationRules, automationStatus] = useSupabaseBackedState<CommunicationAutomationRule[]>([], 'tm_automation_rules_v11');
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
                const { error } = await supabase.rpc('partial_upsert_automation_rules_bulk', { p_rules: toWrite as unknown as object });
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
    const [escalationRules, _rawSetEscalationRules, escalationStatus] = useSupabaseBackedState<EscalationRule[]>([], 'tm_escalation_rules_v11');
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
                const { error } = await supabase.rpc('partial_upsert_escalation_rules_bulk', { p_rules: toWrite as unknown as object });
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
    const [auditLogs, _rawSetAuditLogs, auditLogsStatus] = useSupabaseBackedState<AuditLogEntry[]>([], 'tm_audit_logs_v11');
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
                const { error } = await supabase.rpc('partial_insert_audit_logs_bulk', { p_logs: toWrite as unknown as object });
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
    const [externalTransactions, _rawSetExternalTransactions, externalTxStatus] = useSupabaseBackedState<ExternalTransaction[]>([], 'tm_external_transactions_v11');
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
                const { error } = await supabase.rpc('partial_upsert_external_transactions_bulk', { p_txs: toWrite as unknown as object });
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
    const [overpayments, _rawSetOverpayments, overpaymentsStatus] = useSupabaseBackedState<Overpayment[]>([], 'tm_overpayments_v11');
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
                const { error } = await supabase.rpc('partial_upsert_overpayments_bulk', { p_ops: toWrite as unknown as object });
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
    const [incomeSources, _rawSetIncomeSources, incomeSourcesStatus] = useSupabaseBackedState<IncomeSource[]>([], 'tm_income_sources_v11');
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
                const { error } = await supabase.rpc('partial_upsert_income_sources_bulk', { p_sources: toWrite as unknown as object });
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
    const [preventiveTasks, _rawSetPreventiveTasks, preventiveTasksStatus] = useSupabaseBackedState<PreventiveTask[]>([], 'tm_preventive_tasks_v11');
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
                const { error } = await supabase.rpc('partial_upsert_preventive_tasks_bulk', { p_tasks: toWrite as unknown as object });
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
    const [funds, _rawSetFunds, fundsStatus] = useSupabaseBackedState<Fund[]>([], 'tm_funds_v11');
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
              try { const { error } = await supabase.rpc('partial_upsert_funds_bulk', { p_funds: toWrite as unknown as object }); if (error) console.warn('[funds] upsert_funds_bulk failed:', error.message); } catch (e) { console.warn('[funds] upsert_funds_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetFunds]);
    const [investments, _rawSetInvestments, investmentsStatus] = useSupabaseBackedState<Investment[]>([], 'tm_investments_v11');
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
              try { const { error } = await supabase.rpc('partial_upsert_investments_bulk', { p_investments: toWrite as unknown as object }); if (error) console.warn('[investments] upsert_investments_bulk failed:', error.message); } catch (e) { console.warn('[investments] upsert_investments_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetInvestments]);
    const [withdrawals, _rawSetWithdrawals, withdrawalsStatus] = useSupabaseBackedState<WithdrawalRequest[]>([], 'tm_withdrawals_v11');
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
              try { const { error } = await supabase.rpc('partial_upsert_withdrawals_bulk', { p_withdrawals: toWrite as unknown as object }); if (error) console.warn('[withdrawals] upsert_withdrawals_bulk failed:', error.message); } catch (e) { console.warn('[withdrawals] upsert_withdrawals_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetWithdrawals]);
    const [renovationInvestors, _rawSetRenovationInvestors, renovationInvestorsStatus] = useSupabaseBackedState<RenovationInvestor[]>([], 'tm_renovation_investors_v11');
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
              try { const { error } = await supabase.rpc('partial_upsert_renovation_investors_bulk', { p_investors: toWrite as unknown as object }); if (error) console.warn('[renov_investors] upsert_renovation_investors_bulk failed:', error.message); } catch (e) { console.warn('[renov_investors] upsert_renovation_investors_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetRenovationInvestors]);
    const [rfTransactions, _rawSetRFTransactions, rfTxStatus] = useSupabaseBackedState<RFTransaction[]>([], 'tm_rf_transactions_v11');
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
              try { const { error } = await supabase.rpc('partial_upsert_rf_transactions_bulk', { p_txs: toWrite as unknown as object }); if (error) console.warn('[rf_tx] upsert_rf_transactions_bulk failed:', error.message); } catch (e) { console.warn('[rf_tx] upsert_rf_transactions_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetRFTransactions]);
    const [renovationProjectBills, _rawSetRenovationProjectBills, renovationBillsStatus] = useSupabaseBackedState<RenovationProjectBill[]>([], 'tm_renovation_project_bills_v11');
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
              try { const { error } = await supabase.rpc('partial_upsert_renovation_project_bills_bulk', { p_bills: toWrite as unknown as object }); if (error) console.warn('[renov_bills] upsert_renovation_project_bills_bulk failed:', error.message); } catch (e) { console.warn('[renov_bills] upsert_renovation_project_bills_bulk error:', (e as Error)?.message); }
            }, 2500);
          }
        }
        return next;
      });
    }, [_rawSetRenovationProjectBills]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [rolesStatus, setRolesStatus] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });
    const [systemSettings, _rawSetSystemSettings, systemSettingsStatus] = useSupabaseBackedState<SystemSettings>({
        companyName: 'TaskMe Realty',
        logo: null,
        profilePic: null
    }, 'tm_system_settings_v11');
    const _systemSettingsTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const setSystemSettings: React.Dispatch<React.SetStateAction<SystemSettings>> = React.useCallback((updater) => {
      _rawSetSystemSettings(prev => {
        const next = typeof updater === 'function' ? (updater as (p: SystemSettings) => SystemSettings)(prev) : updater;
        if (_systemSettingsTimer.current) clearTimeout(_systemSettingsTimer.current);
        _systemSettingsTimer.current = setTimeout(async () => {
          try {
            const { error } = await supabase.rpc('partial_upsert_system_settings', { p_s: next as unknown as object });
            if (error) console.warn('[system_settings] upsert_system_settings failed:', error.message);
          } catch (e) {
            console.warn('[system_settings] upsert_system_settings error:', (e as Error)?.message);
          }
        }, 800);
        return next;
      });
    }, [_rawSetSystemSettings]);
    const [scheduledReports, _rawSetScheduledReports, scheduledReportsStatus] = useSupabaseBackedState<ScheduledReport[]>([], 'tm_scheduled_reports_v11');
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
                const { error } = await supabase.rpc('partial_upsert_scheduled_reports_bulk', { p_reports: toWrite as unknown as object });
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
    const [taxRecords, _rawSetTaxRecords, taxRecordsStatus] = useSupabaseBackedState<TaxRecord[]>([], 'tm_tax_records_v11');
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
                const { error } = await supabase.rpc('partial_upsert_tax_records_bulk', { p_records: toWrite as unknown as object });
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
    const [marketplaceListings, setMarketplaceListings, marketplaceStatus] = useSupabaseBackedState<MarketplaceListing[]>([], 'tm_listings_v11', { skipPersist: true });
    const [leads, _rawSetLeads, leadsStatus] = useSupabaseBackedState<Lead[]>([], 'tm_leads_v11');
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
                const { error } = await supabase.rpc('partial_upsert_leads_bulk', { p_leads: toWrite as unknown as object });
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
    const [fundiJobs, _rawSetFundiJobs, fundiJobsStatus] = useSupabaseBackedState<FundiJob[]>([], 'tm_fundi_jobs_v11');
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
                const { error } = await supabase.rpc('partial_upsert_fundi_jobs_bulk', { p_jobs: toWrite as unknown as object });
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
    const [marketingBanners, _rawSetMarketingBanners] = useSupabaseBackedState<MarketingBannerTemplate[]>([], 'tm_marketing_banners_v11');
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
                const { error } = await supabase.rpc('partial_upsert_marketing_banners_bulk', { p_banners: toWrite as unknown as object });
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

    // ── Master batch loader (Stage 1 Startup) ───────────────────────────────
    // Fast Stage 1 loader: retrieves Only critical system settings and basic layout metadata.
    // Loads in only ~100ms, bypassing downstream joins to render layout instantly.
    const { data: allAppState, isLoading: batchLoading, isSuccess: batchSuccess, isError: batchError } =
      useQuery<Record<string, unknown>>({
        queryKey: ['partial_all_app_state_v2'],
        staleTime: 5 * 60 * 1000, 
        gcTime: 60 * 60 * 1000,
        retry: 2,
        enabled: hasSession,
        queryFn: async () => {
          const session = await getSupabaseSession();
          if (!session) throw new Error('SESSION_EXPIRED');
          console.log('[Supabase partial] Fast Batch Load (Stage 1) on startup');
          
          const result: Record<string, unknown> = {};
          const stage1Keys = [
            'tm_system_settings_v11',
            'tm_notifications_v11',
            'tm_staff_v11',
            'tm_geospatial_v11',
            'tm_marketing_banners_v11',
            'tm_scheduled_reports_v11'
          ];
          
          await Promise.all(
            stage1Keys.map(async (key) => {
              const rpcName = BLOB_KEY_TO_RPC[key];
              if (!rpcName) return;
              try {
                const { data, error } = await supabase.rpc(rpcName);
                if (error) {
                  console.warn(`[Supabase partial startup load] Failed for ${key}:`, error.message);
                  return;
                }
                result[key] = data;
              } catch (e) {
                console.warn(`[Supabase partial startup load] Error for ${key}:`, e);
              }
            })
          );
          
          return result;
        },
      });

    // Distribute Stage 1 results + signal individual queries they can run as fallback
    useEffect(() => {
      if (batchSuccess && allAppState) {
        Object.entries(allAppState).forEach(([k, v]) => {
          if (v !== null && v !== undefined) {
            queryClient.setQueryData(['partial_app_state_v2', k], v);
          }
        });
      }
      if (batchSuccess || batchError) {
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
        console.log('[Supabase partial] Starting prioritized sequential background load...');
        const userRole = currentUser?.role;
        const isSystemUser = userRole && ['Super Admin', 'Accountant', 'Admin', 'Assistant Admin'].includes(userRole);

        const loadKeys = async (keys: string[]) => {
          await Promise.all(
            keys.map(async (key) => {
              const rpcName = BLOB_KEY_TO_RPC[key];
              if (!rpcName) return;
              try {
                const { data, error } = await supabase.rpc(rpcName);
                if (error) {
                  console.warn(`[Supabase partial background load] Failed for ${key}:`, error.message);
                  return;
                }
                queryClient.setQueryData(['partial_app_state_v2', key], data);
              } catch (e) {
                console.warn(`[Supabase partial background load] Error for ${key}:`, e);
              }
            })
          );
        };

        if (isSystemUser) {
          console.log('[Supabase partial bg] High Priority System User Detected. Loading remaining stages in parallel!');
          const remainingKeys = Object.keys(BLOB_KEY_TO_RPC).filter(
            (key) =>
              ![
                'tm_system_settings_v11',
                'tm_notifications_v11',
                'tm_staff_v11',
                'tm_geospatial_v11',
                'tm_marketing_banners_v11',
                'tm_scheduled_reports_v11'
              ].includes(key)
          );
          await loadKeys(remainingKeys);
          console.log('[Supabase partial bg] High-priority parallel load completed!');
        } else {
          // Standard Staged loading for normal portal/non-system users
          // Stage 2: Properties
          console.log('[Supabase partial bg] Loading Stage 2: Properties');
          await loadKeys(['tm_properties_v11']);

          // Stage 3: Landlords
          console.log('[Supabase partial bg] Loading Stage 3: Landlords');
          await loadKeys([
            'tm_landlords_v11',
            'tm_landlord_applications_v11',
            'tm_landlord_offboarding_v11',
            'tm_commissions_v11',
            'tm_deductions_v11'
          ]);

          // Stage 4: Tenants
          console.log('[Supabase partial bg] Loading Stage 4: Tenants');
          await loadKeys([
            'tm_tenants_v11',
            'tm_applications_v11',
            'tm_offboarding_v11'
          ]);

          // Stage 5: Remaining keys
          console.log('[Supabase partial bg] Loading Stage 5: Remaining tables');
          const stage5Keys = Object.keys(BLOB_KEY_TO_RPC).filter(
            (key) =>
              ![
                // Stage 1 (already loaded)
                'tm_system_settings_v11',
                'tm_notifications_v11',
                'tm_staff_v11',
                'tm_geospatial_v11',
                'tm_marketing_banners_v11',
                'tm_scheduled_reports_v11',
                // Stage 2
                'tm_properties_v11',
                // Stage 3
                'tm_landlords_v11',
                'tm_landlord_applications_v11',
                'tm_landlord_offboarding_v11',
                'tm_commissions_v11',
                'tm_deductions_v11',
                // Stage 4
                'tm_tenants_v11',
                'tm_applications_v11',
                'tm_offboarding_v11'
              ].includes(key)
          );
          await loadKeys(stage5Keys);
          console.log('[Supabase partial bg] Standard sequential loader completed successfully!');
        }
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
                const { error } = await supabase.rpc('partial_upsert_properties_bulk', { p_properties: changedProperties as unknown as object });
                if (error) console.warn('[reconcile] property status persistence failed:', error.message);
            } catch (e) {
                console.warn('[reconcile] property status persistence error:', (e as Error)?.message);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batchSuccess, tenants, properties, propertiesStatus.loading, tenantsStatus.loading]);


    const mergedStaff = staff;

    const isDataLoading = batchLoading || tenantsStatus.loading || propertiesStatus.loading || staffStatus.loading || rolesStatus.loading || landlordOffboardingStatus.loading;

    // ── Supabase Realtime: Unified Sync ──────────────────────────────────────
    // Subscribes to changes on the app_state table for critical keys.
    // Consolidates multiple redundant channels into a single stable subscription.
    useEffect(() => {
        if (!hasSession) return;
        
        const channel = supabase
            .channel('partial-app-sync')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'app', table: 'app_state' },
                (payload) => {
                    const key = payload.new?.key;
                    const incoming = payload.new?.value;
                    if (!key || !Array.isArray(incoming)) return;

                    if (key === 'tm_messages_v11') {
                        setMessages(prev => {
                            const existingIds = new Set(prev.map((m: any) => m.id));
                            const fresh = incoming.filter((m: any) => !existingIds.has(m.id));
                            return fresh.length > 0 ? [...fresh, ...prev] : prev;
                        });
                        return;
                    }

                    const syncKeys = ['tm_tenants_v11', 'tm_properties_v11', 'tm_applications_v11', 'tm_notifications_v11'];
                    if (syncKeys.includes(key)) {
                        queryClient.setQueryData<any[]>(['partial_app_state_v2', key], (prev) => {
                            const current = prev ?? [];
                            const localIds = new Set(current.map((r: any) => r.id));
                            const newEntries = incoming.filter((r: any) => !localIds.has(r.id));
                            if (newEntries.length === 0) return current;
                            return key === 'tm_notifications_v11'
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
        queryKey: ['partial_roles'],
        staleTime: Infinity,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            console.log('[Supabase] roles load');
            const { data, error } = await supabase
                
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
            const allVacantUnits = properties.flatMap(p => 
                p.units.filter(u => isUnitSafelyVacant(u, tenants, p)).map(u => ({ unit: u, property: p }))
            );
            allVacantUnits.forEach(({ unit, property }) => {
                // Village/Zone only — higher levels (location, sub-county, branch) are intentionally
                // excluded. If no village/zone is set on the property, unit location remains blank.
                const villageZone = ((property as any).zone || '').trim();
                const descriptionSuffix = villageZone ? ` available in ${villageZone}` : ' available';
                const existingListing = newListings.find(l => l.unitId === unit.id);
                if (!existingListing) {
                    const landlord = landlords.find(l => l.id === property.landlordId);
                    const assignedAgent = staff.find(s => s.id === property.assignedAgentId);
                    const affiliate = landlords.find(l => l.role === 'Affiliate' && l.id === property.landlordId);
                    const contactOwner = assignedAgent || affiliate || landlord;
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
                        description: `Vacant ${unit.unitType || unit.bedrooms + 'BR'} unit${descriptionSuffix}.`,
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
                        dateCreated: new Date().toISOString()
                    };
                    newListings.push(newListing);
                    hasChanges = true;
                } else if (existingListing.id.startsWith('auto-lst-')) {
                    const nextDescription = `Vacant ${unit.unitType || unit.bedrooms + 'BR'} unit${descriptionSuffix}.`;
                    if (existingListing.location !== villageZone || existingListing.description !== nextDescription) {
                        const idx = newListings.indexOf(existingListing);
                        newListings[idx] = { ...existingListing, location: villageZone, description: nextDescription };
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
                    if (unit && !isUnitSafelyVacant(unit, tenants, prop) && listing.status === 'Published') {
                        newListings[index] = { ...listing, status: 'Rented' };
                        hasChanges = true;
                    } else if (unit && prop) {
                        const nextOwner = {
                            name: contactOwner?.name || 'Property Manager',
                            contact: contactOwner?.phone || '',
                            email: contactOwner?.email || ''
                        };
                        const nextPin = prop.pinLocationUrl || '';
                        const nextLocation = ((prop as any).zone || '').trim();
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
            propertyId: application.propertyId,
            propertyName: application.propertyName || application.property,
            unitId: application.unitId,
            unit: application.unit || '',
            rentAmount,
            rentDueDate: application.rentDueDate,
            rentGraceDays: application.rentGraceDays,
            depositPaid: Number(application.depositPaid || 0),
            depositExpected,
            rentStartDate: application.rentStartDate || application.leaseStartDate || undefined,
            onboardingDate: application.submittedDate || getTodayIsoDate(),
            leaseSigned: !!application.leaseSigned,
            leaseStartDate: application.leaseStartDate,
            leaseEnd: application.leaseEnd,
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
    const addTenant = async (t: TenantProfile) => {
        const withBackdated = ensureExistingTenantBackdatedPayments(t);
        setTenants(prev => [withBackdated, ...prev]);
        try {
            const { error } = await supabase.rpc('partial_upsert_tenants_bulk', { p_tenants: [withBackdated] });
            if (error) console.warn('[tenants] immediate upsert failed:', error.message);
        } catch (e) {
            console.warn('[tenants] immediate upsert error:', e);
        }
    };
    const updateTenant = async (id: string, d: Partial<TenantProfile>) => {
        let updated: TenantProfile | null = null;
        setTenants(prev => prev.map(t => {
            if (t.id === id) {
                updated = ensureExistingTenantBackdatedPayments({ ...t, ...d });
                return updated;
            }
            return t;
        }));
        if (updated) {
            try {
                const { error } = await supabase.rpc('partial_upsert_tenants_bulk', { p_tenants: [updated] });
                if (error) console.warn('[tenants] immediate upsert failed:', error.message);
            } catch (e) {
                console.warn('[tenants] immediate upsert error:', e);
            }
        }
    };
    const deleteTenant = (id: string) => {
        const authUid = tenants.find(t => t.id === id)?.authUserId;
        setTenants(prev => prev.filter(t => t.id !== id));
        (async () => {
            const { error: delErr } = await supabase.rpc('partial_delete_tenant', { p_id: id });
            if (delErr) console.warn('[Supabase] delete_tenant RPC error:', delErr.message);
            const authTarget = isAuthUUID(id) ? id : (authUid && isAuthUUID(authUid) ? authUid : null);
            if (authTarget) {
                const { error } = await supabase.rpc('admin_delete_auth_user', { p_user_id: authTarget });
                if (error) console.warn('[Supabase] admin_delete_auth_user (tenant) error:', error.message);
            }
        })();
    };
    const addProperty = (p: Property) => setProperties(prev => [p, ...prev]);
    const updateProperty = (id: string, d: Partial<Property>) => {
        setProperties(prev => prev.map(p => p.id === id ? { ...p, ...d } : p));
        // Propagate unit rent changes globally to linked active tenants.
        if (Array.isArray((d as any).units)) {
            const before = (properties.find(p => p.id === id)?.units) || [];
            const after = (d as any).units as any[];
            const rentChanges = new Map<string, number>();
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
            });
            if (rentChanges.size > 0) {
                setTenants(prev => prev.map(t => {
                    const keys = [t.unitId, t.unitNumber, (t as any).unitTag, t.unitName, (t as any).unit]
                        .map(k => String(k || '').trim().toLowerCase())
                        .filter(Boolean);
                    for (const k of keys) {
                        if (rentChanges.has(k)) {
                            const nextRent = rentChanges.get(k)!;
                            if (Number(t.rentAmount || 0) !== nextRent) {
                                return { ...t, rentAmount: nextRent };
                            }
                        }
                    }
                    return t;
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
            const { error: pTblErr } = await supabase.from('partial_properties').delete().eq('id', id);
            if (pTblErr) console.warn('[Supabase] partial_properties delete error:', pTblErr.message);
            const { error: tblErr } = await supabase.from('properties').delete().eq('id', id);
            if (tblErr) console.warn('[Supabase] properties delete error:', tblErr.message);
        })();
    };
    const addUnitToProperty = (propId: string, unit: Unit) => setProperties(prev => prev.map(p => p.id === propId ? { ...p, units: [...p.units, unit] } : p));
    const addLandlord = async (u: User) => {
        setLandlords(prev => [u, ...prev]);
        try {
            const { error } = await supabase.rpc('partial_upsert_landlords_bulk', { p_landlords: [u] });
            if (error) console.warn('[landlords] immediate upsert failed:', error.message);
        } catch (e) {
            console.warn('[landlords] immediate upsert error:', e);
        }
    };
    const updateLandlord = async (id: string, d: Partial<User>) => {
        let updated: User | null = null;
        setLandlords(prev => prev.map(u => {
            if (u.id === id) {
                updated = { ...u, ...d };
                return updated;
            }
            return u;
        }));
        if (updated) {
            try {
                const { error } = await supabase.rpc('partial_upsert_landlords_bulk', { p_landlords: [updated] });
                if (error) console.warn('[landlords] immediate upsert failed:', error.message);
            } catch (e) {
                console.warn('[landlords] immediate upsert error:', e);
            }
        }
    };
    const deleteLandlord = (id: string) => {
        setLandlords(prev => prev.filter(u => u.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                const { error } = await supabase.rpc('admin_delete_auth_user', { p_user_id: id });
                if (error) console.warn('[Supabase] admin_delete_auth_user (landlord) error:', error.message);
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
            const { error: delErr } = await supabase.rpc('partial_delete_tenant_application', { p_id: id });
            if (delErr) console.warn('[Supabase] delete_tenant_application RPC error:', delErr.message);
            if (options?.keepAuthUser) return;
            const authTarget = isAuthUUID(id) ? id : (authUid && isAuthUUID(authUid) ? authUid : null);
            if (authTarget) {
                const { error } = await supabase.rpc('admin_delete_auth_user', { p_user_id: authTarget });
                if (error) console.warn('[Supabase] admin_delete_auth_user (application) error:', error.message);
            }
        })();
    };
    React.useEffect(() => {
        if (applicationsStatus.loading || tenantsStatus.loading || applications.length === 0) return;
        const missing = applications.filter(a => {
            if (a.status === 'Rejected') return false;
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
            const { error } = await supabase.from('partial_landlord_applications').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete_landlord_application error:', error.message);
        })();
    };
    const addStaff = async (s: StaffProfile) => {
        setStaff(prev => [s, ...prev]);
        try {
            const { error } = await supabase.rpc('partial_upsert_staff_bulk', { p_staff: [s] });
            if (error) console.warn('[staff] immediate upsert failed:', error.message);
        } catch (e) {
            console.warn('[staff] immediate upsert error:', e);
        }
    };
    const updateStaff = async (id: string, d: Partial<StaffProfile>) => {
        let updated: StaffProfile | null = null;
        setStaff(prev => prev.map(s => {
            if (s.id === id) {
                updated = { ...s, ...d };
                return updated;
            }
            return s;
        }));
        if (updated) {
            try {
                const { error } = await supabase.rpc('partial_upsert_staff_bulk', { p_staff: [updated] });
                if (error) console.warn('[staff] immediate upsert failed:', error.message);
            } catch (e) {
                console.warn('[staff] immediate upsert error:', e);
            }
        }
    };
    const deleteStaff = (id: string) => {
        setStaff(prev => prev.filter(s => s.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                // Deletes auth.users row → cascades to staff_profiles, user_roles, profiles
                const { error } = await supabase.rpc('admin_delete_auth_user', { p_user_id: id });
                if (error) console.warn('[Supabase] admin_delete_auth_user (staff) error:', error.message);
            } else {
                // Legacy generated-ID staff: remove from normalised table only
                const { error } = await supabase.from('partial_staff_profiles').delete().eq('id', id);
                if (error) console.warn('[Supabase] staff_profiles delete error:', error.message);
            }
        })();
    };
    const addFine = (f: FineRule) => setFines(prev => [f, ...prev]);
    const updateFine = (id: string, d: Partial<FineRule>) => setFines(prev => prev.map(f => f.id === id ? {...f, ...d} : f));
    const deleteFine = (id: string) => {
        setFines(prev => prev.filter(f => f.id !== id));
        (async () => {
            const { error: rpcErr } = await supabase.rpc('delete_partial_fine_rule', { p_id: id });
            if (rpcErr) {
                console.warn('[Supabase] delete_partial_fine_rule RPC error:', rpcErr.message);
                const { error } = await supabase.from('partial_fine_rules').delete().eq('id', id);
                if (error) console.warn('[Supabase] partial_fine_rules delete error:', error.message);
            }
        })();
    };
    const addOffboardingRecord = (r: OffboardingRecord) => setOffboardingRecords(prev => [r, ...prev]);
    const updateOffboardingRecord = (id: string, d: Partial<OffboardingRecord>) => setOffboardingRecords(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const addLandlordOffboardingRecord = (r: LandlordOffboardingRecord) => setLandlordOffboardingRecords(prev => [r, ...prev]);
    const updateLandlordOffboardingRecord = (id: string, d: Partial<LandlordOffboardingRecord>) => setLandlordOffboardingRecords(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const deleteLandlordOffboardingRecord = (id: string) => setLandlordOffboardingRecords(prev => prev.filter(r => r.id !== id));
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
            const { error } = await supabase.from('partial_commission_rules').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete commission rule error:', error.message);
        })();
    };
    const addDeductionRule = (r: DeductionRule) => setDeductionRules(prev => [r, ...prev]);
    const updateDeductionRule = (id: string, d: Partial<DeductionRule>) => setDeductionRules(prev => prev.map(r => r.id === id ? {...r, ...d} : r));
    const deleteDeductionRule = (id: string) => {
        setDeductionRules(prev => prev.filter(r => r.id !== id));
        (async () => {
            const { error } = await supabase.from('partial_deduction_rules').delete().eq('id', id);
            if (error) console.warn('[Supabase] delete deduction rule error:', error.message);
        })();
    };
    const addBill = (b: Bill) => setBills(prev => [b, ...prev]);
    const updateBill = (id: string, d: Partial<Bill>) => setBills(prev => prev.map(b => b.id === id ? {...b, ...d} : b));
    const deleteBill = (id: string) => {
        setBills(prev => prev.filter(b => b.id !== id));
        (async () => {
            const { error } = await supabase.from('partial_bills').delete().eq('id', id);
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
    const addVendor = async (v: Vendor) => {
        setVendors(prev => [v, ...prev]);
        try {
            const { error } = await supabase.rpc('partial_upsert_vendors_bulk', { p_vendors: [v] });
            if (error) console.warn('[vendors] immediate upsert failed:', error.message);
        } catch (e) {
            console.warn('[vendors] immediate upsert error:', e);
        }
    };
    const updateVendor = async (id: string, d: Partial<Vendor>) => {
        let updated: Vendor | null = null;
        setVendors(prev => prev.map(v => {
            if (v.id === id) {
                updated = { ...v, ...d };
                return updated;
            }
            return v;
        }));
        if (updated) {
            try {
                const { error } = await supabase.rpc('partial_upsert_vendors_bulk', { p_vendors: [updated] });
                if (error) console.warn('[vendors] immediate upsert failed:', error.message);
            } catch (e) {
                console.warn('[vendors] immediate upsert error:', e);
            }
        }
    };
    const deleteVendor = (id: string) => {
        setVendors(prev => prev.filter(v => v.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                const { error } = await supabase.rpc('admin_delete_auth_user', { p_user_id: id });
                if (error) console.warn('[Supabase] admin_delete_auth_user (vendor) error:', error.message);
            }
        })();
    };
    const addAuditLog = (log: AuditLogEntry) => setAuditLogs(prev => [log, ...prev]);
    const updateExternalTransaction = (id: string, d: Partial<ExternalTransaction>) => setExternalTransactions(prev => prev.map(t => t.id === id ? {...t, ...d} : t));
    const addOverpayment = (o: Overpayment) => setOverpayments(prev => [o, ...prev]);
    const updateOverpayment = (id: string, d: Partial<Overpayment>) => setOverpayments(prev => prev.map(o => o.id === id ? {...o, ...d} : o));
    const moveTenantPayment = (f: string, t: string, r: string) => {
        setTenants(prev => {
            const newTenants = [...prev];
            const fromIdx = newTenants.findIndex(tenant => tenant.id === f);
            const toIdx = newTenants.findIndex(tenant => tenant.id === t);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const fromTenant = { ...newTenants[fromIdx] };
            const paymentIdx = fromTenant.paymentHistory.findIndex(p => p.reference === r);
            if (paymentIdx === -1) return prev;
            const [payment] = fromTenant.paymentHistory.splice(paymentIdx, 1);
            newTenants[fromIdx] = fromTenant;
            const toTenant = { ...newTenants[toIdx] };
            toTenant.paymentHistory = [payment, ...toTenant.paymentHistory];
            newTenants[toIdx] = toTenant;
            return newTenants;
        });
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
    const addRenovationInvestor = async (inv: RenovationInvestor) => {
        setRenovationInvestors(prev => [inv, ...prev]);
        try {
            const { error } = await supabase.rpc('partial_upsert_renovation_investors_bulk', { p_investors: [inv] });
            if (error) console.warn('[renov_investors] immediate upsert failed:', error.message);
        } catch (e) {
            console.warn('[renov_investors] immediate upsert error:', e);
        }
    };
    const updateRenovationInvestor = async (id: string, d: Partial<RenovationInvestor>) => {
        let updated: RenovationInvestor | null = null;
        setRenovationInvestors(prev => prev.map(i => {
            if (i.id === id) {
                updated = { ...i, ...d };
                return updated;
            }
            return i;
        }));
        if (updated) {
            try {
                const { error } = await supabase.rpc('partial_upsert_renovation_investors_bulk', { p_investors: [updated] });
                if (error) console.warn('[renov_investors] immediate upsert failed:', error.message);
            } catch (e) {
                console.warn('[renov_investors] immediate upsert error:', e);
            }
        }
    };
    const deleteRenovationInvestor = (id: string) => {
        setRenovationInvestors(prev => prev.filter(i => i.id !== id));
        (async () => {
            if (isAuthUUID(id)) {
                const { error } = await supabase.rpc('admin_delete_auth_user', { p_user_id: id });
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
                
                .from('roles')
                .update(patch)
                .eq('id', id);
            if (error) {
                console.error('Failed to update role', error);
                alert(error.message ?? 'Failed to update role. Please try again.');
                const { data } = await supabase
                    
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
        // are excluded from the denominator.
        // isRepurposedUnit imported at top
        const occupyingStatuses = ['active','pending','pendingallocation','pendingpayment','pendingapproval','overdue','notice'];
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
    const addMarketplaceListing = (listing: MarketplaceListing) => setMarketplaceListings(prev => [listing, ...prev]);
    const updateMarketplaceListing = (id: string, d: Partial<MarketplaceListing>) => setMarketplaceListings(prev => prev.map(l => l.id === id ? { ...l, ...d } : l));
    const deleteMarketplaceListing = (id: string) => setMarketplaceListings(prev => prev.filter(l => l.id !== id));
    
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
        // removed
    };

    // --- Fundi Jobs ---
    const addFundiJob = (job: FundiJob) => setFundiJobs(prev => [job, ...prev]);
    const updateFundiJob = (id: string, d: Partial<FundiJob>) => setFundiJobs(prev => prev.map(j => j.id === id ? { ...j, ...d } : j));
    
    const syncFundiJobs = async () => {
        // removed
    };

    // --- Unified User Management ---
    // In Partial RMS, since the database tables are already completely separate and decoupled (e.g., partial_properties, partial_tenants, etc.),
    // we do not need to apply any hash-based or managementType filters. Every single record in these tables belongs entirely to our Partial RMS application.
    const displayedProperties = properties;
    const displayedTenants = tenants;
    const displayedBills = bills;
    const displayedInvoices = invoices;
    const displayedTasks = tasks;
    const displayedApplications = applications;
    const displayedLandlords = landlords;

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
        // Landlords are already User[]
        return [...displayedLandlords, ...mappedTenants, ...mappedStaff, ...mappedVendors];
    }, [displayedTenants, displayedLandlords, mergedStaff, vendors]);

    const updateUser = (id: string, data: Partial<User>) => {
        // Determine which list the user belongs to
        const isTenant = tenants.some(t => t.id === id);
        const isStaff = mergedStaff.some(s => s.id === id);
        const isLandlord = landlords.some(l => l.id === id);

        if (isTenant) {
            updateTenant(id, data as Partial<TenantProfile>);
        } else if (isStaff) {
            updateStaff(id, data as Partial<StaffProfile>);
        } else if (isLandlord) {
            updateLandlord(id, data);
        }
    };

    return (
        <DataContext.Provider value={{
            tenants: displayedTenants, properties: displayedProperties, landlords: displayedLandlords, tasks: displayedTasks, quotations, applications: displayedApplications, landlordApplications,
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
            updateOffboardingRecord, addLandlordOffboardingRecord, updateLandlordOffboardingRecord, deleteLandlordOffboardingRecord,
            addGeospatialNode, addCommissionRule, updateCommissionRule,
            deleteCommissionRule, addDeductionRule, updateDeductionRule, deleteDeductionRule,
            addBill, updateBill, deleteBill, addTenantBill, addInvoice, updateInvoice,
            addMessage, updateMessageStatus, addNotification, markAllNotificationsRead, dismissNotification, clearOldNotifications, addVendor, updateVendor, deleteVendor, addAuditLog, updateExternalTransaction, addOverpayment, updateOverpayment, moveTenantPayment,
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
