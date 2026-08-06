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

function mainMenu(userId: number) {
  const rows = [
    [{ text: '📍 المحطات القريبة مني', callback_data: 'nearby' }],
    [{ text: '⛽ ابحث حسب نوع الوقود', callback_data: 'products' }],
    [{ text: '🏪 إدارة محطتي', callback_data: 'manage' }],
    [{ text: '🌐 فتح الموقع', url: SITE }],
  ];
  if (isAdmin(userId)) {
    rows.splice(3, 0, [{ text: '🛡 لوحة الإدارة', callback_data: 'admin' }]);
  }
  return { inline_keyboard: rows };
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
      [{ text: `📋 مراجعة الطلبات (${pending ?? 0})`, callback_data: 'req' }],
      [{ text: '🏠 القائمة', callback_data: 'menu' }],
    ],
  };
  if (messageId) await edit(chat, messageId, text, { reply_markup: markup });
  else await send(chat, text, { reply_markup: markup });
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
  const { data: link } = await db
    .from('telegram_links')
    .select('station_id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (!link || link.station_id !== stationId) {
    await answer(queryId, 'غير مصرّح لك بإدارة هذه المحطة');
    return;
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
        await edit(chat, messageId, WELCOME, { reply_markup: mainMenu(from) });
      } else if (data === 'nearby') {
        await answer(cb.id);
        await showNearby(chat);
      } else if (data === 'products') {
        await answer(cb.id);
        await showProducts(chat, messageId);
      } else if (data === 'manage') {
        await answer(cb.id);
        await showManage(chat, from);
      } else if (data === 'admin') {
        await answer(cb.id);
        await showAdmin(chat, from, messageId);
      } else if (data === 'req') {
        await answer(cb.id);
        await showRequests(chat, from, messageId);
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

      const text = near?.length
        ? '📍 <b>أقرب المحطات إليك</b>\n\n' +
          near.map((s: never) => stationLine(s)).join('\n\n')
        : 'لا توجد محطات مسجّلة بعد.';

      await send(chat, text, {
        reply_markup: { remove_keyboard: true },
        disable_web_page_preview: true,
      });
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
      await send(chat, WELCOME, { reply_markup: mainMenu(from) });
      await call('sendMessage', {
        chat_id: chat,
        text: '.',
        reply_markup: { remove_keyboard: true },
      }).then((r) => r.json())
        .then((j) => j.ok && call('deleteMessage', { chat_id: chat, message_id: j.result.message_id }))
        .catch(() => {});
      return new Response('ok');
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
        .select('name, city, address, phone, slug, is_24h, opens_at, closes_at, station_products(product, is_available)')
        .eq('status', 'approved')
        .or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%`)
        .limit(5);

      const results = (data ?? []).map((s) => ({
        ...s,
        products: (s as never as { station_products: { product: string; is_available: boolean }[] })
          .station_products.filter((p) => p.is_available).map((p) => p.product),
      }));

      await send(
        chat,
        results.length
          ? `🔍 نتائج البحث عن «${q}»\n\n` + results.map((s) => stationLine(s as never)).join('\n\n')
          : `لا توجد نتائج لـ «${q}».`,
        { reply_markup: mainMenu(from), disable_web_page_preview: true }
      );
      return new Response('ok');
    }

    await send(chat, WELCOME, { reply_markup: mainMenu(from) });
    return new Response('ok');
  } catch (err) {
    // never let Telegram retry forever on a bug
    console.error('handler error', err);
    return new Response('ok');
  }
});
