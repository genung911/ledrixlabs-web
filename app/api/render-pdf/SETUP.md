# Server-side PDF rendering — setup

The Ledrix app's inspection report needs true 1" margins + a footer ("CONFIDENTIAL · PAGE X of Y")
pinned to the bottom of **every** page. iOS's expo-print engine can't do that (it ignores `@page`,
miscomputes `vh`, drops `position:fixed` and `<tfoot>`). So the app sends its report HTML here and
gets a real **Chromium**-rendered PDF back.

- **Endpoint:** `POST /api/render-pdf`
  - body `{ html: string, inspectionId?: string }` → `{ pdf: base64 }` (`Cache-Control: no-store`)
  - `inspectionId` is required on the session path (below); the key path ignores it.
- **Engine:** `puppeteer-core` **connects** to a hosted Chrome (browserless) at
  `BROWSERLESS_WS_ENDPOINT`. Nothing launches Chromium inside the Vercel function (bundling it failed
  on shared libraries, `libnss3.so`).

## What the route renders — the invariant

It renders **the HTML it is sent** and nothing else. It never reads inspection, finding or photo data,
and must never start to: `inspectionId` is an *authorization subject*, not a lookup key, and it is not
bound to the HTML. Report photos arrive inside that HTML as Supabase storage URLs the app signed with
the inspector's own session.

## Authentication

Exactly one of these, decided before the body is read:

| Request carries | Result |
|---|---|
| `Authorization: Bearer <Supabase access token>` | Verified by Supabase Auth (`GET /auth/v1/user`). Then, **as that user** (RLS applies): an inspector profile must exist and the inspection must pass the authorization check. ✅ render / 401 / 403 |
| An `Authorization` header that is malformed, not `Bearer`, empty, the anon key, or a token Supabase rejects | **401.** A presented header never falls back to the static key |
| No `Authorization` header, `x-render-key` = `RENDER_PDF_SECRET` | Renders — **only while `RENDER_PDF_SECRET` is set.** Transition path for installed builds that predate session auth |
| Anything else | 401 |

Auth or authorization **unverifiable** (Supabase down, env missing) → 503. Nothing renders unverified.

> ⚠ **Which inspections a session may render for is pending an owner decision (2026-10-11).** The
> route currently uses `can_create_under_inspection` (the C1b candidate). Sign-up is open and any
> non-homeowner account can create its own inspector profile and inspection rows, so no
> inspection-level check limits *who* can render; a per-user render budget is not implemented. See
> `ledrix-app/docs/security/OPEN_SECURITY_FINDINGS.md` F1.

The static key is compiled into every app bundle (`EXPO_PUBLIC_RENDER_PDF_KEY`): it identifies the app,
not a person, and anyone who extracts it passes. **Retiring it = removing `RENDER_PDF_SECRET` from
Vercel**, a separately authorized step, only after every device that renders reports runs a build that
sends the session. Rotating it does not help — every new build ships the new value.

## The browser is restricted

- **Page JavaScript is disabled.** The report's only script drives the *web* report's screen-width view
  switcher; every rule it toggles is inside `@media screen`, and `page.pdf` prints `print` media, so the
  PDF is identical without it.
- **Every request is intercepted.** Allowed: `data:` / `about:` / `blob:`, `https://` to the project's
  Supabase host (from `NEXT_PUBLIC_SUPABASE_URL`), `fonts.googleapis.com`, `fonts.gstatic.com`.
  Everything else is aborted — so the renderer cannot be pointed at arbitrary hosts, cloud metadata or
  private addresses. A photo hosted anywhere else will not appear in the server PDF.

## Environment (Vercel → ledrixlabs-web → Settings → Environment Variables)

| Variable | Needed for |
|---|---|
| `BROWSERLESS_WS_ENDPOINT` | every render (full `wss://…?token=…` URL; server only, never logged) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the session path and the network allowlist (no service-role key is used) |
| `RENDER_PDF_SECRET` | the transition key path only; remove it to retire the static key |

App `.env` (ledrix-app): `EXPO_PUBLIC_RENDER_PDF_URL=https://<domain>/api/render-pdf` (and, during the
transition, `EXPO_PUBLIC_RENDER_PDF_KEY`). `EXPO_PUBLIC_*` values bake in at bundle time — restart Metro
with `-c`. If the URL is unset the app renders on the device.

## Failure behaviour

- Responses are generic (`unauthorized`, `forbidden`, `missing html`, `html too large`,
  `render unavailable`, `render failed`); logs record the failing step and the error class only —
  never a token, the browser URL, upstream text or report HTML.
- The app gives up after 65 s (the route's `maxDuration` is 60 s) and on any non-200 **rebuilds the report
  for on-device rendering** — base64 photos, expo-print layout — rather than printing the server-mode
  HTML, whose token-less photo URLs would 404.
- **Footer-less PDF = it fell back.** Check the Vercel function logs.

## Constraints

- **Vercel Pro** recommended (`maxDuration = 60`). Request/response cap ~4.5 MB (the route also refuses
  HTML over 6 M characters with 413). Photos are hosted URLs, not base64, in server mode.
- **Tests:** `node scripts/verify-render-pdf.mjs` — the real route with a fake browser and a fake
  Supabase; writes nothing, makes no network request. It does not prove the authorization helper's
  real semantics; that is `ledrix-app/scripts/verify-render-authz-sql.mjs` (real SQL).
