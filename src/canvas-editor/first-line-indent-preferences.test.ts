import { describe, expect, it } from 'vitest';
import {
  FIRST_LINE_INDENT_AUTO_STORAGE_KEY,
  FIRST_LINE_INDENT_MM_STORAGE_KEY,
  loadFirstLineIndentAuto,
  loadFirstLineIndentMm,
  saveFirstLineIndentAuto,
  saveFirstLineIndentMm,
} from './first-line-indent-preferences';

function createStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('first-line indent preferences', () => {
  it('defaults automatic first-line indent to off', () => {
    expect(loadFirstLineIndentAuto(createStore())).toBe(false);
  });

  it('ignores the old auto-indent preference key that defaulted too aggressively', () => {
    expect(loadFirstLineIndentAuto(createStore({ 'prelo-fli-auto': 'true' }))).toBe(false);
  });

  it('loads and saves the versioned auto-indent preference explicitly', () => {
    const store = createStore({ [FIRST_LINE_INDENT_AUTO_STORAGE_KEY]: 'true' });

    expect(loadFirstLineIndentAuto(store)).toBe(true);
    saveFirstLineIndentAuto(store, false);
    expect(store.getItem(FIRST_LINE_INDENT_AUTO_STORAGE_KEY)).toBe('false');
    expect(loadFirstLineIndentAuto(store)).toBe(false);
  });

  it('loads and saves the indent size in millimeters', () => {
    const store = createStore({ [FIRST_LINE_INDENT_MM_STORAGE_KEY]: '9' });

    expect(loadFirstLineIndentMm(store)).toBe(9);
    saveFirstLineIndentMm(store, 12);
    expect(store.getItem(FIRST_LINE_INDENT_MM_STORAGE_KEY)).toBe('12');
  });
});
