const CACHE = 'mathquest-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon.svg',
    './manifest.json',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Fira+Code:wght@500;700&display=swap',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    // Network-first para o Supabase (precisa estar fresco), cache-first para o resto
    if (req.url.includes('supabase.co')) {
        e.respondWith(fetch(req).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
        return;
    }
    e.respondWith(
        caches.match(req).then(hit => hit || fetch(req).then(res => {
            const copy = res.clone();
            if (res.ok) caches.open(CACHE).then(c => c.put(req, copy));
            return res;
        }).catch(() => caches.match('./index.html')))
    );
});
