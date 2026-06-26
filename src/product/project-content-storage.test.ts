import { describe, expect, it } from 'vitest';
import { projectContentStorageKey, persistProjectContent } from './project-content-storage';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('project content storage', () => {
  it('stores serialized editor content under the active project key', () => {
    const storage = fakeStorage();

    persistProjectContent(storage, 'project-123', '{"editor":true}');

    expect(storage.getItem(projectContentStorageKey('project-123'))).toBe('{"editor":true}');
  });

  it('does not write when there is no active project id', () => {
    const storage = fakeStorage();

    persistProjectContent(storage, null, '{"editor":true}');

    expect(storage.getItem('prelo.project.content.null')).toBeNull();
  });
});
