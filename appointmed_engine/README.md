# AppointMed Workflow Engine (:8080)

The workflow engine is the AI orchestrator behind an AppointMed consultation: it
runs a local-LLM-driven state machine that collects symptoms, triages a
specialty + urgency, searches the hospital adapter for matching slots, submits
a booking, and tracks the hospital's response — all while logging every
decision, tool call, transition, and fallback to Postgres for a full audit
trail. It talks to the hospital adapter over HTTP (per-hospital API key) and
to a local Ollama server for every LLM call; it never talks to the mobile or
web apps directly — the engine is Phase 3 of the pitch, standing on its own
HTTP + Postgres/Supabase surface.

## Run

```
npm install
npm run dev          # tsx watch src/index.ts — auto-reload for local dev
npm start            # tsx src/index.ts — single run, used in the manual smoke
npm run typecheck    # tsc --noEmit
npm test             # vitest run --no-file-parallelism — hits the hosted Supabase DB
```

`npm test` runs sequentially (`--no-file-parallelism`) and against the real
hosted Supabase project (see `vitest.config.ts` for the widened hook/test
timeouts that absorb pooler latency) — there is no local/mocked DB mode.

## Config

Copy `.env.example` to `.env` and fill in the four `YOUR_...` placeholders with
your own Supabase project's values — the repository ships **no** credentials, so
the engine refuses to start until you do (it names the missing variable and the
file to fix). README.md §6 Part C shows where to find each value; Part D shows
what to paste. `npm run dev` from the repo root creates the `.env` for you if it
is missing, but cannot fill it in.

This `.env` is also the single source of truth for `npm test` (loaded by
`vitest.config.ts`) and for the repo-root `npm run db:*` scripts.

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port the engine listens on |
| `DATABASE_URL` | **placeholder — must be set** | direct SQL (`pg.Pool`) access to `workflow_runs`, `workflow_steps`, `appointments`, etc. Use the Session pooler string, not "Direct connection" |
| `SUPABASE_URL` | **placeholder — must be set** | Supabase Auth (verifies each request's bearer token) and Storage (medical file / verification-doc uploads) |
| `SUPABASE_ANON_KEY` | **placeholder — needed by `npm test`** | public key; the test suite uses it to sign its fixture patient in. The server itself never needs it |
| `SUPABASE_SERVICE_ROLE_KEY` | **placeholder — must be set** | server-side Supabase client — bypasses RLS; never expose this to a client app |
| `ADAPTER_URL` | `http://localhost:8090` | base URL of the hospital adapter (`appointmed_hospital_adapter`) |
| `POSTBACK_SECRET` | `appointmed-postback-demo-secret` | validates the inbound `x-postback-secret` header on `POST /postback`. Localhost-only shared secret; must match the adapter's. Change both for a real deployment |
| `OLLAMA_URL` | `http://localhost:11434` | base URL of the local Ollama server |
| `MODEL_DEFAULT` | `gemma4:12b` | model used for every stage unless overridden per-stage |
| `MODEL_FALLBACK` | `qwen3.5:9b` | second model tried if the stage model's own attempts fail |
| `MODEL_INTAKE` / `MODEL_TRIAGE` / `MODEL_PREFS` / `MODEL_RELAX` / `MODEL_SUMMARY` | unset → falls back to `MODEL_DEFAULT` | per-stage model overrides, one per workflow stage (see below) |

## Consult API

Every route below except `POST /postback` and `POST /portal/subscribe`
requires `Authorization: Bearer <Supabase access token>`. Errors are always
`{ "error": "<snake_case_code>" }` — including unhandled faults, which the
global Fastify error handler turns into `{ "error": "internal_error" }` (500)
rather than leaking driver/stack text.

Every `/consult/*` and `/runs/*` route returns the same envelope:

```ts
interface ConsultReply {
  runId: string;
  node: 'intake' | 'triage' | 'match' | 'book_request' | 'hospital_review' | 'postback' | 'done';
  status: 'active' | 'waiting_hospital' | 'completed' | 'failed' | 'escalated';
  reply: string;                     // assistant-facing chat text for this turn
  verdict?: { specialty: string; urgency: 'asap' | 'week' | 'month' | 'routine'; explanation: string; redFlags: string[] };
  slotOptions?: SlotOption[];        // present once matching has slots to offer
  appointment?: { id: string; status: string; startsAt: string; hospitalName: string;
                  specialistName: string; specialty: string; price: number | null };
  escalated?: boolean;               // true once a red-flag symptom has sealed the run
}
```

| Route | Auth | Purpose |
|---|---|---|
| `POST /consult/start` | bearer | start a new run (fresh `workflow_runs` row + `ai_chats` row); returns the opening greeting |
| `POST /consult/:runId/message` `{text}` | bearer | advance the state machine one turn (intake → triage → match, including preference collection and slot search) |
| `POST /consult/:runId/upload` | bearer, multipart | attach an image or PDF — **intake only** (409 outside intake); images are queued as base64 for the next model turn, PDFs are text-extracted inline |
| `POST /consult/:runId/select-slot` `{slotId}` | bearer | confirm a presented slot → submits the booking via the hospital adapter, transitions to `hospital_review` |
| `GET /consult/:runId` | bearer | current run state + full chat transcript (owner-only; 404 for any other user's run) |
| `GET /runs/:runId/steps` | bearer | the full `workflow_steps` audit trail for a run — see **Run-log** below |
| `POST /appointments/:id/respond` `{action}` | bearer | patient responds to a hospital decision: `accept_reschedule` \| `re_match` \| `cancel` |
| `POST /postback` | `x-postback-secret` header | hospital adapter → engine: appointment lifecycle push — see **Postback contract** below |
| `POST /portal/subscribe` | none | hospital signup: creates the hospital, subscription, first API key, starter specialist/slot inventory, and the manager's account |
| `POST /portal/specialists/:id/toggle` | bearer (`hospital_manager`) | flip a specialist's `is_active` (own hospital only; 404 on a foreign specialist) |
| `POST /portal/api-key/regenerate` | bearer (`hospital_manager`) | rotate the caller's hospital API key |
| `POST /portal/verification-docs` | bearer (`hospital_manager`), multipart | upload one or more hospital verification documents |
| `GET /health` | none | liveness check |

## Postback contract

`POST /postback` mirrors the Phase-2 hospital adapter's outbound contract
exactly — see `appointmed_hospital_adapter/README.md` for the sender side
(bounded retry, delivery tracking). Body:

```json
{
  "externalAppointmentId": "...",
  "hospitalId": "...",
  "action": "confirmed | declined | rescheduled | cancelled",
  "proposedStartsAt": "ISO 8601 — required when action is \"rescheduled\""
}
```

Auth is the shared `x-postback-secret` header (must equal `POSTBACK_SECRET`) —
there is no Supabase bearer token on this route, since the adapter has no
patient session. A `rescheduled` postback moves the run to a patient-facing
decision point (`respond` with `accept_reschedule` or `re_match`); `confirmed`
and `cancelled` close the run; `declined` re-enters matching, excluding that
hospital.

## Model configuration

Five workflow stages each make their own structured (JSON-schema-constrained)
Ollama call: **intake**, **triage**, **prefs**, **relax**, **summary**. Each
stage resolves its model independently — `MODEL_INTAKE` etc. if set, else
`MODEL_DEFAULT` — and every call retries its stage model twice, then
`MODEL_FALLBACK` twice, before raising `OllamaUnavailableError`
(`src/ollama/client.ts`). When even that is exhausted, the calling node
degrades to a deterministic, logged fallback instead of crashing the run —
e.g. triage without a working model falls back to `General Practice` /
`routine`, matching's constraint-relaxation falls back to a fixed relax order
(time → hospital → budget). This is the "LLM removed ⇒ workflow collapses
safely" behavior: stop Ollama mid-run and the consult keeps responding, just
without model-quality reasoning.

## Run-log / audit trail

`GET /runs/:runId/steps` returns every `workflow_steps` row for a run, in
order, each tagged with a `kind`:

- `llm_decision` — a structured Ollama call succeeded (records the model used and latency)
- `tool_call` — a call to the hospital adapter (`getSlots`/`confirm`/`cancel`) or a file tool (`extractPdfText`/`storeMedicalFile`)
- `transition` — the run moved to a new node
- `fallback` — an Ollama call failed and a deterministic fallback decision was substituted
- `error` — an underlying call failed and was handled without crashing the run (e.g. the hospital adapter was unreachable during matching)

For a demo: drive a consult through `/consult/start` → a few `/message` turns
→ `/select-slot`, then hit `GET /runs/:runId/steps` — it's the inspectable
proof that the "AI" is a sequence of real, logged decisions and tool calls
rather than a black box, including any `fallback`/`error` entries if Ollama or
the adapter degrades mid-run.
