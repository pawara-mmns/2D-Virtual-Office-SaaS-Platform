// Local-only configuration: reuse the existing workspace writer; never print keys.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
const read=p=>existsSync(p)?parseEnv(readFileSync(p,'utf8')):{};
const web={...read('apps/web/.env'),...read('apps/web/.env.local')},path='apps/realtime/.env',rt=read(path);
const url=rt.SUPABASE_URL;
if(!url||url!==web.NEXT_PUBLIC_SUPABASE_URL)throw Error('Web and realtime must use the same workspace Supabase project.');
const pair=rt.OFFICE_DECORATION_SUPABASE_SECRET_KEY?{url:rt.OFFICE_DECORATION_SUPABASE_URL||url,key:rt.OFFICE_DECORATION_SUPABASE_SECRET_KEY}:web.OFFICE_DECORATION_SUPABASE_SECRET_KEY?{url:web.OFFICE_DECORATION_SUPABASE_URL||url,key:web.OFFICE_DECORATION_SUPABASE_SECRET_KEY}:{url:web.PLATFORM_DATA_SUPABASE_URL,key:web.PLATFORM_DATA_SUPABASE_SECRET_KEY};
if(pair.url!==url||!pair.key)throw Error('A matching workspace server writer is required. No credentials were changed.');
let source=existsSync(path)?readFileSync(path,'utf8'):'';
for(const [name,value]of Object.entries({OFFICE_DECORATION_SUPABASE_URL:url,OFFICE_DECORATION_SUPABASE_SECRET_KEY:pair.key})){
 const line=name+'='+JSON.stringify(value),pattern=new RegExp('^'+name+'=.*$','m');source=pattern.test(source)?source.replace(pattern,()=>line):source.trimEnd()+'\n'+line+'\n';
}
writeFileSync(path,source);
console.info('Configured the existing workspace writer in the ignored local realtime environment. No database writes or credential rotation.');
