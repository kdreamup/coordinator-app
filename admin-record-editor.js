// Embedded into admin_test.html. No production reads are needed to submit.
(function(){
  const DRAFT='coordinator_admin_record_draft_v1';
  let editing=null,busy=false;
  const fields=[['userName','선생님 이름','text'],['when','기록 일시 (한국시간)','datetime-local'],
    ['durationMinutes','활동시간(분)','number'],['workHours','예정 근무시간','number'],
    ['clientName','대상자명 / 경로당','text'],['gender','성별','text'],['birthYear','출생연도','number'],['age','나이','number'],
    ['housingType','주거 형태','text'],['housingEtc','주거 형태 기타','text'],['visitReason','상담 형태','text'],
    ['visitReasonEtc','상담 형태 기타','text'],['visitPlace','방문 장소','text'],['address','주소','text'],['phone','연락처','text'],
    ['agencySupportDetails','유관기관업무지원 세부 (쉼표로 구분)','text'],['healthCareDetails','건강관리 세부 (쉼표로 구분)','text'],
    ['resourceLinkDetails1','지역복지자원연계 1 (쉼표로 구분)','text'],['resourceLinkDetails2','지역복지자원연계 2 (쉼표로 구분)','text'],
    ['visitPurposeEtc','활동목적 기타','text'],['content','활동·방문 내용 전체','textarea'],['by','작성·수정 관리자','text'],['reason','추가·수정 사유','textarea']];
  const split=value=>String(value||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  const key=()=> 'admin__'+crypto.randomUUID();
  function localTime(value){const d=kstDate(value);return d?d.toISOString().slice(0,16):'';}
  function patch(input){
    if(!norm(input.userName))throw Error('선생님 이름을 입력해주세요.');
    if(!['활동 기록','방문사례기록'].includes(input.type))throw Error('일과 시작·종료는 근무시간 정정에서 저장해주세요.');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.when||''))throw Error('기록 일시를 입력해주세요.');
    const date=new Date(input.when+':00+09:00');if(isNaN(date))throw Error('기록 일시를 확인해주세요.');
    const minutes=Number(input.durationMinutes||0),hours=Number(input.workHours||5);
    if(!Number.isFinite(minutes)||minutes<0)throw Error('활동시간은 0 이상의 숫자로 입력해주세요.');
    if(!Number.isInteger(hours)||hours<1||hours>5)throw Error('예정 근무시간은 1~5시간으로 입력해주세요.');
    if(!norm(input.by)||!norm(input.reason))throw Error('관리자 이름과 추가·수정 사유를 입력해주세요.');
    const purposes=Array.isArray(input.purposes)?input.purposes.map(norm).filter(Boolean):[];
    if(!purposes.length)throw Error('활동목적을 하나 이상 선택해주세요.');
    const visit=input.type==='방문사례기록',content=String(input.content||'');
    if(visit&&!norm(input.clientName))throw Error('대상자명 또는 경로당을 입력해주세요.');
    const details={agencySupport:split(input.agencySupportDetails),healthCare:split(input.healthCareDetails),resourceLink1:split(input.resourceLinkDetails1),resourceLink2:split(input.resourceLinkDetails2)};
    const payload={userName:norm(input.userName),coordinatorName:norm(input.userName),type:input.type,recordType:visit?'visitCase':'activity',
      timestamp:firebase.firestore.Timestamp.fromDate(date),clientTimeMs:date.getTime(),timeStr:kstLocale(date),
      visitDateTime:visit?firebase.firestore.Timestamp.fromDate(date):null,visitDateTimeMs:visit?date.getTime():null,visitDateTimeText:visit?kstLocale(date):'',
      visitDateTimeValue:visit?input.when:'',activitySavedAt:date.getTime(),
      activities:purposes,activitiesText:purposes.join(', '),selectedActivities:purposes,activityNames:purposes,
      visitPurposes:visit?purposes:[],activityPurposes:purposes,purposes:[],activity:'',primaryActivityName:'',secondaryActivities:[],secondaryActivitiesText:'',
      memo:content,content,note:content,normalMemo:content,activityContent:content,visitSummary:visit?content:'',visitContent:visit?content:'',summary:visit?content:'',
      durationMs:minutes*60000,activityDurationMs:minutes*60000,durationMinutes:minutes,activityMinutes:minutes,activityDurationText:fmtDur(minutes*60000),activityStartedAt:date.getTime()-minutes*60000,
      workHours:hours,workHoursText:hours+'시간',
      agencySupportDetails:details.agencySupport,healthCareDetails:details.healthCare,resourceLinkDetails1:details.resourceLink1,resourceLinkDetails2:details.resourceLink2,
      resourceLinkDetails:[...new Set([...details.resourceLink1,...details.resourceLink2])],visitPurposeDetails:details,
      purposeDetailText:[['유관기관업무지원',details.agencySupport],['건강관리',details.healthCare],['지역복지자원연계1',details.resourceLink1],['지역복지자원연계2',details.resourceLink2]].filter(([,a])=>a.length).map(([n,a])=>n+': '+a.join(', ')).join(' / '),
      adminUpdatedBy:norm(input.by),adminUpdateReason:norm(input.reason),adminUpdatedAtMs:Date.now(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    for(const name of ['clientName','gender','housingType','housingEtc','visitReason','visitReasonEtc','visitPlace','address','phone','visitPurposeEtc'])payload[name]=String(input[name]||'');
    Object.assign(payload,{targetName:payload.clientName,elderName:payload.clientName,livingType:payload.housingType,contactType:payload.visitReason});
    for(const name of ['birthYear','age']){
      const value=String(input[name]??'').trim();
      if(value&&(!/^\d+$/.test(value)||Number(value)<0))throw Error(name==='birthYear'?'출생연도를 확인해주세요.':'나이를 확인해주세요.');
      payload[name]=value?Number(value):null;
    }
    return payload;
  }
  function inRange(cacheKey,row){
    if(cacheKey==='all')return true;
    const dk=dateKey(time(row));return cacheKey.startsWith('month:')?dk.slice(0,7)===cacheKey.slice(6):cacheKey.startsWith('day:')&&dk===cacheKey.slice(4);
  }
  function updateMemory(previous,row){
    for(const [cacheKey,hit] of logRangeCache){hit.rows=hit.rows.filter(x=>x.id!==row.id);if(inRange(cacheKey,row))hit.rows.push(row);}
    state.logs=state.logs.filter(x=>x.id!==row.id);
    if(state.all||dateKey(time(row)).slice(0,7)===state.month)state.logs.push(row);
    state.logs.sort((a,b)=>(time(b)?.getTime()||0)-(time(a)?.getTime()||0));
    state.todayLogs=(state.todayLogs||[]).filter(x=>x.id!==row.id);if(dateKey(time(row))===dateKey(new Date()))state.todayLogs.push(row);
    window.__step76AttendanceCache=state.logs;state.users=uniq([...state.users,user(row)]);buildSelects();apply();window.step96RenderLive?.();
  }
  function readForm(){
    const input={type:$('adminRecordType').value,purposes:[...document.querySelectorAll('#adminRecordModal [data-purpose]:checked')].map(x=>x.value)};
    fields.forEach(([name])=>input[name]=$('adminRecord_'+name).value);return input;
  }
  function remember(){if(!editing)return;localStorage.setItem(DRAFT,JSON.stringify({...editing,input:readForm()}));}
  function status(text){$('adminRecordStatus').textContent=text;}
  function close(){if(busy)return;try{remember();}catch(e){status('입력 내용을 기기에 보관하지 못했습니다. 화면을 닫지 말고 저장해주세요.');return;}$('adminRecordModal').classList.remove('open');}
  function show(input){
    $('adminRecordType').value=input.type||'활동 기록';fields.forEach(([name])=>$('adminRecord_'+name).value=input[name]??'');
    $('adminRecordPurposes').innerHTML=uniq([...MAIN,...(input.purposes||[])]).map(p=>`<label class="step87-check"><input type="checkbox" data-purpose value="${esc(p)}">${esc(p)}</label>`).join('');
    document.querySelectorAll('#adminRecordModal [data-purpose]').forEach(x=>x.checked=(input.purposes||[]).includes(x.value));
    $('adminRecordTitle').textContent=editing.original?'기록 전체 수정':'저장되지 않은 기록 직접 추가';status('');$('adminRecordModal').classList.add('open');changeType();
  }
  function changeType(){const boundary=['일과 시작','일과 종료'].includes($('adminRecordType').value);$('adminRecordSave').hidden=boundary;$('adminRecordBoundary').hidden=!boundary;}
  function open(id){
    if(busy)return;
    const original=id?state.logs.find(x=>x.id===id)||state.todayLogs.find(x=>x.id===id):null;
    if(id&&!original)return toast('수정할 기록을 현재 화면에서 찾을 수 없습니다.');
    if(original&&['일과 시작','일과 종료'].includes(type(original)))return window.step96OpenCorrection(user(original),dateKey(time(original)));
    let draft;try{draft=JSON.parse(localStorage.getItem(DRAFT)||'null');}catch(e){}
    if(draft&&((id&&draft.original?.id===id)||(!id&&!draft.original))&&confirm('저장 전 입력하던 내용을 이어서 작성할까요?')){editing=draft;show(draft.input);return;}
    editing={id:original?.id||key(),auditId:key(),original:original||null};
    const input={type:original?type(original):'활동 기록',when:localTime(original?time(original):new Date()),userName:original?user(original):$('userFilter').value,
      durationMinutes:original?duration(original)/60000:0,workHours:original?.workHours||5,purposes:original?acts(original):[],
      clientName:original?client(original):'',housingType:original?housing(original):'',visitReason:original?reason(original):'',
      content:original?String([original.memo,original.visitSummary,original.activityContent,original.content,original.normalMemo,original.note].find(v=>v!=null&&String(v)!=='')??''):'',by:'관리자',reason:''};
    fields.forEach(([name])=>{if(input[name]!==undefined)return;const v=original?.[name];input[name]=Array.isArray(v)?v.join(', '):v??'';});
    const detailAliases={agencySupportDetails:'agencySupport',healthCareDetails:'healthCare',resourceLinkDetails1:'resourceLink1',resourceLinkDetails2:'resourceLink2'};
    for(const [field,alias]of Object.entries(detailAliases))if(!input[field])input[field]=arr(original?.visitPurposeDetails?.[alias]).join(', ');
    if(!input.resourceLinkDetails1&&!input.resourceLinkDetails2)input.resourceLinkDetails1=arr(original?.resourceLinkDetails||original?.visitPurposeDetails?.resourceLink).join(', ');
    if(!input.healthCareDetails)input.healthCareDetails=arr(original?.healthDetails).join(', ');
    show(input);
  }
  async function save(){
    if(busy||!editing)return;
    let input,payload;
    try{input=readForm();payload=patch(input);remember();}catch(e){status(e.message);return;}
    const op=editing;busy=true;$('adminRecordSave').disabled=true;status('서버에 저장 중입니다.');
    try{
      const batch=db.batch(),ref=db.collection('attendanceLogs').doc(op.id);
      if(!op.original)Object.assign(payload,{adminManualEntry:true,createdAt:firebase.firestore.FieldValue.serverTimestamp(),gpsStatus:'not-collected',gpsSource:'admin-manual'});
      batch.set(ref,payload,{merge:true});
      const before=op.original?Object.fromEntries(Object.entries(op.original).filter(([key])=>key!=='id')):null;
      batch.set(db.collection('attendanceRecordEdits').doc(op.auditId),{recordId:op.id,action:op.original?'update':'create',before,after:payload,by:input.by,reason:input.reason,at:firebase.firestore.FieldValue.serverTimestamp()});
      await batch.commit();
      const row={...(op.original||{}),...payload,id:op.id};
      // A confirmed write must not be reported as failed by a local rendering error.
      editing=null;try{localStorage.removeItem(DRAFT);}catch(e){}$('adminRecordModal').classList.remove('open');
      try{updateMemory(op.original,row);}catch(e){console.error('관리자 저장 후 화면 갱신 오류',e);}
      toast('서버에 저장했습니다.');
    }catch(e){console.error('관리자 기록 저장 실패',e);status('서버 저장 실패 ('+(e.code||'오류')+'). 입력 내용은 유지됩니다. 서버 저장 완료가 아닙니다.');}
    finally{busy=false;$('adminRecordSave').disabled=false;}
  }
  function setup(){
    const button=document.createElement('button');button.className='btn b-blue';button.textContent='기록 직접 추가';button.type='button';button.id='adminRecordAdd';button.onclick=()=>open();$('reloadBtn').parentElement.appendChild(button);
    const modal=document.createElement('div');modal.className='step87-modal';modal.id='adminRecordModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-label','관리자 기록 추가 및 수정');
    modal.innerHTML=`<div class="step87-modal-card"><div class="step87-modal-head"><h3 id="adminRecordTitle">기록 전체 수정</h3><button class="btn b-soft" id="adminRecordClose" type="button">닫기</button></div><div class="step87-modal-body"><p class="step87-note">기존 기록은 행의 ‘수정’을 누르세요. 휴대폰에 같은 기록이 보관 중이면 직접 추가한 기록과 나중에 중복될 수 있으므로 먼저 확인해주세요.</p><div class="step87-form-grid"><div><label for="adminRecordType">기록 유형</label><select id="adminRecordType"><option>활동 기록</option><option>방문사례기록</option><option>일과 시작</option><option>일과 종료</option></select></div>${fields.map(([name,label,kind])=>`<div class="${kind==='textarea'?'full':''}"><label for="adminRecord_${name}">${label}</label>${kind==='textarea'?`<textarea id="adminRecord_${name}" rows="4"></textarea>`:`<input id="adminRecord_${name}" type="${kind}" ${kind==='number'?'min="0" step="any"':''}>`}</div>`).join('')}<div class="full"><label>활동목적</label><div id="adminRecordPurposes">${MAIN.map(p=>`<label class="step87-check"><input type="checkbox" data-purpose value="${esc(p)}">${esc(p)}</label>`).join('')}</div></div></div><p class="step87-note">기존 GPS 위치와 원본의 추가 항목은 유지합니다. 일과 시작·종료는 별도 근무시간 정정으로 저장합니다.</p><div role="status" id="adminRecordStatus" style="white-space:pre-wrap;color:#9f1239"></div></div><div class="step87-modal-foot"><button class="btn b-soft" id="adminRecordCancel" type="button">입력 보관 후 닫기</button><button class="btn b-blue" id="adminRecordBoundary" type="button" hidden>근무시간 정정 열기</button><button class="btn b-blue" id="adminRecordSave" type="button">서버에 저장</button></div></div>`;
    document.body.appendChild(modal);$('adminRecordClose').onclick=$('adminRecordCancel').onclick=close;$('adminRecordSave').onclick=save;$('adminRecordType').onchange=changeType;
    modal.addEventListener('input',()=>{try{remember();}catch(e){status('입력 내용을 기기에 보관하지 못했습니다. 화면을 닫지 마세요.');}});
    $('adminRecordBoundary').onclick=()=>{const input=readForm();if(!norm(input.userName)||!input.when)return status('선생님 이름과 기록 일시를 입력해주세요.');close();window.step96OpenCorrection(input.userName,input.when.slice(0,10));};
    const base=renderTable;renderTable=function(){base();const tbody=$('tbody');const ps=Number($('pageSize').value||50),rows=state.filtered.slice((state.page-1)*ps,state.page*ps);[...tbody.querySelectorAll('tr')].forEach((tr,i)=>{if(!rows[i])return;const cell=document.createElement('td'),edit=document.createElement('button');edit.type='button';edit.className='btn b-soft';edit.textContent='수정';edit.onclick=()=>open(rows[i].id);cell.appendChild(edit);tr.appendChild(cell);});const head=tbody.closest('table').querySelector('thead tr');if(head&&!head.querySelector('[data-admin-edit]')){const th=document.createElement('th');th.dataset.adminEdit='1';th.textContent='관리';head.appendChild(th);}};
  }
  window.adminRecordEditor={patch,updateMemory,open,save};
  document.addEventListener('DOMContentLoaded',setup);
})();
