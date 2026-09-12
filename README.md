# Masjid Azan Clock — Push Notification Server

A simple, reliable Node.js server that sends Web Push notifications for daily prayer times, even when the app is closed.

## Features

✅ Sends prayer time notifications (Azan + 5-minute alert)  
✅ Works even when PWA/app is fully closed  
✅ Lightweight JSON-based storage  
✅ Ready to deploy on Render, Railway, Fly.io, or any Node.js host  
✅ CORS-enabled for PWA cross-origin access  

## Quick Start (Local Development)

### Prerequisites
- Node.js ≥18
- npm

### Installation

```bash
git clone https://github.com/mailafsal-abmm/A3M.git
cd A3M
npm install
```

### Generate VAPID Keys

```bash
npx web-push generate-vapid-keys --json
```

Copy the output and create a `.env` file:

```bash
cp .env.example .env
```

Paste your VAPID keys into `.env`:

```
VAPID_PUBLIC_KEY=<your_public_key>
VAPID_PRIVATE_KEY=<your_private_key>
PORT=3000
```

### Run Locally

```bash
npm start
```

Server will start on `http://localhost:3000`

### Test the Server

```bash
# Health check
curl http://localhost:3000/health

# Get VAPID public key
curl http://localhost:3000/vapid-public-key
```

---

## Deployment (Render.com)

See **[RENDER_SETUP.md](RENDER_SETUP.md)** for detailed instructions.

**Quick summary:**

1. Generate VAPID keys locally
2. Push code to GitHub
3. Create Web Service on Render
4. Add VAPID keys as environment variables
5. Deploy

---

## API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{ "ok": true, "time": "2026-09-12T12:50:14.123Z" }
```

### `GET /vapid-public-key`
Get the public VAPID key for client subscription.

**Response:**
```json
{ "publicKey": "BCxyz..." }
```

### `POST /subscribe`
Register a new push subscription.

**Body:**
```json
{ "subscription": { "endpoint": "https://...", "keys": {...} } }
```

### `POST /unsubscribe`
Remove a subscription.

**Body:**
```json
{ "endpoint": "https://..." }
```

### `POST /schedule`
Update prayer schedule for a subscription.

**Body:**
```json
{
  "endpoint": "https://...",
  "prayers": [
    { "key": "fajr", "nameTm": "Fajr", "azanMs": 1694515200000 },
    { "key": "dhuhr", "nameTm": "Dhuhr", "azanMs": 1694536800000 }
  ]
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPID_PUBLIC_KEY` | ✅ Yes | Web Push public key |
| `VAPID_PRIVATE_KEY` | ✅ Yes | Web Push private key |
| `PORT` | No | Server port (default: 3000) |

---

## How It Works

1. **User enables notifications** in the Masjid Azan Clock PWA
2. **Browser subscribes** to this push server (automatic)
3. **App sends daily schedule** whenever opened (includes user's manual time adjustments)
4. **Server checks every 30 seconds**: Is it time to send a notification?
5. **Web Push is sent** even if the app is completely closed

---

## Storage

Subscriptions are stored in `subscriptions.json` (ephemeral on Render).

For production, consider adding:
- Render Postgres (persistent database)
- Render Redis (fast lookups)
- Persistent Disk (file-based persistence)

See **DEPLOY.md** for details.

---

## Security Notes

⚠️ **DO NOT commit VAPID private key to GitHub**

- Use `.env` locally (git-ignored)
- Use environment variables on Render/production
- Change the `mailto:` contact email in `server.js` to a real admin email

---

## License

MIT

---

## Support

For issues or questions, open an issue on GitHub.
