import { createClient } from '@supabase/supabase-js';

// A hanging request never settles, so callers' .catch() never runs and the UI
// spins forever — the normal case on a weak mobile connection. Time every
// request out here rather than at each call site.
const REQUEST_TIMEOUT_MS = 12000;

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  }
);
