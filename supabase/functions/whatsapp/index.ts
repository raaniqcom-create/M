// WhatsApp Cloud API webhook.
//
// Two jobs, and Meta requires the first before it will send you the second:
//   GET  — the subscription handshake. Meta calls once with a challenge and
//          will not save the webhook unless it is echoed back verbatim.
//   POST — incoming messages and delivery statuses.
//
// Deliberately minimal for now: anyone who writes is recorded as a user (which
// is what "using it counts as registering" means here) and gets the station
// list back. The wizard and favourites come once the number is live and the
// message shapes are confirmed against a real conversation, not a guess.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';
const VERIFY = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';

const PRODUCT_LABELS: Record<string, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسّن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

async function send(to: string, body: string) {
  if (!TOKEN || !PHONE_ID) return;
  await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  });
}

/** The station list, as one message. WhatsApp has no inline keyboards the way
 *  Telegram does, so the menu is text the user answers by number. */
async function stationsMessage(): Promise<string> {
  const { data: stations } = await db
    .from('stations')
    .select('id, name, city, address')
    .eq('status', 'approved')
    .eq('is_demo', false)
    .order('city');

  if (!stations?.length) return 'لا توجد محطات معتمدة حالياً.';

  const { data: products } = await db
    .from('station_products')
    .select('station_id, product, is_available')
    .eq('is_available', true);

  const byStation = new Map<string, string[]>();
  for (const p of products ?? []) {
    const list = byStation.get(p.station_id) ?? [];
    list.push(PRODUCT_LABELS[p.product] ?? p.product);
    byStation.set(p.station_id, list);
  }

  const lines = stations.map((s, i) => {
    const avail = byStation.get(s.id);
    const status = avail?.length ? `✅ ${avail.join(' · ')}` : '⛔ لا يوجد وقود الآن';
    return `${i + 1}. *${s.name}* — ${s.city}\n   ${s.address ?? ''}\n   ${status}`;
  });

  return [
    '⛽ *المحطة التقنية* — حالة المحطات الآن',
    '',
    ...lines,
    '',
    'الخريطة والتفاصيل: muhta.online',
  ].join('\n');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta's subscription handshake
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && VERIFY && token === VERIFY) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('ok');

  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    // Delivery/read receipts arrive on the same webhook and carry no message.
    if (!message) return new Response('ok');

    const from: string = message.from;
    const profileName: string | null = value?.contacts?.[0]?.profile?.name ?? null;

    // Writing to the bot is the registration. No form, no password.
    await db.from('whatsapp_users').upsert(
      { wa_id: from, name: profileName, last_seen: new Date().toISOString() },
      { onConflict: 'wa_id' }
    );

    const text: string = (message.text?.body ?? '').trim();

    if (/^(الغاء|إلغاء|stop|ايقاف|إيقاف)$/i.test(text)) {
      await send(from, 'تم. لن تصلك رسائل. أرسل «محطات» في أي وقت للعودة.');
      return new Response('ok');
    }

    await send(from, await stationsMessage());
    return new Response('ok');
  } catch {
    // Never surface an error to Meta: a non-200 makes it retry the delivery,
    // and a retry loop on a parsing bug looks like abuse from their side.
    return new Response('ok');
  }
});
