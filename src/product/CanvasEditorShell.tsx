import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CanvasEditorHost,
  type CanvasEditorHandle,
  type CanvasImageSelectionInfo,
  type CanvasImageWrapSettings,
  RowFlex,
  ListType,
  ListStyle,
  ImageDisplay,
  type ICatalog,
} from '../canvas-editor/CanvasEditorHost';
import { CANVAS_STORAGE_KEY, loadCanvasProject, saveCanvasProject } from '../canvas-editor/canvas-persistence';
import {
  loadFirstLineIndentAuto,
  loadFirstLineIndentMm,
  saveFirstLineIndentAuto,
  saveFirstLineIndentMm,
} from '../canvas-editor/first-line-indent-preferences';
import {
  bookLayoutSettingsFromPreset,
  canvasMarginsFromBookLayout,
  canvasOptionsForBookLayout,
  hasInexactMirroredMarginPreview,
  PT_LETTER_CLASS,
  type BookLayoutMarginsMm,
  type BookLayoutSettings,
  type ChapterStartRule,
} from '../canvas-editor/book-layout-settings';
import {
  buildCanvasDocument,
  type BuiltCanvasDocument,
} from '../canvas-editor/prelo-canvas-data';
import {
  PRELO_PARAGRAPH_STYLE_LIST,
  getPreloParagraphStyleCanvasMapping,
  preloStyleToTitleLevel,
  type PreloParagraphStyleId,
} from '../canvas-editor/prelo-paragraph-styles';
import type { PreloCanvasBookPreset } from '../canvas-editor/prelo-canvas-types';
import {
  PRELO_CANVAS_PRESET_LIST,
  PRELO_CANVAS_PRESETS,
} from '../canvas-editor/prelo-canvas-units';
import {
  buildPrintExportPreflight,
  canvasPixelRatioForPrintDpi,
  CanvasPrintExportError,
  renderCanvasPrintPdfFromPreparedPages,
  type CanvasPrintExportReport,
  type PreflightStatus,
} from '../print-export/canvas-raster-print-export';
import {
  analyzeCanvasTypography,
  type TypographicPreflightReport,
} from '../print-export/canvas-typographic-preflight';
import { exportCanvasVectorPdfFromSnapshot } from '../print-export/canvas-vector-pdf-export';
import {
  BOOK_FONT_FAMILIES,
  DEFAULT_BOOK_FONT_FAMILY,
  loadFontSourceMap,
  preloadBookFonts,
} from '../fonts/book-fonts';
import { LONG_PORTUGUESE_MANUSCRIPT } from '../fixtures/long-portuguese-manuscript';
import { createPngAlphaContourFromDataUrl } from '../canvas-editor/png-alpha-contour';

/** Apenas fontes de livro EMBUTÍVEIS (sistema não embute com segurança). */
const FONT_FAMILIES = BOOK_FONT_FAMILIES;

const CURATED_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', 
  '#22c55e', '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6', 
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', 
  '#f43f5e', '#64748b', '#71717a', '#333333', '#111827'
];

const TOOLTIPS = {
  projectName: 'Renomeia o projeto salvo no navegador.',
  undo: 'Desfaz a ultima alteracao feita no editor.',
  redo: 'Refaz a ultima alteracao desfeita.',
  formatPainter: 'Copia a formatacao do texto selecionado para aplicar em outro trecho.',
  clearFormatting: 'Remove formatacoes diretas e volta o texto para o estilo basico.',
  bold: 'Liga ou desliga negrito no texto selecionado.',
  italic: 'Liga ou desliga italico no texto selecionado.',
  underline: 'Liga ou desliga sublinhado no texto selecionado.',
  strikeout: 'Liga ou desliga texto riscado no texto selecionado.',
  superscript: 'Coloca o texto selecionado acima da linha, como expoente.',
  subscript: 'Coloca o texto selecionado abaixo da linha.',
  sizeMinus: 'Diminui o tamanho da fonte no texto selecionado.',
  sizeAdd: 'Aumenta o tamanho da fonte no texto selecionado.',
  fontFamily: 'Escolhe a familia tipografica do texto selecionado.',
  fontSize: 'Define o tamanho da fonte do texto selecionado.',
  rowMargin: 'Ajusta o espacamento vertical entre linhas e paragrafos.',
  color: 'Altera a cor do texto selecionado.',
  highlight: 'Aplica uma cor de realce atras do texto selecionado.',
  list: 'Transforma o paragrafo atual em lista numerada, bullet ou checklist.',
  title1: 'Aplica estilo de titulo principal ao paragrafo.',
  title2: 'Aplica estilo de subtitulo de segundo nivel.',
  title3: 'Aplica estilo de subtitulo de terceiro nivel.',
  title4: 'Aplica estilo de subtitulo de quarto nivel.',
  title5: 'Aplica estilo de subtitulo de quinto nivel.',
  title6: 'Aplica estilo de subtitulo de sexto nivel.',
  separator: 'Insere uma linha horizontal no documento.',
  tableRows: 'Define quantas linhas a nova tabela tera.',
  tableCols: 'Define quantas colunas a nova tabela tera.',
  insertTable: 'Insere uma tabela com a quantidade de linhas e colunas configurada.',
  insertImage: 'Insere uma imagem do computador no documento.',
  hyperlinkUrl: 'Digite a URL que sera usada no link.',
  insertHyperlink: 'Cria um link usando a URL informada.',
  checkbox: 'Insere uma caixa de marcacao no documento.',
  radio: 'Insere um botao de opcao no documento.',
  date: 'Insere a data no ponto atual do texto.',
  block: 'Insere um bloco especial do Canvas Editor.',
  zoomOut: 'Reduz o zoom da area de edicao.',
  zoomReset: 'Volta o zoom para o tamanho padrao.',
  zoomIn: 'Aumenta o zoom da area de edicao.',
  pageMode: 'Alterna entre visualizacao paginada e fluxo continuo.',
  paperDirection: 'Alterna a pagina entre retrato e paisagem.',
  watermarkText: 'Texto que sera usado como marca d agua.',
  addWatermark: 'Adiciona a marca d agua ao documento.',
  deleteWatermark: 'Remove a marca d agua atual.',
  searchQuery: 'Texto que voce quer encontrar no documento.',
  search: 'Busca o termo digitado no documento.',
  searchPrev: 'Vai para o resultado anterior da busca.',
  searchNext: 'Vai para o proximo resultado da busca.',
  replaceText: 'Texto que substituira o resultado atual da busca.',
  replace: 'Substitui o resultado atual da busca pelo texto informado.',
  pageBreak: 'Forca o proximo conteudo a comecar em uma nova pagina.',
  exportPdf: 'Exporta o livro em PDF raster a 300 DPI. Nao e PDF/X, CMYK, ICC nem texto selecionavel.',
  exportVector: 'Gera PDF/X-1a CMYK com texto vetorial, sangria de 3 mm e marcas de corte pelo Ghostscript local. Se o endpoint local falhar, baixa o PDF vetorial sem conversao PDF/X.',
  preflight: 'Status honesto do que a exportacao raster entrega e do que ainda falta para grafica profissional.',
  typographicPreflight: 'Analisa o layout renderizado para encontrar problemas tipograficos antes do PDF final.',
  print: 'Abre a impressao nativa do navegador para o documento.',
  save: 'Salva o projeto atual no armazenamento local do navegador.',
  pairView: 'Mostra duas paginas lado a lado para revisar o livro.',
  fullscreen: 'Coloca o editor em tela cheia.',
  bookPreset: 'Aplica tamanho e margens base de um formato de livro.',
  bookWidth: 'Define a largura final do miolo do livro em milimetros.',
  bookHeight: 'Define a altura final do miolo do livro em milimetros.',
  marginTop: 'Define a margem superior da pagina.',
  marginInside: 'Define a margem interna, do lado da lombada.',
  marginOutside: 'Define a margem externa, do lado do corte.',
  marginBottom: 'Define a margem inferior da pagina.',
  facingPages: 'Guarda o livro como frente e verso; Canvas ainda usa margem global no preview.',
  chapterStart: 'Define como capitulos novos devem iniciar no fluxo do livro.',
  mirroredWarning: 'Canvas ainda usa margem global no preview; dentro/fora ficam salvos no Prelo.',
} as const;

const FormatPainterIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 22 1-1c1.4-1.4 2.4-3.2 3-5.2L18 9H6l2 6.8c.6 2 1.6 3.8 3 5.2Z"></path><path d="M18 9V6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v3"></path></svg>;
const BoldIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>;
const ItalicIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>;
const UnderlineIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"></path><line x1="4" y1="20" x2="20" y2="20"></line></svg>;
const StrikeoutIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h11.5a4.5 4.5 0 0 1 0 9H5"></path><path d="M7.5 13h11.5a4.5 4.5 0 0 1 0 9H5"></path><line x1="3" y1="12" x2="21" y2="12"></line></svg>;
const HighlightIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h9l3-3"></path><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"></path></svg>;
const SizeMinusIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path></svg>;
const SizeAddIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"></path></svg>;
const TableIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="12" y1="3" x2="12" y2="21"></line></svg>;
const ImageIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>;
const BlockIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M21 16V8a2 2 0 0 0-2-2h-3"></path><path d="M3 8v8a2 2 0 0 0 2 2h3"></path></svg>;
const SearchIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const PrevIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const NextIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;
const ReplaceIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>;
const SaveIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>;
const PDFIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
const PrintIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>;
const PairViewIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="9" height="18" rx="1"></rect><rect x="13" y="3" width="9" height="18" rx="1"></rect></svg>;
const SettingsIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const BugIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>;
const ExportIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>;
const ChevronLeftIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const UndoIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-1"></path></svg>;
const RedoIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h1"></path></svg>;


const ALIGNMENTS: { value: RowFlex; label: string; tooltip: string; icon: React.ReactNode }[] = [
  {
    value: RowFlex.LEFT,
    label: 'Esquerda',
    tooltip: 'Alinha o paragrafo selecionado a esquerda.',
    icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="15" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
  },
  {
    value: RowFlex.CENTER,
    label: 'Centro',
    tooltip: 'Centraliza o paragrafo selecionado.',
    icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
  },
  {
    value: RowFlex.RIGHT,
    label: 'Direita',
    tooltip: 'Alinha o paragrafo selecionado a direita.',
    icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="9" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
  },
  {
    // ALIGNMENT = justificado profissional: distribui todas as linhas, MENOS a
    // última do parágrafo (que fica natural). RowFlex.JUSTIFY esticaria também a
    // última linha — visual amador. Como o PDF serializa o editor, isto melhora
    // os dois ao mesmo tempo.
    value: RowFlex.ALIGNMENT,
    label: 'Justificado',
    tooltip: 'Justifica o texto ocupando a largura da linha (última linha natural).',
    icon: <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="17" y2="18"></line></svg>
  },
];

/** Acima disto, a exportação raster (300 DPI) avisa que pode travar o navegador. */
const RASTER_EXPORT_PAGE_WARNING_THRESHOLD = 60;

/** Limites do zoom do spread "lado a lado" (o editor ao vivo tem o seu próprio). */
const SPREAD_ZOOM_MIN = 0.5;
const SPREAD_ZOOM_MAX = 3;
const SPREAD_ZOOM_STEP = 0.1;

/** Uma página dentro de um spread, ou `null` para o slot vazio (esquerda da 1ª). */
type SpreadSlot = { pageNo: number; img: string } | null;

/** Organiza as imagens em spreads de livro aberto: 1 sozinha à direita, depois pares. */
function buildSpreads(images: string[]): SpreadSlot[][] {
  const slots: SpreadSlot[] = images.map((img, i) => ({ pageNo: i + 1, img }));
  const first = slots[0];
  if (!first) return [];
  if (slots.length === 1) return [[first]];
  const spreads: SpreadSlot[][] = [[null, first]];
  for (let i = 1; i < slots.length; i += 2) {
    spreads.push([slots[i] ?? null, slots[i + 1] ?? null]);
  }
  return spreads;
}

interface CanvasShellState {
  projectName: string;
  bookLayout: BookLayoutSettings;
  document: BuiltCanvasDocument;
  dirty: boolean;
}

function loadInitialCanvasShellState(): CanvasShellState {
  if (typeof window !== 'undefined') {
    const saved = loadCanvasProject(window.localStorage);
    if (saved) {
      return {
        projectName: saved.name,
        bookLayout: saved.bookLayout,
        document: {
          data: saved.editor.data,
          options: saved.editor.options,
        },
        dirty: false,
      };
    }
  }

  const bookLayout = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);
  return {
    projectName: 'A Cidade de Papel',
    bookLayout,
    document: buildCanvasDocument({
      title: 'A Cidade de Papel',
      manuscript: LONG_PORTUGUESE_MANUSCRIPT,
      bookLayout,
    }),
    dirty: false,
  };
}

type ExportStatus = 'idle' | 'generating' | 'ready' | 'vectorOnly' | 'error';
type TypographicPreflightUiStatus = 'idle' | 'running' | 'ready' | 'error';

type ImageBarState = CanvasImageSelectionInfo;

const IMAGE_WRAP_SIDE_OPTIONS: Array<{ value: CanvasImageWrapSettings['side']; label: string }> = [
  { value: 'largest', label: 'Melhor lado' },
  { value: 'both', label: 'Direito e esquerdo' },
  { value: 'right', label: 'Lado direito' },
  { value: 'left', label: 'Lado esquerdo' },
];

const IMAGE_WRAP_SHAPE_OPTIONS: Array<{ value: CanvasImageWrapSettings['shape']; label: string }> = [
  { value: 'png-alpha', label: 'PNG transparente' },
  { value: 'box', label: 'Caixa delimitadora' },
];

const PREFLIGHT_STATUS_LABEL: Record<PreflightStatus, string> = {
  ok: 'OK',
  pending: 'Pendente',
  blocked: 'Falhou',
};

const TYPOGRAPHIC_ISSUE_LABELS = {
  looseJustifiedLine: 'Linha frouxa',
  hyphenLadder: 'Escada de hifens',
  pageBottomHyphen: 'Hifen no fim da pagina',
  imageWrapNarrowLine: 'Contorno estreito',
} as const;

const TYPOGRAPHIC_ISSUE_PREVIEW_LIMIT = 6;

interface CanvasEditorShellProps {
  onBack?: () => void;
  onPersistProject?: (serializedProject: string) => void;
}

export default function CanvasEditorShell({ onBack, onPersistProject }: CanvasEditorShellProps = {}) {
  const editorRef = useRef<CanvasEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<CanvasShellState>(loadInitialCanvasShellState);
  const [pageCount, setPageCount] = useState(0);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [printReport, setPrintReport] = useState<CanvasPrintExportReport | null>(null);
  const [typographyReport, setTypographyReport] = useState<TypographicPreflightReport | null>(null);
  const [typographyStatus, setTypographyStatus] = useState<TypographicPreflightUiStatus>('idle');
  const [vectorStatus, setVectorStatus] = useState<ExportStatus>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [watermarkText, setWatermarkText] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showLargeExportWarn, setShowLargeExportWarn] = useState(false);
  // Imagem selecionada no editor; o painel lateral usa estes dados para editar o contorno.
  const [imageBar, setImageBar] = useState<ImageBarState | null>(null);

  useEffect(() => {
    if (state.dirty) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  }, [state.dirty]);
  const [wordCount, setWordCount] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedParagraphStyleId, setSelectedParagraphStyleId] = useState<PreloParagraphStyleId>('body');
  // Visualização "lado a lado" = pré-visualização SÓ LEITURA em spread (livro
  // aberto). O canvas-editor posiciona cursor/seleção numa única coluna vertical;
  // espalhar as páginas em colunas com CSS quebrava todo o clique/cursor. Aqui
  // mostramos imagens das páginas renderizadas — sem edição, sem bug de coordenada.
  const [pairView, setPairView] = useState(false);
  const [spreadImages, setSpreadImages] = useState<string[] | null>(null);
  const [spreadLoading, setSpreadLoading] = useState(false);
  
  const [selectedFont, setSelectedFont] = useState(DEFAULT_BOOK_FONT_FAMILY);
  const [selectedList, setSelectedList] = useState('');
  
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugMessage, setBugMessage] = useState('');
  const [bugFile, setBugFile] = useState<File | null>(null);
  const [bugFileError, setBugFileError] = useState('');
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [bugSuccess, setBugSuccess] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorTheme, setEditorTheme] = useState(() => localStorage.getItem('prelo-editor-theme') || 'livingwriter');
  const [editorAccent, setEditorAccent] = useState(() => localStorage.getItem('prelo-editor-accent') || 'teal');
  // Recuo de 1ª linha. Auto fica desligado por padrão; o botão manual aplica
  // em parágrafos específicos. Tamanho compartilhado pelos dois modos.
  const [firstLineIndentMm, setFirstLineIndentMm] = useState(() => loadFirstLineIndentMm(localStorage));
  const [firstLineIndentAuto, setFirstLineIndentAuto] = useState(() => loadFirstLineIndentAuto(localStorage));
  // Feedback do botão de recuo: o parágrafo atual recebeu recuo manual?
  const [firstLineIndentActive, setFirstLineIndentActive] = useState(false);

  const [catalog, setCatalog] = useState<ICatalog | null>(null);

  type RightTab = 'page' | 'image' | 'margins' | 'search' | 'watermark' | 'export' | 'stats';
  const [activeRightTab, setActiveRightTab] = useState<RightTab | null>('page');
  
  const handleRightTabClick = (tab: RightTab) => {
    setActiveRightTab(current => current === tab ? null : tab);
  };

  type LeftTab = 'chapters' | 'pages';
  const [activeLeftTab, setActiveLeftTab] = useState<LeftTab | null>('chapters');

  const handleLeftTabClick = (tab: LeftTab) => {
    setActiveLeftTab(current => current === tab ? null : tab);
  };

  // Handler direto (referência estável em onClick) — lê a página do data-attr.
  // Evita ler o ref dentro do .map (o que o react-hooks/refs sinaliza como render).
  function handlePageNavClick(event: React.MouseEvent<HTMLButtonElement>) {
    const pageNum = Number(event.currentTarget.dataset.page);
    if (pageNum > 0) editorRef.current?.scrollToPage(pageNum);
  }

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  function handleFirstLineIndentMm(mm: number) {
    const clamped = Math.max(0, Math.min(40, Math.round(mm)));
    setFirstLineIndentMm(clamped);
    saveFirstLineIndentMm(localStorage, clamped);
  }
  function handleToggleFirstLineIndentAuto() {
    setFirstLineIndentAuto((on) => {
      const next = !on;
      saveFirstLineIndentAuto(localStorage, next);
      return next;
    });
  }

  // Carrega o catálogo (capítulos/seções) UMA vez quando o editor fica pronto —
  // sem polling. Edições posteriores são cobertas pelo refresh por mudança abaixo.
  useEffect(() => {
    if (!editorReady) return;
    let cancelled = false;
    editorRef.current
      ?.getCatalog()
      .then((cat) => { if (!cancelled && cat) setCatalog(cat); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editorReady]);

  // Atualiza catálogo quando o documento é modificado
  const catalogRefreshRef = useRef(false);
  useEffect(() => {
    if (!state.dirty) return;
    if (catalogRefreshRef.current) return;
    catalogRefreshRef.current = true;
    const timeout = setTimeout(async () => {
      const cat = await editorRef.current?.getCatalog();
      if (cat) setCatalog(cat);
      catalogRefreshRef.current = false;
    }, 1000);
    return () => { clearTimeout(timeout); catalogRefreshRef.current = false; };
  }, [state.dirty]);

  const handleSave = useCallback(() => {
    const value = editorRef.current?.getValue();
    if (!value) return;
    saveCanvasProject(window.localStorage, {
      name: state.projectName,
      bookLayout: state.bookLayout,
      editor: value,
    });
    const serializedProject = window.localStorage.getItem(CANVAS_STORAGE_KEY);
    if (serializedProject) {
      onPersistProject?.(serializedProject);
    }
    setState((current) => ({ ...current, dirty: false }));
  }, [onPersistProject, state.bookLayout, state.projectName]);

  // Atalhos de teclado
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isCmd = e.metaKey || e.ctrlKey;

      // Ctrl+S / Cmd+S → Salvar
      if (isCmd && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl+F / Cmd+F → Focar busca
      if (isCmd && e.key === 'f') {
        e.preventDefault();
        const field = document.getElementById('searchField') as HTMLInputElement | null;
        if (field) { field.focus(); field.select(); }
        return;
      }

      // Escape → Fechar modais e dropdowns
      if (e.key === 'Escape') {
        if (showBugReport) { setShowBugReport(false); return; }
        if (showSettingsModal) { setShowSettingsModal(false); return; }
        if (activeDropdown) { setActiveDropdown(null); return; }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, showBugReport, showSettingsModal, activeDropdown]);

  // Pré-carrega as fontes de livro para o canvas-editor MEDIR com elas desde o início.
  useEffect(() => {
    void preloadBookFonts();
  }, []);

  function handleBugFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setBugFile(null);
      setBugFileError('');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setBugFileError('A imagem deve ter no máximo 5MB.');
      setBugFile(null);
    } else {
      setBugFileError('');
      setBugFile(file);
    }
  }

  function handleBugSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bugMessage.trim()) return;
    setIsSubmittingBug(true);
    // Simula envio
    setTimeout(() => {
      setIsSubmittingBug(false);
      setBugSuccess(true);
      setTimeout(() => {
        setShowBugReport(false);
        setBugSuccess(false);
        setBugMessage('');
        setBugFile(null);
      }, 2000);
    }, 1500);
  }

  const handleThemeChange = (newTheme: string) => {
    setEditorTheme(newTheme);
    localStorage.setItem('prelo-editor-theme', newTheme);
  };

  const handleAccentChange = (newAccent: string) => {
    setEditorAccent(newAccent);
    localStorage.setItem('prelo-editor-accent', newAccent);
  };


  const data = useMemo(() => state.document.data, [state.document.data]);
  // Garante a classe de letra PT em TODO editor (inclusive projetos salvos antes,
  // cujas options não a tinham) — senão palavras acentuadas quebram no meio.
  const options = useMemo(
    () => ({ ...state.document.options, letterClass: PT_LETTER_CLASS }),
    [state.document.options]
  );
  const hasInexactPreview = hasInexactMirroredMarginPreview(state.bookLayout);
  const preflightChecks = useMemo(() => buildPrintExportPreflight(printReport), [printReport]);

  const refreshWordCount = useCallback(() => {
    editorRef.current?.getWordCount().then(setWordCount).catch(() => {});
  }, []);

  // Contar palavras serializa o documento INTEIRO para um worker (postMessage
  // clona tudo). Fazer isso a cada tecla trava livros grandes (~300 páginas).
  // Só recontamos ~600ms depois que a digitação para.
  const wordCountTimerRef = useRef<number | null>(null);
  const scheduleWordCount = useCallback(() => {
    if (wordCountTimerRef.current !== null) window.clearTimeout(wordCountTimerRef.current);
    wordCountTimerRef.current = window.setTimeout(() => {
      wordCountTimerRef.current = null;
      refreshWordCount();
    }, 600);
  }, [refreshWordCount]);
  useEffect(() => () => {
    if (wordCountTimerRef.current !== null) window.clearTimeout(wordCountTimerRef.current);
  }, []);

  const handleChange = useCallback(() => {
    setState((current) => (current.dirty ? current : { ...current, dirty: true }));
    setTypographyReport(null);
    setTypographyStatus('idle');
    scheduleWordCount();
  }, [scheduleWordCount]);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
    window.setTimeout(refreshWordCount, 0);
  }, [refreshWordCount]);

  const handlePageCountChange = useCallback((nextPageCount: number) => {
    setPageCount(nextPageCount);
  }, []);

  const handlePageScaleChange = useCallback((scale: number) => {
    setZoomLevel(scale);
  }, []);

  function handleProjectNameChange(value: string) {
    setState((current) => ({ ...current, projectName: value, dirty: true }));
  }

  function handlePresetChange(nextPreset: PreloCanvasBookPreset) {
    const nextBookLayout = bookLayoutSettingsFromPreset(nextPreset, {
      facingPages: state.bookLayout.facingPages,
      chapterStart: state.bookLayout.chapterStart,
    });
    applyBookLayout(nextBookLayout);
  }

  function handleBookLayoutSizeChange(field: 'widthMm' | 'heightMm', value: string) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue <= 0) return;
    applyBookLayout({
      ...state.bookLayout,
      trimId: 'custom',
      label: 'Custom',
      [field]: nextValue,
    });
  }

  function handleBookLayoutMarginChange(side: keyof BookLayoutMarginsMm, value: string) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue < 0) return;
    applyBookLayout({
      ...state.bookLayout,
      marginsMm: {
        ...state.bookLayout.marginsMm,
        [side]: nextValue,
      },
    });
  }

  function handleFacingPagesChange(event: React.ChangeEvent<HTMLInputElement>) {
    applyBookLayout({
      ...state.bookLayout,
      facingPages: event.target.checked,
    });
  }

  function handleChapterStartChange(event: React.ChangeEvent<HTMLSelectElement>) {
    applyBookLayout({
      ...state.bookLayout,
      chapterStart: event.target.value as ChapterStartRule,
    });
  }

  function applyBookLayout(nextBookLayout: BookLayoutSettings) {
    const currentValue = editorRef.current?.getValue();
    const nextOptions = canvasOptionsForBookLayout(nextBookLayout);
    if (typeof nextOptions.width === 'number' && typeof nextOptions.height === 'number') {
      editorRef.current?.setPaperSize(nextOptions.width, nextOptions.height);
    }
    editorRef.current?.setPaperMargins(canvasMarginsFromBookLayout(nextBookLayout));

    setState((current) => ({
      ...current,
      bookLayout: nextBookLayout,
      document: {
        data: currentValue?.data ?? current.document.data,
        options: {
          ...(currentValue?.options ?? current.document.options),
          ...nextOptions,
        },
      },
      dirty: true,
    }));
  }

  function handleToggleBold() { editorRef.current?.toggleBold(); setState((c) => ({ ...c, dirty: true })); }
  function handleToggleItalic() { editorRef.current?.toggleItalic(); setState((c) => ({ ...c, dirty: true })); }
  function handleUnderline() { editorRef.current?.setUnderline(); setState((c) => ({ ...c, dirty: true })); }
  function handleStrikeout() { editorRef.current?.setStrikeout(); setState((c) => ({ ...c, dirty: true })); }
  function handleSizeAdd() { editorRef.current?.sizeAdd(); setState((c) => ({ ...c, dirty: true })); }
  function handleSizeMinus() { editorRef.current?.sizeMinus(); setState((c) => ({ ...c, dirty: true })); }

  // Zoom: depois de cada comando, lê a escala real do editor e atualiza o rótulo.
  const syncZoomLevel = useCallback(() => {
    const scale = editorRef.current?.getPageScale();
    if (typeof scale === 'number') setZoomLevel(scale);
  }, []);
  // No "lado a lado" o editor ao vivo está escondido — o zoom escala o spread
  // (via --spread-zoom). Fora dele, o zoom é o do próprio canvas-editor.
  function handleZoomIn() {
    if (pairView) setZoomLevel((z) => Math.min(SPREAD_ZOOM_MAX, +(z + SPREAD_ZOOM_STEP).toFixed(2)));
    else { editorRef.current?.zoomIn(); syncZoomLevel(); }
  }
  function handleZoomOut() {
    if (pairView) setZoomLevel((z) => Math.max(SPREAD_ZOOM_MIN, +(z - SPREAD_ZOOM_STEP).toFixed(2)));
    else { editorRef.current?.zoomOut(); syncZoomLevel(); }
  }
  function handleZoomReset() {
    if (pairView) setZoomLevel(1);
    else { editorRef.current?.zoomReset(); syncZoomLevel(); }
  }

  function handleSetFontFamily(font: string) {
    setSelectedFont(font);
    editorRef.current?.setFontFamily(font);
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleSetFontSize(event: React.ChangeEvent<HTMLInputElement>) {
    const size = Number(event.target.value);
    if (size >= 6 && size <= 72) {
      editorRef.current?.setFontSize(size);
      setState((current) => ({ ...current, dirty: true }));
    }
  }

  function handleSetRowFlex(align: RowFlex) {
    editorRef.current?.setRowFlex(align);
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleParagraphStyle(styleId: PreloParagraphStyleId) {
    setSelectedParagraphStyleId(styleId);
    const mapping = getPreloParagraphStyleCanvasMapping(styleId);
    editorRef.current?.setTitleLevel(preloStyleToTitleLevel(styleId));
    if (mapping.fontSize !== undefined) editorRef.current?.setFontSize(mapping.fontSize);
    if (mapping.rowFlex !== undefined) editorRef.current?.setRowFlex(mapping.rowFlex);
    if (mapping.rowMargin !== undefined) editorRef.current?.setRowMargin(mapping.rowMargin);
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleColor(value: string) {
    editorRef.current?.setColor(value || null);
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleHighlight(value: string | null) {
    editorRef.current?.setHighlight(value);
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleList(val: string) {
    setSelectedList(val);
    if (!val) {
      editorRef.current?.setList(null);
    } else {
      const [type, style] = val.split(':') as [ListType, ListStyle | undefined];
      editorRef.current?.setList(type, style);
    }
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleFormatPainter() { editorRef.current?.formatPainter(); }

  function handleUndo() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.undo();
    setPageCount(editor.getPageCount());
    setState((current) => ({ ...current, dirty: true }));
    window.setTimeout(refreshWordCount, 0);
  }

  function handleRedo() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.redo();
    setPageCount(editor.getPageCount());
    setState((current) => ({ ...current, dirty: true }));
    window.setTimeout(refreshWordCount, 0);
  }

  function handleInsertTable() { editorRef.current?.insertTable(tableRows, tableCols); setState((c) => ({ ...c, dirty: true })); }

  function handleOpenImagePicker() {
    fileInputRef.current?.click();
  }

  function handleImageSelectionChange(imageInfo: CanvasImageSelectionInfo | null) {
    setImageBar(imageInfo);
    if (imageInfo) setActiveRightTab('image');
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const abortTimeout = setTimeout(() => {
      reader.abort();
    }, 30000);
    reader.onload = () => {
      clearTimeout(abortTimeout);
      const base64 = reader.result as string;
      void (async () => {
        const pngAlphaContour = await createPngAlphaContourFromDataUrl(base64).catch(() => null);
        editorRef.current?.insertImage(base64, 400, 300, { pngAlphaContour });
        setActiveRightTab('image');
        setState((current) => ({ ...current, dirty: true }));
      })();
    };
    reader.onerror = () => {
      clearTimeout(abortTimeout);
    };
    reader.onabort = () => {
      clearTimeout(abortTimeout);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function handleAddWatermark() {
    if (!watermarkText) return;
    editorRef.current?.addWatermark(watermarkText);
    setWatermarkText('');
    setState((current) => ({ ...current, dirty: true }));
  }

  function handleDeleteWatermark() { editorRef.current?.deleteWatermark(); setState((current) => ({ ...current, dirty: true })); }

  function handleSearch() { editorRef.current?.search(searchQuery || null); }
  function handleSearchNext() { editorRef.current?.searchNext(); }
  function handleSearchPrev() { editorRef.current?.searchPrev(); }

  function handleReplace() { if (replaceText) { editorRef.current?.replace(replaceText); setState((current) => ({ ...current, dirty: true })); } }

  async function handlePrint() { try { await editorRef.current?.print(); } catch (e) { console.error(e); } }

  // Agrupa as páginas como um livro aberto: a 1ª (capa/recto) fica sozinha à
  // direita; depois pares verso/recto — [2,3], [4,5]... A célula `null` é o slot
  // vazio que mantém as ímpares sempre à direita.
  const spreads = useMemo(() => buildSpreads(spreadImages ?? []), [spreadImages]);

  // Identifica a geração de imagens em curso: se o usuário fechar o spread no meio,
  // a geração antiga é descartada em vez de sobrescrever o estado.
  const spreadGenIdRef = useRef(0);

  // Página a rolar quando o spread fechar (clicada no spread). Em ref para não
  // disparar setState dentro do efeito; o efeito limpa lendo/zerando o ref.
  const pendingJumpPageRef = useRef<number | null>(null);

  // Determinístico: assim que o spread fecha (pairView=false), este efeito roda
  // APÓS o commit do React (overlay já desmontado) e rola até a página pedida —
  // sem o antigo setTimeout de "chute" de 60ms.
  useEffect(() => {
    if (pairView) return;
    const target = pendingJumpPageRef.current;
    if (target === null) return;
    pendingJumpPageRef.current = null;
    editorRef.current?.scrollToPage(target);
  }, [pairView]);

  // Abre o "lado a lado" e gera as imagens das páginas. getPageImages renderiza em
  // modo PRINT e restaura o pixel ratio/modo do editor ao vivo no fim.
  function openPairView() {
    const genId = ++spreadGenIdRef.current;
    setPairView(true);
    setZoomLevel(1); // o spread começa ajustado (100%); o zoom passa a escalá-lo
    setSpreadImages(null);
    setSpreadLoading(true);
    void (async () => {
      try {
        const images = await editorRef.current?.getPageImages(2);
        if (spreadGenIdRef.current === genId) setSpreadImages(images ?? []);
      } catch (error) {
        console.error('Falha ao gerar pré-visualização lado a lado:', error);
        if (spreadGenIdRef.current === genId) setSpreadImages([]);
      } finally {
        if (spreadGenIdRef.current === genId) setSpreadLoading(false);
      }
    })();
  }

  function closePairView() {
    spreadGenIdRef.current++; // invalida qualquer geração em voo
    setPairView(false);
    setSpreadImages(null);
    setSpreadLoading(false);
    syncZoomLevel(); // rótulo volta a refletir a escala real do editor ao vivo
  }

  function handleTogglePairView() {
    if (pairView) closePairView();
    else openPairView();
  }

  // Aplica o modo de exibição à imagem clicada (em linha / acima-abaixo / contorno).
  function applyImageDisplay(display: ImageDisplay) {
    const wrap = imageBar?.wrap;
    editorRef.current?.setImageDisplay(display, display === ImageDisplay.SURROUND ? wrap : undefined);
    if (imageBar) {
      setImageBar({ ...imageBar, display });
    }
    setState((current) => ({ ...current, dirty: true }));
    window.setTimeout(refreshWordCount, 0);
  }

  function handleImageWrapSettingsChange(settings: Partial<CanvasImageWrapSettings>) {
    if (!imageBar) return;
    const nextWrap: CanvasImageWrapSettings = {
      ...imageBar.wrap,
      ...settings,
    };
    if (nextWrap.shape === 'png-alpha' && !imageBar.hasPngAlphaContour) {
      nextWrap.shape = 'box';
    }
    editorRef.current?.setImageWrapSettings(nextWrap);
    setImageBar({ ...imageBar, display: ImageDisplay.SURROUND, wrap: nextWrap });
    setState((current) => ({ ...current, dirty: true }));
    window.setTimeout(refreshWordCount, 0);
  }

  // Sai do spread e leva o editor até a página clicada (volta a poder editar).
  function handleOpenPageFromSpread(pageNo: number) {
    pendingJumpPageRef.current = pageNo;
    closePairView(); // o efeito acima rola até a página após o overlay desmontar
  }

  function handleRunTypographicPreflight() {
    setTypographyStatus('running');
    try {
      const snapshot = editorRef.current?.getLayoutSnapshot() ?? null;
      if (!snapshot || snapshot.glyphs.length === 0) {
        throw new Error('Snapshot do canvas indisponível para preflight tipográfico.');
      }
      setTypographyReport(analyzeCanvasTypography(snapshot));
      setTypographyStatus('ready');
      setActiveRightTab('export');
    } catch (error) {
      console.error('Erro ao analisar tipografia do layout:', error);
      setTypographyReport(null);
      setTypographyStatus('error');
    }
  }

  function handleExportPdf() {
    if (!editorRef.current) return;
    // O raster re-renderiza TODAS as páginas em alta resolução (300 DPI) de uma
    // vez: ~17 MB por página A5. Em livros grandes isso estoura a memória e trava
    // o navegador. Avisamos (modal) e indicamos o vetorial (offset), que não rasteriza.
    if (pageCount > RASTER_EXPORT_PAGE_WARNING_THRESHOLD) {
      setShowLargeExportWarn(true);
      return;
    }
    void runRasterExport();
  }

  async function runRasterExport() {
    const editor = editorRef.current;
    if (!editor) return;
    setExportStatus('generating');
    try {
      const targetDpi = Math.round(canvasPixelRatioForPrintDpi() * 96);

      const { bytes, report } = await renderCanvasPrintPdfFromPreparedPages({
        pageSize: state.bookLayout,
        targetDpi,
        preparePageImages: (pixelRatio) => editor.preparePageImageExport(pixelRatio),
        getRenderedPageImage: (index) => editor.getRenderedPageImage(index),
      });
      setPrintReport(report);
      console.info(`PDF raster exportado: ${report.pageCount} página(s)`);
      downloadBytes(`${state.projectName || 'livro'}.pdf`, bytes, 'application/pdf');
      setExportStatus('ready');
    } catch (error) {
      if (error instanceof CanvasPrintExportError) {
        setPrintReport(error.report);
      }
      console.error('Erro ao exportar PDF Canvas:', error);
      setExportStatus('error');
    } finally {
      // Libera as canvases gigantes de 300 DPI e volta o editor à resolução de tela.
      editor.restoreAfterImageExport();
    }
  }

  // Exportação OFFSET: texto vetorial + fonte embutida, fechado em PDF/X pelo endpoint local.
  // Caminho FIEL: serializa o layout REAL do canvas-editor (1:1 com a tela).
  async function handleExportVectorPdf() {
    setVectorStatus('generating');
    try {
      const snapshot = editorRef.current?.getLayoutSnapshot() ?? null;
      if (!snapshot || snapshot.glyphs.length === 0) {
        throw new Error('Snapshot do canvas indisponível para exportação vetorial fiel.');
      }
      setTypographyReport(analyzeCanvasTypography(snapshot));
      setTypographyStatus('ready');
      const fonts = await loadFontSourceMap(snapshot.glyphs.map((g) => g.fontFamily));
      const result = await exportCanvasVectorPdfFromSnapshot({
        snapshot,
        bookLayout: state.bookLayout,
        fonts,
        fallbackFamily: DEFAULT_BOOK_FONT_FAMILY,
        bleedMm: 3,
        cropMarks: true,
        cropMarkLengthMm: 5,
        cropMarkGapMm: 2,
      });
      const bytes = result.bytes;
      const pageCount = result.pageCount;

      try {
        const pdfxResponse = await fetch('/api/pdfx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: bytesToBlob(bytes, 'application/pdf'),
        });

        if (!pdfxResponse.ok) {
          const detail = await pdfxResponse.text().catch(() => '');
          throw new Error(detail || `Endpoint PDF/X respondeu ${pdfxResponse.status}`);
        }

        const pdfxBytes = new Uint8Array(await pdfxResponse.arrayBuffer());
        const genericIcc = pdfxResponse.headers.get('x-prelo-pdfx-generic-icc') === 'true';
        console.info(
          `PDF/X-1a CMYK baixado: ${pageCount} página(s). ICC ${genericIcc ? 'generico do Ghostscript' : 'customizado'}.`
        );
        downloadBytes(`${state.projectName || 'livro'}-pdfx.pdf`, pdfxBytes, 'application/pdf');
        setVectorStatus('ready');
      } catch (pdfxError) {
        console.warn('Endpoint PDF/X local falhou; baixando PDF vetorial sem conversao PDF/X.', pdfxError);
        downloadBytes(`${state.projectName || 'livro'}-vetorial.pdf`, bytes, 'application/pdf');
        setVectorStatus('vectorOnly');
      }
    } catch (error) {
      console.error('Erro ao exportar PDF vetorial:', error);
      setVectorStatus('error');
    }
  }

  function renderCatalog(items: ICatalog, depth: number = 1): React.ReactNode {
    return items.map((item) => (
      <div key={item.id}>
        <button
          type="button"
          className={`canvas-chapter-item level-${Math.min(depth, 3)}`}
          onClick={() => editorRef.current?.locationCatalog(item.id)}
        >
          <span>{item.name}</span>
          <span className="chapter-page-badge">{item.pageNo}</span>
        </button>
        {item.subCatalog.length > 0 && renderCatalog(item.subCatalog, depth + 1)}
      </div>
    ));
  }

  return (
    <section className={`canvas-editor-shell theme-${editorTheme} accent-${editorAccent}`}>
      {/* ── Top Header ── */}
      <header className="canvas-editor-header">
        {/* Row 1: Logo/Back + Title + Status | Right actions */}
        <div className="canvas-header-row-top">
          <div className="canvas-header-left">
            {onBack && (
              <button type="button" className="canvas-back-btn" onClick={() => state.dirty ? setShowExitConfirm(true) : onBack?.()} aria-label="Voltar para Projetos">
                <ChevronLeftIcon />
              </button>
            )}
            <div className="canvas-editor-title-container">
              <input
                className="canvas-editor-title-input"
                value={state.projectName || 'Sem título'}
                onChange={(event) => handleProjectNameChange(event.target.value)}
                aria-label="Nome do projeto"
              />
              <span className="canvas-editor-status">
                {state.dirty ? '● Modificado' : '● Salvo na nuvem'}
              </span>
            </div>
          </div>

          <div className="canvas-header-right">
            <button
              type="button"
              className={`btn-view-mode ${pairView ? 'active' : ''}`}
              onClick={handleTogglePairView}
              data-tooltip={TOOLTIPS.pairView}
              aria-label="Alternar visualização lado a lado"
              aria-pressed={pairView}
            >
              <PairViewIcon /> <span>{pairView ? 'Uma página' : 'Lado a lado'}</span>
            </button>
            <button 
              type="button"
              className="btn-bug" 
              onClick={() => setShowBugReport(true)}
              aria-label="Reportar bug"
            >
              <BugIcon /> <span>Bug</span>
            </button>
            <div style={{ position: 'relative' }}>
              <button 
                type="button"
                className="btn-export" 
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'export' ? null : 'export'); }}
                data-tooltip={activeDropdown === 'export' ? undefined : 'Opções de Exportação'}
                aria-label="Abrir opções de compartilhamento"
              >
                <ExportIcon /> <span>Compartilhar</span>
              </button>
              {activeDropdown === 'export' && (
                <div className="canvas-dropdown-menu right-aligned">
                  <button className="canvas-dropdown-item" onClick={() => { setActiveDropdown(null); handleExportPdf(); }}>
                    <PDFIcon /> PDF 300 DPI (Raster)
                  </button>
                  <button className="canvas-dropdown-item" onClick={() => { setActiveDropdown(null); handleExportVectorPdf(); }}>
                    <PDFIcon /> PDF/X (Offset)
                  </button>
                  <div className="canvas-dropdown-divider" />
                  <button className="canvas-dropdown-item" onClick={() => { setActiveDropdown(null); handlePrint(); }}>
                    <PrintIcon /> Imprimir Prova
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Formatting Toolbar ── */}
      <div className="canvas-editor-toolbar-row" style={{ padding: '8px 16px' }}>
        <div className="canvas-editor-capsule" style={{ flex: 1, width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '8px', padding: '6px 12px' }}>

          <div className="canvas-editor-btn-group essential-toolbar-group">
            <button type="button" className="tb-icon-btn" onClick={handleUndo} data-tooltip={TOOLTIPS.undo} aria-label="Desfazer">
              <UndoIcon />
            </button>
            <button type="button" className="tb-icon-btn" onClick={handleRedo} data-tooltip={TOOLTIPS.redo} aria-label="Refazer">
              <RedoIcon />
            </button>
          </div>
          <div className="canvas-toolbar-group-divider" />

          {/* 1. Paragraph Style (Texto Normal / Capítulo / etc.) */}
          <div className="canvas-editor-btn-group essential-toolbar-group">
            <div className="canvas-dropdown-wrapper">
              <button
                type="button"
                className="canvas-editor-select"
                style={{ width: 105, background: 'transparent', border: 'none', textAlign: 'left', fontWeight: 500 }}
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'paraStyle' ? null : 'paraStyle'); }}
                data-tooltip={activeDropdown === 'paraStyle' ? undefined : 'Estilo de parágrafo'}
              >
                {PRELO_PARAGRAPH_STYLE_LIST.find((style) => style.id === selectedParagraphStyleId)?.label ?? 'Corpo'} ▾
              </button>
              {activeDropdown === 'paraStyle' && (
                <div className="canvas-dropdown-menu">
                  {PRELO_PARAGRAPH_STYLE_LIST.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      className={`canvas-dropdown-item ${selectedParagraphStyleId === style.id ? 'active' : ''}`}
                      onClick={() => { setActiveDropdown(null); handleParagraphStyle(style.id); }}
                      data-tooltip={style.description}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="canvas-toolbar-group-divider" />

          {/* 2. Font Family */}
          <div className="canvas-editor-btn-group essential-toolbar-group">
            <div className="canvas-dropdown-wrapper">
              <button
                type="button"
                className="canvas-editor-select"
                style={{ width: 100, background: 'transparent', border: 'none', textAlign: 'left' }}
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'font' ? null : 'font'); }}
                data-tooltip={activeDropdown === 'font' ? undefined : TOOLTIPS.fontFamily}
              >
                {selectedFont} ▾
              </button>
              {activeDropdown === 'font' && (
                <div className="canvas-dropdown-menu">
                  {FONT_FAMILIES.map((family) => (
                    <button key={family} type="button" className={`canvas-dropdown-item ${selectedFont === family ? 'active' : ''}`} onClick={() => { setActiveDropdown(null); handleSetFontFamily(family); }}>
                      {family}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="canvas-toolbar-group-divider" />

          {/* 3. Font Size */}
          <div className="canvas-editor-btn-group essential-toolbar-group">
            <button type="button" className="tb-icon-btn small" onClick={handleSizeMinus} data-tooltip={TOOLTIPS.sizeMinus} aria-label={TOOLTIPS.sizeMinus}>
              <SizeMinusIcon />
            </button>
            <input className="canvas-editor-input-number" type="number" min={6} max={72} defaultValue={13} onChange={handleSetFontSize} style={{ width: 32, border: 'none', background: 'transparent', padding: 0, textAlign: 'center' }} />
            <button type="button" className="tb-icon-btn small" onClick={handleSizeAdd} data-tooltip={TOOLTIPS.sizeAdd} aria-label={TOOLTIPS.sizeAdd}>
              <SizeAddIcon />
            </button>
          </div>
          <div className="canvas-toolbar-group-divider" />

          {/* 4. Text Style: B I U A/ T */}
          <div className="canvas-editor-btn-group essential-toolbar-group">
            <button type="button" className="tb-icon-btn" onClick={handleToggleBold} data-tooltip={TOOLTIPS.bold} aria-label={TOOLTIPS.bold}><BoldIcon /></button>
            <button type="button" className="tb-icon-btn" onClick={handleToggleItalic} data-tooltip={TOOLTIPS.italic} aria-label={TOOLTIPS.italic}><ItalicIcon /></button>
            <button type="button" className="tb-icon-btn" onClick={handleUnderline} data-tooltip={TOOLTIPS.underline} aria-label={TOOLTIPS.underline}><UnderlineIcon /></button>
            <div className="canvas-dropdown-wrapper">
              <button type="button" className="tb-icon-btn" style={{ position: 'relative' }} data-tooltip={activeDropdown === 'global-color' ? undefined : TOOLTIPS.color} aria-label={TOOLTIPS.color} onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'global-color' ? null : 'global-color'); }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #ec4899, #ef4444)', border: '1px solid rgba(255,255,255,0.2)' }} />
              </button>
              {activeDropdown === 'global-color' && (
                <div className="canvas-dropdown-menu" style={{ minWidth: '130px', zIndex: 1000, padding: '8px', top: '100%', left: '0' }} onClick={(e) => e.stopPropagation()}>
                  <div className="canvas-color-grid">
                    {CURATED_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        className="canvas-color-swatch"
                        aria-label={`Aplicar cor ${c}`}
                        style={{ background: c }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleColor(c);
                          setActiveDropdown(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="canvas-dropdown-wrapper">
              <button type="button" className="tb-icon-btn" style={{ position: 'relative' }} data-tooltip={activeDropdown === 'global-highlight' ? undefined : TOOLTIPS.highlight} aria-label={TOOLTIPS.highlight} onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'global-highlight' ? null : 'global-highlight'); }}>
                <HighlightIcon />
              </button>
              {activeDropdown === 'global-highlight' && (
                <div className="canvas-dropdown-menu" style={{ minWidth: '130px', zIndex: 1000, padding: '8px', top: '100%', left: '0' }} onClick={(e) => e.stopPropagation()}>
                  <div className="canvas-color-grid">
                    {CURATED_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        className="canvas-color-swatch"
                        aria-label={`Realçar com ${c}`}
                        style={{ background: c }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHighlight(c);
                          setActiveDropdown(null);
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="canvas-dropdown-item"
                    style={{ marginTop: '6px', justifyContent: 'center' }}
                    onClick={(e) => { e.stopPropagation(); handleHighlight(null); setActiveDropdown(null); }}
                  >
                    Remover realce
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="tb-icon-btn" onClick={handleFormatPainter} data-tooltip={TOOLTIPS.formatPainter} aria-label={TOOLTIPS.formatPainter}><FormatPainterIcon /></button>
            <button type="button" className="tb-icon-btn" onClick={handleStrikeout} data-tooltip={TOOLTIPS.strikeout} aria-label={TOOLTIPS.strikeout}><StrikeoutIcon /></button>
          </div>
          <div className="canvas-toolbar-group-divider advanced-toolbar-divider" />

          {/* 5. Insertions */}
          <div className="canvas-editor-btn-group advanced-toolbar-group">
            <label className="canvas-editor-toolbar-field" style={{ gap: '2px', marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
              <input type="number" min={1} max={20} className="canvas-editor-input-number" value={tableRows} onChange={(e) => setTableRows(Number(e.target.value))} style={{ width: 28 }} data-tooltip={TOOLTIPS.tableRows} />
              <span style={{ color: 'var(--text-muted)' }}>×</span>
              <input type="number" min={1} max={20} className="canvas-editor-input-number" value={tableCols} onChange={(e) => setTableCols(Number(e.target.value))} style={{ width: 28 }} data-tooltip={TOOLTIPS.tableCols} />
            </label>
            <button type="button" className="tb-icon-btn" onClick={handleInsertTable} data-tooltip={TOOLTIPS.insertTable} aria-label={TOOLTIPS.insertTable}><TableIcon /></button>
          </div>
          <div className="canvas-toolbar-group-divider advanced-toolbar-divider" />

          {/* 6. Lists */}
          <div className="canvas-editor-btn-group essential-toolbar-group">
            <div className="canvas-dropdown-wrapper">
              <button
                type="button"
                className="canvas-editor-select"
                style={{ width: 70, background: 'transparent', border: 'none', textAlign: 'left' }}
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'list' ? null : 'list'); }}
                data-tooltip={activeDropdown === 'list' ? undefined : TOOLTIPS.list}
              >
                {selectedList === 'ol:decimal' ? '1. Num' : selectedList === 'ul:disc' ? '• Bullet' : selectedList === 'ul:checkbox' ? '☑ Check' : 'Lista'} ▾
              </button>
              {activeDropdown === 'list' && (
                <div className="canvas-dropdown-menu">
                  <button type="button" className={`canvas-dropdown-item ${selectedList === '' ? 'active' : ''}`} onClick={() => { setActiveDropdown(null); handleList(''); }}>Lista</button>
                  <button type="button" className={`canvas-dropdown-item ${selectedList === 'ol:decimal' ? 'active' : ''}`} onClick={() => { setActiveDropdown(null); handleList('ol:decimal'); }}>1. Num</button>
                  <button type="button" className={`canvas-dropdown-item ${selectedList === 'ul:disc' ? 'active' : ''}`} onClick={() => { setActiveDropdown(null); handleList('ul:disc'); }}>• Bullet</button>
                  <button type="button" className={`canvas-dropdown-item ${selectedList === 'ul:checkbox' ? 'active' : ''}`} onClick={() => { setActiveDropdown(null); handleList('ul:checkbox'); }}>☑ Check</button>
                </div>
              )}
            </div>
            <button type="button" className={`tb-icon-btn ${firstLineIndentActive ? 'active' : ''}`} data-tooltip="Recuo de 1ª linha" aria-label="Alternar recuo de 1ª linha" onClick={() => { editorRef.current?.toggleFirstLineIndent(); setState((current) => ({ ...current, dirty: true })); }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line><polyline points="3 5 6 6 3 7"></polyline></svg>
            </button>
          </div>
          <div className="canvas-toolbar-group-divider" />

          {/* 7. Alignment */}
          <div className="canvas-editor-btn-group essential-toolbar-group">
            {ALIGNMENTS.map((a) => (
              <button key={a.value} type="button" className="tb-icon-btn" data-tooltip={a.tooltip} aria-label={a.tooltip} onClick={() => handleSetRowFlex(a.value)}>{a.icon}</button>
            ))}
          </div>

          {/* 8. View & Zoom (pushed to right) */}
          <div className="canvas-editor-btn-group" style={{ marginLeft: 'auto' }}>
            <button type="button" className="tb-icon-btn small" onClick={handleZoomOut} data-tooltip={TOOLTIPS.zoomOut} aria-label={TOOLTIPS.zoomOut}>
              <SizeMinusIcon />
            </button>
            <span
              className="canvas-editor-zoom-label"
              style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', cursor: 'pointer', minWidth: 38, textAlign: 'center' }}
              onClick={handleZoomReset}
              data-tooltip={TOOLTIPS.zoomReset}
              role="button"
              aria-label={TOOLTIPS.zoomReset}
            >
              {Math.round(zoomLevel * 100)}%
            </span>
            <button type="button" className="tb-icon-btn small" onClick={handleZoomIn} data-tooltip={TOOLTIPS.zoomIn} aria-label={TOOLTIPS.zoomIn}>
              <SizeAddIcon />
            </button>
            <div className="canvas-toolbar-group-divider" style={{ margin: '0 12px' }} />
            <span className="canvas-editor-word-count" style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {wordCount.toLocaleString('pt-BR')} palavras
            </span>
          </div>

        </div>
      </div>

      {/* ── Body Layout ── */}
      <div className="canvas-editor-body">
        {/* ── Left Sidebar (Icon Strip + Expandable Drawer) ── */}
        <aside className={`canvas-editor-left-sidebar-container ${!activeLeftTab ? 'drawer-collapsed' : ''}`}>
          {/* Always visible Far-Left Icon Strip */}
          <div className="canvas-editor-sidebar-strip left-strip">
            <button
              type="button"
              className={`sidebar-strip-btn ${activeLeftTab === 'chapters' ? 'active' : ''}`}
              onClick={() => handleLeftTabClick('chapters')}
              data-tooltip="Capítulos outline"
              aria-label="Abrir capítulos"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeLeftTab === 'pages' ? 'active' : ''}`}
              onClick={() => handleLeftTabClick('pages')}
              data-tooltip="Ir para a página"
              aria-label="Abrir navegação de páginas"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            </button>
            <button
              type="button"
              className="sidebar-strip-btn"
              onClick={() => setShowSettingsModal(true)}
              data-tooltip="Ajustes de aparência"
              aria-label="Abrir ajustes de aparência"
            >
              <SettingsIcon />
            </button>
          </div>

          {/* Left Drawer (collapsible) */}
          <div className={`canvas-editor-sidebar-drawer left-drawer ${!activeLeftTab ? 'collapsed' : ''}`} aria-hidden={!activeLeftTab}>
            <div className="canvas-sidebar-drawer-content" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
              
              {activeLeftTab === 'chapters' && (
                <div className="canvas-sidebar-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
                  <div className="canvas-sidebar-title">
                    <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>Capítulos</h3>
                  </div>
                  <div className="canvas-chapter-panel" style={{ flex: 1, overflowY: 'auto', margin: '0 -8px' }}>
                    {!catalog || catalog.length === 0 ? (
                      <div style={{ padding: '16px 8px', color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
                        Nenhum capítulo encontrado.
                      </div>
                    ) : (
                      renderCatalog(catalog)
                    )}
                  </div>
                </div>
              )}

              {activeLeftTab === 'pages' && (
                <div className="canvas-sidebar-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
                  <div className="canvas-sidebar-title">
                    <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>Páginas</h3>
                  </div>
                  <div className="canvas-chapter-panel" style={{ flex: 1, overflowY: 'auto', margin: '0 -8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {pageCount > 0 ? Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        type="button"
                        key={pageNum}
                        className="canvas-page-nav-item"
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '6px 8px', border: '1px solid rgba(255,255,255,0.05)', 
                          borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.15s ease',
                          background: 'transparent',
                          boxSizing: 'border-box',
                          width: '100%',
                          textAlign: 'left'
                        }}
                        data-page={pageNum}
                        onClick={handlePageNavClick}
                        data-tooltip={`Ir para página ${pageNum}`}
                      >
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`Ir para página ${pageNum}`}>
                          Página {pageNum}
                        </span>
                      </button>
                    )) : (
                      <div style={{ padding: '16px 8px', color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
                        Calculando páginas...
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </aside>

        {/* ── Central Stage (Main Canvas container) ── */}
        <div className="canvas-editor-stage-container">
          {/* Loading overlay */}
          {!editorReady && (
            <div className="canvas-editor-loading-overlay">
              <div className="canvas-editor-loading-spinner" />
              <span>Preparando editor...</span>
            </div>
          )}
          {/* Pages area — o editor ao vivo fica sempre montado (estado preservado).
              No "lado a lado" cobrimos com o spread só leitura por cima. */}
          <main className="canvas-editor-stage">
            <CanvasEditorHost
              ref={editorRef}
              data={data}
              options={options}
              onChange={handleChange}
              onReady={handleEditorReady}
              onPageCountChange={handlePageCountChange}
              enableAutoHyphenation
              firstLineIndentMm={firstLineIndentMm}
              firstLineIndentAuto={firstLineIndentAuto}
              onFirstLineIndentActiveChange={setFirstLineIndentActive}
              onPageScaleChange={handlePageScaleChange}
              onImageSelected={handleImageSelectionChange}
            />
          </main>

          {/* ── Spread só leitura (visualização "lado a lado") ── */}
          {pairView && (
            <div className="canvas-spread-overlay" role="region" aria-label="Pré-visualização das páginas lado a lado" style={{ '--spread-zoom': zoomLevel } as React.CSSProperties}>
              {spreadLoading ? (
                <div className="canvas-spread-message">
                  <div className="canvas-editor-loading-spinner" />
                  <span>Gerando pré-visualização...</span>
                </div>
              ) : spreads.length === 0 ? (
                <div className="canvas-spread-message">
                  <span>Nada para visualizar ainda.</span>
                </div>
              ) : (
                <div className="canvas-spread-scroll">
                  {spreads.map((spread, spreadIndex) => (
                    <div className="canvas-spread-row" key={spreadIndex}>
                      {spread.map((slot, slotIndex) =>
                        slot ? (
                          <button
                            type="button"
                            key={slot.pageNo}
                            className="canvas-spread-page"
                            onClick={() => handleOpenPageFromSpread(slot.pageNo)}
                            title={`Editar página ${slot.pageNo}`}
                            aria-label={`Editar página ${slot.pageNo}`}
                          >
                            <img src={slot.img} alt={`Página ${slot.pageNo}`} draggable={false} />
                            <span className="canvas-spread-page-num">{slot.pageNo}</span>
                          </button>
                        ) : (
                          <div className="canvas-spread-page-empty" key={`empty-${slotIndex}`} aria-hidden="true" />
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Sidebar (Expandable Drawer + Icon Strip) ── */}
        <aside className={`canvas-editor-right-sidebar-container ${!activeRightTab ? 'drawer-collapsed' : ''}`}>
          {/* Right Drawer (collapsible) */}
          <div className={`canvas-editor-sidebar-drawer right-drawer ${!activeRightTab ? 'collapsed' : ''}`} aria-hidden={!activeRightTab}>
            <div className="canvas-sidebar-drawer-content" style={{ width: '100%' }}>
              
              {activeRightTab === 'stats' && (
                <div className="canvas-sidebar-card">
                  <h3 className="canvas-sidebar-title">Estatísticas</h3>
                  <div className="canvas-stats-list">
                    <div className="canvas-stat-item">
                      <span className="canvas-stat-label">Total de Páginas</span>
                      <span className="canvas-stat-value">{pageCount || '-'}</span>
                    </div>
                    <div className="canvas-stat-item">
                      <span className="canvas-stat-label">Total de Palavras</span>
                      <span className="canvas-stat-value">{wordCount}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeRightTab === 'search' && (
                <div className="canvas-sidebar-card">
                  <h3 className="canvas-sidebar-title">Busca e Substituição</h3>
                  <div className="canvas-sidebar-field" style={{ marginBottom: '10px' }}>
                    <label htmlFor="searchField">Termo de Busca</label>
                    <input
                      id="searchField"
                      type="text"
                      placeholder="O que deseja encontrar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-tooltip={TOOLTIPS.searchQuery}
                    />
                    <div className="canvas-btn-row" style={{ marginTop: '6px' }}>
                      <button type="button" className="tb-icon-btn" onClick={handleSearch} data-tooltip={TOOLTIPS.search} aria-label="Pesquisar">
                        <SearchIcon />
                      </button>
                      <button type="button" className="tb-icon-btn" onClick={handleSearchPrev} data-tooltip={TOOLTIPS.searchPrev} aria-label="Resultado anterior">
                        <PrevIcon />
                      </button>
                      <button type="button" className="tb-icon-btn" onClick={handleSearchNext} data-tooltip={TOOLTIPS.searchNext} aria-label="Próximo resultado">
                        <NextIcon />
                      </button>
                    </div>
                  </div>

                  <div className="canvas-sidebar-field">
                    <label htmlFor="replaceField">Substituir Por</label>
                    <input
                      id="replaceField"
                      type="text"
                      placeholder="Substituir termo..."
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      data-tooltip={TOOLTIPS.replaceText}
                    />
                    <div className="canvas-btn-row" style={{ marginTop: '6px' }}>
                      <button
                        type="button"
                        className="canvas-action-btn btn-save"
                        onClick={handleReplace}
                        data-tooltip={TOOLTIPS.replace}
                        style={{ height: '30px', fontSize: '11px', gap: '4px' }}
                      >
                        <ReplaceIcon /> Substituir
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeRightTab === 'watermark' && (
                <div className="canvas-sidebar-card">
                  <h3 className="canvas-sidebar-title">Marca d'água</h3>
                  <div className="canvas-sidebar-field">
                    <label htmlFor="watermarkField">Texto da Marca</label>
                    <input
                      id="watermarkField"
                      type="text"
                      placeholder="Ex: CONFIDENCIAL"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      data-tooltip={TOOLTIPS.watermarkText}
                    />
                    <div className="canvas-watermark-row">
                      <button
                        type="button"
                        className="canvas-action-btn btn-save"
                        onClick={handleAddWatermark}
                        data-tooltip={TOOLTIPS.addWatermark}
                        style={{ height: '30px', fontSize: '11px', padding: '0 8px' }}
                      >
                        Aplicar
                      </button>
                      <button
                        type="button"
                        className="canvas-action-btn btn-print"
                        onClick={handleDeleteWatermark}
                        data-tooltip={TOOLTIPS.deleteWatermark}
                        style={{ height: '30px', fontSize: '11px', padding: '0 8px' }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeRightTab === 'image' && (
                <>
                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Imagem</h3>
                    <button
                      type="button"
                      className="canvas-action-btn btn-save canvas-image-insert-btn"
                      onClick={handleOpenImagePicker}
                      data-tooltip={TOOLTIPS.insertImage}
                    >
                      <ImageIcon /> Inserir imagem
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/gif"
                      onChange={handleImageSelect}
                      style={{ display: 'none' }}
                    />
                  </div>

                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Texto em contorno</h3>
                    {imageBar ? (
                      <div className="canvas-image-sidebar-panel">
                        <div className="canvas-image-mode-grid" aria-label="Modo da imagem">
                          <button
                            type="button"
                            className={`canvas-image-mode-btn ${imageBar.display === ImageDisplay.INLINE ? 'active' : ''}`}
                            onClick={() => applyImageDisplay(ImageDisplay.INLINE)}
                            data-tooltip="Imagem em linha com o texto"
                          >
                            Em linha
                          </button>
                          <button
                            type="button"
                            className={`canvas-image-mode-btn ${imageBar.display === ImageDisplay.BLOCK ? 'active' : ''}`}
                            onClick={() => applyImageDisplay(ImageDisplay.BLOCK)}
                            data-tooltip="Texto acima e abaixo da imagem"
                          >
                            Acima/abaixo
                          </button>
                          <button
                            type="button"
                            className={`canvas-image-mode-btn ${imageBar.display === ImageDisplay.SURROUND ? 'active' : ''}`}
                            onClick={() => applyImageDisplay(ImageDisplay.SURROUND)}
                            data-tooltip="Texto contorna a imagem"
                          >
                            Contornar texto
                          </button>
                          <button
                            type="button"
                            className={`canvas-image-mode-btn ${imageBar.display === ImageDisplay.FLOAT_TOP ? 'active' : ''}`}
                            onClick={() => applyImageDisplay(ImageDisplay.FLOAT_TOP)}
                            data-tooltip="Imagem na frente do texto"
                          >
                            Na frente
                          </button>
                          <button
                            type="button"
                            className={`canvas-image-mode-btn ${imageBar.display === ImageDisplay.FLOAT_BOTTOM ? 'active' : ''}`}
                            onClick={() => applyImageDisplay(ImageDisplay.FLOAT_BOTTOM)}
                            data-tooltip="Imagem atrás do texto"
                          >
                            Atrás
                          </button>
                        </div>

                        <div className="canvas-image-wrap-sidebar">
                          <div className="canvas-sidebar-field">
                            <label htmlFor="imageWrapSideSelect">Ajustar</label>
                            <select
                              id="imageWrapSideSelect"
                              value={imageBar.wrap.side}
                              onChange={(event) => handleImageWrapSettingsChange({ side: event.target.value as CanvasImageWrapSettings['side'] })}
                              disabled={imageBar.display !== ImageDisplay.SURROUND}
                            >
                              {IMAGE_WRAP_SIDE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="canvas-sidebar-field">
                            <label htmlFor="imageWrapShapeSelect">Tipo</label>
                            <select
                              id="imageWrapShapeSelect"
                              value={imageBar.wrap.shape}
                              onChange={(event) => handleImageWrapSettingsChange({ shape: event.target.value as CanvasImageWrapSettings['shape'] })}
                              disabled={imageBar.display !== ImageDisplay.SURROUND}
                            >
                              {IMAGE_WRAP_SHAPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value} disabled={option.value === 'png-alpha' && !imageBar.hasPngAlphaContour}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="canvas-sidebar-field">
                            <label htmlFor="imageWrapPaddingField">Distância (mm)</label>
                            <input
                              id="imageWrapPaddingField"
                              type="number"
                              min={0}
                              max={30}
                              step={0.5}
                              value={imageBar.wrap.paddingMm}
                              onChange={(event) => handleImageWrapSettingsChange({ paddingMm: Number(event.target.value) })}
                              disabled={imageBar.display !== ImageDisplay.SURROUND}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="canvas-sidebar-note">Selecione uma imagem no documento para ajustar o contorno.</p>
                    )}
                  </div>
                </>
              )}

              {activeRightTab === 'page' && (
                <>
                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Formatos do Livro</h3>
                    <div className="canvas-preset-grid">
                      {PRELO_CANVAS_PRESET_LIST.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`canvas-preset-btn ${preset.id === state.bookLayout.trimId ? 'active' : ''}`}
                          onClick={() => handlePresetChange(preset)}
                          data-tooltip={TOOLTIPS.bookPreset}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Dimensões (mm)</h3>
                    <div className="canvas-config-grid">
                      <div className="canvas-sidebar-field">
                        <label htmlFor="widthField">Largura</label>
                        <input
                          id="widthField"
                          type="number"
                          min={50}
                          max={400}
                          step={0.1}
                          value={state.bookLayout.widthMm}
                          onChange={(event) => handleBookLayoutSizeChange('widthMm', event.target.value)}
                          data-tooltip={TOOLTIPS.bookWidth}
                        />
                      </div>
                      <div className="canvas-sidebar-field">
                        <label htmlFor="heightField">Altura</label>
                        <input
                          id="heightField"
                          type="number"
                          min={50}
                          max={500}
                          step={0.1}
                          value={state.bookLayout.heightMm}
                          onChange={(event) => handleBookLayoutSizeChange('heightMm', event.target.value)}
                          data-tooltip={TOOLTIPS.bookHeight}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeRightTab === 'margins' && (
                <>
                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Margens do Miolo (mm)</h3>
                    <div className="canvas-config-grid" style={{ rowGap: '12px' }}>
                      <div className="canvas-sidebar-field">
                        <label htmlFor="marginTopField">Superior</label>
                        <input
                          id="marginTopField"
                          type="number"
                          min={0}
                          max={80}
                          step={0.5}
                          value={state.bookLayout.marginsMm.top}
                          onChange={(event) => handleBookLayoutMarginChange('top', event.target.value)}
                          data-tooltip={TOOLTIPS.marginTop}
                        />
                      </div>
                      <div className="canvas-sidebar-field">
                        <label htmlFor="marginBottomField">Inferior</label>
                        <input
                          id="marginBottomField"
                          type="number"
                          min={0}
                          max={80}
                          step={0.5}
                          value={state.bookLayout.marginsMm.bottom}
                          onChange={(event) => handleBookLayoutMarginChange('bottom', event.target.value)}
                          data-tooltip={TOOLTIPS.marginBottom}
                        />
                      </div>
                      <div className="canvas-sidebar-field">
                        <label htmlFor="marginInsideField">Interna</label>
                        <input
                          id="marginInsideField"
                          type="number"
                          min={0}
                          max={80}
                          step={0.5}
                          value={state.bookLayout.marginsMm.inside}
                          onChange={(event) => handleBookLayoutMarginChange('inside', event.target.value)}
                          data-tooltip={TOOLTIPS.marginInside}
                        />
                      </div>
                      <div className="canvas-sidebar-field">
                        <label htmlFor="marginOutsideField">Externa</label>
                        <input
                          id="marginOutsideField"
                          type="number"
                          min={0}
                          max={80}
                          step={0.5}
                          value={state.bookLayout.marginsMm.outside}
                          onChange={(event) => handleBookLayoutMarginChange('outside', event.target.value)}
                          data-tooltip={TOOLTIPS.marginOutside}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Layout & Início</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <label className="canvas-check-field" data-tooltip={TOOLTIPS.facingPages}>
                        <input
                          type="checkbox"
                          checked={state.bookLayout.facingPages}
                          onChange={handleFacingPagesChange}
                        />
                        <span>Páginas Frente/Verso</span>
                      </label>

                      <div className="canvas-sidebar-field">
                        <label htmlFor="chapterStartSelect">Início de Capítulo</label>
                        <select id="chapterStartSelect" value={state.bookLayout.chapterStart} onChange={handleChapterStartChange} data-tooltip={TOOLTIPS.chapterStart}>
                          <option value="nextPage">Próxima página</option>
                          <option value="nextOddPage" disabled>Próxima ímpar (D.I.)</option>
                        </select>
                      </div>

                      {hasInexactPreview ? (
                        <div className="canvas-mirrored-warning" data-tooltip={TOOLTIPS.mirroredWarning}>
                          Nota: O preview exibe margem global, mas as margens interna/externa serão salvas corretamente na exportação.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="canvas-sidebar-card">
                    <h3 className="canvas-sidebar-title">Recuo de Parágrafo</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <label
                        className="canvas-check-field"
                        data-tooltip="Recua automaticamente a 1ª linha dos parágrafos do corpo. Use o botão manual da barra para ligar ou desligar em um parágrafo específico."
                      >
                        <input
                          type="checkbox"
                          checked={firstLineIndentAuto}
                          onChange={handleToggleFirstLineIndentAuto}
                        />
                        <span>Recuo automático (1ª linha)</span>
                      </label>

                      <div className="canvas-sidebar-field">
                        <label htmlFor="firstLineIndentField">Tamanho do recuo (mm)</label>
                        <input
                          id="firstLineIndentField"
                          type="number"
                          min={0}
                          max={40}
                          step={1}
                          value={firstLineIndentMm}
                          onChange={(event) => handleFirstLineIndentMm(Number(event.target.value))}
                          data-tooltip="Tamanho do recuo de 1ª linha, em mm. Vale para o recuo automático e para o botão manual da barra de ferramentas."
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeRightTab === 'export' && (
                <div className="canvas-sidebar-card">
                  <h3 className="canvas-sidebar-title">Preflight de Exportação</h3>
                  <p className="canvas-preflight-note" data-tooltip={TOOLTIPS.preflight}>
                    {printReport
                      ? 'Resultado da última exportação raster:'
                      : 'O que a exportação raster entrega — e o que ainda falta:'}
                  </p>
                  <ul className="canvas-preflight-list">
                    {preflightChecks.map((check) => (
                      <li key={check.id} className="canvas-preflight-item" data-tooltip={check.detail}>
                        <span className={`canvas-preflight-badge status-${check.status}`}>
                          {PREFLIGHT_STATUS_LABEL[check.status]}
                        </span>
                        <span className="canvas-preflight-label">{check.label}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="canvas-typography-preflight">
                    <div className="canvas-preflight-section-head">
                      <h4>Preflight Tipográfico</h4>
                      <button
                        type="button"
                        className="canvas-mini-action-btn"
                        onClick={handleRunTypographicPreflight}
                        disabled={!editorReady || typographyStatus === 'running'}
                        data-tooltip={TOOLTIPS.typographicPreflight}
                      >
                        <SearchIcon /> {typographyStatus === 'running' ? 'Analisando...' : 'Analisar tipografia'}
                      </button>
                    </div>

                    {typographyStatus === 'error' ? (
                      <p className="canvas-export-msg status-blocked">
                        Não foi possível analisar o layout atual.
                      </p>
                    ) : typographyReport ? (
                      <>
                        <p className="canvas-preflight-note">
                          {typographyReport.issues.length === 0
                            ? `OK: ${typographyReport.checkedLineCount} linha(s) analisada(s).`
                            : `${typographyReport.warningCount} aviso(s) em ${typographyReport.checkedLineCount} linha(s) analisada(s).`}
                        </p>
                        <p
                          className="canvas-preflight-note"
                          data-tooltip={`espaço ${typographyReport.composition.subScores.wordSpacing} · tracking ${typographyReport.composition.subScores.tracking} · hifens ${typographyReport.composition.subScores.hyphenation} · última linha ${typographyReport.composition.subScores.lastLine} · densidade ${typographyReport.composition.subScores.density}`}
                        >
                          Composição: <strong>{typographyReport.composition.score}/100</strong>
                          {typographyReport.composition.worst.length
                            ? ` — ${typographyReport.composition.worst.length} ponto(s) crítico(s)`
                            : ' — sem pontos críticos'}
                        </p>
                        {typographyReport?.issues.length ? (
                          <ul className="canvas-typography-issue-list">
                            {typographyReport.issues.slice(0, TYPOGRAPHIC_ISSUE_PREVIEW_LIMIT).map((issue) => (
                              <li key={issue.id} className="canvas-typography-issue" data-tooltip={issue.detail}>
                                <span className="canvas-preflight-badge status-pending">Aviso</span>
                                <span className="canvas-typography-issue-text">
                                  <strong>{TYPOGRAPHIC_ISSUE_LABELS[issue.type]}</strong>
                                  <span>Pág. {issue.pageNo}, linha {issue.lineNo}</span>
                                  <em>{issue.lineText}</em>
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {typographyReport.issues.length > TYPOGRAPHIC_ISSUE_PREVIEW_LIMIT ? (
                          <p className="canvas-preflight-note">
                            +{typographyReport.issues.length - TYPOGRAPHIC_ISSUE_PREVIEW_LIMIT} aviso(s) oculto(s).
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="canvas-preflight-note">
                        Clique para analisar hifens, espaços de justificação e contornos de imagem no layout atual.
                      </p>
                    )}
                  </div>

                  <div className="canvas-export-actions" style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className={`canvas-action-btn btn-save ${state.dirty ? 'dirty' : ''}`}
                      onClick={handleSave}
                      disabled={!state.dirty}
                      data-tooltip={TOOLTIPS.save}
                    >
                      <SaveIcon /> {state.dirty ? 'Salvar Alterações' : 'Salvo no Navegador'}
                    </button>
                    <button type="button" className="canvas-action-btn btn-save" onClick={handleExportVectorPdf} data-tooltip={TOOLTIPS.exportVector}>
                      <PDFIcon /> Baixar PDF Final (Vetor)
                    </button>
                    {exportStatus === 'generating' && (
                      <p className="canvas-export-msg">Gerando PDF raster 300 DPI...</p>
                    )}
                    {exportStatus === 'ready' ? (
                      <p className="canvas-export-msg status-ok">PDF raster 300 DPI baixado.</p>
                    ) : exportStatus === 'error' ? (
                      <p className="canvas-export-msg status-blocked">Falha ao gerar PDF raster — veja o console.</p>
                    ) : null}
                    {vectorStatus === 'generating' && (
                      <p className="canvas-export-msg">Gerando PDF com Ghostscript...</p>
                    )}
                    {vectorStatus === 'ready' ? (
                      <p className="canvas-export-msg status-ok">
                        PDF/X-1a CMYK baixado. Valide no Acrobat Preflight ou com a gráfica antes da tiragem.
                      </p>
                    ) : vectorStatus === 'vectorOnly' ? (
                      <p className="canvas-export-msg status-blocked">
                        Endpoint local indisponível; PDF vetorial sem PDF/X baixado. Verifique Ghostscript/dev server.
                      </p>
                    ) : vectorStatus === 'error' ? (
                      <p className="canvas-export-msg status-blocked">Falha ao gerar PDF vetorial — veja o console.</p>
                    ) : null}
                    <button type="button" className="canvas-action-btn btn-print" onClick={handlePrint} data-tooltip={TOOLTIPS.print}>
                      <PrintIcon /> Imprimir Prova
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Always visible Far-Right Icon Strip */}
          <div className="canvas-editor-sidebar-strip right-strip">
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'page' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('page')}
              data-tooltip="Formatos e Dimensões"
              aria-label="Abrir formatos e dimensões"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'image' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('image')}
              data-tooltip="Imagem e Contorno"
              aria-label="Abrir imagem e contorno"
            >
              <ImageIcon />
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'margins' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('margins')}
              data-tooltip="Margens e Layout"
              aria-label="Abrir margens e layout"
            >
              <PairViewIcon />
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'search' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('search')}
              data-tooltip="Busca e Substituição"
              aria-label="Abrir busca e substituição"
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'watermark' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('watermark')}
              data-tooltip="Marca d'água"
              aria-label="Abrir marca d'água"
            >
              <BlockIcon />
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'stats' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('stats')}
              data-tooltip="Estatísticas"
              aria-label="Abrir estatísticas"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            </button>
            <button
              type="button"
              className={`sidebar-strip-btn ${activeRightTab === 'export' ? 'active' : ''}`}
              onClick={() => handleRightTabClick('export')}
              data-tooltip="Preflight e Exportação"
              aria-label="Abrir preflight e exportação"
            >
              <ExportIcon />
            </button>
          </div>
        </aside>
      </div>

      {showBugReport && (
        <div className="canvas-modal-overlay" onClick={() => setShowBugReport(false)}>
          <div className="canvas-modal-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="canvas-modal-header">
              <h2><BugIcon /> Encontrou um problema?</h2>
              <button className="canvas-modal-close" onClick={() => setShowBugReport(false)}>×</button>
            </div>
            <div className="canvas-modal-content">
              {bugSuccess ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ color: 'var(--success-color)', fontSize: '48px', marginBottom: '16px' }}>✓</div>
                  <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Relato Enviado!</h3>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>Obrigado por nos ajudar a melhorar o Prelo.</p>
                </div>
              ) : (
                <form onSubmit={handleBugSubmit}>
                  <div className="canvas-modal-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                      Descreva o que aconteceu, o que você esperava que acontecesse e anexe um print se possível.
                    </p>
                    <textarea 
                      className="canvas-form-textarea"
                      placeholder="Descreva o problema em detalhes..."
                      value={bugMessage}
                      onChange={(e) => setBugMessage(e.target.value)}
                      rows={5}
                      style={{ width: '100%', resize: 'vertical', minHeight: '100px' }}
                      required
                    />
                    
                    <div style={{ marginTop: '16px' }}>
                      <label 
                        className="canvas-action-btn" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--border-color)', cursor: 'pointer', padding: '8px 12px' }}
                      >
                        <ImageIcon /> {bugFile ? bugFile.name : 'Anexar Imagem (Até 5MB)'}
                        <input type="file" accept="image/*" onChange={handleBugFileChange} style={{ display: 'none' }} />
                      </label>
                      {bugFileError && <div style={{ color: 'var(--accent-color)', fontSize: '12px', marginTop: '8px' }}>{bugFileError}</div>}
                    </div>
                  </div>
                  <div className="canvas-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <button type="button" className="canvas-action-btn" onClick={() => setShowBugReport(false)} style={{ background: 'transparent' }}>Cancelar</button>
                    <button type="submit" className="canvas-action-btn btn-export" disabled={isSubmittingBug || !!bugFileError}>
                      {isSubmittingBug ? 'Enviando...' : 'Enviar Relato'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}



      {showSettingsModal && (
        <div className="canvas-modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="canvas-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="canvas-modal-header">
              <h2>Ajustes de Aparência</h2>
              <button className="canvas-modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>
            <div className="canvas-modal-content">
              <div className="canvas-modal-section">
                <h3>Tema de Fundo</h3>
                <div className="canvas-theme-selector">
                  <button
                    type="button"
                    className={`canvas-theme-btn ${editorTheme === 'livingwriter' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('livingwriter')}
                  >
                    Living
                  </button>
                  <button
                    type="button"
                    className={`canvas-theme-btn ${editorTheme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    Escuro
                  </button>
                  <button
                    type="button"
                    className={`canvas-theme-btn ${editorTheme === 'space-grey' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('space-grey')}
                  >
                    Cinza
                  </button>
                  <button
                    type="button"
                    className={`canvas-theme-btn ${editorTheme === 'light' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                  >
                    Claro
                  </button>
                  <button
                    type="button"
                    className={`canvas-theme-btn ${editorTheme === 'warm' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('warm')}
                  >
                    Cálido
                  </button>
                </div>
              </div>

              <div className="canvas-modal-section">
                <h3>Cor de Destaque</h3>
                <div className="canvas-accent-selector">
                  {(['teal', 'blue', 'purple', 'pink', 'orange', 'green', 'graphite'] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`canvas-accent-dot dot-${color} ${editorAccent === color ? 'active' : ''}`}
                      onClick={() => handleAccentChange(color)}
                      aria-label={`Destaque ${color}`}
                    />
                  ))}
                </div>
              </div>

            </div>
            <div className="canvas-modal-footer">
              <button type="button" className="canvas-action-btn btn-pdf" onClick={() => setShowSettingsModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div className="confirm-modal-overlay" onClick={() => setShowExitConfirm(false)}>
          <div className="confirm-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Alterações não salvas</h3>
            </div>
            <div className="confirm-modal-body">
              <p>Você tem alterações que ainda não foram salvas. Deseja salvar antes de sair?</p>
            </div>
            <div className="confirm-modal-buttons">
              <button
                type="button"
                className="confirm-modal-btn cancel"
                onClick={() => { setShowExitConfirm(false); onBack?.(); }}
              >
                Sair sem Salvar
              </button>
              <button
                type="button"
                className="confirm-modal-btn confirm"
                onClick={() => {
                  handleSave();
                  setShowExitConfirm(false);
                  onBack?.();
                }}
              >
                Salvar e Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {showLargeExportWarn && (
        <div className="confirm-modal-overlay" onClick={() => setShowLargeExportWarn(false)}>
          <div className="confirm-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Livro grande para PDF raster</h3>
            </div>
            <div className="confirm-modal-body">
              <p>
                Este livro tem {pageCount} páginas. O “PDF 300 DPI (Raster)” rasteriza cada
                página em alta resolução e pode travar o navegador em livros grandes. Para este
                tamanho, prefira o “PDF/X (Offset)”: gera texto vetorial, arquivo leve e é o
                formato que a gráfica prefere.
              </p>
            </div>
            <div className="confirm-modal-buttons">
              <button
                type="button"
                className="confirm-modal-btn cancel"
                onClick={() => { setShowLargeExportWarn(false); void runRasterExport(); }}
              >
                Continuar com raster
              </button>
              <button
                type="button"
                className="confirm-modal-btn confirm"
                onClick={() => { setShowLargeExportWarn(false); void handleExportVectorPdf(); }}
              >
                Usar PDF/X (offset)
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function bytesToBlob(bytes: Uint8Array, mimeType: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: mimeType });
}

function downloadBytes(fileName: string, bytes: Uint8Array, mimeType: string) {
  const url = URL.createObjectURL(bytesToBlob(bytes, mimeType));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
