import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { bookLayoutSettingsFromPreset } from '../canvas-editor/book-layout-settings';
import { PRELO_CANVAS_PRESETS } from '../canvas-editor/prelo-canvas-units';
import type { FontSourceMap } from './canvas-vector-render';
import type { CanvasLayoutGlyph, CanvasLayoutSnapshot } from './canvas-vector-types';
import { exportCanvasVectorPdfFromSnapshot } from './canvas-vector-pdf-export';

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, '..', '..', 'public', 'fonts');
const A5 = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);

function fonts(): FontSourceMap {
  return {
    'Crimson Text': {
      regular: readFileSync(join(fontsDir, 'CrimsonText-Regular.ttf')),
      italic: readFileSync(join(fontsDir, 'CrimsonText-Italic.ttf')),
      bold: readFileSync(join(fontsDir, 'CrimsonText-Bold.ttf')),
      boldItalic: readFileSync(join(fontsDir, 'CrimsonText-BoldItalic.ttf')),
    },
  };
}

function glyph(partial: Partial<CanvasLayoutGlyph>): CanvasLayoutGlyph {
  return {
    pageNo: 0,
    x: 64,
    yTop: 64,
    ascent: 10,
    width: 8,
    rowHeight: 16,
    value: 'A',
    fontFamily: 'Crimson Text',
    fontSizePx: 13,
    bold: false,
    italic: false,
    underline: false,
    strikeout: false,
    ...partial,
  };
}

function snapshot(glyphs: CanvasLayoutGlyph[]): CanvasLayoutSnapshot {
  return {
    pageWidthPx: 559,
    pageHeightPx: 794,
    pageCount: 1,
    glyphs,
    skipped: { images: 1, tables: 0, other: 0 },
  };
}

describe('exportCanvasVectorPdfFromSnapshot', () => {
  it('exports a loadable vector PDF from the faithful canvas snapshot path', async () => {
    const result = await exportCanvasVectorPdfFromSnapshot({
      snapshot: snapshot([...'Texto vetorial'].map((value, index) => glyph({ value, x: 64 + index * 8 }))),
      bookLayout: A5,
      fonts: fonts(),
      fallbackFamily: 'Crimson Text',
      bleedMm: 3,
      cropMarks: true,
      cropMarkLengthMm: 5,
      cropMarkGapMm: 2,
    });

    const pdf = await PDFDocument.load(result.bytes);
    const raw = Buffer.from(result.bytes).toString('latin1');

    expect(result.pageCount).toBe(1);
    expect(result.skipped.images).toBe(1);
    expect(pdf.getPageCount()).toBe(1);
    expect(raw).toContain('/FontFile2');
    expect(raw).toContain('/TrimBox');
    expect(raw).toContain('/BleedBox');
    expect(raw).not.toContain('/Subtype /Image');
  });
});
