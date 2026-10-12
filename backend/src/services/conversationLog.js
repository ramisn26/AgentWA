// Conversation log -> "Conversations" tab of the SAME spreadsheet as Orders.
//
// One row per message:
//   Order ID | Date-Time (IST) | Customer Name | WhatsApp Number | Sender | Message Type | Message
//
// Done entirely in the backend AFTER the reply has been queued (fire-and-forget),
// so it never slows an answer down. The model never sees or calls anything here.
//
// When rows are written:
//  A) A run created an Order ID (the order-id patch returns it in the tool result):
//     everything the customer and the AI said since this contact's last logged
//     message is appended under that Order ID.
//  B) A later run touches that order (PAID, status, cancel...): the run's reply or
//     tool arguments mention exactly ONE Order ID that was issued to this same
//     customer -> the new messages are appended under it.
// A per-contact cursor means a message is logged once. If the Sheets write fails
// the cursor is not moved, so the next flush retries.
//
// Which spreadsheet: reuses the Google account + spreadsheet of the agent's Sheets
// tool for the Orders tab (no extra tool needed). Tab name: CONVERSATION_LOG_TAB.

const { google } = require('googleapis');
const { getAccessToken } = require('./googleAuth');

const TAB = process.env.CONVERSATION_LOG_TAB || 'Conversations';
const LOOKBACK_HOURS = parseInt(process.env.CONVERSATION_LOG_LOOKBACK_HOURS || '48', 10);
const MAX_ROWS = parseInt(process.env.CONVERSATION_LOG_MAX_ROWS || '300', 10);
const ONLY_AGENTS = (process.env.CONVERSATION_LOG_AGENT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_CELL = 4000;
const ID_RE = /\b[A-Z][A-Z0-9]{1,7}-\d{4,}\b/g;
const PLACEHOLDER_BODIES = new Set(['Audio message', 'Voice message', 'Sticker']);
const TYPE_LABEL = { image: 'Image', video: 'Video', audio: 'Voice note', voice: 'Voice note', document: 'Document', sticker: 'Sticker', location: 'Location', contacts: 'Contact', interactive: 'Button reply' };

const locks = new Map();
const warned = new Set();
function warnOnce(key, msg) { if (!warned.has(key)) { warned.add(key); console.warn(msg); } }

function enabledFor(agent) {
  return ONLY_AGENTS.length === 0 || ONLY_AGENTS.includes(String(agent.id));
}

function istStamp(d) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(d)).reduce((a, p) => (a[p.type] = p.value, a), {});
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.day}-${parts.month}-${parts.year} ${hh}:${parts.minute}:${parts.second}`;
}

function messageText(row) {
  const body = (row.message_body || '').trim();
  const label = TYPE_LABEL[row.message_type];
  let text;
  if (!label) text = body;
  else text = `[${label}]` + (body && !PLACEHOLDER_BODIES.has(body) ? ` ${body}` : '');
  return text.slice(0, MAX_CELL);
}

function collectIds(v, out) {
  if (typeof v === 'string') { for (const m of v.matchAll(ID_RE)) out.add(m[0]); }
  else if (Array.isArray(v)) v.forEach(x => collectIds(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => collectIds(x, out));
}

function serial(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
  return next;
}

async function resolveTarget(pool, agent) {
  const { rows } = await pool.query(
    `SELECT config FROM coexistence.agent_tools
      WHERE agent_id = $1 AND is_enabled = TRUE AND tool_type = 'google_sheets' ORDER BY id`,
    [agent.id],
  );
  const cfgs = rows.map(r => r.config || {}).filter(c => c.google_account_id && c.spreadsheet_id);
  const pick = cfgs.find(c => /order/i.test(c.sheet_name || '')) || cfgs[0];
  return pick ? { credentialId: pick.google_account_id, spreadsheetId: pick.spreadsheet_id } : null;
}

async function appendRows({ credentialId, spreadsheetId, rows }) {
  const token = await getAccessToken(credentialId);
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  const sheets = google.sheets({ version: 'v4', auth: oauth2 });
  // RAW: stored exactly as text. A customer message that starts with "=" can never become a formula.
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `'${TAB}'`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

async function fetchMessages(pool, waNumber, contactNumber, since) {
  const base = (cols) => pool.query(
    `SELECT message_id, direction, message_type, message_body, timestamp${cols}
       FROM coexistence.chat_history
      WHERE wa_number = $1 AND contact_number = $2
        AND date_trunc('milliseconds', timestamp) > $3
        AND message_type NOT IN ('status','reaction')
      ORDER BY timestamp ASC, message_id ASC
      LIMIT $4`,
    [waNumber, contactNumber, since, MAX_ROWS],
  );
  try { return (await base(', contact_name')).rows; }
  catch (e) { if (e && e.code === '42703') return (await base('')).rows; throw e; }
}

async function flushConversation({ pool, agent, contactNumber, orderId, getAccountWithToken }) {
  return serial(`${agent.id}:${contactNumber}`, async () => {
    const target = await resolveTarget(pool, agent);
    if (!target) { warnOnce(`nosheet:${agent.id}`, `[conversationLog] agent ${agent.id} has no Google Sheets tool - skipping`); return { skipped: 'no_sheets_tool' }; }
    const acc = await getAccountWithToken(agent.wa_account_id);
    const waNumber = acc && acc.displayPhoneNumber;
    if (!waNumber) return { skipped: 'no_wa_number' };

    const { rows: cur } = await pool.query(
      `SELECT last_ts FROM coexistence.conversation_log_cursor WHERE agent_id = $1 AND contact_number = $2`,
      [String(agent.id), contactNumber],
    );
    const floor = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
    const since = new Date(Math.max(cur[0] ? new Date(cur[0].last_ts).getTime() : 0, floor));

    const msgs = await fetchMessages(pool, waNumber, contactNumber, since);
    if (msgs.length === 0) return { logged: 0 };

    const { rows: ord } = await pool.query(
      `SELECT customer_name FROM coexistence.conversation_log_orders WHERE agent_id = $1 AND order_id = $2`,
      [String(agent.id), orderId],
    );
    const name = (ord[0] && ord[0].customer_name) || (msgs.find(m => m.contact_name) || {}).contact_name || '';

    const values = msgs.map(m => [
      orderId, istStamp(m.timestamp), name, String(contactNumber),
      m.direction === 'incoming' ? 'Customer' : 'AI',
      m.message_type || 'text', messageText(m),
    ]);
    try {
      await appendRows({ ...target, rows: values });
    } catch (e) {
      const hint = /Unable to parse range/i.test(e.message || '')
        ? ` - create a tab named "${TAB}" (with the header row) in the same spreadsheet as Orders` : '';
      console.warn(`[conversationLog] append failed for ${orderId}: ${e.message}${hint}`);
      return { failed: true };
    }
    const last = new Date(Math.max(...msgs.map(m => new Date(m.timestamp).getTime())));
    await pool.query(
      `INSERT INTO coexistence.conversation_log_cursor AS c (agent_id, contact_number, last_ts, updated_at)
            VALUES ($1, $2, $3, NOW())
       ON CONFLICT (agent_id, contact_number) DO UPDATE SET last_ts = EXCLUDED.last_ts, updated_at = NOW()`,
      [String(agent.id), contactNumber, last],
    );
    return { logged: values.length };
  });
}

/**
 * One tracker per agent run. wrapExecutors() (call AFTER the order-id wrapper is installed)
 * watches tool calls; finish() is called once the reply is queued and never blocks.
 */
function createRunTracker({ pool, agent, contactNumber, getAccountWithToken }) {
  const state = { newId: null, referenced: new Set() };

  async function register(orderId, args) {
    let customerName = null;
    if (args && Array.isArray(args.values) && typeof args.values[1] === 'string') customerName = args.values[1].slice(0, 80);
    await pool.query(
      `INSERT INTO coexistence.conversation_log_orders (order_id, agent_id, contact_number, customer_name)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, order_id) DO NOTHING`,
      [orderId, String(agent.id), contactNumber, customerName],
    );
  }

  function wrapExecutors(executors) {
    if (!enabledFor(agent)) return;
    for (const name of Object.keys(executors)) {
      const orig = executors[name];
      if (typeof orig !== 'function') continue;
      executors[name] = async (args) => {
        collectIds(args, state.referenced);
        const result = await orig(args);
        if (result && typeof result === 'object' && typeof result.order_id === 'string') {
          state.newId = result.order_id;
          try { await register(result.order_id, args); }
          catch (e) { console.warn('[conversationLog] could not register order:', e.message); }
        }
        return result;
      };
    }
  }

  function finish({ finalText } = {}) {
    if (!enabledFor(agent) || !contactNumber) return;
    setImmediate(async () => {
      try {
        let orderId = state.newId;
        if (!orderId) {
          const ids = new Set(state.referenced);
          collectIds(finalText || '', ids);
          if (ids.size === 0) return;
          const { rows } = await pool.query(
            `SELECT order_id FROM coexistence.conversation_log_orders
              WHERE agent_id = $1 AND contact_number = $2 AND order_id = ANY($3)`,
            [String(agent.id), contactNumber, [...ids]],
          );
          if (rows.length !== 1) return; // none of this customer's orders, or ambiguous (e.g. history list)
          orderId = rows[0].order_id;
        }
        await flushConversation({ pool, agent, contactNumber, orderId, getAccountWithToken });
      } catch (e) {
        console.warn('[conversationLog] flush error:', e.message);
      }
    });
  }

  return { wrapExecutors, finish };
}

module.exports = { createRunTracker, flushConversation, istStamp, messageText };
