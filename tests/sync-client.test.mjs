import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/sync.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// 가짜 서버와 브라우저를 만들어 sync.js 를 실제로 실행한다.
function setup({owner=true,hidden=false}={}){
 const server={version:0,syncCalls:0,fail:false};
 const events=[],listeners={doc:{},win:{}};
 const header=version=>({get:name=>name==='X-Sync-Version'&&version!==null?String(version):null});
 const context=vm.createContext({
  document:{hidden,activeElement:null,addEventListener(type,fn){(listeners.doc[type]??=[]).push(fn);}},
  CustomEvent:class{constructor(type){this.type=type;}},
  setInterval(fn){context.tick=fn;return 1;},
  Number,String,Boolean,JSON,Promise
 });
 context.window=context;
 context.addEventListener=(type,fn)=>{(listeners.win[type]??=[]).push(fn);};
 context.dispatchEvent=event=>{events.push(event.type);};
 context.fetch=async(url,options={})=>{
  if(url==='/api/private/sync'){
   server.syncCalls++;
   if(server.fail)throw new TypeError('Failed to fetch');
   return {ok:true,headers:header(null),json:async()=>({data:{version:server.version}})};
  }
  // 저장 요청: 서버 번호가 1 올라가고 응답 헤더에 새 번호가 실린다.
  server.version++;
  return {ok:true,headers:header(server.version),json:async()=>({})};
 };
 vm.runInContext(`var isOwner=${owner}; var scheduleTouchDragging=false;`,context);
 vm.runInContext(source,context);
 const fire=(where,type)=>{for(const fn of listeners[where][type]||[])fn({});};
 return {context,server,events,fire,check:()=>context.calendarSync.check(),own:()=>context.fetch('/api/private/query',{method:'POST'})};
}

test('the first number only becomes the baseline; nothing reloads',async()=>{
 const {check,events,server}=setup();
 server.version=5;
 await check();await check();
 assert.deepEqual(events,[]);
});

test('the baseline is taken as soon as the login check finishes, so a change in the first seconds is not missed',async()=>{
 const {events,server,fire,context}=setup();
 fire('win','calendar-session');await settle();
 assert.equal(server.syncCalls,1);
 server.version++;                         // 첫 20초 안에 다른 곳에서 저장
 await context.calendarSync.check();
 assert.deepEqual(events,['calendar-remote-change']);
});

test('a change made elsewhere reloads the screen exactly once',async()=>{
 const {check,events,server}=setup();
 await check();
 server.version++;
 await check();
 assert.deepEqual(events,['calendar-remote-change']);
 await check();await check();
 assert.equal(events.length,1,'바뀐 게 없으면 다시 불러오지 않는다');
 server.version++;await check();
 assert.equal(events.length,2);
});

test('my own save does not reload the screen I am looking at',async()=>{
 const {check,events,own}=setup();
 await check();
 await own();await own();                 // 연속 저장
 await check();
 assert.deepEqual(events,[]);
});

test('a save by another device in between is still noticed',async()=>{
 const {check,events,own,server}=setup();
 await check();
 server.version++;                         // 다른 기기의 저장 (번호 1)
 await own();                              // 내 저장 (번호 2): 내 것 하나만 올라간 게 아니다
 await check();
 assert.deepEqual(events,['calendar-remote-change']);
});

test('while I am typing the reload waits, and runs once I am done',async()=>{
 const {check,events,server,context}=setup();
 await check();
 context.document.activeElement={tagName:'TEXTAREA',id:'memoBody'};
 server.version++;
 await check();
 assert.deepEqual(events,[],'글을 쓰는 중에는 목록을 새로 그리지 않는다');
 context.tick();await settle();
 assert.deepEqual(events,[]);
 context.document.activeElement=null;
 context.tick();await settle();
 assert.deepEqual(events,['calendar-remote-change']);
});

test('inline editing of a text, number or date field also waits; checkboxes and the quick-add box do not',async()=>{
 for(const [active,waits] of [
  [{tagName:'INPUT',type:'text',id:'dayTodoInput'},true],
  [{tagName:'INPUT',type:'date',id:'eventStartInput'},true],
  [{tagName:'DIV',isContentEditable:true,id:'memoEditor'},true],
  [{tagName:'INPUT',type:'checkbox',id:'x'},false],
  [{tagName:'BUTTON',id:'logoutButton'},false],
  [{tagName:'INPUT',type:'text',id:'quickTodoInput'},false],
  [{tagName:'TEXTAREA',id:'weekMemoText'},false]
 ]){
  const {check,events,server,context}=setup();
  await check();
  context.document.activeElement=active;
  server.version++;
  await check();
  assert.equal(events.length,waits?0:1,JSON.stringify(active));
 }
});

test('dragging an item waits until the drop',async()=>{
 const {check,events,server,fire,context}=setup();
 await check();
 fire('doc','dragstart');
 server.version++;await check();
 assert.deepEqual(events,[]);
 fire('doc','dragend');
 context.tick();await settle();
 assert.deepEqual(events,['calendar-remote-change']);
 // 터치로 끌어 옮기는 중에도 기다린다
 vm.runInContext('scheduleTouchDragging=true',context);
 server.version++;await check();
 assert.equal(events.length,1);
 vm.runInContext('scheduleTouchDragging=false',context);
 context.tick();await settle();
 assert.equal(events.length,2);
});

test('nothing is requested for visitors or while the window is hidden; coming back checks at once',async()=>{
 const visitor=setup({owner:false});
 await visitor.check();
 assert.equal(visitor.server.syncCalls,0,'방문자는 관리자 API를 부르지 않는다');

 const hidden=setup({hidden:true});
 await hidden.check();
 assert.equal(hidden.server.syncCalls,0);
 hidden.context.document.hidden=false;
 hidden.fire('doc','visibilitychange');await settle();
 assert.equal(hidden.server.syncCalls,1);
});

test('network or login failures are silent and syncing resumes afterwards',async()=>{
 const {check,events,server}=setup();
 await check();
 server.fail=true;server.version++;
 await check();await check();
 assert.deepEqual(events,[]);
 server.fail=false;
 await check();
 assert.deepEqual(events,['calendar-remote-change'],'연결이 돌아오면 놓친 변경을 따라잡는다');
});
