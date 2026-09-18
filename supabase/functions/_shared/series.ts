// سلسلةُ الصباح — إدراجُ إشعارات المدن في `announcements` بموعدٍ متدرّج.
//
// المنطقُ في `lib/morningSeries.ts` (يُختبر بـnode)؛ هنا القراءةُ من القاعدة
// والإدراجُ والتقريرُ للإدارة. الإرسالُ نفسُه ليس هنا: المِكنسةُ `notify-favorites`
// تحجز كلَّ صفٍّ حين يحين `send_at` وتنادي `announce` — كأيّ خبرٍ مؤجَّل.
//
// ── ولماذا لا يُنادى announce مباشرةً بفاصل دقيقتين ────────────────────
//
// الدالّةُ لا تعيش تسعين دقيقة، والكرونُ الموجودُ يفعل ذلك أصلاً. والصفُّ في
// `announcements` يُرى في «الإشعارات المعلّقة» ويُلغى بضغطة — «تجهيزٌ» يراه
// صاحبُ المنصّة قبل أن يخرج.
//
// ── والمفتاحُ الثابت يمنع التكرار ───────────────────────────────────────
//
// كرونُ الرصد يمرّ كلَّ عشر دقائق في الساعة السابعة، والنشرُ قد يُستبدل.
// فـ`client_key` = uuid v5 من «series:اليوم:المدينة:الوقود»، والفهرسُ الفريد
// يردّ الصفَّ المكرّر (23505) فيُعدّ «مُدرجاً سلفاً». ولأنّ الفهرسَ جزئيّ
// (where client_key is not null) لا يصلح `upsert(onConflict)` — فالإدراجُ
// صفّاً صفّاً.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  BODY_MAX,
  SERIES_GAP_MINUTES,
  SERIES_START,
  TITLE_MAX,
  baghdadClock,
  buildMorningSeries,
  seriesKey,
  type SeriesItem,
  type SeriesRow,
  type SeriesStation,
} from '../../../lib/morningSeries.ts';
import { PRODUCT_LABELS } from '../../../lib/products.ts';

export interface SeriesOutcome {
  day: string;
  items: SeriesItem[];
  queued: number;
  skipped: number;
  cities: number;
  /** كم صفّاً جاء من توفّرٍ معلَنٍ الآن خارج جدول اليوم. */
  live: number;
  /** عددُ صفوف جدول اليوم — صفرٌ يعني صباحاً بلا جدولٍ منشور. */
  schedRows: number;
  startAt: string | null;
  endAt: string | null;
  why: string;
  /** تقريرٌ بـHTML لمحادثة الإدارة. */
  text: string;
}

const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** يبني السلسلةَ ليوم `forDate` ويُدرجها من `startAt` بفاصل دقيقتين.
 *  `dry` يعدّ ويقرّر ولا يُدرج؛ `refresh` يمسح ما لم يُرسل بعدُ من سلسلة اليوم
 *  قبل الإدراج (بعد استبدال الجدول) — والمرسَلُ والملغى يحتفظان بمفاتيحهما. */
export async function queueMorningSeries(
  db: SupabaseClient,
  forDate: string,
  startAt: Date,
  opts: { dry?: boolean; refresh?: boolean } = {}
): Promise<SeriesOutcome> {
  const out: SeriesOutcome = { day: forDate, items: [], queued: 0, skipped: 0, cities: 0, live: 0, schedRows: 0, startAt: null, endAt: null, why: '', text: '' };
  if (forDate < SERIES_START) {
    out.why = `قبل موعد البدء (${SERIES_START})`;
    return finish(out, opts.dry);
  }

  const { data: rows, error: rowsErr } = await db
    .from('fuel_schedule')
    .select('product, station_name, city, linked_station_id')
    .eq('for_date', forDate)
    // وسلسلةُ الصباح تسمّي للناس محطاتٍ يقصدونها — فلا تُسمّى حمولةُ مولّداتٍ
    // ولا حمولةٌ عابرةٌ على خطّ تصدير.
    .is('purpose', null);
  if (rowsErr) {
    out.why = `fuel_schedule: ${rowsErr.message}`;
    return finish(out, opts.dry);
  }
  // **ولا خروجَ على جدولٍ فارغ.** كان صباحٌ بلا جدولٍ منشورٍ صباحاً صامتاً
  // تماماً؛ وصاحبُ المنصّة أمر أن يستمرّ الإشعار «كلّ يوم»، فما تعلنه المحطاتُ
  // على لوحاتها يكفي وحدَه. و`rowsErr` يبقى خروجاً: قراءةٌ فاشلةٌ ليست جدولاً
  // فارغاً — ولو خُلطا لَنُشرت سلسلةُ لوحاتٍ في يومٍ له جدولٌ لم يُقرأ.
  const sched = (rows ?? []) as SeriesRow[];

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  // المحطاتُ كلُّها لا المربوطةَ بالجدول: تسعٌ وأربعون محطةً بمنتجاتها صفحةٌ
  // واحدة. ولا ترشيحَ على status/is_demo هنا — `qualifies` تردّهما، والنتيجةُ
  // مجموعةٌ شاملةٌ لما كان يُقرأ، فمسارُ الجدول يبقى كما هو حرفاً بحرف.
  const [st, up] = await Promise.all([
    db
      .from('stations')
      .select('id, name, city, address, status, is_demo, is_24h, opens_at, closes_at, temp_closed, station_products(product, is_available, updated_at, runs_out_at)'),
    db.from('station_updates').select('station_id, product, actor, change').gte('created_at', since),
  ]);
  if (st.error) {
    out.why = `stations: ${st.error.message}`;
    return finish(out, opts.dry);
  }
  const wc = await db.rpc('watchers_by_city', {
    p_cities: [
      ...new Set([
        ...sched.map((r) => r.city).filter(Boolean),
        ...((st.data ?? []) as { city: string }[]).map((s) => s.city),
      ]),
    ],
  });

  // تحديثاتُ صاحب المحطة خلال ٢٤ ساعة — بلا صفوف النظام (نفادٌ منتهٍ يكتبه الكرون بلا فاعل).
  const updates = new Map<string, number>();
  for (const u of (up.data ?? []) as { station_id: string; product: string | null; actor: string | null; change: Record<string, unknown> }[]) {
    const system = u.actor === null && u.product !== null && JSON.stringify(u.change) === '{"is_available":false}';
    if (system) continue;
    updates.set(u.station_id, (updates.get(u.station_id) ?? 0) + 1);
  }
  const stations: SeriesStation[] = ((st.data ?? []) as (Omit<SeriesStation, 'products' | 'updates24h'> & { station_products: SeriesStation['products'] })[]).map(
    ({ station_products, ...s }) => ({ ...s, products: station_products ?? [], updates24h: updates.get(s.id) ?? 0 })
  );
  const watchers: Record<string, number> = {};
  for (const w of (wc.data ?? []) as { city: string; watchers: number }[]) watchers[w.city] = Number(w.watchers) || 0;

  out.items = buildMorningSeries({ forDate, rows: sched, stations, watchers });
  out.cities = new Set(out.items.map((i) => i.city)).size;
  out.live = out.items.filter((i) => !i.inSchedule).length;
  out.schedRows = sched.length;
  if (!out.items.length) {
    out.why = sched.length
      ? 'لا مدينةَ معروفةً في الجدول'
      : `لا جدولَ ليوم ${forDate}، ولا محطةَ تُعلن توفّراً الآن`;
    return finish(out, opts.dry);
  }
  const keys = await Promise.all(out.items.map((i) => seriesKey(i.key)));

  if (opts.dry) {
    out.startAt = startAt.toISOString();
    out.endAt = new Date(startAt.getTime() + (out.items.length - 1) * SERIES_GAP_MINUTES * 60_000).toISOString();
    return finish(out, true);
  }

  const tag = `series:${forDate}`;
  if (opts.refresh) {
    await db.from('announcements').delete().eq('kind', 'schedule').eq('note', tag).eq('active', true).is('sent_at', null);
  }
  // صفوفُ اليوم كلُّها لا مفاتيحَ بعينها: المفتاحُ يمنع تكرارَ الخانة، والمدينةُ
  // تمنع تبدّلَ **شكلِها** بين المرورات الستّة. فمدينةٌ بلا مسجّلةٍ نشطةٍ في
  // السابعة تأخذ صفَّ «all»؛ ثمّ يضغط صاحبُ محطةٍ «أكّد التوفّر» في السابعة
  // وثمانٍ، فيراها المرورُ التالي مؤهّلةً فيُصدر لكلّ وقودٍ صفّاً — فتُكدَّس
  // صورتان على مدينةٍ واحدة. وقد صار هذا مرجَّحاً بعد التوسيع.
  //
  // و`refresh` استبدالٌ مقصودٌ من الإدارة: يُعاد بناءُ ما لم يُرسل، فلا تُقفل المدن.
  const { data: had } = await db.from('announcements').select('client_key, origin_city').eq('note', tag);
  const existing = new Set(((had ?? []) as { client_key: string }[]).map((r) => r.client_key));
  const done = opts.refresh
    ? new Set<string>()
    : new Set(((had ?? []) as { origin_city: string | null }[]).map((r) => r.origin_city));

  // ينتهي الصفُّ بنهاية يومه في بغداد (+03): خبرُ اليوم لا يُرسل غداً لو تعطّلت المِكنسة.
  const expires = `${forDate}T23:59:59+03:00`;
  let slot = 0;
  const errors: string[] = [];
  for (let i = 0; i < out.items.length; i++) {
    const it = out.items[i];
    if (existing.has(keys[i]) || done.has(it.city)) {
      out.skipped++;
      continue;
    }
    const send_at = new Date(startAt.getTime() + slot * SERIES_GAP_MINUTES * 60_000).toISOString();
    const { error } = await db.from('announcements').insert({
      title: it.title.slice(0, TITLE_MAX),
      body: it.body.slice(0, BODY_MAX),
      cities: [it.city],
      product: it.product,
      linked_station_id: it.stationId,
      url: it.url,
      kind: 'schedule',
      subject: it.stationName,
      origin_city: it.city,
      // بلا station_name: هو ما يُدخل الصفَّ اللوحةَ الحمراء (open_announcements).
      station_name: null,
      note: tag,
      active: true,
      as_popup: false,
      send_at,
      expires_at: expires,
      client_key: keys[i],
    });
    if (error) {
      if (error.code === '23505') out.skipped++;
      else errors.push(`${it.city}/${it.product ?? 'all'}: ${error.message}`);
      continue;
    }
    if (!out.startAt) out.startAt = send_at;
    out.endAt = send_at;
    out.queued++;
    slot++;
  }
  if (errors.length) out.why = errors.slice(0, 3).join(' · ');
  return finish(out, false);
}

function finish(out: SeriesOutcome, dry?: boolean): SeriesOutcome {
  out.text = report(out, !!dry);
  return out;
}

/** «🌅 سلسلة الصباح — جدول 2026-09-17 · 41 إشعاراً في 17 مدينة · كلّ دقيقتين من 07:00 إلى 08:20». */
function report(o: SeriesOutcome, dry: boolean): string {
  const lines: string[] = [];
  // ولا تُسمّى «جدولاً»: صارت تُبنى من الجدول ومن لوحات المحطات معاً، وقد تُبنى
  // من اللوحات وحدَها في صباحٍ بلا جدولٍ منشور.
  lines.push(`🌅 <b>سلسلة الصباح — ${o.day}</b>${dry ? ' · 🔎 بروفة، لم يُدرج شيء' : ''}`);
  // وبروفةٌ قبل السابعة تقرأ المحطاتِ مغلقةً بالدوام (07:00–20:00)، فلا يظهر
  // فيها «متوفّر الآن» — وهو صوابٌ لا عطب، يُقال كي لا يُصلَح ما ليس معطوباً.
  if (
    dry &&
    Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Baghdad', hour: '2-digit', hour12: false })) < 7
  ) {
    lines.push('⏰ بروفةٌ قبل السابعة: المحطاتُ غيرُ الـ٢٤ ساعةً مغلقةٌ الآن، فلا «متوفّر الآن» فيها.');
  }
  if (!o.items.length) {
    lines.push(escHtml(o.why || 'لا شيء'));
    return lines.join('\n');
  }
  const n = dry ? o.items.length : o.queued;
  const span = o.startAt && o.endAt ? ` · كلّ دقيقتين من ${baghdadClock(o.startAt)} إلى ${baghdadClock(o.endAt)} (بغداد)` : '';
  const src = o.live ? ` · منها ${o.live} من توفّرٍ معلَنٍ الآن خارج الجدول` : '';
  lines.push(`${n} إشعاراً في ${o.cities} مدينة${span}${src}`);
  if (!o.schedRows) lines.push('📋 لا جدولَ منشوراً اليوم — السلسلةُ من لوحات المحطات وحدَها.');
  if (o.skipped) lines.push(`(مُدرجٌ سلفاً أو مُلغى: ${o.skipped})`);
  if (o.why) lines.push(`⚠️ ${escHtml(o.why)}`);
  let city = '';
  let k = 0;
  for (const it of o.items) {
    if (it.city !== city) {
      city = it.city;
      lines.push(`\n<b>${escHtml(city)}</b> (${it.watchers})`);
    }
    k++;
    const fuel = it.products.map((p) => PRODUCT_LABELS[p]).join(' و');
    const mark = it.registered
      ? it.offeredNow
        ? it.inSchedule
          ? ' ✅ الآن'
          : ' ✅ الآن · خارج الجدول'
        : ''
      : ' (غير مسجّلة)';
    lines.push(`${k}. ${escHtml(fuel)} — ${escHtml(it.stationName)}${mark}`);
  }
  return lines.join('\n').slice(0, 3900);
}

/** رسالةٌ إلى أوّل مدير في TELEGRAM_ADMIN_IDS مباشرةً من واجهة تيليجرام —
 *  لا عبر `tellBot` الذي يمرّر النصَّ إلى البوت كأنّه كتبه المدير (فيُقرأ بحثاً). */
export async function tellAdmin(html: string): Promise<boolean> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const admin = (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  if (!token || !admin) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(admin), text: html.slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return r.ok;
}
