# AGENTS.md — Prelo Diagramador

Guia para agentes de IA que trabalham neste repositório. Comentários e mensagens ao usuário em **português (PT-BR)**.

## O que é

Prelo é um **editor de diagramação de livro no navegador**: o autor escreve/formata o miolo e exporta PDF para prova (raster) e para gráfica (offset, PDF/X-1a CMYK). O foco é tipografia de livro (margens espelhadas, recuo de 1ª linha, justificação, hifenização PT).

## Onde está o código ATIVO

O produto ativo é **`prelo-main/diagramador/src`** (este projeto). Stack: **React + Vite + TypeScript**, testes com **vitest**.

> ⚠️ Existe uma pasta aninhada `diagramador/diagramador/` e `prototipo-motor/` com o **motor próprio LEGADO** (Knuth-Plass via `tex-linebreak`, engine/model/render). **Não é o produto ativo** — o dev server não a builda e o ESLint a ignora (`globalIgnores(['dist','diagramador'])`). Não edite essas pastas achando que é o app.

## Arquitetura — fronteira importante

- O editor é a lib **`@hufe921/canvas-editor`**, encapsulada em **`src/canvas-editor/CanvasEditorHost.tsx`**. Essa é a ÚNICA fronteira que pode importar a lib — há teste garantindo que `AppShell`/`CanvasEditorShell` **não** importem `@hufe921/canvas-editor` direto. Ao trocar/atualizar a lib, mexa só no Host.
- **UI principal:** `src/product/CanvasEditorShell.tsx` (toolbar, sidebars, spread "lado a lado", export).
- **Persistência local:** `src/canvas-editor/canvas-persistence.ts` (localStorage).
- **Presets/medidas:** `src/canvas-editor/book-layout-settings.ts`, `prelo-canvas-units.ts`.
- **Export raster 300 DPI:** `src/print-export/canvas-raster-print-export.ts` (pdf-lib).
- **Export vetorial/offset:** `src/print-export/canvas-vector-*` + endpoint local `/api/pdfx` (Ghostscript) + `npm run pdfx`.

## Gotchas que mordem

1. **Hack frágil mas deliberado:** `src/canvas-editor/canvas-draw-access.ts` captura o `Draw` interno da lib interceptando `Function.prototype.bind` numa janela síncrona (restaurada no `finally`). Disso dependem justificação por palavra, snapshot de layout e export vetorial. Está **pinado em `@hufe921/canvas-editor@0.9.136`**. Se a captura falhar, o Host loga `console.error` e os recursos avançados caem — qualquer upgrade da lib precisa revalidar este arquivo.
2. **PDF é WYSIWYG:** a exportação serializa o **layout REAL** renderizado pelo canvas-editor (não re-diagrama). O canvas-editor é a autoridade de layout.
3. **"Lado a lado" é SÓ LEITURA:** spread de imagens das páginas (a lib prende cursor/seleção a 1 coluna vertical; layout em grid quebrava o clique). Ver `CanvasEditorShell` (`buildSpreads`, `openPairView`).
4. **Export raster trava em livros grandes:** ~17 MB/página A5 a 300 DPI → use o **vetorial** para livros grandes (já há aviso acima de 60 páginas).
5. **Fontes:** só famílias **embutíveis** entram no PDF; `letterClass` PT evita quebra de palavra acentuada.

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
