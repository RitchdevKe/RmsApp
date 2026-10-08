-- supabase/migrations/0025_harden_payments.sql
--
-- Harden the payments table for production M-Pesa:
--   1. UNIQUE index on checkout_request_id — prevents duplicate callback processing.
--   2. reconciliation_status column — audit trail for payment reconciliation.

-- 1. Unique constraint (idempotent: CREATE UNIQUE INDEX IF NOT EXISTS)
create unique index if not exists payments_checkout_request_id_key
  on public.payments(checkout_request_id);

-- 2. Reconciliation status column
alter table public.payments
  add column if not exists reconciliation_status text
    not null default 'unreconciled'
    check (reconciliation_status in ('unreconciled', 'reconciled', 'disputed'));

-- Index to speed up reconciliation queries
create index if not exists payments_reconciliation_status_idx
  on public.payments(reconciliation_status)
  where reconciliation_status = 'unreconciled';
