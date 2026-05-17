'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const ACCENT  = '#00F3FF';
const BG      = '#080808';
const CARD    = '#0e0e0e';
const BORDER  = '#1a1a1a';

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_HEADERS = {
  apikey:        SUPA_ANON,
  Authorization: `Bearer ${SUPA_ANON}`,
  'Content-Type': 'application/json',
};

const TIME_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'];

type Profile = {
  id: string;
  full_name: string;
  business_name: string | null;
  company_name: string | null;
  phone: string | null;
  booking_slug: string;
  booking_active: boolean;
  agreement_template: string | null;
  website: string | null;
};

type Package = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
};

function fmtDur(m: number) {
  return m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function BookingPage() {
  const params  = useParams();
  const slug    = (params?.slug as string) ?? '';

  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [pkgId,    setPkgId]    = useState('');
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [address,  setAddress]  = useState('');
  const [date,     setDate]     = useState('');
  const [time,     setTime]     = useState('');
  const [notes,    setNotes]    = useState('');

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const profRes = await fetch(
          `${SUPA_URL}/rest/v1/booking_profiles?booking_slug=eq.${encodeURIComponent(slug)}&limit=1`,
          { headers: API_HEADERS },
        );
        const profData: Profile[] = await profRes.json();
        if (!profData?.length || !profData[0].booking_active) {
          setError('This booking page is not active.');
          setLoading(false);
          return;
        }
        const p = profData[0];
        setProfile(p);

        const pRes = await fetch(
          `${SUPA_URL}/rest/v1/crm_packages?inspector_id=eq.${p.id}&active=eq.true&order=created_at`,
          { headers: API_HEADERS },
        );
        const pkgData: Package[] = await pRes.json();
        setPackages(pkgData ?? []);
        if (pkgData?.length) setPkgId(pkgData[0].id);
      } catch {
        setError('Unable to load booking page. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!name.trim() || !email.trim() || !address.trim()) {
      alert('Please fill in your name, email, and property address.');
      return;
    }
    setSubmitting(true);
    try {
      const bookingBody: Record<string, unknown> = {
        inspector_id:  profile.id,
        client_name:   name.trim(),
        client_email:  email.trim(),
        client_phone:  phone.trim() || null,
        address:       address.trim(),
        preferred_date: date || null,
        preferred_time: time || null,
        notes:          notes.trim() || null,
        status:        'pending',
        payment_status: 'pending',
        amount_paid:   0,
        agreement_accepted: false,
      };
      if (pkgId) bookingBody.package_id = pkgId;

      const bRes = await fetch(`${SUPA_URL}/rest/v1/crm_bookings`, {
        method:  'POST',
        headers: { ...API_HEADERS, Prefer: 'return=representation' },
        body:    JSON.stringify(bookingBody),
      });
      const bData = await bRes.json();
      const booking = Array.isArray(bData) ? bData[0] : bData;
      if (!booking?.id) throw new Error('Booking creation failed');

      const selectedPkg = packages.find(p => p.id === pkgId);
      if (selectedPkg && selectedPkg.price > 0) {
        const cRes = await fetch(`${SUPA_URL}/functions/v1/create-checkout`, {
          method:  'POST',
          headers: { ...API_HEADERS, origin: window.location.origin },
          body:    JSON.stringify({ booking_id: booking.id, inspector_id: profile.id }),
        });
        const { url, error: cErr } = await cRes.json();
        if (cErr) throw new Error(cErr);
        window.location.href = url;
      } else {
        window.location.href = `/book/${slug}/success?booking_id=${booking.id}`;
      }
    } catch (err: unknown) {
      alert((err as Error).message ?? 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: ACCENT, fontSize: 13, letterSpacing: 2, fontWeight: 900 }}>LOADING...</div>
    </div>
  );

  if (error || !profile) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: '#FF3B3B', fontSize: 13, fontWeight: 700 }}>{error || 'Page not found'}</div>
      <div style={{ color: '#444', fontSize: 11 }}>If you believe this is an error, contact the inspector directly.</div>
    </div>
  );

  const selectedPkg = packages.find(p => p.id === pkgId);

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 2, marginBottom: 4 }}>BOOKING PORTAL</div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>
            {profile.business_name ?? profile.company_name ?? profile.full_name}
          </div>
          {profile.phone && (
            <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>{profile.phone}</div>
          )}
        </div>
        <div style={{ color: '#222', fontSize: 8, fontWeight: 900, letterSpacing: 1.5 }}>POWERED BY LEDRIX</div>
      </div>

      {/* Desktop two-column / mobile single-column */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px', display: 'flex', gap: 40, alignItems: 'flex-start' }}>

        {/* Sidebar — inspector info (hidden on small screens via inline media query workaround) */}
        <div style={{ width: 260, flexShrink: 0, display: 'none' } as React.CSSProperties}
          className="desktop-sidebar"
        >
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, marginBottom: 16 }}>INSPECTOR</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              {profile.business_name ?? profile.company_name ?? profile.full_name}
            </div>
            {profile.phone && (
              <div style={{ color: '#555', fontSize: 13, marginBottom: 6 }}>{profile.phone}</div>
            )}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer"
                style={{ color: ACCENT, fontSize: 11, textDecoration: 'none' }}>
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <div style={{ marginTop: 24, borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
              <div style={{ color: '#333', fontSize: 10, lineHeight: 1.8 }}>
                All bookings are reviewed within 24 hours. You will be contacted to confirm your appointment date and time.
              </div>
            </div>
          </div>
        </div>

        {/* Main form column */}
        <div style={{ flex: 1, minWidth: 0 }}>

        {/* Packages */}
        {packages.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>SELECT A SERVICE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {packages.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => setPkgId(pkg.id)}
                  style={{
                    background:    pkgId === pkg.id ? 'rgba(0,243,255,0.06)' : CARD,
                    border:        `1px solid ${pkgId === pkg.id ? 'rgba(0,243,255,0.35)' : BORDER}`,
                    borderRadius:  14,
                    padding:       '16px 18px',
                    display:       'flex',
                    alignItems:    'center',
                    justifyContent: 'space-between',
                    cursor:        'pointer',
                    textAlign:     'left',
                    width:         '100%',
                  }}
                >
                  <div>
                    <div style={{ color: pkgId === pkg.id ? '#fff' : '#aaa', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{pkg.name}</div>
                    {pkg.description && <div style={{ color: '#555', fontSize: 11, lineHeight: 1.5 }}>{pkg.description}</div>}
                    <div style={{ color: '#444', fontSize: 10, marginTop: 6 }}>{fmtDur(pkg.duration_minutes)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ color: '#22C55E', fontSize: 18, fontWeight: 900 }}>
                      {pkg.price === 0 ? 'FREE' : `$${pkg.price.toFixed(2)}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, marginBottom: 4 }}>YOUR INFORMATION</div>

          {[
            { label: 'FULL NAME *', value: name, setter: setName, type: 'text',  placeholder: 'Jane Smith' },
            { label: 'EMAIL *',     value: email, setter: setEmail, type: 'email', placeholder: 'jane@example.com' },
            { label: 'PHONE',       value: phone, setter: setPhone, type: 'tel',   placeholder: '(555) 555-5555' },
          ].map(f => (
            <div key={f.label}>
              <label style={labelStyle}>{f.label}</label>
              <input
                type={f.type}
                value={f.value}
                onChange={e => f.setter(e.target.value)}
                placeholder={f.placeholder}
                style={inputStyle}
              />
            </div>
          ))}

          <div>
            <label style={labelStyle}>PROPERTY ADDRESS *</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Main St, City, State ZIP"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>PREFERRED DATE</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label style={labelStyle}>PREFERRED TIME</label>
              <select value={time} onChange={e => setTime(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Any time</option>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>NOTES (OPTIONAL)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything the inspector should know in advance..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Summary */}
          {selectedPkg && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{selectedPkg.name}</div>
                <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>{fmtDur(selectedPkg.duration_minutes)}</div>
              </div>
              <div style={{ color: '#22C55E', fontSize: 18, fontWeight: 900 }}>
                {selectedPkg.price === 0 ? 'FREE' : `$${selectedPkg.price.toFixed(2)}`}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              background:    submitting ? '#0a3a3a' : ACCENT,
              color:         submitting ? ACCENT : '#000',
              border:        'none',
              borderRadius:  12,
              padding:       '16px',
              fontSize:      12,
              fontWeight:    900,
              letterSpacing: 2,
              cursor:        submitting ? 'not-allowed' : 'pointer',
              marginTop:     8,
              transition:    'opacity 0.2s',
              opacity:       submitting ? 0.7 : 1,
            }}
          >
            {submitting
              ? 'SUBMITTING...'
              : selectedPkg && selectedPkg.price > 0
                ? `BOOK & PAY $${selectedPkg.price.toFixed(2)}`
                : 'REQUEST BOOKING'
            }
          </button>

          <div style={{ color: '#333', fontSize: 10, textAlign: 'center', lineHeight: 1.6 }}>
            By submitting this form you agree to be contacted regarding your inspection request.
            {selectedPkg && selectedPkg.price > 0 && ' Payment is processed securely via Stripe.'}
          </div>
        </form>
        </div> {/* main form column */}
      </div> {/* two-column layout */}

      {/* Desktop sidebar CSS */}
      <style>{`
        @media (min-width: 900px) {
          .desktop-sidebar { display: block !important; }
        }
      `}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display:       'block',
  color:         '#555',
  fontSize:      9,
  fontWeight:    900,
  letterSpacing: 1.5,
  marginBottom:  6,
};

const inputStyle: React.CSSProperties = {
  width:        '100%',
  background:   '#0a0a0a',
  border:       `1px solid #1e1e1e`,
  borderRadius: 10,
  padding:      '12px 14px',
  color:        '#fff',
  fontSize:     16,
  fontWeight:   500,
  outline:      'none',
  boxSizing:    'border-box',
};
