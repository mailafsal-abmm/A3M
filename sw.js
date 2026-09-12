const CACHE='masjid-azan-clock-v9';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-512-maskable.png'])))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
let scheduledTimers=[];
self.addEventListener('message',e=>{
  const data=e.data||{};
  if(data.type==='SKIP_WAITING'){ self.skipWaiting(); return; }
  if(data.type==='SCHEDULE'){
    scheduledTimers.forEach(id=>clearTimeout(id));
    scheduledTimers=[];
    const now=Date.now();
    (data.prayers||[]).forEach(p=>{
      const notifyAt=p.azanMs-5*60*1000;
      if(notifyAt>now){
        scheduledTimers.push(setTimeout(()=>{
          self.registration.showNotification('🕌 '+p.nameTm+' Azan in 5 minutes',{ 
            body:p.nameTm+' prayer starts in 5 minutes',
            icon:'./icon-192.png',badge:'./icon-192.png',
            tag:p.key+'_azan5',vibrate:[200,100,200]
          });
        }, notifyAt-now));
      }
      if(p.azanMs>now){
        scheduledTimers.push(setTimeout(()=>{
          self.registration.showNotification('🕌 '+p.nameTm+' Prayer Time',{ 
            body:p.nameTm+' azan time now',
            icon:'./icon-192.png',badge:'./icon-192.png',
            tag:p.key+'_azan',vibrate:[300,150,300,150,300]
          });
        }, p.azanMs-now));
      }
    });
  }
});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match('./index.html'))))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.length?cs[0].focus():clients.openWindow('./')))});

// ── PUSH — this is what wakes the app even when fully closed for hours ────
// A real push message (unlike a setTimeout above) can be delivered by the
// browser/OS even after the service worker itself was shut down to save
// battery. This is what makes long gaps like Isha→Fajr reliable.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  const title = data.title || '🕌 Masjid Azan Clock';
  const body  = data.body  || 'Prayer time alert';
  const tag   = data.tag   || 'azan-push';
  e.waitUntil(self.registration.showNotification(title, {
    body, tag,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200,100,200]
  }));
});

// If the browser rotates/invalidates the push subscription, get a fresh one
// and tell the app so it can re-register with the server.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription ? e.oldSubscription.options : undefined)
      .then(sub => clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'PUSH_RESUBSCRIBED', subscription: sub }))))
      .catch(() => {})
  );
});
