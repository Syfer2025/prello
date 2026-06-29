import type { CanvasDrawInternal } from './canvas-draw-internal';
import { mmToPx } from './prelo-canvas-units';
import {
  PRELO_BOOK_TYPOGRAPHY_PROFILE,
  type CanvasTypographyProfile,
} from './canvas-typography-profile';

interface WordJustificationElement {
  value?: string;
  type?: string;
  size?: number;
  letterSpacing?: number;
  /** Deslocamento horizontal do 1º elemento da linha; em linhas de contorno é a
   *  intrusão da imagem (translateX): a largura "comida" pela imagem à esquerda. */
  left?: number;
  metrics?: { width?: number };
  extension?: { firstLineIndent?: boolean } | null;
}

interface WordJustificationRow<Element extends WordJustificationElement> {
  width: number;
  rowFlex?: string;
  isWidthNotEnough?: boolean;
  isList?: boolean;
  /** Linha que contorna uma imagem (texto ao lado dela): largura útil reduzida. */
  isSurround?: boolean;
  offsetX?: number;
  /** Largura útil real da linha quando o contorno limita um lado da imagem. */
  availableWidth?: number;
  elementList: Element[];
}

export interface WordJustificationOptions<Element extends WordJustificationElement> {
  innerWidth: number;
  measureElementWidth: (element: Element) => number;
  /** Escala atual do editor (zoom). Usada p/ a capacidade de letter-spacing em px. */
  scale?: number;
  /** Perfil editorial que controla a distribuição entre tracking e espaços. */
  typographyProfile?: CanvasTypographyProfile;
}

interface ComputeRowPayload {
  innerWidth?: number;
}

/** Config do recuo de 1ª linha, lida a cada layout (permite ajustar em runtime). */
export interface FirstLineIndentConfig {
  /** tamanho do recuo em mm (0 = desligado). */
  mm: number;
  /** se true, todo parágrafo do corpo recua automaticamente. */
  auto: boolean;
}

interface PatchOptions<Element extends WordJustificationElement> {
  measureElementWidth?: (element: Element) => number;
  /** Getter da config do recuo de 1ª linha (null = sem recuo). */
  getFirstLineIndent?: () => FirstLineIndentConfig | null;
}

const ZERO_WIDTH = '​';
const WIDTH_EPSILON = 0.5;
const TEXT_TYPES = new Set([undefined, 'text', 'subscript', 'superscript']);
const WORD_LETTER = /^[A-Za-zªºÀ-ÖØ-öø-ÿ]$/;
const PRELO_BASE_OFFSET_X = Symbol('preloBaseOffsetX');
const PRELO_APPLIED_FIRST_LINE_INDENT_X = Symbol('preloAppliedFirstLineIndentX');

type PreloFirstLineIndentState = {
  [PRELO_BASE_OFFSET_X]?: number;
  [PRELO_APPLIED_FIRST_LINE_INDENT_X]?: number;
};

export function createCachedElementWidthMeasurer<Element>(
  measure: (element: Element) => number,
  cacheKey: (element: Element) => string
): (element: Element) => number {
  const cache = new Map<string, number>();
  return (element: Element): number => {
    const key = cacheKey(element);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const width = measure(element);
    cache.set(key, width);
    return width;
  };
}

function rowFlexOf<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): string | undefined {
  if (row.rowFlex) return row.rowFlex;
  for (const element of row.elementList) {
    const flex = (element as WordJustificationElement & { rowFlex?: string }).rowFlex;
    if (flex) return flex;
  }
  return undefined;
}

function isJustifiedFlex(flex: string | undefined): boolean {
  return flex === 'justify' || flex === 'alignment';
}

function rowLayoutElements<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): Element[] {
  return row.elementList[0]?.value === ZERO_WIDTH ? row.elementList.slice(1) : row.elementList;
}

function surroundLeadingOffset<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): number {
  if (!row.isSurround) return 0;
  return Math.max(0, rowLayoutElements(row)[0]?.left ?? 0);
}

function hasInternalSurroundOffset<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): boolean {
  if (!row.isSurround) return false;
  return rowLayoutElements(row)
    .slice(1)
    .some((element) => (element.left ?? 0) > WIDTH_EPSILON);
}

function isSplitSurroundRow<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): boolean {
  // Imagem no meio da linha: há texto antes dela e outro trecho pulado para a
  // direita. Essa linha não tem uma única largura útil contínua para justificar.
  return (
    row.isSurround === true &&
    surroundLeadingOffset(row) <= WIDTH_EPSILON &&
    hasInternalSurroundOffset(row)
  );
}

function shouldRedistributeRow<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>,
  flex: string | undefined,
  innerWidth: number
): boolean {
  if (!isJustifiedFlex(flex)) return false;
  if (isSplitSurroundRow(row)) return false;
  if (flex === 'justify') return true;
  return row.isWidthNotEnough === true || Math.abs(row.width - innerWidth) <= WIDTH_EPSILON;
}

function isWordSpace(element: WordJustificationElement): boolean {
  return element.value === ' ';
}

function contentRange<Element extends WordJustificationElement>(
  elements: Element[]
): { start: number; end: number } | null {
  let start = 0;
  let end = elements.length - 1;
  while (start <= end && isWordSpace(elements[start]!)) start += 1;
  while (end >= start && isWordSpace(elements[end]!)) end -= 1;
  return start <= end ? { start, end } : null;
}

function isWordLetter(element: WordJustificationElement | undefined): boolean {
  return !!element && typeof element.value === 'string' && WORD_LETTER.test(element.value);
}

function canExpandAfterLetter<Element extends WordJustificationElement>(
  elements: Element[],
  index: number
): boolean {
  return isWordLetter(elements[index]) && isWordLetter(elements[index + 1]);
}

export function redistributeJustificationToWordSpaces<Element extends WordJustificationElement>(
  rows: WordJustificationRow<Element>[],
  options: WordJustificationOptions<Element>
): void {
  for (const row of rows) {
    const flex = rowFlexOf(row);
    if (!shouldRedistributeRow(row, flex, options.innerWidth)) continue;

    // O recuo de primeira linha (offsetX) reduz a largura útil da linha: o texto
    // justificado preenche innerWidth - offsetX e fecha exatamente na margem.
    // Linha de CONTORNO: a 1ª "letra" carrega o translateX (intrusão da imagem à
    // esquerda); o texto vai de translateX até a margem, então descontamos isso —
    // senão a justificação miraria a largura cheia e estouraria os espaços.
    const surroundOffset = surroundLeadingOffset(row);
    const baseInnerWidth = row.availableWidth ?? options.innerWidth - (row.offsetX ?? 0);
    const rowInnerWidth = Math.max(0, baseInnerWidth - surroundOffset);

    const elements = rowLayoutElements(row);
    const range = contentRange(elements);
    if (!range) continue;

    const activeElements = elements.slice(range.start, range.end + 1);
    const expandableSpaces = activeElements.filter(isWordSpace);
    if (expandableSpaces.length === 0) continue;

    // Espaços à ESQUERDA = recuo do parágrafo (primeira linha): preservados na
    // largura natural e descontados do espaço a distribuir — digitar espaço no
    // início da linha PRECISA recuar o texto.
    const leadingWidths = elements
      .slice(0, range.start)
      .map((element) => Math.max(0, options.measureElementWidth(element)));
    const leadingTotal = leadingWidths.reduce((sum, width) => sum + width, 0);

    const naturalWidths = activeElements.map((element) => Math.max(0, options.measureElementWidth(element)));
    const naturalTotal = naturalWidths.reduce((sum, width) => sum + width, 0);
    const extra = rowInnerWidth - leadingTotal - naturalTotal;
    if (extra < 0) continue;

    const scale = options.scale ?? 1;
    const justificationProfile =
      options.typographyProfile?.justification ?? PRELO_BOOK_TYPOGRAPHY_PROFILE.justification;
    const letterCapacities = activeElements.map((element, index) =>
      canExpandAfterLetter(activeElements, index)
        ? Math.max(0, (element.size ?? 13) * scale * justificationProfile.maxLetterExtraRatio)
        : 0
    );
    const totalLetterCapacity = letterCapacities.reduce((sum, width) => sum + width, 0);
    const letterExtraTotal = Math.min(extra * justificationProfile.maxLetterExtraShare, totalLetterCapacity);
    const extraPerSpace = (extra - letterExtraTotal) / expandableSpaces.length;

    elements.forEach((element, index) => {
      if (!element.metrics) return;
      if (index < range.start) {
        // Recuo do parágrafo: mantém a largura natural (não colapsa o espaço).
        element.metrics.width = leadingWidths[index]!;
      } else if (index > range.end) {
        // Espaço no fim da linha: artefato de quebra; colapsa para não empurrar a margem.
        element.metrics.width = 0;
      }
    });

    activeElements.forEach((element, index) => {
      if (!element.metrics) return;
      const letterExtra =
        totalLetterCapacity > 0 ? letterExtraTotal * (letterCapacities[index]! / totalLetterCapacity) : 0;
      element.metrics.width =
        naturalWidths[index]! + (isWordSpace(element) ? extraPerSpace : 0) + letterExtra;
    });
    row.width = rowInnerWidth;
  }
}

/** O canvas-editor marca o início de CADA parágrafo com um leader zero-width. */
function isParagraphStartRow<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): boolean {
  return row.elementList[0]?.value === ZERO_WIDTH;
}

/** Override por parágrafo (guardado no leader): true=força recuo, false=sem recuo. */
function indentOverrideOf<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>
): boolean | undefined {
  return row.elementList[0]?.extension?.firstLineIndent;
}

/**
 * Aplica recuo de 1ª linha via `offsetX` no início de cada parágrafo. Não insere
 * caractere nenhum — só desloca a linha (o canvas-editor já soma offsetX na
 * posição). O `redistribute` usa innerWidth - offsetX para o texto justificado
 * fechar na margem. Pula listas e alinhamento direita/centro.
 */
export function applyFirstLineIndentToRows<Element extends WordJustificationElement>(
  rows: WordJustificationRow<Element>[],
  config: { indentPx: number; auto: boolean }
): void {
  for (const row of rows) {
    let indent = 0;
    if (config.indentPx > 0 && !row.isList && isParagraphStartRow(row)) {
      const flex = rowFlexOf(row);
      if (flex !== 'right' && flex !== 'center') {
        const override = indentOverrideOf(row);
        indent =
          override === true ? config.indentPx : override === false ? 0 : config.auto ? config.indentPx : 0;
      }
    }
    setFirstLineIndentOffset(row, indent);
  }
}

function setFirstLineIndentOffset<Element extends WordJustificationElement>(
  row: WordJustificationRow<Element>,
  indent: number
): void {
  const state = row as WordJustificationRow<Element> & PreloFirstLineIndentState;
  const previousIndent = state[PRELO_APPLIED_FIRST_LINE_INDENT_X] ?? 0;
  const storedBase = state[PRELO_BASE_OFFSET_X];
  let baseOffset = row.offsetX ?? 0;

  if (
    storedBase !== undefined &&
    previousIndent > 0 &&
    Math.abs(baseOffset - (storedBase + previousIndent)) <= WIDTH_EPSILON
  ) {
    baseOffset = storedBase;
  }

  const nextOffset = baseOffset + indent;
  if (Math.abs(nextOffset) <= WIDTH_EPSILON) {
    delete row.offsetX;
  } else {
    row.offsetX = nextOffset;
  }
  state[PRELO_BASE_OFFSET_X] = baseOffset;
  state[PRELO_APPLIED_FIRST_LINE_INDENT_X] = indent;
}

/**
 * Liga/desliga o recuo de 1ª linha nos parágrafos da SELEÇÃO (botão manual).
 * Guarda o override em `extension.firstLineIndent` no leader zero-width de cada
 * parágrafo (elemento real e estável → sobrevive a digitação e ao save). Não
 * insere/remove caractere (cursor intacto). Alterna só o override manual: sem
 * override/false => true; true => false. O modo automático global continua separado.
 */
export function toggleFirstLineIndentForSelection(draw: CanvasDrawInternal): boolean {
  const range = typeof draw.getRange === 'function' ? draw.getRange() : null;
  if (!range) return false;
  const { startIndex, endIndex } = range.getRange();
  if (startIndex < 0) return false;
  const list = draw.getOriginalMainElementList() as Array<{
    value?: string;
    extension?: { firstLineIndent?: boolean } | null;
  }>;
  const from = Math.min(startIndex, endIndex);
  const to = Math.min(Math.max(startIndex, endIndex), list.length - 1);

  // leader do parágrafo que contém `from` (anda para trás até o zero-width).
  let firstLeader = from;
  while (firstLeader > 0 && list[firstLeader]?.value !== ZERO_WIDTH) firstLeader -= 1;
  const leaders: number[] = [];
  for (let i = firstLeader; i <= to; i += 1) {
    if (list[i]?.value === ZERO_WIDTH) leaders.push(i);
  }
  if (leaders.length === 0) return false;

  const firstOverride = list[leaders[0]!]?.extension?.firstLineIndent;
  const next = firstOverride !== true;
  for (const idx of leaders) {
    const el = list[idx]!;
    el.extension = { ...(el.extension ?? {}), firstLineIndent: next };
  }
  draw.render({ isCompute: true, isSubmitHistory: false });
  return next;
}

/**
 * Estado MANUAL do recuo de 1ª linha do parágrafo onde está o cursor (para o
 * botão da toolbar). O modo automático global não deixa esse botão azul.
 */
export function getFirstLineIndentManualActive(draw: CanvasDrawInternal): boolean {
  const range = typeof draw.getRange === 'function' ? draw.getRange() : null;
  if (!range) return false;
  const { startIndex } = range.getRange();
  if (startIndex < 0) return false;
  const list = draw.getOriginalMainElementList() as Array<{
    value?: string;
    extension?: { firstLineIndent?: boolean } | null;
  }>;
  let leader = Math.min(startIndex, list.length - 1);
  while (leader > 0 && list[leader]?.value !== ZERO_WIDTH) leader -= 1;
  return list[leader]?.extension?.firstLineIndent === true;
}

/**
 * Estado EFETIVO do recuo de 1ª linha do parágrafo onde está o cursor. Lê o
 * override no leader + o modo auto. Não use para o botão manual da toolbar.
 */
export function getFirstLineIndentActive(draw: CanvasDrawInternal, autoDefault: boolean): boolean {
  const range = typeof draw.getRange === 'function' ? draw.getRange() : null;
  if (!range) return false;
  const { startIndex } = range.getRange();
  if (startIndex < 0) return false;
  const list = draw.getOriginalMainElementList() as Array<{
    value?: string;
    extension?: { firstLineIndent?: boolean } | null;
  }>;
  let leader = Math.min(startIndex, list.length - 1);
  while (leader > 0 && list[leader]?.value !== ZERO_WIDTH) leader -= 1;
  const override = list[leader]?.extension?.firstLineIndent;
  return override === true ? true : override === false ? false : autoDefault;
}

export function installCanvasWordJustificationPatch<Element extends WordJustificationElement>(
  draw: CanvasDrawInternal,
  options: PatchOptions<Element> = {}
): () => void {
  // Registra o hook OFICIAL do editor vendorizado (não substitui mais o método).
  // O `Draw` chama isto no fim de computeRowList, antes de devolver as linhas.
  const registerHook = draw.setComputeRowListHook;
  if (typeof registerHook !== 'function') return () => undefined;

  const measureElementWidth =
    options.measureElementWidth ?? createCanvasElementMeasurer<Element>(draw);

  registerHook.call(draw, (rowList: unknown[], payload: unknown) => {
    const rows = rowList as WordJustificationRow<Element>[];
    const innerWidth =
      typeof (payload as ComputeRowPayload | undefined)?.innerWidth === 'number'
        ? (payload as ComputeRowPayload).innerWidth!
        : draw.getInnerWidth();

    // Escala atual (zoom) lida a cada layout — recuo e justificação precisam dela.
    const scale = Number(draw.getOptions().scale ?? 1) || 1;

    // 1) Recuo de 1ª linha (offsetX) — antes da justificação, que usa o offsetX.
    const indentConfig = options.getFirstLineIndent?.() ?? null;
    if (indentConfig && indentConfig.mm > 0) {
      applyFirstLineIndentToRows(rows, {
        indentPx: mmToPx(indentConfig.mm) * scale,
        auto: indentConfig.auto,
      });
    }

    // 2) Justificação por espaços (lê row.offsetX para fechar na margem).
    redistributeJustificationToWordSpaces(rows, { innerWidth, measureElementWidth, scale });
  });

  return () => {
    registerHook.call(draw, null);
  };
}

function createCanvasElementMeasurer<Element extends WordJustificationElement>(
  draw: CanvasDrawInternal
): (element: Element) => number {
  const maybeDraw = draw as CanvasDrawInternal & {
    getElementFont?: (element: Element, scale?: number) => string;
  };
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  // Escala lida A CADA medição (o usuário pode dar zoom depois deste measurer ser
  // criado): mede o glifo no tamanho LÓGICO e converte para a escala ATUAL, batendo
  // com as larguras que o computeRowList produziu. Antes ficava congelada no mount →
  // no zoom as larguras não batiam e a justificação estourava os espaços.
  const currentScale = () => Number(draw.getOptions().scale ?? 1) || 1;

  return createCachedElementWidthMeasurer(
    (element: Element): number => {
      if (!TEXT_TYPES.has(element.type) || !ctx || !maybeDraw.getElementFont) {
        return element.metrics?.width ?? 0;
      }
      const scale = currentScale();
      ctx.font = maybeDraw.getElementFont(element);
      const value = element.value ?? '';
      const measured = ctx.measureText(value).width * scale;
      return measured + (element.letterSpacing ?? 0) * scale;
    },
    (element: Element): string => {
      if (!TEXT_TYPES.has(element.type) || !maybeDraw.getElementFont) {
        return `fallback:${element.type ?? ''}:${element.value ?? ''}:${element.metrics?.width ?? 0}`;
      }
      return [
        maybeDraw.getElementFont(element),
        element.value ?? '',
        element.letterSpacing ?? 0,
        currentScale(),
      ].join('\u0000');
    }
  );
}
