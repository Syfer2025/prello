/**
 * Hifenização automática em português DENTRO do canvas-editor.
 *
 * Estratégia (validada em runtime, não é predição):
 *  - Inserimos um HÍFEN REAL "-" como elemento do `mainElementList` num ponto de
 *    sílaba. O canvas-editor então quebra a linha DEPOIS do "-" (LETTER_REG não
 *    inclui "-", então a parte pós-hífen vira uma "palavra" nova e transborda),
 *    deixando o hífen no fim da linha. Como o "-" é elemento REAL, o
 *    `positionList` continua paralelo ao `mainElementList` (cursor/seleção não
 *    quebram — inserir glifo SINTÉTICO numa row quebraria).
 *  - Detecção de "linha frouxa" é ESPECULATIVA: tentamos puxar uma sílaba da
 *    próxima linha; se o "-" terminar a linha anterior, a linha tinha folga
 *    (o motor é a fonte da verdade — não medimos nada).
 *  - Todo hífen é marcado com `extension.autoHyphen` para remoção total/segura
 *    antes de salvar/buscar/copiar, e re-derivado por reflow.
 *
 * Tudo aqui é fail-safe: erro → o chamador limpa os hífens e desliga a feature.
 * Ver memória prelo-canvas-wysiwyg-serialization.
 */
import Hypher from 'hypher';
import pt from 'hyphenation.pt';
import type { CanvasDrawInternal } from './canvas-draw-internal';
import {
  PRELO_BOOK_TYPOGRAPHY_PROFILE,
  type CanvasHyphenationProfile,
} from './canvas-typography-profile';

export const AUTO_HYPHEN_VALUE = '-';

/** Letras (inclui acentos PT) para caminhar palavras. */
const PT_LETTER = /[A-Za-zªºÀ-ÖØ-öø-ÿ]/;
/** Trava dura contra loop (muito acima de qualquer página real). */
const HARD_SAFETY = 2000;

let hypher: Hypher | null = null;
function getHyphenator(): Hypher {
  return (hypher ??= new Hypher(pt));
}

interface RawElement {
  value: string;
  type?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  highlight?: string;
  rowFlex?: string;
  letterSpacing?: number;
  extension?: { autoHyphen?: boolean } | null;
}

interface RawRow {
  startIndex: number;
  width: number;
  rowFlex?: string;
  elementList: RawElement[];
}

function isAutoHyphen(el: RawElement | undefined): boolean {
  return !!el && el.value === AUTO_HYPHEN_VALUE && !!el.extension && el.extension.autoHyphen === true;
}

function isJustified(flex: string | undefined): boolean {
  return flex === 'justify' || flex === 'alignment';
}

function rowFlexOf(row: RawRow): string | undefined {
  if (row.rowFlex) return row.rowFlex;
  for (const el of row.elementList) if (el.rowFlex) return el.rowFlex;
  return undefined;
}

function lastVisible(row: RawRow): RawElement | undefined {
  // ignora zero-width inicial; retorna o último elemento real da row
  return row.elementList[row.elementList.length - 1];
}

/**
 * Remove TODOS os hífens automáticos do mainElementList (in place). Não renderiza
 * (o chamador controla o render para restaurar o cursor atomicamente).
 * Se `caretIndex` for passado, retorna quanto o cursor deslocou (cada remoção
 * antes do cursor o move -1).
 */
export function stripAutoHyphens(
  draw: CanvasDrawInternal,
  caretIndex?: number
): { removedAny: boolean; shiftDelta: number } {
  const list = draw.getOriginalMainElementList() as unknown as RawElement[];
  let removed = 0;
  let shift = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (isAutoHyphen(list[i])) {
      list.splice(i, 1);
      removed += 1;
      if (caretIndex !== undefined && i < caretIndex) shift -= 1;
    }
  }
  return { removedAny: removed > 0, shiftDelta: shift };
}

function makeHyphen(neighbor: RawElement | undefined): RawElement {
  const el: RawElement = { value: AUTO_HYPHEN_VALUE, extension: { autoHyphen: true } };
  if (neighbor) {
    if (neighbor.font !== undefined) el.font = neighbor.font;
    if (neighbor.size !== undefined) el.size = neighbor.size;
    if (neighbor.bold !== undefined) el.bold = neighbor.bold;
    if (neighbor.italic !== undefined) el.italic = neighbor.italic;
    if (neighbor.color !== undefined) el.color = neighbor.color;
    if (neighbor.highlight !== undefined) el.highlight = neighbor.highlight;
    if (neighbor.rowFlex !== undefined) el.rowFlex = neighbor.rowFlex;
    if (neighbor.letterSpacing !== undefined) el.letterSpacing = neighbor.letterSpacing;
  }
  return el;
}

/** Offsets de quebra de sílaba (cumulativos), filtrados pelo perfil editorial. */
export function candidateHyphenOffsets(
  word: string,
  profile: CanvasHyphenationProfile = PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation
): number[] {
  if (word.length < profile.minWordLength) return [];
  const parts = getHyphenator().hyphenate(word);
  if (parts.length < 2) return [];
  const offsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += parts[i]!.length;
    if (acc >= profile.minPrefixLength && word.length - acc >= profile.minSuffixLength) {
      offsets.push(acc);
    }
  }
  return offsets;
}

function renderReflow(draw: CanvasDrawInternal): void {
  (draw as unknown as { render: (o: unknown) => void }).render({
    isCompute: true,
    isSubmitHistory: false,
    isSetCursor: false,
  });
}

/**
 * Insere hífens automáticos onde melhoram a justificação. Cursor-safe e
 * idempotente (limpa stale antes). Retorna nº de hífens inseridos.
 *
 * Pré-condição do chamador: deve estar protegido por flag de re-entrância e
 * try/catch (ver CanvasEditorHost). NÃO faz nada se houver seleção real ativa.
 */
export function applyHyphenation(
  draw: CanvasDrawInternal,
  profile: CanvasHyphenationProfile = PRELO_BOOK_TYPOGRAPHY_PROFILE.hyphenation
): number {
  const range = typeof draw.getRange === 'function' ? draw.getRange() : null;
  const liveRange = range ? range.getRange() : null;
  const start = liveRange ? liveRange.startIndex : -1;
  const end = liveRange ? liveRange.endIndex : -1;
  const hasSelection = start >= 0 && start !== end;
  if (hasSelection) return 0;
  let caret = !hasSelection && start >= 0 ? start : -1;

  // 1) limpa stale e reflui para um layout limpo.
  const { shiftDelta } = stripAutoHyphens(draw, caret >= 0 ? caret : undefined);
  if (caret >= 0) caret += shiftDelta;
  renderReflow(draw);

  const list = draw.getOriginalMainElementList() as unknown as RawElement[];
  let inserted = 0;
  let safety = 0;
  let i = 0;

  // 2) varredura forward; uma inserção por render (re-lê rows após cada mudança).
  while (safety < HARD_SAFETY) {
    safety += 1;
    const rows = draw.getRowList() as unknown as RawRow[];
    if (i >= rows.length - 1) break;

    const row = rows[i]!;
    const next = rows[i + 1]!;

    // só linhas justificadas do corpo
    if (!isJustified(rowFlexOf(row))) {
      i += 1;
      continue;
    }
    // já termina em hífen automático? pula.
    if (isAutoHyphen(lastVisible(row))) {
      i += 1;
      continue;
    }
    // limite de linhas hifenadas consecutivas
    let consec = 0;
    for (let k = i - 1; k >= 0 && isAutoHyphen(lastVisible(rows[k]!)); k--) consec += 1;
    if (consec >= profile.maxConsecutiveLines) {
      i += 1;
      continue;
    }

    // palavra empurrada para a próxima linha
    let s = next.startIndex;
    while (s < list.length && !PT_LETTER.test(list[s]!.value)) s += 1;
    let e = s;
    let hasInnerHyphen = false;
    while (e < list.length && (PT_LETTER.test(list[e]!.value) || list[e]!.value === AUTO_HYPHEN_VALUE)) {
      if (list[e]!.value === AUTO_HYPHEN_VALUE || list[e]!.value === '-') hasInnerHyphen = true;
      e += 1;
    }
    const word = list.slice(s, e).map((el) => el.value).join('');
    if (hasInnerHyphen) {
      i += 1;
      continue;
    }

    const offsets = candidateHyphenOffsets(word, profile);
    if (offsets.length === 0) {
      i += 1;
      continue;
    }

    // tenta do MENOR prefixo ao maior (menor é o que mais cabe → menos renders);
    // aceita o primeiro que termina a linha i.
    let accepted = false;
    for (const off of offsets) {
      const insertIndex = s + off;
      const hyphen = makeHyphen(list[insertIndex - 1]);
      list.splice(insertIndex, 0, hyphen);
      renderReflow(draw);
      const rows2 = draw.getRowList() as unknown as RawRow[];
      const rowI = rows2[i];
      if (rowI && isAutoHyphen(lastVisible(rowI))) {
        // aceito: o hífen ficou no fim da linha i (a folga comportou o prefixo).
        if (insertIndex <= caret) caret += 1;
        inserted += 1;
        accepted = true;
        break;
      }
      // não puxou para cima: remove ESTE hífen (por identidade) e tenta o próximo prefixo.
      const at = list.indexOf(hyphen);
      if (at >= 0) list.splice(at, 1);
      renderReflow(draw);
    }

    i += 1; // segue para a próxima fronteira (a linha i, se hifenada, agora termina em "-").
    void accepted;
  }

  // 3) restaura o cursor (se não havia seleção).
  if (caret >= 0) {
    const clamped = Math.max(0, Math.min(caret, list.length - 1));
    try {
      range?.setRange(clamped, clamped);
      (draw as unknown as { render: (o: unknown) => void }).render({
        isCompute: false,
        isSubmitHistory: false,
        isSetCursor: true,
        curIndex: clamped,
      });
    } catch {
      renderReflow(draw);
    }
  } else {
    renderReflow(draw);
  }

  return inserted;
}
