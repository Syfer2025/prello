import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from './canvas-persistence';
import {
  CANVAS_STORAGE_KEY,
  clearCanvasProject,
  loadCanvasProject,
  saveCanvasProject,
} from './canvas-persistence';
import { bookLayoutSettingsFromPreset } from './book-layout-settings';
import { buildCanvasDocument } from './prelo-canvas-data';
import { PRELO_CANVAS_PRESETS } from './prelo-canvas-units';

function fakeStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function sampleEditorResult() {
  const bookLayout = bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5);
  const built = buildCanvasDocument({
    title: 'Livro',
    bookLayout,
    manuscript: 'Texto inicial.',
  });
  return {
    version: '0.9.136',
    data: built.data,
    options: built.options,
  };
}

describe('canvas persistence', () => {
  it('saves and reloads a canvas project round-trip', () => {
    const store = fakeStore();
    saveCanvasProject(store, {
      name: 'Livro',
      bookLayout: bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5),
      editor: sampleEditorResult(),
    });

    const loaded = loadCanvasProject(store);
    expect(loaded?.name).toBe('Livro');
    expect(loaded?.bookLayout.trimId).toBe('a5');
    expect(loaded?.bookLayout.marginsMm.inside).toBe(17);
    expect(loaded?.bookLayout.marginsMm.outside).toBe(14);
    expect(loaded?.editor.data.main.length).toBeGreaterThan(0);
  });

  it('returns null when storage is empty', () => {
    expect(loadCanvasProject(fakeStore())).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    const store = fakeStore();
    store.setItem(CANVAS_STORAGE_KEY, '{not json');
    expect(loadCanvasProject(store)).toBeNull();
  });

  it('returns null for unsupported storage version', () => {
    const store = fakeStore();
    store.setItem(
      CANVAS_STORAGE_KEY,
      JSON.stringify({
        version: 999,
        name: 'Livro',
        preset: PRELO_CANVAS_PRESETS.a5,
        editor: sampleEditorResult(),
        savedAtIso: new Date().toISOString(),
      })
    );
    expect(loadCanvasProject(store)).toBeNull();
  });

  it('migrates legacy v1 preset projects to book layout settings', () => {
    const store = fakeStore();
    store.setItem(
      CANVAS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        name: 'Legado',
        preset: PRELO_CANVAS_PRESETS.a5,
        editor: sampleEditorResult(),
        savedAtIso: new Date().toISOString(),
      })
    );

    const loaded = loadCanvasProject(store);

    expect(loaded?.version).toBe(2);
    expect(loaded?.name).toBe('Legado');
    expect(loaded?.bookLayout).toMatchObject({
      trimId: 'a5',
      marginsMm: {
        inside: 17,
        outside: 14,
      },
    });
  });

  it('returns null when the saved editor payload is invalid', () => {
    const store = fakeStore();
    store.setItem(
      CANVAS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        name: 'Livro',
        preset: PRELO_CANVAS_PRESETS.a5,
        editor: { data: {} },
        savedAtIso: new Date().toISOString(),
      })
    );
    expect(loadCanvasProject(store)).toBeNull();
  });

  it('clears the saved canvas project', () => {
    const store = fakeStore();
    saveCanvasProject(store, {
      name: 'Livro',
      bookLayout: bookLayoutSettingsFromPreset(PRELO_CANVAS_PRESETS.a5),
      editor: sampleEditorResult(),
    });
    clearCanvasProject(store);
    expect(loadCanvasProject(store)).toBeNull();
  });
});
