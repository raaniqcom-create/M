// «غسيل» — بوتُ «محطة الغسل» على تيليجرام: حجزٌ بثلاث ضغطات، ولوحةُ صاحب المغسلة.
//
// بوتٌ جديدٌ كلّيّاً: مفتاحُه WASH_TELEGRAM_BOT_TOKEN وسرُّه WASH_TELEGRAM_WEBHOOK_SECRET،
// وجدولُه wash_bot_users. لا يلمس telegram_users ولا مفتاحَ بوت الوقود — من ذاك أخذنا
// الهيكلَ وحدَه (call/send/edit مع سقوطٍ إلى نصٍّ خام، والحارسُ، و«ok» دائماً).
//
// ── الجريان ──────────────────────────────────────────────────────────────
// الزبون: موقعٌ أو مدينة → مغسلة → خدمة → يوم → موعد → حجم → (هاتفٌ مرّةً) → تأكيد → book_wash_group.
// المسوّدةُ في wash_bot_users.step/draft — لا جدولَ ثالث. الجهازُ 'tg:<chat>' فتصله إشعاراتُ
// wash-tick هنا (وهو ضيفٌ في القاعدة: أفقُ الضيف، حجزٌ نشطٌ واحد — أخطاؤها العربيّةُ تُعرض كما هي).
// المالك: يشارك رقمَ المغسلة → wash_id → تصله الحجوزاتُ بأزرار تأكيد/إلغاء → wash_bot_set_status.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ANBAR_CITIES } from '../../../lib/cities.ts';
import {
  ACTION_LABELS, ACTIVE_STATUSES, VEHICLE_LABELS, VEHICLE_TYPES, at12, canCancel, dayLabel, hoursLine, iqd, servicePrice, time12,
  bgdDate, type BookingStatus, type VehicleType,
} from '../../../lib/wash.ts';
import { phoneCore } from '../_shared/owner.ts';
import { ST, type StCode, bookingLine, cb, cityButtons, esc, nearest, openDays, ownerButtons, parseCb, rows } from '../_shared/washBot.ts';

const TOKEN = Deno.env.get('WASH_TELEGRAM_BOT_TOKEN')!;
const SECRET = Deno.env.get('WASH_TELEGRAM_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const API = `https://api.telegram.org/bot${TOKEN}`;
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// ── تيليجرام ─────────────────────────────────────────────────────────────
type Json = Record<string, unknown>;

async function call(method: string, body: Json): Promise<Response> {
  const post = (b: Json) => fetch(`${API}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const res = await post(body);
  if (res.ok) return res;
  const why = await res.text();
  console.error(method, res.status, why);
  // وسمٌ لم يُهرَّب لا يُسقط الردَّ كلَّه: يُعاد نصّاً خاماً (telegram/index.ts).
  if (res.status === 400 && body.parse_mode && /parse|entit/i.test(why)) {
    const { parse_mode: _drop, ...plain } = body;
    return post(plain);
  }
  return res;
}
const send = (chat_id: number, text: string, extra: Json = {}) => call('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });
const edit = (chat_id: number, message_id: number, text: string, extra: Json = {}) => call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra });
const answer = (id: string, text?: string) => call('answerCallbackQuery', { callback_query_id: id, text });

/** نكزةُ wash-tick بعد حجزٍ أو تغييرِ حالة — كما lib/washConfig.ts pokeWashTick: بلا جسمٍ ولا انتظار. */
const poke = () => fetch(`${SUPABASE_URL}/functions/v1/wash-tick`, { method: 'POST', headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')! } }).catch(() => {});

// ── المستخدمُ والمسوّدة ──────────────────────────────────────────────────
type Draft = {
  wash?: { id: string; name: string };
  service?: { id: string; name: string; price: number; prices: Record<string, number> | null };
  day?: string; slot?: string; vehicle?: VehicleType; key?: string;
};
type User = { telegram_id: number; chat_id: number; name: string | null; phone: string | null; wash_id: string | null; step: string | null; draft: Draft | null; bookings: number };
const COLS = 'telegram_id, chat_id, name, phone, wash_id, step, draft, bookings';

/** يُسجّل من لمس البوت ويعيد صفَّه. الاسمُ يُكتب أوّلَ مرّةٍ فقط: الزبونُ قد يبدّله في التأكيد. */
async function touch(update: Json): Promise<User | null> {
  const msg = (update.message ?? (update.callback_query as Json | undefined)?.message) as Json | undefined;
  const who = ((update.message as Json | undefined)?.from ?? (update.callback_query as Json | undefined)?.from) as Json | undefined;
  const where = (msg?.chat as Json | undefined)?.id as number | undefined;
  if (!who?.id || !where) return null;
  const { data } = await db.from('wash_bot_users')
    .upsert({ telegram_id: who.id, chat_id: where, last_seen: new Date().toISOString() }, { onConflict: 'telegram_id' })
    .select(COLS).single();
  const u = data as User | null;
  const tgName = [who.first_name, who.last_name].filter(Boolean).join(' ').trim();
  if (u && !u.name && tgName) {
    u.name = tgName;
    await db.from('wash_bot_users').update({ name: tgName }).eq('telegram_id', u.telegram_id);
  }
  return u;
}
const setDraft = (u: User, step: string | null, draft: Draft | null) => {
  u.step = step; u.draft = draft;
  return db.from('wash_bot_users').update({ step, draft }).eq('telegram_id', u.telegram_id);
};
const clearDraft = (u: User) => setDraft(u, null, null);

// ── لوحاتُ المفاتيح والنصوص ──────────────────────────────────────────────
const BTN = { near: '📍 أقرب مغسلة', city: '🏙 اختر مدينة', mine: '📋 حجوزاتي', my: '🧼 مغسلتي', owner: '🧑‍🔧 أنا صاحب مغسلة', back: '⬅️ رجوع' };
const mainMenu = (u: User) => ({
  keyboard: [[{ text: BTN.near, request_location: true }, { text: BTN.city }, { text: BTN.mine }], [{ text: u.wash_id ? BTN.my : BTN.owner }]],
  resize_keyboard: true,
});
const contactKb = (label: string) => ({ keyboard: [[{ text: label, request_contact: true }], [{ text: BTN.back }]], resize_keyboard: true, one_time_keyboard: true });
const locationKb = { keyboard: [[{ text: BTN.near, request_location: true }], [{ text: BTN.back }]], resize_keyboard: true, one_time_keyboard: true };
const WELCOME = 'مرحباً بك في محطة الغسل 🚗✨\nاحجز موعد غسيل سيارتك بثلاث ضغطات.';

const WASH_COLS = 'id, name, city, address, lat, lng, rating_avg, rating_n, from_price, paused, temp_closed, is_24h, opens_at, closes_at';
type WashRow = { id: string; name: string; city: string; address: string; lat: number; lng: number; rating_avg: number | null; rating_n: number; from_price: number | null; paused: boolean; temp_closed: boolean; is_24h: boolean; opens_at: string; closes_at: string };
type BookingRow = { id: string; code: string; status: BookingStatus; starts_at: string; service_name: string; phone: string; name: string; car_washes: { name: string } | null };
type WashRef = { id: string; name: string } | null;

const home = async (chat: number, u: User) => { await clearDraft(u); await send(chat, WELCOME, { reply_markup: mainMenu(u) }); };

/** المدنُ التي فيها مغاسلُ منشورة، بترتيب ANBAR_CITIES. */
async function cityList(chat: number, lead: string) {
  const { data } = await db.from('washes_public').select('city');
  const names = [...new Set(((data ?? []) as { city: string }[]).map((r) => r.city))];
  const kb = cityButtons(names);
  if (!kb.inline_keyboard.length) return send(chat, 'لا مغاسل منشورةً بعد.');
  return send(chat, lead, { reply_markup: kb });
}

async function nearby(chat: number, lat: number, lng: number) {
  const { data } = await db.from('washes_public').select(WASH_COLS);
  const near = nearest((data ?? []) as WashRow[], lat, lng);
  if (!near.length) return cityList(chat, 'لا مغاسل ضمن 30 كم — اختر مدينة:');
  return send(chat, 'أقرب المغاسل:', {
    reply_markup: { inline_keyboard: near.map((w) => [{ text: `${w.name} · ${w.km < 10 ? w.km.toFixed(1) : Math.round(w.km)} كم`, callback_data: cb('w', w.id) }]) },
  });
}

async function washCard(chat: number, u: User, id: string) {
  const { data: w } = await db.from('washes_public').select(WASH_COLS).eq('id', id).maybeSingle();
  if (!w) return send(chat, 'المغسلة غير متاحة الآن.');
  const wash = w as WashRow;
  if (wash.paused || wash.temp_closed) return send(chat, 'المغسلة لا تستقبل حجوزات الآن.');
  const { data: svcs } = await db.from('wash_services').select('id, name, price, prices').eq('wash_id', id).eq('active', true).order('sort');
  const services = (svcs ?? []) as { id: string; name: string; price: number; prices: Record<string, number> | null }[];
  if (!services.length) return send(chat, 'لا خدماتٍ في هذه المغسلة بعد.');
  await setDraft(u, 'wash', { wash: { id: wash.id, name: wash.name } });
  const rating = wash.rating_n > 0 && wash.rating_avg != null ? `⭐ ${wash.rating_avg} (${wash.rating_n})` : '⭐ بلا تقييماتٍ بعد';
  return send(chat, `🧼 <b>${esc(wash.name)}</b>\n📍 ${esc(wash.address)} · ${esc(wash.city)}\n🕒 ${hoursLine(wash)}\n${rating}\n\nاختر الخدمة:`, {
    reply_markup: { inline_keyboard: services.map((s) => [{ text: `${s.name} — ${iqd(s.price)}`, callback_data: cb('s', s.id) }]) },
  });
}

async function pickDay(chat: number, u: User, serviceId: string) {
  const d = u.draft ?? {};
  if (!d.wash) return home(chat, u);
  const { data: s } = await db.from('wash_services').select('id, name, price, prices').eq('id', serviceId).eq('wash_id', d.wash.id).eq('active', true).maybeSingle();
  if (!s) return send(chat, 'اختر خدمةً من قائمة المغسلة.');
  const { data: cfg } = await db.rpc('wash_config');
  const horizon = Number((cfg as { horizon_guest?: number } | null)?.horizon_guest ?? 1);
  await setDraft(u, 'service', { wash: d.wash, service: s as Draft['service'] });
  return send(chat, '📅 اختر اليوم:', {
    reply_markup: { inline_keyboard: rows(openDays(horizon).map((day) => ({ text: dayLabel(day), callback_data: cb('d', day) })), 2) },
  });
}

async function pickSlot(chat: number, u: User, day: string) {
  const d = u.draft ?? {};
  if (!d.wash || !d.service) return home(chat, u);
  const { data } = await db.rpc('wash_slots', { p_wash: d.wash.id, p_day: day, p_service: d.service.id });
  const slots = ((data ?? []) as { slot: string; free: number }[]).filter((x) => x.free > 0).map((x) => x.slot.slice(0, 5));
  if (!slots.length) return send(chat, 'لا مواعيد متاحة — اختر يوماً آخر.');
  await setDraft(u, 'day', { ...d, day });
  return send(chat, `⏰ المواعيد المتاحة ${dayLabel(day)}:`, {
    reply_markup: { inline_keyboard: rows(slots.map((t) => ({ text: time12(t), callback_data: cb('t', t) })), 3) },
  });
}

async function pickVehicle(chat: number, u: User, slot: string) {
  const d = u.draft ?? {};
  if (!d.day) return home(chat, u);
  await setDraft(u, 'slot', { ...d, slot });
  return send(chat, '🚘 حجم السيارة:', {
    reply_markup: { inline_keyboard: rows(VEHICLE_TYPES.map((v) => ({ text: VEHICLE_LABELS[v], callback_data: cb('v', v) })), 2) },
  });
}

async function afterVehicle(chat: number, u: User, v: string) {
  const d = u.draft ?? {};
  if (!d.slot || !(VEHICLE_TYPES as readonly string[]).includes(v)) return home(chat, u);
  const draft = { ...d, vehicle: v as VehicleType };
  if (!u.phone) {
    await setDraft(u, 'phone', draft);
    return send(chat, '📱 شارك رقمك لإتمام الحجز (مرّةً واحدة):', { reply_markup: contactKb('📱 مشاركة رقمي') });
  }
  return confirm(chat, u, draft);
}

async function confirm(chat: number, u: User, draft: Draft) {
  const { wash, service, day, slot, vehicle } = draft;
  if (!wash || !service || !day || !slot || !vehicle) return home(chat, u);
  // المفتاحُ يثبت عبر إعادة العرض: إعادةُ الضغط على «احجز» تُرجع الطلبَ نفسَه لا حجزاً ثانياً.
  const d = { ...draft, key: draft.key ?? crypto.randomUUID() };
  await setDraft(u, 'confirm', d);
  const text =
    `تأكيد الحجز:\n🧼 ${esc(wash.name)}\n🧴 ${esc(service.name)} · ${iqd(servicePrice(service, vehicle))}\n📅 ${dayLabel(day)} ${time12(slot)}\n🚘 ${VEHICLE_LABELS[vehicle]}\n👤 ${esc(u.name)} · ${u.phone}\n(اكتب اسماً آخر لتغييره)`;
  return send(chat, text, {
    reply_markup: { inline_keyboard: [[{ text: '✅ احجز', callback_data: cb('go') }, { text: '✖️ إلغاء', callback_data: cb('x') }]] },
  });
}

async function book(chat: number, u: User) {
  const d = u.draft ?? {};
  if (u.step !== 'confirm' || !d.wash || !d.service || !d.day || !d.slot || !d.vehicle) return home(chat, u);
  const { data, error } = await db.rpc('book_wash_group', {
    p_wash: d.wash.id, p_service: d.service.id, p_day: d.day, p_slot: d.slot,
    p_name: u.name, p_phone: u.phone, p_car: null, p_device: `tg:${chat}`,
    p_vehicles: { [d.vehicle]: 1 }, p_offer: null, p_client_key: d.key ?? null,
  });
  if (error) return send(chat, `❌ ${esc(error.message)}`);
  const res = data as { wash: string; cars: { code: string; starts_at: string; status: string }[] };
  const car = res.cars[0];
  await db.from('wash_bot_users').update({ bookings: u.bookings + 1 }).eq('telegram_id', u.telegram_id);
  await clearDraft(u);
  void poke();
  // من الحجز المُعاد لا من المسوّدة: المفتاحُ المكرّر يُرجع الحجزَ الأصليَّ بيومه وموعده.
  const when = `${dayLabel(bgdDate(0, Date.parse(car.starts_at)))} ${at12(car.starts_at)}`;
  const text = car.status === 'confirmed'
    ? `✅ تم تأكيد حجزك!\nرقم الحجز: <code>${car.code}</code>\n${esc(res.wash)} · ${when}`
    : `⏳ جاري تأكيد حجزك…\nرقم الحجز: <code>${car.code}</code>\nسنخبرك فور موافقة المغسلة.`;
  return send(chat, text, { reply_markup: mainMenu(u) });
}

// ── حجوزاتي ──────────────────────────────────────────────────────────────
const BOOKING_COLS = 'id, code, status, starts_at, service_name, phone, name, car_washes(name)';
const myBooking = async (chat: number, code: string) => {
  const { data } = await db.from('wash_bookings').select(BOOKING_COLS).eq('code', code).eq('device', `tg:${chat}`).maybeSingle();
  return (data as unknown as BookingRow | null) ?? null;
};

async function myBookings(chat: number) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await db.from('wash_bookings').select(BOOKING_COLS).eq('device', `tg:${chat}`).gt('starts_at', since).order('starts_at', { ascending: false }).limit(10);
  const list = (data ?? []) as unknown as BookingRow[];
  if (!list.length) return send(chat, 'لا حجوزات لك بعد — اختر مغسلةً واحجز.');
  for (const b of list) {
    const cancellable = (b.status === 'pending' || b.status === 'confirmed') && canCancel(b.starts_at) !== 'no';
    await send(chat, bookingLine({ ...b, wash: b.car_washes?.name ?? '' }), cancellable
      ? { reply_markup: { inline_keyboard: [[{ text: '✖️ إلغاء', callback_data: cb('cx', b.code) }]] } } : {});
  }
}

const askCancel = (chat: number, code: string) =>
  send(chat, `إلغاء الحجز #${code}؟`, { reply_markup: { inline_keyboard: [[{ text: 'نعم', callback_data: cb('cy', code) }, { text: 'لا', callback_data: cb('my') }]] } });

async function doCancel(chat: number, code: string) {
  const b = await myBooking(chat, code);
  if (!b) return send(chat, 'لم نجد هذا الحجز.');
  const { data, error } = await db.rpc('cancel_wash_booking', { p_code: code, p_phone: b.phone });
  if (error) return send(chat, `❌ ${esc(error.message)}`);
  void poke();
  return send(chat, data === true ? `تم إلغاء الحجز #${code}.` : 'لم نتمكّن من الإلغاء — ربّما بدأ الموعد.');
}

async function review(chat: number, code: string, n: number) {
  const b = await myBooking(chat, code);
  if (!b) return send(chat, 'لم نجد هذا الحجز.');
  const { error } = await db.rpc('review_wash', { p_code: code, p_phone: b.phone, p_stars: n, p_comment: null });
  if (error) return send(chat, `❌ ${esc(error.message)}`);
  void poke();
  return send(chat, `شكراً! وصل تقييمك (${n} ⭐) إلى المغسلة.`);
}

// ── صاحبُ المغسلة ─────────────────────────────────────────────────────────
async function linkOwner(chat: number, u: User, raw: string) {
  const phone = `0${phoneCore(raw)}`;
  let wash: WashRef = null;
  const { data: own } = await db.from('car_washes').select('id, name').eq('phone', phone).eq('status', 'approved').limit(1).maybeSingle();
  wash = (own as WashRef) ?? null;
  if (!wash) {
    const { data: m } = await db.from('wash_managers').select('wash_id').eq('phone', phone).eq('active', true).limit(1).maybeSingle();
    if (m?.wash_id) {
      const { data: w } = await db.from('car_washes').select('id, name').eq('id', m.wash_id).eq('status', 'approved').maybeSingle();
      wash = (w as WashRef) ?? null;
    }
  }
  if (!wash) {
    await clearDraft(u);
    return send(chat, `❌ لا مغسلة مسجّلة بالرقم <code>${phone}</code>.`, { reply_markup: mainMenu(u) });
  }
  u.wash_id = wash.id; u.phone = phone; u.step = null; u.draft = null;
  await db.from('wash_bot_users').update({ wash_id: wash.id, phone, step: null, draft: null }).eq('telegram_id', u.telegram_id);
  return send(chat, `✅ تم التحقق. أنت مسؤول عن <b>${esc(wash.name)}</b>. ستصلك الحجوزات هنا.`, { reply_markup: mainMenu(u) });
}

async function ownerToday(chat: number, u: User) {
  if (!u.wash_id) return send(chat, 'لم تربط مغسلةً بعد.', { reply_markup: mainMenu(u) });
  const day = bgdDate(0), next = bgdDate(1);
  const [{ data: w }, { data }] = await Promise.all([
    db.from('car_washes').select('name').eq('id', u.wash_id).maybeSingle(),
    db.from('wash_bookings').select(BOOKING_COLS).eq('wash_id', u.wash_id).in('status', ACTIVE_STATUSES)
      .gte('starts_at', `${day}T00:00:00+03:00`).lt('starts_at', `${next}T00:00:00+03:00`).order('starts_at').limit(30),
  ]);
  const name = (w as { name: string } | null)?.name ?? '';
  const list = (data ?? []) as unknown as BookingRow[];
  await send(chat, `🧼 <b>${esc(name)}</b> — حجوزات اليوم: ${list.length}`, { reply_markup: { inline_keyboard: [[{ text: '🔓 فكّ الربط', callback_data: cb('unlink') }]] } });
  for (const b of list) {
    await send(chat, `${bookingLine({ ...b, wash: name })}\n👤 ${esc(b.name)} · ${b.phone}`, { reply_markup: ownerButtons(b) });
  }
}

// ── المعالج ──────────────────────────────────────────────────────────────
async function onCallback(q: Json, u: User) {
  const msg = q.message as Json;
  const chat = (msg.chat as Json).id as number;
  const messageId = msg.message_id as number;
  const parts = parseCb(String(q.data ?? ''));
  if (!parts) return answer(q.id as string);
  const [op, a, b] = parts;
  switch (op) {
    case 'c': {
      const city = ANBAR_CITIES[Number(a)]?.name;
      if (!city) break;
      const { data } = await db.from('washes_public').select('id, name').eq('city', city).order('name');
      const list = (data ?? []) as { id: string; name: string }[];
      if (!list.length) { await send(chat, 'لا مغاسل في هذه المدينة بعد.'); break; }
      await send(chat, `مغاسل ${esc(city)}:`, { reply_markup: { inline_keyboard: list.map((w) => [{ text: w.name, callback_data: cb('w', w.id) }]) } });
      break;
    }
    case 'w': await washCard(chat, u, a); break;
    case 's': await pickDay(chat, u, a); break;
    case 'd': await pickSlot(chat, u, a); break;
    case 't': await pickVehicle(chat, u, parts.slice(1).join(':')); break;
    case 'v': await afterVehicle(chat, u, a); break;
    case 'go': await book(chat, u); break;
    case 'x': await clearDraft(u); await send(chat, 'أُلغي. اختر ما تريد:', { reply_markup: mainMenu(u) }); break;
    case 'my': await myBookings(chat); break;
    case 'cx': await askCancel(chat, a); break;
    case 'cy': await doCancel(chat, a); break;
    case 'r': await review(chat, a, Number(b)); break;
    case 'today': await ownerToday(chat, u); break;
    case 'unlink':
      await db.from('wash_bot_users').update({ wash_id: null }).eq('telegram_id', u.telegram_id);
      u.wash_id = null;
      await send(chat, 'تم فكّ الربط.', { reply_markup: mainMenu(u) });
      break;
    case 'st': {
      const status = ST[a as StCode];
      if (!status) break;
      const { data, error } = await db.rpc('wash_bot_set_status', { p_booking: b, p_status: status, p_telegram_id: u.telegram_id });
      if (error) return answer(q.id as string, error.message.slice(0, 190));
      void poke();
      const r = data as { code: string; status: BookingStatus };
      // نصُّ الإشعار يبقى فوق السطر الجديد: صاحبُ المغسلة يقرأ من أكّد لا رمزاً وحدَه.
      await edit(chat, messageId, `${esc(msg.text as string)}\n\n✔️ ${ACTION_LABELS[r.status] ?? r.status} — #${r.code}`, { reply_markup: ownerButtons({ id: b, status: r.status }) });
      break;
    }
  }
  return answer(q.id as string);
}

async function onMessage(msg: Json, u: User) {
  const chat = (msg.chat as Json).id as number;
  const from = msg.from as Json;
  const text = String(msg.text ?? '').trim();

  if (msg.location) {
    const l = msg.location as { latitude: number; longitude: number };
    return nearby(chat, l.latitude, l.longitude);
  }
  if (msg.contact) {
    const c = msg.contact as { phone_number: string; user_id?: number };
    if (c.user_id !== from.id) return send(chat, '❌ شارك رقمك أنت، لا جهة اتصال أخرى.');
    if (u.step === 'link') return linkOwner(chat, u, c.phone_number);
    if (u.step === 'phone') {
      const phone = `0${phoneCore(c.phone_number)}`;
      if (!/^07\d{9}$/.test(phone)) return send(chat, '❌ رقمٌ عراقيٌّ يبدأ بـ07 فقط.');
      u.phone = phone;
      await db.from('wash_bot_users').update({ phone }).eq('telegram_id', u.telegram_id);
      return confirm(chat, u, u.draft ?? {});
    }
    return home(chat, u);
  }

  if (/^\/start|^\/menu/.test(text) || text === BTN.back) return home(chat, u);
  if (text === BTN.near) return send(chat, '📍 أرسل موقعك لأعرض أقرب المغاسل (لن يُحفظ موقعك).', { reply_markup: locationKb });
  if (text === BTN.city) return cityList(chat, '🏙 اختر مدينة:');
  if (text === BTN.mine) return myBookings(chat);
  if (text === BTN.my) return ownerToday(chat, u);
  if (text === BTN.owner) {
    await setDraft(u, 'link', null);
    return send(chat, '📱 شارك رقم المغسلة المسجّل للتحقق:', { reply_markup: contactKb('📱 مشاركة رقم المغسلة') });
  }
  const cancel = text.match(/^(?:\/cancel|إلغاء)\s*#?\s*(\d{6})$/);
  if (cancel) return askCancel(chat, cancel[1]);

  // اسمٌ آخر في شاشة التأكيد.
  if (u.step === 'confirm' && u.draft) {
    if (text.length < 2 || text.length > 40) return send(chat, 'الاسم من حرفين إلى 40 حرفاً.');
    u.name = text;
    await db.from('wash_bot_users').update({ name: text }).eq('telegram_id', u.telegram_id);
    return confirm(chat, u, u.draft);
  }
  return send(chat, WELCOME, { reply_markup: mainMenu(u) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  // تيليجرام يوقّع كلَّ نداءٍ بالسرّ المضبوط عند setWebhook.
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  try {
    const update = (await req.json()) as Json;
    const u = await touch(update);
    if (u) {
      if (update.callback_query) await onCallback(update.callback_query as Json, u);
      else if (update.message) await onMessage(update.message as Json, u);
    }
  } catch (err) {
    // لا يُترك تيليجرام يعيد المحاولة إلى الأبد على خطأ.
    console.error('wash-bot', err);
  }
  return new Response('ok');
});
