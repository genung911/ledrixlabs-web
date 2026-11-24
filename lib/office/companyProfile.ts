// The company profile, editable on the website (owner 2026-11-23, website Apple pass: "Company profile editable on the
// website? — Yes"). Kept out of lib/workspace/data.ts, which only reads. The same rows the phone writes.
import { workspace } from '@/lib/workspace/client';
// The same rows the phone writes: `companies.name` (owner only — "Company owner can update") and `company_branding`
// (one logo per company as a size-capped data URI — #69/#76, writers need company_settings). Reports read both.
export async function loadCompanyProfile(companyId: string): Promise<{ name: string; logo: string | null }> {
  const [co, br] = await Promise.all([
    workspace.from('companies').select('name').eq('id', companyId).maybeSingle(),
    workspace.from('company_branding').select('logo_data').eq('company_id', companyId).maybeSingle(),
  ]);
  if (co.error) throw new Error('The company could not be loaded');
  return { name: (co.data as any)?.name ?? '', logo: (br.data as any)?.logo_data ?? null };
}

export async function saveCompanyName(companyId: string, name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error('A company needs a name');
  const { data, error } = await workspace.from('companies').update({ name: n }).eq('id', companyId).select('id');
  if (error || !data?.length) throw new Error('Only the company owner can rename the company');
}

/** A logo as the phone stores it: longest side 480, PNG when it fits, else JPEG, at most 200,000 characters. */
export async function logoDataUri(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('That file is not an image')); i.src = url; });
    const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const png = c.toDataURL('image/png');
    if (png.length <= 200_000) return png;
    const jpg = c.toDataURL('image/jpeg', 0.8);
    if (jpg.length <= 200_000) return jpg;
    throw new Error('That logo is too large — try a smaller image');
  } finally { URL.revokeObjectURL(url); }
}

export async function saveCompanyLogo(companyId: string, dataUri: string | null): Promise<void> {
  const { error } = await workspace.from('company_branding')
    .upsert({ company_id: companyId, logo_data: dataUri, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });
  if (error) throw new Error('The logo was not saved — only someone with Company settings can change it');
}
