import { PDFDocument } from 'pdf-lib';
import { dataUrlToBytes, type CanvasPdfPageSize } from '../canvas-editor/canvas-pdf-export';
import { MM_PER_INCH, PX_PER_INCH, mmToPt } from '../canvas-editor/prelo-canvas-units';

export const DEFAULT_PRINT_DPI = 300;

export interface RasterPagePixels {
  widthPx: number;
  heightPx: number;
}

export interface RasterDpiReport {
  dpiX: number;
  dpiY: number;
  effectiveDpi: number;
}

export interface CanvasPrintExportReport {
  targetDpi: number;
  pageCount: number;
  minEffectiveDpi: number;
  blockingIssues: string[];
  warnings: string[];
  isPrintReadyRaster: boolean;
}

export interface CanvasPrintPdfResult {
  bytes: Uint8Array;
  report: CanvasPrintExportReport;
}

export function canvasPixelRatioForPrintDpi(targetDpi = DEFAULT_PRINT_DPI): number {
  if (!Number.isFinite(targetDpi) || targetDpi <= 0) {
    throw new RangeError('Target DPI must be a positive number');
  }
  return targetDpi / PX_PER_INCH;
}

export function inspectPngDataUrl(dataUrl: string): RasterPagePixels {
  const bytes = dataUrlToBytes(dataUrl);
  if (!isPng(bytes)) {
    throw new Error('Invalid PNG page image data URL');
  }
  if (ascii(bytes, 12, 16) !== 'IHDR') {
    throw new Error('Invalid PNG page image data URL');
  }
  return {
    widthPx: readUint32(bytes, 16),
    heightPx: readUint32(bytes, 20),
  };
}

export function effectiveRasterDpi(
  pixels: RasterPagePixels,
  pageSize: CanvasPdfPageSize
): RasterDpiReport {
  const widthInches = pageSize.widthMm / MM_PER_INCH;
  const heightInches = pageSize.heightMm / MM_PER_INCH;
  const dpiX = widthInches > 0 ? pixels.widthPx / widthInches : 0;
  const dpiY = heightInches > 0 ? pixels.heightPx / heightInches : 0;
  return { dpiX, dpiY, effectiveDpi: Math.min(dpiX, dpiY) };
}

export function preflightCanvasPrintExport(
  pageDataUrls: string[],
  pageSize: CanvasPdfPageSize,
  targetDpi = DEFAULT_PRINT_DPI
): CanvasPrintExportReport {
  const blockingIssues: string[] = [];
  const warnings = [
    'PDF rasterizado: texto e vetores saem como imagem.',
    'Nao e PDF/X e nao contem OutputIntent ICC.',
    'Nao converte RGB para CMYK.',
  ];

  if (pageDataUrls.length === 0) {
    blockingIssues.push('Cannot export print PDF without page images.');
  }
  if (pageSize.widthMm <= 0 || pageSize.heightMm <= 0) {
    blockingIssues.push('Page size must be positive.');
  }

  const pageDpis = pageDataUrls.map((dataUrl, index) => {
    const dpi = effectiveRasterDpi(inspectPngDataUrl(dataUrl), pageSize);
    if (dpi.effectiveDpi + 0.0001 < targetDpi) {
      blockingIssues.push(
        `Pagina ${index + 1} rasterizada a ${Math.round(dpi.effectiveDpi)} DPI efetivo; minimo exigido: ${targetDpi} DPI.`
      );
    }
    return dpi.effectiveDpi;
  });
  const minEffectiveDpi = pageDpis.length ? Math.min(...pageDpis) : 0;

  return {
    targetDpi,
    pageCount: pageDataUrls.length,
    minEffectiveDpi,
    blockingIssues,
    warnings,
    isPrintReadyRaster: blockingIssues.length === 0,
  };
}

export type PreflightStatus = 'ok' | 'pending' | 'blocked';

export type PreflightCheckId =
  | 'rasterDpi'
  | 'pdfBoxes'
  | 'pdfX'
  | 'cmyk'
  | 'outputIntent'
  | 'vectorText';

export interface PrintExportPreflightItem {
  id: PreflightCheckId;
  label: string;
  status: PreflightStatus;
  detail: string;
}

/**
 * Constroi um checklist honesto do que a exportacao raster entrega de fato.
 *
 * `report === null` representa "antes de exportar": o que depende da captura
 * (DPI e boxes) fica `pending`. Depois da exportacao, DPI vira `ok`/`blocked`
 * conforme a medicao real e os boxes viram `ok`.
 *
 * Os quatro itens profissionais (PDF/X, CMYK, OutputIntent ICC e texto
 * vetorial) sao sempre `pending` de proposito: pdf-lib + captura raster nao os
 * implementam. Nunca devem aparecer como `ok` enquanto nao forem feitos de
 * verdade — ha teste garantindo isso.
 */
export function buildPrintExportPreflight(
  report: CanvasPrintExportReport | null
): PrintExportPreflightItem[] {
  const targetDpi = report?.targetDpi ?? DEFAULT_PRINT_DPI;
  const rasterOk =
    report !== null &&
    report.pageCount > 0 &&
    report.minEffectiveDpi + 0.0001 >= targetDpi;

  return [
    {
      id: 'rasterDpi',
      label: `Resolucao raster (${targetDpi} DPI)`,
      status: report === null ? 'pending' : rasterOk ? 'ok' : 'blocked',
      detail:
        report === null
          ? `Sera medido ao exportar. Alvo: ${targetDpi} DPI.`
          : rasterOk
            ? `OK: ${Math.round(report.minEffectiveDpi)} DPI efetivo em ${report.pageCount} pagina(s).`
            : `Abaixo do alvo: ${Math.round(report.minEffectiveDpi)} DPI efetivo (minimo ${targetDpi}).`,
    },
    {
      id: 'pdfBoxes',
      label: 'PDF boxes (Media/Trim/Bleed)',
      status: report === null ? 'pending' : 'ok',
      detail:
        report === null
          ? 'MediaBox, TrimBox e BleedBox serao definidos no tamanho fisico da pagina.'
          : 'OK: MediaBox, TrimBox e BleedBox definidos no tamanho fisico da pagina.',
    },
    {
      id: 'pdfX',
      label: 'PDF/X (1a/3/4)',
      status: 'pending',
      detail: 'Pendente: pdf-lib nao gera conformidade PDF/X. Requer pipeline externo.',
    },
    {
      id: 'cmyk',
      label: 'CMYK',
      status: 'pending',
      detail: 'Pendente: a saida e RGB. Conversao CMYK exige pos-processamento.',
    },
    {
      id: 'outputIntent',
      label: 'OutputIntent ICC',
      status: 'pending',
      detail: 'Pendente: nenhum perfil de cor ICC e embutido no PDF.',
    },
    {
      id: 'vectorText',
      label: 'Texto vetorial/selecionavel',
      status: 'pending',
      detail: 'Pendente: o texto sai rasterizado como imagem; nao e selecionavel.',
    },
  ];
}

export async function renderCanvasPrintPdf(
  pageDataUrls: string[],
  pageSize: CanvasPdfPageSize,
  targetDpi = DEFAULT_PRINT_DPI
): Promise<CanvasPrintPdfResult> {
  const report = preflightCanvasPrintExport(pageDataUrls, pageSize, targetDpi);
  if (report.blockingIssues.length > 0) {
    throw new Error(report.blockingIssues[0]);
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle('Prelo print raster export');
  pdf.setCreator('Prelo');
  pdf.setProducer('Prelo Canvas raster print export');
  pdf.setSubject(`${targetDpi} DPI raster PDF`);
  pdf.setKeywords(['Prelo', 'raster', `${targetDpi} DPI`]);

  const pageWidthPt = mmToPt(pageSize.widthMm);
  const pageHeightPt = mmToPt(pageSize.heightMm);

  for (const dataUrl of pageDataUrls) {
    const image = await pdf.embedPng(dataUrlToBytes(dataUrl));
    const page = pdf.addPage([pageWidthPt, pageHeightPt]);
    page.setMediaBox(0, 0, pageWidthPt, pageHeightPt);
    page.setTrimBox(0, 0, pageWidthPt, pageHeightPt);
    page.setBleedBox(0, 0, pageWidthPt, pageHeightPt);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    });
  }

  return {
    bytes: await pdf.save({ useObjectStreams: false }),
    report,
  };
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 256 ** 3 +
    bytes[offset + 1]! * 256 ** 2 +
    bytes[offset + 2]! * 256 +
    bytes[offset + 3]!
  );
}
