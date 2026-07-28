import { OllamaUnavailableError, type ChatMessage, type OllamaClient, type Stage, type StructuredResult } from '../src/ollama/client.js';

export class OllamaStub implements OllamaClient {
  calls: { stage: Stage; messages: ChatMessage[] }[] = [];
  private queue: (unknown | Error)[] = [];
  enqueue(...decisions: (unknown | Error)[]) { this.queue.push(...decisions); }
  async structured<T>({ stage, messages }: { stage: Stage; messages: ChatMessage[]; schema: object; }): Promise<StructuredResult<T>> {
    this.calls.push({ stage, messages });
    if (this.queue.length === 0) throw new Error(`OllamaStub queue empty (stage ${stage})`);
    const next = this.queue.shift();
    if (next instanceof Error) throw new OllamaUnavailableError(next.message);
    return { value: next as T, model: 'stub', latencyMs: 1 };
  }
}
