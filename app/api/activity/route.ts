import { boundary, identity, db, json } from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){return boundary(req,async()=>{const u=await identity(req);const a=await db().prepare('SELECT id, project_id, action, detail, created_at, actor, evidence_json, project_version, request_id FROM audit WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100').bind(u.workspaceId).all();return json({audit:a.results});});}
