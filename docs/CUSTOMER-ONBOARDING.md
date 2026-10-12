# Customer onboarding (limited access: Chats + Broadcast)

A **Customer** is an outside business you onboard onto AgentWA. They log in and see
only **Chats** and **Bulk Message**, limited to their own WhatsApp number(s).

## Onboard a customer
1. Connect their number in **Settings → WhatsApp Accounts** (if not already).
2. Create their templates (and media, if needed) under that account.
3. **Settings → Users → Add user**, set Role = **Customer (Chats + Broadcast)**,
   tick their WhatsApp number(s), and create. Share the one-time credentials.

## What a customer can and can't do
- Can: see every chat on their number(s), reply (text/media/voice), save contact names,
  create/test/send broadcasts from their number using their account's templates and media.
- Can't: see any other number's chats, contacts, broadcasts, templates, media or events;
  open Home, Contacts, Pipelines, Automations, AI Agents, Template Builder, Media, Settings;
  create templates or upload media; change their own password (admin resets it).

## How it's enforced
- `backend/src/middleware/customerGate.js`: deny-by-default API allowlist for the role.
- `backend/src/middleware/access.js`: whole-number ownership via `user_wa_assignments`.
- Per-route scoping in messages, broadcasts, templates, mediaLibrary, whatsappAccounts, events.
- Migration `059_customer_role.sql` adds `customer` to the role CHECK constraint.
- To give customers a new feature later: add its endpoints to the gate's allowlist AND
  scope the route's data with `customerScope()` / `assertWaAccess()`.
