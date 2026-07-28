# appointmed_mobile

AppointMed's Flutter patient app: an AI symptom-triage chat that ends in a
confirmed hospital appointment. The chat talks to the local AppointMed
engine (not a hosted LLM API), which in turn talks to Ollama and a hospital
adapter for booking/decision flows.

## Prerequisites

Before the app can complete a consult end to end, have the rest of the
stack up:

- The Phase-1 Supabase seed applied (see `supabase/README.md` at the repo
  root).
- The local AppointMed engine running on `:8080`.
- The hospital adapter running on `:8090`.
- Ollama running (the engine's model backend).

## Run

```bash
flutter pub get
flutter run
```

Run on an Android emulator: the app reaches the engine at
`http://10.0.2.2:8080` (the emulator's alias for the host machine). On
other platforms it uses `http://localhost:8080` directly.

## Demo login

- Email: `patient@appointmed.demo`
- Password: `AppointMed!2026`

## Test & lint

```bash
flutter test        # all tests
flutter analyze      # static analysis / lint
```
