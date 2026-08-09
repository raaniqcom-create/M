'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Session = { signedIn: boolean; role: 'admin' | 'owner' | null };

/** Who is holding the phone, if anyone. The menu and the home screen both need
 *  it to stop offering "sign in" to someone already signed in. */
export function useSession(): Session {
  const [session, setSession] = useState<Session>({ signedIn: false, role: null });

  useEffect(() => {
    let alive = true;

    async function read() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) return setSession({ signedIn: false, role: null });
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
      if (alive) {
        setSession({ signedIn: true, role: profile?.role === 'admin' ? 'admin' : 'owner' });
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
