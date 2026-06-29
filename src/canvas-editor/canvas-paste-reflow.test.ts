import { describe, expect, it } from 'vitest';
import { RowFlex } from '../vendor/canvas-editor';
import {
  buildBodyParagraphElements,
  reflowPastedText,
  type PasteReflowBodyStyle,
} from './canvas-paste-reflow';

const BODY: PasteReflowBodyStyle = {
  font: 'Crimson Text',
  size: 13,
  rowFlex: RowFlex.ALIGNMENT,
  rowMargin: 0.1875,
};

describe('reflowPastedText', () => {
  it('joins hard-wrapped lines into a single flowing paragraph', () => {
    const raw =
      'Esta primeira linha foi quebrada\n' +
      'no meio por uma quebra dura\n' +
      'mas e um paragrafo so.';
    expect(reflowPastedText(raw)).toEqual([
      'Esta primeira linha foi quebrada no meio por uma quebra dura mas e um paragrafo so.',
    ]);
  });

  it('splits paragraphs on blank lines', () => {
    const raw = 'Primeiro paragrafo\ncom duas linhas.\n\nSegundo paragrafo aqui.';
    expect(reflowPastedText(raw)).toEqual([
      'Primeiro paragrafo com duas linhas.',
      'Segundo paragrafo aqui.',
    ]);
  });

  it('starts a new paragraph at numbered, bullet and chapter markers', () => {
    const raw =
      '21. Primeiro ponto que\nquebra em duas linhas\n' +
      '22. Segundo ponto\n' +
      '- bullet aqui\n' +
      'Capitulo 3';
    expect(reflowPastedText(raw)).toEqual([
      '21. Primeiro ponto que quebra em duas linhas',
      '22. Segundo ponto',
      '- bullet aqui',
      'Capitulo 3',
    ]);
  });

  it('collapses whitespace and ignores empty input', () => {
    expect(reflowPastedText('   \n\n   \n')).toEqual([]);
    expect(reflowPastedText('palavra   com    espacos')).toEqual(['palavra com espacos']);
  });

  it('normalizes CRLF and CR line endings', () => {
    expect(reflowPastedText('linha um\r\nlinha dois\rfim')).toEqual(['linha um linha dois fim']);
  });
});

describe('buildBodyParagraphElements', () => {
  it('emits one element per char with the justified body style', () => {
    const els = buildBodyParagraphElements(['ab'], BODY);
    expect(els).toHaveLength(2);
    expect(els[0]).toMatchObject({ value: 'a', font: 'Crimson Text', size: 13, rowFlex: RowFlex.ALIGNMENT });
    expect((els[0] as { rowMargin?: number }).rowMargin).toBe(0.1875);
  });

  it('separates paragraphs with a single newline break element', () => {
    const els = buildBodyParagraphElements(['ab', 'cd'], BODY);
    expect(els.map((e) => e.value)).toEqual(['a', 'b', '\n', 'c', 'd']);
    // a quebra de parágrafo não carrega estilo de corpo
    const br = els[2] as { rowFlex?: RowFlex };
    expect(br.rowFlex).toBeUndefined();
  });

  it('produces no elements for an empty paragraph list', () => {
    expect(buildBodyParagraphElements([], BODY)).toEqual([]);
  });

  it('omits rowMargin when the style has none', () => {
    const els = buildBodyParagraphElements(['x'], { ...BODY, rowMargin: undefined });
    expect('rowMargin' in (els[0] as object)).toBe(false);
  });
});
