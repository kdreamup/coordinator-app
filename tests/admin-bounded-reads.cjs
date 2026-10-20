const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createAdminRangePager}=require('../admin-range-pager.js');
const html=fs.readFileSync('public/admin_test.html','utf8');
const epoch=Date.parse('2026-10-20T10:00:00+09:00');
const fixture=Array.from({length:1200},(_,i)=>({id:'r'+String(i).padStart(4,'0'),data:()=>({clientTimeMs:epoch-i*60000,userName:'tester'})}));
(async()=>{
 let calls=0,reads=0,fail=false;
 const pager=createAdminRangePager({getTime:r=>r.clientTimeMs,fetchPage:async(key,field,cursor,size)=>{
  calls++;assert.equal(size,50);assert.equal(key,'2026-10');if(fail&&field==='visitDateTime')throw Error('offline');
  const source=field==='timestamp'?fixture:fixture.filter((_,i)=>i%2===0);
  const start=cursor?source.indexOf(cursor)+1:0,rows=source.slice(start,start+size);reads+=rows.length;return rows;
 }});
 const [a,b]=await Promise.all([pager.next('2026-10'),pager.next('2026-10')]);
 assert.equal(calls,2);assert.equal(reads,100);assert.equal(a.complete,false);assert.equal(b.rows.length,75);
 assert.equal(pager.snapshot('2026-10').rows.length,75);assert.equal(calls,2);
 const before=pager.snapshot('2026-10');fail=true;await assert.rejects(pager.next('2026-10'));
 assert.deepEqual(pager.snapshot('2026-10'),before);fail=false;
 let page;do{page=await pager.next('2026-10');}while(!page.complete);
 assert.equal(page.rows.length,1200);assert.equal(new Set(page.rows.map(r=>r.id)).size,1200);
 const n=calls;await pager.next('2026-10');assert.equal(calls,n);
 // Edits already committed in memory must not revert on later page requests.
 pager.sync('2026-10',page.rows.map(r=>r.id==='r0000'?{...r,memo:'edited'}:r));
 assert.equal(pager.snapshot('2026-10').rows.find(r=>r.id==='r0000').memo,'edited');
 console.log('PASS: 1200 fixtures, first monthly action <=100 returned documents; cursor continuation, overlap deduplication, concurrent calls, failed page retry, complete export data and saved edits preserved');
 // Execute actual day stream: first init and live monitor share exactly two listeners.
 const start=html.indexOf('  let liveDay=null;'),end=html.indexOf('  const pager=createAdminRangePager(',start);
 const subscriptions=[];let monthCalls=0;
 const dayContext={Date,Map,Set,Promise,Error,setTimeout,clearTimeout,console,window:{},logRangeCache:new Map(),
 dateKey:d=>new Date(new Date(d).getTime()+9*3600000).toISOString().slice(0,10),
 time:r=>new Date(r.clientTimeMs),kstRange:()=>({start:new Date(epoch-3600000),end:new Date(epoch+86400000)}),
 firebase:{firestore:{Timestamp:{fromDate:d=>d}}},db:{collection:n=>{assert.equal(n,'attendanceLogs');const filters=[];const q={where:(...args)=>{filters.push(args);return q;},onSnapshot:(next,error)=>{subscriptions.push({filters,next,error});return ()=>{};},get:()=>{monthCalls++;throw Error('unexpected get');}};return q;}}};
 vm.createContext(dayContext);vm.runInContext(html.slice(start,end),dayContext);
 const today=dayContext.dateKey(new Date());const dateMs=Date.parse(today+'T10:00:00+09:00');
 const read=dayContext.window.step97ReadToday(today);let updates=0;
 dayContext.window.step97SubscribeToday(()=>updates++,e=>{throw e;});
 assert.equal(subscriptions.length,2);assert.equal(monthCalls,0);
 const d={id:'same',data:()=>({clientTimeMs:dateMs,userName:'tester'})};
 subscriptions[0].next({docs:[d]});subscriptions[1].next({docs:[d]});
 assert.equal((await read).length,1);assert.equal(updates,1);
 await dayContext.window.step97ReadToday(today);assert.equal(subscriptions.length,2);
 dayContext.window.step97SubscribeToday(()=>updates++,e=>{throw e;});assert.equal(subscriptions.length,2);
 subscriptions[0].next({docs:[d,{id:'new',data:()=>({clientTimeMs:dateMs+60000})}]});assert.equal(updates,4);
 console.log('PASS: today init/reload/live consumer share two date-scoped streams, no get, legacy visit dates retained, duplicate rows merged, updates reach both consumers');
 // Execute actual loader, not a mirror: boot today cannot call the month pager.
 const loadBody=html.slice(html.indexOf('  async function loadLogs(){'),html.indexOf('  async function loadTodayLogs(){'));
 const c={Date,Map,state:{all:false,detailScope:'today',registeredUsers:['tester']},window:{},dateKey:()=>today,
 time:r=>new Date(r.clientTimeMs),user:r=>r.userName,uniq:a=>[...new Set(a)],readLogRange:async(key,monthly)=>{assert.equal(key,today);assert.ok(!monthly);return [{id:'today',clientTimeMs:dateMs,userName:'tester'}];},monthPager:{has:()=>{throw Error('monthly read on boot');}}};
 vm.createContext(c);vm.runInContext(loadBody,c);await c.loadLogs();assert.equal(c.state.logs.length,1);
 assert.ok(html.includes("init(false,'today')});"));
 assert.ok(html.includes("'선택 월 전체 기록을 추가 조회합니다."));
 assert.ok(html.includes("if(partial())return alert('월 전체 엑셀"));
 console.log('PASS: actual initial loader never requests monthly data; partial monthly totals/export explicitly guarded');
 console.log(JSON.stringify({fixtureMonthDocuments:1200,visitDateOverlaps:600,previousMonthReturnedDocuments:1800,newFirstMonthReturnedDocuments:100,reductionPercent:94.44,note:'Synthetic returned-document counts, not production billing measurements. Today monitor and settings excluded.'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
