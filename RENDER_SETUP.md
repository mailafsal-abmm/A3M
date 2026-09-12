# Quick Render Deployment Setup

## Step 1: Generate VAPID Keys (Do This Now)

Run this command on your local machine:

```bash
npx web-push generate-vapid-keys --json
```

You'll get output like:
```json
{
  "publicKey": "BCxyz...",
  "privateKey": "ABCxyz..."
}
```

**Copy these values — you'll need them next.**

---

## Step 2: Set Environment Variables on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click on your **A3M** Web Service
3. Go to **Settings** → **Environment**
4. Click **Add Environment Variable** and add:

| Key | Value |
|-----|-------|
| `VAPID_PUBLIC_KEY` | Paste your public key here |
| `VAPID_PRIVATE_KEY` | Paste your private key here |

5. Click **Save**

---

## Step 3: Fix Build Configuration

1. Still in Settings, go to **Build & Deploy**
2. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Click **Save**

---

## Step 4: Deploy

Click **Manual Deploy** or push to the `main` branch to trigger an automatic deploy.

Watch the logs — you should see:
```
✅ Azan push server running on port 3000
```

---

## Step 5: Verify It Works

Visit: `https://your-service.onrender.com/health`

You should see:
```json
{
  "ok": true,
  "time": "2026-09-12T12:50:14.123Z"
}
```

---

## Troubleshooting

**"Build failed with exit status 2"?**
- Check that your environment variables are set correctly
- Make sure there are no typos in the keys
- Redeploy after setting variables

**"VAPID keys not found"?**
- The environment variables didn't save properly
- Double-check them in Render Settings → Environment
- Redeploy

**Still having issues?**
- Check the build logs in Render dashboard
- Make sure Node.js version is >=18

---

Once it's working, go to your Masjid Azan Clock app settings and paste your Render URL into **Push Server URL**.
