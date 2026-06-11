/* 特売ファインダー Service Worker — kill-switch 版
 *
 * これまでのキャッシュ優先SWが古いファイルを配信し続ける問題を根絶するため、
 * このSWは「自分自身を登録解除し、全キャッシュを削除して、制御中のページを
 * 再読み込みする」だけの動作にしている。
 * ブラウザはナビゲーション毎に sw.js を再検証するので、古いSWを持つ端末でも
 * 次回アクセス時にこのSWへ更新され、自動的にSWなし＝常に最新の状態へ移行する。 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
