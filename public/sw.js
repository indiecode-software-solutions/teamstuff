const CACHE_NAME = "teamstuff-offline-v8";
const ASSETS_TO_CACHE = [
  "/login",
  "/no_internet.gif",
  "/favicon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => {
          return cache.add(asset).catch((err) => {
            console.warn(`Failed to precache asset [${asset}]:`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Never intercept requests on localhost / 127.0.0.1 during development
  if (
    self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1" ||
    self.location.hostname === "0.0.0.0"
  ) {
    return;
  }

  // Only intercept GET requests, exclude Supabase API calls & Vite/Dev server internals
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("supabase.co") ||
    event.request.url.includes("/api/") ||
    event.request.url.includes("/@id/") ||
    event.request.url.includes("/@vite/") ||
    event.request.url.includes("virtual:") ||
    event.request.url.includes("__vite_ping")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh version in the background to update cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Dynamically cache successful HTML pages and core assets
          if (networkResponse.status === 200) {
            const contentType = networkResponse.headers.get("content-type");
            const isHtml = contentType && contentType.includes("text/html");
            const isAsset =
              event.request.url.includes("/assets/") ||
              event.request.url.includes(".js") ||
              event.request.url.includes(".css") ||
              event.request.url.includes(".png") ||
              event.request.url.includes(".gif");

            if (isHtml || isAsset) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
          }
          return networkResponse;
        })
        .catch(async (error) => {
          // If offline and request is an HTML page/navigation
          if (event.request.headers.get("accept")?.includes("text/html")) {
            // Try matching the specific requested route first
            const routeResponse = await caches.match(event.request);
            if (routeResponse) return routeResponse;

            // Fallback to cached '/login' (acts as the single-page app shell)
            const loginResponse = await caches.match("/login");
            if (loginResponse) return loginResponse;

            // Fallback to cached '/'
            const rootResponse = await caches.match("/");
            if (rootResponse) return rootResponse;
          }

          // Fallback to cached offline GIF
          if (event.request.url.includes("no_internet.gif")) {
            const gifResponse = await caches.match("/no_internet.gif");
            if (gifResponse) return gifResponse;
          }

          // If no fallback matches, throw the error so the browser registers the network failure
          throw error;
        })
    })
  );
});
