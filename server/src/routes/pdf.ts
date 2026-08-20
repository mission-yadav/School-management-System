import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';
import { streamPdf, letterhead, heading, signatureBlock, schoolNameFont, bodyFonts, BRAND, LOGO_PATH, QR_PATH, type SchoolInfo } from '../lib/pdf.js';
import { bsDate } from '../lib/nepaliDate.js';
import { computeAudit, type Line } from '../lib/audit.js';
import { getBillingPeriod, ensureAllLedgers, BS_MONTHS, type BSPeriod } from '../lib/ledger.js';

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
  const cmp = (d: string) => (d.endsWith('Computer Fee') ? 1 : 0); // tuition before computer within a month
  const currentTuition = items.filter((i) => !isPrevDues(i) && i.bsMonth === month && i.bsYear === year).sort((a, b) => (a.bsMonth! - b.bsMonth!) || (cmp(a.description) - cmp(b.description)));
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
  const snInv = (await buildSerialMap()).get(inv.student.id);
  const gross = inv.items.reduce((a, i) => a + i.amount, 0);
  const total = gross + inv.fine - inv.discount;
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
  const settled = paid + inv.payments.reduce((a, p) => a + (p.less || 0), 0); // cash + concessions

  streamPdf(res, `receipt-${inv.student.iemis || inv.student.admissionNo}.pdf`, (doc) => {
    let y = letterhead(doc, school);
    y = heading(doc, 'Fee Receipt', y);
    doc.fontSize(10).fillColor('#555')
      .text(`Receipt No: ${serialNo(snInv, period.year)}`, 50, y)
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
    include: { invoice: { include: { items: true, payments: true, student: { include: { class: { select: { name: true } }, parent: true } } } } },
  });
  if (!payment) throw new AppError(404, 'Payment not found');
  const school = await getSchool();
  const period = await getBillingPeriod();
  const inv = payment.invoice;
  await attachRoll(inv.student); // class-wise alphabetical roll
  (inv.student as any)._sn = (await buildSerialMap()).get(inv.student.id); // school-wide serial (9 -> P.G.)

  // A4 sheet, one quarter filled (top-left) with the receipt card, rest blank, bordered + cut guides.
  streamPdf(res, `${payment.receiptNo}.pdf`, (doc) => {
    drawReceiptPanel(doc, 0, 0, school, payment, inv, period);
    sheetFrame(doc, 1);
  }, { size: 'A4', margin: 0 });
}));

/** GET /api/pdf/intimation/:invoiceId — fee Intimation Card (issued to demand payment) */
router.get('/intimation/:invoiceId', asyncHandler(async (req, res) => {
  const invoiceId = intParam(req.params.invoiceId, 'invoiceId');
  const inv = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true, student: { include: { class: { select: { name: true } }, parent: true } } },
  });
  if (!inv) throw new AppError(404, 'Invoice not found');
  const school = await getSchool();
  const period = await getBillingPeriod();

  await attachRoll(inv.student); // class-wise alphabetical roll
  (inv.student as any)._sn = (await buildSerialMap()).get(inv.student.id); // school-wide serial (9 -> P.G.)

  // A4 sheet laid out as 4 quarters — one filled (top-left), the rest blank, with
  // bold card borders and cut guides. Always prints at 1/4 size.
  streamPdf(res, `intimation-${inv.student.iemis || inv.student.admissionNo}.pdf`, (doc) => {
    drawBillPanel(doc, 0, 0, school, inv, period);
    sheetFrame(doc, 1);
  }, { size: 'A4', margin: 0 });
}));

const QW = 297.64, QH = 420.94; // quarter-A4 quadrant size
const CARD_MARGIN = 26; // card border inset from the quadrant edge (keeps it inside printers' unprintable margin)
const CARD_PAD = 34;    // content inset (sits inside the border with a gap)

/** Compact branded letterhead for a quadrant panel. Returns the y to continue from. */
function panelHead(doc: PDFKit.PDFDocument, ox: number, oy: number, L: number, R: number, school: SchoolInfo, reg: string) {
  const nameFont = schoolNameFont(doc);
  const top = oy + CARD_PAD; // clear of the card border
  // Smaller logo leaves more width so the school name can be bigger and bolder (still one line).
  try { doc.image(LOGO_PATH, L, top + 2, { fit: [30, 30] }); } catch { /* logo optional */ }
  const hx = L + 36;
  let ns = 18;
  doc.font(nameFont).fontSize(ns);
  while (ns > 10 && doc.widthOfString(school.name) > R - hx) { ns -= 0.5; doc.fontSize(ns); }
  doc.fillColor(BRAND).font(nameFont).fontSize(ns).text(school.name, hx, top, { lineBreak: false });
  // sub-line: as big as fits on one line within the panel width
  const sub = [school.address, school.pan && `PAN: ${school.pan}`, school.phone && `Contact: ${school.phone}`].filter(Boolean).join('  |  ');
  let ss = 7;
  doc.font(reg).fontSize(ss);
  while (ss > 5 && doc.widthOfString(sub) > R - hx) { ss -= 0.25; doc.fontSize(ss); }
  doc.fillColor('#444').text(sub, hx, top + 4 + ns, { width: R - hx, lineBreak: false });
  doc.moveTo(L, top + 44).lineTo(R, top + 44).lineWidth(1.4).strokeColor(BRAND).stroke();
  doc.lineWidth(1).fillColor('black');
  return top + 50;
}

/** Two-column student info block (Student/IEMIS left, Class/Fee For right). The right
 *  column is aligned just past the widest left cell, and the font shrinks only as needed
 *  so nothing overlaps or wraps (IEMIS IDs can be long). */
// Each cell is [label, value, boldValue?]; boldValue renders the value in bold too.
type InfoCell = [string, string, boolean?];
function panelInfo(doc: PDFKit.PDFDocument, L: number, R: number, y: number, reg: string, bold: string,
  left: InfoCell[], right: InfoCell[]) {
  const avail = R - L, gap = 12;
  const cellW = (label: string, value: string, boldValue: boolean | undefined, size: number) => {
    doc.font(bold).fontSize(size); const w1 = doc.widthOfString(`${label}: `);
    doc.font(boldValue ? bold : reg).fontSize(size); return w1 + doc.widthOfString(value);
  };
  const measure = (size: number) => {
    let maxL = 0, maxR = 0;
    for (let i = 0; i < left.length; i++) {
      maxL = Math.max(maxL, cellW(left[i][0], left[i][1], left[i][2], size));
      if (right[i]) maxR = Math.max(maxR, cellW(right[i][0], right[i][1], right[i][2], size));
    }
    return { maxL, maxR };
  };
  let size = 9.5, m = measure(size);
  while (size > 6.5 && m.maxL + gap + m.maxR > avail) { size -= 0.25; m = measure(size); }
  const colX = L + m.maxL + gap;
  for (let i = 0; i < left.length; i++) {
    doc.fontSize(size);
    doc.font(bold).fillColor('black').text(`${left[i][0]}: `, L, y, { continued: true }).font(left[i][2] ? bold : reg).text(left[i][1], { lineBreak: false });
    if (right[i]) doc.font(bold).text(`${right[i][0]}: `, colX, y, { continued: true }).font(right[i][2] ? bold : reg).text(right[i][1], { lineBreak: false });
    y += size + 5;
  }
  return y + 3;
}

/** Compact centred card title inside a thick brand border box. Returns the y to continue from. */
function titleBox(doc: PDFKit.PDFDocument, L: number, R: number, y: number, bold: string, text: string): number {
  const size = 9.5;
  doc.font(bold).fontSize(size);
  const tW = doc.widthOfString(text);
  const bpX = 10, bpY = 3, boxW = tW + bpX * 2, boxH = size + bpY * 2;
  const boxX = L + (R - L - boxW) / 2;
  doc.lineWidth(2).strokeColor(BRAND).rect(boxX, y, boxW, boxH).stroke();
  doc.fillColor(BRAND).text(text, boxX, y + bpY, { width: boxW, align: 'center' });
  doc.lineWidth(1).fillColor('black');
  return y + boxH + 6;
}

/** Attach a class-wise alphabetical roll number to a student (mutates student._roll). */
async function attachRoll(student: any): Promise<void> {
  if (student.classId != null) {
    const mates = await prisma.student.findMany({ where: { classId: student.classId }, select: { id: true }, orderBy: { name: 'asc' } });
    const idx = mates.findIndex((m) => m.id === student.id);
    student._roll = idx >= 0 ? String(idx + 1) : (student.rollNo || '—');
  } else {
    student._roll = student.rollNo || '—';
  }
}

/** Convert 1..3999 to a Roman numeral. */
function toRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
  const map: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
/** Show a class name in Roman numerals when it's purely numeric (e.g. "10" -> "X"); else unchanged. */
function romanClass(name: string | null | undefined): string {
  const t = (name || '').trim();
  return /^\d+$/.test(t) ? toRoman(Number(t)) : (t || '—');
}

/** Map studentId -> serial number (S.N.), assigned 1..N by class order DESCENDING (highest class
 *  first, e.g. 9 -> P.G.) then name A-Z. One query; reused for a whole sheet. */
async function buildSerialMap(): Promise<Map<number, number>> {
  const all = await prisma.student.findMany({ select: { id: true, name: true, class: { select: { order: true } } } });
  all.sort((a, b) => (b.class?.order ?? -1) - (a.class?.order ?? -1) || a.name.localeCompare(b.name));
  const m = new Map<number, number>();
  all.forEach((s, i) => m.set(s.id, i + 1));
  return m;
}
/** Format a bill/receipt number as "JSS-<SN>/<billing year>", e.g. JSS-01/2083 (SN min 2 digits). */
function serialNo(sn: number | undefined, year: number): string {
  return `JSS-${String(sn || 0).padStart(2, '0')}/${year}`;
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
  const L = ox + CARD_PAD, R = ox + QW - CARD_PAD;
  const { reg, bold } = bodyFonts(doc);

  let y = panelHead(doc, ox, oy, L, R, school, reg);
  y = titleBox(doc, L, R, y, bold, 'INTIMATION CARD');

  doc.font(reg).fontSize(7.5).fillColor('#555')
    .text(`Bill No: ${serialNo((inv.student as any)._sn, period.year)}`, L, y)
    .text(`Date: ${bsDate(inv.createdAt)}`, L, y, { width: R - L, align: 'right' });
  doc.fillColor('black'); y += 14;

  const st = inv.student;
  const father = st.parent?.name || '—';
  const contact = st.parent?.phone || st.phone || st.emergencyContact || '—';
  const roll = (st as any)._roll || st.rollNo || '—';
  y = panelInfo(doc, L, R, y, reg, bold,
    [['Student', st.name, true], ['Roll No', roll], ["Father's Name", father], ['IEMIS ID', st.iemis || '—']],
    [['Class', romanClass(st.class?.name)], ['Contact', contact], ['Fee For', upToLabel(period), true]]);

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

  const disclaimer = 'This is a fee intimation, not a receipt. Please clear the balance by the 10th of the month.';
  doc.font(reg).fontSize(7).fillColor('#777').text(disclaimer, L, y + 5, { width: R - L });
  const discH = doc.heightOfString(disclaimer, { width: R - L });

  // Payment QR in the bottom-left blank area: bordered, with a bold one-line caption beneath.
  const qpad = 4, capH = 11, gapCap = 3;
  const top = y + 5 + discH + 6;                 // just below the disclaimer
  const bottom = oy + QH - CARD_MARGIN - 5;      // just inside the card border
  const qrSize = Math.min(52, bottom - top - gapCap - capH);
  if (qrSize >= 38) {
    const qx = L, qy = top;
    doc.lineWidth(1.2).strokeColor(BRAND).rect(qx - qpad, qy - qpad, qrSize + qpad * 2, qrSize + qpad * 2).stroke();
    try { doc.image(QR_PATH, qx, qy, { fit: [qrSize, qrSize] }); } catch { /* qr optional */ }
    doc.lineWidth(1).fillColor('black').font(bold).fontSize(8)
      .text('Scan this QR to pay online', qx - qpad, qy + qrSize + qpad + gapCap, { width: 160, lineBreak: false });
  }

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
  const L = ox + CARD_PAD, R = ox + QW - CARD_PAD;
  const { reg, bold } = bodyFonts(doc);

  const total = inv.items.reduce((a: number, i: any) => a + i.amount, 0) + inv.fine - inv.discount;
  const upto = inv.payments.filter((p: any) => p.id <= payment.id);
  const paidToDate = upto.reduce((a: number, p: any) => a + p.amount, 0);
  const settledToDate = paidToDate + upto.reduce((a: number, p: any) => a + (p.less || 0), 0);
  const balanceDue = total - settledToDate;

  let y = panelHead(doc, ox, oy, L, R, school, reg);
  y = titleBox(doc, L, R, y, bold, 'FEE RECEIPT');
  doc.font(reg).fontSize(7.5).fillColor('#555')
    .text(`Receipt No: ${serialNo((inv.student as any)._sn, period.year)}`, L, y, { lineBreak: false })
    .text(`Date: ${bsDate(payment.paidAt)}`, L, y, { width: R - L, align: 'right', lineBreak: false });
  doc.fillColor('black'); y += 14;

  const st = inv.student;
  const father = st.parent?.name || '—';
  const contact = st.parent?.phone || st.phone || st.emergencyContact || '—';
  const roll = (st as any)._roll || st.rollNo || '—';
  y = panelInfo(doc, L, R, y, reg, bold,
    [['Student', st.name, true], ['Roll No', roll], ["Father's Name", father], ['IEMIS ID', st.iemis || '—']],
    [['Class', romanClass(st.class?.name)], ['Contact', contact], ['Fee For', upToLabel(period), true]]);

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

/** Bold border around the first `filled` quadrants (blank ones get none) + dashed cut guides. */
function sheetFrame(doc: PDFKit.PDFDocument, filled = 4) {
  const W = doc.page.width, H = doc.page.height;
  const quads = [[0, 0], [QW, 0], [0, QH], [QW, QH]];
  doc.save().lineWidth(2).strokeColor(BRAND);
  for (let i = 0; i < filled; i++) { const [ox, oy] = quads[i]; doc.rect(ox + CARD_MARGIN, oy + CARD_MARGIN, QW - 2 * CARD_MARGIN, QH - 2 * CARD_MARGIN).stroke(); }
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
    include: { items: true, payments: true, student: { include: { class: { select: { name: true } }, parent: true } } },
    orderBy: { student: { name: 'asc' } },
  });
  if (!invoices.length) throw new AppError(404, 'No bills found');

  // Class-wise alphabetical roll numbers, batched (one query for all involved classes).
  const classIds = [...new Set(invoices.map((i) => i.student.classId).filter((c): c is number => c != null))];
  if (classIds.length) {
    const mates = await prisma.student.findMany({ where: { classId: { in: classIds } }, select: { id: true, classId: true }, orderBy: { name: 'asc' } });
    const byClass = new Map<number, number[]>();
    for (const m of mates) { const arr = byClass.get(m.classId!) || []; arr.push(m.id); byClass.set(m.classId!, arr); }
    for (const inv of invoices) {
      const arr = inv.student.classId != null ? byClass.get(inv.student.classId) : undefined;
      const idx = arr ? arr.indexOf(inv.student.id) : -1;
      (inv.student as any)._roll = idx >= 0 ? String(idx + 1) : (inv.student.rollNo || '—');
    }
  }
  const serials = await buildSerialMap();
  for (const inv of invoices) (inv.student as any)._sn = serials.get(inv.student.id);

  streamPdf(res, `bills-4up-${invoices.length}.pdf`, (doc) => {
    const quad = [[0, 0], [QW, 0], [0, QH], [QW, QH]];
    for (let p = 0; p * 4 < invoices.length; p++) {
      if (p > 0) doc.addPage();
      const chunk = invoices.slice(p * 4, p * 4 + 4);
      sheetFrame(doc, chunk.length); // border only the filled cards on this page
      chunk.forEach((inv, slot) => drawBillPanel(doc, quad[slot][0], quad[slot][1], school, inv, period));
    }
  }, { size: 'A4', margin: 0 });
}));

/** Break a ledger invoice's items into the fee-register columns. Month-wise tuition items
 *  are summed under `monthly` (accumulated); the latest month's amount is the per-month `rate`. */
function registerCells(inv: { items: { description: string; amount: number; bsMonth?: number | null; bsYear?: number | null }[] }) {
  const c = { annual: 0, computer: 0, transport: 0, exam: 0, misc: 0, monthly: 0 };
  const LABELS: Record<string, keyof typeof c> = {
    'Annual Charge': 'annual', 'Computer Fee': 'computer', 'Transportation Charge': 'transport',
    'Exam Fee': 'exam', 'Miscellaneous Charges': 'misc',
  };
  const months: { y: number; m: number; amount: number }[] = [];
  for (const it of inv.items) {
    if (it.description === 'Previous Dues') continue;
    if (it.bsMonth) { // dated monthly lines: Computer Fee has its own column, everything else is tuition
      if (it.description.endsWith('Computer Fee')) { c.computer += it.amount; continue; }
      c.monthly += it.amount; months.push({ y: it.bsYear || 0, m: it.bsMonth, amount: it.amount }); continue;
    }
    const k = LABELS[it.description]; if (k) c[k] += it.amount;
  }
  months.sort((a, b) => (a.y - b.y) || (a.m - b.m));
  const rate = months.length ? months[months.length - 1].amount : 0;
  return { ...c, rate };
}

/** GET /api/pdf/fee-register?classId= — class-wise fee register (one row per student).
 *  Mirrors the on-screen Bills & Ledgers table; no ₹ glyph (uses "Rs." like the bills). */
router.get('/fee-register', asyncHandler(async (req, res) => {
  const classId = req.query.classId ? intParam(String(req.query.classId), 'classId') : null;
  const school = await getSchool();
  const period = await getBillingPeriod();
  await ensureAllLedgers();

  const invoices = await prisma.feeInvoice.findMany({
    where: { isLedger: true, ...(classId ? { student: { classId } } : {}) },
    include: { items: true, payments: true, student: { include: { class: { select: { name: true, order: true } } } } },
    orderBy: [{ student: { class: { order: 'asc' } } }, { student: { name: 'asc' } }],
  });
  if (!invoices.length) throw new AppError(404, 'No fee records found');

  // group by class, preserving the class order from the query
  const groups: { name: string; rows: any[] }[] = [];
  for (const inv of invoices) {
    const cname = inv.student.class?.name || 'Unassigned';
    let g = groups.find((x) => x.name === cname);
    if (!g) { g = { name: cname, rows: [] }; groups.push(g); }
    const gross = inv.items.reduce((a, i) => a + i.amount, 0);
    const total = gross + inv.fine - inv.discount;
    const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
    const settled = paid + inv.payments.reduce((a, p) => a + (p.less || 0), 0);
    g.rows.push({ name: inv.student.name, iemis: inv.student.iemis, feeFree: inv.student.feeFree, cls: cname, ...registerCells(inv), total, paid, due: total - settled });
  }

  const num = (n: number) => (n || 0).toLocaleString('en-IN');
  const dash = (n: number) => (n ? n.toLocaleString('en-IN') : '—');

  streamPdf(res, `fee-register${classId ? `-${(groups[0]?.name || '').replace(/\s+/g, '')}` : ''}.pdf`, (doc) => {
    const { reg, bold } = bodyFonts(doc);
    const W = doc.page.width, H = doc.page.height;
    const cols: { key: string; label: string; w: number; align: 'left' | 'right' }[] = [
      { key: 'student', label: 'STUDENT', w: 168, align: 'left' },
      { key: 'rate', label: 'MONTHLY', w: 60, align: 'right' },
      { key: 'annual', label: 'ANNUAL', w: 58, align: 'right' },
      { key: 'computer', label: 'COMPUTER', w: 70, align: 'right' },
      { key: 'transport', label: 'TRANSPORT', w: 74, align: 'right' },
      { key: 'exam', label: 'EXAM', w: 54, align: 'right' },
      { key: 'misc', label: 'MISC', w: 54, align: 'right' },
      { key: 'total', label: 'TOTAL', w: 82, align: 'right' },
      { key: 'paid', label: 'PAID', w: 68, align: 'right' },
      { key: 'due', label: 'DUES', w: 82, align: 'right' },
    ];
    const tableW = cols.reduce((a, c) => a + c.w, 0);      // 770
    const startX = Math.round((W - tableW) / 2);           // centred → ~36pt inset, well clear of printer clip
    const xAt = (i: number) => startX + cols.slice(0, i).reduce((a, c) => a + c.w, 0);
    const bounds = cols.map((_, i) => xAt(i)).concat([startX + tableW]); // 11 vertical boundaries
    const contTop = 40, bottom = H - 44;
    const PAD = 6, ROW_H = 30, HEAD_H = 24, BAND_H = 24, SUB_H = 28, GRAND_H = 30;
    const GRID = '#94a3b8', OUTER = BRAND;

    // ---- grid bookkeeping: verticals span [vertTop..y]; outer bold box spans [boxTop..y] ----
    let y = 0, boxTop = 0, vertTop = 0, open = false;
    const flush = () => {
      if (!open) return;
      doc.save();
      doc.lineWidth(0.8).strokeColor(GRID);
      for (let i = 1; i < bounds.length - 1; i++) doc.moveTo(bounds[i], vertTop).lineTo(bounds[i], y).stroke();
      doc.lineWidth(2).strokeColor(OUTER).rect(startX, boxTop, tableW, y - boxTop).stroke(); // bold outer border
      doc.restore();
      open = false;
    };
    const hline = (yy: number, weight: number, color: string) => { doc.save().lineWidth(weight).strokeColor(color).moveTo(startX, yy).lineTo(startX + tableW, yy).stroke().restore(); };

    // draw the class band + column header, opening a new grid box (used at group start & after page breaks)
    const openBox = (title: string, sub: string) => {
      boxTop = y;
      doc.rect(startX, y, tableW, BAND_H).fill('#eeedf8');
      doc.fillColor(BRAND).font(bold).fontSize(13).text(title, startX + PAD, y + 5, { lineBreak: false });
      doc.font(reg).fontSize(9.5).fillColor('#6b7280').text(sub, startX, y + 7, { width: tableW - PAD, align: 'right', lineBreak: false });
      y += BAND_H;
      doc.rect(startX, y, tableW, HEAD_H).fill(BRAND);
      doc.fillColor('white').font(bold).fontSize(9);
      cols.forEach((c, i) => doc.text(c.label, xAt(i) + PAD - 1, y + 8, { width: c.w - 2 * PAD + 2, align: c.align, lineBreak: false }));
      doc.save().lineWidth(0.5).strokeColor('#ffffff'); // white separators inside the header band
      for (let i = 1; i < bounds.length - 1; i++) doc.moveTo(bounds[i], y).lineTo(bounds[i], y + HEAD_H).stroke();
      doc.restore();
      doc.fillColor('black'); y += HEAD_H;
      vertTop = y; open = true; // verticals run from the top of the data rows
      hline(y, 1.2, OUTER);
    };

    // ----- letterhead + title (first page only) -----
    y = letterhead(doc, school);
    doc.fillColor(BRAND).font(bold).fontSize(18).text('Fee Register', startX, y, { align: 'center', width: tableW });
    doc.fillColor('#555').font(reg).fontSize(11)
      .text(`${classId ? `Class ${groups[0]?.name}` : 'All Classes'}   ·   Up to ${BS_MONTHS[period.month - 1]} ${period.year} (BS)   ·   All amounts in Rs.`, startX, y + 24, { align: 'center', width: tableW });
    y += 50;

    const newPage = (title: string, sub: string) => { flush(); doc.addPage(); y = contTop; openBox(title, sub); };

    let gt = { total: 0, paid: 0, due: 0 };
    for (const g of groups) {
      if (y + BAND_H + HEAD_H + ROW_H + SUB_H > bottom) { flush(); doc.addPage(); y = contTop; }
      const countLabel = `${g.rows.length} student${g.rows.length === 1 ? '' : 's'}`;
      openBox(`Class ${g.name}`, countLabel);

      let sub = { total: 0, paid: 0, due: 0 };
      g.rows.forEach((r, idx) => {
        if (y + ROW_H > bottom) newPage(`Class ${g.name} (cont.)`, countLabel);
        if (idx % 2 === 1) { doc.rect(startX, y, tableW, ROW_H).fill('#f5f7fb'); doc.fillColor('black'); }
        // student cell: FREE tag + name, then class · IEMIS
        const sx = xAt(0) + PAD, sw = cols[0].w - 2 * PAD;
        doc.fontSize(11).font(bold);
        let nx = sx;
        if (r.feeFree) { doc.fillColor('#16a34a').text('FREE', sx, y + 6, { lineBreak: false }); nx = sx + doc.widthOfString('FREE') + 5; }
        doc.fillColor('#111').text(r.name, nx, y + 6, { width: sx + sw - nx, lineBreak: false, ellipsis: true });
        doc.font(reg).fontSize(8).fillColor('#94a3b8').text(`${r.cls} · IEMIS ${r.iemis || '—'}`, sx, y + 19, { width: sw, lineBreak: false, ellipsis: true });

        const cells: [number, string, string | null][] = [
          [1, dash(r.rate), null], [2, dash(r.annual), null], [3, dash(r.computer), null],
          [4, dash(r.transport), null], [5, dash(r.exam), null], [6, dash(r.misc), null],
          [7, num(r.total), '#111'], [8, num(r.paid), '#16a34a'], [9, num(r.due), r.due > 0 ? '#dc2626' : '#16a34a'],
        ];
        for (const [i, txt, color] of cells) {
          doc.font(i >= 7 ? bold : reg).fontSize(11).fillColor(color || '#334155')
            .text(txt, xAt(i) + PAD, y + 9, { width: cols[i].w - 2 * PAD, align: 'right', lineBreak: false });
        }
        doc.fillColor('black');
        sub.total += r.total; sub.paid += r.paid; sub.due += r.due;
        y += ROW_H;
        hline(y, 0.6, '#dbe0ea');
      });

      // class subtotal
      if (y + SUB_H > bottom) newPage(`Class ${g.name} (cont.)`, countLabel);
      hline(y, 1.2, OUTER);
      doc.rect(startX, y, tableW, SUB_H).fill('#eef1f7');
      doc.fillColor('#1e293b').font(bold).fontSize(11.5).text(`Class ${g.name} — subtotal (${g.rows.length})`, xAt(0) + PAD, y + 8, { lineBreak: false });
      [[7, sub.total, '#111'], [8, sub.paid, '#16a34a'], [9, sub.due, sub.due > 0 ? '#dc2626' : '#16a34a']].forEach(([i, v, col]) =>
        doc.fillColor(col as string).text(num(v as number), xAt(i as number) + PAD, y + 8, { width: cols[i as number].w - 2 * PAD, align: 'right', lineBreak: false }));
      doc.fillColor('black'); y += SUB_H;
      flush(); // close this class's grid box
      y += 12; // gap before next class
      gt.total += sub.total; gt.paid += sub.paid; gt.due += sub.due;
    }

    // grand total across classes (only meaningful for the all-classes export)
    if (groups.length > 1) {
      if (y + GRAND_H > bottom) { doc.addPage(); y = contTop; }
      doc.rect(startX, y, tableW, GRAND_H).fill(BRAND);
      doc.save().lineWidth(2).strokeColor(OUTER).rect(startX, y, tableW, GRAND_H).stroke().restore();
      doc.fillColor('white').font(bold).fontSize(12.5).text('GRAND TOTAL', xAt(0) + PAD, y + 9, { lineBreak: false });
      [[7, gt.total], [8, gt.paid], [9, gt.due]].forEach(([i, v]) =>
        doc.fillColor('white').text(num(v as number), xAt(i as number) + PAD, y + 9, { width: cols[i as number].w - 2 * PAD, align: 'right', lineBreak: false }));
      doc.fillColor('black'); y += GRAND_H + 6;
    }

    doc.font(reg).fontSize(8.5).fillColor('#94a3b8')
      .text(`Generated ${bsDate(new Date())} (BS)  ·  ${school.name}`, startX, H - 30, { width: tableW, align: 'center', lineBreak: false });
  }, { size: 'A4', margin: 30, layout: 'landscape' });
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
