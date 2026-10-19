// POST /api/template-authoring — "Draft with Ledrix" for the desktop Template Builder.
//
// The browser sends { templateId, systemId, request, tree } (tree = its PRIVATE draft). This route:
//   1. requires a signed-in Supabase user (Authorization: Bearer <access token>) — no session, 401;
//   2. requires that user to be an owner or admin of a company (lib/templateBuilder/access), and the template to
//      be one of THAT company's company_templates rows — anything else, 403 / 404;
//   3. builds the prompt HERE, from the vendored core (buildAuthoringPrompt — the same fixed grammar the app
//      uses). The caller supplies data, never instructions to the model: there is no free-form prompt path, so
//      this is not a general model proxy;
//   4. counts the call against the per-user daily AI cap (lib/usage, increment_ledrix_usage);
//   5. returns the model's parsed JSON. It is still UNTRUSTED: the browser runs proposalFromResponse on it, which
//      refuses anything out of scope, and nothing applies until the owner accepts it.
//
// It writes nothing except the usage counter: no company_templates, no inspection, no snapshot.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bumpUsage, DAILY_CAP } from '../../../lib/usage';
import { buildAuthoringPrompt } from '../../../lib/templateBuilder/core/templateAuthoring';
import type { InspectionTemplate } from '../../../lib/templateBuilder/core/InspectionTemplate';
import { canAuthorTemplates, TEMPLATE_AUTHORING_MODEL } from '../../../lib/templateBuilder/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GATEWAY_URL = (process.env.GATEWAY_URL ?? '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
const SUPA_URL    = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** A draft tree is a few hundred KB at most; refuse anything far larger before parsing it. */
const MAX_BODY_BYTES = 1_500_000;
const MODEL_TIMEOUT_MS = 55_000;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

function parseModelJson(text: string): unknown {
  const t = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* not JSON */ } }
  return null;
}

async function askModel(system: string, user: string): Promise<unknown> {
  const body = (jsonMode: boolean) => JSON.stringify({
    model: TEMPLATE_AUTHORING_MODEL, temperature: 0.2, max_tokens: 4000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
  const send = (jsonMode: boolean) => fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ledrix-key': GATEWAY_KEY },
    body: body(jsonMode), signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  let resp = await send(true);
  if (resp.status === 400) resp = await send(false);   // a model that rejects json mode: ask again without it
  if (!resp.ok) throw new Error(`gateway ${resp.status}`);
  const data = await resp.json();
  return parseModelJson(String(data?.choices?.[0]?.message?.content ?? ''));
}

export async function POST(req: NextRequest) {
  if (!GATEWAY_URL || !SUPA_URL || !SERVICE) return fail(500, 'Ledrix is not configured on this site.');

  // 1) A signed-in user.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Sign in to use Ledrix.');
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return fail(401, 'Sign in to use Ledrix.');

  // 2) The request.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'This draft is too large to send to Ledrix.');
  let body: { templateId?: unknown; systemId?: unknown; request?: unknown; tree?: unknown };
  try { body = JSON.parse(raw); } catch { return fail(400, 'Bad request.'); }
  const { templateId, systemId, request, tree } = body;
  if (typeof templateId !== 'string' || typeof systemId !== 'string' || typeof request !== 'string') return fail(400, 'Bad request.');
  const t = tree as InspectionTemplate | null;
  if (!t || typeof t !== 'object' || !Array.isArray(t.systems)) return fail(400, 'Bad request.');

  // 3) An owner or admin, drafting one of their own company's templates.
  const prof = await admin.from('inspector_profiles').select('company_id, role').eq('id', user.id).maybeSingle();
  const profile = prof.data as { company_id: string | null; role: string | null } | null;
  if (prof.error || !profile?.company_id || !canAuthorTemplates(profile.role)) {
    return fail(403, 'Only a company owner or admin can draft template changes.');
  }
  const row = await admin.from('company_templates').select('id').eq('id', templateId).eq('company_id', profile.company_id).maybeSingle();
  if (row.error || !row.data) return fail(404, 'That template is not one of your company’s templates.');

  // 4) The prompt, built here with the fixed grammar.
  const prompt = buildAuthoringPrompt({ tree: t, systemId, request });
  if ('error' in prompt) return fail(400, prompt.error);

  // 5) Cost cap, counted only for requests that will reach the model.
  const used = await bumpUsage(admin, user.id);
  if (used > DAILY_CAP) return fail(429, `You've used today's Ledrix requests (${DAILY_CAP}). It resets tomorrow.`);

  // 6) Ledrix.
  let parsed: unknown;
  try { parsed = await askModel(prompt.system, prompt.user); }
  catch { return fail(502, 'Ledrix could not be reached. Try again in a moment.'); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { changes?: unknown }).changes)) {
    return fail(502, 'Ledrix did not return usable changes. Try again, or reword the request.');
  }
  return NextResponse.json({ parsed, model: TEMPLATE_AUTHORING_MODEL, promptRef: prompt.promptRef });
}
