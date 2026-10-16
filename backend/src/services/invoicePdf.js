// Estimate / invoice PDF in the Crackling "ESTIMATE" format.
//
//   const { renderInvoicePdf, computeTotals } = require('./invoicePdf');
//   const buffer = await renderInvoicePdf(data);
//
// data = {
//   title: 'ESTIMATE',                       // heading in the middle of the top row
//   numberLabel: 'Order No',                 // label before the number (sample used "Enquiry No")
//   number: 'CRC-0001', date: '11-10-2026',
//   business: { name, address, mobile, email, paymentLines: [['UPI ID', 'name@bank'], ['Payee', '...']]  /* or bank: {...} */ },
//   customer: { name, mobile, addressLines: [...] },
//   sections: [ { title: '20% Products', discountPct: 20, items: [ { code, name, content, qty, rate } ] },
//               { title: 'Net Rate Products', discountPct: 0,  items: [ ... ] } ],
// }
// Money is handled in integer paise, so totals never drift. Indian digit grouping (1,23,456.00).
// Fonts: Noto Sans (Latin) + Noto Sans Tamil, so Tamil customer names / addresses print correctly.

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const FONT_DIR = process.env.INVOICE_FONT_DIR || path.join(__dirname, '..', 'assets', 'fonts'); // backend/src/assets/fonts
const FONT_FILES = {
  regular: 'noto-sans-latin-400-normal.woff', bold: 'noto-sans-latin-700-normal.woff',
  tamil: 'noto-sans-tamil-tamil-400-normal.woff', tamilBold: 'noto-sans-tamil-tamil-700-normal.woff',
};
const TAMIL = /[\u0B80-\u0BFF]/;

// ----------------------------------------------------------------- money
const toPaise = (n) => Math.round(Number(n) * 100);
function fmt(paise) {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const plain = (paise) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

function computeTotals(sections, packagingPct = 0) {
  let net = 0, count = 0;
  const out = sections.map((s) => {
    const lines = s.items.map((it) => ({ ...it, amount: Math.round(toPaise(it.rate) * Number(it.qty)) }));
    const sub = lines.reduce((a, l) => a + l.amount, 0);
    const disc = s.discountPct ? Math.round((sub * s.discountPct) / 100) : 0;
    const total = sub - disc;
    net += total; count += lines.length;
    return { ...s, lines, sub, disc, total };
  });
  // packaging fee = X% of the grand total (discounted + net-rate), to the nearest paisa
  const packaging = packagingPct ? Math.round((net * packagingPct) / 100) : 0;
  return { sections: out, net, packaging, packagingPct: packagingPct || 0, overall: net + packaging, count };
}

// ----------------------------------------------------------------- mixed-script text (Latin + Tamil)
function runs(text) {
  // Only real Tamil letters use the Tamil font; digits, brackets, hyphens, spaces always use the Latin font
  // (the Tamil font has no glyphs for them and would show empty boxes).
  const out = [];
  let cur = '', curT = null;
  for (const ch of String(text)) {
    const t = /[\u0B80-\u0BFF\u200C\u200D]/.test(ch);
    if (curT !== null && t !== curT) { out.push({ s: cur, tamil: curT }); cur = ''; }
    curT = t; cur += ch;
  }
  if (cur) out.push({ s: cur, tamil: !!curT });
  return out;
}
const fontFor = (tamil, bold) => (tamil ? (bold ? 'tamilB' : 'tamil') : (bold ? 'bold' : 'regular'));

function widthOf(doc, text, size, bold) {
  let w = 0;
  for (const r of runs(text)) { doc.font(fontFor(r.tamil, bold)).fontSize(size); w += doc.widthOfString(r.s); }
  return w;
}
function drawText(doc, text, x, y, { size = 9, bold = false, width = null, align = 'left', color = '#000' } = {}) {
  text = String(text ?? '');
  let w = widthOf(doc, text, size, bold);
  let s = size;
  if (width && w > width) { s = Math.max(6.5, size * (width / w)); w = widthOf(doc, text, s, bold); } // shrink to fit
  let cx = x;
  if (width && align === 'center') cx = x + (width - w) / 2;
  if (width && align === 'right') cx = x + width - w;
  doc.fillColor(color);
  for (const r of runs(text)) {
    doc.font(fontFor(r.tamil, bold)).fontSize(s);
    doc.text(r.s, cx, y, { lineBreak: false });
    cx += doc.widthOfString(r.s);
  }
}

// ----------------------------------------------------------------- layout
const M = 28, PW = 595.28, PH = 841.89, CW = PW - 2 * M;
const COLS = [
  { k: 'sno', w: 36, align: 'center', title: 'S.No' }, { k: 'code', w: 44, align: 'center', title: 'Code' },
  { k: 'name', w: 236, align: 'left', title: 'Product Name' }, { k: 'content', w: 56, align: 'center', title: 'Content' },
  { k: 'qty', w: 42, align: 'center', title: 'Qty' }, { k: 'rate', w: 56, align: 'right', title: 'Rate' },
  { k: 'amount', w: CW - (36 + 44 + 236 + 56 + 42 + 56), align: 'right', title: 'Amount' },
];
const colX = (i) => M + COLS.slice(0, i).reduce((a, c) => a + c.w, 0);
const ROW = 15.5, LINE = 0.55, FOOT_H = 46;

async function renderInvoicePdf(data) {
  for (const f of Object.values(FONT_FILES)) {
    if (!fs.existsSync(path.join(FONT_DIR, f))) throw new Error(`invoice font missing: ${path.join(FONT_DIR, f)} (set INVOICE_FONT_DIR)`);
  }
  const t = computeTotals(data.sections, data.packagingPct || 0);
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${data.title || 'Estimate'} ${data.number}`, Author: data.business.name } });
  const chunks = []; doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  doc.registerFont('regular', path.join(FONT_DIR, FONT_FILES.regular)); doc.registerFont('bold', path.join(FONT_DIR, FONT_FILES.bold));
  doc.registerFont('tamil', path.join(FONT_DIR, FONT_FILES.tamil)); doc.registerFont('tamilB', path.join(FONT_DIR, FONT_FILES.tamilBold));
  doc.lineWidth(LINE).strokeColor('#000');

  const limitY = () => PH - M;                 // usable bottom
  let y = M, page = 1, tableTop = 0;

  const hline = (yy, x1 = M, x2 = M + CW) => doc.moveTo(x1, yy).lineTo(x2, yy).stroke();
  const vline = (xx, y1, y2) => doc.moveTo(xx, y1).lineTo(xx, y2).stroke();

  function firstPageHeader() {
    const b = data.business, c = data.customer || {};
    doc.rect(M, M, CW, 0).stroke();
    drawText(doc, `${data.numberLabel || 'Enquiry No'} : ${data.number}`, M + 6, M + 5, { size: 9 });
    drawText(doc, data.title || 'ESTIMATE', M, M + 5, { size: 10, bold: true, width: CW, align: 'center' });
    drawText(doc, `Date : ${data.date}`, M, M + 7, { size: 9, width: CW - 6, align: 'right' });
    drawText(doc, `Mobile : ${b.mobile || ''}`, M + 6, M + 22, { size: 9.5, bold: true });
    drawText(doc, `E-mail : ${b.email || ''}`, M, M + 33, { size: 9.5, bold: true, width: CW - 6, align: 'right' });
    drawText(doc, b.name, M, M + 44, { size: 17, bold: true, width: CW, align: 'center' });
    drawText(doc, b.address || '', M, M + 66, { size: 9, width: CW - 20, align: 'center' });
    hline(M + 82);
    // customer (left) + bank (right)
    drawText(doc, 'Customer Details', M + 6, M + 87, { size: 9.5, bold: true });
    let cy = M + 102;
    const lines = [c.name, c.mobile, ...(c.addressLines || [])].filter(Boolean);
    for (const ln of lines.slice(0, 6)) { drawText(doc, ln, M + 6, cy, { size: 9.5, width: CW / 2 - 16 }); cy += 12.5; }
    // payment block (right): business.paymentLines = [['UPI ID', '...'], ['Payee', '...']]  (or the older business.bank object)
    const bk = b.bank || {};
    const rows = (b.paymentLines || [['A/C Name', bk.accountName], ['A/C Number', bk.accountNumber], ['A/C Type', bk.accountType], ['Bank Name', bk.bankName], ['IFSC Code', bk.ifsc]])
      .filter((r) => r[1]);
    let by = M + 90;
    for (const [k, v] of rows) { drawText(doc, k, M + CW * 0.585, by, { size: 9 }); drawText(doc, `: ${v}`, M + CW * 0.585 + 78, by, { size: 9, width: CW * 0.415 - 84 }); by += 12.2; }
    y = M + 82 + 100;                          // table starts below the info block
    hline(y);
    vline(M, M, y); vline(M + CW, M, y);       // frame around the header block
  }

  function tableHeader() {
    tableTop = y;
    doc.rect(M, y, CW, ROW).fillAndStroke('#ffffff', '#000');
    COLS.forEach((c, i) => { drawText(doc, c.title, colX(i), y + 3.5, { size: 9.5, bold: true, width: c.w, align: 'center' }); if (i) vline(colX(i), y, y + ROW); });
    y += ROW;
  }
  function gridRow(h = ROW) { COLS.forEach((c, i) => { if (i) vline(colX(i), y, y + h); }); vline(M, y, y + h); vline(M + CW, y, y + h); hline(y + h); }
  function closePage(extendTo) { // empty column cells down to the bottom, outer frame
    if (extendTo > y) { COLS.forEach((c, i) => { if (i) vline(colX(i), y, extendTo); }); }
    vline(M, tableTop, extendTo); vline(M + CW, tableTop, extendTo); hline(extendTo);
  }
  function newPage() {
    closePage(limitY());
    doc.addPage({ size: 'A4', margin: 0 }); page += 1; y = M; hline(y); tableHeader();
  }
  const ensure = (h) => { if (y + h > limitY()) newPage(); };

  function sectionTitle(text) {
    ensure(ROW * 2);
    doc.rect(M, y, CW, ROW).fillAndStroke('#d9d9d9', '#000');
    drawText(doc, text, M + 4, y + 3.5, { size: 9.5, bold: true });
    y += ROW;
  }
  function itemRow(it, sno) {
    ensure(ROW);
    const cells = { sno: String(sno), code: String(it.code), name: it.name, content: it.content, qty: String(it.qty), rate: fmt(toPaise(it.rate)), amount: fmt(it.amount) };
    gridRow();
    COLS.forEach((c, i) => {
      const pad = c.align === 'left' ? 6 : (c.align === 'right' ? -5 : 0);
      drawText(doc, cells[c.k], colX(i) + (pad > 0 ? pad : 0), y + 3.5, { size: 9, width: c.w - Math.abs(pad), align: c.align });
    });
    y += ROW;
  }
  function summaryRow(label, value, { bold = true, shade = false } = {}) {
    ensure(ROW);
    const xa = colX(6);
    doc.rect(M, y, CW, ROW).fillAndStroke(shade ? '#d9d9d9' : '#ffffff', '#000');
    vline(xa, y, y + ROW);
    drawText(doc, label, M, y + 3.5, { size: 9.5, bold, width: xa - M - 6, align: 'right' });
    drawText(doc, value, xa, y + 3.5, { size: 9.5, bold, width: COLS[6].w - 5, align: 'right' });
    y += ROW;
  }

  firstPageHeader();
  tableHeader();
  let sno = 0;
  for (const s of t.sections) {
    sectionTitle(s.title);
    for (const l of s.lines) itemRow(l, ++sno);
    if (s.discountPct) {
      summaryRow('Sub Total', fmt(s.sub));
      summaryRow(`Discount ( ${s.discountPct}% )`, fmt(s.disc), { shade: true });
    }
    summaryRow('Total', fmt(s.total), { shade: !!s.discountPct });
  }

  // grand totals pinned to the bottom of the last page
  const footH = t.packaging ? ROW * 3 + 1 : FOOT_H;     // 3 summary rows when a packaging fee is shown
  if (y + footH > limitY()) newPage();
  const footTop = limitY() - footH;
  closePage(footTop);
  y = footTop;
  const parts = t.sections.map((s) => plain(s.total)).join(' + ');
  summaryRow(t.sections.length > 1 ? `(${parts}) Net Total` : 'Net Total', fmt(t.net));
  if (t.packaging) summaryRow(`Packaging Fee ( ${t.packagingPct}% )`, fmt(t.packaging));
  summaryRow('Overall Total', fmt(t.overall), { shade: true });
  hline(y);
  drawText(doc, `Total Items : ${t.count}`, M + 6, y - ROW + 3.5, { size: 9.5, bold: true });
  if (data.footerNote) drawText(doc, data.footerNote, M, limitY() + 2, { size: 7.5, width: CW, align: 'center', color: '#555' });

  doc.end();
  const buffer = await done;
  return { buffer, totals: { net: t.net / 100, packaging: t.packaging / 100, overall: t.overall / 100, count: t.count, sections: t.sections.map((s) => ({ title: s.title, sub: s.sub / 100, disc: s.disc / 100, total: s.total / 100 })) }, pages: page };
}

module.exports = { renderInvoicePdf, computeTotals, fmt };
