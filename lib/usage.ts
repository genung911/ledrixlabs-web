// Free-beta daily usage cap. Atomic per-user/day counter in Supabase, enforced
// server-side in the AI routes so an open beta can't run up a surprise bill.
import type { SupabaseClient } from '@supabase/supabase-js';

export const DAILY_CAP = 30;

// Increments today's count for the user and returns the new total. Fails OPEN
// (returns 0) on any error so a usage-table hiccup never blocks the product.
export async function bumpUsage(admin: SupabaseClient, userId: string): Promise<number> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const { data, error } = await admin.rpc('increment_ledrix_usage', { uid: userId, d: day });
    if (error) return 0;
    return typeof data === 'number' ? data : 0;
  } catch {
    return 0;
  }
}
