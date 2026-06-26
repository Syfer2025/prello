import type { IElement } from '@hufe921/canvas-editor';

interface ParagraphEnterEvent {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

export function shouldHandleParagraphEnter(event: ParagraphEnterEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.isComposing
  );
}

export function createCanvasParagraphBreakElements(): IElement[] {
  return [{ value: '\n' }] as IElement[];
}
