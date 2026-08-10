import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const BRAND = '#262081';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');

export interface SchoolInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  pan?: string;
}

/** Stream a PDF built by `draw` to the HTTP response as an attachment. */
export function streamPdf(res: Response, filename: string, draw: (doc: PDFKit.PDFDocument) => void) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  draw(doc);
  doc.end();
}

/** Common branded letterhead with school logo. Returns the y position to continue from. */
export function letterhead(doc: PDFKit.PDFDocument, school: SchoolInfo): number {
  const W = doc.page.width;
  const bandH = 96;
  doc.rect(0, 0, W, bandH).fill(BRAND);
  try { doc.image(LOGO_PATH, 34, 12, { fit: [72, 72] }); } catch { /* logo optional */ }

  // Right-hand PAN / Contact block — measure first so the name never overlaps it.
  const pan = school.pan || '305741055';
  const contact = school.phone || '9845186111';
  const rLines = [`PAN No.:- ${pan}`, `Contact:- ${contact}`];
  doc.font('Helvetica-Bold').fontSize(11);
  const rLineH = doc.currentLineHeight();
  const rWidth = Math.max(...rLines.map((l) => doc.widthOfString(l))) + 2;
  const rRight = W - 40;
  const rLeft = rRight - rWidth;

  // School name — as large & bold as fits the space left of the contact block.
  const nameX = 120;
  const maxNameW = rLeft - 28 - nameX;
  let nameSize = 30;
  doc.font('Helvetica-Bold').fontSize(nameSize);
  while (nameSize > 15 && doc.widthOfString(school.name) > maxNameW) {
    nameSize -= 1;
    doc.fontSize(nameSize);
  }
  const nameW = doc.widthOfString(school.name);
  const nameH = doc.currentLineHeight();

  const addrSize = 12;
  doc.font('Helvetica').fontSize(addrSize);
  const addrH = school.address ? doc.currentLineHeight() : 0;
  const gap = school.address ? 3 : 0;
  const top = (bandH - (nameH + gap + addrH)) / 2;

  doc.fillColor('white').font('Helvetica-Bold').fontSize(nameSize)
    .text(school.name, nameX, top, { lineBreak: false });
  if (school.address) {
    doc.font('Helvetica').fontSize(addrSize)
      .text(school.address, nameX, top + nameH + gap, { width: nameW, align: 'center', lineBreak: false });
  }

  // Contact block, vertically centred in the band.
  let ry = (bandH - (rLineH * rLines.length + 3)) / 2;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('white');
  for (const ln of rLines) {
    doc.text(ln, rLeft, ry, { lineBreak: false });
    ry += rLineH + 3;
  }

  doc.fillColor('black');
  return 120;
}

export function heading(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.fillColor(BRAND).fontSize(16).font('Helvetica-Bold').text(title.toUpperCase(), 50, y, { align: 'center', underline: true });
  doc.fillColor('black').font('Helvetica').fontSize(12);
  return y + 40;
}

export function signatureBlock(doc: PDFKit.PDFDocument) {
  const y = 720;
  doc.fontSize(11).font('Helvetica');
  doc.text('_____________________', 50, y);
  doc.text('Date', 50, y + 15);
  doc.text('_____________________', 380, y);
  doc.text('Principal / Authorised Signatory', 380, y + 15);
}

export { BRAND };
