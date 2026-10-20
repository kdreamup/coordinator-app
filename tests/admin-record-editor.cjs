const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const moduleText=fs.readFileSync('admin-record-editor.js','utf8'),html=fs.readFileSync('public/admin_test.html','utf8');
assert.ok(html.includes(moduleText));
for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!attrs.includes('src='))new vm.Script(body);
const elements=new Map(),storage=new Map(),purposeBoxes=[{value:'건강관리(스마케어 등)',checked:false},{value:'이전 목적',checked:false}],rows=new Map(),audits=new Map();
let uuid=0,commits=0,fail=false,lostAck=false,finishCommit;
const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){}},disabled:false,hidden:false});return elements.get(id);};
const stamp=date=>({toDate:()=>date});
const original={id:'existing',userName:'tester',coordinatorName:'tester',type:'방문사례기록',recordType:'visitCase',clientTimeMs:Date.parse('2026-10-19T01:00:00Z'),memo:'첫 줄\n두 번째 줄',activities:['이전 목적'],lat:36.1,lng:127.1,customField:{preserve:true},clientName:'대상자'};
rows.set(original.id,original);
const ctx={Date,Math,Map,JSON,Object,String,Number,Array,Set,console:{error(){}},crypto:{randomUUID:()=>String(++uuid)},window:null,
 document:{getElementById:element,addEventListener(){},querySelectorAll:selector=>selector.endsWith(':checked')?purposeBoxes.filter(x=>x.checked):purposeBoxes},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 $:element,norm:v=>String(v??'').trim(),esc:v=>String(v),uniq:xs=>[...new Set(xs)],MAIN:['건강관리(스마케어 등)'],
 kstDate:v=>new Date(new Date(v).getTime()+9*3600000),kstLocale:v=>new Date(v).toISOString(),dateKey:v=>new Date(new Date(v).getTime()+9*3600000).toISOString().slice(0,10),
 time:l=>l.visitDateTime?.toDate?.()||l.timestamp?.toDate?.()||new Date(l.clientTimeMs),user:l=>l.coordinatorName||l.userName,type:l=>l.recordType==='visitCase'?'방문사례기록':l.type,
 client:l=>l.clientName||l.targetName||'',housing:l=>l.housingType||l.livingType||'',reason:l=>l.visitReason||l.contactType||'',
 fmtDur:ms=>String(ms/60000)+'분',arr:v=>Array.isArray(v)?v:v?[v]:[],duration:l=>l.durationMs||0,acts:l=>l.activities||[],toast:()=>{},confirm:()=>true,buildSelects(){},apply(){},
 logRangeCache:new Map([['month:2026-10',{at:1,rows:[original]}]]),state:{logs:[original],todayLogs:[original],month:'2026-10',all:false,users:['tester']},
 firebase:{firestore:{Timestamp:{fromDate:stamp},FieldValue:{serverTimestamp:()=> 'SERVER_TIME'}}},
 db:{collection:name=>({doc:id=>({name,id})}),batch:()=>{const operations=[];return{set:(ref,data,options)=>operations.push({ref,data,options}),commit:async()=>{
   commits++;if(finishCommit)await new Promise(resolve=>finishCommit=resolve);
   if(fail)throw Object.assign(Error('quota'),{code:'resource-exhausted'});
   for(const op of operations){const target=op.ref.name==='attendanceLogs'?rows:audits;target.set(op.ref.id,{...(target.get(op.ref.id)||{}),...op.data});}
   if(lostAck){lostAck=false;throw Object.assign(Error('ack lost'),{code:'unavailable'});}
 }}}}
};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(moduleText,ctx);
const input={userName:'tester',type:'방문사례기록',when:'2026-10-19T10:00',durationMinutes:17,workHours:5,purposes:['건강관리(스마케어 등)'],clientName:'대상자',content:'첫 줄\n둘째 줄',by:'관리자',reason:'앱 저장 장애',healthCareDetails:'체조, 인지활동',birthYear:'1940',age:'86'};
const patch=ctx.adminRecordEditor.patch(input);assert.equal(patch.timestamp.toDate().toISOString(),'2026-10-19T01:00:00.000Z');assert.equal(patch.memo,input.content);assert.equal(patch.activityDurationMs,17*60000);assert.equal(patch.birthYear,1940);assert.equal(patch.healthCareDetails.length,2);
assert.throws(()=>ctx.adminRecordEditor.patch({...input,durationMinutes:-1}));assert.throws(()=>ctx.adminRecordEditor.patch({...input,reason:''}));assert.throws(()=>ctx.adminRecordEditor.patch({...input,type:'일과 시작'}));
const activity=ctx.adminRecordEditor.patch({...input,type:'활동 기록'});assert.equal(activity.visitDateTime,null);assert.equal(activity.recordType,'activity');assert.equal(activity.visitSummary,'');assert.equal(activity.visitPurposes.length,0);
(async()=>{
 ctx.adminRecordEditor.open('existing');assert.equal(element('adminRecord_content').value,original.memo);assert.ok(element('adminRecordPurposes').innerHTML.includes('이전 목적'));
 element('adminRecord_content').value='전체 내용 수정\n둘째 줄 유지';element('adminRecord_by').value='관리자';element('adminRecord_reason').value='오류 정정';
 fail=true;await ctx.adminRecordEditor.save();assert.ok(element('adminRecordStatus').textContent.includes('서버 저장 실패'));assert.equal(element('adminRecord_content').value,'전체 내용 수정\n둘째 줄 유지');assert.equal(rows.get('existing').memo,original.memo);assert.equal(audits.size,0);assert.ok(storage.size);
 fail=false;lostAck=true;await ctx.adminRecordEditor.save();assert.equal(rows.size,1);assert.equal(audits.size,1);
 await ctx.adminRecordEditor.save();assert.equal(rows.size,1);assert.equal(audits.size,1);assert.equal(rows.get('existing').lat,36.1);assert.equal(rows.get('existing').customField.preserve,true);assert.equal(rows.get('existing').memo,'전체 내용 수정\n둘째 줄 유지');assert.equal(audits.values().next().value.before.memo,original.memo);assert.equal(storage.size,0);
 assert.equal(ctx.logRangeCache.get('month:2026-10').at,1);
 // Two simultaneous clicks must produce one batch, and activity/visit writes
 // must not issue a Firestore read before or after commit.
 ctx.adminRecordEditor.open('existing');element('adminRecord_reason').value='두 번 클릭 확인';const prior=commits;finishCommit=true;
 const first=ctx.adminRecordEditor.save();await ctx.adminRecordEditor.save();assert.equal(commits,prior+1);const finish=finishCommit;finishCommit=null;finish();await first;
 ctx.adminRecordEditor.open();element('adminRecord_userName').value='tester';element('adminRecordType').value='방문사례기록';element('adminRecord_when').value='2026-10-19T15:00';element('adminRecord_clientName').value='새 대상자';element('adminRecord_reason').value='서버에 없는 방문 직접 추가';element('adminRecord_content').value='수동 입력한 전체 내용';purposeBoxes[0].checked=true;
 lostAck=true;await ctx.adminRecordEditor.save();await ctx.adminRecordEditor.save();assert.equal(rows.size,2);assert.equal(audits.size,3);const manual=[...rows.values()].find(x=>x.adminManualEntry);assert.equal(manual.gpsStatus,'not-collected');assert.equal(manual.memo,'수동 입력한 전체 내용');
 console.log('PASS: actual admin edit/save, complete text and old purpose retained, KST, all structured fields, no reads, GPS/unknown fields retained, atomic audit, quota failure draft, lost-ack retry idempotence, double-click guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
