import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
import {memos} from '../src/memos.js';
import worker from '../src/worker.js';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql'])sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const statement=(sql,values=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return sqlite.prepare(sql).run(...values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v));}});
 return {sqlite,prepare:sql=>statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const request=(body,path='/api/private/memos')=>new Request('https://calendar.example'+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://calendar.example'},body:JSON.stringify(body)}:{});
test('migration preserves records; memo grouping, rename, extraction and folder dissolve persist',async()=>{
 const db=database();const env={DB:db};
 db.sqlite.exec(`INSERT INTO records VALUES('quick_todos',9,'{"id":9,"title":"기존 데이터"}')`);
 const call=async body=>(await memos(request(body),env,'/api/private/memos')).json();
 const a=(await call({action:'create',x:24,y:40})).id,b=(await call({action:'create',x:280,y:40})).id;
 await call({action:'save',id:a,title:'사진 메모',content:'앞<img src="/api/private/memo-images/example">뒤'});
 await call({action:'group',id:a,target:b,title:'아이디어'});
 let items=(await call()).data,folder=items.find(i=>i.kind==='folder');
 assert.equal(items.filter(i=>i.folder_id===folder.id).length,2);
 await call({action:'save',id:folder.id,title:'바꾼 이름',content:''});
 await call({action:'move',id:a,x:40,y:80,folder_id:null});
 assert.equal((await call()).data.find(i=>i.id===a).folder_id,null);
 await call({action:'group',id:a,target:folder.id,title:'바꾼 이름'});
 await call({action:'delete',id:folder.id});
 items=(await call()).data;assert.equal(items.length,2);assert.ok(items.every(i=>i.folder_id===null));
 assert.match(items.find(i=>i.id===a).content,/앞<img.*뒤/);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM records').get().n,1);
 await assert.rejects(call({action:'move',id:a,x:-1,y:20}),/position/);
 await assert.rejects(call({action:'group',id:a,target:a,title:'실패'}));
 await assert.rejects(call({action:'save',id:a,title:'x'.repeat(121),content:''}));
 db.sqlite.close();
});
test('memo photos round-trip and reject unsafe formats; all memo routes require login',async()=>{
 const db=database(),env={DB:db};const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
 const upload=new Request('https://calendar.example/api/private/memo-images',{method:'POST',headers:{'Content-Type':'image/png'},body:png});
 const {url}=await(await memos(upload,env,'/api/private/memo-images')).json();
 const photo=await memos(new Request('https://calendar.example'+url),env,url);
 assert.equal(photo.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),png);
 const invalid=new Request('https://calendar.example/api/private/memo-images',{method:'POST',headers:{'Content-Type':'image/png'},body:'<script>evil</script>'});
 await assert.rejects(memos(invalid,env,'/api/private/memo-images'));
 for(const path of ['/api/private/memos','/api/private/memo-images',url])assert.equal((await worker.fetch(request(null,path),env)).status,401);
 db.sqlite.close();
});

async function frontend(){
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://calendar.example',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,rows=[],calls=[];let id=0;
 w.isOwner=true;w.confirm=()=>true;w.prompt=()=> '폴더';
 const response=data=>({ok:true,json:async()=>data});
 w.fetch=async(url,options)=>{
  if(url==='/api/private/memo-images')return response({url:'/api/private/memo-images/photo-1'});
  if(!options?.body)return response({data:rows.map(r=>({...r}))});
  const q=JSON.parse(options.body);calls.push(q);
  if(q.action==='create'){const key='memo-'+(++id);rows.push({id:key,kind:'note',title:'',content:'',folder_id:q.folder_id||null,x:q.x,y:q.y});return response({id:key});}
  const item=rows.find(r=>r.id===q.id);if(q.action==='save')Object.assign(item,{title:q.title,content:q.content});
  if(q.action==='move')Object.assign(item,{folder_id:q.folder_id,x:q.x,y:q.y});
  return response({ok:true});
 };
 Object.defineProperty(w.document.getElementById('memoBoard'),'clientWidth',{value:1000});
 w.eval(fs.readFileSync(new URL('../public/memos.js',import.meta.url),'utf8'));
 const flush=async()=>{await new Promise(r=>setTimeout(r,15));};
 return {dom,w,rows,calls,flush,$:id=>w.document.getElementById(id)};
}
test('blank-board creation, safe previews, text paste at cursor, image drop at cursor, save and reload',async()=>{
 const {dom,w,rows,calls,flush,$}=await frontend();
 $('memoBoard').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:100,clientY:70}));await flush();
 assert.equal(rows.length,1);assert.equal($('memoModal').classList.contains('hidden'),false);
 $('memoTitle').value='내 메모';const editor=$('memoEditor');editor.textContent='앞뒤';
 const range=w.document.createRange();range.setStart(editor.firstChild,1);range.collapse(true);w.getSelection().removeAllRanges();w.getSelection().addRange(range);editor.dispatchEvent(new w.Event('keyup'));
 const paste=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{files:[],getData:()=>'<script>문자 그대로</script>'}});editor.dispatchEvent(paste);
 assert.equal(editor.textContent,'앞<script>문자 그대로</script>뒤');assert.equal(editor.querySelector('script'),null);
 const r=w.document.createRange();r.setStart(editor.firstChild,1);r.collapse(true);w.document.caretRangeFromPoint=()=>r;
 const drop=new w.MouseEvent('drop',{bubbles:true,cancelable:true,clientX:10,clientY:10});Object.defineProperty(drop,'dataTransfer',{value:{files:[new w.File(['image'],'a.png',{type:'image/png'})]}});editor.dispatchEvent(drop);await flush();
 assert.ok(editor.querySelector('img'));assert.equal(editor.firstChild.textContent,'앞');
 $('memoSave').click();await flush();assert.equal($('memoModal').classList.contains('hidden'),true);
 assert.match(rows[0].content,/memo-images\/photo-1/);assert.ok(calls.some(q=>q.action==='save'));
 rows[0].content='<script>alert(1)</script><img src="https://evil.example/a" onerror="alert(1)"><b onclick="evil()">안전한 내용</b>';
 await w.loadMemoBoard();assert.equal($('memoBoard').querySelector('script'),null);assert.equal($('memoBoard').querySelector('img'),null);assert.equal($('memoBoard').querySelector('b').getAttribute('onclick'),null);
 dom.window.close();
});
test('completed list input adds a completed item immediately and blocks double submission',async()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
 const calls=[];w.isOwner=true;w.selectedRecordDate=null;w.$=id=>w.document.getElementById(id);w.loadQuickTodos=async()=>{};w.loadDayTodos=async()=>{};
 w.dbClient={from:table=>({insert:async values=>{calls.push({table,values});await new Promise(r=>setTimeout(r,5));return {error:null};}})};
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');w.eval(app.slice(app.indexOf('$("scheduleTopButton").addEventListener')));
 const input=w.document.getElementById('completedTodoInput');input.value='이미 한 일';const form=w.document.getElementById('completedTodoForm');
 form.dispatchEvent(new w.Event('submit',{cancelable:true}));form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert.equal(calls.length,1);assert.equal(calls[0].values.is_completed,true);assert.ok(Date.parse(calls[0].values.completed_at));assert.equal(input.value,'');dom.window.close();
});
test('dragging a note over another card requests a named folder',async()=>{
 const {dom,w,rows,calls,flush,$}=await frontend();
 rows.push({id:'a',kind:'note',title:'A',content:'',folder_id:null,x:24,y:24},{id:'b',kind:'note',title:'B',content:'',folder_id:null,x:300,y:24});
 await w.loadMemoBoard();
 for(const card of $('memoBoard').querySelectorAll('.memo-card'))card.getBoundingClientRect=()=>({left:parseFloat(card.style.left),top:parseFloat(card.style.top),right:parseFloat(card.style.left)+240,bottom:parseFloat(card.style.top)+254,width:240,height:254});
 const handle=$('memoBoard').querySelector('.memo-drag-handle');handle.setPointerCapture=()=>{};
 handle.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:40,clientY:40,button:0}));
 handle.dispatchEvent(new w.MouseEvent('pointermove',{clientX:316,clientY:40,button:0}));
 assert.ok($('memoBoard').querySelector('.memo-drop-target'));
 handle.dispatchEvent(new w.MouseEvent('pointerup',{clientX:316,clientY:40,button:0}));await flush();
 assert.ok(calls.some(q=>q.action==='group'&&q.id==='a'&&q.target==='b'&&q.title==='폴더'));dom.window.close();
});
test('all frontend scripts initialize for both public visitors and owners returning to memo tab',async()=>{
 for(const role of [false,true]){
  const dom=new JSDOM(fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:'https://calendar.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.localStorage.setItem('eling-calendar:last-page','memos');
  w.fetch=async url=>({ok:true,json:async()=>url==='/api/session'?{owner:role}:{data:[],error:null}});
  for(const file of ['api.js','app.js','memos.js'])vm.runInContext(fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),dom.getInternalVMContext());
  await new Promise(r=>setTimeout(r,25));
  assert.equal(w.document.getElementById('connectionMessage').textContent,'');
  assert.equal(w.document.getElementById('memosPage').classList.contains('hidden'),!role);
  assert.equal(w.document.querySelector('[data-page="memos"]').classList.contains('hidden'),!role);
  dom.window.close();
 }
});
