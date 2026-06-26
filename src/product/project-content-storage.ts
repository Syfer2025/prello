import type { KeyValueStore } from '../canvas-editor/canvas-persistence';

export function projectContentStorageKey(projectId: string): string {
  return `prelo.project.content.${projectId}`;
}

export function persistProjectContent(
  store: KeyValueStore,
  projectId: string | null,
  serializedProject: string | null
): void {
  if (!projectId || !serializedProject) return;
  store.setItem(projectContentStorageKey(projectId), serializedProject);
}
