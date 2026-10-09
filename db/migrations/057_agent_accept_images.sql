-- 057_agent_accept_images.sql
-- Per-agent toggle: when on, inbound WhatsApp photos (e.g. a handwritten order
-- list) are downloaded and passed to the LLM as images. Needs a vision-capable
-- model. Additive + idempotent.

ALTER TABLE coexistence.agents
  ADD COLUMN IF NOT EXISTS accept_images BOOLEAN NOT NULL DEFAULT FALSE;
