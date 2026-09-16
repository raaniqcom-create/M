'use client';

import { supabase } from './supabase';

/** عدّاداتُ المغسلة (مشاهدة/اتصال/طريق) — مرّةً في اليوم لكلّ جهازٍ ونوع، كنمط silenceViews. */
const KEY = 'wash-seen';
const dayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });

function read(): { day: string; keys: string[] } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day: string; keys: string[] } | null;
    if (v && v.day === dayKey() && Array.isArray(v.keys)) return v;
  } catch {
    /* لا شيء */
  }
  return { day: dayKey(), keys: [] };
}

export function seenWash(id: string, kind: 'view' | 'call' | 'route'): void {
  const k = `${id}:${kind}`;
  const seen = read();
  if (seen.keys.includes(k)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: seen.day, keys: [...seen.keys, k].slice(-200) }));
  } catch {
    /* تصفّحٌ خاصّ */
  }
  void supabase.rpc('wash_seen', { p_id: id, p_kind: kind }).then(() => undefined, () => undefined);
}
