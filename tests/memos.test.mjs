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
 for(const name of ['0001_calendar.sql','0002_memos.sql','0003_memo_image_cleanup.sql','0004_memo_order.sql','0005_memo_attachments.sql','0006_memo_color_line.sql'])sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
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
 const w=dom.window,rows=[],calls=[];let id=0,photo=0;
 w.isOwner=true;w.confirm=()=>true;w.prompt=()=> '폴더';
 const response=data=>({ok:true,json:async()=>data});
 w.fetch=async(url,options)=>{
  if(url==='/api/private/memo-images')return response({url:'/api/private/memo-images/photo-'+(++photo)});
  if(!options?.body)return response({data:rows.map(r=>({...r}))});
  const q=JSON.parse(options.body);calls.push(q);
  if(q.action==='create'){const key='memo-'+(++id);rows.push({id:key,kind:'note',title:'',content:'',images:'[]',folder_id:q.folder_id||null});return response({id:key});}
  const item=rows.find(r=>r.id===q.id);
  if(q.action==='save')Object.assign(item,{title:q.title,content:q.content},q.images?{images:JSON.stringify(q.images)}:{});
  if(q.action==='reorder'){const pos=new Map(q.ids.map((x,i)=>[x,i]));rows.sort((p,r)=>(pos.get(p.id)??1e9)-(pos.get(r.id)??1e9));if(q.breaks)for(const r of rows)if(q.ids.includes(r.id))r.line_break=q.breaks.includes(r.id)?1:0;}
  return response({ok:true});
 };
 Object.defineProperty(w.document.getElementById('memoBoard'),'clientWidth',{value:1000});
 w.eval(fs.readFileSync(new URL('../public/memos.js',import.meta.url),'utf8'));
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,10));};
 const leave=el=>el.dispatchEvent(new w.FocusEvent('focusout',{bubbles:true,relatedTarget:null}));
 return {dom,w,rows,calls,flush,leave,$:id=>w.document.getElementById(id)};
}
test('memos are edited on their cards and saved automatically; a new memo is stored only once something is written',async()=>{
 const {dom,w,rows,calls,flush,leave,$}=await frontend();
 assert.equal($('memoModal').classList.contains('hidden'),true);
 $('newMemoButton').click();await flush();
 let draft=$('memoBoard').querySelector('.memo-card[data-draft]');
 assert.ok(draft,'a new empty card appears');assert.equal(rows.length,0,'nothing is stored yet');
 leave(draft.querySelector('.memo-body'));await flush();
 assert.equal($('memoBoard').querySelector('.memo-card[data-draft]'),null,'an untouched new memo disappears');assert.equal(rows.length,0);
 $('newMemoButton').click();await flush();
 draft=$('memoBoard').querySelector('.memo-card[data-draft]');
 const body=draft.querySelector('.memo-body');
 body.innerHTML='첫 줄<div>둘째 줄</div>';body.dispatchEvent(new w.Event('input',{bubbles:true}));
 leave(body);await flush();
 assert.equal(rows.length,1);assert.equal(rows[0].content,'첫 줄<div>둘째 줄</div>');
 assert.deepEqual(calls.map(q=>q.action),['create','save']);assert.deepEqual(calls[1].images,[]);
 const title=$('memoBoard').querySelector('.memo-card-title-input');
 title.value='제목';title.dispatchEvent(new w.Event('input',{bubbles:true}));leave(title);await flush();
 assert.equal(rows[0].title,'제목');assert.equal(rows.length,1,'later edits never create another memo');
 // Stored markup is shown safely and without photos.
 rows[0].content='<script>alert(1)</script><img src="/api/private/memo-images/x"><img src="https://evil.example/a" onerror="alert(1)"><b onclick="evil()">안전한 내용</b>';
 await w.loadMemoBoard();
 assert.equal($('memoBoard').querySelector('script'),null);assert.equal($('memoBoard').querySelector('img'),null);
 assert.equal($('memoBoard').querySelector('b').getAttribute('onclick'),null);assert.equal($('memoBoard').querySelector('b').textContent,'안전한 내용');
 assert.equal($('memoBoard').querySelector('.memo-photo-count').textContent,'사진 1장','a photo still inside old text counts as attached');
 dom.window.close();
});
test('full view shows the memo large with its attached photos (including ones from old memo text); removing one saves the list',async()=>{
 const {dom,w,rows,calls,flush,$}=await frontend();
 rows.push({id:'m',kind:'note',title:'사진 메모',content:'앞<img src="/api/private/memo-images/old-1">뒤',images:'["new-1"]',folder_id:null});
 await w.loadMemoBoard();
 $('memoBoard').querySelector('.memo-open-button').click();await flush();
 assert.equal($('memoModal').classList.contains('hidden'),false);
 assert.equal($('memoTitle').value,'사진 메모');assert.equal($('memoEditor').textContent,'앞뒤');assert.equal($('memoEditor').querySelector('img'),null);
 assert.deepEqual([...$('memoGallery').querySelectorAll('img')].map(i=>i.getAttribute('src')),['/api/private/memo-images/new-1','/api/private/memo-images/old-1']);
 $('memoGallery').querySelector('.memo-gallery-open').click();
 assert.equal($('memoLightbox').classList.contains('hidden'),false);
 $('memoLightboxClose').click();assert.equal($('memoLightbox').classList.contains('hidden'),true);
 $('memoGallery').querySelector('.memo-gallery-remove').click();await flush();
 const save=calls.filter(q=>q.action==='save').at(-1);
 assert.deepEqual(save.images,['old-1']);assert.equal(save.content,'앞뒤','photos leave the text and live in the attachment list');
 $('memoEditor').innerHTML='새 내용';$('memoEditor').dispatchEvent(new w.Event('input',{bubbles:true}));
 $('memoClose').click();await flush();
 assert.equal($('memoModal').classList.contains('hidden'),true);
 assert.equal(rows[0].content,'새 내용');
 assert.equal($('memoBoard').querySelector('.memo-body').textContent,'새 내용','the card shows what was written in full view');
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
test('memos are a plain ordered list; clicking empty space (not a card or text) starts a new memo',async()=>{
 const {dom,w,rows,flush,leave,$}=await frontend();
 rows.push({id:'a',kind:'note',title:'A',content:'',folder_id:null,x:900,y:900},{id:'b',kind:'note',title:'B',content:'',folder_id:null,x:5,y:5});
 await w.loadMemoBoard();
 for(const card of $('memoBoard').querySelectorAll('.memo-card'))assert.equal(card.style.left+card.style.top,'','cards are laid out by CSS, not by stored position');
 $('memosPage').querySelector('h1').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await flush();
 $('memoBoard').querySelector('.memo-card .memo-body').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await flush();
 assert.equal($('memoBoard').querySelector('.memo-card[data-draft]'),null,'title text and cards never start a memo');
 $('memoBoard').dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:100,clientY:70}));await flush();
 const draft=$('memoBoard').querySelector('.memo-card[data-draft]');
 assert.ok(draft);assert.equal(rows.length,2,'starting a memo stores nothing');
 leave(draft.querySelector('.memo-body'));await flush();
 assert.equal($('memoBoard').querySelectorAll('.memo-card').length,2);assert.equal(rows.length,2);
 dom.window.close();
});
test('dropping on a card edge reorders, on its middle makes a folder, below all cards starts a new row; arrow keys move one place',async()=>{
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
 // Dropping on empty space below every card moves the memo to the end, on a new row.
 calls.length=0;cardsOf().forEach((card,i)=>card.getBoundingClientRect=()=>({left:i*260,top:0,right:i*260+240,bottom:254,width:240,height:254}));
 const h2=cardsOf()[0].querySelector('.memo-drag-handle');h2.setPointerCapture=()=>{};
 h2.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:40,clientY:40,button:0}));
 h2.dispatchEvent(new w.MouseEvent('pointermove',{clientX:40,clientY:900,button:0}));
 assert.ok($('memoBoard').classList.contains('memo-drop-newline'));
 h2.dispatchEvent(new w.MouseEvent('pointerup',{clientX:40,clientY:900,button:0}));await flush();
 assert.deepEqual(calls.map(q=>[q.action,q.ids,q.breaks]),[['reorder',['c','a','b'],['b']]]);
 assert.ok(cardsOf()[2].classList.contains('memo-line-start'));
 // Keyboard: ArrowRight on the first card moves it one place later; row starts are kept.
 calls.length=0;
 cardsOf()[0].querySelector('.memo-drag-handle').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await flush();
 assert.deepEqual(calls.map(q=>[q.ids,q.breaks]),[[['a','c','b'],['b']]]);
 // Middle of another card: asks for a folder name and groups.
 calls.length=0;cardsOf().forEach((card,i)=>card.getBoundingClientRect=()=>({left:i*260,top:0,right:i*260+240,bottom:254,width:240,height:254}));
 const h3=cardsOf()[0].querySelector('.memo-drag-handle');h3.setPointerCapture=()=>{};
 h3.dispatchEvent(new w.MouseEvent('pointerdown',{clientX:40,clientY:40,button:0}));
 h3.dispatchEvent(new w.MouseEvent('pointermove',{clientX:380,clientY:40,button:0}));
 assert.ok(cardsOf()[1].classList.contains('memo-drop-target'));
 h3.dispatchEvent(new w.MouseEvent('pointerup',{clientX:380,clientY:40,button:0}));await flush();
 assert.deepEqual(calls.map(q=>[q.action,q.id,q.target,q.title]),[['group','a','c','폴더']]);
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
