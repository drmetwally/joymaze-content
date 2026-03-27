# Platform API Setup Guide

Step-by-step instructions for setting up API access on all 5 platforms.

---

## 1. Pinterest

1. Go to [developers.pinterest.com](https://developers.pinterest.com)
2. Log in with your Pinterest business account
3. Click "My apps" > "Create app"
4. Fill in app details (name: "JoyMaze Content", website: joymaze.com)
5. Under "Permissions", enable: `pins:read`, `pins:write`, `boards:read`, `boards:write`
6. Generate an access token
7. Create a board for JoyMaze content (note the board ID from the URL)
8. Add to `.env`:
   ```
   PINTEREST_ACCESS_TOKEN=your-token
   PINTEREST_BOARD_ID=your-board-id
   ```

**API Docs:** https://developers.pinterest.com/docs/api/v5/

---

## 2. Instagram (via Meta Graph API)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a Meta Developer account if needed
3. Create a new app (type: "Business")
4. Add the "Instagram Graph API" product
5. **Prerequisites:**
   - A Facebook Page linked to your business
   - An Instagram Business or Creator account connected to that Page
6. In Graph API Explorer:
   - Select your app
   - Generate a User Access Token with permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`
   - Exchange for a long-lived token (60 days)
7. Get your Instagram Business Account ID:
   ```
   GET /me/accounts?fields=instagram_business_account
   ```
8. Add to `.env`:
   ```
   INSTAGRAM_ACCESS_TOKEN=your-long-lived-token
   INSTAGRAM_BUSINESS_ACCOUNT_ID=your-ig-id
   FACEBOOK_PAGE_ID=your-page-id
   ```

**API Docs:** https://developers.facebook.com/docs/instagram-platform/instagram-graph-api

---

## 3. X (Twitter)

1. Go to [developer.x.com](https://developer.x.com)
2. Sign up for a developer account (Free tier)
3. Create a new project and app
4. Under "Keys and tokens", generate:
   - API Key and Secret
   - Access Token and Secret (with Read and Write permissions)
5. **Free tier limits:** 1,500 tweets/month (~50/day), 1 app
6. Add to `.env`:
   ```
   X_API_KEY=your-api-key
   X_API_SECRET=your-api-secret
   X_ACCESS_TOKEN=your-access-token
   X_ACCESS_SECRET=your-access-secret
   ```

**API Docs:** https://developer.x.com/en/docs/x-api

---

## 4. TikTok

1. Go to [developers.tiktok.com](https://developers.tiktok.com)
2. Create a developer account
3. Create a new app
4. Apply for the "Content Posting API" scope
5. **Note:** TikTok requires app review before you can post content
6. After approval, generate an access token via OAuth2 flow
7. Add to `.env`:
   ```
   TIKTOK_ACCESS_TOKEN=your-token
   TIKTOK_OPEN_ID=your-open-id
   ```

**API Docs:** https://developers.tiktok.com/doc/content-posting-api-get-started

---

## 5. YouTube (Google)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the "YouTube Data API v3"
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/callback`
5. Run the OAuth2 flow to get a refresh token:
   - Scopes needed: `https://www.googleapis.com/auth/youtube.upload`
6. Add to `.env`:
   ```
   YOUTUBE_CLIENT_ID=your-client-id
   YOUTUBE_CLIENT_SECRET=your-client-secret
   YOUTUBE_REFRESH_TOKEN=your-refresh-token
   ```

**API Docs:** https://developers.google.com/youtube/v3

---

## Verification

After filling in all `.env` values, run:
```bash
node scripts/setup-check.mjs
```
This will test each API connection and report which platforms are ready.
