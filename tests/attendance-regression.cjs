const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [,attrs,body] of scripts)if(!attrs.includes('src='))new vm.Script(body);
assert.equal(html,fs.readFileSync('public/index.html','utf8'));
const script=id=>scripts.find(x=>x[1].includes(`id="${id}"`))[2];
const mem=new Map(),records=new Map(),corrections=new Map();
let fail=false,gpsResolve;
const noop=()=>{};
let clock=Date.UTC(2026,9,7,12);
class TestDate extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
const c={console,Date:TestDate,Promise,Map,Set,Number,String,JSON,encodeURIComponent,
 setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,
 document:{addEventListener:noop,visibilityState:'visible'},navigator:{onLine:true},
 currentUserName:'tester',selectedDateKey:'2026-10-01',allLogs:[],DEFAULT_WORK_HOURS:5,
 localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},
 formatDateKey:d=>new Date(d).toISOString().slice(0,10),toDate:x=>x==null?null:new Date(x.seconds?x.seconds*1000:x),
 getLogUserName:l=>l.userName,getLogDateTime:l=>new Date(l.clientTimeMs),
 isStartLog:l=>l.type==='일과 시작',isEndLog:l=>l.type==='일과 종료',getWorkHoursFromLog:l=>l.workHours||5,
 getTodayWorkStatus:()=> 'none',getWorkStartTime:()=>null,getWorkEndTime:()=>null,
 getLatestStartLogForDate:noop,getCurrentWorkHours:()=>5,getCurrentAutoEndInfo:()=>null,
 getTotalScheduledMinutesForWorkHours:h=>h*60,clampWorkHours:h=>h||5,
 buildWorkBreakFields:h=>({workHours:h}),selectGpsForRecord:g=>({gps:g,status:'fresh'}),
 requestGpsOnce:()=>new Promise(r=>gpsResolve=r),lastGpsErrorCode:'',lastGpsErrorMessage:'',
 saveWorkBoundaryLog:noop,_doSaveWorkBoundaryLog:noop,renderHistory:noop,
 reloadMainData:async()=>{c.allLogs=[...records].map(([id,data])=>({id,...data}));},
 firebase:{firestore:{Timestamp:{fromMillis:ms=>({seconds:ms/1000})},FieldValue:{serverTimestamp:()=>0}}},
 db:{collection:name=>({get:async()=>({docs:[...records].map(([id,data])=>({id,data:()=>data}))}),doc:id=>({id,collection:name,get:async()=>({id,exists:corrections.has(id),data:()=>corrections.get(id)})}),where:()=>({get:async()=>({docs:[]})})}),
 runTransaction:async fn=>{if(fail)throw Error('offline');await fn({get:async ref=>({exists:ref.collection==='attendanceCorrections'?corrections.has(ref.id):records.has(ref.id),data:()=>corrections.get(ref.id)}),set:(ref,data)=>records.set(ref.id,data)});}},
};
for(const n of ['updateBoundaryBtnState','updateActivityAreaState','updateWorkHoursUi','updateWorkTimerUi','updateCurrentElapsedUi','syncGpsCheckTimer','clearCurrentActivitySessionSilently','updateTodaySummary','renderCalendar','checkAutoWorkEnd','saveGpsCheckSnapshot','loadAttendanceLogs'])c[n]=noop;
c.window=c;c.addEventListener=noop;c.step84Notify=noop;vm.createContext(c);
(async()=>{
 vm.runInContext(html.slice(html.indexOf('  function canEndWorkNow('),html.indexOf('  async function checkAutoWorkEnd(')),c);
 c.formatClockTime=ms=>new Date(ms).toISOString();
 vm.runInContext(script('step82-gps-timer-resilience'),c);
 // The correction module must initialize without access to step82's private effectiveInfo.
 vm.runInContext(script('step87-admin-correction-sync'),c);
 const today=c.formatDateKey(new TestDate()),id=d=>d+'__tester';
 const original=TestDate.now()-6*3600000,changed=original-600000;
 c.allLogs=[{userName:'tester',type:'일과 시작',clientTimeMs:original,workHours:5}];
 corrections.set(id(today),{userName:'tester',dateKey:today,correctedStartMs:changed});
 corrections.set(id('2026-10-01'),{userName:'tester',dateKey:'2026-10-01',correctedStartMs:123456});
 await c.step87SyncCorrection();assert.equal(c.getWorkStartTime(),changed);
 assert.equal(c.getCurrentAutoEndInfo().autoEndAtMs,changed+300*60000);
 assert.equal(c.step87CorrectionForDate('2026-10-01').correctedStartMs,123456);
 corrections.delete(id(today));await c.step87SyncCorrection();assert.equal(c.getWorkStartTime(),original);
 c.currentUserName='other';assert.equal(c.step87CorrectionForDate('2026-10-01'),null);c.currentUserName='tester';
 // Early manual and automatic ends are both blocked without starting GPS or saving records.
 c.allLogs=[{userName:'tester',type:'일과 시작',clientTimeMs:TestDate.now(),workHours:5}];
 assert.equal(await c._doSaveWorkBoundaryLog('일과 종료'),false);
 assert.equal(await c._doSaveWorkBoundaryLog('일과 종료',{autoEnded:true}),false);
 assert.equal(records.size,0);
 c.allLogs=[{userName:'tester',type:'일과 시작',clientTimeMs:original,workHours:5}];
 // A manager reset clears local ended status and old pending boundaries, preserving visits.
 const cutoff=TestDate.now();
 const workKey='coordinator_work_state_v2_tester_'+today;
 mem.set(workKey,JSON.stringify({userName:'tester',dateKey:today,status:'ended',startMs:original,endMs:cutoff-1,updatedAtMs:cutoff-1}));
 c.allLogs.push({id:'visit',userName:'tester',type:'방문사례기록',clientTimeMs:original});
 mem.set('coordinator_pending_boundaries_v1',JSON.stringify([{id:'old',payload:{userName:'tester',clientTimeMs:original}},{id:'other',payload:{userName:'other',clientTimeMs:original}}]));
 corrections.set(id(today),{userName:'tester',dateKey:today,boundaryResetAtMs:cutoff});
 await c.step87SyncCorrection();assert.equal(c.getTodayWorkStatus(),'none');
 assert.equal(c.allLogs.length,1);assert.equal(c.allLogs[0].id,'visit');assert.equal(mem.has(workKey),false);
 assert.equal(JSON.parse(mem.get('coordinator_pending_boundaries_v1'))[0].id,'other');
 // An old offline queue cannot recreate a deleted boundary after reset.
 mem.set('coordinator_pending_boundaries_v1',JSON.stringify([{id:'old',payload:{userName:'tester',clientTimeMs:original}}]));
 await c.step82FlushPendingBoundaries();assert.equal(records.size,0);
 corrections.delete(id(today));await c.step87SyncCorrection();
 c.allLogs=[{userName:'tester',type:'일과 시작',clientTimeMs:original,workHours:5}];
 // Manual and automatic end racing while GPS is pending produce one boundary.
 const p=c._doSaveWorkBoundaryLog('일과 종료');
 assert.equal(await c._doSaveWorkBoundaryLog('일과 종료',{autoEnded:true}),false);
 gpsResolve({lat:1,lng:2});assert.equal(await p,true);await Promise.resolve();
 assert.equal(records.size,1);assert.equal(await c._doSaveWorkBoundaryLog('일과 종료'),false);
 // Pending replay preserves the first committed timestamp.
 const [rid,first]=[...records][0];
 mem.set('coordinator_pending_boundaries_v1',JSON.stringify([{id:rid,payload:{...first,clientTimeMs:first.clientTimeMs+1000}}]));
 await c.step82FlushPendingBoundaries();assert.equal(records.get(rid).clientTimeMs,first.clientTimeMs);
 // Offline end is queued and creates exactly one document after reconnection.
 c.currentUserName='offline-user';c.allLogs=[{userName:c.currentUserName,type:'일과 시작',clientTimeMs:original}];fail=true;
 const offline=c._doSaveWorkBoundaryLog('일과 종료');gpsResolve({lat:1,lng:2});assert.equal(await offline,true);
 assert.equal(JSON.parse(mem.get('coordinator_pending_boundaries_v1')).length,1);
 fail=false;await c.step82FlushPendingBoundaries();assert.equal(records.size,2);
 assert.equal(JSON.parse(mem.get('coordinator_pending_boundaries_v1')).length,0);
 assert.equal(await c._doSaveWorkBoundaryLog('일과 시작'),false);
 // GPS failure releases the lock so a valid start can be retried.
 c.currentUserName='retry';c.allLogs=[];
 assert.equal(await c._doSaveWorkBoundaryLog('일과 종료'),false);
 const gpsError=c._doSaveWorkBoundaryLog('일과 시작');
 assert.equal(await c._doSaveWorkBoundaryLog('일과 시작'),false);
 gpsResolve(Promise.reject(Error('GPS failed')));
 await assert.rejects(gpsError);
 assert.equal(await c._doSaveWorkBoundaryLog('일과 시작',{preCapturedGps:{lat:1,lng:2},workHours:3}),true);
 assert.equal(records.size,3);
 // Reset an already-ended day, then accept one fresh start (not a duplicate).
 const retryDate=c.formatDateKey(new TestDate()),retryId=retryDate+'__retry';
 const reset=TestDate.now();
 for(const [rid,row] of records)if(row.userName==='retry')records.delete(rid);
 corrections.set(retryId,{userName:'retry',dateKey:retryDate,boundaryResetAtMs:reset});
 await c.step87SyncCorrection();assert.equal(c.getTodayWorkStatus(),'none');clock+=1000;
 assert.equal(await c._doSaveWorkBoundaryLog('일과 시작',{preCapturedGps:{lat:1,lng:2},workHours:5}),true);
 assert.equal(c.getTodayWorkStatus(),'started');
 assert.equal(c.getCurrentAutoEndInfo().autoEndAtMs,clock+300*60000);
 assert.equal(await c._doSaveWorkBoundaryLog('일과 종료'),false);
 assert.equal(await c._doSaveWorkBoundaryLog('일과 시작'),false);
 console.log('PASS: script syntax, bundle parity, correction scope/today/history/removal/user isolation, auto-end schedule, concurrent end, immutable replay, offline retry, GPS retry, reset/restart and early-end blocking');
})().catch(e=>{console.error(e);process.exitCode=1;});
