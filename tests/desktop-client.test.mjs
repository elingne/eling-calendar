import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/desktop.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// 아주 작은 가짜 DOM: desktop.js 가 쓰는 만큼만 흉내 낸다.
function element(tag){
 const classes=new Set(),handlers={};
 const self={
  tagName:tag.toUpperCase(),children:[],attributes:{},title:'',innerHTML:'',textContent:'',type:'',id:'',
  classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){(on===undefined?!classes.has(c):on)?classes.add(c):classes.delete(c);}},
  set className(value){classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));},
  get className(){return [...classes].join(' ');},
  append(...nodes){for(const node of nodes){node.parent?.children.splice(node.parent.children.indexOf(node),1);node.parent=self;self.children.push(node);}},
  prepend(...nodes){self.append(...nodes);self.children.unshift(self.children.pop());},
  setAttribute(name,value){self.attributes[name]=String(value);},
  addEventListener(type,fn){(handlers[type]??=[]).push(fn);},
  closest(selector){return selector==='button'&&self.tagName==='BUTTON'?self:null;},
  fire(type,event={}){for(const fn of handlers[type]||[])fn({button:0,target:self,...event});},
  parent:null
 };
 return self;
}
function setup({bridge=true,state={mode:'full',pinned:false},failCommands=[]}={}){
 const body=element('body'),headerActions=element('div'),calls=[],navClicks=[],headers=[element('div'),element('div')];
 body.dataset={};
 const html={classList:element('html').classList};
 const document={documentElement:html,body,createElement:element,querySelector:selector=>{
  if(selector==='.header-actions')return headerActions;
  const page=/data-page="(\w+)"/.exec(selector)?.[1];
  return page?{click:()=>navClicks.push(page)}:null;
 },querySelectorAll:()=>headers};
 const location={href:'/'};
 const window={location};
 let current={...state};
 if(bridge)window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
  calls.push(JSON.parse(JSON.stringify([command,args])));   // vm 안에서 만든 객체는 프로토타입이 달라 그대로는 deepEqual 이 실패한다
  if(failCommands.includes(command))throw new Error('not allowed');
  if(command==='set_mode')current={...current,mode:args.mode};
  if(command==='set_pinned')current={...current,pinned:args.pinned};
  return ['get_state','set_mode','set_pinned'].includes(command)?current:null;
 }};
 const context=vm.createContext({window,document,location,Promise,String,Boolean});
 vm.runInContext(source,context);
 const find=cls=>(function walk(node){if(node.classList.contains(cls))return node;for(const child of node.children){const hit=walk(child);if(hit)return hit;}return null;})(body)||(function walk(node){if(node.classList.contains(cls))return node;for(const child of node.children){const hit=walk(child);if(hit)return hit;}return null;})(headerActions);
 return {window,document,body,headerActions,calls,location,find,html,navClicks,headers};
}

test('in a normal browser nothing is changed or requested',async()=>{
 const {body,html,calls}=setup({bridge:false});
 await settle();
 assert.equal(html.classList.contains('is-desktop-app'),false);
 assert.equal(body.children.length,0);
 assert.deepEqual(calls,[]);
});

test('if the app refuses the commands the page stays a plain website',async()=>{
 const {body,html}=setup({failCommands:['get_state']});
 await settle();
 assert.equal(html.classList.contains('is-desktop-app'),false);
 assert.equal(body.children.length,0);
});

test('full mode puts the buttons in the header, widget mode moves them to the top bar',async()=>{
 const app=setup({state:{mode:'full',pinned:true}});
 await settle();
 assert.ok(app.html.classList.contains('is-desktop-app'));
 assert.equal(app.body.classList.contains('desktop-widget'),false);
 const controls=app.find('desktop-controls');
 assert.equal(controls.parent,app.headerActions);
 const pin=app.find('desktop-pin');
 assert.equal(pin.classList.contains('active'),true);
 assert.equal(pin.attributes['aria-pressed'],'true');
 assert.equal(pin.attributes['aria-label'],'항상 위에 두기 해제');

 assert.equal(pin.hidden,true,'항상 위는 위젯에서만 켜지므로 전체 화면에서는 핀 버튼을 숨긴다');
 app.window.__elingDesktopState({mode:'widget',pinned:false});     // 트레이 메뉴 등 앱 쪽에서 바뀐 경우
 assert.equal(pin.hidden,false);
 assert.ok(app.body.classList.contains('desktop-widget'));
 assert.equal(controls.parent.id,'desktopBar');
 assert.equal(pin.classList.contains('active'),false);
 assert.equal(app.find('desktop-mode').attributes['aria-label'],'전체 화면으로 넓히기');
 app.window.__elingDesktopState({mode:'bogus'});                    // 이상한 값은 무시
 assert.ok(app.body.classList.contains('desktop-widget'));
});

test('each button sends exactly one allowed command with the right arguments',async()=>{
 const app=setup({state:{mode:'full',pinned:false}});
 await settle();
 app.calls.length=0;
 app.find('desktop-pin').fire('click');await settle();
 assert.deepEqual(app.calls,[['set_pinned',{pinned:true}]]);
 assert.equal(app.find('desktop-pin').classList.contains('active'),true,'앱이 알려준 새 상태가 바로 반영된다');

 app.calls.length=0;
 app.find('desktop-mode').fire('click');await settle();
 assert.deepEqual(app.calls,[['set_mode',{mode:'widget'}]]);
 assert.ok(app.body.classList.contains('desktop-widget'));

 app.calls.length=0;
 app.find('desktop-mode').fire('click');await settle();
 assert.deepEqual(app.calls,[['set_mode',{mode:'full'}]]);
 assert.equal(app.body.classList.contains('desktop-widget'),false);

 app.calls.length=0;
 app.find('desktop-hide').fire('click');await settle();
 assert.deepEqual(app.calls,[['hide_window',{}]]);
});

test('the widget bar drags the window, double-click widens it, buttons do not start a drag',async()=>{
 const app=setup({state:{mode:'widget',pinned:true}});
 await settle();
 const bar=app.find('desktop-bar');
 app.calls.length=0;
 bar.fire('mousedown');
 bar.fire('mousedown',{button:2});
 bar.fire('mousedown',{target:app.find('desktop-pin')});
 await settle();
 assert.deepEqual(app.calls.map(c=>c[0]),['start_drag']);
 app.calls.length=0;
 bar.fire('dblclick');await settle();
 assert.deepEqual(app.calls,[['set_mode',{mode:'full'}]]);
});

test('the login hint widens the window, then goes to the admin login',async()=>{
 const app=setup({state:{mode:'widget',pinned:true}});
 await settle();
 app.calls.length=0;
 app.find('desktop-login-hint').children[1].fire('click');
 await settle();
 assert.deepEqual(app.calls,[['set_mode',{mode:'full'}]]);
 assert.equal(app.location.href,'/admin');
});

test('widget tabs: the swap button flips calendar/memos through the site menu, the todo switch flips now/done',async()=>{
 const app=setup({state:{mode:'widget',pinned:false}});
 await settle();
 const swap=app.find('desktop-view');
 assert.equal(swap.attributes['aria-label'],'메모 보기');
 assert.equal(swap.hidden,false);
 app.navClicks.length=0;
 swap.fire('click');
 assert.deepEqual(app.navClicks,['memos']);
 assert.equal(swap.attributes['aria-label'],'캘린더 보기');
 swap.fire('click');
 assert.deepEqual(app.navClicks,['memos','calendar']);

 assert.equal(app.body.dataset.widgetTodo,'now');
 const toggle=app.headers[0].children[0];
 assert.equal(toggle.textContent,'완료한 일 ›');
 toggle.fire('click');
 assert.equal(app.body.dataset.widgetTodo,'done');
 assert.equal(toggle.textContent,'‹ 지금 할 일');
 assert.equal(app.headers[1].children[0].textContent,'‹ 지금 할 일');

 app.window.__elingDesktopState({mode:'full',pinned:false});      // 전체 화면에서는 전환 버튼을 숨기고 사이트 메뉴를 건드리지 않는다
 assert.equal(swap.hidden,true);
 app.navClicks.length=0;
 app.window.__elingDesktopState({mode:'full',pinned:true});
 assert.deepEqual(app.navClicks,[]);
});
