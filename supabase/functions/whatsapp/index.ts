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

/** The districts of Anbar. Someone outside the province needs to be told so
 *  once, kindly — otherwise they read an empty list as a broken service. */
const ANBAR_CITIES = [
  'الرمادي', 'الفلوجة', 'هيت', 'حديثة', 'عانة', 'راوة', 'القائم', 'الرطبة',
  'الحبانية', 'الخالدية', 'عامرية الفلوجة', 'الكرمة', 'البغدادي', 'الحقلانية',
  'بروانة', 'النخيب',
];
const OUTSIDE = 'خارج الأنبار';

interface WaUser {
  wa_id: string;
  name: string | null;
  city: string | null;
  onboarded_at: string | null;
  /** null = never asked · true = voice replies · false = text only */
  voice: boolean | null;
}

/** A webhook nobody watches fails in silence. One row per fault beats reading
 *  platform logs that need a dashboard login to see. */
async function log(waId: string, kind: string, detail: string) {
  await db.from('wa_log').insert({ wa_id: waId, kind, detail: detail.slice(0, 900) });
}

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

/** Sends a recorded clip, but only to people who asked for voice.
 *
 *  Recorded once and uploaded once: Meta keeps a media id for 30 days, so a
 *  voice reply costs nothing to generate and arrives instantly, in a real
 *  Iraqi voice rather than a synthesised news-reader one. Silence is the right
 *  fallback — a missing clip must never block the text that carries the facts. */
/** Either/or, never both. A voice user gets the clip; a text user gets the
 *  sentence. Sending both is the worst of the two — a wall of text under a
 *  voice note nobody asked for.
 *
 *  Interactive messages are exempt: buttons and lists must carry a body, and a
 *  voice user still needs something to tap. Their bodies stay short. */
async function tell(to: string, key: string, text: string, wantsVoice: boolean | null) {
  if (wantsVoice) {
    const sent = await say(to, key, true);
    if (sent) return;
  }
  await sendText(to, text);
}

/** Returns true when a clip was actually delivered, so callers can fall back
 *  to text rather than leaving the user with silence. */
async function say(to: string, key: string, wantsVoice: boolean | null): Promise<boolean> {
  if (!wantsVoice) return false;
  const { data } = await db.from('wa_audio').select('media_id').eq('key', key).maybeSingle();
  if (!data?.media_id) return false;
  return (await post({ to, type: 'audio', audio: { id: data.media_id } })) === null;
}

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

/** Three buttons is the cap, so the two things a driver actually opens the bot
 *  for sit on the surface and the rest goes one tap deeper. */
async function mainMenu(to: string, body = WELCOME) {
  const owner = await ownedStation(to);
  return sendButtons(to, body, [
    { id: 'nearby', title: '📍 أقرب محطة لي' },
    owner
      ? { id: 'manage', title: '🏪 محطتي' }
      : { id: 'addst', title: '🏪 سجّل محطتي' },
    { id: 'more', title: '⋯ المزيد' },
  ]);
}

async function moreMenu(to: string) {
  const owner = await ownedStation(to);
  const rows: Row[] = [
    { id: 'nearby', title: '📍 المحطات القريبة', description: 'أرسل موقعك ونرتّبها بالمسافة' },
    { id: 'products', title: '⛽ حسب نوع الوقود', description: 'بانزين · كاز · غاز · نفط أبيض' },
    { id: 'all', title: '🏬 كل المحطات', description: 'القائمة الكاملة وحالة كل محطة' },
    { id: 'favs', title: '⭐ محطاتي المفضلة', description: 'المحطات التي تتابعها' },
    { id: 'site', title: '🌐 فتح الموقع', description: 'الخريطة والتفاصيل' },
    { id: 'city', title: '📌 غيّر مدينتي', description: 'لترتيب المحطات حسب مدينتك' },
    { id: 'voice', title: '🔊 صوتي أو كتابي', description: 'اختر شلون يوصلك الرد' },
  ];
  rows.push(
    owner
      ? { id: 'manage', title: '🏪 إدارة محطتي', description: owner.name }
      : { id: 'addst', title: '➕ أضف محطتي', description: 'لأصحاب المحطات — مجاناً' }
  );
  return sendList(to, 'اختر ما تريد:', 'الخيارات', rows);
}

async function screenAll(to: string, page = 0) {
  const [list, avail, me] = await Promise.all([stations(), availability(), userRow(to)]);
  if (!list.length) return sendText(to, 'لا توجد محطات معتمدة حالياً.');

  // A driver in Hit does not want Ramadi at the top of his list.
  const ordered = me?.city
    ? [...list].sort((a, b) => Number(b.city === me.city) - Number(a.city === me.city))
    : list;

  const rows = ordered.map((s) => ({
    id: `s:${s.id}`,
    title: s.name,
    description: `${s.city} · ${fuels(avail.get(s.id)) ?? 'لا يوجد وقود الآن'}`,
  }));
  return sendList(to, '🏬 المحطات المسجّلة — اختر واحدة:', 'اختر محطة', paginate(rows, page, 'pall'));
}

async function screenProducts(to: string, voice: boolean | null = null) {
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
    await tell(to, 'found_none', '⛔ لا يوجد أي منتج متوفر في المحطات الآن.', voice);
    return mainMenu(to, 'شيء آخر؟');
  }
  return sendList(to, '⛽ اختر نوع الوقود:', 'أنواع الوقود', rows);
}

async function screenFuel(to: string, product: string, page = 0, voice: boolean | null = null) {
  const [list, avail] = await Promise.all([stations(), availability()]);
  const matching = list.filter((s) => avail.get(s.id)?.includes(product));
  const label = PRODUCT_LABELS[product] ?? product;

  if (!matching.length) {
    await tell(to, 'found_none', `⛔ لا توجد محطة يتوفر فيها *${label}* الآن.`, voice);
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
    `🏪 *${station.name}*\nاضغط على المنتج لتبديل حالته. يظهر التغيير للمستخدمين فوراً.`,
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

// ── onboarding ─────────────────────────────────────────────────────────────

async function userRow(waId: string): Promise<WaUser | null> {
  const { data } = await db
    .from('whatsapp_users')
    .select('wa_id, name, city, onboarded_at, voice')
    .eq('wa_id', waId)
    .maybeSingle();
  return (data as WaUser) ?? null;
}

/** First contact. Says who we are, what the app adds that WhatsApp cannot —
 *  alerts — and then asks the one question that decides whether the rest of
 *  the conversation is useful to this person at all: which city. */
async function welcome(to: string, name: string | null, voice: boolean | null = null) {
  const clean = (name ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 24);
  const hi = clean ? `أهلاً ${clean} 👋` : 'أهلاً وسهلاً 👋';
  if (await say(to, 'welcome', voice)) return;
  await sendText(
    to,
    [
      `${hi}`,
      '',
      '⛽ *المحطة التقنية* — منصة وقود الأنبار.',
      '',
      'نعرض لك أي محطة فيها وقود *الآن*، وأي نوع، وأقربها إليك — والمعلومة من صاحب المحطة نفسه.',
      '',
      'تقدر تسألني بالكتابة أو *بالرسالة الصوتية*:',
      '«اكو بنزين؟» · «وين أقرب محطة؟» · «اكو كاز؟»',
      '',
      `📲 وللتنبيه *فور* وصول الوقود إلى محطتك المفضلة، ثبّت التطبيق من ${SITE} — الإشعار يصلك هناك مجاناً وفوراً.`,
      '',
      '📌 الخدمة الآن في *محافظة الأنبار* فقط. وإن كنت تريد المنتوج النفطي في محافظة أخرى، سنعلن توفّر النظام فيها قريباً بإذن الله.',
    ].join(String.fromCharCode(10))
  );
}

function askCity(to: string, page: number) {
  // ids stay ASCII: WhatsApp returns a non-ASCII row id mangled, which turned
  // the confirmation line into question marks.
  const rows: Row[] = ANBAR_CITIES.map((c, i) => ({ id: `c:${i}`, title: c }));
  rows.push({ id: 'c:x', title: OUTSIDE, description: 'خارج محافظة الأنبار' });
  return sendList(
    to,
    '📍 من أي مدينة أنت؟' + String.fromCharCode(10) + 'نرتّب لك محطاتها أولاً.',
    'اختر مدينتك',
    paginate(rows, page, 'pcity')
  );
}

function askVoice(to: string) {
  return sendButtons(
    to,
    'شلون تحب يوصلك الرد؟' +
      String.fromCharCode(10) +
      '🔊 صوتي — تسمع الجواب' +
      String.fromCharCode(10) +
      '✍️ كتابي — تقرأ الجواب' +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      'تكدر تغيّرها بأي وقت من «المزيد».',
    [
      { id: 'v:1', title: '🔊 صوتي' },
      { id: 'v:0', title: '✍️ كتابي' },
    ]
  );
}

async function setVoice(to: string, on: boolean) {
  await db.from('whatsapp_users').update({ voice: on }).eq('wa_id', to);
  if (on) await say(to, 'menu', true);
  await sendText(
    to,
    on ? '🔊 تمام، الردود راح توصلك صوت.' : '✍️ تمام، الردود راح توصلك كتابة.'
  );
  return mainMenu(to, 'تفضّل:');
}

async function setCity(to: string, city: string) {
  await db.from('whatsapp_users').update({ city }).eq('wa_id', to);

  if (city === OUTSIDE) {
    await sendText(
      to,
      [
        'شكراً لك 🙏',
        '',
        'المنصة تغطي *محافظة الأنبار* حالياً، ونتوسّع تدريجياً.',
        'تقدر تتصفّح المحطات الموجودة، ولو صار عندك محطة في مدينتك سجّلها مجاناً.',
      ].join(String.fromCharCode(10))
    );
    return askVoice(to);
  }

  const list = await stations();
  const here = list.filter((s) => s.city === city).length;
  await sendText(
    to,
    here
      ? `تمام ✅ سجّلت مدينتك: *${city}* — عندنا ${here} محطة فيها، وراح تظهر لك أولاً.`
      : `تمام ✅ سجّلت مدينتك: *${city}*.
ما عدنا محطات مسجّلة فيها بعد — التسجيل مفتوح مجاناً لأصحاب المحطات، وتقدر تتصفّح باقي المحافظة الآن.`
  );
  const row = await userRow(to);
  return row?.voice === null || row?.voice === undefined ? askVoice(to) : mainMenu(to, 'تفضّل:');
}

// ── voice ──────────────────────────────────────────────────────────────────

/** Groq hosts Whisper large-v3, which handles Iraqi dialect far better than
 *  MSA-only models and costs a fraction of a cent per voice note. WhatsApp
 *  sends OGG/Opus, which Whisper accepts directly — no transcoding, which
 *  matters because Deno Edge cannot run ffmpeg. */
async function transcribe(waId: string, mediaId: string): Promise<string | null> {
  if (!GROQ_KEY) {
    await log(waId, 'stt', 'GROQ_API_KEY missing');
    return null;
  }

  const meta = await fetch(`${API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  }).then((r) => r.json());
  if (!meta?.url) {
    await log(waId, 'stt', 'media lookup: ' + JSON.stringify(meta).slice(0, 300));
    return null;
  }

  // Meta's media URL needs the same bearer token; a plain fetch returns 401.
  const audio = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!audio.ok) {
    await log(waId, 'stt', `media download ${audio.status}`);
    return null;
  }

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
    await log(waId, 'stt', `groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  const said = (await res.text()).trim();
  await log(waId, 'heard', said);
  return said;
}

// ── intent ─────────────────────────────────────────────────────────────────

const GREETINGS = [
  'اهلا', 'أهلا', 'اهلين', 'هلا', 'هلو', 'مرحبا', 'مرحبتين', 'سلام', 'السلام',
  'صباح', 'مساء', 'شلونك', 'شلونكم', 'هاي', 'start', 'بدء', 'ابدا', 'ابدأ', 'القائمة',
];

const NEAR_WORDS = ['قريب', 'أقرب', 'اقرب', 'قربي', 'وين', 'يمي', 'جنبي'];
const FAV_WORDS = ['مفضل', 'المفضلة', 'مفضلتي'];
const OWNER_WORDS = ['محطتي', 'ادارة', 'إدارة', 'حدث', 'حدّث'];

/** Maps a spoken or typed request onto one of the bot's screens. Returns null
 *  when nothing matches, which is what makes the scope guard airtight: an
 *  unmatched question is refused rather than answered. */
function intentOf(text: string): { kind: string; value?: string } | null {
  const t = text.toLowerCase();

  // A greeting is not an out-of-scope question. Refusing «اهلا» reads as a
  // slap, and it was the first thing a real user saw.
  if (GREETINGS.some((w) => t.includes(w))) return { kind: 'menu' };

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

async function route(from: string, text: string, pref: boolean | null) {
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
    await tell(from, 'out_of_scope', OUT_OF_SCOPE, pref);
    return mainMenu(from, 'اختر من القائمة:');
  }
  if (intent.kind === 'menu') return mainMenu(from, 'أهلاً بك 👋 اختر ما تريد:');
  if (intent.kind === 'fuel') return screenFuel(from, intent.value!, 0, pref);
  if (intent.kind === 'nearby') return askLocation(from, '📍 أرسل موقعك وأدلّك على الأقرب إليك.');
  if (intent.kind === 'favs') return screenFavourites(from);
  if (intent.kind === 'manage') return screenOwner(from);
  return screenAll(from);
}

async function handle(from: string, message: Record<string, any>, name: string | null) {
  const me = await userRow(from);
  const pref = me?.voice ?? null;

  // First contact — greet, explain, and ask the city once. Everything else
  // waits: a menu shown to someone who does not know what this is gets closed.
  // First contact: greet, then answer whatever they actually asked. A person
  // who opens with «اكو بنزين؟» deserves both — the introduction explains who
  // is answering, and the answer is why they wrote.
  if (!me?.onboarded_at) {
    await db
      .from('whatsapp_users')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('wa_id', from);
    await welcome(from, name ?? me?.name ?? null, pref);

    const opener = (message.text?.body ?? '').trim();
    const asked = message.type !== 'text' || (opener && intentOf(opener)?.kind !== 'menu');
    if (!asked) {
      await say(from, 'ask_city', pref);
      return askCity(from, 0);
    }
    // they asked something real — answer it, and the city can wait for «المزيد»
  }

  const type = message.type;

  if (type === 'location') {
    await say(from, 'nearest', pref);
    return screenNearby(from, message.location.latitude, message.location.longitude);
  }

  if (type === 'audio' || type === 'voice') {
    const mediaId = message.audio?.id ?? message.voice?.id;
    if (!mediaId) await log(from, 'stt', 'no media id: ' + JSON.stringify(message).slice(0, 300));
    const said = mediaId ? await transcribe(from, mediaId) : null;
    if (!said) {
      await tell(
        from,
        'audio_failed',
        '🎤 لم أتمكّن من فهم الرسالة الصوتية. جرّب مرة أخرى أو اختر من القائمة:',
        pref
      );
      return mainMenu(from, 'اختر ما تريد:');
    }
    return route(from, said, pref);
  }

  if (type === 'interactive') {
    const id: string =
      message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? '';

    if (id === 'menu') return mainMenu(from);
    if (id === 'more') return moreMenu(from);
    if (id === 'v:1') return setVoice(from, true);
    if (id === 'v:0') return setVoice(from, false);
    if (id === 'voice') return askVoice(from);
    if (id === 'nearby') {
      await say(from, 'ask_location', pref);
      return askLocation(from, '📍 أرسل موقعك وأدلّك على الأقرب إليك.');
    }
    if (id === 'all') return screenAll(from);
    if (id === 'products') { await say(from, 'found_many', pref); return screenProducts(from); }
    if (id === 'favs') return screenFavourites(from);
    if (id === 'manage' || id === 'addst') {
      await say(from, id === 'manage' ? 'owner_panel' : 'register_station', pref);
      return screenOwner(from);
    }
    if (id === 'site') {
      await sendText(from, `🌐 ${SITE}`);
      return mainMenu(from, 'شيء آخر؟');
    }
    if (id.startsWith('c:')) {
      const key = id.slice(2);
      return setCity(from, key === 'x' ? OUTSIDE : ANBAR_CITIES[Number(key)] ?? OUTSIDE);
    }
    if (id.startsWith('pcity:')) return askCity(from, Number(id.slice(6)) || 0);
    if (id === 'city') return askCity(from, 0);
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
  return route(from, text, pref);
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

  const body = await req.json().catch(() => null);
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return new Response('ok');

  const from: string = message.from;
  const profileName: string | null = value?.contacts?.[0]?.profile?.name ?? null;

  const work = (async () => {
    try {
      // Only overwrite the name when WhatsApp actually sent one — a payload
      // without a contacts block would otherwise erase what we already know.
      await db.from('whatsapp_users').upsert(
        {
          wa_id: from,
          last_seen: new Date().toISOString(),
          ...(profileName ? { name: profileName } : {}),
        },
        { onConflict: 'wa_id' }
      );
      const sendError = await handle(from, message, profileName);
      if (sendError) await log(from, 'send', sendError);
      return { from, type: message.type, sendError };
    } catch (e) {
      await log(from, 'crash', String(e));
      return { crash: String(e) };
    }
  })();

  // Debug callers wait for the answer; Meta must not. Transcribing a voice note
  // takes seconds, and a webhook that replies late is retried — the user gets
  // the same answer three times and every copy is billable after October.
  if (url.searchParams.get('debug') === '1') {
    return new Response(JSON.stringify(await work), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else await work;
  return new Response('ok');

});
