'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Every entry counts — the number is there to show station owners that the
// platform has real traffic. The only guard is against a stuck refresh loop
// or a double-mount inflating it within seconds of itself.
const LAST_COUNTED = 'visit-counted-at';
const MIN_GAP_MS = 10_000;

export function useSiteStats() {
  const [visits, setVisits] = useState<number | null>(null);
  const [online, setOnline] = useState(1);

  useEffect(() => {
    const last = Number(localStorage.getItem(LAST_COUNTED) ?? 0);
    const countThis = Date.now() - last > MIN_GAP_MS;

    if (countThis) localStorage.setItem(LAST_COUNTED, String(Date.now()));

    const read = () =>
      supabase
        .from('site_stats')
        .select('visits')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => data && setVisits(data.visits));

    if (countThis) {
      supabase.rpc('increment_visits').then(({ data, error }) => {
        // never leave the counter blank if the write is refused
        if (!error && typeof data === 'number') setVisits(data);
        else read();
      });
    } else {
      read();
    }

    // The count climbing while the page is open is the point — a visitor
    // watching it move sees a live platform, not a static badge.
    // اسمٌ فريد لكل تركيب، كما تفعل قناة الحضور تحتها.
    //
    // supabase.channel('visit-counter') يُعيد **النسخة نفسها** لكل من يناديه
    // بالاسم نفسه. فإن رُكّب الخطّاف مرّتين — وضع React الصارم يفعلها في كل
    // تطوير، وتركيبان في شجرة واحدة يفعلانها في الإنتاج — نُودي on() على قناة
    // مشتركة سلفاً: «cannot add postgres_changes callbacks after subscribe()».
    // ويُرمى الخطأ فلا يُسجَّل المستمع، ويبقى الرقم ساكناً بلا عطلٍ ظاهر.
    const counter = supabase
      .channel(`visit-counter:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'site_stats' },
        (payload) => {
          const next = (payload.new as { visits?: number })?.visits;
          if (typeof next === 'number') setVisits(next);
        }
      )
      .subscribe();

    // Realtime Presence gives a genuine concurrent-viewer count — no polling,
    // and members drop off automatically when their socket closes.
    const presence = supabase.channel('online-visitors', {
      config: { presence: { key: crypto.randomUUID() } },
    });

    presence
      .on('presence', { event: 'sync' }, () => {
        setOnline(Object.keys(presence.presenceState()).length || 1);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') presence.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(counter);
      supabase.removeChannel(presence);
    };
  }, []);

  return { visits, online };
}
