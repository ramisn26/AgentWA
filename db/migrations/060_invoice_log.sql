-- 060_invoice_log.sql
-- One row per order whose estimate PDF was handled: exactly-once claim + audit trail.
-- status: pending | sent | failed | mismatch.  agent_id is TEXT so it works whatever type agents.id has.
CREATE TABLE IF NOT EXISTS coexistence.invoice_log (
  agent_id         TEXT        NOT NULL,
  order_id         TEXT        NOT NULL,
  contact_number   TEXT,
  status           TEXT        NOT NULL,
  local_message_id TEXT,
  computed_total   NUMERIC,
  saved_total      NUMERIC,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, order_id)
);
