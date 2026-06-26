import { ElementType } from '@hufe921/canvas-editor';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from './canvas-persistence';
import { bookLayoutSettingsFromPreset } from './book-layout-settings';
import { renderCanvasImagesToPdf } from './canvas-pdf-export';
import { loadCanvasProject, saveCanvasProject } from './canvas-persistence';
import { buildCanvasDocument } from './prelo-canvas-data';
import { PRELO_CANVAS_PRESETS } from './prelo-canvas-units';

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

interface StressResult {
  targetPages: number;
  manuscriptChars: number;
  elementCount: number;
  pageBreakCount: number;
  serializedBytes: number;
  buildMs: number;
  persistMs: number;
  pdfMs: number;
  pdfBytes: number;
}

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function makeStressManuscript(targetPages: number): string {
  const paragraphsPerChapter = 6;
  const chapterCount = targetPages;
  const paragraph =
    'A pagina de teste precisa carregar texto suficiente para validar construcao, persistencia e exportacao raster sem depender da interface visual do navegador.';
  const chapters: string[] = [];

  for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
    const paragraphs = Array.from(
      { length: paragraphsPerChapter },
      (_, index) => `${paragraph} Capitulo ${chapter}, bloco ${index + 1}.`
    );
    chapters.push(`Capitulo ${chapter}\n\n${paragraphs.join('\n\n')}`);
  }

  return chapters.join('\n\n');
}

async function runStressCase(targetPages: number): Promise<StressResult> {
  const manuscript = makeStressManuscript(targetPages);
  const bookLayout = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);

  const buildStart = performance.now();
  const built = buildCanvasDocument({
    title: `Stress ${targetPages}`,
    manuscript,
    bookLayout,
  });
  const buildMs = performance.now() - buildStart;

  const store = fakeStore();
  const persistStart = performance.now();
  saveCanvasProject(store, {
    name: `Stress ${targetPages}`,
    bookLayout,
    editor: {
      version: '0.9.136',
      data: built.data,
      options: built.options,
    },
  });
  const loaded = loadCanvasProject(store);
  const persistMs = performance.now() - persistStart;

  if (!loaded) {
    throw new Error(`Stress ${targetPages}: persisted project did not reload`);
  }

  const pageBreakCount = built.data.main.filter(
    (element) => element.type === ElementType.PAGE_BREAK
  ).length;
  const simulatedPageImages = Array.from({ length: targetPages }, () => ONE_BY_ONE_PNG);

  const pdfStart = performance.now();
  const pdfBytes = await renderCanvasImagesToPdf(simulatedPageImages, bookLayout);
  const pdf = await PDFDocument.load(pdfBytes);
  const pdfMs = performance.now() - pdfStart;

  expect(pdf.getPageCount()).toBe(targetPages);
  expect(loaded.editor.data.main.length).toBe(built.data.main.length);

  return {
    targetPages,
    manuscriptChars: manuscript.length,
    elementCount: built.data.main.length,
    pageBreakCount,
    serializedBytes: JSON.stringify(loaded).length,
    buildMs,
    persistMs,
    pdfMs,
    pdfBytes: pdfBytes.byteLength,
  };
}

describe('canvas editor stress', () => {
  it('handles large manuscript contracts for 50, 100 and 200 simulated pages', async () => {
    const results: StressResult[] = [];

    for (const targetPages of [50, 100, 200]) {
      results.push(await runStressCase(targetPages));
    }

    for (const result of results) {
      expect(result.pageBreakCount).toBe(result.targetPages);
      expect(result.elementCount).toBeGreaterThan(result.targetPages * 800);
      expect(result.serializedBytes).toBeGreaterThan(result.elementCount * 30);
      expect(result.buildMs).toBeLessThan(1_500);
      expect(result.persistMs).toBeLessThan(1_500);
      expect(result.pdfMs).toBeLessThan(3_000);
      expect(result.pdfBytes).toBeGreaterThan(result.targetPages * 300);
    }

    console.table(
      results.map((result) => ({
        pages: result.targetPages,
        chars: result.manuscriptChars,
        elements: result.elementCount,
        storageKb: Math.round(result.serializedBytes / 1024),
        pdfKb: Math.round(result.pdfBytes / 1024),
        buildMs: Math.round(result.buildMs),
        persistMs: Math.round(result.persistMs),
        pdfMs: Math.round(result.pdfMs),
      }))
    );
  });
});
