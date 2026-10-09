// Unique, never-repeating Order IDs (CRC-0001, CRC-0002, ...).
//
// The agent never invents an ID. In its Sheets "append" call it writes the
// placeholder {{ORDER_ID:CRC}} in the Order ID cell. Just before ANY tool runs,
// we swap the placeholder for the next number from an atomic per-agent counter
// (one Postgres upsert = no duplicates, even with simultaneous orders) and add
// the real ID to the tool result so the agent can show it to the customer.
//
// Placeholder forms:  {{ORDER_ID}} -> ORD-0001   {{ORDER_ID:CRC}} -> CRC-0001
// A number is consumed even if the Sheets write then fails, so IDs can have
// gaps after a failure - but an ID is never issued twice.

const TOKEN_RE = /\{\{ORDER_ID(?::([A-Za-z0-9]{1,8}))?\}\}/g;

function collectPrefixes(v, out) {
  if (typeof v === 'string') {
    for (const m of v.matchAll(TOKEN_RE)) out.add((m[1] || 'ORD').toUpperCase());
  } else if (Array.isArray(v)) {
    v.forEach(x => collectPrefixes(x, out));
  } else if (v && typeof v === 'object') {
    Object.values(v).forEach(x => collectPrefixes(x, out));
  }
}

function deepReplace(v, issued) {
  if (typeof v === 'string') {
    return v.replace(TOKEN_RE, (_, p) => issued[(p || 'ORD').toUpperCase()]);
  }
  if (Array.isArray(v)) return v.map(x => deepReplace(x, issued));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = deepReplace(x, issued);
    return o;
  }
  return v;
}

async function nextOrderId({ pool, agentId, prefix }) {
  const { rows } = await pool.query(
    `INSERT INTO coexistence.agent_counters AS c (agent_id, name, value)
          VALUES ($1, $2, 1)
     ON CONFLICT (agent_id, name) DO UPDATE SET value = c.value + 1
     RETURNING value`,
    [String(agentId), `order_id:${prefix}`],
  );
  return `${prefix}-${String(rows[0].value).padStart(4, '0')}`;
}

function looksFailed(r) {
  if (r && typeof r === 'object') {
    return r.ok === false || r.success === false || !!r.error;
  }
  if (typeof r === 'string') return /^\s*(error|failed|failure)\b/i.test(r);
  return false;
}

function withOrderId(r, id) {
  if (looksFailed(r)) return r; // never advertise an ID for a failed write
  if (r && typeof r === 'object' && !Array.isArray(r)) return { ...r, order_id: id };
  if (typeof r === 'string') return `${r}\nOrder ID assigned: ${id}`;
  return { result: r, order_id: id };
}

/** Wrap every tool executor (in place) so the placeholder is swapped before it runs. */
function installOrderIdSubstitution(executors, { pool, agent }) {
  for (const name of Object.keys(executors)) {
    const orig = executors[name];
    if (typeof orig !== 'function') continue;
    executors[name] = async (args) => {
      const prefixes = new Set();
      collectPrefixes(args, prefixes);
      if (prefixes.size === 0) return orig(args);
      const issued = {};
      for (const p of prefixes) issued[p] = await nextOrderId({ pool, agentId: agent.id, prefix: p });
      const result = await orig(deepReplace(args, issued));
      return withOrderId(result, Object.values(issued)[0]);
    };
  }
}

module.exports = { installOrderIdSubstitution, nextOrderId };
