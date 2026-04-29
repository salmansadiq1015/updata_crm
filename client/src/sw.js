import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      urlPattern: /\/api\/v1\/mobile\/orders/,
      method: 'GET',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'mobile-orders',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/api\/v1\/mobile\/catalog/,
      method: 'GET',
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'mobile-catalog',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/api\/v1\/mobile\/orders\/.*\/documents\/.*\/download/,
      method: 'GET',
      handler: 'CacheFirst',
      options: {
        cacheName: 'mobile-documents',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/api\/v1\/mobile\//,
      method: 'GET',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'mobile-api',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 300,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
