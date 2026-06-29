import { RowFlex, TitleLevel } from '../vendor/canvas-editor';
import { computeBaselineGridRowMargin } from './canvas-typography-profile';

export type PreloParagraphStyleId =
  | 'body'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'quote'
  | 'caption';

export interface PreloParagraphStyle {
  id: PreloParagraphStyleId;
  label: string;
  description: string;
  canvas: PreloParagraphStyleCanvasMapping;
}

export interface PreloParagraphStyleCanvasMapping {
  titleLevel: TitleLevel | null;
  fontSize?: number;
  rowFlex?: RowFlex;
  rowMargin?: number;
  baselineGrid?: boolean;
}

export const PRELO_PARAGRAPH_STYLE_LIST: PreloParagraphStyle[] = [
  {
    id: 'body',
    label: 'Corpo',
    description: 'Texto principal do miolo.',
    canvas: {
      titleLevel: null,
      fontSize: 13,
      rowFlex: RowFlex.ALIGNMENT,
      baselineGrid: true,
      rowMargin: computeBaselineGridRowMargin(13),
    },
  },
  {
    id: 'chapter',
    label: 'Capítulo',
    description: 'Título principal de capítulo.',
    canvas: {
      titleLevel: TitleLevel.FIRST,
      rowFlex: RowFlex.CENTER,
    },
  },
  {
    id: 'section',
    label: 'Seção',
    description: 'Subtítulo de segundo nível.',
    canvas: {
      titleLevel: TitleLevel.SECOND,
      rowFlex: RowFlex.LEFT,
    },
  },
  {
    id: 'subsection',
    label: 'Subseção',
    description: 'Subtítulo de terceiro nível.',
    canvas: {
      titleLevel: TitleLevel.THIRD,
      rowFlex: RowFlex.LEFT,
    },
  },
  {
    id: 'quote',
    label: 'Citação',
    description: 'Trecho citado destacado do corpo.',
    canvas: {
      titleLevel: null,
      fontSize: 12,
      rowFlex: RowFlex.LEFT,
      baselineGrid: true,
      rowMargin: computeBaselineGridRowMargin(12),
    },
  },
  {
    id: 'caption',
    label: 'Legenda',
    description: 'Texto curto para imagem ou tabela.',
    canvas: {
      titleLevel: null,
      fontSize: 11,
      rowFlex: RowFlex.CENTER,
      rowMargin: 4,
    },
  },
];

export function getPreloParagraphStyle(id: PreloParagraphStyleId): PreloParagraphStyle {
  const style = PRELO_PARAGRAPH_STYLE_LIST.find((item) => item.id === id);
  if (!style) throw new Error(`Unknown Prelo paragraph style: ${id}`);
  return style;
}

export function getPreloParagraphStyleCanvasMapping(
  id: PreloParagraphStyleId
): PreloParagraphStyleCanvasMapping {
  return getPreloParagraphStyle(id).canvas;
}

export function preloStyleToTitleLevel(id: PreloParagraphStyleId): TitleLevel | null {
  return getPreloParagraphStyleCanvasMapping(id).titleLevel;
}
