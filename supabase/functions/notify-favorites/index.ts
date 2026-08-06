// Tells Telegram users when fuel shows up at a station they starred.
// Scheduled by pg_cron every 2 minutes.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
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

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 });
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
