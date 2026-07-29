import { ENGINE_URL } from './config'

async function json(res) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? `engine ${res.status}`), { code: body.error, status: res.status })
  return body
}

export const engine = {
  subscribe: (payload) =>
    fetch(`${ENGINE_URL}/portal/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(json),

  uploadVerificationDocs: (files, token) => {
    const form = new FormData()
    files.forEach((f) => form.append('file', f, f.name))
    return fetch(`${ENGINE_URL}/portal/verification-docs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }).then(json)
  },

  toggleSpecialist: (id, token) =>
    fetch(`${ENGINE_URL}/portal/specialists/${id}/toggle`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).then(json),

  regenerateApiKey: (token) =>
    fetch(`${ENGINE_URL}/portal/api-key/regenerate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).then(json),

  appointmentAttachments: (appointmentId, token) =>
    fetch(`${ENGINE_URL}/portal/appointments/${appointmentId}/attachments`, {
      headers: { authorization: `Bearer ${token}` },
    }).then(json),
}
