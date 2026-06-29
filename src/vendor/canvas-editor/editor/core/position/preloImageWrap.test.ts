import { describe, expect, it } from 'vitest';
import {
  resolvePreloImageWrapAction,
  resolvePreloImageWrapBounds,
} from './preloImageWrap';

const baseRow = {
  rowElementRect: { x: 90, y: 40, width: 20, height: 10 },
  rowWidth: 40,
  availableWidth: 220,
  scale: 1,
};

describe('prelo image wrap layout', () => {
  it('uses the PNG alpha bounds instead of the square image box', () => {
    const bounds = resolvePreloImageWrapBounds({
      rowElementRect: { x: 95, y: 50, width: 10, height: 10 },
      surroundRect: { x: 80, y: 40, width: 100, height: 100 },
      scale: 1,
      surroundElement: {
        extension: {
          preloImageWrap: {
            mode: 'png-shape',
            shape: 'png-alpha',
            side: 'right',
            paddingPx: 5,
            pngAlphaContour: {
              width: 100,
              height: 100,
              bandCount: 2,
              hasTransparency: true,
              bands: [
                { top: 0, bottom: 0.5, left: 0.25, right: 0.75, opaque: true },
                { top: 0.5, bottom: 1, left: null, right: null, opaque: false },
              ],
            },
          },
        },
      },
    });

    expect(bounds).toEqual({ left: 100, right: 160 });
  });

  it('jumps text to the right edge for right-side wrap', () => {
    const action = resolvePreloImageWrapAction({
      ...baseRow,
      surroundRect: { x: 100, y: 30, width: 80, height: 80 },
      surroundElement: {
        extension: { preloImageWrap: { mode: 'box', shape: 'box', side: 'right', paddingPx: 10 } },
      },
    });

    expect(action).toEqual({
      kind: 'shift-right',
      x: 190,
      rowElementLeft: 100,
      rowIncreaseWidth: 100,
    });
  });

  it('reduces the row width for left-side wrap without shifting the element', () => {
    const action = resolvePreloImageWrapAction({
      ...baseRow,
      surroundRect: { x: 100, y: 30, width: 80, height: 80 },
      surroundElement: {
        extension: { preloImageWrap: { mode: 'box', shape: 'box', side: 'left', paddingPx: 10 } },
      },
    });

    expect(action).toEqual({
      kind: 'limit-left',
      x: 90,
      availableWidth: 40,
      rowElementLeft: 0,
      rowIncreaseWidth: 0,
    });
  });

  it('chooses the larger readable side when side is largest', () => {
    const action = resolvePreloImageWrapAction({
      rowElementRect: { x: 150, y: 40, width: 20, height: 10 },
      rowWidth: 100,
      availableWidth: 260,
      scale: 1,
      surroundRect: { x: 120, y: 30, width: 70, height: 80 },
      surroundElement: {
        extension: { preloImageWrap: { mode: 'box', shape: 'box', side: 'largest', paddingPx: 0 } },
      },
    });

    expect(action?.kind).toBe('shift-right');
    expect(action).toMatchObject({ x: 190, rowElementLeft: 40, rowIncreaseWidth: 40 });
  });
});
