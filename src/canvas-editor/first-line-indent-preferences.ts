export const FIRST_LINE_INDENT_MM_STORAGE_KEY = 'prelo-fli-mm';
export const FIRST_LINE_INDENT_AUTO_STORAGE_KEY = 'prelo-fli-auto-v2';

interface FirstLineIndentStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

export function loadFirstLineIndentMm(store: FirstLineIndentStore): number {
  const saved = Number(store.getItem(FIRST_LINE_INDENT_MM_STORAGE_KEY));
  return Number.isFinite(saved) && saved > 0 ? saved : 6;
}

export function saveFirstLineIndentMm(store: FirstLineIndentStore, mm: number): void {
  const clamped = Math.max(0, Math.min(40, Math.round(mm)));
  store.setItem(FIRST_LINE_INDENT_MM_STORAGE_KEY, String(clamped));
}

export function loadFirstLineIndentAuto(store: FirstLineIndentStore): boolean {
  return store.getItem(FIRST_LINE_INDENT_AUTO_STORAGE_KEY) === 'true';
}

export function saveFirstLineIndentAuto(store: FirstLineIndentStore, enabled: boolean): void {
  store.setItem(FIRST_LINE_INDENT_AUTO_STORAGE_KEY, String(enabled));
}
