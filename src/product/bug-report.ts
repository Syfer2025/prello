export const BUG_REPORT_QUEUE_KEY = 'prelo-bug-report-queue';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BugReportAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface BugReportPayload {
  id: string;
  message: string;
  projectName: string;
  pageUrl: string;
  userAgent: string;
  createdAt: string;
  attachment?: BugReportAttachment;
}

export interface BuildBugReportPayloadOptions {
  id?: string;
  message: string;
  projectName?: string;
  file?: File | null;
  pageUrl?: string;
  userAgent?: string;
  now?: Date;
}

export interface SubmitBugReportOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  networkEnabled?: boolean;
  storage?: StorageLike;
}

export interface SubmitBugReportResult {
  id: string;
  status: 'sent' | 'queued';
}

function createBugReportId(now: Date) {
  return `bug_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
}

function shouldUseNetworkForBugReports() {
  if (typeof window === 'undefined') return true;
  return !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function readFileAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return Promise.reject(new Error('FileReader indisponivel para anexar imagem.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Nao foi possivel ler a imagem anexada.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Nao foi possivel ler a imagem anexada.'));
    reader.readAsDataURL(file);
  });
}

export async function buildBugReportPayload({
  id,
  message,
  projectName,
  file,
  pageUrl = typeof window !== 'undefined' ? window.location.href : '',
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  now = new Date(),
}: BuildBugReportPayloadOptions): Promise<BugReportPayload> {
  const payload: BugReportPayload = {
    id: id ?? createBugReportId(now),
    message: message.trim(),
    projectName: projectName?.trim() || 'Sem titulo',
    pageUrl,
    userAgent,
    createdAt: now.toISOString(),
  };

  if (file) {
    payload.attachment = {
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
    };
  }

  return payload;
}

export function queueBugReport(payload: BugReportPayload, storage?: StorageLike) {
  if (!storage) return;

  const rawQueue = storage.getItem(BUG_REPORT_QUEUE_KEY);
  let queue: BugReportPayload[] = [];
  if (rawQueue) {
    try {
      const parsed = JSON.parse(rawQueue);
      if (Array.isArray(parsed)) queue = parsed;
    } catch {
      queue = [];
    }
  }

  queue.push(payload);
  storage.setItem(BUG_REPORT_QUEUE_KEY, JSON.stringify(queue));
}

export async function submitBugReport(
  payload: BugReportPayload,
  {
    endpoint = '/api/bug-reports',
    fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
    networkEnabled = shouldUseNetworkForBugReports(),
    storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
  }: SubmitBugReportOptions = {}
): Promise<SubmitBugReportResult> {
  if (fetchImpl && networkEnabled) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        return { id: payload.id, status: 'sent' };
      }
    } catch {
      // Backend ainda pode nao existir em desenvolvimento; a fila local preserva o relato.
    }
  }

  queueBugReport(payload, storage);
  return { id: payload.id, status: 'queued' };
}
