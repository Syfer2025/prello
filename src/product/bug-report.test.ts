import { describe, expect, it, vi } from 'vitest';
import {
  BUG_REPORT_QUEUE_KEY,
  buildBugReportPayload,
  submitBugReport,
  type BugReportPayload,
} from './bug-report';

function createMemoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe('bug report submission', () => {
  const payload: BugReportPayload = {
    id: 'bug_test',
    message: 'Erro no editor',
    projectName: 'Livro teste',
    pageUrl: 'http://localhost/editor',
    userAgent: 'vitest',
    createdAt: '2026-06-27T12:00:00.000Z',
  };

  it('builds a trimmed report payload with project metadata', async () => {
    const report = await buildBugReportPayload({
      id: 'bug_payload',
      message: '  Texto ficou invisivel  ',
      projectName: '  Romance  ',
      pageUrl: 'http://localhost/livro',
      userAgent: 'test-agent',
      now: new Date('2026-06-27T12:00:00.000Z'),
    });

    expect(report).toEqual({
      id: 'bug_payload',
      message: 'Texto ficou invisivel',
      projectName: 'Romance',
      pageUrl: 'http://localhost/livro',
      userAgent: 'test-agent',
      createdAt: '2026-06-27T12:00:00.000Z',
    });
  });

  it('posts the report to the production endpoint when available', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }) as Response);
    const storage = createMemoryStorage();

    const result = await submitBugReport(payload, { fetchImpl, storage });

    expect(result).toEqual({ id: 'bug_test', status: 'sent' });
    expect(fetchImpl).toHaveBeenCalledWith('/api/bug-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(storage.getItem(BUG_REPORT_QUEUE_KEY)).toBeNull();
  });

  it('queues the report locally when the endpoint is not ready', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false }) as Response);
    const storage = createMemoryStorage();

    const result = await submitBugReport(payload, { fetchImpl, storage });

    expect(result).toEqual({ id: 'bug_test', status: 'queued' });
    expect(JSON.parse(storage.getItem(BUG_REPORT_QUEUE_KEY) ?? '[]')).toEqual([payload]);
  });

  it('queues locally without touching the network when network submission is disabled', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }) as Response);
    const storage = createMemoryStorage();

    const result = await submitBugReport(payload, {
      fetchImpl,
      networkEnabled: false,
      storage,
    });

    expect(result).toEqual({ id: 'bug_test', status: 'queued' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem(BUG_REPORT_QUEUE_KEY) ?? '[]')).toEqual([payload]);
  });
});
