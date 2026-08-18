// Telegram bot for المحطة التقنية.
// Runs as a Supabase Edge Function: always on, and in the same place as the
// data, so a "which station has petrol near me" answer is one query away.
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
              `الاسم الحالي: <b>${st.name}</b>

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

    const text: string = msg.text ?? '';
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
        await wizardText(chat, from, draft.step, draft.data, text);
        return new Response('ok');
      }
    }

    if (isAdmin(from)) {
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
        await send(chat, `لا توجد نتائج لـ «${q}».`, { reply_markup: await mainMenu(from) });
        return new Response('ok');
      }

      await send(chat, `🔍 نتائج البحث عن «${q}»`);
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
