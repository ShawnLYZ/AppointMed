// PLACEHOLDERS — replace the two `YOUR_...` values below with your own Supabase
// project's Project URL and anon/public key. See README.md §6 Part D (D3).
//
// Only ever put the anon/PUBLIC key here. This file is bundled into a web page
// that anyone can view; the service_role/secret key must never appear in it.
//
// Alternative to editing this file: set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// in `appointmed_website/.env.local` (git-ignored) — those win over the literals.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR_PROJECT_REF.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'YOUR_SUPABASE_ANON_KEY'

export const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:8080'
export const ADAPTER_URL = import.meta.env.VITE_ADAPTER_URL ?? 'http://localhost:8090'

/** True once the two values above are no longer placeholders. */
export const IS_CONFIGURED =
  !SUPABASE_URL.includes('YOUR_') && !SUPABASE_ANON_KEY.includes('YOUR_')
