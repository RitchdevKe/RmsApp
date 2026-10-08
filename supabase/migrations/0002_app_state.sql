-- supabase/migrations/0002_app_state.sql

create table if not exists app.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

