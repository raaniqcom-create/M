'use client';

import { useEffect, useState } from 'react';
import { AlertSetup } from './AlertSetup';
import { ALERTS_CHANGED, readChoice } from '@/lib/alerts';

/** The alerts picker on the home page, for anyone who has not chosen yet.
 *
 *  It used to live inside WaitingForStations, which renders only while the
 *  station list is completely empty — so the moment the first station was
 *  approved it vanished, and the owner registration banner appeared in the same
 *  breath (app/page.tsx). Every visitor who arrived after launch therefore saw
 *  the owner's call to action and no way to ask for notifications. That is the
 *  inversion this fixes: the list filling up is not a reason to stop offering
 *  the thing most visitors came for. */
export function AlertsPrompt() {
  // 'none'  — never chose: show the picker
  // 'wide'  — chose, but left the city list empty back when that meant
  //           "every city in Anbar". 52 people did, and they are hearing about
  //           towns they will never drive to. The server cannot find them —
  //           `alerts` grants no SELECT — but their own device knows.
  const [state, setState] = useState<'ok' | 'none' | 'wide'>('ok');

  useEffect(() => {
    const sync = () => {
      const c = readChoice();
      setState(!c ? 'none' : c.cities.length ? 'ok' : 'wide');
    };
    sync();
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, []);

  if (state === 'ok') return null;

  // Offered, never enforced: their alerts keep working either way. Cutting
  // someone off to make a point about tidy data is not a fix.
  if (state === 'wide') {
    return (
      <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-extrabold text-amber-900">
          يصلك خبر كل مدن الأنبار
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900">
          اختر مدينتك فيصلك ما يخصّك وحده — ويقلّ الإزعاج كثيراً.
        </p>
        <a href="/alerts" className="btn-primary mt-3 w-full">
          اختر مدينتي
        </a>
      </section>
    );
  }

  return (
    <section className="card mt-6 border-brand-100 p-5">
      <AlertSetup compact />
    </section>
  );
}
