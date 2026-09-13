import { boundary, identity, getProject, db, bucket, json, HttpError } from '@/lib/server';
import { toCSV, type Canonical, type Release } from '@/lib/domain';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return boundary(req,async()=>{
  const u=await identity(req);const {id}=await ctx.params;const p=await getProject(id,u.workspaceId);const url=new URL(req.url);const format=url.searchParams.get('format')||'json';
  if(format==='source'){const object=await bucket().get(p.sourceKey);if(!object)throw new HttpError(404,'Source file not found.');return new Response(object.body,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="relay_original.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
  const releaseId=url.searchParams.get('release')||p.activeReleaseId;if(!releaseId)throw new HttpError(422,'Publish a release before exporting.');
  const r=await db().prepare('SELECT metadata, records FROM releases WHERE id = ? AND project_id = ? AND owner_id = ?').bind(releaseId,id,u.workspaceId).first<{metadata:string;records:string}>();if(!r)throw new HttpError(404,'Release not found.');
  const metadata=JSON.parse(r.metadata) as Release;const records=JSON.parse(r.records) as Canonical[];
  if(format==='csv')return new Response(toCSV(records),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="relay_accounts.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(format!=='json')throw new HttpError(422,'Unknown export format.');
  return new Response(JSON.stringify({schemaVersion:1,destination:'Relay registry',customer:p.customer,sample:p.sample,release:metadata,records},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="relay_release.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
});}
