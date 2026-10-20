// Full HTML execution in an isolated DOM. All Firestore methods use synthetic fixtures.
const {JSDOM,VirtualConsole}=require('/tmp/coordinator-admin-test-tools/node_modules/jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const clock=Date.parse('2026-10-20T07:30:00Z');
const docs=Array.from({length:1200},(_,i)=>{
 const t=Date.parse('2026-10-01T09:00:00+09:00')+Math.floor(i/60)*86400000+(i%60)*60000;
 const data={userName:'tester',clientTimeMs:t,timestamp:{toDate:()=>new Date(t)},type:i%3===0?'일과 시작':i%3===1?'일과 종료':'활동 기록',activities:['대상자 상담'],activityDurationMs:60000};
 if(i%2===0)data.visitDateTime={toDate:()=>new Date(t)};
 return {id:'r'+String(i).padStart(4,'0'),data:()=>data};
});
const settle=()=>new Promise(r=>setTimeout(r,450));
async function boot(html){
 const calls=[],errors=[],alerts=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...a)=>errors.push(a.map(String).join(' ')));
 function collection(name){
  function query(filters=[],sort=null,size=null,cursor=null){
   function rows(){let a=name==='attendanceLogs'?docs:[];a=a.filter(d=>filters.every(([field,op,v])=>{let x=d.data()[field];if(x?.toDate)x=x.toDate();if(v?.toDate)v=v.toDate();if(op==='==')return x===v;if(op==='>=')return x>=v;if(op==='<')return x<v;throw Error(op);}));
    if(sort)a=[...a].sort((a,b)=>{const get=d=>sort[0]==='__name__'?d.id:d.data()[sort[0]]?.toDate().getTime();return (get(a)>get(b)?1:get(a)<get(b)?-1:a.id.localeCompare(b.id))*(sort[1]==='desc'?-1:1);});
    if(cursor)a=a.slice(a.findIndex(d=>d.id===cursor.id)+1);if(size)a=a.slice(0,size);return a;}
   const snap=()=>{const a=rows();return {docs:a,forEach:fn=>a.forEach(fn)};};
   return {where:(...f)=>query([...filters,f],sort,size,cursor),orderBy:(field,dir)=>query(filters,[field,dir],size,cursor),limit:n=>query(filters,sort,n,cursor),startAfter:d=>query(filters,sort,size,d),
    get:async()=>{const s=snap();calls.push({name,kind:'get',count:s.docs.length,size});return s;},
    onSnapshot:(next,error)=>{const s=snap();calls.push({name,kind:'listen',count:s.docs.length,size});queueMicrotask(()=>{try{next(s);}catch(e){errors.push(e.stack);}});return ()=>{};},
    doc:id=>({get:async()=>({exists:name==='settings',data:()=>id==='userConfig'?{users:['tester']}:id==='appUpdateConfig'?{minVersionCode:63,latestVersionName:'6.12'}:{}}),set:async()=>{throw Error('Unexpected write');}})};
  }return query();
 }
 const dom=new JSDOM(html,{url:'https://isolated.invalid/admin_test.html',runScripts:'dangerously',virtualConsole:vc,pretendToBeVisual:true,beforeParse(w){
  class Clock extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}static [Symbol.hasInstance](v){return v instanceof Date;}}w.Date=Clock;
  const db={collection,batch:()=>{throw Error('Unexpected batch');}};
  const firestore=()=>db;firestore.Timestamp={fromDate:d=>d,fromMillis:t=>new Date(t)};firestore.FieldPath={documentId:()=>'__name__'};firestore.FieldValue={serverTimestamp:()=>null,arrayUnion:(...x)=>x};
  w.firebase={apps:[],initializeApp:()=>{},firestore};w.alert=x=>alerts.push(x);w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};
 }});
 await settle();assert.deepEqual(errors,[]);return {dom,calls,errors,alerts,reads:()=>calls.filter(c=>c.name==='attendanceLogs').reduce((n,c)=>n+c.count,0)};
}
(async()=>{
 const html=fs.readFileSync('public/admin_test.html','utf8');const fresh=await boot(html);const w=fresh.dom.window,d=w.document;
 assert.ok(d.querySelector('#monthBadge').textContent.includes('오늘'));
 assert.equal(fresh.calls.filter(c=>c.name==='attendanceLogs').length,2);
 assert.equal(fresh.reads(),90);assert.equal(d.querySelector('#tableInfo').textContent.includes('60건'),true);
 d.querySelector('#reloadBtn').click();await settle();assert.equal(fresh.reads(),90);
 d.querySelector('#loadMonth').click();await settle();assert.equal(fresh.reads(),190);
 assert.ok(d.querySelector('#tableInfo').textContent.includes('일부 자료'));
 assert.equal(d.querySelector('#workTime').textContent,'전체 조회 후 집계');
 assert.equal(d.querySelector('#excelInactiveBtn').disabled,true);
 d.querySelector('#excelAllBtn').click();assert.ok(fresh.alerts.some(s=>s.includes('월 전체 엑셀')));
 d.querySelector('#step97Full').click();await settle();assert.ok(d.querySelector('#tableInfo').textContent.includes('1200건'));
 assert.equal(d.querySelector('#step97More').hidden,true);assert.equal(d.querySelector('#excelInactiveBtn').disabled,false);
 d.querySelector('#step97Today').click();await settle();assert.ok(d.querySelector('#tableInfo').textContent.includes('60건'));
 assert.deepEqual(fresh.errors,[]);
 const baseline=process.env.ADMIN_BASELINE_FILE;const old=baseline?await boot(fs.readFileSync(baseline,'utf8')):null;
 console.log(JSON.stringify({oldFirstLoadReturnedDocs:old?old.reads():null,newFirstLoadReturnedDocs:90,newSamePageReloadExtraReturnedDocs:0,monthFirstPageExtraReturnedDocs:100,fixtures:1200,productionNetwork:false}));
 console.log('PASS: actual full HTML boot/today/reload/month/partial totals/export guard/all-month/today return; no runtime errors or writes; all old records retained');
 fresh.dom.window.close();if(old)old.dom.window.close();
})().catch(e=>{console.error(e);process.exit(1);});
