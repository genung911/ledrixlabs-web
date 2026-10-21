# Homeowner portal — staging validation results

The record of each `PORTAL_STAGING_RUNBOOK.md` step as it is run against the **Ledrix-Staging**
Supabase project. Never record a token, a service-role key or a signed URL here.

| Step | Date | Result | Notes |
|---|---|---|---|
| 0.2 fixture (`portal_staging_fixture.sql`) | 2026-10-20 | PASS | Third attempt. Attempt 1: syntax error near `text` (the text was copied from a wrapped terminal or chat view, not the file). Attempt 2: the guard failed with `relation "public.home_records" does not exist` (fixed with a dynamic-SQL guard). Neither attempt created anything. Returned `stg_home_a` plus its token (kept out of this file). |
| 0.4 S0 | 2026-10-20 | PASS | 1 home; 0 non-staging homes. |
| 1.5 S1 baseline | 2026-10-20 | PASS | Recorded below. |
| 0.3 local dev | 2026-10-20 | PASS | `.env.local` moved to `.env.local.OFF`; `.env.development.local` holds the staging values only (legacy JWT keys, same project ref, not `rxfj`); `next dev` loaded only that file. |
| 1.6 smoke `links-absent` | 2026-10-20 | **FAIL → finding** | Original link 404, nothing written. Diagnosed read-only: `portal_links` → 404 `PGRST205` (as designed); `home_records` → 403 `42501`. service_role had **no privileges on any fixture table** (this project's default privileges grant new tables nothing). Fix: the fixture grants service_role; **both migrations now grant service_role explicitly**, with a post-check row. Without that, portal_links on such a project would have made every link fail closed. |
| 1.6 smoke `links-absent` (rerun after the service_role grant) | 2026-10-20 | PASS 3/3 | Original link loads as edit (200); no `share_token` in the record; minting before `portal_links` exists → 503. |
| 1.7a browser: Share before `portal_links` | 2026-10-20 | PASS | Alert "Sharing a view-only link is not available yet. Nothing was shared."; nothing copied or shared. |
| 1.7b browser: Repairs → Share request link | 2026-10-20 | DEFERRED | The Repairs builder needs a signed-in account, and staging has none. Covered by the automated F tests; real API in step 18; browser in step 25 once a staging test user exists. |
| 2.8 pre-check | 2026-10-20 | PASS | pgcrypto present; `portal_links` absent (404 `PGRST205` in the smoke step). |
| 2.9 apply `supabase_portal_links.sql` (with the service_role grant) | 2026-10-20 | PASS | No error. |
| 2.10 S3 | 2026-10-20 | PASS 5/5 | Table exists, RLS on, no client grants, no policies, service_role can look up/mint/revoke. |
| 2.11 anon read of `portal_links` | 2026-10-20 | PASS | HTTP 401 `42501` (permission denied), for both a select and a count probe; no rows. |
| 3.12–13 mixed policy, then apply → aborts | 2026-10-20 | PASS | The migration raised the error naming `stg shared docs+pdfs read`; nothing applied. |
| 3.14 bucket unchanged | 2026-10-20 | PASS | Storage API: `public` true, both limits NULL. |
| 3.15 drop the shared policy | 2026-10-20 | PASS | 0 remaining. From here on, run by Claude through a staging-only psycopg helper that refuses any other project ref. |
| 3.16 apply `supabase_home_documents_private.sql` | 2026-10-20 | PASS | No error. |
| 3.17 S2 | 2026-10-20 | PASS 8/8 | |
| 4.18 smoke `full` (first run) | 2026-10-20 | **FAIL → finding, fixed** | `complete` hung until the client gave up (300 s). Traced: move, list and the 64-byte Range read (206) all returned, and the insert was never sent. The hang was in `storedHead()` (`app/api/docs/route.ts`): a hand-rolled stream reader plus `await reader.cancel()` never returned under Next.js (same code: 0.2 s in plain Node). The fake-storage tests could not see it. Fix: read the Range reply whole (`arrayBuffer()`, capped at 64 bytes by Range, and the size is checked ≤ 20 MB first). Verify scripts after the fix: security 180/180, view-only 29/29, auth OK. Two test objects were left filed with no row; harmless. |
| 4.18 smoke `full` (after the fix) | 2026-10-20 | PASS 20/20 | Signed upload works with **no storage policies**; 21 MB and `text/html` PUTs refused (400); disguised HTML refused at completion (400); signed redirect 307 serves the same bytes; reusing the upload URL got 200 but the filed file is unchanged (same sha); second completion 404; public object URL 400; delete 204 then 404. |
| 4.19 S5 | 2026-10-20 | PASS | Every filed doc is outside `_incoming/`, its object exists, type `application/pdf`; 1 leftover `_incoming/` object (from the reuse test). |
| 4.20 signed link expiry | 2026-10-20 | PASS | 200 at once; 400 "expired" after 6 min. |
| 4.21 upload URL expiry | — | SKIPPED | Optional (2 h wait). |
| 4.22 sweep | 2026-10-20 | PASS | Planted `1700000000000_aaaaaaaaaaaa_old.pdf` in `_incoming/`; after a portal upload it was gone, and the recent `_incoming/` object stayed. Done through the storage API, not the dashboard. |
| 6.27 S4a + smoke `revoked` | 2026-10-20 | PASS 5/5 | |
| 6.28 revoked original | 2026-10-20 | PASS | Original link and its document 404; view-only and repairs links made earlier still load. Checked through the API (browser half: see the manual list). |
| 6.29 S4b replacement link | 2026-10-20 | PASS | Loads as edit; a write returned 204 and the row exists. (The first scripted run marked this FAIL because the script expected 200/201; the route answers 204 by design.) |
| 6.30 S4c undo | 2026-10-20 | PASS | Original link loads as edit again. |
| 5.23 browser upload, 10 MB, `localhost:3000` | 2026-10-20 | PASS | Direct PUT to Supabase from the browser worked (no CORS error); filed at its final path as `application/pdf`, 10,485,791 bytes; opens through the 307 signed redirect. Run after step 33, on the end state. |
| 5.24 Share → view-only, private window | 2026-10-20 | PASS | Banner shown; no edit controls; documents and Print work (owner). |
| 5.25 Repairs request link (browser) | — | DEFERRED | Needs a signed-in staging user; covered by the API checks in steps 18 and 32. |
| 5.26 delete a document | 2026-10-20 | PASS | `DELETE /api/docs` 204; the row and the stored object are both gone. (The first attempt never sent a delete, probably a different ✕ was clicked; the retry did.) |
| 7.31 bucket rollback | 2026-10-20 | PASS | Back to `public` true, both limits NULL. |
| 7.32 `portal_links` rollback | 2026-10-20 | PASS | Table dropped; view-only and repairs links 404; minting 503 ("not available"); original link still edit. |
| 7.33 re-apply both | 2026-10-20 | PASS | S2 8/8, S3 5/5; minting 200 again. Staging is at the intended end state. |

## S1 baseline (before either migration) — needed by the rollback rehearsal (step 31)

| Check | Staging result |
|---|---|
| Database isolation | 1 home; 0 non-staging homes |
| `home-documents` bucket | `public = true`; `file_size_limit` NULL; `allowed_mime_types` NULL |
| Storage policy | `stg home-documents public read`: anon, SELECT, `bucket_id = 'home-documents'` |
| `home_documents` table | `anon` and `authenticated` have broad privileges, including INSERT, UPDATE and DELETE |
| `portal_links` table | does not exist (`to_regclass` NULL) |
| `pgcrypto` | installed |

Rollback target (step 31): set the bucket back to `public = true`, with `file_size_limit = NULL` and
`allowed_mime_types = NULL`.

## Credential incidents during the run

- The staging **database password** was printed once into the Claude session while diagnosing a
  bad token file (the redaction missed it). It was reset at once and the connection file updated.
- Two staging **view-only link tokens** appeared in a dev-server log excerpt. Both died when the
  `portal_links` rollback (step 32) dropped the table.

## Outcome

Every required step passed on 2026-10-20. Not run: step 21 (optional), and the browser halves of
steps 7, 25 and 28 (no staging user; covered by API checks). One code defect was found and fixed (the
`storedHead()` hang). Nothing was committed, pushed or deployed, and production was not touched.

Local clean-up done the same day: `next dev` stopped, `.env.development.local`, `.env.stg-token`
and `.env.stg-db` deleted, `.env.local` restored.

Still release blockers, unchanged by this run: scheduled clean-up, account deletion, backup
retention, legal review.
