# Homeowner portal — staging validation runbook

Homeowner security pass 4, 2026-10-20. This is for a **separate, non-production Supabase
project** and a **Vercel preview or local `next dev`** that uses only that project's keys.
Nothing here touches production. The fake-storage tests (`scripts/verify-portal-*.mjs`) do **not**
show that real Supabase behaves this way. This runbook is how to find out.

Files: `scripts/staging/portal_staging_fixture.sql`, `portal_staging_checks.sql` (blocks S0–S5),
`portal_staging_mixed_policy.sql`, `portal-staging-smoke.mjs`; the migrations
`supabase_portal_links.sql` and `supabase_home_documents_private.sql`, and their `_ROLLBACK` files.

Record the outcome of every step: the step number, PASS/FAIL, and the saved output. Never paste
a token, a service-role key or a signed URL into notes, chat or screenshots.

## 0 · Set up (once)

1. Create a new Supabase project, for example `ledrix-staging`. Do not branch, clone or restore production.
2. In its SQL editor, run `portal_staging_fixture.sql`. The last result is `stg_home_a` and its
   edit token. Keep the token private.
   - If it raises `STOP: … real home records` → you are in the wrong project. Stop.
3. Point the website at staging only:
   - **Preview (preferred):** see below.
   - **Local:** in this worktree, `.env.local` is a symlink to the main checkout's **production**
     env file, and `next dev` loads it automatically. First move it aside with
     `mv .env.local .env.local.OFF`, then create `.env.development.local` with
     `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
     from **staging**, and run `./node_modules/.bin/next dev`. Afterwards delete
     `.env.development.local` and run `mv .env.local.OFF .env.local`. Both names are git-ignored.
     The smoke script refuses to write unless the home is `stg_…`, but the browser steps have no
     such guard, so check S0 and the page address before clicking anything.
   - **Preview:** in Vercel, set those three for the **Preview** environment of a branch only,
     then push that branch. Do not change Production env vars.
4. Run `S0` from `portal_staging_checks.sql` → `non_staging_homes = 0`.

## 1 · Before any migration (code deployed, SQL not applied)

5. `S1` → save the output. Expected: bucket `public = true`, both limits NULL, one policy
   `stg home-documents public read`, anon and authenticated grants present, `portal_links` NULL,
   and pgcrypto present.
6. Run `STG_BASE=<url> STG_EDIT_TOKEN=<token> node scripts/staging/portal-staging-smoke.mjs links-absent`
   → 3/3 PASS: originals work, and minting answers 503.
7. Browser: open `<url>/share/<token>` → tap **Share** → expect the error "Sharing a view-only
   link is not available yet. Nothing was shared." and **no** link copied or shared. Repairs → add
   one finding → **Share request link** → the same kind of error.
   - The Repairs request builder appears only when **signed in** (page.tsx `access = !!session…`). A
     new staging project has no accounts: create one test user (dashboard → Authentication → Users →
     Add user) and sign in top-right, or defer the Repairs half to steps 18 and 25.

## 2 · Apply `supabase_portal_links.sql`

8. Run its pre-check lines → `to_regclass` NULL, pgcrypto present.
9. Run the file (APPLY). Expect no error.
10. `S3` → five `ok`.
11. With the staging **anon** key: `curl "$STG_URL/rest/v1/portal_links?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`
    → a 401/403 permission error. An empty `[]` with 200 is also acceptable (RLS, no rows).
    Any row → FAIL.

## 3 · Prove the bucket migration aborts safely, then apply it

12. Run `portal_staging_mixed_policy.sql` PART A.
13. Run `supabase_home_documents_private.sql` APPLY → expect the error that names `stg shared docs+pdfs read`.
14. `S1` → identical to step 5 plus the shared policy (nothing changed).
15. Run PART B (drop the shared policy).
16. Run `supabase_home_documents_private.sql` APPLY again → no error.
17. `S2` → eight `ok`.

## 4 · Real storage behaviour

18. Run `node scripts/staging/portal-staging-smoke.mjs full` with the same env → every row PASS. What each row shows:
    - **Signed upload works with no storage policies.** This is the key unknown: if the PUT fails
      403 with a row-level security message, see *If a check fails* below.
    - The bucket refuses a 21 MB PUT and a `text/html` PUT.
    - The move to the final path keeps type and size, and the Range read sees the `%PDF-` header:
      completion is 200, and disguised HTML is 400.
    - The signed redirect serves the same bytes.
    - Re-using an upload URL cannot change the filed file. Note the status it got, for the record.
    - The public object URL is refused.
19. `S5` → every `home_documents.path` has no `/_incoming/`, each object exists, and
    `stored_type` is `application/pdf`. Some `_incoming/` objects may remain from failed or reused
    uploads. That is expected.
20. Signed link expiry: open a document in the browser, copy the address it redirected to, wait
    6 minutes, then open it again → expect a 400 error saying the URL expired.
21. Upload URL expiry (optional, slow): in a browser devtools console on the portal, POST
    `{action:'upload-url', …}` to `/api/docs`, wait 2 h 5 min, then PUT to the URL → expect it refused.
22. Sweep: in the Supabase dashboard → Storage → `home-documents` → `stg_home_a/_incoming/`,
    upload any small PDF named `1700000000000_aaaaaaaaaaaa_old.pdf`. Upload any document from the
    portal. Refresh the dashboard → that file is gone and recent `_incoming/` files remain.

## 5 · Browser, real origin (CORS and the page)

Run these on the preview URL, and on `http://localhost:3000` if you use local.

23. **Original link:** Docs → **+ Upload** a PDF over 4.5 MB (for example 10 MB).
    - The network tab shows a `PUT` to `*.supabase.co/storage/v1/object/upload/sign/…` with a 200.
    - There is no CORS error in the console.
    - The document appears and opens.
24. **Share** → a different `/share/<token>` link. Open it in a private window:
    - You see the **View-only link** banner.
    - The page shows no **COMPLETE**/**SNOOZE**, no **+ Track a repair or project**, no
      **MARK …**/**ADD PHOTO**, no **+ Log a service**, no **+ UPLOAD**, no ✕ on documents or log
      entries, and Repairs shows read-only text with no × and no **ADD FROM FINDINGS**.
    - Documents and **Copy text**/**Print** still work.
25. Repairs (original link) → **Share request link** → open it → only the address, date and included items.
26. Delete a document (original link) → it disappears. In the dashboard its object is gone too.

## 6 · Revocation

27. Run `S4a` (revoke the original link). Then run `portal-staging-smoke.mjs revoked` → 5/5 PASS.
28. Browser: the original link shows "not found", and so do its documents. The view-only and
    repairs links made in steps 24–25 still work, because they are separate links.
29. `S4b` → open the new token's link → full access works.
30. `S4c` (undo the revocation) → the original link works again.

## 7 · Rollback rehearsal

31. Run `supabase_home_documents_private_ROLLBACK.sql`. Then set the two limits from the step 5
    output (NULL). `S1` → bucket public again.
32. Run `supabase_portal_links_ROLLBACK.sql`. Then:
    - View-only and repairs links stop working.
    - Share shows the "not available yet" error and does **not** share the original link.
    - The original link works.
33. Re-apply both files (steps 9 and 16), then run `S2` and `S3` → all `ok`. Staging now matches the intended end state.

## If a check fails

Stop at the first FAIL, save the full output, and do not "fix it until it passes" in staging.

| Failure | What to do |
|---|---|
| Every link 404s; a direct service-key REST read answers 403 `42501` | service_role has no table privileges (the project's default privileges grant new tables nothing). Re-run the fixture's `grant … to service_role` statement. Never grant anon or authenticated to make this pass. |
| S0 shows non-staging homes | Wrong project. Stop. Check the project ref in the URL. |
| Fixture or a migration errors unexpectedly | Save the exact error. Nothing is half-applied: each file runs in one transaction. Re-run S1. |
| Step 13 does **not** raise | The policy-drop safety check is wrong. Do not apply in production. Report it. |
| S2/S3 shows `OPEN`/`WRONG`/`MISSING` | Save that row. Do not apply in production. |
| Signed-upload PUT 403 with a row-level security message | Do **not** add a storage policy for anon or authenticated. Report it: the fix needs a design change (for example routing the upload through a narrower, service-role-checked path), not a broader grant. |
| Completion 404 for a real upload | The move or list call behaved differently from the stand-in. Save the response body. Report it. |
| A 21 MB or `text/html` PUT is accepted | The bucket limits did not apply. Re-run S2. Report it. |
| Browser CORS error on the PUT | Save the console error and request headers. Report it. Do not set bucket CORS to `*` for writes without review. |
| The revoked link still works anywhere | A release blocker. Save which route. Report it. |

## Release order (production, later and only with approval)

1. Deploy the web build.
2. Apply `supabase_portal_links.sql` (before or after the deploy works too).
3. Apply `supabase_home_documents_private.sql` after the deploy is live, keeping its pre-check output.
4. Record both in `ledrix-app/SUPABASE_LEDGER.md`.

Rolling back the **code** also undoes every revocation, because the old build never reads
`portal_links`. Rolling back the code also needs the bucket rollback, because the old build links
public URLs.
