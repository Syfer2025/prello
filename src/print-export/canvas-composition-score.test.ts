import { describe, expect, it } from 'vitest';
import {
  scoreCanvasComposition,
  type CompositionProblemKind,
} from './canvas-composition-score';
import type { CanvasLayoutGlyph, CanvasLayoutSnapshot } from './canvas-vector-types';

const FONT_SIZE = 13;
const ROW_HEIGHT = 18;

function glyph(partial: Partial<CanvasLayoutGlyph>): CanvasLayoutGlyph {
  return {
    pageNo: 0,
    x: 72,
    yTop: 72,
    ascent: 11,
    width: 7,
    rowHeight: ROW_HEIGHT,
    value: 'a',
    fontFamily: 'Crimson Text',
    fontSizePx: FONT_SIZE,
    bold: false,
    italic: false,
    underline: false,
    strikeout: false,
    rowFlex: 'alignment',
    ...partial,
  };
}

interface LineOptions {
  x?: number;
  letterWidth?: number;
  spaceWidth?: number;
  rowFlex?: string;
  pageNo?: number;
}

/** Constrói os glifos de uma linha, avançando x conforme as larguras de avanço. */
function line(text: string, yTop: number, options: LineOptions = {}): CanvasLayoutGlyph[] {
  const letterWidth = options.letterWidth ?? 10;
  const spaceWidth = options.spaceWidth ?? 5;
  let x = options.x ?? 72;
  return [...text].map((value) => {
    const width = value === ' ' ? spaceWidth : letterWidth;
    const g = glyph({
      value,
      x,
      yTop,
      width,
      rowFlex: options.rowFlex ?? 'alignment',
      ...(options.pageNo !== undefined ? { pageNo: options.pageNo } : {}),
    });
    x += width;
    return g;
  });
}

function snapshot(
  glyphs: CanvasLayoutGlyph[],
  options: Partial<CanvasLayoutSnapshot> = {}
): CanvasLayoutSnapshot {
  return {
    pageWidthPx: 560,
    pageHeightPx: 800,
    pageCount: 1,
    glyphs,
    images: [],
    skipped: { images: 0, tables: 0, other: 0 },
    ...options,
  };
}

function kinds(worst: { kind: CompositionProblemKind }[]): CompositionProblemKind[] {
  return worst.map((w) => w.kind);
}

// Uma linha de corpo "cheia": 5 palavras de 7 letras + 4 espaços naturais.
const FULL = 'aaaaaaa bbbbbbb ccccccc ddddddd eeeeeee';

describe('scoreCanvasComposition', () => {
  it('returns a perfect score for an empty snapshot', () => {
    const result = scoreCanvasComposition(snapshot([]));
    expect(result.score).toBe(100);
    expect(result.counts.lines).toBe(0);
    expect(result.subScores).toEqual({
      wordSpacing: 100,
      tracking: 100,
      hyphenation: 100,
      lastLine: 100,
      density: 100,
    });
    expect(result.worst).toEqual([]);
  });

  it('scores balanced justified body text near 100 with no flagged offenders', () => {
    const result = scoreCanvasComposition(
      snapshot([
        ...line(FULL, 72),
        ...line(FULL, 90),
        // última linha curta mas natural (≈60% da medida): não é runt.
        ...line('aaaaaaa bbbbbbb cccc', 108, { rowFlex: 'left' }),
      ])
    );

    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.worst).toEqual([]);
    expect(result.counts.looseLines).toBe(0);
    expect(result.counts.shortLastLines).toBe(0);
    expect(result.metrics.naturalSpaceWidthPx).toBeGreaterThan(0);
  });

  it('penalizes a justified line with very loose word spaces', () => {
    const result = scoreCanvasComposition(
      snapshot([
        ...line(FULL, 72),
        ...line(FULL, 90, { spaceWidth: 22 }), // espaços ~4.4x o natural
        ...line(FULL, 108),
      ])
    );

    expect(result.subScores.wordSpacing).toBeLessThan(100);
    expect(result.counts.looseLines).toBeGreaterThanOrEqual(1);
    expect(kinds(result.worst)).toContain('looseSpacing');
    expect(result.metrics.spaceLoosenessRatio.max).toBeGreaterThan(2);
  });

  it('detects extra letter tracking by comparing advances to the natural minimum', () => {
    const result = scoreCanvasComposition(
      snapshot([
        // referência: mesmas letras em avanço natural (10px), linha não justificada.
        ...line('aaaaaaa bbbbbbb ccccccc', 72, { rowFlex: 'left', letterWidth: 10 }),
        // justificada com letras infladas para 13px → 3px de tracking por letra.
        ...line('aaaaaaa bbbbbbb ccccccc', 90, { letterWidth: 13, spaceWidth: 5 }),
      ])
    );

    expect(result.subScores.tracking).toBeLessThan(100);
    expect(result.counts.trackedLines).toBeGreaterThanOrEqual(1);
    expect(result.metrics.letterTrackingEm.max).toBeGreaterThan(0.03);
    expect(kinds(result.worst)).toContain('tracking');
  });

  it('penalizes hyphen ladders beyond the consecutive limit', () => {
    const result = scoreCanvasComposition(
      snapshot([
        ...line('aaaaaaa bbbbbbb ccccccc ddddddd-', 72),
        ...line('aaaaaaa bbbbbbb ccccccc ddddddd-', 90),
        ...line('aaaaaaa bbbbbbb ccccccc ddddddd-', 108),
        ...line('aaaaaaa bbbbbbb ccccccc ddddddd-', 126),
        ...line('aaaaaaa bbbbbbb cccc', 144, { rowFlex: 'left' }),
      ])
    );

    expect(result.subScores.hyphenation).toBeLessThan(100);
    expect(result.counts.hyphenLadders).toBeGreaterThanOrEqual(1);
    expect(result.metrics.maxHyphenLadder).toBeGreaterThanOrEqual(3);
    expect(kinds(result.worst)).toContain('hyphenLadder');
  });

  it('penalizes a paragraph whose last line is a tiny runt', () => {
    const result = scoreCanvasComposition(
      snapshot([
        ...line(FULL, 72),
        ...line(FULL, 90),
        ...line('aa', 108, { rowFlex: 'left' }), // ~5% da medida
      ])
    );

    expect(result.subScores.lastLine).toBeLessThan(100);
    expect(result.counts.shortLastLines).toBeGreaterThanOrEqual(1);
    expect(result.metrics.lastLineFillRatio.min).toBeLessThan(0.15);
    expect(kinds(result.worst)).toContain('shortLastLine');
  });

  it('penalizes strong word-space density variation within a paragraph', () => {
    const result = scoreCanvasComposition(
      snapshot([
        ...line(FULL, 72, { spaceWidth: 5 }), // ratio ≈ 1.0
        ...line(FULL, 90, { spaceWidth: 14 }), // ratio ≈ 2.8 na mesma medida
        ...line('aaaaaaa bbbbbbb cccc', 108, { rowFlex: 'left' }),
      ])
    );

    expect(result.subScores.density).toBeLessThan(100);
    expect(result.counts.densityVariationParagraphs).toBeGreaterThanOrEqual(1);
    expect(result.metrics.densitySpread.max).toBeGreaterThan(0.3);
    expect(kinds(result.worst)).toContain('densityVariation');
  });

  it('is deterministic for the same input', () => {
    const glyphs = [
      ...line(FULL, 72, { spaceWidth: 20 }),
      ...line(FULL, 90, { spaceWidth: 5 }),
      ...line('aa', 108, { rowFlex: 'left' }),
    ];
    const a = scoreCanvasComposition(snapshot(glyphs));
    const b = scoreCanvasComposition(snapshot(glyphs));
    expect(a).toEqual(b);
  });

  it('respects option overrides for the consecutive-hyphen limit', () => {
    const glyphs = [
      ...line('aaaaaaa bbbbbbb ccccccc ddddddd-', 72),
      ...line('aaaaaaa bbbbbbb ccccccc ddddddd-', 90),
      ...line('aaaaaaa bbbbbbb cccc', 108, { rowFlex: 'left' }),
    ];

    const strict = scoreCanvasComposition(snapshot(glyphs), { maxConsecutiveHyphens: 1 });
    const lenient = scoreCanvasComposition(snapshot(glyphs), { maxConsecutiveHyphens: 5 });

    expect(strict.counts.hyphenLadders).toBeGreaterThanOrEqual(1);
    expect(lenient.counts.hyphenLadders).toBe(0);
    expect(strict.score).toBeLessThan(lenient.score);
  });

  it('caps the offender list at the configured limit', () => {
    const glyphs = Array.from({ length: 12 }, (_, i) =>
      line(FULL, 72 + i * 18, { spaceWidth: 24 })
    ).flat();
    const result = scoreCanvasComposition(snapshot(glyphs), { worstLimit: 3 });
    expect(result.worst.length).toBeLessThanOrEqual(3);
  });
});
