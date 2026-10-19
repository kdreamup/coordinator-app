const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('public/read-diagnostics.js','utf8');
const storage=new Map();let network=0,unsubs=0,retry=0,callback,listenError;
const snap={size:2,docs:[{data:()=>({private:'secret'})}],metadata:{fromCache:false},docChanges:()=>[{}]};
class Query{
 where(){return new Query()}orderBy(){return new Query()}limit(){return new Query()}
 get(options){network++;if(options?.source==='fail')return Promise.reject(Object.assign(Error('private message'),{code:'resource-exhausted'}));return Promise.resolve(snap)}
 onSnapshot(...args){callback=args.find(x=>typeof x==='function'||x?.next);listenError=args[args.indexOf(callback)+1];return ()=>unsubs++}
}
class DocumentReference{get(){network++;return Promise.resolve({exists:true,metadata:{fromCache:true}})}onSnapshot(...args){return Query.prototype.originalListen.apply(this,args)}}
Query.prototype.originalListen=Query.prototype.onSnapshot;
class CollectionReference extends Query{doc(){return new DocumentReference()}}
const db={collection(){return new CollectionReference()},runTransaction(fn,options){assert.equal(options.maxAttempts,3);retry++;return fn({get:ref=>ref.get()})}};
const c={Map,WeakMap,Date,JSON,Number,String,Error,Promise,console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{pathname:'/index.html'}};vm.createContext(c);vm.runInContext(source,c);const d=c.CoordinatorReadDiagnostics;d.install(db,{Query,DocumentReference,CollectionReference});d.install(db,{Query,DocumentReference,CollectionReference});
(async()=>{
 assert.equal(await db.collection('attendanceLogs').where('userName','==','secret-name').where('timestamp','>=','secret-value').limit(12).get({source:'server'}),snap);
 assert.equal(network,1);let events=d.events();const result=events.find(x=>x.state==='received');assert.equal(result.documents,2);assert.equal(result.scope.collection,'attendanceLogs');assert.equal(result.scope.filters.length,2);assert.equal(result.scope.limit,12);
 await assert.rejects(db.collection('attendanceLogs').get({source:'fail'}),e=>e.code==='resource-exhausted');
 const doc=db.collection('attendanceLogs').doc('private-id');assert.equal((await doc.get()).exists,true);
 let received=0;const stop=db.collection('attendanceLogs').onSnapshot({includeMetadataChanges:true},s=>{assert.equal(s,snap);received++});callback(snap);callback(snap);stop();stop();assert.equal(received,2);assert.equal(unsubs,1);
 let observed=0;const stop2=db.collection('attendanceLogs').onSnapshot({next(){observed++},error(){observed++}});callback.next(snap);callback.error({code:'unavailable'});stop2();assert.equal(observed,2);
 const out=await db.runTransaction(tx=>tx.get(doc),{maxAttempts:3});assert.equal(out.exists,true);assert.equal(retry,1);
 // This mock calls the reference get inside tx.get; a real SDK transaction is distinct.
 assert(d.events().some(e=>e.kind==='transaction-get'&&e.state==='received'));
 const json=JSON.stringify(d.events());for(const secret of ['secret-name','secret-value','private-id','private message'])assert(!json.includes(secret));
 assert.equal(d.events().filter(x=>x.state==='installed').length,1);
 for(let i=0;i<210;i++)await db.collection('attendanceLogs').get();assert.equal(d.events().length,400);
 let writes=0;
 class RQ{get(){return Promise.resolve(snap)}onSnapshot(){return ()=>{}}}
 class RD{set(){writes++}update(){writes++}delete(){writes++}}
 class RC extends RQ{doc(){return new RD()}add(){writes++}}
 const rodb={collection:()=>new RC(),runTransaction(){writes++},batch(){writes++}};
 const rc={...c};vm.createContext(rc);vm.runInContext(source,rc);rc.CoordinatorReadDiagnostics.install(rodb,{Query:RQ,DocumentReference:RD,CollectionReference:RC},{readOnly:true});
 const rd=rodb.collection('attendanceLogs').doc('private-id');
 for(const f of [()=>rd.set({}),()=>rd.update({}),()=>rd.delete(),()=>rodb.collection('attendanceLogs').add({}),()=>rodb.runTransaction(()=>{}),()=>rodb.batch().set(rd,{}).commit()])await assert.rejects(f(),e=>e.code==='audit-read-only');
 assert.equal(writes,0);
 console.log('PASS read-only audit blocks all six write entry points before network');
 console.log('PASS exact results, errors, callbacks, unsubscribe, transaction options, redacted values, bounded local events, idempotent install');
})().catch(e=>{console.error(e);process.exitCode=1});
