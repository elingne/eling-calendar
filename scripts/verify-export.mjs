import fs from 'node:fs';
import {digest} from './convert-export.mjs';
const manifest=JSON.parse(fs.readFileSync(process.argv[2]||'migration-output/manifest.json','utf8').replace(/^\uFEFF/,''));
const exported=JSON.parse(fs.readFileSync(process.argv[3]||'backups/d1-records.json','utf8').replace(/^\uFEFF/,''));
const records=Array.isArray(exported)&&exported[0]?.results?exported.flatMap(x=>x.results):exported.results||exported;
if(!Array.isArray(records))throw Error('D1 내보내기 형식을 확인해주세요.');
let failed=false;
for(const [table,expected] of Object.entries(manifest.tables)) {
  if(expected.skipped)continue;
  const rows=records.filter(row=>row.collection===table).map(row=>typeof row.data==='string'?JSON.parse(row.data):row.data);
  const ok=rows.length===expected.count&&digest(rows)===expected.sha256;
  console.log(`${ok?'일치':'불일치'}: ${table} (${rows.length}/${expected.count})`);
  if(!ok)failed=true;
}
if(failed)process.exitCode=1;
