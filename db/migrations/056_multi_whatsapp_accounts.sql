-- 056: Allow multiple WhatsApp Business accounts (numbers).
--
-- Migration 041 capped the table at one row with a unique index on a constant
-- expression. Dropping it lets several numbers be connected. The other guard,
-- idx_whatsapp_accounts_one_default, stays: exactly one account is the default
-- (used for fallbacks such as media-library uploads), the rest are non-default.
DROP INDEX IF EXISTS coexistence.whatsapp_accounts_singleton;
