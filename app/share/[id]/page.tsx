'use client';

import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ValOrbVoice from '@/components/ValOrbVoice';
import { useDesk, PORTAL_TOKEN, setPortalToken, setPortalScope, setPortalHolds, setPortalBearer, isEditLink, lookOnly, setClaimOpener, canEdit, can, shareUrlFor, portal, supaGet, supaPost, ACCENT, BLUE_TEXT, BG, CARD, BORDER, MED, TEXT, SERIF, eyebrow, GLASS, TINT_INFO, TINT_OK, TINT_BAD, SP_CSS, type HomeRecord, type Project, type Reminder, type RepairRow, type MaintenanceLog, type FloorPlanRow, FLOORPLAN_ENABLED, type Tab, indexSystems, seedIfEmpty } from './shared';
import { Skeleton, NotFound, NavBar, Footer, HomeRail, TABBAR_H } from './ui';
import { HomeTab } from './HomeTab';
import { FindingsTab } from './FindingsTab';
import { ProjectsTab, RemindersTab, MaintainTab, HistoryTab } from './MaintainTab';
import { SystemsTab } from './SystemsTab';
import { ClaimCard, DocsTab } from './RecordsTab';
import { SubscribeSheet, ClaimQuestion, closingLabel, isoIn, type ClaimAnswer } from './LedrixPanel';
import { RepairsTab } from './RepairsTab';

// LOADED WHEN OPENED (approval pack item 6, owner 2026-11-25): the Report tab (and its report viewer), Ethix and the Ledrix
// chat (with its voice visualiser) are fetched the first time they are opened, not with the page. Their own files, so
// the first visit downloads less; everything else is unchanged.
const lazyNote = () => <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--smed)', fontSize: 13 }}>Loading…</div>;
const LazyReportTab = dynamic(() => import('./ReportTab').then(m => m.ReportTab), { ssr: false, loading: lazyNote });
const LazyEthixTab = dynamic(() => import('./EthixTab').then(m => m.EthixTab), { ssr: false, loading: lazyNote });
const LazyLedrixPanel = dynamic(() => import('./LedrixChat').then(m => m.LedrixPanel), { ssr: false });

export default function SharePage() {
  const params  = useParams();
  const desk    = useDesk();
  // The Ask Ledrix orb follows the device's light / dark setting, like the rest of the page (approval pack item 4).
  const [darkUi, setDarkUi] = useState(false);
  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!mq) return;
    const on = () => setDarkUi(mq.matches); on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const routeId = params?.id as string;            // URL slug: a share_token (new) or legacy share_id
  const [shareId, setShareId] = useState('');      // canonical share_id (insp_ id) — keys all child tables

  const [record,    setRecord]    = useState<HomeRecord | null>(null);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [repairs,   setRepairs]   = useState<RepairRow[]>([]);
  const [log,       setLog]       = useState<MaintenanceLog[]>([]);
  const [floorPlan, setFloorPlan] = useState<FloorPlanRow | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [tab,       setTab]       = useState<Tab>('home');
  const [hist,      setHist]      = useState<Tab[]>([]);
  // Deep link: /share/<id>?tab=report (marketing's Sample Web Report tile) lands directly on that view.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t && ['report', 'findings', 'specs', 'repairs', 'projects', 'reminders', 'docs', 'ethix', 'systems', 'maintain', 'history'].includes(t)) setTab(t === 'specs' ? 'systems' : t);
    } catch { /* no-op */ }
  }, []);
  const [copied,    setCopied]    = useState(false);

  // Tile drill-in navigation (no bottom rail): go pushes the current screen onto
  // history; back returns to wherever you came from (home if the stack is empty).
  const go   = (t: Tab) => { setHist(h => [...h, tab]); setTab(t); };
  const back = () => setHist(h => { const n = [...h]; setTab(n.pop() ?? 'home'); return n; });
  const pick = (t: Tab) => { setHist([]); setTab(t); };

  // Ledrix premium access. Sign-in is always required; a Stripe subscription is required ONLY when
  // billing is switched on (NEXT_PUBLIC_BILLING_ENABLED=1). Until then this is DORMANT: signed-in === access.
  const BILLING_ON = process.env.NEXT_PUBLIC_BILLING_ENABLED === '1';
  const [session, setSession]       = useState<any>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [subOpen, setSubOpen]       = useState(false);
  const [ledrixOpen, setLedrixOpen] = useState(false);
  const [ledrixEver, setLedrixEver] = useState(false);
  useEffect(() => { if (ledrixOpen) setLedrixEver(true); }, [ledrixOpen]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // The client has read the link's fragment by now; a leftover auth fragment (tokens or an error) is cleared from the
      // address so it is never sent back with the next link or shared by copying the address.
      const h = window.location.hash || '';
      if (/(^|[#&])(access_token|refresh_token|error_code|error_description|error)=/.test(h)) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  // h2 — LOOK-ONLY UNTIL CLAIMED (owner 2026-11-25). `holds`: the signed-in person holds this home (my_claim_state =
  // 'home'); only then does the page offer changes, and every change carries their access token so the server can check
  // the same thing (lib/shareAccess.ts holdsShare). Signed out, buying, or waiting: everything reads, nothing changes.
  const [holds, setHolds] = useState(false);
  const markHolds = (h: boolean) => { setPortalHolds(h); setHolds(h); };
  useEffect(() => {
    setPortalBearer(session?.access_token ?? '');
    if (!session) markHolds(false);
  }, [session]);   // eslint-disable-line react-hooks/exhaustive-deps
  // CLAIM ON SIGN-IN (One Home phase 3, owner 2026-11-12): signed in on this page, the person becomes a homeowner
  // (homeowner_profiles; the server refuses an inspector's email), claims every report sent to their email
  // (claim_my_reports, #110 — the owner), and, on the report's own link, joins this home (claim_by_link, #123 — a
  // resident; a spouse). Once per page load; the server decides everything.
  const [claim, setClaim] = useState<null | { kind: 'claimed' | 'waiting' | 'refused'; text: string }>(null);
  const claimTried = useRef(false);
  // "IS THIS HOME YOURS YET?" (owner 2026-11-25, SQL #153): the answer is asked before the claim (the claim sheet, or the
  // Home tab for someone already signed in) and recorded (set_claim_intent) before claiming. A buyer's claim waits for
  // closing — `buying` holds the date; the page is look-only until "Did you close?" (confirm_closing).
  const [claimAnswer, setClaimAnswer] = useState<ClaimAnswer | null>(null);
  const [needAnswer, setNeedAnswer] = useState(false);
  const [buying, setBuying] = useState<{ closesOn: string | null } | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [newDate, setNewDate] = useState<string | null>(null);
  const markBuying = (closesOn: string | null) => { markHolds(false); setBuying({ closesOn }); setClaim(null); };
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !shareId || claimTried.current) return;
    claimTried.current = true;
    (async () => {
      const inspector = (m?: string) => !!m && /inspector/i.test(m);
      const prof = await supabase.from('homeowner_profiles').upsert({ id: uid, email: session.user.email ?? null, origin: 'claim_link' });
      if (inspector(prof.error?.message)) { setClaim({ kind: 'refused', text: 'This email is registered as an inspector. Use a different email for Ledrix Home.' }); return; }
      const st0 = await supabase.rpc('my_claim_state', { p_share_id: shareId });
      if (st0.data?.state === 'home') { markHolds(true); setClaim({ kind: 'claimed', text: 'This home is on your account.' }); return; }
      if (st0.data?.state === 'buying') { markBuying(st0.data.closes_on ?? null); return; }
      if (isEditLink() && PORTAL_TOKEN) {
        if (!claimAnswer) { setNeedAnswer(true); claimTried.current = false; return; }
        setNeedAnswer(false);
        const ir = await supabase.rpc('set_claim_intent', { raw_token: PORTAL_TOKEN, p_owned: claimAnswer.owned, p_closes_on: claimAnswer.owned ? null : claimAnswer.closesOn });
        if (ir.error) { setClaim({ kind: 'refused', text: ir.error.message || 'Couldn\u2019t record your answer. Try again.' }); claimTried.current = false; return; }
      }
      const mine = await supabase.rpc('claim_my_reports');
      const homes = Array.isArray(mine.data) ? mine.data : [];
      let viaLink: unknown = null; let linkErr = '';
      if (isEditLink() && PORTAL_TOKEN) { const r = await supabase.rpc('claim_by_link', { raw_token: PORTAL_TOKEN }); viaLink = r.data ?? null; linkErr = r.error?.message ?? ''; }
      const st1 = await supabase.rpc('my_claim_state', { p_share_id: shareId });
      if (st1.data?.state === 'buying') markBuying(st1.data.closes_on ?? null);
      else if (st1.data?.state === 'home') { markHolds(true); setClaim({ kind: 'claimed', text: 'This home is on your account.' }); }
      else if (homes.length || viaLink) setClaim({ kind: 'claimed', text: 'This home is on your account.' });
      else if (inspector(linkErr)) setClaim({ kind: 'refused', text: 'This email is registered as an inspector. Use a different email for Ledrix Home.' });
      else if (!isEditLink()) setClaim({ kind: 'refused', text: 'This is a view-only link. Ask for the report’s own link to claim the home.' });
      else setClaim({ kind: 'waiting', text: 'Your claim is waiting: the current owner hands the home over when they move out.' });
    })().catch(() => { claimTried.current = false; });
  }, [session, shareId, claimAnswer]);   // eslint-disable-line react-hooks/exhaustive-deps
  const confirmClosed = async () => {
    setCloseBusy(true);
    const r = await supabase.rpc('confirm_closing', { p_share_id: shareId });
    setCloseBusy(false);
    if (r.error) { setClaim({ kind: 'refused', text: r.error.message || 'Couldn\u2019t confirm. Try again.' }); return; }
    if (r.data) { markHolds(true); setBuying(null); setClaim({ kind: 'claimed', text: 'Congratulations — this home is on your account.' }); }
    else setClaim({ kind: 'waiting', text: 'Thanks. The seller still holds this home on Ledrix; it moves to you when they hand it over.' });
  };
  const moveClosing = async (d: string) => {
    const r = await supabase.rpc('set_closing_date', { p_share_id: shareId, p_closes_on: d });
    if (!r.error) { setBuying({ closesOn: d }); setNewDate(null); }
  };
  useEffect(() => {
    if (!BILLING_ON || !session?.user?.id) { setSubscribed(false); return; }
    supabase.from('home_subscriptions').select('status').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }: any) => setSubscribed(!!data && ['active', 'trialing', 'past_due'].includes(String(data.status))));
  }, [BILLING_ON, session]);
  const access = !!session && (!BILLING_ON || subscribed);
  const startCheckout = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ returnTo: typeof window !== 'undefined' ? window.location.pathname : '/' }) });
      const j = await r.json().catch(() => ({}));
      if (j.url) window.location.href = j.url;
    } catch { /* noop */ }
  };
  const openLedrix = () => (access ? setLedrixOpen(true) : setSubOpen(true));
  const seeded = useRef(false);
  // The page's own schedule/manual reconciliation is a write: it runs once the person holds the home (h2).
  useEffect(() => {
    if (!holds || !shareId || !record || seeded.current || !canEdit()) return;
    seeded.current = true;
    seedIfEmpty(shareId, record.anomalies ?? [], record.specs ?? [])
      .then(() => Promise.all([loadProjects(shareId), loadReminders(shareId)]).catch(() => {}))
      .catch(() => {});
  }, [holds, shareId, record]);   // eslint-disable-line react-hooks/exhaustive-deps
  // "Claim to add" (ui.tsx ClaimToAdd): signed out → the sign-in sheet; signed in → Home, where the claim question is.
  setClaimOpener(() => { if (!session) setSubOpen(true); else go('home'); });

  // VAL (option a) — the FAB orb morphs + records, then transcribes and opens the chat
  // with the message auto-sent. The orb reads `valStream` for its live waveform.
  const [valListening, setValListening] = useState(false);
  const [valStream, setValStream] = useState<MediaStream | null>(null);
  const [valSeed, setValSeed] = useState<string | null>(null);
  const [valLog, setValLog] = useState<any>(null);   // voice-parsed "log this work" pending confirm
  const confirmVoiceLog = async () => {
    if (!can('log.add')) return;
    if (!valLog) return;
    await supaPost('home_maintenance_log', [{ share_id: shareId, title: valLog.title, system: valLog.system ?? null, kind: valLog.kind ?? 'improvement', source: 'voice', done_date: new Date().toISOString().split('T')[0] }]).catch(() => {});
    setValLog(null); loadLog();
  };
  const valRec = useRef<MediaRecorder | null>(null);
  const valChunks = useRef<Blob[]>([]);
  const handleVal = async () => {
    if (!access) { setSubOpen(true); return; }
    if (valListening) { valRec.current?.stop(); return; }   // → onstop transcribes
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      valChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) valChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setValListening(false); setValStream(null);
        const blob = new Blob(valChunks.current, { type: 'audio/webm' });
        if (!blob.size) return;
        try {
          const { data } = await supabase.auth.getSession();
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          const resp = await fetch('/api/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: fd });
          const j = await resp.json().catch(() => ({}));
          if (resp.ok && j.text) {
            const spoken = String(j.text);
            // Is it a "we had X done" statement? Parse it; if so, confirm + log to the Carfax. Else → chat.
            // A view-only link cannot log, so its speech always goes to the chat.
            if (can('log.add')) try {
              const { data: sess } = await supabase.auth.getSession();
              const lr = await fetch('/api/ledrix', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: JSON.stringify({ mode: 'logparse', question: spoken, shareId, token: PORTAL_TOKEN }) });
              const lj = await lr.json().catch(() => ({}));
              if (lr.ok && lj.log?.isLog && lj.log?.title) { setValLog({ ...lj.log, transcript: spoken }); return; }
            } catch { /* fall through to chat */ }
            setValSeed(spoken); setLedrixOpen(true);
          }
        } catch { /* transcribe failed — non-fatal */ }
      };
      mr.start();
      valRec.current = mr;
      setValStream(stream); setValListening(true);
    } catch { /* mic denied / unsupported */ }
  };

  // Child-table loaders key on the CANONICAL share_id (the insp_ id), which may differ from
  // the URL param (a share_token). They accept an explicit id so the initial load can run with
  // the just-resolved record's share_id before the shareId state has settled.
  const loadProjects = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<Project>(`home_projects?share_id=eq.${encodeURIComponent(sid)}&order=created_at.asc`);
    setProjects(data);
  }, [shareId]);

  const loadReminders = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<Reminder>(`home_reminders?share_id=eq.${encodeURIComponent(sid)}&order=due_date.asc.nullslast`);
    setReminders(data);
  }, [shareId]);

  const loadLog = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<MaintenanceLog>(`home_maintenance_log?share_id=eq.${encodeURIComponent(sid)}&order=done_date.desc`);
    setLog(data);
  }, [shareId]);

  const loadRepairs = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<RepairRow>(`home_repairs?share_id=eq.${encodeURIComponent(sid)}&order=sort_order.asc`);
    setRepairs(data);
  }, [shareId]);

  // Schematic floor plan (byproduct of coverage photos) — row may legitimately not
  // exist (no coverage walkthrough = no adjacency data); an empty array back is the
  // normal, expected shape, not an error.
  const loadFloorPlan = useCallback(async (sid: string = shareId) => {
    if (!sid || !FLOORPLAN_ENABLED) return;
    const rows = await supaGet<FloorPlanRow>(`floor_plans?inspection_id=eq.${encodeURIComponent(sid)}&limit=1`);
    setFloorPlan(rows[0] ?? null);
  }, [shareId]);

  // Resolve the record by the URL param (routeId), trying share_token first, then falling back
  // to the legacy share_id (so old insp_ links + the marketing sample keep working). Everything
  // downstream keys on the record's canonical share_id, set into shareId state here.
  useEffect(() => {
    if (!routeId) { setLoading(false); setNotFound(true); return; }
    (async () => {
      // ── ONE AUTHORIZED READ ──────────────────────────────────────────────────────
      // This used to be two anon reads straight through /api/proxy, which worked only
      // because home_records was `select using (true)` — i.e. every client's report was
      // world-readable, share_token included. /api/share/<token> holds the service role
      // server-side, resolves exactly one row by token, and never returns the token.
      //
      // The token is the only credential. The temporary legacy-id redirect was removed once
      // the four pre-token reports were re-issued (2026-08-28).
      // The URL slug IS the portal's credential from here on — every child-table read and write
      // goes through /api/portal carrying it (security fix 2026-08-29).
      setPortalToken(routeId);
      const res = await fetch(`/api/share/${encodeURIComponent(routeId)}`, { cache: 'no-store' });
      if (!res.ok) { setNotFound(true); return; }
      const rec = await res.json() as HomeRecord & { access?: string };
      // A repairs-only link has its own page and never sees the report.
      if (rec?.access === 'repairs') { window.location.replace(`/share/${encodeURIComponent(routeId)}/repairs`); return; }
      if (!rec?.share_id) { setNotFound(true); return; }
      setPortalScope(rec.access === 'read' ? 'read' : 'edit');
      const canonicalId = rec.share_id;
      indexSystems(rec);
      setRecord(rec);
      setShareId(canonicalId);
      await Promise.all([loadProjects(canonicalId), loadReminders(canonicalId), loadRepairs(canonicalId), loadLog(canonicalId), loadFloorPlan(canonicalId)]).catch(() => {});
    })().catch(() => setNotFound(true)).finally(() => setLoading(false));
    // Keyed on routeId only — loaders are called with the resolved canonical id, so they
    // don't need to be effect deps (and including them would re-run this on shareId change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    if (record?.address) document.title = `${record.address} — Ledrix Home Record`;
  }, [record]);

  const handleShare = async () => {
    // Share a VIEW-ONLY link, never this page's own link when it is the edit link. If one cannot be
    // made (portal_links not applied, a database error), say so and share nothing.
    const link = await shareUrlFor('read');
    if (!link.ok) { window.alert(link.message); return; }
    const url = link.url;
    if (navigator.share) {
      await navigator.share({ title: `${record?.address} — Ledrix Home Record`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto' }}>
        <NavBar address="" onShare={() => {}} copied={false} active="home" onBack={() => {}} />
        <Skeleton />
      </div>
    );
  }
  if (notFound || !record) {
    return (
      <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <NavBar address="" onShare={() => {}} copied={false} active="home" onBack={() => {}} />
        <NotFound />
        <Footer />
      </div>
    );
  }

  const anomalies = Array.isArray(record.anomalies) ? record.anomalies : [];
  const specs     = Array.isArray(record.specs)     ? record.specs     : [];

  return (
    <div className="sp" style={{ background: BG, color: TEXT, minHeight: '100vh', maxWidth: tab === 'report' ? 1400 : desk ? (tab === 'home' ? 1080 : 720) : 430, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif',
      paddingBottom: desk ? 24 : `calc(${TABBAR_H + 24}px + env(safe-area-inset-bottom, 0px))` }}>
      <style>{SP_CSS}</style>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        input::placeholder,textarea::placeholder{color:var(--sdim)}
        html,body{background:var(--sbg,#F2F3F5)!important}
        button{-webkit-tap-highlight-color:transparent}
        .rpt{display:grid;grid-template-columns:250px 1fr;grid-template-rows:auto 1fr;grid-template-areas:"side hero" "side main";background:#fff;min-height:100vh}
        .rpt-hero{grid-area:hero}
        .rpt-side{grid-area:side;width:250px;flex-shrink:0;position:sticky;top:0;max-height:100vh;overflow-y:auto;background:#fff;display:flex;flex-direction:column;border-right:1px solid #eef0f3}
        .rpt-main{grid-area:main;min-width:0}
        @media (max-width:860px){
          .rpt{grid-template-columns:1fr;grid-template-rows:none;grid-template-areas:"hero" "side" "main"}
          .rpt-side{position:static;width:100%;max-height:none;overflow-x:auto;overflow-y:hidden;flex-direction:row;border-right:none;border-bottom:1px solid #e5e7eb}
          .rpt-side>button{width:auto!important;border-bottom:none!important;border-right:1px solid #e5e7eb}
        }
        @media print {
          body * { visibility: hidden !important; }
          #repair-print, #repair-print * { visibility: visible !important; }
          #repair-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 24px !important; }
        }
      `}</style>

      <NavBar address={record.address ?? ''} onShare={handleShare} copied={copied} active={tab} onBack={back} signedIn={access} onSignOut={() => supabase.auth.signOut({ scope: 'local' })} />
      {desk && <HomeRail active={tab} onPick={pick} />}
      {!desk && <HomeRail active={tab} onPick={pick} bottom />}
      {claim && (
        <div role="status" style={{ background: claim.kind === 'claimed' ? TINT_OK : claim.kind === 'waiting' ? TINT_INFO : TINT_BAD, borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12.5, fontWeight: 600, padding: '9px 18px', textAlign: 'center' }}>{claim.text}</div>
      )}
      {buying && (() => {
        // BUYING (owner 2026-11-25): look-only until closing; on or after the date, "Did you close?".
        const due = !!buying.closesOn && buying.closesOn <= isoIn(0);
        const btn = (primary: boolean): CSSProperties => ({ border: primary ? 'none' : `1px solid ${BORDER}`, background: primary ? ACCENT : CARD, color: primary ? '#fff' : TEXT,
          borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
        return (
          <div role="status" style={{ background: TINT_INFO, borderBottom: `1px solid ${BORDER}`, color: TEXT, padding: '11px 18px', textAlign: 'center' }}>
            {due ? <>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Did you close on {record.address ?? 'this home'}?</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <button disabled={closeBusy} onClick={confirmClosed} style={btn(true)}>{closeBusy ? 'Confirming…' : 'Yes, I closed'}</button>
                <button onClick={() => setNewDate(isoIn(14))} style={btn(false)}>Not yet</button>
              </div>
            </> : <>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>You&apos;re buying this home{buying.closesOn ? ` · closes ${closingLabel(buying.closesOn)}` : ''}</div>
              <div style={{ fontSize: 12.5, color: MED, marginTop: 3 }}>You can read everything. Tracking repairs and upkeep opens when you close. <button onClick={() => setNewDate(buying.closesOn ?? isoIn(14))} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Change date</button></div>
            </>}
            {newDate !== null && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <input type="date" value={newDate} min={isoIn(-60)} max={isoIn(365)} onChange={e => setNewDate(e.target.value)} aria-label="New closing date"
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', fontSize: 13, background: CARD, color: TEXT }} />
                <button onClick={() => newDate && moveClosing(newDate)} style={btn(true)}>Save date</button>
                <button onClick={() => setNewDate(null)} style={btn(false)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })()}
      {!isEditLink() && (
        <div role="status" style={{ background: TINT_INFO, borderBottom: `1px solid ${BORDER}`, color: BLUE_TEXT, fontSize: 12, fontWeight: 600, padding: '8px 18px', textAlign: 'center' }}>
          View-only link — you can look, but changes are turned off.
        </div>
      )}
      {lookOnly() && !buying && claim?.kind !== 'waiting' && claim?.kind !== 'refused' && (
        <div role="status" style={{ background: TINT_INFO, borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: 12.5, padding: '9px 18px', textAlign: 'center' }}>
          <b>Look-only.</b> Claim this home to add reminders, projects and documents.{' '}
          <button onClick={() => (session ? go('home') : setSubOpen(true))} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Claim</button>
        </div>
      )}

      {tab === 'home'      && <HomeTab record={record} anomalies={anomalies} projects={projects} reminders={reminders} repairs={repairs} onTabChange={go} access={access} shareId={shareId} onUnlock={() => setSubOpen(true)} onAsk={openLedrix}
        claim={!session ? <ClaimCard onClaim={() => setSubOpen(true)} /> : needAnswer ? <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}><ClaimQuestion cta="Claim my home" onAnswer={setClaimAnswer} /></div> : undefined} />}
      {tab === 'findings'  && <FindingsTab anomalies={anomalies} record={record} shareId={shareId} floorPlan={floorPlan} />}
      {(tab === 'systems' || tab === 'specs') && <SystemsTab record={record} anomalies={anomalies} onAllFindings={() => go('findings')} />}
      {tab === 'maintain'  && <MaintainTab reminders={reminders} log={log} projects={projects} repairs={repairs} anomalies={anomalies} record={record} shareId={shareId} access={access} onUnlock={() => setSubOpen(true)}
        onRefreshReminders={() => { loadReminders(); loadLog(); }} onRefreshProjects={loadProjects} onRefreshRepairs={loadRepairs} />}
      {tab === 'history'   && <HistoryTab log={log} record={record} onRefresh={loadLog} />}
      {/* The sealed report stays paper-white in dark mode (approval pack item 4): .sp-paper re-applies the light set. */}
      {tab === 'report'    && <div className="sp-paper" style={{ background: '#fff', color: '#0F1216' }}><LazyReportTab anomalies={anomalies} record={record} onTabChange={go} /></div>}
      {tab === 'repairs'   && <RepairsTab anomalies={anomalies} shareId={shareId} repairs={repairs} record={record} onRefresh={loadRepairs} signedIn={access} />}
      {tab === 'projects'  && <ProjectsTab projects={projects} anomalies={anomalies} shareId={shareId} address={record.address} onRefresh={loadProjects} />}
      {tab === 'reminders' && <RemindersTab reminders={reminders} log={log} shareId={shareId} onRefresh={() => { loadReminders(); loadLog(); }} access={access} onUnlock={() => setSubOpen(true)} />}
      {tab === 'docs'      && <DocsTab record={record} />}
      {tab === 'ethix'     && <LazyEthixTab access={access} onUnlock={() => setSubOpen(true)} />}

      {/* VAL command line — a persistent bottom dock: text opens the chat, orb starts voice.
          Hidden on the wide report view, which carries its own Ask-Ledrix CTA. */}
      {tab !== 'report' && (
        <div style={{ position: 'fixed', bottom: desk ? 0 : `calc(${TABBAR_H}px + env(safe-area-inset-bottom, 0px))`, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: desk ? 560 : 430, zIndex: 120,
          borderRadius: desk ? '14px 14px 0 0' : undefined, borderLeft: desk ? `1px solid ${BORDER}` : undefined, borderRight: desk ? `1px solid ${BORDER}` : undefined,
          background: GLASS, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px 11px' }}>
          <button onClick={openLedrix} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
            <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 14.5, fontWeight: 600 }}>Ask Ledrix</div>
            <div style={{ ...eyebrow(MED, 7.5), marginTop: 3 }}>Voice or type · about this home</div>
          </button>
          <ValOrbVoice size={46} tone={darkUi ? 'dark' : 'light'} quiet controlled={{ listening: valListening, onToggle: handleVal, stream: valStream }} />
        </div>
      )}
      {valLog && can('log.add') && (
        <div onClick={() => setValLog(null)} style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(14,21,24,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: CARD, borderRadius: '18px 18px 0 0', padding: '22px 20px 28px' }}>
            <div style={{ ...eyebrow(ACCENT), marginBottom: 10 }}>Log to your home record?</div>
            <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: TEXT }}>{valLog.title}</div>
            <div style={{ fontSize: 13, color: MED, marginTop: 4 }}>{[valLog.system, 'today'].filter(Boolean).join(' · ')}</div>
            <div style={{ fontSize: 12.5, color: MED, marginTop: 12, fontStyle: 'italic' }}>“{valLog.transcript}”</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => { const t = valLog.transcript; setValLog(null); setValSeed(t); setLedrixOpen(true); }} style={{ flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 11, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>It’s a question</button>
              <button onClick={confirmVoiceLog} style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 11, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Log it</button>
            </div>
          </div>
        </div>
      )}
      <SubscribeSheet open={subOpen} onClose={() => setSubOpen(false)} signedIn={!!session} onSubscribe={startCheckout}
        answer={claimAnswer} onAnswer={isEditLink() && PORTAL_TOKEN ? setClaimAnswer : undefined} />
      {/* Mounted the first time Ask Ledrix opens, then kept, so the conversation stays. */}
      {ledrixEver && <LazyLedrixPanel open={ledrixOpen} onClose={() => setLedrixOpen(false)} shareId={shareId} seed={valSeed} />}
    </div>
  );
}
