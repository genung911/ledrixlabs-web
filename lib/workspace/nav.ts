// Post-sign-in destination. Only a same-site path inside the workspace is honoured, so
// /app/login?next=… can never bounce a user to another origin (open redirect).
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '/app';
  if (!/^\/app(?:[/?#]|$)/.test(raw)) return '/app';
  if (raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return '/app';
  if (raw.startsWith('/app/login')) return '/app';
  return raw;
}
