# AGENTS.md — Prelo Diagramador

Guia para agentes de IA que trabalham neste repositório. Comentários e mensagens ao usuário em **português (PT-BR)**.

## O que é

Prelo é um **editor de diagramação de livro no navegador**: o autor escreve/formata o miolo e exporta PDF para prova (raster) e para gráfica (offset, PDF/X-1a CMYK). O foco é tipografia de livro (margens espelhadas, recuo de 1ª linha, justificação, hifenização PT).

## Onde está o código ATIVO

O produto ativo é **`prelo-main/diagramador/src`** (este projeto). Stack: **React + Vite + TypeScript**, testes com **vitest**.

> Histórico: já existiu uma pasta aninhada `diagramador/diagramador/` e `prototipo-motor/` com um motor próprio legado. Elas foram removidas. Se algum material externo mencionar esses caminhos, trate como referência antiga.

## Arquitetura — fronteira importante

- O editor é o código vendorizado de **`canvas-editor@0.9.136`**, em **`src/vendor/canvas-editor/`**. O projeto não depende mais do pacote npm `@hufe921/canvas-editor`.
- **`src/canvas-editor/CanvasEditorHost.tsx`** é a fronteira de integração do Prelo com o vendor. `AppShell`/`CanvasEditorShell` não importam o vendor direto; há teste garantindo essa fronteira.
- **UI principal:** `src/product/CanvasEditorShell.tsx` (toolbar, sidebars, spread "lado a lado", export).
- **Persistência local:** `src/canvas-editor/canvas-persistence.ts` (localStorage).
- **Presets/medidas:** `src/canvas-editor/book-layout-settings.ts`, `prelo-canvas-units.ts`.
- **Export raster 300 DPI:** `src/print-export/canvas-raster-print-export.ts` (pdf-lib).
- **Export vetorial/offset:** `src/print-export/canvas-vector-*` + endpoint local `/api/pdfx` (Ghostscript) + `npm run pdfx`.

## Gotchas que mordem

1. **`Draw` é API pública do vendor local:** o Prelo expõe `Editor.getDraw()` em `src/vendor/canvas-editor/editor/index.ts` e o Host usa esse acessor. Não reintroduza hacks globais como interceptar `Function.prototype.bind`; justificação por palavra, snapshot de layout e export vetorial dependem desse acesso explícito.
2. **PDF é WYSIWYG:** a exportação serializa o **layout REAL** renderizado pelo canvas-editor (não re-diagrama). O canvas-editor é a autoridade de layout.
3. **"Lado a lado" é SÓ LEITURA:** spread de imagens das páginas (a lib prende cursor/seleção a 1 coluna vertical; layout em grid quebrava o clique). Ver `CanvasEditorShell` (`buildSpreads`, `openPairView`).
4. **Export raster trava em livros grandes:** ~17 MB/página A5 a 300 DPI → use o **vetorial** para livros grandes (já há aviso acima de 60 páginas).
5. **Vendor é código de terceiro sob MIT:** mantenha `src/vendor/canvas-editor/LICENSE`. O vendor tem `// @ts-nocheck` e é ignorado pelo ESLint para evitar reformatar/retrabalhar a base upstream inteira.
6. **Fontes:** só famílias **embutíveis** entram no PDF; `letterClass` PT evita quebra de palavra acentuada.

## Comandos

```bash
npm run dev          # Vite (porta 5173)
npm test             # vitest (suite completa)
npm run smoke:canvas # testes-chave de canvas/export
npm run lint         # eslint
npm run build        # tsc -b && vite build
npm run pdfx -- arquivo.pdf   # converte PDF vetorial em PDF/X-1a (Ghostscript local)
```

## Convenções de teste

Muitos testes em `src/product/*.test.ts` são **asserções sobre o código-fonte** (ex.: garantem que tal handler/CSS existe). Ao mudar a UI, atualize esses testes junto. Rode `npm test` + `npm run lint` + `npx tsc -b` antes de concluir.

## Estilo

- PT-BR em comentários e textos de UI.
- Combine com o código ao redor (densidade de comentário, nomes, idioma).
- Não commitar sem pedido explícito; export/ações externas exigem confirmação.
