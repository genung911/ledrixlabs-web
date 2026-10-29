'use client';
import { useEffect } from 'react';

/** Confirmation links that still land on the homepage (Supabase's default site address) carry their outcome in the
 *  address — forward them to /auth/confirmed, which says what happened. Does nothing on an ordinary visit. */
export function AuthHashForwarder() {
  useEffect(() => {
    const h = window.location.hash || '';
    if (/(^|[#&])(access_token|error_code|error_description)=/.test(h) || /(^|[#&])type=(signup|recovery|email_change)/.test(h)) {
      window.location.replace('/auth/confirmed' + h);
    }
  }, []);
  return null;
}
