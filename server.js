// ── Masjid Azan Clock — Push Notification Server (hardened)
// Improvements made:
// - Read VAPID contact from env and keep fallback for local dev
// - Atomic writes for subscriptions.json to reduce corruption
// - Recover from malformed subscriptions.json by renaming the bad file
// - Clear, structured logging for subscribe/unsubscribe/schedule/push events
// - Simple in-memory rate limiting on /schedule to avoid abuse
// - Process-level handlers for uncaught errors to avoid silent crashes

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
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── VAPID keys & contact — prefer environment variables in production ───
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || 'BHROuGwJuNCj5a8jVzzZHbgtpTK_tq-Vy27huiT0UjclO74NF5r1UADR0wJoM4BP_-boaNwhtkbaT1Y5pr4Zj-Y';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'eyQVqZSNJhmpqixU_wL54YuikQ3iSN6DpJeNgQxCrNw';
const VAPID_CONTACT     = process.env.VAPID_CONTACT || 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── Storage — a simple JSON file is fine for small deployments but ephemeral
const DB_FILE = path.join(__dirname, 'subscriptions.json');

function safeParseJSON(content) {
  try { return JSON.parse(content); }
  catch (e) { return null; }
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = safeParseJSON(raw);
    if (!parsed) {
      // Corrupted DB: move it aside and start fresh
      const badName = DB_FILE + '.corrupt-' + Date.now();
      try { fs.renameSync(DB_FILE, badName); console.warn('subscriptions.json corrupted; renamed to', badName); }
      catch (er) { console.error('Failed to rename corrupted DB file', er); }
      return {};
    }
    return parsed;
  } catch (e) {
    console.error('Failed to load DB', e);
    return {};
  }
}

// Atomic write: write to temp file then rename
function saveDB(db) {
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { encoding: 'utf8' });
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('Failed to save DB', e);
  }
}

// db shape: { [endpoint]: { subscription, prayers: [...], sent: {tag:true} } }

// ── Very small in-memory rate limiter for /schedule (per endpoint)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 6; // max 6 schedule updates per minute per endpoint
const rateMap = new Map(); // endpoint => { count, resetAt }

function allowRate(endpoint) {
  const now = Date.now();
  const rec = rateMap.get(endpoint);
  if (!rec || now > rec.resetAt) {
    rateMap.set(endpoint, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (rec.count >= RATE_LIMIT_MAX) return false;
  rec.count += 1;
  return true;
}

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
  console.log('Subscribed:', subscription.endpoint);
  res.json({ ok: true });
});

// Called when the user disables notifications
app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const db = loadDB();
  if (db[endpoint]) {
    delete db[endpoint];
    saveDB(db);
    console.log('Unsubscribed:', endpoint);
  }
  res.json({ ok: true });
});

// Called once a day (whenever the app is opened) with today's exact times.
app.post('/schedule', (req, res) => {
  const { endpoint, prayers } = req.body;
  if (!endpoint || !Array.isArray(prayers)) {
    return res.status(400).json({ error: 'Missing endpoint or prayers' });
  }

  if (!allowRate(endpoint)) {
    console.warn('Rate limit exceeded for', endpoint);
    return res.status(429).json({ error: 'Too many schedule updates, slow down' });
  }

  const db = loadDB();
  if (!db[endpoint]) return res.status(404).json({ error: 'Not subscribed' });
  db[endpoint].prayers = prayers;
  db[endpoint].sent = {};
  saveDB(db);
  console.log('Schedule updated for', endpoint, 'prayers:', prayers.length);
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
        if (entry.sent && entry.sent[c.tag]) continue;
        if (now >= c.at && now - c.at <= WINDOW) {
          sendPush(entry.subscription, c.title, c.body, c.tag, endpoint, db);
          entry.sent = entry.sent || {};
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
  webpush.sendNotification(subscription, payload).then(() => {
    console.log('Push sent:', endpoint, tag, title);
  }).catch(err => {
    // 410/404 means the subscription is dead (user uninstalled, cleared data, etc.)
    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
      delete db[endpoint];
      saveDB(db);
      console.log('Removed stale subscription:', endpoint);
    } else {
      console.error('Push failed for', endpoint, 'status:', err && err.statusCode, 'body:', err && err.body || err);
    }
  });
}

setInterval(tick, 30 * 1000);

// Global error handlers to keep the process alive for transient errors and
// ensure we log useful diagnostics in Render logs.
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Azan push server running on port ' + PORT));
