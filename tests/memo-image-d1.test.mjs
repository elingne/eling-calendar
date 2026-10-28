import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memos} from '../src/memos.js';

// D1 returns BLOB columns as a plain array of numbers, unlike node:sqlite (Uint8Array).
// This mock mimics D1 so the image route is checked against the real driver behavior.
function d1Like() {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql','0004_memo_order.sql'])sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const toD1=row=>row&&Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Uint8Array?Array.from(value):value]));
  const statement=(sql,values=[])=>({
    bind(...v){return statement(sql,v);},
    async first(){return toD1(sqlite.prepare(sql).get(...values))||null;},
    async all(){return {results:sqlite.prepare(sql).all(...values).map(toD1)};},
    async run(){return sqlite.prepare(sql).run(...values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v));}
  });
  return {sqlite,prepare:sql=>statement(sql)};
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
const upload=(body,headers={})=>new Request('https://calendar.example/api/private/memo-images',{method:'POST',headers:{'Content-Type':'image/png',...headers},body});

test('stored photo is served as the original bytes when the database returns BLOB as an array',async()=>{
  const db=d1Like(),env={DB:db};
  const {url}=await(await memos(upload(png),env,'/api/private/memo-images')).json();
  const photo=await memos(new Request('https://calendar.example'+url),env,url);
  assert.equal(photo.status,200);
  assert.equal(photo.headers.get('Content-Type'),'image/png');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()),png);
  db.sqlite.close();
});

test('oversized photo is rejected, both by declared length and by actual size',async()=>{
  const db=d1Like(),env={DB:db};
  const big=new Uint8Array(1048577);big.set([137,80,78,71,13,10,26,10]);
  assert.equal((await memos(upload(big),env,'/api/private/memo-images')).status,413);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM memo_images').get().n,0);
  db.sqlite.close();
});
