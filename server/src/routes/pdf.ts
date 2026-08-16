import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';
import { streamPdf, letterhead, heading, signatureBlock, schoolNameFont, bodyFonts, BRAND, LOGO_PATH, type SchoolInfo } from '../lib/pdf.js';
import { bsDate } from '../lib/nepaliDate.js';
import { computeAudit, type Line } from '../lib/audit.js';
import { getBillingPeriod, BS_MONTHS, type BSPeriod } from '../lib/ledger.js';

/** "Up to Shrawan 2083" — the fee period the document covers (the billing month). */
function upToLabel(period: BSPeriod) {
  const { year, month } = period;
  return `Up to ${BS_MONTHS[month - 1]} ${year}`;
}

/** Build the printable particulars: months before the billing month collapsed into "Previous Dues",
 *  then the billing month's tuition, then the other (heading) charges in canonical order. */
function particularLines(items: { description: string; amount: number; bsMonth?: number | null; bsYear?: number | null }[], period: BSPeriod) {
  const { year, month } = period;
  const isPrevDues = (i: { description: string }) => i.description === 'Previous Dues';
  const prevDues = items
    .filter((i) => isPrevDues(i) || (i.bsMonth && (i.bsYear! < year || (i.bsYear === year && i.bsMonth! < month))))
    .reduce((a, i) => a + i.amount, 0);
  const currentTuition = items.filter((i) => !isPrevDues(i) && i.bsMonth === month && i.bsYear === year).sort((a, b) => a.bsMonth! - b.bsMonth!);
  const ORDER = ['Annual Charge', 'Computer Fee', 'Transportation Charge', 'Exam Fee', 'Miscellaneous Charges'];
  const rank = (d: string) => { const i = ORDER.indexOf(d); return i < 0 ? 90 : i; };
  const headings = items.filter((i) => !i.bsMonth).sort((a, b) => rank(a.description) - rank(b.description));

  const lines: { label: string; amount: number }[] = [];
  if (prevDues > 0) lines.push({ label: 'Previous Dues', amount: prevDues });
  for (const m of currentTuition) lines.push({ label: m.description, amount: m.amount });
  for (const h of headings) lines.push({ label: h.description, amount: h.amount });
  return lines;
}

const router = Router();
router.use(authRequired);

async function getSchool(): Promise<SchoolInfo> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['schoolName', 'address', 'phone', 'email', 'pan'] } } });
  const parse = (v: string) => { try { return JSON.parse(v); } catch { return v; } };
  const map = Object.fromEntries(rows.map((r) => [r.key, parse(r.value)]));
  return {
    name: (map.schoolName as string) || 'Janaki Secondary School',
    address: (map.address as string) || 'Birgunj-3, Aadarshtole',
    phone: (map.phone as string) || '9845186111',
    email: (map.email as string) || '',
    pan: (map.pan as string) || '305741055',
  };
}

const BODY: Record<string, (name: string, cls: string) => string> = {
  BONAFIDE: (n, c) => `This is to certify that ${n} is a bonafide student of this institution, currently studying in ${c}. This certificate is issued on the student's request for official purposes.`,
  CHARACTER: (n, c) => `This is to certify that ${n}, a student of ${c}, has been of good moral character and conduct during their time at this institution. We wish them success in all future endeavours.`,
  TRANSFER: (n, c) => `This is to certify that ${n} was a bonafide student of ${c} at this institution. All dues have been cleared and the student is hereby permitted to seek admission elsewhere. Their conduct was found to be satisfactory.`,
  STUDY: (n, c) => `This is to certify that ${n} has been studying in ${c} at this institution and is a regular student. This study certificate is issued for the purpose stated by the applicant.`,
};

/** GET /api/pdf/certificate/:id — render an issued certificate to PDF */
router.get('/certificate/:id', asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const cert = await prisma.certificate.findUnique({
    where: { id },
    include: { student: { include: { class: { select: { name: true } } } } },
  });
  if (!cert) throw new AppError(404, 'Certificate not found');
  const school = await getSchool();
  const s = cert.student;
  const cls = s.class?.name || '—';

  if (cert.type === 'ID_CARD') return renderIdCard(res, school, s, cls, cert.serialNo);
  if (cert.type === 'FEE_RECEIPT') throw new AppError(400, 'Use /api/pdf/receipt/:paymentId for receipts');

  const title = `${cert.type.replace('_', ' ')} Certificate`;
  streamPdf(res, `${cert.serialNo}.pdf`, (doc) => {
    let y = letterhead(doc, school);
    y = heading(doc, title, y);
    doc.fontSize(10).fillColor('#555').text(`Serial No: ${cert.serialNo}`, 50, y, { align: 'right' });
    doc.text(`Date: ${bsDate(cert.issuedAt)}`, 50, y + 14, { align: 'right' });
    doc.fillColor('black').fontSize(12).text(' ', 50, y + 40);
    doc.moveDown(2);
    const text = (BODY[cert.type] || BODY.BONAFIDE)(s.name, cls);
    doc.fontSize(12).text(text, 50, y + 60, { align: 'justify', lineGap: 8, width: doc.page.width - 100 });

    doc.moveDown(2);
    const details: [string, string][] = [
      ['Name', s.name], ['IEMIS ID', s.iemis || '—'], ['Roll No', s.rollNo || '—'],
      ['Class', cls], ['Date of Birth', s.dob ? bsDate(s.dob) : '—'],
      ['Gender', s.gender || '—'],
    ];
    let dy = doc.y + 20;
    for (const [k, v] of details) {
      doc.font('Helvetica').text(`${k}: `, 60, dy, { continued: true }).font('Helvetica').text(v);
      dy += 20;
    }
    signatureBlock(doc);
  });
}));

function renderIdCard(res: any, school: SchoolInfo, s: any, cls: string, serial: string) {
  streamPdf(res, `${serial}.pdf`, (doc) => {
    // card 320x200 centered
    const x = 60, y = 80, w = 360, h = 220;
    doc.roundedRect(x, y, w, h, 10).lineWidth(2).stroke(BRAND);
    doc.rect(x, y, w, 46).fill(BRAND);
    try { doc.image(LOGO_PATH, x + 8, y + 6, { fit: [34, 34] }); } catch { /* logo optional */ }
    doc.fillColor('white').fontSize(13).font('Helvetica').text(school.name, x + 48, y + 15, { width: w - 56 });
    doc.fillColor('black').font('Helvetica').fontSize(11);
    const rows: [string, string][] = [
      ['Name', s.name], ['IEMIS ID', s.iemis || '—'], ['Class', cls],
      ['Roll No', s.rollNo || '—'], ['Blood Group', s.bloodGroup || '—'],
      ['Contact', s.phone || s.emergencyContact || '—'],
    ];
    let ry = y + 60;
    for (const [k, v] of rows) {
      doc.font('Helvetica').text(`${k}: `, x + 16, ry, { continued: true }).font('Helvetica').text(v);
      ry += 22;
    }
    doc.fontSize(8).fillColor('#888').text(`ID: ${serial}`, x + 16, y + h - 20);
  });
}

/** GET /api/pdf/receipt/invoice/:invoiceId — consolidated receipt for all payments on an invoice */
router.get('/receipt/invoice/:invoiceId', asyncHandler(async (req, res) => {
  const invoiceId = intParam(req.params.invoiceId, 'invoiceId');
  const inv = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: { orderBy: { paidAt: 'asc' } }, student: { include: { class: { select: { name: true } } } } },
  });
  if (!inv) throw new AppError(404, 'Invoice not found');
  if (inv.payments.length === 0) throw new AppError(400, 'No payments recorded yet');
  const school = await getSchool();
  const period = await getBillingPeriod();
  const gross = inv.items.reduce((a, i) => a + i.amount, 0);
  const total = gross + inv.fine - inv.discount;
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
  const settled = paid + inv.payments.reduce((a, p) => a + (p.less || 0), 0); // cash + concessions

  streamPdf(res, `receipt-${inv.student.iemis || inv.student.admissionNo}.pdf`, (doc) => {
    let y = letterhead(doc, school);
    y = heading(doc, 'Fee Receipt', y);
    doc.fontSize(10).fillColor('#555')
      .text(`Receipt for Intimation No: SMS-${String(inv.id).padStart(5, '0')}`, 50, y)
      .text(`Date: ${bsDate(new Date())}`, 50, y, { align: 'right' });
    doc.fillColor('black').fontSize(12);

    let dy = y + 30;
    const info: [string, string][] = [
      ['Student', inv.student.name], ['IEMIS ID', inv.student.iemis || '—'],
      ['Class', inv.student.class?.name || '—'], ['Fee For', upToLabel(period)],
    ];
    for (const [k, v] of info) { doc.font('Helvetica').text(`${k}: `, 50, dy, { continued: true }).font('Helvetica').text(v); dy += 20; }

    // payments table
    dy += 8;
    doc.rect(50, dy, doc.page.width - 100, 24).fill('#f0f0f7');
    doc.fillColor(BRAND).font('Helvetica').fontSize(11)
      .text('Receipt No', 60, dy + 6).text('Date', 200, dy + 6).text('Mode', 340, dy + 6).text('Amount (Rs.)', 50, dy + 6, { align: 'right' });
    doc.fillColor('black').font('Helvetica'); dy += 30;
    for (const p of inv.payments) {
      doc.text(p.receiptNo, 60, dy).text(bsDate(p.paidAt), 200, dy).text(p.method, 340, dy)
        .text(p.amount.toLocaleString('en-IN'), 50, dy, { align: 'right' });
      dy += 20;
    }
    doc.moveTo(50, dy).lineTo(doc.page.width - 50, dy).stroke('#ccc'); dy += 10;
    doc.font('Helvetica');
    doc.text('Invoice Total', 60, dy).text(total.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 20;
    doc.fillColor('green').text('Total Paid', 60, dy).text(paid.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 20;
    if (settled - paid > 0) { doc.fillColor('#b91c1c').text('Concession (Less)', 60, dy).text((settled - paid).toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 20; }
    doc.fillColor(total - settled > 0 ? 'red' : 'green').text('Balance Due', 60, dy).text((total - settled).toLocaleString('en-IN'), 50, dy, { align: 'right' });
    doc.fillColor('black').font('Helvetica').fontSize(10)
      .text(total - paid <= 0 ? 'Status: PAID IN FULL' : 'Status: PARTIALLY PAID', 60, dy + 26);
    signatureBlock(doc, 'Accountant');
  });
}));

/** GET /api/pdf/receipt/:paymentId — fee payment receipt (single payment) */
router.get('/receipt/:paymentId', asyncHandler(async (req, res) => {
  const paymentId = intParam(req.params.paymentId, 'paymentId');
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { items: true, payments: true, student: { include: { class: { select: { name: true } } } } } } },
  });
  if (!payment) throw new AppError(404, 'Payment not found');
  const school = await getSchool();
  const period = await getBillingPeriod();
  const inv = payment.invoice;

  // A4 sheet, one quarter filled (top-left) with the receipt card, rest blank, bordered + cut guides.
  streamPdf(res, `${payment.receiptNo}.pdf`, (doc) => {
    drawReceiptPanel(doc, 0, 0, school, payment, inv, period);
    sheetFrame(doc);
  }, { size: 'A4', margin: 0 });
}));

/** GET /api/pdf/intimation/:invoiceId — fee Intimation Card (issued to demand payment) */
router.get('/intimation/:invoiceId', asyncHandler(async (req, res) => {
  const invoiceId = intParam(req.params.invoiceId, 'invoiceId');
  const inv = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true, student: { include: { class: { select: { name: true } } } } },
  });
  if (!inv) throw new AppError(404, 'Invoice not found');
  const school = await getSchool();
  const period = await getBillingPeriod();

  // A4 sheet laid out as 4 quarters — one filled (top-left), the rest blank, with
  // bold card borders and cut guides. Always prints at 1/4 size.
  streamPdf(res, `intimation-${inv.student.iemis || inv.student.admissionNo}.pdf`, (doc) => {
    drawBillPanel(doc, 0, 0, school, inv, period);
    sheetFrame(doc);
  }, { size: 'A4', margin: 0 });
}));

const QW = 297.64, QH = 420.94; // quarter-A4 quadrant size

/** Compact branded letterhead for a quadrant panel. Returns the y to continue from. */
function panelHead(doc: PDFKit.PDFDocument, ox: number, oy: number, L: number, R: number, school: SchoolInfo, reg: string) {
  const nameFont = schoolNameFont(doc);
  try { doc.image(LOGO_PATH, L, oy + 10, { fit: [38, 38] }); } catch { /* logo optional */ }
  const hx = L + 46;
  let ns = 13;
  doc.font(nameFont).fontSize(ns);
  while (ns > 7 && doc.widthOfString(school.name) > R - hx) { ns -= 0.5; doc.fontSize(ns); }
  doc.fillColor(BRAND).font(nameFont).fontSize(ns).text(school.name, hx, oy + 11, { lineBreak: false });
  // sub-line: as big as fits on one line within the panel width
  const sub = [school.address, school.pan && `PAN: ${school.pan}`, school.phone && `Contact: ${school.phone}`].filter(Boolean).join('  |  ');
  let ss = 7;
  doc.font(reg).fontSize(ss);
  while (ss > 5 && doc.widthOfString(sub) > R - hx) { ss -= 0.25; doc.fontSize(ss); }
  doc.fillColor('#444').text(sub, hx, oy + 14 + ns, { width: R - hx, lineBreak: false });
  doc.moveTo(L, oy + 54).lineTo(R, oy + 54).lineWidth(1.4).strokeColor(BRAND).stroke();
  doc.lineWidth(1).fillColor('black');
  return oy + 60;
}

/** Two-column student info block (Student/IEMIS left, Class/Fee For right). */
function panelInfo(doc: PDFKit.PDFDocument, L: number, R: number, y: number, reg: string, bold: string,
  left: [string, string][], right: [string, string][]) {
  const size = 9, colX = L + (R - L) * 0.5;
  doc.fontSize(size);
  for (let i = 0; i < left.length; i++) {
    doc.font(bold).fillColor('black').text(`${left[i][0]}: `, L, y, { continued: true }).font(reg).text(left[i][1], { lineBreak: false });
    if (right[i]) doc.font(bold).text(`${right[i][0]}: `, colX, y, { continued: true }).font(reg).text(right[i][1], { lineBreak: false });
    y += size + 5;
  }
  return y + 3;
}

/** Accountant signature, pulled up from the very bottom of the quadrant. */
function panelSignature(doc: PDFKit.PDFDocument, ox: number, oy: number, R: number, reg: string) {
  const sy = oy + QH - 96;
  doc.fillColor('black').font(reg).fontSize(8)
    .text('__________________', R - 120, sy, { width: 120, align: 'center' })
    .text('Accountant', R - 120, sy + 11, { width: 120, align: 'center' });
}

/** Draw one intimation card inside a quarter-A4 quadrant at (ox, oy). */
function drawBillPanel(doc: PDFKit.PDFDocument, ox: number, oy: number, school: SchoolInfo, inv: any, period: BSPeriod) {
  const PAD = 18;
  const L = ox + PAD, R = ox + QW - PAD;
  const { reg, bold } = bodyFonts(doc);

  let y = panelHead(doc, ox, oy, L, R, school, reg);
  doc.fillColor(BRAND).font(bold).fontSize(13).text('INTIMATION CARD', L, y, { width: R - L, align: 'center' });
  doc.fillColor('black'); y += 19;
  doc.font(reg).fontSize(7.5).fillColor('#555')
    .text(`Bill No: SMS-${String(inv.id).padStart(5, '0')}`, L, y)
    .text(`Date: ${bsDate(inv.createdAt)}`, L, y, { width: R - L, align: 'right' });
  doc.fillColor('black'); y += 14;

  y = panelInfo(doc, L, R, y, reg, bold,
    [['Student', inv.student.name], ['IEMIS ID', inv.student.iemis || '—']],
    [['Class', inv.student.class?.name || '—'], ['Fee For', upToLabel(period)]]);

  const gross = inv.items.reduce((a: number, i: any) => a + i.amount, 0);
  const total = gross + inv.fine - inv.discount;
  const settled = inv.payments.reduce((a: number, p: any) => a + p.amount + (p.less || 0), 0);
  const gridRow = billGridRow(doc, L, R, () => y, (ny) => { y = ny; }, reg, bold);

  gridRow('Description', 'Amount (Rs.)', { header: true });
  for (const it of particularLines(inv.items, period)) gridRow(it.label, it.amount.toLocaleString('en-IN'), { bold: it.label === 'Previous Dues' });
  if (inv.fine) gridRow('Fine', inv.fine.toLocaleString('en-IN'));
  if (inv.discount) gridRow('Less', `- ${inv.discount.toLocaleString('en-IN')}`, { color: '#b91c1c' });
  gridRow('Grand Total', total.toLocaleString('en-IN'), { fill: '#eeedf8', bold: true, color: BRAND });
  if (settled) gridRow('Paid / Adjusted', settled.toLocaleString('en-IN'), { bold: true, color: 'green' });
  gridRow('Balance Due', (total - settled).toLocaleString('en-IN'), { bold: true, color: total - settled > 0 ? 'red' : 'green' });

  doc.font(reg).fontSize(7).fillColor('#777')
    .text('This is a fee intimation, not a receipt. Please clear the balance by the due date.', L, y + 5, { width: R - L });
  panelSignature(doc, ox, oy, R, reg);
}

/** Shared bordered-grid row renderer for the bill/receipt panels (bigger, tighter, bold). */
function billGridRow(doc: PDFKit.PDFDocument, L: number, R: number, getY: () => number, setY: (n: number) => void, reg: string, bold: string) {
  const rowH = 14, colX = R - 78, border = '#c9c9d6';
  return (label: string, amount: string, o: { header?: boolean; fill?: string; bold?: boolean; color?: string } = {}) => {
    const y = getY();
    const bg = o.header ? '#eef0f7' : o.fill || null;
    if (bg) { doc.rect(L, y, colX - L, rowH).fillAndStroke(bg, border); doc.rect(colX, y, R - colX, rowH).fillAndStroke(bg, border); }
    else { doc.rect(L, y, colX - L, rowH).stroke(border); doc.rect(colX, y, R - colX, rowH).stroke(border); }
    doc.font(o.bold || o.header ? bold : reg).fontSize(9).fillColor(o.color || (o.header ? BRAND : 'black'));
    doc.text(label, L + 5, y + 3, { width: colX - L - 9, lineBreak: false });
    doc.text(amount, colX + 3, y + 3, { width: R - colX - 7, align: 'right', lineBreak: false });
    doc.fillColor('black');
    setY(y + rowH);
  };
}

/** Draw one fee receipt inside a quarter-A4 quadrant at (ox, oy). */
function drawReceiptPanel(doc: PDFKit.PDFDocument, ox: number, oy: number, school: SchoolInfo, payment: any, inv: any, period: BSPeriod) {
  const PAD = 18;
  const L = ox + PAD, R = ox + QW - PAD;
  const { reg, bold } = bodyFonts(doc);

  const total = inv.items.reduce((a: number, i: any) => a + i.amount, 0) + inv.fine - inv.discount;
  const upto = inv.payments.filter((p: any) => p.id <= payment.id);
  const paidToDate = upto.reduce((a: number, p: any) => a + p.amount, 0);
  const settledToDate = paidToDate + upto.reduce((a: number, p: any) => a + (p.less || 0), 0);
  const balanceDue = total - settledToDate;

  let y = panelHead(doc, ox, oy, L, R, school, reg);
  doc.fillColor(BRAND).font(bold).fontSize(13).text('FEE RECEIPT', L, y, { width: R - L, align: 'center' });
  doc.fillColor('black'); y += 19;
  doc.font(reg).fontSize(7.5).fillColor('#555')
    .text(`Receipt No: ${payment.receiptNo}`, L, y)
    .text(`Date: ${bsDate(payment.paidAt, true)}`, L, y, { width: R - L, align: 'right' });
  doc.fillColor('black'); y += 14;

  y = panelInfo(doc, L, R, y, reg, bold,
    [['Student', inv.student.name], ['IEMIS ID', inv.student.iemis || '—']],
    [['Class', inv.student.class?.name || '—'], ['Fee For', upToLabel(period)]]);

  const gridRow = billGridRow(doc, L, R, () => y, (ny) => { y = ny; }, reg, bold);
  gridRow('Description', 'Amount (Rs.)', { header: true });
  for (const it of particularLines(inv.items, period)) gridRow(it.label, it.amount.toLocaleString('en-IN'), { bold: it.label === 'Previous Dues' });
  if (inv.discount) gridRow('Less', `- ${inv.discount.toLocaleString('en-IN')}`);
  if (inv.fine) gridRow('Fine', inv.fine.toLocaleString('en-IN'));
  gridRow('Invoice Total', total.toLocaleString('en-IN'), { bold: true });
  gridRow('Amount Paid Now', payment.amount.toLocaleString('en-IN'), { bold: true, color: 'green' });
  if (payment.less > 0) gridRow('Less (concession)', payment.less.toLocaleString('en-IN'), { bold: true, color: '#b91c1c' });
  gridRow('Paid To Date', paidToDate.toLocaleString('en-IN'), { bold: true });
  gridRow('Balance Due', balanceDue.toLocaleString('en-IN'), { bold: true, color: balanceDue > 0 ? 'red' : 'green' });

  doc.font(reg).fontSize(7).fillColor('#777').text(`Payment mode: ${payment.method}`, L, y + 5);
  panelSignature(doc, ox, oy, R, reg);
}

/** Bold border around each of the 4 quadrants + dashed cut guides down the middle. */
function sheetFrame(doc: PDFKit.PDFDocument) {
  const W = doc.page.width, H = doc.page.height;
  doc.save().lineWidth(2).strokeColor(BRAND);
  for (const [ox, oy] of [[0, 0], [QW, 0], [0, QH], [QW, QH]]) doc.rect(ox + 10, oy + 10, QW - 20, QH - 20).stroke();
  doc.restore();
  doc.save().dash(3, { space: 3 }).lineWidth(0.6).strokeColor('#aaaaaa');
  doc.moveTo(QW, 0).lineTo(QW, H).stroke();
  doc.moveTo(0, QH).lineTo(W, QH).stroke();
  doc.undash().restore();
}

/** GET /api/pdf/bills?ids=1,2,3 — many fee bills laid out 4-per-A4 sheet (2x2), for A4 printers. */
router.get('/bills', asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, 400);
  if (!ids.length) throw new AppError(400, 'ids query param required (comma-separated invoice ids)');
  const school = await getSchool();
  const period = await getBillingPeriod();
  const invoices = await prisma.feeInvoice.findMany({
    where: { id: { in: ids } },
    include: { items: true, payments: true, student: { include: { class: { select: { name: true } } } } },
    orderBy: { student: { name: 'asc' } },
  });
  if (!invoices.length) throw new AppError(404, 'No bills found');

  streamPdf(res, `bills-4up-${invoices.length}.pdf`, (doc) => {
    const quad = [[0, 0], [QW, 0], [0, QH], [QW, QH]];
    invoices.forEach((inv, i) => {
      const slot = i % 4;
      if (i > 0 && slot === 0) doc.addPage();
      if (slot === 0) sheetFrame(doc); // borders + cut guides for this page
      const [ox, oy] = quad[slot];
      drawBillPanel(doc, ox, oy, school, inv, period);
    });
  }, { size: 'A4', margin: 0 });
}));

/** GET /api/pdf/audit — NFRS Income & Expenditure Statement + Balance Sheet */
router.get('/audit', asyncHandler(async (_req, res) => {
  const school = await getSchool();
  const a = await computeAudit();
  const amt = (n: number) => (n < 0 ? `(${Math.abs(n).toLocaleString('en-IN')})` : n.toLocaleString('en-IN'));

  streamPdf(res, `audit-report.pdf`, (doc) => {
    const W = doc.page.width;
    let y = letterhead(doc, school);
    doc.fillColor(BRAND).fontSize(14).font('Helvetica').text('Audit Report (NFRS)', 50, y, { align: 'center' });
    doc.fillColor('#555').font('Helvetica').fontSize(9)
      .text(`As on ${bsDate(a.generatedAt)} (BS)  ·  All figures in ${a.currency}`, 50, y + 20, { align: 'center' });
    let dy = y + 46;

    const rowLine = (label: string, value: number, opts: { bold?: boolean; color?: string; indent?: number } = {}) => {
      doc.font(opts.bold ? 'Helvetica' : 'Helvetica').fontSize(10).fillColor(opts.color || 'black');
      doc.text(label, 60 + (opts.indent || 0), dy, { width: W - 220 });
      doc.text(amt(value), W - 200, dy, { width: 140, align: 'right' });
      dy += 18;
    };
    const sectionBar = (title: string) => {
      doc.rect(50, dy, W - 100, 22).fill('#eeedf8');
      doc.fillColor(BRAND).font('Helvetica').fontSize(11).text(title, 60, dy + 5);
      doc.fillColor('black'); dy += 30;
    };
    const rule = () => { doc.moveTo(50, dy).lineTo(W - 50, dy).stroke('#ccc'); dy += 6; };

    // ---- Income & Expenditure ----
    sectionBar('Income & Expenditure Statement');
    doc.font('Helvetica').fontSize(10).fillColor('#555').text('INCOME', 60, dy); dy += 16;
    for (const l of a.incomeExpenditure.income) rowLine(l.heading, l.amount, { indent: 10 });
    if (a.incomeExpenditure.discounts > 0) rowLine('Less: Discounts / Concessions', -a.incomeExpenditure.discounts, { indent: 10, color: '#b91c1c' });
    rule();
    rowLine('Total Income', a.incomeExpenditure.totalIncome, { bold: true });
    dy += 8;
    doc.font('Helvetica').fontSize(10).fillColor('#555').text('EXPENDITURE', 60, dy); dy += 16;
    for (const l of a.incomeExpenditure.expenditure) rowLine(l.heading, l.amount, { indent: 10 });
    rule();
    rowLine('Total Expenditure', a.incomeExpenditure.totalExpenditure, { bold: true });
    dy += 6;
    const surplus = a.incomeExpenditure.surplus;
    doc.rect(50, dy, W - 100, 24).fill(surplus >= 0 ? '#e8f5e9' : '#fdecea');
    doc.font('Helvetica').fontSize(11).fillColor(surplus >= 0 ? '#1b5e20' : '#b71c1c')
      .text(surplus >= 0 ? 'Surplus for the period' : 'Deficit for the period', 60, dy + 6)
      .text(amt(surplus), W - 200, dy + 6, { width: 140, align: 'right' });
    doc.fillColor('black'); dy += 40;

    // ---- Balance Sheet ----
    sectionBar('Balance Sheet (Statement of Financial Position)');
    doc.font('Helvetica').fontSize(10).fillColor('#555').text('ASSETS', 60, dy); dy += 16;
    for (const l of a.balanceSheet.assets) rowLine(l.heading, l.amount, { indent: 10 });
    rule();
    rowLine('Total Assets', a.balanceSheet.totalAssets, { bold: true });
    dy += 8;
    doc.font('Helvetica').fontSize(10).fillColor('#555').text('FUND & LIABILITIES', 60, dy); dy += 16;
    for (const l of a.balanceSheet.fund) rowLine(l.heading, l.amount, { indent: 10 });
    for (const l of a.balanceSheet.liabilities) rowLine(l.heading, l.amount, { indent: 10 });
    rule();
    rowLine('Total Fund & Liabilities', a.balanceSheet.totalFundLiabilities, { bold: true });

    dy += 18;
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777')
      .text('Prepared on an accrual basis in accordance with Nepal Financial Reporting Standards (NFRS). Opening fund balance assumed nil.', 50, dy, { width: W - 100 });
    dy += 40;
    doc.font('Helvetica').fontSize(11).fillColor('black');
    doc.text('_____________________', 50, dy).text('_____________________', W - 240, dy);
    doc.text('Prepared By', 50, dy + 15).text('Principal / Authorised Signatory', W - 240, dy + 15);
  });
}));

/** GET /api/pdf/report-card?examId=&studentId= */
router.get('/report-card', asyncHandler(async (req, res) => {
  const examId = Number(req.query.examId), studentId = Number(req.query.studentId);
  if (!examId || !studentId) throw new AppError(400, 'examId and studentId required');
  const school = await getSchool();
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { class: { select: { name: true } } } });
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!student || !exam) throw new AppError(404, 'Not found');
  const results = await prisma.result.findMany({ where: { examId, studentId }, include: { subject: { select: { name: true } } } });
  const total = results.reduce((a, r) => a + r.marks, 0);
  const max = results.reduce((a, r) => a + r.maxMarks, 0);
  const percent = max ? (total / max) * 100 : 0;

  streamPdf(res, `report-${student.iemis || student.admissionNo}.pdf`, (doc) => {
    let y = letterhead(doc, school);
    y = heading(doc, `Report Card — ${exam.name}`, y);
    let dy = y + 10;
    doc.fontSize(11);
    [['Name', student.name], ['IEMIS ID', student.iemis || '—'], ['Class', student.class?.name || '—']].forEach(([k, v]) => {
      doc.font('Helvetica').text(`${k}: `, 50, dy, { continued: true }).font('Helvetica').text(v as string); dy += 18;
    });
    dy += 10;
    doc.rect(50, dy, doc.page.width - 100, 24).fill('#f0f0f7');
    doc.fillColor(BRAND).font('Helvetica')
      .text('Subject', 60, dy + 6).text('Marks', 300, dy + 6).text('Max', 380, dy + 6).text('%', 460, dy + 6);
    doc.fillColor('black').font('Helvetica'); dy += 30;
    for (const r of results) {
      const p = r.maxMarks ? Math.round((r.marks / r.maxMarks) * 100) : 0;
      doc.text(r.subject.name, 60, dy).text(String(r.marks), 300, dy).text(String(r.maxMarks), 380, dy).text(`${p}%`, 460, dy);
      dy += 20;
    }
    dy += 10;
    doc.font('Helvetica').text(`Total: ${total} / ${max}   (${Math.round(percent * 100) / 100}%)`, 60, dy);
    doc.text(`Result: ${percent >= 35 ? 'PASS' : 'FAIL'}`, 60, dy + 20);
    signatureBlock(doc);
  });
}));

export default router;
