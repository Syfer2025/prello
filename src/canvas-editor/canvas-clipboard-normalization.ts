import type { IElement } from '../vendor/canvas-editor';

interface PlainTextPasteDefaults {
  font?: string;
  size?: number;
}

export function createPlainTextPasteElements(
  text: string,
  defaults: PlainTextPasteDefaults = {}
): IElement[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return Array.from(normalized, (value) => {
    const element: IElement = { value };
    if (defaults.font) element.font = defaults.font;
    if (typeof defaults.size === 'number') element.size = defaults.size;
    return element;
  });
}
