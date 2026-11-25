#!/usr/bin/env node
// verify-marketing-site — the 2026-11-24 site refresh (mockup PAVcpwJ9d4gDpC17efHUJ7, owner: "Mock up approved";
// "Pricing start, no demo anymore"; "Four steps, not 3").
//   1 nothing on the public pages promises voice / VAL (there is no VAL button in the app today)
//   2 no "Request a demo" anywhere: Pricing / Start replaced it, and every Start goes to #pricing
//   3 How it works is four steps: Shoot · Details fill in · Findings · Review & send
//   4 Why Ledrix: the VAL tile is the template tile; the finding card is the vent-connector finding
//   5 duplicates are worded as the app does them (Merge into one / Keep separate), with no "related findings"
//   6 Pricing shows no price, and its button is no link while APP_STORE_URL is null
//   7 every image a marketing page names exists in public/, so the site can't ship with a missing screenshot
//   8 no hardware on the site: nothing says Sensors (manifesto)
//   9 the sample links share one real share token (the old report token matched no home)
// Mutants change an in-memory copy; nothing on disk is edited.
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const F = p => fs.readFileSync(path.join(root, p), 'utf8');
const PAGES = ['app/page.tsx', 'app/inspect/page.tsx', 'app/home/page.tsx', 'app/about/page.tsx', 'app/ethix/page.tsx', 'app/app/login/page.tsx',
  ...fs.readdirSync(path.join(root, 'components/marketing')).filter(f => f.endsWith('.tsx')).map(f => 'components/marketing/' + f)];
const SRC = Object.fromEntries(PAGES.map(p => [p, F(p)]));
// Code only: drop // and /* */ comments so a comment that explains a change can't fail (or pass) a check.
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function checks(S, exists = p => fs.existsSync(path.join(root, 'public', p))) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  const all = Object.values(S).map(code).join('\n');
  ok('1 no voice or VAL promise on the public pages', !/\bby voice\b|\bvoice\b|\bVAL\b|you talk/i.test(all));
  ok('2 no Request a demo, and Start goes to #pricing',
    !/Request a demo|#demo\b/.test(all)
    && S['components/marketing/Navbar.tsx'].includes("ctaHref = '/inspect#pricing', ctaLabel = 'Start'")
    && S['app/inspect/page.tsx'].includes('<Pricing />') && !/ContactCTA/.test(code(S['app/inspect/page.tsx']))
    && S['components/marketing/VisionManifesto.tsx'].includes('<GlowButton href="#pricing" variant="primary" tone="dark">\n              Start')
    && S['components/marketing/Hero.tsx'].includes('<GlowButton href="#pricing" variant="primary" tone="dark">\n              Start'));
  const hw = S['components/marketing/HowItWorks.tsx'];
  const titles = [...hw.matchAll(/^\s{4}title: '([^']+)',$/gm)].map(m => m[1]);
  ok('3 How it works is four steps in order', titles.join(' · ') === 'Shoot · Details fill in · Findings · Review & send'
    && hw.includes('md:grid-cols-2 xl:grid-cols-4') && /n: '02',[\s\S]{0,400}featured: true/.test(hw));
  const bg = S['components/marketing/BentoGrid.tsx'];
  ok('4 the template tile replaced VAL; the finding card is the S3 finding (corrosion at the connection)', bg.includes("title: 'Your template, your checklist.'")
    && /\{t\.chips && \(/.test(bg) && !/StaticValOrb|orb: true/.test(bg)
    && bg.includes('Corrosion at water heater connection') && bg.includes("{row('Filed on', 'Water Heater › Water Heater')}"));
  ok('5 duplicates read Merge into one / Keep separate, no "related findings"',
    S['components/marketing/LegacyVsLedrix.tsx'].includes('asks: Merge into one, or Keep separate')
    && S['components/marketing/FAQ.tsx'].includes('asks: Merge into one, or Keep separate') && !/related findings/i.test(all));
  const pr = S['components/marketing/Pricing.tsx'] ?? '';
  ok('6 Pricing: no price, and no link while APP_STORE_URL is null', /export const APP_STORE_URL: string \| null = null;/.test(pr)
    && /\{APP_STORE_URL \? \([\s\S]*?\) : \([\s\S]*?Coming to the App Store/.test(pr) && !/\$\s?\d/.test(code(pr)) && pr.includes('id="pricing"'));
  const imgs = [...new Set([...all.matchAll(/["'](\/(?:screenshots\/[^"']+|[\w-]+\.(?:jpe?g|png|JPG)))["']/g)].map(m => m[1]))];
  const missing = imgs.filter(p => !exists(p.slice(1)));
  ok(`7 every image the pages name exists in public/${missing.length ? ' — missing: ' + missing.join(', ') : ''}`, imgs.length > 0 && !missing.length);
  ok('8 no Sensors on the marketing pages (manifesto: no hardware)', !/\bSensors?\b/.test(all));
  const sd = S['components/marketing/SampleDeliverables.tsx'], fh = S['components/marketing/ForHomeowners.tsx'];
  const tok = f => (f.match(/const SAMPLE_PORTAL_ID = '([0-9a-f]{32})';/) ?? [])[1];
  ok('9 both sample links use one share token (32 hex), and the report link is built from it',
    !!tok(sd) && tok(sd) === tok(fh) && sd.includes('const SAMPLE_WEB_REPORT_URL = `/share/${SAMPLE_PORTAL_ID}?tab=report`;'));
  return out;
}
const MUT = [
  ['components/marketing/ForHomeowners.tsx', "const SAMPLE_PORTAL_ID = '3278d9ad528e73043203892cdfee2fb2';", "const SAMPLE_PORTAL_ID = 'eval-house-seed-v1';", 'the homeowners link drifts to another sample'],
  ['components/marketing/SampleDeliverables.tsx', 'const SAMPLE_WEB_REPORT_URL = `/share/${SAMPLE_PORTAL_ID}?tab=report`;', "const SAMPLE_WEB_REPORT_URL = '/share/fa062955cf681a0c0a49b8cee0395f6b?tab=report';", 'the report link goes back to a token that matches no home'],
  ['components/marketing/VisionManifesto.tsx', 'You shoot, Ledrix fills in the details', 'You look, you talk, you confirm', 'the opener promises voice again'],
  ['components/marketing/Navbar.tsx', "ctaLabel = 'Start'", "ctaLabel = 'Request a demo'", 'the nav says Request a demo'],
  ['app/inspect/page.tsx', '<Pricing />', '', 'Pricing drops off /inspect'],
  ['components/marketing/HowItWorks.tsx', "    title: 'Details fill in',\n", '', 'How it works loses the details step'],
  ['components/marketing/BentoGrid.tsx', "title: 'Your template, your checklist.'", "title: 'Log by voice with VAL'", 'the VAL tile comes back'],
  ['components/marketing/LegacyVsLedrix.tsx', 'asks: Merge into one, or Keep separate', 'flags likely duplicate photos and related findings', 'duplicates go back to related findings'],
  ['components/marketing/Pricing.tsx', 'export const APP_STORE_URL: string | null = null;', "export const APP_STORE_URL: string | null = null; const PRICE = '$49';", 'a price appears'],
  ['components/marketing/Pricing.tsx', '{APP_STORE_URL ? (', '{true ? (', 'the button links before there is an App Store page'],
  ['components/marketing/HowItWorks.tsx', "'/screenshots/site-2026-11/s2-details.jpg'", "'/screenshots/site-2026-11/nope.jpg'", 'a step names an image that is not there'],
  ['app/home/page.tsx', 'Today, it begins with a real inspection.', 'See the Sensors tab.', 'the Home page mentions Sensors'],
];
const base = checks(SRC); let bad = 0;
for (const [n, v] of base) { console.log(`  ${v ? '✓' : '✗'} ${n}`); if (!v) bad++; }
console.log('mutations'); let caught = 0;
for (const [f, a, b, why] of MUT) {
  if (SRC[f].split(a).length !== 2) { console.log(`  ✗ anchor not found once: ${why}`); bad++; continue; }
  // the image mutant must be judged as if every real image existed, or check 7 would already be failing on its own
  const killed = checks({ ...SRC, [f]: SRC[f].replace(a, b) }, p => !p.endsWith('nope.jpg')).some(([, v]) => !v);
  console.log(`  ${killed ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (killed) caught++; else bad++;
}
console.log(`\n${bad ? '✗' : '✓'} verify-marketing-site: ${base.filter(([, v]) => v).length}/${base.length} checks, ${caught}/${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
