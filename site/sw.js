// Service worker: показывает уведомление, когда сервер присылает push (даже при закрытой вкладке).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // пустой обработчик: без него некоторые браузеры не предлагают установку как приложение
self.addEventListener('push', e => {
  e.waitUntil(self.registration.showNotification('Pixel Garden', {
    body: 'Растение скоро засохнет — полейте его!', tag: 'wilt', renotify: true,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  }));
});
