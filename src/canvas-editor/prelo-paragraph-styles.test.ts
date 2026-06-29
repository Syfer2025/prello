import { describe, expect, it } from 'vitest';
import { RowFlex, TitleLevel } from '../vendor/canvas-editor';
import {
  PRELO_PARAGRAPH_STYLE_LIST,
  getPreloParagraphStyle,
  getPreloParagraphStyleCanvasMapping,
  preloStyleToTitleLevel,
  type PreloParagraphStyleId,
} from './prelo-paragraph-styles';

describe('Prelo paragraph styles', () => {
  it('defines stable semantic paragraph style ids for the product layer', () => {
    expect(PRELO_PARAGRAPH_STYLE_LIST.map((style) => style.id)).toEqual([
      'body',
      'chapter',
      'section',
      'subsection',
      'quote',
      'caption',
    ]);
  });

  it('maps semantic styles to the current canvas title/body capability', () => {
    expect(preloStyleToTitleLevel('body')).toBeNull();
    expect(preloStyleToTitleLevel('chapter')).toBe(TitleLevel.FIRST);
    expect(preloStyleToTitleLevel('section')).toBe(TitleLevel.SECOND);
    expect(preloStyleToTitleLevel('subsection')).toBe(TitleLevel.THIRD);
    expect(preloStyleToTitleLevel('quote')).toBeNull();
    expect(preloStyleToTitleLevel('caption')).toBeNull();
  });

  it('keeps labels and descriptions with the style definitions instead of hard-coding UI copy', () => {
    const style = getPreloParagraphStyle('chapter');
    expect(style.label).toBe('Capítulo');
    expect(style.description.length).toBeGreaterThan(0);
  });

  it('defines deterministic canvas formatting for semantic body, quote and caption styles', () => {
    expect(getPreloParagraphStyleCanvasMapping('body')).toEqual({
      titleLevel: null,
      fontSize: 13,
      rowFlex: RowFlex.ALIGNMENT,
      baselineGrid: true,
      rowMargin: 0.1875,
    });
    expect(getPreloParagraphStyleCanvasMapping('quote')).toEqual({
      titleLevel: null,
      fontSize: 12,
      rowFlex: RowFlex.LEFT,
      baselineGrid: true,
      rowMargin: 0.25,
    });
    expect(getPreloParagraphStyleCanvasMapping('caption')).toEqual({
      titleLevel: null,
      fontSize: 11,
      rowFlex: RowFlex.CENTER,
      rowMargin: 4,
    });
  });

  it('centers chapter titles through the semantic style mapping', () => {
    expect(getPreloParagraphStyleCanvasMapping('chapter')).toMatchObject({
      titleLevel: TitleLevel.FIRST,
      rowFlex: RowFlex.CENTER,
    });
  });

  it('fails loudly for unknown style ids at integration boundaries', () => {
    expect(() => getPreloParagraphStyle('unknown' as PreloParagraphStyleId)).toThrow(
      'Unknown Prelo paragraph style: unknown'
    );
  });
});
