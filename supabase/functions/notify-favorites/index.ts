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
  const { data: due } = await db
    .from('announcements')
    .update({ sent_at: new Date().toISOString() })
    .lte('send_at', new Date().toISOString())
    .is('sent_at', null)
    .eq('active', true)
    .select('id, title, body, cities, product');

  for (const a of due ?? []) {
    for (const city of (a.cities ?? []) as string[]) {
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/announce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
          body: JSON.stringify({
            title: `${a.title} — ${city}`.slice(0, 64),
            body: cityLine(a.body as string, city) ?? (a.body as string),
            cities: [city],
            products: a.product ? [a.product] : [],
            url: '/news',
          }),
        });
      } catch (e) {
        console.error('announce', city, String(e).slice(0, 90));
      }
    }
  }

  // Anything switched on in the last while is a candidate; product_alerts_sent
  // is what actually stops a repeat, so a slow run can never double-announce.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();

  const { data: fresh } = await db
    .from('station_products')
    .select('station_id, product, updated_at, stations!inner(name, city, slug, status)')
    .eq('is_available', true)
    .eq('stations.status', 'approved')
    .gt('updated_at', since);

  if (!fresh?.length) return new Response('nothing new');

  const { data: alreadySent } = await db
    .from('product_alerts_sent')
    .select('station_id, product, sent_at');

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

    const s = row.stations as unknown as { name: string; city: string; slug: string };
    const text =
      `⛽ <b>${PRODUCT_LABELS[row.product] ?? row.product} متوفر الآن</b>\n\n` +
      `<b>${s.name}</b>\n${s.city}\n\n` +
      `${SITE}/${s.slug}`;

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
