// PLACEHOLDERS — replace the two `YOUR_...` values below with your own Supabase
// project's Project URL and anon/public key. See README.md §6 Part D (D3).
//
// Only ever put the anon/PUBLIC key here. This file is bundled into a web page
// that anyone can view; the service_role/secret key must never appear in it.
//
// Alternative to editing this file: set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// in `appointmed_website/.env.local` (git-ignored) — those win over the literals.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://gkbleklehgcsrxptolhe.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYmxla2xlaGdjc3J4cHRvbGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDEwOTcsImV4cCI6MjA5ODQxNzA5N30.dPB0uYmxEnE309-v7DohugErLi-PMMblyj9UIEO8e_o'

export const ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:8080'
export const ADAPTER_URL = import.meta.env.VITE_ADAPTER_URL ?? 'http://localhost:8090'

/** True once the two values above are no longer placeholders. */
export const IS_CONFIGURED =
  !SUPABASE_URL.includes('YOUR_') && !SUPABASE_ANON_KEY.includes('YOUR_')
