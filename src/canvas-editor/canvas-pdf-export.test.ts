import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { dataUrlToBytes, renderCanvasImagesToPdf } from './canvas-pdf-export';
import { mmToPt, PRELO_CANVAS_PRESETS } from './prelo-canvas-units';

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('canvas pdf export', () => {
  it('decodes PNG data URLs to bytes', () => {
    expect(dataUrlToBytes(ONE_BY_ONE_PNG).byteLength).toBeGreaterThan(0);
  });

  it('rejects non-PNG data URLs', () => {
    expect(() => dataUrlToBytes('data:text/plain;base64,SGVsbG8=')).toThrow(
      'Invalid PNG page image data URL'
    );
  });

  it('creates one PDF page per canvas page image using preset page size', async () => {
    const bytes = await renderCanvasImagesToPdf(
      [ONE_BY_ONE_PNG, ONE_BY_ONE_PNG],
      PRELO_CANVAS_PRESETS.a5
    );
    const pdf = await PDFDocument.load(bytes);
    const firstPage = pdf.getPage(0);

    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(pdf.getPageCount()).toBe(2);
    expect(firstPage.getWidth()).toBeCloseTo(mmToPt(PRELO_CANVAS_PRESETS.a5.widthMm), 4);
    expect(firstPage.getHeight()).toBeCloseTo(mmToPt(PRELO_CANVAS_PRESETS.a5.heightMm), 4);
  });

  it('rejects export without page images', async () => {
    await expect(renderCanvasImagesToPdf([], PRELO_CANVAS_PRESETS.a5)).rejects.toThrow(
      'Cannot export PDF without page images'
    );
  });
});
