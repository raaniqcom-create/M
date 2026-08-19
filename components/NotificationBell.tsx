'use client';

import { useEffect, useState } from 'react';
import { readNotifications, type SentNotification } from '@/lib/alerts';
import { BellIcon, SpinnerIcon, XIcon } from './icons';

/** What we sent this phone, so it is findable after the fact.
 *
 *  A user reported getting nine notifications while his phone lay on a table,
 *  coming back, and having nowhere in the app to look. Two things caused that:
 *  the app kept no record at all, and the service worker tags a station's
 *  notifications so repeats replace each other in the tray — nine sends about
 *  one station leave one visible line.
 *
 *  Titled «الإشعارات المُرسَلة إليك», not «ما وصلك». The row is written when the
 *  fan-out starts, before any transport confirms delivery, so a dead token or a
 *  failed send is recorded here as sent. Claiming delivery would be a lie the
 *  data cannot support. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SentNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    setRows(null);
    readNotifications().then((r) => {
      if (cancelled) return;
      if (r === null) setFailed(true);
      else setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Escape closes it, like every other dialog in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const when = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `قبل ${mins} دقيقة`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `قبل ${hours} ساعة`;
    return new Intl.DateTimeFormat('ar', {
      timeZone: 'Asia/Baghdad',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="الإشعارات المُرسَلة إليك"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
      >
        <BellIcon className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="الإشعارات">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
            className="scrim-enter absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lift">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <p className="text-sm font-extrabold">الإشعارات المُرسَلة إليك</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3">
              {rows === null && !failed && (
                <p className="flex justify-center py-8">
                  <SpinnerIcon className="h-6 w-6 text-brand" />
                </p>
              )}

              {failed && (
                <p className="rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-700">
                  تعذّرت قراءة السجلّ. تأكد من الاتصال وأعد المحاولة.
                </p>
              )}

              {rows?.length === 0 && (
                <div className="py-6 text-center">
                  <BellIcon className="mx-auto h-8 w-8 text-brand-200" />
                  <p className="mt-3 text-sm font-bold text-slate-600">لا إشعارات بعد</p>
                  {/* Said plainly, because the screen would otherwise read as
                      broken to the very person who asked for it: the record
                      starts today and cannot show what was sent before it. */}
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    يبدأ السجلّ من اليوم — ما أُرسل قبل ذلك غير محفوظ. وإن لم تكن
                    فعّلت التنبيهات بعد، فعّلها ليصلك خبر الوقود.
                  </p>
                  <a href="/alerts" className="btn-ghost mt-4 w-full">
                    إعدادات التنبيهات
                  </a>
                </div>
              )}

              {rows && rows.length > 0 && (
                <ul className="space-y-2">
                  {rows.map((n, i) => (
                    <li
                      key={`${n.sent_at}-${i}`}
                      className="rounded-xl border border-slate-100 bg-white p-3"
                    >
                      <p className="text-sm font-bold text-slate-800">{n.title ?? 'إشعار'}</p>
                      {n.body && (
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{n.body}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">{when(n.sent_at)}</span>
                        {n.station_id && (
                          <a
                            href={`/station/${n.station_id}/`}
                            className="ms-auto text-[11px] font-bold text-brand"
                          >
                            افتح المحطة
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
