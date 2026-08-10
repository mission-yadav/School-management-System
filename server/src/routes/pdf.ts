import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';
import { streamPdf, letterhead, heading, signatureBlock, BRAND, LOGO_PATH, QUARTER_A4, type SchoolInfo } from '../lib/pdf.js';
import { bsDate } from '../lib/nepaliDate.js';
import { computeAudit, type Line } from '../lib/audit.js';
import { currentBS, BS_MONTHS } from '../lib/ledger.js';

/** "Up to Shrawan 2083" — the fee period the document covers. */
function upToLabel() {
  const { year, month } = currentBS();
  return `Up to ${BS_MONTHS[month - 1]} ${year}`;
}

/** Build the printable particulars: previous months' tuition collapsed into "Previous Dues",
 *  then the current month's tuition, then the other (heading) charges in canonical order. */
function particularLines(items: { description: string; amount: number; bsMonth?: number | null; bsYear?: number | null }[]) {
  const { year, month } = currentBS();
  const prevDues = items
    .filter((i) => i.bsMonth && (i.bsYear! < year || (i.bsYear === year && i.bsMonth! < month)))
    .reduce((a, i) => a + i.amount, 0);
  const currentTuition = items.filter((i) => i.bsMonth === month && i.bsYear === year).sort((a, b) => a.bsMonth! - b.bsMonth!);
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
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value as any]));
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
      doc.font('Helvetica-Bold').text(`${k}: `, 60, dy, { continued: true }).font('Helvetica').text(v);
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
    doc.fillColor('white').fontSize(13).font('Helvetica-Bold').text(school.name, x + 48, y + 15, { width: w - 56 });
    doc.fillColor('black').font('Helvetica').fontSize(11);
    const rows: [string, string][] = [
      ['Name', s.name], ['IEMIS ID', s.iemis || '—'], ['Class', cls],
      ['Roll No', s.rollNo || '—'], ['Blood Group', s.bloodGroup || '—'],
      ['Contact', s.phone || s.emergencyContact || '—'],
    ];
    let ry = y + 60;
    for (const [k, v] of rows) {
      doc.font('Helvetica-Bold').text(`${k}: `, x + 16, ry, { continued: true }).font('Helvetica').text(v);
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
      ['Class', inv.student.class?.name || '—'], ['Fee For', upToLabel()],
    ];
    for (const [k, v] of info) { doc.font('Helvetica-Bold').text(`${k}: `, 50, dy, { continued: true }).font('Helvetica').text(v); dy += 20; }

    // payments table
    dy += 8;
    doc.rect(50, dy, doc.page.width - 100, 24).fill('#f0f0f7');
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11)
      .text('Receipt No', 60, dy + 6).text('Date', 200, dy + 6).text('Mode', 340, dy + 6).text('Amount (Rs.)', 50, dy + 6, { align: 'right' });
    doc.fillColor('black').font('Helvetica'); dy += 30;
    for (const p of inv.payments) {
      doc.text(p.receiptNo, 60, dy).text(bsDate(p.paidAt), 200, dy).text(p.method, 340, dy)
        .text(p.amount.toLocaleString('en-IN'), 50, dy, { align: 'right' });
      dy += 20;
    }
    doc.moveTo(50, dy).lineTo(doc.page.width - 50, dy).stroke('#ccc'); dy += 10;
    doc.font('Helvetica-Bold');
    doc.text('Invoice Total', 60, dy).text(total.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 20;
    doc.fillColor('green').text('Total Paid', 60, dy).text(paid.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 20;
    if (settled - paid > 0) { doc.fillColor('#b91c1c').text('Concession (Less)', 60, dy).text((settled - paid).toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 20; }
    doc.fillColor(total - settled > 0 ? 'red' : 'green').text('Balance Due', 60, dy).text((total - settled).toLocaleString('en-IN'), 50, dy, { align: 'right' });
    doc.fillColor('black').font('Helvetica').fontSize(10)
      .text(total - paid <= 0 ? 'Status: PAID IN FULL' : 'Status: PARTIALLY PAID', 60, dy + 26);
    signatureBlock(doc);
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
  const inv = payment.invoice;
  const total = inv.items.reduce((a, i) => a + i.amount, 0) + inv.fine - inv.discount;
  // cumulative amounts up to and including this payment (so the receipt reflects the balance at that time)
  const upto = inv.payments.filter((p) => p.id <= payment.id);
  const paidToDate = upto.reduce((a, p) => a + p.amount, 0);
  const concessionToDate = upto.reduce((a, p) => a + (p.less || 0), 0);
  const settledToDate = paidToDate + concessionToDate;

  const balanceDue = total - settledToDate;
  // Quarter-A4 (A6) receipt — four fit on a single A4 sheet.
  streamPdf(res, `${payment.receiptNo}.pdf`, (doc) => {
    doc.page.margins.bottom = 0;   // keep everything on the single quarter page
    const W = doc.page.width;      // 297.64
    const H = doc.page.height;     // 420.94
    const L = 14, R = W - 14;      // content bounds

    // compact branded letterhead
    const bandH = 50;
    doc.rect(0, 0, W, bandH).fill(BRAND);
    try { doc.image(LOGO_PATH, L, 7, { fit: [36, 36] }); } catch { /* logo optional */ }
    doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text(school.name, L + 44, 9, { width: W - (L + 44) - L, lineBreak: false });
    doc.font('Helvetica').fontSize(6)
      .text([school.address, school.pan && `PAN: ${school.pan}`, school.phone && `Contact: ${school.phone}`].filter(Boolean).join('   |   '), L + 44, 26, { width: W - (L + 44) - L, lineBreak: false });
    doc.fillColor('black');

    let y = bandH + 8;
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text('FEE RECEIPT', L, y, { width: R - L, align: 'center' });
    doc.fillColor('black');
    y += 18;

    doc.font('Helvetica').fontSize(7.5).fillColor('#555')
      .text(`Receipt No: ${payment.receiptNo}`, L, y)
      .text(`Date: ${bsDate(payment.paidAt, true)}`, L, y, { width: R - L, align: 'right' });
    doc.fillColor('black');
    y += 14;

    const info: [string, string][] = [
      ['Student', inv.student.name], ['Class', inv.student.class?.name || '—'],
      ['IEMIS ID', inv.student.iemis || '—'], ['Fee For', upToLabel()],
    ];
    doc.fontSize(8);
    for (const [k, v] of info) { doc.font('Helvetica-Bold').text(`${k}: `, L, y, { continued: true }).font('Helvetica').text(v); y += 12; }

    y += 4;
    doc.rect(L, y, R - L, 15).fill('#f0f0f7');
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(8)
      .text('Description', L + 5, y + 4).text('Amount (Rs.)', L, y + 4, { width: R - L - 5, align: 'right' });
    doc.fillColor('black').font('Helvetica');
    y += 19;

    const row = (label: string, amount: string, opts: { bold?: boolean; color?: string } = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(opts.color || 'black').fontSize(8);
      doc.text(label, L + 5, y).text(amount, L, y, { width: R - L - 5, align: 'right' });
      doc.fillColor('black');
      y += 12;
    };

    for (const it of particularLines(inv.items)) row(it.label, it.amount.toLocaleString('en-IN'));
    if (inv.discount) row('Less', `- ${inv.discount.toLocaleString('en-IN')}`);
    if (inv.fine) row('Fine', inv.fine.toLocaleString('en-IN'));

    y += 3;
    doc.moveTo(L, y).lineTo(R, y).stroke('#ccc');
    y += 7;
    row('Invoice Total', total.toLocaleString('en-IN'), { bold: true });
    row('Amount Paid Now', payment.amount.toLocaleString('en-IN'), { bold: true, color: 'green' });
    if (payment.less > 0) row('Less (concession)', payment.less.toLocaleString('en-IN'), { bold: true, color: '#b91c1c' });
    row('Paid To Date', paidToDate.toLocaleString('en-IN'), { bold: true });
    row('Balance Due', balanceDue.toLocaleString('en-IN'), { bold: true, color: balanceDue > 0 ? 'red' : 'green' });

    doc.font('Helvetica').fontSize(7).fillColor('#555').text(`Payment mode: ${payment.method}`, L + 5, y + 2);

    // signature pinned near the bottom of the quarter page
    doc.fillColor('black').font('Helvetica').fontSize(7)
      .text('___________________', R - 120, H - 26, { width: 120, align: 'center' })
      .text('Authorised Signatory', R - 120, H - 16, { width: 120, align: 'center' });
  }, { size: QUARTER_A4, margin: 14 });
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
  const gross = inv.items.reduce((a, i) => a + i.amount, 0);
  const total = gross + inv.fine - inv.discount;
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
  const settled = paid + inv.payments.reduce((a, p) => a + (p.less || 0), 0); // cash + concessions

  streamPdf(res, `intimation-${inv.student.iemis || inv.student.admissionNo}.pdf`, (doc) => {
    let y = letterhead(doc, school);
    y = heading(doc, 'Fee Intimation Card', y);
    doc.fontSize(10).fillColor('#555')
      .text(`Intimation No: SMS-${String(inv.id).padStart(5, '0')}`, 50, y)
      .text(`Date: ${bsDate(inv.createdAt)}`, 50, y, { align: 'right' });
    doc.fillColor('black').fontSize(12);

    let dy = y + 30;
    const info: [string, string][] = [
      ['Student', inv.student.name], ['IEMIS ID', inv.student.iemis || '—'],
      ['Class', inv.student.class?.name || '—'], ['Fee For', upToLabel()],
      ...(inv.dueDate ? [['Due Date', bsDate(inv.dueDate)] as [string, string]] : []),
    ];
    for (const [k, v] of info) { doc.font('Helvetica-Bold').text(`${k}: `, 50, dy, { continued: true }).font('Helvetica').text(v); dy += 20; }

    dy += 10;
    doc.rect(50, dy, doc.page.width - 100, 24).fill('#f0f0f7');
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11)
      .text('Particulars', 60, dy + 6).text('Amount (Rs.)', 50, dy + 6, { align: 'right' });
    doc.fillColor('black').font('Helvetica');
    dy += 30;
    for (const it of particularLines(inv.items)) {
      const emphasize = it.label === 'Previous Dues';
      doc.font(emphasize ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(it.label, 60, dy).text(it.amount.toLocaleString('en-IN'), 50, dy, { align: 'right' });
      dy += 20;
    }
    doc.font('Helvetica');
    doc.moveTo(50, dy).lineTo(doc.page.width - 50, dy).stroke('#ccc'); dy += 8;
    doc.text('Sub Total', 60, dy).text(gross.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 18;
    if (inv.fine) { doc.text('Fine', 60, dy).text(inv.fine.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 18; }
    if (inv.discount) { doc.fillColor('#b91c1c').text('Less', 60, dy).text(`- ${inv.discount.toLocaleString('en-IN')}`, 50, dy, { align: 'right' }); doc.fillColor('black'); dy += 18; }
    dy += 4;
    doc.rect(50, dy, doc.page.width - 100, 26).fill('#eeedf8');
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(12)
      .text('Grand Total', 60, dy + 7).text(total.toLocaleString('en-IN'), 50, dy + 7, { align: 'right' });
    doc.fillColor('black').font('Helvetica').fontSize(11); dy += 40;
    doc.fillColor('green').text('Paid / Adjusted', 60, dy).text(settled.toLocaleString('en-IN'), 50, dy, { align: 'right' }); dy += 18;
    doc.fillColor(total - settled > 0 ? 'red' : 'green').font('Helvetica-Bold')
      .text('Balance Due', 60, dy).text((total - settled).toLocaleString('en-IN'), 50, dy, { align: 'right' });
    doc.fillColor('black').font('Helvetica').fontSize(9)
      .text('Note: This is a fee intimation, not a receipt. Please clear the balance due by the due date. A receipt will be issued on payment.', 50, dy + 34, { width: doc.page.width - 100 });
    doc.fontSize(11);
    signatureBlock(doc);
  });
}));

/** GET /api/pdf/audit — NFRS Income & Expenditure Statement + Balance Sheet */
router.get('/audit', asyncHandler(async (_req, res) => {
  const school = await getSchool();
  const a = await computeAudit();
  const amt = (n: number) => (n < 0 ? `(${Math.abs(n).toLocaleString('en-IN')})` : n.toLocaleString('en-IN'));

  streamPdf(res, `audit-report.pdf`, (doc) => {
    const W = doc.page.width;
    let y = letterhead(doc, school);
    doc.fillColor(BRAND).fontSize(14).font('Helvetica-Bold').text('Audit Report (NFRS)', 50, y, { align: 'center' });
    doc.fillColor('#555').font('Helvetica').fontSize(9)
      .text(`As on ${bsDate(a.generatedAt)} (BS)  ·  All figures in ${a.currency}`, 50, y + 20, { align: 'center' });
    let dy = y + 46;

    const rowLine = (label: string, value: number, opts: { bold?: boolean; color?: string; indent?: number } = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(opts.color || 'black');
      doc.text(label, 60 + (opts.indent || 0), dy, { width: W - 220 });
      doc.text(amt(value), W - 200, dy, { width: 140, align: 'right' });
      dy += 18;
    };
    const sectionBar = (title: string) => {
      doc.rect(50, dy, W - 100, 22).fill('#eeedf8');
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text(title, 60, dy + 5);
      doc.fillColor('black'); dy += 30;
    };
    const rule = () => { doc.moveTo(50, dy).lineTo(W - 50, dy).stroke('#ccc'); dy += 6; };

    // ---- Income & Expenditure ----
    sectionBar('Income & Expenditure Statement');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555').text('INCOME', 60, dy); dy += 16;
    for (const l of a.incomeExpenditure.income) rowLine(l.heading, l.amount, { indent: 10 });
    if (a.incomeExpenditure.discounts > 0) rowLine('Less: Discounts / Concessions', -a.incomeExpenditure.discounts, { indent: 10, color: '#b91c1c' });
    rule();
    rowLine('Total Income', a.incomeExpenditure.totalIncome, { bold: true });
    dy += 8;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555').text('EXPENDITURE', 60, dy); dy += 16;
    for (const l of a.incomeExpenditure.expenditure) rowLine(l.heading, l.amount, { indent: 10 });
    rule();
    rowLine('Total Expenditure', a.incomeExpenditure.totalExpenditure, { bold: true });
    dy += 6;
    const surplus = a.incomeExpenditure.surplus;
    doc.rect(50, dy, W - 100, 24).fill(surplus >= 0 ? '#e8f5e9' : '#fdecea');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(surplus >= 0 ? '#1b5e20' : '#b71c1c')
      .text(surplus >= 0 ? 'Surplus for the period' : 'Deficit for the period', 60, dy + 6)
      .text(amt(surplus), W - 200, dy + 6, { width: 140, align: 'right' });
    doc.fillColor('black'); dy += 40;

    // ---- Balance Sheet ----
    sectionBar('Balance Sheet (Statement of Financial Position)');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555').text('ASSETS', 60, dy); dy += 16;
    for (const l of a.balanceSheet.assets) rowLine(l.heading, l.amount, { indent: 10 });
    rule();
    rowLine('Total Assets', a.balanceSheet.totalAssets, { bold: true });
    dy += 8;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555').text('FUND & LIABILITIES', 60, dy); dy += 16;
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
      doc.font('Helvetica-Bold').text(`${k}: `, 50, dy, { continued: true }).font('Helvetica').text(v as string); dy += 18;
    });
    dy += 10;
    doc.rect(50, dy, doc.page.width - 100, 24).fill('#f0f0f7');
    doc.fillColor(BRAND).font('Helvetica-Bold')
      .text('Subject', 60, dy + 6).text('Marks', 300, dy + 6).text('Max', 380, dy + 6).text('%', 460, dy + 6);
    doc.fillColor('black').font('Helvetica'); dy += 30;
    for (const r of results) {
      const p = r.maxMarks ? Math.round((r.marks / r.maxMarks) * 100) : 0;
      doc.text(r.subject.name, 60, dy).text(String(r.marks), 300, dy).text(String(r.maxMarks), 380, dy).text(`${p}%`, 460, dy);
      dy += 20;
    }
    dy += 10;
    doc.font('Helvetica-Bold').text(`Total: ${total} / ${max}   (${Math.round(percent * 100) / 100}%)`, 60, dy);
    doc.text(`Result: ${percent >= 35 ? 'PASS' : 'FAIL'}`, 60, dy + 20);
    signatureBlock(doc);
  });
}));

export default router;
