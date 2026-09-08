// Telegram bot for المحطة التقنية.
// Runs as a Supabase Edge Function: always on, and in the same place as the
// data, so a "which station has petrol near me" answer is one query away.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// المحلِّلُ والمطابقُ يُستوردان من `lib/` ولا يُنسخان: نسخةٌ ثانيةٌ من قائمة
// المسح أو من تطبيع الأسماء تعني أن البوت والموقع يفهمان الاسمَ نفسَه فهمين.
// وهي ملفّاتٌ خالصةٌ بلا شبكةٍ ولا React، تُرفع مع هذه الدالّة عند كلّ نشر.
import { CITY_NAMES } from '../../../lib/cities.ts';
import {
  looksLikeSchedule,
  matchLine,
  readManualLine,
  readSchedule,
  type PlatformStation,
  type ScheduleLine as RawLine,
} from '../../../lib/schedule.ts';

/** سطرُ الجدول في المسوّدة — ومعه مفتاحُه الثابت. */
type ScheduleLine = RawLine & { key?: string };
import { countWord, sendScheduleAlert } from '../_shared/alert.ts';
import { newPassword } from '../_shared/password.ts';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
// A newline constant instead of an escape. Automated edits to this file
// have eaten the backslash-n twice, once leaving a comment cut in half so
// the word after it parsed as code and every update crashed on boot.
const NL = String.fromCharCode(10);
const SITE = 'https://muhta.online';

// Telegram parses these messages as HTML, and both station names and contact
// names are typed by the public. A single unescaped < makes the whole message
// fail to send with a 400 — and the admin then sees nothing at all, which is
// worse than a mangled name.
const esc = (v: string | null | undefined) =>
  (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A WhatsApp chat with the greeting already written, so reaching an owner is
// one tap from the list instead of copying the number into another app.
// wa.me wants the international form: country code, no plus, no leading zero.
const waLink = (phone: string, name?: string | null) => {
  let d = (phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('964')) d = d.slice(3);
  d = d.replace(/^0+/, '');
  if (!d) return '';
  const text = `السلام عليكم ${(name ?? '').trim()}${NL}أنا من إدارة المحطة التقنية: `;
  return `https://wa.me/964${d}?text=${encodeURIComponent(text)}`;
};
// Telegram ids allowed to approve stations, set as a project secret so it can
// change without a redeploy.
const ADMIN_IDS = new Set(
  (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
);
const isAdmin = (id: number) => ADMIN_IDS.has(String(id));
const API = `https://api.telegram.org/bot${TOKEN}`;

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
const PRODUCTS = Object.keys(PRODUCT_LABELS);

/** هل ما زال هذا المنتج معروضاً؟
 *
 *  نظيرةُ `isOffered` في lib/products.ts، بقدر ما يخصّ الصفَّ وحدَه: متوفّرٌ،
 *  ولم يمرّ موعدُ النفاد الذي أعلنه صاحبُه. (الدوامَ يفحصه `isOpenNow` حيث
 *  يلزم، والحداثةَ لا يفحصها البوتُ أصلاً — عيبٌ قائمٌ قبل هذا العمود.)
 *
 *  وستّةُ مواضعَ في هذا الملفّ كانت تكتب `p.is_available` بيدها؛ فدالّةٌ
 *  واحدة، لأن المنسيَّ منها يقول للسائق «متوفر» عن وقودٍ نفد. */
function stillLive(
  p: { is_available?: boolean | null; runs_out_at?: string | null } | null | undefined
): boolean {
  return !!p?.is_available && !(p.runs_out_at && p.runs_out_at <= new Date().toISOString());
}

/** وهل يُقال عنه «الآن»؟
 *
 *  `stillLive` تقرأ ما ضبطه صاحبُ المحطة، ولذلك تصلح للوحته: زرُّه يقلب ما
 *  يراه، وشارتُه ✅ تعني «هكذا تركتَها». **ولا تصلح للناس.** فهي لا تسأل متى
 *  قيل ذلك، وقد لا يكون قيل اليوم.
 *
 *  مقيسٌ يومَ كُتب هذا: شاشةُ «المتوفر الآن» سبعَ عشرةَ محطة، خمسٌ منها على
 *  خبرٍ أقدمَ من يوم — وأقدمُها **تسعةُ أيامٍ وثلث**. والسائقُ الذي يقصدها
 *  يقطع الطريقَ على جملةٍ عنوانُها «الآن».
 *
 *  والحدُّ أربعٌ وعشرون ساعةً لا اجتهاداً: هو `FRESH_HOURS` في lib/hours.ts،
 *  وهو الذي يُسقط الأخضرَ في التطبيق. فما ليس أخضرَ في الموقع لا يُقال عنه
 *  «متوفّرٌ الآن» في البوت — والسطحان يقولان الشيءَ نفسَه أو أحدُهما يكذب.
 *
 *  والعيبُ كان مذكوراً في تعليق `stillLive` نفسِه: «والحداثةَ لا يفحصها
 *  البوتُ أصلاً — عيبٌ قائمٌ قبل هذا العمود». فسُدّ. */
const FRESH_MS = 24 * 3600_000;

function offeredNow(
  p: { is_available?: boolean | null; runs_out_at?: string | null; updated_at?: string | null }
    | null | undefined
): boolean {
  if (!stillLive(p)) return false;
  if (!p?.updated_at) return false;
  const age = Date.now() - new Date(p.updated_at).getTime();
  return age >= 0 && age < FRESH_MS;
}

// Anbar districts with a rough centre each. Duplicated from lib/cities.ts
// because an Edge Function cannot import from the Next app; the list is
// administrative geography and does not change.
const CITIES: Record<string, [number, number]> = {
  'الرمادي': [33.4258, 43.3012],
  'الفلوجة': [33.3556, 43.7864],
  'هيت': [33.6383, 42.8258],
  'حديثة': [34.1372, 42.3789],
  'عانة': [34.3725, 41.9859],
  'راوة': [34.4833, 41.9237],
  'القائم': [34.39577, 40.99437],
  'الرطبة': [33.0386, 40.2864],
  'الحبانية': [33.3628, 43.5586],
  'الخالدية': [33.3789, 43.4881],
  'عامرية الفلوجة': [33.16347, 43.86422],
  'الكرمة': [33.40494, 43.91423],
  'البغدادي': [33.85175, 42.54918],
  'الحقلانية': [34.0575, 42.3792],
  'بروانة': [34.09579, 42.38882],
  'النخيب': [32.0369, 42.2506],
  'كبيسة': [33.5941, 42.6185],
  'المحمدي': [33.5509, 42.9011],
  'الصقلاوية': [33.3964, 43.6833],
  'حصيبة الشرقية': [33.4207, 43.4533],
  'الرحالية': [32.7658, 43.3911],
  'العبيدي': [34.4281, 41.2173],
  'الكرابلة': [34.3909, 41.0464],
  'الرمانة': [34.3931, 41.078],
  'عكاشات': [33.6675, 39.967],
  'الوليد': [33.4328, 38.9321],
  'الوفاء': [33.3975, 42.8531],
};

// ---------- Telegram helpers ----------

type Json = Record<string, unknown>;

async function call(method: string, body: Json): Promise<Response> {
  const post = (b: Json) =>
    fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });

  const res = await post(body);
  if (res.ok) return res;

  const why = await res.text();
  console.error(method, res.status, why);

  // **وسمٌ لم يُهرَّب لا يُسقط الردَّ كلَّه.**
  //
  // كلُّ رسائل البوت تُرسَل بـ parse_mode: 'HTML'، فاسمُ محطةٍ فيه «<» يجعل
  // تلغرام يردّ 400 «can't parse entities» — وكان الخطأُ يُبتلع في السجلّ
  // فلا يصل السائقَ شيءٌ إطلاقاً، ولا يعرف أحدٌ لماذا. فيُعاد الإرسالُ نصّاً
  // خاماً: وسومٌ ضائعةٌ أهونُ من رسالةٍ ضائعة.
  const b = body as Record<string, unknown>;
  if (res.status === 400 && b.parse_mode && /parse|entit/i.test(why)) {
    const { parse_mode: _drop, ...plain } = b;
    return post(plain as Json);
  }
  return res;
}

const send = (chat_id: number, text: string, extra: Json = {}) =>
  call('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

const edit = (chat_id: number, message_id: number, text: string, extra: Json = {}) =>
  call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra });

const answer = (id: string, text?: string) =>
  call('answerCallbackQuery', { callback_query_id: id, text });

// ---------- Opening hours (Baghdad clock) ----------

function isOpenNow(s: {
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed?: boolean | null;
}): boolean {
  // الإغلاق المؤقّت أولاً — وكان مفقوداً هنا وحده.
  //
  // هذه رابع نسخة من قاعدة الدوام في المستودع (القاعدة، و lib/hours.ts،
  // و owner-daily، وهذه)، وهي الوحيدة التي كانت تجهل temp_closed. فمحطةٌ
  // أغلقها صاحبها مؤقتاً من الويب تُعرض في البوت «مفتوحة الآن» وتظهر في
  // «المتوفر الآن». والانحراف موثَّق في notify/index.ts نفسها.
  //
  // والقاعدة الأصل station_open_now موجودة في القاعدة — لكن نداءها لكل
  // محطة في قائمةٍ يعني رحلةً لكل صفّ. فتُصلَح النسخة هنا وتُذكَر أصلها.
  if (s.temp_closed) return false;
  if (s.is_24h) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const now =
    Number(parts.find((p) => p.type === 'hour')?.value ?? 0) * 60 +
    Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const open = toMin(s.opens_at);
  const close = toMin(s.closes_at);
  return close > open ? now >= open && now < close : now >= open || now < close;
}

// ---------- Screens ----------

// Flip to '0' at launch to expose the full driver menu.
const PRE_LAUNCH = (Deno.env.get('PRE_LAUNCH') ?? '1') === '1';

/** True once this Telegram account is tied to a station. Drives whether the
 *  menu offers "manage mine" or "add mine" — offering management to someone
 *  with no station is a dead end that reads as a broken bot. */
async function hasStation(telegramId: number): Promise<boolean> {
  const { data } = await db
    .from('telegram_links')
    .select('station_id')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return Boolean(data);
}

async function pendingCount(): Promise<number> {
  const { count } = await db
    .from('stations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

async function mainMenu(userId: number) {
  const owner = await hasStation(userId);
  // «➕ أضف محطتي» reads as "sign me up" to someone who came for alerts, and it
  // sat as one of only three buttons with nothing here offering notifications
  // at all. The question goes first so the button sorts its own audience.
  const mine = owner
    ? { text: '🏪 إدارة محطتي', callback_data: 'manage' }
    : { text: '🏪 صاحب محطة؟ سجّل محطتك', callback_data: 'addst' };

  // The citizen's door, missing entirely until now: the bot had no city+fuel
  // flow, so the only plausible-looking action was registering a station.
  // Links to the same screen the site uses rather than rebuilding the picker
  // inside the bot.
  const alerts = { text: '🔔 نبّهني عند توفّر الوقود', url: `${SITE}/alerts` };

  // Before launch there is nothing for a user to search — every station list
  // would come back empty and read as a broken bot. Show the things that
  // are genuinely useful now instead.
  if (PRE_LAUNCH && !isAdmin(userId)) {
    return {
      inline_keyboard: [
        [alerts],
        [{ text: '🔔 ثبّت نغمة التنبيه', callback_data: 'tone' }],
        [mine],
        [{ text: '🌐 فتح الموقع', url: SITE }],
      ],
    };
  }

  const rows = [
    [alerts],
    [{ text: '📍 المحطات القريبة مني', callback_data: 'nearby' }],
    [{ text: '⛽ ابحث حسب نوع الوقود', callback_data: 'products' }],
    [{ text: '⭐ محطاتي المفضلة', callback_data: 'favs' }],
    [{ text: '🔔 نغمة التنبيه المخصصة', callback_data: 'tone' }],
    [mine],
    [{ text: '🌐 فتح الموقع', url: SITE }],
  ];
  if (isAdmin(userId)) {
    const n = await pendingCount();
    // Anchored to the row it must sit above rather than to a hard-coded index:
    // the numbers here were 5/6/7 for a six-row menu, so adding one row at the
    // top silently moved all three admin buttons somewhere else.
    const before = rows.findIndex((r) => r[0] === mine);
    rows.splice(before < 0 ? rows.length : before, 0,
      [{ text: '➕ أضِف إلى جدول اليوم', callback_data: 'addsched' }],
      [{ text: '🛠 تحكّم بجدول اليوم', callback_data: 'bd' }],
      [{ text: `📋 طلبات المحطات (${n})`, callback_data: 'req' }],
      [{ text: '🏬 المحطات المسجلة', callback_data: 'people' }],
      [{ text: '🛡 لوحة الإدارة', callback_data: 'admin' }],
    );
  }
  return { inline_keyboard: rows };
}

const PRE_LAUNCH_WELCOME =
  '<b>المحطة التقنية</b>\nمنصة وقود الأنبار\n\n' +
  '🚀 <b>ننطلق قريباً</b>\n\n' +
  'سنعلن لك <b>هنا مباشرة</b> فور انطلاق المنصة — لا حاجة لمتابعة أي شيء.\n\n' +
  'كل ما عليك الآن:\n' +
  '① ثبّت نغمة التنبيه من الزر أدناه\n' +
  '② تأكد أن إشعارات هذه المحادثة <b>غير مكتومة</b>\n\n' +
  'وقتها سيصلك تنبيه فور توفر الوقود قرب موقعك.\n\n' +
  '🏪 صاحب محطة؟ سجّلها الآن لتظهر للمستخدمين من أول يوم.';

const welcomeFor = (userId: number) =>
  PRE_LAUNCH && !isAdmin(userId) ? PRE_LAUNCH_WELCOME : WELCOME;

// ---------- Favourites ----------

async function showFavourites(chat: number, userId: number, messageId?: number) {
  const { data: favs } = await db
    .from('telegram_favorites')
    .select('station_id, stations(name, city)')
    .eq('telegram_id', userId);

  const rows = (favs ?? []).map((f) => {
    const s = f.stations as unknown as { name: string; city: string };
    return [{ text: `⭐ ${s.name} — ${s.city}`, callback_data: `f-:${f.station_id}` }];
  });

  const text = rows.length
    ? '⭐ <b>محطاتك المفضلة</b>\n\n' +
      'يصلك تنبيه فور توفر وقود جديد في أي منها.\n' +
      'اضغط على محطة لإزالتها من المفضلة.'
    : '⭐ <b>محطاتك المفضلة</b>\n\n' +
      'لم تضف أي محطة بعد.\n\n' +
      'ابحث عن محطة بالاسم أو عبر «المحطات القريبة»، ثم اضغط زر الإضافة للمفضلة.';

  const markup = {
    inline_keyboard: [...rows, [{ text: '🏠 القائمة', callback_data: 'menu' }]],
  };
  if (messageId) await edit(chat, messageId, text, { reply_markup: markup });
  else await send(chat, text, { reply_markup: markup });
}

async function addFavourite(
  chat: number,
  userId: number,
  stationId: string,
  queryId: string
) {
  const { data: station } = await db
    .from('stations')
    .select('name')
    .eq('id', stationId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!station) {
    await answer(queryId, 'المحطة غير متاحة');
    return;
  }

  await db
    .from('telegram_favorites')
    .upsert({ telegram_id: userId, chat_id: chat, station_id: stationId });

  await answer(queryId, `أضيفت ${station.name} للمفضلة ⭐`);
}

async function removeFavourite(
  chat: number,
  messageId: number,
  userId: number,
  stationId: string,
  queryId: string
) {
  await db
    .from('telegram_favorites')
    .delete()
    .eq('telegram_id', userId)
    .eq('station_id', stationId);
  await answer(queryId, 'أزيلت من المفضلة');
  await showFavourites(chat, userId, messageId);
}

// ---------- Custom notification tone ----------

async function showTone(chat: number) {
  // Telegram accepts custom chat tones up to 5s / 300KB; both files fit,
  // so they can be saved straight from this chat.
  for (const [n, title] of [
    ['1', 'المحطة التقنية — نغمة ١ (حادّة)'],
    ['2', 'المحطة التقنية — نغمة ٢ (واضحة)'],
    ['3', 'المحطة التقنية — نغمة ٣ (هادئة)'],
  ]) {
    await call('sendAudio', {
      chat_id: chat,
      audio: `${SITE}/sounds/alert-${n}.mp3`,
      title,
      performer: 'المحطة التقنية',
      caption: title,
    });
  }

  await send(
    chat,
    '🔔 <b>خطوتان حتى يصلك التنبيه بصوت مميّز</b>\n\n' +
      '<b>١. احفظ النغمة</b>\n\n' +
      '<b>📱 أندرويد</b>\n' +
      '• اضغط مطولاً على المقطع أعلاه\n' +
      '• اختر «حفظ للإشعارات» أو <i>Save for Notifications</i>\n\n' +
      '<b>🍎 آيفون</b>\n' +
      '• اضغط مطولاً على المقطع أعلاه\n' +
      '• اختر «حفظ للإشعارات» مباشرة — التحديثات الأخيرة من تيليجرام تدعمها\n' +
      '• إن لم يظهر الخيار: الإعدادات ← الإشعارات والأصوات ← تحميل صوت\n\n' +
      '<b>٢. فعّلها لهذه المحادثة</b>\n' +
      '• اضغط على اسم البوت في الأعلى\n' +
      '• الإشعارات ← الصوت ← اختر «المحطة التقنية»\n\n' +
      '⚠️ <b>مهم:</b> تأكد أن الإشعارات <b>غير مكتومة</b> لهذه المحادثة، وإلا لن يصلك أي صوت.\n\n' +
      '💡 بهذا تميّز تنبيه الوقود عن باقي رسائلك من أول ثانية.',
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🏠 القائمة', callback_data: 'menu' }]],
      },
    }
  );
}

async function showAdmin(chat: number, userId: number, messageId?: number) {
  if (!isAdmin(userId)) return;

  const [{ count: pending }, { count: approved }] = await Promise.all([
    db.from('stations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('stations').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
  ]);

  const text =
    '🛡 <b>لوحة الإدارة</b>\n\n' +
    `طلبات معلّقة: <b>${pending ?? 0}</b>\n` +
    `محطات معتمدة: <b>${approved ?? 0}</b>`;

  const markup = {
    inline_keyboard: [
      [{ text: '🏪 تسجيل محطة', callback_data: 'addst' }],
      [{ text: `📋 مراجعة الطلبات (${pending ?? 0})`, callback_data: 'req' }],
      [{ text: '🏬 المحطات المسجلة', callback_data: 'people' }],
      [{ text: '🏠 القائمة', callback_data: 'menu' }],
    ],
  };
  if (messageId) await edit(chat, messageId, text, { reply_markup: markup });
  else await send(chat, text, { reply_markup: markup });
}

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ بانتظار الموافقة',
  approved: '✅ معتمدة',
  rejected: '❌ مرفوضة',
};

/** Who has registered so far — the contact behind each station, not just the
 *  station name, so the admin can call them directly. */
async function showPeople(chat: number, userId: number, messageId: number) {
  if (!isAdmin(userId)) return;

  const { data } = await db
    .from('stations')
    .select('name, city, phone, contact_name, status, created_at')
    // A rejected request is a decision already made. Leaving them in the list
    // buried the stations that still need something from the admin, and put a
    // «راسل» button beside people there is nothing left to say to.
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!data?.length) {
    await edit(chat, messageId, '🏬 لا توجد محطات مسجلة بعد.', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ رجوع', callback_data: 'admin' }]] },
    });
    return;
  }

  const lines = data.map((s, i) => {
    const when = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(s.created_at));
    return (
      `${i + 1}. <b>${esc(s.name)}</b> — ${esc(s.city)}\n` +
      `   👤 ${esc(s.contact_name || 'غير محدد')}\n` +
      `   ☎️ <code>${s.phone}</code>\n` +
      `   ${STATUS_LABELS[s.status] ?? s.status} · ${when}`
    );
  });

  // The WhatsApp links live in buttons, not in the text, and that is not a
  // style choice. Each wa.me link is ~336 characters once the Arabic greeting
  // is percent-encoded, so thirteen stations alone pushed this message past
  // Telegram's 4096-character ceiling — and the old blind slice(0, 3900) then
  // cut through an open tag, so Telegram rejected the whole thing with a 400
  // and the button simply appeared dead. Button URLs do not count against the
  // text limit at all.
  const header = `🏬 <b>المحطات المسجلة</b> (${data.length})`;
  // whole entries only: never leave a tag half-written
  const kept: number[] = [];
  let used = header.length + 2;
  for (let i = 0; i < lines.length; i++) {
    if (used + lines[i].length + 2 > 3600) break;
    used += lines[i].length + 2;
    kept.push(i);
  }
  let text = header + '\n\n' + kept.map((i) => lines[i]).join('\n\n');
  if (kept.length < lines.length)
    text += `\n\n… و${lines.length - kept.length} أخرى، افتحها من لوحة الموقع`;

  const waRows = kept
    .map((i) => ({ s: data[i], url: waLink(data[i].phone, data[i].contact_name) }))
    // a station with no usable number would give <a href=""> — a 400 in the
    // text version, and a button Telegram refuses to render in this one
    .filter((r) => r.url)
    .map((r) => {
      // A row of bare personal names does not say who is who. The station is
      // the thing the admin recognises, so it rides along — and the person's
      // name is what gets kept whole when the two do not fit.
      const who = r.s.contact_name || 'المسؤول';
      const room = 56 - who.length;
      const where = room > 6 ? ` · ${r.s.name.trim().slice(0, room)}` : '';
      return [{ text: `💬 ${who}${where}`, url: r.url }];
    });

  await edit(chat, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        ...waRows,
        [{ text: '🔄 تحديث', callback_data: 'people' }],
        [{ text: '⬅️ رجوع', callback_data: 'admin' }],
      ],
    },
  });
}

/** The queue: every pending request at once, as a list to choose from.
 *
 *  It used to fetch limit(1) and show that one request with approve/reject —
 *  so five registrations for the same station meant deciding on the first
 *  before the second could even be seen. But the decision on any one of them
 *  depends on the others: which of five «الرحاب» rows is the real owner is a
 *  question you answer by looking at all five. */
async function showRequests(chat: number, userId: number, messageId: number) {
  if (!isAdmin(userId)) return;

  const { data: list } = await db
    .from('stations')
    .select('id, name, city, created_at')
    .eq('status', 'pending')
    .order('created_at')
    .limit(30);

  if (!list?.length) {
    await edit(chat, messageId, '✅ لا توجد طلبات معلّقة.', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ رجوع', callback_data: 'admin' }]] },
    });
    return;
  }

  await edit(
    chat,
    messageId,
    `📋 <b>الطلبات المعلّقة (${list.length})</b>` + NL + NL +
      'اختر طلباً لمراجعته. لا شيء يُحسم قبل أن تختاره.',
    {
      reply_markup: {
        inline_keyboard: [
          ...list.map((st) => [
            { text: `${st.name} — ${st.city}`.slice(0, 60), callback_data: `rq:${st.id}` },
          ]),
          [{ text: '⬅️ رجوع', callback_data: 'admin' }],
        ],
      },
    }
  );
}

/** One request, opened from the queue. */
async function showRequest(chat: number, userId: number, messageId: number, id: string) {
  if (!isAdmin(userId)) return;

  const { data } = await db
    .from('stations')
    .select('id, name, city, address, phone, contact_name, kind')
    .eq('id', id)
    .eq('status', 'pending')
    .limit(1);

  const station = data?.[0];
  if (!station) {
    await edit(chat, messageId, 'هذا الطلب لم يعد معلّقاً.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 الطلبات', callback_data: 'req' }]] },
    });
    return;
  }

  await edit(
    chat,
    messageId,
    `📋 <b>طلب تسجيل</b>\n\n` +
      `<b>${esc(station.name)}</b>\n` +
      `${esc(station.city)} — ${esc(station.address)}\n` +
      `☎️ ${station.phone}\n` +
      `المسؤول: ${esc(station.contact_name || 'غير محدد')}`,
    {
      reply_markup: {
        inline_keyboard: [
          // The number is right there; reaching the person should not mean
          // copying it into another app and retyping the same opening line.
          ...(waLink(station.phone, station.contact_name)
            ? [
                [
                  {
                    text: `💬 راسل ${station.contact_name || 'المسؤول'}`.slice(0, 40),
                    url: waLink(station.phone, station.contact_name),
                  },
                ],
              ]
            : []),
          [
            { text: '✅ موافقة', callback_data: `ok:${station.id}` },
            { text: '❌ رفض', callback_data: `no:${station.id}` },
          ],
          // Between approving a wrong name and rejecting a real station there
          // was nothing. A registration typed in a hurry is not a bad
          // registration, and rejecting it costs a station the platform wants.
          [{ text: '✏️ تعديل الاسم', callback_data: `rn:${station.id}` }],
          [{ text: '⬅️ باقي الطلبات', callback_data: 'req' }],
        ],
      },
    }
  );
}

async function decideStation(
  chat: number,
  messageId: number,
  userId: number,
  stationId: string,
  status: 'approved' | 'rejected',
  queryId: string
) {
  if (!isAdmin(userId)) {
    await answer(queryId, 'غير مصرّح');
    return;
  }
  await db.from('stations').update({ status }).eq('id', stationId);
  await answer(queryId, status === 'approved' ? 'تمت الموافقة ✅' : 'تم الرفض ❌');
  await showRequests(chat, userId, messageId);
}

// ---------- Register a station, one question at a time ----------

// The half-finished answer has to survive between two webhook calls, so it
// lives in telegram_drafts (service-role only, RLS on with no policies). An
// earlier version kept it inside the bot's own message to avoid the table —
// that worked, but it forced a running summary onto every prompt, and the
// prompts are the whole experience here. One row per admin is cheaper.
type Draft = {
  province?: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  name?: string;
  phone?: string;
  contact?: string;
  contact_phone?: string;
  // جدولُ الغد يركب آلةَ المسوّدات نفسَها: منشورٌ مقروءٌ ينتظر «انشر».
  sched?: {
    product: string;
    lines: ScheduleLine[];
    for_date?: string;
    /** حقلٌ ينتظر نصّاً بعد ضغطة زرّ — الاسمُ أو المنطقةُ إن لم تكن في القائمة.
     *  ويُعنوَن بمفتاح السطر لا بموضعه: المواضعُ تزحف بالحذف. */
    edit?: { key: string; field: 'name' | 'city' };
  };
};

const PROVINCES = ['الأنبار'];
const SAME_PHONE = '📞 نفس رقم المحطة';
const SKIP_LOCATION = '⏭ تخطّي الموقع';
const CANCEL_ROW = [{ text: '✖️ إلغاء', callback_data: 'wx' }];

async function getDraft(telegramId: number): Promise<{ step: string; data: Draft } | null> {
  const { data } = await db
    .from('telegram_drafts')
    .select('step, data')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return data ? { step: data.step, data: (data.data ?? {}) as Draft } : null;
}

const saveDraft = (telegramId: number, chat: number, step: string, data: Draft) =>
  db.from('telegram_drafts').upsert(
    { telegram_id: telegramId, chat_id: chat, step, data, updated_at: new Date().toISOString() },
    { onConflict: 'telegram_id' }
  );

const clearDraft = (telegramId: number) =>
  db.from('telegram_drafts').delete().eq('telegram_id', telegramId);

const twoColumn = (items: string[], prefix: string) => {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map((t, j) => ({ text: t, callback_data: `${prefix}${i + j}` })));
  }
  return rows;
};

/** Asks whatever `step` calls for. Nothing about the draft is printed — the
 *  admin only ever sees the current question. */
async function ask(chat: number, step: string, d: Draft) {
  switch (step) {
    case 'province':
      // an owner who registered on the site has no link yet, so the menu shows
      // them "add mine" — give them the way back instead of a second station
      return void (await send(chat,
        '🏪 <b>تسجيل محطة</b>\n\n' +
        '⚠️ هذا لأصحاب المحطات. إن كنت تريد أن يصلك إشعار عند توفّر الوقود ' +
        `فلا تسجّل هنا — اختر مدينتك ونوع وقودك من ${SITE}/alerts\n\n` +
        'اختر المحافظة:', {
        reply_markup: {
          inline_keyboard: [
            ...twoColumn(PROVINCES, 'wp:'),
            [{ text: '🔗 محطتي مسجّلة — اربط رقمي', callback_data: 'manage' }],
            CANCEL_ROW,
          ],
        },
      }));

    case 'city':
      return void (await send(chat, 'اختر المدينة:', {
        reply_markup: { inline_keyboard: [...twoColumn(Object.keys(CITIES), 'wc:'), CANCEL_ROW] },
      }));

    case 'address':
      return void (await send(
        chat,
        'اكتب عنوان المحطة — <b>المنطقة والشارع</b>:\n<i>مثال: حي التأميم — شارع السيراميك</i>',
        { reply_markup: { inline_keyboard: [CANCEL_ROW] } }
      ));

    case 'location':
      return void (await send(
        chat,
        'شارك موقع المحطة إن كنت فيها الآن، أو اختره من الخريطة.\n' +
          '<i>الدبوس هو ما يقود المستخدم إليك.</i>',
        {
          reply_markup: {
            keyboard: [[{ text: '📍 مشاركة الموقع', request_location: true }], [{ text: SKIP_LOCATION }]],
            resize_keyboard: true,
          },
        }
      ));

    case 'name':
      return void (await send(chat, 'أرسل اسم المحطة:\n<i>مثال: محطة الرمادي المركزية</i>', {
        reply_markup: { remove_keyboard: true },
      }));

    case 'phone':
      return void (await send(
        chat,
        'أرسل رقم هاتف المحطة:\n<i>سيتصل عليه المواطنون، فاكتب الرقم المخصص للمحطة.</i>\n' +
          '<i>مثال: 07901234567</i>'
      ));

    case 'contact':
      return void (await send(chat, 'أرسل اسم الشخص المسؤول عن تحديث حالة الوقود:'));

    case 'contact_phone':
      return void (await send(chat, 'أرسل رقم هاتف المسؤول، أو اضغط الزر إن كان نفسه رقم المحطة:', {
        reply_markup: { keyboard: [[{ text: SAME_PHONE }]], resize_keyboard: true },
      }));

    case 'confirm':
      return void (await send(
        chat,
        '<b>راجع البيانات</b>\n\n' +
          `المحطة: ${d.name}\n` +
          `${d.province} — ${d.city}\n` +
          `العنوان: ${d.address}\n` +
          `📍 ${d.lat ? 'موقع محدّد' : `مركز ${d.city} (يُصحّح لاحقاً)`}\n` +
          `☎️ ${d.phone}\n` +
          `المسؤول: ${d.contact} — ${d.contact_phone}`,
        {
          reply_markup: {
            keyboard: [[{ text: '✅ تقديم الطلب' }, { text: '✖️ إلغاء' }]],
            resize_keyboard: true,
          },
        }
      ));
  }
}

async function advance(chat: number, telegramId: number, step: string, d: Draft) {
  await saveDraft(telegramId, chat, step, d);
  await ask(chat, step, d);
}

// Open to everyone: an owner whose number did not match needs a way in, and
// the web form is a harder ask than five taps. Admin submissions land approved,
// everyone else's land pending — same rule as the site.
async function startWizard(chat: number, userId: number) {
  await advance(chat, userId, 'province', {});
}

async function cancelWizard(chat: number, userId: number) {
  await clearDraft(userId);
  await send(chat, 'أُلغي التسجيل.', { reply_markup: { remove_keyboard: true } });
  await send(chat, welcomeFor(userId), { reply_markup: await mainMenu(userId) });
}

/** Every typed message from an admin mid-registration belongs to the open
 *  step — no reply-to or format for them to get wrong. */
async function wizardText(chat: number, userId: number, step: string, d: Draft, raw: string) {
  const v = raw.trim();
  const reject = (why: string) => send(chat, `⚠️ ${why}`);

  switch (step) {
    case 'address':
      if (v.length < 4) return void (await reject('العنوان قصير جداً. اكتبه بوضوح.'));
      d.address = v;
      return void (await advance(chat, userId, 'location', d));

    case 'location':
      if (v !== SKIP_LOCATION) return void (await reject('شارك الموقع من الزر، أو اضغط تخطّي.'));
      return void (await advance(chat, userId, 'name', d));

    case 'name':
      if (v.length < 3) return void (await reject('اسم المحطة قصير جداً.'));
      d.name = v;
      return void (await advance(chat, userId, 'phone', d));

    case 'phone':
      if (!/^7\d{9}$/.test(phoneCore(v)))
        return void (await reject('رقم غير صحيح. اكتبه هكذا: 07901234567'));
      d.phone = `0${phoneCore(v)}`;
      return void (await advance(chat, userId, 'contact', d));

    case 'contact':
      if (v.length < 3) return void (await reject('اسم المسؤول قصير جداً.'));
      d.contact = v;
      return void (await advance(chat, userId, 'contact_phone', d));

    case 'contact_phone': {
      if (v === SAME_PHONE) d.contact_phone = d.phone;
      else {
        if (!/^7\d{9}$/.test(phoneCore(v)))
          return void (await reject('رقم غير صحيح. اكتبه هكذا: 07901234567'));
        d.contact_phone = `0${phoneCore(v)}`;
      }
      return void (await advance(chat, userId, 'confirm', d));
    }

    case 'confirm':
      if (v.startsWith('✖️')) return void (await cancelWizard(chat, userId));
      if (v.startsWith('✅')) return void (await createStation(chat, userId, d));
      return void (await reject('اضغط «تقديم الطلب» أو «إلغاء».'));

    // Renaming rides the same draft mechanism as registration, so an admin
    // mid-rename has the next thing they type captured — exactly as the
    // registration wizard already does. A parallel path would have been a
    // second place for a half-finished edit to get lost.
    case 'rename': {
      if (v.length < 3) return void (await reject('الاسم قصير جداً.'));
      const id = d.rename_id;
      if (!id) {
        await clearDraft(userId);
        return void (await reject('انتهت الجلسة. أعد /rename.'));
      }
      const { error } = await db.from('stations').update({ name: v }).eq('id', id);
      await clearDraft(userId);
      if (error) return void (await reject(`تعذّر الحفظ: ${error.message}`));

      // The site is a static export: without a rebuild the station's own page
      // keeps the old name. Failure is reported, not swallowed.
      let built = true;
      try {
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rebuild`, {
          method: 'POST',
          headers: { 'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '' },
        });
        built = r.ok;
      } catch {
        built = false;
      }
      // Straight back to the pending queue: the admin renamed in order to
      // approve, so making them go and find the request again would be a step
      // invented by the software, not by the task.
      const { data: still } = await db
        .from('stations').select('status').eq('id', id).maybeSingle();
      const backToQueue = still?.status === 'pending';

      return void (await send(
        chat,
        `✅ صار الاسم: <b>${v}</b>` + NL +
          (built
            ? 'ويُحدَّث على الموقع خلال دقيقتين.'
            : '⚠️ لكن تحديث الموقع فشل — الصفحة تحمل الاسم القديم حتى البناء التالي.') +
          NL + NL + 'الرابط لم يتغيّر، فما شاركه صاحب المحطة يظلّ يعمل.',
        backToQueue
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: '📋 عودة إلى الطلبات', callback_data: 'req' }]],
              },
            }
          : { reply_markup: await mainMenu(userId) }
      ));
    }

    default:
      return void (await reject('اختر من الأزرار أعلاه.'));
  }
}

async function wizardChoice(
  chat: number,
  userId: number,
  kind: 'wp' | 'wc',
  index: number,
  queryId: string
) {
  const draft = await getDraft(userId);
  if (!draft) return void (await answer(queryId, 'انتهت الجلسة. ابدأ من جديد.'));

  if (kind === 'wp') {
    const p = PROVINCES[index];
    if (!p) return void (await answer(queryId, 'غير معروفة'));
    draft.data.province = p;
    await answer(queryId, p);
    return void (await advance(chat, userId, 'city', draft.data));
  }

  const city = Object.keys(CITIES)[index];
  if (!city) return void (await answer(queryId, 'غير معروفة'));
  draft.data.city = city;
  await answer(queryId, city);
  await advance(chat, userId, 'address', draft.data);
}


/** 07XXXXXXXXX / +9647XXXXXXXXX / 9647… all reduce to 7XXXXXXXXX. */
function phoneCore(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^00/, '');
  return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '');
}

/** Creates the owner login if the phone is new, or reuses the existing one so
 *  a second station for the same owner does not fail on a duplicate email. */
async function ownerFor(core: string): Promise<{ id: string; password: string | null } | null> {
  const email = `p${core}@muhta.app`;
  // كانت `muhta${core.slice(-4)}` — أي مشتقّةً من الرقم المعلَن نفسِه، واسمُ
  // الدخول ذلك الرقم. فمن قرأه دخل. انظر `_shared/password.ts`.
  const password = newPassword();

  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) return { id: created.user.id, password };

  // already registered — find the id instead of failing the whole insert
  if (error?.message?.includes('already') || error?.status === 422) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email === email);
    if (found) return { id: found.id, password: null };
  }
  console.error('ownerFor', error);
  return null;
}

// Nothing registered here goes live on its own, not even an admin's own entry:
// registering and approving are two decisions, and collapsing them meant a
// station reached drivers before anyone had looked at it. Admins get a
// one-tap approve button on the result instead.
async function createStation(chat: number, userId: number, d: Draft) {
  const { name, address, city, contact } = d as Required<Pick<Draft, 'name' | 'address' | 'city' | 'contact'>>;
  const core = phoneCore(d.phone ?? '');
  const centre = CITIES[city];

  await send(chat, '⏳ جارٍ تقديم الطلب…', { reply_markup: { remove_keyboard: true } });

  // The login belongs to the station phone, not the contact's: the phone the
  // public calls is the one the owner will remember as their username.
  const owner = await ownerFor(core);
  if (!owner) {
    await send(chat, '❌ تعذّر إنشاء حساب صاحب المحطة. حاول مجدداً.');
    return;
  }

  const { data: station, error } = await db
    .from('stations')
    .insert({
      owner_id: owner.id,
      name,
      address,
      city,
      contact_name: d.contact_phone && d.contact_phone !== d.phone ? `${contact} — ${d.contact_phone}` : contact,
      phone: `0${core}`,
      lat: d.lat ?? centre[0],
      lng: d.lng ?? centre[1],
      status: 'pending',
    })
    .select('id, name')
    .single();

  if (error || !station) {
    console.error('addStation', error);
    await send(chat, '❌ تعذّر حفظ المحطة. تحقق أن الاسم غير مكرر وحاول مجدداً.');
    return;
  }

  await db
    .from('station_products')
    .insert(PRODUCTS.map((product) => ({ station_id: station.id, product })));

  await clearDraft(userId);

  const credentials = owner.password
    ? `🔑 <b>دخول صاحب المحطة</b>\n` +
      `المستخدم: <code>0${core}</code>\n` +
      `كلمة المرور: <code>${owner.password}</code>\n\n` +
      `يدخل بها إلى ${SITE}/login — أو يدير محطته من هذا البوت بمشاركة رقمه من «إدارة محطتي».`
    : `🔑 هذا الرقم له حساب سابق على المنصة — يدخل بكلمة مروره المعروفة.`;

  const rows = isAdmin(userId)
    ? [
        [{ text: '✅ اعتماد المحطة الآن', callback_data: `ok1:${station.id}` }],
        [{ text: '🏛 اجعلها حكومية', callback_data: `gov:${station.id}` }],
        [{ text: '🏪 تسجيل محطة أخرى', callback_data: 'addst' }],
        [{ text: '🛡 لوحة الإدارة', callback_data: 'admin' }],
      ]
    : [[{ text: '🏠 القائمة', callback_data: 'menu' }]];

  await send(
    chat,
    `✅ <b>تم تقديم الطلب</b>\n\n` +
      `<b>${name}</b>\n${city} — ${address}\n☎️ <code>0${core}</code>\n` +
      '⏳ بانتظار الموافقة — تظهر للمستخدمين فور اعتمادها.\n\n' +
      (d.lat ? '' : `📍 الموقع على مركز ${city} — أرسل موقع المحطة الآن لتصحيح الدبوس.\n\n`) +
      credentials,
    { reply_markup: { inline_keyboard: rows } }
  );

  // whoever registered it should not have to prove the number again later
  await db
    .from('telegram_links')
    .upsert({ telegram_id: userId, station_id: station.id, phone: core }, { onConflict: 'telegram_id' });
}

/** Approve straight from the result card, without walking the request queue. */
async function approveOne(chat: number, userId: number, stationId: string, queryId: string) {
  if (!isAdmin(userId)) return void (await answer(queryId, 'غير مصرّح'));
  const { data } = await db
    .from('stations')
    .update({ status: 'approved' })
    .eq('id', stationId)
    .select('name')
    .single();
  await answer(queryId, 'تمت الموافقة ✅');
  await send(chat, `✅ <b>${data?.name ?? 'المحطة'}</b> معتمدة وظاهرة للمستخدمين الآن.`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⛽ حدّد المتوفر', callback_data: `r:${stationId}` }],
        [{ text: '🏪 تسجيل محطة أخرى', callback_data: 'addst' }],
      ],
    },
  });
}

/** An admin sharing a location right after adding a station means "this is
 *  where it is". Matched by recency plus coords still sitting exactly on the
 *  city centre, so a location sent at any other time still means "find me
 *  nearby stations". ponytail: 20-minute window; tighten only if two admins
 *  start adding stations at the same moment. */
async function pinLastStation(chat: number, lat: number, lng: number): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: recent } = await db
    .from('stations')
    .select('id, name, city, lat, lng')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);

  const target = (recent ?? []).find((s) => {
    const c = CITIES[s.city];
    return c && Math.abs(s.lat - c[0]) < 1e-6 && Math.abs(s.lng - c[1]) < 1e-6;
  });
  if (!target) return false;

  await db.from('stations').update({ lat, lng }).eq('id', target.id);
  await send(chat, `📍 ثُبّت موقع <b>${target.name}</b> على النقطة التي أرسلتها.`, {
    reply_markup: { remove_keyboard: true },
  });
  return true;
}

// Sent by /announceall to everyone who has ever opened the bot.
const PUBLIC_ANNOUNCEMENT = [
  '⛽ <b>المحطة التقنية — التسجيل مفتوح</b>',
  '',
  'نستقبل الآن تسجيل محطات الوقود في جميع مدن الأنبار، <b>مجاناً بلا رسوم ولا عمولة</b>.',
  '',
  'محطتك تظهر للمستخدمين مع ما يتوفر لديك من وقود، ويصلهم تنبيه فور وصول أي منتج.',
  '',
  '🏪 صاحب محطة؟ سجّلها من الزر أدناه.',
  `🚗 تبحث عن وقود؟ افتح ${SITE} لترى أقرب محطة فيها وقود الآن.`,
].join(String.fromCharCode(10));

// Sent to every admin by /announce, once, when the feature goes live.
const ANNOUNCEMENT =
  '🛡 <b>يمكنكم الآن تسجيل محطة من البوت مباشرة</b>\n\n' +
  'اضغط «لوحة الإدارة ← 🏪 تسجيل محطة»، أو أرسل <code>/station</code>.\n\n' +
  'يسألك البوت خطوة واحدة في كل مرة: المحافظة، المدينة، العنوان، الموقع، ' +
  'اسم المحطة، هاتفها، ثم المسؤول ورقمه.\n\n' +
  'ما تسجّلونه يُعتمد فوراً ويظهر للمستخدمين، ويُنشأ لصاحب المحطة حساب دخول ' +
  'وكلمة مرور تُسلَّم له.';

async function setGovernment(chat: number, userId: number, stationId: string, queryId: string) {
  if (!isAdmin(userId)) {
    await answer(queryId, 'غير مصرّح');
    return;
  }
  await db.from('stations').update({ kind: 'government' }).eq('id', stationId);
  await answer(queryId, 'صارت حكومية 🏛');
}

const WELCOME =
  '<b>المحطة التقنية</b>\nمنصة وقود الأنبار\n\n' +
  'اعرف أي محطة يتوفر فيها الوقود الآن، وحالة الازدحام، وأقرب محطة إليك.\n\n' +
  'اختر من الأزرار في الأسفل:';

function stationLine(s: {
  name: string;
  city: string;
  address: string;
  phone: string;
  slug?: string;
  distance_km?: number;
  products?: string[];
}) {
  const dist = s.distance_km !== undefined ? ` — ${s.distance_km.toFixed(1)} كم` : '';
  const items = s.products?.length
    ? s.products.map((p) => PRODUCT_LABELS[p] ?? p).join(' · ')
    : 'لا يوجد وقود متوفر';
  return (
    `<b>${s.name}</b>${dist}\n` +
    `${s.city} — ${s.address}\n` +
    `المتوفر: ${items}\n` +
    // Some owners publish their station but not their number. The bots run on
    // the service key, so no RLS or column grant protects them — the check has
    // to be here, explicitly.
    (s.phone ? `☎️ ${s.phone}` : '') +
    (s.slug ? `\n${SITE}/${s.slug}` : '')
  );
}

/** One station per message, so the favourite button can carry its id. */
async function sendStationCard(
  chat: number,
  s: { id: string; name: string; city: string; address: string; phone: string; slug?: string; distance_km?: number; products?: string[] }
) {
  await send(chat, stationLine(s), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⭐ تنبيهني عند توفر وقود', callback_data: `f+:${s.id}` }],
        ...(s.slug ? [[{ text: '🌐 صفحة المحطة', url: `${SITE}/${s.slug}` }]] : []),
      ],
    },
    disable_web_page_preview: true,
  });
}

async function showNearby(chat: number) {
  await send(
    chat,
    '📍 أرسل موقعك الحالي وسأخبرك بأقرب المحطات وما يتوفر فيها.\n\n' +
      'اضغط الزر في الأسفل — لن يُحفظ موقعك.',
    {
      reply_markup: {
        keyboard: [[{ text: '📍 إرسال موقعي', request_location: true }], [{ text: '⬅️ رجوع' }]],
        resize_keyboard: true,
      },
    }
  );
}

async function showProducts(chat: number, messageId?: number) {
  const { data: stations } = await db
    .from('stations')
    .select('id, is_24h, opens_at, closes_at, temp_closed, station_products(product, is_available, runs_out_at, updated_at)')
    .eq('status', 'approved');

  const counts = new Map<string, number>();
  for (const s of stations ?? []) {
    if (!isOpenNow(s as never)) continue;
    for (const p of (s as never as {
      station_products: { product: string; is_available: boolean; runs_out_at: string | null; updated_at: string | null }[];
    }).station_products) {
      if (offeredNow(p)) counts.set(p.product, (counts.get(p.product) ?? 0) + 1);
    }
  }

  const rows = PRODUCTS.filter((p) => (counts.get(p) ?? 0) > 0).map((p) => [
    { text: `${PRODUCT_LABELS[p]} — ${counts.get(p)} محطة`, callback_data: `p:${p}` },
  ]);

  const text = rows.length
    ? '⛽ <b>المتوفر الآن في المحطات المفتوحة</b>\n\nاختر النوع لعرض المحطات:'
    : '⛽ لا يتوفر أي منتج في المحطات المفتوحة حالياً.';

  const markup = { inline_keyboard: [...rows, [{ text: '⬅️ القائمة', callback_data: 'menu' }]] };
  if (messageId) await edit(chat, messageId, text, { reply_markup: markup });
  else await send(chat, text, { reply_markup: markup });
}

async function showStationsWithProduct(chat: number, messageId: number, product: string) {
  const { data } = await db
    .from('stations_public')
    .select('name, city, address, phone, slug, is_24h, opens_at, closes_at, temp_closed, station_products!inner(product, is_available, runs_out_at, updated_at)')
    .eq('status', 'approved')
    .eq('station_products.product', product)
    .eq('station_products.is_available', true);

  const open = (data ?? []).filter(
    (s) =>
      isOpenNow(s as never) &&
      (s as never as { station_products: { runs_out_at: string | null; updated_at: string | null }[] }).station_products.some(offeredNow)
  );
  const label = PRODUCT_LABELS[product] ?? product;

  const text = open.length
    ? `⛽ <b>${label}</b> متوفر في:\n\n` +
      open.map((s) => stationLine(s as never)).join('\n\n')
    : `لا توجد محطة مفتوحة يتوفر فيها ${label} حالياً.`;

  await edit(chat, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⬅️ أنواع الوقود', callback_data: 'products' }],
        [{ text: '🏠 القائمة', callback_data: 'menu' }],
      ],
    },
    disable_web_page_preview: true,
  });
}

// ---------- Owner management ----------

async function showManage(chat: number, telegramId: number) {
  const { data: link } = await db
    .from('telegram_links')
    .select('station_id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!link) {
    await send(
      chat,
      '🏪 <b>إدارة محطتك</b>\n\n' +
        'لتأكيد ملكيتك، شارك رقم هاتفك المسجّل في المنصة.\n' +
        'سيُطابق مع رقم المحطة ولن يُنشر لأحد.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📱 مشاركة رقمي للتحقق', request_contact: true }],
            [{ text: '⬅️ رجوع' }],
          ],
          resize_keyboard: true,
        },
      }
    );
    return;
  }
  await showOwnerPanel(chat, link.station_id);
}

async function showOwnerPanel(chat: number, stationId: string, messageId?: number) {
  const { data: station } = await db
    .from('stations')
    .select('name, is_24h, opens_at, closes_at, temp_closed')
    .eq('id', stationId)
    .single();

  const { data: rows } = await db
    .from('station_products')
    .select('product, is_available, expected_at, runs_out_at')
    .eq('station_id', stationId);

  // والمقياسُ هو المقياسُ العامّ: لولاه لرأى المالكُ ✅ بلا تحذير، ومحطتُه
  // قد اختفت من القائمة لأن موعدَ النفاد الذي ضبطه بنفسه قد مرّ.
  const byProduct = new Map((rows ?? []).map((r) => [r.product, stillLive(r)]));
  // القاعدة نفسها التي تُخفي البطاقة في التطبيق (hasSomethingToShow في
  // lib/products.ts): متوفرٌ الآن، أو متوقّعٌ لاحقاً. ومن لا هذا ولا ذاك
  // لا يظهر — ويجب أن يعلم، لا أن يكتشف.
  const shows = (rows ?? []).some((r) => stillLive(r) || r.expected_at);
  const open = station ? isOpenNow(station as never) : false;

  const keyboard = PRODUCTS.map((p) => [
    {
      text: `${byProduct.get(p) ? '✅' : '❌'} ${PRODUCT_LABELS[p]}`,
      callback_data: `t:${stationId}:${p}`,
    },
  ]);
  keyboard.push([{ text: '🔄 تحديث', callback_data: `r:${stationId}` }]);
  keyboard.push([{ text: '🏠 القائمة', callback_data: 'menu' }]);

  const text =
    `🏪 <b>${station?.name ?? 'محطتك'}</b>\n` +
    `الحالة: ${open ? 'مفتوحة الآن' : 'مغلقة الآن'}\n` +
    (shows
      ? ''
      : '\n⚠️ <b>محطتك لا تظهر في القائمة</b>\nلا منتج متوفراً ولا متوقَّعاً. أعلِن ما وصلك وتعود فوراً.\n') +
    '\nاضغط على أي منتج لتبديل حالته بين متوفر وغير متوفر:';

  if (messageId) await edit(chat, messageId, text, { reply_markup: { inline_keyboard: keyboard } });
  else await send(chat, text, { reply_markup: { inline_keyboard: keyboard } });
}

async function linkByContact(chat: number, telegramId: number, rawPhone: string) {
  // Iraqi numbers reach us as +9647…, 009647…, 07… — reduce to the 7XXXXXXXXX core
  const digits = rawPhone.replace(/\D/g, '').replace(/^00/, '');
  const core = (digits.startsWith('964') ? digits.slice(3) : digits).replace(/^0+/, '');

  const { data: stations } = await db
    .from('stations')
    .select('id, name, phone')
    .eq('status', 'approved');

  const match = (stations ?? []).find((s) => {
    const d = s.phone.replace(/\D/g, '').replace(/^00/, '');
    return (d.startsWith('964') ? d.slice(3) : d).replace(/^0+/, '') === core;
  });

  if (!match) {
    // echo the number back exactly as it was shared: nine times out of ten the
    // owner registered a different line and only sees it when it is in front
    // of them
    await send(
      chat,
      `❌ لا توجد محطة مسجّلة بالرقم <code>${rawPhone}</code>.\n\n` +
        'إن كانت محطتك غير مسجّلة بعد، سجّلها الآن:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏪 التسجيل المباشر عبر البوت', callback_data: 'addst' }],
            [{ text: '🌐 التسجيل من موقع المنصة', url: `${SITE}/register` }],
            [{ text: '⬅️ رجوع', callback_data: 'menu' }],
          ],
        },
      }
    );
    await call('sendMessage', {
      chat_id: chat,
      text: '.',
      reply_markup: { remove_keyboard: true },
    })
      .then((r) => r.json())
      .then((j) => j.ok && call('deleteMessage', { chat_id: chat, message_id: j.result.message_id }))
      .catch(() => {});
    return;
  }

  await db.from('telegram_links').upsert(
    { telegram_id: telegramId, station_id: match.id, phone: core },
    { onConflict: 'telegram_id' }
  );

  await send(chat, `✅ تم التحقق. أنت مسؤول عن <b>${match.name}</b>.`, {
    reply_markup: { remove_keyboard: true },
  });
  await showOwnerPanel(chat, match.id);
}

/** «ما زال متوفراً» — جواب سؤال الساعتين بضغطة.
 *
 *  يختم الوقت على كل صفوف المحطة فتعود الحالة طازجة، تماماً كزرّ «تأكيد» في
 *  لوحة الويب. ولا يُعلن شيئاً: الإعلان خبرُ وصولٍ لا خبرُ بقاء — ومن أكّد ما
 *  أعلنه قبل ساعتين لم يصل إليه وقودٌ جديد ليُوقَظ الناس له. */
async function confirmStock(
  chat: number,
  messageId: number,
  telegramId: number,
  stationId: string,
  queryId: string
) {
  if (!isAdmin(telegramId)) {
    const { data: link } = await db
      .from('telegram_links')
      .select('station_id')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (!link || link.station_id !== stationId) {
      await answer(queryId, 'غير مصرّح لك بإدارة هذه المحطة');
      return;
    }
  }

  // ويُحيي ما فات موعدُ نفاده — «ما زال متوفراً» تُكذّب نفاداً مضى. ولولا
  // ذلك لختمت الضغطةُ الوقتَ ولم تُعِد شيئاً معروضاً، وقال البوتُ للمالك
  // «حالتك صارت محدّثة ✅» عن محطةٍ ما زالت مخفيّة.
  const nowStamp = new Date().toISOString();
  const { error } = await db
    .from('station_products')
    .update({ updated_at: nowStamp })
    .eq('station_id', stationId);
  await db
    .from('station_products')
    .update({ runs_out_at: null })
    .eq('station_id', stationId)
    .lt('runs_out_at', nowStamp);

  if (error) {
    await answer(queryId, 'تعذّر الحفظ — أعد المحاولة');
    return;
  }
  await answer(queryId, 'شكراً — حالتك صارت محدّثة الآن ✅');
  await showOwnerPanel(chat, stationId, messageId);
}

async function toggleProduct(
  chat: number,
  messageId: number,
  telegramId: number,
  stationId: string,
  product: string,
  queryId: string
) {
  // never trust the station id in the callback: it comes back from the client
  if (!isAdmin(telegramId)) {
    const { data: link } = await db
      .from('telegram_links')
      .select('station_id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (!link || link.station_id !== stationId) {
      await answer(queryId, 'غير مصرّح لك بإدارة هذه المحطة');
      return;
    }
  }

  const { data: row } = await db
    .from('station_products')
    .select('is_available, runs_out_at')
    .eq('station_id', stationId)
    .eq('product', product)
    .single();

  // الحالةُ الظاهرة لا الخام: بعد مرور موعد النفاد يكون المنتج مُطفأً عند
  // الناس و is_available ما زالت true — فلو قُرئت الخام لأطفأت الضغطةُ
  // الأولى ما هو مُطفأٌ أصلاً، واحتاج المالكُ ضغطتين ليُشعله.
  const next = !stillLive(row);
  // upsert لا update: منتجٌ لم يُنشأ صفُّه بعد كان يُبدَّل فلا يتغيّر شيء،
  // والبوت يجيب «متوفر ✅» عن كتابةٍ لم تقع. (واتساب يفعلها صحيحاً منذ البداية.)
  const { error: saveErr } = await db
    .from('station_products')
    .upsert(
      {
        station_id: stationId,
        product,
        is_available: next,
        // والإشعالُ يُصفّر: بلا هذا يُولد كلُّ تفعيلٍ بعد نفادٍ سابق ميّتاً —
        // البوتُ يقول «أصبح متوفراً» والمنصّةُ لا تعرضه.
        runs_out_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'station_id,product' }
    );

  if (saveErr) {
    await answer(queryId, 'تعذّر الحفظ — أعد المحاولة');
    return;
  }

  // وخبرُ الوصول يخرج إلى الناس.
  //
  // كان التبديل من البوت لا ينادي notify إطلاقاً، فيصل مفضّلي تيليجرام وحدهم
  // بعد دقيقتين عبر كنس notify-favorites — ولا يصل 4,728 مشتركاً على الويب
  // وأندرويد وآيفون. أي أن مالكاً يدير محطته من هنا كان يُعلن لجمهورٍ واحد من
  // خمسة وهو يظنّ أنه أعلن للكلّ.
  //
  // وعند الإطفاء لا يُنادى شيء: الإعلان خبرُ وصولٍ لا خبرُ حالة.
  // والملكية تحقّقت أعلاه، فالنداء يحمل سرّ الخادم لا رمز جلسة.
  if (next) {
    const cron = Deno.env.get('CRON_SECRET');
    if (cron) {
      try {
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': cron },
          body: JSON.stringify({ stationId, products: [product] }),
        });
        // 409 جوابٌ صحيح لا عطل: المحطة مغلقة الآن، أو المنتج لم يعد متوفراً.
        if (!r.ok && r.status !== 409) console.error('notify', r.status, await r.text());
      } catch (e) {
        // الحالة حُفظت، والإشعار لم يخرج. يُسجَّل ولا يُبتلع.
        console.error('notify fetch', e);
      }
    }
  }

  await answer(queryId, `${PRODUCT_LABELS[product]}: ${next ? 'متوفر ✅' : 'غير متوفر ❌'}`);
  await showOwnerPanel(chat, stationId, messageId);
}

// ---------- جدولُ الغد ----------
//
// يصل صاحبَ المنصّة كلَّ مساءٍ منشورٌ بمحطاتٍ يصلها وقودٌ غداً، فيُحوَّل إلى
// هنا بلمسة. والبوت يقرأ ما فيه ويعرض ما فهمه — ولا يكتب حرفاً في القاعدة قبل
// ضغطة «انشر».
//
// وهذا ليس تحفّظاً زائداً: 20260823c يسجّل أن المطابقةَ بالاسم جُرّبت في هذه
// المنصّة ورُفضت لأنها تُخطئ في الجهتين. فالمطابقةُ تقترح، والإنسانُ يقرّر.

const baghdadDay = (plus = 0) =>
  new Date(Date.now() + plus * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Baghdad',
  });

const baghdadHour = () =>
  Number(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      hour12: false,
    })
  );

/** أيَّ يومٍ يعني «غدا» في المنشور؟
 *
 *  القناةُ تنشر نحوَ الحاديةَ عشرةَ والنصف ليلاً بتوقيت بغداد (مقيسٌ من طوابع
 *  صفحتها، وهي UTC فتُقرأ ناقصةً ثلاثَ ساعاتٍ إن غُفل عنها)، فـ«غدا» عندها يومٌ
 *  يبدأ بعد نصف ساعة. لكنّ المنشورَ قد يُحوَّل بعد منتصف الليل — والليلةُ قد صارت غداً —
 *  فتاريخُ «اليوم + ١» يقفز يوماً كاملاً ويُخفي الجدولَ عن نهاره كلِّه.
 *
 *  فالفجرُ والصباحُ يعنيان اليوم، وما بعد الظهر يعني الغد. وهو ترجيحٌ لا يقين،
 *  ولذلك يُطبع التاريخُ في المعاينة ويُصحَّح بكلمةٍ واحدة قبل النشر. */
const scheduleDay = () => baghdadDay(baghdadHour() < 12 ? 0 : 1);

/** كم شخصاً سيصله الإشعار — قبل الضغط لا بعده.
 *
 *  `dryRun` يعدّ بلا ختم، فلا يحرق مهلةَ الخمس والأربعين دقيقة عند أحد. */
async function scheduleReach(cities: string[], products: string[]): Promise<number | null> {
  const cron = Deno.env.get('CRON_SECRET');
  if (!cron || !cities.length) return null;
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cron },
      body: JSON.stringify({
        title: 'معاينة',
        body: 'معاينة',
        cities,
        products,
        dryRun: true,
      }),
    });
    if (!r.ok) return null;
    const a = (await r.json())?.audience ?? {};
    return (a.ios ?? 0) + (a.android ?? 0) + (a.web ?? 0);
  } catch {
    return null;
  }
}

const schedCities = (lines: ScheduleLine[]) =>
  [...new Set(lines.map((l) => l.city).filter(Boolean) as string[])];

/** ما فهمه البوت، سطراً سطراً، مع ما ينقصه. */
const schedProducts = (lines: ScheduleLine[]) => [...new Set(lines.map((l) => l.product))];

const productsLabel = (lines: ScheduleLine[]) =>
  schedProducts(lines)
    .map((p) => PRODUCT_LABELS[p] ?? p)
    .join(' و');

/** مفتاحٌ ثابتٌ لكلّ سطر — لا موضعُه.
 *
 *  **لأنّ الموضعَ يزحف.** كانت أزرارُ المحرِّر تحمل فهرسَ السطر، فحذفُ سطرٍ
 *  يُزيح ما بعده — وزرٌّ في رسالةٍ سابقةٍ يبقى حيّاً يشير إلى محطةٍ أخرى.
 *  فيُحذف غيرُ المقصود أو يُبدَّل وقودُ غيرِه، ثمّ يُنشر ويُشعَر به الناس.
 *
 *  وثمانيةُ أحرفٍ تكفي: `callback_data` سقفُه أربعةٌ وستّون بايتاً. */
const keyed = (lines: ScheduleLine[]): ScheduleLine[] =>
  lines.map((l) => (l.key ? l : { ...l, key: crypto.randomUUID().slice(0, 8) }));

/** يُحرِّر الرسالةَ إن جاءت الضغطةُ من زرّ، ويُرسل جديدةً إن لم تأتِ.
 *
 *  **رسالةُ محرِّرٍ حيّةٌ واحدة لا كومة.** كانت كلُّ شاشةٍ رسالةً جديدة، فتبقى
 *  الشاشاتُ السابقةُ بأزرارها تشير إلى حالةٍ ماتت — وهو أصلُ خمسةٍ من أعطال
 *  المحرِّر. */
const show = (chat: number, msgId: number | undefined, text: string, extra: Json = {}) =>
  msgId ? edit(chat, msgId, text, extra) : send(chat, text, extra);

async function showSchedule(
  chat: number,
  d: { product: string; lines: ScheduleLine[]; for_date?: string },
  msgId?: number
) {
  const label = productsLabel(d.lines);
  const day = d.for_date ?? scheduleDay();
  const dayWord = day === baghdadDay() ? 'اليوم' : day === baghdadDay(1) ? 'غداً' : day;
  // وقودُ السطر يُكتب مع اسمه حين يحمل المنشورُ أكثرَ من وقود — وهو يقع:
  // منشورا الليلة يُلصقان أحياناً في رسالةٍ واحدة.
  const mixed = schedProducts(d.lines).length > 1;
  const cities = schedCities(d.lines);
  const reach = await scheduleReach(cities, schedProducts(d.lines));

  const rows = d.lines.map((l, i) => {
    const mark = l.stationId ? '✅' : l.city ? '⚪️' : '❓';
    const where = l.city ?? 'منطقةٌ لم أعرفها';
    const tail = l.stationId ? 'مسجّلة' : 'خارج المنصّة';
    const pr = mixed ? ` · <b>${esc(PRODUCT_LABELS[l.product] ?? l.product)}</b>` : '';
    return `${i + 1} ${mark} ${esc(l.name)} — ${esc(where)}${pr} · ${tail}`;
  });

  const foot = cities.length
    ? reach === null
      ? `المناطق: ${esc(cities.join(' · '))}`
      : `يصل الإشعارُ إلى ${reach} مشتركاً في ${esc(cities.join(' · '))}.`
    : '⚠️ لا منطقةَ معروفةً في الجدول — يُنشر بلا إشعار.';

  // **أهذه أوّلُ دفعةِ اليوم أم إضافةٌ إلى منشور؟**
  //
  // القناةُ تنشر رسالتين وأكثر، وقد تُنشر الأولى ثمّ تصل الثانية. فالثانيةُ
  // «تحديثٌ مباشرٌ للجدول» — قرارُ صاحب المنصّة — والإشعارُ فيها اختيارٌ لا
  // أصل: من أُشعر بجدول الليلة لا يُزعج ثانيةً لأنّ سطراً أُضيف.
  const { count: already } = await db
    .from('fuel_schedule')
    .select('id', { count: 'exact', head: true })
    .eq('for_date', day);
  const adding = (already ?? 0) > 0;

  const verb = adding ? 'أضِف' : 'انشر';
  const note = adding ? `${NL}➕ يُضاف إلى جدولٍ منشورٍ فيه ${already} محطة.` : '';
  const flip = day === baghdadDay() ? '📅 اجعله غداً' : '📅 اجعله اليوم';

  await show(
    chat,
    msgId,
    `<b>جدولُ ${dayWord}</b> — ${esc(label)} · ${day}${NL}${NL}` +
      rows.join(NL) +
      `${NL}${NL}${foot}${note}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `📣 ${verb} وأشعِر`, callback_data: 'sch:go' },
            { text: `🔕 ${verb} بلا إشعار`, callback_data: 'sch:mute' },
          ],
          [
            { text: '✏️ تعديل', callback_data: 'sch:edit' },
            { text: flip, callback_data: 'sd' },
          ],
          [{ text: '✖️ ألغِ', callback_data: 'wx' }],
        ],
      },
    }
  );
}

// ── محرِّرُ الجدول ───────────────────────────────────────────────────────
//
// **أزرارٌ لا قواعدُ كتابة.** كان التصحيحُ نحواً يُحفظ — «٢ اسم محطة كذا» —
// فكُتب الرقمُ وحدَه فردّ البوتُ بتحذير. والقاعدةُ التي تحتاج شرحاً في كلّ
// مرّةٍ ليست واجهة.
//
// فثلاثُ شاشات في **رسالةٍ واحدةٍ تُحرَّر**: اختر السطر ← اختر ما تُصحّح ←
// اختر القيمة. ولا يُطلب نصٌّ إلا حيث لا تُحصر القيم: اسمُ المحطة، ومنطقةٌ
// خارج قائمة الأنبار.

/** الوقودُ المعروض في المحرِّر — الشائعُ لا كلُّ ما في المُعدَّد. */
const EDIT_PRODUCTS = ['gasoline_regular', 'gasoline_premium', 'gasoline_super', 'kerosene', 'gas'];

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** ــ التحكّم بالجدول بعد نشره ــــــــــــــــــــــــــــــــــــــــــــــ
 *
 *  محرّرُ المسوّدة أدناه يُصحّح **قبل** النشر. وهذا يُصحّح بعده — وهو الذي
 *  يُحتاج فعلاً: «نفدت» تقع بعد النشر بساعات لا لحظتَه. ولذلك زرٌّ في القائمة
 *  الرئيسة لا زرٌّ في رسالة النشر وحدَها؛ رسالةٌ من الصباح يُبحث عنها فلا تُوجد.
 *
 *  ── ولا يُحذف صفٌّ نُشر ──────────────────────────────────────────────────
 *
 *  ما نُشر وقع، والسجلُّ يبقى. فالعلامةُ تُكتب في `board_overrides` وتُطبَّق على
 *  ما يُعرض، وتُرفع فيعود السطر. وحذفُ الصفّ كان سيمحو أنّ الخبرَ أُعلن أصلاً
 *  وأنّ الناسَ بنوا عليه.
 *
 *  ── والعلامةُ بالاسم لا بمعرّف الصفّ ────────────────────────────────────
 *
 *  لأنّ السطرَ الظاهرَ للناس قد لا يكون سطرَ الجدول: `linkBack` يكتب وعداً في
 *  لوحة المحطة، فيدخل السطرُ من مصدرها ويُبتلع سطرُ القناة فيه. والعلامةُ
 *  بالاسم والمنطقة تصيبهما معاً — `sameStation` في `lib/board.ts` تطابق
 *  «غصن الزيتون جويبة» بـ«محطة تعبئة وقود غصن الزيتون». */
async function boardRows(day: string) {
  const { data } = await db
    .from('fuel_schedule')
    .select('id, product, station_name, city, linked_station_id')
    .eq('for_date', day)
    .order('created_at');
  return data ?? [];
}

async function boardMarks(day: string) {
  const { data } = await db
    .from('board_overrides')
    .select('id, city, station_id, station_name, product, action')
    .eq('for_date', day);
  return data ?? [];
}

/** حالُ سطرٍ كما يراها المشغّل: مخفيٌّ، أو موسومٌ نفداً، أو كما نُشر. */
function markOf(marks: Record<string, any>[], r: Record<string, any>): string | null {
  const hit = marks.find(
    (m) =>
      (!m.product || m.product === r.product) &&
      ((m.station_id && m.station_id === r.linked_station_id) ||
        (m.station_name && m.station_name === r.station_name) ||
        (!m.station_id && !m.station_name && m.city === r.city))
  );
  return (hit?.action as string | undefined) ?? null;
}

async function boardHome(chat: number, day: string, msgId?: number) {
  const rows = await boardRows(day);
  const marks = await boardMarks(day);
  const when = day === baghdadDay() ? 'اليوم' : 'غداً';

  if (!rows.length) {
    const home = { reply_markup: { inline_keyboard: [[{ text: '🏠 القائمة', callback_data: 'menu' }]] } };
    const t = `لا جدولَ منشورٌ ${when}.`;
    if (msgId) await edit(chat, msgId, t, home);
    else await send(chat, t, home);
    return;
  }

  const badge: Record<string, string> = { hide: '🚫', out: '⛔️' };
  const keyboard = [
    ...rows.map((r) => [
      {
        text: `${badge[markOf(marks, r) ?? ''] ?? '•'} ${r.station_name}`.slice(0, 45),
        callback_data: `bd:r:${r.id}`,
      },
    ]),
    [{ text: '📍 إخفاء منطقةٍ كاملة', callback_data: 'bd:c' }],
    [{ text: '🏠 القائمة', callback_data: 'menu' }],
  ];

  const hidden = rows.filter((r) => markOf(marks, r) === 'hide').length;
  const gone = rows.filter((r) => markOf(marks, r) === 'out').length;
  const text =
    `<b>جدول ${when} — ${rows.length} سطراً</b>${NL}` +
    (hidden || gone
      ? `${hidden ? `🚫 ${hidden} مخفيّ   ` : ''}${gone ? `⛔️ ${gone} موسومٌ «نفد»` : ''}${NL}${NL}`
      : NL) +
    `اضغط سطراً لتُخفيه أو تَسِمه «نفد».`;

  const extra = { reply_markup: { inline_keyboard: keyboard } };
  if (msgId) await edit(chat, msgId, text, extra);
  else await send(chat, text, extra);
}

async function boardRoute(chat: number, data: string, msgId?: number) {
  const day = scheduleDay();
  if (data === 'bd') return boardHome(chat, day, msgId);

  // ــ منطقةٌ كاملة ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
  if (data === 'bd:c') {
    const rows = await boardRows(day);
    const marks = await boardMarks(day);
    const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))] as string[];
    const isHidden = (c: string) =>
      marks.some((m) => m.action === 'hide' && !m.station_id && !m.station_name && m.city === c);
    return edit(chat, msgId!, '<b>أيَّ منطقةٍ تُخفي من جدول اليوم؟</b>', {
      reply_markup: {
        inline_keyboard: [
          ...cities.map((c, i) => [
            {
              text: `${isHidden(c) ? '🚫' : '•'} ${c}`,
              callback_data: `bd:ct:${i}:${isHidden(c) ? 's' : 'h'}`,
            },
          ]),
          [{ text: '↩︎ رجوع', callback_data: 'bd' }],
        ],
      },
    });
  }

  if (data.startsWith('bd:ct:')) {
    const [, , idx, act] = data.split(':');
    const rows = await boardRows(day);
    const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))] as string[];
    const city = cities[Number(idx)];
    if (!city) return boardHome(chat, day, msgId);
    if (act === 's') {
      await db
        .from('board_overrides')
        .delete()
        .eq('for_date', day)
        .eq('city', city)
        .is('station_id', null)
        .is('station_name', null);
    } else {
      await db.from('board_overrides').insert({ for_date: day, city, action: 'hide' });
    }
    return boardRoute(chat, 'bd:c', msgId);
  }

  // ــ سطرٌ بعينه ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
  const [, kind, id, act] = data.split(':');
  const rows = await boardRows(day);
  const row = rows.find((r) => r.id === id);
  if (!row) return boardHome(chat, day, msgId);

  if (kind === 'a') {
    // ما يخصّ هذا السطرَ وحدَه يُمسح أوّلاً — فلا تتراكم علامتان متناقضتان
    // عليه، ولا تُمسّ علامةُ المنطقة التي تشمله.
    await db
      .from('board_overrides')
      .delete()
      .eq('for_date', day)
      .eq('station_name', row.station_name)
      .eq('product', row.product);

    if (act !== 's') {
      await db.from('board_overrides').insert({
        for_date: day,
        city: row.city,
        station_id: row.linked_station_id,
        station_name: row.station_name,
        product: row.product,
        action: act === 'o' ? 'out' : 'hide',
      });
    }
    return boardHome(chat, day, msgId);
  }

  const marks = await boardMarks(day);
  const now = markOf(marks, row);
  const state = now === 'hide' ? '🚫 مخفيّ' : now === 'out' ? '⛔️ موسومٌ «نفد»' : '• كما نُشر';
  return edit(
    chat,
    msgId!,
    `<b>${esc(row.station_name)}</b>${NL}` +
      `${esc(row.city ?? 'منطقةٌ لم تُذكر')} · ${esc(PRODUCT_LABELS[row.product] ?? row.product)}${NL}` +
      `الحال: ${state}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚫 أخفِ', callback_data: `bd:a:${row.id}:h` },
            { text: '⛔️ نفد', callback_data: `bd:a:${row.id}:o` },
          ],
          [{ text: '↩︎ أعِده كما نُشر', callback_data: `bd:a:${row.id}:s` }],
          [{ text: '↩︎ رجوع', callback_data: 'bd' }],
        ],
      },
    }
  );
}

/** الشاشةُ الأولى: أيَّ سطرٍ تُصحّح؟ */
function linePicker(d: { lines: ScheduleLine[] }) {
  return {
    text: '<b>أيَّ سطرٍ تُصحّح؟</b>',
    extra: {
      reply_markup: {
        inline_keyboard: [
          ...d.lines.map((l, i) => [
            { text: `${i + 1} ${l.name}`.slice(0, 40), callback_data: `se:${l.key}` },
          ]),
          [{ text: '↩︎ رجوع', callback_data: 'sb' }],
        ],
      },
    },
  };
}

/** الشاشةُ الثانية: ماذا في هذا السطر تُصحّح؟ */
function lineMenu(l: ScheduleLine, i: number) {
  return {
    text:
      `<b>السطر ${i + 1}</b>${NL}` +
      `الاسم: ${esc(l.name)}${NL}` +
      `المنطقة: ${esc(l.city ?? 'غير معروفة')}${NL}` +
      `الوقود: ${esc(PRODUCT_LABELS[l.product] ?? l.product)}`,
    extra: {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ الاسم', callback_data: `sf:${l.key}:n` },
            { text: '📍 المنطقة', callback_data: `sf:${l.key}:c` },
          ],
          [
            { text: '⛽ الوقود', callback_data: `sf:${l.key}:p` },
            { text: '🗑 حذف السطر', callback_data: `sf:${l.key}:x` },
          ],
          [{ text: '↩︎ رجوع', callback_data: 'sch:edit' }],
        ],
      },
    },
  };
}

/** الشاشةُ الثالثة: القيمة — حيث تُحصر. */
function valuePicker(l: ScheduleLine, i: number, field: string) {
  if (field === 'p') {
    return {
      text: `<b>وقودُ السطر ${i + 1}</b>${NL}${esc(l.name)}`,
      extra: {
        reply_markup: {
          inline_keyboard: [
            ...chunk(
              EDIT_PRODUCTS.map((p) => ({
                text: PRODUCT_LABELS[p] ?? p,
                callback_data: `sp:${l.key}:${p}`,
              })),
              2
            ),
            [{ text: '↩︎ رجوع', callback_data: `se:${l.key}` }],
          ],
        },
      },
    };
  }
  return {
    text: `<b>منطقةُ السطر ${i + 1}</b>${NL}${esc(l.name)}`,
    extra: {
      reply_markup: {
        inline_keyboard: [
          ...chunk(
            CITY_NAMES.map((c, k) => ({ text: c, callback_data: `sc:${l.key}:${k}` })),
            3
          ),
          [{ text: '⌨️ اكتبها بنفسي', callback_data: `sw:${l.key}:c` }],
          [{ text: '↩︎ رجوع', callback_data: `se:${l.key}` }],
        ],
      },
    },
  };
}

/** المحطاتُ المعتمدة بإحداثيّاتها — منها يأتي الربطُ ومنها «مسجّلة». */
async function platformStations(): Promise<PlatformStation[]> {
  const { data } = await db
    .from('stations_public')
    .select('id, name, lat, lng')
    .eq('status', 'approved')
    .range(0, 99_999);
  return (data ?? []) as PlatformStation[];
}

/** منشورٌ وصل: يُقرأ ويُطابق ويُحفظ مسوّدةً — بلا صفٍّ واحدٍ في القاعدة. */
async function proposeSchedule(chat: number, userId: number, text: string) {
  const parsed = readSchedule(text, await platformStations());
  if (!parsed || !parsed.lines.length) {
    await send(chat, '⚠️ لم أتعرّف على جدولٍ في هذا المنشور.');
    return;
  }
  const d = {
    product: parsed.product as string,
    lines: keyed(parsed.lines),
    for_date: scheduleDay(),
  };
  await saveDraft(userId, chat, 'sched', { sched: d });
  await showSchedule(chat, d);
}

/** أسطرٌ يكتبها صاحبُ المنصّة بيده: «محطة وادي حجلان - حديثة - محسن».
 *
 *  نصفُ عمله اليوميّ خارجُ القناة — يتّصل به أصحابُ محطات ويتابع صفحاتِهم.
 *  فالخبرُ يدخل من هنا إلى **جدول اليوم نفسِه**، ويمرّ بالمعاينة والأزرار
 *  نفسِها: مسارٌ واحدٌ لا ثانٍ له. */
async function proposeManual(chat: number, userId: number, text: string) {
  const platform = await platformStations();
  const lines: ScheduleLine[] = [];

  for (const row of text.split(/\r?\n/)) {
    const one = readManualLine(row);
    if (!one) continue;
    const m = matchLine(one.name, platform, one.product ?? 'gasoline_regular');
    // ما كتبه صاحبُ المنصّة أولى ممّا استنتجه المطابق: هو سمع الخبرَ بأذنه.
    lines.push({ ...m, city: one.city ?? m.city, name: m.stationId ? m.name : one.name });
  }

  if (!lines.length) {
    await send(chat, '⚠️ لم أفهم شيئاً. اكتب: <code>اسم المحطة - المنطقة - نوع الوقود</code>');
    return;
  }

  const d = {
    product: lines[0].product as string,
    lines: keyed(lines),
    for_date: baghdadDay(),
  };
  await saveDraft(userId, chat, 'sched', { sched: d });
  await showSchedule(chat, d);
}

/** النصُّ المنتظَر بعد ضغطة زرّ — الاسمُ أو منطقةٌ خارج القائمة. */
async function correctSchedule(chat: number, userId: number, d: Draft, raw: string) {
  const sched = d.sched;
  if (!sched) return void (await send(chat, 'انتهت الجلسة. أعِد تحويلَ المنشور.'));

  const v = raw.trim();
  const waiting = sched.edit;
  if (!waiting) {
    return void (await send(chat, 'اضغط <b>✏️ تعديل</b> في المعاينة لاختيار السطر.'));
  }

  const i = sched.lines.findIndex((l) => l.key === waiting.key);
  if (i < 0) {
    sched.edit = undefined;
    await saveDraft(userId, chat, 'sched', { sched });
    return void (await send(chat, 'تغيّرت القائمة — افتح ✏️ تعديل من جديد.'));
  }
  if (v.length < 2) return void (await send(chat, '⚠️ قصيرٌ جداً. اكتبه كاملاً.'));

  if (waiting.field === 'name') {
    // **الاسمُ الجديد يُعاد مطابقتُه.** ولولا ذلك لبقي `linked_station_id`
    // لمحطةٍ قديمةٍ تحت اسمٍ جديد — فيُنشر صفٌّ يربط المواطنَ بصفحةِ محطةٍ
    // لا يصلها وقود، والمعاينةُ تقول «مسجّلة» فيُصدَّق.
    const old = sched.lines[i];
    const m = matchLine(v, await platformStations(), old.product);
    sched.lines[i] = { ...m, name: m.stationId ? m.name : v, city: m.city ?? old.city, key: old.key };
  } else {
    sched.lines[i].city = v;
  }

  sched.edit = undefined;
  await saveDraft(userId, chat, 'sched', { sched });
  await showSchedule(chat, sched);
}

/** توجيهُ ضغطات المحرِّر كلِّها — والمسوّدةُ تُقرأ مرّةً واحدة. */
async function editRoute(chat: number, userId: number, data: string, msgId?: number) {
  const draft = await getDraft(userId);
  const sched = draft?.data?.sched;
  if (!sched?.lines?.length) {
    await send(chat, 'انتهت الجلسة. أعِد تحويلَ المنشور.');
    return;
  }

  // **أيُّ ضغطةٍ تُلغي انتظاراً سابقاً.** ضغط «✏️ الاسم» ثمّ انتقل ولم يكتب:
  // كان الطلبُ يبقى حيّاً، فأوّلُ نصٍّ يكتبه بعدها — ولو كان بحثاً — يقع في
  // حقلٍ وسطرٍ غيرِ اللذين أمامه. والفرعان اللذان يضبطانه يأتيان بعدُ.
  sched.edit = undefined;

  const save = () => saveDraft(userId, chat, 'sched', { sched });

  if (data === 'sch:edit') {
    await save();
    const v = linePicker(sched);
    return void (await show(chat, msgId, v.text, v.extra));
  }
  if (data === 'sb') {
    await save();
    return void (await showSchedule(chat, sched, msgId));
  }
  if (data === 'sd') {
    // اليومُ يُقلب بزرّ: منشورُ الليلة يُراجَع بعد منتصف الليل أحياناً، والترجيحُ
    // ترجيحٌ لا يقين.
    sched.for_date = sched.for_date === baghdadDay() ? baghdadDay(1) : baghdadDay();
    await save();
    return void (await showSchedule(chat, sched, msgId));
  }

  const [tag, key, arg] = data.split(':');
  const i = sched.lines.findIndex((l) => l.key === key);
  if (i < 0) {
    await save();
    return void (await show(chat, msgId, 'تغيّرت القائمة — افتح ✏️ تعديل من جديد.', {
      reply_markup: { inline_keyboard: [[{ text: '↩︎ رجوع', callback_data: 'sb' }]] },
    }));
  }
  const l = sched.lines[i];

  if (tag === 'se') {
    await save();
    const v = lineMenu(l, i);
    return void (await show(chat, msgId, v.text, v.extra));
  }

  if (tag === 'sf') {
    if (arg === 'x') {
      // الحذفُ بالمفتاح لا بالموضع، فضغطةٌ ثانيةٌ على الزرّ نفسِه بلا أثر.
      sched.lines = sched.lines.filter((x) => x.key !== key);
      if (!sched.lines.length) {
        await clearDraft(userId);
        return void (await show(chat, msgId, 'حُذفت كلُّ الأسطر. أُلغي الجدول.'));
      }
      await save();
      return void (await showSchedule(chat, sched, msgId));
    }
    if (arg === 'n' || arg === 'c') {
      sched.edit = { key, field: arg === 'n' ? 'name' : 'city' };
      await save();
      if (arg === 'c') {
        const v = valuePicker(l, i, 'c');
        return void (await show(chat, msgId, v.text, v.extra));
      }
      return void (await show(
        chat,
        msgId,
        `اكتب الآن اسمَ المحطة للسطر ${i + 1}:${NL}<i>${esc(l.name)}</i>`,
        { reply_markup: { inline_keyboard: [[{ text: '✖️ ألغِ التعديل', callback_data: 'sb' }]] } }
      ));
    }
    await save();
    const v = valuePicker(l, i, 'p');
    return void (await show(chat, msgId, v.text, v.extra));
  }

  if (tag === 'sp') {
    sched.lines[i].product = arg;
    await save();
    return void (await showSchedule(chat, sched, msgId));
  }

  if (tag === 'sc') {
    const city = CITY_NAMES[Number(arg)];
    if (city) sched.lines[i].city = city;
    await save();
    return void (await showSchedule(chat, sched, msgId));
  }

  if (tag === 'sw') {
    sched.edit = { key, field: 'city' };
    await save();
    return void (await show(
      chat,
      msgId,
      `اكتب الآن اسمَ المنطقة للسطر ${i + 1}:${NL}<i>${esc(l.name)}</i>`,
      { reply_markup: { inline_keyboard: [[{ text: '✖️ ألغِ التعديل', callback_data: 'sb' }]] } }
    ));
  }
}

/** يكتب «متوقَّع» في لوحات المحطات المسجّلة، ويُشعر أصحابَها. */
async function linkBack(chat: number, lines: ScheduleLine[], forDate: string) {
  const linked = lines.filter((l) => l.stationId);
  if (!linked.length) return;

  const ids = [...new Set(linked.map((l) => l.stationId as string))];
  const { data: cur } = await db
    .from('station_products')
    .select('station_id, product, expected_at')
    .in('station_id', ids);

  const have = new Map(
    (cur ?? []).map((r) => [`${r.station_id}|${r.product}`, r.expected_at as string | null])
  );

  let written = 0;
  for (const l of linked) {
    const key = `${l.stationId}|${l.product}`;
    const mine = have.get(key);
    if (mine && mine >= forDate) continue;

    // تحديثٌ لا upsert: الإدراجُ بمفتاحٍ متعارضٍ يكتب `is_available` افتراضيّاً
    // فيُطفئ منتجاً متوفّراً. فما وُجد يُحدَّث، وما لم يوجد يُدرَج مطفأً.
    const res = have.has(key)
      ? await db
          .from('station_products')
          .update({ expected_at: forDate })
          .eq('station_id', l.stationId!)
          .eq('product', l.product)
      : await db
          .from('station_products')
          .insert({
            station_id: l.stationId,
            product: l.product,
            is_available: false,
            expected_at: forDate,
          });
    if (res.error) console.error('linkBack', res.error.message);
    else written++;
  }

  // ثمّ يُخبَر أصحابُها — من ربط محطتَه بالبوت. وفشلُ الرسالة لا يمسّ ما كُتب.
  const { data: links } = await db
    .from('telegram_links')
    .select('telegram_id, station_id')
    .in('station_id', ids);

  const when = forDate === baghdadDay() ? 'اليوم' : 'غداً';
  for (const link of links ?? []) {
    const mine = linked.filter((l) => l.stationId === link.station_id);
    if (!mine.length) continue;
    const what = [...new Set(mine.map((l) => PRODUCT_LABELS[l.product] ?? l.product))].join(' و');
    await send(
      link.telegram_id,
      `📋 ورد في جدول ${when} أنّ عندكم <b>${esc(what)}</b>.${NL}` +
        `سجّلناه في لوحتك «متوقَّعاً» — وحين يصل فعلاً فعّله من اللوحة ليظهر للناس.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🏪 افتح لوحتي', callback_data: 'manage' }]],
        },
      }
    ).catch(() => {});
  }

  if (written) {
    await send(chat, `📋 كُتب «متوقَّع» في لوحة ${written} محطةٍ مسجّلة.`);
  }
}

async function publishSchedule(
  chat: number,
  userId: number,
  queryId: string,
  notify: boolean
) {
  const draft = await getDraft(userId);
  const d = draft?.data?.sched;
  if (!d?.lines?.length) {
    await answer(queryId, 'انتهت الجلسة');
    return;
  }
  // تُمسح أوّلاً: ضغطتان متتاليتان على الزرّ نفسِه كانتا ستكتبان الجدولَ مرّتين.
  await clearDraft(userId);

  const for_date = d.for_date ?? scheduleDay();
  const batch_id = crypto.randomUUID();
  const { error } = await db.from('fuel_schedule').insert(
    d.lines.map((l) => ({
      for_date,
      // **وقودُ الصفّ لا وقودُ المنشور.** كان `d.product` يُكتب للجميع، فسطرٌ
      // آخرُه «تجهيز بنزين محسن» يُنشر عاديّاً — خبرٌ خطأ عن وقودٍ يقطع الناسُ
      // إليه الطريق.
      product: l.product,
      batch_id,
      raw_name: l.raw,
      station_name: l.name,
      city: l.city,
      linked_station_id: l.stationId,
      // `match_score` عمودٌ صحيح، ودرجةُ التشابه كسريّة: نسبةُ الكلمات من
      // خمسٍ وخمسين تُخرج ٢٧٫٥ و٣٦٫٦٦٦. فردّت القاعدةُ «invalid input syntax
      // for type integer» وضاع النشرُ كلُّه على منزلةٍ عشريّة لا تُقرأ أصلاً.
      match_score: Math.round(l.score),
    }))
  );
  if (error) {
    // المسوّدةُ تُعاد: مُسحت قبل الكتابة منعاً للنشر مرّتين، فلو تُركت ممحوّةً
    // بعد فشلٍ لَضاع الجدولُ كلُّه ولزم لصقُه من جديد.
    await saveDraft(userId, chat, 'sched', { sched: d });
    await answer(queryId, 'تعذّر النشر');
    await send(chat, `⚠️ ${esc(error.message)}${NL}المسوّدةُ محفوظة — أعد المحاولة.`);
    return;
  }
  await answer(queryId, 'نُشر ✅');

  // ── والخبرُ يعود إلى لوحة المحطة ────────────────────────────────────────
  //
  // طلبُ صاحب المنصّة: «إذا عن طريق التليغرام ينشر ويحدّث بلوحتهم». فمحطةٌ
  // مسجّلةٌ ورد اسمُها في الجدول يُكتب في لوحتها «متوقَّع» لذلك اليوم — فيراه
  // صاحبُها ويؤكّده بضغطة، وعندها يصير سطرُه في الجدول «وصل ✓» وحدَه.
  //
  // **ولا يُمحى وعدٌ كتبه هو.** إن كان في لوحته موعدٌ أحدثُ أو مساوٍ تُرك،
  // فادّعاؤه عن محطته أولى من خبرٍ عنها.
  await linkBack(chat, d.lines, for_date);

  const when = for_date === baghdadDay() ? 'اليوم' : 'غداً';

  // **بلا إشعار: يُختم كأنّه أُشعر.** `alerted_at` يقول «انقضى أمرُ الإشعار عن
  // هذا الصفّ» — أُرسل أو قُرّر ألّا يُرسل. ولولا الختمُ لَأرسلت شبكةُ الصباح
  // ما اخترتَ إسكاته.
  if (!notify) {
    await db
      .from('fuel_schedule')
      .update({ alerted_at: new Date().toISOString() })
      .eq('batch_id', batch_id);
    await send(
      chat,
      `✅ أُضيف إلى جدول ${for_date} — ${countWord(d.lines.length)}، بلا إشعار.`
    );
    return;
  }

  const { sent, why } = await sendScheduleAlert(
    schedCities(d.lines),
    schedProducts(d.lines),
    d.lines.length,
    when
  );
  if (sent) {
    await db
      .from('fuel_schedule')
      .update({ alerted_at: new Date().toISOString() })
      .eq('batch_id', batch_id);
  }

  await send(
    chat,
    `✅ نُشر جدولُ ${esc(productsLabel(d.lines))} — ${countWord(d.lines.length)}.${NL}` +
      (sent
        ? `📣 يخرج الإشعارُ إلى ${sent} مشتركاً.`
        : `⚠️ ولم يخرج الإشعار: ${esc(why)}${NL}أعِده بأمر /اشعار.`)
  );
}

// ---------- Router ----------

Deno.serve(async (req) => {
  // Telegram signs every call with the secret set at registerWebhook time
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const update = await req.json();

  try {
    // Remember whoever touched the bot. Without this there is no audience to
    // announce anything to — the chat ids exist only in the update we are
    // holding right now, and then they are gone.
    const who = update.message?.from ?? update.callback_query?.from;
    const where = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (who?.id && where) {
      db.from('telegram_users')
        .upsert({ telegram_id: who.id, chat_id: where }, { onConflict: 'telegram_id' })
        .then(() => {})
        .catch(() => {});
    }

    const cb = update.callback_query;
    if (cb) {
      const chat = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const from = cb.from.id;
      const data: string = cb.data ?? '';

      if (data === 'menu') {
        await answer(cb.id);
        await edit(chat, messageId, welcomeFor(from), { reply_markup: await mainMenu(from) });
      } else if (data === 'nearby') {
        await answer(cb.id);
        await showNearby(chat);
      } else if (data === 'products') {
        await answer(cb.id);
        await showProducts(chat, messageId);
      } else if (data === 'manage') {
        await answer(cb.id);
        await showManage(chat, from);
      } else if (data === 'favs') {
        await answer(cb.id);
        await showFavourites(chat, from, messageId);
      } else if (data === 'tone') {
        await answer(cb.id);
        await showTone(chat);
      } else if (data.startsWith('rn:')) {
        const id = data.slice(3);
        if (!isAdmin(from)) {
          await send(chat, 'هذا الأمر للإدارة فقط.');
        } else {
          const { data: st } = await db
            .from('stations')
            .select('name, slug')
            .eq('id', id)
            .maybeSingle();
          if (!st) {
            await send(chat, 'المحطة غير موجودة.');
          } else {
            await saveDraft(from, chat, 'rename', { rename_id: id } as Draft);
            await send(
              chat,
              `الاسم الحالي: <b>${esc(st.name)}</b>

اكتب الاسم الصحيح الآن.
` +
                `<i>الرابط muhta.online/${st.slug ?? ''} لا يتغيّر.</i>`
            );
          }
        }
      } else if (data.startsWith('f+:')) {
        await addFavourite(chat, from, data.slice(3), cb.id);
      } else if (data.startsWith('f-:')) {
        await removeFavourite(chat, messageId, from, data.slice(3), cb.id);
      } else if (data === 'admin') {
        await answer(cb.id);
        await showAdmin(chat, from, messageId);
      } else if (data === 'people') {
        await answer(cb.id);
        await showPeople(chat, from, messageId);
      } else if (data === 'req') {
        await answer(cb.id);
        await showRequests(chat, from, messageId);
      } else if (data === 'addst') {
        await answer(cb.id);
        await startWizard(chat, from);
      } else if (data.startsWith('wp:') || data.startsWith('wc:')) {
        await wizardChoice(chat, from, data.slice(0, 2) as 'wp' | 'wc', Number(data.slice(3)), cb.id);
      } else if (data === 'wx') {
        await answer(cb.id);
        await cancelWizard(chat, from);
      } else if (data.startsWith('ok1:')) {
        await approveOne(chat, from, data.slice(4), cb.id);
      } else if (data.startsWith('gov:')) {
        await setGovernment(chat, from, data.slice(4), cb.id);
      } else if (data.startsWith('rq:')) {
        await showRequest(chat, from, messageId, data.slice(3));
      } else if (data.startsWith('ok:')) {
        await decideStation(chat, messageId, from, data.slice(3), 'approved', cb.id);
      } else if (data.startsWith('no:')) {
        await decideStation(chat, messageId, from, data.slice(3), 'rejected', cb.id);
      } else if (data.startsWith('p:')) {
        await answer(cb.id);
        await showStationsWithProduct(chat, messageId, data.slice(2));
      } else if (data.startsWith('c:')) {
        await confirmStock(chat, messageId, from, data.slice(2), cb.id);
      } else if (data.startsWith('r:')) {
        await answer(cb.id, 'تم التحديث');
        await showOwnerPanel(chat, data.slice(2), messageId);
      } else if (data === 'addsched') {
        await answer(cb.id);
        if (!isAdmin(from)) {
          await send(chat, 'هذا الزرّ للإدارة.');
        } else {
          await saveDraft(from, chat, 'schedadd', {});
          await send(
            chat,
            `<b>إضافةٌ إلى جدول اليوم</b>${NL}${NL}` +
              `الصق سطراً أو أكثر، كلُّ سطرٍ هكذا:${NL}` +
              `<code>اسم المحطة - المنطقة - نوع الوقود</code>${NL}${NL}` +
              `<i>مثال: محطة وادي حجلان - حديثة - محسن</i>${NL}` +
              `والمنطقةُ أو الوقودُ إن نقصا سألتُك عنهما بأزرار.`,
            { reply_markup: { inline_keyboard: [[{ text: '✖️ ألغِ', callback_data: 'wx' }]] } }
          );
        }
      } else if (data === 'bd' || data.startsWith('bd:')) {
        await answer(cb.id);
        await boardRoute(chat, data, messageId);
      } else if (data === 'sch:go') {
        await publishSchedule(chat, from, cb.id, true);
      } else if (data === 'sch:mute') {
        await publishSchedule(chat, from, cb.id, false);
      } else if (data === 'sch:edit' || data === 'sb' || data === 'sd' ||
                 data.startsWith('se:') || data.startsWith('sf:') ||
                 data.startsWith('sp:') || data.startsWith('sc:') ||
                 data.startsWith('sw:')) {
        await answer(cb.id);
        await editRoute(chat, from, data, messageId);
      } else if (data.startsWith('t:')) {
        const [, stationId, product] = data.split(':');
        await toggleProduct(chat, messageId, from, stationId, product, cb.id);
      } else {
        await answer(cb.id);
      }
      return new Response('ok');
    }

    const msg = update.message;
    if (!msg) return new Response('ok');

    const chat = msg.chat.id;
    const from = msg.from?.id as number;

    if (msg.location) {
      // mid-registration this is the station's own pin, not a search origin
      const draft = await getDraft(from);
      if (draft?.step === 'location') {
        draft.data.lat = msg.location.latitude;
        draft.data.lng = msg.location.longitude;
        await send(chat, '📍 حُفظ الموقع.', { reply_markup: { remove_keyboard: true } });
        await advance(chat, from, 'name', draft.data);
        return new Response('ok');
      }
      if (isAdmin(from) && (await pinLastStation(chat, msg.location.latitude, msg.location.longitude))) {
        return new Response('ok');
      }
      const { data: near } = await db.rpc('nearby_stations', {
        p_lat: msg.location.latitude,
        p_lng: msg.location.longitude,
        p_limit: 5,
      });

      if (!near?.length) {
        await send(chat, 'لا توجد محطات مسجّلة بعد.', {
          reply_markup: { remove_keyboard: true },
        });
      } else {
        await send(chat, '📍 <b>أقرب المحطات إليك</b>', {
          reply_markup: { remove_keyboard: true },
        });
        // one message per station so each carries its own favourite button
        for (const s of near) await sendStationCard(chat, s);
      }
      await send(chat, 'اختر ما تريد:', { reply_markup: await mainMenu(from) });
      return new Response('ok');
    }

    if (msg.contact) {
      // only accept a contact the sender actually owns
      if (msg.contact.user_id !== from) {
        await send(chat, '❌ شارك رقمك أنت، لا جهة اتصال أخرى.');
        return new Response('ok');
      }
      await linkByContact(chat, from, msg.contact.phone_number);
      return new Response('ok');
    }

    // والتعليقُ تحت الصورة نصٌّ أيضاً: منشورُ القناة قد يصل صورةً بجدولٍ في
    // تعليقها، وقراءةُ `text` وحدَها كانت تُسقطه صامتاً — يُحوّله صاحبُ المنصّة
    // فلا يردّ البوتُ بشيء ولا يقول لماذا.
    const text: string = msg.text ?? msg.caption ?? '';
    if (text === '⬅️ رجوع' || text.startsWith('/start') || text.startsWith('/menu')) {
      // leaving the menu abandons a half-finished registration, otherwise the
      // next thing typed would be swallowed by a draft the user forgot about
      await clearDraft(from);
      await send(chat, welcomeFor(from), { reply_markup: await mainMenu(from) });
      await call('sendMessage', {
        chat_id: chat,
        text: '.',
        reply_markup: { remove_keyboard: true },
      }).then((r) => r.json())
        .then((j) => j.ok && call('deleteMessage', { chat_id: chat, message_id: j.result.message_id }))
        .catch(() => {});
      return new Response('ok');
    }

    // Admins add a station either by tapping the button or by typing the line
    // straight in. The pipe test has to run before the free-text search below,
    // or the whole line would be treated as a station name to look up.
    // an open registration claims every typed message until it is finished or
    // cancelled, otherwise the free-text search below would swallow the answers
    if (!text.startsWith('/') && text !== '⬅️ رجوع') {
      const draft = await getDraft(from);
      if (draft) {
        // **منشورٌ جديدٌ يَجُبُّ المسوّدةَ، ولا يُقرأ تصحيحاً لها.**
        //
        // وقع: عرض الرصدُ جدولاً، ثمّ لصق صاحبُ المنصّة منشوراً كاملاً — فذهب
        // إلى مُصحِّح الأسطر، فردّ «ابدأ برقم السطر». والتصحيحُ سطرٌ قصير،
        // والمنشورُ يُعرَف بشكله؛ فالتمييزُ بينهما ممكنٌ بلا سؤال.
        //
        // **إلّا أن يكون حقلٌ ينتظر نصّاً**: فالمكتوبُ حينئذٍ جوابٌ لا منشور،
        // ولو كان اسمُ محطةٍ فيه «تجهيز» و«غاز» لَمحا المسوّدةَ كلَّها.
        //
        // **والحارسُ يعمّ البابين لا باباً واحداً.**
        //
        // كان `looksLikeSchedule` مشروطاً على `sched` وحدَها، و`schedadd` تبتلع
        // كلَّ ما يُلصق. وزرُّ «إضافةٌ إلى جدول اليوم» يفتح `schedadd`،
        // و`proposeManual` تكتب `for_date: baghdadDay()` — **اليوم دائماً**،
        // وهو صحيحٌ لسطرٍ يكتبه صاحبُ المنصّة بيده عن خبرٍ سمعه الآن.
        //
        // فوقع ليلةَ ٢٠٢٦-٠٩-٠٨: فُتح البابُ ثمّ لُصق منشورُ قناةٍ من إحدى
        // وثلاثين محطة الساعةَ ٢١:١٢. فقُرئ أسطراً يدويّةً لليومِ نفسِه، وانضمّ
        // إلى اثنتَي عشرةَ محطةً نُشرت فجرَ ذلك اليوم — فاختلط جدولان في
        // تاريخٍ واحد، وخرج الإشعارُ إلى ١١٬٨٧٦ مشتركاً. و`scheduleDay()` كانت
        // ستعطي **الغد** لو مرّ من بابه، وهو الصواب: ما بعد الظهر يعني الغد.
        //
        // والشكلُ يُعرَف: منشورٌ كامل ليس سطراً يدويّاً، أيّاً كان البابُ
        // المفتوح. وهو المبدأُ المكتوبُ فوقه بأربعة أسطر — «منشورٌ جديدٌ يَجُبُّ
        // المسوّدة» — ولم يكن مطبَّقاً إلا على نصفه.
        if (
          looksLikeSchedule(text) &&
          (draft.step === 'schedadd' || (draft.step === 'sched' && !draft.data.sched?.edit))
        ) {
          await proposeSchedule(chat, from, text);
        } else if (draft.step === 'schedadd') {
          await proposeManual(chat, from, text);
        } else if (draft.step === 'sched') {
          await correctSchedule(chat, from, draft.data, text);
        } else {
          await wizardText(chat, from, draft.step, draft.data, text);
        }
        return new Response('ok');
      }
    }

    if (isAdmin(from)) {
      // منشورُ الجدول يُعرَف بشكله لا بأمرٍ يُكتب — وهو كسبُ الوقت كلُّه:
      // تحويلٌ بلمسة ثمّ ضغطة. والفحصُ يسبق البحثَ الحرَّ أدناه، وإلّا صار
      // المنشورُ كلُّه اسمَ محطةٍ يُبحث عنه.
      if (!text.startsWith('/') && looksLikeSchedule(text)) {
        await proposeSchedule(chat, from, text);
        return new Response('ok');
      }

      // إعادةُ الإشعار لجدولٍ نُشر ولم يخرج خبرُه — أو تأجيلُه إلى ساعةٍ
      // لائقة: النشرُ يقع ليلاً، والإشعارُ الثالثةَ فجراً إزعاجٌ لا خبر.
      if (text === '/اشعار' || text === '/alert') {
        const day = baghdadDay();
        const { data: rows } = await db
          .from('fuel_schedule')
          .select('product, city')
          .eq('for_date', day);
        if (!rows?.length) {
          await send(chat, `لا جدولَ منشوراً لليوم (${day}).`);
          return new Response('ok');
        }
        const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))] as string[];
        const products = [...new Set(rows.map((r) => r.product))] as string[];
        const { sent, why } = await sendScheduleAlert(cities, products, rows.length, 'اليوم');
        if (sent) {
          await db
            .from('fuel_schedule')
            .update({ alerted_at: new Date().toISOString() })
            .eq('for_date', day)
            .is('alerted_at', null);
        }
        await send(
          chat,
          sent
            ? `📣 يخرج الإشعارُ إلى ${sent} مشتركاً في ${esc(cities.join(' · '))}.`
            : `⚠️ لم يخرج الإشعار: ${esc(why)}`
        );
        return new Response('ok');
      }

      if (text.startsWith('/rename')) {
        const { data: list } = await db
          .from('stations')
          .select('id, name, city')
          .in('status', ['approved', 'pending', 'suspended'])
          .order('created_at', { ascending: false })
          .limit(30);
        if (!list?.length) {
          await send(chat, 'لا توجد محطات بعد.');
          return new Response('ok');
        }
        await send(chat, 'اختر المحطة التي تريد تصحيح اسمها:', {
          reply_markup: {
            inline_keyboard: list.map((st) => [
              { text: `${st.name} — ${st.city}`.slice(0, 60), callback_data: `rn:${st.id}` },
            ]),
          },
        });
        return new Response('ok');
      }

      if (text.startsWith('/addstation') || text.startsWith('/station')) {
        await startWizard(chat, from);
        return new Response('ok');
      }
      if (text.startsWith('/announceall')) {
        const { data: all } = await db.from('telegram_users').select('chat_id');
        const rows = all ?? [];
        if (!rows.length) {
          await send(chat, 'لا يوجد مستخدمون مسجّلون بعد. يُسجَّل كل من يفتح البوت من الآن.');
          return new Response('ok');
        }
        await send(chat, `⏳ جارٍ الإرسال إلى ${rows.length} مستخدماً…`);
        let ok = 0;
        for (const r of rows) {
          const res = await send(Number(r.chat_id), PUBLIC_ANNOUNCEMENT, {
            reply_markup: { inline_keyboard: [[{ text: '🏪 سجّل محطتك', callback_data: 'addst' }]] },
            disable_web_page_preview: true,
          });
          if (res.ok) ok++;
          // a user who blocked the bot must not stall the rest
        }
        await send(chat, `✅ وصلت إلى ${ok} من ${rows.length}.`);
        return new Response('ok');
      }

      if (text.startsWith('/announce')) {
        for (const id of ADMIN_IDS) {
          await send(Number(id), ANNOUNCEMENT, {
            reply_markup: { inline_keyboard: [[{ text: '➕ إضافة محطة', callback_data: 'addst' }]] },
          });
        }
        await send(chat, `✅ أُرسل الإعلان إلى ${ADMIN_IDS.size} حساب إدارة.`);
        return new Response('ok');
      }
    }

    if (text.startsWith('/help')) {
      await send(
        chat,
        '<b>الأوامر</b>\n' +
          '/start — القائمة الرئيسية\n' +
          '/help — هذه الرسالة\n\n' +
          `الموقع: ${SITE}`,
        { reply_markup: await mainMenu(from) }
      );
      return new Response('ok');
    }

    // free text: treat it as a search by station name or area
    const q = text.trim();
    if (q.length >= 2) {
      const { data } = await db
        .from('stations_public')
        .select('id, name, city, address, phone, slug, is_24h, opens_at, closes_at, temp_closed, station_products(product, is_available, runs_out_at, updated_at)')
        .eq('status', 'approved')
        .or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%`)
        .limit(5);

      const results = (data ?? []).map((s) => ({
        ...s,
        products: (s as never as {
          station_products: { product: string; is_available: boolean; runs_out_at: string | null; updated_at: string | null }[];
        }).station_products.filter(offeredNow).map((p) => p.product),
      }));

      if (!results.length) {
        // **وقد لا يكون سؤالاً أصلاً.** لصق صاحبُ المنصّة «محطة وادي حجلان -
        // حديثة - محسن» فردّ البوتُ «لا توجد نتائج» — وهو خبرٌ عن محطةٍ لا
        // بحثٌ عنها. والفارقُ يُقرأ: اسمُ وقودٍ في النصّ لا يكون في سؤالِ بحث.
        if (isAdmin(from) && readManualLine(q)?.product) {
          await proposeManual(chat, from, q);
          return new Response('ok');
        }
        await send(chat, `لا توجد نتائج لـ «${esc(q)}».`, { reply_markup: await mainMenu(from) });
        return new Response('ok');
      }

      await send(chat, `🔍 نتائج البحث عن «${esc(q)}»`);
      for (const s of results) await sendStationCard(chat, s as never);
      await send(chat, 'اختر ما تريد:', { reply_markup: await mainMenu(from) });
      return new Response('ok');
    }

    await send(chat, welcomeFor(from), { reply_markup: await mainMenu(from) });
    return new Response('ok');
  } catch (err) {
    // never let Telegram retry forever on a bug
    console.error('handler error', err);
    return new Response('ok');
  }
});
