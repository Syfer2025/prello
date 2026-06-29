import { describe, expect, it } from 'vitest';
import {
  AUTO_HYPHEN_VALUE,
  candidateHyphenOffsets,
  stripAutoHyphens,
} from './canvas-hyphenation';
import { PRELO_BOOK_TYPOGRAPHY_PROFILE } from './canvas-typography-profile';
import type { CanvasDrawInternal } from './canvas-draw-internal';

interface El {
  value: string;
  extension?: { autoHyphen?: boolean } | null;
}

/** Draw falso: só precisamos de getOriginalMainElementList para stripAutoHyphens. */
function fakeDraw(list: El[]): CanvasDrawInternal {
  return { getOriginalMainElementList: () => list } as unknown as CanvasDrawInternal;
}

function el(value: string): El {
  return { value };
}
function autoHyphen(): El {
  return { value: AUTO_HYPHEN_VALUE, extension: { autoHyphen: true } };
}

describe('stripAutoHyphens', () => {
  it('remove apenas elementos marcados com extension.autoHyphen', () => {
    const list = [el('i'), el('m'), autoHyphen(), el('p'), el('é'), el('-'), el('r')];
    const draw = fakeDraw(list);
    const result = stripAutoHyphens(draw);
    expect(result.removedAny).toBe(true);
    // o "-" literal (sem extension.autoHyphen) NÃO é removido
    expect(list.map((e) => e.value).join('')).toBe('impé-r');
    expect(list.some((e) => e.extension?.autoHyphen)).toBe(false);
  });

  it('preserva a ordem e não toca em texto normal', () => {
    const list = [el('a'), el('b'), el('c')];
    const result = stripAutoHyphens(fakeDraw(list));
    expect(result.removedAny).toBe(false);
    expect(result.shiftDelta).toBe(0);
    expect(list.map((e) => e.value).join('')).toBe('abc');
  });

  it('calcula o deslocamento do cursor (hífens removidos antes do caret)', () => {
    // índices:    0     1            2     3            4     5
    const list = [el('a'), autoHyphen(), el('b'), autoHyphen(), el('c'), el('d')];
    // caret em 5 (após "d"): há 2 auto-hífens antes dele -> shift -2
    const result = stripAutoHyphens(fakeDraw(list), 5);
    expect(result.shiftDelta).toBe(-2);
    expect(list.map((e) => e.value).join('')).toBe('abcd');
  });

  it('só conta hífens ANTES do caret para o deslocamento', () => {
    const list = [el('a'), autoHyphen(), el('b'), autoHyphen()];
    // caret em 1 (após "a"): só o hífen no índice 1 está antes? não — índice 1 não é < 1.
    const result = stripAutoHyphens(fakeDraw(list), 1);
    expect(result.shiftDelta).toBe(0);
    expect(list.map((e) => e.value).join('')).toBe('ab');
  });
});

describe('applyHyphenation', () => {
  it('filters candidate hyphen points through the book typography profile', () => {
    const word = 'extraordinariamente';
    const offsets = candidateHyphenOffsets(word, PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation);

    expect(offsets.length).toBeGreaterThan(0);
    expect(offsets.every((offset) => offset >= PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation.minPrefixLength)).toBe(true);
    expect(offsets.every((offset) => word.length - offset >= PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation.minSuffixLength)).toBe(true);
  });

  it('does not offer automatic hyphen points for words shorter than the profile minimum', () => {
    expect(candidateHyphenOffsets('casa', PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation)).toEqual([]);
  });

  it('does not mutate or render while a real text selection is active', async () => {
    const { applyHyphenation } = await import('./canvas-hyphenation');
    const list = [el('a'), autoHyphen(), el('b')];
    const draw = {
      getRange: () => ({
        getRange: () => ({ startIndex: 0, endIndex: 2 }),
      }),
      getOriginalMainElementList: () => list,
      render: () => {
        throw new Error('render should not run with active selection');
      },
    } as unknown as CanvasDrawInternal;

    expect(applyHyphenation(draw)).toBe(0);
    expect(list.map((e) => e.value).join('')).toBe('a-b');
    expect(list[1]!.extension?.autoHyphen).toBe(true);
  });
});
