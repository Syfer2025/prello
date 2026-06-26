# Canvas print export audit

Date: 2026-06-23

## Current state

The Canvas editor now exports a raster PDF through `src/print-export/canvas-raster-print-export.ts`.

This export path:

- captures Canvas pages at the pixel ratio required for 300 DPI
- validates PNG dimensions before accepting the export
- blocks export if any captured page is below the target DPI
- writes PDF pages with physical size in points
- sets MediaBox, TrimBox, and BleedBox to the page size
- keeps a report with blocking issues and limitations

## What this solves

This is no longer the previous low-resolution draft export. For Canvas pages based on 96 CSS pixels per inch, the 300 DPI capture ratio is:

```text
300 / 96 = 3.125
```

The product shell now calls `getPageImages(canvasPixelRatioForPrintDpi())`, then sends those images to `renderCanvasPrintPdf()`.

## Preflight status panel (UI honesty layer)

The right sidebar of `CanvasEditorShell` renders a "Preflight de Exportação" card built from `buildPrintExportPreflight(report)` in `src/print-export/canvas-raster-print-export.ts`.

It reports one item per print capability, each with status `ok` / `pending` / `blocked`:

- **Raster DPI** — `pending` before export, then `ok` or `blocked` from the measured `minEffectiveDpi`.
- **PDF boxes (Media/Trim/Bleed)** — `pending` before export, then `ok`.
- **PDF/X**, **CMYK**, **OutputIntent ICC**, **Texto vetorial/selecionável** — always `pending`. These are not implemented, so the checklist must never show them as `ok`. A unit test (`never claims PDF/X, CMYK, ICC OutputIntent or selectable text are supported`) enforces this invariant.

`handleExportPdf` measures `preflightCanvasPrintExport()` first and stores the report so the panel shows the real result even when the export is blocked. The export button is labelled "Exportar PDF 300 DPI (raster)" — deliberately not "print-ready" or "PDF/X".

## What this still does not solve

This is a print-quality raster PDF path, not a complete professional PDF/X pipeline.

Still missing:

- PDF/X-1a, PDF/X-3, or PDF/X-4 conformance
- CMYK conversion
- OutputIntent ICC embedding
- selectable/vector text
- true bleed content beyond trim
- mirrored inside/outside margin rendering in Canvas preview

## Vector (offset) export — implemented

The raster path above is still a proof/preview export. The offset route is now snapshot-based and does not reuse the deleted Prelo engine.

1. **Canvas snapshot** — `CanvasEditorHost.getLayoutSnapshot()` captures the real layout drawn by the canvas editor: page size, page count, glyphs, positions, styles and skipped non-text objects.
2. **In-browser vector PDF** — `exportCanvasVectorPdfFromSnapshot()` (`src/print-export/canvas-vector-pdf-export.ts`) converts that snapshot through:
   - `snapshotToVectorDocument()` (`src/print-export/canvas-vector-pdf.ts`)
   - `renderCanvasVectorPdf()` (`src/print-export/canvas-vector-render.ts`)
3. **Print structure** — the product button requests 3 mm bleed, 5 mm crop marks, and 2 mm mark gap. The PDF gets expanded `MediaBox`, explicit `TrimBox`/`BleedBox`, and visible crop marks.
4. **Local endpoint, PDF/X-1a CMYK** — `POST /api/pdfx` in the Vite dev server (`scripts/pdfx-vite-plugin.mjs`) receives the vector PDF, runs the shared Ghostscript converter, restores page boxes, and returns `*-pdfx.pdf`.
5. **CLI fallback** — `npm run pdfx -- livro-vetorial.pdf [--gray] [--icc p.icc] [--condition "..."]` uses the same converter (`scripts/pdfx-converter.mjs`).

### Honest limits of the vector/offset path

- PDF/X + CMYK + ICC still happen outside the browser. In local dev, the Vite endpoint runs Ghostscript; in production this must become a server/VPS/container endpoint.
- Without a custom ICC, the converter uses Ghostscript's generic `default_cmyk.icc`, not a printer-specific profile.
- Crop marks and 3 mm bleed are structural and visible, but the app does not invent bleed artwork.
- Mirrored inside/outside margins per odd/even page are stored as book settings, but Canvas preview still uses global margins.
- Images/tables are counted as skipped by the snapshot export until vector/raster placement support is added.

Do not market the raster export as PDF/X or CMYK-ready. The vector snapshot + local PDF/X endpoint is the offset route. Always confirm with the printer's preflight before production.
