/**
 * Renderiza um CanvasVectorDocument num PDF real via pdf-lib.
 *
 * NÃO recalcula layout: materializa runs já posicionados (pt, Y invertido).
 * Diferenças-chave do renderer antigo do motor:
 *  - múltiplas variantes de fonte (regular/itálico/negrito/negrito-itálico),
 *    escolhidas por run — então negrito e itálico aparecem de verdade no PDF;
 *  - "character spacing" (Tc) por run para bater a largura-alvo exata da linha,
 *    reproduzindo o tracking de justificação do canvas-editor;
 *  - preto #000000 sai como DeviceGray (K puro), bom para offset.
 *
 * Cor: RGB aqui. PDF/X + CMYK + ICC ficam no pós-processo (Ghostscript).
 */
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  StandardFonts,
  degrees,
  grayscale,
  rgb,
  setCharacterSpacing,
  type Color,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type {
  CanvasVectorDocument,
  CanvasVectorRun,
  FontVariantKey,
  PdfBox,
} from './canvas-vector-types';

export type FontBytes = Uint8Array | ArrayBuffer;
/** TTFs por família e variante. Faltando uma variante, cai em regular. */
export type FontSourceMap = Record<string, Partial<Record<FontVariantKey, FontBytes>>>;

export interface RenderCanvasVectorOptions {
  fonts: FontSourceMap;
  /** Família usada quando o run pede uma família sem TTF disponível. */
  fallbackFamily?: string;
  /**
   * Subsetar a fonte embutida. Padrão: false (embute a fonte completa).
   * O subset do @pdf-lib/fontkit no bundle do browser produz glyf inválido
   * (texto sai em branco no PDF); embutir a fonte inteira é confiável e, para
   * um miolo de livro com poucas famílias, o tamanho extra é irrelevante.
   */
  subset?: boolean;
}

function hexToColor(hex: string): Color {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return grayscale(0);
  const n = parseInt(match[1]!, 16);
  if (n === 0) return grayscale(0); // preto puro -> DeviceGray (K)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function applyBox(page: PDFPage, setter: 'setMediaBox' | 'setTrimBox' | 'setBleedBox', box: PdfBox) {
  const [x0, y0, x1, y1] = box;
  page[setter](x0, y0, x1 - x0, y1 - y0);
}

function toUint8(bytes: FontBytes): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/** Resolve e cacheia PDFFonts por família/variante, com cadeia de fallback. */
class FontResolver {
  private cache = new Map<string, PDFFont>();
  private helvetica: PDFFont | null = null;
  private readonly pdf: PDFDocument;
  private readonly fonts: FontSourceMap;
  private readonly fallbackFamily?: string;
  private readonly subset: boolean;

  constructor(pdf: PDFDocument, fonts: FontSourceMap, fallbackFamily?: string, subset = false) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.fallbackFamily = fallbackFamily;
    this.subset = subset;
  }

  async init(): Promise<void> {
    this.pdf.registerFontkit(fontkit);
    this.helvetica = await this.pdf.embedFont(StandardFonts.Helvetica);
  }

  /** Retorna a fonte e se ela é "sintética" para itálico (precisa de skew). */
  async resolve(
    family: string,
    variant: FontVariantKey
  ): Promise<{ font: PDFFont; fauxItalic: boolean }> {
    const fauxItalic = this.needsFauxItalic(family, variant);
    const key = `${family}|${variant}`;
    const cached = this.cache.get(key);
    if (cached) return { font: cached, fauxItalic };

    const bytes = this.pickBytes(family, variant);
    let font: PDFFont;
    if (bytes) {
      font = await this.pdf.embedFont(toUint8(bytes), { subset: this.subset });
    } else {
      font = this.helvetica!;
    }
    this.cache.set(key, font);
    return { font, fauxItalic };
  }

  private family(name: string): Partial<Record<FontVariantKey, FontBytes>> | undefined {
    return this.fonts[name] ?? (this.fallbackFamily ? this.fonts[this.fallbackFamily] : undefined);
  }

  private pickBytes(family: string, variant: FontVariantKey): FontBytes | undefined {
    const f = this.family(family);
    if (!f) return this.fallbackFamily ? this.fonts[this.fallbackFamily]?.regular : undefined;
    // cadeia: variante pedida -> negrito/itálico relaxado -> regular
    if (variant === 'boldItalic') return f.boldItalic ?? f.bold ?? f.italic ?? f.regular;
    if (variant === 'bold') return f.bold ?? f.regular;
    if (variant === 'italic') return f.italic ?? f.regular;
    return f.regular ?? f.bold ?? f.italic;
  }

  private needsFauxItalic(family: string, variant: FontVariantKey): boolean {
    if (variant !== 'italic' && variant !== 'boldItalic') return false;
    const f = this.family(family);
    if (!f) return false;
    if (variant === 'italic') return !f.italic && !!f.regular;
    return !f.boldItalic && !f.italic && (!!f.bold || !!f.regular);
  }
}

export async function renderCanvasVectorPdf(
  doc: CanvasVectorDocument,
  options: RenderCanvasVectorOptions
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const resolver = new FontResolver(pdf, options.fonts, options.fallbackFamily, options.subset ?? false);
  await resolver.init();

  for (const pagePlacement of doc.pages) {
    const [, , mediaW, mediaH] = pagePlacement.mediaBox;
    const page = pdf.addPage([mediaW, mediaH]);
    applyBox(page, 'setMediaBox', pagePlacement.mediaBox);
    applyBox(page, 'setBleedBox', pagePlacement.bleedBox);
    applyBox(page, 'setTrimBox', pagePlacement.trimBox);

    for (const mark of pagePlacement.marks) {
      page.drawLine({
        start: { x: mark.x1, y: mark.y1 },
        end: { x: mark.x2, y: mark.y2 },
        thickness: mark.thickness,
        color: hexToColor(mark.color),
      });
    }

    for (const run of pagePlacement.runs) {
      if (run.text.length === 0) continue;
      const { font, fauxItalic } = await resolver.resolve(run.fontFamily, run.variant);
      drawRun(page, run, font, fauxItalic);
    }
  }

  return pdf.save({ useObjectStreams: false });
}

function drawRun(page: PDFPage, run: CanvasVectorRun, font: PDFFont, fauxItalic: boolean): void {
  const color = hexToColor(run.color);

  // Tc: espaçamento por glifo para bater a largura-alvo (tracking de justificação).
  const natural = safeWidth(font, run.text, run.fontSize);
  const glyphCount = [...run.text].length;
  const charSpacing = glyphCount > 0 ? (run.width - natural) / glyphCount : 0;

  if (run.backgroundColor) {
    page.drawRectangle({
      x: run.x,
      y: run.y - run.fontSize * 0.22,
      width: run.width,
      height: run.lineHeight > 0 ? run.lineHeight : run.fontSize * 1.15,
      color: hexToColor(run.backgroundColor),
    });
  }

  // Aplica Tc, desenha, e zera para não vazar para a próxima run.
  if (charSpacing !== 0) page.pushOperators(setCharacterSpacing(charSpacing));
  page.drawText(run.text, {
    x: run.x,
    y: run.y,
    size: run.fontSize,
    font,
    color,
    // itálico sintético quando não há TTF itálico: leve inclinação horizontal.
    ...(fauxItalic ? { rotate: degrees(0), xSkew: degrees(12), ySkew: degrees(0) } : {}),
  });
  if (charSpacing !== 0) page.pushOperators(setCharacterSpacing(0));

  drawDecorations(page, run, color);
}

function drawDecorations(page: PDFPage, run: CanvasVectorRun, color: Color): void {
  if (!run.underline && !run.strikethrough) return;
  const thickness = Math.max(0.35, run.fontSize / 18);
  if (run.underline) {
    const y = run.y - run.fontSize * 0.12;
    page.drawLine({ start: { x: run.x, y }, end: { x: run.x + run.width, y }, thickness, color });
  }
  if (run.strikethrough) {
    const y = run.y + run.fontSize * 0.3;
    page.drawLine({ start: { x: run.x, y }, end: { x: run.x + run.width, y }, thickness, color });
  }
}

function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    // glifos fora da fonte (ex.: subset) — aproxima por largura média.
    return text.length * size * 0.5;
  }
}
