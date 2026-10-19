DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='description') THEN
    ALTER TABLE plans ADD COLUMN description text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='price_inr') THEN
    ALTER TABLE plans ADD COLUMN price_inr integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='storage_limit') THEN
    ALTER TABLE plans ADD COLUMN storage_limit bigint NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='monthly_upload_quota') THEN
    ALTER TABLE plans ADD COLUMN monthly_upload_quota bigint NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='retention_days') THEN
    ALTER TABLE plans ADD COLUMN retention_days integer NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='active') THEN
    ALTER TABLE plans ADD COLUMN active boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='public_visible') THEN
    ALTER TABLE plans ADD COLUMN public_visible boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='display_order') THEN
    ALTER TABLE plans ADD COLUMN display_order integer NOT NULL DEFAULT 100;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='features') THEN
    ALTER TABLE plans ADD COLUMN features text[] NOT NULL DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
    ALTER TABLE users ADD COLUMN username text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
    ALTER TABLE users ADD COLUMN phone text;
  END IF;
END $$;

UPDATE plans SET description = COALESCE(description, '') WHERE description IS NULL;
UPDATE plans SET price_inr = COALESCE(price_inr, 0) WHERE price_inr IS NULL;
UPDATE plans SET storage_limit = COALESCE(storage_limit, 0) WHERE storage_limit IS NULL;
UPDATE plans SET monthly_upload_quota = COALESCE(monthly_upload_quota, 0) WHERE monthly_upload_quota IS NULL;
UPDATE plans SET retention_days = COALESCE(retention_days, 1) WHERE retention_days IS NULL;
UPDATE plans SET active = COALESCE(active, true) WHERE active IS NULL;
UPDATE plans SET public_visible = COALESCE(public_visible, true) WHERE public_visible IS NULL;
UPDATE plans SET display_order = COALESCE(display_order, 100) WHERE display_order IS NULL;
UPDATE plans SET features = COALESCE(features, '{}') WHERE features IS NULL;

UPDATE plans SET name = 'Free' WHERE name = 'Free';
UPDATE plans SET name = 'Standard', description = 'Balanced publishing for growing brands', price_inr = 1999, monthly_posts = 1000, max_mb = 200, max_accounts = 10, horizon_days = 60, publish_ok = true, active = true, public_visible = true, display_order = 20, retention_days = 30, storage_limit = 20000000000, monthly_upload_quota = 20000000000
WHERE name = 'Paid' OR name = 'Standard';

INSERT INTO plans(name, description, price_inr, max_accounts, monthly_posts, max_mb, storage_limit, monthly_upload_quota, horizon_days, retention_days, publish_ok, active, public_visible, display_order, features)
VALUES
  ('Free', 'For creators testing their posting flow', 0, 1, 10, 50, 5000000000, 5000000000, 7, 7, false, true, true, 10, ARRAY['1 connected account','10 monthly posts','50 MB upload limit','7-day scheduling horizon']::text[]),
  ('Standard', 'Balanced publishing for growing brands', 1999, 10, 1000, 200, 20000000000, 20000000000, 60, 30, true, true, true, 20, ARRAY['10 connected accounts','1,000 monthly posts','200 MB upload limit','60-day scheduling horizon']::text[]),
  ('Premium', 'Advanced automation and priority publishing', 4999, 50, 5000, 500, 50000000000, 50000000000, 180, 90, true, true, true, 30, ARRAY['50 connected accounts','5,000 monthly posts','500 MB upload limit','180-day scheduling horizon']::text[])
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  price_inr = EXCLUDED.price_inr,
  max_accounts = EXCLUDED.max_accounts,
  monthly_posts = EXCLUDED.monthly_posts,
  max_mb = EXCLUDED.max_mb,
  storage_limit = EXCLUDED.storage_limit,
  monthly_upload_quota = EXCLUDED.monthly_upload_quota,
  horizon_days = EXCLUDED.horizon_days,
  retention_days = EXCLUDED.retention_days,
  publish_ok = EXCLUDED.publish_ok,
  active = EXCLUDED.active,
  public_visible = EXCLUDED.public_visible,
  display_order = EXCLUDED.display_order,
  features = EXCLUDED.features;

CREATE TABLE IF NOT EXISTS payments (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  plan_id integer references plans(id),
  amount integer not null default 0,
  currency text not null default 'INR',
  status text not null default 'PENDING' check (status in ('PENDING','PAID','UNPAID','EXPIRED','CANCELLED')),
  reference text,
  note text,
  payment_date timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  admin_id uuid references users(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at desc);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'users_username_idx') THEN
    CREATE UNIQUE INDEX users_username_idx ON users (lower(username)) WHERE username IS NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'users_phone_idx') THEN
    CREATE UNIQUE INDEX users_phone_idx ON users (lower(phone)) WHERE phone IS NOT NULL;
  END IF;
END $$;
