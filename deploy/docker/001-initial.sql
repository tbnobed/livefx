-- Additive bootstrap for a dedicated local database; safe to run again.
-- Future schema changes need numbered, reviewed migrations, not DROP/recreate.
BEGIN;
CREATE TABLE IF NOT EXISTS fx_servers (
    id text PRIMARY KEY,
    name text NOT NULL,
    role text NOT NULL,
    base_url text NOT NULL DEFAULT '',
    allow_control boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS fx_activity (
    id serial PRIMARY KEY,
    server_id text NOT NULL,
    server_name text NOT NULL,
    action text NOT NULL,
    ok boolean NOT NULL,
    timestamp timestamptz NOT NULL DEFAULT now(),
    detail text NOT NULL
);
COMMIT;
