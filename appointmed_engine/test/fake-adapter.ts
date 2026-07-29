import type { AdapterClient, AdapterSlotQuery } from '../src/tools/adapter.js';
import type { SlotOption } from '../src/workflow/types.js';

export class FakeAdapterClient implements AdapterClient {
  slotsByKey: Record<string, SlotOption[]> = {};
  confirms: { apiKey: string; slotId: string; patientName: string; note?: string }[] = [];
  cancels: { apiKey: string; externalAppointmentId: string }[] = [];
  failNextGetSlots = false;
  failNextConfirm = false;
  failNextCancel = false;
  private n = 0;

  async getSlots(apiKey: string, q: AdapterSlotQuery): Promise<SlotOption[]> {
    if (this.failNextGetSlots) { this.failNextGetSlots = false; throw new Error('adapter down'); }
    return (this.slotsByKey[apiKey] ?? [])
      .filter((s) => s.specialty === q.specialty)
      .filter((s) => q.maxPrice == null || s.price <= q.maxPrice)
      .filter((s) => !q.from || s.startsAt >= q.from)
      .filter((s) => !q.to || s.startsAt <= q.to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, q.limit ?? 20);
  }
  async confirm(apiKey: string, body: { slotId: string; patientName: string; note?: string }) {
    if (this.failNextConfirm) { this.failNextConfirm = false; throw new Error('adapter down'); }
    this.confirms.push({ apiKey, ...body });
    return { externalAppointmentId: `ext_fake_${++this.n}` };
  }
  async cancel(apiKey: string, externalAppointmentId: string): Promise<void> {
    if (this.failNextCancel) { this.failNextCancel = false; throw new Error('adapter down'); }
    this.cancels.push({ apiKey, externalAppointmentId });
  }
}
