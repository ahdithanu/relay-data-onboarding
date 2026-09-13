'use client';
export function activeWorkspace(){return typeof window==='undefined'?'':window.localStorage.getItem('relay.workspace')||'';}
export function selectWorkspace(id:string){if(id)window.localStorage.setItem('relay.workspace',id);else window.localStorage.removeItem('relay.workspace');window.dispatchEvent(new Event('relay:workspace'));}
export function scopedHref(path:string){const workspace=activeWorkspace();return path+(workspace?(path.includes('?')?'&':'?')+'workspace='+encodeURIComponent(workspace):'');}
export async function api<T>(path:string,options?:RequestInit){
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(activeWorkspace()?{'X-Workspace-ID':activeWorkspace()}:{}),...options?.headers}});
 const data=await response.json() as T&{error?:string;requestId?:string};
 if(!response.ok)throw new Error((data.error||'This request could not finish.')+(data.requestId?' Reference: '+data.requestId:''));
 return data;
}
