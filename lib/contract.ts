export const CONTRACT = Object.freeze({
  id:'relay.accounts',version:1,engineVersion:'1.0.0',
  fields:{account_id:{required:true,unique:true,caseSensitive:true},company_name:{required:true},email:{required:true,format:'nonempty local and domain with dot',normalize:'trim and lowercase'},plan:{required:true,values:['starter','growth','enterprise'],normalize:'trim and lowercase'},arr:{required:true,currency:'USD',min:0,max:1000000000,decimals:2,normalize:'two decimal places'},start_date:{required:true,format:'valid ISO calendar date'}},
  normalization:'Trim surrounding whitespace on all fields. Preserve row order.',
});
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function contractHash(){return digest(JSON.stringify(CONTRACT));}
