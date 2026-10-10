// A v1 do Klick instalou um service worker em /sw.js. Este o substitui: limpa o cache da v1,
// se desinstala e recarrega as abas abertas, que passam a carregar o protótipo da rede.
// Os dados salvos (localStorage) não são tocados.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
