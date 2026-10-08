const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const body=html.slice(html.indexOf('  /* Durable visit outbox:'),html.indexOf('  const LS_LAST_USER'));
const mem=new Map(),records=new Map();let fail=true,ackLost=false,storageFail=false,reads=0;
const make=()=>{const c={setTimeout,clearTimeout,console,Math,Date,JSON,Promise,encodeURIComponent,currentUserName:'tester',navigator:{onLine:true},document:{visibilityState:'visible',addEventListener:()=>{}},setInterval:()=>0,
localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>{if(storageFail)throw Error('storage full');mem.set(k,v);}},
firebase:{firestore:{Timestamp:{fromMillis:ms=>({ms})},FieldValue:{serverTimestamp:()=>0}}},
db:{collection:()=>({doc:id=>({id})}),runTransaction:async fn=>{if(fail){const e=Error('Quota exceeded');e.code='resource-exhausted';throw e;}await fn({get:async ref=>{reads++;return {exists:records.has(ref.id)};},set:(ref,data)=>records.set(ref.id,data)});if(ackLost){ackLost=false;throw Error('acknowledgement lost');}}}};c.window=c;c.addEventListener=()=>{};c.step93RememberQuota=()=>{};vm.createContext(c);vm.runInContext(body,c);return c;};
(async()=>{let c=make();const original=1791349586870;
c.queueVisitPayload({userName:'tester',clientTimeMs:original,visitSummary:'full memo',visitPurposes:['상담'],activityStartedAt:original-50000},'visit1');
await c.flushVisitOutbox();assert.equal(c.visitOutboxStatus().length,1);
// Restart/update: identical storage keys retain the full original payload.
c=make();assert.equal(c.visitOutboxStatus()[0].payload.visitSummary,'full memo');
c.queueVisitPayload({userName:'other',clientTimeMs:original,visitSummary:'other'},'other');
fail=false;ackLost=true;await c.flushVisitOutbox();assert.equal(records.size,1);assert.equal(c.visitOutboxStatus().length,1);
await Promise.all([c.flushVisitOutbox(),c.flushVisitOutbox()]);assert.equal(records.size,1);assert.equal(c.visitOutboxStatus().length,0);assert.equal(records.get('visit1').timestamp.ms,original);assert.equal(JSON.parse(mem.get('coordinator_pending_visits_v1')).length,1);
c.queueVisitPayload({userName:'tester',clientTimeMs:original},'blocked');const before=reads;c.step93QuotaBlocked=()=>true;await c.flushVisitOutbox();assert.equal(reads,before);assert.equal(c.visitOutboxStatus().length,1);
storageFail=true;assert.throws(()=>c.queueVisitPayload({userName:'tester',clientTimeMs:original},'full'));storageFail=false;
// A server request that never resolves must release the retry lock and retain its payload.
c.step93QuotaBlocked=()=>false;
const realDeadline=c.visitTransferWithDeadline;c.visitTransferWithDeadline=p=>realDeadline(p,5);
const transaction=c.db.runTransaction;c.db.runTransaction=()=>new Promise(()=>{});
assert.equal(await c.flushVisitOutbox(),false);
assert.equal(c.visitOutboxStatus()[0].lastError.code,'deadline-exceeded');
c.db.runTransaction=transaction;await c.flushVisitOutbox();assert.equal(c.visitOutboxStatus().length,0);
const bootstrap=html.slice(html.indexOf('  const firebaseConfig ='),html.indexOf('  /* Durable visit outbox:'));
function boot(env,existing){let initialized=0,firestoreOpened=0,emulator;
 const app=existing?{options:{projectId:existing}}:null;
 const b={window:{COORDINATOR_TEST_ENV:env},firebase:{apps:app?[app]:[],app:()=>b.firebase.apps[0],initializeApp:config=>{initialized++;b.firebase.apps.push({options:config});},firestore:()=>{firestoreOpened++;return {useEmulator:(...args)=>emulator=args};}}};
 vm.createContext(b);return {run:()=>vm.runInContext(bootstrap+';activeFirebaseProjectId',b),stats:()=>({initialized,firestoreOpened,emulator})};}
for(const env of [{config:{projectId:'attendance-system-e2848'}},{emulator:{host:'127.0.0.1'}}]){const b=boot(env);assert.throws(b.run);assert.equal(b.stats().firestoreOpened,0);}
const mismatch=boot({config:{projectId:'test-project'}},'attendance-system-e2848');assert.throws(mismatch.run);assert.equal(mismatch.stats().firestoreOpened,0);
const isolated=boot({config:{projectId:'demo-coordinator'},emulator:{host:'127.0.0.1',port:8080}});assert.equal(isolated.run(),'demo-coordinator');assert.equal(isolated.stats().emulator[1],8080);
assert.equal(boot(undefined).run(),'attendance-system-e2848');
assert.ok(html.includes(".where('timestamp','<',firebase.firestore.Timestamp.fromMillis(end.getTime()))"));
console.log('PASS: complete visit retention, restart/update, quota suppression, lost acknowledgement, concurrent retry, original time, user isolation, storage failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
