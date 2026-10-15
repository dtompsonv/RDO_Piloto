/* Regression tests use a local Firebase double: no production reads/writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root=path.resolve(__dirname,'..');
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
async function main(){
  const server=http.createServer((req,res)=>{
    const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.gstatic.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(firebaseDouble);
  try {
    await page.goto(url); await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('Pessoa Teste'));
    await page.evaluate(()=>abrirDia('2026-10-15','obra1'));
    await page.waitForFunction(()=>!!baseData);
    assert.equal(await page.locator('.rdo-layout').isVisible(),true);
    const first=await page.evaluate(()=>docId);
    await page.evaluate(()=>abrirDia('2026-10-15','obra1'));
    assert.equal(await page.evaluate(()=>docId),first,'same day reuses report');
    assert.equal(await page.evaluate(()=>[...mock.rows.keys()].filter(k=>/^rdos\/[^/]+$/.test(k)).length),1);
    await page.evaluate(()=>{
      document.getElementById('gridDireta').querySelector('input').value='7';
      document.getElementById('gridEquip').querySelector('input').value='3';
      addComentario('Autor <teste>','Texto </textarea><img src=x onerror=alert(1)>','2026-10-15T08:12');
      addOcorrencia('Fiscal','Ocorrência','2026-10-15T09:13');
      addAtividade('1','Descrição " <img src=x onerror=alert(1)>','Em andamento');
    });
    await page.evaluate(()=>salvarNoFirebase());
    await page.evaluate(()=>openDocument(docId));
    assert.equal(await page.locator('#badgeMaoObraTotal').textContent(),'7');
    assert.equal(await page.locator('#badgeEquipTotal').textContent(),'3');
    assert.equal(await page.locator('#gridDireta .card-item').count(),24);
    assert.equal(await page.locator('#listaComentarios input[type=datetime-local]').inputValue(),'2026-10-15T08:12');
    assert.equal(await page.locator('#listaOcorrencias input[type=datetime-local]').inputValue(),'2026-10-15T09:13');
    assert.equal(await page.locator('#listaComentarios img').count(),0,'stored text cannot inject HTML');
    assert.equal(await page.locator('#bodyAtiv img').count(),0);
    await page.evaluate(()=>abrirDia('2026-10-16','obra1'));
    assert.notEqual(await page.evaluate(()=>docId),first);
    assert.equal(await page.locator('#badgeMaoObraTotal').textContent(),'0','new day starts empty');
    await page.evaluate(()=>abrirDia('2026-10-15','obra1'));
    assert.equal(await page.locator('#badgeMaoObraTotal').textContent(),'7');
    // Same-field conflict must not overwrite either side.
    await page.evaluate(()=>{document.getElementById('local').value='Minha edição';const p='rdos/'+docId;const remote=mock.rows.get(p);remote.dados.campos.local='Edição remota';remote.versao++;mock.notify();});
    await page.waitForTimeout(20);
    assert.match(await page.evaluate(()=>salvarNoFirebase().then(()=>'',e=>e.code)),/rdo\/conflict/);
    assert.equal(await page.locator('#local').inputValue(),'Minha edição');
    assert.equal(await page.evaluate(()=>mock.rows.get('rdos/'+docId).dados.campos.local),'Edição remota');
    await page.evaluate(()=>recarregarRemoto());
    // Independent-field edits merge without loss.
    await page.evaluate(()=>{document.getElementById('local').value='Trecho local';const r=mock.rows.get('rdos/'+docId);r.dados.campos.contratada='Empresa remota';r.versao++;mock.notify();});
    await page.evaluate(()=>salvarNoFirebase());
    assert.equal(await page.locator('#contratada').inputValue(),'Empresa remota');
    assert.equal(await page.locator('#local').inputValue(),'Trecho local');
    // A failed manual save must never announce success or allow navigation.
    await page.evaluate(()=>{mock.failSave=true;document.getElementById('local').value='Pendente';alerts.length=0;});
    await page.evaluate(()=>salvarRascunho());
    assert.equal(await page.evaluate(()=>alerts.some(x=>x==='RDO salvo com sucesso!')),false);
    assert.match(await page.evaluate(()=>alerts[0]),/não salvo/);
    await page.evaluate(()=>abrirDia('2026-10-17','obra1'));
    assert.equal(await page.evaluate(()=>docId),first);
    assert.equal(await page.locator('#local').inputValue(),'Pendente');
    await page.evaluate(()=>{mock.failSave=false;});await page.evaluate(()=>salvarNoFirebase());
    // Photos, logo and all signatures round-trip through Storage references.
    const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
    await page.evaluate(src=>{appendPhoto(src,'Foto " <teste>');for(const id of ['logoImg','assinExecImg','assinSupImg','assinFiscImg'])document.getElementById(id).src=src;},pixel);
    await page.evaluate(()=>salvarNoFirebase());
    await page.evaluate(()=>openDocument(docId));
    assert.match(await page.locator('#fotoGrid img').getAttribute('src'),/^https:\/\/firebasestorage/);
    assert.equal(await page.locator('#fotoGrid input').inputValue(),'Foto " <teste>');
    for(const id of ['logoImg','assinExecImg','assinSupImg','assinFiscImg']) assert.match(await page.locator('#'+id).getAttribute('src'),/^https:\/\/firebasestorage/);
    const historyCount=await page.evaluate(()=>[...mock.rows.keys()].filter(k=>k.startsWith('rdos/'+docId+'/historico/')).length);
    assert.ok(historyCount>=5,'each successful changed save has history');
    await page.evaluate(()=>restaurarVersao('v1'));
    assert.equal(await page.locator('#fotoGrid img').count(),0,'restore resets attachments');
    assert.equal(await page.locator('#badgeMaoObraTotal').textContent(),'0','restore resets quantities');
    await page.evaluate(()=>openDocument(docId));
    assert.equal(await page.locator('#fotoGrid img').count(),0,'restoration was persisted');
    const otherPixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await page.evaluate(src=>{mediaCache.clear();appendPhoto(src,'Upload pendente');mock.failUpload=true;},otherPixel);
    const beforeFailedUpload=await page.evaluate(()=>mock.rows.get('rdos/'+docId).versao);
    await page.evaluate(()=>salvarRascunho());
    assert.equal(await page.evaluate(()=>mock.rows.get('rdos/'+docId).versao),beforeFailedUpload,'failed upload cannot commit incomplete data');
    assert.match(await page.locator('#fotoGrid img').getAttribute('src'),/^data:image/,'failed upload preserves local photo');
    await page.evaluate(()=>{mock.failUpload=false;}); await page.evaluate(()=>salvarNoFirebase());
    // Direct URL must show the parent layout, and infer the obra from the report.
    await page.evaluate(async()=>{await voltarParaObras();history.replaceState({},'','?doc='+encodeURIComponent([...mock.rows.keys()].find(k=>/^rdos\/[^/]+$/.test(k)).split('/')[1]));await setupDocFromURL();});
    assert.equal(await page.locator('.rdo-layout').isVisible(),true);
    assert.equal(await page.evaluate(()=>obraAtualId),'obra1');
    await page.evaluate(()=>abrirDia('2026-10-15','obra2'));
    assert.equal(await page.locator('#badgeMaoObraTotal').textContent(),'0','another obra cannot inherit quantities');
    assert.equal(await page.locator('#fotoGrid img').count(),0,'another obra cannot inherit photos');
    assert.equal(await page.locator('#listaComentarios .entry').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: daily identity, cross-project isolation, round-trip quantities/dates/media, safe text, shared links, history, conflict and independent merge, failed-save navigation.');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
