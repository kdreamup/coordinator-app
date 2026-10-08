const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const draftBody=html.slice(html.indexOf('  /* Visit drafts'),html.indexOf('  const LS_LAST_USER'));
const autoBody=html.slice(html.indexOf('  async function checkAutoWorkEnd('),html.indexOf('  function startAutoEndTimer('));
const mem=new Map(),events=[];let storageFail=false,valid=false;
const c={LS_SESSION:"old_session",LS_MEMO:"old_memo",LS_LAST_USER:"old_user",Date,JSON,Array,Number,Object,String,console:{...console,error:()=>{}},Promise,currentUserName:'tester',currentSession:{activities:['상담'],startedAt:Date.now()-3600000},autoEndInProgress:false,
localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>{if(storageFail)throw Error('full');mem.set(k,v);},removeItem:k=>mem.delete(k)},document:{addEventListener:()=>{}},formatDateKey:d=>new Date(d).toISOString().slice(0,10),
getVisitCaseFormData:()=>({clientName:'테*트',visitSummary:'자동 종료 전에 작성한 내용',visitPurposes:['상담'],agencySupportDetails:['기타']}),
getCurrentAutoEndInfo:()=>({autoEndAtMs:Date.now()-1,hours:5}),updateWorkHoursUi:()=>{},validateVisitCaseData:()=>valid?'':'내용 미완성',
saveActivityRecord:async()=>{events.push('saved');c.currentSession=null;return true;},discardCurrentActivitySession:()=>{assert.ok(c.readVisitDrafts().length>0);events.push('discard');c.currentSession=null;},
getTodayWorkStatus:()=> 'started',_doSaveWorkBoundaryLog:async()=>{events.push('end');return true;},alert:()=>{}};
vm.createContext(c);vm.runInContext(draftBody,c);vm.runInContext(autoBody,c);
(async()=>{assert.equal(c.protectVisitDraft(),true);assert.equal(c.readVisitDrafts()[0].data.visitSummary,'자동 종료 전에 작성한 내용');
await c.checkAutoWorkEnd();assert.deepEqual(events,['discard','end']);assert.equal(c.readVisitDrafts().length,1);
c.currentUserName='other';c.currentSession={activities:['상담'],startedAt:Date.now()};c.protectVisitDraft();assert.equal(c.readVisitDrafts().length,2);
c.removeVisitDraft('other',c.formatDateKey(Date.now()));assert.equal(c.readVisitDrafts()[0].userName,'tester');
c.currentUserName='tester';c.currentSession={activities:['상담'],startedAt:Date.now()};storageFail=true;events.length=0;await c.checkAutoWorkEnd();assert.equal(events.length,0);assert.ok(c.currentSession);assert.equal(c.autoEndInProgress,false);
storageFail=false;valid=true;events.length=0;await c.checkAutoWorkEnd();assert.deepEqual(events,['saved','end']);
mem.set('old_session',JSON.stringify({userName:'legacy',startedAt:Date.now()-86400000,activities:['상담']}));mem.set('old_memo','업데이트 이전 미완성 내용');c.migrateLegacyVisitDraft('other');assert.ok(!c.readVisitDrafts().some(x=>x.userName==='legacy'));c.migrateLegacyVisitDraft('legacy');c.migrateLegacyVisitDraft('legacy');assert.equal(c.readVisitDrafts().filter(x=>x.userName==='legacy').length,1);assert.equal(c.readVisitDrafts().find(x=>x.userName==='legacy').data.visitSummary,'업데이트 이전 미완성 내용');
console.log('PASS: incomplete draft retained before auto-end, complete visit submitted before auto-end, storage failure prevents input loss, user isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
