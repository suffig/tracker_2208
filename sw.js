const CACHE_NAME = 'fifa-tracker-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/main.js',
  '/auth.js',
  '/kader.js',
  '/matches.js',
  '/bans.js',
  '/finanzen.js',
  '/spieler.js',
  '/stats.js',
  '/modal.js',
  '/utils.js',
  '/supabaseClient.js',
  '/dataManager.js',
  '/data.js',
  '/connectionMonitor.js',
  '/css/tailwind-play-output.css',
  '/assets/flowbite-minimal.css',
  '/assets/fonts/fontawesome-icons.css',
  '/assets/mobile-menu.js',
  '/assets/logo.png'
];

// Install event - cache resources
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('SW: Cache opened');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.log('SW: Cache installation failed:', error);
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests and external URLs
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Clone the request because it's a stream
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(function(response) {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response because it's a stream
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(function(cache) {
              // Only cache GET requests for our domain
              if (event.request.method === 'GET' && 
                  event.request.url.startsWith(self.location.origin)) {
                cache.put(event.request, responseToCache);
              }
            });

          return response;
        }).catch(function() {
          // If both cache and network fail, return a custom offline page
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync for when connection is restored
self.addEventListener('sync', function(event) {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Here you could implement background sync logic
      // for syncing offline data when connection is restored
      console.log('SW: Background sync triggered')
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});