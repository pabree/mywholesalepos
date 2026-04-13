const CACHE_NAME = "staff-app-v41";
const APP_BUILD = "2026-04-13.3";
const APP_SHELL = [
    "/",
    `/static/style.css?v=${APP_BUILD}`,
    `/static/app.js?v=${APP_BUILD}`,
    "/manifest.json",
    "/static/staff-icon-192.png",
    "/static/staff-icon-512.png",
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
                    caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
                    return response;
                })
                .catch(() => caches.match("/"))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((response) => {
                    if (shouldCacheAsset(request, url, response)) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
        })
    );
});

function shouldCacheAsset(request, url, response) {
    if (url.origin !== self.location.origin) return false;
    if (!response || !response.ok) return false;

    const destination = request.destination || "";
    if (destination === "document") return false;

    const assetKind = getAssetKind(request, url, destination);
    if (!assetKind) return false;

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType) return false;
    if (contentType.includes("text/html")) return false;

    if (assetKind === "style") return contentType.includes("text/css");
    if (assetKind === "script") return contentType.includes("javascript");
    if (assetKind === "image") return contentType.includes("image/");
    if (assetKind === "font") return contentType.includes("font/") || contentType.includes("application/font");

    return false;
}

function getAssetKind(request, url, destination) {
    if (destination === "style" || destination === "script" || destination === "image" || destination === "font") {
        return destination;
    }

    const path = url.pathname.toLowerCase();
    if (path.endsWith(".css")) return "style";
    if (path.endsWith(".js")) return "script";
    if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".webp") || path.endsWith(".svg")) {
        return "image";
    }
    if (path.endsWith(".woff") || path.endsWith(".woff2") || path.endsWith(".ttf")) return "font";

    return "";
}
