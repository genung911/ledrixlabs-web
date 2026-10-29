import { ConfirmedStatus } from '@/components/auth/ConfirmedStatus';

// Where a Ledrix sign-up confirmation link lands (2026-10-28). Supabase confirms the email when the link is tapped,
// then sends the browser here (the app asks for this page; links that still go to the homepage are forwarded by
// AuthHashForwarder). The outcome is in the address: an error (expired / already used) or a session. This page only
// says which, in plain words — it signs nobody in and stores nothing.
export const metadata = { title: 'Email confirmation — Ledrix', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <ConfirmedStatus />
      </div>
    </main>
  );
}
