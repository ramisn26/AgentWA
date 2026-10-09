// Inbound-image support for AI agents (agents.accept_images).
//
// Mirrors how voice notes work: the webhook already stores the Meta media id,
// mediaDownloader.downloadOne() fetches the file, and here we hand it to the
// LLM as an image part on the current user turn.
//
// Generic image part (adapters convert it for OpenAI / Anthropic):
//   { type: 'image', mediaType: 'image/jpeg', data: '<base64>' }

const fs = require('fs');

const WAIT_MS = parseInt(process.env.IMAGE_BATCH_WAIT_MS || '3000', 10); // wait for follow-up photos
const MAX_IMAGES = parseInt(process.env.IMAGE_MAX_PER_TURN || '6', 10);
const MAX_BYTES = 4.5 * 1024 * 1024; // Anthropic rejects images over 5 MB
const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * A customer often sends 2+ photos back-to-back; WhatsApp delivers them as
 * separate messages and each one would start its own agent run (= separate
 * replies / duplicate carts). For an inbound IMAGE we wait a moment; if a newer
 * message from the same customer has arrived, this run steps aside and the
 * newest run handles every photo of the burst together.
 * Non-image inbounds never wait.
 */
async function isSupersededImageRun({ pool, inboundMessageId }) {
  const { rows } = await pool.query(
    `SELECT message_type, timestamp, wa_number, contact_number
       FROM coexistence.chat_history WHERE message_id = $1`,
    [inboundMessageId],
  );
  const me = rows[0];
  if (!me || me.message_type !== 'image') return false;
  if (WAIT_MS > 0) await sleep(WAIT_MS);
  // Tie-break on message_id so that, for photos sharing a timestamp, exactly
  // one run (the "greatest") proceeds and the others step aside.
  const { rows: newer } = await pool.query(
    `SELECT 1 FROM coexistence.chat_history
      WHERE wa_number = $1 AND contact_number = $2
        AND direction = 'incoming'
        AND message_id <> $3
        AND message_type IN ('text','image','audio','voice')
        AND (timestamp > $4 OR (timestamp = $4 AND message_id > $3))
      LIMIT 1`,
    [me.wa_number, me.contact_number, inboundMessageId, me.timestamp],
  );
  return newer.length > 0;
}

/**
 * Collect the customer's not-yet-answered photos (everything received since the
 * previous agent run for this contact, plus the current message), download them
 * and attach them to the final user turn of `history` (mutated in place).
 * Returns { count, failed } or null when there is nothing image-related.
 */
async function attachInboundImages({
  pool, getAccountWithToken, agent, contactNumber, inboundMessageId, runId, history, messageText,
}) {
  const acc = await getAccountWithToken(agent.wa_account_id);
  const waNumber = acc?.displayPhoneNumber || null;
  if (!waNumber) return null;

  const { rows: last } = await pool.query(
    `SELECT started_at FROM coexistence.agent_runs
      WHERE agent_id = $1 AND contact_number = $2 AND id <> $3 AND status <> 'failed'
      ORDER BY started_at DESC LIMIT 1`,
    [agent.id, contactNumber, runId],
  );
  const now = Date.now();
  const since = last[0]
    ? new Date(Math.max(new Date(last[0].started_at).getTime(), now - 10 * 60 * 1000))
    : new Date(now - 2 * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT message_id, media_mime_type, timestamp
       FROM coexistence.chat_history
      WHERE wa_number = $1 AND contact_number = $2
        AND direction = 'incoming' AND message_type = 'image' AND media_url IS NOT NULL
        AND (timestamp > $3 OR message_id = $4)
      ORDER BY timestamp DESC, message_id DESC
      LIMIT $5`,
    [waNumber, contactNumber, since, inboundMessageId || '', MAX_IMAGES],
  );
  if (rows.length === 0) return null;
  rows.reverse(); // oldest first

  const { downloadOne } = require('./mediaDownloader');
  const parts = [];
  let failed = 0;
  for (const r of rows) {
    try {
      const dl = await downloadOne(r.message_id);
      if (!dl || !dl.ok || !dl.path) { failed++; continue; }
      const buf = fs.readFileSync(dl.path);
      if (buf.length > MAX_BYTES) { failed++; continue; }
      const ext = String(dl.path).split('.').pop().toLowerCase();
      const declared = String(r.media_mime_type || '').toLowerCase();
      const mime = OK_MIME.has(declared) ? declared : MIME_BY_EXT[ext];
      if (!mime) { failed++; continue; }
      parts.push({ type: 'image', mediaType: mime, data: buf.toString('base64') });
    } catch (e) {
      failed++;
      console.warn(`[imageInput] ${r.message_id}: ${e.message}`);
    }
  }

  const n = parts.length;
  const hasCaption = !!(messageText && messageText.trim());
  const base = hasCaption
    ? messageText.trim()
    : `[The customer sent ${n || rows.length} photo${(n || rows.length) > 1 ? 's' : ''} with no text.]`;
  const note = failed
    ? `[System note: ${failed} image(s) could not be downloaded or read. Ask the customer to re-upload.]`
    : '';
  const text = [base, note].filter(Boolean).join('\n');
  const content = n ? [{ type: 'text', text }, ...parts] : text;

  const lastMsg = history[history.length - 1];
  if (hasCaption && lastMsg && lastMsg.role === 'user' && lastMsg.content === messageText) {
    history[history.length - 1] = { role: 'user', content };
  } else {
    history.push({ role: 'user', content });
  }
  return { count: n, failed };
}

/**
 * If the model call fails while images are attached (e.g. the configured model
 * can't take images), retry ONCE as text-only with a note, so the customer
 * still gets a "please re-upload" reply instead of silence. Never retries once
 * a tool has run (no risk of a double Sheets append).
 */
function withImageFallback(baseProvider, imageTurn) {
  if (!imageTurn || !imageTurn.count) return baseProvider;
  return {
    ...baseProvider,
    runWithTools: async (args) => {
      let toolCalled = false;
      const onToolCall = async (x) => { toolCalled = true; return args.onToolCall(x); };
      try {
        return await baseProvider.runWithTools({ ...args, onToolCall });
      } catch (err) {
        if (toolCalled) throw err;
        console.warn('[imageInput] model call with images failed, retrying text-only:', err.message);
        const messages = args.messages.map(m => {
          if (!Array.isArray(m.content)) return m;
          const txt = m.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
          return {
            role: m.role,
            content: `${txt}\n[System note: the customer's photo could not be processed. Ask them to re-upload a clearer photo or type the items.]`,
          };
        });
        return await baseProvider.runWithTools({ ...args, messages });
      }
    },
  };
}

module.exports = { isSupersededImageRun, attachInboundImages, withImageFallback };
