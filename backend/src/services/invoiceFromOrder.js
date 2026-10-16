// Turns a saved Orders row into the data the invoice renderer needs.
//
// The catalogue (S.No | Product | Per | Rate | DB_ID, grouped under "## CATEGORY (n)") and the discount
// settings line ("DISCOUNT_PERCENT=20 · NET_RATE_CATEGORIES=GIFT BOX, NET RATE, TIME SAVER PACK") are
// read from the agent's own system prompt. That makes the prompt the single source of truth: the PDF
// always uses exactly the prices and the discount rule the customer was quoted in chat.

const { computeTotals } = require('./invoicePdf');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function parseCatalogue(promptText) {
  const items = new Map();
  let cat = null;
  for (const line of String(promptText).split('\n')) {
    let m = line.match(/^## (.+?) \(\d+\)\s*$/);
    if (m) { cat = m[1].trim(); continue; }
    m = line.match(/^(\d+)\|(.+?)\|([^|]+)\|(\d+(?:\.\d+)?)(?:\|[0-9a-fA-F]+)?\s*$/);
    if (m && cat) items.set(Number(m[1]), { sno: Number(m[1]), name: m[2].trim(), per: m[3].trim(), rate: Number(m[4]), category: cat });
  }
  const pct = (String(promptText).match(/DISCOUNT_PERCENT=(\d+(?:\.\d+)?)/) || [])[1];
  const netLine = (String(promptText).match(/NET_RATE_CATEGORIES=([^\n·]+)/) || [])[1];
  const pack = (String(promptText).match(/PACKAGING_PERCENT=(\d+(?:\.\d+)?)/) || [])[1];
  return {
    items,
    discountPct: pct ? Number(pct) : 0,
    packagingPct: pack ? Number(pack) : 0,
    netCategories: netLine ? netLine.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean) : [],
  };
}

// "110 - Kulfi Fancy (1Box) x2;\n56 - 15 Shot (Multi Display) (1Box) x1"  ->  [{ sno, name, per, units }]
function parseItemsCell(cell) {
  const out = [];
  for (const part of String(cell || '').split(/[;\n]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s*-\s*(.+?)\s*\(([^()]*)\)\s*x\s*(\d+(?:\.\d+)?)$/);
    if (m) out.push({ sno: Number(m[1]), name: m[2].trim(), per: m[3].trim(), units: Number(m[4]) });
    else out.push({ raw: s });
  }
  return out;
}

// 919876543210 -> 9876543210 (Indian numbers print as 10 digits on the estimate)
function displayMobile(n) {
  const d = String(n || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

function addressLines(address) {
  const a = String(address || '').trim();
  if (!a) return [];
  const lines = a.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const out = []; let cur = '';
  for (const piece of a.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (cur && (cur + ', ' + piece).length > 38) { out.push(cur + ','); cur = piece; } else cur = cur ? `${cur}, ${piece}` : piece;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * order = { date: 'DD-MM-YYYY HH:mm', name, whatsapp, items: '<Items cell>', total: '₹56,450', orderId, address }
 * business = { name, address, mobile, email, bank: {...} }
 * Returns { data, issues, computedTotal }.  issues = [{ level: 'error'|'warn', msg }]
 */
function buildInvoiceData({ promptText, order, business, title = 'ESTIMATE', numberLabel = 'Order No' }) {
  const cat = parseCatalogue(promptText);
  const issues = [];
  if (cat.items.size === 0) issues.push({ level: 'error', msg: 'no catalogue found in the agent prompt' });
  const byName = new Map([...cat.items.values()].map((i) => [norm(i.name), i]));

  const regular = [], net = [];
  for (const row of parseItemsCell(order.items)) {
    if (row.raw) { issues.push({ level: 'error', msg: `cannot read item line: ${row.raw}` }); continue; }
    let it = cat.items.get(row.sno);
    if (!it || norm(it.name) !== norm(row.name)) {
      // The S.No and the product name disagree (S.No renumbered since the order was saved, or the AI mixed them up,
      // e.g. "122 - Gold Pack" when 122 is Silver Pack). For a money document the NAME wins, never a silent guess.
      const exact = byName.get(norm(row.name));
      const n = norm(row.name);
      const partial = n.length >= 4 ? [...cat.items.values()].filter((i) => norm(i.name).startsWith(n) || n.startsWith(norm(i.name))) : [];
      const byN = exact || (partial.length === 1 ? partial[0] : null);
      if (byN) {
        if (!it || byN.sno !== row.sno) issues.push({ level: 'warn', code: 'MATCHED_BY_NAME', msg: `order line "${row.sno} - ${row.name}" matched by name to S.No ${byN.sno} "${byN.name}"` });
        it = byN;
      } else {
        issues.push({ level: 'error', code: 'ITEM_MISMATCH', msg: it
          ? `S.No ${row.sno} is "${it.name}" in the catalogue but the order says "${row.name}" - not guessing`
          : `S.No ${row.sno} "${row.name}" is not in the catalogue` });
        continue;
      }
    }
    const line = { code: it.sno, name: it.name, content: it.per, qty: row.units, rate: it.rate };
    (cat.netCategories.includes(it.category.toUpperCase()) ? net : regular).push(line);
  }

  const sections = [];
  if (regular.length) sections.push({ title: cat.discountPct ? `${cat.discountPct}% Products` : 'Products', discountPct: cat.discountPct, items: regular });
  if (net.length) sections.push({ title: 'Net Rate Products', discountPct: 0, items: net });

  const t = computeTotals(sections, cat.packagingPct);
  const computedTotal = t.overall / 100;      // = amount payable (discount and packaging fee included)
  const saved = parseFloat(String(order.total || '').replace(/[^0-9.]/g, ''));
  // only compare when every line was read cleanly (otherwise the total is incomplete and the comparison is noise)
  if (!issues.some((i) => i.level === 'error') && Number.isFinite(saved) && Math.abs(saved - computedTotal) > 0.005) {
    issues.push({ level: 'warn', code: 'TOTAL_MISMATCH', msg: `saved order total ${saved} differs from invoice total ${computedTotal} (check the chat total / UPI amount)` });
  }
  const date = (String(order.date || '').match(/\d{2}-\d{2}-\d{4}/) || [''])[0];
  // delivery orders carry a note: the delivery charge depends on courier / transport / distance and is confirmed by the shop
  const isDelivery = !!String(order.address || '').trim() && !/^\s*pickup\s*$/i.test(order.address);
  const defaultNote = 'Delivery charges extra (courier / transport / distance) - to be confirmed by our team.';
  const note = business && business.deliveryNote !== undefined ? business.deliveryNote : defaultNote;

  return {
    data: { title, numberLabel, number: order.orderId, date, business, packagingPct: cat.packagingPct, footerNote: isDelivery ? note : '',
      customer: { name: order.name, mobile: displayMobile(order.whatsapp), addressLines: addressLines(order.address) }, sections },
    issues, computedTotal,
  };
}

module.exports = { parseCatalogue, parseItemsCell, buildInvoiceData, addressLines };
