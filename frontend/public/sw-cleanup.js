/*
 * Dimuat oleh service worker Workbox (vite.config.ts → workbox.importScripts).
 * Saat SW baru aktif, hapus cache runtime lama yang menyimpan respons GET /api
 * (audit T-08): isinya bisa PII, berkas ekspor, media privat, dan request
 * beserta header Authorization. Precache app-shell (workbox-precache-*) tidak
 * disentuh. Daftar nama harus sama dengan LEGACY_API_CACHES di
 * src/services/session.ts.
 */
self.addEventListener('activate', function (event) {
  var LEGACY_API_CACHES = ['api-get-cache'];
  event.waitUntil(
    Promise.all(
      LEGACY_API_CACHES.map(function (name) {
        return caches.delete(name).catch(function () {
          return false;
        });
      }),
    ),
  );
});
