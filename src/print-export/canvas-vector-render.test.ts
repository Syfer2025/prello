import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderCanvasVectorPdf, type FontSourceMap } from './canvas-vector-render';
import { snapshotToVectorDocument } from './canvas-vector-pdf';
import type { CanvasLayoutGlyph, CanvasLayoutSnapshot } from './canvas-vector-types';
import { bookLayoutSettingsFromPreset } from '../canvas-editor/book-layout-settings';
import { PRELO_CANVAS_PRESETS } from '../canvas-editor/prelo-canvas-units';

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

function glyph(p: Partial<CanvasLayoutGlyph>): CanvasLayoutGlyph {
  return {
    pageNo: 0, x: 64, yTop: 64, ascent: 10, width: 7, rowHeight: 16,
    value: 'a', fontFamily: 'Crimson Text', fontSizePx: 13,
    bold: false, italic: false, underline: false, strikeout: false, ...p,
  };
}

function snap(glyphs: CanvasLayoutGlyph[]): CanvasLayoutSnapshot {
  return { pageWidthPx: 559, pageHeightPx: 794, pageCount: 1, glyphs, skipped: { images: 0, tables: 0, other: 0 } };
}

describe('renderCanvasVectorPdf', () => {
  it('gera um PDF válido com fonte embutida (sem subset, confiável no browser)', async () => {
    let x = 64;
    const glyphs = [...'No princípio não havia mapas'].map((ch) => {
      const g = glyph({ value: ch, x, width: 7 });
      x += 7;
      return g;
    });
    const doc = snapshotToVectorDocument(snap(glyphs), A5, { bleedMm: 3, cropMarks: true });
    const bytes = await renderCanvasVectorPdf(doc, { fonts: fonts(), fallbackFamily: 'Crimson Text' });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('/FontFile2'); // fonte embutida
    expect(text).toContain('/TrimBox');
    expect(text).toContain('/BleedBox');
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it('escolhe a variante bold/italic por run', async () => {
    const glyphs = [
      glyph({ value: 'R', x: 64, width: 7 }),
      glyph({ value: 'B', x: 71, width: 7, bold: true }),
      glyph({ value: 'I', x: 78, width: 7, italic: true }),
    ];
    const doc = snapshotToVectorDocument(snap(glyphs), A5);
    expect(doc.pages[0]!.runs.map((r) => r.variant)).toEqual(['regular', 'bold', 'italic']);
    const bytes = await renderCanvasVectorPdf(doc, { fonts: fonts() });
    // 3 variantes distintas embutidas -> 3 FontFile2.
    const count = Buffer.from(bytes).toString('latin1').split('/FontFile2').length - 1;
    expect(count).toBe(3);
  });
});
