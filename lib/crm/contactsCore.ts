// ─── contactsCore — what a contact is, and reading a CSV of them (2026-11-05) ──────────────────────────────────────
//
// PURE: no I/O, no imports. Shared by the phone (CRMService, Contacts, Contact detail, CRM import) and the website's
// Contacts page — copied byte-for-byte to ledrixlabs-web lib/crm/contactsCore.ts (scripts/web-preview-sync.json), so
// the two can never read the same CSV differently or offer different contact types.
//
// VENDOR (owner 2026-11-05: "we do need agents and possibly vendors"): a company's own subcontractor or lab — radon
// lab, sewer scope, pest. The server accepts it only after #113 (supabase_crm_vendor_contacts.sql). Both apps ask the
// server which types it accepts (crm_contact_types(); a server without it answers with an error) and offer only those
// — `acceptedContactTypes` turns that answer into the list. Nothing offers or sends 'vendor' before the server takes it.

export type ContactType = 'agent' | 'client' | 'homeowner' | 'vendor';

/** Every type, in display order. */
export const CONTACT_TYPES: readonly ContactType[] = ['agent', 'client', 'homeowner', 'vendor'];
/** What every server accepts (the type check before #113). */
export const BASE_CONTACT_TYPES: readonly ContactType[] = ['agent', 'client', 'homeowner'];

export const CONTACT_TYPE_LABEL: Record<ContactType, { one: string; many: string }> = {
  agent:     { one: 'Agent',     many: 'Agents' },
  client:    { one: 'Client',    many: 'Clients' },
  homeowner: { one: 'Homeowner', many: 'Homeowners' },
  vendor:    { one: 'Vendor',    many: 'Vendors' },
};

/** The server's answer to crm_contact_types() → the types to offer. Anything but a list naming known types (an error,
 *  a missing function, junk) is the base three: a type is offered only when the server says it takes it. */
export function acceptedContactTypes(answer: unknown): ContactType[] {
  if (!Array.isArray(answer)) return [...BASE_CONTACT_TYPES];
  const said = new Set(answer.filter((x): x is string => typeof x === 'string'));
  const out = CONTACT_TYPES.filter(t => said.has(t));
  return BASE_CONTACT_TYPES.every(t => out.includes(t)) ? out : [...BASE_CONTACT_TYPES];
}

export type ImportOrderStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type ImportRow = {
  name:      string;
  type:      ContactType;
  email?:    string;
  phone?:    string;
  brokerage?: string;
  address?:  string;
  orderDate?: string;
  fee?:      number;
  status?:   ImportOrderStatus;
};

/** A typed cell → a contact type. Empty → client (the old default); a known type, any case, plural or not → that
 *  type; anything else → client. Whether the SERVER takes it is a separate question (`importable`). */
export function contactTypeFromCell(raw: string): ContactType {
  const s = raw.trim().toLowerCase().replace(/s$/, '');
  return (CONTACT_TYPES as readonly string[]).includes(s) ? (s as ContactType) : 'client';
}

/** Split rows into what the server accepts now and what it would refuse (a vendor before #113). */
export function importable(rows: ImportRow[], accepted: readonly ContactType[]): { rows: ImportRow[]; refused: ImportRow[] } {
  const ok = new Set(accepted);
  return { rows: rows.filter(r => ok.has(r.type)), refused: rows.filter(r => !ok.has(r.type)) };
}

export function parseISNCSV(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z ]/g, ''));

  const col = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const agentFirst  = col(['agent first']);
  const agentLast   = col(['agent last']);
  const agentEmail  = col(['agent email']);
  const agentPhone  = col(['agent phone']);
  const agentCo     = col(['agent company', 'brokerage']);
  const clientFirst = col(['client first']);
  const clientLast  = col(['client last']);
  const clientEmail = col(['client email']);
  const clientPhone = col(['client phone']);
  const address     = col(['address', 'service address']);
  const orderDate   = col(['order date', 'date']);
  const fee         = col(['fee', 'order total', 'total']);
  const status      = col(['status', 'order status']);

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');

    const agentName = [get(agentFirst), get(agentLast)].filter(Boolean).join(' ');
    if (agentName) {
      rows.push({
        name:      agentName,
        type:      'agent',
        email:     get(agentEmail) || undefined,
        phone:     get(agentPhone) || undefined,
        brokerage: get(agentCo) || undefined,
        address:   get(address) || undefined,
        orderDate: get(orderDate) || undefined,
        fee:       parseFloat(get(fee).replace(/[$,]/g, '')) || undefined,
        status:    mapStatus(get(status)),
      });
    }

    const clientName = [get(clientFirst), get(clientLast)].filter(Boolean).join(' ');
    if (clientName) {
      rows.push({
        name:      clientName,
        type:      'client',
        email:     get(clientEmail) || undefined,
        phone:     get(clientPhone) || undefined,
        address:   get(address) || undefined,
        orderDate: get(orderDate) || undefined,
        fee:       parseFloat(get(fee).replace(/[$,]/g, '')) || undefined,
        status:    mapStatus(get(status)),
      });
    }
  }

  return rows;
}

export function parseGenericCSV(text: string, mapping: Record<string, string>): ImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const colIdx  = (field: string) => headers.indexOf(mapping[field] ?? '');

  return lines.slice(1).map(line => {
    const cells = splitCSVLine(line);
    const get = (field: string) => {
      const i = colIdx(field);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    return {
      name:      get('name'),
      type:      contactTypeFromCell(get('type')),
      email:     get('email') || undefined,
      phone:     get('phone') || undefined,
      brokerage: get('brokerage') || undefined,
      address:   get('address') || undefined,
      orderDate: get('order_date') || undefined,
      fee:       parseFloat(get('fee').replace(/[$,]/g, '')) || undefined,
    } satisfies ImportRow;
  }).filter(r => !!r.name);
}

export function detectISNCSV(text: string): boolean {
  const firstLine = text.split(/\r?\n/)[0].toLowerCase();
  return firstLine.includes('agent') && firstLine.includes('client') && firstLine.includes('order');
}

export function parseCSVHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0];
  return firstLine.split(',').map(h => h.trim());
}

export function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

export function mapStatus(raw: string): ImportOrderStatus {
  const s = raw.toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('progress') || s.includes('active')) return 'in_progress';
  if (s.includes('schedul')) return 'scheduled';
  return 'completed';
}

/** A date cell → YYYY-MM-DD when it parses, else the cell as typed (the server then refuses that row's order). */
export function normalizeDate(raw: string): string {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return raw;
}
