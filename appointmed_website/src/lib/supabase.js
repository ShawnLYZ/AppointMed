import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, IS_CONFIGURED } from './config'

// Say so loudly in the console rather than letting every query fail with an
// unexplained network error against a host that does not exist.
if (!IS_CONFIGURED) {
  console.error(
    'AppointMed portal is not configured: src/lib/config.js still holds YOUR_... placeholders.\n' +
      'Paste your own Supabase Project URL and anon key there (README.md §6 Part D, step D3).',
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
