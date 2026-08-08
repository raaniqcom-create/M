// Telegram bot for المحطة التقنية.
// Runs as a Supabase Edge Function: always on, and in the same place as the
// data, so a "which station has petrol near me" answer is one query away.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
const SITE = 'https://muhta.online';
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

// Anbar districts with a rough centre each. Duplicated from lib/cities.ts
// because an Edge Function cannot import from the Next app; the list is
// administrative geography and does not change.
const CITIES: Record<string, [number, number]> = {
  'الرمادي': [33.4258, 43.3012],
  'الفلوجة': [33.3556, 43.7864],
  'هيت': [33.6383, 42.8258],
  'حديثة': [34.1372, 42.3789],
  'عانة': [34.4686, 41.9375],
  'راوة': [34.4756, 41.9139],
  'القائم': [34.3689, 41.0906],
  'الرطبة': [33.0386, 40.2864],
  'الحبانية': [33.3628, 43.5586],
  'الخالدية': [33.3789, 43.4881],
  'عامرية الفلوجة': [33.2264, 43.6786],
  'الكرمة': [33.4453, 43.7972],
  'البغدادي': [33.8517, 42.6472],
  'الحقلانية': [34.0575, 42.3792],
  'بروانة': [34.1508, 42.3739],
  'النخيب': [32.0369, 42.2506],
};

// ---------- Telegram helpers ----------

type Json = Record<string, unknown>;

async function call(method: string, body: Json) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(method, await res.text());
  return res;
}

const send = (chat_id: number, text: string, extra: Json = {}) =>
  call('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

const edit = (chat_id: number, message_id: number, text: string, extra: Json = {}) =>
  call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra });

const answer = (id: string, text?: string) =>
  call('answerCallbackQuery', { callback_query_id: id, text });

// ---------- Opening hours (Baghdad clock) ----------

function isOpenNow(s: { is_24h: boolean; opens_at: string; closes_at: string }): boolean {
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

function mainMenu(userId: number) {
  // Before launch there is nothing for a driver to search — every station list
  // would come back empty and read as a broken bot. Show the two things that
  // are genuinely useful now instead.
  if (PRE_LAUNCH && !isAdmin(userId)) {
    return {
      inline_keyboard: [
        [{ text: '🔔 ثبّت نغمة التنبيه', callback_data: 'tone' }],
        [{ text: '🏪 سجّل محطتك', url: `${SITE}/register` }],
        [{ text: '🌐 فتح الموقع', url: SITE }],
      ],
    };
  }

  const rows = [
    [{ text: '📍 المحطات القريبة مني', callback_data: 'nearby' }],
    [{ text: '⛽ ابحث حسب نوع الوقود', callback_data: 'products' }],
    [{ text: '⭐ محطاتي المفضلة', callback_data: 'favs' }],
    [{ text: '🔔 نغمة التنبيه المخصصة', callback_data: 'tone' }],
    [{ text: '🏪 إدارة محطتي', callback_data: 'manage' }],
    [{ text: '🌐 فتح الموقع', url: SITE }],
  ];
  if (isAdmin(userId)) {
    rows.splice(5, 0, [{ text: '🛡 لوحة الإدارة', callback_data: 'admin' }]);
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
  '🏪 صاحب محطة؟ سجّلها الآن لتظهر للسائقين من أول يوم.';

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
    ['1', 'المحطة التقنية — نغمة ١'],
    ['2', 'المحطة التقنية — نغمة ٢'],
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
      [{ text: '➕ إضافة محطة', callback_data: 'addst' }],
      [{ text: `📋 مراجعة الطلبات (${pending ?? 0})`, callback_data: 'req' }],
      [{ text: '👥 من سجّل محطته', callback_data: 'people' }],
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
    .order('created_at', { ascending: false })
    .limit(30);

  if (!data?.length) {
    await edit(chat, messageId, '👥 لم يسجّل أحد بعد.', {
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
      `${i + 1}. <b>${s.name}</b> — ${s.city}\n` +
      `   👤 ${s.contact_name || 'غير محدد'}\n` +
      `   ☎️ <code>${s.phone}</code>\n` +
      `   ${STATUS_LABELS[s.status] ?? s.status} · ${when}`
    );
  });

  // Telegram caps a message at 4096 chars; trim rather than fail to send
  let text = `👥 <b>المسجّلون</b> (${data.length})\n\n${lines.join('\n\n')}`;
  if (text.length > 3900) text = text.slice(0, 3900) + '\n\n… والبقية في لوحة الموقع';

  await edit(chat, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 تحديث', callback_data: 'people' }],
        [{ text: '⬅️ رجوع', callback_data: 'admin' }],
      ],
    },
  });
}

async function showRequests(chat: number, userId: number, messageId: number) {
  if (!isAdmin(userId)) return;

  const { data } = await db
    .from('stations')
    .select('id, name, city, address, phone, contact_name, kind')
    .eq('status', 'pending')
    .order('created_at')
    .limit(1);

  const station = data?.[0];
  if (!station) {
    await edit(chat, messageId, '✅ لا توجد طلبات معلّقة.', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ رجوع', callback_data: 'admin' }]] },
    });
    return;
  }

  await edit(
    chat,
    messageId,
    `📋 <b>طلب تسجيل</b>\n\n` +
      `<b>${station.name}</b>\n` +
      `${station.city} — ${station.address}\n` +
      `☎️ ${station.phone}\n` +
      `المسؤول: ${station.contact_name || 'غير محدد'}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ موافقة', callback_data: `ok:${station.id}` },
            { text: '❌ رفض', callback_data: `no:${station.id}` },
          ],
          [{ text: '⬅️ رجوع', callback_data: 'admin' }],
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

// ---------- Admin: add a station straight from the chat ----------

// The whole station arrives in one line instead of a question-per-field
// wizard. A wizard needs somewhere to keep the half-finished answer between
// two webhook calls, and this function is stateless by design — one line costs
// the admin a single message and costs us no state at all.
const ADD_FORMAT = 'الاسم | العنوان | الهاتف | المدينة';

function addStationHelp(): string {
  return (
    '➕ <b>إضافة محطة</b>\n\n' +
    'أرسل بيانات المحطة في <b>سطر واحد</b>، مفصولة بعلامة <code>|</code>:\n\n' +
    `<code>${ADD_FORMAT}</code>\n\n` +
    '<b>مثال:</b>\n' +
    '<code>محطة الرمادي المركزية | شارع 20 قرب الجسر | 07901234567 | الرمادي</code>\n\n' +
    'المدن المتاحة:\n' +
    Object.keys(CITIES).join(' · ') +
    '\n\nتُضاف المحطة <b>معتمدة فوراً</b>، ويُنشأ لصاحبها حساب دخول برقم الهاتف.'
  );
}

async function showAddStation(chat: number, userId: number) {
  if (!isAdmin(userId)) return;
  await send(chat, addStationHelp(), {
    reply_markup: { force_reply: true, input_field_placeholder: ADD_FORMAT },
  });
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
  const password = `muhta${core.slice(-4)}`;

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

async function addStationFromLine(chat: number, userId: number, line: string) {
  if (!isAdmin(userId)) return;

  const parts = line.split('|').map((p) => p.trim());
  if (parts.length < 4) {
    await send(chat, `❌ الحقول ناقصة. المطلوب أربعة:\n<code>${ADD_FORMAT}</code>`);
    return;
  }

  const [name, address, rawPhone, city] = parts;
  const core = phoneCore(rawPhone);

  if (name.length < 2) return void (await send(chat, '❌ اسم المحطة قصير جداً.'));
  if (address.length < 3) return void (await send(chat, '❌ العنوان قصير جداً.'));
  if (!/^7\d{9}$/.test(core)) {
    await send(chat, '❌ رقم الهاتف غير صحيح. اكتبه هكذا: <code>07901234567</code>');
    return;
  }
  const centre = CITIES[city];
  if (!centre) {
    await send(chat, `❌ «${city}» ليست من مدن الأنبار.\n\nالمتاح:\n${Object.keys(CITIES).join(' · ')}`);
    return;
  }

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
      phone: `0${core}`,
      lat: centre[0],
      lng: centre[1],
      status: 'approved',
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

  const credentials = owner.password
    ? `🔑 <b>دخول صاحب المحطة</b>\nالمستخدم: <code>0${core}</code>\nكلمة المرور: <code>${owner.password}</code>\nمن ${SITE}/login`
    : `🔑 هذا الرقم له حساب سابق — يدخل بكلمة مروره المعروفة من ${SITE}/login`;

  await send(
    chat,
    `✅ <b>أُضيفت المحطة</b>\n\n` +
      `<b>${name}</b>\n${city} — ${address}\n☎️ <code>0${core}</code>\n` +
      `الحالة: معتمدة وظاهرة للسائقين الآن\n\n` +
      `📍 الموقع مبدئياً على مركز ${city}. صحّح الدبوس من لوحة الموقع.\n\n` +
      credentials,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⛽ حدّد المتوفر الآن', callback_data: `r:${station.id}` }],
          [{ text: '🏛 اجعلها حكومية', callback_data: `gov:${station.id}` }],
          [{ text: '➕ محطة أخرى', callback_data: 'addst' }],
          [{ text: '🛡 لوحة الإدارة', callback_data: 'admin' }],
        ],
      },
    }
  );
}

// Sent to every admin by /announce, once, when the feature goes live.
const ANNOUNCEMENT =
  '🛡 <b>يمكنكم الآن إضافة محطة بشكل مباشر</b>\n\n' +
  'من «لوحة الإدارة ← ➕ إضافة محطة»، أو بإرسال الأمر <code>/station</code>.\n\n' +
  'ثم أرسل سطراً واحداً:\n' +
  `<code>${ADD_FORMAT}</code>\n\n` +
  '<b>مثال:</b>\n' +
  '<code>محطة الرمادي المركزية | شارع 20 قرب الجسر | 07901234567 | الرمادي</code>\n\n' +
  'تُضاف المحطة معتمدة وتظهر للسائقين فوراً، ويُنشأ لصاحبها حساب دخول تلقائياً.';

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
    `☎️ ${s.phone}` +
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
    .select('id, is_24h, opens_at, closes_at, station_products(product, is_available)')
    .eq('status', 'approved');

  const counts = new Map<string, number>();
  for (const s of stations ?? []) {
    if (!isOpenNow(s as never)) continue;
    for (const p of (s as never as { station_products: { product: string; is_available: boolean }[] })
      .station_products) {
      if (p.is_available) counts.set(p.product, (counts.get(p.product) ?? 0) + 1);
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
    .from('stations')
    .select('name, city, address, phone, slug, is_24h, opens_at, closes_at, station_products!inner(product, is_available)')
    .eq('status', 'approved')
    .eq('station_products.product', product)
    .eq('station_products.is_available', true);

  const open = (data ?? []).filter((s) => isOpenNow(s as never));
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
    .select('name, is_24h, opens_at, closes_at')
    .eq('id', stationId)
    .single();

  const { data: rows } = await db
    .from('station_products')
    .select('product, is_available')
    .eq('station_id', stationId);

  const byProduct = new Map((rows ?? []).map((r) => [r.product, r.is_available]));
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
    `الحالة: ${open ? 'مفتوحة الآن' : 'مغلقة الآن'}\n\n` +
    'اضغط على أي منتج لتبديل حالته بين متوفر وغير متوفر:';

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
    await send(
      chat,
      '❌ لم أجد محطة مسجّلة بهذا الرقم.\n\n' +
        `تأكد أنه نفس الرقم المسجّل في المنصة، أو سجّل محطتك أولاً:\n${SITE}/register`,
      { reply_markup: { remove_keyboard: true } }
    );
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
    .select('is_available')
    .eq('station_id', stationId)
    .eq('product', product)
    .single();

  const next = !row?.is_available;
  await db
    .from('station_products')
    .update({ is_available: next, updated_at: new Date().toISOString() })
    .eq('station_id', stationId)
    .eq('product', product);

  await answer(queryId, `${PRODUCT_LABELS[product]}: ${next ? 'متوفر ✅' : 'غير متوفر ❌'}`);
  await showOwnerPanel(chat, stationId, messageId);
}

// ---------- Router ----------

Deno.serve(async (req) => {
  // Telegram signs every call with the secret set at registerWebhook time
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const update = await req.json();

  try {
    const cb = update.callback_query;
    if (cb) {
      const chat = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const from = cb.from.id;
      const data: string = cb.data ?? '';

      if (data === 'menu') {
        await answer(cb.id);
        await edit(chat, messageId, welcomeFor(from), { reply_markup: mainMenu(from) });
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
        await showAddStation(chat, from);
      } else if (data.startsWith('gov:')) {
        await setGovernment(chat, from, data.slice(4), cb.id);
      } else if (data.startsWith('ok:')) {
        await decideStation(chat, messageId, from, data.slice(3), 'approved', cb.id);
      } else if (data.startsWith('no:')) {
        await decideStation(chat, messageId, from, data.slice(3), 'rejected', cb.id);
      } else if (data.startsWith('p:')) {
        await answer(cb.id);
        await showStationsWithProduct(chat, messageId, data.slice(2));
      } else if (data.startsWith('r:')) {
        await answer(cb.id, 'تم التحديث');
        await showOwnerPanel(chat, data.slice(2), messageId);
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
      await send(chat, 'اختر ما تريد:', { reply_markup: mainMenu(from) });
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

    const text: string = msg.text ?? '';
    if (text === '⬅️ رجوع' || text.startsWith('/start') || text.startsWith('/menu')) {
      await send(chat, welcomeFor(from), { reply_markup: mainMenu(from) });
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
    if (isAdmin(from)) {
      if (text.startsWith('/addstation') || text.startsWith('/station')) {
        await showAddStation(chat, from);
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
      if (text.includes('|')) {
        await addStationFromLine(chat, from, text);
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
        { reply_markup: mainMenu(from) }
      );
      return new Response('ok');
    }

    // free text: treat it as a search by station name or area
    const q = text.trim();
    if (q.length >= 2) {
      const { data } = await db
        .from('stations')
        .select('id, name, city, address, phone, slug, is_24h, opens_at, closes_at, station_products(product, is_available)')
        .eq('status', 'approved')
        .or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%`)
        .limit(5);

      const results = (data ?? []).map((s) => ({
        ...s,
        products: (s as never as { station_products: { product: string; is_available: boolean }[] })
          .station_products.filter((p) => p.is_available).map((p) => p.product),
      }));

      if (!results.length) {
        await send(chat, `لا توجد نتائج لـ «${q}».`, { reply_markup: mainMenu(from) });
        return new Response('ok');
      }

      await send(chat, `🔍 نتائج البحث عن «${q}»`);
      for (const s of results) await sendStationCard(chat, s as never);
      await send(chat, 'اختر ما تريد:', { reply_markup: mainMenu(from) });
      return new Response('ok');
    }

    await send(chat, welcomeFor(from), { reply_markup: mainMenu(from) });
    return new Response('ok');
  } catch (err) {
    // never let Telegram retry forever on a bug
    console.error('handler error', err);
    return new Response('ok');
  }
});
