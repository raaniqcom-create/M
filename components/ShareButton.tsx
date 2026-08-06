'use client';

import { useState } from 'react';
import { stationShareText } from '@/lib/products';
import type { FuelProduct, TrafficLevel } from '@/types/database';
import { ShareIcon, CheckIcon } from './icons';

export function ShareButton({
  stationId,
  name,
  available,
  traffic,
}: {
  stationId: string;
  name: string;
  available: FuelProduct[];
  traffic: TrafficLevel | null;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/station/${stationId}`;
    const text = stationShareText(name, available, traffic);

    // Web Share API opens the OS sheet — Facebook/Telegram/WhatsApp all appear
    // there natively. Clipboard is the desktop fallback.
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch {
        return; // user cancelled — not an error
      }
    }

    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <button type="button" onClick={share} className="btn-ghost w-full">
      {copied ? <CheckIcon className="h-4 w-4 text-brand" /> : <ShareIcon className="h-4 w-4" />}
      {copied ? 'تم نسخ الرابط' : 'مشاركة حالة المحطة'}
    </button>
  );
}
