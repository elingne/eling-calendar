import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import worker from '../src/worker.js';

const ORIGIN='https://calendar.example';
// D1 와 같은 모양(prepare → bind → run/first/all, batch)으로 감싼 메모리 SQLite. 마이그레이션은 전부 순서대로 적용한다.
function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).sort())sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 // D1 은 ArrayBuffer 를 그대로 받지만 node:sqlite 는 Uint8Array 만 받는다.
 const plain=values=>values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);
 const statement=(sql,values=[])=>({
  bind(...v){return statement(sql,plain(v));},
  async all(){return {results:sqlite.prepare(sql).all(...values)};},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async run(){sqlite.prepare(sql).run(...values);return {};},
  _run:()=>sqlite.prepare(sql).run(...values)
 });
 return {sqlite,prepare:sql=>statement(sql),async batch(list){for(const item of list)item._run();return [];}};
}

test('every save raises the sync number; reads, failed saves and photo uploads do not; only the owner can read it',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'sync-test',alg:'RS256',use:'sig'};
 const db=database();
 const env={DB:db,OWNER_EMAIL:'ielingkk@gmail.com',ACCESS_TEAM_DOMAIN:'sync-test.cloudflareaccess.com',ACCESS_AUD:'sync-audience',ASSETS:{fetch:async()=>new Response('<html></html>')}};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({keys:[jwk]});
 const sign=(email='ielingkk@gmail.com')=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'sync-test'}).setIssuer('https://sync-test.cloudflareaccess.com').setAudience('sync-audience').setIssuedAt().setExpirationTime('1h').sign(privateKey);
 try {
  const owner=await sign(),outsider=await sign('outsider@example.com');
  const call=(path,{token=owner,method='GET',body,type='application/json',origin=ORIGIN}={})=>worker.fetch(new Request(ORIGIN+path,{
   method,headers:{...(token?{'Cf-Access-Jwt-Assertion':token}:{}),...(body!==undefined?{'Content-Type':type,Origin:origin}:{})},body:body===undefined?undefined:(typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body))
  }),env);
  const version=async()=>(await(await call('/api/private/sync')).json()).data.version;
  const header=response=>response.headers.get('X-Sync-Version');

  // 로그인하지 않았거나 관리자가 아니면 번호도 볼 수 없다.
  assert.equal((await call('/api/private/sync',{token:null})).status,401);
  assert.equal((await call('/api/private/sync',{token:outsider})).status,401);
  assert.equal((await call('/api/private/sync',{method:'POST',body:{}})).status,405);
  assert.equal(await version(),0);

  // 일정 저장 → 번호 +1, 응답 헤더에도 같은 번호
  const insert=await call('/api/private/query',{method:'POST',body:{table:'events',action:'insert',values:{title:'치과',start_date:'2026-11-10',end_date:'2026-11-10'}}});
  assert.equal(insert.status,200);assert.equal(header(insert),'1');assert.equal(await version(),1);

  // 읽기는 번호를 올리지 않고 헤더도 없다.
  const select=await call('/api/private/query',{method:'POST',body:{table:'events'}});
  assert.equal(select.status,200);assert.equal(header(select),null);assert.equal(await version(),1);

  // 실패한 저장은 번호를 올리지 않는다.
  const bad=await call('/api/private/query',{method:'POST',body:{table:'events',action:'insert',values:{title:'',start_date:'2026-11-10',end_date:'2026-11-10'}}});
  assert.equal(bad.status,400);assert.equal(header(bad),null);
  const foreign=await call('/api/private/query',{method:'POST',body:{table:'events',action:'delete',filters:[['id','eq',1]]},origin:'https://evil.example'});
  assert.equal(foreign.status,403);assert.equal(await version(),1);

  // 금주의 메모 저장 → +1 (불러오기는 그대로)
  const memo=await call('/api/private/week-memo',{method:'POST',body:{action:'save',week:'2026-11-02',body:'장보기'}});
  assert.equal(memo.status,200);assert.equal(header(memo),'2');
  assert.equal(header(await call('/api/private/week-memo?week=2026-11-02')),null);

  // 메모장: 만들기·저장은 +1, 사진 올리기와 불러오기는 그대로
  const created=await call('/api/private/memos',{method:'POST',body:{action:'create'}});
  assert.equal(created.status,200);assert.equal(header(created),'3');
  const id=(await created.json()).id;
  assert.equal(header(await call('/api/private/memos')),null);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
  const upload=await call('/api/private/memo-images',{method:'POST',body:new Uint8Array(png),type:'image/png'});
  assert.equal(upload.status,200);assert.equal(header(upload),null);assert.equal(await version(),3);
  const saved=await call('/api/private/memos',{method:'POST',body:{action:'save',id,title:'제목',content:'내용'}});
  assert.equal(header(saved),'4');assert.equal(await version(),4);

  // 저장한 내용이 번호만 바뀐 게 아니라 실제로 들어가 있다. 기존 기록은 그대로.
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_state').get().n,1);

  // 번호를 올리지 못하는 상황이어도 저장은 성공한다.
  db.sqlite.exec('DROP TABLE sync_state');
  const original=db.prepare.bind(db),broken=sql=>sql.includes('sync_state')?{bind(){return this;},run:async()=>{throw new Error('down');},all:async()=>{throw new Error('down');},first:async()=>{throw new Error('down');}}:original(sql);
  const logged=console.error;console.error=()=>{};
  try {
   env.DB={...db,prepare:broken};
   const survived=await call('/api/private/query',{method:'POST',body:{table:'events',action:'insert',values:{title:'번호 실패',start_date:'2026-11-11',end_date:'2026-11-11'}}});
   assert.equal(survived.status,200);assert.equal(header(survived),null);
  } finally {console.error=logged;env.DB=db;}
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,2);
 } finally {globalThis.fetch=originalFetch;db.sqlite.close();}
});

test('the page may talk to the desktop app bridge but still only to itself otherwise',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('<html></html>')}};
 const response=await worker.fetch(new Request(ORIGIN+'/'),env);
 const csp=response.headers.get('Content-Security-Policy');
 assert.match(csp,/connect-src 'self' ipc: http:\/\/ipc\.localhost;/);
 assert.match(csp,/script-src 'self';/);
 assert.match(csp,/frame-ancestors 'none'/);
});
