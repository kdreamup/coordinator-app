const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
let writes=0,confirms=0,alerts=0;
const c={currentUserName:'tester',allLogs:[],editingLogId:null,
  getLogDateTime:l=>l.date,getLogUserName:l=>l.userName,formatDateKey:d=>d,
  isCurrentMonth:d=>/^2026-10-/.test(d),isStartLog:l=>l.type==='일과 시작',isEndLog:l=>l.type==='일과 종료',isActivityLog:()=>true,
  alert:()=>alerts++,confirm:()=>{confirms++;return true},db:{collection:()=>({doc:()=>({delete:async()=>writes++,update:async()=>writes++})})}};
c.window=c;vm.createContext(c);
vm.runInContext(section('  function canMutateOwnCurrentMonthRecord(','  function updateActivityAreaState('),c);
vm.runInContext(section('  window.deleteLog=async function(','  function closeEditModal('),c);
vm.runInContext(section('  async function saveEditModal(){','  el("close-edit-modal")'),c);
const row=(userName,date,type='활동')=>({id:'fixture',userName,date,type});
(async()=>{
 for(const log of [row('other','2026-10-19'),row('tester','2026-09-30'),row('tester','2026-11-01'),row('tester','2026-10-19','일과 시작'),row('tester','2026-10-19','일과 종료')]){
   assert.equal(c.canMutateOwnCurrentMonthRecord(log),false);
   c.allLogs=[log];c.editingLogId=log.id;
   await c.deleteLog(log.id);await c.saveEditModal();
 }
 assert.equal(writes,0);assert.equal(confirms,0);assert.equal(alerts,10);
 assert.equal(c.canMutateOwnCurrentMonthRecord(row('tester','2026-10-19')),true);
 assert.equal(c.canMutateOwnCurrentMonthRecord(row('tester','2026-10-19','방문사례기록')),true);
 assert.equal(c.canMutateOwnCurrentMonthRecord(null),false);
 c.currentUserName='';assert.equal(c.canMutateOwnCurrentMonthRecord(row('tester','2026-10-19')),false);
 assert(section('  window.openEditModal=function(','  window.deleteLog=').includes('requireOwnCurrentMonthRecord(log)'));
 assert(section('  function patchSave79(){','  // 기존 세부체크리스트').includes('requireOwnCurrentMonthRecord(log)'));
 console.log('PASS: other user, past/future month and boundaries rejected before write; own current-month activity/visit permitted; modal and capture-phase visit save guarded. Client protection only; server authorization still required.');
})();
