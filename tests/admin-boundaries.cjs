const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const admin=fs.readFileSync('public/admin_test.html','utf8'),app=fs.readFileSync('index.html','utf8');
for(const [,attrs,body] of admin.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!attrs.includes('src='))new vm.Script(body);
const getFunction=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
let logs=[{id:'start',userName:'tester',type:'일과 시작',clientTimeMs:1},{id:'end',userName:'tester',type:'일과 종료',clientTimeMs:2},{id:'visit',userName:'tester',type:'방문사례기록',clientTimeMs:3},{id:'other',userName:'other',type:'일과 시작',clientTimeMs:4}];
let correction,exported;
const elements={step87CorrUser:{value:'tester'},step87CorrDate:{value:'2026-10-07'},step87CorrBy:{value:'관리자'},step90ResetBoundary:{disabled:false}};
const context={Date,console,document:{getElementById:id=>elements[id]},n:v=>String(v||'').trim(),confirm:()=>true,
 dateKey:()=> '2026-10-07',time:l=>l.clientTimeMs,type:l=>l.type,corrId:(n,d)=>d+'__'+n,CORRECTIONS:'attendanceCorrections',closeCorrection:()=>{},toast:()=>{},
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}},
 db:{collection:name=>({where:()=>({get:async()=>({docs:logs.filter(l=>l.userName==='tester').map(l=>({ref:{id:l.id},data:()=>l}))})}),doc:id=>({id})}),batch:()=>{
 const removed=[];return{delete:ref=>removed.push(ref.id),set:(ref,data)=>correction=data,commit:async()=>{logs=logs.filter(l=>!removed.includes(l.id));}};
 }}
};
vm.createContext(context);
vm.runInContext(getFunction(admin,'  async function resetWorkBoundaries(){','  const baseCalcWork='),context);
(async()=>{
 await context.resetWorkBoundaries();assert.deepEqual(logs.map(l=>l.id),['visit','other']);assert.equal(correction.correctedStartMs,null);assert.equal(correction.correctedEndMs,null);assert.ok(correction.boundaryResetAtMs>0);assert.equal(elements.step90ResetBoundary.disabled,false);
 // Invoke the actual Excel export function: both boundaries are excluded.
 context.state={filtered:[{type:'일과 시작'},{type:'일과 종료'},{type:'방문사례기록'}],all:false,month:'2026-10'};
 Object.assign(context,{acts:()=>['건강관리'],gpsInfo:()=>({lat:null,lng:null}),gpsStatusInfo:()=>({}),client:()=>'',reason:()=>'',housing:()=>'',memo:()=>'',user:()=>'',fmtDT:()=>'',fmtDur:()=>'',duration:()=>0,alert:()=>{}});
 context.XLSX={utils:{json_to_sheet:rows=>{exported=rows;return{};},book_new:()=>({}),book_append_sheet:()=>{}},writeFile:()=>{}};
 vm.runInContext(getFunction(admin,'  function exportRows(', '  function setMissingStartModal('),context);
 context.exportRows();assert.equal(exported.length,1);assert.equal(exported[0]['유형'],'방문사례기록');
 // Test the real scheduling calculation for all selectable hours.
 const timeCtx={clampWorkHours:x=>x,Math};vm.createContext(timeCtx);
 vm.runInContext(getFunction(app,'  function getTotalScheduledMinutesForWorkHours(', '  function buildWorkBreakFields('),timeCtx);
 for(let h=1;h<=5;h++)assert.equal(timeCtx.getTotalScheduledMinutesForWorkHours(h),h*60);
 // A user absent from attendance records can still be reset by exact name/date.
 elements.step87CorrUser.value='이승현';await context.resetWorkBoundaries();
 assert.equal(correction.userName,'이승현');assert.deepEqual(logs.map(l=>l.id),['visit','other']);
 // The real settings reader handles the app's legacy names field and name objects.
 const configDb=context.db;
 context.db={collection:()=>({doc:id=>({get:async()=>({exists:true,data:()=>id==='userConfig'?{names:['이승현',{name:'김테스트'}]}:{}})})})};
 Object.assign(context,{uniq:xs=>[...new Set(xs.filter(Boolean))],MAIN:[],state:{visitFields:{}}});
 vm.runInContext(getFunction(admin,'  async function loadSettings(){','  async function loadLogs(){'),context);
 await context.loadSettings();assert.ok(context.state.registeredUsers.includes('이승현'));assert.ok(context.state.registeredUsers.includes('김테스트'));
 context.db=configDb;
 console.log('PASS: admin script syntax, reset only selected user/date boundaries, visits retained, Excel boundaries excluded, 1–5 hour scheduling without extra break');
})().catch(e=>{console.error(e);process.exitCode=1;});
