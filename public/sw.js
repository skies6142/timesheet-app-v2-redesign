// TimeSheet Service Worker — handles timer notifications + offline shell

const CACHE_NAME = 'timesheet-v5';
const SHELL = ['/index.html', '/manifest.json'];

// ── Install ────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
  );
});

// ── Activate ───────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Notification click / action ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const action = event.action; // 'pause' | 'resume' | 'stop' | '' (body tap)

  // ── Pause / Resume — do NOT close the notification.
  // The app will call showNotification() with the updated state, which replaces
  // the existing notification via the same tag. Closing first causes the flicker
  // the user sees as a "clock out".
  if (action === 'pause' || action === 'resume') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        if (list.length > 0) {
          list.forEach((c) => c.postMessage({ type: `TIMER_${action.toUpperCase()}` }));
        } else {
          // App was killed — reopen it with the action as a URL param
          return clients.openWindow(`/?timer_action=${action}`);
        }
      })
    );
    return; // exit — do not close notification here
  }

  // ── Stop / body-tap — close the notification, then open/focus the app
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (action === 'stop') {
        // Ask the app to show the clock-out confirmation dialog
        if (list.length > 0) {
          list.forEach((c) => c.postMessage({ type: 'TIMER_STOP_CONFIRM' }));
          for (const c of list) if ('focus' in c) return c.focus();
        } else {
          // App not running — open it; it will read the URL param on load
          return clients.openWindow('/?pending_action=stop_confirm');
        }
      } else {
        // Body tap — just focus or open the app
        for (const c of list) if ('focus' in c) return c.focus();
        return clients.openWindow('/');
      }
    })
  );
});
