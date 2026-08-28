'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { metresToKnownFuel, SUSPICIOUS_M } from '@/lib/nearbyFuel';
import { CheckIcon, LogOutIcon, MapPinIcon, SpinnerIcon, WhatsappIcon, XIcon } from '@/components/icons';
import { whatsappLink, whatsappVerifyLocation, whatsappVerifyRole } from '@/lib/phone';
import { AdminStationForm } from '@/components/AdminStationForm';
import { BroadcastPanel } from '@/components/BroadcastPanel';
import { AdminThreads } from '@/components/AdminThreads';
import { DeletedStations } from '@/components/DeletedStations';
import { ReviewsPanel } from '@/components/ReviewsPanel';
import { AvailabilityBoard } from '@/components/AvailabilityBoard';
import { AdminStats } from '@/components/AdminStats';
import { AdminHealth } from '@/components/AdminHealth';
import { StationAnnouncePanel } from '@/components/StationAnnouncePanel';
import { UnregisteredAdmin } from '@/components/UnregisteredAdmin';
import { PendingAnnouncements } from '@/components/PendingAnnouncements';
import { findSimilar } from '@/lib/similar';
import { announceStation, rebuildSite } from '@/lib/rebuild';
import { KIND_LABELS, KIND_STYLES, KINDS } from '@/lib/stationMeta';
import type { Station, StationKind } from '@/types/database';

interface Ad {
  id: string;
  image_url: string;
  link_url: string;
  start_date: string;
  end_date: string;
  active: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  // Stations first. The list used to be buried inside the "add a station"
  // tab, so the one thing an admin opens this page to look at was two taps
  // and a scroll past a registration form.
  const [tab, setTab] = useState<
    | 'stations'
    | 'requests'
    | 'messages'
    | 'add'
    | 'announce'
    | 'system'
    | 'stats'
    | 'ads'
    | 'offers'
    | 'reviews'
  >('stations');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Station[]>([]);
  const [live, setLive] = useState<Station[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  /** ما ردّ به أصحابُ المحطات ولم تقرأه الإدارة — من منظور station_unread */
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const totalUnread = [...unread.values()].reduce((a, b) => a + b, 0);

  const load = useCallback(async () => {
    const [{ data: st }, { data: ap }, { data: ad }, { data: un }] = await Promise.all([
      supabase.from('stations').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('stations').select('*').in('status', ['approved', 'suspended']).order('city'),
      supabase.from('ads').select('*').order('created_at', { ascending: false }),
      // **بلا هذا لا تعرف الإدارةُ أن أحداً ردّ** إلا إن صادف أن وصل إشعار.
      // والقائمةُ بشاراتها هي صندوقُ البريد عند ثمانٍ وعشرين محطة — فصفحةٌ
      // منفصلة تُبنى حين تكفّ القائمةُ عن الاتّساع في شاشة.
      supabase.from('station_unread').select('station_id, unread'),
    ]);
    setPending(st ?? []);
    setLive(ap ?? []);
    setAds(ad ?? []);
    setUnread(new Map((un ?? []).map((r) => [r.station_id as string, r.unread as number])));
  }, []);

  useEffect(() => {
    (async () => {
      // getSession reads the stored session and refreshes it when needed;
      // getUser is a round trip to the auth server, and when that request was
      // dropped this guard read it as "not signed in" and threw the admin back
      // to the login form they had just completed.
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role !== 'admin') {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      // Tie this phone to the admin feed so complaints and new registrations
      // reach it. The token is written by NativePush, which runs before login
      // and therefore cannot know who is holding the device.
      const deviceToken = localStorage.getItem('device-token');
      if (deviceToken) {
        await supabase
          .from('device_tokens')
          .update({ is_admin: true })
          .eq('token', deviceToken);
      }
      setAdminId(user.id);
      load();
    })();
  }, [router, load]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    setPending((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('stations').update({ status }).eq('id', id);
    if (status === 'approved') {
      // Rebuild first and only announce if it was accepted. Announcing a
      // station whose page was never generated sends every subscriber to a 404.
      // الإبلاغ لا ينتظر البناء.
      //
      // كان مشروطاً بنجاحه خشيةَ أن يُرسَل الناس إلى صفحة محطة لم تُبنَ بعد.
      // لكن إشعار الاعتماد لا يذهب إلى الناس أصلاً: notify مع newStation يقصر
      // المستقبِلين على أجهزة المحطة نفسها، ووجهته /owner — وهي جزء من هيكل
      // التطبيق، موجودة دائماً مبنيةً كانت الصفحة أو لا.
      //
      // فربطُهما جعل مفتاح GitHub المعطّل يحجب اثنتي عشرة محطة عن معرفة أنها
      // اعتُمدت. البناء يفشل فيُقال لك، والمالك يُخبَر على أي حال.
      const [why, failed] = await Promise.all([rebuildSite(), announceStation(id)]);
      const parts = [
        why ? `تحديث الموقع فشل: ${why}` : null,
        failed ? String(failed) : null,
      ].filter(Boolean);
      if (parts.length) {
        setNotice(
          `المحطة اعتُمدت وصاحبها ${failed ? 'لم يُخبَر' : 'أُخبِر'}. ${parts.join(' · ')}`
        );
      }
    }
    load();
  }

  // A demo station is whatever is flagged is_demo — the same column the public
  // list, the station pages and the build all filter on. The old seed rows
  // predate that column and are still recognised by their fixed UUID prefix,
  // so cleanup covers both and can never catch a real owner's station.
  const DEMO_PREFIX = 'b0000000-0000-0000-0000-';
  const demoStations = live.filter((s) => s.is_demo || s.id.startsWith(DEMO_PREFIX));

  /** «معتمدة» تعني approved وحدها — في هذه اللوحة وفي الموقع سواء.
   *
   *  كان المتغيّر يُسمّى approved ويحمل approved + suspended، فورث كل عنوانٍ
   *  يقرأه الكذبة: صندوقان في هذه الصفحة نفسها مكتوبٌ عليهما «محطة معتمدة»،
   *  أحدهما يقول 19 والآخر 18 — لأن الثاني يقرأ من دالّة health التي تعدّ
   *  approved وحدها. والموقع يعرض 18، فبدا للمالك أن أرقام منصّته تتناقض.
   *
   *  والقائمة تبقى على الاثنتين — الموقوفة تُدار من هنا ولا تُدار من غيره —
   *  لكنها لا تُسمّى «المعتمدة». والعدد يحمل نطاقه في عنوانه. */
  const approvedOnly = live.filter((s) => s.status === 'approved');
  const suspended = live.filter((s) => s.status === 'suspended');

  async function removeStation(id: string, name: string) {
    // النصُّ كان يقول «لا يمكن التراجع» وكان صادقاً — فضاعت ثلاثُ محطات.
    // وصار يُنسَخ الصفُّ قبل محوه، فيُقال ما يقع: ما يعود وما لا يعود.
    if (
      !confirm(
        `حذف «${name}»؟

تُنسخ بياناتها ويمكن استرجاعها من «محطات محذوفة».
` +
          `لكن متابعيها والأجهزة المربوطة بها لا تعود.`
      )
    )
      return;
    setLive((prev) => prev.filter((s) => s.id !== id));
    setPending((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('stations').delete().eq('id', id);
    load();
  }

  async function removeDemoStations() {
    if (!confirm(`حذف ${demoStations.length} محطة تجريبية نهائياً؟`)) return;
    const ids = demoStations.map((s) => s.id);
    setLive((prev) => prev.filter((s) => !ids.includes(s.id)));
    await supabase.from('stations').delete().in('id', ids);
    load();
  }

  /** The applicant is the real owner of a station we already hold. Move that
   *  station onto their number and drop the duplicate request — the record,
   *  its products and its published link all survive. */
  async function takeover(existingId: string, request: Station) {
    if (!confirm(`نقل «${request.name}» القائمة إلى الرقم ${request.phone}؟`)) return;
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/station-phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ stationId: existingId, phone: request.phone }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(out.error ?? 'تعذّر النقل');
      return;
    }
    await supabase.from('stations').delete().eq('id', request.id);
    alert(out.password ? `تم. كلمة المرور: ${out.password}` : 'تم النقل.');
    await load();
  }

  async function setKind(id: string, kind: StationKind) {
    setLive((prev) => prev.map((s) => (s.id === id ? { ...s, kind } : s)));
    await supabase.from('stations').update({ kind }).eq('id', id);
  }

  async function addAd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const { error } = await supabase.from('ads').insert({
      image_url: String(fd.get('image_url')),
      link_url: String(fd.get('link_url')),
      start_date: String(fd.get('start_date')),
      end_date: String(fd.get('end_date')),
    });
    if (!error) {
      form.reset();
      load();
    }
  }

  async function toggleAd(ad: Ad) {
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: !a.active } : a)));
    await supabase.from('ads').update({ active: !ad.active }).eq('id', ad.id);
  }

  if (allowed === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-slate-400" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-base font-bold">هذه الصفحة للإدارة فقط</h1>
        <p className="mt-2 text-sm text-slate-500">لا تملك صلاحية الوصول لهذه اللوحة.</p>
        <a href="/" className="btn-ghost mt-5 px-6">
          العودة للرئيسية
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-brand">لوحة الإدارة</h1>
          {/* ?view=user stops the home page bouncing a signed-in admin
              straight back here, so the site can be inspected the way an
              ordinary visitor sees it without giving up the session. */}
          <a href="/?view=user" className="text-[11px] font-bold text-slate-400">
            عرض المنصة كمستخدم ↗
          </a>
        </div>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/login');
          }}
          aria-label="تسجيل الخروج"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
        >
          <LogOutIcon />
        </button>
      </header>

      {/* Approval half-succeeding is the one failure the admin must not miss:
          the station is live in the database but has no page on the site. */}
      {notice && (
        <div className="mt-4 rounded-xl border border-traffic-red bg-red-50 p-3">
          <p className="text-xs leading-relaxed text-traffic-red">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="mt-2 text-[11px] font-bold text-traffic-red underline"
          >
            إخفاء
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: 'محطة معتمدة', value: approvedOnly.length },
          { label: 'طلب معلّق', value: pending.length, warn: pending.length > 0 },
          {
            label: suspended.length ? 'موقوفة' : 'مدينة فيها محطة',
            value: suspended.length || new Set(approvedOnly.map((s) => s.city)).size,
            warn: suspended.length > 0,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-brand-50 py-2.5 text-center">
            <p className={`text-lg font-extrabold leading-none ${stat.warn ? 'text-traffic-red' : 'text-brand-700'}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-brand-50 p-1">
        {([
          ['stations', `المحطات (${live.length})`],
          ['requests', `الطلبات${pending.length ? ` (${pending.length})` : ''}`],
          // ثالثاً لا عاشراً: بابٌ في آخر الصفّ الرابع بابٌ لا يُرى، وهذه
          // بُنيت ونُشرت فلم تُعثَر — فموضعُها هو إصلاحُها.
          ['messages', `الرسائل${totalUnread ? ` (${totalUnread})` : ''}`],
          ['add', 'إضافة محطة'],
          ['announce', 'إشعارات المحطات'],
          ['system', 'النظام'],
          ['stats', 'الإحصائيات'],
          ['ads', 'الإعلانات'],
          ['offers', 'العروض'],
          ['reviews', 'التقييمات'],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`min-h-[44px] rounded-lg px-1 text-[12px] font-semibold transition-colors duration-200 ${
              tab === t ? 'bg-white text-brand shadow-soft' : 'text-brand-700'
            } ${t === 'requests' && pending.length ? 'text-traffic-red' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'add' && adminId && (
        <div className="mt-4">
          <AdminStationForm adminId={adminId} onDone={load} />
        </div>
      )}

      {tab === 'announce' && (
        <div className="space-y-4">
          <StationAnnouncePanel />
          {/* بين الإنشاء والإدارة: ما جُدول ولم يخرج بعد — وهو النافذة الوحيدة
              التي يمكن فيها التراجع. */}
          <PendingAnnouncements />
          {/* الإدارة تحت الإنشاء: من أرسل خبراً هو من يتلقّى مكالمة المحطة
              بشأنه، فالشاشتان واحدة. */}
          <UnregisteredAdmin />
        </div>
      )}

      {tab === 'system' && (
        <div className="mt-4">
          <AdminHealth />
        </div>
      )}

      {tab === 'stats' && (
        <div className="mt-4 space-y-4">
          {/* الجدول أولاً: هو ما يُفتح ليُنشر، والإحصائيات تُقرأ ولا تُصوَّر. */}
          <AvailabilityBoard />
          <AdminStats />
        </div>
      )}

      {tab === 'stations' && (
        <div className="mt-4 space-y-4">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم المحطة أو المدينة"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
          <section className="card p-5">
            {/* «المحطات» لا «المعتمدة»: القائمة تحمل الموقوفة أيضاً لتُدار
                من هنا، وعنوانٌ يقول «المعتمدة» فوق عددٍ يشملها هو التناقض
                نفسه الذي أُصلح أعلاه. */}
            <h2 className="text-sm font-bold">المحطات ({live.length})</h2>
            <p className="mt-1 text-xs text-slate-400">
              {suspended.length
                ? `${approvedOnly.length} معتمدة تظهر للناس · ${suspended.length} موقوفة لا تظهر`
                : 'اضغط على النوع لتبديله بين حكومية وأهلية'}
            </p>

            {demoStations.length > 0 && (
              <button
                type="button"
                onClick={removeDemoStations}
                className="btn mt-3 w-full border border-traffic-red bg-white text-traffic-red"
              >
                <XIcon className="h-4 w-4" />
                حذف المحطات التجريبية ({demoStations.length})
              </button>
            )}
            <ul className="mt-3 space-y-3">
              {live
                .filter(
                  (s) =>
                    !q.trim() ||
                    s.name.includes(q.trim()) ||
                    s.city.includes(q.trim()) ||
                    s.address.includes(q.trim())
                )
                .map((s) => (
                <li key={s.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  {/* the name is the way in: everything per-station lives on
                      its own page rather than swelling this list */}
                  <a href={`/admin/station/?id=${s.id}`} className="block">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-brand-700 underline">
                      {s.name}
                      {!!unread.get(s.id) && (
                        <span className="rounded-full bg-traffic-red px-1.5 py-px text-[10px] font-extrabold text-white no-underline">
                          {unread.get(s.id)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.city} — {s.address}
                    </p>
                  </a>
                  {/* The whole reason a contact name is collected: reaching
                      that person. Tapping it opens WhatsApp with the greeting
                      already written, so following up on a station is one tap
                      rather than copy, switch app, paste, retype. */}
                  {s.contact_name && (
                    <a
                      href={whatsappLink(s.phone, s.contact_name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 pt-1 text-xs font-semibold text-brand"
                    >
                      <WhatsappIcon className="h-4 w-4" />
                      {s.contact_name}
                      <span className="font-normal text-slate-400" dir="ltr">
                        {s.phone}
                      </span>
                    </a>
                  )}
                  {s.status === 'suspended' && (
                    <p className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-traffic-red">
                      ⛔ موقوفة — لا تظهر للمستخدمين
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={s.kind === k}
                        onClick={() => setKind(s.id, k)}
                        className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                          s.kind === k ? KIND_STYLES[k] : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {KIND_LABELS[k]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => removeStation(s.id, s.name)}
                      aria-label={`حذف ${s.name}`}
                      className="mr-auto flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-traffic-red"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                      حذف
                    </button>
                  </div>
                </li>
                ))}
              {live.length === 0 && (
                <li className="text-sm text-slate-400">لا توجد محطات معتمدة بعد</li>
              )}
            </ul>
          </section>
        </div>
      )}

      {tab === 'requests' && (
        <div className="mt-4 space-y-3">
          {pending.length === 0 && (
            <p className="card p-6 text-center text-sm text-slate-400">لا توجد طلبات معلّقة</p>
          )}
          {pending.map((s) => (
            <article key={s.id} className="card p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{s.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLES[s.kind]}`}>
                  {KIND_LABELS[s.kind]}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {s.city} — {s.address}
              </p>
              <a
                href={whatsappLink(s.phone, s.contact_name)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-brand"
              >
                <WhatsappIcon className="h-4 w-4" />
                {s.contact_name || 'راسل المسؤول'}
                <span className="font-normal text-slate-400" dir="ltr">
                  {s.phone}
                </span>
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand"
              >
                <MapPinIcon className="h-4 w-4" />
                عرض الموقع على الخريطة
              </a>
              {/* **رسالتان جاهزتان قبل القرار.**
                  الاعتمادُ ليس زرَّين فقط — بينهما سؤال. وأكثرُ ما يُوقف
                  الطلبَ سببان: مقدِّمُه ليس من إدارة المحطة بل يريد إشعاراً،
                  أو دبّوسُه على غير محطته. فتُكتب الرسالتان مرّةً هنا بدل أن
                  تُعاد كتابتُهما مع كل طلب — وضغطةٌ واحدة تفتح المحادثة
                  والنصُّ فيها. */}
              {s.phone && (
                <div className="mt-2 grid gap-2">
                  <a
                    href={whatsappVerifyRole(s.phone, s.contact_name, s.name, s.city)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-brand bg-white px-3 text-xs font-extrabold text-brand-700"
                  >
                    <WhatsappIcon className="h-4 w-4" />
                    اسأله: هل أنت من إدارة المحطة؟
                  </a>
                  {metresToKnownFuel(s.lat, s.lng) > SUSPICIOUS_M && (
                    <a
                      href={whatsappVerifyLocation(s.phone, s.contact_name, s.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400 bg-white px-3 text-xs font-extrabold text-amber-800"
                    >
                      <WhatsappIcon className="h-4 w-4" />
                      اسأله: هل الموقع على المحطة؟
                    </a>
                  )}
                </div>
              )}

              {/* **إشارةُ الموضع — إرشاديّةٌ كسابقتها.**
                  المشكلة المقيسة: أصحابُ محطاتٍ يسجّلون موضعهم هم. والمراجعُ
                  لا يكشفها من عنوانٍ نصّيٍّ معقول ودبّوسٍ لا يعرف حيَّه.
                  فيُقاس بُعدُ الدبّوس عن أقرب محطةِ وقودٍ تعرفها الخرائط
                  المفتوحة: وسيطُ المعتمدات 76 متراً، وعشرون من أربعٍ وعشرين
                  ضمن كيلومتر. فما جاوزه يُعرض للمراجع — ولا يُرفض تلقائياً:
                  أربعٌ صحيحةٌ جاوزته، ومنها محطتا القائم. */}
              {(() => {
                const d = metresToKnownFuel(s.lat, s.lng);
                if (d <= SUSPICIOUS_M) {
                  return (
                    <p className="mt-2 text-[11px] font-bold text-brand">
                      ✓ الموقع على بُعد {Math.round(d)} م من محطةِ وقودٍ معروفة في الخرائط.
                    </p>
                  );
                }
                return (
                  <div className="mt-2 rounded-xl border border-amber-400 bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-900">
                      ⚠ لا محطةَ وقودٍ معروفة قرب هذا الموقع
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                      أقربُ محطةٍ تعرفها الخرائط المفتوحة تبعد{' '}
                      <b>{d > 950 ? `${(d / 1000).toFixed(1)} كم` : `${Math.round(d)} م`}</b>.
                      قد يكون سجّل موقعه هو لا موقع محطته — تحقّق قبل الاعتماد.
                    </p>
                  </div>
                );
              })()}

              {/* Advisory only. Two stations in one city really can share a
                  word in their name, so the match is surfaced for a human who
                  has spoken to the applicant — never acted on automatically. */}
              {findSimilar(s, live).map((m) => (
                <div key={m.id} className="mt-2 rounded-xl bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-900">
                    يشبه محطة قائمة: {m.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    {m.city} — {m.address} · <span dir="ltr">{m.phone}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => takeover(m.id, s)}
                    className="btn-ghost mt-2 w-full text-xs"
                  >
                    نقل «{m.name}» إلى هذا الشخص وحذف الطلب
                  </button>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                    تبقى المحطة ومنتجاتها ورابطها المنشور كما هي، ويتغيّر مالكها ورقمها فقط.
                  </p>
                </div>
              ))}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => decide(s.id, 'approved')}
                  className="btn bg-brand text-white"
                >
                  <CheckIcon className="h-4 w-4" />
                  اعتماد كمحطة جديدة
                </button>
                <button
                  type="button"
                  onClick={() => decide(s.id, 'rejected')}
                  className="btn border border-traffic-red bg-white text-traffic-red"
                >
                  <XIcon className="h-4 w-4" />
                  رفض
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'offers' && <BroadcastPanel />}
      {tab === 'stations' && <DeletedStations />}

      {tab === 'messages' && <AdminThreads />}

      {tab === 'reviews' && <ReviewsPanel />}

      {tab === 'ads' && (
        <div className="mt-4 space-y-4">
          <form onSubmit={addAd} className="card space-y-3 p-5">
            <h2 className="text-sm font-bold">إضافة إعلان</h2>
            <div>
              <label htmlFor="image_url" className="label">
                رابط صورة الإعلان
              </label>
              <input
                id="image_url"
                name="image_url"
                type="url"
                required
                className="field"
                dir="ltr"
                placeholder="https://..."
              />
            </div>
            <div>
              <label htmlFor="link_url" className="label">
                رابط الوجهة
              </label>
              <input
                id="link_url"
                name="link_url"
                type="url"
                required
                className="field"
                dir="ltr"
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start_date" className="label">
                  من تاريخ
                </label>
                <input id="start_date" name="start_date" type="date" required className="field" />
              </div>
              <div>
                <label htmlFor="end_date" className="label">
                  إلى تاريخ
                </label>
                <input id="end_date" name="end_date" type="date" required className="field" />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              إضافة
            </button>
          </form>

          <div className="space-y-3">
            {ads.map((ad) => (
              <article key={ad.id} className="card overflow-hidden">
                {/* admin-supplied URL, no optimization pipeline — plain img is right here */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.image_url} alt="" className="h-24 w-full object-cover" />
                <div className="flex items-center justify-between p-3">
                  <span className="text-xs text-slate-500" dir="ltr">
                    {ad.start_date} → {ad.end_date}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleAd(ad)}
                    aria-pressed={ad.active}
                    className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold ${
                      ad.active ? 'bg-brand-100 text-brand' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {ad.active ? 'مفعّل' : 'موقوف'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
