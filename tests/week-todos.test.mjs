import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {weekTodos,validWeek,SCHEMA} from '../src/weekly.js';

const migration=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(migration('0001_calendar.sql'));
 sqlite.exec(migration('0008_week_todos.sql'));
 const statement=(sql,values=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return sqlite.prepare(sql).run(...values);}});
 return {sqlite,prepare:sql=>statement(sql)};
}
const post=body=>new Request('https://calendar.example/api/private/week-todos',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://calendar.example'},body:JSON.stringify(body)});
const get=week=>new Request('https://calendar.example/api/private/week-todos?week='+week);
const WEEK='2026-11-02', NEXT='2026-11-09';

test('only real Mondays are accepted as a week',()=>{
 assert.equal(validWeek('2026-11-02'),true);
 for(const bad of ['2026-11-03','2026-11-01','2026-02-30','2026-13-02','2026-11-2','abc','',null,undefined,5,{}])assert.equal(validWeek(bad),false,String(bad));
});

test('migration is additive and can run twice without touching existing records',()=>{
 const db=database();
 db.sqlite.exec(`INSERT INTO records VALUES('events',1,'{"id":1,"title":"기존 일정","start_date":"2026-11-03","end_date":"2026-11-03"}')`);
 db.sqlite.exec(migration('0008_week_todos.sql'));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM week_todos').get().n,0);
});

test('add, list, toggle, rename and delete keep each week separate',async()=>{
 const env={DB:database()};
 const call=async(request)=>{const response=await weekTodos(request,env);return {status:response.status,body:await response.json()};};
 assert.deepEqual((await call(get(WEEK))).body.data,[]);

 const first=(await call(post({action:'add',week:WEEK,title:'  보고서 마감  '}))).body.data;
 assert.equal(first.length,1);assert.equal(first[0].title,'보고서 마감');assert.equal(first[0].is_done,false);assert.equal(first[0].week_start,WEEK);
 await call(post({action:'add',week:WEEK,title:'장보기'}));
 await call(post({action:'add',week:NEXT,title:'다음 주 일'}));
 let rows=(await call(get(WEEK))).body.data;
 assert.deepEqual(rows.map(r=>r.title),['보고서 마감','장보기'],'added order is kept');
 assert.deepEqual((await call(get(NEXT))).body.data.map(r=>r.title),['다음 주 일'],'other weeks are not mixed in');

 rows=(await call(post({action:'toggle',id:rows[0].id,done:true}))).body.data;
 assert.equal(rows[0].is_done,true);assert.equal(rows[1].is_done,false);
 rows=(await call(post({action:'toggle',id:rows[0].id,done:false}))).body.data;
 assert.equal(rows[0].is_done,false);
 rows=(await call(post({action:'rename',id:rows[1].id,title:'  마트 가기 '}))).body.data;
 assert.equal(rows[1].title,'마트 가기');

 rows=(await call(post({action:'delete',id:rows[0].id}))).body.data;
 assert.deepEqual(rows.map(r=>r.title),['마트 가기']);
 // 지운 할 일은 저장소에서도 사라진다.
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM week_todos WHERE week_start=?').get(WEEK).n,1);
});

test('invalid input is rejected without changing anything',async()=>{
 const env={DB:database()};
 const count=()=>env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM week_todos').get().n;
 await weekTodos(post({action:'add',week:WEEK,title:'하나'}),env);
 const id=env.DB.sqlite.prepare('SELECT id FROM week_todos').get().id;
 const rejects=(request,pattern)=>assert.rejects(weekTodos(request,env),pattern);
 await rejects(post({action:'add',week:WEEK,title:'   '}),/적어주세요/);
 await rejects(post({action:'add',week:WEEK,title:'가'.repeat(121)}),/120자/);
 await rejects(post({action:'add',week:WEEK,title:42}),/적어주세요/);
 await rejects(post({action:'add',week:'2026-11-03',title:'화요일은 안 돼요'}),/주 정보/);
 await rejects(post({action:'add',title:'주 없음'}),/주 정보/);
 await rejects(get('2026-13-02'),/주 정보/);
 await rejects(post({action:'toggle',id,done:'yes'}),/Invalid value/);
 await rejects(post({action:'rename',id,title:''}),/적어주세요/);
 await rejects(post({action:'toggle',id:'없는-id!',done:true}),/Invalid id/);
 await rejects(post({action:'toggle',id:'missing',done:true}),/이미 지워진/);
 await rejects(post({action:'drop table'}),/Unknown action/);
 await rejects(post(null),/Invalid request/);
 assert.equal(count(),1);
 assert.equal((await weekTodos(new Request('https://calendar.example/api/private/week-todos',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(6000)}),env)).status,413);
 assert.equal((await weekTodos(new Request('https://calendar.example/api/private/week-todos',{method:'POST',body:'{}'}),env)).status,415);
 assert.equal((await weekTodos(new Request('https://calendar.example/api/private/week-todos',{method:'PUT'}),env)).status,405);
});

test('a week holds at most 100 items',async()=>{
 const env={DB:database()};
 for(let i=0;i<100;i++)await weekTodos(post({action:'add',week:WEEK,title:'할 일 '+i}),env);
 await assert.rejects(weekTodos(post({action:'add',week:WEEK,title:'하나 더'}),env),/100개/);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM week_todos').get().n,100);
 await weekTodos(post({action:'add',week:NEXT,title:'다른 주는 가능'}),env);
});

test('the table is created on first use when the migration was not applied, and matches the migration file',async()=>{
 const flat=sql=>sql.replace(/--.*$/gm,'').replace(/\s+/g,' ').replace(/\( /g,'(').replace(/ \)/g,')').replace(/ ?; ?/g,';').trim();
 assert.equal(flat(SCHEMA.join(';')+';'),flat(migration('0008_week_todos.sql')));
 const sqlite=new DatabaseSync(':memory:');   // 마이그레이션을 적용하지 않은 데이터베이스
 const statement=(sql,values=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return sqlite.prepare(sql).run(...values);}});
 const env={DB:{prepare:sql=>statement(sql)}};
 const response=await weekTodos(post({action:'add',week:WEEK,title:'처음 쓰는 날'}),env);
 assert.deepEqual((await response.json()).data.map(r=>r.title),['처음 쓰는 날']);
});
