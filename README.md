# Prelo Diagramador

Editor de livro no navegador baseado em `@hufe921/canvas-editor`, com fluxo local de exportacao PDF para prova e offset.

## Stack atual

- React + Vite + TypeScript.
- `@hufe921/canvas-editor` encapsulado em `src/canvas-editor/CanvasEditorHost.tsx`.
- UI principal em `src/product/CanvasEditorShell.tsx`.
- Persistencia local em `src/canvas-editor/canvas-persistence.ts`.
- Presets e medidas de livro em `src/canvas-editor/book-layout-settings.ts` e `src/canvas-editor/prelo-canvas-units.ts`.
- Exportacao raster 300 DPI em `src/print-export/canvas-raster-print-export.ts`.
- Exportacao vetorial por snapshot real do Canvas em `src/print-export/canvas-vector-*`.
- Conversao local PDF/X-1a CMYK via Ghostscript em `scripts/pdfx-*`.

## Comandos

```bash
npm run dev
npm run smoke:canvas
npm test
npm run lint
npm run build
```

## Exportacao

- **PDF 300 DPI (raster):** prova visual, nao e PDF/X nem texto selecionavel.
- **PDF/X (offset):** gera PDF vetorial do snapshot real do Canvas e envia para o endpoint local `/api/pdfx`.
- Se o endpoint local falhar, o app baixa `*-vetorial.pdf`, que ainda precisa ser convertido com `npm run pdfx -- arquivo.pdf`.

## Observacoes

- O codigo legado do motor proprio, editor antigo, laboratorio e demos foi removido.
- O browser nao faz CMYK/PDF/X sozinho; em producao, o passo Ghostscript precisa rodar em backend/VPS/container.
- Sempre validar o PDF final com a grafica ou Acrobat Preflight antes de tiragem.
