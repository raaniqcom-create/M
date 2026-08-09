'use client';

import { useEffect, useState } from 'react';
import {
  getTone,
  isMuted,
  previewTone,
  setMuted,
  setTone,
  TONES,
  type Tone,
} from '@/lib/alertSound';
import { useSession } from '@/lib/useSession';

/** The drawer holds everything that isn't the driver's main job: signing in as
 *  an owner, sound settings, help. Keeping them out of the header leaves the
 *  first screen for stations, which is what the app is for. */
export function SideMenu({ onAvailableOnly }: { onAvailableOnly?: () => void }) {
  const [open, setOpen] = useState(false);
  const [tone, setToneState] = useState<Tone>('1');
  const [muted, setMutedState] = useState(false);
  // The picker stays folded away: opening a menu should never make a phone
  // make a noise, and the tone is chosen once and then forgotten about.
  const [picking, setPicking] = useState(false);
  const { signedIn, role } = useSession();

  useEffect(() => {
    setToneState(getTone());
    setMutedState(isMuted());
  }, []);

  // a drawer that leaves the page scrollable behind it feels broken on a phone
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  function chooseTone(t: Tone) {
    setTone(t);
    setToneState(t);
    previewTone(t); // only ever on a deliberate tap, never on open
    setPicking(false);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="القائمة"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/40"
          />

          <aside className="flex h-full w-[82%] max-w-xs flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] shadow-xl">
            <div className="bg-gradient-to-b from-brand-700 to-brand px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
              <p className="text-base font-extrabold">المحطة التقنية</p>
              <p className="mt-0.5 text-xs text-white/80">منصة وقود الأنبار</p>
            </div>

            <nav className="flex flex-col p-3 text-sm">
              {/* Offering "sign in" to someone already signed in is the most
                  common way an app makes a returning user feel lost. */}
              {signedIn ? (
                role === 'admin' ? (
                  <Item href="/admin" icon="🛡" title="لوحة الإدارة" note="المحطات والطلبات والشكاوى" />
                ) : (
                  <Item href="/owner" icon="🏪" title="لوحة محطتي" note="تحديث التوفر والمنشورات" />
                )
              ) : (
                <Item
                  href="/login"
                  icon="🏪"
                  title="الدخول إلى محطتي"
                  note="لأصحاب المحطات — تحديث التوفر"
                />
              )}

              <button
                type="button"
                onClick={() => {
                  onAvailableOnly?.();
                  setOpen(false);
                }}
                className="flex items-start gap-3 rounded-xl px-3 py-3 text-right active:bg-slate-50"
              >
                <span className="text-lg leading-none">⛽</span>
                <span className="min-w-0">
                  <span className="block font-bold text-slate-800">المحطات المتاحة الآن</span>
                  <span className="block text-xs text-slate-500">التي يتوفر فيها وقود</span>
                </span>
              </button>

              {!signedIn && (
                <Item href="/register" icon="➕" title="سجّل محطتك" note="مجاناً، بضع خطوات" />
              )}

              <p className="mt-4 px-3 pb-1 text-[11px] font-bold text-slate-400">إعدادات التطبيق</p>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">
                    نغمة التنبيه · <span className="text-slate-500">النغمة {tone === '1' ? '١' : '٢'}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setPicking((v) => !v)}
                    className="text-[11px] font-bold text-brand-700"
                  >
                    {picking ? 'إخفاء' : 'تغيير'}
                  </button>
                </div>

                {picking && (
                  <>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {TONES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => chooseTone(t)}
                          aria-pressed={tone === t}
                          className={`rounded-lg border px-2 py-2 text-xs font-bold transition-colors duration-200 ${
                            tone === t
                              ? 'border-brand bg-brand-100 text-brand'
                              : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          النغمة {t === '1' ? '١' : '٢'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">تُشغَّل عند الضغط لتسمعها قبل الاعتماد.</p>
                  </>
                )}

                <button
                  type="button"
                  onClick={toggleMute}
                  aria-pressed={!muted}
                  className="mt-3 flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <span>{muted ? 'الصوت مكتوم' : 'الصوت يعمل'}</span>
                  <span
                    className={`h-5 w-9 rounded-full p-0.5 transition-colors duration-200 ${
                      muted ? 'bg-slate-300' : 'bg-brand'
                    }`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        muted ? '' : '-translate-x-4'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <p className="mt-4 px-3 pb-1 text-[11px] font-bold text-slate-400">أخرى</p>
              <Item href="https://t.me/muhtaonlinebot" icon="💬" title="بوت تيليجرام" note="تنبيهات وإدارة محطتك" external />
              <Item href="/privacy" icon="🛡" title="الخصوصية" note="ما نجمعه ولماذا" />
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function Item({
  href,
  icon,
  title,
  note,
  external,
}: {
  href: string;
  icon: string;
  title: string;
  note: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-start gap-3 rounded-xl px-3 py-3 active:bg-slate-50"
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block font-bold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{note}</span>
      </span>
    </a>
  );
}
