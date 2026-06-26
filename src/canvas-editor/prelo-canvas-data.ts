import {
  ElementType,
  RowFlex,
  TitleLevel,
  type IEditorData,
  type IEditorOption,
  type IElement,
} from '@hufe921/canvas-editor';
import {
  bookLayoutSettingsFromPreset,
  canvasMarginsFromBookLayout,
  canvasOptionsForBookLayout,
  type BookLayoutSettings,
} from './book-layout-settings';
import type { PreloCanvasBookPreset } from './prelo-canvas-types';
import { toEmbeddableFamily } from '../fonts/book-fonts';

export interface BuildCanvasDocumentInput {
  title: string;
  manuscript: string;
  preset?: PreloCanvasBookPreset;
  bookLayout?: BookLayoutSettings;
  fontFamily?: string;
  fontSize?: number;
}

export interface BuiltCanvasDocument {
  data: IEditorData;
  options: IEditorOption;
}

export function canvasMarginsFromPreset(
  preset: PreloCanvasBookPreset
): [number, number, number, number] {
  return canvasMarginsFromBookLayout(bookLayoutSettingsFromPreset(preset));
}

export function canvasOptionsForPreset(preset: PreloCanvasBookPreset): IEditorOption {
  return canvasOptionsForBookLayout(bookLayoutSettingsFromPreset(preset));
}

export function buildCanvasDocument(input: BuildCanvasDocumentInput): BuiltCanvasDocument {
  // Fonte de livro embutível por padrão (mesma fonte que será embutida no PDF).
  const font = toEmbeddableFamily(input.fontFamily);
  const size = input.fontSize ?? 13;
  const bookLayout = resolveBookLayout(input);
  const main: IElement[] = [];

  pushTitle(main, input.title, TitleLevel.FIRST, 24, font);
  pushParagraphs(main, input.manuscript, font, size);

  return {
    data: { main },
    options: {
      locale: 'en',
      defaultFont: font,
      defaultSize: size,
      ...canvasOptionsForBookLayout(bookLayout),
      watermark: { data: '' },
      placeholder: { data: 'Start writing...' },
    },
  };
}

function resolveBookLayout(input: BuildCanvasDocumentInput): BookLayoutSettings {
  if (input.bookLayout) return input.bookLayout;
  if (input.preset) return bookLayoutSettingsFromPreset(input.preset);
  throw new Error('Canvas document requires a book layout or preset');
}

function pushTitle(target: IElement[], value: string, level: TitleLevel, size: number, font: string) {
  target.push({
    value: '',
    type: ElementType.TITLE,
    level,
    valueList: [{ value, size, font, bold: true, rowFlex: RowFlex.CENTER }],
  });
}

function pushParagraphs(target: IElement[], manuscript: string, font: string, size: number) {
  const normalized = manuscript.replace(/\r\n/g, '\n');
  for (const block of normalized.split(/\n{2,}/)) {
    const text = block.trim();
    if (!text) continue;
    if (/^cap[ií]tulo\s+\d+/i.test(text)) {
      if (target.length > 0) target.push({ type: ElementType.PAGE_BREAK, value: '\n' });
      pushTitle(target, text, TitleLevel.FIRST, 20, font);
      continue;
    }
    for (const value of `${text}\n\n`) {
      target.push({ value, font, size });
    }
  }
}
