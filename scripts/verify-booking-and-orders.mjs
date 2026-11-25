#!/usr/bin/env node
// verify-booking-and-orders — w8 fixes (owner 2026-11-24, "Go ahead with all of it"):
//   1 the booking page never shows an error once the booking is saved: a payment step that can't start (no Stripe
//     connected, or Stripe unreachable) lands on "Booking Received" instead of "Stripe not configured for this inspector"
//   2 the Link box keeps only the link part: a pasted https://www.ledrixlabs.com/book/x/ becomes x (behaviour-tested)
//   3 a field that is not saved says why, under the row
//   4 a website job whose referrer the server refuses still gets its order (so it reaches the CRM Schedule), without
//     the source, and the page says so
// Mutants change an in-memory copy; nothing on disk is edited.
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const F = p => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = { book: F('app/book/[slug]/page.tsx'), api: F('lib/office/api.ts'), ui: F('components/workspace/ui.tsx'),
  svc: F('app/app/company/services/page.tsx'), nj: F('app/app/inspections/new/page.tsx') };

// Behaviour of bookingSlugOf, run from the source text itself (its body is plain JS once the types are dropped).
function slugFn(api) {
  const m = api.match(/export function bookingSlugOf\(input: string \| null \| undefined\): string \{\n  (return [\s\S]*?);\n\}/);
  if (!m) return null;
  try { return new Function('input', m[1]); } catch { return null; }
}
function checks(S) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  ok('1 a payment step that cannot start lands on Booking Received, never an error',
    S.book.includes("window.location.href = !cErr && url ? url : `/book/${slug}/success?booking_id=${booking.id}`;")
    && !/if \(cErr\) throw new Error\(cErr\);/.test(S.book));
  const f = slugFn(S.api);
  const cases = [['https://www.ledrixlabs.com/book/labs-home-inspections/', 'labs-home-inspections'], ['ledrixlabs.com/book/labs-home-inspections', 'labs-home-inspections'],
    ['  Labs-Home-Inspections ', 'labs-home-inspections'], ['book/abc', 'abc'], ['', ''], [null, '']];
  const bad = f ? cases.filter(([i, o]) => f(i) !== o) : cases;
  ok(`2 the Link box keeps only the link part${bad.length ? ' — wrong for: ' + bad.map(c => JSON.stringify(c[0])).join(', ') : ''}`,
    !bad.length && S.api.includes('const slug = bookingSlugOf(page.slug);')
    && S.svc.includes('setPage({ ...next, slug: next.slug == null ? next.slug : bookingSlugOf(next.slug) })'));
  ok('3 a field that is not saved says why', /catch \(e\) \{ setState\('error'\); setWhy\(/.test(S.ui)
    && S.ui.includes("{state === 'error' && why && <p role=\"alert\""));
  ok('4 a refused referrer still saves the order, without the source, and the page says so',
    /if \(res\.error && REFERRER_REFUSED\.test\(res\.error\.message \?\? ''\) && j\.source && Object\.keys\(j\.source\)\.length\) \{\n    res = await workspace\.from\('crm_orders'\)\.insert\(row\)/.test(S.api)
    && S.api.includes("return { id: (res.data as { id: string }).id, referrerDropped: true };")
    && S.nj.includes('if (order.referrerDropped) warnings.push(REFERRER_DROPPED);'));
  return out;
}
const MUT = [
  ['book', "window.location.href = !cErr && url ? url : `/book/${slug}/success?booking_id=${booking.id}`;", "if (cErr) throw new Error(cErr);\n        window.location.href = url;", 'the Stripe error comes back after the booking is saved'],
  ['api', ".replace(/^book\\/+/, '')", '', 'a pasted /book/ address keeps "book/"'],
  ['api', 'const slug = bookingSlugOf(page.slug);', "const slug = (page.slug ?? '').trim().toLowerCase();", 'the save ignores the cleaning'],
  ['ui', "{state === 'error' && why && <p role=\"alert\"", "{false && why && <p role=\"alert\"", 'the reason is never shown'],
  ['api', "    res = await workspace.from('crm_orders').insert(row)", "    res = await workspace.from('crm_orders').insert({ ...row, ...(j.source ?? {}) })", 'the retry still sends the refused referrer'],
  ['nj', 'if (order.referrerDropped) warnings.push(REFERRER_DROPPED);', '', 'the page stays quiet about the dropped source'],
];
const base = checks(SRC); let bad = 0;
for (const [n, v] of base) { console.log(`  ${v ? '✓' : '✗'} ${n}`); if (!v) bad++; }
console.log('mutations'); let caught = 0;
for (const [f, a, b, why] of MUT) {
  if (SRC[f].split(a).length !== 2) { console.log(`  ✗ anchor not found once: ${why}`); bad++; continue; }
  const killed = checks({ ...SRC, [f]: SRC[f].replace(a, b) }).some(([, v]) => !v);
  console.log(`  ${killed ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (killed) caught++; else bad++;
}
console.log(`\n${bad ? '✗' : '✓'} verify-booking-and-orders: ${base.filter(([, v]) => v).length}/${base.length} checks, ${caught}/${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
