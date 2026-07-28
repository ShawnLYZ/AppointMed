import { ADAPTER_URL } from './config'

async function call(key, path, options = {}) {
  const res = await fetch(`${ADAPTER_URL}${path}`, {
    ...options,
    headers: { 'x-api-key': key, 'content-type': 'application/json', ...(options.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

export const adapter = {
  getSpecialists: (key) => call(key, '/specialists'),
  getSlots: (key, params = {}) => call(key, `/slots?${new URLSearchParams(params)}`),
  confirm: (key, body) => call(key, '/appointment/confirm', { method: 'POST', body: JSON.stringify(body) }),
  decision: (key, body) => call(key, '/appointment/decision', { method: 'POST', body: JSON.stringify(body) }),
}
