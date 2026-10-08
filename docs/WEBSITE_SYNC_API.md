# Website ↔ RMS Sync API

All endpoints live on the RMS Supabase project as edge functions and accept
calls from `https://www.task-me.ke` and `https://task-me.ke`. Authentication
is a shared secret sent as `X-Webhook-Signature: $WEBSITE_SYNC_SECRET`.

Base URL: `https://<rms-supabase-ref>.functions.supabase.co/`
(or `https://<rms>/functions/v1/` if proxied through the Supabase domain).

## Onboarding flow

```
1. Website captures ?ref=CODE → cookie/localStorage (30 days)
2. User signs up on website → POST /website-signup        (creates RMS tenant)
3. User picks a unit         → POST /website-select-unit  (returns total_due)
4. User pays via STK         → POST /website-stk-push     (RMS owns M-Pesa)
5. Website polls every 3 s   → GET  /website-tenant-status
   when status === 'onboarded' → show success screen
6. On full payment, RMS auto-credits the referral commission (5% default).
```

## Endpoints

### `GET /website-lookup-property?slug=<slug>&unit=<num?>`
Returns publishable property info + units (rent, deposit, availability).

### `GET /website-listings?type=Rent&bedrooms=2&q=<text>&source=<Managed|ThirdParty>`
Public feed of every **Published** marketplace listing — managed units *and*
third-party / marketed-only listings. Use this for the website's property
search; `/website-lookup-property` only covers managed properties.

Bedrooms are normalized so a search for "2 bedroom" matches all sources:
`rentConfig.bedrooms` (third-party) → linked `unit.bedrooms` (managed) →
parsed from the unit type/title as a last resort. Each item also carries
`houseType` (e.g. "2 Bedroom", "Studio"), `deposit`, `price`, `location`,
`zone`, `images`, `features`, `availableFrom` and `paymentTag`.

```json
{ "count": 1,
  "listings": [
    { "id": "L-1", "title": "2 Bedroom in Kilimani", "type": "Rent",
      "source": "ThirdParty", "bedrooms": 2, "houseType": "2 Bedroom",
      "price": 45000, "deposit": 45000, "currency": "KES",
      "location": "Kilimani", "images": [], "features": [] } ] }
```
All query params are optional; omit them to get the whole published feed.

### `POST /website-signup`
```json
{ "website_user_id": "uuid-from-website-supabase",
  "name": "Peter Otieno",
  "phone": "0712345678",
  "email": "p@x.com",
  "ref_code": "PARTNER123",
  "rent_start_date": "2026-07-01" }
```
Idempotent on `website_user_id`. `rent_start_date` is optional (YYYY-MM-DD);
if omitted the tenant defaults to "today" at unit selection time and can be
updated by re-calling `/website-select-unit`. Returns `{ link, created }`.

### `POST /website-select-unit`
```json
{ "website_user_id": "...",
  "property_slug": "baraka-heights",
  "unit_number": "A1",
  "rent_start_date": "2026-07-15" }
```
Computes the prorated first-month rent using the same rule as the RMS
(`utils/tenantPaymentCycle.ts → calculateProratedFirstMonthRent`):
- day ≤ 9   → full month
- 10–24     → prorated days remaining
- ≥ 25      → prorated current month + full next month
`rent_start_date` can be **today or any future date** (e.g. tenant signs up
in May, moves in 1 July → only deposit + July rent collected, July rent
prorated if start day > 9).

Returns:
```json
{ "pricing": {
    "rent": 16500,
    "first_month_rent": 8800,
    "deposit": 16500,
    "total_due": 25300,
    "rent_start_date": "2026-07-15",
    "is_prorated": true,
    "currency": "KES" },
  "unit_tag": "BARAKA/A1" }
```

### `POST /website-stk-push`
```json
{ "website_user_id": "...", "phone": "0712345678", "amount": 25300 }
```
`amount` must be ≥ `total_due` returned by `/website-select-unit`. Returns
`{ checkoutRequestId }`.

### `GET /website-tenant-status?website_user_id=...`
Returns `{ status, expected_amount, paid_amount, last_payment, ref_code, rent_start_date }`.
`status` values: `pending`, `unit_selected`, `awaiting_payment`, `onboarded`, `cancelled`.

## Referral codes
The website MUST attach `ref_code` on `/website-signup`. The code persists on
the link record. When the full registration payment lands, RMS writes one
row to `website_referral_credits` per tenant (idempotent on
`(website_user_id, transaction_id)`), so retries / duplicate callbacks are
safe.

## Setup checklist (RMS side)
1. Run `scripts/0096_website_sync.sql`.
2. Run `scripts/0097_website_rent_start_date.sql`.
2. Set Supabase Edge Function secrets:
   - `WEBSITE_SYNC_SECRET` — same value the website will send in `X-Webhook-Signature`.
   - `CORS_ALLOWED_ORIGINS` — defaults to `https://www.task-me.ke,https://task-me.ke`.
3. Deploy edge functions: `website-lookup-property`, `website-signup`,
   `website-select-unit`, `website-stk-push`, `website-tenant-status`.
4. Confirm `mpesa-callback` is redeployed (now contains the website fan-out hook).
