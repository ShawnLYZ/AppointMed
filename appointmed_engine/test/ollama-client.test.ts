import { expect, test, vi } from 'vitest';
import { OllamaHttpClient, OllamaUnavailableError } from '../src/ollama/client.js';

const models = { intake: 'gemma4:12b', triage: 'gemma4:12b', prefs: 'gemma4:12b', relax: 'gemma4:12b', summary: 'gemma4:12b', attachment: 'gemma4:12b' };
const ok = (content: string) => ({ ok: true, json: async () => ({ message: { content } }) }) as Response;

function client(fetchFn: typeof fetch) {
  return new OllamaHttpClient({ url: 'http://o', models, fallbackModel: 'qwen3.5:9b', fetchFn, timeoutMs: 5000 });
}

test('sends /api/chat with format schema and parses the structured reply', async () => {
  const fetchFn = vi.fn().mockResolvedValue(ok('{"a":1}'));
  const res = await client(fetchFn as never).structured<{ a: number }>({
    stage: 'triage', messages: [{ role: 'user', content: 'hi' }], schema: { type: 'object' },
  });
  expect(res.value).toEqual({ a: 1 });
  expect(res.model).toBe('gemma4:12b');
  const [url, init] = fetchFn.mock.calls[0];
  expect(url).toBe('http://o/api/chat');
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ model: 'gemma4:12b', stream: false, format: { type: 'object' } });
});

test('retries same model on invalid JSON, then falls back to the fallback model', async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(ok('not-json'))
    .mockResolvedValueOnce(ok('still not json'))
    .mockResolvedValueOnce(ok('{"ok":true}'));
  const res = await client(fetchFn as never).structured<{ ok: boolean }>({
    stage: 'intake', messages: [], schema: {},
  });
  expect(res.value).toEqual({ ok: true });
  expect(res.model).toBe('qwen3.5:9b'); // third call used fallback
  expect(JSON.parse(fetchFn.mock.calls[2][1].body).model).toBe('qwen3.5:9b');
});

test('throws OllamaUnavailableError after all attempts fail', async () => {
  const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
  await expect(
    client(fetchFn as never).structured({ stage: 'summary', messages: [], schema: {} }),
  ).rejects.toBeInstanceOf(OllamaUnavailableError);
  expect(fetchFn).toHaveBeenCalledTimes(4); // 2 attempts × 2 models
});

test('a call carrying images never falls back to the fallback model', async () => {
  const fetchFn = vi.fn().mockRejectedValue(new Error('vision model down'));
  await expect(
    client(fetchFn as never).structured({
      stage: 'attachment',
      messages: [{ role: 'user', content: 'describe this', images: ['base64img'] }],
      schema: {},
    }),
  ).rejects.toBeInstanceOf(OllamaUnavailableError);
  // 2 attempts on the vision model only - MODEL_FALLBACK is never tried
  // against an image, since it is not documented as vision-capable.
  expect(fetchFn).toHaveBeenCalledTimes(2);
  for (const [, init] of fetchFn.mock.calls) {
    expect(JSON.parse(init.body).model).toBe('gemma4:12b');
  }
});
