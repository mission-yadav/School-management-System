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
  doc.rect(0, 0, doc.page.width, 96).fill(BRAND);
  try { doc.image(LOGO_PATH, 40, 16, { fit: [64, 64] }); } catch { /* logo optional */ }
  doc.fillColor('white').fontSize(21).font('Helvetica-Bold').text(school.name, 118, 26);
  doc.fontSize(9).font('Helvetica')
    .text([school.address, school.phone && `Ph: ${school.phone}`, school.email].filter(Boolean).join('  |  '), 118, 56);
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
