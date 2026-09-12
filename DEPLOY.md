# Deploying the Azan Push Server (updated)

This document shows how to deploy the Azan Push Server so it runs reliably and securely on Render.com (recommended), with extra notes about persistence, VAPID keys, testing, and common deployment pitfalls.

## Quick summary (minimum to go live)
1. Push these files to your GitHub repo: `server.js`, `package.json`, `subscriptions.json`, `DEPLOY.md`.
2. On Render create a **Web Service** connected to your repo's `main` branch.
3. Set Build command: `npm install` and Start command: `npm start`.
4. Add the VAPID keys as environment variables on Render (see below).
5. Deploy and confirm `https://<your-service>.onrender.com/health` returns `{ ok: true }`.
6. In the Masjid Azan Clock app, paste your service URL into Settings → Push Server URL and enable notifications.

---

## Step-by-step: Render.com (recommended)

1. Sign in / sign up at https://render.com and connect your GitHub account (authorize access to the repo `mailafsal-abmm/A3M`).

2. Create a new service
   - Click New → Web Service.
   - Choose the GitHub repo: mailafsal-abmm/A3M.
   - Branch: `main` (the default branch).
   - Root Directory: leave empty unless your app is in a subfolder.

3. Build & Start commands
   - Build Command: `npm install` (or `npm ci` for reproducible installs).
   - Start Command: `npm start` (package.json already has this script).
   - Health check path: `/health` (the server exposes this).

4. Environment variables (required)
   - VAPID_PUBLIC_KEY  — the VAPID public key (string)
   - VAPID_PRIVATE_KEY — the VAPID private key (string)

   If you don't have keys, generate them locally and paste them into Render's Environment section (instructions below).

5. Instance & plan
   - For testing the free Starter instance is fine. Note: free instances sleep after inactivity.
   - If you want always-on behavior without pings, use a paid plan or a Fly/Railway small instance.

6. Deploy
   - Click Create Web Service (Render will build and deploy automatically).
   - Watch the deploy logs: it should run `npm install` then `node server.js` and log "Azan push server running on port...".

7. Verify
   - Visit: `https://<your-service>.onrender.com/health`
   - You should get JSON: `{ "ok": true, "time": "..." }`.

8. Connect the client (Masjid Azan Clock)
   - Open the PWA / app settings and paste your Render service URL (e.g., `https://your-app.onrender.com`) into the Push Server URL field, then Save.
   - In the app, tap "Enable Notifications" — the subscription will be sent to your server.

---

## Generating VAPID keys (recommended methods)

Option A — using the web-push CLI:

1. From your machine run:

   npx web-push generate-vapid-keys --json

2. The output will look like:

   { "publicKey": "...", "privateKey": "..." }

3. Copy the values into Render environment variables `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

Option B — using Node (script):

```js
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log(keys);
```

Note: Do NOT commit the private key into version control. Keep it only in Render environment variables.

If you change the VAPID keys, update the `VAPID_PUBLIC_KEY` value used by the client-side `index.html` (the app needs the same public key to subscribe).

---

## Persistence: why `subscriptions.json` is not ideal for production

- `subscriptions.json` is written to the instance filesystem. On Render, instance disks are ephemeral across deploys or restarts.
- If you want subscriptions to survive restarts and deployments, use one of:
  - Render Managed Postgres (add-on) — recommended for simple persistence; store subscription JSON in a table.
  - Render Redis (for fast lookups) — store subscriptions serialized.
  - Attach a Persistent Disk (Render feature) and write to that path.

If you'd like, I can update the server code to store subscriptions in Postgres or Redis and add configuration examples.

---

## Keep the free instance awake (if using free tier)

Render free web services sleep after a period of inactivity. To keep it awake and avoid delays in receiving the first push after a sleep:
- Use UptimeRobot (free) or similar to ping `https://<your-service>.onrender.com/health` every 10 minutes.
- Or upgrade to a paid Render instance that doesn't sleep.

---

## Testing endpoints (local or remote)

Run locally to test before deploying:

1. Install dependencies and start:
   - npm install
   - npm start

2. Health check:
   - curl http://localhost:3000/health

3. Simulate a subscription (dummy values):

curl -X POST http://localhost:3000/subscribe \
  -H "Content-Type: application/json" \
  -d '{"subscription":{"endpoint":"https://example.com/sub/1","keys":{"p256dh":"p256","auth":"auth"}}}'

4. Send today's schedule for that endpoint (example schedules must use milliseconds since epoch):

curl -X POST http://localhost:3000/schedule \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://example.com/sub/1","prayers":[{"key":"fajr","nameTm":"Fajr","azanMs":'"$(($(date +%s%3N) + 120000))"'}]}'

The server will attempt to send push notifications to the subscription; with a real client subscription you will receive those pushes.

---

## Environment & security notes

- Do not commit `VAPID_PRIVATE_KEY` into the repo.
- Change the contact email in `server.js` `webpush.setVapidDetails('mailto:admin@example.com', ...)` to a real admin contact or read it from an environment variable.
- If you expose the server publicly, consider adding simple rate-limiting or authentication on the `/schedule` route to avoid abuse (for example a shared secret in an `X-API-KEY` header).

---

## Optional: Make subscriptions durable using Render Postgres (example outline)

1. In Render: New → Postgres Database (free starter). Copy the DATABASE_URL.
2. Add `DATABASE_URL` to your Web Service environment variables.
3. I can update `server.js` to:
   - Connect to the Postgres DB using `pg` and store subscriptions in a `subscriptions` table.
   - Replace `loadDB()`/`saveDB()` with DB queries.

If you want this, tell me and I will prepare a PR with the changes and migration SQL.

---

If you'd like, I will now:
- (A) Commit this updated `DEPLOY.md` to your `main` branch, and
- (B) Generate VAPID keys for you and show the exact values to paste into Render (or optionally commit an `.env.example` without the private key).

Tell me which of A/B you want me to do next.