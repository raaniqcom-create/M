// WhatsApp Cloud API webhook — «المحطة التقنية».
//
// Two jobs, and Meta requires the first before it will send you the second:
//   GET  — the subscription handshake. Meta calls once with a challenge and
//          will not save the webhook unless it is echoed back verbatim.
//   POST — incoming messages: text, button taps, list picks, location, audio.
//
// Design constraints that shaped every screen here:
//   • Reply buttons cap at 3. Lists cap at 10 rows across all sections.
//   • There is no edit-message API, so each tap is a new message in the thread.
//     Keep replies short; a long menu re-sent on every tap is unreadable.
//   • Writing to the bot is the registration. No form, no password.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';
const VERIFY = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const API = 'https://graph.facebook.com/v25.0';

const PRODUCT_LABELS: Record<string, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسّن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

interface Station {
  id: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  slug: string | null;
}

// ── transport ──────────────────────────────────────────────────────────────

/** Returns null on success, or Meta's error text. Meta answers 4xx with a
 *  reason — a closed 24-hour window, an unregistered recipient, an expired
 *  token. Swallowing that turns every fault into the same silent nothing. */
async function post(payload: Record<string, unknown>): Promise<string | null> {
  if (!TOKEN || !PHONE_ID) return 'WHATSAPP_TOKEN or WHATSAPP_PHONE_ID missing';
  const res = await fetch(`${API}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (res.ok) return null;
  const text = await res.text();
  console.error('whatsapp send failed:', res.status, text);
  return `${res.status} ${text}`;
}

const sendText = (to: string, body: string) =>
  post({ to, type: 'text', text: { body, preview_url: false } });

/** Up to three. Meta rejects a fourth rather than truncating. */
const sendButtons = (
  to: string,
  body: string,
  buttons: { id: string; title: string }[]
) =>
  post({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });

/** Up to ten rows across all sections — the cap is on the total, not per
 *  section, which is the mistake that gets a payload rejected. */
const sendList = (
  to: string,
  body: string,
  button: string,
  rows: { id: string; title: string; description?: string }[]
) =>
  post({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: button.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: (r.description ?? '').slice(0, 72),
            })),
          },
        ],
      },
    },
  });

/** The one screen a person who cannot read can still answer: WhatsApp draws a
 *  send-location button, and the reply comes back as coordinates. */
const askLocation = (to: string, body: string) =>
  post({
    to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: { text: body },
      action: { name: 'send_location' },
    },
  });

/** A pin the user can tap straight into Waze or Google Maps. Worth more than
 *  an address line to someone who is driving. */
const sendPin = (to: string, s: Station) =>
  post({
    to,
    type: 'location',
    location: {
      latitude: s.lat,
      longitude: s.lng,
      name: s.name,
      address: `${s.city}${s.address ? ' — ' + s.address : ''}`,
    },
  });

// ── data ───────────────────────────────────────────────────────────────────

async function stations(): Promise<Station[]> {
  const { data } = await db
    .from('stations')
    .select('id, name, city, address, phone, lat, lng, slug')
    .eq('status', 'approved')
    .eq('is_demo', false)
    .order('city');
  return (data ?? []) as Station[];
}

async function availability(): Promise<Map<string, string[]>> {
  const { data } = await db
    .from('station_products')
    .select('station_id, product')
    .eq('is_available', true);
  const map = new Map<string, string[]>();
  for (const p of data ?? []) {
    const list = map.get(p.station_id) ?? [];
    list.push(p.product);
    map.set(p.station_id, list);
  }
  return map;
}

/** Straight-line distance in km. Anbar is flat and the stations are minutes
 *  apart; a routing API would cost money to change the ordering almost never. */
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const fuels = (avail: string[] | undefined) =>
  avail?.length ? avail.map((p) => PRODUCT_LABELS[p] ?? p).join(' · ') : null;

// ── screens ────────────────────────────────────────────────────────────────

const WELCOME = [
  '⛽ *المحطة التقنية*',
  'وقود الأنبار — اعرف قبل أن تتحرك.',
  '',
  'اختر من الأزرار في الأسفل 👇',
].join('\n');

const menu = (to: string, body = WELCOME) =>
  sendButtons(to, body, [
    { id: 'nearby', title: '📍 الأقرب إليّ' },
    { id: 'all', title: '⛽ كل المحطات' },
    { id: 'byfuel', title: '🛢 حسب الوقود' },
  ]);

async function screenAll(to: string) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  if (!list.length) return sendText(to, 'لا توجد محطات معتمدة حالياً.');

  return sendList(
    to,
    '⛽ المحطات المسجّلة — اختر واحدة لترى تفاصيلها وموقعها.',
    'اختر محطة',
    list.map((s) => ({
      id: `s:${s.id}`,
      title: s.name,
      description: `${s.city} · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود الآن'}`,
    }))
  );
}

async function screenByFuel(to: string) {
  const avail = await availability();
  const counts = new Map<string, number>();
  for (const products of avail.values()) {
    for (const p of products) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const rows = Object.keys(PRODUCT_LABELS)
    .filter((p) => counts.get(p))
    .map((p) => ({
      id: `f:${p}`,
      title: PRODUCT_LABELS[p],
      description: `متوفر في ${counts.get(p)} محطة`,
    }));

  if (!rows.length) return sendText(to, 'لا يوجد أي منتج متوفر في المحطات الآن.');
  return sendList(to, '🛢 اختر نوع الوقود:', 'أنواع الوقود', rows);
}

async function screenFuel(to: string, product: string) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  const matching = list.filter((s) => avail.get(s.id)?.includes(product));
  const label = PRODUCT_LABELS[product] ?? product;

  if (!matching.length) {
    await sendText(to, `⛔ لا توجد محطة يتوفر فيها *${label}* الآن.`);
    return menu(to, 'جرّب نوعاً آخر:');
  }

  return sendList(
    to,
    `✅ *${label}* متوفر في ${matching.length} محطة — اختر واحدة:`,
    'اختر محطة',
    matching.map((s) => ({
      id: `s:${s.id}`,
      title: s.name,
      description: `${s.city}${s.address ? ' — ' + s.address : ''}`,
    }))
  );
}

async function screenStation(to: string, id: string) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  const s = list.find((x) => x.id === id);
  if (!s) return sendText(to, 'لم أجد هذه المحطة.');

  const f = fuels(avail.get(s.id));
  const lines = [
    `⛽ *${s.name}*`,
    `📍 ${s.city}${s.address ? ' — ' + s.address : ''}`,
    '',
    f ? `✅ المتوفر الآن: ${f}` : '⛔ لا يوجد وقود متوفر الآن',
  ];
  if (s.phone) lines.push(`📞 ${s.phone}`);
  if (s.slug) lines.push('', `🔗 muhta.online/${s.slug}`);

  await sendText(to, lines.join('\n'));
  if (s.lat && s.lng) await sendPin(to, s);
  return menu(to, 'شيء آخر؟');
}

async function screenNearby(to: string, lat: number, lng: number) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  const located = list.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) return sendText(to, 'لا توجد محطات بمواقع مسجّلة بعد.');

  const near = located
    .map((s) => ({ s, d: km(lat, lng, s.lat!, s.lng!) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);

  await sendList(
    to,
    '📍 أقرب المحطات إليك — اختر واحدة لترى موقعها:',
    'اختر محطة',
    near.map(({ s, d }) => ({
      id: `s:${s.id}`,
      title: s.name,
      description: `${d.toFixed(1)} كم · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود'}`,
    }))
  );
  return null;
}

// ── routing ────────────────────────────────────────────────────────────────

async function handle(from: string, message: Record<string, any>) {
  const type = message.type;

  if (type === 'location') {
    return screenNearby(from, message.location.latitude, message.location.longitude);
  }

  // A voice note from someone who cannot read is the whole reason this branch
  // exists. Until transcription is wired, say so plainly and offer the buttons
  // — never leave the message unanswered.
  if (type === 'audio' || type === 'voice') {
    await sendText(
      from,
      '🎤 وصلتني رسالتك الصوتية. الرد على الصوت قيد التجهيز — استخدم الأزرار الآن:'
    );
    return menu(from, 'اختر ما تريد:');
  }

  if (type === 'interactive') {
    const id: string =
      message.interactive?.button_reply?.id ??
      message.interactive?.list_reply?.id ??
      '';
    if (id === 'nearby') {
      return askLocation(from, '📍 أرسل موقعك وأدلّك على أقرب المحطات إليك.');
    }
    if (id === 'all') return screenAll(from);
    if (id === 'byfuel') return screenByFuel(from);
    if (id.startsWith('s:')) return screenStation(from, id.slice(2));
    if (id.startsWith('f:')) return screenFuel(from, id.slice(2));
    return menu(from);
  }

  const text: string = (message.text?.body ?? '').trim();

  if (/^(الغاء|إلغاء|stop|ايقاف|إيقاف)$/i.test(text)) {
    return sendText(from, 'تم. أرسل «محطات» في أي وقت للعودة.');
  }

  // Free-text search, so a name typed from memory still works.
  if (text.length > 2 && !/^(محطات|مرحبا|السلام|هلا|start|بدء|ابدأ)/i.test(text)) {
    const [list, avail] = await Promise.all([stations(), availability()]);
    const hits = list.filter(
      (s) => s.name.includes(text) || s.city.includes(text) || (s.address ?? '').includes(text)
    );
    if (hits.length === 1) return screenStation(from, hits[0].id);
    if (hits.length > 1) {
      return sendList(
        from,
        `وجدت ${hits.length} نتيجة لـ «${text}»:`,
        'اختر محطة',
        hits.map((s) => ({
          id: `s:${s.id}`,
          title: s.name,
          description: `${s.city} · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود'}`,
        }))
      );
    }
    return menu(from, `لم أجد «${text}». اختر من الأزرار:`);
  }

  return menu(from);
}

// ── entry ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);

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

  let debug: unknown = null;
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    // Delivery and read receipts arrive on the same webhook and carry no message.
    if (!message) return new Response('ok');

    const from: string = message.from;
    const profileName: string | null = value?.contacts?.[0]?.profile?.name ?? null;

    const { error: userError } = await db.from('whatsapp_users').upsert(
      { wa_id: from, name: profileName, last_seen: new Date().toISOString() },
      { onConflict: 'wa_id' }
    );
    if (userError) console.error('whatsapp_users upsert:', JSON.stringify(userError));

    const sendError = await handle(from, message);
    debug = { from, type: message.type, userError, sendError };
  } catch (e) {
    console.error('whatsapp handler:', e);
    debug = { crash: String(e) };
  }

  // Meta only ever reads the status code — a non-200 makes it retry, and a
  // retry loop on a parsing bug looks like abuse from their side.
  if (url.searchParams.get('debug') === '1') {
    return new Response(JSON.stringify(debug), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response('ok');
});
