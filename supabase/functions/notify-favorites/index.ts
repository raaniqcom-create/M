// Tells Telegram users when fuel shows up at a station they starred.
// Scheduled by pg_cron every 2 minutes.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;
const SITE = 'https://muhta.online';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const PRODUCT_LABELS: Record<string, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};


/** Pulls one city's line out of the notice body.
 *
 *  The body lists every city, one per line, because the news page shows the
 *  whole notice. A notification must not: someone in Falluja does not need to
 *  read about Karma to learn their own petrol arrived. */
const SPLIT = String.fromCharCode(10);
const BULLET = String.fromCharCode(0x2022);

/** One sentence for an announcement spanning several cities.
 *
 *  It must fit 178 characters, and the full list rarely does — today's notice
 *  is six stations across three cities, about two hundred. So it names the
 *  scale and the places, and sends the reader to the page that holds the rest.
 *  A truncated list is worse than a short one: it stops mid-station-name. */
function summarise(body: string, cities: string[]): string {
  // كل محطة تبدأ بكلمة «محطة» في المتن، فالعدّ عليها لا على أسطر المدن —
  // ثلاث مدن قد تحمل ستّ محطات، والرقم هو ما يجعل الخبر يستحق الفتح.
  const stations = (body.match(/محطة/g) ?? []).length;
  // ' و' لا ' و ': الواو تتصل بما بعدها، وفصلها يقرأ كخطأ إملائي
  const places = cities.join(' و');
  const count = stations > 1 ? `${stations} محطات` : 'محطة';
  return `${count} في ${places} — اضغط لعرض الأسماء والمواقع`.slice(0, 178);
}

function cityLine(body: string, city: string): string | null {
  const line = body.split(/\r?\n/).find((l) => l.includes(city));
  if (!line) return null;
  return line.replace(/^[•\-\s]+/, '').replace(`${city}:`, '').trim().slice(0, 178);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  // ---- official notices waiting for their hour ----
  //
  // This runs every two minutes and already holds the cron secret, so a
  // scheduled announcement rides along rather than needing a second cron job.
  //
  // The row is CLAIMED first — an update guarded by `sent_at is null`, so if a
  // run overlaps the next one only one of them wins the row. A notification
  // cannot be recalled, so a missed send is recoverable and a doubled one is not.
  const { data: due, error: claimError } = await db
    .from('announcements')
    .update({ sent_at: new Date().toISOString() })
    .lte('send_at', new Date().toISOString())
    .is('sent_at', null)
    .eq('active', true)
    .select('id, title, body, cities, product');

  // A discarded error here is the worst possible failure: `due` comes back
  // null, the loop runs zero times, and the function reports success. The
  // announcement never sends and nothing anywhere says so.
  if (claimError) console.error('announce claim failed:', claimError.message);

  for (const a of due ?? []) {
    const cities = (a.cities ?? []) as string[];
    if (!cities.length) continue;

    // ONE call, never one per city.
    //
    // The 45-minute cooldown is per person, so whoever is reached by the first
    // city is silent for the rest. Sending city by city therefore does not just
    // deduplicate — it decides, by loop order, which city's text a person gets.
    // Measured on the live list: Ramadi first took 69 people, leaving Falluja 1
    // and Karma 0, because almost everyone watching those two also watches
    // Ramadi. They would have been told about Ramadi's stations and never about
    // their own.
    //
    // So one message goes to everyone across all the cities — announce already
    // deduplicates addresses across them — and the per-city detail lives one tap
    // away on /news, which is the screen built for exactly that.
    const single = cities.length === 1;
    const body = single
      ? (cityLine(a.body as string, cities[0]) ?? (a.body as string))
      : summarise(a.body as string, cities);

    // The row was claimed before this call, so a failure here would leave it
    // marked sent forever: visible on /news, delivered to nobody, with no
    // record. fetch only rejects on a network fault — every HTTP error status
    // resolves normally — so the status has to be read explicitly, and the
    // claim released so the next tick two minutes from now tries again.
    let ok = false;
    let why = '';
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify({
          title: single ? `${a.title} — ${cities[0]}`.slice(0, 64) : String(a.title).slice(0, 64),
          body,
          cities,
          products: a.product ? [a.product] : [],
          url: '/news',
        }),
      });
      ok = res.ok;
      if (!ok) why = `${res.status} ${(await res.text()).slice(0, 120)}`;
    } catch (e) {
      why = String(e).slice(0, 120);
    }

    if (!ok) {
      console.error('announce failed, releasing claim:', a.id, why);
      await db.from('announcements').update({ sent_at: null }).eq('id', a.id);
    }
  }

  // Anything switched on in the last while is a candidate; product_alerts_sent
  // is what actually stops a repeat, so a slow run can never double-announce.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();

  // من المنظور لا من الجدول: يحمل الحارسَين معاً — المنتج متوفر، ومحطته
  // معتمدة **ومفتوحة الآن**.
  //
  // وهذا المسار هو الأخطر في المنصّة، لأنه لا يمرّ بـ notify إطلاقاً: المالك
  // يبدّل منتجه من بوت تيليجرام أو واتساب، فلا يُنادى أحد — ثم يلتقط هذا
  // الكنسُ updated_at الجديد ويُرسل «متوفر الآن» إلى كل مفضّليه. فمالكٌ
  // يبدّل الثانية فجراً ومحطته تفتح السادسة كان يوقظ الناس بوقودٍ لا يُباع.
  const { data: fresh } = await db
    .from('station_products_live')
    .select('station_id, product, updated_at, station_name, station_city, station_slug')
    .gt('updated_at', since);

  if (!fresh?.length) return new Response('nothing new');

  // بلا حدّ صريح يقع القصّ عند ١٤٣ محطة، فتضيع علامات «أُرسل» للمحطات بعد
  // القطع — وتُعاد إشعاراتها كل دقيقتين إلى الأبد، بلا خطأ في أي سجلّ.
  const { data: alreadySent, error: sentErr } = await db
    .from('product_alerts_sent')
    .select('station_id, product, sent_at')
    .range(0, 99_999);

  // ويُرمى الفشل ولا يُبتلع: قائمةٌ فارغة هنا تعني «لم يُرسل شيء قطّ»، فتُعاد
  // كل الإشعارات على كل المشتركين دفعةً واحدة.
  if (sentErr) {
    console.error('product_alerts_sent', sentErr.message);
    return new Response(`product_alerts_sent: ${sentErr.message}`, { status: 500 });
  }

  const sentKey = new Map(
    (alreadySent ?? []).map((r) => [`${r.station_id}:${r.product}`, r.sent_at])
  );

  let messages = 0;
  const marks: { station_id: string; product: string; sent_at: string }[] = [];

  for (const row of fresh) {
    const key = `${row.station_id}:${row.product}`;
    const last = sentKey.get(key);
    // already announced this exact arrival
    if (last && last >= row.updated_at) continue;

    const { data: favs } = await db
      .from('telegram_favorites')
      .select('chat_id')
      .eq('station_id', row.station_id);

    marks.push({ station_id: row.station_id, product: row.product, sent_at: new Date().toISOString() });
    if (!favs?.length) continue;

    // أعمدة مسطّحة من المنظور: PostgREST لا يعرف مفاتيحه الأجنبية، فلا
    // يقبل stations!inner(...) فوقه — والتسطيح في تعريف المنظور يُغني عنها.
    const text =
      `⛽ <b>${PRODUCT_LABELS[row.product] ?? row.product} متوفر الآن</b>\n\n` +
      `<b>${row.station_name}</b>\n${row.station_city}\n\n` +
      `${SITE}/${row.station_slug}`;

    for (const f of favs) {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: f.chat_id,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (res.ok) messages++;
      else console.error('sendMessage', await res.text());
    }
  }

  if (marks.length) await db.from('product_alerts_sent').upsert(marks);

  return new Response(`sent ${messages} to favourites, marked ${marks.length}`);
});
