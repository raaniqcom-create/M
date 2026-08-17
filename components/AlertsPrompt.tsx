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
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sync = () => setShow(readChoice() === null);
    sync();
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, []);

  if (!show) return null;

  return (
    <section className="card mt-6 border-brand-100 p-5">
      <AlertSetup compact />
    </section>
  );
}
