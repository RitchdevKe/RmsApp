// supabase/functions/c2b-confirmation/index.ts
//
// C2B Confirmation URL — called by Safaricom AFTER the customer has been
// debited. This is the authoritative event that a payment happened.
//
// Responsibilities:
//   1. Validate the caller IP (Safaricom published ranges).
//   2. Parse the payload (TransID, TransAmount, BillRefNumber, MSISDN, names,
//      BusinessShortCode, OrgAccountBalance).
//   3. Call public.record_c2b_payment which:
//        * inserts the payment row (ON CONFLICT transaction_id DO NOTHING),
//        * resolves BillRefNumber → unit_tag → active tenant,
//        * appends to that tenant's payment_history when matched,
//        * leaves matched_tenant_id NULL for External Unmatched if not.
//   4. Always return 200 with { ResultCode: 0 } so Safaricom does not retry
//      (idempotency is enforced in the DB; retries are safe but noisy).
//
// Safaricom retries up to 5× on non-200 responses. Because the DB insert is
// idempotent on transaction_id, we never produce duplicate ledger entries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SAFARICOM_IPS = new Set([
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.214.170",
  "196.201.214.176",
  "196.201.214.177",
  "196.201.214.167",
  "196.201.214.168",
  "196.201.214.195",
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveCallerIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

type C2BPayload = {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string | number;
  ThirdPartyTransID?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
};

type TenantRow = Record<string, any>;

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMoney(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString()}`;
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function currentMonthIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sumPaidThisMonth(tenant: TenantRow | null): number {
  if (!tenant) return 0;
  const monthIso = currentMonthIso();
  const history = Array.isArray(tenant.payment_history) ? tenant.payment_history : [];
  return history
    .filter((payment: any) => typeof payment?.date === 'string' && payment.date.startsWith(monthIso) && payment.status === 'Paid')
    .reduce((sum: number, payment: any) => sum + parseMoney(payment.amount), 0);
}

function getEffectiveRent(tenant: TenantRow | null): number {
  if (!tenant) return 0;
  const monthIso = currentMonthIso();
  const activationMonth = tenant.activation_date
    ? String(tenant.activation_date).slice(0, 7)
    : tenant.onboarding_date
      ? String(tenant.onboarding_date).slice(0, 7)
      : null;
  const firstMonthRent = toNumber(tenant.first_month_rent);
  if (activationMonth === monthIso && firstMonthRent > 0) return firstMonthRent;
  return toNumber(tenant.rent_amount);
}

function getDepositDue(tenant: TenantRow | null): number {
  if (!tenant || tenant.deposit_exempt) return 0;
  const prorated = tenant.prorated_deposit;
  if (prorated?.enabled) {
    return Math.max(0, toNumber(prorated.totalDepositAmount) - toNumber(prorated.amountPaidSoFar));
  }
  const depositMonths = toNumber(tenant.deposit_months) > 0 ? toNumber(tenant.deposit_months) : 1;
  const expected = toNumber(tenant.deposit_expected) > 0
    ? toNumber(tenant.deposit_expected)
    : toNumber(tenant.rent_amount) * depositMonths;
  return Math.max(0, expected - toNumber(tenant.deposit_paid));
}

function getPendingItems(items: unknown): Array<{ id: string; label: string; amount: number }> {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item: any) => item?.status === 'Pending')
    .map((item: any, index: number) => ({
      id: String(item?.id ?? `${index}`),
      label: String(item?.description || item?.type || 'balance'),
      amount: toNumber(item?.amount),
    }))
    .filter(item => item.amount > 0);
}

function summarizeOutstanding(tenant: TenantRow | null): string {
  if (!tenant) return 'Your payment has been received.';

  const parts: string[] = [];
  const rentOutstanding = Math.max(0, getEffectiveRent(tenant) - sumPaidThisMonth(tenant));
  const depositDue = getDepositDue(tenant);
  const pendingBills = getPendingItems(tenant.outstanding_bills);
  const pendingFines = getPendingItems(tenant.outstanding_fines);

  if (rentOutstanding > 0) parts.push(`unpaid rent of ${formatKes(rentOutstanding)}`);
  if (depositDue > 0) parts.push(`${tenant.prorated_deposit?.enabled ? 'deposit balance' : 'unpaid deposit'} of ${formatKes(depositDue)}`);
  pendingBills.slice(0, 2).forEach(item => parts.push(`${item.label.toLowerCase()} of ${formatKes(item.amount)}`));
  pendingFines.slice(0, 2).forEach(item => parts.push(`${item.label.toLowerCase()} of ${formatKes(item.amount)}`));

  const remainingBillCount = Math.max(0, pendingBills.length - 2) + Math.max(0, pendingFines.length - 2);
  const remainingExtraTotal = [
    ...pendingBills.slice(2).map(item => item.amount),
    ...pendingFines.slice(2).map(item => item.amount),
  ].reduce((sum, amount) => sum + amount, 0);

  if (remainingBillCount > 0 && remainingExtraTotal > 0) {
    parts.push(`other balances of ${formatKes(remainingExtraTotal)}`);
  }

  if (parts.length === 0) return 'Your account is paid in full.';
  return `You still have ${joinParts(parts)}.`;
}

function summarizeCoveredItems(beforeTenant: TenantRow | null, afterTenant: TenantRow | null): string[] {
  const covered: string[] = [];

  const beforeDepositPaid = toNumber(beforeTenant?.deposit_paid);
  const afterDepositPaid = toNumber(afterTenant?.deposit_paid);
  if (afterDepositPaid > beforeDepositPaid) {
    const depositDelta = afterDepositPaid - beforeDepositPaid;
    covered.push(`${afterTenant?.prorated_deposit?.enabled ? 'prorated deposit' : 'deposit'} of ${formatKes(depositDelta)}`);
  }

  const beforeBills = new Map(getPendingItems(beforeTenant?.outstanding_bills).map(item => [item.id, item]));
  const afterBillsPendingIds = new Set(getPendingItems(afterTenant?.outstanding_bills).map(item => item.id));
  for (const [id, item] of beforeBills.entries()) {
    if (!afterBillsPendingIds.has(id)) covered.push(`${item.label.toLowerCase()} of ${formatKes(item.amount)}`);
  }

  const beforeFines = new Map(getPendingItems(beforeTenant?.outstanding_fines).map(item => [item.id, item]));
  const afterFinesPendingIds = new Set(getPendingItems(afterTenant?.outstanding_fines).map(item => item.id));
  for (const [id, item] of beforeFines.entries()) {
    if (!afterFinesPendingIds.has(id)) covered.push(`${item.label.toLowerCase()} of ${formatKes(item.amount)}`);
  }

  const beforeRentCovered = sumPaidThisMonth(beforeTenant) + 0.5 >= getEffectiveRent(beforeTenant);
  const afterRentCovered = sumPaidThisMonth(afterTenant) + 0.5 >= getEffectiveRent(afterTenant);
  if (!beforeRentCovered && afterRentCovered && getEffectiveRent(afterTenant) > 0) {
    covered.push(`rent of ${formatKes(getEffectiveRent(afterTenant))}`);
  }

  return covered;
}

function buildAcknowledgementSms(beforeTenant: TenantRow | null, afterTenant: TenantRow, amount: number, reference: string): string {
  const name = String(afterTenant.name || 'Tenant').trim();
  const covered = summarizeCoveredItems(beforeTenant, afterTenant);
  const intro = covered.length > 0
    ? `Dear ${name}, your payment of ${formatKes(amount)} has been received. It covered ${joinParts(covered)}.`
    : `Dear ${name}, your payment of ${formatKes(amount)} has been received.`;
  const outstanding = summarizeOutstanding(afterTenant);
  return `${intro} ${outstanding} Ref: ${reference}. - TaskMe Realty`;
}

async function getMatchedTenantBeforePayment(sb: ReturnType<typeof createClient>, billRef: string): Promise<TenantRow | null> {
  if (!billRef) return null;
  const { data } = await sb.rpc('find_active_tenant_by_unit_tag', { p_tag: billRef });
  const row = Array.isArray(data) ? data[0] : null;
  const tenantId = row?.tenant_id ? String(row.tenant_id) : null;
  if (!tenantId) return null;
  const { data: tenant } = await sb.from('tenants').select('*').eq('id', tenantId).maybeSingle();
  return tenant ?? null;
}

async function isBulkSmsEnabled(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await sb
    .from('system_settings')
    .select('bulk_sms_enabled')
    .eq('id', 'singleton')
    .maybeSingle();
  return data?.bulk_sms_enabled ?? false;
}

async function sendSmsViaEdge(
  to: string,
  content: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ to, content, senderId: 'TASK-ME' }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data as any)?.error) {
    throw new Error((data as any)?.error || `HTTP ${response.status}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const verifyIp = (Deno.env.get("MPESA_VERIFY_CALLBACK_IP") ?? "true") !== "false";
  if (verifyIp) {
    const ip = resolveCallerIp(req);
    if (!ip || !SAFARICOM_IPS.has(ip)) {
      console.warn(`[c2b-confirmation] rejected IP: ${ip}`);
      return json(200, { ResultCode: 0, ResultDesc: "Ignored" });
    }
  }

  const payload = await req.json().catch(() => null) as C2BPayload | null;
  if (!payload) {
    console.warn("[c2b-confirmation] invalid JSON body");
    return json(200, { ResultCode: 0, ResultDesc: "Bad payload ignored" });
  }

  const transId = String(payload.TransID ?? "").trim();
  if (!transId) {
    console.warn("[c2b-confirmation] payload missing TransID:", JSON.stringify(payload));
    return json(200, { ResultCode: 0, ResultDesc: "Missing TransID ignored" });
  }

  const amount = Number(payload.TransAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.warn(`[c2b-confirmation] invalid TransAmount for ${transId}:`, payload.TransAmount);
    return json(200, { ResultCode: 0, ResultDesc: "Invalid amount ignored" });
  }

  const billRef = String(payload.BillRefNumber ?? "").trim();
  const msisdn = String(payload.MSISDN ?? "").trim() || null;
  const firstName = String(payload.FirstName ?? "").trim() || null;
  const middleName = String(payload.MiddleName ?? "").trim() || null;
  const lastName = String(payload.LastName ?? "").trim() || null;
  const shortcode = String(payload.BusinessShortCode ?? "").trim() || null;
  const orgBalance = payload.OrgAccountBalance !== undefined && payload.OrgAccountBalance !== ""
    ? Number(payload.OrgAccountBalance)
    : null;
  const transTime = String(payload.TransTime ?? "").trim() || null;

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[c2b-confirmation] Supabase env vars missing");
    return json(500, { ResultCode: 1, ResultDesc: "Server misconfigured" });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Multi-tenant: resolve owning organization from the receiving PayBill ──
    // We tag the raw payload with `_org_id` so downstream consumers (and the
    // record_c2b_payment RPC) can scope the payment to the right tenant org.
    // Also audit-log the receipt so Integral has a per-org payment trail.
    let resolvedOrgId: string | null = null;
    let resolvedOrgTier: string | null = null;
    if (shortcode) {
      const { data: orgRows } = await sb.rpc("resolve_org_by_shortcode", { _shortcode: shortcode });
      const orgRow = Array.isArray(orgRows) ? orgRows[0] : null;
      resolvedOrgId = orgRow?.id ?? null;
      resolvedOrgTier = orgRow?.tier ?? null;
      if (!resolvedOrgId) {
        console.warn(`[c2b-confirmation] no org found for shortcode ${shortcode} — falling back to default tenant`);
      } else if (orgRow?.status === 'suspended') {
        console.warn(`[c2b-confirmation] org ${orgRow.slug} is suspended — accepting payment for audit but not routing`);
      }
    }

    const enrichedPayload = { ...payload, _org_id: resolvedOrgId };
    const beforeTenant = await getMatchedTenantBeforePayment(sb, billRef);

    // Route tags owned by the standalone Partial RMS into its dedicated ledger.
    // The RPC returns no row when the tag is not a Partial RMS account, in which
    // case the established Full RMS ingestion remains the fallback.
    const { data: partialRmsRows, error: partialRmsError } = await sb.rpc("record_partial_rms_c2b_payment", {
      p_transaction_id: transId, p_amount: amount, p_msisdn: msisdn,
      p_bill_ref: billRef, p_first_name: firstName, p_middle_name: middleName,
      p_last_name: lastName, p_trans_time: transTime,
    });
    if (partialRmsError) console.warn('[c2b-confirmation] Partial RMS routing failed:', partialRmsError.message);
    const partialRmsRow = Array.isArray(partialRmsRows) ? partialRmsRows[0] : partialRmsRows;

    const { data, error } = partialRmsRow?.matched_tenant_id
      ? { data: partialRmsRows, error: null }
      : await sb.rpc("record_c2b_payment", {
          p_transaction_id: transId,
          p_amount: amount,
          p_msisdn: msisdn,
          p_bill_ref: billRef,
          p_business_short_code: shortcode,
          p_first_name: firstName,
          p_middle_name: middleName,
          p_last_name: lastName,
          p_org_balance: orgBalance,
          p_raw: enrichedPayload as unknown as Record<string, unknown>,
          p_trans_time: transTime,
        });

    // Audit the per-org payment receipt (best-effort; never fails the callback)
    if (resolvedOrgId) {
      await sb.from('org_audit_log').insert({
        org_id: resolvedOrgId,
        action: 'mpesa_c2b_received',
        target_type: 'payment',
        target_id: transId,
        metadata: { amount, bill_ref: billRef, shortcode, msisdn },
      }).then(() => {}, (e) => console.warn('[c2b-confirmation] audit insert failed:', e?.message));
    }

    // Partial-tier orgs also write to partial_payments (split into mgmt fee + landlord payout)
    if (resolvedOrgId && resolvedOrgTier === 'partial') {
      try {
        const payerName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || null;
        const { data: partialRow } = await sb.rpc('record_partial_payment', {
          p_org_id: resolvedOrgId,
          p_amount: amount,
          p_unit_tag: billRef,
          p_receipt: transId,
          p_msisdn: msisdn,
          p_payer_name: payerName,
          p_paid_at: new Date().toISOString(),
          p_raw: enrichedPayload as unknown as Record<string, unknown>,
        });

        // New flow: all money lands on the LANDLORD paybill. The portion that
        // belongs to the agency (placement fee / management fee / deposit going
        // to agency, etc.) is auto-deducted from the landlord paybill via an
        // M-Pesa B2B PayBill request to the agency shortcode.
        const partial = Array.isArray(partialRow) ? partialRow[0] : partialRow;
        const agencyShare = Number(partial?.agency_amount ?? 0);
        const agencyShortcode = Deno.env.get('MPESA_AGENCY_SHORTCODE') || '';
        if (agencyShare > 0 && shortcode && agencyShortcode && shortcode !== agencyShortcode) {
          // Fire-and-forget; failures are logged to mpesa_b2b_payouts.
          fetch(`${SUPABASE_URL}/functions/v1/mpesa-b2b-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              amount: agencyShare,
              fromShortcode: shortcode,
              toShortcode: agencyShortcode,
              accountReference: (billRef || 'AGENCY').slice(0, 12),
              remarks: `Auto agency share for ${transId}`,
              sourcePaymentId: transId,
            }),
          }).catch((e) => console.warn(`[c2b-confirmation] B2B trigger failed for ${transId}:`, (e as Error)?.message));
        }
      } catch (e) {
        console.warn(`[c2b-confirmation] record_partial_payment failed for ${transId}:`, (e as Error)?.message);
      }
    }

    if (error) {
      console.error(`[c2b-confirmation] RPC error for ${transId}:`, error.message);
      return json(500, { ResultCode: 1, ResultDesc: "DB error" });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const matchedTenantId = row?.matched_tenant_id ?? null;
    const wasDuplicate = !!row?.was_duplicate;

    if (matchedTenantId && !wasDuplicate) {
      const { data: afterTenant } = await sb.from('tenants').select('*').eq('id', matchedTenantId).maybeSingle();
      const bulkSmsEnabled = await isBulkSmsEnabled(sb);
      if (afterTenant?.phone && bulkSmsEnabled) {
        const smsContent = buildAcknowledgementSms(beforeTenant, afterTenant, amount, transId);
        // Decouple SMS sending to prevent C2B webhook from timing out.
        sendSmsViaEdge(afterTenant.phone, smsContent, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
          .catch((smsError) => console.error(`[c2b-confirmation] SMS send failed for ${transId}:`, (smsError as Error)?.message));
      }
    }

    console.log(
      `[c2b-confirmation] ${transId} amount=${amount} billRef="${billRef}" ` +
      `matched=${matchedTenantId ? "yes" : "no"} duplicate=${wasDuplicate}`,
    );

    return json(200, { ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e) {
    console.error(`[c2b-confirmation] unhandled error for ${transId}:`, (e as Error)?.message);
    return json(500, { ResultCode: 1, ResultDesc: "Internal server error" });
  }
});
