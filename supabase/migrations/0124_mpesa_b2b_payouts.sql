-- 0124_mpesa_b2b_payouts.sql
-- Tracks B2B paybill→paybill auto-deductions initiated by the agency to move
-- the agency's share out of a landlord's paybill after a tenant payment.

create table if not exists public.mpesa_b2b_payouts (
    id                          uuid primary key default gen_random_uuid(),
    created_at                  timestamptz not null default now(),
    org_id                      uuid,
    source_payment_id           text,
    from_shortcode              text not null,
    to_shortcode                text not null,
    amount                      numeric(14,2) not null check (amount > 0),
    account_reference           text,
    remarks                     text,
    conversation_id             text,
    originator_conversation_id  text,
    response_code               text,
    response_description        text,
    result_code                 text,
    result_description          text,
    status                      text not null default 'pending'
        check (status in ('pending','completed','failed','cancelled'))
);

create index if not exists mpesa_b2b_payouts_status_idx       on public.mpesa_b2b_payouts(status);
create index if not exists mpesa_b2b_payouts_conv_idx         on public.mpesa_b2b_payouts(conversation_id);
create index if not exists mpesa_b2b_payouts_origin_conv_idx  on public.mpesa_b2b_payouts(originator_conversation_id);
create index if not exists mpesa_b2b_payouts_org_idx          on public.mpesa_b2b_payouts(org_id);

grant select on public.mpesa_b2b_payouts to authenticated;
grant all    on public.mpesa_b2b_payouts to service_role;

alter table public.mpesa_b2b_payouts enable row level security;

-- Only staff-admin / assistant-admin can read; edge functions use service_role.
create policy "Admins read B2B payouts"
on public.mpesa_b2b_payouts
for select
to authenticated
using (
  public.has_role(auth.uid(), 'staff_admin'::app_role)
  or public.has_role(auth.uid(), 'assistant_admin'::app_role)
);
