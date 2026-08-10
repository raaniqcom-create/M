// App Store screenshots, 6.5" (1284x2778), straight from the live site.
// Chrome is driven over CDP because the CLI --screenshot flag cannot set a
// device scale factor *and* run script before the page loads. The script it
// runs is the important part: faking Capacitor makes the site render the way
// it does inside the shells — no install banner, no "download the app".
//
// usage: node scripts/shoot-ios.mjs [name ...]   (default: all)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = process.env.SITE ?? 'https://muhta.online';
const OUT = 'store/ios';
const PORT = 9333;

// 428x926 @3x is the 6.5" iPhone — the only slot App Store Connect offers,
// and Apple scales it to every other size.
const VIEWPORT = { width: 428, height: 926, deviceScaleFactor: 3, mobile: true };

const SHOTS = [
  { name: '1-home', path: '/' },
  { name: '2-map', path: '/', act: showMap, settle: 4000 },
  // The list of stations is the app's whole point — the detail page is short
  // and left half the frame empty, so show several cards at once instead.
  { name: '3-list', path: '/', act: () => scrollTo(1500) },
  { name: '4-search', path: '/', act: () => clickLabel('بحث متقدم') },
  { name: '5-menu', path: '/', act: () => clickLabel('القائمة') },
  { name: '6-register', path: '/register' },
];

let ws, id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const evaluate = (expression) =>
  send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

// Buttons are labelled by their Arabic text, so find them by it.
const click = (text) =>
  evaluate(`[...document.querySelectorAll('button,a')]
    .find(e => e.textContent.includes(${JSON.stringify(text)}))?.click()`);

const clickLabel = (label) =>
  evaluate(`document.querySelector('[aria-label=${JSON.stringify(label)}]')?.click()`);

const scrollTo = (y) => evaluate(`window.scrollTo(0, ${y})`);

// The map sits below the fold, so switching to it is only half the shot.
async function showMap() {
  await click('خريطة');
  await sleep(1500);
  await evaluate(`document.querySelector('.leaflet-container')
    ?.scrollIntoView({ block: 'center' })`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const wanted = process.argv.slice(2);
  const shots = wanted.length ? SHOTS.filter((s) => wanted.includes(s.name)) : SHOTS;
  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}/chrome-shots`,
    'about:blank',
  ]);
  chrome.on('error', (e) => { throw e; });

  const target = await waitForTarget();
  ws = new WebSocket(target);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', VIEWPORT);
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios"};',
  });

  for (const shot of shots) {
    await send('Page.navigate', { url: SITE + shot.path });
    await sleep(4000); // data comes from Supabase after load, so wait past it
    if (shot.act) await shot.act();
    await sleep(shot.settle ?? 1200);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = `${OUT}/${shot.name}.png`;
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  }

  ws.close();
  chrome.kill();
}

async function waitForTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome never opened a debugging port');
}

await main();
