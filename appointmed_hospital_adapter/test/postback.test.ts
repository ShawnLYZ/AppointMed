import { expect, test, vi } from 'vitest';
import { makeHttpPostbackSender } from '../src/postback.js';

const payload = {
  externalAppointmentId: 'ext_0011223344556677',
  hospitalId: 'f0000000-0000-4000-8000-000000000001',
  action: 'confirmed' as const,
};

test('retries after network failure and succeeds', async () => {
  const fetchFn = vi
    .fn()
    .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    .mockResolvedValueOnce({ ok: true } as Response);
  const send = makeHttpPostbackSender('http://localhost:8080', 's3cret', fetchFn as unknown as typeof fetch);
  await expect(send(payload)).resolves.toBe(true);
  expect(fetchFn).toHaveBeenCalledTimes(2);
  const [url, init] = fetchFn.mock.calls[0];
  expect(url).toBe('http://localhost:8080/postback');
  expect(init.headers['x-postback-secret']).toBe('s3cret');
  expect(JSON.parse(init.body)).toEqual(payload);
});

test('gives up after 3 attempts and returns false', async () => {
  const fetchFn = vi.fn().mockResolvedValue({ ok: false } as Response);
  const send = makeHttpPostbackSender('http://localhost:8080', 's3cret', fetchFn as unknown as typeof fetch);
  await expect(send(payload)).resolves.toBe(false);
  expect(fetchFn).toHaveBeenCalledTimes(3);
});
