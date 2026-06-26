import { describe, expect, it } from 'vitest';
import {
  bookLayoutSettingsFromPreset,
  canvasMarginsFromBookLayout,
  canvasOptionsForBookLayout,
  hasInexactMirroredMarginPreview,
  type BookLayoutSettings,
} from './book-layout-settings';
import { PRELO_CANVAS_PRESETS } from './prelo-canvas-units';

describe('book layout settings', () => {
  it('derives source-of-truth book settings from a Canvas preset', () => {
    const settings = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);

    expect(settings).toEqual({
      trimId: 'a5',
      label: 'A5',
      widthMm: 148,
      heightMm: 210,
      marginsMm: {
        top: 17,
        bottom: 17,
        inside: 17,
        outside: 14,
      },
      facingPages: false,
      chapterStart: 'nextPage',
    });
  });

  it('maps book inside/outside margins into the single global Canvas margin tuple', () => {
    const settings: BookLayoutSettings = {
      trimId: 'custom',
      label: 'Custom',
      widthMm: 140,
      heightMm: 210,
      marginsMm: {
        top: 10,
        bottom: 12,
        inside: 20,
        outside: 15,
      },
      facingPages: false,
      chapterStart: 'nextPage',
    };

    expect(canvasMarginsFromBookLayout(settings)).toEqual([38, 57, 45, 76]);
  });

  it('builds Canvas page options from book settings', () => {
    const settings = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);

    expect(canvasOptionsForBookLayout(settings)).toMatchObject({
      width: 559,
      height: 794,
      margins: [64, 53, 64, 64],
      pageMode: 'paging',
    });
  });

  it('flags mirrored margin preview only when facing pages would need different left/right margins', () => {
    const base = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);

    expect(hasInexactMirroredMarginPreview(base)).toBe(false);
    expect(hasInexactMirroredMarginPreview({ ...base, facingPages: true })).toBe(true);
    expect(
      hasInexactMirroredMarginPreview({
        ...base,
        facingPages: true,
        marginsMm: {
          top: 17,
          bottom: 17,
          inside: 17,
          outside: 17,
        },
      })
    ).toBe(false);
  });
});
