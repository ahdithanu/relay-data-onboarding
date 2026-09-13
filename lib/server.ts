import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { InputError, summarize, type Project } from './domain';
import { can, type Permission, type Role } from './access';
export class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
export type Actor={userId:string;email:string;workspaceId:string;role:Role;requestId:string};
const contexts=new WeakMap<Request,Actor>();
const traces=new WeakMap<Request,string>();
export function db(){if(!env.DB)throw new HttpError(503,'Storage is temporarily unavailable. Please try again.');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new HttpError(503,'File storage is temporarily unavailable. Please try again.');return env.BUCKET;}
export function permit(actor:Actor,permission:Permission){if(!can(actor.role,permission))throw new HttpError(403,'Your workspace role does not permit this action.');}
export async function identity(request:Request):Promise<Actor>{
  const user=await getChatGPTUser();if(!user)throw new HttpError(401,'Sign in to access your workspace.');
  if(!['GET','HEAD'].includes(request.method)){
    const origin=request.headers.get('origin');const expected=new URL(request.url).origin;
    if(!origin||origin!==expected)throw new HttpError(403,'The request origin could not be verified. Reload this page and try again.');
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'Send JSON content.');
  }
  const workspaceId=request.headers.get('x-workspace-id')||new URL(request.url).searchParams.get('workspace')||user.userId;
  let role:Role='owner';
  if(workspaceId!==user.userId){const m=await db().prepare('SELECT role FROM members WHERE id = ? AND workspace_id = ? AND user_id = ?').bind(workspaceId+':'+user.userId,workspaceId,user.userId).first<{role:Role}>();if(!m)throw new HttpError(403,'You do not have access to this workspace.');role=m.role;}
  const actor={userId:user.userId,email:user.email,workspaceId,role,requestId:traces.get(request)||crypto.randomUUID()};contexts.set(request,actor);return actor;
}
export async function settings(actor:Actor){const row=await db().prepare('SELECT * FROM workspaces WHERE id = ?').bind(actor.workspaceId).first<{id:string;name:string;owner_email:string;require_approval:number;retention_days:number}>();return row||{id:actor.workspaceId,name:'Deployment workspace',owner_email:actor.email,require_approval:0,retention_days:30};}
export async function ensureWorkspace(actor:Actor){if(actor.role!=='owner')return;await db().prepare('INSERT OR IGNORE INTO workspaces (id,name,owner_email,require_approval,retention_days,created_at) VALUES (?,?,?,0,30,?)').bind(actor.workspaceId,'Deployment workspace',actor.email,new Date().toISOString()).run();}
export function workspaceEvent(actor:Actor,action:string,evidence:unknown,onlyAfterChange=false){return db().prepare('INSERT INTO workspace_events (id,workspace_id,actor,action,evidence,created_at) '+(onlyAfterChange?'SELECT ?,?,?,?,?,? WHERE changes() = 1':'VALUES (?,?,?,?,?,?)')).bind(crypto.randomUUID(),actor.workspaceId,actor.email,action,JSON.stringify(evidence),new Date().toISOString());}
export async function body(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Missing request body.');const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_500_000){await reader.cancel();throw new HttpError(413,'Request is too large. Use a CSV smaller than 1 MB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'Invalid JSON.');}
}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function boundary(request:Request,fn:()=>Promise<Response>){
 const id=crypto.randomUUID();traces.set(request,id);const start=performance.now();let response:Response;
 try{response=await fn();}catch(e){if(e instanceof HttpError)response=json({error:e.message,requestId:id},e.status);else if(e instanceof InputError)response=json({error:e.message,requestId:id},422);else{console.error(JSON.stringify({event:'request_error',requestId:id,errorClass:e instanceof Error?e.name:'Unknown'}));response=json({error:'This operation could not finish. Keep your input and retry using the request reference.',requestId:id},503);}}
 response.headers.set('X-Request-ID',id);response.headers.set('Server-Timing',`app;dur=${Math.round(performance.now()-start)}`);
 const actor=contexts.get(request);const route=new URL(request.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id');const elapsed=Math.round(performance.now()-start);
 console.log(JSON.stringify({event:'request',requestId:id,route,method:request.method,status:response.status,durationMs:elapsed}));
 if(actor&&route!=='/api/operations')try{await db().prepare('INSERT INTO requests (id,workspace_id,route,method,status,duration_ms,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,actor.workspaceId,route,request.method,response.status,elapsed,new Date().toISOString()).run();}catch{console.error(JSON.stringify({event:'telemetry_write_failed',requestId:id}));}
 contexts.delete(request);traces.delete(request);return response;
}
export async function getProject(id:string,owner:string,includeDeleted=false){
 const row=await db().prepare('SELECT document FROM projects WHERE id = ? AND owner_id = ?'+(includeDeleted?'':' AND deleted_at IS NULL')).bind(id,owner).first<{document:string}>();
 if(!row)throw new HttpError(404,'Deployment not found.');return JSON.parse(row.document) as Project;
}
export async function detail(id:string,owner:string){
 const p=await getProject(id,owner);const [r,a]=await Promise.all([db().prepare('SELECT metadata FROM releases WHERE project_id = ? AND owner_id = ? ORDER BY created_at DESC').bind(id,owner).all<{metadata:string}>(),db().prepare('SELECT id, project_id, action, detail, created_at, actor, evidence_json, project_version, request_id FROM audit WHERE project_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 100').bind(id,owner).all()]);
 return {project:p,releases:r.results.map(v=>JSON.parse(v.metadata)),audit:a.results};
}
export async function list(owner:string){
 const r=await db().prepare("SELECT json_remove(document, '$.rows', '$.headers', '$.mapping', '$.exclusions', '$.report.issues', '$.report.records') AS document, json_array_length(document, '$.rows') AS total, json_extract(document, '$.report.excluded') AS excluded FROM projects WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100").bind(owner).all<{document:string;total:number;excluded:number|null}>();
 return r.results.map(v=>{const p=JSON.parse(v.document);p.rows=Array(v.total);p.exclusions={};const s=summarize(p);s.excluded=v.excluded||0;return s;});
}
