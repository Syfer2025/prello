/// <reference types="node" />
import { ElementType } from '@hufe921/canvas-editor';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from './canvas-persistence';
import { LONG_PORTUGUESE_MANUSCRIPT } from '../fixtures/long-portuguese-manuscript';
import { bookLayoutSettingsFromPreset } from './book-layout-settings';
import { renderCanvasImagesToPdf } from './canvas-pdf-export';
import {
  canvasPixelRatioForPrintDpi,
  preflightCanvasPrintExport,
} from '../print-export/canvas-raster-print-export';
import { loadCanvasProject, saveCanvasProject } from './canvas-persistence';
import { buildCanvasDocument } from './prelo-canvas-data';
import { mmToPt, PRELO_CANVAS_PRESETS } from './prelo-canvas-units';

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function hasChinese(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

describe('canvas editor smoke', () => {
  it('keeps the product wired through the Canvas adapter boundary', () => {
    const appShellSource = readFileSync(join(process.cwd(), 'src/product/AppShell.tsx'), 'utf8');
    const canvasShellSource = readFileSync(
      join(process.cwd(), 'src/product/CanvasEditorShell.tsx'),
      'utf8'
    );
    const hostSource = readFileSync(
      join(process.cwd(), 'src/canvas-editor/CanvasEditorHost.tsx'),
      'utf8'
    );

    expect(appShellSource).toContain(
      '<CanvasEditorShell onBack={handleBackToDashboard} onPersistProject={handlePersistActiveProject} />'
    );
    expect(appShellSource).not.toContain("from './EditorShell'");
    expect(appShellSource).not.toContain("from '../lab/MotorLab'");
    expect(appShellSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(canvasShellSource).not.toContain("from '@hufe921/canvas-editor'");
    expect(canvasShellSource).toContain('renderCanvasPrintPdf');
    expect(canvasShellSource).toContain('canvasPixelRatioForPrintDpi');
    expect(canvasShellSource).toContain('Total de Páginas');
    expect(canvasShellSource).toContain('Total de Palavras');
    expect(canvasShellSource).toContain('PDF');
    expect(canvasShellSource).toContain('Salvar');
    expect(canvasShellSource).toContain('Mostra duas paginas lado a lado');
    expect(hostSource).toContain("from '@hufe921/canvas-editor'");
    expect(hostSource).toContain('EditorMode.PRINT');
    expect(hostSource).toContain('executePageBreak');
    expect(hostSource).toContain('executeSetPaperMargin');
  });

  it('runs the manuscript to persistence to raster PDF contract without browser UI', async () => {
    const manuscript = `Capitulo 1\n\n${LONG_PORTUGUESE_MANUSCRIPT}\n\nCapítulo 2\n\n${LONG_PORTUGUESE_MANUSCRIPT}`;
    const bookLayout = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);
    const built = buildCanvasDocument({
      title: 'A Cidade de Papel',
      manuscript,
      bookLayout,
    });
    const pageBreakCount = built.data.main.filter(
      (element) => element.type === ElementType.PAGE_BREAK
    ).length;

    expect(built.options).toMatchObject({
      locale: 'en',
      pageMode: 'paging',
      width: 559,
      height: 794,
      margins: [64, 53, 64, 64],
    });
    expect(pageBreakCount).toBe(2);
    expect(hasChinese(JSON.stringify(built))).toBe(false);

    const store = fakeStore();
    saveCanvasProject(store, {
      name: 'A Cidade de Papel',
      bookLayout,
      editor: {
        version: '0.9.136',
        data: built.data,
        options: built.options,
      },
    });
    const loaded = loadCanvasProject(store);
    expect(loaded?.name).toBe('A Cidade de Papel');
    expect(loaded?.bookLayout.marginsMm.inside).toBe(17);
    expect(loaded?.editor.data.main.length).toBe(built.data.main.length);

    const simulatedPageImages = Array.from({ length: pageBreakCount + 1 }, () => ONE_BY_ONE_PNG);
    const pdfBytes = await renderCanvasImagesToPdf(simulatedPageImages, bookLayout);
    const pdf = await PDFDocument.load(pdfBytes);

    expect(pdfBytes.byteLength).toBeGreaterThan(500);
    expect(pdf.getPageCount()).toBe(simulatedPageImages.length);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(mmToPt(PRELO_CANVAS_PRESETS.a5.widthMm), 4);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(mmToPt(PRELO_CANVAS_PRESETS.a5.heightMm), 4);

    expect(canvasPixelRatioForPrintDpi()).toBeCloseTo(3.125, 6);
    expect(
      preflightCanvasPrintExport(simulatedPageImages, bookLayout).blockingIssues[0]
    ).toContain('minimo exigido: 300 DPI');
  });
});
