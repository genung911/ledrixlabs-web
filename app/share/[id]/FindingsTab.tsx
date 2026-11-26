import { useRef, useState } from 'react';
import { GREEN, CARD, CARD2, BORDER, DIM, MED, TEXT, SERIF, MONO, eyebrow, type Anomaly, type HomeRecord, type FPRoom, type FPLayout, type FloorPlanRow, FLOORPLAN_ENABLED, PRIO, type PrioKey, PRIO_ORDER, PRIO_SHORT, anomalyInRoom, floorLabel, priorityOf, INK_ON } from './shared';
import { Icon, FindingCard } from './ui';

// ─── FINDINGS TAB ─────────────────────────────────────────────────────────────
// ─── FLOOR PLAN — schematic (non-LiDAR) room layout + per-room finding count-pins ──
// Renders ONLY when a floor_plans row exists for this inspection (a byproduct of the
// inspector's coverage-photo walkthrough) — no row = no section at all, no placeholder,
// no empty header. One block per floor. Rooms drawn as SVG rects (consistent with this
// file's existing SVG usage in Icon); labels + count-pin badges are absolutely
// positioned HTML on top so typography stays crisp regardless of the room grid's scale.
function FloorBlock({ label, rooms, pins, anomalies, onSelectRoom }: {
  label: string; rooms: FPRoom[]; pins?: Record<string, { fx: number; fy: number }>;
  anomalies: Anomaly[]; onSelectRoom: (room: FPRoom) => void;
}) {
  const pad = 0.6;
  const minX = Math.min(...rooms.map(r => r.gridX));
  const minY = Math.min(...rooms.map(r => r.gridY));
  const maxX = Math.max(...rooms.map(r => r.gridX + r.w));
  const maxY = Math.max(...rooms.map(r => r.gridY + r.h));
  const vbX = minX - pad, vbY = minY - pad;
  const vbW = Math.max(maxX - minX, 1) + pad * 2;
  const vbH = Math.max(maxY - minY, 1) + pad * 2;
  const aspectPct = Math.min(Math.max((vbH / vbW) * 100, 42), 130);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative', width: '100%', paddingTop: `${aspectPct}%`, background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {rooms.map(r => (
            <rect key={r.roomId} x={r.gridX} y={r.gridY} width={r.w} height={r.h} rx={0.12}
              fill="#EEF3F1" stroke="#37475B" strokeOpacity={0.4} strokeWidth={0.06} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {rooms.map(r => {
          const count = anomalies.filter(a => anomalyInRoom(a, r)).length;
          const pin = pins?.[r.roomId];
          const fx = pin?.fx ?? 0.5, fy = pin?.fy ?? 0.5;
          const left = ((r.gridX - vbX) / vbW) * 100;
          const top  = ((r.gridY - vbY) / vbH) * 100;
          const w    = (r.w / vbW) * 100;
          const h    = (r.h / vbH) * 100;
          return (
            <div key={r.roomId} style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` }}>
              <div style={{ position: 'absolute', left: 4, top: 3, right: 4, fontSize: 9, fontWeight: 700, color: MED, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
              {count > 0 && (
                <button
                  onClick={() => onSelectRoom(r)}
                  aria-label={`${count} finding${count > 1 ? 's' : ''} in ${r.label} — view`}
                  style={{
                    position: 'absolute', left: `${fx * 100}%`, top: `${fy * 100}%`, transform: 'translate(-50%, -50%)',
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: TEXT, color: INK_ON,
                    border: `2px solid ${CARD}`, fontSize: 9.5, fontWeight: 700, lineHeight: '14px', display: 'grid',
                    placeItems: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(16,24,28,0.35)',
                  }}
                >{count}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function FloorPlanSchematic({ layout, anomalies, onSelectRoom }: { layout: FPLayout; anomalies: Anomaly[]; onSelectRoom: (room: FPRoom) => void }) {
  const rooms = layout.rooms ?? [];
  if (rooms.length === 0) return null;

  const byFloor = new Map<string, FPRoom[]>();
  for (const r of rooms) {
    const key = String(r.floor ?? 0);
    if (!byFloor.has(key)) byFloor.set(key, []);
    byFloor.get(key)!.push(r);
  }
  const floorKeys = Array.from(byFloor.keys()).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    return (!Number.isNaN(na) && !Number.isNaN(nb)) ? na - nb : a.localeCompare(b);
  });

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...eyebrow(MED, 8.5), marginBottom: 10 }}>Floor Plan · Schematic</div>
      {floorKeys.map(fk => (
        <FloorBlock key={fk} label={floorLabel(byFloor.get(fk)![0].floor)} rooms={byFloor.get(fk)!} pins={layout.pins} anomalies={anomalies} onSelectRoom={onSelectRoom} />
      ))}
      <p style={{ color: DIM, fontSize: 10.5, lineHeight: 1.5, margin: '10px 2px 0', fontStyle: 'italic' }}>
        This floor plan is a schematic approximation generated from the inspector&rsquo;s room-by-room documentation.
        Room positions and proportions are AI-estimated for orientation only — not measured, not to scale, and not
        suitable for renovation, permitting, or construction use.
      </p>
    </div>
  );
}

function FindingsTab({ anomalies, record, shareId, floorPlan }: { anomalies: Anomaly[]; record: HomeRecord; shareId: string; floorPlan?: FloorPlanRow | null }) {
  const [filter, setFilter] = useState<'all' | PrioKey>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'priority' | 'system' | 'room'>('priority');
  const [specsOpen, setSpecsOpen] = useState(false);
  const [focusRoom, setFocusRoom] = useState<FPRoom | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectRoom = (room: FPRoom) => {
    setFocusRoom(room);
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const prioCount = anomalies.reduce((m, a) => { const k = priorityOf(a).key; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<PrioKey, number>);

  const filtered = anomalies.filter(a => {
    if (focusRoom && !anomalyInRoom(a, focusRoom)) return false;
    if (filter !== 'all' && priorityOf(a).key !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.unit ?? '').toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q) || (a.location ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Sort: priority = flat, worst-first. system/room = grouped by that field, each
  // group sorted by priority within (so "both" — focus a trade, worst items first).
  const byPriority = (x: Anomaly, y: Anomaly) => priorityOf(x).rank - priorityOf(y).rank;
  const flatSorted = filtered.slice().sort(byPriority);
  const groups = sort === 'priority' ? null : (() => {
    const m = new Map<string, Anomaly[]>();
    for (const a of filtered) {
      const k = ((sort === 'system' ? a.unit : a.location) || '').trim() || (sort === 'system' ? 'Other' : 'Unspecified');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries())
      .map(([key, items]) => ({ key, items: items.slice().sort(byPriority) }))
      .sort((a, b) => (a.items[0] ? priorityOf(a.items[0]).rank : 9) - (b.items[0] ? priorityOf(b.items[0]).rank : 9));
  })();

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Inspection</div>
      <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Repairs Needed</div>

      {FLOORPLAN_ENABLED && floorPlan?.layout && <FloorPlanSchematic layout={floorPlan.layout} anomalies={anomalies} onSelectRoom={selectRoom} />}

      {focusRoom && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderLeft: `2px solid ${TEXT}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          <span style={{ color: TEXT, fontSize: 11.5, fontWeight: 600 }}>Showing findings in {focusRoom.label}</span>
          <button onClick={() => setFocusRoom(null)} style={{ background: 'none', border: 'none', color: MED, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, textDecoration: 'underline' }}>Clear</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {(([['all', 'All', anomalies.length, TEXT]] as ['all' | PrioKey, string, number, string][])
          .concat(PRIO_ORDER.filter(k => (prioCount[k] ?? 0) > 0).map(k => [k, PRIO_SHORT[k], prioCount[k], PRIO[k].color]))
        ).map(([key, label, count, c]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            background: filter === key ? `${c}14` : CARD, border: `1px solid ${filter === key ? c+'55' : BORDER}`,
            color: filter === key ? c : MED, borderRadius: 99, padding: '6px 14px', fontSize: 8.5,
            fontWeight: 600, letterSpacing: '0.12em', fontFamily: MONO, textTransform: 'uppercase',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}</button>
        ))}
      </div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 12 }}>⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search findings…" style={{
          width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: '10px 12px 10px 30px', color: TEXT, fontSize: 12, outline: 'none',
          fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
        }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        <span style={{ ...eyebrow(DIM, 8), flexShrink: 0 }}>Sort</span>
        {(['priority', 'system', 'room'] as const).map(key => (
          <button key={key} onClick={() => setSort(key)} style={{
            background: sort === key ? TEXT : CARD, border: `1px solid ${sort === key ? TEXT : BORDER}`,
            color: sort === key ? '#fff' : MED, borderRadius: 99, padding: '6px 14px', fontSize: 8.5,
            fontWeight: 600, letterSpacing: '0.12em', fontFamily: MONO,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'capitalize',
          }}>{key}</button>
        ))}
      </div>
      <div ref={listRef} />
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
          <div style={{ ...eyebrow(filter === 'all' ? GREEN : DIM, 9) }}>
            {focusRoom ? `NO FINDINGS IN ${focusRoom.label.toUpperCase()}` : filter === 'all' ? 'NO FINDINGS LOGGED' : `NO ${filter.toUpperCase()} FINDINGS`}
          </div>
        </div>
      ) : sort === 'priority' ? (
        flatSorted.map((a, i) => (
          <FindingCard key={a.id ?? i} a={a} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={shareId} />
        ))
      ) : (
        (groups ?? []).map(g => (
          <div key={g.key} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 2px 8px' }}>
              <span style={{ fontFamily: SERIF, color: TEXT, fontSize: 14, fontWeight: 600 }}>{g.key}</span>
              <span style={{ fontFamily: MONO, color: DIM, fontSize: 9.5, fontWeight: 500 }}>({g.items.length})</span>
            </div>
            {g.items.map((a, i) => (
              <FindingCard key={a.id ?? `${g.key}-${i}`} a={a} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={shareId} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
export { FloorBlock, FloorPlanSchematic, FindingsTab };
