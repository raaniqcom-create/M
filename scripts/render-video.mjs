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
// which video: the ad (default) or the owner guide. Both are the same stage,
// the same renderer and the same cue-table contract — only the page differs.
const GUIDE = process.argv.includes('guide');
const PAGE = resolve(GUIDE ? 'docs/promo/guide.html' : 'docs/promo/explainer.html');
const AUDIO = resolve(GUIDE ? 'docs/promo/guide-audio.mp3' : 'docs/promo/voice.mp3');
const CUES = resolve(GUIDE ? 'docs/promo/guide-cues.json' : 'docs/promo/cues.json');
const OUTDIR = resolve('docs/promo');

const MODES = {
  wide: { w: 1920, h: 1080, vertical: false, out: GUIDE ? 'muhta-guide-1920x1080.mp4' : 'muhta-wide-1920x1080.mp4' },
  story: { w: 1080, h: 1920, vertical: true, out: GUIDE ? 'muhta-guide-1080x1920.mp4' : 'muhta-story-1080x1920.mp4' },
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
  // Deterministic capture. Without these the compositor can answer a
  // screenshot request with the previous frame still on screen, which showed
  // up as the guide flickering back to the previous scene for single frames.
  '--run-all-compositor-stages-before-draw',
  '--disable-new-content-rendering-timeout',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
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
    // Every piece of operator chrome, by id. This was a hand-written list of
    // three, and the guide's progress bar is #prog — so it was never removed:
    // an 8px green bar crept one pixel along the bottom of the frame for all
    // 4279 frames, the only moving thing in otherwise still scenes.
    for (const id of ['bar', 'note', 'hud', 'prog', 'rec', 'reclabel', 'hiderec']) {
      document.getElementById(id)?.remove();
    }
    const st = document.getElementById('stage');
    st.style.transform = 'translate(-50%, -50%) scale(1)';
    for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 0; } catch {} }
    const r = st.getBoundingClientRect();
    // Anything still animating outside the stage is operator chrome that the
    // removal list missed, and it will be baked into every frame. Naming it
    // here costs one check; finding it afterwards costs a whole re-render.
    const strays = [...new Set(document.getAnimations()
      .map((a) => a.effect?.target)
      .filter((t) => t && !st.contains(t))
      .map((t) => t.id || t.className || t.tagName))];
    return JSON.stringify({ w: st.offsetWidth, h: st.offsetHeight,
                            left: Math.round(r.left), top: Math.round(r.top),
                            strays });
  })()`);
  const g = JSON.parse(geom);
  if (g.w !== w || g.h !== h) throw new Error(`${name}: stage is ${g.w}x${g.h}, expected ${w}x${h}`);
  if (g.left !== 0 || g.top !== 0) throw new Error(`${name}: stage offset ${g.left},${g.top} — frame would be cropped`);
  if (g.strays.length) throw new Error(`${name}: animating outside the stage: ${g.strays.join(', ')} — add it to the removal list above`);

  // length comes from the cue table the soundtrack was built from —
  // a hard-coded number here would silently clip or pad the video
  const seconds = JSON.parse(readFileSync(CUES, 'utf8')).total;
  const total = Math.round(seconds * FPS);
  process.stdout.write(`${name} ${w}x${h}  ${total} frames  `);

  // A range, for checking a suspected glitch without re-rendering 4000 frames:
  //   FROM=395 TO=410 node scripts/render-video.mjs guide wide
  const from = Number(process.env.FROM ?? 0);
  const to = Number(process.env.TO ?? total - 1);

  for (let n = from; n <= to; n++) {
    const ms = (n / FPS) * 1000;
    // Scrub, then wait for the frame to actually be presented. Setting
    // currentTime only queues the change: the old code screenshotted straight
    // afterwards and sometimes got the previous frame back, so at every scene
    // change the video jumped back a scene for one or two frames. Two
    // requestAnimationFrames is the guarantee that a render pass has run.
    await evalIn(`new Promise((resolve) => {
      for (const a of document.getAnimations()) { try { a.currentTime = ${ms}; } catch {} }
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(1)));
    })`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(frames, String(n).padStart(5, '0') + '.png'), Buffer.from(data, 'base64'));
    if (n % 300 === 0) process.stdout.write('.');
  }
  process.stdout.write(' encoding ');

  const outPath = join(OUTDIR, out);
  await ffmpeg([
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-start_number', String(from),
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
