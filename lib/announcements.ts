'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { FuelProduct } from '@/types/database';

export interface OpenAnnouncement {
  id: string;
  station_name: string;
  origin_city: string | null;
  product: FuelProduct | null;
  cities: string[] | null;
  send_at: string;
  yes_votes: number;
  no_votes: number;
}

/** أخبار اليوم عن محطات لم تنضمّ — يقرؤها سطحان، فتُجلب مرة.
 *
 *  اللوحة الحمراء تعرضها، ولوحة المنتجات تحتاج معرفتها لتُميّز ما جاء منها:
 *  «بانزين محسن ١» من محطة مسجّلة ليس كـ«بانزين محسن ١» من إشعارٍ لا نعرف عن
 *  صاحبه شيئاً. ولو جلبها كلٌّ لنفسه لصار نداءان وصورتان قد تختلفان — وهو
 *  بالضبط شكل العطل الذي أنفقنا اليوم في مطاردة نسخه. */
export function useOpenAnnouncements() {
  const [rows, setRows] = useState<OpenAnnouncement[] | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('open_announcements');
    setRows(error ? [] : ((data ?? []) as OpenAnnouncement[]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { announcements: rows ?? [], reload };
}

/** ما يخصّ هذا المستخدم منها — بجمهور الإشعار نفسه الذي قرّرته الإدارة. */
export function forCities(
  rows: OpenAnnouncement[],
  cities: string[] | null | undefined
): OpenAnnouncement[] {
  if (!cities?.length) return rows;
  return rows.filter((r) => !r.cities?.length || r.cities.some((c) => cities.includes(c)));
}
