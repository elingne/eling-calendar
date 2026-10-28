import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(from,to)=>{const start=app.indexOf(from),end=app.indexOf(to,start);assert.ok(start>=0&&end>start,'marker not found: '+from);return app.slice(start,end);};
const MOODS=[{value:'happy',label:'기쁨'},{value:'neutral',label:'보통'},{value:'bad',label:'나쁨'}];

function setup(tables) {
  const searchResults={innerHTML:'',children:[],appendChild(child){this.children.push(child);}};
  const element=()=>({textContent:'',className:'',append(...nodes){this.nodes=nodes;},appendChild(node){(this.nodes||(this.nodes=[])).push(node);}});
  const dbClient={from:name=>({select(){return this;},then(resolve,reject){return Promise.resolve(tables[name]()).then(resolve,reject);}})};
  const searchInput={value:''};
  const context=vm.createContext({searchInput,searchResults,dbClient,MOODS,document:{createElement:element},Date});
  const fnStart=app.indexOf('function formatDateKey'),fnEnd=app.indexOf('\n}\n',fnStart)+3;
  assert.ok(fnStart>=0&&fnEnd>fnStart);
  vm.runInContext(app.slice(fnStart,fnEnd),context);
  vm.runInContext(slice('let searchSeq','window.addEventListener("pageshow"'),context);
  return {context,searchInput,searchResults};
}
const rows=data=>Promise.resolve({data,error:null});
const text=searchResults=>searchResults.children.map(row=>row.nodes[0].textContent).join('|');

test('search shows the completion date in local time, not the UTC date',async()=>{
  const previous=process.env.TZ;process.env.TZ='Asia/Seoul';
  try {
    // 2026-10-28 01:30 KST is still 2026-10-27 in UTC; the old slice(0,10) showed the previous day.
    const {context,searchInput,searchResults}=setup({
      todos:()=>rows([]),events:()=>rows([]),moods:()=>rows([]),
      quick_todos:()=>rows([{title:'새벽 운동',is_completed:true,completed_at:'2026-10-27T16:30:00.000Z'}])
    });
    searchInput.value='운동';await vm.runInContext('runSearch()',context);
    assert.equal(text(searchResults),'QUICK TODO · 2026-10-28');
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('a slower earlier search cannot overwrite the result of a later one',async()=>{
  let releaseFirst;const first=new Promise(resolve=>{releaseFirst=resolve;});
  let call=0;
  const {context,searchInput,searchResults}=setup({
    todos:()=>rows([]),events:()=>rows([]),moods:()=>rows([]),
    quick_todos:()=>(++call===1?first:rows([{title:'두번째 검색',is_completed:false}]))
  });
  searchInput.value='검색';
  const slow=vm.runInContext('runSearch()',context);   // starts first, answers last
  const fast=vm.runInContext('runSearch()',context);   // starts second, answers first
  await fast;
  releaseFirst({data:[{title:'첫번째 검색',is_completed:false}],error:null});
  await slow;
  assert.equal(text(searchResults),'QUICK TODO');
  assert.equal(searchResults.children[0].nodes[1].textContent,'두번째 검색');
  assert.equal(searchResults.children.length,1);
});

test('a failed lookup is reported instead of "no results"',async()=>{
  const {context,searchInput,searchResults}=setup({
    todos:()=>rows([]),events:()=>rows([]),moods:()=>rows([]),
    quick_todos:()=>Promise.resolve({data:null,error:{message:'x'}})
  });
  searchInput.value='검색';await vm.runInContext('runSearch()',context);
  assert.match(searchResults.innerHTML,/검색하지 못했어요/);
  assert.doesNotMatch(searchResults.innerHTML,/검색 결과가 없어요/);
});
