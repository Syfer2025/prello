/**
 * Modelo de LINHA derivado de um CanvasLayoutSnapshot.
 *
 * Os glifos do snapshot são uma lista plana (página, x/y, largura...). Aqui os
 * agrupamos em linhas visuais (mesma página, mesmo yTop dentro de uma tolerância)
 * e expomos medidas por linha. É a base comum do preflight tipográfico e do score
 * de composição — uma única fonte de verdade para "o que é uma linha".
 *
 * Funções puras e determinísticas (sem DOM, sem Date/random).
 */
import type { CanvasLayoutGlyph } from './canvas-vector-types';

/** Caractere de largura zero usado pelo canvas-editor como leader de parágrafo. */
const ZERO_WIDTH = '​';
/** Glifos cuja diferença de yTop é menor que isto pertencem à mesma linha. */
const LINE_Y_TOLERANCE_PX = 1.25;
/** rowFlex que indica linha justificada (espalha o texto até a margem). */
const JUSTIFIED_FLEX = new Set(['justify', 'alignment']);
/** Hífen (vários traços Unicode) no fim do texto da linha. */
const HYPHEN_END_RE = /[-‐‑‒–—]\s*$/u;

/** Uma linha visual reconstruída a partir dos glifos do snapshot. */
export interface LayoutLine {
  /** Índice 0-based da página (= pageNo do glifo). */
  pageIndex: number;
  /** Número 1-based da página, para exibição. */
  pageNo: number;
  /** Número 1-based da linha dentro da página. */
  lineNo: number;
  yTop: number;
  yBottom: number;
  rowHeight: number;
  xMin: number;
  xMax: number;
  widthPx: number;
  fontSizePx: number;
  rowFlex?: string;
  glyphs: CanvasLayoutGlyph[];
  text: string;
  trimmedText: string;
  /** Larguras de avanço dos espaços de palavra da linha (px, podem ser 0). */
  wordSpaceWidths: number[];
}

export function buildLayoutLines(glyphs: CanvasLayoutGlyph[]): LayoutLine[] {
  const sorted = glyphs
    .filter(isVisibleGlyph)
    .slice()
    .sort((a, b) => a.pageNo - b.pageNo || a.yTop - b.yTop || a.x - b.x);

  const buckets: CanvasLayoutGlyph[][] = [];
  for (const glyph of sorted) {
    const current = buckets[buckets.length - 1];
    const first = current?.[0];
    if (
      !current ||
      !first ||
      first.pageNo !== glyph.pageNo ||
      Math.abs(first.yTop - glyph.yTop) > LINE_Y_TOLERANCE_PX
    ) {
      buckets.push([glyph]);
    } else {
      current.push(glyph);
    }
  }

  const pageLineCounts = new Map<number, number>();
  return buckets.map((bucket) => {
    bucket.sort((a, b) => a.x - b.x);
    const first = bucket[0]!;
    const pageLineNo = (pageLineCounts.get(first.pageNo) ?? 0) + 1;
    pageLineCounts.set(first.pageNo, pageLineNo);

    const xMin = Math.min(...bucket.map((g) => g.x));
    const xMax = Math.max(...bucket.map((g) => g.x + Math.max(0, g.width)));
    const yTop = average(bucket.map((g) => g.yTop));
    const rowHeight = median(bucket.map((g) => positive(g.rowHeight, 0))) || first.rowHeight || 0;
    const fontSizePx = median(bucket.map((g) => positive(g.fontSizePx, 0))) || 13;
    const rowFlex = bucket.find((g) => g.rowFlex)?.rowFlex;
    const text = bucket.map((g) => g.value).join('');

    return {
      pageIndex: first.pageNo,
      pageNo: first.pageNo + 1,
      lineNo: pageLineNo,
      yTop,
      yBottom: yTop + rowHeight,
      rowHeight,
      xMin,
      xMax,
      widthPx: xMax - xMin,
      fontSizePx,
      rowFlex,
      glyphs: bucket,
      text,
      trimmedText: text.trim(),
      wordSpaceWidths: bucket
        .filter((g) => g.value === ' ')
        .map((g) => Math.max(0, g.width)),
    };
  });
}

/**
 * Estima a "medida" (largura útil de corpo) de cada página: o percentil 75 das
 * larguras das linhas com pelo menos 3 palavras. Linhas justificadas de corpo
 * fecham na margem, então o p75 aproxima bem a largura total da coluna.
 */
export function estimateBodyMeasureByPage(lines: LayoutLine[]): Map<number, number> {
  const widthsByPage = new Map<number, number[]>();
  for (const line of lines) {
    if (wordCount(line.trimmedText) < 3) continue;
    const widths = widthsByPage.get(line.pageIndex) ?? [];
    widths.push(line.widthPx);
    widthsByPage.set(line.pageIndex, widths);
  }

  const result = new Map<number, number>();
  for (const [pageIndex, widths] of widthsByPage) {
    const filtered = widths.filter((width) => width >= 120);
    const candidates = filtered.length >= 2 ? filtered : widths;
    if (candidates.length === 0) continue;
    result.set(pageIndex, percentile(candidates, 0.75));
  }
  return result;
}

export function isVisibleGlyph(glyph: CanvasLayoutGlyph): boolean {
  return glyph.value !== '' && glyph.value !== '\n' && glyph.value !== ZERO_WIDTH;
}

export function isJustifiedLine(line: LayoutLine): boolean {
  return !!line.rowFlex && JUSTIFIED_FLEX.has(line.rowFlex);
}

export function endsWithHyphen(line: LayoutLine): boolean {
  return HYPHEN_END_RE.test(line.trimmedText);
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ');
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function median(values: number[]): number {
  return percentile(values, 0.5);
}

export function percentile(values: number[], p: number): number {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index]!;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
