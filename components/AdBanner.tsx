'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Ad {
  id: string;
  image_url: string;
  link_url: string;
}

// RLS already filters to active + in-date rows, so no client-side date logic
export function AdBanner() {
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    supabase
      .from('ads')
      .select('id, image_url, link_url')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAd(data));
  }, []);

  if (!ad) return null;

  return (
    <a
      href={ad.link_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="block overflow-hidden rounded-2xl border border-slate-200"
    >
      {/* advertiser-supplied URL; aspect-ratio box reserves space to avoid CLS */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ad.image_url}
        alt="إعلان"
        loading="lazy"
        width={640}
        height={160}
        className="aspect-[4/1] w-full object-cover"
      />
    </a>
  );
}
