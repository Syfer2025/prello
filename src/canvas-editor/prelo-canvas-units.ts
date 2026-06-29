import type { PreloCanvasBookPreset } from './prelo-canvas-types';

export const PX_PER_INCH = 96;
export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * PX_PER_INCH);
}

export function pxToMm(px: number): number {
  return (px / PX_PER_INCH) * MM_PER_INCH;
}

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

export function pxToPt(px: number): number {
  return (px / PX_PER_INCH) * PT_PER_INCH;
}

export const PRELO_CANVAS_PRESETS = {
  a5: {
    id: 'a5',
    label: 'A5',
    widthMm: 148,
    heightMm: 210,
    marginsMm: { top: 17, bottom: 17, inside: 17, outside: 14 },
  },
  sixByNine: {
    id: '6x9',
    label: '6 x 9 in',
    widthMm: 152.4,
    heightMm: 228.6,
    marginsMm: { top: 19, bottom: 19, inside: 19, outside: 16 },
  },
} as const satisfies Record<string, PreloCanvasBookPreset>;

export const PRELO_CANVAS_PRESET_LIST: PreloCanvasBookPreset[] = [
  PRELO_CANVAS_PRESETS.a5,
  PRELO_CANVAS_PRESETS.sixByNine,
];
