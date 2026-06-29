import { describe, expect, it } from 'vitest';
import { snapshotToVectorDocument } from './canvas-vector-pdf';
import type { CanvasLayoutGlyph, CanvasLayoutSnapshot } from './canvas-vector-types';
import { mmToPt, PRELO_CANVAS_PRESETS } from '../canvas-editor/prelo-canvas-units';
import { bookLayoutSettingsFromPreset } from '../canvas-editor/book-layout-settings';

const A5 = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);
const PAGE_W = 559;
const PAGE_H = 794;
const KX = mmToPt(A5.widthMm) / PAGE_W;
const KY = mmToPt(A5.heightMm) / PAGE_H;

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

function snapshot(glyphs: CanvasLayoutGlyph[], pageCount = 1): CanvasLayoutSnapshot {
  return { pageWidthPx: PAGE_W, pageHeightPx: PAGE_H, pageCount, glyphs, skipped: { images: 0, tables: 0, other: 0 } };
}

describe('snapshotToVectorDocument', () => {
  it('mapeia px->pt e inverte Y na baseline', () => {
    const doc = snapshotToVectorDocument(snapshot([glyph({})]), A5);
    expect(doc.pages).toHaveLength(1);
    const run = doc.pages[0]!.runs[0]!;
    expect(run.text).toBe('A');
    expect(run.x).toBeCloseTo(64 * KX, 3);
    expect(run.y).toBeCloseTo(mmToPt(A5.heightMm) - (64 + 10) * KY, 3);
    expect(run.fontSize).toBeCloseTo(13 * KX, 3);
    expect(run.width).toBeCloseTo(8 * KX, 3);
  });

  it('mapeia imagem px->pt no canto inferior-esquerdo (Y invertido)', () => {
    const snap: CanvasLayoutSnapshot = {
      pageWidthPx: PAGE_W,
      pageHeightPx: PAGE_H,
      pageCount: 1,
      glyphs: [],
      images: [
        { pageNo: 0, x: 100, yTop: 50, width: 120, height: 90, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      ],
      skipped: { images: 0, tables: 0, other: 0 },
    };
    const img = snapshotToVectorDocument(snap, A5).pages[0]!.images![0]!;
    expect(img.x).toBeCloseTo(100 * KX, 3);
    // y é o canto INFERIOR: altura da página - (topo + altura) da imagem.
    expect(img.y).toBeCloseTo(mmToPt(A5.heightMm) - (50 + 90) * KY, 3);
    expect(img.width).toBeCloseTo(120 * KX, 3);
    expect(img.height).toBeCloseTo(90 * KY, 3);
    expect(img.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('agrupa glifos contíguos de mesmo estilo numa run', () => {
    const doc = snapshotToVectorDocument(
      snapshot([glyph({ value: 'A', x: 64, width: 8 }), glyph({ value: 'B', x: 72, width: 6 })]),
      A5
    );
    const runs = doc.pages[0]!.runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text).toBe('AB');
    // largura-alvo = (72 + 6 - 64) px
    expect(runs[0]!.width).toBeCloseTo(14 * KX, 3);
  });

  it('linha justificada (larguras infladas, contíguas) vira UMA run com largura cheia', () => {
    // simula tracking: cada glifo +2px de avanço, contíguo
    const gs = [
      glyph({ value: 'a', x: 64, width: 10 }),
      glyph({ value: 'b', x: 74, width: 10 }),
      glyph({ value: 'c', x: 84, width: 10 }),
    ].map((g) => ({ ...g, rowFlex: 'justify' }));
    const doc = snapshotToVectorDocument(snapshot(gs), A5);
    const runs = doc.pages[0]!.runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text).toBe('abc');
    expect(runs[0]!.width).toBeCloseTo((84 + 10 - 64) * KX, 3);
  });

  it('separa espaços expandidos para o PDF não redistribuir justificação entre letras', () => {
    const doc = snapshotToVectorDocument(
      snapshot([
        glyph({ value: 'A', x: 64, width: 8 }),
        glyph({ value: ' ', x: 72, width: 20 }),
        glyph({ value: 'B', x: 92, width: 8 }),
      ]),
      A5
    );

    const runs = doc.pages[0]!.runs;
    expect(runs.map((run) => run.text)).toEqual(['A', ' ', 'B']);
    expect(runs[1]!.width).toBeCloseTo(20 * KX, 3);
  });

  it('quebra runs antes de pares que virariam ligadura e perderiam posições do canvas', () => {
    let x = 64;
    const glyphs = [...'sofisticadas influência office'].map((value) => {
      const g = glyph({ value, x, width: value === ' ' ? 4 : 7 });
      x += g.width;
      return g;
    });

    const doc = snapshotToVectorDocument(snapshot(glyphs), A5);
    const texts = doc.pages[0]!.runs.map((run) => run.text);

    expect(texts.join('')).toBe('sofisticadas influência office');
    expect(texts.join('|')).toContain('sof|i');
    expect(texts.join('|')).toContain('inf|l');
    expect(texts.join('|')).toContain('of|f|ice');
    for (const text of texts) {
      expect(text).not.toMatch(/f[fil]/);
    }
  });

  it('quebra a run quando o estilo muda', () => {
    const doc = snapshotToVectorDocument(
      snapshot([glyph({ value: 'A', x: 64, width: 8 }), glyph({ value: 'B', x: 72, width: 6, bold: true })]),
      A5
    );
    const runs = doc.pages[0]!.runs;
    expect(runs).toHaveLength(2);
    expect(runs[0]!.variant).toBe('regular');
    expect(runs[1]!.variant).toBe('bold');
  });

  it('quebra a run quando há gap (letter spacing)', () => {
    const doc = snapshotToVectorDocument(
      snapshot([glyph({ value: 'A', x: 64, width: 8 }), glyph({ value: 'B', x: 78, width: 6 })]),
      A5
    );
    expect(doc.pages[0]!.runs).toHaveLength(2);
  });

  it('separa por página e ignora glifos não renderáveis', () => {
    const doc = snapshotToVectorDocument(
      snapshot(
        [
          glyph({ value: '​', x: 64 }),
          glyph({ value: 'A', pageNo: 0 }),
          glyph({ value: '\n' }),
          glyph({ value: 'B', pageNo: 1 }),
        ],
        2
      )
    , A5);
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0]!.runs.map((r) => r.text).join('')).toBe('A');
    expect(doc.pages[1]!.runs.map((r) => r.text).join('')).toBe('B');
  });

  it('aplica sangria e marcas de corte (caixas e 8 marcas)', () => {
    const doc = snapshotToVectorDocument(snapshot([glyph({})]), A5, {
      bleedMm: 3,
      cropMarks: true,
      cropMarkLengthMm: 5,
      cropMarkGapMm: 2,
    });
    const page = doc.pages[0]!;
    const offset = mmToPt(3) + mmToPt(5) + mmToPt(2);
    const trimW = mmToPt(A5.widthMm);
    const trimH = mmToPt(A5.heightMm);
    page.trimBox.forEach((v, i) => expect(v).toBeCloseTo([offset, offset, offset + trimW, offset + trimH][i]!, 6));
    expect(page.bleedBox[0]).toBeCloseTo(offset - mmToPt(3), 3);
    page.mediaBox.forEach((v, i) => expect(v).toBeCloseTo([0, 0, trimW + offset * 2, trimH + offset * 2][i]!, 6));
    expect(page.marks).toHaveLength(8);
    // run deslocado pelo offset
    expect(page.runs[0]!.x).toBeCloseTo(offset + 64 * KX, 3);
  });

  it('sem marcas e sem sangria: media == trim', () => {
    const doc = snapshotToVectorDocument(snapshot([glyph({})]), A5);
    const page = doc.pages[0]!;
    expect(page.mediaBox).toEqual(page.trimBox);
    expect(page.marks).toHaveLength(0);
  });
});
