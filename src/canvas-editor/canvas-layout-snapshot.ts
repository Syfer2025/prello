/**
 * Lê o layout REAL renderizado pelo canvas-editor (via o `Draw` vendorizado
 * exposto pelo Editor) e o transforma num CanvasLayoutSnapshot
 * serializável — a entrada da exportação vetorial 1:1.
 *
 * Roda no browser (precisa do Draw vivo). A conversão para PDF é pura e mora em
 * print-export/canvas-vector-pdf.ts.
 */
import type { CanvasDrawInternal } from './canvas-draw-internal';
import type {
  CanvasLayoutGlyph,
  CanvasLayoutImage,
  CanvasLayoutSnapshot,
} from '../print-export/canvas-vector-types';

interface RawElement {
  value?: string;
  type?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  highlight?: string;
  underline?: boolean;
  strikeout?: boolean;
  rowFlex?: string;
}

interface RawPosition {
  pageNo: number;
  value: string;
  ascent: number;
  lineHeight?: number;
  metrics: { width: number; height: number };
  coordinate: { leftTop: number[]; leftBottom: number[] };
}

const SKIP_TYPES = new Set(['table', 'latex']);
const ZERO_WIDTH = '​';

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readCanvasLayoutSnapshot(draw: CanvasDrawInternal): CanvasLayoutSnapshot {
  const options = draw.getOptions() as { scale?: number; defaultFont?: string; defaultSize?: number };
  const scale = num(options.scale, 1) || 1;
  const defaultFont = typeof options.defaultFont === 'string' ? options.defaultFont : 'Crimson Text';
  const defaultSize = num(options.defaultSize, 13);

  const positionList = draw.getPosition().getOriginalPositionList() as unknown as RawPosition[];
  const elementList = draw.getOriginalMainElementList() as unknown as RawElement[];

  const glyphs: CanvasLayoutGlyph[] = [];
  const images: CanvasLayoutImage[] = [];
  const skipped = { images: 0, tables: 0, other: 0 };
  let maxPage = 0;

  const count = Math.min(positionList.length, elementList.length);
  for (let i = 0; i < count; i++) {
    const pos = positionList[i]!;
    const el = elementList[i] ?? {};
    maxPage = Math.max(maxPage, num(pos.pageNo));

    // Imagem: capturada ANTES do filtro de valor vazio (o pos.value de imagem
    // costuma ser vazio). Guarda posição/tamanho reais + os bytes base64.
    if (el.type === 'image') {
      const lt = pos.coordinate?.leftTop ?? [0, 0];
      const dataUrl = typeof el.value === 'string' ? el.value : '';
      if (dataUrl) {
        images.push({
          pageNo: num(pos.pageNo),
          x: num(lt[0]) / scale,
          yTop: num(lt[1]) / scale,
          width: num(pos.metrics?.width) / scale,
          height: num(pos.metrics?.height) / scale,
          dataUrl,
        });
      } else {
        skipped.images += 1;
      }
      continue;
    }

    const value = pos.value ?? el.value ?? '';
    if (value === '' || value === '\n' || value === ZERO_WIDTH) continue;

    const type = el.type;
    if (type && SKIP_TYPES.has(type)) {
      if (type === 'table') skipped.tables += 1;
      else skipped.other += 1;
      continue;
    }

    const leftTop = pos.coordinate?.leftTop ?? [0, 0];
    const leftBottom = pos.coordinate?.leftBottom ?? leftTop;
    const rowHeight = (num(leftBottom[1]) - num(leftTop[1])) || num(pos.lineHeight);

    const glyph: CanvasLayoutGlyph = {
      pageNo: num(pos.pageNo),
      x: num(leftTop[0]) / scale,
      yTop: num(leftTop[1]) / scale,
      ascent: num(pos.ascent) / scale,
      width: num(pos.metrics?.width) / scale,
      rowHeight: rowHeight / scale,
      value,
      fontFamily: el.font ?? defaultFont,
      fontSizePx: num(el.size, defaultSize),
      bold: !!el.bold,
      italic: !!el.italic,
      underline: !!el.underline,
      strikeout: !!el.strikeout,
    };
    if (el.color) glyph.color = el.color;
    if (el.highlight) glyph.highlight = el.highlight;
    if (el.rowFlex) glyph.rowFlex = el.rowFlex;
    glyphs.push(glyph);
  }

  return {
    pageWidthPx: num(draw.getOriginalWidth(), 559),
    pageHeightPx: num(draw.getOriginalHeight(), 794),
    pageCount: maxPage + 1,
    glyphs,
    images,
    skipped,
  };
}
