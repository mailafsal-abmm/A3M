// ── Masjid Azan Clock — Push Notification Server ──────────────────────────
// This tiny server is what makes background alerts reliable even during
// long gaps (Isha → Fajr, Fajr → Dhuhr) when the phone app is fully closed.
//
// How it works:
//   1. When someone enables notifications in the app, their phone "subscribes"
//      to this server (one-time, automatic).
//   2. Once a day (whenever the app is opened), the app sends today's exact
//      prayer schedule to this server.
//   3. This server checks every 30 seconds: "is it time to send anyone a
//      5-minutes-before alert or an azan-time alert?" If yes, it sends a
//      real Web Push message — which can wake a closed browser/PWA, unlike
//      a timer running inside the app itself.
//
// You need to deploy this file somewhere it can run 24/7 (see DEPLOY.md).

const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Allow the PWA (hosted on any domain) to call this server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── VAPID keys — identify this server to push services (generated once) ───
// For real deployment, set these as environment variables instead of
// hardcoding, so the private key isn't sitting in your code.
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || 'BHROuGwJuNCj5a8jVzzZHbgtpTK_tq-Vy27huiT0UjclO74NF5r1UADR0wJoM4BP_-boaNwhtkbaT1Y5pr4Zj-Y';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'eyQVqZSNJhmpqixU_wL54YuikQ3iSN6DpJeNgQxCrNw';

webpush.setVapidDetails(
  'mailto:admin@example.com', // contact — change to your real email if you like
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// ── Storage — a simple JSON file is plenty for a single masjid's traffic ──
const DB_FILE = path.join(__dirname, 'subscriptions.json');

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { return {}; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// db shape: { [endpoint]: { subscription, prayers: [...], sent: {tag:true} } }

// ── Routes ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/vapid-public-key', (req, res) => res.json({ publicKey: VAPID_PUBLIC_KEY }));

// Called once when the user enables notifications
app.post('/subscribe', (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  const db = loadDB();
  db[subscription.endpoint] = db[subscription.endpoint] || {};
  db[subscription.endpoint].subscription = subscription;
  db[subscription.endpoint].prayers = db[subscription.endpoint].prayers || [];
  db[subscription.endpoint].sent = db[subscription.endpoint].sent || {};
  saveDB(db);
  res.json({ ok: true });
});

// Called when the user disables notifications
app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  const db = loadDB();
  delete db[endpoint];
  saveDB(db);
  res.json({ ok: true });
});

// Called once a day (whenever the app is opened) with today's exact times,
// including the user's manual +/- adjustments — this server never needs to
// know the prayer-time calculation itself, it just trusts what the app sends.
app.post('/schedule', (req, res) => {
  const { endpoint, prayers } = req.body;
  if (!endpoint || !Array.isArray(prayers)) {
    return res.status(400).json({ error: 'Missing endpoint or prayers' });
  }
  const db = loadDB();
  if (!db[endpoint]) return res.status(404).json({ error: 'Not subscribed' });
  db[endpoint].prayers = prayers;
  // Reset "sent" flags for a new day's schedule so today's alerts fire fresh
  db[endpoint].sent = {};
  saveDB(db);
  res.json({ ok: true });
});

// ── The scheduler — checks every 30 seconds ────────────────────────────
const FIVE_MIN = 5 * 60 * 1000;
const WINDOW   = 45 * 1000; // fire if within 45s of the target — matches the 30s tick

function tick() {
  const db = loadDB();
  const now = Date.now();
  let changed = false;

  for (const endpoint of Object.keys(db)) {
    const entry = db[endpoint];
    if (!entry.subscription || !Array.isArray(entry.prayers)) continue;

    for (const p of entry.prayers) {
      const checks = [
        { tag: p.key + '_azan5', at: p.azanMs - FIVE_MIN,
          title: '🕌 ' + p.nameTm + ' Azan in 5 minutes',
          body:  p.nameTm + ' prayer starts in 5 minutes' },
        { tag: p.key + '_azan',  at: p.azanMs,
          title: '🕌 ' + p.nameTm + ' Prayer Time',
          body:  p.nameTm + ' azan time now' },
      ];

      for (const c of checks) {
        if (entry.sent[c.tag]) continue;
        if (now >= c.at && now - c.at <= WINDOW) {
          sendPush(entry.subscription, c.title, c.body, c.tag, endpoint, db);
          entry.sent[c.tag] = true;
          changed = true;
        }
      }
    }
  }

  if (changed) saveDB(db);
}

function sendPush(subscription, title, body, tag, endpoint, db) {
  const payload = JSON.stringify({ title, body, tag });
  webpush.sendNotification(subscription, payload).catch(err => {
    // 410/404 means the subscription is dead (user uninstalled, cleared data, etc.)
    if (err.statusCode === 404 || err.statusCode === 410) {
      delete db[endpoint];
      saveDB(db);
    } else {
      console.error('Push failed:', err.statusCode, err.body);
    }
  });
}

setInterval(tick, 30 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Azan push server running on port ' + PORT));
