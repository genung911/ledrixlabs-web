// POST /api/template-assistant — Ask Ledrix, the desktop Template Builder's context-aware assistant.
//
// The browser sends DATA: { templateId | draftId, scope, action, question?, systemId?, nodeId?, tree, turns?,
// draftChanges? }. This route:
//   1. requires a signed-in Supabase user (Authorization: Bearer <access token>);
//   2. requires an owner or admin of a company, working on that company's live template (templateId) or that
//      company's shared draft (draftId);
//   3. builds the prompt HERE (lib/templates/assistant) — fixed instructions, the core template grammar, and the
//      company's own templates read with the service role for "company" answers. No free-form prompt path;
//   4. counts the call against the per-user daily AI cap (lib/usage) before reaching the model;
//   5. returns { answer, summary, parsed, model, promptRef, proposesFor }. `parsed` is UNTRUSTED: the browser runs
//      proposalFromResponse on it (strict parse, confined to one system, validated) and nothing applies until the
//      owner accepts it. `answer` is display text only and never changes the draft.
//
// Writes nothing except the usage counter.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bumpUsage, DAILY_CAP } from '../../../lib/usage';
import { buildAssistantPrompt, normalizeAnswer, summarizeCompany, isGradeChange, GRADE_REFUSAL, type AssistantRequest } from '../../../lib/templates/assistant';
import { canAuthorTemplates, TEMPLATE_AUTHORING_MODEL } from '../../../lib/templateBuilder/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GATEWAY_URL = (process.env.GATEWAY_URL ?? '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
const SUPA_URL    = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

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
  if (resp.status === 400) resp = await send(false);
  if (!resp.ok) throw new Error(`gateway ${resp.status}`);
  const data = await resp.json();
  return parseModelJson(String(data?.choices?.[0]?.message?.content ?? ''));
}

export async function POST(req: NextRequest) {
  if (!GATEWAY_URL || !SUPA_URL || !SERVICE) return fail(500, 'Ledrix is not configured on this site.');

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Sign in to use Ledrix.');
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return fail(401, 'Sign in to use Ledrix.');

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'This draft is too large to send to Ledrix.');
  let body: Partial<AssistantRequest> & { templateId?: unknown; draftId?: unknown };
  try { body = JSON.parse(raw); } catch { return fail(400, 'Bad request.'); }
  const { templateId, draftId } = body;
  if (typeof templateId !== 'string' && typeof draftId !== 'string') return fail(400, 'Bad request.');

  const prof = await admin.from('inspector_profiles').select('company_id, role').eq('id', user.id).maybeSingle();
  const profile = prof.data as { company_id: string | null; role: string | null } | null;
  if (prof.error || !profile?.company_id || !canAuthorTemplates(profile.role)) {
    return fail(403, 'Only a company owner or admin can work on templates.');
  }
  const owned = typeof draftId === 'string'
    ? await admin.from('company_template_drafts').select('id').eq('id', draftId).eq('company_id', profile.company_id).maybeSingle()
    : await admin.from('company_templates').select('id').eq('id', templateId as string).eq('company_id', profile.company_id).maybeSingle();
  if (owned.error || !owned.data) return fail(404, 'That template is not one of your company’s templates.');

  // "Company" answers rest only on these rows (live, not deleted — a missing deleted_at column means #65 is not
  // applied yet, so every row is live).
  let rows = await admin.from('company_templates').select('name, template, deleted_at').eq('company_id', profile.company_id);
  if (rows.error) rows = await admin.from('company_templates').select('name, template').eq('company_id', profile.company_id) as typeof rows;
  const company = summarizeCompany(((rows.data ?? []) as Array<{ name: string; template: unknown; deleted_at?: string | null }>).filter(r => !r.deleted_at));

  const prompt = buildAssistantPrompt({
    scope: body.scope as AssistantRequest['scope'], action: body.action as AssistantRequest['action'],
    question: typeof body.question === 'string' ? body.question : undefined,
    systemId: typeof body.systemId === 'string' ? body.systemId : null, nodeId: typeof body.nodeId === 'string' ? body.nodeId : null,
    tree: body.tree as AssistantRequest['tree'],
    turns: Array.isArray(body.turns) ? body.turns.filter(t => t && typeof t.text === 'string').slice(-6) : [],
    draftChanges: Array.isArray(body.draftChanges) ? body.draftChanges.filter((s): s is string => typeof s === 'string').slice(-30) : [],
  }, company);
  if ('error' in prompt) return fail(400, prompt.error);

  const used = await bumpUsage(admin, user.id);
  if (used > DAILY_CAP) return fail(429, `You've used today's Ledrix requests (${DAILY_CAP}). It resets tomorrow.`);

  let parsed: unknown;
  try { parsed = await askModel(prompt.system, prompt.user); }
  catch { return fail(502, 'Ledrix could not be reached. Try again in a moment.'); }
  if (!parsed || typeof parsed !== 'object') return fail(502, 'Ledrix did not return a usable answer. Try again, or reword the question.');

  const answer = normalizeAnswer(parsed);
  const all = prompt.proposesFor && Array.isArray((parsed as { changes?: unknown }).changes) ? (parsed as { changes: unknown[] }).changes : [];
  const changes = all.filter(c => !isGradeChange(c));
  const notes = changes.length < all.length ? [GRADE_REFUSAL] : [];
  const summary = typeof (parsed as { summary?: unknown }).summary === 'string' ? String((parsed as { summary: string }).summary).slice(0, 300) : '';
  return NextResponse.json({
    answer, summary, notes, model: TEMPLATE_AUTHORING_MODEL, promptRef: prompt.promptRef, proposesFor: prompt.proposesFor,
    parsed: { summary, changes },
  });
}
