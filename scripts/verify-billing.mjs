#!/usr/bin/env node
// verify-billing — Ledrix's own billing (b7; plan mockup 13QNuHGzRGv2t2GdyextR4, SQL #158).
//   §1 lib/billing/model.ts EXECUTED: prices by kind, the $79 → $119 step date, Checkout's 48-hour trial rule, Stripe
//      status → plan status, the banner (owner vs everyone else), invite-code shape.
//   §2 the server wiring, read as text: the webhook checks Stripe's signature before anything else; plan writes only in
//      server code with the service role; the Ledrix key is LEDRIX_STRIPE_* (never STRIPE_SECRET_KEY, which would wake
//      the dormant Home routes); checkout and portal are owner-only; the browser never imports lib/billing/server.
// Mutants edit COPIES in memory; every one must be caught.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SRC = {
  model: read('lib/billing/model.ts'), server: read('lib/billing/server.ts'), api: read('lib/billing/api.ts'),
  webhook: read('app/api/billing/webhook/route.ts'), checkout: read('app/api/billing/checkout/route.ts'),
  portal: read('app/api/billing/portal/route.ts'), status: read('app/api/billing/status/route.ts'),
  plan: read('app/app/company/plan/page.tsx'), start: read('app/app/start/page.tsx'), signup: read('lib/billing/signup.ts'), band: read('components/workspace/PlanBand.tsx'),
  tabs: read('components/workspace/CompanyTabs.tsx'), shell: read('components/workspace/WorkspaceShell.tsx'), pricing: read('components/marketing/Pricing.tsx'),
};
let n = 0;
async function loadModel(src) {
  const dir = mkdtempSync(join(tmpdir(), 'billing-')); const f = join(dir, `model${n++}.mjs`);
  writeFileSync(f, stripTypeScriptTypes(src)); return import(pathToFileURL(f).href);
}
const clientFiles = () => {
  const out = []; const walk = (d) => { for (const e of readdirSync(join(ROOT, d))) { const p = join(d, e); if (statSync(join(ROOT, p)).isDirectory()) { if (!/node_modules|\.next|api$/.test(p)) walk(p); } else if (/\.tsx?$/.test(p)) out.push(p); } };
  walk('app'); walk('components'); return out;
};

const libFiles = () => { const out = []; const walk = (d) => { for (const e of readdirSync(join(ROOT, d))) { const p = join(d, e); if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) out.push(p); } }; walk('lib'); return out; };

async function run(src) {
  const c = []; const ok = (name, v) => c.push([name, !!v]);
  const m = await loadModel(src.model);
  const NOW = Date.parse('2026-12-01T12:00:00Z');
  // §1 prices
  ok('launch starts on the $79 price', m.startPriceKey('launch') === 'ledrix_inspect_monthly_79');
  ok('early stays on $79', m.startPriceKey('early') === 'ledrix_inspect_monthly_79' && !m.stepsUp('early'));
  ok('standard is $119', m.startPriceKey('standard') === 'ledrix_inspect_monthly_119');
  ok('comp never checks out', m.startPriceKey('comp') === null);
  ok('only launch steps up', m.stepsUp('launch') && !m.stepsUp('standard') && !m.stepsUp('comp'));
  const start = Date.parse('2026-12-15T00:00:00Z') / 1000;
  ok('the step is 6 months after billing starts (Jun 15)', new Date(m.stepDate(start) * 1000).toISOString().slice(0, 10) === '2027-06-15');
  ok('a trial 10 days out carries into Checkout', m.checkoutTrialEnd('2026-12-11T12:00:00Z', NOW) === Date.parse('2026-12-11T12:00:00Z') / 1000);
  ok('a trial under 48 h away bills now (no trial_end)', m.checkoutTrialEnd('2026-12-02T12:00:00Z', NOW) === undefined);
  ok('Stripe trialing/active → active', m.planStatusFromStripe('trialing') === 'active' && m.planStatusFromStripe('active') === 'active');
  ok('Stripe past_due/unpaid → past_due', m.planStatusFromStripe('past_due') === 'past_due' && m.planStatusFromStripe('unpaid') === 'past_due');
  ok('Stripe canceled → canceled', m.planStatusFromStripe('canceled') === 'canceled' && m.planStatusFromStripe('incomplete_expired') === 'canceled');
  ok('incomplete leaves the status alone', m.planStatusFromStripe('incomplete') === null);
  ok('price line: launch says $79 for 6 months, then $119', /\$79.*6 months.*\$119/.test(m.priceLine('launch')));
  ok('price line: early says $79 for as long as you stay', /\$79.*as long as you stay/.test(m.priceLine('early')));
  // §1 banner
  const ro = m.planBand({ state: 'read_only', is_owner: true }, NOW), roI = m.planBand({ state: 'read_only', is_owner: false }, NOW);
  ok('read-only: red band, owner gets Restart my plan', ro?.tone === 'red' && ro.action?.label === 'Restart my plan');
  ok('read-only: an inspector is told to ask the owner, no action', roI?.tone === 'red' && !roI.action && /owner/.test(roI.body));
  const g = m.planBand({ state: 'grace', is_owner: true, grace_ends_at: '2026-12-04T12:00:00Z' }, NOW);
  ok('grace: yellow band with days left and Update card', g?.tone === 'yellow' && /3 days/.test(g.body) && g.action?.label === 'Update card');
  ok('grace: an inspector is told to ask the owner', /Ask your company owner/.test(m.planBand({ state: 'grace', is_owner: false }, NOW)?.body ?? ''));
  ok('trial with 2 days left: blue band to the owner', m.planBand({ state: 'trial', is_owner: true, trial_ends_at: '2026-12-03T12:00:00Z' }, NOW)?.tone === 'blue');
  ok('trial with 10 days left: no band', m.planBand({ state: 'trial', is_owner: true, trial_ends_at: '2026-12-11T12:00:00Z' }, NOW) === null);
  ok('trial ending, card already on file: no band', m.planBand({ state: 'trial', is_owner: true, subscribed: true, trial_ends_at: '2026-12-02T12:00:00Z' }, NOW) === null);
  ok('active and comp: no band', m.planBand({ state: 'active', is_owner: true }, NOW) === null && m.planBand({ state: 'comp' }, NOW) === null);
  ok('invite code: trimmed and upper-cased', m.cleanInviteCode('  early-one ') === 'EARLY-ONE');
  ok('invite code: too short or odd characters refused', m.cleanInviteCode('ab') === null && m.cleanInviteCode('EARLY ONE!') === null);

  // §2 wiring
  const wh = src.webhook;
  ok('the webhook verifies the signature with constructEvent', /webhooks\.constructEvent\(raw, req\.headers\.get\('stripe-signature'\)/.test(wh));
  ok('…over the RAW body', /const raw = await req\.text\(\)/.test(wh) && !/req\.json\(\)/.test(wh));
  ok('…and refuses a bad signature before handling', wh.indexOf('bad signature') > -1 && wh.indexOf('bad signature') < wh.indexOf('switch (event.type)'));
  ok('…and refuses to run without its secret', /if \(!configured\(\) \|\| !WEBHOOK_SECRET\)/.test(wh));
  ok('the Ledrix key is LEDRIX_STRIPE_SECRET_KEY', /process\.env\.LEDRIX_STRIPE_SECRET_KEY/.test(src.server) && !/process\.env\.STRIPE_SECRET_KEY/.test(src.server));
  ok('the webhook secret is LEDRIX_STRIPE_WEBHOOK_SECRET', /process\.env\.LEDRIX_STRIPE_WEBHOOK_SECRET/.test(src.server));
  ok('plans are written with the service role', /SUPABASE_SERVICE_ROLE_KEY/.test(src.server) && /from\('company_plans'\)\.upsert/.test(src.server));
  ok('checkout is owner-only', /if \(!who\.owner\) return fail\('Only the company owner can add a payment method\.', 403\)/.test(src.checkout));
  ok('portal is owner-only', /if \(!who\.owner\) return fail\('Only the company owner can manage billing\.', 403\)/.test(src.portal));
  ok('status is owner-only', /if \(!who\.owner\) return fail/.test(src.status));
  ok('checkout bills per seat', /line_items: \[\{ price, quantity: seats \}\]/.test(src.checkout));
  ok('checkout tags the subscription with the company', /subscription_data: \{ metadata: \{ company_id: who\.companyId/.test(src.checkout));
  ok('the launch step is scheduled after checkout', /scheduleLaunchStep\(s, sub, plan\.kind\)/.test(wh));
  ok('the browser never writes company_plans', !/company_plans/.test(src.api + src.plan + src.start + src.band));
  ok('the browser never imports lib/billing/server', clientFiles().every(f => !/lib\/billing\/server/.test(read(f))) && !/billing\/server/.test(src.plan + src.start + src.band + src.api));
  ok('Plan & billing tab is owner-only', /href: '\/app\/company\/plan', label: 'Plan & billing', show: !!access\.companyId && access\.role === 'owner'/.test(src.tabs));
  ok('the band shows on workspace pages', /\{access\.companyId && <PlanBand \/>\}/.test(src.shell));
  ok('/app/start is outside the sign-in gate', /pathname === '\/app\/start'/.test(src.shell));
  ok('Pricing shows $79, then $119, and starts the trial', /\$79/.test(src.pricing) && /Then \$119/.test(src.pricing) && /href="\/app\/start"/.test(src.pricing));
  ok('sign-up makes the company with create_my_company', /rpc\('create_my_company'/.test(src.signup) && /createCompany\(/.test(src.start));
  ok('a new account confirms with the email’s 6-digit code (never a session from the link)', /auth\.verifyOtp\(\{ email: email\.trim\(\), token, type: 'signup' \}\)/.test(src.signup)
    && !/setSession|exchangeCodeForSession|access_token/.test(src.signup + src.start) && /verifySignupCode\(addr, otp\)/.test(src.start));
  const others = [...clientFiles(), ...libFiles()].filter(f => f !== 'lib/billing/signup.ts');
  ok('the website creates accounts in ONE place (lib/billing/signup.ts)', /auth\.signUp\(/.test(src.signup) && others.every(f => !/\.signUp\s*\(/.test(read(f))) && !/\.signUp\s*\(/.test(src.start));
  return c;
}

const MUTANTS = [
  ['model', 'launch starts at $119', s => s.replace(`  return PRICE_KEY.intro;                       // launch`, `  return PRICE_KEY.full;                       // launch`)],
  ['model', 'early steps up too', s => s.replace(`export const stepsUp = (kind: PlanKind | null | undefined) => kind === 'launch';`, `export const stepsUp = (kind: PlanKind | null | undefined) => kind === 'launch' || kind === 'early';`)],
  ['model', 'a 3-month intro', s => s.replace(`export const LAUNCH_INTRO_MONTHS = 6;`, `export const LAUNCH_INTRO_MONTHS = 3;`)],
  ['model', 'no 48-hour rule', s => s.replace(`t - nowMs < 48 * 3600 * 1000`, `t - nowMs < 0`)],
  ['model', 'past_due counted as active', s => s.replace(`case 'past_due': case 'unpaid': return 'past_due';`, `case 'past_due': case 'unpaid': return 'active';`)],
  ['model', 'inspectors get the restart button', s => s.replace(`action: owner ? plan : undefined,`, `action: plan,`)],
  ['model', 'trial band ignores a card on file', s => s.replace(`if (p.state === 'trial' && owner && !p.subscribed) {`, `if (p.state === 'trial' && owner) {`)],
  ['webhook', 'no signature check', s => s.replace(`try { event = s.webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', WEBHOOK_SECRET); }\n  catch { return NextResponse.json({ error: 'bad signature' }, { status: 400 }); }`, `event = JSON.parse(raw);`)],
  ['webhook', 'parsed body instead of raw', s => s.replace(`const raw = await req.text();`, `const raw = JSON.stringify(await req.json());`)],
  ['webhook', 'no launch step', s => s.replace(`if (plan) await scheduleLaunchStep(s, sub, plan.kind);`, ``)],
  ['server', 'the shared STRIPE_SECRET_KEY', s => s.replace(`process.env.LEDRIX_STRIPE_SECRET_KEY`, `process.env.STRIPE_SECRET_KEY`)],
  ['checkout', 'anyone can check out', s => s.replace(`  if (!who.owner) return fail('Only the company owner can add a payment method.', 403);\n`, ``)],
  ['checkout', 'one seat only', s => s.replace(`line_items: [{ price, quantity: seats }]`, `line_items: [{ price, quantity: 1 }]`)],
  ['portal', 'anyone opens the portal', s => s.replace(`  if (!who.owner) return fail('Only the company owner can manage billing.', 403);\n`, ``)],
  ['tabs', 'everyone sees Plan & billing', s => s.replace(`show: !!access.companyId && access.role === 'owner' }`, `show: !!access.companyId }`)],
  ['start', 'the page signs up by itself', s => s.replace(`import { redeemInviteCode } from '@/lib/billing/api';`, `import { redeemInviteCode } from '@/lib/billing/api';\nconst x = () => workspace.auth.signUp({ email: '', password: '' });`)],
  ['signup', 'no company made at sign-up', s => s.replace(`workspace.rpc('create_my_company', { p_name: name.trim() })`, `Promise.resolve({ error: null })`)],
  ['signup', 'a session taken from the link', s => s.replace(`/** The signed-in person's company, if they have one yet. */`, `export const adopt = (h: any) => workspace.auth.setSession(h);\n/** The signed-in person's company, if they have one yet. */`)],
  ['start', 'the code is never checked', s => s.replace(`try { await verifySignupCode(addr, otp); } catch (e) { setErr((e as Error).message); return; }`, ``)],
  ['api', 'the browser writes the plan', s => s.replace(`export async function redeemInviteCode`, `export const pay = () => workspace.from('company_plans').update({ status: 'active' });\nexport async function redeemInviteCode`)],
];

const base = await run(SRC); let bad = 0;
for (const [name, v] of base) { console.log(`  ${v ? '✓' : '✗'} ${name}`); if (!v) bad++; }
console.log('mutations'); let caught = 0;
for (const [file, name, f] of MUTANTS) {
  const mut = f(SRC[file]); if (mut === SRC[file]) { console.log(`  ✗ ${name}: anchor not found`); bad++; continue; }
  let killed; try { killed = (await run({ ...SRC, [file]: mut })).some(([, v]) => !v); } catch { killed = true; }
  console.log(`  ${killed ? '✓' : '✗'} ${name} ${killed ? 'caught' : 'NOT caught'}`); if (killed) caught++; else bad++;
}
console.log(`\n${bad ? '✗' : '✓'} verify-billing: ${base.filter(([, v]) => v).length}/${base.length} checks, ${caught}/${MUTANTS.length} mutations caught`);
process.exit(bad ? 1 : 0);
