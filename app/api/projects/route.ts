import { z } from 'zod';
import { boundary, identity, body, db, bucket, json, list, permit, ensureWorkspace, HttpError } from '@/lib/server';
import { CONTRACT, contractHash, digest } from '@/lib/contract';
import { parseCSV, suggestMapping, validate, sampleCSV, type Project } from '@/lib/domain';
export const dynamic='force-dynamic';
export async function GET(req:Request){return boundary(req,async()=>{const u=await identity(req);return json({projects:await list(u.workspaceId)});});}
export async function POST(req:Request){return boundary(req,async()=>{
  const u=await identity(req);permit(u,'edit');await ensureWorkspace(u);const raw=await body(req);
  const parsed=z.object({requestId:z.string().uuid(),name:z.string().trim().min(2).max(80),customer:z.string().trim().min(2).max(80),sourceName:z.string().max(120).optional(),csv:z.string().optional(),sample:z.boolean().optional()}).safeParse(raw);
  if(!parsed.success)throw new HttpError(422,'Enter a deployment name and customer name, each between 2 and 80 characters.');
  const data=parsed.data;const fingerprint=await digest(JSON.stringify({name:data.name,customer:data.customer,sourceName:data.sample?'sample_accounts.csv':data.sourceName||'accounts.csv',csv:data.sample?sampleCSV:data.csv||'',sample:!!data.sample}));
  const existing=await db().prepare('SELECT document FROM projects WHERE id = ? AND owner_id = ?').bind(data.requestId,u.workspaceId).first<{document:string}>();if(existing){if(JSON.parse(existing.document).importFingerprint!==fingerprint)throw new HttpError(409,'This import request was already used for different data. Open the existing deployment or start a new import.');return json({id:data.requestId});}
  const count=await db().prepare('SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?').bind(u.workspaceId).first<{n:number}>();
  if((count?.n||0)>=100)throw new HttpError(422,'Workspace limit reached: 100 deployments.');
  const csv=data.sample?sampleCSV:data.csv||''; const dataset=parseCSV(csv); const id=data.requestId;const now=new Date().toISOString();
  const sourceKey='sources/'+u.workspaceId+'/'+id+'/'+crypto.randomUUID()+'.csv';
  const p:Project={id,name:data.name,customer:data.customer,sourceName:data.sample?'sample_accounts.csv':data.sourceName||'accounts.csv',sourceKey,sample:!!data.sample,createdAt:now,updatedAt:now,version:1,...dataset,mapping:suggestMapping(dataset.headers),exclusions:{},report:null,activeReleaseId:null,workingChanged:true,importFingerprint:fingerprint,lastEditorId:u.userId,sourceChecksum:await digest(csv)};
  if(data.sample){p.report=validate(p);p.report.records=[];}
  if(new TextEncoder().encode(JSON.stringify(p)).length>1_500_000)throw new HttpError(422,'This dataset has too much content. Split it into smaller files.');
  await bucket().put(sourceKey,csv,{httpMetadata:{contentType:'text/csv'}});
  try{
    await db().batch([
      db().prepare('INSERT INTO projects (id,owner_id,document,version,mutation_id,updated_at) VALUES (?,?,?,?,?,?)').bind(id,u.workspaceId,JSON.stringify(p),1,id,now),
      db().prepare('INSERT INTO audit (id,project_id,owner_id,actor,action,detail,created_at,evidence_json,project_version,request_id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,u.workspaceId,u.email,'Imported',`${p.rows.length} rows imported from ${p.sourceName}${p.sample?'. Synthetic sample data.':''}`,now,JSON.stringify({schemaVersion:1,contract:CONTRACT,contractHash:await contractHash(),sourceChecksum:p.sourceChecksum,mapping:p.mapping}),1,u.requestId)
    ]);
  }catch(e){await bucket().delete(sourceKey).catch(()=>{});const won=await db().prepare('SELECT document FROM projects WHERE id = ? AND owner_id = ?').bind(id,u.workspaceId).first<{document:string}>();if(won){if(JSON.parse(won.document).importFingerprint!==fingerprint)throw new HttpError(409,'This import request was already used for different data.');return json({id});}throw e;}
  return json({id},201);
});}
