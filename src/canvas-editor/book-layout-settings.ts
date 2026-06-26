import { PageMode, type IEditorOption } from '@hufe921/canvas-editor';
import type { PreloCanvasBookPreset } from './prelo-canvas-types';
import { mmToPx } from './prelo-canvas-units';

export type ChapterStartRule = 'nextPage' | 'nextOddPage';
export type BookTrimId = 'a5' | '6x9' | 'custom';

export interface BookLayoutMarginsMm {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
}

export interface BookLayoutSettings {
  trimId: BookTrimId;
  label: string;
  widthMm: number;
  heightMm: number;
  marginsMm: BookLayoutMarginsMm;
  facingPages: boolean;
  chapterStart: ChapterStartRule;
}

type BookLayoutPresetOverride = Partial<Pick<BookLayoutSettings, 'facingPages' | 'chapterStart'>>;

export function bookLayoutSettingsFromPreset(
  preset: PreloCanvasBookPreset,
  override: BookLayoutPresetOverride = {}
): BookLayoutSettings {
  return {
    trimId: preset.id === 'a5' || preset.id === '6x9' ? preset.id : 'custom',
    label: preset.label,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    marginsMm: {
      top: preset.marginsMm.top,
      bottom: preset.marginsMm.bottom,
      inside: preset.marginsMm.inside,
      outside: preset.marginsMm.outside,
    },
    facingPages: override.facingPages ?? false,
    chapterStart: override.chapterStart ?? 'nextPage',
  };
}

export function canvasMarginsFromBookLayout(settings: BookLayoutSettings): [number, number, number, number] {
  return [
    mmToPx(settings.marginsMm.top),
    mmToPx(settings.marginsMm.outside),
    mmToPx(settings.marginsMm.bottom),
    mmToPx(settings.marginsMm.inside),
  ];
}

/**
 * Classe de "letra" incluindo acentos latinos. O padrão do canvas-editor é só
 * A-Za-z, então acentos (õ, é, ã, ç…) viram fronteira de palavra e o motor QUEBRA
 * palavras acentuadas no meio (ex.: "regiõ|es") sem hífen. Incluir os acentos
 * mantém palavras PT inteiras — pré-requisito da justificação correta e da
 * hifenização. (À-ÖØ-öø-ÿ cobre os diacríticos latinos e exclui ×/÷.)
 */
export const PT_LETTER_CLASS = ['A-Za-zÀ-ÖØ-öø-ÿ'];

export function canvasOptionsForBookLayout(settings: BookLayoutSettings): IEditorOption {
  return {
    width: mmToPx(settings.widthMm),
    height: mmToPx(settings.heightMm),
    margins: canvasMarginsFromBookLayout(settings),
    pageMode: PageMode.PAGING,
    letterClass: PT_LETTER_CLASS,
    pageNumber: {
      format: '{pageNo}/{pageCount}',
      size: 11,
      bottom: 36,
    },
  };
}

export function hasInexactMirroredMarginPreview(settings: BookLayoutSettings): boolean {
  return settings.facingPages && settings.marginsMm.inside !== settings.marginsMm.outside;
}
