// Deny-by-default API gate for the `customer` role (onboarded client users).
//
// Customers get exactly two modules: Chats and Bulk Message (broadcasts).
// Rather than trusting every router to remember a guard, this middleware
// rejects ANY /api request from a customer that isn't on the allowlist below.
// Allowed endpoints are then individually scoped to the customer's own
// WhatsApp number(s) inside their routers (see middleware/access.js).
//
// Adding a feature for customers later = add its endpoint here AND make sure
// the route scopes its data with customerScope()/assertWaAccess().

const { isCustomer } = require('../permissions');

const ALLOW = [
  // ── Chats ────────────────────────────────────────────────────────────────
  ['GET',  /^\/numbers$/],
  ['GET',  /^\/contacts$/],
  ['GET',  /^\/saved-contacts$/],
  ['GET',  /^\/contact$/],
  ['GET',  /^\/contact-names$/],
  ['POST', /^\/contacts\/save$/],
  ['GET',  /^\/messages$/],
  ['GET',  /^\/messages\/window-status$/],
  ['POST', /^\/messages\/mark-read$/],
  ['POST', /^\/messages\/send$/],
  ['POST', /^\/messages\/send-media$/],
  ['POST', /^\/messages\/send-audio$/],
  ['POST', /^\/messages\/send-library-media$/],
  ['POST', /^\/messages\/react$/],
  ['POST', /^\/messages\/star$/],
  ['GET',  /^\/media\/[^/]+$/],
  ['POST', /^\/media\/[^/]+\/retry$/],
  ['GET',  /^\/events$/],

  // ── Bulk Message (broadcasts) ────────────────────────────────────────────
  ['GET',    /^\/broadcasts$/],
  ['POST',   /^\/broadcasts$/],
  ['GET',    /^\/broadcasts\/\d+$/],
  ['PUT',    /^\/broadcasts\/\d+$/],
  ['DELETE', /^\/broadcasts\/\d+$/],
  ['POST',   /^\/broadcasts\/\d+\/send$/],
  ['POST',   /^\/broadcasts\/\d+\/test$/],

  // ── Read-only lookups both pages need (scoped where data is per-account) ─
  ['GET', /^\/templates$/],
  ['GET', /^\/templates\/\d+$/],
  ['GET', /^\/media-library$/],
  ['GET', /^\/media-library\/\d+\/download$/],
  ['GET', /^\/whatsapp-accounts$/],
  ['GET', /^\/whatsapp-accounts\/by-phone\/[^/]+$/],
  ['GET', /^\/tags$/],
  ['GET', /^\/categories$/],
  ['GET', /^\/contact-fields$/],
];

function customerGate(req, res, next) {
  if (!isCustomer(req.user)) return next();
  const path = req.path.replace(/\/+$/, '') || '/';
  const ok = ALLOW.some(([method, re]) => method === req.method && re.test(path));
  if (ok) return next();
  return res.status(403).json({ error: 'Not available on your plan' });
}

module.exports = { customerGate, CUSTOMER_ALLOW: ALLOW };
