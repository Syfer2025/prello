import { describe, expect, it } from 'vitest';
import { readCanvasLayoutSnapshot } from './canvas-layout-snapshot';
import type { CanvasDrawInternal } from './canvas-draw-internal';

/** Constrói um Draw falso com positionList/elementList paralelos. */
function fakeDraw(
  positions: Array<{
    pageNo: number;
    value: string;
    ascent: number;
    width: number;
    x: number;
    yTop: number;
    height?: number;
  }>,
  elements: Array<Record<string, unknown>>,
  options: Record<string, unknown> = {}
): CanvasDrawInternal {
  const positionList = positions.map((p) => ({
    pageNo: p.pageNo,
    value: p.value,
    ascent: p.ascent,
    lineHeight: p.height ?? 16,
    metrics: { width: p.width, height: p.height ?? 16 },
    coordinate: {
      leftTop: [p.x, p.yTop],
      leftBottom: [p.x, p.yTop + (p.height ?? 16)],
    },
  }));
  return {
    getOriginalMainElementList: () => elements,
    getOriginalWidth: () => 559,
    getOriginalHeight: () => 794,
    getWidth: () => 559,
    getHeight: () => 794,
    getMargins: () => [64, 53, 64, 64],
    getPageGap: () => 20,
    getOptions: () => ({ scale: 1, defaultFont: 'Crimson Text', defaultSize: 13, ...options }),
    getPosition: () => ({
      getPositionList: () => positionList,
      getOriginalPositionList: () => positionList,
      getMainPositionList: () => positionList,
    }),
  } as unknown as CanvasDrawInternal;
}

describe('readCanvasLayoutSnapshot', () => {
  it('lê glifos com estilo do elemento paralelo e pula zero-width/newline', () => {
    const positions = [
      { pageNo: 0, value: '​', ascent: 10, width: 0, x: 64, yTop: 64 },
      { pageNo: 0, value: 'A', ascent: 10, width: 8, x: 64, yTop: 64 },
      { pageNo: 0, value: '\n', ascent: 10, width: 0, x: 72, yTop: 64 },
      { pageNo: 0, value: 'b', ascent: 10, width: 6, x: 64, yTop: 80 },
    ];
    const elements = [
      { value: '​' },
      { value: 'A', font: 'Lora', size: 20, bold: true, rowFlex: 'justify' },
      { value: '\n' },
      { value: 'b', italic: true, color: '#ff0000' },
    ];
    const snap = readCanvasLayoutSnapshot(fakeDraw(positions, elements));
    expect(snap.pageWidthPx).toBe(559);
    expect(snap.glyphs).toHaveLength(2);
    const [a, b] = snap.glyphs;
    expect(a).toMatchObject({ value: 'A', fontFamily: 'Lora', fontSizePx: 20, bold: true, rowFlex: 'justify' });
    expect(b).toMatchObject({ value: 'b', italic: true, color: '#ff0000', fontFamily: 'Crimson Text', fontSizePx: 13 });
  });

  it('normaliza coordenadas pelo zoom (scale)', () => {
    const positions = [{ pageNo: 0, value: 'A', ascent: 20, width: 16, x: 128, yTop: 128, height: 32 }];
    const elements = [{ value: 'A', size: 26 }];
    const snap = readCanvasLayoutSnapshot(fakeDraw(positions, elements, { scale: 2 }));
    const g = snap.glyphs[0]!;
    // valores /scale
    expect(g.x).toBe(64);
    expect(g.yTop).toBe(64);
    expect(g.ascent).toBe(10);
    expect(g.width).toBe(8);
    expect(g.rowHeight).toBe(16);
    // tamanho da fonte é base (não escalado)
    expect(g.fontSizePx).toBe(26);
  });

  it('conta páginas, captura imagens e pula tabelas', () => {
    const positions = [
      { pageNo: 0, value: 'A', ascent: 10, width: 8, x: 64, yTop: 64 },
      { pageNo: 1, value: 'B', ascent: 10, width: 8, x: 64, yTop: 64 },
      { pageNo: 1, value: '', ascent: 10, width: 120, x: 72, yTop: 80, height: 90 },
      { pageNo: 1, value: ' ', ascent: 10, width: 0, x: 80, yTop: 64 },
    ];
    const elements = [
      { value: 'A' },
      { value: 'B' },
      { value: 'data:image/png;base64,iVBORw0KGgo=', type: 'image' },
      { value: ' ', type: 'table' },
    ];
    const snap = readCanvasLayoutSnapshot(fakeDraw(positions, elements));
    expect(snap.pageCount).toBe(2);
    expect(snap.glyphs.map((g) => g.value)).toEqual(['A', 'B']);
    // imagem agora é CAPTURADA (não pulada) com posição/tamanho reais + base64.
    expect(snap.skipped.images).toBe(0);
    expect(snap.skipped.tables).toBe(1);
    expect(snap.images).toHaveLength(1);
    expect(snap.images![0]).toMatchObject({
      pageNo: 1,
      x: 72,
      yTop: 80,
      width: 120,
      height: 90,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
  });
});
