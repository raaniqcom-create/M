import { supabase } from './supabase';

/** Asks the site to rebuild so a newly approved station gets its own page.
 *
 *  The export is static: without this the station's link 404s until someone
 *  pushes a commit, and the owner has already been handed that link. Takes
 *  about two minutes to land. Failure is deliberately quiet — the approval
 *  itself succeeded, and a rebuild also happens on the next push. */
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
