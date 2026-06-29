import { describe, expect, it } from 'vitest';
import {
  applyFirstLineIndentToRows,
  createCachedElementWidthMeasurer,
  getFirstLineIndentManualActive,
  installCanvasWordJustificationPatch,
  redistributeJustificationToWordSpaces,
  toggleFirstLineIndentForSelection,
} from './canvas-word-justification';
import { PRELO_BOOK_TYPOGRAPHY_PROFILE } from './canvas-typography-profile';
import type { CanvasDrawInternal } from './canvas-draw-internal';

interface TestElement {
  value: string;
  metrics: { width: number };
  naturalWidth?: number;
  size?: number;
  left?: number;
}

function el(value: string, naturalWidth: number, size = 20): TestElement {
  // Simula a linha depois do canvas-editor espalhar tracking por glifo:
  // a largura atual pode estar errada, mas naturalWidth é a fonte de verdade.
  return { value, naturalWidth, size, metrics: { width: naturalWidth + 2 } };
}

describe('redistributeJustificationToWordSpaces', () => {
  it('moves justification expansion from every glyph to word spaces only', () => {
    const row = {
      width: 120,
      rowFlex: 'alignment',
      elementList: [
        el('A', 10),
        el(' ', 5),
        el('B', 10),
        el(' ', 5),
        el('C', 10),
      ],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 120,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([
      10,
      45,
      10,
      45,
      10,
    ]);
    expect(row.width).toBe(120);
  });

  it('leaves rows without word spaces untouched as a fail-safe', () => {
    const row = {
      width: 90,
      rowFlex: 'alignment',
      elementList: [el('A', 10), el('B', 10), el('C', 10)],
    };
    const before = row.elementList.map((element) => element.metrics.width);

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 120,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual(before);
    expect(row.width).toBe(90);
  });

  it('still closes rows flagged by the canvas editor as width-not-enough', () => {
    const row = {
      width: 72,
      rowFlex: 'alignment',
      isWidthNotEnough: true,
      elementList: [el('A', 10), el(' ', 5), el('B', 10)],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 120,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([10, 100, 10]);
    expect(row.width).toBe(120);
  });

  it('keeps text wrapped beside a left-anchored image justified to the reduced width', () => {
    const row = {
      width: 72,
      rowFlex: 'alignment',
      isSurround: true,
      isWidthNotEnough: true,
      elementList: [{ ...el('A', 10), left: 40 }, el(' ', 5), el('B', 10)],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 120,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([10, 60, 10]);
    expect(row.width).toBe(80);
  });

  it('does not stretch split surround rows around a centered image', () => {
    const row = {
      width: 170,
      rowFlex: 'alignment',
      isSurround: true,
      isWidthNotEnough: true,
      elementList: [el('geração', 30), el(' ', 5), { ...el('dependia', 35), left: 100 }],
    };
    const beforeWidths = row.elementList.map((element) => element.metrics.width);

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 220,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual(beforeWidths);
    expect(row.width).toBe(170);
  });

  it('justifies left-side image wrap rows to their reduced available width', () => {
    const row = {
      width: 72,
      availableWidth: 80,
      rowFlex: 'alignment',
      isSurround: true,
      isWidthNotEnough: true,
      elementList: [el('A', 10), el(' ', 5), el('B', 10)],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 120,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([10, 60, 10]);
    expect(row.width).toBe(80);
  });

  it('uses a small amount of intra-word letter spacing before making word spaces huge', () => {
    const row = {
      width: 65,
      rowFlex: 'alignment',
      elementList: [
        el('A', 10, 400),
        el('B', 10, 400),
        el(' ', 5, 400),
        el('C', 10, 400),
        el('D', 10, 400),
      ],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 65,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList[0]!.metrics.width).toBeGreaterThan(10);
    expect(row.elementList[1]!.metrics.width).toBe(10);
    expect(row.elementList[2]!.metrics.width).toBeLessThan(25);
    const total = row.elementList.reduce((sum, element) => sum + element.metrics.width, 0);
    expect(total).toBeCloseTo(65, 6);
    expect(row.width).toBe(65);
  });

  it('accepts an editorial profile that trades more justification into controlled letter spacing', () => {
    const row = {
      width: 65,
      rowFlex: 'alignment',
      elementList: [
        el('A', 10),
        el('B', 10),
        el(' ', 5),
        el('C', 10),
        el('D', 10),
      ],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 65,
      measureElementWidth: (element) => element.naturalWidth!,
      typographyProfile: {
        ...PRELO_BOOK_TYPOGRAPHY_PROFILE,
        justification: {
          maxLetterExtraShare: 0.5,
          maxLetterExtraRatio: 1,
        },
      },
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([
      15,
      10,
      15,
      15,
      10,
    ]);
  });

  it('preserves leading spaces (paragraph indent) instead of collapsing them', () => {
    // Linha justificada começando com 2 espaços de recuo + "A B".
    const row = {
      width: 50,
      rowFlex: 'alignment',
      elementList: [el(' ', 5), el(' ', 5), el('A', 10), el(' ', 5), el('B', 10)],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 50,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    const widths = row.elementList.map((element) => element.metrics.width);
    // Os 2 espaços de recuo mantêm a largura natural (5 cada) — NÃO colapsam para 0.
    expect(widths[0]).toBe(5);
    expect(widths[1]).toBe(5);
    // "A" natural, o espaço entre palavras recebe o extra, "B" natural.
    expect(widths[2]).toBe(10);
    expect(widths[4]).toBe(10);
    // recuo preservado + conteúdo justificado fecham exatamente na margem.
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(50, 6);
    expect(row.width).toBe(50);
  });

  it('does not waste justification width on trailing spaces at the end of a line', () => {
    const row = {
      width: 40,
      rowFlex: 'alignment',
      elementList: [el('A', 10), el(' ', 5), el('B', 10), el(' ', 5)],
    };

    redistributeJustificationToWordSpaces([row], {
      innerWidth: 40,
      measureElementWidth: (element) => element.naturalWidth!,
    });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([10, 20, 10, 0]);
    const visibleRightEdge = row.elementList
      .slice(0, 3)
      .reduce((sum, element) => sum + element.metrics.width, 0);
    expect(visibleRightEdge).toBe(40);
    expect(row.width).toBe(40);
  });
});

describe('applyFirstLineIndentToRows', () => {
  const zw = (extension?: unknown) => ({
    value: '​',
    metrics: { width: 0 },
    ...(extension ? { extension } : {}),
  });

  it('indents only paragraph-start rows (zero-width leader), not continuation rows', () => {
    const paraStart = { width: 100, rowFlex: 'alignment', elementList: [zw(), el('A', 10), el(' ', 5), el('B', 10)] };
    const continuation = { width: 100, rowFlex: 'alignment', elementList: [el('c', 10), el('d', 10)] };
    applyFirstLineIndentToRows([paraStart, continuation] as never, { indentPx: 20, auto: true });
    expect((paraStart as { offsetX?: number }).offsetX).toBe(20);
    expect((continuation as { offsetX?: number }).offsetX).toBeUndefined();
  });

  it('does not accumulate the first-line indent across repeated layout passes', () => {
    const paraStart = { width: 100, rowFlex: 'alignment', elementList: [zw(), el('A', 10)] };

    applyFirstLineIndentToRows([paraStart] as never, { indentPx: 20, auto: true });
    applyFirstLineIndentToRows([paraStart] as never, { indentPx: 20, auto: true });

    expect((paraStart as { offsetX?: number }).offsetX).toBe(20);
  });

  it('restores the original row offset when the first-line indent turns off', () => {
    const paraStart = { width: 100, rowFlex: 'alignment', offsetX: 7, elementList: [zw(), el('A', 10)] };

    applyFirstLineIndentToRows([paraStart] as never, { indentPx: 20, auto: true });
    applyFirstLineIndentToRows([paraStart] as never, { indentPx: 20, auto: false });

    expect((paraStart as { offsetX?: number }).offsetX).toBe(7);
  });

  it('respects per-paragraph override (false disables, true forces over auto)', () => {
    const off = { width: 100, rowFlex: 'alignment', elementList: [zw({ firstLineIndent: false }), el('A', 10)] };
    applyFirstLineIndentToRows([off] as never, { indentPx: 20, auto: true });
    expect((off as { offsetX?: number }).offsetX).toBeUndefined();

    const on = { width: 100, rowFlex: 'alignment', elementList: [zw({ firstLineIndent: true }), el('A', 10)] };
    applyFirstLineIndentToRows([on] as never, { indentPx: 20, auto: false });
    expect((on as { offsetX?: number }).offsetX).toBe(20);
  });

  it('skips list rows and right/center-aligned paragraphs', () => {
    const list = { width: 100, rowFlex: 'alignment', isList: true, elementList: [zw(), el('A', 10)] };
    const center = { width: 100, rowFlex: 'center', elementList: [zw(), el('A', 10)] };
    applyFirstLineIndentToRows([list, center] as never, { indentPx: 20, auto: true });
    expect((list as { offsetX?: number }).offsetX).toBeUndefined();
    expect((center as { offsetX?: number }).offsetX).toBeUndefined();
  });

  it('makes a justified indented row fill innerWidth - offsetX (closes at the margin)', () => {
    const row = { width: 120, rowFlex: 'alignment', offsetX: 20, elementList: [el('A', 10), el(' ', 5), el('B', 10)] };
    redistributeJustificationToWordSpaces([row], {
      innerWidth: 120,
      measureElementWidth: (element) => element.naturalWidth!,
    });
    expect(row.elementList.map((element) => element.metrics.width)).toEqual([10, 80, 10]);
    expect(row.width).toBe(100);
  });
});

describe('manual first-line indent toolbar state', () => {
  const zw = (extension?: unknown) => ({
    value: '​',
    metrics: { width: 0 },
    ...(extension ? { extension } : {}),
  });

  function drawAt(startIndex: number, main: Array<{ value?: string; extension?: { firstLineIndent?: boolean } | null }>) {
    return {
      getRange: () => ({
        getRange: () => ({ startIndex, endIndex: startIndex }),
        setRange: () => undefined,
      }),
      getOriginalMainElementList: () => main,
      render: () => undefined,
    } as unknown as CanvasDrawInternal;
  }

  it('reports active only for an explicit manual paragraph indent', () => {
    expect(getFirstLineIndentManualActive(drawAt(1, [zw(), { value: 'A' }]))).toBe(false);
    expect(getFirstLineIndentManualActive(drawAt(1, [zw({ firstLineIndent: false }), { value: 'A' }]))).toBe(false);
    expect(getFirstLineIndentManualActive(drawAt(1, [zw({ firstLineIndent: true }), { value: 'A' }]))).toBe(true);
  });

  it('toggles manual indent independently from the automatic global setting', () => {
    const main: Array<{ value?: string; extension?: { firstLineIndent?: boolean } | null }> = [
      zw(),
      { value: 'A' },
    ];
    const draw = drawAt(1, main);

    expect(toggleFirstLineIndentForSelection(draw)).toBe(true);
    expect(main[0]!.extension?.firstLineIndent).toBe(true);

    expect(toggleFirstLineIndentForSelection(draw)).toBe(false);
    expect(main[0]!.extension?.firstLineIndent).toBe(false);
  });
});

describe('installCanvasWordJustificationPatch', () => {
  it('registers a computeRowList hook (no method replacement) that adjusts justified rows', () => {
    const row = {
      width: 120,
      rowFlex: 'alignment',
      elementList: [el('A', 10), el(' ', 5), el('B', 10)],
    };
    let hook: ((rowList: unknown[], payload: unknown) => void) | null = null;
    const draw = {
      setComputeRowListHook: (fn: typeof hook) => { hook = fn; },
      getInnerWidth: () => 120,
      getOptions: () => ({ scale: 1 }),
      getElementFont: () => '13px Crimson Text',
    } as unknown as CanvasDrawInternal;

    installCanvasWordJustificationPatch(draw, {
      measureElementWidth: (element: TestElement) => element.naturalWidth!,
    });

    // O editor chamaria o hook ao final de computeRowList, com as linhas montadas.
    expect(hook).toBeTypeOf('function');
    hook!([row], { innerWidth: 120 });

    expect(row.elementList.map((element) => element.metrics.width)).toEqual([10, 100, 10]);
  });
});

describe('createCachedElementWidthMeasurer', () => {
  it('memoizes repeated width measurements by cache key', () => {
    let calls = 0;
    const measure = createCachedElementWidthMeasurer<TestElement>(
      (element) => {
        calls += 1;
        return element.naturalWidth!;
      },
      (element) => `${element.value}:${element.size ?? ''}`
    );

    expect(measure(el('A', 10, 13))).toBe(10);
    expect(measure(el('A', 99, 13))).toBe(10);
    expect(measure(el('A', 12, 14))).toBe(12);
    expect(calls).toBe(2);
  });
});
