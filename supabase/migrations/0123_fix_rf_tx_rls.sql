-- Fix Wallet Balances by allowing authenticated users to select rf_transactions
-- This restores the pre-normalization behavior where all users could pull the rf_transactions blob.
drop policy if exists rf_tx_select_admin on public.rf_transactions;
create policy rf_tx_select_auth on public.rf_transactions for select to authenticated using (true);
