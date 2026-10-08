-- 0087_sms_logs.sql
-- Create sms_logs table to track outbound SMS events from the send-sms edge function.

begin;

create table if not exists app.sms_logs (
    id            uuid primary key default gen_random_uuid(),
    to_number     text not null,
    body          text not null,
    provider      text,
    provider_ref  text,
    status        text not null,
    error         text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_sms_logs_created_at on app.sms_logs (created_at desc);
create index if not exists idx_sms_logs_status on app.sms_logs (status);

commit;
