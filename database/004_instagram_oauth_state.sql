CREATE TABLE IF NOT EXISTS instagram_oauth_states (
  state_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

CREATE INDEX IF NOT EXISTS instagram_oauth_states_expires_at_idx
  ON instagram_oauth_states (expires_at);
