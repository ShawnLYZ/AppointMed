export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; images?: string[] }
export type Stage = 'intake' | 'triage' | 'prefs' | 'relax' | 'summary' | 'attachment';
export interface StructuredResult<T> { value: T; model: string; latencyMs: number }

export interface OllamaClient {
  structured<T>(opts: { stage: Stage; messages: ChatMessage[]; schema: object }): Promise<StructuredResult<T>>;
}

export class OllamaUnavailableError extends Error {}

interface Cfg {
  url: string;
  models: Record<Stage, string>;
  fallbackModel: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export class OllamaHttpClient implements OllamaClient {
  constructor(private cfg: Cfg) {}

  async structured<T>({ stage, messages, schema }: {
    stage: Stage; messages: ChatMessage[]; schema: object;
  }): Promise<StructuredResult<T>> {
    const fetchFn = this.cfg.fetchFn ?? fetch;
    const timeoutMs = this.cfg.timeoutMs ?? 90_000;
    // A call that carries images must never fall back to MODEL_FALLBACK: nothing
    // documents that model as vision-capable, and constrained decoding only
    // guarantees the *shape* of {observation}, never its truth - a non-vision
    // model asked to describe a photo will happily return a confident,
    // fabricated description of a photograph it never saw. Exhausting the
    // vision model instead raises OllamaUnavailableError, which every caller
    // already catches and degrades to a logged NOT_ANALYSED fallback. Do not
    // "restore" the fallback here.
    const hasImages = messages.some((m) => m.images && m.images.length > 0);
    const candidates = hasImages
      ? [this.cfg.models[stage]]
      : [this.cfg.models[stage], this.cfg.fallbackModel];
    let lastErr: unknown;
    for (const model of candidates) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const started = Date.now();
        try {
          const res = await fetchFn(`${this.cfg.url}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model, messages, stream: false, format: schema,
              options: { temperature: 0.2 },
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) throw new Error(`ollama http ${res.status}`);
          const data = (await res.json()) as { message: { content: string } };
          const value = JSON.parse(data.message.content) as T;
          return { value, model, latencyMs: Date.now() - started };
        } catch (err) {
          lastErr = err;
        }
      }
    }
    throw new OllamaUnavailableError(String(lastErr));
  }
}
