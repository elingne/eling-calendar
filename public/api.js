// Small first-party client for the calendar API. No external service SDK.
class CalendarQuery {
  constructor(table) { this.q = {table, action:'select', filters:[], orders:[]}; }
  select() { return this; }
  insert(values) { this.q.action='insert'; this.q.values=values; return this; }
  update(values) { this.q.action='update'; this.q.values=values; return this; }
  delete() { this.q.action='delete'; return this; }
  upsert(values) { this.q.action='upsert'; this.q.values=values; return this; }
  eq(key,value) { this.q.filters.push([key,'eq',value]); return this; }
  gte(key,value) { this.q.filters.push([key,'gte',value]); return this; }
  lte(key,value) { this.q.filters.push([key,'lte',value]); return this; }
  lt(key,value) { this.q.filters.push([key,'lt',value]); return this; }
  in(key,value) { this.q.filters.push([key,'in',value]); return this; }
  order(key,options={}) { this.q.orders.push([key,options.ascending !== false]); return this; }
  limit(value) { this.q.limit=value; return this; }
  single() { this.q.single=true; return this; }
  maybeSingle() { this.q.single=true; return this; }
  async execute() {
    try {
      if (!isOwner && this.q.action === 'select' && this.q.table === 'events') {
        const response = await fetch('/api/public/events', {cache:'no-store'});
        if (!response.ok) throw Error('일정을 불러오지 못했어요.');
        let rows=(await response.json()).data;
        const ops={eq:(a,b)=>a===b,gte:(a,b)=>a>=b,lte:(a,b)=>a<=b,lt:(a,b)=>a<b};
        rows=rows.filter(row=>this.q.filters.every(([k,op,v])=>ops[op](row[k],v)));
        return {data:rows,error:null};
      }
      const response = await fetch('/api/private/query', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(this.q), redirect:'error'
      });
      if (!response.ok) throw Error(response.status===401||response.status===403 ? '관리자 로그인이 필요해요. 다시 로그인해주세요.' : '저장 또는 불러오기에 실패했어요.');
      return await response.json();
    } catch(error) {
      window.dispatchEvent(new CustomEvent('calendar-api-error', {detail:error.message}));
      return {data:null,error:{message:error.message}};
    }
  }
  then(resolve,reject) { return this.execute().then(resolve,reject); }
}
const dbClient = {from:table=>new CalendarQuery(table)};
