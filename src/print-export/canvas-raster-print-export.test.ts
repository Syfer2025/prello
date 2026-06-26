import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  buildPrintExportPreflight,
  canvasPixelRatioForPrintDpi,
  effectiveRasterDpi,
  inspectPngDataUrl,
  preflightCanvasPrintExport,
  renderCanvasPrintPdf,
} from './canvas-raster-print-export';
import { mmToPt, PRELO_CANVAS_PRESETS } from '../canvas-editor/prelo-canvas-units';

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('canvas raster print export', () => {
  it('computes the Canvas pixel ratio required for 300 DPI output', () => {
    expect(canvasPixelRatioForPrintDpi(300)).toBeCloseTo(3.125, 6);
    expect(canvasPixelRatioForPrintDpi(300) * 96).toBeCloseTo(300, 6);
  });

  it('reads PNG dimensions before accepting the raster as print quality', () => {
    expect(inspectPngDataUrl(ONE_BY_ONE_PNG)).toEqual({ widthPx: 1, heightPx: 1 });
  });

  it('computes effective raster DPI from pixels over physical page size', () => {
    expect(
      effectiveRasterDpi({ widthPx: 300, heightPx: 300 }, { widthMm: 25.4, heightMm: 25.4 })
    ).toEqual({ dpiX: 300, dpiY: 300, effectiveDpi: 300 });
  });

  it('blocks A5 export when the captured page image is below 300 DPI', () => {
    const report = preflightCanvasPrintExport([ONE_BY_ONE_PNG], PRELO_CANVAS_PRESETS.a5);

    expect(report.blockingIssues).toContain(
      'Pagina 1 rasterizada a 0 DPI efetivo; minimo exigido: 300 DPI.'
    );
    expect(report.isPrintReadyRaster).toBe(false);
  });

  it('renders a loadable raster print PDF with physical page boxes when DPI passes', async () => {
    const onePixelAt300Dpi = 25.4 / 300;
    const pageSize = { widthMm: onePixelAt300Dpi, heightMm: onePixelAt300Dpi };

    const { bytes, report } = await renderCanvasPrintPdf([ONE_BY_ONE_PNG], pageSize);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const media = page.getMediaBox();
    const trim = page.getTrimBox();
    const bleed = page.getBleedBox();

    expect(report.isPrintReadyRaster).toBe(true);
    expect(report.warnings).toContain('PDF rasterizado: texto e vetores saem como imagem.');
    expect(report.warnings).toContain('Nao e PDF/X e nao contem OutputIntent ICC.');
    expect(report.warnings).toContain('Nao converte RGB para CMYK.');
    expect(pdf.getPageCount()).toBe(1);
    expect(media.width).toBeCloseTo(mmToPt(onePixelAt300Dpi), 6);
    expect(media.height).toBeCloseTo(mmToPt(onePixelAt300Dpi), 6);
    expect(trim).toMatchObject(media);
    expect(bleed).toMatchObject(media);
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});

describe('print export preflight checklist (honest capabilities)', () => {
  const ADVANCED_IDS = ['pdfX', 'cmyk', 'outputIntent', 'vectorText'] as const;
  const onePixelAt300Dpi = 25.4 / 300;

  function byId(items: ReturnType<typeof buildPrintExportPreflight>, id: string) {
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error(`missing preflight item ${id}`);
    return item;
  }

  function passingReport() {
    const report = preflightCanvasPrintExport([ONE_BY_ONE_PNG], {
      widthMm: onePixelAt300Dpi,
      heightMm: onePixelAt300Dpi,
    });
    expect(report.isPrintReadyRaster).toBe(true);
    return report;
  }

  it('lists exactly one labelled, explained item per print capability', () => {
    const checks = buildPrintExportPreflight(null);
    expect(checks.map((check) => check.id)).toEqual([
      'rasterDpi',
      'pdfBoxes',
      'pdfX',
      'cmyk',
      'outputIntent',
      'vectorText',
    ]);
    for (const check of checks) {
      expect(check.label.length).toBeGreaterThan(0);
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });

  it('keeps raster DPI and PDF boxes pending before any export runs', () => {
    const checks = buildPrintExportPreflight(null);
    expect(byId(checks, 'rasterDpi').status).toBe('pending');
    expect(byId(checks, 'pdfBoxes').status).toBe('pending');
  });

  it('never claims PDF/X, CMYK, ICC OutputIntent or selectable text are supported', () => {
    for (const report of [null, passingReport()]) {
      const checks = buildPrintExportPreflight(report);
      for (const id of ADVANCED_IDS) {
        expect(byId(checks, id).status).toBe('pending');
      }
    }
  });

  it('confirms raster DPI and PDF boxes once a passing report exists', () => {
    const checks = buildPrintExportPreflight(passingReport());
    expect(byId(checks, 'rasterDpi').status).toBe('ok');
    expect(byId(checks, 'pdfBoxes').status).toBe('ok');
  });

  it('flags raster DPI as blocked when the captured page is below target', () => {
    const report = preflightCanvasPrintExport([ONE_BY_ONE_PNG], PRELO_CANVAS_PRESETS.a5);
    const checks = buildPrintExportPreflight(report);
    expect(byId(checks, 'rasterDpi').status).toBe('blocked');
  });
});
