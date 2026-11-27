const scope = self.registration.scope;
const runtimeCache = 'codeforge-runtime:' + scope;
const runtimeAsset = /^runtime-v(\d+)\/(disk-size\.txt|eiffel\.ext4\.gz|load\.js|out\.js|xterm\.js|pty\.js|qemu-system-x86_64\.(?:data|wasm))$/;
const pending = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function fetchRuntime(request, [, version, asset]) {
    let cache;
    try {
        cache = await caches.open(runtimeCache);
        for (;;) {
            const cached = await cache.match(request.url);
            if (cached) return {response: cached, source: 'hit'};
            const active = pending.get(request.url);
            if (!active) break;
            await active;
        }
    } catch (error) {
        console.warn('CodeForge runtime cache unavailable', error);
    }

    const download = fetch(request).then(response => {
        const stored = cache && response.status === 200
            ? saveRuntime(cache, request.url, response.clone(), Number(version), asset)
            : undefined;
        return {response, source: 'miss', stored};
    });
    const completed = download.then(({stored}) => stored).catch(() => {}).finally(() => {
        pending.delete(request.url);
    });
    pending.set(request.url, completed);
    return download;
}

async function saveRuntime(cache, url, response, version, asset) {
    try {
        await cache.put(url, response);
        if (asset === 'eiffel.ext4.gz') {
            for (const entry of await cache.keys()) {
                const match = runtimeAsset.exec(entry.url.slice(scope.length));
                if (match && Number(match[1]) < version) await cache.delete(entry);
            }
        }
    } catch (error) {
        console.warn('CodeForge runtime could not be saved', error);
    }
}

self.addEventListener('fetch', event => {
    const {request} = event;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const asset = request.method === 'GET' && !request.headers.has('range') && request.url.startsWith(scope)
        ? runtimeAsset.exec(request.url.slice(scope.length))
        : null;
    const handled = asset
        ? fetchRuntime(request, asset)
        : fetch(request).then(response => ({response}));
    if (asset) event.waitUntil(handled.then(({stored}) => stored, () => {}));
    event.respondWith(handled.then(({response, source}) => {
        if (response.type === 'opaque' || response.type === 'opaqueredirect') return response;
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        if (source) headers.set('X-CodeForge-Runtime-Cache', source);
        return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    }));
});
