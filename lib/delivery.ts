import { env } from 'cloudflare:workers';
import { db, HttpError, workspaceEvent, type Actor } from './server';
export function approvedBase(input:string){
 let url:URL;try{url=new URL(input);}catch{throw new HttpError(422,'Enter a valid destination URL.');}
 const origins=(env.RELAY_DESTINATION_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||!origins.includes(url.origin))throw new HttpError(422,'The destination must be an HTTPS origin approved in the hosting configuration.');
 return url.href.replace(/\/$/,'');
}
async function key(){
 const encoded=env.RELAY_ENCRYPTION_KEY;if(!encoded)throw new HttpError(503,'Destination secret storage is not configured.');
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{throw new HttpError(503,'Destination secret storage is unavailable.');}
 if(bytes.length!==32)throw new HttpError(503,'Destination secret storage is unavailable.');
 return crypto.subtle.importKey('raw',new Uint8Array(bytes).buffer,'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(token:string,workspace:string){const nonce=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:new TextEncoder().encode(workspace)},await key(),new TextEncoder().encode(token));return JSON.stringify({v:1,nonce:btoa(String.fromCharCode(...nonce)),data:btoa(String.fromCharCode(...new Uint8Array(ciphertext)))});}
async function unseal(value:string,workspace:string){const stored=JSON.parse(value);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(stored.nonce),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(workspace)},await key(),Uint8Array.from(atob(stored.data),c=>c.charCodeAt(0)));return new TextDecoder().decode(plain);}
async function readReceipt(res:Response){const reader=res.body?.getReader();if(!reader)throw new Error('Receiver returned no receipt');let text='';const decoder=new TextDecoder();let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>64000){await reader.cancel();throw new Error('Receiver receipt exceeded limit');}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
export async function dispatch(actor:Actor,id:string,reconcile=false){
 const job=await db().prepare('SELECT * FROM deliveries WHERE id = ? AND workspace_id = ?').bind(id,actor.workspaceId).first<{id:string;project_id:string;release_id:string;status:string;attempts:number;next_attempt_at:string;lease_until:string|null}>();if(!job)throw new HttpError(404,'Delivery not found.');
 if(job.status==='acknowledged')return {status:job.status};
 const now=new Date().toISOString();if(job.lease_until&&job.lease_until>now)throw new HttpError(409,'A delivery check is already running.');
 if(!reconcile&&(!['queued','retryable'].includes(job.status)||job.next_attempt_at>now||job.attempts>=5))throw new HttpError(409,'Reconcile uncertain delivery first, wait for the retry time, or resolve the failed destination.');
 const config=await db().prepare('SELECT base_url,encrypted_token FROM destinations WHERE workspace_id = ?').bind(actor.workspaceId).first<{base_url:string;encrypted_token:string}>();if(!config)throw new HttpError(422,'Configure a destination before delivery.');
 const base=approvedBase(config.base_url);const token=await unseal(config.encrypted_token,actor.workspaceId);
 const release=await db().prepare('SELECT r.metadata,r.records FROM releases r JOIN projects p ON p.id = r.project_id WHERE r.id = ? AND r.owner_id = ? AND p.deleted_at IS NULL').bind(job.release_id,actor.workspaceId).first<{metadata:string;records:string}>();if(!release)throw new HttpError(404,'Release is unavailable.');
 const metadata=JSON.parse(release.metadata);const lease=crypto.randomUUID();
 const claim=await db().prepare('UPDATE deliveries SET lease_token = ?,lease_until = ?,status = ?,attempts = attempts + ?,updated_at = ? WHERE id = ? AND workspace_id = ? AND (lease_until IS NULL OR lease_until <= ?) AND status = ?').bind(lease,new Date(Date.now()+45000).toISOString(),'sending',reconcile?0:1,now,id,actor.workspaceId,now,job.status).run();if(claim.meta.changes!==1)throw new HttpError(409,'Another request claimed this delivery.');
 let status='uncertain';let error:string|null=null;let receipt:string|null=null;
 try{
  const res=await fetch(base+'/releases'+(reconcile?'/'+encodeURIComponent(job.release_id):''),{method:reconcile?'GET':'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':job.release_id,'X-Relay-Checksum':metadata.checksum},...(reconcile?{}:{body:JSON.stringify({schemaVersion:1,releaseId:job.release_id,checksum:metadata.checksum,recordCount:metadata.rowCount,contract:metadata.contract,records:JSON.parse(release.records)})})});
  if(reconcile&&res.status===404){status=job.attempts>=5?'failed':'retryable';error='Receiver confirms this release is absent.';}
  else if(res.status===401||res.status===403){status='failed';error='Receiver rejected destination authentication.';}
  else if(!res.ok){status='uncertain';error='Receiver returned HTTP '+res.status+'. Reconcile before sending again.';}
  else{const r=await readReceipt(res);if(r.releaseId!==job.release_id||r.checksum!==metadata.checksum||r.recordCount!==metadata.rowCount||r.status!=='committed'||typeof r.receiptId!=='string'||!r.receiptId||r.receiptId.length>200)throw new Error('Receipt does not match the release');receipt=JSON.stringify({releaseId:r.releaseId,checksum:r.checksum,recordCount:r.recordCount,status:r.status,receiptId:r.receiptId});status='acknowledged';}
 }catch{status='uncertain';error='No matching receipt was obtained. Reconcile to determine whether the receiver committed the records.';}
 const next=new Date(Date.now()+Math.min(300000,2**Math.max(job.attempts,1)*5000)).toISOString();
 await db().batch([db().prepare('UPDATE deliveries SET status = ?,receipt = ?,last_error = ?,next_attempt_at = ?,lease_token = NULL,lease_until = NULL,updated_at = ? WHERE id = ? AND workspace_id = ? AND lease_token = ?').bind(status,receipt,error,next,new Date().toISOString(),id,actor.workspaceId,lease),workspaceEvent(actor,reconcile?'Delivery reconciled':'Delivery attempted',{deliveryId:id,releaseId:job.release_id,status,requestId:actor.requestId})]);
 return {status,error,receipt:receipt?JSON.parse(receipt):null};
}
