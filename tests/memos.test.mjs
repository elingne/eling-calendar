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
 for(const name of ['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql','0004_memo_order.sql'])sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const statement=(sql,values=[])=>({bind(...v){return statement(sql,v);},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return sqlite.prepare(sql).run(...values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v));}});
 return {sqlite,prepare:sql=>statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const request=(body,path='/api/private/memos')=>new Request('https://calendar.example'+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://calendar.example'},body:JSON.stringify(body)}:{});
test('migration 0004 keeps the old visual order; create appends; reorder, unfold and folder dissolve persist',async()=>{
 // Start from the schema before 0004 with memos that were placed freely on the board.
 const db=database(),env={DB:db};
 const call=async body=>(await memos(request(body),env,'/api/private/memos')).json();
 const ids=()=>db.sqlite.prepare('SELECT id FROM memo_items ORDER BY sort_order,id').all().map(r=>r.id);
 db.sqlite.exec(`INSERT INTO records VALUES('quick_todos',9,'{"id":9,"title":"기존 데이터"}')`);
 const legacy=new DatabaseSync(':memory:');
 for(const name of ['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql'])legacy.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 legacy.exec(`INSERT INTO memo_items(id,kind,title,content,x,y,updated_at) VALUES('c','note','C','cc',24,300,'t'),('b','note','B','bb',280,24,'t'),('a','note','A','aa',24,24,'t')`);
 legacy.exec(`INSERT INTO memo_items(id,kind,title,folder_id,x,y,updated_at) VALUES('f','folder','폴더',NULL,24,600,'t')`);
 legacy.exec(`UPDATE memo_items SET folder_id='f',x=50,y=10 WHERE id='b'`);
 legacy.exec(`INSERT INTO memo_items(id,kind,title,folder_id,x,y,updated_at) VALUES('d','note','D','f',10,10,'t')`);
 legacy.exec(fs.readFileSync(new URL('../migrations/0004_memo_order.sql',import.meta.url),'utf8'));
 const order=legacy.prepare("SELECT id,sort_order FROM memo_items WHERE folder_id IS NULL ORDER BY sort_order").all();
 assert.deepEqual(order.map(r=>r.id),['a','c','f']);assert.deepEqual(order.map(r=>r.sort_order),[1,2,3]);
 assert.deepEqual(legacy.prepare("SELECT id FROM memo_items WHERE folder_id='f' ORDER BY sort_order").all().map(r=>r.id),['d','b']);
 assert.equal(legacy.prepare("SELECT x,y FROM memo_items WHERE id='c'").get().y,300);legacy.close();

 const a=(await call({action:'create'})).id,b=(await call({action:'create'})).id,c=(await call({action:'create'})).id;
 assert.deepEqual(ids(),[a,b,c]);
 await call({action:'save',id:a,title:'사진 메모',content:'앞<img src="/api/private/memo-images/example">뒤'});
 assert.deepEqual(ids(),[a,b,c],'saving never changes the order');
 await call({action:'reorder',folder_id:null,ids:[c,a,b]});
 assert.deepEqual((await call()).data.map(i=>i.id),[c,a,b]);
 await assert.rejects(call({action:'reorder',folder_id:null,ids:[c,a]}),/바뀌었어요/);
 await assert.rejects(call({action:'reorder',folder_id:null,ids:[c,a,a]}),/바뀌었어요/);
 await assert.rejects(call({action:'reorder',folder_id:null,ids:[c,a,'x']}),/바뀌었어요/);
 await assert.rejects(call({action:'reorder',folder_id:'nope',ids:[]}),/폴더/);
 assert.deepEqual(ids(),[c,a,b]);
 await assert.rejects(call({action:'move',id:a,x:1,y:2}),/Unknown action/);
 await assert.rejects(call({action:'group',id:a,target:a,title:'실패'}),/grouping/);

 // Dropping a note on another note makes a folder in the dropped-on note's place.
 const extra=(await call({action:'create'})).id,inner1=(await call({action:'create'})).id;
 await call({action:'group',id:extra,target:a,title:'폴더'});
 const folder=db.sqlite.prepare("SELECT id FROM memo_items WHERE kind='folder'").get().id;
 assert.deepEqual(ids().filter(id=>![extra].includes(id)).slice(0,1),[c]);
 assert.deepEqual(db.sqlite.prepare("SELECT id FROM memo_items WHERE folder_id IS NULL ORDER BY sort_order").all().map(r=>r.id),[c,folder,b,inner1]);
 assert.deepEqual(db.sqlite.prepare('SELECT id FROM memo_items WHERE folder_id=? ORDER BY sort_order').all(folder).map(r=>r.id),[a,extra]);
 // Dropping a note on a folder adds it at the end of that folder.
 await call({action:'group',id:inner1,target:folder,title:'폴더'});
 const inner2=a;
 assert.deepEqual(db.sqlite.prepare('SELECT id FROM memo_items WHERE folder_id=? ORDER BY sort_order').all(folder).map(r=>r.id),[a,extra,inner1]);
 await call({action:'reorder',folder_id:folder,ids:[inner1,a,extra]});
 await assert.rejects(call({action:'reorder',folder_id:folder,ids:[inner1]}),/바뀌었어요/);
 await call({action:'unfold',id:extra});
 assert.equal(db.sqlite.prepare('SELECT folder_id FROM memo_items WHERE id=?').get(extra).folder_id,null);
 assert.equal(db.sqlite.prepare('SELECT id FROM memo_items WHERE folder_id IS NULL ORDER BY sort_order DESC LIMIT 1').get().id,extra);
 await call({action:'save',id:folder,title:'바꾼 이름',content:''});
 await call({action:'delete',id:folder});
 const items=(await call()).data;assert.equal(items.length,5);assert.ok(items.every(i=>i.folder_id===null));
 assert.deepEqual(items.slice(-2).map(i=>i.id),[inner1,inner2],'dissolved folder memos go to the end in order');
 assert.equal(new Set(items.map(i=>i.sort_order)).size,items.length,'no ties in order');
 assert.match(items.find(i=>i.id===a).content,/앞<img.*뒤/);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM records').get().n,1);
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
  if(q.action==='create'){const key='memo-'+(++id);rows.push({id:key,kind:'note',title:'',content:'',folder_id:q.folder_id||null});return response({id:key});}
  const item=rows.find(r=>r.id===q.id);if(q.action==='save')Object.assign(item,{title:q.title,content:q.content});
  if(q.action==='reorder'){const pos=new Map(q.ids.map((x,i)=>[x,i]));rows.sort((p,r)=>(pos.get(p.id)??1e9)-(pos.get(r.id)??1e9));}
  return response({ok:true});
 };
 Object.defineProperty(w.document.getElementById('memoBoard'),'clientWidth',{value:1000});
 w.eval(fs.readFileSync(new URL('../public/memos.js',import.meta.url),'utf8'));
 const flush=async()=>{await new Promise(r=>setTimeout(r,15));};
 return {dom,w,rows,calls,flush,$:id=>w.document.getElementById(id)};
}
test('new memo button creation, safe previews, text paste at cursor, image drop at cursor, save and reload',async()=>{
 const {dom,w,rows,calls,flush,$}=await frontend();
 $('newMemoButton').click();await flush();
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
test('memos are a plain ordered list; clicking empty space (not a card or text) adds a memo',async()=>{
 const {dom,w,rows,calls,flush,$}=await frontend();
 rows.push({id:'a',kind:'note',title:'A',content:'',folder_id:null,x:900,y:900},{id:'b',kind:'note',title:'B',content:'',folder_id:null,x:5,y:5});
 await w.loadMemoBoard();
 for(const card of $('memoBoard').querySelectorAll('.memo-card'))assert.equal(card.style.left+card.style.top,'','cards are laid out by CSS, not by stored position');
 $('memosPage').querySelector('h1').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await flush();
 $('memoBoard').querySelector('.memo-card .memo-preview').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await flush();
 assert.equal(rows.length,2,'title text and cards never create a memo');
 w.document.getElementById('memoClose').click();await flush();
 $('memoBoard').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:100,clientY:70}));await flush();
 assert.equal(rows.length,3);assert.equal($('memoModal').classList.contains('hidden'),false);
 dom.window.close();
});
test('photo size and alignment are kept, everything else on an image is dropped',async()=>{
 const {dom,w,rows,$}=await frontend();
 rows.push({id:'p',kind:'note',title:'P',content:'<img src="/api/private/memo-images/a" data-width="40" data-align="center" style="position:fixed" onerror="x()"><img src="/api/private/memo-images/b" data-width="900" data-align="evil">',folder_id:null});
 await w.loadMemoBoard();
 const [a,b]=$('memoBoard').querySelectorAll('img');
 assert.equal(a.dataset.width,'40');assert.equal(a.dataset.align,'center');assert.equal(a.getAttribute('style'),'width: 40%;');assert.equal(a.getAttribute('onerror'),null);
 assert.equal(b.dataset.width,undefined);assert.equal(b.dataset.align,undefined);assert.ok(!b.getAttribute('style'));
 dom.window.close();
});
test('dropping on a card edge reorders, on its middle makes a folder; arrow keys move one place',async()=>{
 const {dom,w,rows,calls,flush,$}=await frontend();
 rows.push(...['a','b','c'].map(id=>({id,kind:'note',title:id.toUpperCase(),content:'',folder_id:null})));
 await w.loadMemoBoard();
 const cardsOf=()=>[...$('memoBoard').querySelectorAll('.memo-card')];
 cardsOf().forEach((card,i)=>card.getBoundingClientRect=()=>({left:i*260,top:0,right:i*260+240,bottom:254,width:240,height:254}));
 const handle=cardsOf()[0].querySelector('.memo-drag-handle');handle.setPointerCapture=()=>{};
 handle.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:40,clientY:40,button:0}));
 handle.dispatchEvent(new w.MouseEvent('pointermove',{clientX:750,clientY:40,button:0}));   // right edge of the third card
 assert.ok(cardsOf()[2].classList.contains('memo-drop-after'));
 handle.dispatchEvent(new w.MouseEvent('pointerup',{clientX:750,clientY:40,button:0}));await flush();
 assert.deepEqual(calls.filter(q=>q.action==='reorder').map(q=>q.ids),[['b','c','a']]);
 assert.deepEqual(cardsOf().map(c=>c.dataset.memoId),['b','c','a']);
 assert.ok(calls.every(q=>q.action==='reorder'),'an edge drop never groups');
 // Dropping on empty space changes nothing.
 calls.length=0;
 const h2=cardsOf()[0].querySelector('.memo-drag-handle');h2.setPointerCapture=()=>{};
 h2.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:40,clientY:40,button:0}));
 h2.dispatchEvent(new w.MouseEvent('pointermove',{clientX:40,clientY:900,button:0}));
 h2.dispatchEvent(new w.MouseEvent('pointerup',{clientX:40,clientY:900,button:0}));await flush();
 assert.equal(calls.length,0);
 // Keyboard: ArrowRight on the first card moves it one place later.
 cardsOf()[0].querySelector('.memo-drag-handle').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await flush();
 assert.deepEqual(calls.filter(q=>q.action==='reorder').map(q=>q.ids),[['c','b','a']]);
 // Middle of another card: asks for a folder name and groups.
 calls.length=0;cardsOf().forEach((card,i)=>card.getBoundingClientRect=()=>({left:i*260,top:0,right:i*260+240,bottom:254,width:240,height:254}));
 const h3=cardsOf()[0].querySelector('.memo-drag-handle');h3.setPointerCapture=()=>{};
 h3.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:40,clientY:40,button:0}));
 h3.dispatchEvent(new w.MouseEvent('pointermove',{clientX:380,clientY:40,button:0}));
 assert.ok(cardsOf()[1].classList.contains('memo-drop-target'));
 h3.dispatchEvent(new w.MouseEvent('pointerup',{clientX:380,clientY:40,button:0}));await flush();
 assert.deepEqual(calls.map(q=>[q.action,q.id,q.target,q.title]),[['group','c','b','폴더']]);
 dom.window.close();
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
