# SMS / Resend Readiness Audit

## Executive Summary

Auth is **email/password only**. SMS and Resend (email) are **simulated/mock**. This document audits the current setup and lists what is needed for real Twilio SMS and Resend integration.

---

## 1. Current Auth Setup

| Aspect | Status | Notes |
|--------|--------|-------|
| Login | Email + Password | `supabase.auth.signInWithPassword` in `Auth.tsx` |
| Sign Up | Email + Password | `supabase.auth.signUp` in `SignUp.tsx` |
| Phone / OTP Auth | Not implemented | No `signInWithOtp`, `verifyOtp`, or `resend` calls |
| Forgot Password | Placeholder | Shows alert, no real reset flow |
| Phone field | Collectible only | Phone stored in profiles/forms but not used for auth |

---

## 2. Communication API (`utils/communicationApi.ts`)

All methods are **mock**:

- `sendSMS` – logs and returns fake `messageId` / `providerRef`; no Twilio call
- `sendEmail` – logs and returns fake `messageId`; no Resend call
- `sendWhatsApp` – mock
- `sendInApp` – mock
- `pullMessages` – returns random fake messages
- `pullDeliveryReports` – returns random statuses

**Missing for real integration:**

- No env vars for API keys
- No SDK imports (Twilio, Resend)
- No HTTP calls to external APIs
- No webhook endpoints for delivery status

---

## 3. SMS Usage in App

| Location | Purpose | Current behavior |
|----------|---------|------------------|
| `TaskManagement.tsx` | Send message to tenant | Uses `addMessage` (internal); `communicationApi.sendSMS` not invoked |
| `ActiveTenants.tsx` | Receipt / fine notifications | `addMessage` only; no real SMS |
| `LandlordsPortal.tsx` | Share referral link via SMS | `handleShare('SMS', ...)` – mock only |
| `TenantPortal.tsx` | STK prompt / updates | References "updates via SMS" in alert text |
| `operations/communication/*` | Templates, automation | Channel options include SMS; no real send |
| `hr/StaffManagement.tsx` | OTP for sensitive changes | Hardcoded `otp === '1234'` – mock only |

---

## 4. What’s Missing for Twilio SMS

| Item | Status | Suggestion |
|------|--------|------------|
| Env vars | Missing | `VITE_TWILIO_ACCOUNT_SID`, `VITE_TWILIO_AUTH_TOKEN` (or server-side only) |
| Twilio SDK | Not in `package.json` | `npm install twilio` (server-side) |
| Server endpoint | None | Edge function or backend route to call Twilio API (never expose auth token in client) |
| Phone auth in Supabase | Not configured | Enable Phone provider in Supabase Dashboard → Auth → Providers |
| Sender ID / From number | Not configured | Twilio phone number or alphanumeric sender ID |

---

## 5. What’s Missing for Resend (Email)

| Item | Status | Suggestion |
|------|--------|------------|
| Env vars | Missing | `RESEND_API_KEY` (server-side only) |
| Resend SDK | Not in `package.json` | `npm install resend` (server-side) |
| Server endpoint | None | Edge function or backend route to send email |
| Email templates | Basic | Can use Resend React Email or HTML strings |
| Verified domain | Unknown | Verify domain in Resend dashboard |

---

## 6. Recommended Minimal Config (No Implementation Yet)

### `.env` / `.env.local` (add these when ready)

```env
# Twilio (server-side only – never in VITE_)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+254XXXXXXXXX

# Resend (server-side only)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

### `package.json` (add when implementing)

```json
{
  "dependencies": {
    "twilio": "^5.x",
    "resend": "^4.x"
  }
}
```

### Supabase

- Auth → Providers → Phone: enable and configure (if using phone OTP)
- Edge Functions: create `send-sms` and `send-email` functions that read env and call Twilio/Resend

---

## 7. Step-by-Step Resend Implementation Guide

### Phase 1: Setup

1. Create Resend account at [resend.com](https://resend.com)
2. Verify your sending domain
3. Generate an API key
4. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to `.env` (and Supabase Edge Function secrets if using Edge Functions)

### Phase 2: Backend (Supabase Edge Function)

1. Create `supabase/functions/send-email/index.ts`
2. Use Deno `fetch` or `resend` SDK to send email
3. Accept `{ to, subject, html }` in request body
4. Validate and sanitize inputs
5. Return `{ success, messageId }` or error

### Phase 3: Client Integration

1. Add a small wrapper (e.g. `utils/emailClient.ts`) that calls your Edge Function
2. Replace mock `communicationApi.sendEmail` with this wrapper where real emails are required
3. Start with critical flows (e.g. password reset, important notifications)

### Phase 4: Templates

1. Define HTML or React Email templates for:
   - Password reset
   - Rent reminders
   - Payment receipts
   - Welcome emails
2. Store template IDs or names and pass variables (tenant name, amount, etc.)

### Phase 5: Error Handling and Logging

1. Log failures and retries
2. Optional: store sent emails in `public.email_logs` for audit
3. Handle Resend rate limits and failures in UI

---

## 8. Step-by-Step Twilio SMS Implementation Guide

### Phase 1: Setup

1. Create Twilio account
2. Buy a phone number or configure alphanumeric sender ID (check local regulations)
3. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` to server env

### Phase 2: Backend (Supabase Edge Function)

1. Create `supabase/functions/send-sms/index.ts`
2. Use Twilio REST API or SDK to send SMS
3. Accept `{ to, body }` in request body
4. Format phone numbers (e.g. E.164 for Kenya: +254...)
5. Return `{ success, messageId }` or error

### Phase 3: Client Integration

1. Add wrapper that calls the Edge Function
2. Replace mock `communicationApi.sendSMS` where real SMS is needed
3. Prioritize: rent reminders, OTP (if using phone auth), critical alerts

### Phase 4: Webhooks (Optional)

1. Configure Twilio webhook URL for delivery status
2. Create Edge Function to receive status callbacks
3. Update `messages` or a `sms_logs` table with delivery status

---

**SMS/Resend readiness audit complete.**
