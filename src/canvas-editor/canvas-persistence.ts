import type { IEditorResult } from '../vendor/canvas-editor';
import { bookLayoutSettingsFromPreset, type BookLayoutSettings } from './book-layout-settings';
import type { PreloCanvasBookPreset } from './prelo-canvas-types';

export const CANVAS_STORAGE_KEY = 'prelo.canvas.project.v1';
const CANVAS_STORAGE_VERSION = 2;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedCanvasProject {
  version: number;
  name: string;
  bookLayout: BookLayoutSettings;
  editor: IEditorResult;
  savedAtIso: string;
}

export type SaveCanvasProjectInput = Omit<PersistedCanvasProject, 'version' | 'savedAtIso'>;

export function saveCanvasProject(store: KeyValueStore, project: SaveCanvasProjectInput): void {
  store.setItem(
    CANVAS_STORAGE_KEY,
    JSON.stringify({
      ...project,
      version: CANVAS_STORAGE_VERSION,
      savedAtIso: new Date().toISOString(),
    })
  );
}

export function loadCanvasProject(store: KeyValueStore): PersistedCanvasProject | null {
  const raw = store.getItem(CANVAS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCanvasProject> & {
      preset?: PreloCanvasBookPreset;
    };

    if (parsed.version === 1) {
      if (!parsed.name || !parsed.preset || !parsed.editor?.data?.main) return null;
      return {
        version: CANVAS_STORAGE_VERSION,
        name: parsed.name,
        bookLayout: bookLayoutSettingsFromPreset(parsed.preset),
        editor: parsed.editor,
        savedAtIso: parsed.savedAtIso ?? new Date(0).toISOString(),
      };
    }

    if (parsed.version !== CANVAS_STORAGE_VERSION) return null;
    if (!parsed.name || !isBookLayoutSettings(parsed.bookLayout) || !parsed.editor?.data?.main) {
      return null;
    }
    return parsed as PersistedCanvasProject;
  } catch {
    return null;
  }
}

export function clearCanvasProject(store: KeyValueStore): void {
  store.removeItem(CANVAS_STORAGE_KEY);
}

function isBookLayoutSettings(value: unknown): value is BookLayoutSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<BookLayoutSettings>;
  const margins = settings.marginsMm;

  return (
    typeof settings.trimId === 'string' &&
    typeof settings.label === 'string' &&
    isFiniteNumber(settings.widthMm) &&
    isFiniteNumber(settings.heightMm) &&
    !!margins &&
    isFiniteNumber(margins.top) &&
    isFiniteNumber(margins.bottom) &&
    isFiniteNumber(margins.inside) &&
    isFiniteNumber(margins.outside) &&
    typeof settings.facingPages === 'boolean' &&
    (settings.chapterStart === 'nextPage' || settings.chapterStart === 'nextOddPage')
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
