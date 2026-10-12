-- 059: allow the `customer` role (onboarded client businesses with access to
-- Chats + Bulk Message only, scoped to their own WhatsApp numbers via
-- coexistence.user_wa_assignments). Non-destructive: widens the CHECK only.
ALTER TABLE coexistence.forgecrm_users
  DROP CONSTRAINT IF EXISTS forgecrm_users_role_check;
ALTER TABLE coexistence.forgecrm_users
  ADD CONSTRAINT forgecrm_users_role_check
  CHECK (role IN ('admin', 'bda_sales', 'viewer', 'customer'));
