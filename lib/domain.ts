export const fields = ['account_id', 'company_name', 'email', 'plan', 'arr', 'start_date'] as const;
export type Field = typeof fields[number];
export type Mapping = Record<Field, string>;
export type Canonical = Record<Field, string>;
export type Issue = { row: number; field: Field; code: string; message: string; value: string };
export type Report = { total: number; accepted: number; excluded: number; invalid: number; issues: Issue[]; records: Canonical[]; checkedAt: string; durationMs: number };
export type Project = {
  id: string; name: string; customer: string; sourceName: string; sourceKey: string;
  importFingerprint?: string; sourceChecksum?: string; lastEditorId?: string; approval?: {by:string; email:string; at:string; checksum:string; contractHash:string; note:string} | null;
  sample: boolean; createdAt: string; updatedAt: string; version: number;
  headers: string[]; rows: string[][]; mapping: Mapping; exclusions: Record<string, string>;
  report: Report | null; activeReleaseId: string | null; workingChanged?: boolean;
};
export type Summary = { id: string; name: string; customer: string; sample: boolean; sourceName: string; total: number; accepted: number; invalid: number; excluded: number; status: string; updatedAt: string; version: number; activeReleaseId: string | null };
export type Release = { id: string; projectId: string; createdAt: string; rowCount: number; checksum: string; note: string; previousReleaseId: string | null; contract?: unknown; contractHash?: string; sourceChecksum?: string; approvedBy?: string | null; releasedBy?: string };
export type Audit = { id: string; project_id: string; action: string; detail: string; created_at: string; actor: string; evidence_json?: string; project_version?:number; request_id?:string };
export type Detail = { project: Project; releases: Release[]; audit: Audit[] };
export class InputError extends Error {}

export function parseCSV(input: string): { headers: string[]; rows: string[][] } {
  if (!input || new TextEncoder().encode(input).length > 1_000_000) throw new InputError('Choose a CSV file smaller than 1 MB.');
  const text = input.replace(/^\uFEFF/, '');
  const all: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false;
  const pushRow = () => { row.push(cell); if (row.some(v => v.trim())) all.push(row); row = []; cell = ''; closed = false; if (all.length > 501) throw new InputError('This release supports up to 500 rows per deployment.'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; }
    else if (c === '"') { if (cell || closed) throw new InputError('Unexpected quote in CSV. Quote the entire field.'); quoted = true; }
    else if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else { if (closed && !/\s/.test(c)) throw new InputError('Unexpected text after a quoted CSV field.'); if (!closed) cell += c; }
    if (row.length > 30 || cell.length > 4000) throw new InputError('Use at most 30 columns and 4,000 characters per cell.');
  }
  if (quoted) throw new InputError('A quoted CSV field is missing its closing quote.');
  if (cell || row.length) pushRow();
  if (all.length < 2) throw new InputError('Include a header row and at least one data row.');
  const headers = all.shift()!.map(h => h.trim());
  if (headers.length > 30 || headers.some(h => !h || h.length > 100) || new Set(headers.map(h => h.toLowerCase())).size !== headers.length) throw new InputError('Headers must be unique, nonempty, and at most 100 characters.');
  all.forEach((r, i) => { if (r.length !== headers.length) throw new InputError(`CSV row ${i + 2} has ${r.length} columns; expected ${headers.length}.`); });
  return { headers, rows: all };
}
const aliases: Record<Field, string[]> = {
  account_id: ['account_id','id','customer_id','accountid','customerid'],
  company_name: ['company_name','company','name','account_name','organization'],
  email: ['email','contact_email','email_address','billing_email'],
  plan: ['plan','tier','subscription','subscription_plan'],
  arr: ['arr','annual_revenue','annual_recurring_revenue','contract_value'],
  start_date: ['start_date','joined','created_at','contract_start','signup_date'],
};
export function suggestMapping(headers: string[]): Mapping {
  return Object.fromEntries(fields.map(f => [f, headers.find(h => aliases[f].includes(h.toLowerCase().replace(/\s+/g, '_'))) || ''])) as Mapping;
}
export function checkMapping(headers: string[], mapping: Mapping) {
  if (!mapping || fields.some(f => typeof mapping[f] !== 'string' || !headers.includes(mapping[f]))) throw new InputError('Map all six target fields to a source column.');
  if (new Set(fields.map(f => mapping[f])).size !== fields.length) throw new InputError('Each source column can map to only one target field.');
}
export function validate(project: Pick<Project, 'headers'|'rows'|'mapping'|'exclusions'>): Report {
  checkMapping(project.headers, project.mapping);
  const start = performance.now(); const issues: Issue[] = []; const records: Canonical[] = [];
  const mapped: {row: number; record: Canonical}[] = []; const counts = new Map<string, number>();
  project.rows.forEach((r, i) => {
    if (project.exclusions[String(i)]) return;
    const record = Object.fromEntries(fields.map(f => [f, (r[project.headers.indexOf(project.mapping[f])] || '').trim()])) as Canonical;
    record.email = record.email.toLowerCase(); record.plan = record.plan.toLowerCase();
    counts.set(record.account_id, (counts.get(record.account_id) || 0) + 1); mapped.push({row:i, record});
  });
  for (const {row, record:r} of mapped) {
    const before = issues.length;
    const issue = (field: Field, code: string, message: string) => issues.push({row, field, code, message, value:r[field]});
    if (!r.account_id) issue('account_id', 'required', 'Account ID is required.');
    else if ((counts.get(r.account_id) || 0) > 1) issue('account_id', 'duplicate', 'Account ID must be unique within this deployment.');
    if (!r.company_name) issue('company_name', 'required', 'Company name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) issue('email','format','Enter a valid email address.');
    if (!['starter','growth','enterprise'].includes(r.plan)) issue('plan','enum','Plan must be starter, growth, or enterprise.');
    if (!/^\d+(\.\d{1,2})?$/.test(r.arr) || Number(r.arr) > 1_000_000_000) issue('arr','range','ARR must be a nonnegative USD amount, up to 1 billion, with at most two decimals.');
    else r.arr = Number(r.arr).toFixed(2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.start_date) || !Number.isFinite(Date.parse(r.start_date)) || new Date(r.start_date).toISOString().slice(0,10) !== r.start_date) issue('start_date','date','Use a real calendar date in ISO date format.');
    if (issues.length === before) records.push(r);
  }
  return { total: project.rows.length, accepted: records.length, excluded: Object.keys(project.exclusions).length, invalid: new Set(issues.map(i=>i.row)).size, issues, records, checkedAt:new Date().toISOString(), durationMs:Math.max(1,Math.round(performance.now()-start)) };
}
export function summarize(p: Project): Summary {
  return { id:p.id,name:p.name,customer:p.customer,sample:p.sample,sourceName:p.sourceName,total:p.rows.length,accepted:p.report?.accepted||0,invalid:p.report?.invalid||0,excluded:Object.keys(p.exclusions).length,status:!p.report?'draft':p.report.invalid?'blocked':p.activeReleaseId&&!p.workingChanged?'live':'ready',updatedAt:p.updatedAt,version:p.version,activeReleaseId:p.activeReleaseId };
}
export function toCSV(records: Canonical[]) {
  const escape = (v:string) => '"' + (/^[=+@\-\t\r]/.test(v) ? "'"+v : v).replace(/"/g,'""') + '"';
  return [fields.join(','), ...records.map(r=>fields.map(f=>escape(r[f])).join(','))].join('\r\n');
}
export const sampleCSV = 'Customer ID,Company,Contact Email,Tier,Annual Revenue,Contract Start\nAC001,Northstar Labs,ops@northstar.example,enterprise,96000,2026-01-15\nAC002,Orbit Commerce,team@orbit.example,growth,24000,2026-02-01\nAC003,Atlas Robotics,hello@atlas,enterprise,72000,2026-02-20\nAC004,Meridian Health,ops@meridian.example,growth,-1200,2026-03-01\nAC005,Juniper Studio,hi@juniper.example,starter,6000,2026-03-12\nAC006,Vela Systems,team@vela.example,premium,36000,2026-04-01\nAC007,Arc Logistics,ops@arc.example,growth,18000,2026-04-05\nAC008,Forma Design,hello@forma.example,starter,4800,2026-04-15\nAC009,Peak Analytics,team@peak.example,enterprise,120000,2026-05-01\nAC010,Fieldwork AI,hi@fieldwork.example,growth,30000,2026-05-06\nAC011,Cedar Finance,ops@cedar.example,enterprise,84000,2026-06-10\nAC012,Beacon Energy,team@beacon.example,growth,24000,2026-06-20';
