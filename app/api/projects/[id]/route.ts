import { z } from 'zod';
import { boundary, identity, body, db, json, detail, getProject, permit, settings, bucket, HttpError } from '@/lib/server';
import { CONTRACT, contractHash, digest } from '@/lib/contract';
import { checkMapping, validate, fields, type Mapping, type Release } from '@/lib/domain';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Ctx){return boundary(req,async()=>{const u=await identity(req);return json(await detail((await ctx.params).id,u.workspaceId));});}
const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('approve'),version:z.number().int(),note:z.string().trim().min(5).max(300)}),
  z.object({action:z.literal('mapping'),version:z.number().int(),mapping:z.record(z.string())}),
  z.object({action:z.literal('validate'),version:z.number().int()}),
  z.object({action:z.literal('edit'),version:z.number().int(),row:z.number().int().min(0),values:z.record(z.string().max(4000))}),
  z.object({action:z.literal('exclude'),version:z.number().int(),row:z.number().int().min(0),reason:z.string().trim().min(5).max(300)}),
  z.object({action:z.literal('restore'),version:z.number().int(),row:z.number().int().min(0)}),
  z.object({action:z.literal('release'),version:z.number().int(),note:z.string().trim().min(5).max(300)}),
  z.object({action:z.literal('rollback'),version:z.number().int(),releaseId:z.string().max(100),note:z.string().trim().min(5).max(300)}),
]);
export async function POST(req:Request,ctx:Ctx){return boundary(req,async()=>{
  const u=await identity(req);const {id}=await ctx.params;const parsed=actionSchema.safeParse(await body(req));
  if(!parsed.success)throw new HttpError(422,'Invalid action. Supply all required fields and a reason of at least 5 characters.');
  const a=parsed.data;permit(u,a.action==='approve'?'approve':a.action==='release'||a.action==='rollback'?'release':'edit');const p=await getProject(id,u.workspaceId);if(p.version!==a.version)throw new HttpError(409,'This deployment changed in another session. Reload it before saving.');
  p.lastEditorId??=u.workspaceId;
  const before=structuredClone(p);const evidence:Record<string,unknown>={schemaVersion:1,action:a.action,contract:CONTRACT,contractHash:await contractHash()};
  let event='';let message='';let release:Release|null=null;let records='';
  if(a.action==='mapping'){evidence.before=p.mapping;evidence.after=a.mapping;checkMapping(p.headers,a.mapping as Mapping);p.mapping=Object.fromEntries(fields.map(f=>[f,a.mapping[f]])) as Mapping;p.report=null;p.workingChanged=true;event='Mapping saved';message='All six fields mapped. Validation required.';}
  if(a.action==='edit'){
    if(!p.rows[a.row])throw new HttpError(422,'Row does not exist.');
    checkMapping(p.headers,p.mapping);
    evidence.row=a.row+2;evidence.changes=fields.filter(f=>a.values[f]!==undefined&&a.values[f]!==p.rows[a.row][p.headers.indexOf(p.mapping[f])]).map(f=>({field:f,sourceColumn:p.mapping[f],before:p.rows[a.row][p.headers.indexOf(p.mapping[f])],after:a.values[f]}));
    for(const f of fields)if(a.values[f]!==undefined)p.rows[a.row][p.headers.indexOf(p.mapping[f])]=a.values[f];
    p.report=null;p.workingChanged=true;event='Row corrected';message=`Source row ${a.row+2} updated. Validation required.`;
  }
  if(a.action==='exclude'||a.action==='restore'){
    evidence.row=a.row+2;evidence.before=p.exclusions[String(a.row)]||null;evidence.after=a.action==='exclude'?a.reason:null;
    if(!p.rows[a.row])throw new HttpError(422,'Row does not exist.');
    if(a.action==='exclude'){p.exclusions[String(a.row)]=a.reason;event='Row excluded';message=`Source row ${a.row+2}: ${a.reason}`;}
    else{delete p.exclusions[String(a.row)];event='Row restored';message=`Source row ${a.row+2} returned to validation.`;}
    p.report=null;p.workingChanged=true;
  }
  if(a.action==='validate'){p.report=validate(p);event='Validation completed';message=`${p.report.accepted} valid, ${p.report.invalid} blocked, ${p.report.excluded} excluded. ${p.report.durationMs} ms.`;}
  if(a.action==='approve'){
    if(!p.report)throw new HttpError(422,'Validate the latest data before approval.');
    if(!p.lastEditorId||p.lastEditorId===u.userId)throw new HttpError(403,'Approval requires a reviewer who did not make the latest data change.');
    const checked=validate(p);if(checked.invalid||!checked.accepted)throw new HttpError(422,'Resolve all blocking issues before approval.');
    p.approval={by:u.userId,email:u.email,at:new Date().toISOString(),checksum:await digest(JSON.stringify(checked.records)),contractHash:await contractHash(),note:a.note};event='Release approved';message=a.note;evidence.approval=p.approval;
  }
  if(a.action==='release'){
    if(!p.report)throw new HttpError(422,'Run validation on the latest data before releasing.');
    const report=validate(p);if(report.invalid||!report.accepted)throw new HttpError(422,'Resolve every blocking issue and retain at least one valid row before releasing.');
    records=JSON.stringify(report.records);const checksum=await digest(records);
    const config=await settings(u);if(config.require_approval&&(!p.approval||p.approval.by===p.lastEditorId||p.approval.checksum!==checksum||p.approval.contractHash!==await contractHash()))throw new HttpError(403,'This workspace requires an independent approval of the current records.');
    if(!p.sourceChecksum){const source=await bucket().get(p.sourceKey);if(!source)throw new HttpError(503,'Original source is unavailable.');p.sourceChecksum=await digest(await source.text());}
    if(p.activeReleaseId){const last=await db().prepare('SELECT metadata FROM releases WHERE id = ? AND owner_id = ? AND project_id = ?').bind(p.activeReleaseId,u.workspaceId,id).first<{metadata:string}>();if(last&&JSON.parse(last.metadata).checksum===checksum)throw new HttpError(409,'These records are already in the active release.');}
    release={id:crypto.randomUUID(),projectId:id,createdAt:new Date().toISOString(),rowCount:report.accepted,checksum,note:a.note,previousReleaseId:p.activeReleaseId,contract:CONTRACT,contractHash:await contractHash(),sourceChecksum:p.sourceChecksum,approvedBy:p.approval?.by||null,releasedBy:u.userId};
    evidence.release=release;
    p.activeReleaseId=release.id;p.report=report;p.workingChanged=false;event='Release published';message=`${report.accepted} verified records published to the Relay registry. ${a.note}`;
  }
  if(a.action==='rollback'){
    if(!p.activeReleaseId)throw new HttpError(422,'There is no active release to roll back.');
    const r=await db().prepare('SELECT metadata FROM releases WHERE id = ? AND project_id = ? AND owner_id = ?').bind(a.releaseId,id,u.workspaceId).first<{metadata:string}>();
    if(!r||a.releaseId!==p.activeReleaseId)throw new HttpError(409,'The active release changed. Reload before rolling back.');
    p.activeReleaseId=(JSON.parse(r.metadata) as Release).previousReleaseId;p.report=null;p.workingChanged=true;event='Release rolled back';message=a.note;
  }
  if(['mapping','edit','exclude','restore'].includes(a.action))p.lastEditorId=u.userId;
  if(!['approve','release'].includes(a.action))p.approval=null;
  if(a.action==='validate')evidence.result=p.report?{accepted:p.report.accepted,invalid:p.report.invalid,excluded:p.report.excluded,issues:p.report.issues}:null;
  if(a.action==='rollback'){evidence.before=before.activeReleaseId;evidence.after=p.activeReleaseId;evidence.reason=a.note;}
  if(p.report)p.report.records=[];
  if(new TextEncoder().encode(JSON.stringify(p)).length>1_500_000)throw new HttpError(422,'Validation generated too much data. Split the original dataset into smaller files.');
  p.version++;p.updatedAt=new Date().toISOString();const mutation=crypto.randomUUID();
  const statements=[db().prepare('UPDATE projects SET document = ?,version = ?,mutation_id = ?,updated_at = ? WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL').bind(JSON.stringify(p),p.version,mutation,p.updatedAt,id,u.workspaceId,a.version)];
  if(release)statements.push(db().prepare('INSERT INTO releases (id,project_id,owner_id,metadata,records,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_id = ? AND mutation_id = ?)').bind(release.id,id,u.workspaceId,JSON.stringify(release),records,release.createdAt,id,u.workspaceId,mutation));
  statements.push(db().prepare('INSERT INTO audit (id,project_id,owner_id,actor,action,detail,created_at,evidence_json,project_version,request_id) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_id = ? AND mutation_id = ?)').bind(crypto.randomUUID(),id,u.workspaceId,u.email,event,message,p.updatedAt,JSON.stringify(evidence),p.version,u.requestId,id,u.workspaceId,mutation));
  const result=await db().batch(statements);if(result[0].meta.changes!==1)throw new HttpError(409,'A concurrent update was saved first. Reload before retrying.');
  return json(await detail(id,u.workspaceId));
});}
