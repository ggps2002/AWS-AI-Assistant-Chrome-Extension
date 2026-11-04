import { getSettings } from './config';
import type { AssistantReply, ElementCandidate, PageContext, TourStep } from './types';

export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Extra attempts after the first. Network errors and 429/502/503/504 are retried; other errors are not. */
  retries?: number;
  onRetry?: (attempt: number) => void;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // Not JSON: Hugging Face serves an HTML page while a Space is starting.
  }
  return undefined;
}

async function post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const { backendUrl } = await getSettings();
  const url = backendUrl.replace(/\/+$/, '') + path;
  const retries = options.retries ?? 3;
  let lastError: ApiError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      options.onRetry?.(attempt);
      await delay(Math.min(1500 * 2 ** (attempt - 1), 8000), options.signal);
    }

    const signals = [AbortSignal.timeout(options.timeoutMs ?? 60_000)];
    if (options.signal) signals.push(options.signal);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
      });
      if (response.ok) return (await response.json()) as T;

      // 502/503/504: the Hugging Face Space is waking up or the model is briefly unavailable.
      // 429: rate limited. These clear up on retry; a 500 (a bug or bad config) won't.
      const retryable = [429, 502, 503, 504].includes(response.status);
      const detail = await readErrorDetail(response);
      lastError = new ApiError(detail ?? `The assistant returned an error (${response.status}).`, response.status, retryable);
      if (!retryable) throw lastError;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (error instanceof ApiError && !error.retryable) throw error;
      if (!(error instanceof ApiError)) {
        lastError = new ApiError('Could not reach the assistant. Check your connection or the backend URL in settings.', undefined, true);
      }
    }
  }
  throw lastError ?? new ApiError('Request failed.');
}

function normalizeReply(raw: Partial<AssistantReply> | null | undefined): AssistantReply {
  const type = raw?.type && ['answer', 'clarify', 'guide', 'deny'].includes(raw.type) ? raw.type : 'answer';
  const tour = raw?.tour && Array.isArray(raw.tour.steps) && raw.tour.steps.length > 0 ? raw.tour : null;
  return {
    type: type === 'guide' && !tour ? 'answer' : type,
    message: typeof raw?.message === 'string' ? raw.message : '',
    options: Array.isArray(raw?.options) ? raw.options.filter((o): o is string => typeof o === 'string') : [],
    tour,
  };
}

export async function sendChat(
  messages: ApiMessage[],
  page: PageContext | undefined,
  options: RequestOptions = {},
): Promise<AssistantReply> {
  const reply = await post<Partial<AssistantReply>>('/chat', { messages, page }, { retries: 5, ...options });
  return normalizeReply(reply);
}

export async function resolveTarget(step: TourStep, candidates: ElementCandidate[], url: string): Promise<number | null> {
  const result = await post<{ id?: number | null }>(
    '/resolve',
    { step, candidates, url },
    { retries: 1, timeoutMs: 20_000 },
  );
  return typeof result.id === 'number' ? result.id : null;
}
