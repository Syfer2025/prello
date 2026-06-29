import { PT_PER_INCH, PX_PER_INCH } from './prelo-canvas-units';

export interface CanvasHyphenationProfile {
  /** Não tenta hifenizar palavras menores que este tamanho. */
  minWordLength: number;
  /** Mínimo de letras antes do hífen automático. */
  minPrefixLength: number;
  /** Mínimo de letras depois do hífen automático. */
  minSuffixLength: number;
  /** Máximo de linhas seguidas terminando com hífen automático. */
  maxConsecutiveLines: number;
}

export interface CanvasJustificationProfile {
  /** Fração máxima do espaço extra da linha que pode virar tracking intra-palavra. */
  maxLetterExtraShare: number;
  /** Tracking máximo por junção de letras, como fração do corpo da fonte. */
  maxLetterExtraRatio: number;
}

export type CanvasFirstBaselineOffset = 'ascent';

export interface CanvasBaselineGridProfile {
  enabled: boolean;
  /** Offset inicial da grade, em pontos, como BaselineStart do InDesign. */
  startPt: number;
  /** Distância entre linhas de base, em pontos, como BaselineDivision do InDesign. */
  incrementPt: number;
  /** Primeiro baseline do frame. O recorte atual segue o AscentOffset do InDesign. */
  firstBaselineOffset: CanvasFirstBaselineOffset;
  /** Base interna do canvas-editor usada para converter rowMargin em pixels. */
  defaultBasicRowMarginHeightPx: number;
}

export interface CanvasTypographyProfile {
  hyphenation: CanvasHyphenationProfile;
  justification: CanvasJustificationProfile;
  baselineGrid: CanvasBaselineGridProfile;
}

export const PRELO_BOOK_TYPOGRAPHY_PROFILE: CanvasTypographyProfile = {
  hyphenation: {
    minWordLength: 6,
    minPrefixLength: 3,
    minSuffixLength: 3,
    maxConsecutiveLines: 2,
  },
  justification: {
    maxLetterExtraShare: 0.35,
    maxLetterExtraRatio: 0.035,
  },
  baselineGrid: {
    enabled: true,
    startPt: 36,
    incrementPt: 12,
    firstBaselineOffset: 'ascent',
    defaultBasicRowMarginHeightPx: 8,
  },
};

export function baselineGridIncrementPx(profile: CanvasBaselineGridProfile): number {
  return (profile.incrementPt / PT_PER_INCH) * PX_PER_INCH;
}

export function computeBaselineGridRowMargin(
  fontSizePx: number,
  profile: CanvasBaselineGridProfile = PRELO_BOOK_TYPOGRAPHY_PROFILE.baselineGrid
): number {
  if (!profile.enabled || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return 0;
  const incrementPx = baselineGridIncrementPx(profile);
  if (!Number.isFinite(incrementPx) || incrementPx <= 0) return 0;

  const targetLineHeightPx = Math.ceil(fontSizePx / incrementPx) * incrementPx;
  const extraLineHeightPx = Math.max(0, targetLineHeightPx - fontSizePx);
  const rawRowMargin =
    extraLineHeightPx / (profile.defaultBasicRowMarginHeightPx * 2);

  return Math.round(rawRowMargin * 10000) / 10000;
}
