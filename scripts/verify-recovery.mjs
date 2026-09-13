import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function verifyRecovery(input,output){
 const destination=resolve(output);await mkdir(destination,{recursive:false});let database;
 try{
  database=new DatabaseSync(resolve(destination,'recovery.sqlite'));
  database.exec('CREATE TABLE recovered_objects (object_key TEXT PRIMARY KEY, kind TEXT NOT NULL, sha256 TEXT NOT NULL, content TEXT NOT NULL)');
  let manifest;let count=0;let complete=false;const seen=new Set();const source=createInterface({input:createReadStream(input),crlfDelay:Infinity});
  for await(const line of source){
   if(!line.trim())continue;if(complete)throw new Error('Unexpected data after completion marker');if(Buffer.byteLength(line)>8_000_000)throw new Error('Object exceeds the recovery line limit');const frame=JSON.parse(line);
   if(!manifest){if(frame.type!=='manifest'||frame.manifest?.format!=='relay.backup.v1'||!Array.isArray(frame.manifest.files)||frame.manifest.files.length>2000)throw new Error('Invalid recovery manifest');manifest=frame.manifest;if(new Set(manifest.files.map(f=>f.key)).size!==manifest.files.length)throw new Error('Duplicate manifest object keys');continue;}
   if(frame.type==='complete'){if(frame.objects!==manifest.files.length||seen.size!==manifest.files.length)throw new Error('Recovery bundle is incomplete');complete=true;continue;}
   if(frame.type!=='object'||typeof frame.text!=='string')throw new Error('Invalid recovery object');const entry=manifest.files.find(f=>f.key===frame.key);if(!entry||seen.has(frame.key)||entry.hash!==frame.hash||hash(frame.text)!==entry.hash||Buffer.byteLength(frame.text)!==entry.size)throw new Error('Recovery object checksum or size failed');
   seen.add(frame.key);database.prepare('INSERT INTO recovered_objects (object_key,kind,sha256,content) VALUES (?,?,?,?)').run(entry.key,entry.kind,entry.hash,frame.text);count++;
  }
  if(!complete)throw new Error('Missing recovery completion marker');
  const project=database.prepare("SELECT content FROM recovered_objects WHERE kind = 'project'").get();const original=database.prepare("SELECT content FROM recovered_objects WHERE kind = 'source'").get();if(!project||!original)throw new Error('Original source or project document missing');
  await writeFile(resolve(destination,'project.json'),project.content,{flag:'wx'});await writeFile(resolve(destination,'source.csv'),original.content,{flag:'wx'});await writeFile(resolve(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  database.close();database=undefined;return {verifiedObjects:count,projectId:manifest.projectId,output:destination};
 }catch(e){database?.close();await rm(destination,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==4){console.error('Usage: node scripts/verify-recovery.mjs INPUT.ndjson NEW_OUTPUT_DIRECTORY');process.exitCode=1;}else{try{console.log(JSON.stringify(await verifyRecovery(process.argv[2],process.argv[3])));}catch(e){console.error(e.message);process.exitCode=1;}}}
