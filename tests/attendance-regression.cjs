const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [,attrs,body] of scripts)if(!attrs.includes('src='))new vm.Script(body);
assert.equal(html,fs.readFileSync('public/index.html','utf8'));
const script=id=>scripts.find(x=>x[1].includes(`id="${id}"`))[2];
const mem=new Map(),records=new Map(),corrections=new Map();
let fail=false,gpsResolve;
const noop=()=>{};
const c={console,Date,Promise,Map,Set,Number,String,JSON,encodeURIComponent,
 setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,
 document:{addEventListener:noop,visibilityState:'visible'},navigator:{onLine:true},
 currentUserName:'tester',selectedDateKey:'2026-10-01',allLogs:[],DEFAULT_WORK_HOURS:5,
 localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},
 formatDateKey:d=>new Date(d).toISOString().slice(0,10),toDate:x=>x==null?null:new Date(x.seconds?x.seconds*1000:x),
 getLogUserName:l=>l.userName,getLogDateTime:l=>new Date(l.clientTimeMs),
 isStartLog:l=>l.type==='일과 시작',isEndLog:l=>l.type==='일과 종료',getWorkHoursFromLog:l=>l.workHours||5,
 getTodayWorkStatus:()=> 'none',getWorkStartTime:()=>null,getWorkEndTime:()=>null,
 getLatestStartLogForDate:noop,getCurrentWorkHours:()=>5,getCurrentAutoEndInfo:()=>null,
 getTotalScheduledMinutesForWorkHours:h=>h*60+(h>=4?30:0),clampWorkHours:h=>h||5,
 buildWorkBreakFields:h=>({workHours:h}),selectGpsForRecord:g=>({gps:g,status:'fresh'}),
 requestGpsOnce:()=>new Promise(r=>gpsResolve=r),lastGpsErrorCode:'',lastGpsErrorMessage:'',
 saveWorkBoundaryLog:noop,_doSaveWorkBoundaryLog:noop,renderHistory:noop,
 reloadMainData:async()=>{c.allLogs=[...records].map(([id,data])=>({id,...data}));},
 firebase:{firestore:{Timestamp:{fromMillis:ms=>({seconds:ms/1000})},FieldValue:{serverTimestamp:()=>0}}},
 db:{collection:name=>({get:async()=>({docs:[...records].map(([id,data])=>({id,data:()=>data}))}),doc:id=>({id,get:async()=>({id,exists:corrections.has(id),data:()=>corrections.get(id)})}),where:()=>({get:async()=>({docs:[]})})}),
 runTransaction:async fn=>{if(fail)throw Error('offline');await fn({get:async ref=>({exists:records.has(ref.id)}),set:(ref,data)=>records.set(ref.id,data)});}},
};
for(const n of ['updateBoundaryBtnState','updateActivityAreaState','updateWorkHoursUi','updateWorkTimerUi','updateCurrentElapsedUi','syncGpsCheckTimer','clearCurrentActivitySessionSilently','updateTodaySummary','renderCalendar','checkAutoWorkEnd','saveGpsCheckSnapshot','loadAttendanceLogs'])c[n]=noop;
c.window=c;c.addEventListener=noop;c.step84Notify=noop;vm.createContext(c);
(async()=>{
 vm.runInContext(script('step82-gps-timer-resilience'),c);
 // The correction module must initialize without access to step82's private effectiveInfo.
 vm.runInContext(script('step87-admin-correction-sync'),c);
 const today=c.formatDateKey(new Date()),id=d=>d+'__tester';
 const original=Date.now()-3600000,changed=original-600000;
 c.allLogs=[{userName:'tester',type:'일과 시작',clientTimeMs:original,workHours:5}];
 corrections.set(id(today),{userName:'tester',dateKey:today,correctedStartMs:changed});
 corrections.set(id('2026-10-01'),{userName:'tester',dateKey:'2026-10-01',correctedStartMs:123456});
 await c.step87SyncCorrection();assert.equal(c.getWorkStartTime(),changed);
 assert.equal(c.getCurrentAutoEndInfo().autoEndAtMs,changed+330*60000);
 assert.equal(c.step87CorrectionForDate('2026-10-01').correctedStartMs,123456);
 corrections.delete(id(today));await c.step87SyncCorrection();assert.equal(c.getWorkStartTime(),original);
 c.currentUserName='other';assert.equal(c.step87CorrectionForDate('2026-10-01'),null);c.currentUserName='tester';
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
 console.log('PASS: script syntax, bundle parity, correction scope/today/history/removal/user isolation, auto-end schedule, concurrent end, immutable replay, offline retry, GPS retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
