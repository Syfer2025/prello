import { PDFDocument } from 'pdf-lib';
import { mmToPt } from './prelo-canvas-units';

export interface CanvasPdfPageSize {
  widthMm: number;
  heightMm: number;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid PNG page image data URL');
  const base64 = match[1];
  if (!base64) throw new Error('Invalid PNG page image data URL');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function renderCanvasImagesToPdf(
  pageDataUrls: string[],
  pageSize: CanvasPdfPageSize
): Promise<Uint8Array> {
  if (pageDataUrls.length === 0) {
    throw new Error('Cannot export PDF without page images');
  }

  const pdf = await PDFDocument.create();
  const pageWidthPt = mmToPt(pageSize.widthMm);
  const pageHeightPt = mmToPt(pageSize.heightMm);

  for (const dataUrl of pageDataUrls) {
    const image = await pdf.embedPng(dataUrlToBytes(dataUrl));
    const page = pdf.addPage([pageWidthPt, pageHeightPt]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    });
  }

  return pdf.save({ useObjectStreams: false });
}
