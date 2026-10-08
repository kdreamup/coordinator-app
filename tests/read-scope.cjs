const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const body=html.slice(html.indexOf('  const personalRangeCache=new Map();'),html.indexOf('  loadAttendanceLogs=async function(){',html.indexOf('  const personalRangeCache=new Map();')));
let now=Date.UTC(2026,9,7,7),reads=0,calls=0;const mem=new Map();
class Clock extends Date{static now(){return now;}}
const c={Date:Clock,Map,JSON,String,Number,Promise,encodeURIComponent,console,
 localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)},firebase:{firestore:{Timestamp:{fromMillis:ms=>ms}}},
 db:{collection:name=>{assert.equal(name,'attendanceLogs');return {where:(f,o,v)=>{const filters=[[f,o,v]];const q={where:(f,o,v)=>{filters.push([f,o,v]);return q;},orderBy:(f,o)=>{assert.equal(f,'timestamp');assert.equal(o,'desc');return q;},get:async()=>{calls++;
 assert.ok(filters.some(([f,o,v])=>['userName','coordinatorName'].includes(f)&&o==='=='&&v==='tester'));
 const start=filters.find(([f,o])=>f==='timestamp'&&o==='>=')[2],end=filters.find(([f,o])=>f==='timestamp'&&o==='<')[2];assert.ok(end-start<=31*86400000);
 const count=end-start===86400000?8:160;reads+=count;return {docs:Array.from({length:count},(_,i)=>({id:'row'+i,data:()=>({userName:'tester',clientTimeMs:start+i})}))};}};return q;}};}}};c.window=c;vm.createContext(c);vm.runInContext(body,c);
(async()=>{await c.readPersonalMonth('tester','2026-10-07',true);assert.equal(calls,2);await c.readPersonalMonth('tester','2026-10-07',true);assert.equal(calls,2);
now+=120001;await c.readPersonalMonth('tester','2026-10-07',true);assert.equal(calls,4);
await c.readPersonalMonth('tester','2026-10');const n=calls;c.step94InvalidateAttendance();await c.readPersonalMonth('tester','2026-10');assert.equal(calls,n);
// Recreating memory cache after restart still uses the persisted month cache.
const c2={...c,window:null};c2.window=c2;vm.createContext(c2);vm.runInContext(body,c2);await c2.readPersonalMonth('tester','2026-10');assert.equal(calls,n);
assert.ok(html.includes('const months=historyMonthRequested?'));assert.ok(html.includes('const POLL_MS=600000;'));
const budget={staff:70,recordsPerPersonPerDay:8,workingDays:20,dailyLoadsPerPerson:10,explicitMonthViewsPerPerson:1};
const appToday=70*8*2*10,explicitMonth=70*8*20*2,corrections=70*31,adminMonth=70*8*20,adminToday=70*8*2;
const normal=appToday+corrections+adminMonth+adminToday;assert.ok(normal<40000);
const loaderBody=html.slice(html.indexOf("  let attendanceLoadTask=null"),html.indexOf('  saveWorkBoundaryLog=async function(type){',html.indexOf("  let attendanceLoadTask=null")));
let releaseOld;const requested=[];
const c3={...c,window:null,currentUserName:'tester',historyMonthRequested:true,calYear:2026,calMonth:8,allLogs:[],
formatDateKey:d=>new Date(d).toISOString().slice(0,10),getLogDateTime:r=>new Date(r.clientTimeMs),syncLocalFromRemote:()=>{},effectiveInfo:()=>{},renderVisitOutbox:()=>{},flushVisitOutbox:async()=>{},
mockRead:async(user,key,daily)=>{requested.push(key);if(key==='2026-09')return new Promise(r=>{releaseOld=r;});return [{id:daily?'today':'october',clientTimeMs:daily?now:Date.UTC(2026,9,1)}];}};
c3.window=c3;vm.createContext(c3);vm.runInContext(loaderBody,c3);vm.runInContext('readPersonalMonth=mockRead',c3);
const older=c3.loadAttendanceLogs();c3.calMonth=9;await c3.loadAttendanceLogs();releaseOld([{id:'september',clientTimeMs:Date.UTC(2026,8,1)}]);await older;
assert.ok(requested.includes('2026-10'));assert.ok(c3.allLogs.some(x=>x.id==='october'));assert.ok(!c3.allLogs.some(x=>x.id==='september'));
const admin=fs.readFileSync('public/admin_test.html','utf8'),subscriptions=[];
const rangeBody=admin.slice(admin.indexOf('  const logRangeCache='),admin.indexOf('  async function loadLogs('));
let adminReads=0,denyRange=false;const releaseRanges=[];
const rc={Date,Map,Promise,firebase:{firestore:{Timestamp:{fromDate:d=>d}}},time:l=>new Date(l.clientTimeMs),
db:{collection:()=>{const q={where:()=>q,get:()=>{adminReads++;if(denyRange)return Promise.reject(Error('offline'));return new Promise(resolve=>releaseRanges.push(()=>resolve({docs:[]})));}};return q;}}};
vm.createContext(rc);vm.runInContext(rangeBody,rc);
const ra=rc.readLogRange('2026-10',true),rb=rc.readLogRange('2026-10',true);assert.equal(adminReads,2);
releaseRanges.splice(0).forEach(fn=>fn());await Promise.all([ra,rb]);await rc.readLogRange('2026-10',true);assert.equal(adminReads,2);
denyRange=true;await assert.rejects(rc.readLogRange('2026-09',true));denyRange=false;
const recovered=rc.readLogRange('2026-09',true);releaseRanges.splice(0).forEach(fn=>fn());await recovered;assert.equal(adminReads,6);
console.log('PASS: concurrent administrator period queries coalesced, cache reused, failed request releases retry lock');
const scopeBody=admin.slice(admin.indexOf('  function managementQueries('),admin.indexOf('  const baseManagementInit='));
const ac={state:{all:false,month:'2026-09'},s87:{},CORRECTIONS:'attendanceCorrections',EXCEPTIONS:'workScheduleExceptions',Date,console,
 dateKey:()=> '2026-10-08',monthKey:()=> '2026-10',mapSnap:s=>s,renderScheduleLists:()=>{},renderLive:()=>{},renderSummary:()=>{},renderTable:()=>{},toast:()=>{},
 db:{collection:name=>{const filters=[];const q={where:(...args)=>{filters.push(args);return q;},get:async()=>({}),onSnapshot:fn=>{const sub={name,filters,fn,stopped:false};subscriptions.push(sub);return ()=>sub.stopped=true;}};return q;}}};
vm.createContext(ac);vm.runInContext(scopeBody,ac);ac.refreshManagementRealtime();
assert.equal(subscriptions.length,4);assert.deepEqual(subscriptions[0].filters,[['dateKey','>=','2026-09-01'],['dateKey','<','2026-10-01']]);
assert.deepEqual(subscriptions[1].filters,[['dateKey','==','2026-10-08']]);
subscriptions[2].fn({past:{dateKey:'2026-09-07'}});subscriptions[3].fn({today:{dateKey:'2026-10-08'}});assert.ok(ac.s87.corrections.past&&ac.s87.corrections.today);
ac.state.month='2026-10';ac.refreshManagementRealtime();assert.ok(subscriptions.slice(0,4).every(s=>s.stopped));
subscriptions[2].fn({stale:{}});assert.ok(!ac.s87.corrections.stale);assert.equal(subscriptions.length,6);
ac.state.all=true;ac.refreshManagementRealtime();assert.equal(subscriptions.length,8);assert.equal(subscriptions[7].filters.length,0);
assert.ok(html.includes("where('userName','==',u).where('dateKey','==',d)"));
console.log('PASS: administrator corrections/exceptions selected-month plus today; old listeners removed and stale responses ignored; all-period only explicit');
console.log('PASS: own-user date ranges, day cache, persisted month cache, explicit history, scoped reads independent of old global history');
console.log(JSON.stringify({assumptions:budget,normalEstimatedReads:normal,allStaffExplicitMonthStressReads:normal+explicitMonth,exclusions:'extra devices, repeated administrator month loads, console traffic, additional legacy copies, settings and transaction overhead; operational measurement still required'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
