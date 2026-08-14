import { supabase } from './supabase';

/** Asks the site to rebuild so a newly approved station gets its own page.
 *
 *  The export is static: without this the station's link 404s until someone
 *  pushes a commit, and the owner has already been handed that link. Takes
 *  about two minutes to land. Failure is deliberately quiet — the approval
 *  itself succeeded, and a rebuild also happens on the next push. */
/** Tells everyone watching this city that a station just joined it.
 *
 *  This is the promise the platform makes to a driver who subscribed while the
 *  map was still empty, so it fires on approval rather than waiting for the
 *  owner's first availability update — which may be days away. Quiet on
 *  failure: the approval stands either way. */
export async function announceStation(stationId: string): Promise<void> {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ stationId, newStation: true }),
    });
  } catch {
    /* the driver misses one announcement; the station is still approved */
  }
}

export async function rebuildSite(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rebuild`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
