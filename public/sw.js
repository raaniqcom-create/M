// Hand-written service worker. Replaced next-pwa/workbox: that pulled ~500
// packages and 7 high-severity advisories to generate what these ~70 lines do.
const CACHE = 'mahatta-v5';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/manifest.json'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache Supabase calls

  // navigations: network-first, fall back to the offline page
  //
  // و'no-cache' لا زينةً: الصفحة تُخدَم بـmax-age=600، فمتصفّحٌ يستجيب من
  // ذاكرته دون أن يسأل الخادم يبقى عشر دقائق على بناءٍ قديم — وHTML القديم
  // يشير إلى حزم قديمة، فيبقى الخطأ المُصلَح ظاهراً بعد نشر إصلاحه. وقع هذا:
  // شُحن إصلاح، وبقيت اللوحة تعرض رسالة النسخة السابقة.
  //
  // و'no-cache' لا يعني 'no-store': النسخة المخبّأة تبقى، ويُسأل الخادم عنها
  // فيردّ 304 في الغالب — تحقّقٌ رخيص، لا تنزيلٌ كامل.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .catch(() => fetch(request))
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // /_next/static filenames carry a content hash, so a hit is always current
  //
  // Retried rather than fetched once. These files are not optional: if the
  // stylesheet request fails, the whole app renders as raw HTML — bullet
  // lists, blue links, an icon at its natural size — and nothing on the page
  // says why. One dropped request is enough, and there are two ways to get
  // one: a deploy swapping the files out from under a page that is still
  // loading, and a phone on a weak connection. Both are ordinary here.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(request);
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
              return response;
            }
            // a 404 means this hash is genuinely gone — retrying cannot help
            if (response.status === 404) return response;
          } catch {
            /* network blip: fall through and try again */
          }
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
        return fetch(request);
      })
    );
    return;
  }

  // Everything else (icons, ad images, manifest) keeps its filename across
  // deploys, so cache-first would pin the first version forever. Serve the
  // cached copy for speed but refresh it in the background.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json(); // { title, body, stationId }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: payload.stationId, // a station's updates collapse instead of stacking
      data: { url: payload.url ?? `/station/${payload.stationId}` },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  // focus an existing tab if the app is already open
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes(url));
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
