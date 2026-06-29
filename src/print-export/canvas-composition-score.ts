/**
 * Score de COMPOSIÇÃO tipográfica — camada de DIAGNÓSTICO sobre o layout real.
 *
 * Por quê: antes de trocar o compositor de parágrafo por um do tipo InDesign
 * (Adobe Paragraph Composer / Knuth-Plass), precisamos MEDIR objetivamente onde
 * o compositor atual (greedy, justificação por espaços do canvas-editor) falha.
 * Este módulo não muda nada do layout: lê um CanvasLayoutSnapshot e devolve um
 * score 0..100 + métricas + os piores ofensores.
 *
 * As 6 dimensões medidas (ver MODELO_ATRIBUTOS_TEXTO.md / PATENTES_PARAGRAPH_COMPOSER.md):
 *  1. excesso de espaçamento entre palavras (wordSpacing solto);
 *  2. uso de tracking extra (letterSpacing injetado pela justificação);
 *  3. linhas justificadas ruins (combinação de 1+2, por linha);
 *  4. hifens consecutivos (hyphen ladder);
 *  5. última linha curta demais (runt);
 *  6. variação forte de densidade entre linhas do mesmo parágrafo
 *     (a patente penaliza linha estreita seguindo linha larga — "consistência").
 *
 * Tudo puro e determinístico (sem DOM, sem Date/random). A função de penalidade
 * usa rampas quadráticas, no espírito da penalidade quadrática da patente Adobe.
 *
 * LIMITAÇÃO conhecida: o snapshot NÃO preserva o leader zero-width que marca
 * início de parágrafo (é filtrado). A segmentação de parágrafo aqui é heurística
 * (geometria das linhas: linha curta não-hifenizada encerra parágrafo; recuo de
 * 1ª linha inicia parágrafo; quebra de página encerra). É suficiente para o
 * diagnóstico, não para reconstruir a árvore de parágrafos com exatidão.
 */
import type { CanvasLayoutSnapshot } from './canvas-vector-types';
import {
  average,
  buildLayoutLines,
  collapseWhitespace,
  endsWithHyphen,
  estimateBodyMeasureByPage,
  isJustifiedLine,
  median,
  percentile,
  wordCount,
  type LayoutLine,
} from './canvas-layout-lines';

export type CompositionProblemKind =
  | 'looseSpacing'
  | 'tracking'
  | 'shortLastLine'
  | 'densityVariation'
  | 'hyphenLadder';

export interface CompositionFlag {
  kind: CompositionProblemKind;
  pageNo: number;
  lineNo: number;
  text: string;
  /** Valor medido relevante ao tipo (ratio de espaço, tracking em em, fill, run de hifens). */
  value: number;
  /** Penalidade atribuída, 0..1. */
  penalty: number;
}

export interface CompositionStat {
  mean: number;
  p95: number;
  max: number;
}

export interface CanvasCompositionScore {
  /** Score geral 0..100 (100 = composição limpa). */
  score: number;
  subScores: {
    wordSpacing: number;
    tracking: number;
    hyphenation: number;
    lastLine: number;
    density: number;
  };
  counts: {
    lines: number;
    justifiedLines: number;
    paragraphs: number;
    justifiedParagraphs: number;
    looseLines: number;
    trackedLines: number;
    shortLastLines: number;
    densityVariationParagraphs: number;
    hyphenLadders: number;
  };
  metrics: {
    /** Largura "natural" estimada do espaço (px) — a referência de 100% do InDesign. */
    naturalSpaceWidthPx: number;
    /** avgEspaço / espaçoNatural nas linhas justificadas (InDesign: ótimo 1.0, máx 1.33). */
    spaceLoosenessRatio: CompositionStat;
    /** tracking médio injetado por linha justificada, em em. */
    letterTrackingEm: CompositionStat;
    /** fração da medida preenchida pela última linha dos parágrafos justificados. */
    lastLineFillRatio: { mean: number; min: number };
    /** amplitude (máx-mín) do loosenessRatio dentro de cada parágrafo justificado. */
    densitySpread: { mean: number; max: number };
    maxHyphenLadder: number;
  };
  /** Piores ofensores (ordenados por penalidade) — mostram ONDE o compositor falha. */
  worst: CompositionFlag[];
}

export interface CanvasCompositionScoreOptions {
  /** loosenessRatio onde a penalidade de espaço começa a subir (default 1.15). */
  looseSpaceRatioStart?: number;
  /** loosenessRatio onde a penalidade de espaço satura em 1 (default 2.2). */
  looseSpaceRatioFull?: number;
  /** tracking (em) onde a penalidade começa (default 0.008). */
  trackingEmStart?: number;
  /** tracking (em) onde a penalidade satura (default 0.035, = teto do perfil). */
  trackingEmFull?: number;
  /** tracking (em) abaixo disto é ruído e ignorado (default 0.004). */
  trackingEpsilonEm?: number;
  /** última linha com fill abaixo disto começa a penalizar (default 0.15). */
  shortLastLineFill?: number;
  /** última linha com fill neste valor satura a penalidade (default 0.04 = runt). */
  runtLastLineFill?: number;
  /** amplitude de densidade onde a penalidade começa (default 0.30). */
  densitySpreadStart?: number;
  /** amplitude de densidade onde a penalidade satura (default 1.20). */
  densitySpreadFull?: number;
  /** limite de hifens consecutivos antes de penalizar (default 2). */
  maxConsecutiveHyphens?: number;
  /** fill abaixo do qual uma linha não-hifenizada encerra o parágrafo (default 0.90). */
  paragraphEndFill?: number;
  /** xMin além da margem esquerda (px) que indica recuo de 1ª linha (default 6). */
  firstLineIndentMinPx?: number;
  /** penalidade a partir da qual um item é "notável" e entra nas contagens (default 0.25). */
  noticeablePenalty?: number;
  /** quantos ofensores listar em `worst` (default 8). */
  worstLimit?: number;
  /** pesos relativos das categorias no score geral. */
  weights?: {
    wordSpacing?: number;
    tracking?: number;
    hyphenation?: number;
    lastLine?: number;
    density?: number;
  };
}

interface ResolvedOptions {
  looseSpaceRatioStart: number;
  looseSpaceRatioFull: number;
  trackingEmStart: number;
  trackingEmFull: number;
  trackingEpsilonEm: number;
  shortLastLineFill: number;
  runtLastLineFill: number;
  densitySpreadStart: number;
  densitySpreadFull: number;
  maxConsecutiveHyphens: number;
  paragraphEndFill: number;
  firstLineIndentMinPx: number;
  noticeablePenalty: number;
  worstLimit: number;
  weights: { wordSpacing: number; tracking: number; hyphenation: number; lastLine: number; density: number };
}

const DEFAULTS: ResolvedOptions = {
  looseSpaceRatioStart: 1.15,
  looseSpaceRatioFull: 2.2,
  trackingEmStart: 0.008,
  trackingEmFull: 0.035,
  trackingEpsilonEm: 0.004,
  shortLastLineFill: 0.15,
  runtLastLineFill: 0.04,
  densitySpreadStart: 0.3,
  densitySpreadFull: 1.2,
  maxConsecutiveHyphens: 2,
  paragraphEndFill: 0.9,
  firstLineIndentMinPx: 6,
  noticeablePenalty: 0.25,
  worstLimit: 8,
  weights: { wordSpacing: 0.3, tracking: 0.15, hyphenation: 0.2, lastLine: 0.15, density: 0.2 },
};

const SPACE_FLOOR_PX = 0.5;
const WORD_LETTER = /^[A-Za-zªºÀ-ÖØ-öø-ÿ]$/;
const FLAG_TEXT_LIMIT = 80;

/** Info por linha derivada para o cálculo de penalidades. */
interface LineInfo {
  line: LayoutLine;
  justified: boolean;
  measure: number;
  fillRatio: number;
  loosenessRatio: number;
  hasSpaces: boolean;
  trackingEm: number;
  endsWithHyphen: boolean;
  words: number;
}

export function scoreCanvasComposition(
  snapshot: CanvasLayoutSnapshot,
  options: CanvasCompositionScoreOptions = {}
): CanvasCompositionScore {
  const opts = resolveOptions(options);
  const lines = buildLayoutLines(snapshot.glyphs);
  if (lines.length === 0) return emptyScore();

  const naturalSpaceWidthPx = estimateNaturalSpaceWidth(lines);
  const naturalAdvance = buildNaturalAdvanceMap(lines);
  const measureByPage = estimateBodyMeasureByPage(lines);
  const measureFallback = resolveMeasureFallback(lines, measureByPage);

  const infos: LineInfo[] = lines.map((line) => {
    const justified = isJustifiedLine(line);
    const measure = measureByPage.get(line.pageIndex) ?? measureFallback;
    const positiveSpaces = line.wordSpaceWidths.filter((w) => w > SPACE_FLOOR_PX);
    const avgSpacePx = positiveSpaces.length ? average(positiveSpaces) : 0;
    const loosenessRatio =
      naturalSpaceWidthPx > 0 && positiveSpaces.length ? avgSpacePx / naturalSpaceWidthPx : 1;
    return {
      line,
      justified,
      measure,
      fillRatio: measure > 0 ? line.widthPx / measure : 1,
      loosenessRatio,
      hasSpaces: positiveSpaces.length > 0,
      trackingEm: lineTrackingEm(line, naturalAdvance, opts.trackingEpsilonEm),
      endsWithHyphen: endsWithHyphen(line),
      words: wordCount(line.trimmedText),
    };
  });

  const paragraphs = segmentParagraphs(infos, opts);

  const flags: CompositionFlag[] = [];
  const spacePenalties: number[] = [];
  const trackingPenalties: number[] = [];
  const hyphenPenalties: number[] = [];
  const lastLinePenalties: number[] = [];
  const densityPenalties: number[] = [];

  const loosenessSamples: number[] = [];
  const trackingSamples: number[] = [];
  const lastLineFills: number[] = [];
  const densitySpreads: number[] = [];

  let looseLines = 0;
  let trackedLines = 0;
  let shortLastLines = 0;
  let densityVariationParagraphs = 0;
  let hyphenLadders = 0;
  let justifiedLines = 0;
  let justifiedParagraphs = 0;
  let maxHyphenLadder = 0;

  // ---- Penalidades por LINHA (1, 2, 3): espaço solto + tracking extra ----
  for (const info of infos) {
    if (!info.justified) continue;
    justifiedLines += 1;

    if (info.hasSpaces) {
      loosenessSamples.push(info.loosenessRatio);
      const penalty = sq(
        ramp(info.loosenessRatio, opts.looseSpaceRatioStart, opts.looseSpaceRatioFull)
      );
      spacePenalties.push(penalty);
      if (penalty >= opts.noticeablePenalty) {
        looseLines += 1;
        flags.push(makeFlag('looseSpacing', info.line, round(info.loosenessRatio, 2), penalty));
      }
    }

    trackingSamples.push(info.trackingEm);
    const trackingPenalty = sq(ramp(info.trackingEm, opts.trackingEmStart, opts.trackingEmFull));
    trackingPenalties.push(trackingPenalty);
    if (trackingPenalty >= opts.noticeablePenalty) {
      trackedLines += 1;
      flags.push(makeFlag('tracking', info.line, round(info.trackingEm, 4), trackingPenalty));
    }
  }

  // ---- Penalidades por PARÁGRAFO (4, 5, 6) ----
  for (const para of paragraphs) {
    // (4) Escada de hifens — vale para qualquer parágrafo.
    const ladder = longestHyphenRun(para);
    maxHyphenLadder = Math.max(maxHyphenLadder, ladder.run);
    if (ladder.run > opts.maxConsecutiveHyphens) {
      const penalty = ramp(ladder.run, opts.maxConsecutiveHyphens, opts.maxConsecutiveHyphens + 3);
      hyphenPenalties.push(penalty);
      hyphenLadders += 1;
      if (ladder.line) flags.push(makeFlag('hyphenLadder', ladder.line, ladder.run, penalty));
    } else {
      hyphenPenalties.push(0);
    }

    if (!isJustifiedParagraph(para)) continue;
    justifiedParagraphs += 1;

    // (5) Última linha curta demais (runt).
    if (para.length >= 2) {
      const last = para[para.length - 1]!;
      lastLineFills.push(last.fillRatio);
      const penalty = sq(
        ramp(
          opts.shortLastLineFill - last.fillRatio,
          0,
          Math.max(1e-6, opts.shortLastLineFill - opts.runtLastLineFill)
        )
      );
      lastLinePenalties.push(penalty);
      if (penalty >= opts.noticeablePenalty) {
        shortLastLines += 1;
        flags.push(makeFlag('shortLastLine', last.line, round(last.fillRatio, 2), penalty));
      }
    }

    // (6) Variação de densidade entre as linhas justificadas do parágrafo.
    const justifiedWithSpaces = para.filter((i) => i.justified && i.hasSpaces);
    if (justifiedWithSpaces.length >= 2) {
      const ratios = justifiedWithSpaces.map((i) => i.loosenessRatio);
      const spread = maxOf(ratios) - minOf(ratios);
      densitySpreads.push(spread);
      const penalty = sq(ramp(spread, opts.densitySpreadStart, opts.densitySpreadFull));
      densityPenalties.push(penalty);
      if (penalty >= opts.noticeablePenalty) {
        densityVariationParagraphs += 1;
        const loosest = justifiedWithSpaces.reduce((a, b) =>
          b.loosenessRatio > a.loosenessRatio ? b : a
        );
        flags.push(makeFlag('densityVariation', loosest.line, round(spread, 2), penalty));
      }
    }
  }

  const subScores = {
    wordSpacing: toScore(spacePenalties),
    tracking: toScore(trackingPenalties),
    hyphenation: toScore(hyphenPenalties),
    lastLine: toScore(lastLinePenalties),
    density: toScore(densityPenalties),
  };

  const score = overallScore(opts.weights, {
    wordSpacing: spacePenalties,
    tracking: trackingPenalties,
    hyphenation: hyphenPenalties,
    lastLine: lastLinePenalties,
    density: densityPenalties,
  });

  flags.sort(
    (a, b) =>
      b.penalty - a.penalty ||
      a.pageNo - b.pageNo ||
      a.lineNo - b.lineNo ||
      a.kind.localeCompare(b.kind)
  );

  return {
    score,
    subScores,
    counts: {
      lines: lines.length,
      justifiedLines,
      paragraphs: paragraphs.length,
      justifiedParagraphs,
      looseLines,
      trackedLines,
      shortLastLines,
      densityVariationParagraphs,
      hyphenLadders,
    },
    metrics: {
      naturalSpaceWidthPx: round(naturalSpaceWidthPx, 2),
      spaceLoosenessRatio: stat(loosenessSamples, 2),
      letterTrackingEm: stat(trackingSamples, 4),
      lastLineFillRatio: {
        mean: round(average(lastLineFills), 2),
        min: round(minOf(lastLineFills), 2),
      },
      densitySpread: {
        mean: round(average(densitySpreads), 2),
        max: round(maxOf(densitySpreads), 2),
      },
      maxHyphenLadder,
    },
    worst: flags.slice(0, opts.worstLimit),
  };
}

function resolveOptions(options: CanvasCompositionScoreOptions): ResolvedOptions {
  return {
    looseSpaceRatioStart: options.looseSpaceRatioStart ?? DEFAULTS.looseSpaceRatioStart,
    looseSpaceRatioFull: options.looseSpaceRatioFull ?? DEFAULTS.looseSpaceRatioFull,
    trackingEmStart: options.trackingEmStart ?? DEFAULTS.trackingEmStart,
    trackingEmFull: options.trackingEmFull ?? DEFAULTS.trackingEmFull,
    trackingEpsilonEm: options.trackingEpsilonEm ?? DEFAULTS.trackingEpsilonEm,
    shortLastLineFill: options.shortLastLineFill ?? DEFAULTS.shortLastLineFill,
    runtLastLineFill: options.runtLastLineFill ?? DEFAULTS.runtLastLineFill,
    densitySpreadStart: options.densitySpreadStart ?? DEFAULTS.densitySpreadStart,
    densitySpreadFull: options.densitySpreadFull ?? DEFAULTS.densitySpreadFull,
    maxConsecutiveHyphens: options.maxConsecutiveHyphens ?? DEFAULTS.maxConsecutiveHyphens,
    paragraphEndFill: options.paragraphEndFill ?? DEFAULTS.paragraphEndFill,
    firstLineIndentMinPx: options.firstLineIndentMinPx ?? DEFAULTS.firstLineIndentMinPx,
    noticeablePenalty: options.noticeablePenalty ?? DEFAULTS.noticeablePenalty,
    worstLimit: options.worstLimit ?? DEFAULTS.worstLimit,
    weights: {
      wordSpacing: options.weights?.wordSpacing ?? DEFAULTS.weights.wordSpacing,
      tracking: options.weights?.tracking ?? DEFAULTS.weights.tracking,
      hyphenation: options.weights?.hyphenation ?? DEFAULTS.weights.hyphenation,
      lastLine: options.weights?.lastLine ?? DEFAULTS.weights.lastLine,
      density: options.weights?.density ?? DEFAULTS.weights.density,
    },
  };
}

/**
 * Estima a largura natural do espaço de palavra (≈ "100%" do InDesign). Prefere
 * o mediano dos espaços de linhas NÃO justificadas (que mantêm o espaço natural);
 * senão, o percentil 20 de todos os espaços positivos (o menos inflado); por fim,
 * 0.25 em do corpo mediano. Espaços de fim de linha colapsados (largura ~0) são
 * descartados pelo piso de largura.
 */
function estimateNaturalSpaceWidth(lines: LayoutLine[]): number {
  const all: number[] = [];
  const natural: number[] = [];
  for (const line of lines) {
    const justified = isJustifiedLine(line);
    for (const w of line.wordSpaceWidths) {
      if (w <= SPACE_FLOOR_PX) continue;
      all.push(w);
      if (!justified) natural.push(w);
    }
  }
  if (natural.length >= 3) return median(natural);
  if (all.length > 0) return percentile(all, 0.2);
  const medFont = median(lines.map((l) => l.fontSizePx)) || 13;
  return 0.25 * medFont;
}

/**
 * Largura natural (não-tracking) de cada glifo letra, por chave de estilo. A
 * justificação só ADICIONA avanço às letras, então o MÍNIMO observado no
 * documento é uma boa aproximação do avanço natural.
 */
function buildNaturalAdvanceMap(lines: LayoutLine[]): Map<string, number> {
  const natural = new Map<string, number>();
  for (const line of lines) {
    for (const g of line.glyphs) {
      if (!WORD_LETTER.test(g.value) || !(g.width > 0)) continue;
      const key = glyphKey(g);
      const prev = natural.get(key);
      if (prev === undefined || g.width < prev) natural.set(key, g.width);
    }
  }
  return natural;
}

function glyphKey(g: LayoutLine['glyphs'][number]): string {
  return `${g.value}|${g.fontFamily}|${g.fontSizePx}|${g.bold ? 1 : 0}|${g.italic ? 1 : 0}`;
}

/** Tracking médio injetado na linha, em em (excesso de avanço sobre o natural). */
function lineTrackingEm(
  line: LayoutLine,
  naturalAdvance: Map<string, number>,
  epsilonEm: number
): number {
  const letters = line.glyphs.filter((g) => WORD_LETTER.test(g.value));
  if (letters.length < 2) return 0;
  let sumExcess = 0;
  let counted = 0;
  for (const g of letters) {
    const natural = naturalAdvance.get(glyphKey(g));
    if (natural === undefined) continue;
    const excess = g.width - natural;
    if (excess > 0) sumExcess += excess;
    counted += 1;
  }
  if (counted === 0) return 0;
  const em = sumExcess / counted / (line.fontSizePx || 13);
  return em < epsilonEm ? 0 : em;
}

/**
 * Agrupa linhas em parágrafos por geometria (heurística determinística). Reseta
 * em quebra de página; encerra ao ver linha curta não-hifenizada; abre novo
 * parágrafo quando a linha vem recuada (recuo de 1ª linha).
 */
function segmentParagraphs(infos: LineInfo[], opts: ResolvedOptions): LineInfo[][] {
  const leftMarginByPage = new Map<number, number>();
  for (const info of infos) {
    const page = info.line.pageIndex;
    const current = leftMarginByPage.get(page);
    if (current === undefined || info.line.xMin < current) leftMarginByPage.set(page, info.line.xMin);
  }

  const paragraphs: LineInfo[][] = [];
  let current: LineInfo[] = [];
  let pageOfCurrent: number | null = null;

  for (const info of infos) {
    const page = info.line.pageIndex;
    let startNew = false;
    if (current.length > 0) {
      if (page !== pageOfCurrent) {
        startNew = true;
      } else {
        const prev = current[current.length - 1]!;
        const prevEndsParagraph = !prev.endsWithHyphen && prev.fillRatio < opts.paragraphEndFill;
        const leftMargin = leftMarginByPage.get(page) ?? info.line.xMin;
        const indented = info.line.xMin - leftMargin > opts.firstLineIndentMinPx;
        startNew = prevEndsParagraph || indented;
      }
    }
    if (startNew && current.length > 0) {
      paragraphs.push(current);
      current = [];
    }
    current.push(info);
    pageOfCurrent = page;
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

/** Parágrafo é "justificado" se alguma linha (exceto a última) é justificada. */
function isJustifiedParagraph(para: LineInfo[]): boolean {
  const upto = para.length > 1 ? para.length - 1 : para.length;
  for (let i = 0; i < upto; i += 1) if (para[i]!.justified) return true;
  return false;
}

function longestHyphenRun(para: LineInfo[]): { run: number; line: LayoutLine | null } {
  let run = 0;
  let best = 0;
  let bestLine: LayoutLine | null = null;
  for (const info of para) {
    if (info.endsWithHyphen) {
      run += 1;
      if (run > best) {
        best = run;
        bestLine = info.line;
      }
    } else {
      run = 0;
    }
  }
  return { run: best, line: bestLine };
}

function makeFlag(
  kind: CompositionProblemKind,
  line: LayoutLine,
  value: number,
  penalty: number
): CompositionFlag {
  const text = collapseWhitespace(line.trimmedText);
  return {
    kind,
    pageNo: line.pageNo,
    lineNo: line.lineNo,
    text: text.length > FLAG_TEXT_LIMIT ? `${text.slice(0, FLAG_TEXT_LIMIT - 1)}…` : text,
    value,
    penalty: round(penalty, 3),
  };
}

/** Sub-score 0..100 a partir de uma lista de penalidades (média). */
function toScore(penalties: number[]): number {
  if (penalties.length === 0) return 100;
  return Math.round(100 * (1 - average(penalties)));
}

/** Score geral: média ponderada das penalidades médias, renormalizada às categorias presentes. */
function overallScore(
  weights: ResolvedOptions['weights'],
  penaltiesByCategory: Record<keyof ResolvedOptions['weights'], number[]>
): number {
  let weightSum = 0;
  let penaltySum = 0;
  (Object.keys(weights) as (keyof ResolvedOptions['weights'])[]).forEach((key) => {
    const penalties = penaltiesByCategory[key];
    if (penalties.length === 0) return;
    weightSum += weights[key];
    penaltySum += weights[key] * average(penalties);
  });
  const overall = weightSum > 0 ? penaltySum / weightSum : 0;
  return clamp(Math.round(100 * (1 - overall)), 0, 100);
}

function stat(values: number[], decimals: number): CompositionStat {
  if (values.length === 0) return { mean: 0, p95: 0, max: 0 };
  return {
    mean: round(average(values), decimals),
    p95: round(percentile(values, 0.95), decimals),
    max: round(maxOf(values), decimals),
  };
}

/** max/min sem espalhar o array (evita estouro de pilha em documentos enormes). */
function maxOf(values: number[]): number {
  let max = -Infinity;
  for (const value of values) if (value > max) max = value;
  return max === -Infinity ? 0 : max;
}

function minOf(values: number[]): number {
  let min = Infinity;
  for (const value of values) if (value < min) min = value;
  return min === Infinity ? 0 : min;
}

function emptyScore(): CanvasCompositionScore {
  return {
    score: 100,
    subScores: { wordSpacing: 100, tracking: 100, hyphenation: 100, lastLine: 100, density: 100 },
    counts: {
      lines: 0,
      justifiedLines: 0,
      paragraphs: 0,
      justifiedParagraphs: 0,
      looseLines: 0,
      trackedLines: 0,
      shortLastLines: 0,
      densityVariationParagraphs: 0,
      hyphenLadders: 0,
    },
    metrics: {
      naturalSpaceWidthPx: 0,
      spaceLoosenessRatio: { mean: 0, p95: 0, max: 0 },
      letterTrackingEm: { mean: 0, p95: 0, max: 0 },
      lastLineFillRatio: { mean: 0, min: 0 },
      densitySpread: { mean: 0, max: 0 },
      maxHyphenLadder: 0,
    },
    worst: [],
  };
}

function resolveMeasureFallback(lines: LayoutLine[], byPage: Map<number, number>): number {
  const measures = [...byPage.values()].filter((m) => m > 0);
  if (measures.length) return median(measures);
  const widths = lines.map((l) => l.widthPx).filter((w) => w > 0);
  return widths.length ? median(widths) : 1;
}

function ramp(value: number, lo: number, hi: number): number {
  if (hi <= lo) return value >= hi ? 1 : 0;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

function sq(value: number): number {
  return value * value;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
