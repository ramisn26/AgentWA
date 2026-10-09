-- 058_agent_counters.sql
-- Atomic per-agent counters. Used for Order IDs (CRC-0001, CRC-0002, ...):
-- one upsert per ID, so two simultaneous orders can never get the same number.
-- agent_id is TEXT so this works whatever type agents.id has. Additive + idempotent.

CREATE TABLE IF NOT EXISTS coexistence.agent_counters (
  agent_id TEXT   NOT NULL,
  name     TEXT   NOT NULL,
  value    BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, name)
);
