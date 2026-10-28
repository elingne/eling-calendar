import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memos} from '../src/memos.js';

const migration=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
const allMigrations=['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql','0004_memo_order.sql'];
function database(names=allMigrations,{failImageDelete=false}={}) {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of names)sqlite.exec(migration(name));
  const statement=(sql,values=[])=>({
    bind(...v){return statement(sql,v);},
    async all(){return {results:sqlite.prepare(sql).all(...values)};},
    async first(){return sqlite.prepare(sql).get(...values)||null;},
    async run(){
      if(failImageDelete&&sql.startsWith('DELETE FROM memo_images'))throw Error('simulated failure');
      return sqlite.prepare(sql).run(...values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v));
    }
  });
  return {sqlite,prepare:sql=>statement(sql),async batch(list){sqlite.exec('BEGIN');try{for(const s of list)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
const call=(env,body)=>memos(new Request('https://calendar.example/api/private/memos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env,'/api/private/memos').then(r=>r.json());
async function upload(env) {
  const response=await memos(new Request('https://calendar.example/api/private/memo-images',{method:'POST',headers:{'Content-Type':'image/png'},body:png}),env,'/api/private/memo-images');
  return (await response.json()).url.split('/').pop();
}
const imageIds=db=>db.sqlite.prepare('SELECT id FROM memo_images ORDER BY rowid').all().map(r=>r.id);
const age=(db,id,hours)=>db.sqlite.prepare('UPDATE memo_images SET created_at=? WHERE id=?').run(new Date(Date.now()-hours*3600e3).toISOString(),id);
const withPhoto=id=>`앞<img src="/api/private/memo-images/${id}">뒤`;

test('saving a memo removes old unused photos but keeps used and recent ones',async()=>{
  const db=database(),env={DB:db};
  const used=await upload(env),usedByOther=await upload(env),oldOrphan=await upload(env),freshOrphan=await upload(env);
  const a=(await call(env,{action:'create'})).id,b=(await call(env,{action:'create'})).id;
  await call(env,{action:'save',id:b,title:'다른 메모',content:withPhoto(usedByOther)});
  for(const id of [used,usedByOther,oldOrphan])age(db,id,48);   // freshOrphan stays recent (editor may still be open)
  await call(env,{action:'save',id:a,title:'사진 메모',content:withPhoto(used)});
  assert.deepEqual(imageIds(db).sort(),[used,usedByOther,freshOrphan].sort());
  db.sqlite.close();
});

test('a photo removed from a memo is cleaned up after the grace period; deleting a memo cleans its photos',async()=>{
  const db=database(),env={DB:db};
  const photo=await upload(env),other=await upload(env);
  const a=(await call(env,{action:'create'})).id,b=(await call(env,{action:'create'})).id;
  await call(env,{action:'save',id:a,title:'a',content:withPhoto(photo)});
  await call(env,{action:'save',id:b,title:'b',content:withPhoto(other)});
  // Photo is dropped from memo a, but it is still recent: it must survive for now.
  await call(env,{action:'save',id:a,title:'a',content:'사진 없음'});
  assert.deepEqual(imageIds(db).sort(),[photo,other].sort());
  // After the grace period the next save/delete removes it.
  age(db,photo,25);age(db,other,25);
  await call(env,{action:'save',id:a,title:'a',content:'사진 없음'});
  assert.deepEqual(imageIds(db),[other]);
  // Deleting the memo that holds the last photo frees it.
  await call(env,{action:'delete',id:b});
  assert.deepEqual(imageIds(db),[]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM memo_items').get().n,1);
  db.sqlite.close();
});

test('reordering memos does not trigger photo cleanup',async()=>{
  const db=database(),env={DB:db};
  const orphan=await upload(env);age(db,orphan,48);
  const a=(await call(env,{action:'create'})).id,b=(await call(env,{action:'create'})).id;
  await call(env,{action:'reorder',folder_id:null,ids:[b,a]});
  assert.deepEqual(imageIds(db),[orphan]);
  db.sqlite.close();
});

test('a failing cleanup never breaks saving or deleting a memo',async()=>{
  const db=database(allMigrations,{failImageDelete:true}),env={DB:db};
  const a=(await call(env,{action:'create'})).id;
  assert.deepEqual(await call(env,{action:'save',id:a,title:'저장됨',content:'본문'}),{ok:true});
  assert.equal(db.sqlite.prepare('SELECT title FROM memo_items WHERE id=?').get(a).title,'저장됨');
  assert.deepEqual(await call(env,{action:'delete',id:a}),{ok:true});
  db.sqlite.close();
});

test('migration 0003 keeps existing photos and gives them a timestamp (so they also get the grace period)',async()=>{
  const db=database(['0001_calendar.sql','0002_memos.sql']);
  db.sqlite.prepare('INSERT INTO memo_images(id,mime,bytes) VALUES(?,?,?)').run('legacy-1','image/png',new Uint8Array(png));
  db.sqlite.prepare("INSERT INTO records VALUES('events',1,'{\"id\":1,\"title\":\"기존 일정\"}')").run();
  db.sqlite.exec(migration('0003_memo_image_cleanup.sql'));
  db.sqlite.exec(migration('0004_memo_order.sql'));
  const row=db.sqlite.prepare('SELECT id,length(bytes) n,created_at FROM memo_images').get();
  assert.equal(row.id,'legacy-1');assert.equal(row.n,png.length);
  assert.ok(Date.parse(row.created_at)>Date.now()-60e3,'legacy photo should get a fresh timestamp');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM records').get().n,1);
  // A legacy photo that is unused must not be removed right away.
  const env={DB:db};const a=(await call(env,{action:'create'})).id;
  await call(env,{action:'save',id:a,title:'t',content:'c'});
  assert.deepEqual(imageIds(db),['legacy-1']);
  db.sqlite.close();
});
