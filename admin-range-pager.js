/* Bounded, retry-safe reads. Cursors advance only after every stream succeeds. */
function createAdminRangePager({fetchPage, getTime, pageSize=50}) {
  const entries=new Map();
  function entry(key){
    if(!entries.has(key))entries.set(key,{rows:new Map(),cursors:[null,null],done:[false,false],busy:null});
    return entries.get(key);
  }
  async function next(key){
    const e=entry(key);
    if(e.busy)return e.busy;
    if(e.done.every(Boolean))return snapshot(key);
    e.busy=(async()=>{
      const pages=await Promise.all(['timestamp','visitDateTime'].map((field,i)=>
        e.done[i]?null:fetchPage(key,field,e.cursors[i],pageSize)));
      pages.forEach((page,i)=>{
        if(!page)return;
        page.forEach(doc=>e.rows.set(doc.id,{id:doc.id,...doc.data()}));
        if(page.length)e.cursors[i]=page[page.length-1];
        e.done[i]=page.length<pageSize;
      });
      return snapshot(key);
    })();
    try{return await e.busy;}finally{e.busy=null;}
  }
  function snapshot(key){const e=entry(key);return {rows:[...e.rows.values()].filter(row=>{const d=new Date(getTime(row));return Number.isFinite(d.getTime())&&new Date(d.getTime()+9*3600000).toISOString().slice(0,7)===key;}).sort((a,b)=>getTime(b)-getTime(a)),complete:e.done.every(Boolean)};}
  return {next,snapshot,has:key=>entries.has(key),sync:(key,rows)=>{entry(key).rows=new Map(rows.map(row=>[row.id,row]));},reset:key=>entries.delete(key),clear:()=>entries.clear()};
}
if(typeof module!=='undefined')module.exports={createAdminRangePager};
