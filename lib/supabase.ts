import { createClient } from '@supabase/supabase-js';

// A hanging request never settles, so callers' .catch() never runs and the UI
// spins forever — the normal case on a weak mobile connection. Time every
// request out here rather than at each call site.
const REQUEST_TIMEOUT_MS = 12000;

// AbortSignal.timeout only exists from iOS 16. On an older iPhone the call
// below threw before the request was ever made, so every query failed at once
// — and the one screen that has no error state for it, the station list, sat
// on a spinner. This falls back to the controller that has always existed.
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Stated rather than left to defaults: the shells are WebViews, and a
      // session that silently fails to persist means the owner signs in again
      // every single time they open the app.
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'muhta-auth',
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS) }),
    },
  }
);
