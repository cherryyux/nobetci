// Uygulama kabuğu önbellekten anında açılır; nöbet listesi her açılışta ağdan istenir,
// internet yoksa son indirilen liste gösterilir.
const V = 'nobetci-v4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => caches.open(V).then(c => c.put(req, res)).catch(() => {});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nöbet verisi: önce ağ, olmazsa önbellek.
  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) put(req, res.clone());
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true})));
    return;
  }

  // Sayfa ve yazı tipleri: önbellekten hemen, arkada güncelle.
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    }));
  }
});
