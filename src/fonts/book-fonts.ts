/**
 * Fontes de livro EMBUTÍVEIS — a base do "trava em fontes embutíveis".
 *
 * Cada família tem as 4 variantes estáticas (regular/itálico/negrito/
 * negrito-itálico) servidas de /public/fonts. O EDITOR renderiza e MEDE com
 * elas (via @font-face em index.css), e a EXPORTAÇÃO embute exatamente os mesmos
 * TTFs — então os glifos do PDF batem 1:1 com a tela.
 *
 * Famílias do sistema (Georgia, Times, Arial) não entram aqui porque não podem
 * ser embutidas com segurança no PDF.
 */
import type { FontVariantKey } from '../print-export/canvas-vector-types';
import type { FontBytes, FontSourceMap } from '../print-export/canvas-vector-render';

export interface BookFontDefinition {
  family: string;
  /** rótulo curto para a UI. */
  label: string;
  variants: Record<FontVariantKey, string>;
}

export const BOOK_FONTS: BookFontDefinition[] = [
  {
    family: 'Crimson Text',
    label: 'Crimson Text',
    variants: {
      regular: '/fonts/CrimsonText-Regular.ttf',
      italic: '/fonts/CrimsonText-Italic.ttf',
      bold: '/fonts/CrimsonText-Bold.ttf',
      boldItalic: '/fonts/CrimsonText-BoldItalic.ttf',
    },
  },
  {
    family: 'EB Garamond',
    label: 'EB Garamond',
    variants: {
      regular: '/fonts/EBGaramond-Regular.ttf',
      italic: '/fonts/EBGaramond-Italic.ttf',
      bold: '/fonts/EBGaramond-Bold.ttf',
      boldItalic: '/fonts/EBGaramond-BoldItalic.ttf',
    },
  },
  {
    family: 'Lora',
    label: 'Lora',
    variants: {
      regular: '/fonts/Lora-Regular.ttf',
      italic: '/fonts/Lora-Italic.ttf',
      bold: '/fonts/Lora-Bold.ttf',
      boldItalic: '/fonts/Lora-BoldItalic.ttf',
    },
  },
];

export const DEFAULT_BOOK_FONT_FAMILY = 'Crimson Text';
export const BOOK_FONT_FAMILIES = BOOK_FONTS.map((f) => f.family);

const VARIANT_KEYS: FontVariantKey[] = ['regular', 'italic', 'bold', 'boldItalic'];

export function findBookFont(family: string): BookFontDefinition | undefined {
  return BOOK_FONTS.find((f) => f.family === family);
}

/** Famílias não embutíveis (sistema) são normalizadas para esta família. */
export function toEmbeddableFamily(family: string | undefined): string {
  if (family && findBookFont(family)) return family;
  return DEFAULT_BOOK_FONT_FAMILY;
}

const fontByteCache = new Map<string, ArrayBuffer>();

async function fetchFontBytes(url: string): Promise<ArrayBuffer | null> {
  const cached = fontByteCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  fontByteCache.set(url, bytes);
  return bytes;
}

/**
 * Monta o FontSourceMap (bytes por família/variante) para a exportação. Famílias
 * pedidas que não são book fonts (ex.: Georgia em documentos antigos) são
 * mapeadas para a família padrão, mas mantidas sob a chave original — assim o
 * renderer as encontra pelo nome que veio do snapshot.
 */
export async function loadFontSourceMap(families: string[]): Promise<FontSourceMap> {
  const map: FontSourceMap = {};
  const wanted = new Set([...families, DEFAULT_BOOK_FONT_FAMILY]);

  for (const family of wanted) {
    const def = findBookFont(family) ?? findBookFont(DEFAULT_BOOK_FONT_FAMILY)!;
    const variants: Partial<Record<FontVariantKey, FontBytes>> = {};
    for (const key of VARIANT_KEYS) {
      const bytes = await fetchFontBytes(def.variants[key]);
      if (bytes) variants[key] = bytes;
    }
    map[family] = variants;
  }
  return map;
}

/**
 * Pré-carrega as variantes via FontFace API para que o canvas-editor MEÇA o
 * texto com a fonte certa desde o início (evita medir com fallback do sistema).
 */
export async function preloadBookFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const loads: Promise<unknown>[] = [];
  for (const def of BOOK_FONTS) {
    for (const key of VARIANT_KEYS) {
      const weight = key === 'bold' || key === 'boldItalic' ? '700' : '400';
      const style = key === 'italic' || key === 'boldItalic' ? 'italic' : 'normal';
      const face = new FontFace(def.family, `url(${def.variants[key]})`, { weight, style });
      loads.push(
        face
          .load()
          .then((loaded) => document.fonts.add(loaded))
          .catch(() => undefined)
      );
    }
  }
  await Promise.all(loads);
}
