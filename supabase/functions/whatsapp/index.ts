// WhatsApp Cloud API webhook — «المحطة التقنية».
//
// Mirrors the Telegram bot's menus as closely as WhatsApp allows. The platform
// differences that shaped every screen:
//   • Reply buttons cap at 3; interactive lists cap at 10 rows across ALL
//     sections. Telegram's main menu is six rows — so the main menu here is a
//     list, not buttons, and anything longer than ten paginates.
//   • There is no edit-message API, so each tap is a new message in the thread.
//   • The sender's phone arrives already verified by Meta, so owner access
//     needs no contact-sharing step — it falls out of a phone match.
//
// Scope is enforced structurally, not by instruction: there is no generative
// model in the reply path. Every answer is built from the stations table, so
// the bot cannot discuss weather or news because no code path can produce it.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') ?? '';
const VERIFY = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const API = 'https://graph.facebook.com/v25.0';
const SITE = 'https://muhta.online';

const PRODUCT_LABELS: Record<string, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسّن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

/** Iraqi speakers ask for fuel by several names. Spoken transcripts are messy,
 *  so match on what people actually say, not on the enum. */
const PRODUCT_WORDS: Record<string, string[]> = {
  gasoline_premium: ['محسن', 'محسّن', 'ممتاز', 'سوبر بلس'],
  gasoline_super: ['سوبر'],
  gasoline_regular: ['بنزين', 'بانزين', 'عادي', 'بترول'],
  kerosene: ['كاز', 'كيروسين'],
  gas: ['غاز'],
  lpg: ['ال بي جي', 'lpg', 'غاز سائل'],
  white_oil: ['نفط ابيض', 'نفط أبيض', 'ابيض', 'أبيض'],
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

const PAGE = 9; // the tenth row is always "المزيد"

// ── transport ──────────────────────────────────────────────────────────────

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

const sendButtons = (to: string, body: string, buttons: { id: string; title: string }[]) =>
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

interface Row { id: string; title: string; description?: string }

const sendList = (to: string, body: string, button: string, rows: Row[]) =>
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

/** Ten rows is the hard cap, so long lists carry a "more" row into the next
 *  page. Telegram simply scrolls; here the list has to be walked. */
function paginate(rows: Row[], page: number, moreId: string): Row[] {
  if (rows.length <= 10) return rows;
  const start = page * PAGE;
  const slice = rows.slice(start, start + PAGE);
  if (start + PAGE < rows.length) {
    slice.push({
      id: `${moreId}:${page + 1}`,
      title: '⏭ المزيد',
      description: `${rows.length - start - PAGE} أخرى`,
    });
  }
  return slice;
}

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

/** 07XXXXXXXXX / +9647XXXXXXXXX / 9647… all reduce to 7XXXXXXXXX. */
function phoneCore(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '');
}

/** The station this WhatsApp number owns, if any. Meta already verified the
 *  sender's number, so no contact-sharing dance is needed — unlike Telegram. */
async function ownedStation(waId: string): Promise<Station | null> {
  const core = phoneCore(waId);
  if (!core) return null;
  const list = await stations();
  return list.find((s) => phoneCore(s.phone ?? '') === core) ?? null;
}

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
  'منصة وقود الأنبار — اعرف قبل أن تتحرك.',
  '',
  'اختر من القائمة 👇',
].join('\n');

async function mainMenu(to: string, body = WELCOME) {
  const owner = await ownedStation(to);
  const rows: Row[] = [
    { id: 'nearby', title: '📍 المحطات القريبة', description: 'أرسل موقعك ونرتّبها بالمسافة' },
    { id: 'products', title: '⛽ حسب نوع الوقود', description: 'بانزين · كاز · غاز · نفط أبيض' },
    { id: 'all', title: '🏬 كل المحطات', description: 'القائمة الكاملة وحالة كل محطة' },
    { id: 'favs', title: '⭐ محطاتي المفضلة', description: 'المحطات التي تتابعها' },
  ];
  rows.push(
    owner
      ? { id: 'manage', title: '🏪 إدارة محطتي', description: owner.name }
      : { id: 'addst', title: '➕ أضف محطتي', description: 'لأصحاب المحطات — مجاناً' }
  );
  rows.push({ id: 'site', title: '🌐 فتح الموقع', description: 'الخريطة والتفاصيل' });
  return sendList(to, body, 'القائمة', rows);
}

async function screenAll(to: string, page = 0) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  if (!list.length) return sendText(to, 'لا توجد محطات معتمدة حالياً.');

  const rows = list.map((s) => ({
    id: `s:${s.id}`,
    title: s.name,
    description: `${s.city} · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود الآن'}`,
  }));
  return sendList(to, '🏬 المحطات المسجّلة — اختر واحدة:', 'اختر محطة', paginate(rows, page, 'pall'));
}

async function screenProducts(to: string) {
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

  if (!rows.length) {
    await sendText(to, '⛔ لا يوجد أي منتج متوفر في المحطات الآن.');
    return mainMenu(to, 'شيء آخر؟');
  }
  return sendList(to, '⛽ اختر نوع الوقود:', 'أنواع الوقود', rows);
}

async function screenFuel(to: string, product: string, page = 0) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  const matching = list.filter((s) => avail.get(s.id)?.includes(product));
  const label = PRODUCT_LABELS[product] ?? product;

  if (!matching.length) {
    await sendText(to, `⛔ لا توجد محطة يتوفر فيها *${label}* الآن.`);
    return mainMenu(to, 'جرّب نوعاً آخر:');
  }
  const rows = matching.map((s) => ({
    id: `s:${s.id}`,
    title: s.name,
    description: `${s.city}${s.address ? ' — ' + s.address : ''}`,
  }));
  return sendList(
    to,
    `✅ *${label}* متوفر في ${matching.length} محطة:`,
    'اختر محطة',
    paginate(rows, page, `pf:${product}`)
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
  if (s.slug) lines.push('', `🔗 ${SITE}/${s.slug}`);

  await sendText(to, lines.join('\n'));
  if (s.lat && s.lng) await sendPin(to, s);

  const { data: fav } = await db
    .from('whatsapp_favorites')
    .select('station_id')
    .eq('wa_id', to)
    .eq('station_id', id)
    .maybeSingle();

  return sendButtons(to, 'شيء آخر؟', [
    fav
      ? { id: `fd:${id}`, title: '💔 إزالة المفضلة' }
      : { id: `fa:${id}`, title: '⭐ أضف للمفضلة' },
    { id: 'menu', title: '🏠 القائمة' },
  ]);
}

async function screenNearby(to: string, lat: number, lng: number) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  const located = list.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) return sendText(to, 'لا توجد محطات بمواقع مسجّلة بعد.');

  const near = located
    .map((s) => ({ s, d: km(lat, lng, s.lat!, s.lng!) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 9);

  return sendList(
    to,
    '📍 أقرب المحطات إليك:',
    'اختر محطة',
    near.map(({ s, d }) => ({
      id: `s:${s.id}`,
      title: s.name,
      description: `${d.toFixed(1)} كم · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود'}`,
    }))
  );
}

async function screenFavourites(to: string) {
  const { data: favs } = await db
    .from('whatsapp_favorites')
    .select('station_id, stations(id, name, city)')
    .eq('wa_id', to);

  const rows = (favs ?? [])
    .map((f) => f.stations as unknown as { id: string; name: string; city: string })
    .filter(Boolean)
    .map((s) => ({ id: `s:${s.id}`, title: `⭐ ${s.name}`, description: s.city }));

  if (!rows.length) {
    await sendText(
      to,
      '⭐ *محطاتك المفضلة*\n\nلم تضف أي محطة بعد.\nافتح أي محطة واضغط «أضف للمفضلة».'
    );
    return mainMenu(to, 'ابدأ من هنا:');
  }
  return sendList(to, '⭐ *محطاتك المفضلة*', 'اختر محطة', rows.slice(0, 10));
}

async function screenOwner(to: string) {
  const station = await ownedStation(to);
  if (!station) {
    await sendText(
      to,
      '🏪 لا توجد محطة مسجّلة على رقمك.\n\n' +
        `سجّل محطتك مجاناً من الموقع: ${SITE}/register\n` +
        'أو عبر بوت تيليجرام: @muhtaonlinebot'
    );
    return mainMenu(to, 'شيء آخر؟');
  }

  const avail = await availability();
  const on = new Set(avail.get(station.id) ?? []);
  const rows = Object.keys(PRODUCT_LABELS).map((p) => ({
    id: `t:${station.id}:${p}`,
    title: `${on.has(p) ? '✅' : '⛔'} ${PRODUCT_LABELS[p]}`,
    description: on.has(p) ? 'متوفر — اضغط لإيقافه' : 'غير متوفر — اضغط لتفعيله',
  }));

  return sendList(
    to,
    `🏪 *${station.name}*\nاضغط على المنتج لتبديل حالته. يظهر التغيير للسائقين فوراً.`,
    'المنتجات',
    rows
  );
}

async function toggleProduct(to: string, stationId: string, product: string) {
  const owner = await ownedStation(to);
  if (!owner || owner.id !== stationId) {
    return sendText(to, 'هذه المحطة ليست مسجّلة على رقمك.');
  }

  const { data: row } = await db
    .from('station_products')
    .select('is_available')
    .eq('station_id', stationId)
    .eq('product', product)
    .maybeSingle();

  const next = !row?.is_available;
  await db
    .from('station_products')
    .upsert(
      { station_id: stationId, product, is_available: next, updated_at: new Date().toISOString() },
      { onConflict: 'station_id,product' }
    );

  await sendText(
    to,
    `${next ? '✅' : '⛔'} ${PRODUCT_LABELS[product]} — ${next ? 'أصبح متوفراً' : 'أصبح غير متوفر'}`
  );
  return screenOwner(to);
}

// ── voice ──────────────────────────────────────────────────────────────────

/** Groq hosts Whisper large-v3, which handles Iraqi dialect far better than
 *  MSA-only models and costs a fraction of a cent per voice note. WhatsApp
 *  sends OGG/Opus, which Whisper accepts directly — no transcoding, which
 *  matters because Deno Edge cannot run ffmpeg. */
async function transcribe(mediaId: string): Promise<string | null> {
  if (!GROQ_KEY) return null;

  const meta = await fetch(`${API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  }).then((r) => r.json());
  if (!meta?.url) return null;

  // Meta's media URL needs the same bearer token; a plain fetch returns 401.
  const audio = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!audio.ok) return null;

  const form = new FormData();
  form.append('file', new Blob([await audio.arrayBuffer()]), 'voice.ogg');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'ar');
  form.append('response_format', 'text');
  // Priming the decoder with in-domain words measurably improves recall of
  // station and fuel vocabulary in dialect audio.
  form.append('prompt', 'محطة وقود بنزين كاز غاز نفط أبيض الأنبار الرمادي اكو وين هسه');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: form,
  });
  if (!res.ok) {
    console.error('groq transcribe failed:', res.status, await res.text());
    return null;
  }
  return (await res.text()).trim();
}

// ── intent ─────────────────────────────────────────────────────────────────

const NEAR_WORDS = ['قريب', 'أقرب', 'اقرب', 'قربي', 'وين', 'يمي', 'جنبي'];
const FAV_WORDS = ['مفضل', 'المفضلة', 'مفضلتي'];
const OWNER_WORDS = ['محطتي', 'ادارة', 'إدارة', 'حدث', 'حدّث'];

/** Maps a spoken or typed request onto one of the bot's screens. Returns null
 *  when nothing matches, which is what makes the scope guard airtight: an
 *  unmatched question is refused rather than answered. */
function intentOf(text: string): { kind: string; value?: string } | null {
  const t = text.toLowerCase();

  for (const [product, words] of Object.entries(PRODUCT_WORDS)) {
    if (words.some((w) => t.includes(w))) return { kind: 'fuel', value: product };
  }
  if (NEAR_WORDS.some((w) => t.includes(w))) return { kind: 'nearby' };
  if (FAV_WORDS.some((w) => t.includes(w))) return { kind: 'favs' };
  if (OWNER_WORDS.some((w) => t.includes(w))) return { kind: 'manage' };
  if (t.includes('محط')) return { kind: 'all' };
  return null;
}

const OUT_OF_SCOPE = [
  '🙏 عذراً، أنا بوت المحطة التقنية وأجيب عن الوقود والمحطات فقط.',
  '',
  'اسألني مثلاً: «اكو بنزين؟» أو «وين أقرب محطة؟» أو «اكو كاز؟»',
].join('\n');

// ── routing ────────────────────────────────────────────────────────────────

async function route(from: string, text: string) {
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
      hits.slice(0, 10).map((s) => ({
        id: `s:${s.id}`,
        title: s.name,
        description: `${s.city} · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود'}`,
      }))
    );
  }

  const intent = intentOf(text);
  if (!intent) {
    await sendText(from, OUT_OF_SCOPE);
    return mainMenu(from, 'اختر من القائمة:');
  }
  if (intent.kind === 'fuel') return screenFuel(from, intent.value!);
  if (intent.kind === 'nearby') return askLocation(from, '📍 أرسل موقعك وأدلّك على الأقرب إليك.');
  if (intent.kind === 'favs') return screenFavourites(from);
  if (intent.kind === 'manage') return screenOwner(from);
  return screenAll(from);
}

async function handle(from: string, message: Record<string, any>) {
  const type = message.type;

  if (type === 'location') {
    return screenNearby(from, message.location.latitude, message.location.longitude);
  }

  if (type === 'audio' || type === 'voice') {
    const mediaId = message.audio?.id ?? message.voice?.id;
    const said = mediaId ? await transcribe(mediaId) : null;
    if (!said) {
      await sendText(from, '🎤 لم أتمكّن من فهم الرسالة الصوتية. جرّب مرة أخرى أو اختر من القائمة:');
      return mainMenu(from, 'اختر ما تريد:');
    }
    await sendText(from, `🎤 سمعتك تقول: «${said}»`);
    return route(from, said);
  }

  if (type === 'interactive') {
    const id: string =
      message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? '';

    if (id === 'menu') return mainMenu(from);
    if (id === 'nearby') return askLocation(from, '📍 أرسل موقعك وأدلّك على الأقرب إليك.');
    if (id === 'all') return screenAll(from);
    if (id === 'products') return screenProducts(from);
    if (id === 'favs') return screenFavourites(from);
    if (id === 'manage' || id === 'addst') return screenOwner(from);
    if (id === 'site') {
      await sendText(from, `🌐 ${SITE}`);
      return mainMenu(from, 'شيء آخر؟');
    }
    if (id.startsWith('pall:')) return screenAll(from, Number(id.slice(5)) || 0);
    if (id.startsWith('pf:')) {
      const [, product, page] = id.split(':');
      return screenFuel(from, product, Number(page) || 0);
    }
    if (id.startsWith('s:')) return screenStation(from, id.slice(2));
    if (id.startsWith('f:')) return screenFuel(from, id.slice(2));
    if (id.startsWith('t:')) {
      const [, stationId, product] = id.split(':');
      return toggleProduct(from, stationId, product);
    }
    if (id.startsWith('fa:')) {
      await db.from('whatsapp_favorites').upsert({ wa_id: from, station_id: id.slice(3) });
      await sendText(from, '⭐ أُضيفت إلى مفضلتك.');
      return mainMenu(from, 'شيء آخر؟');
    }
    if (id.startsWith('fd:')) {
      await db
        .from('whatsapp_favorites')
        .delete()
        .eq('wa_id', from)
        .eq('station_id', id.slice(3));
      await sendText(from, '💔 أُزيلت من مفضلتك.');
      return mainMenu(from, 'شيء آخر؟');
    }
    return mainMenu(from);
  }

  const text: string = (message.text?.body ?? '').trim();
  if (/^(الغاء|إلغاء|stop|ايقاف|إيقاف)$/i.test(text)) {
    return sendText(from, 'تم. أرسل «محطات» في أي وقت للعودة.');
  }
  if (!text || /^(مرحبا|السلام|هلا|هاي|start|بدء|ابدأ|القائمة|محطات)/i.test(text)) {
    return mainMenu(from);
  }
  return route(from, text);
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

  // Meta only reads the status code — a non-200 makes it retry, and a retry
  // loop on a parsing bug looks like abuse from their side.
  if (url.searchParams.get('debug') === '1') {
    return new Response(JSON.stringify(debug), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('ok');
});
