const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/admin_test.html','utf8');
const source=html.slice(html.indexOf('  async function openCorrection(name,dk){'),html.indexOf('  async function resetWorkBoundaries(){'));
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',classList:{add(){},remove(){}}});return elements.get(id);};
let writes=0,fail=false,closed=0,alerts=[],rendered=0;
let server={originalStartMs:111,originalEndMs:222,boundaryResetAtMs:10,history:[{changedAtMs:1,by:'이전 관리자'}]};
const c={Date,Number,Array,console:{error(){}},window:null,n:v=>String(v??'').trim(),ms:v=>Number(v)||null,
 corrId:(name,date)=>date+'__'+name,CORRECTIONS:'attendanceCorrections',s87:{corrections:{}},
 document:{getElementById:get},effectiveBoundary:()=>({original:{},correction:{}}),kstLocale:v=>String(v),dtLocal:v=>v?'2026-10-19T09:00':'',
 fromDtLocal:v=>v?Date.parse(v+':00+09:00'):null,renderCorrHistory:()=>{},toast:()=>{},alert:text=>alerts.push(text),
 renderLive:()=>{rendered++;},renderSummary(){},renderTable(){},
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>0,arrayUnion:entry=>({union:entry})}}},
 db:{collection:name=>{assert.equal(name,'attendanceCorrections');return{doc:id=>({set:async(data,options)=>{
  assert.equal(id,'2026-10-19__tester');assert.equal(options.merge,true);writes++;if(fail)throw Object.assign(Error('quota'),{code:'resource-exhausted'});
  const history=server.history.concat(data.history.union);server={...server,...data,history};
 }})};}}
};c.window=c;vm.createContext(c);vm.runInContext(source,c);
(async()=>{
 await c.openCorrection('tester','2026-10-19');assert.equal(writes,0);assert.equal(get('step87CorrUser').value,'tester');
 // No get/query method exists: opening and saving must not depend on reads.
 get('step87CorrStart').value='2026-10-19T09:00';get('step87CorrEnd').value='2026-10-19T14:00';get('step87CorrReason').value='앱 오류';get('step87CorrBy').value='관리자';get('step87CorrNote').value='저장되지 않은 근무를 확인하여 입력';
 fail=true;await c.saveCorrection();assert.equal(get('step87CorrStart').value,'2026-10-19T09:00');assert.equal(server.history.length,1);assert.ok(alerts.some(x=>x.includes('서버 저장 실패')));
 fail=false;await c.saveCorrection();assert.equal(server.originalStartMs,111);assert.equal(server.originalEndMs,222);assert.equal(server.boundaryResetAtMs,10);assert.equal(server.history.length,2);assert.equal(server.history[0].by,'이전 관리자');assert.equal(server.correctedEndMs-server.correctedStartMs,5*3600000);assert.equal(rendered,1);assert.equal(get('step87CorrSave').disabled,false);
 console.log('PASS: actual work correction opens/saves without reads, failure keeps form, merge preserves originals/reset marker, atomic history append retains unseen server history');
})().catch(e=>{console.error(e);process.exitCode=1;});
