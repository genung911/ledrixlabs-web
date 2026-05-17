'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const ACCENT = '#00F3FF';
const BG     = '#080808';
const CARD   = '#0e0e0e';
const BORDER = '#1a1a1a';
const GREEN  = '#22C55E';

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_HEADERS = {
  apikey:         SUPA_ANON,
  Authorization:  `Bearer ${SUPA_ANON}`,
  'Content-Type': 'application/json',
};

type Booking = {
  id:                 string;
  client_name:        string;
  client_email:       string;
  address:            string | null;
  preferred_date:     string | null;
  preferred_time:     string | null;
  payment_status:     string;
  amount_paid:        number;
  agreement_accepted: boolean;
  crm_packages:       { name: string; price: number; description: string | null } | null;
};

type Profile = {
  id:                 string;
  full_name:          string;
  business_name:      string | null;
  phone:              string | null;
  agreement_template: string | null;
};

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const bookingId    = searchParams?.get('booking_id') ?? '';

  const [booking,  setBooking]  = useState<Booking | null>(null);
  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Agreement signing state
  const [signedName, setSignedName] = useState('');
  const [accepted,   setAccepted]   = useState(false);
  const [signing,    setSigning]    = useState(false);
  const [signed,     setSigned]     = useState(false);

  useEffect(() => {
    if (!bookingId) { setError('Missing booking ID.'); setLoading(false); return; }
    (async () => {
      try {
        const bRes = await fetch(
          `${SUPA_URL}/rest/v1/crm_bookings?id=eq.${bookingId}&select=*,crm_packages(name,price,description)&limit=1`,
          { headers: API_HEADERS },
        );
        const bData: Booking[] = await bRes.json();
        if (!bData?.length) { setError('Booking not found.'); setLoading(false); return; }
        const b = bData[0];
        setBooking(b);
        setSigned(b.agreement_accepted);

        // Fetch inspector profile via public booking_profiles view
        const pRes = await fetch(
          `${SUPA_URL}/rest/v1/booking_profiles?id=eq.${(b as any).inspector_id}&select=id,full_name,business_name,phone,agreement_template&limit=1`,
          { headers: API_HEADERS },
        );
        const pData: Profile[] = await pRes.json();
        if (pData?.length) setProfile(pData[0]);
      } catch {
        setError('Unable to load booking details.');
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId]);

  async function handleSign() {
    if (!signedName.trim()) { alert('Please type your full legal name to sign.'); return; }
    if (!accepted) { alert('Please check the agreement acceptance box.'); return; }
    setSigning(true);
    try {
      await fetch(`${SUPA_URL}/rest/v1/crm_bookings?id=eq.${bookingId}`, {
        method:  'PATCH',
        headers: { ...API_HEADERS, Prefer: 'return=minimal' },
        body:    JSON.stringify({
          agreement_accepted:    true,
          agreement_signed_name: signedName.trim(),
          agreement_accepted_at: new Date().toISOString(),
        }),
      });
      setSigned(true);
    } catch {
      alert('Could not save signature. Please try again.');
    } finally {
      setSigning(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: ACCENT, fontSize: 13, letterSpacing: 2, fontWeight: 900 }}>LOADING...</div>
    </div>
  );

  if (error || !booking) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#FF3B3B', fontSize: 13, fontWeight: 700 }}>{error || 'Not found'}</div>
    </div>
  );

  const agreementTemplate = profile?.agreement_template ?? null;
  const filledAgreement = agreementTemplate
    ? fillTemplate(agreementTemplate, {
        CLIENT_NAME:    booking.client_name,
        ADDRESS:        booking.address ?? 'TBD',
        SERVICE_NAME:   booking.crm_packages?.name ?? 'Home Inspection',
        INSPECTOR_NAME: profile?.full_name ?? 'Inspector',
        BUSINESS_NAME:  profile?.business_name ?? profile?.full_name ?? 'Inspector',
        DATE:           booking.preferred_date ?? 'TBD',
      })
    : null;

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 2, marginBottom: 4 }}>BOOKING CONFIRMED</div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>
            {profile?.business_name ?? profile?.full_name ?? 'Home Inspection'}
          </div>
        </div>
        <div style={{ color: '#222', fontSize: 8, fontWeight: 900, letterSpacing: 1.5 }}>POWERED BY LEDRIX</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Success banner */}
        <div style={{
          background:    'rgba(34,197,94,0.06)',
          border:        `1px solid rgba(34,197,94,0.25)`,
          borderRadius:  16,
          padding:       '24px 20px',
          display:       'flex',
          alignItems:    'center',
          gap:           16,
        }}>
          <div style={{ color: GREEN, fontSize: 28 }}>✓</div>
          <div>
            <div style={{ color: GREEN, fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
              {booking.payment_status === 'paid' ? 'Payment Received' : 'Booking Received'}
            </div>
            <div style={{ color: '#555', fontSize: 12, lineHeight: 1.6 }}>
              Thank you, {booking.client_name}. Your inspection request has been received.
              The inspector will be in touch to confirm your appointment.
            </div>
          </div>
        </div>

        {/* Booking summary */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2 }}>BOOKING SUMMARY</div>
          </div>
          {[
            { label: 'Client',   value: booking.client_name },
            { label: 'Email',    value: booking.client_email },
            { label: 'Property', value: booking.address ?? '—' },
            { label: 'Service',  value: booking.crm_packages?.name ?? 'General Inspection' },
            { label: 'Date',     value: booking.preferred_date ?? 'To be confirmed' },
            { label: 'Time',     value: booking.preferred_time ?? 'To be confirmed' },
            ...(booking.payment_status === 'paid' ? [{ label: 'Amount Paid', value: `$${booking.amount_paid.toFixed(2)}` }] : []),
          ].map((row, i) => (
            <div key={row.label} style={{
              display:       'flex',
              padding:       '12px 18px',
              borderBottom:  i < 6 ? `1px solid ${BORDER}` : 'none',
              alignItems:    'flex-start',
              gap:           16,
            }}>
              <div style={{ color: '#444', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, width: 90, flexShrink: 0 }}>{row.label.toUpperCase()}</div>
              <div style={{ color: '#bbb', fontSize: 12, fontWeight: 500, flex: 1 }}>{row.value}</div>
            </div>
          ))}
        </div>

        {/* Service Agreement */}
        {filledAgreement && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2 }}>SERVICE AGREEMENT</div>
            </div>

            {/* Agreement text */}
            <div style={{
              padding:    '18px 20px',
              color:      '#777',
              fontSize:   12,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              borderBottom: `1px solid ${BORDER}`,
              maxHeight:  320,
              overflowY:  'auto',
            }}>
              {filledAgreement}
            </div>

            {/* Signature */}
            {signed ? (
              <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ color: GREEN, fontSize: 20 }}>✓</div>
                <div>
                  <div style={{ color: GREEN, fontSize: 13, fontWeight: 700 }}>Agreement Signed</div>
                  <div style={{ color: '#444', fontSize: 11, marginTop: 2 }}>This agreement has been accepted and recorded.</div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ color: '#555', fontSize: 11, lineHeight: 1.6 }}>
                  By typing your full legal name and checking the box below, you agree to the terms of this service agreement.
                </div>

                <div>
                  <label style={labelStyle}>YOUR FULL LEGAL NAME</label>
                  <input
                    type="text"
                    value={signedName}
                    onChange={e => setSignedName(e.target.value)}
                    placeholder="Jane Smith"
                    style={inputStyle}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={e => setAccepted(e.target.checked)}
                    style={{ marginTop: 2, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }}
                  />
                  <span style={{ color: '#666', fontSize: 11, lineHeight: 1.6 }}>
                    I have read and agree to the service agreement above. I understand this constitutes a legally binding electronic signature.
                  </span>
                </label>

                <button
                  onClick={handleSign}
                  disabled={signing || !signedName.trim() || !accepted}
                  style={{
                    background:    signing || !signedName.trim() || !accepted ? '#111' : ACCENT,
                    color:         signing || !signedName.trim() || !accepted ? '#333' : '#000',
                    border:        'none',
                    borderRadius:  10,
                    padding:       '14px',
                    fontSize:      11,
                    fontWeight:    900,
                    letterSpacing: 2,
                    cursor:        signing || !signedName.trim() || !accepted ? 'not-allowed' : 'pointer',
                  }}
                >
                  {signing ? 'SAVING...' : 'I ACCEPT — SIGN AGREEMENT'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Contact info */}
        {profile?.phone && (
          <div style={{ color: '#333', fontSize: 11, textAlign: 'center', lineHeight: 1.8 }}>
            Questions? Contact {profile.full_name} at {profile.phone}
          </div>
        )}
        <div style={{ color: '#222', fontSize: 10, textAlign: 'center' }}>
          Booking managed by Ledrix · ledrixlabs.com
        </div>

      </div>
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
  width:      '100%',
  background: '#0a0a0a',
  border:     `1px solid #1e1e1e`,
  borderRadius: 10,
  padding:    '12px 14px',
  color:      '#fff',
  fontSize:   13,
  fontWeight: 500,
  outline:    'none',
  boxSizing:  'border-box',
};
