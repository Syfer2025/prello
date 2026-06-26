# PDF vetorial -> PDF/X-1a CMYK (offset)

Status em 2026-06-24: a rota antiga que reconstituia o livro pelo motor proprio foi removida. O caminho atual usa o layout real ja desenhado pelo `@hufe921/canvas-editor`.

## Fluxo atual

1. `CanvasEditorHost.getLayoutSnapshot()` captura glifos, paginas, posicoes, fontes, estilos e contadores diretamente do canvas.
2. `snapshotToVectorDocument()` (`src/print-export/canvas-vector-pdf.ts`) converte coordenadas px -> pt, cria `MediaBox`, `TrimBox`, `BleedBox` e marcas de corte.
3. `renderCanvasVectorPdf()` (`src/print-export/canvas-vector-render.ts`) materializa o PDF com texto selecionavel, fontes TTF embutidas, cores, realces, sublinhado, tachado e tracking por run.
4. `exportCanvasVectorPdfFromSnapshot()` (`src/print-export/canvas-vector-pdf-export.ts`) orquestra snapshot -> documento vetorial -> bytes PDF.
5. O botao **Exportar PDF/X (offset)** envia o PDF vetorial para `POST /api/pdfx`.
6. `scripts/pdfx-vite-plugin.mjs` chama `scripts/pdfx-converter.mjs`, que roda Ghostscript local para PDF/X-1a + CMYK + OutputIntent ICC.
7. Se o endpoint local falhar, o app baixa `*-vetorial.pdf`, que ainda e texto vetorial/fonte embutida, mas nao e PDF/X.

## Propriedades do PDF vetorial

- Texto selecionavel.
- Fontes de livro embutidas a partir de `public/fonts`.
- Preto `#000000` emitido como DeviceGray antes da conversao, para virar K puro no PDF/X.
- Sangria estrutural de 3 mm.
- Marcas de corte de 5 mm com gap de 2 mm.
- `MediaBox`, `TrimBox` e `BleedBox` definidos antes do Ghostscript e restaurados depois da conversao.

## Limites honestos

- PDF/X + CMYK ainda dependem de Ghostscript fora do browser. Em desenvolvimento isso roda pelo Vite; em producao precisa de VPS/container/backend.
- Sem ICC da grafica, o conversor usa o ICC CMYK generico do Ghostscript.
- O app nao inventa arte sangrada. Se o miolo so tem texto em fundo branco, a sangria sera branca.
- Margens espelhadas ainda sao salvas como configuracao do livro, mas o preview do canvas usa margem global.
- Kerning/ligaduras avancadas dependem do que o canvas desenha no snapshot e de como o `pdf-lib` materializa cada run.

## Uso

1. Rodar o app com o dev server que instala o endpoint PDF/X.
2. Clicar **Exportar PDF/X (offset)**.
3. Conferir o arquivo final no Acrobat Preflight ou com a grafica antes de produzir.
4. Para converter manualmente um PDF vetorial: `npm run pdfx -- livro-vetorial.pdf --icc perfil.icc --condition "Coated FOGRA39"`.
