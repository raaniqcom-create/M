'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Session = {
  signedIn: boolean;
  role: 'admin' | 'owner' | null;
  /** False until the first answer lands. Anything that must not
   *  appear for a signed-in owner has to wait for this: the check is
   *  two network round trips, and 1-3s of "nobody is signed in" on
   *  Iraqi mobile data is long enough to flash a whole screen. */
  ready: boolean;
};

/** Who is holding the phone, if anyone. The menu and the home screen both need
 *  it to stop offering "sign in" to someone already signed in. */
export function useSession(): Session {
  const [session, setSession] = useState<Session>({
    signedIn: false,
    role: null,
    ready: false,
  });

  useEffect(() => {
    let alive = true;

    async function read() {
      // stored session rather than a round trip: this hook drives the side
      // menu, and a dropped request used to redraw a signed-in owner as a
      // stranger being invited to register
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!alive) return;
      if (!user) return setSession({ signedIn: false, role: null, ready: true });
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      // A failed read is not an owner. signedIn is now decided from storage
      // without a network call while role still needs one, so an offline moment
      // used to classify an admin as 'owner' — and the home page then redirected
      // them to an owner panel with no station. Stay unresolved instead: no
      // redirect fires until the role is actually known.
      if (error) {
        if (alive) setSession({ signedIn: true, role: null, ready: true });
        return;
      }
      if (alive) {
        setSession({
          signedIn: true,
          role: profile?.role === 'admin' ? 'admin' : 'owner',
          ready: true,
        });
      }
    }

    read();
    // a sign-out in another tab, or a token refresh, must reach this too
    const { data: sub } = supabase.auth.onAuthStateChange(() => read());
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return session;
}

/** Where a signed-in person should land. An owner opening the app wants the
 *  panel they work in, not the list they already know; ?view=user is the
 *  explicit way out, so the redirect never traps them. */
export function homeFor(role: Session['role']): string | null {
  return role === 'admin' ? '/admin' : role === 'owner' ? '/owner' : null;
}
