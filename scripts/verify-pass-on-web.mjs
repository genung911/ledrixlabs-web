#!/usr/bin/env node
// verify-pass-on-web — hr2 on the website (owner 2026-11-25, approval pack item 13; SQL #155): the claim question's
// "Let future owners of this home see this inspection" (off unless ticked, only with "Yes, I own it"), the owner's switch on
// Home, the new owner's "Earlier inspections" (lib/passedOn — EXECUTED against a stub: the caller's own token asks; PDFs are
// signed only for what the database returned), and the Privacy line. `--mutate` proves each check can fail.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shareSource } from './lib/shareSource.mjs';

let MUT = null; let RUN = 0;
registerHooks({
  resolve(spec, ctx, next) {
    let r; if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[a-z]+$/i.test(spec)) { try { r = next(spec + '.ts', ctx); } catch {} }
    r = r ?? next(spec, ctx);
    if (r.url.startsWith('file:') && !r.url.includes('node_modules') && ctx.parentURL?.includes('?run=')) r = { ...r, url: r.url.split('?')[0] + '?run=' + ctx.parentURL.split('?run=')[1] };
    return r;
  },
  load(url, ctx, next) {
    const res = next(url, ctx);
    if (MUT && url.split('?')[0].endsWith(MUT.file)) return { ...res, source: String(res.source ?? readFileSync(fileURLToPath(url.split('?')[0]), 'utf8')).replace(MUT.from, MUT.to) };
    return res;
  },
});
const REPO = fileURLToPath(new URL('..', import.meta.url));
const ANON = 'anon-key-0123456789', USER = 'jwt.user-0123456789';
const PAGES = { share: () => shareSource(REPO), privacy: () => readFileSync(new URL('../app/privacy/page.tsx', import.meta.url), 'utf8') };

async function checks(srcMut = null) {
  const out = []; const ok = (n, c, info = '') => out.push([n, !!c, info]);
  RUN++;
  const { loadPassedOn } = await import(new URL('../lib/passedOn.ts', import.meta.url).href + '?run=' + RUN);
  let calls = []; const signed = [];
  const fetchFn = async (u, init) => { calls.push({ u, h: init?.headers }); return Response.json([{ share_id: 'S1', inspection_date: '2024-03-01', company: 'Acme', inspector: 'Ann' }, { share_id: 'S3', inspection_date: '2026-11-20' }]); };
  const sign = async (p) => { signed.push(p); return `https://signed/${p}`; };
  const r = await loadPassedOn('S3', { supaUrl: 'https://x', anonKey: ANON, token: USER, fetchFn, sign });
  ok('the caller\'s own token asks the database (anon key + their token, never the service role)', calls[0]?.u.endsWith('/rest/v1/rpc/passed_on_reports') && calls[0]?.h?.apikey === ANON && calls[0]?.h?.Authorization === `Bearer ${USER}`);
  ok('an earlier report comes back with its PDF signed', r.ok && r.reports.length === 1 && r.reports[0].shareId === 'S1' && r.reports[0].pdfUrl === 'https://signed/S1/report.pdf', JSON.stringify(r));
  ok('only what the database returned is signed — never the caller\'s own report', signed.join() === 'S1/report.pdf');
  calls = [];
  const out1 = await loadPassedOn('S3', { supaUrl: 'https://x', anonKey: ANON, token: '', fetchFn, sign });
  const out2 = await loadPassedOn('S3', { supaUrl: 'https://x', anonKey: ANON, token: ANON, fetchFn, sign });
  ok('signed out (or the anon key) gets nothing, and nothing is asked', !out1.ok && !out2.ok && calls.length === 0);
  const S = srcMut?.f === 'share' ? srcMut.apply(PAGES.share()) : PAGES.share();
  const P = srcMut?.f === 'privacy' ? srcMut.apply(PAGES.privacy()) : PAGES.privacy();
  ok('the claim question offers it only with "Yes, I own it", off unless ticked', S.includes('const [passOn, setPassOn] = useState(false);') && S.includes('{owned === true && (')
    && S.includes('Let future owners of this home see this inspection') && S.includes('passOn: owned === true && passOn })}'));
  ok('after the claim, it is sent only when ticked', S.includes("if (claimAnswer?.owned && claimAnswer.passOn) void supabase.rpc('set_report_pass_on', { p_share_id: shareId, p_on: true });"));
  ok('the owner\'s switch on Home shows only to the owner (the server answers no one else)', S.includes("if (live && !error && typeof data === 'boolean') setOn(data);")
    && S.includes('if (on === null) return null;') && S.includes('<PassOnRow shareId={record.share_id} />'));
  ok('earlier inspections show under History, only when there are some', S.includes('<EarlierInspections shareId={record.share_id} />') && S.includes('if (!rows.length) return null;'));
  ok('the Privacy page says it, in the approved words', P.includes("Future owners. If you choose to, the inspection reports on your home can be shown to its future owners. This is off unless you turn it on, and you can turn it off at any time. Reports you haven't chosen to share stay with you and your inspection company."));
  return out;
}
const MUTS = [
  ['the service role asks', 'lib/passedOn.ts', 'headers: { apikey: o.anonKey, Authorization: `Bearer ${o.token}`', 'headers: { apikey: o.anonKey, Authorization: `Bearer ${o.anonKey}`'],
  ['the caller\'s own report is signed too', 'lib/passedOn.ts', ' && x.share_id !== shareId);', ');'],
  ['signed out still asks', 'lib/passedOn.ts', "if (!o.token || o.token === o.anonKey) return", "if (false) return"],
];
const SRC_MUTS = [
  ['ticked by default', 'share', 'const [passOn, setPassOn] = useState(false);', 'const [passOn, setPassOn] = useState(true);'],
  ['sent with every claim', 'share', "if (claimAnswer?.owned && claimAnswer.passOn) void supabase.rpc('set_report_pass_on'", "if (claimAnswer?.owned) void supabase.rpc('set_report_pass_on'"],
  ['the switch shows to everyone', 'share', 'if (on === null) return null;', ''],
  ['no Privacy line', 'privacy', 'Future owners. If you choose to', 'If you choose to'],
];
let fail = 0;
for (const [n, v, i] of await checks()) { console.log(`${v ? '✓' : '✗'} ${n}${v ? '' : '  ' + i}`); if (!v) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, file, a, b] of MUTS) {
    if (readFileSync(new URL('../' + file, import.meta.url), 'utf8').split(a).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    MUT = { file, from: a, to: b }; const hit = (await checks().catch(() => [[0, false]])).some(([, v]) => !v); MUT = null;
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  for (const [why, f, a, b] of SRC_MUTS) {
    if (PAGES[f]().split(a).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    const hit = (await checks({ f, apply: s => s.replace(a, b) })).some(([, v]) => !v);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length + SRC_MUTS.length} mutations caught`);
}
console.log(`\nverify-pass-on-web — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
