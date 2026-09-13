import { z } from 'zod';
import { boundary, identity, body, db, json, permit, settings, getProject, workspaceEvent, HttpError } from '@/lib/server';
import { backupProject, restoreBackup, exportBackup, cleanup } from '@/lib/recovery';
export const dynamic='force-dynamic';
export async function GET(req:Request){return boundary(req,async()=>{
 const u=await identity(req);permit(u,'recover');const params=new URL(req.url).searchParams;if(params.get('export'))return exportBackup(u,params.get('export')!);
 const [b,t]=await Promise.all([db().prepare('SELECT id,project_id,project_name,status,manifest_hash,created_at,expires_at FROM backups WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(u.workspaceId).all(),db().prepare("SELECT id,json_extract(document,'$.name') AS name,deleted_at,purge_token FROM projects WHERE owner_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC").bind(u.workspaceId).all()]);return json({backups:b.results,trash:t.results,retentionDays:(await settings(u)).retention_days});
});}
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('backup'),projectId:z.string().uuid()}),z.object({action:z.literal('restoreBackup'),id:z.string().uuid()}),
 z.object({action:z.literal('trash'),projectId:z.string().uuid(),name:z.string().min(1).max(80)}),z.object({action:z.literal('restoreTrash'),projectId:z.string().uuid()}),
 z.object({action:z.literal('cleanup'),confirmation:z.literal('DELETE EXPIRED DATA')}),
]);
export async function POST(req:Request){return boundary(req,async()=>{
 const u=await identity(req);permit(u,'recover');const parsed=schema.safeParse(await body(req));if(!parsed.success)throw new HttpError(422,'Provide a valid recovery action and required confirmation.');const a=parsed.data;
 if(a.action==='backup')return json(await backupProject(u,a.projectId),201);
 if(a.action==='restoreBackup')return json(await restoreBackup(u,a.id),201);
 if(a.action==='cleanup')return json(await cleanup(u));
 if(a.action==='trash'){
  const p=await getProject(a.projectId,u.workspaceId);if(p.name!==a.name)throw new HttpError(422,'Type the exact deployment name to move it to trash.');
  const sending=await db().prepare('SELECT id FROM deliveries WHERE workspace_id = ? AND project_id = ? AND lease_until > ?').bind(u.workspaceId,p.id,new Date().toISOString()).first();if(sending)throw new HttpError(409,'Wait for the active delivery attempt before moving this deployment to trash.');
  await db().batch([db().prepare('UPDATE projects SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(new Date().toISOString(),p.id,u.workspaceId),workspaceEvent(u,'Deployment moved to trash',{projectId:p.id,retentionDays:(await settings(u)).retention_days})]);return json({trashed:true});
 }
 const restored=await db().batch([db().prepare('UPDATE projects SET deleted_at = NULL WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL AND purge_token IS NULL').bind(a.projectId,u.workspaceId),workspaceEvent(u,'Deployment restored from trash',{projectId:a.projectId},true)]);if(restored[0].meta.changes!==1)throw new HttpError(409,'The deployment is not in recoverable trash or cleanup has already claimed it.');return json({restored:true});
});}
