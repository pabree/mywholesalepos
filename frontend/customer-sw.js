const CACHE_NAME = "customer-app-v2";
const APP_SHELL = [
    "/customer/",
    "/static/customer.css",
    "/static/customer.js",
    "/static/customer-manifest.webmanifest",
    "/static/customer-icon-192.png",
    "/static/customer-icon-512.png",
    "/static/customer-icon.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put("/customer/", copy));
                    return response;
                })
                .catch(() => caches.match("/customer/"))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    if (url.origin === self.location.origin) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
        })
    );
});
