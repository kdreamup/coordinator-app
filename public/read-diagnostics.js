(function(root){
  'use strict';
  const KEY='coordinator_read_diagnostics_v1',MAX=400;
  const meta=new WeakMap();let rows=[],sequence=0,active=0,installed=false;
  try{rows=JSON.parse(root.localStorage.getItem(KEY)||'[]').slice(-MAX);}catch(_){}
  function keep(row){
    rows.push(row);rows=rows.slice(-MAX);
    try{root.localStorage.setItem(KEY,JSON.stringify(rows));}catch(_){}
  }
  function origin(){
    return String(new Error().stack||'').split('\n').slice(2,9).map(line=>{
      const match=line.match(/(?:at\s+)?([\w.$<>]+)\s*(?:@|\()/);
      return match?match[1]:'anonymous';
    }).filter(x=>!['origin','begin'].includes(x));
  }
  function begin(ref,kind,extra={}){
    const row={id:++sequence,at:new Date().toISOString(),page:root.location?.pathname?.split('/').pop()||'app',
      kind,scope:meta.get(ref)||{},callers:origin(),...extra};
    active++;keep({...row,state:'started',active});return row;
  }
  function finish(row,snapshot,error){
    active=Math.max(0,active-1);
    const result={...row,at:new Date().toISOString(),state:error?'error':'received',active};
    if(error)result.code=String(error.code||'unknown');
    else{
      result.documents=typeof snapshot?.size==='number'?snapshot.size:(snapshot?.exists?1:0);
      result.fromCache=!!snapshot?.metadata?.fromCache;
      if(typeof snapshot?.docChanges==='function')result.changedDocuments=snapshot.docChanges().length;
    }
    keep(result);
  }
  function install(db,sdk,options={}){
    if(installed)return;installed=true;
    const qp=sdk.Query.prototype,dp=sdk.DocumentReference.prototype;
    const collection=db.collection;
    db.collection=function(path){const ref=collection.apply(this,arguments);meta.set(ref,{collection:String(path).split('/')[0],filters:[]});return ref;};
    ['where','orderBy','limit','limitToLast','startAt','startAfter','endAt','endBefore'].forEach(name=>{
      const original=qp[name];if(typeof original!=='function')return;
      qp[name]=function(){
        const next=original.apply(this,arguments),scope=meta.get(this)||{};
        const nextScope={...scope,filters:[...(scope.filters||[])]};
        if(name==='where')nextScope.filters.push({field:typeof arguments[0]==='string'?arguments[0]:'fieldPath',operator:arguments[1]});
        if(name==='limit'||name==='limitToLast')nextScope.limit=Number(arguments[0]);
        meta.set(next,nextScope);return next;
      };
    });
    const doc=sdk.CollectionReference.prototype.doc;
    sdk.CollectionReference.prototype.doc=function(){const ref=doc.apply(this,arguments);meta.set(ref,{...meta.get(this),document:true});return ref;};
    [qp,dp].forEach(proto=>{
      const get=proto.get;
      proto.get=function(options){
        const row=begin(this,'get',{source:options?.source||'default'});
        try{return get.apply(this,arguments).then(s=>{finish(row,s);return s;},e=>{finish(row,null,e);throw e;});}
        catch(e){finish(row,null,e);throw e;}
      };
      const listen=proto.onSnapshot;
      proto.onSnapshot=function(){
        const args=[...arguments],row=begin(this,'listen');let first=true,closed=false;
        const received=s=>{
          if(first){first=false;finish(row,s);}
          else {const event=begin(this,'listen-update');finish(event,s);}
        };
        const failed=e=>{if(first){first=false;finish(row,null,e);}else keep({...row,state:'listen-error',code:String(e.code||'unknown'),at:new Date().toISOString()});};
        let i=args.findIndex(x=>typeof x==='function'||x&&typeof x.next==='function');
        if(i>=0&&typeof args[i]==='function'){
          const next=args[i],error=args[i+1];args[i]=s=>{received(s);next(s);};args[i+1]=e=>{failed(e);if(typeof error==='function')error(e);};
        }else if(i>=0){const observer=args[i];args[i]={next:s=>{received(s);observer.next(s);},error:e=>{failed(e);observer.error?.(e);},complete:()=>observer.complete?.()};}
        let unsub;try{unsub=listen.apply(this,args);}catch(e){failed(e);throw e;}
        return ()=>{if(closed)return;closed=true;if(first){active=Math.max(0,active-1);first=false;}keep({...row,at:new Date().toISOString(),state:'unsubscribed'});unsub();};
      };
    });
    const transaction=db.runTransaction;
    db.runTransaction=function(callback,options){
      return transaction.call(this,tx=>{
        const get=tx.get;tx.get=function(ref){const row=begin(ref,'transaction-get');try{return get.call(this,ref).then(s=>{finish(row,s);return s;},e=>{finish(row,null,e);throw e;});}catch(e){finish(row,null,e);throw e;}};
        return callback(tx);
      },options);
    };
    if(options.readOnly){
      const blocked=()=>{const e=new Error('조회 진단 전용 앱에서는 출퇴근·방문 저장·수정·삭제를 실행하지 않습니다.');e.code='audit-read-only';return Promise.reject(e);};
      ['set','update','delete'].forEach(name=>{dp[name]=blocked;});
      sdk.CollectionReference.prototype.add=blocked;
      db.runTransaction=blocked;
      db.batch=()=>({set(){return this;},update(){return this;},delete(){return this;},commit:blocked});
    }
    keep({at:new Date().toISOString(),state:'installed',readOnly:!!options.readOnly,note:'Client observations only; not exact billable read counts. No names, document IDs, query values or document contents are recorded.'});
  }
  function show(){
    let box=root.document.getElementById('read-diagnostics-panel');
    if(!box){box=root.document.createElement('details');box.id='read-diagnostics-panel';box.style.cssText='margin:12px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;max-width:100%;box-sizing:border-box;background:white;color:#334155;font:14px sans-serif';
      const title=root.document.createElement('summary');title.textContent='조회 진단 · 이 기기의 요청만 기록';box.appendChild(title);
      const help=root.document.createElement('p');help.textContent='시험 동작 후 아래 진단 내용을 복사해 전달해주세요. 다른 직원 기기나 외부 접근은 이 기록에 포함되지 않습니다.';box.appendChild(help);
      const area=root.document.createElement('textarea');area.readOnly=true;area.style.cssText='width:100%;height:180px;box-sizing:border-box;font:12px monospace';box.appendChild(area);
      const refresh=root.document.createElement('button');refresh.textContent='진단 내용 갱신';refresh.onclick=()=>area.value=JSON.stringify({version:1,events:rows},null,2);box.appendChild(refresh);
      const select=root.document.createElement('button');select.textContent='진단 내용 선택';select.onclick=()=>{refresh.onclick();area.focus();area.select();};box.appendChild(select);
      box.addEventListener('toggle',()=>{if(box.open)refresh.onclick();});root.document.body.appendChild(box);
    }
  }
  root.CoordinatorReadDiagnostics={install,events:()=>JSON.parse(JSON.stringify(rows)),show};
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',show);else show();}
})(typeof window!=='undefined'?window:globalThis);
