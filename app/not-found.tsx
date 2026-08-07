'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FuelIcon, SpinnerIcon } from '@/components/icons';

// The site ships as static files, so only stations that existed at build time
// have their own page. A station registered since then would otherwise 404 on
// a link its owner just shared — so resolve the path here in the browser and
// send the visitor on. The build makes it a real page next time.
export default function NotFound() {
  const [state, setState] = useState<'checking' | 'missing'>('checking');

  useEffect(() => {
    const path = decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '');
    const stationId = path.startsWith('station/') ? path.slice('station/'.length) : null;
    const slug = stationId ? null : path;

    if (!path) {
      setState('missing');
      return;
    }

    (async () => {
      const query = supabase.from('stations').select('id').eq('status', 'approved');
      const { data } = stationId
        ? await query.eq('id', stationId).maybeSingle()
        : await query.ilike('slug', slug!).maybeSingle();

      if (data?.id) {
        // replace: the dead URL should not sit in the back history
        window.location.replace(`/station/${data.id}`);
      } else {
        setState('missing');
      }
    })().catch(() => setState('missing'));
  }, []);

  if (state === 'checking') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4">
        <SpinnerIcon className="h-6 w-6 text-brand" />
        <p className="text-sm text-slate-500">جارِ فتح صفحة المحطة…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <FuelIcon className="h-10 w-10 text-brand-200" />
      <h1 className="mt-4 text-lg font-extrabold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-sm text-slate-500">
        الرابط غير صحيح، أو أن المحطة لم تعد معتمدة.
      </p>
      <a href="/" className="btn-primary mt-5">
        الصفحة الرئيسية
      </a>
    </main>
  );
}
