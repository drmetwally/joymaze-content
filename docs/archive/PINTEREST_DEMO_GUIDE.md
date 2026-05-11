# Pinterest API Demo Recording Guide

> Use this to record the second demo video for Pinterest Standard Access approval.
> Required because first submission was rejected for missing: (1) Pinterest integration, (2) full OAuth flow.

---

## Before You Open the Recorder (one-time fixes)

**1. Check your Pinterest app's Redirect URI**
- Go to developers.pinterest.com → Your App → Edit
- Note the exact Redirect URI registered there
- It must match exactly what is in the script
- If different, update line 8 in `scripts/get-pinterest-token.mjs`:
```js
const REDIRECT_URI = 'http://localhost:3000/callback'; // match your app exactly
```

**2. Set a real hosted image URL for the demo pin**
- Upload any JoyMaze image to imgur.com, copy the direct URL (ends in .png or .jpg)
- Replace the placeholder in `scripts/get-pinterest-token.mjs` around line 108:
```js
url: 'https://i.imgur.com/YOURIMAGE.png',
```

**3. Confirm PINTEREST_BOARD_ID is set**
```bash
grep PINTEREST_BOARD_ID .env
```
If empty: go to Pinterest → your board → copy the number from the URL → add to `.env`.

---

## Recording Setup

- Record full screen
- Open terminal in `D:\Joymaze-Content\` before pressing record
- Have developers.pinterest.com open in a browser tab

---

## What to Do On Camera (in order)

**Step 1 — Show the app info (5 sec)**
Open developers.pinterest.com → your app page. Let the viewer see:
- App name
- Scopes listed
- Redirect URI registered

**Step 2 — Run the script**
```bash
node scripts/get-pinterest-token.mjs --save
```

**Step 3 — Show the Pinterest OAuth screen**
Browser opens automatically. Show:
- The Pinterest "Allow access?" page
- Your app name on it
- The permission list (boards:read, pins:write, etc.)
- You clicking **Allow**

**Step 4 — Show the redirect (proves OAuth code was returned)**
Browser redirects to `localhost/callback?code=...` — page shows "This site can't be reached".
**Show the URL bar clearly** so reviewers see `code=` in the URL. This is expected.

**Step 5 — Paste URL into terminal**
Copy the full URL from the address bar, paste into the terminal prompt. Terminal shows:
- Token exchange in progress
- Access token + refresh token received
- Scopes granted confirmed

**Step 6 — Show the pin being created (proves Pinterest integration)**
Terminal prints Pin ID and URL. Open that URL in the browser — show the live pin on the board.

---

## After Recording

Re-submit the upgrade request with the new video link and this note:

> "Updated demo now shows the full OAuth authorization flow (user grants permission, Pinterest returns authorization code, code is exchanged for access + refresh tokens) and live pin creation via the API (pin ID and live URL confirmed in browser)."

---

## Script Reference

```bash
node scripts/get-pinterest-token.mjs           # Full OAuth + post demo pin + save tokens
node scripts/get-pinterest-token.mjs --auth-only  # OAuth flow only, skip pin post
```

Script location: `scripts/get-pinterest-token.mjs`
