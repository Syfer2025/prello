/**
 * Tipos compartilhados da exportação VETORIAL fiel ao canvas-editor.
 *
 * A ideia central: NÃO re-diagramar. O canvas-editor já computou o layout de
 * cada glifo (página, x/y, ascent, largura — com justificação e quebras já
 * aplicadas). Capturamos esse layout (CanvasLayoutSnapshot) e o serializamos
 * direto para PDF. Assim o PDF é, por construção, 1:1 com o que está na tela.
 *
 * Unidades do snapshot: PIXELS do canvas (96 dpi), já NORMALIZADOS pelo zoom
 * (divididos por `scale`), e relativos ao topo-esquerdo de CADA página.
 */

/** Um glifo posicionado, como o canvas-editor o desenhou. */
export interface CanvasLayoutGlyph {
  pageNo: number;
  /** x da borda esquerda do glifo (px, relativo à página). */
  x: number;
  /** y do TOPO da linha do glifo (px, relativo à página). */
  yTop: number;
  /** distância do topo da linha até a baseline (px). */
  ascent: number;
  /** largura de avanço do glifo (px) — já inclui a inflação da justificação. */
  width: number;
  /** altura da linha (px) — usado para realce de fundo. */
  rowHeight: number;
  value: string;
  fontFamily: string;
  /** corpo da fonte em px (tamanho base, sem zoom). */
  fontSizePx: number;
  bold: boolean;
  italic: boolean;
  /** cor do texto (#rrggbb); ausente = preto. */
  color?: string;
  /** cor de realce/fundo (#rrggbb). */
  highlight?: string;
  underline: boolean;
  strikeout: boolean;
  /** alinhamento do parágrafo da linha (left/center/right/justify/alignment). */
  rowFlex?: string;
}

export interface CanvasLayoutSnapshot {
  /** largura da página em px (base, sem zoom) — getOriginalWidth(). */
  pageWidthPx: number;
  /** altura da página em px (base, sem zoom) — getOriginalHeight(). */
  pageHeightPx: number;
  pageCount: number;
  glyphs: CanvasLayoutGlyph[];
  skipped: { images: number; tables: number; other: number };
}

/** Variante tipográfica de um run, para escolher o TTF embutido correto. */
export type FontVariantKey = 'regular' | 'italic' | 'bold' | 'boldItalic';

export function variantKey(bold: boolean, italic: boolean): FontVariantKey {
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}

/** Caixa PDF [x0, y0, x1, y1] em pontos (origem inferior-esquerda). */
export type PdfBox = [number, number, number, number];

/** Um run pronto para desenhar: texto contíguo, mesmo estilo, mesma linha. */
export interface CanvasVectorRun {
  text: string;
  /** x da baseline inicial (pt). */
  x: number;
  /** y da baseline (pt, origem inferior-esquerda). */
  y: number;
  /** largura total do run (pt) — soma das larguras de avanço. */
  width: number;
  fontSize: number;
  fontFamily: string;
  variant: FontVariantKey;
  color: string;
  backgroundColor?: string;
  underline: boolean;
  strikethrough: boolean;
  /** altura da linha (pt) — para o retângulo de realce. */
  lineHeight: number;
}

export interface CanvasVectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  color: string;
}

export interface CanvasVectorPage {
  pageNo: number;
  mediaBox: PdfBox;
  trimBox: PdfBox;
  bleedBox: PdfBox;
  runs: CanvasVectorRun[];
  marks: CanvasVectorLine[];
}

export interface CanvasVectorDocument {
  unit: 'pt';
  pages: CanvasVectorPage[];
  /** famílias usadas no documento (para o chamador resolver os TTFs). */
  fontFamilies: string[];
}
