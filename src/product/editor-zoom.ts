export interface FitPageScaleInput {
  stageWidth: number;
  stageHeight: number;
  pageWidth: number;
  pageHeight: number;
  paddingX?: number;
  paddingY?: number;
}

const MIN_MANUAL_ZOOM_SCALE = 0.5;
const MIN_FIT_ZOOM_SCALE = 0.2;
const MAX_ZOOM_SCALE = 3;

export function normalizeZoomScale(scale: number, minScale = MIN_MANUAL_ZOOM_SCALE): number {
  if (!Number.isFinite(scale)) return 1;
  const clamped = Math.max(minScale, Math.min(MAX_ZOOM_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

export function calculateFitPageScale({
  stageWidth,
  stageHeight,
  pageWidth,
  pageHeight,
  paddingX = 80,
  paddingY = 80,
}: FitPageScaleInput): number {
  if (stageWidth <= 0 || stageHeight <= 0 || pageWidth <= 0 || pageHeight <= 0) {
    return 1;
  }

  const availableWidth = Math.max(1, stageWidth - paddingX);
  const availableHeight = Math.max(1, stageHeight - paddingY);
  const fitScale = Math.min(availableWidth / pageWidth, availableHeight / pageHeight, 1);

  return normalizeZoomScale(fitScale, MIN_FIT_ZOOM_SCALE);
}
