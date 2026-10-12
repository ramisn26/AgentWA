-- 059_conversation_log.sql
-- Conversation log (customer + AI messages -> "Conversations" tab, keyed by Order ID).
--  * conversation_log_orders : which Order ID was issued to which customer (so a later
--    PAID / status / cancel can be tagged safely, never to another customer's order)
--  * conversation_log_cursor : last message already logged per customer (no duplicates)
-- agent_id is TEXT so this works whatever type agents.id has. Additive + idempotent.

CREATE TABLE IF NOT EXISTS coexistence.conversation_log_orders (
  order_id       TEXT        NOT NULL,
  agent_id       TEXT        NOT NULL,
  contact_number TEXT        NOT NULL,
  customer_name  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, order_id)
);
CREATE INDEX IF NOT EXISTS conversation_log_orders_contact_idx
  ON coexistence.conversation_log_orders (agent_id, contact_number);

CREATE TABLE IF NOT EXISTS coexistence.conversation_log_cursor (
  agent_id       TEXT        NOT NULL,
  contact_number TEXT        NOT NULL,
  last_ts        TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, contact_number)
);
