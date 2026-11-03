CREATE TABLE IF NOT EXISTS endpoints (
  id text PRIMARY KEY CHECK (id ~ '^0x[0-9a-f]{64}$'),
  name text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('evm', 'native')),
  expected_chain_id integer,
  expected_genesis_hash text,
  interval_ms integer NOT NULL DEFAULT 30000 CHECK (interval_ms BETWEEN 250 AND 3600000),
  timeout_ms integer NOT NULL DEFAULT 8000 CHECK (timeout_ms BETWEEN 100 AND 30000),
  failure_threshold integer NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 20),
  recovery_threshold integer NOT NULL DEFAULT 3 CHECK (recovery_threshold BETWEEN 1 AND 20),
  enabled boolean NOT NULL DEFAULT true,
  simulated boolean NOT NULL DEFAULT false,
  fault_mode text NOT NULL DEFAULT 'normal' CHECK (fault_mode IN ('normal', 'timeout')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  consecutive_successes integer NOT NULL DEFAULT 0,
  active_incident_id uuid,
  last_checked_at timestamptz,
  last_height numeric(78,0),
  height_changed_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS health_checks (
  id uuid PRIMARY KEY,
  endpoint_id text NOT NULL REFERENCES endpoints(id),
  monitor_id text NOT NULL,
  checked_at timestamptz NOT NULL,
  success boolean NOT NULL,
  latency_ms integer NOT NULL,
  chain_id integer,
  block_height numeric(78,0),
  genesis_hash text,
  error_code text,
  warnings jsonb NOT NULL DEFAULT '[]',
  methods jsonb NOT NULL,
  simulated boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS health_checks_endpoint_time ON health_checks(endpoint_id, checked_at DESC);
CREATE TABLE IF NOT EXISTS evidence (
  hash text PRIMARY KEY CHECK (hash ~ '^0x[0-9a-f]{64}$'),
  canonical_json text NOT NULL,
  bundle jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY,
  report_key text NOT NULL UNIQUE,
  endpoint_id text NOT NULL REFERENCES endpoints(id),
  severity smallint NOT NULL CHECK (severity BETWEEN 1 AND 3),
  failure_code text NOT NULL,
  failure_count integer NOT NULL,
  observed_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL,
  recovered_at timestamptz,
  ledger_status text NOT NULL DEFAULT 'open_queued',
  evidence_hash text NOT NULL REFERENCES evidence(hash),
  resolution_hash text REFERENCES evidence(hash),
  chain_incident_id numeric(78,0),
  open_tx_hash text,
  resolve_tx_hash text,
  reporter text,
  simulated boolean NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_detected_time ON incidents(detected_at DESC);
CREATE TABLE IF NOT EXISTS timeline (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  detail text NOT NULL,
  transaction_hash text,
  source_key text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS timeline_incident_time ON timeline(incident_id, occurred_at);
CREATE TABLE IF NOT EXISTS outbox (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  kind text NOT NULL CHECK (kind IN ('open', 'resolve')),
  evidence_hash text NOT NULL REFERENCES evidence(hash),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'submitted', 'confirmed', 'exhausted')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  transaction_hash text,
  raw_transaction text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(incident_id, kind)
);
CREATE TABLE IF NOT EXISTS monitors (
  id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'starting',
  last_error text
);
CREATE TABLE IF NOT EXISTS registry_events (
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number numeric(78,0) NOT NULL,
  event_name text NOT NULL,
  incident_id numeric(78,0) NOT NULL,
  endpoint_id text NOT NULL,
  reporter text NOT NULL,
  evidence_hash text NOT NULL,
  chain_timestamp timestamptz NOT NULL,
  PRIMARY KEY(transaction_hash, log_index)
);
CREATE TABLE IF NOT EXISTS indexer_state (
  registry text PRIMARY KEY,
  last_block numeric(78,0) NOT NULL
);
