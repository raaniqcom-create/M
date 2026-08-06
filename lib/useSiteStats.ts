'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// One visit per browser session: a reload shouldn't inflate the counter, but
// coming back tomorrow should count again.
const SESSION_FLAG = 'visit-counted';

export function useSiteStats() {
  const [visits, setVisits] = useState<number | null>(null);
  const [online, setOnline] = useState(1);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_FLAG)) {
      supabase
        .from('site_stats')
        .select('visits')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => data && setVisits(data.visits));
    } else {
      sessionStorage.setItem(SESSION_FLAG, '1');
      supabase.rpc('increment_visits').then(({ data }) => typeof data === 'number' && setVisits(data));
    }

    // Realtime Presence gives a genuine concurrent-viewer count — no polling,
    // and members drop off automatically when their socket closes.
    const channel = supabase.channel('online-visitors', {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setOnline(Object.keys(channel.presenceState()).length || 1);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') channel.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { visits, online };
}
