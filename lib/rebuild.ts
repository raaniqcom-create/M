import { supabase } from './supabase';
import { callFn } from './fn';

/** Asks the site to rebuild so a newly approved station gets its own page.
 *
 *  The export is static: without this the station's link 404s until someone
 *  pushes a commit, and the owner has already been handed that link. Takes
 *  about two minutes to land. Failure is deliberately quiet — the approval
 *  itself succeeded, and a rebuild also happens on the next push. */
/** Tells the station's owner that their station is live, and the admin that it
 *  was approved.
 *
 *  It used to tell the whole city. That was the wrong audience: a station that
 *  has just joined has no fuel to report, and someone who subscribed to
 *  «بانزين محسن في الرمادي» was pulled out of their day for an event they can
 *  do nothing with. Citizens hear from a station when it announces fuel.
 *  Quiet on failure: the approval stands either way. */
export async function announceStation(stationId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ stationId, newStation: true }),
    });
  } catch {
    /* the driver misses one announcement; the station is still approved */
  }
}

/** Returns the reason it failed, or null when the rebuild was accepted.
 *
 *  It used to return a bare boolean that every caller ignored. That hid a real
 *  outage: the gateway was rejecting the token, so approving a station flipped
 *  its status and announced it to every subscriber while the station's own page
 *  was never generated. Approval looked perfect and the link 404'd. */
export async function rebuildSite(): Promise<string | null> {
  const r = await callFn('rebuild');
  return r.ok ? null : r.error;
}
