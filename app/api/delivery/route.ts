import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { boundary, identity, body, db, json, permit, getProject, workspaceEvent, HttpError } from '@/lib/server';
import { approvedBase, seal, dispatch } from '@/lib/delivery';
export const dynamic='force-dynamic';
export async function GET(req:Request){return boundary(req,async()=>{const u=await identity(req);const configured=await db().prepare('SELECT base_url,updated_at FROM destinations WHERE workspace_id = ?').bind(u.workspaceId).first();const jobs=await db().prepare('SELECT id,project_id,release_id,status,attempts,next_attempt_at,last_error,receipt,updated_at FROM deliveries WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100').bind(u.workspaceId).all();return json({configured,jobs:jobs.results,secretStorageReady:!!env.RELAY_ENCRYPTION_KEY,approvedOrigins:(env.RELAY_DESTINATION_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)});});}
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('configure'),baseUrl:z.string().max(500),token:z.string().min(1).max(4000)}),
 z.object({action:z.literal('queue'),projectId:z.string().uuid(),releaseId:z.string().uuid()}),
 z.object({action:z.literal('send'),id:z.string().uuid()}),
 z.object({action:z.literal('reconcile'),id:z.string().uuid()}),
]);
export async function POST(req:Request){return boundary(req,async()=>{
 const u=await identity(req);const parsed=schema.safeParse(await body(req));if(!parsed.success)throw new HttpError(422,'Supply a valid destination action.');const a=parsed.data;
 if(a.action==='configure'){permit(u,'manage');const base=approvedBase(a.baseUrl);const existing=await db().prepare('SELECT base_url FROM destinations WHERE workspace_id = ?').bind(u.workspaceId).first<{base_url:string}>();if(existing&&existing.base_url!==base){const jobs=await db().prepare('SELECT id FROM deliveries WHERE workspace_id = ? LIMIT 1').bind(u.workspaceId).first();if(jobs)throw new HttpError(409,'A workspace with delivery history retains its destination. Use a separate workspace for a different receiver.');}const secret=await seal(a.token,u.workspaceId);await db().batch([db().prepare('INSERT INTO destinations (workspace_id,base_url,encrypted_token,updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET base_url = excluded.base_url,encrypted_token = excluded.encrypted_token,updated_at = excluded.updated_at').bind(u.workspaceId,base,secret,new Date().toISOString()),workspaceEvent(u,'Destination configured',{baseUrl:base})]);return json({configured:true});}
 permit(u,'release');
 if(a.action==='queue'){
  const configured=await db().prepare('SELECT workspace_id FROM destinations WHERE workspace_id = ?').bind(u.workspaceId).first();if(!configured)throw new HttpError(422,'Configure a destination before queuing delivery.');const p=await getProject(a.projectId,u.workspaceId);if(p.activeReleaseId!==a.releaseId)throw new HttpError(422,'Only the active verified release can start a delivery.');
  const now=new Date().toISOString();await db().prepare('INSERT OR IGNORE INTO deliveries (id,workspace_id,project_id,release_id,status,attempts,next_attempt_at,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?,?)').bind(a.releaseId,u.workspaceId,a.projectId,a.releaseId,'queued',now,now,now).run();
  return json({id:a.releaseId,status:'queued'});
 }
 return json(await dispatch(u,a.id,a.action==='reconcile'));
});}
