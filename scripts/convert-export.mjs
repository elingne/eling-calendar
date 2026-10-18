import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const tables=['events','quick_todos','todos','schedule_notes','moods','period_records'];
// RFC 4180: quoted commas, escaped quotes, CRLF and multiline notes.
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],value='',quoted=false,wasQuoted=false;
  const cell=()=>{row.push({value,quoted:wasQuoted});value='';wasQuoted=false;};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {if(c==='"'&&text[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=false;else value+=c;}
    else if(c==='"'&&value===''){quoted=true;wasQuoted=true;}
    else if(c===',')cell();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;cell();rows.push(row);row=[];}
    else value+=c;
  }
  if(quoted)throw Error('닫히지 않은 CSV 따옴표');
  if(value||row.length||wasQuoted){cell();rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift().map(x=>x.value);
  if(new Set(headers).size!==headers.length||!headers.includes('id'))throw Error('id 열 또는 헤더 확인 필요');
  return rows.filter(r=>r.length>1||r[0].value!=='').map((r,index)=>{
    if(r.length!==headers.length)throw Error(`CSV ${index+2}행 열 수 불일치`);
    const data={};
    headers.forEach((key,i)=>{
      const {value,quoted}=r[i];
      if(!quoted&&['','NULL','null','\\N'].includes(value)){data[key]=null;return;}
      if(['id','sort_order'].includes(key)) {
        const n=Number(value);if(!value||!Number.isFinite(n))throw Error(`${key} 숫자 오류`);data[key]=n;
      } else if(['is_completed','is_important'].includes(key)) {
        if(!['true','false','t','f','1','0'].includes(value.toLowerCase()))throw Error(`${key} 참/거짓 오류`);
        data[key]=['true','t','1'].includes(value.toLowerCase());
      } else data[key]=value;
    });
    return data;
  });
}
export function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function digest(rows) {return createHash('sha256').update(canonical([...rows].sort((a,b)=>a.id-b.id))).digest('hex');}
export function convert(input,output) {
  const statements=[],manifest={version:1,tables:{}};
  for(const table of tables) {
    const csv=path.join(input,table+'.csv'),json=path.join(input,table+'.json');
    let rows;
    if(fs.existsSync(json))rows=JSON.parse(fs.readFileSync(json,'utf8'));
    else if(fs.existsSync(csv))rows=parseCSV(fs.readFileSync(csv,'utf8'));
    else {if(table==='events')throw Error('events.csv 또는 events.json이 필요합니다.');manifest.tables[table]={skipped:true};continue;}
    if(!Array.isArray(rows))throw Error(`${table}: JSON 배열 필요`);
    const ids=new Set();
    for(const row of rows) {
      const id=Number(row.id);
      if(!Number.isSafeInteger(id)||id<1||ids.has(id))throw Error(`${table}: 중복 또는 잘못된 id`);
      row.id=id;ids.add(id);
      // Never silently fix intervals or delete source fields during import.
      const dateKeys={events:['start_date','end_date'],schedule_notes:['note_date'],moods:['record_date'],period_records:['start_date','end_date']}[table]||[];
      if(dateKeys.some(k=>typeof row[k]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row[k])))throw Error(`${table} #${id}: 날짜 확인 필요`);
      if(row.start_date&&row.end_date&&row.start_date>row.end_date)throw Error(`${table} #${id}: 기간 확인 필요`);
      const literal=JSON.stringify(row).replaceAll("'","''");
      // Plain INSERT: existing records are never overwritten on re-import.
      statements.push(`INSERT INTO records(collection,id,data) VALUES ('${table}',${id},'${literal}');`);
    }
    manifest.tables[table]={count:rows.length,sha256:digest(rows)};
  }
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'import.sql'),statements.join('\n')+'\n');
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const report=convert(process.argv[2]||'data-export',process.argv[3]||'migration-output');console.log(JSON.stringify(report,null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
