import { describe, expect, it } from 'vitest';
import { createPlainTextPasteElements } from './canvas-clipboard-normalization';

describe('canvas clipboard normalization', () => {
  it('turns pasted text into clean canvas elements without inherited color styles', () => {
    const elements = createPlainTextPasteElements('Texto visivel\nNova linha', {
      font: 'Crimson Text',
      size: 13,
    });

    expect(elements.map((element) => element.value).join('')).toBe('Texto visivel\nNova linha');
    expect(elements).toHaveLength('Texto visivel\nNova linha'.length);
    expect(elements.every((element) => element.font === 'Crimson Text')).toBe(true);
    expect(elements.every((element) => element.size === 13)).toBe(true);
    expect(elements.some((element) => 'color' in element)).toBe(false);
    expect(elements.some((element) => 'highlight' in element)).toBe(false);
  });

  it('normalizes Windows and old Mac line endings before insertion', () => {
    const elements = createPlainTextPasteElements('A\r\nB\rC');

    expect(elements.map((element) => element.value).join('')).toBe('A\nB\nC');
  });
});
