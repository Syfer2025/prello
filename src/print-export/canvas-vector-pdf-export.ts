/**
 * Exportação VETORIAL do conteúdo do canvas: texto selecionável + fonte embutida,
 * preservando o layout REAL do canvas-editor. É o caminho de qualidade para
 * offset — o passo seguinte (PDF/X-1a + CMYK + ICC) é feito pelo endpoint/CLI
 * local com Ghostscript.
 *
 * Não importa o editor vendorizado (mantém o acoplamento no CanvasEditorHost):
 * o conteúdo entra como CanvasLayoutSnapshot, lido pelo wrapper.
 */
import type { BookLayoutSettings } from '../canvas-editor/book-layout-settings';
import { snapshotToVectorDocument } from './canvas-vector-pdf';
import { renderCanvasVectorPdf, type FontSourceMap } from './canvas-vector-render';
import type { CanvasLayoutSnapshot } from './canvas-vector-types';

export interface SnapshotVectorExportInput {
  /** Layout REAL do canvas-editor (CanvasEditorHandle.getLayoutSnapshot()). */
  snapshot: CanvasLayoutSnapshot;
  bookLayout: BookLayoutSettings;
  /** TTFs por família/variante para embutir (fidelidade de glifos). */
  fonts: FontSourceMap;
  fallbackFamily?: string;
  bleedMm?: number;
  cropMarks?: boolean;
  cropMarkLengthMm?: number;
  cropMarkGapMm?: number;
}

/**
 * Exportação vetorial FIEL: serializa o layout que o canvas-editor já desenhou
 * (1:1 com a tela).
 */
export async function exportCanvasVectorPdfFromSnapshot(
  input: SnapshotVectorExportInput
): Promise<VectorPdfExportResult> {
  const doc = snapshotToVectorDocument(input.snapshot, input.bookLayout, {
    bleedMm: input.bleedMm,
    cropMarks: input.cropMarks,
    cropMarkLengthMm: input.cropMarkLengthMm,
    cropMarkGapMm: input.cropMarkGapMm,
  });
  const bytes = await renderCanvasVectorPdf(doc, {
    fonts: input.fonts,
    fallbackFamily: input.fallbackFamily,
  });
  return { bytes, pageCount: doc.pages.length, skipped: input.snapshot.skipped };
}

export interface VectorPdfExportResult {
  bytes: Uint8Array;
  pageCount: number;
  skipped: { images: number; tables: number; other: number };
}
