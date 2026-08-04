import PDFDocument from 'pdfkit';
import type { Response } from 'express';

const BRAND = '#262081';

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

/** Common branded letterhead. Returns the y position to continue from. */
export function letterhead(doc: PDFKit.PDFDocument, school: SchoolInfo): number {
  doc.rect(0, 0, doc.page.width, 90).fill(BRAND);
  doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text(school.name, 50, 28);
  doc.fontSize(9).font('Helvetica')
    .text([school.address, school.phone && `Ph: ${school.phone}`, school.email].filter(Boolean).join('  |  '), 50, 58);
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
