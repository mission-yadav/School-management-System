import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const BRAND = '#262081';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');
export const QR_PATH = path.join(__dirname, '..', '..', 'assets', 'pay-qr.jpg');
export const SIGN_PATH = path.join(__dirname, '..', '..', 'assets', 'signature.png');
export const PRINCIPAL_SIGN_PATH = path.join(__dirname, '..', '..', 'assets', 'principal-sign.png');
const NAME_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'vipnagorgialla-bold.otf');

const BODY_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const BODY_BOLD_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
const REMARK_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'rooster.ttf');

/** Decorative Rooster font (used for the Remarks word). Falls back to bold body font. */
export function remarkFont(doc: PDFKit.PDFDocument): string {
  try { doc.registerFont('Rooster', REMARK_FONT_PATH); return 'Rooster'; }
  catch { return 'Helvetica-Bold'; }
}

/** Register the Vipnagorgialla display font (used only for the school name). Falls back to
 *  Helvetica if the file is missing. Returns the font name to pass to doc.font(). */
export function schoolNameFont(doc: PDFKit.PDFDocument): string {
  try { doc.registerFont('SchoolName', NAME_FONT_PATH); return 'SchoolName'; }
  catch { return 'Helvetica'; }
}

/** Embedded body fonts so bold actually renders on Windows PDF viewers (standard
 *  Helvetica-Bold is not embedded and shows as boxes there). Returns { reg, bold }. */
export function bodyFonts(doc: PDFKit.PDFDocument): { reg: string; bold: string } {
  let reg = 'Helvetica', bold = 'Helvetica';
  try { doc.registerFont('Body', BODY_FONT_PATH); reg = 'Body'; } catch { /* fallback */ }
  try { doc.registerFont('BodyBold', BODY_BOLD_FONT_PATH); bold = 'BodyBold'; } catch { /* fallback */ }
  return { reg, bold };
}

export interface SchoolInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  pan?: string;
}

/** Exactly a quarter of A4 (595.28 x 841.89) — four tile onto one A4 sheet. */
export const QUARTER_A4: [number, number] = [297.64, 420.94];

/** Stream a PDF built by `draw` to the HTTP response as an attachment. */
export function streamPdf(
  res: Response,
  filename: string,
  draw: (doc: PDFKit.PDFDocument) => void,
  opts: { size?: string | [number, number]; margin?: number; layout?: 'portrait' | 'landscape' } = {},
) {
  const doc = new PDFDocument({ size: opts.size ?? 'A4', margin: opts.margin ?? 50, layout: opts.layout ?? 'portrait' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  draw(doc);
  doc.end();
}

/** Common branded letterhead on a white background. The school name uses the Vipnagorgialla
 *  display font; everything else stays Helvetica. Returns the y position to continue from. */
export function letterhead(doc: PDFKit.PDFDocument, school: SchoolInfo, top = 0, widthOverride?: number): number {
  const W = widthOverride ?? doc.page.width;
  const bandH = 100;
  const nameFont = schoolNameFont(doc);
  try { doc.image(LOGO_PATH, 34, top + 14, { fit: [76, 76] }); } catch { /* logo optional */ }

  // School name — large & bold across the width; address + PAN/contact go on the line below.
  const nameX = 118;
  const maxNameW = W - 40 - nameX;
  let nameSize = 34;
  doc.font(nameFont).fontSize(nameSize);
  while (nameSize > 18 && doc.widthOfString(school.name) > maxNameW) { nameSize -= 1; doc.fontSize(nameSize); }
  const nameH = doc.currentLineHeight();
  const nameY = top + 22;
  doc.fillColor(BRAND).font(nameFont).fontSize(nameSize)
    .text(school.name, nameX, nameY, { width: maxNameW, align: 'left', lineBreak: false });

  // Address · PAN · Contact — one centred line under the name.
  const pan = school.pan || '305741055';
  const contact = school.phone || '9845186111';
  const sub = [school.address, `PAN No.:- ${pan}`, `Contact:- ${contact}`].filter(Boolean).join('     ·     ');
  doc.fillColor('#444').font('Helvetica').fontSize(10)
    .text(sub, nameX, nameY + nameH + 5, { width: maxNameW, align: 'center', lineBreak: false });

  // brand rule under the letterhead
  const ruleY = top + bandH;
  doc.moveTo(34, ruleY).lineTo(W - 34, ruleY).lineWidth(2).strokeColor(BRAND).stroke();
  doc.lineWidth(1).fillColor('black');
  return ruleY + 24;
}

export function heading(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.fillColor(BRAND).fontSize(16).font('Helvetica').text(title.toUpperCase(), 50, y, { align: 'center', underline: true });
  doc.fillColor('black').font('Helvetica').fontSize(12);
  return y + 40;
}

export function signatureBlock(doc: PDFKit.PDFDocument, role = 'Principal / Authorised Signatory') {
  const y = 720;
  doc.fontSize(11).font('Helvetica');
  doc.text('_____________________', 50, y);
  doc.text('Date', 50, y + 15);
  // principal's signature, centred over the right-hand signature line
  if (/principal/i.test(role)) { try { doc.image(PRINCIPAL_SIGN_PATH, 440 - 52 / 2, y - 63, { fit: [69, 63] }); } catch { /* signature optional */ } }
  doc.text('_____________________', 380, y);
  doc.text(role, 380, y + 15);
}

export { BRAND };
