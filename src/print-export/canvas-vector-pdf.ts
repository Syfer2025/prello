/**
 * Converte um CanvasLayoutSnapshot (layout REAL do canvas-editor, em px) num
 * CanvasVectorDocument (runs posicionados em pontos, eixo Y já invertido para o
 * PDF, com sangria, marcas de corte e caixas Trim/Bleed/Media).
 *
 * PURO e determinístico — sem pdf-lib, sem browser, sem medição de fonte. Toda
 * a "diagramação" já foi feita pelo canvas-editor; aqui só transformamos
 * coordenadas. É por isso que o PDF sai 1:1 com a tela.
 *
 * Justificação: o wrapper do canvas-editor redistribui o espaço extra somente
 * para espaços entre palavras. Aqui separamos runs nas bordas de espaço para o
 * renderer não voltar a transformar esse avanço em tracking entre letras.
 */
import type { BookLayoutSettings } from '../canvas-editor/book-layout-settings';
import { mmToPt } from '../canvas-editor/prelo-canvas-units';
import {
  variantKey,
  type CanvasLayoutGlyph,
  type CanvasLayoutSnapshot,
  type CanvasVectorDocument,
  type CanvasVectorLine,
  type CanvasVectorPage,
  type CanvasVectorRun,
  type PdfBox,
} from './canvas-vector-types';

export interface CanvasVectorOptions {
  /** Sangria em mm (0 = miolo de texto puro). */
  bleedMm?: number;
  cropMarks?: boolean;
  cropMarkLengthMm?: number;
  cropMarkGapMm?: number;
  cropMarkThickness?: number;
}

const ZERO_WIDTH = '​';
/** Tolerância (px) para considerar dois glifos contíguos na mesma run. */
const CONTIGUITY_EPS_PX = 0.4;

function isRenderable(value: string): boolean {
  return value.length > 0 && value !== '\n' && value !== ZERO_WIDTH;
}

function sameRunStyle(a: CanvasLayoutGlyph, b: CanvasLayoutGlyph): boolean {
  return (
    a.pageNo === b.pageNo &&
    a.fontFamily === b.fontFamily &&
    a.fontSizePx === b.fontSizePx &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.highlight ?? '') === (b.highlight ?? '') &&
    a.underline === b.underline &&
    a.strikeout === b.strikeout &&
    Math.round(a.yTop * 100) === Math.round(b.yTop * 100) &&
    Math.round(a.ascent * 100) === Math.round(b.ascent * 100)
  );
}

function wouldFormPdfLigature(prev: CanvasLayoutGlyph, next: CanvasLayoutGlyph): boolean {
  const a = prev.value.toLowerCase();
  const b = next.value.toLowerCase();
  // pdf-lib/fontkit pode substituir ff/fi/fl por um único glifo dentro de drawText.
  // O snapshot do canvas é posicionado caractere-a-caractere; se deixarmos a
  // ligadura acontecer, a largura/spacing do run deixa de bater com o canvas.
  return a === 'f' && (b === 'f' || b === 'i' || b === 'l');
}

function crossesWordSpace(prev: CanvasLayoutGlyph, next: CanvasLayoutGlyph): boolean {
  return prev.value === ' ' || next.value === ' ';
}

interface GlyphGroup {
  glyphs: CanvasLayoutGlyph[];
}

/** Agrupa glifos contíguos de mesmo estilo/linha numa única run. */
function groupGlyphs(glyphs: CanvasLayoutGlyph[]): GlyphGroup[] {
  const groups: GlyphGroup[] = [];
  let current: CanvasLayoutGlyph[] = [];

  for (const glyph of glyphs) {
    if (current.length === 0) {
      current = [glyph];
      continue;
    }
    const prev = current[current.length - 1]!;
    const contiguous = Math.abs(glyph.x - (prev.x + prev.width)) <= CONTIGUITY_EPS_PX;
    if (
      sameRunStyle(prev, glyph) &&
      contiguous &&
      !wouldFormPdfLigature(prev, glyph) &&
      !crossesWordSpace(prev, glyph)
    ) {
      current.push(glyph);
    } else {
      groups.push({ glyphs: current });
      current = [glyph];
    }
  }
  if (current.length > 0) groups.push({ glyphs: current });
  return groups;
}

export function snapshotToVectorDocument(
  snapshot: CanvasLayoutSnapshot,
  layout: BookLayoutSettings,
  options: CanvasVectorOptions = {}
): CanvasVectorDocument {
  const trimW = mmToPt(layout.widthMm);
  const trimH = mmToPt(layout.heightMm);
  const kx = trimW / snapshot.pageWidthPx;
  const ky = trimH / snapshot.pageHeightPx;

  const bleedPt = mmToPt(options.bleedMm ?? 0);
  const markLen = options.cropMarks ? mmToPt(options.cropMarkLengthMm ?? 5) : 0;
  const markGap = options.cropMarks ? mmToPt(options.cropMarkGapMm ?? 2) : 0;
  const markThickness = options.cropMarkThickness ?? 0.25;
  const slug = options.cropMarks ? markLen + markGap : 0;
  // deslocamento do trim dentro do media (sangria + área de marcas).
  const offset = bleedPt + slug;

  const mediaW = trimW + offset * 2;
  const mediaH = trimH + offset * 2;
  const mediaBox: PdfBox = [0, 0, mediaW, mediaH];
  const trimBox: PdfBox = [offset, offset, offset + trimW, offset + trimH];
  const bleedBox: PdfBox = [
    offset - bleedPt,
    offset - bleedPt,
    offset + trimW + bleedPt,
    offset + trimH + bleedPt,
  ];

  const fontFamilies = new Set<string>();

  // Agrupa glifos por página preservando a ordem.
  const byPage = new Map<number, CanvasLayoutGlyph[]>();
  for (const glyph of snapshot.glyphs) {
    if (!isRenderable(glyph.value)) continue;
    fontFamilies.add(glyph.fontFamily);
    const list = byPage.get(glyph.pageNo) ?? [];
    list.push(glyph);
    byPage.set(glyph.pageNo, list);
  }

  const pageCount = Math.max(snapshot.pageCount, byPage.size, 1);
  const pages: CanvasVectorPage[] = [];

  for (let pageNo = 0; pageNo < pageCount; pageNo++) {
    const glyphs = byPage.get(pageNo) ?? [];
    const runs: CanvasVectorRun[] = [];

    for (const group of groupGlyphs(glyphs)) {
      const gs = group.glyphs;
      const first = gs[0]!;
      const last = gs[gs.length - 1]!;
      // largura-alvo do run (px) = direita do último - esquerda do primeiro.
      const widthPx = last.x + last.width - first.x;
      const baselineTopPx = first.yTop + first.ascent;

      const run: CanvasVectorRun = {
        text: gs.map((g) => g.value).join(''),
        x: offset + first.x * kx,
        y: offset + (trimH - baselineTopPx * ky),
        width: widthPx * kx,
        fontSize: first.fontSizePx * kx,
        fontFamily: first.fontFamily,
        variant: variantKey(first.bold, first.italic),
        color: normalizeColor(first.color),
        underline: first.underline,
        strikethrough: first.strikeout,
        lineHeight: first.rowHeight * ky,
      };
      if (first.highlight) run.backgroundColor = normalizeColor(first.highlight);
      runs.push(run);
    }

    const marks: CanvasVectorLine[] = options.cropMarks
      ? cropMarksFor(trimBox, bleedBox, markLen, markGap, markThickness)
      : [];

    pages.push({ pageNo, mediaBox, trimBox, bleedBox, runs, marks });
  }

  return { unit: 'pt', pages, fontFamilies: [...fontFamilies] };
}

function normalizeColor(color: string | undefined): string {
  if (!color) return '#000000';
  const hex = color.trim();
  return /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : '#000000';
}

/** 8 marcas de corte nos cantos do trim, no slug fora da sangria. */
function cropMarksFor(
  trimBox: PdfBox,
  bleedBox: PdfBox,
  markLen: number,
  markGap: number,
  thickness: number,
  color = '#000000'
): CanvasVectorLine[] {
  const [trimL, trimB, trimR, trimT] = trimBox;
  const [bleedL, bleedB, bleedR, bleedT] = bleedBox;
  const line = (x1: number, y1: number, x2: number, y2: number): CanvasVectorLine => ({
    x1,
    y1,
    x2,
    y2,
    thickness,
    color,
  });
  return [
    // cantos inferiores — horizontais
    line(bleedL - markGap - markLen, trimB, bleedL - markGap, trimB),
    line(bleedR + markGap, trimB, bleedR + markGap + markLen, trimB),
    // cantos inferiores — verticais
    line(trimL, bleedB - markGap - markLen, trimL, bleedB - markGap),
    line(trimR, bleedB - markGap - markLen, trimR, bleedB - markGap),
    // cantos superiores — horizontais
    line(bleedL - markGap - markLen, trimT, bleedL - markGap, trimT),
    line(bleedR + markGap, trimT, bleedR + markGap + markLen, trimT),
    // cantos superiores — verticais
    line(trimL, bleedT + markGap, trimL, bleedT + markGap + markLen),
    line(trimR, bleedT + markGap, trimR, bleedT + markGap + markLen),
  ];
}
