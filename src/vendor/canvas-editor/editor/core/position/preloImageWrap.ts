type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PngAlphaBand = {
  top: number;
  bottom: number;
  left: number | null;
  right: number | null;
  opaque: boolean;
};

type PreloImageWrapExtension = {
  mode?: 'box' | 'png-shape';
  shape?: 'box' | 'png-alpha';
  side?: 'both' | 'right' | 'left' | 'largest';
  paddingPx?: number;
  pngAlphaContour?: {
    width?: number;
    height?: number;
    bandCount?: number;
    hasTransparency?: boolean;
    bands?: PngAlphaBand[];
  };
};

type WrapElement = {
  extension?: {
    preloImageWrap?: PreloImageWrapExtension;
  };
};

export type PreloImageWrapAction =
  | {
      kind: 'shift-right';
      x: number;
      rowElementLeft: number;
      rowIncreaseWidth: number;
    }
  | {
      kind: 'limit-left';
      x: number;
      availableWidth: number;
      rowElementLeft: 0;
      rowIncreaseWidth: 0;
    };

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function edgeForBand(
  bands: PngAlphaBand[],
  top: number,
  bottom: number,
  side: 'left' | 'right'
): number | null {
  let edge: number | null = null;
  for (const band of bands) {
    if (!band.opaque) continue;
    const value = band[side];
    if (value === null) continue;
    if (band.bottom <= top || band.top >= bottom) continue;
    edge = edge === null
      ? value
      : side === 'left'
        ? Math.min(edge, value)
        : Math.max(edge, value);
  }
  return edge;
}

export function resolvePreloImageWrapBounds(payload: {
  rowElementRect: Rect;
  surroundRect: Rect;
  surroundElement: WrapElement;
  scale: number;
}): { left: number; right: number } | null {
  const { rowElementRect, surroundRect, surroundElement, scale } = payload;
  const imageWrap = surroundElement.extension?.preloImageWrap;
  const padding = Math.max(0, imageWrap?.paddingPx ?? 0) * scale;
  const paddedRect = {
    x: surroundRect.x - padding,
    y: surroundRect.y - padding,
    width: surroundRect.width + padding * 2,
    height: surroundRect.height + padding * 2,
  };
  if (!intersects(rowElementRect, paddedRect)) return null;

  const shape = imageWrap?.shape ?? (imageWrap?.mode === 'png-shape' ? 'png-alpha' : 'box');
  const contour = imageWrap?.pngAlphaContour;
  const bands = contour?.bands;
  const useAlpha =
    shape === 'png-alpha' &&
    contour?.hasTransparency === true &&
    Array.isArray(bands) &&
    bands.length > 0;

  if (!useAlpha) {
    return {
      left: surroundRect.x - padding,
      right: surroundRect.x + surroundRect.width + padding,
    };
  }

  const top = (rowElementRect.y - surroundRect.y) / surroundRect.height;
  const bottom = (rowElementRect.y + rowElementRect.height - surroundRect.y) / surroundRect.height;

  if (bottom <= 0 || top >= 1) {
    return {
      left: surroundRect.x - padding,
      right: surroundRect.x + surroundRect.width + padding,
    };
  }

  const clampedTop = Math.max(0, top);
  const clampedBottom = Math.min(1, bottom);
  const left = edgeForBand(bands, clampedTop, clampedBottom, 'left');
  const right = edgeForBand(bands, clampedTop, clampedBottom, 'right');
  if (left === null || right === null) return null;

  return {
    left: surroundRect.x + left * surroundRect.width - padding,
    right: surroundRect.x + right * surroundRect.width + padding,
  };
}

export function resolvePreloImageWrapAction(payload: {
  rowElementRect: Rect;
  rowWidth: number;
  availableWidth: number;
  surroundRect: Rect;
  surroundElement: WrapElement;
  scale: number;
}): PreloImageWrapAction | null {
  const bounds = resolvePreloImageWrapBounds(payload);
  if (!bounds) return null;

  const { rowElementRect, rowWidth, availableWidth, surroundElement } = payload;
  const imageWrap = surroundElement.extension?.preloImageWrap;
  const rowStartX = rowElementRect.x - rowWidth;
  const rowEndX = rowStartX + availableWidth;
  const leftSpace = Math.max(0, bounds.left - rowStartX);
  const rightSpace = Math.max(0, rowEndX - bounds.right);
  const requestedSide = imageWrap?.side ?? (imageWrap ? 'largest' : 'both');
  const side = requestedSide === 'largest'
    ? rightSpace >= leftSpace ? 'right' : 'left'
    : requestedSide;

  if (side === 'left') {
    return {
      kind: 'limit-left',
      x: rowElementRect.x,
      availableWidth: leftSpace,
      rowElementLeft: 0,
      rowIncreaseWidth: 0,
    };
  }

  const shiftRight = (): PreloImageWrapAction | null => {
    if (rowElementRect.x >= bounds.right) return null;
    const rowElementLeft = Math.max(0, bounds.right - rowElementRect.x);
    return {
      kind: 'shift-right',
      x: Math.max(rowElementRect.x, bounds.right),
      rowElementLeft,
      rowIncreaseWidth: rowElementLeft,
    };
  };

  if (side === 'right') return shiftRight();
  return shiftRight();
}
