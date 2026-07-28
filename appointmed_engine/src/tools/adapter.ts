import type { SlotOption } from '../workflow/types.js';
export interface AdapterSlotQuery { specialty: string; maxPrice?: number; from?: string; to?: string; limit?: number }
export interface AdapterClient {
  getSlots(apiKey: string, q: AdapterSlotQuery): Promise<SlotOption[]>;
  confirm(apiKey: string, body: { slotId: string; patientName: string; note?: string }): Promise<{ externalAppointmentId: string }>;
  cancel(apiKey: string, externalAppointmentId: string): Promise<void>;
}
export class HttpAdapterClient implements AdapterClient {
  constructor(private baseUrl: string, private fetchFn: typeof fetch = fetch) {}
  async getSlots(apiKey: string, q: AdapterSlotQuery): Promise<SlotOption[]> {
    const params = new URLSearchParams({ specialty: q.specialty });
    if (q.maxPrice != null) params.set('maxPrice', String(q.maxPrice));
    if (q.from) params.set('from', q.from);
    if (q.to) params.set('to', q.to);
    if (q.limit != null) params.set('limit', String(q.limit));
    const res = await this.fetchFn(`${this.baseUrl}/slots?${params}`, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) throw new Error(`adapter /slots ${res.status}`);
    return (await res.json()).slots as SlotOption[];
  }
  async confirm(apiKey: string, body: { slotId: string; patientName: string; note?: string }) {
    const res = await this.fetchFn(`${this.baseUrl}/appointment/confirm`, {
      method: 'POST', headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) throw new SlotTakenError();
    if (!res.ok) throw new Error(`adapter /appointment/confirm ${res.status}`);
    return { externalAppointmentId: (await res.json()).externalAppointmentId as string };
  }
  async cancel(apiKey: string, externalAppointmentId: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/appointment/cancel`, {
      method: 'POST', headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ externalAppointmentId }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`adapter /appointment/cancel ${res.status}`);
  }
}
export class SlotTakenError extends Error {}
