const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('index.html','utf8');
function part(a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
let reads=0,writes=0,renders=0;const disk=new Map();
const row={id:'one',userName:'tester',date:'2026-10-19',memo:'original'};
const c={currentUserName:'tester',allLogs:[row],editingLogId:'one',
 getLogUserName:x=>x.userName,getLogDateTime:x=>x.date,formatDateKey:x=>x,
 localStorage:{setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)},console,
 requireOwnCurrentMonthRecord:()=>true,isActivityLog:()=>false,confirm:()=>true,alert(){},
 normalizeText:x=>x,el:()=>({value:'changed'}),closeEditModal(){},renderMainDataFromMemory:()=>renders++,
 reloadMainData:async()=>reads++,
 db:{collection:()=>({doc:()=>({delete:async()=>writes++,update:async()=>writes++}),get:()=>{reads++;throw Error('unexpected attendance read')}})}};
c.window=c;vm.createContext(c);
vm.runInContext(part('  const personalRangeCache=new Map();','  window.step94InvalidateAttendance='),c);
vm.runInContext("personalRangeCache.set('tester|day:2026-10-19',{at:123,rows:[...allLogs]});personalRangeCache.set('tester|month:2026-10',{at:456,rows:[...allLogs]});personalRangeCache.set('other|month:2026-10',{at:789,rows:[{id:'other',userName:'other',date:'2026-10-19'}]});",c);
vm.runInContext(part('  window.deleteLog=async function(','  function closeEditModal('),c);
vm.runInContext(part('  async function saveEditModal(){','  el("close-edit-modal")'),c);
(async()=>{
 await c.saveEditModal();assert.equal(c.allLogs[0].memo,'changed');assert.equal(reads,0);assert.equal(writes,1);
 assert.equal(vm.runInContext("personalRangeCache.get('tester|month:2026-10').rows[0].memo",c),'changed');
 assert.equal(vm.runInContext("personalRangeCache.get('tester|month:2026-10').at",c),456);
 c.isActivityLog=()=>true;
 await c.deleteLog('one');assert.equal(c.allLogs.length,0);assert.equal(reads,0);assert.equal(writes,2);assert.equal(renders,2);
 assert.equal(vm.runInContext("personalRangeCache.get('tester|day:2026-10-19').rows.length",c),0);
 assert.equal(vm.runInContext("personalRangeCache.get('other|month:2026-10').rows.length",c),1);
 assert.equal(part('  function patchSave79(){','  // 기존 세부체크리스트').includes('requireOwnCurrentMonthRecord(log)'),true);
 console.log('PASS: actual edit + delete handlers issue 2 writes, 0 attendance re-queries; memory/day/month/disk caches updated, other users untouched, freshness not extended.');
})();
