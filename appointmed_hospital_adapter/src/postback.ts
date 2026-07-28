// Postback payload consumed by the engine's POST /postback (Phase 3).
// KEEP IN SYNC with docs/superpowers/plans/2026-07-02-phase3-workflow-engine.md.
export interface PostbackPayload {
  externalAppointmentId: string;
  hospitalId: string;
  action: 'confirmed' | 'declined' | 'rescheduled' | 'cancelled';
  proposedStartsAt?: string;
}

/** Returns true when the engine acknowledged the postback. */
export type PostbackSender = (payload: PostbackPayload) => Promise<boolean>;

export function makeHttpPostbackSender(
  engineUrl: string,
  secret: string,
  fetchFn: typeof fetch = fetch,
): PostbackSender {
  return async (payload) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetchFn(`${engineUrl}/postback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-postback-secret': secret },
          body: JSON.stringify(payload),
          // Node's fetch has no default timeout (undici waits 300s for headers) -
          // without this a wedged engine defeats the retry loop.
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return true;
      } catch {
        // network error or timeout - retry below
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500));
    }
    return false;
  };
}
