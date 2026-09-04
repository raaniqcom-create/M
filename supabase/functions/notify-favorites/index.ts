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


/** المتنُ الذي يخرج إلى شاشة القفل — من متن الصفّ كما هو في القاعدة.
 *
 *  **والمناطقُ توجيهٌ لا نصّ.** كان هنا `summarise` يطبع قائمةَ المدن في
 *  المتن حين تتعدّد، ويخمّن عددَ المحطات بعدّ ورودِ لفظة «محطة» فيه. فوصل
 *  الناسَ فجرَ الرابع من أيلول: «16 محطات في الفلوجة والرمادي والخالدية…»
 *  عن **محطةٍ واحدة**. والستّةَ عشرَ لم تكن محطات: ثمانيةُ أسطرِ مدنٍ ×
 *  وردتَي «محطة» في السطر — واحدة من القالب، وواحدة داخل الاسم الذي كتبه
 *  المدير. ضاع الخبرُ وبقي التوجيه.
 *
 *  والصفُّ لا يحمل إلا محطةً واحدة (`station_name` عمودٌ مفرد)، فأسطرُ
 *  المدن كلُّها جملةٌ واحدة مكرّرة. فتُنزع بادئةُ المدينة وتُزال المكرّرات:
 *  سطرٌ فريدٌ واحد يصل الجميعَ سواء — وهي حالُ كلِّ إعلانٍ متعدّد المدن في
 *  تاريخ المنصّة.
 *
 *  والشكلان معاً: القديمُ «• مدينة: …» والجديدُ الجملةَ وحدها — وقد ينتظر
 *  في الجدول صفٌّ كُتب بالقديم ولم يخرج بعد.
 *
 *  ونظيرتُها `announceBody` في lib/announceTemplates.ts تقرؤها المعاينةُ في
 *  اللوحة، فيتطابق ما يراه المديرُ وما يصل الناس. نسختان لأن الحافّة لا
 *  تستورد من lib، و scripts/test-announce-body.mjs يُثبت أنهما لا تفترقان. */
function oneLine(body: string): string {
  const lines = body
    .split(/\r?\n/)
    .map((l) => {
      // البادئةُ لا تُنزع إلا بعد نقطةٍ صريحة.
      //
      // الشكلُ القديم كتبها دائماً: «• الرمادي: …». ونزعُ «ما قبل النقطتين»
      // بلا هذا الشرط يبتلع الساعةَ من «الإنترنت ينقطع 6:00 صباحاً» فيبقى
      // «00 صباحاً» — وتنبيهُ المنصّة نصٌّ حرٌّ يكتبه المدير كما يشاء.
      const bulleted = /^[•\-]/.test(l.trim());
      const t = l.replace(/^[•\-\s]+/, '');
      return (bulleted ? t.replace(/^[^:\n—]{1,20}:\s*/, '') : t).trim();
    })
    .filter(Boolean);
  const unique = [...new Set(lines)];
  if (!unique.length) return body.trim().slice(0, 178);
  return unique.join(' · ').slice(0, 178);
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
    .select('id, title, body, cities, product, linked_station_id');

  // A discarded error here is the worst possible failure: `due` comes back
  // null, the loop runs zero times, and the function reports success. The
  // announcement never sends and nothing anywhere says so.
  if (claimError) console.error('announce claim failed:', claimError.message);

  for (const a of due ?? []) {
    const cities = (a.cities ?? []) as string[];

    // A city-less row is a PLATFORM notice — an internet cut during exams, a
    // service message — and it goes to every device.
    //
    // `continue` used to skip it. But the claim above had already stamped
    // sent_at, so the row was marked sent, vanished from the pending list, and
    // reached nobody. That is worse than never sending: nothing anywhere said
    // it had not gone out, and the one screen that could have caught it is the
    // one the claim removed it from.
    const everyone = cities.length === 0;

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
    // خبرُ المنصّة (بلا مدن) يُرسل بأسطره كما كتبها المدير؛ وخبرُ المحطة
    // تُشتقّ منه الجملةُ الواحدة أياً كان عددُ المدن التي وُجّه إليها.
    const body = everyone ? (a.body as string) : oneLine(a.body as string);

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
          // ولا لاحقةَ «— المدينة» في العنوان: مدينةُ المحطة صارت في المتن،
          // وكانت اللاحقةُ تضع مدينةَ **المستلم** فتقول عن محطةٍ في الفلوجة
          // إنها في الرمادي لمن يسكنها.
          title: String(a.title).slice(0, 64),
          body,
          cities,
          products: a.product ? [a.product] : [],
          // والوجهةُ تفي بما يقوله النصّ: صفحةُ المحطة إن كانت مسجّلة،
          // وإلّا الصفحةُ الرئيسة — وفيها اللوحةُ الحمراء مصفّاةً بمدن
          // القارئ، أي الأسماءُ والمواقع. و/news نصٌّ خام بلا موقع.
          url: a.linked_station_id ? `/station/${a.linked_station_id}` : '/',
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
