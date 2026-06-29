/**
 * Reflow de texto COLADO para o corpo justificado do Prelo.
 *
 * Problema (validado no motor e ao vivo): texto colado de PDF/Word/txt costuma
 * vir com uma QUEBRA DE LINHA DURA (\n) no fim de cada linha visual. No
 * canvas-editor, cada linha terminada por quebra dura vira um "fim de parágrafo":
 * `Draw.ts` só justifica linhas com `isWidthNotEnough` (que transbordaram e
 * quebraram sozinhas) — e `isWidthNotEnough = ... && !isForceBreak`. Resultado:
 * NENHUMA linha colada justifica, nem aplicando "Justificar".
 *
 * Solução: ao colar, JUNTAMOS as linhas quebradas de volta em parágrafos de
 * verdade (quebra simples = continuação → vira espaço; linha em branco ou
 * marcador de lista/título = novo parágrafo). O texto então reflui, faz
 * soft-wrap e justifica como o resto do corpo.
 *
 * `reflowPastedText` e `buildBodyParagraphElements` são puros e testáveis.
 * `installCanvasPasteReflow` instala o override `editor.override.paste`.
 */
import { RowFlex, type IElement } from '../vendor/canvas-editor';

export interface PasteReflowBodyStyle {
  font: string;
  size: number;
  rowFlex: RowFlex;
  rowMargin?: number;
}

/** Início de um novo bloco: lista numerada, bullet ou "Capítulo N". */
const LIST_OR_HEADING_RE = /^(\d+[.)]\s|[-*•·–—]\s|cap[ií]tulo\s+\d+\b)/i;

/**
 * Junta linhas quebradas por quebra dura em parágrafos. Linha em branco encerra
 * o parágrafo; uma linha que começa um bloco (lista/título) também. Dentro de um
 * parágrafo, as quebras viram um único espaço (espaços colapsados).
 */
export function reflowPastedText(raw: string): string[] {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const paragraphs: string[] = [];
  let current = '';

  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
    current = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (current !== '' && LIST_OR_HEADING_RE.test(line)) flush();
    current = current === '' ? line : `${current} ${line}`;
  }
  flush();
  return paragraphs;
}

/**
 * Constrói os elementos do canvas-editor para os parágrafos, com o estilo do
 * corpo (justificado). Cada caractere é um elemento (como o motor espera) e os
 * parágrafos são separados por um elemento de quebra `{ value: '\n' }`.
 */
export function buildBodyParagraphElements(
  paragraphs: string[],
  style: PasteReflowBodyStyle
): IElement[] {
  const elements: IElement[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) elements.push({ value: '\n' } as IElement);
    for (const value of paragraph) {
      const element = {
        value,
        font: style.font,
        size: style.size,
        rowFlex: style.rowFlex,
      } as IElement;
      if (style.rowMargin !== undefined) element.rowMargin = style.rowMargin;
      elements.push(element);
    }
  });
  return elements;
}

/** Extrai texto puro do clipboard. `null` = não é colagem de texto (imagem/arquivo). */
export function extractPlainText(evt?: ClipboardEvent): string | null {
  const data = evt?.clipboardData;
  if (!data) return null;
  if (data.files && data.files.length > 0) return null;
  const plain = data.getData('text/plain') || data.getData('text');
  if (plain && plain.trim()) return plain;
  const html = data.getData('text/html');
  if (html && html.trim()) return htmlToPlainText(html);
  return null;
}

function htmlToPlainText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr')
    .forEach((el) => el.append('\n\n'));
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
  return doc.body?.textContent ?? '';
}

interface PasteReflowEditor {
  override: { paste?: (evt?: ClipboardEvent) => unknown };
  command: { executeInsertElementList: (list: IElement[]) => void };
}

/**
 * Instala o override de colagem que reflui o texto para o corpo justificado.
 * Retorna a função de desinstalação (restaura o override anterior).
 */
export function installCanvasPasteReflow(
  editor: PasteReflowEditor,
  getBodyStyle: () => PasteReflowBodyStyle
): () => void {
  const previous = editor.override.paste;
  editor.override.paste = (evt?: ClipboardEvent) => {
    const text = extractPlainText(evt);
    // Sem texto (imagem/arquivo, ou colagem via API sem evento): mantém o padrão.
    if (text === null) return previous ? previous(evt) : { preventDefault: false };
    const paragraphs = reflowPastedText(text);
    if (paragraphs.length === 0) return { preventDefault: false };
    editor.command.executeInsertElementList(buildBodyParagraphElements(paragraphs, getBodyStyle()));
    return { preventDefault: true };
  };
  return () => {
    editor.override.paste = previous;
  };
}
