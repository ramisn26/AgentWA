'use strict';

// Customer (onboarded client) role: page map, deny-by-default API gate, and
// number-ownership checks. The pg pool is stubbed — no database is touched.
const test = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../src/db');
const { effectivePages, hasPermission, isCustomer } = require('../src/permissions');
const { customerGate } = require('../src/middleware/customerGate');
const { assertWaAccess, assertContactAccess, customerScope } = require('../src/middleware/access');

// Customer id 7 owns +91 70101 02590 only.
const OWNED = '917010102590';
pool.query = async (sql) => {
  if (/user_wa_assignments/.test(sql)) return { rows: [{ wa_number: '+91 70101 02590' }] };
  if (/whatsapp_accounts/.test(sql)) return { rows: [{ id: '3' }] };
  return { rows: [] };
};

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}
const customer = { id: 7, role: 'customer' };

function gate(method, path, user = customer) {
  const res = mockRes();
  let passed = false;
  customerGate({ method, path, user }, res, () => { passed = true; });
  return { passed, res };
}

test('customer sees only Chats and Bulk Message pages', () => {
  assert.equal(isCustomer(customer), true);
  assert.deepEqual([...effectivePages(customer)].sort(), ['bulk-message', 'chats']);
  assert.equal(hasPermission(customer, 'bulk-message'), true);
  for (const p of ['home', 'contacts', 'template-builder', 'chatbot-builder', 'pipelines',
    'media-library', 'admin-settings:users', 'admin-settings:whatsapp-accounts']) {
    assert.equal(hasPermission(customer, p), false, p);
  }
});

test('gate allows the chat + broadcast endpoints', () => {
  for (const [m, p] of [
    ['GET', '/numbers'], ['GET', '/contacts'], ['GET', '/messages'],
    ['POST', '/messages/send'], ['POST', '/messages/send-media'], ['GET', '/media/wamid.ABC'],
    ['GET', '/broadcasts'], ['POST', '/broadcasts'], ['GET', '/broadcasts/12'],
    ['PUT', '/broadcasts/12'], ['DELETE', '/broadcasts/12'],
    ['POST', '/broadcasts/12/send'], ['POST', '/broadcasts/12/test'],
    ['GET', '/templates'], ['GET', '/media-library'], ['GET', '/whatsapp-accounts'],
  ]) {
    assert.equal(gate(m, p).passed, true, `${m} ${p}`);
  }
});

test('gate blocks every other module with 403', () => {
  for (const [m, p] of [
    ['GET', '/agents'], ['GET', '/agents/1'], ['GET', '/chatbots'], ['GET', '/dashboard'],
    ['GET', '/pipelines'], ['GET', '/deals'], ['GET', '/users'], ['POST', '/users'],
    ['GET', '/google-integrations'], ['DELETE', '/google-integrations/1'],
    ['POST', '/templates'], ['DELETE', '/templates/4'], ['POST', '/media-library'],
    ['POST', '/whatsapp-accounts'], ['GET', '/whatsapp-accounts/3'], ['GET', '/ai-models'],
    ['POST', '/contacts/import'], ['DELETE', '/contact'], ['POST', '/contacts/change-number'],
    ['POST', '/tags'], ['POST', '/upload'], ['GET', '/audit-log'],
  ]) {
    const { passed, res } = gate(m, p);
    assert.equal(passed, false, `${m} ${p} must be blocked`);
    assert.equal(res.statusCode, 403);
  }
});

test('gate never affects admin or sales users', () => {
  assert.equal(gate('GET', '/agents', { id: 1, role: 'admin' }).passed, true);
  assert.equal(gate('GET', '/pipelines', { id: 2, role: 'bda_sales' }).passed, true);
});

test('customer may open any chat on their own number', async () => {
  const res = mockRes();
  assert.equal(await assertWaAccess({ user: customer }, res, OWNED), true);
  assert.equal(await assertContactAccess({ user: customer }, mockRes(), '+91 7010102590', '919999999999'), true);
});

test("customer is refused another business's number", async () => {
  const res = mockRes();
  assert.equal(await assertWaAccess({ user: customer }, res, '919715180246'), false);
  assert.equal(res.statusCode, 403);
  const res2 = mockRes();
  assert.equal(await assertContactAccess({ user: customer }, res2, '919715180246', '919999999999'), false);
  assert.equal(res2.statusCode, 403);
});

test('customerScope resolves owned numbers and account ids', async () => {
  assert.deepEqual(await customerScope(7), { numbers: [OWNED], accountIds: [3] });
});
