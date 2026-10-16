// Sends the estimate / invoice PDF into the customer's WhatsApp chat when an order is confirmed.
//
// How it works
//  * It watches the agent's tool calls. When the Orders row is appended with an Order ID (the order-id
//    patch returns it as result.order_id) it keeps that row: Date | Name | WhatsApp | Items | Total | ... | Address.
//  * AFTER the confirmation reply has been queued (finish(), fire-and-forget) it builds the PDF from the
//    saved items, using the catalogue and the discount rule found in the agent's own system prompt, so the
//    PDF always matches what the customer was quoted in chat.
//  * It uploads the PDF to Meta and sends it as a document in the same chat through the normal send queue,
//    so it shows in the app's chat history like any other message.
//  * Exactly once per Order ID (coexistence.invoice_log). A PDF whose total differs from the total the AI
//    saved (= the UPI amount) is NOT sent, it is recorded as 'mismatch' (override: INVOICE_SEND_ON_MISMATCH=true).
//
// Per-agent settings live in src/config/invoice.config.json (see invoice.config.example.json).

const fs = require('fs');
const path = require('path');
const { renderInvoicePdf } = require('./invoicePdf');
const { buildInvoiceData } = require('./invoiceFromOrder');

const UPLOAD_MEDIA_MODULE = '../integrations/metaSend';   // filled in by the apply script from routes/messages.js
const CONFIG_PATH = process.env.INVOICE_CONFIG || path.join(__dirname, '..', 'config', 'invoice.config.json');
const SEND_ON_MISMATCH = process.env.INVOICE_SEND_ON_MISMATCH === 'true';
const warned = new Set();
const warnOnce = (k, m) => { if (!warned.has(k)) { warned.add(k); console.warn(m); } };

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { warnOnce('cfg', `[invoice] no readable config at ${CONFIG_PATH} (${e.code || e.message}) - invoices are off`); return null; }
}
function configFor(agent) {
  const cfg = loadConfig();
  const mine = cfg && cfg.agents && cfg.agents[String(agent.id)];
  if (!mine || mine.enabled === false) {
    if (cfg) warnOnce(`agent:${agent.id}`, `[invoice] agent ${agent.id} is not listed in invoice.config.json - no PDF is sent for it`);
    return null;
  }
  return mine;
}

const money = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

function createInvoiceHook({ pool, agent, contactNumber, getAccountWithToken, insertPendingRow, enqueueSend }) {
  const state = { order: null };

  function wrapExecutors(executors) {
    if (!configFor(agent)) return;
    for (const name of Object.keys(executors)) {
      const orig = executors[name];
      if (typeof orig !== 'function') continue;
      executors[name] = async (args) => {
        const result = await orig(args);
        if (result && typeof result === 'object' && typeof result.order_id === 'string' && args && Array.isArray(args.values)) {
          state.order = { orderId: result.order_id, values: args.values.slice() };
        }
        return result;
      };
    }
  }

  async function setStatus(orderId, status, fields = {}) {
    await pool.query(
      `UPDATE coexistence.invoice_log
          SET status = $3, local_message_id = COALESCE($4, local_message_id), computed_total = COALESCE($5, computed_total),
              saved_total = COALESCE($6, saved_total), error = $7, updated_at = NOW()
        WHERE agent_id = $1 AND order_id = $2`,
      [String(agent.id), orderId, status, fields.localId || null, fields.computed ?? null, fields.saved ?? null, fields.error ? String(fields.error).slice(0, 500) : null],
    );
  }

  async function deliver() {
    const cfg = configFor(agent);
    if (!cfg || !state.order) return;
    const { orderId, values: v } = state.order;
    const claim = await pool.query(
      `INSERT INTO coexistence.invoice_log (agent_id, order_id, contact_number, status)
            VALUES ($1, $2, $3, 'pending') ON CONFLICT (agent_id, order_id) DO NOTHING RETURNING order_id`,
      [String(agent.id), orderId, contactNumber],
    );
    if (claim.rows.length === 0) return;                        // already handled: never send twice

    try {
      // columns fixed by the prompt (section 7): Date | Customer Name | WhatsApp Number | Items | Total | Order ID | Payment Mode | Delivery Address | ...
      const order = { date: v[0], name: v[1], whatsapp: v[2] || contactNumber, items: v[3], total: v[4], orderId, address: v[7] };
      const { data, issues, computedTotal } = buildInvoiceData({
        promptText: agent.system_prompt, order, business: cfg.business, title: cfg.title || 'ESTIMATE', numberLabel: cfg.numberLabel || 'Order No',
      });
      const saved = parseFloat(String(order.total || '').replace(/[^0-9.]/g, ''));
      const errs = issues.filter((i) => i.level === 'error');
      if (errs.length) { await setStatus(orderId, 'failed', { error: errs.map((e) => e.msg).join('; '), computed: computedTotal }); console.warn(`[invoice] ${orderId}: not sent - ${errs[0].msg}`); return; }
      for (const w of issues.filter((i) => i.level === 'warn' && i.code !== 'TOTAL_MISMATCH')) console.warn(`[invoice] ${orderId}: ${w.msg}`);
      if (issues.some((i) => i.code === 'TOTAL_MISMATCH') && !SEND_ON_MISMATCH) {
        await setStatus(orderId, 'mismatch', { computed: computedTotal, saved, error: 'PDF total differs from the saved order total (UPI amount); not sent' });
        console.warn(`[invoice] ${orderId}: NOT sent - invoice total ${computedTotal} differs from saved total ${saved}. Check the chat total / UPI amount.`);
        return;
      }

      const { buffer } = await renderInvoicePdf(data);
      const filename = `${safeName(cfg.filePrefix || 'Estimate')}_${safeName(orderId)}.pdf`;
      const caption = fill(cfg.caption || '🧾 *Estimate for Order {orderId}*\n💰 Payable: ₹{total}', { orderId, total: money(computedTotal), name: order.name || '' }).slice(0, 1000);

      const account = await getAccountWithToken(agent.wa_account_id);
      const accessToken = account && (account.accessToken || account.access_token);
      const phoneNumberId = account && (account.phoneNumberId || account.phone_number_id);
      if (!accessToken || !phoneNumberId) throw new Error('WhatsApp account has no access token / phone number id');
      const { uploadMedia } = require(UPLOAD_MEDIA_MODULE);
      const uploaded = await uploadMedia({ accessToken, phoneNumberId, buffer, mimeType: 'application/pdf', filename });
      const mediaId = uploaded && uploaded.id;
      if (!mediaId) throw new Error('Meta upload returned no id');

      const to = String(contactNumber).replace(/\D/g, '');
      const localId = await insertPendingRow({ account, toNumber: to, messageType: 'document', messageBody: caption, mediaMime: 'application/pdf' });
      try {   // mirror the file so the chat bubble in the app can open it (same as /messages/send-media)
        const { persistOutboundBuffer } = require('./mediaDownloader');
        const digits = String(account.displayPhoneNumber || '').replace(/\D/g, '');
        const { absPath, size } = persistOutboundBuffer({ accountPhoneDigits: digits, messageId: localId, buffer, ext: 'pdf' });
        await pool.query(
          `UPDATE coexistence.chat_history SET media_storage_path = $1, media_status = 'stored', media_size_bytes = $2, media_filename = $3, media_downloaded_at = NOW() WHERE message_id = $4`,
          [absPath, size, filename, localId],
        );
      } catch (e) { console.warn(`[invoice] ${orderId}: could not mirror the PDF locally: ${e.message}`); }
      await enqueueSend({ kind: 'media', accountId: agent.wa_account_id, to, localMessageId: localId, payload: { type: 'document', mediaId, caption, filename } });
      await setStatus(orderId, 'sent', { localId, computed: computedTotal, saved });
      console.log(`[invoice] ${orderId}: estimate PDF queued for ${to} (${filename}, total ${computedTotal})`);
    } catch (e) {
      console.warn(`[invoice] ${orderId}: failed - ${e.message}`);
      try { await setStatus(orderId, 'failed', { error: e.message }); } catch { /* ignore */ }
    }
  }

  function finish() {
    if (!state.order) return;
    setImmediate(() => { deliver().catch((e) => console.warn('[invoice] error:', e.message)); });
  }
  return { wrapExecutors, finish, _deliver: deliver };
}

module.exports = { createInvoiceHook };
