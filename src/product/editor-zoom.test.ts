import { describe, expect, it } from 'vitest';
import { calculateFitPageScale, normalizeZoomScale } from './editor-zoom';

describe('editor zoom controls', () => {
  it('calculates a fit scale that keeps the full page visible inside the stage', () => {
    expect(calculateFitPageScale({
      stageWidth: 752,
      stageHeight: 760,
      pageWidth: 559,
      pageHeight: 794,
      paddingX: 80,
      paddingY: 80,
    })).toBe(0.86);
  });

  it('does not zoom above 100% for the automatic responsive fit', () => {
    expect(calculateFitPageScale({
      stageWidth: 1800,
      stageHeight: 1400,
      pageWidth: 559,
      pageHeight: 794,
      paddingX: 80,
      paddingY: 80,
    })).toBe(1);
  });

  it('allows responsive fit below the manual zoom minimum on narrow screens', () => {
    expect(calculateFitPageScale({
      stageWidth: 212,
      stageHeight: 574,
      pageWidth: 559,
      pageHeight: 794,
      paddingX: 80,
      paddingY: 80,
    })).toBe(0.24);
  });

  it('normalizes manual zoom values to the supported editor range', () => {
    expect(normalizeZoomScale(0.1)).toBe(0.5);
    expect(normalizeZoomScale(1.25)).toBe(1.25);
    expect(normalizeZoomScale(4)).toBe(3);
  });
});
