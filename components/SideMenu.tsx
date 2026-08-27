'use client';

import { useEffect, useState, type ComponentType } from 'react';
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
import { useNativeApp } from '@/lib/useNativeApp';
import { shareApp } from '@/lib/shareApp';
import {
  BellRingIcon,
  DownloadIcon,
  FuelIcon,
  InfoIcon,
  LockIcon,
  MapIcon,
  MessageIcon,
  PlusIcon,
  ShareIcon,
  ShieldIcon,
  StoreIcon,
  UserIcon,
  VolumeIcon,
  XIcon,
} from './icons';

// Named, not numbered: «النغمة ٣» tells nobody what they are about to hear.
const TONE_NAMES: Record<Tone, string> = { '1': 'حادّة', '2': 'واضحة', '3': 'هادئة' };

type Icon = ComponentType<{ className?: string }>;

/** The drawer, grouped by whose question each row answers.
 *
 *  Rows are titled by what the person wants, not by what the machine does:
 *  the whole platform is a fuel alert, so a row called "alert me when fuel
 *  arrives" names the product, not a destination. What the person actually
 *  goes there to change is their cities and their fuel.
 *
 *  Icons come from the app's own set. The emoji that were here read as a
 *  different product — and broke the rule written at the top of icons.tsx. */
export function SideMenu({ onAvailableOnly }: { onAvailableOnly?: () => void }) {
  const [open, setOpen] = useState(false);
  const [tone, setToneState] = useState<Tone>('2');
  const [muted, setMutedState] = useState(false);
  // The picker stays folded away: opening a menu should never make a phone
  // make a noise, and the tone is chosen once and then forgotten about.
  const [picking, setPicking] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  // `ready` matters: reading the session is two network round trips, and
  // without it a returning owner watched "register your station" sit there
  // for a second before it was replaced by their own panel.
  const { signedIn, role, ready } = useSession();
  const native = useNativeApp();

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

  // Escape closes it, the way every other dialog on a phone browser behaves
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function chooseTone(t: Tone) {
    setTone(t);
    setToneState(t);
    previewTone(t); // only ever on a deliberate tap, never on open
    setPicking(false);
  }

  async function share() {
    const r = await shareApp();
    if (r === 'shared') return setOpen(false);
    setShareNote(
      r === 'copied'
        ? 'تم نسخ النص — الصقه في أي تطبيق تريد.'
        : 'تعذّرت المشاركة. انسخ الرابط muhta.online يدوياً.'
    );
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden className="h-6 w-6">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="القائمة">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="scrim-enter absolute inset-0 bg-black/40"
          />

          {/* Pinned to the physical right and slid in from it. Anchoring by
              flex order instead flips with dir="rtl" and lands on the left. */}
          <aside className="drawer-enter absolute inset-y-0 right-0 flex w-[86%] max-w-[20rem] flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] shadow-lift">
            <div className="flex items-start justify-between bg-gradient-to-b from-brand-700 to-brand px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
              <div>
                <p className="text-base font-extrabold">المحطة التقنية</p>
                <p className="mt-0.5 text-xs text-white/80">منصة وقود الأنبار</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="-me-1 flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex flex-col gap-0.5 p-3 text-sm">
              {/* This used to be «سجّل محطتك مجاناً» — the greenest, widest,
                  first thing in the app's only navigation, shown to every
                  visitor. The row that actually served them sat underneath it
                  in grey, titled «المدن ونوع الوقود»: a settings label, not a
                  need. So people opening the menu to set up notifications met
                  the owner's call to action first, and answered it. The station
                  owners are a few dozen; the people wanting alerts are all the
                  rest. The loudest control belongs to them. */}
              <a href="/alerts" className="btn-primary mb-1 w-full">
                <BellRingIcon className="h-4 w-4" />
                نبّهني عند توفّر الوقود
              </a>
              <p className="mb-2 px-1 text-center text-[11px] text-slate-400">
                اختر مدينتك ونوع وقودك — بلا حساب
              </p>

              <Label>اختياراتي</Label>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <VolumeIcon className="h-4 w-4 text-brand" />
                    نغمة التنبيه ·{' '}
                    <span className="font-normal text-slate-500">
                      النغمة {tone} · {TONE_NAMES[tone]}
                    </span>
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
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {TONES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => chooseTone(t)}
                          aria-pressed={tone === t}
                          className={`min-h-[44px] rounded-lg border text-xs font-bold transition-colors duration-200 ${
                            tone === t
                              ? 'border-brand bg-brand-100 text-brand'
                              : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          النغمة {t}
                          <span className="block text-[10px] font-normal opacity-70">
                            {TONE_NAMES[t]}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      اضغط لتسمعها. النغمة ٣ الأهدأ. إن لم تغيّرها تبقى النغمة ٢.
                    </p>
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

              <Label>المحطات</Label>

              {/* **للإدارة وحدها حتى يُعلَن.**
                  كان مفتاحاً في التخزين المحلّي يُشغّله من يعرفه — وأيُّ زائرٍ
                  يفتح أدوات المتصفّح يعرفه. والمالك أراده مخفيّاً عن الجميع،
                  فصار على الدور نفسِه الذي يحرس لوحة الإدارة.
                  و`ready` شرط: قراءةُ الدور جولتان على الشبكة، وبدونه يومض
                  البندُ للجميع ثمّ يختفي. */}
              {ready && role === 'admin' && (
                <Item
                  href="/road"
                  icon={MapIcon}
                  title="مساعد الطريق"
                  note="محطات طريقك بين المدن — وأين لا محطة"
                  accent
                />
              )}

              <Row
                icon={FuelIcon}
                title="المحطات المتاحة الآن"
                note="المفتوحة والمتوفر بها وقود"
                accent
                onClick={() => {
                  onAvailableOnly?.();
                  setOpen(false);
                }}
              />

              <Label>حسابي</Label>

              {/* Nothing renders until the session is known — offering "sign in"
                  to someone already signed in is the fastest way to make a
                  returning user feel lost. */}
              {ready &&
                (signedIn ? (
                  role === 'admin' ? (
                    <Item
                      href="/admin"
                      icon={ShieldIcon}
                      title="لوحة التحكم"
                      note="المحطات والطلبات والإحصائيات"
                      accent
                    />
                  ) : (
                    <Item
                      href="/owner"
                      icon={StoreIcon}
                      title="لوحة محطتي"
                      note="تحديث التوفر والمنشورات"
                      accent
                    />
                  )
                ) : (
                  <>
                    <Item
                      href="/login"
                      icon={UserIcon}
                      title="الدخول إلى حسابي"
                      note="لأصحاب المحطات وإدارة المنصة"
                      accent
                    />
                    {/* Still here, still free, still one tap — but under
                        «حسابي» where an owner looks, instead of at the top
                        where everyone trips over it. And phrased as a question
                        so the first word sorts the reader. */}
                    <Item
                      href="/register"
                      icon={PlusIcon}
                      title="صاحب محطة؟ سجّلها مجاناً"
                      note="لعرض توفّر الوقود لديك للناس"
                    />
                  </>
                ))}

              <Label>التطبيق</Label>

              <Row
                icon={ShareIcon}
                title="شارك التطبيق"
                note="على أي تطبيق تختاره"
                onClick={share}
              />
              {shareNote && (
                <p className="mx-3 rounded-lg bg-brand-50 px-3 py-2 text-[11px] font-semibold text-brand-700">
                  {shareNote}
                </p>
              )}

              {/* Offering the download to someone inside the app is noise —
                  they are holding it. On the website it is the whole point. */}
              {!native && (
                <Item
                  href="/download"
                  icon={DownloadIcon}
                  title="حمّل التطبيق"
                  note="آيفون وأندرويد — مجاناً"
                />
              )}

              <Item
                href="https://t.me/muhtaonlinebot"
                icon={MessageIcon}
                title="بوت تيليجرام"
                note="تنبيهات ومحطات قريبة"
                external
              />
              <Label>المنصّة</Label>

              <Item href="/about" icon={InfoIcon} title="من نحن" note="الفكرة والتواصل" />
              <Item href="/privacy" icon={LockIcon} title="الخصوصية" note="ما نجمعه ولماذا" />
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 px-3 pb-1 text-[11px] font-bold text-slate-400 first:mt-0">{children}</p>
  );
}

/** Green marks the rows that are about the person using the app; the rest of
 *  the drawer is housekeeping and stays grey. Colour that means everything
 *  means nothing. */
function Body({ icon: Icon, title, note, accent }: { icon: Icon; title: string; note?: string; accent?: boolean }) {
  return (
    <>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${accent ? 'text-brand' : 'text-slate-400'}`} />
      <span className="min-w-0">
        <span className="block font-bold text-slate-800">{title}</span>
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </span>
    </>
  );
}

const ROW = 'flex items-start gap-3 rounded-xl px-3 py-3 text-right active:bg-slate-50';

function Item({
  href,
  icon,
  title,
  note,
  accent,
  external,
}: {
  href: string;
  icon: Icon;
  title: string;
  note?: string;
  accent?: boolean;
  external?: boolean;
}) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={ROW}>
      <Body icon={icon} title={title} note={note} accent={accent} />
    </a>
  );
}

function Row({
  icon,
  title,
  note,
  accent,
  onClick,
}: {
  icon: Icon;
  title: string;
  note?: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`${ROW} w-full`}>
      <Body icon={icon} title={title} note={note} accent={accent} />
    </button>
  );
}
