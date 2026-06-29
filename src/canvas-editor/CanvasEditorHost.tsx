import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import Editor, {
  EditorMode,
  PageMode,
  PaperDirection,
  RowFlex,
  TitleLevel,
  ListType,
  ListStyle,
  TextDecorationStyle,
  BlockType,
  ImageDisplay,
  WatermarkType,
  ElementType,
  type ICatalog,
  type IEditorData,
  type IEditorOption,
  type IEditorResult,
  type IWatermark,
  type IElement,
} from '../vendor/canvas-editor';
import type { CanvasDrawInternal } from './canvas-draw-internal';
import { readCanvasLayoutSnapshot } from './canvas-layout-snapshot';
import { applyHyphenation, stripAutoHyphens } from './canvas-hyphenation';
import {
  getFirstLineIndentManualActive,
  installCanvasWordJustificationPatch,
  toggleFirstLineIndentForSelection,
} from './canvas-word-justification';
import {
  createCanvasParagraphBreakElements,
  shouldHandleParagraphEnter,
} from './canvas-paragraph-break';
import type { CanvasLayoutSnapshot } from '../print-export/canvas-vector-types';

export {
  RowFlex,
  TitleLevel,
  ListType,
  ListStyle,
  PageMode,
  PaperDirection,
  BlockType,
  ImageDisplay,
  WatermarkType,
  TextDecorationStyle,
  EditorMode,
};
export type { ICatalog };

type GetImagePayload = Parameters<Editor['command']['getImage']>[0];

export interface CanvasEditorHandle {
  getValue(): IEditorResult;
  /**
   * Snapshot do layout REAL renderizado (posições/estilos por glifo), para a
   * exportação vetorial 1:1. Retorna null se o `Draw` interno não foi capturado.
   */
  getLayoutSnapshot(): CanvasLayoutSnapshot | null;
  getPageImages(pixelRatio?: number): Promise<string[]>;
  /**
   * Prepara uma rodada de exportacao raster em alta resolucao uma unica vez.
   * Depois disso, `getRenderedPageImage()` le cada canvas sem recomputar o
   * livro inteiro para cada pagina.
   */
  preparePageImageExport(pixelRatio?: number): Promise<number>;
  /**
   * Desfaz o pixel ratio alto da exportacao raster: volta a resolucao de tela e
   * re-renderiza preguicosamente, liberando as canvases gigantes da memoria.
   * Chamar SEMPRE depois de uma rodada de `preparePageImageExport`.
   */
  restoreAfterImageExport(): void;
  /**
   * Número total de páginas atualmente renderizadas no editor.
   */
  getPageCount(): number;
  /**
   * Renderiza e retorna uma página específica como data URL.
   * Preferível a `getPageImages()` para livros com muitas páginas,
   * pois evita alocar todas as páginas em memória simultaneamente.
   */
  getPageImage(index: number, pixelRatio?: number): Promise<string>;
  getRenderedPageImage(index: number): string;
  insertPageBreak(): void;
  insertSeparator(dashArray?: number[]): void;
  insertTable(rows: number, cols: number): void;
  insertImage(base64: string, width: number, height: number): void;
  /** Muda o modo de exibição da imagem clicada: em linha, bloco (acima/abaixo) ou contorno. */
  setImageDisplay(display: ImageDisplay): void;
  /** Há uma imagem selecionada/clicada agora? */
  hasSelectedImage(): boolean;
  insertHyperlink(url: string): void;
  insertBlock(): void;
  insertCheckbox(): void;
  insertRadio(): void;
  insertLaTeX(svg: string): void;
  insertDate(format?: string): void;
  addWatermark(text: string): void;
  deleteWatermark(): void;
  setPaperMargins(margins: [number, number, number, number]): void;
  setPageMode(mode: PageMode): void;
  setPaperSize(width: number, height: number): void;
  setPaperDirection(dir: PaperDirection): void;
  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  /** Escala atual do editor (1 = 100%). */
  getPageScale(): number;
  /** Rola a página informada (1-based) para o topo da área de edição. */
  scrollToPage(pageNum: number): void;
  toggleBold(): void;
  toggleItalic(): void;
  setFontFamily(family: string): void;
  setFontSize(size: number): void;
  sizeAdd(): void;
  sizeMinus(): void;
  setSuperscript(): void;
  setSubscript(): void;
  setColor(color: string | null): void;
  setHighlight(color: string | null): void;
  setUnderline(): void;
  setUnderlineDecoration(style?: TextDecorationStyle): void;
  setStrikeout(): void;
  setRowFlex(align: RowFlex): void;
  setRowMargin(value: number): void;
  /** Liga/desliga o recuo de 1ª linha no(s) parágrafo(s) selecionado(s). */
  toggleFirstLineIndent(): void;
  /** O parágrafo atual está com recuo de 1ª linha? (feedback do botão). */
  isFirstLineIndentActive(): boolean;
  setTitleLevel(level: TitleLevel | null): void;
  setList(type: ListType | null, style?: ListStyle): void;
  formatPainter(): void;
  clearFormatting(): void;
  search(query: string | null): void;
  searchNext(): void;
  searchPrev(): void;
  replace(replacement: string): void;
  print(): Promise<void>;
  getWordCount(): Promise<number>;
  getCatalog(): Promise<ICatalog | null>;
  locationCatalog(titleId: string): void;
  toggleFullscreen(): void;
  focus(): void;
}

interface CanvasEditorHostProps {
  data: IEditorData;
  options: IEditorOption;
  onChange?: () => void;
  onPageCountChange?: (pageCount: number) => void;
  /** Notifica quando o editor foi criado e já pode responder comandos. */
  onReady?: () => void;
  /** Liga a hifenização automática PT (fail-safe; default desligado). */
  enableAutoHyphenation?: boolean;
  /** Tamanho do recuo de 1ª linha em mm (0 = desligado). */
  firstLineIndentMm?: number;
  /** Se true, todo parágrafo do corpo recua automaticamente a 1ª linha. */
  firstLineIndentAuto?: boolean;
  /** Notifica se o parágrafo atual está recuado (para o feedback do botão). */
  onFirstLineIndentActiveChange?: (active: boolean) => void;
  /** Notifica a escala do editor (1 = 100%) ao mudar (botões ou ctrl+roda). */
  onPageScaleChange?: (scale: number) => void;
  /** Notifica quando uma imagem é clicada/selecionada (com a posição do clique). */
  onImageSelected?: (info: { x: number; y: number } | null) => void;
}

export const CanvasEditorHost = forwardRef<CanvasEditorHandle, CanvasEditorHostProps>(
  function CanvasEditorHost(
    {
      data,
      options,
      onChange,
      onPageCountChange,
      onReady,
      enableAutoHyphenation,
      firstLineIndentMm,
      firstLineIndentAuto,
      onFirstLineIndentActiveChange,
      onPageScaleChange,
      onImageSelected,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const drawRef = useRef<CanvasDrawInternal | null>(null);
    const fullscreenRef = useRef(false);
    // Config do recuo de 1ª linha, lida pelo patch de layout a cada render.
    const indentConfigRef = useRef<{ mm: number; auto: boolean }>({
      mm: firstLineIndentMm ?? 0,
      auto: firstLineIndentAuto ?? false,
    });
    // Callback de feedback do botão de recuo, via ref (mantém o listener estável).
    const notifyIndentRef = useRef<((active: boolean) => void) | undefined>(onFirstLineIndentActiveChange);
    notifyIndentRef.current = onFirstLineIndentActiveChange;
    // Callback de escala, via ref (idem) — segue o zoom por botão e por ctrl+roda.
    const notifyScaleRef = useRef<((scale: number) => void) | undefined>(onPageScaleChange);
    notifyScaleRef.current = onPageScaleChange;
    // Imagem clicada (alvo dos modos de exibição/contorno) + notificação ao shell.
    const selectedImageRef = useRef<IElement | null>(null);
    const notifyImageSelectedRef = useRef<typeof onImageSelected>(onImageSelected);
    notifyImageSelectedRef.current = onImageSelected;
    const notifyIndentActive = useCallback(() => {
      const draw = drawRef.current;
      if (!draw || !notifyIndentRef.current) return;
      try {
        notifyIndentRef.current(getFirstLineIndentManualActive(draw));
      } catch {
        /* noop */
      }
    }, []);

    // ── Hifenização PT sob demanda (fail-safe; nunca durante digitação) ──
    const hyphenatingRef = useRef(false);
    const hyphenDisabledRef = useRef(false);

    const runHyphenationForPrint = useCallback(() => {
      const draw = drawRef.current;
      if (!enableAutoHyphenation || hyphenDisabledRef.current || !draw || hyphenatingRef.current) {
        return false;
      }
      hyphenatingRef.current = true;
      try {
        applyHyphenation(draw);
        return true;
      } catch (error) {
        // Fail-safe: limpa hífens, restaura texto e desliga a feature nesta sessão.
        hyphenDisabledRef.current = true;
        console.warn('Hifenização automática desligada nesta sessão após erro:', error);
        try {
          stripAutoHyphens(draw);
          draw.render({ isCompute: true, isSubmitHistory: false });
        } catch {
          /* noop */
        }
        return false;
      } finally {
        // Mantém o guard ativo até o fim do macrotask para ignorar o contentChange
        // que o próprio render possa disparar (evita reentrância).
        setTimeout(() => {
          hyphenatingRef.current = false;
        }, 0);
      }
    }, [enableAutoHyphenation]);

    // Undo/redo restauram o snapshot com contentChange suprimido (isSourceHistory),
    // então limpamos hífens stale explicitamente, sem re-hifenizar durante edição.
    const afterHistoryRestore = useCallback(() => {
      const draw = drawRef.current;
      if (!enableAutoHyphenation || hyphenDisabledRef.current || !draw) return;
      try {
        const { removedAny } = stripAutoHyphens(draw);
        if (removedAny) draw.render({ isCompute: true, isSubmitHistory: false });
      } catch {
        /* noop */
      }
    }, [enableAutoHyphenation]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const editor = new Editor(container, data, options);
      const draw = editor.getDraw() as CanvasDrawInternal;
      editorRef.current = editor;
      drawRef.current = draw;
      hyphenDisabledRef.current = false;
      let uninstallWordJustification: () => void = () => undefined;
      if (draw) {
        try {
          uninstallWordJustification = installCanvasWordJustificationPatch(draw, {
            getFirstLineIndent: () => indentConfigRef.current,
          });
          draw.render({ isCompute: true, isSubmitHistory: false, isSetCursor: false });
        } catch (error) {
          console.warn('Justificação por espaços desligada nesta sessão após erro:', error);
        }
      }
      editor.listener.contentChange = () => {
        // Ignora mudanças induzidas por rotinas internas; edição do usuário fica leve.
        if (hyphenatingRef.current) return;
        onChange?.();
      };
      editor.listener.pageSizeChange = (pageCount) => onPageCountChange?.(pageCount);
      // Feedback do botão de recuo: re-avalia o parágrafo atual quando a seleção/estilo muda.
      editor.listener.rangeStyleChange = () => notifyIndentActive();
      // Mantém o % de zoom em sincronia (inclui ctrl+roda, que não passa pelos botões).
      editor.listener.pageScaleChange = (scale: number) => notifyScaleRef.current?.(scale);
      // Clique numa imagem: guarda o elemento (alvo do contorno) e avisa o shell
      // com a posição do clique (para a barrinha flutuante de opções da imagem).
      editor.eventBus.on('imageMousedown', (payload) => {
        selectedImageRef.current = payload.element ?? null;
        const evt = payload.evt as MouseEvent | undefined;
        notifyImageSelectedRef.current?.(
          evt ? { x: evt.clientX, y: evt.clientY } : { x: 0, y: 0 }
        );
      });
      notifyIndentActive(); // estado inicial
      onReady?.();

      const handleParagraphEnterKeyDown = (event: KeyboardEvent) => {
        if (!shouldHandleParagraphEnter(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        editor.command.executeInsertElementList(createCanvasParagraphBreakElements());
        notifyIndentActive();
      };
      container.addEventListener('keydown', handleParagraphEnterKeyDown, true);

      return () => {
        container.removeEventListener('keydown', handleParagraphEnterKeyDown, true);
        uninstallWordJustification();
        editor.destroy();
        editorRef.current = null;
        drawRef.current = null;
      };
    }, [data, options, onChange, onPageCountChange, onReady, notifyIndentActive]);

    // Atualiza a config do recuo e re-diagrama quando o usuário muda mm/auto.
    useEffect(() => {
      indentConfigRef.current = { mm: firstLineIndentMm ?? 0, auto: firstLineIndentAuto ?? false };
      const draw = drawRef.current;
      if (!draw) return;
      try {
        draw.render({ isCompute: true, isSubmitHistory: false });
      } catch {
        /* noop */
      }
      notifyIndentActive(); // o modo auto afeta o estado efetivo do botão
    }, [firstLineIndentMm, firstLineIndentAuto, notifyIndentActive]);

    useImperativeHandle(ref, () => {
      const preparePageImageExport = async (pixelRatio = 2) => {
        const draw = drawRef.current as Record<string, unknown> | null;
        if (!draw) throw new Error('Editor não está pronto');
        if (typeof draw.setPagePixelRatio === 'function') {
          draw.setPagePixelRatio(pixelRatio);
        }
        if (typeof draw.render === 'function') {
          draw.render({ isLazy: false, isCompute: false, isSetCursor: false, isSubmitHistory: false });
        }
        const observer = draw.imageObserver as { allSettled?: () => Promise<void> } | undefined;
        await observer?.allSettled?.();
        const list = draw.pageList;
        if (!Array.isArray(list)) throw new Error('pageList não disponível');
        return list.length;
      };

      const getRenderedPageImage = (index: number) => {
        const draw = drawRef.current as Record<string, unknown> | null;
        if (!draw) throw new Error('Editor não está pronto');
        const list = draw.pageList;
        if (!Array.isArray(list)) throw new Error('pageList não disponível');
        const canvas = list[index] as HTMLCanvasElement | undefined;
        if (!canvas) throw new Error(`Página ${index} não encontrada`);
        return canvas.toDataURL();
      };

      const restoreAfterImageExport = () => {
        const draw = drawRef.current as Record<string, unknown> | null;
        if (!draw) return;
        try {
          if (typeof draw.setPagePixelRatio === 'function') {
            draw.setPagePixelRatio(null); // null = volta ao devicePixelRatio de tela
          }
          if (typeof draw.render === 'function') {
            draw.render({ isLazy: true, isCompute: false, isSetCursor: false, isSubmitHistory: false });
          }
        } catch (error) {
          console.warn('Falha ao restaurar resolução após exportação raster:', error);
        }
      };

      return ({
      restoreAfterImageExport,
      getValue() {
        const editor = requireEditor(editorRef.current);
        // Remove hífens automáticos ANTES de serializar: o save/JSON fica limpo
        // (sem "-" no meio das palavras); a hifenização é re-derivada por reflow.
        const draw = drawRef.current;
        if (draw && enableAutoHyphenation) {
          const { removedAny } = stripAutoHyphens(draw);
          if (removedAny) {
            draw.render({ isCompute: true, isSubmitHistory: false });
          }
        }
        return editor.command.getValue();
      },
      getLayoutSnapshot() {
        const draw = drawRef.current;
        if (!draw) return null;
        const didHyphenateForSnapshot = runHyphenationForPrint();
        try {
          return readCanvasLayoutSnapshot(draw);
        } catch (error) {
          console.warn('Falha ao ler snapshot de layout do canvas-editor:', error);
          return null;
        } finally {
          if (didHyphenateForSnapshot) {
            try {
              const { removedAny } = stripAutoHyphens(draw);
              if (removedAny) {
                draw.render({ isCompute: true, isSubmitHistory: false, isSetCursor: false });
              }
            } catch {
              /* noop */
            }
          }
        }
      },
      getPageImages(pixelRatio = 2) {
        const editor = requireEditor(editorRef.current);
        const payload: GetImagePayload = { pixelRatio, mode: EditorMode.PRINT };
        return editor.command.getImage(payload);
      },
      preparePageImageExport,
      getPageCount() {
        const draw = drawRef.current as Record<string, unknown> | null;
        const list = draw?.pageList;
        return Array.isArray(list) ? list.length : 0;
      },
      async getPageImage(index: number, pixelRatio = 2) {
        await preparePageImageExport(pixelRatio);
        return getRenderedPageImage(index);
      },
      getRenderedPageImage,
      insertPageBreak() {
        requireEditor(editorRef.current).command.executePageBreak();
      },
      insertSeparator(dashArray?: number[]) {
        requireEditor(editorRef.current).command.executeSeparator(dashArray ?? []);
      },
      insertTable(rows: number, cols: number) {
        requireEditor(editorRef.current).command.executeInsertTable(rows, cols);
      },
      insertImage(base64: string, width: number, height: number) {
        requireEditor(editorRef.current).command.executeImage({ value: base64, width, height });
      },
      setImageDisplay(display: ImageDisplay) {
        const element = selectedImageRef.current;
        if (!element) return;
        // executeChangeImageDisplay usa o range atual (que está na imagem clicada)
        // para ancorar o contorno. Isso reflua o texto ao redor — nativo do motor.
        requireEditor(editorRef.current).command.executeChangeImageDisplay(element, display);
      },
      hasSelectedImage() {
        return selectedImageRef.current !== null;
      },
      insertHyperlink(url: string) {
        requireEditor(editorRef.current).command.executeHyperlink({ url, valueList: [{ value: url }] });
      },
      insertBlock() {
        requireEditor(editorRef.current).command.executeInsertElementList(
          [{ type: ElementType.BLOCK, value: '', block: {} } as IElement],
        );
      },
      insertCheckbox() {
        requireEditor(editorRef.current).command.executeInsertElementList(
          [{ type: ElementType.CHECKBOX, value: '☐' }] as IElement[],
        );
      },
      insertRadio() {
        requireEditor(editorRef.current).command.executeInsertElementList(
          [{ type: ElementType.RADIO, value: '○' }] as IElement[],
        );
      },
      insertLaTeX(svg: string) {
        requireEditor(editorRef.current).command.executeInsertElementList(
          [{ type: ElementType.LATEX, value: svg, laTexSVG: svg }] as unknown as IElement[],
        );
      },
      insertDate(format?: string) {
        const dateFormat = format || 'yyyy-MM-dd';
        requireEditor(editorRef.current).command.executeInsertElementList(
          [{ type: ElementType.DATE, value: '', dateFormat }] as unknown as IElement[],
        );
      },
      addWatermark(text: string) {
        const payload: IWatermark = { data: text, type: WatermarkType.TEXT, opacity: 0.3, size: 48, color: '#cccccc' };
        requireEditor(editorRef.current).command.executeAddWatermark(payload);
      },
      deleteWatermark() {
        requireEditor(editorRef.current).command.executeDeleteWatermark();
      },
      setPaperMargins(margins) {
        requireEditor(editorRef.current).command.executeSetPaperMargin(margins);
      },
      setPageMode(mode: PageMode) {
        requireEditor(editorRef.current).command.executePageMode(mode);
      },
      setPaperSize(width: number, height: number) {
        requireEditor(editorRef.current).command.executePaperSize(width, height);
      },
      setPaperDirection(dir: PaperDirection) {
        requireEditor(editorRef.current).command.executePaperDirection(dir);
      },
      undo() {
        requireEditor(editorRef.current).command.executeUndo();
        afterHistoryRestore();
      },
      redo() {
        requireEditor(editorRef.current).command.executeRedo();
        afterHistoryRestore();
      },
      zoomIn() {
        requireEditor(editorRef.current).command.executePageScaleAdd();
      },
      zoomOut() {
        requireEditor(editorRef.current).command.executePageScaleMinus();
      },
      zoomReset() {
        requireEditor(editorRef.current).command.executePageScaleRecovery();
      },
      getPageScale() {
        const editor = editorRef.current;
        if (!editor) return 1;
        const scale = editor.command.getOptions().scale;
        return typeof scale === 'number' && scale > 0 ? scale : 1;
      },
      scrollToPage(pageNum: number) {
        // Usa a lista de páginas do PRÓPRIO editor (API pública do vendor), em vez
        // de varrer o DOM global por classe CSS — fica restrito a esta instância.
        const draw = drawRef.current;
        if (!draw) return;
        const pages = draw.getPageList();
        const target = pageNum > 0 ? pages[pageNum - 1] : undefined;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      toggleBold() {
        requireEditor(editorRef.current).command.executeBold();
      },
      toggleItalic() {
        requireEditor(editorRef.current).command.executeItalic();
      },
      setFontFamily(family: string) {
        requireEditor(editorRef.current).command.executeFont(family);
      },
      setFontSize(size: number) {
        requireEditor(editorRef.current).command.executeSize(size);
      },
      sizeAdd() {
        requireEditor(editorRef.current).command.executeSizeAdd();
      },
      sizeMinus() {
        requireEditor(editorRef.current).command.executeSizeMinus();
      },
      setSuperscript() {
        requireEditor(editorRef.current).command.executeSuperscript();
      },
      setSubscript() {
        requireEditor(editorRef.current).command.executeSubscript();
      },
      setColor(color: string | null) {
        requireEditor(editorRef.current).command.executeColor(color);
      },
      setHighlight(color: string | null) {
        requireEditor(editorRef.current).command.executeHighlight(color);
      },
      setUnderline() {
        requireEditor(editorRef.current).command.executeUnderline();
      },
      setUnderlineDecoration(style?: TextDecorationStyle) {
        requireEditor(editorRef.current).command.executeUnderline(style ? { style } : undefined);
      },
      setStrikeout() {
        requireEditor(editorRef.current).command.executeStrikeout();
      },
      setRowFlex(align: RowFlex) {
        requireEditor(editorRef.current).command.executeRowFlex(align);
      },
      setRowMargin(value: number) {
        requireEditor(editorRef.current).command.executeRowMargin(value);
      },
      toggleFirstLineIndent() {
        const draw = drawRef.current;
        if (!draw) return;
        try {
          toggleFirstLineIndentForSelection(draw);
          notifyIndentActive(); // atualiza o feedback do botão imediatamente
        } catch (error) {
          console.warn('Falha ao alternar recuo de 1ª linha:', error);
        }
      },
      isFirstLineIndentActive() {
        const draw = drawRef.current;
        if (!draw) return false;
        try {
          return getFirstLineIndentManualActive(draw);
        } catch {
          return false;
        }
      },
      setTitleLevel(level: TitleLevel | null) {
        requireEditor(editorRef.current).command.executeTitle(level);
      },
      setList(type: ListType | null, style?: ListStyle) {
        requireEditor(editorRef.current).command.executeList(type, style);
      },
      formatPainter() {
        requireEditor(editorRef.current).command.executePainter({ isDblclick: false });
      },
      clearFormatting() {
        requireEditor(editorRef.current).command.executeFormat();
      },
      search(query: string | null) {
        // Limpa hífens automáticos antes de buscar: a string de busca une os
        // valores dos elementos; "palavra" hifenada viraria "pala-vra" e não casaria.
        const draw = drawRef.current;
        if (draw && enableAutoHyphenation && query) {
          const { removedAny } = stripAutoHyphens(draw);
          if (removedAny) draw.render({ isCompute: true, isSubmitHistory: false });
        }
        requireEditor(editorRef.current).command.executeSearch(query);
      },
      searchNext() {
        requireEditor(editorRef.current).command.executeSearchNavigateNext();
      },
      searchPrev() {
        requireEditor(editorRef.current).command.executeSearchNavigatePre();
      },
      replace(replacement: string) {
        requireEditor(editorRef.current).command.executeReplace(replacement);
      },
      print() {
        return requireEditor(editorRef.current).command.executePrint();
      },
      getWordCount() {
        return Promise.resolve(requireEditor(editorRef.current).command.getWordCount());
      },
      getCatalog() {
        return requireEditor(editorRef.current).command.getCatalog();
      },
      locationCatalog(titleId: string) {
        requireEditor(editorRef.current).command.executeLocationCatalog(titleId);
      },
      toggleFullscreen() {
        const el = containerRef.current;
        if (!el) return;
        if (fullscreenRef.current) {
          document.exitFullscreen();
          fullscreenRef.current = false;
        } else {
          el.requestFullscreen();
          fullscreenRef.current = true;
        }
      },
      focus() {
        requireEditor(editorRef.current).command.executeFocus();
      },
      });
    });

    return <div className="prelo-canvas-editor-host" ref={containerRef} />;
  }
);

function requireEditor(editor: Editor | null): Editor {
  if (!editor) throw new Error('Canvas editor is not ready');
  return editor;
}
