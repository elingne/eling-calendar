import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {weekMemo,validWeek,SCHEMA} from '../src/week-memo.js';

const migration=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
const wrap=sqlite=>{
 const statement=(sql,values=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return sqlite.prepare(sql).run(...values);}});
 return {prepare:sql=>statement(sql)};
};
function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(migration('0001_calendar.sql'));
 sqlite.exec(migration('0009_week_memos.sql'));
 return {sqlite,DB:wrap(sqlite)};
}
const post=body=>new Request('https://calendar.example/api/private/week-memo',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://calendar.example'},body:JSON.stringify(body)});
const get=week=>new Request('https://calendar.example/api/private/week-memo?week='+week);
const WEEK='2026-11-02', NEXT='2026-11-09';

test('only real Mondays are accepted as a week',()=>{
 assert.equal(validWeek('2026-11-02'),true);
 for(const bad of ['2026-11-03','2026-11-01','2026-02-30','2026-13-02','2026-11-2','abc','',null,undefined,5,{}])assert.equal(validWeek(bad),false,String(bad));
});

test('migration is additive and can run twice without touching existing records',()=>{
 const {sqlite}=database();
 sqlite.exec(`INSERT INTO records VALUES('events',1,'{"id":1,"title":"기존 일정","start_date":"2026-11-03","end_date":"2026-11-03"}')`);
 sqlite.exec(migration('0009_week_memos.sql'));
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM week_memos').get().n,0);
});

test('each week has its own memo that can be saved, overwritten and cleared',async()=>{
 const {sqlite,DB}=database(),env={DB};
 const call=async request=>{const response=await weekMemo(request,env);return {status:response.status,body:await response.json()};};
 assert.deepEqual((await call(get(WEEK))).body.data,{week_start:WEEK,body:''});

 const text='월: 병원 예약\r\n  - 서류 챙기기\n\n금: 장보기';
 const saved=(await call(post({action:'save',week:WEEK,body:text}))).body.data;
 assert.equal(saved.body,'월: 병원 예약\n  - 서류 챙기기\n\n금: 장보기','줄바꿈과 들여쓰기는 그대로, 윈도 줄바꿈만 정리');
 assert.equal((await call(get(WEEK))).body.data.body,saved.body);
 assert.equal((await call(get(NEXT))).body.data.body,'','다른 주와 섞이지 않는다');

 await call(post({action:'save',week:WEEK,body:'고친 메모'}));
 assert.equal((await call(get(WEEK))).body.data.body,'고친 메모');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM week_memos').get().n,1,'저장은 덮어쓰기라 한 주에 한 줄');

 await call(post({action:'save',week:NEXT,body:'다음 주'}));
 await call(post({action:'save',week:WEEK,body:'  \n \n'}));
 assert.equal((await call(get(WEEK))).body.data.body,'');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM week_memos WHERE week_start=?').get(WEEK).n,0,'다 지우면 저장소에서도 지워진다');
 assert.equal((await call(get(NEXT))).body.data.body,'다음 주');
});

test('invalid input is rejected without changing anything',async()=>{
 const {sqlite,DB}=database(),env={DB};
 await weekMemo(post({action:'save',week:WEEK,body:'그대로'}),env);
 const rejects=(request,pattern)=>assert.rejects(weekMemo(request,env),pattern);
 await rejects(post({action:'save',week:'2026-11-03',body:'화요일은 안 돼요'}),/주 정보/);
 await rejects(post({action:'save',body:'주 없음'}),/주 정보/);
 await rejects(get('2026-13-02'),/주 정보/);
 await rejects(post({action:'save',week:WEEK,body:42}),/메모를 적어주세요/);
 await rejects(post({action:'save',week:WEEK}),/메모를 적어주세요/);
 await rejects(post({action:'save',week:WEEK,body:'가'.repeat(10001)}),/10000자/);
 await rejects(post({action:'drop table'}),/Unknown action/);
 await rejects(post(null),/Unknown action/);
 assert.equal(sqlite.prepare('SELECT body FROM week_memos').get().body,'그대로');
 await weekMemo(post({action:'save',week:WEEK,body:'가'.repeat(10000)}),env);   // 정확히 한도까지는 저장된다
 const raw=(init)=>weekMemo(new Request('https://calendar.example/api/private/week-memo',init),env);
 assert.equal((await raw({method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(21001)})).status,413);
 assert.equal((await raw({method:'POST',body:'{}'})).status,415);
 assert.equal((await raw({method:'PUT'})).status,405);
});

test('the table is created on first use when the migration was not applied, and matches the migration file',async()=>{
 const flat=sql=>sql.replace(/--.*$/gm,'').replace(/\s+/g,' ').replace(/\( /g,'(').replace(/ \)/g,')').replace(/ ?, ?/g,',').replace(/ ?; ?/g,';').trim();
 assert.equal(flat(SCHEMA.join(';')+';'),flat(migration('0009_week_memos.sql')));
 const env={DB:wrap(new DatabaseSync(':memory:'))};   // 마이그레이션을 적용하지 않은 데이터베이스
 const response=await weekMemo(post({action:'save',week:WEEK,body:'처음 쓰는 날'}),env);
 assert.equal((await response.json()).data.body,'처음 쓰는 날');
});
