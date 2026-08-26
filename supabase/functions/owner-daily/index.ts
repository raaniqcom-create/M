// The station's own working day, spoken back to it.
//
// Three messages, each at the moment it means something:
//
//   at opening, never published   — a welcome and the one thing to do
//   at opening, published before  — a good-morning nudge, because yesterday's
//                                   board is today's lie
//   at closing, published today   — thanks, and an offer to schedule tomorrow
//
// The third is the point of the other two. A station that publishes and hears
// nothing back learns that publishing is unpaid work; one that is thanked at
// the end of the day it did the work learns the opposite. Nobody is scolded:
// the station that forgot gets the same wording as the station that is new.
//
// Times are the station's own opens_at/closes_at in Baghdad, so a station that
// opens at 5am is greeted at 5am and one that opens at 8 is greeted at 8.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    },
  });
const BAGHDAD = 'Asia/Baghdad';
// the cron runs every 15 minutes; a message fires if its moment falls inside
// the window that just passed, so nothing is missed and nothing repeats
const WINDOW_MIN = 20;

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function pemToPkcs8(pem: string): Uint8Array {
  const raw = atob(
    pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').split(/\s/).join('')
  );
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const b64url = (v: Uint8Array | string) =>
  btoa(typeof v === 'string' ? v : String.fromCharCode(...v))
    .split('+').join('-').split('/').join('_').replace(/=+$/, '');

async function apnsJwt(): Promise<string | null> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !pem) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const unsigned =
      b64url(JSON.stringify({ alg: 'ES256', kid: keyId })) + '.' +
      b64url(JSON.stringify({ iss: teamId, iat: now }));
    const key = await crypto.subtle.importKey(
      'pkcs8', pemToPkcs8(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
    );
    return `${unsigned}.${b64url(sig)}`;
  } catch {
    return null;
  }
}

async function fcmToken(sa: { client_email: string; private_key: string; token_uri: string }) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri, iat: now, exp: now + 3600,
    }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  );
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body).slice(0, 120));
  return body.access_token as string;
}

/** Baghdad wall clock, as minutes past midnight, plus today's date there. */
function baghdadNow(): { minutes: number; day: string } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '00';
  return {
    minutes: Number(g('hour')) * 60 + Number(g('minute')),
    day: `${g('year')}-${g('month')}-${g('day')}`,
  };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Did `moment` fall inside the window that just closed? */
function justPassed(moment: number, now: number): boolean {
  const diff = (now - moment + 1440) % 1440;
  return diff >= 0 && diff < WINDOW_MIN;
}

interface Msg { title: string; body: string }

/** The audience is named as a count of people, and the count is real — read
 *  from `alerts`. An invented one was asked for; the true figure is larger than
 *  the example that was suggested, and a number caught being invented would
 *  cost the platform every other number it prints. */
const MESSAGES: Record<string, (name: string, n: number, city: string) => Msg> = {
  opening_first: (name, n, city) => ({
    title: `${name} — ابدأ يومك`,
    body: n
      ? `${n} مشتركاً في ${city} ينتظرون خبر الوقود اليوم. حدّد ما يتوفّر عندك بضغطة، فيصلهم في اللحظة نفسها.`
      : 'محطتك مسجّلة وظاهرة للناس. يبقى أن تحدّد ما يتوفر عندك اليوم بضغطة، فيصل خبرها إلى أهل مدينتك في اللحظة نفسها.',
  }),
  opening_again: (name, n, city) => ({
    title: `${name} — صباح الخير`,
    body: n
      // «ما نُشر أمس لا يصف اليوم» كانت تصف قاعدةً بدل أن تطلب فعلاً، فلم تُفهم.
      // الوجه الصريح منها: تحديث أمس لا يُعاد نشره، فيبقى الناس بلا خبر.
      ? `${n} مشتركاً في ${city} ينتظرون. حدّث توفّر اليوم — تحديثٌ واحد يكفي، وتحديث أمس لا يُعاد نشره.`
      : 'حدّث توفّر اليوم ليصل الخبر إلى من ينتظره. تحديثٌ واحد في الصباح يكفي، وتحديث أمس لا يُعاد نشره.',
  }),
  // The closing message used to only say thank you. A thank-you is the moment
  // the owner is least busy and most willing — so it now asks for tomorrow,
  // which is the one update that is ready before the customers arrive.
  closing_thanks: (name, n, city) => ({
    title: `${name} — شكراً لالتزامك`,
    body: n
      ? `نشرتَ اليوم فوصل خبرك إلى ${n} مشتركاً في ${city}. حدّد الآن ما تتوقّع توفّره غداً، فتفتح وأنت جاهز لاستقبال زبائنك ويصلهم الخبر قبل أن يخرجوا.`
      : 'نشرتَ اليوم فوصل خبرك إلى أهل مدينتك. حدّد الآن ما تتوقّع توفّره غداً، فتفتح وأنت جاهز لاستقبال زبائنك.',
  }),
  // Asked, not told. The crowd's reading has just expired, and the owner is
  // the one person standing in the forecourt who can say what replaced it —
  // so the platform asks him rather than showing nothing.
  traffic_confirm: (name, _n, _city) => ({
    title: `${name} — كيف الازدحام الآن؟`,
    body: 'انتهى آخر تقييم من الناس، فلم يعد أحد يعرف حال الطابور عندك. أكّد الحالة بضغطة ليراها من يقصدك.',
  }),
  // وقودٌ معروضٌ بخبرٍ فات عمره.
  //
  // أخطر الحالات على المنصّة كلها: المحطة تُعلن بانزيناً أعلنته قبل ثلاثة أيام،
  // فيقصدها الناس ويجدون الطابور بلا وقود — ويُنسب الكذب إلى المنصّة لا إلى
  // المحطة. والتطبيق يعرضه الآن بالرمادي ومعه عمره، لكن الأصل أن يُصحَّح لا أن
  // يُشرَح، وصاحب المحطة وحده يملك تصحيحه.
  stale_stock: (name, _n, _city) => ({
    title: `${name} — وقودك معروض بخبر قديم`,
    body: 'ما زال معروضاً على صفحتك وقودٌ أعلنتَه قبل أكثر من يوم. حدّثه بضغطة — إن نفد فأخفِه، وإن بقي فأكّده ليعود ظاهراً للناس.',
  }),
  // سؤالُ الساعتين.
  //
  // مواطنٌ من الفلوجة قطع ثمانية وعشرين كيلومتراً إلى الخالدية على خبرٍ رآه
  // معروضاً، فوجد المحطة لا تلتزم. والخبر لم يكن كاذباً حين كُتب — بل شاخ.
  //
  // وساعتان هي المدّة التي ينفد فيها الوقود فعلاً في الأنبار، لا أربعٌ
  // وعشرون. فيُسأل صاحبها بعدها: أ ما زال؟ وضغطةٌ واحدة تكفي جواباً.
  //
  // ولا يُخفى منتجه إن لم يردّ — قرار المالك: صمتُ رجلٍ مشغول ليس نفاداً،
  // والبطاقة تحمل عمر الخبر فيقرأه القارئ بنفسه.
  stock_check: (name, _n, _city) => ({
    title: `${name} — هل ما زال متوفراً؟`,
    body: 'مضت ساعتان على إعلانك. ضغطةٌ واحدة تُطمئن من يقصدك: إن بقي فأكّده، وإن نفد فأخفِه — فلا يقطع أحدٌ الطريق عبثاً.',
  }),
  // محطةٌ لا تظهر لأن لا شيء لديها تُعلنه.
  //
  // القائمة صارت تُخفي من لا وقود معلَناً لديه — والمحطة لا تعرف أنها اختفت
  // ولا لماذا. فتُخبَر، ويُقال لها الطريق: ضغطةٌ واحدة تُعيدها.
  no_stock: (name, _n, _city) => ({
    title: `${name} — لا تظهر في القائمة الآن`,
    body: 'لا منتج متوفراً ولا متوقَّعاً على صفحتك، فلا تظهر محطتك لمن يبحث عن وقود. أعلِن ما وصلك، أو ضع موعد الوصول المتوقّع — وتعود فوراً.',
  }),
};

/** What this station will be told today, generated by the sender itself.
 *
 *  The admin asked to see, on a station's page, the message that station is
 *  going to get. The tempting shortcut is to copy the three texts into the web
 *  app — and then they are two things that must be kept identical by hand, so
 *  within a month the panel shows a message nobody receives. The preview is
 *  produced here instead, by the same MESSAGES table and the same rules that
 *  do the sending, so it cannot describe a message that would not be sent. */
async function preview(req: Request, stationId: string): Promise<Response> {
  // Cron carries a secret; a person carries a token. Same function, two doors.
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'unauthorized' }, 401);
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const { day } = baghdadNow();
  const { data: st } = await db
    .from('stations')
    .select('id, name, city, is_24h, opens_at, closes_at')
    .eq('id', stationId)
    .maybeSingle();
  if (!st) return json({ error: 'no station' }, 404);

  const [{ data: products }, { data: pinged }, { data: watchRows }, { data: devices }] =
    await Promise.all([
      db.from('station_products').select('updated_at, is_available, expected_at').eq('station_id', st.id),
      db.from('owner_pings').select('kind, sent_at').eq('station_id', st.id).eq('day', day),
      db.rpc('watchers_by_city', { p_cities: [st.city] }),
      db.from('device_tokens').select('token').eq('station_id', st.id),
    ]);

  const last = (products ?? [])
    .map((p) => p.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) as string | undefined;

  // أحدث ختمٍ على منتج معروضٍ متوفراً — نفس مقياس المُرسِل، لا نسخةً منه.
  const lastAvail = (products ?? [])
    .filter((p) => (p as { is_available?: boolean }).is_available)
    .map((p) => p.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) as string | undefined;
  const staleStock = !!lastAvail && Date.now() - new Date(lastAvail).getTime() >= 24 * 3600_000;
  const publishedToday = !!last && last.slice(0, 10) === day;
  const everPublished = !!last;

  const n = ((watchRows ?? []) as { city: string; watchers: number }[])[0]?.watchers ?? 0;

  const openingKind = everPublished ? 'opening_again' : 'opening_first';
  const sentKinds = new Set((pinged ?? []).map((p) => p.kind));
  const at = (k: string) => (pinged ?? []).find((p) => p.kind === k)?.sent_at ?? null;

  return json({
    station: st.name,
    city: st.city,
    watchers: n,
    publishedToday,
    // No device linked means none of this arrives, however good the text is —
    // and that is the single most useful thing this panel can tell an admin.
    devices: (devices ?? []).length,
    messages: [
      {
        when: st.is_24h ? '07:00' : st.opens_at.slice(0, 5),
        kind: openingKind,
        ...MESSAGES[openingKind](st.name, n, st.city),
        sent: sentKinds.has(openingKind),
        sentAt: at(openingKind),
        skipped: publishedToday,
        note: publishedToday ? 'لن تُرسل: المحطة حدّثت اليوم بالفعل' : null,
      },
      {
        when: st.is_24h ? '21:00' : st.closes_at.slice(0, 5),
        kind: 'closing_thanks',
        ...MESSAGES.closing_thanks(st.name, n, st.city),
        sent: sentKinds.has('closing_thanks'),
        sentAt: at('closing_thanks'),
        skipped: !publishedToday,
        note: !publishedToday ? 'لن تُرسل: لم تنشر المحطة اليوم' : null,
      },
      {
        // بلا موعد ثابت: تُطلق في أول دورة تجد المحطة مفتوحة وخبرها فائتاً.
        when: 'عند الحاجة',
        kind: 'stale_stock',
        ...MESSAGES.stale_stock(st.name, n, st.city),
        sent: sentKinds.has('stale_stock'),
        sentAt: at('stale_stock'),
        skipped: !staleStock,
        note: staleStock
          ? 'ستُرسل: المحطة تعرض وقوداً أعلنته قبل أكثر من يوم'
          : 'لن تُرسل: لا وقود معروضاً بخبر قديم',
      },
    ],
  });
}

Deno.serve(async (req) => {
  // This function was cron-only, so it never answered a preflight — and the
  // browser asks before it sends. Without this the panel reported a network
  // failure and blamed the admin's connection for a missing CORS header.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  // The admin's preview, before the cron gate: a person asking what a station
  // will hear today has no cron secret and should not need one.
  const url = new URL(req.url);
  const wanted = url.searchParams.get('preview');
  if (wanted) return preview(req, wanted);

  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const { minutes, day } = baghdadNow();

  const { data: stations } = await db
    .from('stations')
    .select('id, name, city, owner_id, is_24h, opens_at, closes_at, temp_closed, manual_traffic_level, manual_traffic_set_at')
    .eq('status', 'approved')
    .eq('is_demo', false);

  if (!stations?.length) return new Response('no stations');

  const ids = stations.map((s) => s.id);
  const [{ data: products }, { data: pinged }, { data: votes }, { data: watchRows }] = await Promise.all([
    // سبعة صفوف لكل محطة: بلا حدّ صريح تُقرأ المحطات بعد القطع «لم تنشر قطّ»،
    // فتُرحَّب بها يومياً ولا يصلها شكر الإغلاق أبداً.
    db.from('station_products').select('station_id, updated_at, is_available, expected_at').in('station_id', ids).range(0, 99_999),
    // وعلامات اليوم: ضياعها يعني رسالةً مكرّرة لكل مالك.
    db.from('owner_pings').select('station_id, kind').eq('day', day).in('station_id', ids).range(0, 99_999),
    // Only the tail matters: a vote older than 45 minutes lapsed long ago and
    // asking about it now is late, not helpful.
    db
      .from('traffic_votes')
      .select('station_id, created_at')
      .in('station_id', ids)
      .gte('created_at', new Date(Date.now() - 45 * 60_000).toISOString()),
    // Counted in the database, not here. Fetching the rows and counting them
    // in JS looked identical and was wrong: PostgREST caps a response at 1000
    // rows and the table holds 4437, so the count ran over the first 22% of
    // the data — 175 instead of 619 for Ramadi. Silently: no error, no
    // warning, just a smaller number that looked plausible, inside a message
    // whose entire argument is that its numbers are real.
    db.rpc('watchers_by_city', { p_cities: [...new Set((stations ?? []).map((s) => s.city))] }),
  ]);

  const already = new Set((pinged ?? []).map((p) => `${p.station_id}:${p.kind}`));

  const counts = new Map<string, number>(
    ((watchRows ?? []) as { city: string; watchers: number }[]).map((r) => [r.city, r.watchers])
  );
  const watchersFor = (city: string) => counts.get(city) ?? 0;

  // Newest vote per station, and whether it lapsed inside the last 15 minutes —
  // the window between "the reading expired" and "asking is stale news".
  const newestVote = new Map<string, number>();
  for (const v of votes ?? []) {
    const t = new Date(v.created_at).getTime();
    if (t > (newestVote.get(v.station_id) ?? 0)) newestVote.set(v.station_id, t);
  }
  const lapsedJustNow = new Set<string>();
  for (const [id, t] of newestVote) {
    const age = Date.now() - t;
    if (age >= 30 * 60_000 && age < 45 * 60_000) lapsedJustNow.add(id);
  }

  // The owner's own reading counts as an answer: do not ask someone to confirm
  // what they told us ten minutes ago.
  const activeManual = (s: { manual_traffic_level?: string | null; manual_traffic_set_at?: string | null }) =>
    !!s.manual_traffic_level &&
    !!s.manual_traffic_set_at &&
    Date.now() - new Date(s.manual_traffic_set_at).getTime() < 30 * 60_000;
  const lastUpdate = new Map<string, string>();
  // وأحدث ختمٍ على منتجٍ معروضٍ متوفراً — لا على اللوح كله.
  //
  // الفرق يقرّر الحالة: محطةٌ تلمس منتجاً غير متوفر اليوم يبدو لوحها حديثاً،
  // بينما البانزين الذي يقصده الناس معروضٌ بخبرٍ عمره ثلاثة أيام.
  const lastAvailable = new Map<string, string>();
  for (const p of products ?? []) {
    const cur = lastUpdate.get(p.station_id);
    if (!cur || p.updated_at > cur) lastUpdate.set(p.station_id, p.updated_at);
    if (p.is_available) {
      const a = lastAvailable.get(p.station_id);
      if (!a || p.updated_at > a) lastAvailable.set(p.station_id, p.updated_at);
    }
  }

  // نافذة الحداثة نفسها التي يستعملها التطبيق (FRESH_HOURS = 24 في lib/hours).
  // رقمان مختلفان هنا وهناك يعنيان أن الإشعار يصل قبل أن يشحب العرض أو بعده،
  // وكلاهما يُربك صاحب المحطة.
  const staleStock = (id: string) => {
    const a = lastAvailable.get(id);
    return !!a && Date.now() - new Date(a).getTime() >= 24 * 3600_000;
  };

  // وسؤالُ الساعتين بعتبةٍ مستقلّة — ومحدودةٍ من أعلى.
  //
  // بلا الحدّ الأعلى يبتلع stale_stock: محطةٌ خبرها عمره ثلاثون ساعة تطابق
  // «أكثر من ساعتين» أولاً في السلسلة، فلا تصل رسالةُ اليوم الكامل أبداً.
  // فالنافذتان متجاورتان لا متداخلتان: ساعتان إلى أربعٍ وعشرين، ثم ما بعدها.
  const ASK_MS = 2 * 3600_000;
  const stockCheck = (id: string) => {
    const a = lastAvailable.get(id);
    if (!a) return false;
    const age = Date.now() - new Date(a).getTime();
    return age >= ASK_MS && age < 24 * 3600_000;
  };

  // ولا منتج معلَناً أصلاً — لا قديماً ولا حديثاً.
  //
  // هذه هي التي اختفت من القائمة. وlastAvailable لا تحمل لها صفّاً، فغيابُها
  // منها هو المقياس نفسه الذي تُخفى به: مقياسٌ واحد لا اثنان يتباعدان.
  // والمتوقَّع يُبقيها ظاهرة: من يقول «بانزين متوقّع الصباح» يُعلن شيئاً،
  // وإخفاؤه يعاقب السلوك الذي تريده المنصّة. القاعدة نفسها في
  // lib/products.ts → hasSomethingToShow — والرسالة تتبع ما يُخفي.
  const expecting = new Set<string>();
  for (const p of products ?? []) {
    if ((p as { expected_at?: string | null }).expected_at) expecting.add(p.station_id);
  }
  const noStock = (id: string) => !lastAvailable.has(id) && !expecting.has(id);

  // Which of the three, if any, is due for each station right now
  const due: { station: (typeof stations)[number]; kind: string }[] = [];
  for (const s of stations) {
    // a 24-hour station has no opening or closing moment; its day is judged at
    // 07:00 and 21:00, the hours a forecourt actually changes hands
    const open = s.is_24h ? 420 : toMinutes(s.opens_at);
    const close = s.is_24h ? 1260 : toMinutes(s.closes_at);

    const last = lastUpdate.get(s.id) ?? null;
    const publishedToday = !!last && last.slice(0, 10) === day;
    const everPublished = !!last;

    let kind: string | null = null;
    if (justPassed(open, minutes) && !publishedToday) {
      kind = everPublished ? 'opening_again' : 'opening_first';
    } else if (justPassed(close, minutes) && publishedToday) {
      kind = 'closing_thanks';
    } else if (
      // The crowd said something, and that something has just gone stale: the
      // newest vote is past the 30-minute window the views read, but still
      // inside 45 — so it lapsed within the last quarter hour and the station
      // is open right now. Nobody knows the queue at this moment, and the owner
      // is standing in it.
      minutes >= open &&
      minutes < close &&
      !s.temp_closed &&
      !activeManual(s) &&
      lapsedJustNow.has(s.id)
    ) {
      kind = 'traffic_confirm';
    } else if (minutes >= open && minutes < close && !s.temp_closed && staleStock(s.id)) {
      kind = 'stale_stock';
    } else if (minutes >= open && minutes < close && !s.temp_closed && stockCheck(s.id)) {
      kind = 'stock_check';
    } else if (minutes >= open && minutes < close && !s.temp_closed && noStock(s.id)) {
      kind = 'no_stock';
    }
    if (kind && !already.has(`${s.id}:${kind}`)) due.push({ station: s, kind });
  }

  if (!due.length) return new Response(`nothing due at ${minutes} (${day})`);

  const { data: devices } = await db
    .from('device_tokens')
    .select('token, platform, station_id, keys')
    .in('station_id', due.map((d) => d.station.id));

  const byStation = new Map<
    string,
    { token: string; platform: string; keys?: { p256dh?: string; auth?: string } | null }[]
  >();
  for (const d of devices ?? []) {
    if (!d.station_id) continue;
    byStation.set(d.station_id, [...(byStation.get(d.station_id) ?? []), d]);
  }

  webpush.setVapidDetails(
    'mailto:admin@muhta.online',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
  );

  const jwt = await apnsJwt();
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  const sa = saRaw ? JSON.parse(saRaw) : null;
  let access: string | null = null;
  if (sa) {
    try { access = await fcmToken(sa); } catch { access = null; }
  }

  // ── تيليجرام: القناة التي كان المالك لا يصله منها شيء ──────────────
  //
  // owner-daily لم تكن تعرف تيليجرام إطلاقاً — الرسائل الخمس كلّها تخرج عبر
  // device_tokens وحدها. فمالكٌ بلا تطبيقٍ مثبَّت ولا إذن متصفّح لا يصله شيء،
  // وأربع محطات بلا جهازٍ مربوط أصلاً.
  //
  // و telegram_links.telegram_id هو chat_id نفسه في المحادثة الخاصة — فالمسافة
  // كانت دالّةً واحدة، ولم تُقطع.
  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const { data: tgLinks } = await db.from('telegram_links').select('telegram_id, station_id');
  const tgByStation = new Map<string, number[]>();
  for (const l of tgLinks ?? []) {
    if (!l.station_id) continue;
    tgByStation.set(l.station_id, [...(tgByStation.get(l.station_id) ?? []), l.telegram_id]);
  }

  async function tellTelegram(stationId: string, kind: string, title: string, body: string) {
    if (!tgToken) return 0;
    const chats = tgByStation.get(stationId) ?? [];
    if (!chats.length) return 0;

    // زرّان للسؤال وحده: «هل ما زال متوفراً؟» يُجاب بضغطة بلا فتح شيء —
    // وهذا هو الفرق بين سؤالٍ يُجاب وسؤالٍ يُقرأ ثم يُنسى.
    const keyboard =
      kind === 'stock_check' || kind === 'stale_stock'
        ? {
            inline_keyboard: [
              [
                { text: '✅ ما زال متوفراً', callback_data: `c:${stationId}` },
                { text: '📋 لوحة محطتي', callback_data: `r:${stationId}` },
              ],
            ],
          }
        : { inline_keyboard: [[{ text: '📋 لوحة محطتي', callback_data: `r:${stationId}` }]] };

    let ok = 0;
    for (const chat of chats) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chat,
            text: `<b>${title}</b>

${body}`,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          }),
        });
        if (r.ok) ok++;
        else console.error('tg owner', await r.text());
      } catch (e) {
        console.error('tg owner fetch', e);
      }
    }
    return ok;
  }

  const marks: { station_id: string; kind: string; day: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (const { station, kind } of due) {
    const targets = byStation.get(station.id) ?? [];
    const { title, body } = MESSAGES[kind](station.name, watchersFor(station.city), station.city);

    // تيليجرام أولاً، وقبل حارس «لا أجهزة».
    //
    // كان الحارس يقفز فوق المحطة كلّها حين لا جهاز مربوط — وأربع محطات كذلك.
    // فصاحبها لا يصله شيء وإن كان على البوت. والقناتان مستقلّتان: من له
    // الاثنتان يصله من الاثنتين، ومن له واحدة يصله منها.
    sent += await tellTelegram(station.id, kind, title, body);

    // Nothing to send to. Recorded anyway: an owner who installs the app at
    // noon should not receive this morning's greeting when they arrive.
    if (!targets.length) { marks.push({ station_id: station.id, kind, day }); continue; }

    for (const t of targets) {
      try {
        if (t.platform === 'ios') {
          if (!jwt) throw new Error('apns');
          const r = await fetch(`https://api.push.apple.com/3/device/${t.token}`, {
            method: 'POST',
            headers: {
              authorization: `bearer ${jwt}`,
              'apns-topic': topic,
              'apns-push-type': 'alert',
              'apns-priority': '10',
            },
            body: JSON.stringify({
              aps: { alert: { title, body }, sound: 'alert.caf' },
              url: '/owner',
            }),
          });
          if (r.status === 410) await db.from('device_tokens').delete().eq('token', t.token);
          else if (r.ok) sent++;
          else failed++;
        } else if (t.platform === 'web') {
          // A browser subscription, not a device token. This is the branch that
          // did not exist — which is why an owner who runs their station from
          // the browser was counted as «لا جهاز مربوط» and heard nothing.
          try {
            await webpush.sendNotification(
              { endpoint: t.token, keys: { p256dh: t.keys?.p256dh, auth: t.keys?.auth } },
              JSON.stringify({ title, body, url: '/owner' })
            );
            sent++;
          } catch (e) {
            // The browser dropped it — the owner cleared site data or revoked
            // permission. Keeping it would fail every morning, silently.
            const code = (e as { statusCode?: number })?.statusCode ?? 0;
            if ([404, 410].includes(code)) {
              await db.from('device_tokens').delete().eq('token', t.token);
            } else failed++;
          }
        } else {
          if (!access || !sa) throw new Error('fcm');
          const r = await fetch(
            `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: {
                  token: t.token,
                  notification: { title, body },
                  data: { url: '/owner' },
                  android: { priority: 'HIGH', notification: { channel_id: 'muhta_alerts', sound: 'alert' } },
                },
              }),
            }
          );
          if (r.status === 404) await db.from('device_tokens').delete().eq('token', t.token);
          else if (r.ok) sent++;
          else failed++;
        }
      } catch {
        failed++;
      }
    }
    marks.push({ station_id: station.id, kind, day });
  }

  if (marks.length) await db.from('owner_pings').upsert(marks);

  return new Response(
    JSON.stringify({ at: minutes, day, due: due.length, sent, failed }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
