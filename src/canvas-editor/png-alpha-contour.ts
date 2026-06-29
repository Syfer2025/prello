export interface PngAlphaContourBand {
  top: number;
  bottom: number;
  left: number | null;
  right: number | null;
  opaque: boolean;
}

export interface PngAlphaContour {
  width: number;
  height: number;
  bandCount: number;
  hasTransparency: boolean;
  bands: PngAlphaContourBand[];
}

export interface PngAlphaContourInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PngAlphaContourOptions {
  bandCount?: number;
  alphaThreshold?: number;
}

export type PreloImageWrapSide = 'both' | 'right' | 'left' | 'largest';
export type PreloImageWrapShape = 'box' | 'png-alpha';

export interface PreloImageWrapExtension {
  mode: 'box' | 'png-shape';
  shape?: PreloImageWrapShape;
  side?: PreloImageWrapSide;
  paddingPx: number;
  paddingMm?: number;
  pngAlphaContour?: PngAlphaContour;
}

const DEFAULT_BAND_COUNT = 64;
const DEFAULT_ALPHA_THRESHOLD = 16;
const DEFAULT_WRAP_PADDING_PX = 8;

export function computePngAlphaContour(
  input: PngAlphaContourInput,
  options: PngAlphaContourOptions = {}
): PngAlphaContour {
  const bandCount = Math.max(1, Math.min(options.bandCount ?? DEFAULT_BAND_COUNT, input.height));
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  const bands: PngAlphaContourBand[] = [];
  let hasTransparency = false;

  for (let bandIndex = 0; bandIndex < bandCount; bandIndex++) {
    const yStart = Math.floor((bandIndex * input.height) / bandCount);
    const yEnd = Math.max(yStart + 1, Math.ceil(((bandIndex + 1) * input.height) / bandCount));
    let left: number | null = null;
    let right: number | null = null;

    for (let y = yStart; y < yEnd && y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const alpha = input.data[(y * input.width + x) * 4 + 3] ?? 0;
        if (alpha < alphaThreshold) {
          hasTransparency = true;
          continue;
        }
        left = left === null ? x : Math.min(left, x);
        right = right === null ? x : Math.max(right, x);
      }
    }

    bands.push({
      top: yStart / input.height,
      bottom: Math.min(yEnd, input.height) / input.height,
      left: left === null ? null : left / input.width,
      right: right === null ? null : (right + 1) / input.width,
      opaque: left !== null && right !== null,
    });
  }

  return {
    width: input.width,
    height: input.height,
    bandCount,
    hasTransparency,
    bands,
  };
}

export function getPngContourRightEdgeForBand(
  contour: PngAlphaContour,
  top: number,
  bottom: number
): number | null {
  let right: number | null = null;
  for (const band of contour.bands) {
    if (!band.opaque || band.right === null) continue;
    if (band.bottom <= top || band.top >= bottom) continue;
    right = right === null ? band.right : Math.max(right, band.right);
  }
  return right;
}

export function getPngContourLeftEdgeForBand(
  contour: PngAlphaContour,
  top: number,
  bottom: number
): number | null {
  let left: number | null = null;
  for (const band of contour.bands) {
    if (!band.opaque || band.left === null) continue;
    if (band.bottom <= top || band.top >= bottom) continue;
    left = left === null ? band.left : Math.min(left, band.left);
  }
  return left;
}

export function createPreloImageWrapExtension(
  pngAlphaContour: PngAlphaContour | null,
  mode?: PreloImageWrapExtension['mode']
): PreloImageWrapExtension {
  const resolvedMode = mode ?? (pngAlphaContour?.hasTransparency ? 'png-shape' : 'box');
  const shape = resolvedMode === 'png-shape' ? 'png-alpha' : 'box';
  return {
    mode: resolvedMode,
    shape,
    side: 'largest',
    paddingPx: DEFAULT_WRAP_PADDING_PX,
    ...(pngAlphaContour ? { pngAlphaContour } : {}),
  };
}

export async function createPngAlphaContourFromDataUrl(
  dataUrl: string,
  options: PngAlphaContourOptions = {}
): Promise<PngAlphaContour | null> {
  if (!dataUrl.startsWith('data:image/png')) return null;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Nao foi possivel analisar a transparencia do PNG.'));
  });
  image.src = dataUrl;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return null;

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const contour = computePngAlphaContour({
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  }, options);

  return contour.hasTransparency ? contour : null;
}
