# Server-side PDF rendering — setup

The Ledrix app's inspection report needs true 1" margins + a footer ("CONFIDENTIAL · PAGE X of Y")
pinned to the bottom of **every** page. iOS's expo-print engine can't do that (it ignores `@page`,
miscomputes `vh`, drops `position:fixed` and `<tfoot>`). So the app sends its report HTML here and
gets a real **Chromium**-rendered PDF back.

- **Endpoint:** `POST /api/render-pdf`  → body `{ html: string }`  → returns `{ pdf: base64 }`
- **Engine:** `puppeteer-core` + `@sparticuz/chromium` on the Vercel Node runtime.

## Turn it on

1. **Deploy this web app** — `git push` (Vercel auto-deploys the route + Chromium deps).
2. **Vercel env var** (ledrixlabs-web → Settings → Environment Variables):
   - `RENDER_PDF_SECRET` = a long random string  → redeploy.
3. **App `.env`** (ledrix-app):
   - `EXPO_PUBLIC_RENDER_PDF_URL=https://<your-domain>/api/render-pdf`
   - `EXPO_PUBLIC_RENDER_PDF_KEY=<same value as RENDER_PDF_SECRET>`
4. **Restart Metro with `-c`** and reload — `EXPO_PUBLIC_*` vars bake in at bundle time.
5. Generate a report → it now routes through Chromium.

If `EXPO_PUBLIC_RENDER_PDF_URL` is unset, the app silently uses expo-print (current behavior).

## Constraints to know

- **Vercel Pro** recommended — the route allows `maxDuration = 60s` for Chromium cold start.
  On Hobby (10s cap) a cold start can time out → app falls back to expo-print.
- **~4.5MB payload cap** (Vercel request/response). The report embeds photos as base64, so a
  photo-heavy report can exceed it → fallback. Proper fix later: host photos as URLs (Supabase
  storage) instead of base64 in the HTML.
- **Footer-less PDF = it fell back.** If a report comes out without the bottom footer, Chromium
  wasn't reached — check Vercel function logs (timeout / payload / 401 secret mismatch).
- **No local test** — `@sparticuz/chromium` is a Linux binary; it only runs on Vercel, not
  `npm run dev` on macOS.
