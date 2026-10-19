// The browser's side of "Draft with Ledrix": the signed-in POST to /api/template-authoring. The route builds the
// prompt and holds the model key; this only sends the private draft's tree and the owner's words, and returns the
// reply for proposalFromResponse to check.
import { workspace } from '@/lib/workspace/client';
import type { ModelCall } from './session';

export const callTemplateAuthoring: ModelCall = async ({ templateId, systemId, request, tree }) => {
  const { data } = await workspace.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Your session ended. Sign in again to ask Ledrix.' };
  let resp: Response;
  try {
    resp = await fetch('/api/template-authoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ templateId, systemId, request, tree }),
    });
  } catch {
    return { ok: false, error: 'Ledrix could not be reached. Check the connection and try again.' };
  }
  const json = await resp.json().catch(() => null) as { parsed?: unknown; model?: string; promptRef?: string; error?: string } | null;
  if (!resp.ok || !json || json.parsed === undefined) return { ok: false, error: json?.error ?? 'Ledrix did not return usable changes. Try again.' };
  return { ok: true, reply: { parsed: json.parsed, model: json.model ?? '', ...(json.promptRef ? { promptRef: json.promptRef } : {}) } };
};
