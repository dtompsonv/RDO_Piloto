function firebaseDouble(){
  const rows=new Map(), listeners=new Map(); let serial=0, authCallback;
  const stamp=()=>({toMillis:()=>Date.now(),toDate:()=>new Date()});
  rows.set('obras/obra1',{obra:'Obra A',membros:['tester'],editores:['tester'],proprietario:'tester',dataInicio:'2026-01-01',dataFim:'2026-12-31'});
  rows.set('obras/obra2',{obra:'Obra B',membros:['tester'],editores:['tester'],proprietario:'tester'});
  const copy=v=>v===undefined ? undefined : structuredClonePlain(v);
  function structuredClonePlain(v){
    if(v?.toMillis) return stamp();
    if(Array.isArray(v)) return v.map(copy);
    if(v && typeof v==='object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)]));
    return v;
  }
  const snap=(p)=>({id:p.split('/').at(-1),ref:new Ref(p),exists:rows.has(p),data:()=>copy(rows.get(p)),metadata:{hasPendingWrites:false}});
  function notify(){ for(const [key,callbacks] of listeners) for(const cb of callbacks) queueMicrotask(()=>cb(key instanceof Query ? key.snapshot() : snap(key))); }
  class Ref {
    constructor(p){this.path=p;this.id=p.split('/').at(-1);}
    collection(n){return new Query(this.path+'/'+n);}
    get(){return Promise.resolve(snap(this.path));}
    set(v){rows.set(this.path,copy(v));notify();return Promise.resolve();}
    update(v){rows.set(this.path,{...rows.get(this.path),...copy(v)});notify();return Promise.resolve();}
    delete(){rows.delete(this.path);notify();return Promise.resolve();}
    onSnapshot(cb){if(!listeners.has(this.path))listeners.set(this.path,new Set());listeners.get(this.path).add(cb);queueMicrotask(()=>cb(snap(this.path)));return ()=>listeners.get(this.path).delete(cb);}
  }
  class Query {
    constructor(p,filters=[]){this.path=p;this.filters=filters;}
    doc(id){return new Ref(this.path+'/'+(id||'id'+(++serial)));}
    where(k,op,v){return new Query(this.path,[...this.filters,[k,op,v]]);}
    orderBy(){return this;} limit(){return this;}
    snapshot(){const docs=[...rows.keys()].filter(p=>p.startsWith(this.path+'/')&&p.split('/').length===this.path.split('/').length+1).map(snap).filter(s=>this.filters.every(([k,op,v])=>{const x=k.split('.').reduce((a,b)=>a?.[b],s.data());return op==='array-contains'?x?.includes(v):x===v;}));return {docs,forEach:fn=>docs.forEach(fn),size:docs.length};}
    get(){return Promise.resolve(this.snapshot());}
    add(v){const ref=this.doc();return ref.set(v).then(()=>ref);}
    onSnapshot(cb){const callbacks=new Set([cb]);listeners.set(this,callbacks);queueMicrotask(()=>cb(this.snapshot()));return ()=>listeners.delete(this);}
  }
  const db={collection:p=>new Query(p),runTransaction:async fn=>{
    if(window.mock.failSave) throw Error('Falha simulada');
    const pending=[];
    const result=await fn({get:ref=>ref.get(),set:(ref,data)=>pending.push(()=>rows.set(ref.path,copy(data))),update:(ref,data)=>pending.push(()=>rows.set(ref.path,{...rows.get(ref.path),...copy(data)}))});
    pending.forEach(fn=>fn()); notify(); return result;
  }};
  const auth={onAuthStateChanged:cb=>{authCallback=cb;queueMicrotask(()=>cb({uid:'tester',displayName:'Pessoa Teste'}));},signInWithPopup:async()=>{},signOut:async()=>authCallback(null)};
  const storage={ref:p=>({putString:async(src)=>{if(window.mock.failUpload)throw Error('Falha no upload');window.mock.uploads.push({p,src});},getDownloadURL:async()=>{if(!window.mock.uploads.some(x=>x.p===p)) {const e=Error('Missing');e.code='storage/object-not-found';throw e;}return 'https://firebasestorage.googleapis.com/v0/b/test/o/'+encodeURIComponent(p);}})};
  function authFn(){return auth;} authFn.GoogleAuthProvider=class{};
  function firestore(){return db;} firestore.FieldValue={serverTimestamp:stamp};
  window.firebase={apps:[],app:()=>({}),initializeApp:()=>({}),firestore,auth:authFn,storage:()=>storage};
  window.mock={rows,listeners,notify,db,uploads:[],failSave:false,failUpload:false};
  window.alerts=[];window.alert=m=>window.alerts.push(m);window.confirm=()=>true;
}

firebaseDouble();
