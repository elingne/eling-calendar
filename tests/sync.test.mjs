import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sync,readVersion,bumpVersion,withVersion,SCHEMA} from '../src/sync.js';

const migration=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
// D1 와 같은 모양(prepare → bind → run/first/all)으로 감싼 메모리 SQLite
const wrap=sqlite=>{
 const statement=(sql,values=[])=>({
  bind(...v){return statement(sql,v);},
  async all(){return {results:sqlite.prepare(sql).all(...values)};},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async run(){sqlite.prepare(sql).run(...values);return {};}
 });
 return {prepare:sql=>statement(sql)};
};
function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(migration('0001_calendar.sql'));
 return {sqlite,DB:wrap(sqlite)};
}
const get=()=>new Request('https://calendar.example/api/private/sync');

test('migration 0010 is additive, starts at 0 and can run twice without touching records',()=>{
 const {sqlite}=database();
 sqlite.exec(`INSERT INTO records VALUES('events',1,'{"id":1,"title":"기존 일정","start_date":"2026-11-03","end_date":"2026-11-03"}')`);
 sqlite.exec(migration('0010_sync_state.sql'));
 sqlite.prepare('UPDATE sync_state SET version=7 WHERE id=1').run();
 sqlite.exec(migration('0010_sync_state.sql'));
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);
 assert.equal(sqlite.prepare('SELECT version FROM sync_state WHERE id=1').get().version,7,'다시 실행해도 번호가 0으로 돌아가지 않는다');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sync_state').get().n,1,'한 줄만 있다');
});

test('the self-creating schema matches the migration',()=>{
 const fromMigration=database(),fromCode=database();
 fromMigration.sqlite.exec(migration('0010_sync_state.sql'));
 for(const sql of SCHEMA)fromCode.sqlite.exec(sql);
 const table=({sqlite})=>sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='sync_state'").get().sql.replace(/\s+/g,'');
 assert.equal(table(fromCode),table(fromMigration));
 const rows=({sqlite})=>sqlite.prepare('SELECT id,version FROM sync_state').all();
 assert.deepEqual(rows(fromCode),rows(fromMigration));
});

test('version starts at 0 even if the migration was never applied, and every bump adds one',async()=>{
 const {DB}=database();
 assert.equal(await readVersion(DB),0);
 assert.equal(await bumpVersion(DB),1);
 assert.equal(await bumpVersion(DB),2);
 assert.equal(await readVersion(DB),2);
});

test('the sync endpoint returns only the number and accepts GET only',async()=>{
 const {DB}=database();
 await bumpVersion(DB);
 const response=await sync(get(),{DB});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await response.json(),{data:{version:1}});
 assert.equal((await sync(new Request('https://calendar.example/api/private/sync',{method:'POST'}),{DB})).status,405);
});

test('a failing database never throws out of bumpVersion (saving must still succeed)',async()=>{
 const broken={prepare(){throw new Error('db down');}};
 const original=console.error;let logged=0;console.error=()=>{logged++;};
 try {assert.equal(await bumpVersion(broken),null);} finally {console.error=original;}
 assert.equal(logged,1);
});

test('withVersion adds the header and keeps status, body and other headers',async()=>{
 const original=Response.json({ok:true},{status:201,headers:{'Cache-Control':'no-store'}});
 const copy=withVersion(original,5);
 assert.equal(copy.status,201);
 assert.equal(copy.headers.get('X-Sync-Version'),'5');
 assert.equal(copy.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await copy.json(),{ok:true});
 assert.equal(withVersion(Response.json({}),null).headers.get('X-Sync-Version'),null,'번호를 못 올렸으면 헤더도 없다');
});
