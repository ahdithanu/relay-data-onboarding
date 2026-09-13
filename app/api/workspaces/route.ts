import { z } from 'zod';
import { boundary, identity, body, db, json, permit, settings, ensureWorkspace, workspaceEvent, HttpError } from '@/lib/server';
import { digest } from '@/lib/contract';
export const dynamic='force-dynamic';
export async function GET(req:Request){return boundary(req,async()=>{
 const u=await identity(req);const current=await settings(u);
 const joined=await db().prepare('SELECT w.id,w.name,m.role FROM members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ?').bind(u.userId).all();
 const own=await db().prepare('SELECT id,name FROM workspaces WHERE id = ?').bind(u.userId).first();
 const people=await db().prepare('SELECT id,user_id,email,role,created_at FROM members WHERE workspace_id = ?').bind(u.workspaceId).all();
 const invites=['owner','admin'].includes(u.role)?await db().prepare('SELECT id,email,role,expires_at,claimed_by,revoked_at FROM invitations WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50').bind(u.workspaceId).all():{results:[]};
 return json({current,role:u.role,userId:u.userId,workspaces:[{...(own||{id:u.userId,name:'My workspace'}),role:'owner'},...joined.results],members:[{id:'owner',user_id:current.id,email:current.owner_email,role:'owner'},...people.results],invitations:invites.results});
});}
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('settings'),name:z.string().trim().min(2).max(80),requireApproval:z.boolean(),retentionDays:z.number().int().min(7).max(365)}),
 z.object({action:z.literal('invite'),email:z.string().trim().email().max(254),role:z.enum(['admin','operator','reviewer','viewer'])}),
 z.object({action:z.literal('accept'),code:z.string().min(20).max(200)}),
 z.object({action:z.literal('revoke'),id:z.string().uuid()}),
 z.object({action:z.literal('remove'),userId:z.string().min(1).max(200)}),
]);
export async function POST(req:Request){return boundary(req,async()=>{
 const u=await identity(req);const parsed=schema.safeParse(await body(req));if(!parsed.success)throw new HttpError(422,'Provide valid workspace settings, role, or invitation details.');const a=parsed.data;
 if(a.action==='accept'){
  const hash=await digest(a.code);const inv=await db().prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(hash).first<{id:string;workspace_id:string;email:string;role:string;expires_at:string;claimed_by:string|null;revoked_at:string|null}>();
  if(!inv||inv.revoked_at||inv.expires_at<new Date().toISOString()||inv.email!==u.email.toLowerCase())throw new HttpError(403,'This invitation is expired, revoked, or belongs to a different signed in email.');
  if(inv.claimed_by&&inv.claimed_by!==u.userId)throw new HttpError(409,'This invitation was already used.');
  if(inv.claimed_by===u.userId){const member=await db().prepare('SELECT id FROM members WHERE workspace_id = ? AND user_id = ?').bind(inv.workspace_id,u.userId).first();if(!member)throw new HttpError(403,'This invitation was consumed and membership is no longer active. Request a new invitation.');return json({workspaceId:inv.workspace_id});}
  if(inv.workspace_id===u.userId)throw new HttpError(422,'You already own this workspace.');
  const results=await db().batch([
   db().prepare('UPDATE invitations SET claimed_by = ? WHERE id = ? AND claimed_by IS NULL AND revoked_at IS NULL AND expires_at > ?').bind(u.userId,inv.id,new Date().toISOString()),
   db().prepare('INSERT INTO members (id,workspace_id,user_id,email,role,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invitations WHERE id = ? AND claimed_by = ? AND revoked_at IS NULL) AND changes() = 1 ON CONFLICT(id) DO UPDATE SET role = excluded.role').bind(inv.workspace_id+':'+u.userId,inv.workspace_id,u.userId,u.email,inv.role,new Date().toISOString(),inv.id,u.userId),
   workspaceEvent({...u,workspaceId:inv.workspace_id},'Invitation accepted',{invitationId:inv.id,role:inv.role},true),
  ]);if(results[0].meta.changes!==1)throw new HttpError(409,'Invitation changed. Refresh and try again.');return json({workspaceId:inv.workspace_id});
 }
 permit(u,'manage');await ensureWorkspace(u);
 if(a.action==='settings'){const before=await settings(u);await db().batch([db().prepare('UPDATE workspaces SET name = ?,require_approval = ?,retention_days = ? WHERE id = ?').bind(a.name,Number(a.requireApproval),a.retentionDays,u.workspaceId),workspaceEvent(u,'Workspace settings changed',{before,after:a})]);return json({saved:true});}
 if(a.action==='invite'){
  if(a.email.toLowerCase()===(await settings(u)).owner_email.toLowerCase())throw new HttpError(422,'That email already owns the workspace.');
  const id=crypto.randomUUID();const code=id+'.'+crypto.randomUUID();const expires=new Date(Date.now()+7*86400000).toISOString();
  await db().batch([db().prepare('INSERT INTO invitations (id,workspace_id,email,role,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,u.workspaceId,a.email.toLowerCase(),a.role,await digest(code),expires,new Date().toISOString()),workspaceEvent(u,'Invitation created',{id,email:a.email.toLowerCase(),role:a.role,expiresAt:expires})]);
  return json({id,code,expiresAt:expires},201);
 }
 if(a.action==='revoke'){await db().batch([db().prepare('UPDATE invitations SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND claimed_by IS NULL').bind(new Date().toISOString(),a.id,u.workspaceId),workspaceEvent(u,'Invitation revoked',{id:a.id},true)]);return json({revoked:true});}
 if(a.action==='remove'){
  if(a.userId===u.workspaceId)throw new HttpError(422,'The workspace owner cannot be removed.');
  if(a.userId===u.userId)throw new HttpError(422,'Ask another administrator to remove your membership.');
  await db().batch([db().prepare('DELETE FROM members WHERE workspace_id = ? AND user_id = ?').bind(u.workspaceId,a.userId),workspaceEvent(u,'Member removed',{userId:a.userId},true)]);return json({removed:true});
 }
 return json({error:'Unknown action'},422);
});}
