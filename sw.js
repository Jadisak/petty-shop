/**
 * PETTY SHOP - Service Worker (ใช้งานออฟไลน์)
 * กลยุทธ์: ลองโหลดจากเน็ตก่อน (ได้เวอร์ชันใหม่เสมอเมื่อออนไลน์) ถ้าไม่มีเน็ตค่อยใช้ที่แคชไว้
 * เมื่อแก้ไฟล์แล้วปล่อยเวอร์ชันใหม่ ให้เปลี่ยน CACHE_VERSION ด้านล่างเพื่อล้างแคชเก่า
 */
const CACHE_VERSION = "petty-shop-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/qrcode.min.js",
  "./js/catalog-data.js",
  "./js/db.js",
  "./js/promptpay.js",
  "./js/audio.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // ฟอนต์ Google: แคชไว้ใช้ออฟไลน์ (ใช้ของเดิมก่อน)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // ไฟล์ภายนอกอื่น ๆ ให้เบราว์เซอร์จัดการเอง

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
