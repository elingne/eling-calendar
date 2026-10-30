import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memos} from '../src/memos.js';

const migration=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
const allMigrations=['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql','0004_memo_order.sql','0005_memo_attachments.sql','0006_memo_color_line.sql','0007_memo_grid.sql'];
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
  db.sqlite.exec(migration('0005_memo_attachments.sql'));
  db.sqlite.exec(migration('0006_memo_color_line.sql'));
  db.sqlite.exec(migration('0007_memo_grid.sql'));
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

test('photos attached to a memo (not in its text) are kept; removing them from the list frees them',async()=>{
  const db=database(),env={DB:db};
  const kept=await upload(env),dropped=await upload(env);
  const a=(await call(env,{action:'create'})).id;
  await call(env,{action:'save',id:a,title:'첨부',content:'글만',images:[kept,dropped]});
  assert.deepEqual(JSON.parse(db.sqlite.prepare('SELECT images FROM memo_items WHERE id=?').get(a).images),[kept,dropped]);
  age(db,kept,48);age(db,dropped,48);
  await call(env,{action:'save',id:a,title:'첨부',content:'글만',images:[kept,dropped]});
  assert.deepEqual(imageIds(db).sort(),[kept,dropped].sort());
  await call(env,{action:'save',id:a,title:'첨부',content:'글만',images:[kept]});
  assert.deepEqual(imageIds(db),[kept]);
  // Saving without an images field (e.g. a folder rename) leaves the list as it is.
  await call(env,{action:'save',id:a,title:'새 제목',content:'글만'});
  assert.deepEqual(JSON.parse(db.sqlite.prepare('SELECT images FROM memo_items WHERE id=?').get(a).images),[kept]);
  for(const bad of [['../x'],[kept,kept],'x',Array(61).fill(0).map((_,i)=>'id'+i)])
    await assert.rejects(call(env,{action:'save',id:a,title:'t',content:'c',images:bad}));
  db.sqlite.close();
});

test('memo colour and "start a new row" are saved and validated; reorder can set row starts',async()=>{
  const db=database(),env={DB:db};
  const a=(await call(env,{action:'create'})).id,b=(await call(env,{action:'create'})).id;
  await call(env,{action:'save',id:a,title:'a',content:'',images:[],color:'green',line_break:true});
  let row=db.sqlite.prepare('SELECT color,line_break FROM memo_items WHERE id=?').get(a);
  assert.equal(row.color,'green');assert.equal(row.line_break,1);
  await call(env,{action:'save',id:a,title:'a2',content:''});           // fields left out stay as they are
  row=db.sqlite.prepare('SELECT title,color,line_break FROM memo_items WHERE id=?').get(a);
  assert.deepEqual({...row},{title:'a2',color:'green',line_break:1});
  for(const bad of [{color:'black'},{color:5},{line_break:'yes'}])
    await assert.rejects(call(env,{action:'save',id:a,title:'t',content:'',...bad}));
  await call(env,{action:'reorder',folder_id:null,ids:[b,a],breaks:[b]});
  assert.deepEqual(db.sqlite.prepare('SELECT id,line_break FROM memo_items ORDER BY sort_order').all().map(r=>[r.id,r.line_break]),[[b,1],[a,0]]);
  await call(env,{action:'reorder',folder_id:null,ids:[a,b]});          // without breaks the flags stay
  assert.deepEqual(db.sqlite.prepare('SELECT id,line_break FROM memo_items ORDER BY sort_order').all().map(r=>[r.id,r.line_break]),[[a,0],[b,1]]);
  await assert.rejects(call(env,{action:'reorder',folder_id:null,ids:[a,b],breaks:['other']}));
  db.sqlite.close();
});

test('grid layout: cells are stored per memo, empty cells allowed, validated; folders keep the dropped-on cell',async()=>{
  const db=database(),env={DB:db};
  const a=(await call(env,{action:'create'})).id,b=(await call(env,{action:'create',cell:[1,2]})).id,c=(await call(env,{action:'create'})).id;
  assert.deepEqual({...db.sqlite.prepare('SELECT grid_row r,grid_col c FROM memo_items WHERE id=?').get(b)},{r:1,c:2});
  await call(env,{action:'layout',folder_id:null,cells:[[a,0,0],[b,2,3],[c,1,0]]});   // row 0 has just one memo
  const cells=()=>db.sqlite.prepare('SELECT id,grid_row r,grid_col c FROM memo_items WHERE folder_id IS NULL ORDER BY sort_order').all().map(x=>[x.id,x.r,x.c]);
  assert.deepEqual(cells(),[[a,0,0],[c,1,0],[b,2,3]],'sort order follows reading order');
  for(const bad of [[[a,0,0],[b,0,0],[c,1,0]],[[a,0,0],[b,1,1]],[[a,-1,0],[b,1,1],[c,2,2]],[[a,0,5000],[b,1,1],[c,2,2]],[[a,0.5,0],[b,1,1],[c,2,2]]])
    await assert.rejects(call(env,{action:'layout',folder_id:null,cells:bad}));
  await assert.rejects(call(env,{action:'create',cell:[0,'x']}));
  await call(env,{action:'group',id:a,target:b,title:'폴더'});
  const folder=db.sqlite.prepare("SELECT id,grid_row r,grid_col c FROM memo_items WHERE kind='folder'").get();
  assert.deepEqual([folder.r,folder.c],[2,3]);
  assert.ok(db.sqlite.prepare('SELECT grid_row FROM memo_items WHERE folder_id=?').all(folder.id).every(x=>x.grid_row===null));
  await call(env,{action:'unfold',id:a});
  assert.equal(db.sqlite.prepare('SELECT grid_row FROM memo_items WHERE id=?').get(a).grid_row,null);
  db.sqlite.close();
});
