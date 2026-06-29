import { describe, expect, it } from 'vitest';
import {
  PRELO_BOOK_TYPOGRAPHY_PROFILE,
  baselineGridIncrementPx,
  computeBaselineGridRowMargin,
} from './canvas-typography-profile';

describe('PRELO_BOOK_TYPOGRAPHY_PROFILE', () => {
  it('centralizes conservative book typography limits for PT-BR layout', () => {
    expect(PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation).toEqual({
      minWordLength: 6,
      minPrefixLength: 3,
      minSuffixLength: 3,
      maxConsecutiveLines: 2,
    });
    expect(PRELO_BOOK_TYPOGRAPHY_PROFILE.justification).toEqual({
      maxLetterExtraShare: 0.35,
      maxLetterExtraRatio: 0.035,
    });
    expect(PRELO_BOOK_TYPOGRAPHY_PROFILE.baselineGrid).toEqual({
      enabled: true,
      startPt: 36,
      incrementPt: 12,
      firstBaselineOffset: 'ascent',
      defaultBasicRowMarginHeightPx: 8,
    });
  });

  it('converts the InDesign-like 12pt baseline division into canvas pixels', () => {
    expect(baselineGridIncrementPx(PRELO_BOOK_TYPOGRAPHY_PROFILE.baselineGrid)).toBe(16);
  });

  it('derives canvas row margins that snap body text to the baseline grid increment', () => {
    expect(computeBaselineGridRowMargin(13)).toBeCloseTo(0.1875, 4);
    expect(computeBaselineGridRowMargin(12)).toBeCloseTo(0.25, 4);
    expect(computeBaselineGridRowMargin(16)).toBe(0);
    expect(computeBaselineGridRowMargin(20)).toBeCloseTo(0.75, 4);
  });
});
