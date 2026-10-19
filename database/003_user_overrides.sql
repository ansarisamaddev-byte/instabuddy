create table if not exists user_plan_overrides (
  user_id uuid primary key references users(id) on delete cascade,
  max_accounts integer,
  monthly_posts integer,
  max_mb integer,
  horizon_days integer,
  publish boolean,
  storage_limit bigint,
  monthly_upload_quota bigint,
  retention_days integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

create index if not exists idx_user_plan_overrides_updated on user_plan_overrides(updated_at desc);

alter table users add column if not exists username text;
alter table users add column if not exists phone text;

create unique index if not exists users_username_lower_idx on users(lower(username)) where username is not null;
create unique index if not exists users_phone_lower_idx on users(lower(phone)) where phone is not null;
