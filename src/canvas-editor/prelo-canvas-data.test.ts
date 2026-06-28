import { ElementType } from '../vendor/canvas-editor';
import { describe, expect, it } from 'vitest';
import {
  buildCanvasDocument,
  canvasMarginsFromPreset,
  canvasOptionsForPreset,
} from './prelo-canvas-data';
import {
  mmToPt,
  mmToPx,
  pxToPt,
  PRELO_CANVAS_PRESET_LIST,
  PRELO_CANVAS_PRESETS,
} from './prelo-canvas-units';

describe('prelo canvas units', () => {
  it('converts A5 dimensions to stable canvas pixels', () => {
    expect(mmToPx(PRELO_CANVAS_PRESETS.a5.widthMm)).toBe(559);
    expect(mmToPx(PRELO_CANVAS_PRESETS.a5.heightMm)).toBe(794);
  });

  it('converts mm to pdf points without rounding', () => {
    expect(mmToPt(25.4)).toBe(72);
  });

  it('converts canvas pixels to pdf points', () => {
    expect(pxToPt(96)).toBe(72);
  });

  it('exports an ordered preset list for UI controls', () => {
    expect(PRELO_CANVAS_PRESET_LIST.map((preset) => preset.id)).toEqual(['a5', '6x9']);
  });
});

describe('prelo canvas data', () => {
  it('inserts page breaks before chapter headings, including chapter 1 after title page', () => {
    const built = buildCanvasDocument({
      title: 'Livro',
      preset: PRELO_CANVAS_PRESETS.a5,
      manuscript: 'Capitulo 1\n\nTexto.\n\nCapítulo 2\n\nOutro texto.',
    });

    const pageBreakCount = built.data.main.filter(
      (element) => element.type === ElementType.PAGE_BREAK
    ).length;
    expect(pageBreakCount).toBe(2);
  });

  it('builds A5 paging options with margins in canvas order', () => {
    const built = buildCanvasDocument({
      title: 'Livro',
      preset: PRELO_CANVAS_PRESETS.a5,
      manuscript: 'Texto',
    });

    expect(built.options.pageMode).toBe('paging');
    expect(built.options.width).toBe(559);
    expect(built.options.height).toBe(794);
    expect(built.options.margins).toEqual([64, 53, 64, 64]);
  });

  it('keeps preset conversion reusable for shell controls', () => {
    expect(canvasMarginsFromPreset(PRELO_CANVAS_PRESETS.a5)).toEqual([64, 53, 64, 64]);
    expect(canvasOptionsForPreset(PRELO_CANVAS_PRESETS.sixByNine)).toMatchObject({
      width: 576,
      height: 864,
      pageMode: 'paging',
    });
  });
});
