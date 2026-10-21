// Template Builder on the desktop — who may draft, and the model the drafts come from.
//
// Drafting is limited to the roles that may write company templates (company_templates RLS: owner or admin,
// supabase_company_templates.sql). A draft never reaches company_templates — publishing is a later increment —
// but whoever shapes the company's template is the same person who will one day publish it.
//
// The server route (app/api/template-assistant) and the database enforce this; the pages only use it to
// decide what to show.

export const TEMPLATE_AUTHOR_ROLES = ['owner', 'admin'] as const;

export function canAuthorTemplates(role: string | null | undefined): boolean {
  return (TEMPLATE_AUTHOR_ROLES as readonly string[]).includes(role ?? '');
}

/** Same model as the app's "Draft with Ledrix" (ledrix-app LocalLLMService.TEMPLATE_AUTHORING_MODEL). */
export const TEMPLATE_AUTHORING_MODEL = 'gpt-4o';
