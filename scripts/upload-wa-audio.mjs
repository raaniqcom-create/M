// Uploads the recorded Arabic clips to Meta once and stores the media ids.
//
// Meta keeps an uploaded media id for 30 days, so a reply sends the id rather
// than the bytes: no per-message upload, no text-to-speech bill, and a real
// Iraqi voice instead of a news-reader accent. Re-run this when the ids age
// out or a clip is re-recorded.
//
// usage: WHATSAPP_TOKEN=… node scripts/upload-wa-audio.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? '1316252284896261';
const SUPABASE_URL = 'https://snlafcvuoxpxcdbtinsy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIR = 'audio';

if (!TOKEN) throw new Error('WHATSAPP_TOKEN is required');
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

const files = readdirSync(DIR).filter((f) => f.endsWith('.ogg'));
if (!files.length) throw new Error(`no .ogg files in ${DIR}/`);

const rows = [];

for (const file of files) {
  const key = basename(file, '.ogg');
  const bytes = readFileSync(join(DIR, file));

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  // audio/ogg with the opus codec is the only combination WhatsApp renders as
  // a playable voice note; anything else arrives as a file attachment that the
  // people this feature exists for cannot open.
  form.append('type', 'audio/ogg');
  form.append('file', new Blob([bytes], { type: 'audio/ogg' }), file);

  const res = await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const body = await res.json();

  if (!res.ok || !body.id) {
    console.error(`✗ ${key}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    continue;
  }
  console.log(`✓ ${key} → ${body.id}`);
  rows.push({ key, media_id: body.id, uploaded_at: new Date().toISOString() });
}

if (!rows.length) throw new Error('nothing uploaded');

const save = await fetch(`${SUPABASE_URL}/rest/v1/wa_audio?on_conflict=key`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  },
  body: JSON.stringify(rows),
});

if (!save.ok) throw new Error(`saving ids failed: ${save.status} ${await save.text()}`);
console.log(`\nstored ${rows.length} media ids in wa_audio`);
