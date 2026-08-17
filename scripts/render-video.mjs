// Renders the explainer to a real video file, without screen capture.
//
// The in-page download button records what the browser is showing, so it is
// bounded by the window: a 1600px-wide window cannot feed a 1920px frame, and
// it needs a human to answer the share dialog. This does it properly instead —
// headless Chrome sized to the exact frame, the timeline scrubbed to each
// frame in turn, and every frame captured deterministically. Rendering slower
// than real time costs nothing because nothing here is real time.
//
// Audio is muxed in afterwards from the same voice.mp3 the page plays.
//
//   node scripts/render-video.mjs            # both sizes
//   node scripts/render-video.mjs wide       # 1920x1080 only
//   node scripts/render-video.mjs story      # 1080x1920 only
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9455;
const FPS = 30;
const PAGE = resolve('docs/promo/explainer.html');
const AUDIO = resolve('docs/promo/voice.mp3');
const CUES = resolve('docs/promo/cues.json');
const OUTDIR = resolve('docs/promo');

const MODES = {
  wide: { w: 1920, h: 1080, vertical: false, out: 'muhta-wide-1920x1080.mp4' },
  story: { w: 1080, h: 1920, vertical: true, out: 'muhta-story-1080x1920.mp4' },
};

const want = process.argv.slice(2).filter((a) => MODES[a]);
const modes = want.length ? want : Object.keys(MODES);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
let id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    pending.set(++id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome never opened a debugging port');
}

function ffmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(err.slice(-1200)))));
    p.on('error', rej);
  });
}

if (!existsSync(AUDIO)) throw new Error(`missing ${AUDIO}`);

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/chrome-video`,
  'about:blank',
]);
chrome.on('error', (e) => {
  throw e;
});

ws = new WebSocket(await waitForTarget());
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
};

await send('Page.enable');
await send('Runtime.enable');

const evalIn = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description ?? ''));
  return result.value;
};

for (const name of modes) {
  const { w, h, vertical, out } = MODES[name];
  const frames = join(process.env.TEMP, `muhta-frames-${name}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  // The viewport IS the frame, so the stage sits at scale 1 and no crop or
  // resample is involved anywhere in the pipeline.
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const url = pathToFileURL(PAGE).href + (vertical ? '?v=story' : '');
  await send('Page.navigate', { url });
  await sleep(4000); // the webfont must land before anything is captured

  // Strip the operator controls, freeze every animation, and confirm the
  // stage really is the full frame before a single frame is written.
  const geom = await evalIn(`(() => {
    document.getElementById('bar')?.remove();
    document.getElementById('note')?.remove();
    document.getElementById('hud')?.remove();
    const st = document.getElementById('stage');
    st.style.transform = 'translate(-50%, -50%) scale(1)';
    for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 0; } catch {} }
    const r = st.getBoundingClientRect();
    return JSON.stringify({ w: st.offsetWidth, h: st.offsetHeight,
                            left: Math.round(r.left), top: Math.round(r.top) });
  })()`);
  const g = JSON.parse(geom);
  if (g.w !== w || g.h !== h) throw new Error(`${name}: stage is ${g.w}x${g.h}, expected ${w}x${h}`);
  if (g.left !== 0 || g.top !== 0) throw new Error(`${name}: stage offset ${g.left},${g.top} — frame would be cropped`);

  // length comes from the cue table the soundtrack was built from —
  // a hard-coded number here would silently clip or pad the video
  const seconds = JSON.parse(readFileSync(CUES, 'utf8')).total;
  const total = Math.round(seconds * FPS);
  process.stdout.write(`${name} ${w}x${h}  ${total} frames  `);

  for (let n = 0; n < total; n++) {
    const ms = (n / FPS) * 1000;
    await evalIn(`(() => { for (const a of document.getAnimations()) { try { a.currentTime = ${ms}; } catch {} } return 1; })()`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(frames, String(n).padStart(5, '0') + '.png'), Buffer.from(data, 'base64'));
    if (n % 300 === 0) process.stdout.write('.');
  }
  process.stdout.write(' encoding ');

  const outPath = join(OUTDIR, out);
  await ffmpeg([
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', join(frames, '%05d.png'),
    '-i', AUDIO,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    outPath,
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`→ ${out}  ${(statSync(outPath).size / 1048576).toFixed(1)} MB`);
}

await send('Browser.close').catch(() => {});
chrome.kill();
process.exit(0);
