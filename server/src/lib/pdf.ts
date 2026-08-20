import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const BRAND = '#262081';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');
export const QR_PATH = path.join(__dirname, '..', '..', 'assets', 'pay-qr.jpg');
const NAME_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'vipnagorgialla-bold.otf');

const BODY_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const BODY_BOLD_FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

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
export function letterhead(doc: PDFKit.PDFDocument, school: SchoolInfo): number {
  const W = doc.page.width;
  const bandH = 96;
  const nameFont = schoolNameFont(doc);
  try { doc.image(LOGO_PATH, 34, 12, { fit: [72, 72] }); } catch { /* logo optional */ }

  // Right-hand PAN / Contact block — measure first so the name never overlaps it.
  const pan = school.pan || '305741055';
  const contact = school.phone || '9845186111';
  const rLines = [`PAN No.:- ${pan}`, `Contact:- ${contact}`];
  doc.font('Helvetica').fontSize(10);
  const rLineH = doc.currentLineHeight();
  const rWidth = Math.max(...rLines.map((l) => doc.widthOfString(l))) + 2;
  const rLeft = W - 40 - rWidth;

  // School name — as large as fits the space left of the contact block, in the display font.
  const nameX = 120;
  const maxNameW = rLeft - 28 - nameX;
  let nameSize = 26;
  doc.font(nameFont).fontSize(nameSize);
  while (nameSize > 12 && doc.widthOfString(school.name) > maxNameW) {
    nameSize -= 1;
    doc.fontSize(nameSize);
  }
  const nameW = doc.widthOfString(school.name);
  const nameH = doc.currentLineHeight();

  const addrSize = 11;
  doc.font('Helvetica').fontSize(addrSize);
  const addrH = school.address ? doc.currentLineHeight() : 0;
  const gap = school.address ? 4 : 0;
  const top = (bandH - (nameH + gap + addrH)) / 2;

  doc.fillColor(BRAND).font(nameFont).fontSize(nameSize)
    .text(school.name, nameX, top, { lineBreak: false });
  if (school.address) {
    doc.fillColor('#444').font('Helvetica').fontSize(addrSize)
      .text(school.address, nameX, top + nameH + gap, { width: nameW, align: 'center', lineBreak: false });
  }

  // Contact block, vertically centred in the band.
  let ry = (bandH - (rLineH * rLines.length + 3)) / 2;
  doc.font('Helvetica').fontSize(10).fillColor('#444');
  for (const ln of rLines) {
    doc.text(ln, rLeft, ry, { lineBreak: false });
    ry += rLineH + 3;
  }

  // brand rule under the letterhead
  doc.moveTo(34, bandH).lineTo(W - 34, bandH).lineWidth(2).strokeColor(BRAND).stroke();
  doc.lineWidth(1).fillColor('black');
  return bandH + 24;
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
  doc.text('_____________________', 380, y);
  doc.text(role, 380, y + 15);
}

export { BRAND };
