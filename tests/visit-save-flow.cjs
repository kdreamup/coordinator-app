const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const body=html.slice(html.indexOf('  async function saveActivityRecord('),html.indexOf('  /* ── 수정 모달',html.indexOf('  async function saveActivityRecord(')));
const data={clientName:'테*트',gender:'',birthYear:'',age:'',housingType:'',housingEtc:'',visitReason:'',visitPurposes:['상담'],agencySupportDetails:[],resourceLinkDetails:[],resourceLinkDetails1:[],resourceLinkDetails2:[],visitSummary:'장애 중 작성한 내용'};
function fixture(){const pending=[],events=[];let failStorage=false;const noop=()=>{};
const c={console,Date,Math,Promise,savingVisitRecord:false,currentUserName:'tester',currentSession:{activities:['상담'],startedAt:Date.now()-60000},etcText:'',lastGpsErrorCode:'no-gps',lastGpsErrorMessage:'test',
isRapidDuplicateClick:()=>false,getTodayWorkStatus:()=> 'started',getVisitCaseFormData:()=>({...data}),validateVisitCaseData:()=>'',el:()=>({}),setButtonBusy:()=>()=>events.push('unbusy'),requestGpsOnce:async()=>null,selectGpsForRecord:()=>({gps:null,status:'failed',usedCached:false}),makeVisitMemoText:d=>d.visitSummary,formatDuration:()=> '1분',buildWorkBreakFields:()=>({workHours:5}),getCurrentWorkHours:()=>5,
firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}},queueVisitPayload:p=>{if(failStorage)throw Error('storage full');pending.push({id:'visit',payload:p});events.push('queued');return 'visit';},flushVisitOutbox:async()=>false,
resetSubActivitySelections:noop,saveSessionToStorage:noop,resetVisitCaseForm:()=>events.push('reset'),updateActivityAreaState:noop,updateCurrentElapsedUi:noop,
removeVisitDraft:()=>{},formatDateKey:d=>new Date(d).toISOString().slice(0,10),reloadMainData:()=>new Promise(()=>{}),visitOutboxStatus:()=>pending,alert:msg=>events.push(msg)};vm.createContext(c);vm.runInContext(body,c);return {c,events,pending,failStorage:()=>{failStorage=true;}};}
(async()=>{let f=fixture();
const result=await Promise.race([f.c.saveActivityRecord({silent:true}),new Promise(r=>setTimeout(()=>r('hung'),100))]);
assert.equal(result,true,'Local durable save must finish even when subsequent server reload never responds');
assert.equal(f.pending.length,1);assert.equal(f.pending[0].payload.visitSummary,data.visitSummary);assert.ok(f.events.indexOf('queued')<f.events.indexOf('reset'));assert.equal(f.c.savingVisitRecord,false);
f=fixture();f.failStorage();assert.equal(await f.c.saveActivityRecord({silent:true}),false);assert.ok(!f.events.includes('reset'));assert.ok(f.c.currentSession);assert.equal(f.c.savingVisitRecord,false);
console.log('PASS: actual visit save preserves full payload and clears UI only after durable storage; blocked server reload cannot block completion; storage failure retains form/session');
})().catch(e=>{console.error(e);process.exitCode=1;});
