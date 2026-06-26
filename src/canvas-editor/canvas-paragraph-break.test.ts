import { describe, expect, it } from 'vitest';
import { createCanvasParagraphBreakElements, shouldHandleParagraphEnter } from './canvas-paragraph-break';

describe('canvas paragraph break', () => {
  it('maps a normal Enter to one internal paragraph separator, without creating a blank paragraph', () => {
    expect(createCanvasParagraphBreakElements()).toEqual([{ value: '\n' }]);
  });

  it('handles only plain Enter, leaving Shift+Enter as the native soft break', () => {
    expect(shouldHandleParagraphEnter({ key: 'Enter' })).toBe(true);
    expect(shouldHandleParagraphEnter({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldHandleParagraphEnter({ key: 'Enter', metaKey: true })).toBe(false);
    expect(shouldHandleParagraphEnter({ key: 'Enter', ctrlKey: true })).toBe(false);
    expect(shouldHandleParagraphEnter({ key: 'Enter', altKey: true })).toBe(false);
    expect(shouldHandleParagraphEnter({ key: 'a' })).toBe(false);
  });
});
