# AppointMed Hospital Adapter (:8090)

Simulates "the hospital's own system" as a real REST API. The workflow engine
and the manager portal call it with a **per-hospital API key** (`x-api-key`);
it pushes booking-lifecycle updates back to the engine via `POST /postback`.

## Run

    npm install
    npm start          # tsx src/index.ts, listens on :8090
    npm test           # vitest contract tests (hits the hosted Supabase DB)
    npm run typecheck

Config via `.env`: `PORT`, `DATABASE_URL`, `ENGINE_URL`, `POSTBACK_SECRET`. Copy
`.env.example` to `.env` and replace the `YOUR_...` placeholders in `DATABASE_URL`
with your own Supabase Session pooler string — the repository ships **no**
credentials, so the adapter refuses to start until you do. Use the same string as
`appointmed_engine/.env`, and keep `POSTBACK_SECRET` identical in both files.
README.md §6 Part C/D walks through it.

The per-hospital API keys are demo *data*, not repository secrets: `npm run db:seed`
writes them into your own database (`amk_demo_…`, see `supabase/seed.sql`), and the
portal issues real ones as `amk_live_<24 hex>` on subscribe.

## Contract

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness |
| `GET /specialists` | `x-api-key` | hospital's active specialists |
| `GET /slots?specialty=&maxPrice=&from=&to=&limit=` | `x-api-key` | open future slots, ordered by time |
| `POST /appointment/confirm` `{slotId, patientName, note?}` | `x-api-key` | submit booking → `pending`, returns `externalAppointmentId` |
| `POST /appointment/cancel` `{externalAppointmentId}` | `x-api-key` | cancel + reopen future slot |
| `POST /appointment/decision` `{externalAppointmentId, decision, proposedStartsAt?}` | `x-api-key` | manager confirm / decline / reschedule |

Outbound: `POST {ENGINE_URL}/postback` with header `x-postback-secret` and body
`{ externalAppointmentId, hospitalId, action: confirmed|declined|rescheduled|cancelled, proposedStartsAt? }`
— bounded retry ×3 (5s per-attempt timeout), delivery recorded on `hospital_bookings.postback_delivered`.

Errors are `{ "error": "code" }`: `missing_api_key`, `invalid_api_key` (401),
`slot_not_found`, `booking_not_found` (404), `slot_taken`, `already_decided` (409),
`invalid_decision`, `proposed_time_required`, `invalid_query` (400),
`internal_error` (500 — any unhandled fault; body never leaks driver/stack text).
