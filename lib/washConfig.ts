'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { EMPTY_WASH_CONFIG, type WashConfig } from './wash';

/** باقاتُ المغاسل وحدودُها من القاعدة (wash_config) — نداءٌ واحدٌ يُحفظ للجلسة.
 *  لا رقمَ ثابتاً في الكود: الإدارةُ تغيّر السعرَ فيظهر بلا نشر (§86.17). */
let cached: WashConfig | null = null;
let inflight: Promise<WashConfig> | null = null;

export function loadWashConfig(): Promise<WashConfig> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data } = await supabase.rpc('wash_config');
        const c = (data as WashConfig | null) ?? EMPTY_WASH_CONFIG;
        cached = c;
        return c;
      } catch {
        return EMPTY_WASH_CONFIG;
      }
    })();
  }
  return inflight;
}

/** نكزةُ wash-tick بعد حجزٍ أو تغييرِ حالة: يُفرَّغ صندوقُ الإشعارات الآن لا بعد عشر دقائق.
 *  بلا جسمٍ وبلا انتظار — الفشلُ صامتٌ لأنّ الكرونَ يلحق به. */
export function pokeWashTick(): void {
  try {
    void fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/wash-tick`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    }).catch(() => {});
  } catch {
    /* لا شبكة */
  }
}

export function useWashConfig(): WashConfig | null {
  const [cfg, setCfg] = useState<WashConfig | null>(cached);
  useEffect(() => {
    let alive = true;
    void loadWashConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
