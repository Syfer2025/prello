import { describe, expect, it } from 'vitest';
import {
  analyzeCanvasTypography,
  type TypographicPreflightIssue,
} from './canvas-typographic-preflight';
import type {
  CanvasLayoutGlyph,
  CanvasLayoutImage,
  CanvasLayoutSnapshot,
} from './canvas-vector-types';

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

function line(text: string, yTop: number, options: Partial<CanvasLayoutGlyph> = {}): CanvasLayoutGlyph[] {
  let x = options.x ?? 72;
  return [...text].map((value) => {
    const width = value === ' ' ? (options.width ?? 4) : 7;
    const g = glyph({ ...options, value, x, yTop, width });
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

function issueTypes(issues: TypographicPreflightIssue[]) {
  return issues.map((issue) => issue.type);
}

describe('analyzeCanvasTypography', () => {
  it('keeps balanced body text clean', () => {
    const report = analyzeCanvasTypography(
      snapshot([
        ...line('Texto equilibrado com espacos normais', 72),
        ...line('Outra linha regular para medir o corpo', 90),
        ...line('Fechamento natural do paragrafo', 108, { rowFlex: 'left' }),
      ])
    );

    expect(report.status).toBe('ok');
    expect(report.issues).toEqual([]);
  });

  it('flags justified lines with excessively expanded word spaces', () => {
    const report = analyzeCanvasTypography(
      snapshot([
        ...line('Texto com buracos grandes', 72, { width: 18, rowFlex: 'alignment' }),
        ...line('Linha normal para referencia', 90),
      ])
    );

    expect(issueTypes(report.issues)).toContain('looseJustifiedLine');
    expect(report.issues.find((issue) => issue.type === 'looseJustifiedLine')).toMatchObject({
      severity: 'warning',
      pageNo: 1,
    });
  });

  it('flags hyphen ladders after the configured consecutive limit', () => {
    const report = analyzeCanvasTypography(
      snapshot([
        ...line('primeira linha hifen-', 72),
        ...line('segunda linha hifen-', 90),
        ...line('terceira linha hifen-', 108),
        ...line('linha sem hifen depois', 126),
      ])
    );

    expect(issueTypes(report.issues)).toContain('hyphenLadder');
    expect(report.issues.find((issue) => issue.type === 'hyphenLadder')?.detail).toContain(
      '3 linhas seguidas'
    );
  });

  it('does not count hyphen ladders across a page break', () => {
    const report = analyzeCanvasTypography(
      snapshot([
        ...line('primeira linha hifen-', 72),
        ...line('segunda linha hifen-', 90),
        ...line('nova pagina tambem hifen-', 72, { pageNo: 1 }),
      ], {
        pageCount: 2,
      })
    );

    expect(issueTypes(report.issues)).not.toContain('hyphenLadder');
  });

  it('flags a hyphenated line at the bottom of a page', () => {
    const report = analyzeCanvasTypography(
      snapshot([
        ...line('inicio da pagina sem problema', 72),
        ...line('ultima linha termina hifen-', 760),
        ...line('pagina seguinte limpa', 72, { pageNo: 1 }),
      ], {
        pageCount: 2,
      })
    );

    expect(issueTypes(report.issues)).toContain('pageBottomHyphen');
    expect(report.issues.find((issue) => issue.type === 'pageBottomHyphen')).toMatchObject({
      pageNo: 1,
      lineText: 'ultima linha termina hifen-',
    });
  });

  it('flags text wrap lines that become too narrow beside an image', () => {
    const image: CanvasLayoutImage = {
      pageNo: 0,
      x: 72,
      yTop: 78,
      width: 160,
      height: 120,
      dataUrl: 'data:image/png;base64,abc',
    };

    const report = analyzeCanvasTypography(
      snapshot([
        ...line('Linha longa suficiente para definir a medida do texto', 48),
        ...line('texto apertado', 100, { x: 260 }),
        ...line('Outra linha normal para referencia do corpo', 230),
      ], {
        images: [image],
      })
    );

    expect(issueTypes(report.issues)).toContain('imageWrapNarrowLine');
    expect(report.issues.find((issue) => issue.type === 'imageWrapNarrowLine')).toMatchObject({
      pageNo: 1,
      lineText: 'texto apertado',
    });
  });

  it('flags narrow text on the left side of a right-anchored image', () => {
    const image: CanvasLayoutImage = {
      pageNo: 0,
      x: 330,
      yTop: 78,
      width: 150,
      height: 120,
      dataUrl: 'data:image/png;base64,abc',
    };

    const report = analyzeCanvasTypography(
      snapshot([
        ...line('Linha longa suficiente para definir a medida do texto', 48),
        ...line('texto apertado', 100, { x: 72 }),
        ...line('Outra linha normal para referencia do corpo', 230),
      ], {
        images: [image],
      })
    );

    expect(issueTypes(report.issues)).toContain('imageWrapNarrowLine');
  });

  it('summarizes warnings by severity without turning typography into a blocking export error', () => {
    const report = analyzeCanvasTypography(
      snapshot([
        ...line('primeira linha hifen-', 72),
        ...line('segunda linha hifen-', 90),
        ...line('terceira linha hifen-', 108),
      ])
    );

    expect(report.status).toBe('warning');
    expect(report.warningCount).toBeGreaterThan(0);
    expect(report.blockingCount).toBe(0);
  });
});
