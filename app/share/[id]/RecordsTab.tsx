import { useCallback, useEffect, useRef, useState } from 'react';
import { PORTAL_TOKEN, canEdit, can, lookOnly, openClaim, authHeaders, supaGet, ACCENT, WARN, CARD, BORDER, DIM, MED, TEXT, SERIF, eyebrow, type HomeRecord, fmtDate, INK_ON } from './shared';
import { Icon, pdfHref, Footer } from './ui';
function ClaimCard({ onClaim }: { onClaim: () => void }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${ACCENT}40`, borderRadius: 14, padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Make this home yours</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: MED }}>Keep the record on your account, log upkeep, store receipts and ask Ledrix about your home.</div>
      <button onClick={onClaim} style={{ minHeight: 44, borderRadius: 22, border: 'none', background: ACCENT, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Claim your home</button>
    </div>
  );
}

// ─── DOCS TAB ─────────────────────────────────────────────────────────────────

function DocsTab({ record }: { record: HomeRecord }) {
  const shareId = record.share_id;
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [openCat, setOpenCat] = useState<null | 'reports' | 'manual' | 'document'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadDocs = useCallback(async () => {
    setDocs(await supaGet<any>(`home_documents?share_id=eq.${encodeURIComponent(shareId)}&order=created_at.desc`));
  }, [shareId]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!can('doc.upload')) return;
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    const kind = openCat === 'manual' ? 'manual' : 'document';
    setUploading(true);
    try {
      // Three steps, so the file never passes through Vercel (4.5 MB request cap): /api/docs signs an
      // upload for one fresh path under this home, the browser sends the file straight to storage,
      // then /api/docs checks what was stored and writes the row itself.
      const post = (body: object) => fetch('/api/docs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ token: PORTAL_TOKEN, ...body }) });
      const fail = async (r: Response) => { const j = await r.json().catch(() => ({})); window.alert(j.error || 'Upload failed.'); };
      const signed = await post({ action: 'upload-url', name: f.name, size: f.size, kind });
      if (!signed.ok) { await fail(signed); return; }
      const { uploadUrl, path, contentType } = await signed.json();
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: f });
      if (!put.ok) { window.alert('Upload failed.'); return; }
      const done = await post({ action: 'complete', path, name: f.name, kind });
      if (done.ok) await loadDocs(); else await fail(done);
    } catch { /* noop */ } finally { setUploading(false); }   // also after a refused step's early return
  };
  // Removes the stored file and its row together (/api/docs), not just the row.
  const removeDoc = async (d: any) => {
    if (!can('doc.delete')) return;
    await fetch('/api/docs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ token: PORTAL_TOKEN, id: d.id }) }).catch(() => {});
    await loadDocs();
  };
  // A stored file opens through a short-lived signed link; a manufacturer-manual row is an outside link.
  const docHref = (d: any): string | undefined =>
    d.path ? `/api/docs?t=${encodeURIComponent(PORTAL_TOKEN)}&id=${encodeURIComponent(d.id)}`
      : /^https?:\/\//i.test(String(d.url ?? '')) ? d.url : undefined;

  const manuals   = docs.filter(d => d.kind === 'manual');
  const documents = docs.filter(d => d.kind !== 'manual' && d.kind !== 'report');
  const hasReport = !!pdfHref(record);

  // ── Category detail — open a tile to list + manage its items ──
  if (openCat) {
    const label = openCat === 'reports' ? 'Inspection Reports' : openCat === 'manual' ? 'Manuals' : 'Documents';
    const items = openCat === 'manual' ? manuals : openCat === 'document' ? documents : [];
    return (
      <div style={{ padding: '16px 16px 0' }}>
        <button onClick={() => setOpenCat(null)} style={{ background: 'none', border: 'none', color: TEXT, fontSize: 10, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', padding: '2px 0', marginBottom: 12, fontFamily: 'Roboto Mono, monospace' }}>← DOCS</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ color: TEXT, fontSize: 12, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>{label.toUpperCase()}</div>
          {openCat !== 'reports' && lookOnly() && (
            <button onClick={openClaim} style={{ background: 'none', border: `1px dashed ${BORDER}`, color: DIM, borderRadius: 8, padding: '8px 12px', fontSize: 9, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', cursor: 'pointer' }}>🔒 CLAIM TO ADD</button>
          )}
          {openCat !== 'reports' && canEdit() && (
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: 'none', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: '8px 12px', fontSize: 9, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', cursor: uploading ? 'default' : 'pointer' }}>{uploading ? 'UPLOADING…' : '+ UPLOAD'}</button>
          )}
        </div>
        <input ref={fileRef} type="file" onChange={onFile} accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.heic,.heif" style={{ display: 'none' }} />
        {openCat === 'reports' ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
            <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.65, marginBottom: 12 }}>Your full inspection report — a permanent record of this property&apos;s condition at the time of inspection.</p>
            {pdfHref(record) ? (
              <a href={pdfHref(record)!} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', background: TEXT, border: 'none', color: INK_ON, borderRadius: 8, padding: 12, fontSize: 10, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', textDecoration: 'none' }}>VIEW / PRINT REPORT PDF ↗</a>
            ) : (
              <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace', fontWeight: 700 }}>PDF AVAILABLE IN LEDRIX APP · REQUEST A COPY FROM YOUR INSPECTOR</div>
            )}
          </div>
        ) : items.length === 0 ? (
          <div style={{ background: CARD, border: `1px dashed ${BORDER}`, borderRadius: 12, padding: '22px 16px', textAlign: 'center', color: DIM, fontSize: 11, lineHeight: 1.6 }}>
            {openCat === 'manual' ? 'No manuals yet. Tap Upload to add an appliance or system manual.' : 'No documents yet. Tap Upload to add a receipt, warranty, or any house file.'}
          </div>
        ) : items.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            <Icon name="docs" size={18} color={TEXT} />
            <a href={docHref(d)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: TEXT, fontSize: 12.5, fontWeight: 700, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</a>
            {canEdit() && <button onClick={() => removeDoc(d)} aria-label="Delete document" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 15, flexShrink: 0, lineHeight: 1 }}>✕</button>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Home Record</div>
      <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Documents</div>

      {/* Category tiles — open one to view its items */}
      {([['reports', 'Inspection Reports', hasReport ? 1 : 0], ['manual', 'Manuals', manuals.length], ['document', 'Documents', documents.length]] as ['reports' | 'manual' | 'document', string, number][]).map(([cat, label, count]) => (
        <button key={label} onClick={() => setOpenCat(cat)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px', marginBottom: 10, cursor: 'pointer', textAlign: 'left' }}>
          <Icon name="docs" size={20} color={TEXT} />
          <span style={{ flex: 1, minWidth: 0, color: TEXT, fontSize: 14, fontWeight: 700 }}>{label}</span>
          <span style={{ color: DIM, fontSize: 12, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>{count}</span>
          <span style={{ color: MED, fontSize: 16, lineHeight: 1 }}>›</span>
        </button>
      ))}
      <div style={{ height: 6 }} />

      {/* Inspection record */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ color: MED, fontSize: 8, fontWeight: 600, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 12 }}>
          INSPECTION RECORD
        </div>
        {([
          ['ADDRESS', record.address],
          ['CITY/STATE/ZIP', subAddress || null],
          ['YEAR BUILT', record.year_built],
          ['SQ FT', record.sqft],
          ['BEDS', record.beds],
          ['BATHS', record.baths],
          ['GARAGE', record.garage],
          ['INSPECTION TYPE', record.inspection_type],
          ['INSPECTION DATE', fmtDate(record.inspection_date)],
        ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
            borderBottom: `1px solid ${BORDER}22` }}>
            <span style={{ color: DIM, fontSize: 9, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>{label}</span>
            <span style={{ color: TEXT, fontSize: 11, fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Inspector */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ color: MED, fontSize: 8, fontWeight: 600, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 10 }}>INSPECTOR</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{record.inspector ?? '—'}</div>
            {record.company && <div style={{ color: MED, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{record.company}</div>}
            {record.license_number && <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace' }}>{record.license_number}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>
              {record.inspection_type?.toUpperCase() ?? 'HOME INSPECTION'}
            </div>
            <div style={{ color: TEXT, fontSize: 11, fontWeight: 700 }}>{fmtDate(record.inspection_date)}</div>
          </div>
        </div>
      </div>


      {/* Disclaimer */}
      <div style={{ padding: '12px 16px', background: `${WARN}08`, border: `1px solid ${WARN}22`, borderRadius: 10, marginBottom: 8 }}>
        <p style={{ color: MED, fontSize: 9, lineHeight: 1.7, fontFamily: 'Roboto Mono, monospace' }}>
          ⚠ This report reflects conditions at the time of inspection. It does not constitute a warranty or guarantee.
          Consult licensed professionals for all repair decisions.
        </p>
      </div>

      <Footer />
    </div>
  );
}
export { ClaimCard, DocsTab };
