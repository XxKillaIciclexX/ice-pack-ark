import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {catalog,load,save,upsertKit,deleteKit,preview,loadPrefs,savePrefs,saveCatalog} from './kit-store.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.KIT_EDITOR_PORT||3211);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid KIT_EDITOR_PORT');
const html=fs.readFileSync(path.join(base,'public','index.html'));
async function body(req){let chunks=[],bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
const server=http.createServer(async(req,res)=>{
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 try{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host))return json(403,{error:'Local access only'});
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(html);return;}
  if(req.method==='GET'&&req.url==='/api/state')return json(200,{catalog,contentPrefs:loadPrefs(),config:load(),dryRun:true});
  if(req.method!=='POST'||!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin)||req.headers['x-icepack-editor']!=='1')return json(403,{error:'Local dashboard only'});
  const payload=await body(req);
  if(req.url==='/api/content/preferences')return json(200,{contentPrefs:savePrefs(payload)});
  if(req.url==='/api/catalog/import'){const checked=saveCatalog(payload.catalog);return json(200,{catalog:checked,contentPrefs:loadPrefs()});}
  if(req.url==='/api/rule/save') {
    const current=load();const rule=payload.rule;
    if(!rule||typeof rule.id!=='string')throw Error('Rule ID required');
    const index=current.rules.findIndex(x=>x.id===rule.id);
    if(index>=0)current.rules[index]=rule;else current.rules.push(rule);
    return json(200,{config:save(current)});
  }
  if(req.url==='/api/rule/delete') {
    const current=load();const original=current.rules.length;
    current.rules=current.rules.filter(x=>x.id!==payload.id);
    if(original===current.rules.length)throw Error('Rule not found');
    return json(200,{config:save(current)});
  }
  if(req.url==='/api/kit/save')return json(200,{config:upsertKit(load(),payload.kit)});
  if(req.url==='/api/kit/duplicate'){
    const c=load(),src=c.kits.find(x=>x.id===payload.id);if(!src)throw Error('Kit not found');
    const copy=structuredClone(src);copy.id='kit-'+randomUUID().slice(0,8);copy.name=src.name+' (Copy)';
    return json(200,{config:upsertKit(c,copy),id:copy.id});
  }
  if(req.url==='/api/kit/delete')return json(200,{config:deleteKit(load(),payload.id)});
  if(req.url==='/api/preview')return json(200,{preview:preview(load(),{id:payload.giftId,name:payload.giftName})});
  return json(404,{error:'Not found'});
 }catch(e){json(400,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Ice Pack Kit Editor (DRY RUN): http://localhost:${port}`));
