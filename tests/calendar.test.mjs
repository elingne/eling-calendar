import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import worker,{query,owner,validateValues} from '../src/worker.js';
import {convert,parseCSV,digest} from '../scripts/convert-export.mjs';
function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../migrations/0001_calendar.sql',import.meta.url),'utf8'));
  return {sqlite,prepare(sql) {return {async all(){return {results:sqlite.prepare(sql).all()};},bind(...values) {return {
    async all(){return {results:sqlite.prepare(sql).all(...values)};},
    async run(){return sqlite.prepare(sql).run(...values);}
  };}};}};
}
const event={title:'한글 일정',start_date:'2026-10-19',end_date:'2026-10-22',description:'개인 메모',color_variant:'pink'};
test('event create, edit, range filter, reorder, copy, delete and allocated IDs',async()=>{
  const db=database();
  await query(db,{table:'events',action:'insert',values:event});
  await query(db,{table:'events',action:'insert',values:{...event,title:'복사'}});
  let result=await query(db,{table:'events',filters:[['start_date','lte','2026-10-20'],['end_date','gte','2026-10-20']],orders:[['id',true]]});
  assert.equal(result.data.length,2);assert.equal(result.data[0].id,1);
  await query(db,{table:'events',action:'update',filters:[['id','eq',1]],values:{title:'수정',sort_order:3}});
  result=await query(db,{table:'events',filters:[['id','eq',1]],single:true});
  assert.equal(result.data.title,'수정');assert.equal(result.data.description,'개인 메모');
  await query(db,{table:'events',action:'delete',filters:[['id','eq',1]]});
  assert.equal((await query(db,{table:'events'})).data.length,1);
  db.sqlite.close();
});
test('quick todos booleans, IN selection and daily mood upsert',async()=>{
  const db=database();
  await query(db,{table:'quick_todos',action:'insert',values:{title:'할 일'}});
  await query(db,{table:'quick_todos',action:'update',filters:[['id','eq',1]],values:{is_completed:true,completed_at:'2026-10-19T10:00:00Z'}});
  assert.equal((await query(db,{table:'quick_todos',filters:[['is_completed','eq',true],['id','in',[1]]]})).data.length,1);
  for(const mood_type of ['happy','bad'])await query(db,{table:'moods',action:'upsert',values:{record_date:'2026-10-19',mood_type,reason:null}});
  const mood=await query(db,{table:'moods'});assert.equal(mood.data.length,1);assert.equal(mood.data[0].mood_type,'bad');assert.equal(mood.data[0].id,1);
  db.sqlite.close();
});
test('public response excludes personal fields; private APIs reject forged identity',async()=>{
  const db=database();await query(db,{table:'events',action:'insert',values:event});
  const env={DB:db,ASSETS:{fetch:async()=>new Response('ok')}};
  const response=await worker.fetch(new Request('https://calendar.example/api/public/events'),env);
  const data=(await response.json()).data[0];assert.equal(data.title,event.title);assert.equal(data.description,undefined);assert.equal(data.created_at,undefined);
  for(const endpoint of ['/api/private/query','/admin']) {
    const r=await worker.fetch(new Request('https://calendar.example'+endpoint,{headers:{'Cf-Access-Authenticated-User-Email':'ielingkk@gmail.com','Cookie':'CF_Authorization=forged'}}),env);
    assert.equal(r.status,401);
  }
  assert.equal(await owner(new Request('https://calendar.example'),env),false);
  assert.equal((await worker.fetch(new Request('https://calendar.example/api/private/moods'),env)).status,404);
  db.sqlite.close();
});
test('reject SQL injection, unbounded writes and invalid data',async()=>{
  const db=database();
  for(const q of [
    {table:'events; DROP TABLE records'},
    {table:'events',filters:[["id) OR 1=1 --",'eq',1]]},
    {table:'events',action:'delete'},
    {table:'events',action:'insert',values:{...event,end_date:'2020-01-01'}},
    {table:'events',action:'insert',values:{...event,is_completed:'true'}},
    {table:'events',action:'insert',values:{...event,unknown:'bad'}}
  ])await assert.rejects(query(db,q));
  assert.throws(()=>validateValues('events',{...event,start_date:'2026-02-30'}));
  assert.ok((await query(db,{table:'events'})).data);db.sqlite.close();
});
test('signed Access identity, owner restriction, expiration, audience and cross-origin writes',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk={...await exportJWK(publicKey),kid:'calendar-test',alg:'RS256',use:'sig'};
  const env={DB:database(),OWNER_EMAIL:'ielingkk@gmail.com',ACCESS_TEAM_DOMAIN:'calendar-test.cloudflareaccess.com',ACCESS_AUD:'calendar-audience'};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const sign=(email='ielingkk@gmail.com',aud='calendar-audience',exp='1h')=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'calendar-test'}).setIssuer('https://calendar-test.cloudflareaccess.com').setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const req=(token,origin='https://calendar.example')=>new Request('https://calendar.example/api/private/query',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':token,'Content-Type':'application/json',Origin:origin},body:JSON.stringify({table:'events',action:'insert',values:event})});
  try {
    const token=await sign();
    assert.equal(await owner(req(token),env),true);
    assert.equal(await owner(new Request('https://calendar.example/api/session',{headers:{Cookie:`CF_Authorization=${token}`}}),env),true);
    for(const invalid of [await sign('outsider@example.com'),await sign(undefined,'wrong-audience'),await sign(undefined,undefined,'-1s'),token.slice(0,-8)+'tampered'])assert.equal(await owner(req(invalid),env),false);
    assert.equal((await worker.fetch(req(token,'https://evil.example'),env)).status,403);
    assert.equal((await worker.fetch(req(token),env)).status,200);
    assert.equal((await query(env.DB,{table:'events'})).data.length,1);
  } finally {globalThis.fetch=originalFetch;env.DB.sqlite.close();}
});
test('CSV quoted commas, newlines, booleans, nulls, IDs and no-overwrite import',async()=>{
  const input=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-import-'));
  const output=path.join(input,'out');
  try {
    const csv='id,title,description,start_date,end_date,is_completed,sort_order\r\n42,"한글, 일정","첫줄\n둘째줄 \'인용\' ""따옴표""",2026-10-19,2026-10-20,false,1000\r\n';
    fs.writeFileSync(path.join(input,'events.csv'),csv);
    const rows=parseCSV(csv);assert.equal(rows[0].is_completed,false);assert.equal(rows[0].id,42);
    assert.equal(parseCSV('id,title,reason\n1,"",\n')[0].title,'');assert.equal(parseCSV('id,title,reason\n1,"",\n')[0].reason,null);
    const manifest=convert(input,output),db=database();
    const sql=fs.readFileSync(path.join(output,'import.sql'),'utf8');db.sqlite.exec(sql);
    const imported=(await query(db,{table:'events'})).data;
    assert.equal(digest(imported),manifest.tables.events.sha256);assert.equal(imported[0].description,rows[0].description);
    assert.throws(()=>db.sqlite.exec(sql)); // repeated import refuses to replace data
    await query(db,{table:'events',action:'insert',values:event});
    assert.equal((await query(db,{table:'events',orders:[['id',false]],limit:1})).data[0].id,43);
    db.sqlite.close();
  }finally{fs.rmSync(input,{recursive:true,force:true});}
});
test('both frontend roles initialize without missing removed DOM elements',async()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  for(const role of [false,true]) {
    const elements=new Map();
    function el(id='') {return {id,dataset:{},value:'',textContent:'',innerHTML:'',children:[],className:'',style:{setProperty(){}},classList:{toggle(){},add(){},remove(){},contains(){return false;}},addEventListener(){},setAttribute(){},querySelector(){return el();},querySelectorAll(){return [];},appendChild(child){this.children.push(child);this.firstElementChild=this.children[0];},append(){},focus(){},contains(){return false;}};}
    for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],el(match[1]));
    const document={createElement:()=>el(),getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],addEventListener(){},body:el(),hidden:false};
    const window={addEventListener(){},dispatchEvent(){},setTimeout(){},setInterval(){}};
    const context=vm.createContext({document,window,console,localStorage:{getItem(){return null;},setItem(){}},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},fetch:async url=>({ok:true,json:async()=>url==='/api/session'?{owner:role}:{data:[],error:null}}),CustomEvent:class{},location:{},Date,Map,Set});
    vm.runInContext(fs.readFileSync(new URL('../public/api.js',import.meta.url),'utf8'),context);
    vm.runInContext(fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(elements.get('connectionMessage').textContent,'');
    assert.ok(elements.get('calendarGrid').children.length>=35);
  }
});
