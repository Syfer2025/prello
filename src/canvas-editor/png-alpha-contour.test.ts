import { describe, expect, it } from 'vitest';
import {
  computePngAlphaContour,
  getPngContourLeftEdgeForBand,
  getPngContourRightEdgeForBand,
} from './png-alpha-contour';

function rgba(width: number, height: number, alphaFor: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = alphaFor(x, y);
    }
  }
  return data;
}

describe('png alpha contour', () => {
  it('mede a borda direita opaca por faixas verticais do PNG', () => {
    const contour = computePngAlphaContour({
      width: 4,
      height: 4,
      data: rgba(4, 4, (x, y) => {
        if (y === 0 || y === 3) return 0;
        return x <= y ? 255 : 0;
      }),
    }, { bandCount: 4 });

    expect(contour.hasTransparency).toBe(true);
    expect(contour.bands.map((band) => band.right)).toEqual([
      null,
      0.5,
      0.75,
      null,
    ]);
    expect(getPngContourLeftEdgeForBand(contour, 0.25, 0.75)).toBe(0);
    expect(getPngContourRightEdgeForBand(contour, 0.25, 0.75)).toBe(0.75);
    expect(getPngContourRightEdgeForBand(contour, 0, 0.25)).toBeNull();
  });
});
