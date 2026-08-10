// Renders local HTML to A4 PDF through headless Chrome over CDP.
//
// Same reason as the store screenshots: Arabic shaping and the Tajawal
// webfont only come out right in a real browser engine. Every PDF library
// tried here either broke the letter joining or dropped the font.
//
// usage: node scripts/print-pdf.mjs docs/anbar-oil/letter.html [more.html ...]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9444;

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: node scripts/print-pdf.mjs <file.html> ...');

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  // local CSS and the icon are read straight off disk next to the html
  '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/chrome-pdf`,
  'about:blank',
]);
chrome.on('error', (e) => { throw e; });

ws = new WebSocket(await waitForTarget());
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
};

await send('Page.enable');

let clipped = false;

for (const file of files) {
  const url = pathToFileURL(resolve(file)).href;
  await send('Page.navigate', { url });
  await sleep(3500); // the webfont has to land before layout is final

  // Sheets are fixed-height with overflow hidden, so a page that is too full
  // prints silently truncated — the PDF looks right and the last paragraph is
  // simply gone. Measure it rather than trust the page count.
  const { result } = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('.sheet')]
      .map((s, i) => ({ page: i + 1, over: s.scrollHeight - s.clientHeight }))
      .filter((x) => x.over > 0))`,
    returnByValue: true,
  });
  const over = JSON.parse(result.value);

  const { data } = await send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
  });
  const out = file.replace(/\.html$/, '.pdf');
  writeFileSync(out, Buffer.from(data, 'base64'));

  if (over.length) {
    clipped = true;
    console.log(`${out}  ✗ CLIPPED ${over.map((o) => `p${o.page}:${o.over}px`).join(' ')}`);
  } else {
    console.log(`${out}  ✓ fits`);
  }
}

ws.close();
chrome.kill();
if (clipped) process.exitCode = 1;
