#!/usr/bin/env node
// verify-share-lazy — approval pack item 6 (owner 2026-11-25, "Share page loads faster"): the Home Record's first visit
// does not carry the Report tab, Ethix, the Ledrix chat or framer-motion. Reads the share page's own files (not the joined
// module: the point is what each file imports) and the orb. `--mutate` proves each check can fail (in memory).
import { readFileSync, readdirSync } from 'node:fs';
const DIR = new URL('../app/share/[id]/', import.meta.url);
const FILES = Object.fromEntries(readdirSync(DIR).filter(f => f.endsWith('.tsx')).map(f => [f, readFileSync(new URL(f, DIR), 'utf8')]));
const ORB = readFileSync(new URL('../components/ValOrbVoice.tsx', import.meta.url), 'utf8');

function checks(F, orb) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  const staticImportOf = (mod) => Object.entries(F).filter(([, s]) => new RegExp(`^import [^;]* from '\\./${mod}';$`, 'm').test(s)).map(([f]) => f);
  const P = F['page.tsx'];
  for (const [mod, name] of [['ReportTab', 'ReportTab'], ['EthixTab', 'EthixTab'], ['LedrixChat', 'LedrixPanel']]) {
    ok(`${mod} is loaded only when opened (next/dynamic, no file imports it directly)`, staticImportOf(mod).length === 0
      && P.includes(`dynamic(() => import('./${mod}').then(m => m.${name})`));
  }
  ok('the chat is mounted the first time Ask Ledrix opens, then kept', P.includes('{ledrixEver && <LazyLedrixPanel open={ledrixOpen}') && P.includes('useEffect(() => { if (ledrixOpen) setLedrixEver(true); }, [ledrixOpen]);'));
  ok('the Report and Ethix tabs render their lazy versions', P.includes('<LazyReportTab anomalies={anomalies}') && P.includes("{tab === 'ethix'     && <LazyEthixTab"));
  ok('the orb has no framer-motion (it was ~40 kB gzipped of the first visit)', !/from 'framer-motion'/.test(orb) && !/<motion\./.test(orb));
  ok('…its motions are CSS, and reduced motion turns them off', /transition:width \.42s/.test(orb) && /@keyframes vovBreathe/.test(orb) && /prefers-reduced-motion:reduce/.test(orb));
  ok('no share-page file imports framer-motion', !Object.values(F).some(s => /from 'framer-motion'/.test(s)));
  return out;
}
const MUTS = [
  ['the Report tab is imported directly', 'page.tsx', "import dynamic from 'next/dynamic';", "import dynamic from 'next/dynamic';\nimport { ReportTab } from './ReportTab';"],
  ['the chat is imported directly', 'page.tsx', "import dynamic from 'next/dynamic';", "import dynamic from 'next/dynamic';\nimport { LedrixPanel } from './LedrixChat';"],
  ['Ethix is no longer lazy', 'page.tsx', "dynamic(() => import('./EthixTab').then(m => m.EthixTab)", "dynamic(async () => (await import('./EthixTab')).EthixTab"],
  ['the chat loads with the page', 'page.tsx', '{ledrixEver && <LazyLedrixPanel open={ledrixOpen}', '{true && <LazyLedrixPanel open={ledrixOpen}'],
  ['a tab pulls framer-motion in', 'HomeTab.tsx', "import { useMemo, useState, type ReactNode } from 'react';", "import { useMemo, useState, type ReactNode } from 'react';\nimport { motion } from 'framer-motion';"],
  ['the orb goes back to framer-motion', 'ORB', "import { useState } from 'react';", "import { useState } from 'react';\nimport { motion, AnimatePresence, useReducedMotion } from 'framer-motion';"],
  ['the orb ignores reduced motion', 'ORB', '@media (prefers-reduced-motion:reduce){', '@media (min-width:99999px){'],
];
let fail = 0;
for (const [n, v] of checks(FILES, ORB)) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, f, a, b] of MUTS) {
    const src = f === 'ORB' ? ORB : FILES[f];
    if (src.split(a).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    const hit = f === 'ORB' ? checks(FILES, ORB.replace(a, b)).some(([, v]) => !v) : checks({ ...FILES, [f]: src.replace(a, b) }, ORB).some(([, v]) => !v);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length} mutations caught`);
}
console.log(`\nverify-share-lazy — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
