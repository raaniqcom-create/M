// «غسيل» — دقّةُ المغاسل: انتهاءٌ وتذكيرٌ وتنبيهاتٌ، ثمّ تفريغُ صندوق الإشعارات.
//
// بابان: الكرونُ كلَّ عشر دقائق بـ`x-cron-secret` (يشغّل wash_tick() ثمّ يُفرّغ)،
// والنكزةُ من المتصفّح بمفتاح anon بعد حجزٍ أو تغييرِ حالة (تُفرّغ فقط، بلا جسمٍ
// يُقرأ — كما admin-alert: النصُّ يُركَّب من القاعدة لا من المتصل).
//
// ── عقدُ العزل ────────────────────────────────────────────────────────────
// لا alerts_for ولا announce ولا notify: الهدفُ جهازُ الحجز نفسِه (wash_bookings.device)
// وجهازُ المالك (car_washes.owner_device). قراءةُ device_tokens/alerts نقطيّةٌ وبلا
// كتابة — الرمزُ الميّت يُكتب في wash_events.error لا يُحذف من جدول وقود.
// ونقلُ FCM/APNs/webpush منسوخٌ من test-push عمداً: دالّةٌ مستقلّةٌ لا تُسقط غيرَها.
// وقناةٌ رابعة: تيليجرام — بوتُ «محطة الغسل» (wash-bot). المالكُ المربوطُ في wash_bot_users
// تصله الحجوزاتُ بأزرار تأكيد/إلغاء، والزبونُ الذي حجز من البوت (device = 'tg:<chat>') تصله
// إشعاراتُه هناك. الرمزُ WASH_TELEGRAM_BOT_TOKEN وحدَه — لا مفتاحَ بوت الوقود.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { esc, ownerButtons, starButtons } from '../_shared/washBot.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const TG = Deno.env.get('WASH_TELEGRAM_BOT_TOKEN');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** النكزاتُ تتكاثر بعد كلّ ضغطة؛ تفريغٌ واحدٌ كلَّ خمسَ عشرةَ ثانيةً يكفي. */
let lastFlush = 0;

// ── النقل (نسخةُ test-push) ─────────────────────────────────────────────
function pemToPkcs8(pem: string): Uint8Array {
  const decode = (text: string): Uint8Array => {
    const stripped = text.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').split(/\s/).join('');
    const raw = atob(stripped);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };
  let bytes = decode(pem);
  if (bytes[0] !== 0x30) {
    const inner = new TextDecoder().decode(bytes);
    if (inner.includes('PRIVATE KEY')) bytes = decode(inner);
  }
  return bytes;
}
const b64url = (v: Uint8Array | string) =>
  btoa(typeof v === 'string' ? v : String.fromCharCode(...v)).split('+').join('-').split('/').join('_').replace(/=+$/, '');

async function sendApns(token: string, title: string, body: string, url: string): Promise<string | null> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  const topic = Deno.env.get('APNS_TOPIC') ?? 'online.muhta.app';
  if (!keyId || !teamId || !pem) return 'أسرار APNs ناقصة';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'ES256', kid: keyId })) + '.' + b64url(JSON.stringify({ iss: teamId, iat: now }));
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  const res = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST',
    headers: { authorization: `bearer ${unsigned}.${b64url(sig)}`, 'apns-topic': topic, 'apns-push-type': 'alert', 'apns-priority': '10' },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: 'alert.caf', 'interruption-level': 'time-sensitive' }, url }),
  });
  return res.ok ? null : `apns ${res.status}: ${(await res.text()).slice(0, 100)}`;
}

let fcmToken: { value: string; exp: number } | null = null;
async function fcmAccessToken(sa: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body).slice(0, 140));
  fcmToken = { value: body.access_token as string, exp: Date.now() + 3500_000 };
  return fcmToken.value;
}
async function sendFcm(token: string, title: string, body: string, url: string): Promise<string | null> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return 'سرّ Firebase غير مضبوط';
  const sa = JSON.parse(raw);
  const access = await fcmAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { token, notification: { title, body }, data: { url }, android: { priority: 'HIGH', notification: { channel_id: 'muhta_alerts', sound: 'alert' } } },
    }),
  });
  return res.ok ? null : `fcm ${res.status}: ${(await res.text()).slice(0, 100)}`;
}
async function sendWeb(endpoint: string, keys: { p256dh?: string; auth?: string } | null, title: string, body: string, url: string): Promise<string | null> {
  if (!keys?.p256dh || !keys?.auth) return 'مفاتيحُ المتصفّح ناقصة';
  try {
    webpush.setVapidDetails('mailto:admin@muhta.online', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    await webpush.sendNotification({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, JSON.stringify({ title, body, url }));
    return null;
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    return `web ${err.statusCode ?? ''}: ${(err.body ?? err.message ?? String(e)).slice(0, 100)}`;
  }
}
async function sendTg(chat: string, text: string, reply_markup?: unknown): Promise<string | null> {
  if (!TG) return 'رمزُ بوت الغسل غير مضبوط';
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', reply_markup }),
  });
  return res.ok ? null : `tg ${res.status}: ${(await res.text()).slice(0, 100)}`;
}

// ── الأنواعُ والنصوص ──────────────────────────────────────────────────────
type Ev = { id: number; wash_id: string; booking_id: string | null; kind: string; payload: Record<string, unknown> | null };
type Booking = { id: string; code: string; name: string; phone: string; car: string | null; service_name: string; starts_at: string; device: string | null; wash_id: string };
type Wash = { id: string; name: string; owner_device: string | null; owner_platform: string | null; owner_keys: { p256dh?: string; auth?: string } | null };

const OWNER_KINDS = new Set(['new', 'cancelled', 'review', 'expiry_7', 'expiry_3', 'expiry_1', 'expiry_0']);
const CITIZEN_KINDS = new Set(['confirmed', 'cancelled_by_business', 'in_service', 'completed', 'reminder', 'expired']);

/** أزرارُ تيليجرام تحت الإشعار: تأكيد/إلغاء للمالك على حجزٍ معلّق، ونجومٌ للزبون بعد الاكتمال. */
const tgButtons = (ev: Ev, b: Booking | null) =>
  ev.kind === 'new' && ev.payload?.status === 'pending' && b ? ownerButtons({ id: b.id, status: 'pending' })
  : ev.kind === 'completed' && b ? starButtons(b.code)
  : undefined;

const when = (iso: string) =>
  new Date(iso).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'long', hour: '2-digit', minute: '2-digit' });

/** نصُّ الإشعار من القاعدة وحدَها — لا شيءَ من المتصل. */
function compose(ev: Ev, b: Booking | null, w: Wash): { title: string; body: string; url: string } | null {
  const bookingUrl = b ? `/wash/booking/?code=${encodeURIComponent(b.code)}&p=${encodeURIComponent(b.phone)}` : '/wash/';
  switch (ev.kind) {
    case 'new':
      if (ev.payload?.walk_in) return null;
      return b && { title: `حجزٌ جديد — ${w.name}`, body: `${b.name}${b.car ? ` · ${b.car}` : ''} · ${b.service_name} · ${when(b.starts_at)}${ev.payload?.status === 'confirmed' ? ' (مؤكَّدٌ تلقائيّاً)' : ' — بانتظار تأكيدك'}`, url: '/wash/owner/' };
    case 'cancelled':
      return b && { title: `ألغى الزبون حجزه — ${w.name}`, body: `${b.name} · ${b.service_name} · ${when(b.starts_at)}${ev.payload?.late ? ' (إلغاءٌ متأخّر)' : ''}`, url: '/wash/owner/' };
    case 'review':
      return { title: `تقييمٌ جديد — ${w.name}`, body: `${'★'.repeat(Number(ev.payload?.stars ?? 0))}${ev.payload?.comment ? ` — ${String(ev.payload.comment).slice(0, 100)}` : ''}`, url: '/wash/owner/' };
    case 'expiry_7':
    case 'expiry_3':
    case 'expiry_1':
    case 'expiry_0': {
      const d = Number(ev.payload?.days ?? 0);
      return { title: `اشتراك ${w.name}`, body: d === 0 ? 'ينتهي اشتراكك اليوم — جدّده كي تبقى صفحتك ظاهرة' : `ينتهي اشتراكك بعد ${d === 1 ? 'يومٍ واحد' : `${d} أيّام`} — جدّده من لوحتك`, url: '/wash/owner/' };
    }
    case 'confirmed':
      return b && { title: `أكّدت ${w.name} حجزك`, body: `${b.service_name} · ${when(b.starts_at)} · رمزك ${b.code}`, url: bookingUrl };
    case 'cancelled_by_business':
      return b && { title: `ألغت ${w.name} حجزك`, body: `${b.service_name} · ${when(b.starts_at)} — نعتذر، احجز موعداً آخر من التطبيق`, url: bookingUrl };
    case 'in_service':
      return b && { title: `بدأ غسل سيارتك — ${w.name}`, body: `${b.service_name} · سنخبرك حين تكتمل`, url: bookingUrl };
    case 'completed':
      return b && { title: `اكتملت الخدمة — ${w.name}`, body: 'شكراً لك! قيّم تجربتك بضغطة واحدة', url: bookingUrl };
    case 'reminder':
      return b && { title: `موعدك بعد ساعة — ${w.name}`, body: `${b.service_name} · ${when(b.starts_at)} · رمزك ${b.code}`, url: bookingUrl };
    case 'expired':
      return b && { title: 'انتهى حجزك دون ردّ', body: 'لم تؤكّد المغسلة في الوقت — احجز موعداً آخر', url: bookingUrl };
    default:
      return null;
  }
}

/** يفرّغ ≤٢٠٠ حدثٍ غيرِ مرسَل خلال يوم. dry = يعدّ ولا يرسل ولا يختم. */
async function flush(dry: boolean) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: events, error } = await db
    .from('wash_events')
    .select('id, wash_id, booking_id, kind, payload')
    .is('sent_at', null)
    .is('error', null)
    .gte('created_at', since)
    .order('id')
    .limit(200);
  if (error) return { error: error.message };
  const evs = (events ?? []) as Ev[];
  const actionable = evs.filter((e) => OWNER_KINDS.has(e.kind) || CITIZEN_KINDS.has(e.kind));
  const silent = evs.filter((e) => !OWNER_KINDS.has(e.kind) && !CITIZEN_KINDS.has(e.kind));
  // ما لا يُرسل (وصل، لم يحضر، فات، ملاحظة…) يُختم فلا يُقرأ ثانيةً.
  if (silent.length && !dry) await db.from('wash_events').update({ sent_at: new Date().toISOString() }).in('id', silent.map((e) => e.id));
  if (!actionable.length) return { sent: 0, failed: 0, skipped: silent.length };

  const bookingIds = [...new Set(actionable.map((e) => e.booking_id).filter(Boolean))] as string[];
  const washIds = [...new Set(actionable.map((e) => e.wash_id))];
  const [{ data: bookings }, { data: washes }, { data: sentToday }, { data: tgUsers }] = await Promise.all([
    bookingIds.length ? db.from('wash_bookings').select('id, code, name, phone, car, service_name, starts_at, device, wash_id').in('id', bookingIds) : Promise.resolve({ data: [] }),
    db.from('car_washes').select('id, name, owner_device, owner_platform, owner_keys').in('id', washIds),
    db.from('wash_events').select('wash_id').in('wash_id', washIds).gte('sent_at', new Date(Date.now() - 86_400_000).toISOString()).gt('sent_n', 0),
    db.from('wash_bot_users').select('wash_id, chat_id').in('wash_id', washIds),
  ]);
  const bById = new Map(((bookings ?? []) as Booking[]).map((b) => [b.id, b]));
  const wById = new Map(((washes ?? []) as Wash[]).map((w) => [w.id, w]));
  // محادثاتُ تيليجرام لكلّ مغسلة (المالكُ وموظّفوه المربوطون).
  const tgByWash = new Map<string, number[]>();
  for (const r of (tgUsers ?? []) as { wash_id: string; chat_id: number }[]) tgByWash.set(r.wash_id, [...(tgByWash.get(r.wash_id) ?? []), r.chat_id]);
  const capUsed = new Map<string, number>();
  for (const r of (sentToday ?? []) as { wash_id: string }[]) capUsed.set(r.wash_id, (capUsed.get(r.wash_id) ?? 0) + 1);
  const { data: capRow } = await db.from('app_config').select('value').eq('key', 'wash_push_daily_cap').maybeSingle();
  const cap = Number(capRow?.value ?? 200) || 200;

  let sent = 0, failed = 0;
  const preview: { id: number; kind: string; to: string; title: string }[] = [];
  const log: { address: string; kind: string; title: string; body: string }[] = [];

  for (const ev of actionable) {
    const w = wById.get(ev.wash_id);
    const b = ev.booking_id ? bById.get(ev.booking_id) ?? null : null;
    const mark = async (patch: Record<string, unknown>) => { if (!dry) await db.from('wash_events').update(patch).eq('id', ev.id); };
    if (!w) { await mark({ error: 'لا مغسلة' }); failed++; continue; }
    const text = compose(ev, b, w);
    if (!text) { await mark({ sent_at: new Date().toISOString() }); continue; }

    // الهدف: المالكُ من صفّ المغسلة (وتيليجرام يغلب حين مربوط)، والزبونُ من عنوان حجزه
    // (تيليجرام 'tg:<chat>' أو webpush أو رمزُ جهاز).
    let address: string | null = null, platform: string | null = null, keys: Wash['owner_keys'] = null;
    const tgChats = tgByWash.get(w.id);
    if (OWNER_KINDS.has(ev.kind) && tgChats?.length) {
      address = tgChats.join(','); platform = 'tg';
    } else if (OWNER_KINDS.has(ev.kind)) {
      address = w.owner_device; platform = w.owner_platform; keys = w.owner_keys;
    } else if (b?.device?.startsWith('tg:')) {
      address = b.device.slice(3); platform = 'tg';
    } else if (b?.device) {
      address = b.device;
      if (address.startsWith('https://')) {
        platform = 'web';
        const { data: a } = await db.from('alerts').select('keys').eq('address', address).limit(1).maybeSingle();
        keys = (a?.keys as Wash['owner_keys']) ?? null;
      } else {
        const { data: d } = await db.from('device_tokens').select('platform').eq('token', address).maybeSingle();
        platform = d?.platform ?? null;
      }
    }
    if (!address || !platform) { await mark({ error: 'لا جهاز' }); failed++; continue; }
    if ((capUsed.get(w.id) ?? 0) >= cap) { await mark({ error: 'سقفُ اليوم' }); failed++; continue; }

    preview.push({ id: ev.id, kind: ev.kind, to: platform, title: text.title });
    if (dry) continue;
    let err: string | null, sentN = 1;
    if (platform === 'tg') {
      // فيضٌ على محادثاتِ المغسلة: وصل لواحدةٍ = وصل. المحظورُ (403) يُفكّ ربطُه فلا يُرسَل إليه ثانية.
      const chats = address.split(',');
      const errs = await Promise.all(chats.map((c) => sendTg(c, `<b>${esc(text.title)}</b>\n${esc(text.body)}`, tgButtons(ev, b))));
      errs.forEach((e, i) => e && console.error('tg', chats[i], e));
      const dead = chats.filter((_, i) => errs[i]?.startsWith('tg 403')).map(Number);
      if (dead.length) await db.from('wash_bot_users').update({ wash_id: null }).in('chat_id', dead);
      sentN = errs.filter((e) => !e).length;
      err = sentN ? null : errs[0];
    } else {
      err = platform === 'web' ? await sendWeb(address, keys, text.title, text.body, text.url)
        : platform === 'ios' ? await sendApns(address, text.title, text.body, text.url)
        : await sendFcm(address, text.title, text.body, text.url);
    }
    if (err) { await mark({ error: err.slice(0, 200) }); failed++; continue; }
    await mark({ sent_at: new Date().toISOString(), sent_n: sentN });
    capUsed.set(w.id, (capUsed.get(w.id) ?? 0) + 1);
    sent++;
    log.push({ address, kind: `wash:${ev.kind}`, title: text.title, body: text.body });
  }
  if (log.length) await db.from('notification_log').insert(log).then(({ error: e }) => e && console.error('notification_log', e.message));
  return dry ? { would_send: preview.length, preview, skipped: silent.length } : { sent, failed, skipped: silent.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const isCron = !!CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET;
  const dry = new URL(req.url).searchParams.get('dry') === '1';

  // النكزةُ من المتصفّح: تفريغٌ فقط، وبفاصلٍ — النصُّ لا يُقرأ من الطلب أبداً.
  if (!isCron) {
    if (Date.now() - lastFlush < 15_000) return json({ ok: true, debounced: true });
    lastFlush = Date.now();
    const out = await flush(false);
    return json({ ok: true, ...out });
  }

  const { data: tick, error } = await db.rpc('wash_tick');
  if (error) console.error('wash_tick', error.message);
  const out = await flush(dry);
  return json({ ok: true, tick: tick ?? null, tickError: error?.message ?? null, ...out });
});
