/* RDO: persistência, navegação diária e controle de concorrência. */
'use strict';
let auth = null, storage = null, baseData = null, activeDate = null;
let saving = null, loading = false, remotePending = null, presenceTimer = null;
let presenceRef = null, navigation = false, mediaReads = 0;
let conflictBlocked = false;
const mediaCache = new Map();
const defaultLogo = document.getElementById('logoImg').getAttribute('src');
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function escapeHTML(value){
  return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function todayISO(){ return agoraLocal().slice(0,10); }
function notice(message){
  document.getElementById('saveNoticeText').textContent = message;
  document.getElementById('saveNotice').hidden = !message;
}
function showReport(){
  document.getElementById('paginaObras').classList.remove('visivel');
  document.querySelector('.sheet').classList.add('visivel');
  document.querySelector('.rdo-layout').classList.add('visivel');
  document.getElementById('collabBar').classList.remove('hidden');
  document.getElementById('historyPanel').classList.remove('hidden');
}
function applyQuietly(dados){
  isApplyingRemote = true;
  try { aplicarDados(dados); } finally { isApplyingRemote = false; }
}
function isDirty(){ return !!baseData && !equal(coletarDados(),baseData); }
function stopSubscriptions(){
  clearTimeout(saveTimer); saveTimer = null;
  for(const fn of [unsubDoc,unsubHistory,unsubPresence]) if(fn) fn();
  unsubDoc = unsubHistory = unsubPresence = null;
  clearInterval(presenceTimer); presenceTimer = null;
  if(presenceRef) presenceRef.delete().catch(()=>{});
  presenceRef = null;
}
async function entrar(){
  try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch(e){ document.getElementById('authStatus').textContent = 'Não foi possível entrar: '+e.message; }
}
async function sair(){
  if(!await flushChanges()) return;
  await auth.signOut();
}
function initFirebase(){
  try {
    app = firebase.apps.length ? firebase.app() : firebase.initializeApp(getEffectiveConfig());
    db = firebase.firestore(app); storage = firebase.storage(app); auth = firebase.auth(app);
    document.getElementById('configPanel').classList.add('hidden');
    document.getElementById('paginaObras').classList.remove('visivel');
    auth.onAuthStateChanged(async user=>{
      stopSubscriptions();
      if(unsubObras) { unsubObras(); unsubObras = null; }
      docId = obraAtualId = activeDate = baseData = null;
      document.querySelector('.sheet').classList.remove('visivel');
      document.querySelector('.rdo-layout').classList.remove('visivel');
      document.getElementById('collabBar').classList.add('hidden');
      document.getElementById('historyPanel').classList.add('hidden');
      document.getElementById('paginaObras').classList.toggle('visivel',!!user);
      document.getElementById('loginButton').hidden = !!user;
      document.getElementById('logoutButton').hidden = !user;
      myUserId = user?.uid || null;
      myUserName = user?.displayName || user?.email || '';
      document.getElementById('authStatus').textContent = user ? 'Conectado como '+myUserName : 'Entre para acessar as obras.';
      if(user){ carregarObras(); await setupDocFromURL(); }
    });
  } catch(e){
    document.getElementById('authStatus').textContent = 'Erro ao conectar ao Firebase: '+e.message;
  }
}
async function limparConfigFirebase(){
  if(!await flushChanges()) return;
  if(!confirm('Remover a configuração personalizada deste navegador?')) return;
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
async function setupDocFromURL(){
  const params = new URLSearchParams(window.location.search);
  if(params.get('doc')){
    try { await openDocument(params.get('doc')); }
    catch(e){ notice('Não foi possível abrir o RDO: '+e.message); }
  } else if(params.get('obra')) await abrirRDOObra(params.get('obra'));
}
async function flushChanges(){
  clearTimeout(saveTimer);
  try {
    if(mediaReads) throw Error('Aguarde o carregamento das imagens antes de sair.');
    if(saving) await saving;
    if(isDirty()) await salvarNoFirebase();
    return true;
  } catch(e){ notice('Alterações não salvas. '+e.message+' Você pode baixar sua edição em JSON.'); return false; }
}
async function abrirRDOObra(obraId){
  return abrirDia(todayISO(), obraId);
}
async function abrirDia(date, obraId=obraAtualId){
  if(navigation || !obraId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  navigation = true;
  try {
    if(!await flushChanges()) return;
    loading = true;
    const obraSnap = await db.collection('obras').doc(obraId).get();
    if(!obraSnap.exists) throw Error('Obra não encontrada.');
    const obra = obraSnap.data();
    const template = clone(dadosIniciais);
    Object.assign(template.campos, Object.fromEntries(['obra','local','contratada','responsavel','contratoObra','contratoSup','dataInicio','dataFim','prazoContratual'].map(k=>[k,obra[k]||''])));
    template.campos.dataRelatorio = date;
    template.campos.criadoPor = myUserName;
    template.campos.criadoEm = agoraLocal();
    // Compatibility: reuse reports that predate the unique daily index.
    const legacy = await db.collection('rdos').where('obraId','==',obraId).where('dados.campos.dataRelatorio','==',date).get();
    const candidates = legacy.docs.slice().sort((a,b)=>(b.data().modificadoEm?.toMillis?.()||0)-(a.data().modificadoEm?.toMillis?.()||0));
    const dayRef = db.collection('obras').doc(obraId).collection('dias').doc(date);
    const candidate = candidates[0]?.ref || db.collection('rdos').doc(encodeURIComponent(obraId)+'_'+date);
    const selected = await db.runTransaction(async tx=>{
      const day = await tx.get(dayRef);
      const ref = day.exists ? db.collection('rdos').doc(day.data().rdoId) : candidate;
      const current = await tx.get(ref);
      if(!current.exists){
        if(day.exists) throw Error('Índice diário aponta para um RDO removido. Contate o administrador.');
        const now = firebase.firestore.FieldValue.serverTimestamp();
        tx.set(ref,{obraId,dataRelatorio:date,dados:template,criadoPor:myUserName,criadoPorUid:myUserId,criadoEm:now,modificadoPor:myUserName,modificadoPorUid:myUserId,modificadoEm:now,versao:1});
        tx.set(ref.collection('historico').doc('v1'),{autor:myUserName,autorUid:myUserId,data:now,descricao:'Documento criado',dados:template,versao:1});
      }
      if(!day.exists) tx.set(dayRef,{rdoId:ref.id});
      return ref.id;
    });
    await openDocument(selected);
    if(candidates.length > 1) notice('Há RDOs antigos duplicados nesta data. Aberta a versão mais recente; os demais foram preservados.');
  } catch(e){ notice('Não foi possível abrir o dia: '+e.message); }
  finally { loading = false; navigation = false; }
}
async function openDocument(id){
  const snap = await db.collection('rdos').doc(id).get();
  if(!snap.exists) throw Error('Relatório não encontrado.');
  stopSubscriptions();
  const data = snap.data();
  docId = id; obraAtualId = data.obraId;
  activeDate = data.dados?.campos?.dataRelatorio || todayISO();
  baseData = null; lastSavedData = ''; remotePending = null; conflictBlocked = false;
  // Clear every field before applying a legacy document with missing properties.
  applyQuietly(clone(dadosIniciais));
  applyQuietly(data.dados);
  baseData = clone(coletarDados()); lastSavedData = JSON.stringify(baseData);
  const [y,m] = activeDate.split('-').map(Number); calAno=y; calMes=m-1;
  showReport(); renderCalendario(); notice('');
  const url = new URL(window.location.href);
  url.searchParams.set('doc',id); url.searchParams.set('obra',obraAtualId);
  window.history.replaceState({},'',url); updateLinkField();
  subscribeDoc(); carregarDiasComRDO();
}
async function voltarParaObras(){
  if(navigation || !await flushChanges()) return;
  stopSubscriptions(); docId = obraAtualId = activeDate = baseData = null;
  document.querySelector('.sheet').classList.remove('visivel');
  document.querySelector('.rdo-layout').classList.remove('visivel');
  document.getElementById('collabBar').classList.add('hidden');
  document.getElementById('historyPanel').classList.add('hidden');
  document.getElementById('paginaObras').classList.add('visivel'); notice('');
  const url = new URL(window.location.href); url.searchParams.delete('doc'); url.searchParams.delete('obra');
  window.history.replaceState({},'',url);
}
document.getElementById('dataRelatorio').addEventListener('change',e=>{
  const next = e.target.value;
  e.target.value = activeDate || ''; // Date selection navigates; it never renames the current RDO.
  if(next && next!==activeDate) abrirDia(next);
});
function subscribeDoc(){
  const id = docId;
  unsubDoc = db.collection('rdos').doc(id).onSnapshot(snap=>{
    if(id!==docId || snap.metadata?.hasPendingWrites) return;
    if(!snap.exists){ notice('Este RDO foi removido. Baixe sua edição antes de sair.'); return; }
    const data = snap.data(); remotePending = data;
    if(saving || isDirty()) return;
    applyQuietly(clone(dadosIniciais)); applyQuietly(data.dados);
    baseData = clone(coletarDados()); lastSavedData = JSON.stringify(baseData);
    document.getElementById('modificadoPor').textContent = data.modificadoPor || '—';
    document.getElementById('modificadoEm').textContent = data.modificadoEm?.toDate?.().toLocaleString('pt-BR') || '—';
  },e=>{ setCollabStatus('offline','Erro de conexão'); notice('Falha ao acompanhar o RDO: '+e.message); });
  subscribeHistory(); subscribePresence();
}
// Merge independent fields. Lists are atomic to avoid silently combining delete/edit/reorder operations.
function mergeThreeWay(base,local,remote,path=''){
  if(equal(local,base)) return cloneValue(remote);
  if(equal(remote,base) || equal(local,remote)) return cloneValue(local);
  if([base,local,remote].every(v=>v && typeof v==='object' && !Array.isArray(v))){
    const result = {};
    for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      const value = mergeThreeWay(base[key],local[key],remote[key],path ? path+'.'+key : key);
      if(value!==undefined) result[key]=value;
    }
    return result;
  }
  const e = Error('Outra pessoa alterou o mesmo campo ('+path+'). Baixe sua edição e carregue a versão salva para revisar.');
  e.code = 'rdo/conflict'; throw e;
}
function cloneValue(value){ return value===undefined ? undefined : clone(value); }
function normalizeStored(dados){
  // Match the form's canonical serialization, including defaults for older records.
  const current = coletarDados();
  const oldBase = baseData;
  try { applyQuietly(clone(dadosIniciais)); applyQuietly(dados); return clone(coletarDados()); }
  finally { applyQuietly(current); baseData = oldBase; }
}
function agendarSave(){
  if(isApplyingRemote || loading || conflictBlocked || !db || !docId || !baseData) return;
  clearTimeout(saveTimer);
  setCollabStatus('saving','Alterações pendentes...');
  saveTimer = setTimeout(()=>salvarNoFirebase().catch(e=>notice(e.message)),800);
}
async function salvarNoFirebase(){
  clearTimeout(saveTimer);
  if(saving){ await saving; return isDirty() ? salvarNoFirebase() : true; }
  if(!db || !docId) throw Error('Nenhum RDO aberto para salvar.');
  if(conflictBlocked) throw Error('Resolva o conflito: baixe sua edição e carregue a versão salva antes de continuar.');
  if(mediaReads) throw Error('Aguarde o carregamento das imagens.');
  const id = docId, obraId = obraAtualId;
  const captured = coletarDados(), base = clone(baseData);
  if(equal(captured,base)) { setCollabStatus('online','Salvo'); return true; }
  setCollabStatus('saving','Salvando...');
  saving = (async()=>{
    const local = await uploadMedia(clone(captured),obraId,id);
    const normalizedBase = replaceCachedMedia(base);
    const ref = db.collection('rdos').doc(id);
    const result = await db.runTransaction(async tx=>{
      const snap = await tx.get(ref);
      if(!snap.exists) throw Error('RDO removido. Sua edição foi preservada na tela.');
      const previous = snap.data();
      const remote = normalizeStored(previous.dados);
      const merged = mergeThreeWay(normalizedBase,local,remote);
      const version = (previous.versao||0)+1;
      const now = firebase.firestore.FieldValue.serverTimestamp();
      tx.update(ref,{dados:merged,dataRelatorio:activeDate,versao:version,modificadoPor:myUserName,modificadoPorUid:myUserId,modificadoEm:now});
      tx.set(ref.collection('historico').doc('v'+version),{autor:myUserName,autorUid:myUserId,data:now,descricao:'Relatório salvo',versao:version,dados:merged});
      return merged;
    });
    if(id===docId){
      const current = replaceCachedMedia(coletarDados());
      // Preserve typing performed while an upload/transaction was in flight.
      if(equal(current,local)) applyQuietly(result);
      else {
        try { applyQuietly(mergeThreeWay(local,current,result)); }
        catch(e){ conflictBlocked=true; notice(e.message); }
      }
      baseData = clone(result); lastSavedData = JSON.stringify(result);
      calDiasComRDO.add(activeDate); renderCalendario();
      setCollabStatus('online',isDirty() ? 'Alterações pendentes' : 'Salvo');
      if(!isDirty()) notice('');
    }
    return true;
  })();
  try { return await saving; }
  catch(e){ if(e.code==='rdo/conflict') conflictBlocked=true; setCollabStatus('offline','Não salvo'); notice('Não foi possível salvar. '+e.message); throw e; }
  finally { saving=null; if(isDirty() && !conflictBlocked) setCollabStatus('offline','Alterações pendentes; tente salvar novamente.'); }
}
async function salvarRascunho(){
  if(!db || !docId){ exportarJSON(); return; }
  try { await salvarNoFirebase(); alert('RDO salvo com sucesso!'); }
  catch(e){ alert('RDO não salvo. '+e.message); }
}
function exportarJSON(){
  const blob = new Blob([JSON.stringify(coletarDados(),null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='RDO-'+(activeDate||todayISO())+'.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function recarregarRemoto(){
  if(!docId || saving || mediaReads) return;
  if(isDirty() && !confirm('Substituir a edição local pela versão salva? Baixe sua edição antes se precisar preservá-la.')) return;
  try { await openDocument(docId); } catch(e){ notice(e.message); }
}
async function restaurarVersao(histId){
  if(!await flushChanges()) return;
  if(!confirm('Restaurar esta versão? Uma nova revisão será salva no histórico.')) return;
  try {
    const snap=await db.collection('rdos').doc(docId).collection('historico').doc(histId).get();
    if(!snap.exists) throw Error('Versão não encontrada.');
    const data = clone(snap.data().dados);
    data.campos.dataRelatorio = activeDate;
    applyQuietly(clone(dadosIniciais)); applyQuietly(data);
    await salvarNoFirebase(); alert('Versão restaurada e salva!');
  } catch(e){ notice('Não foi possível restaurar: '+e.message); }
}
function limparTudo(){
  if(!confirm('Limpar o conteúdo deste RDO? A obra e a data serão mantidas.')) return;
  const empty=clone(dadosIniciais);
  for(const k of ['obra','local','contratada','responsavel','contratoObra','contratoSup','dataInicio','dataFim','prazoContratual','dataRelatorio','criadoPor','criadoEm']) empty.campos[k]=document.getElementById(k).value;
  applyQuietly(empty); registrarModificacao();
}
function safeImage(src){
  if(typeof src!=='string') return '';
  if(/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) return src;
  try { const u=new URL(src); return u.protocol==='https:' && u.hostname==='firebasestorage.googleapis.com' ? src : ''; }
  catch { return ''; }
}
function mediaSource(img){
  const raw=img?.getAttribute('src')||'';
  return mediaCache.get(raw)||raw;
}
function coletarMidia(){
  return {
    logo: mediaSource(document.getElementById('logoImg'))===defaultLogo ? '' : mediaSource(document.getElementById('logoImg')),
    fotos:Array.from(document.querySelectorAll('#fotoGrid .foto-item')).map(div=>({src:mediaSource(div.querySelector('img')),legenda:div.querySelector('input').value})),
    assinaturas:Object.fromEntries(['exec','sup','fisc'].map(q=>[q,mediaSource(document.getElementById({exec:'assinExecImg',sup:'assinSupImg',fisc:'assinFiscImg'}[q]))]))
  };
}
function appendPhoto(src,legenda=''){
  const div=document.createElement('div'); div.className='foto-item';
  const img=document.createElement('img'); img.src=safeImage(src); img.alt=legenda||'Foto da obra';
  const input=document.createElement('input'); input.type='text'; input.placeholder='Legenda'; input.value=legenda;
  const button=document.createElement('button'); button.className='del-btn'; button.textContent='✕'; button.setAttribute('aria-label','Remover foto');
  button.onclick=()=>{ div.remove(); atualizarFotoBadge(); };
  div.append(img,input,button); fotoGrid.append(div);
}
function aplicarMidia(midia){
  fotoGrid.replaceChildren();
  for(const foto of midia?.fotos||[]) appendPhoto(foto.src,foto.legenda);
  const logo=document.getElementById('logoImg'); logo.src=safeImage(midia?.logo)||defaultLogo;
  logo.style.display='block'; document.getElementById('logoPlaceholder').style.display='none';
  for(const [q,id] of Object.entries({exec:'assinExecImg',sup:'assinSupImg',fisc:'assinFiscImg'})){
    const img=document.getElementById(id), src=safeImage(midia?.assinaturas?.[q]);
    if(src) img.src=src; else img.removeAttribute('src');
    img.style.display=src ? 'block' : 'none';
  }
}
async function readImage(file){
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Error('Use imagens PNG, JPEG, WebP ou GIF.');
  if(file.size>5*1024*1024) throw Error('Cada imagem deve ter até 5 MB.');
  mediaReads++;
  try { return await new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(Error('Falha ao ler a imagem.')); reader.readAsDataURL(file);
  }); } finally { mediaReads--; }
}
async function handleFotos(files){
  const id=docId;
  try { for(const file of files){ const src=await readImage(file); if(docId!==id) return; appendPhoto(src); atualizarFotoBadge(); } }
  catch(e){ notice(e.message); }
  finally { fotoInput.value=''; }
}
async function carregarAssinatura(input,imgId){
  const file=input.files[0], id=docId; if(!file) return;
  try { const src=await readImage(file); if(id!==docId) return; const img=document.getElementById(imgId); img.src=src; img.style.display='block'; registrarModificacao(); }
  catch(e){ notice(e.message); } finally { input.value=''; }
}
function replaceCachedMedia(dados){
  const out=clone(dados);
  if(out.midia){
    out.midia.logo=mediaCache.get(out.midia.logo)||out.midia.logo;
    out.midia.fotos.forEach(f=>f.src=mediaCache.get(f.src)||f.src);
    for(const q of Object.keys(out.midia.assinaturas)) out.midia.assinaturas[q]=mediaCache.get(out.midia.assinaturas[q])||out.midia.assinaturas[q];
  }
  return out;
}
async function uploadMedia(dados,obraId,id){
  async function upload(src){
    if(!src || !src.startsWith('data:')) return src;
    if(mediaCache.has(src)) return mediaCache.get(src);
    if(!safeImage(src)) throw Error('Formato de imagem inválido.');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(src)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const ref=storage.ref('obras/'+obraId+'/rdos/'+id+'/'+digest);
    let url;
    try { url=await ref.getDownloadURL(); }
    catch(e){
      if(e.code!=='storage/object-not-found') throw e;
      try { await ref.putString(src,'data_url'); }
      catch(uploadError){
        // Another tab may have uploaded the same immutable content in the meantime.
        try { url=await ref.getDownloadURL(); } catch { throw uploadError; }
      }
      url=url||await ref.getDownloadURL();
    }
    mediaCache.set(src,url); return url;
  }
  dados.midia.logo=await upload(dados.midia.logo);
  for(const f of dados.midia.fotos) f.src=await upload(f.src);
  for(const q of Object.keys(dados.midia.assinaturas)) dados.midia.assinaturas[q]=await upload(dados.midia.assinaturas[q]);
  return dados;
}
function subscribePresence(){
  const id=docId;
  // One presence document per tab; a heartbeat expires crashed/closed sessions.
  presenceRef=db.collection('rdos').doc(id).collection('presenca').doc(myUserId+'_'+crypto.randomUUID());
  const ref=presenceRef;
  const heartbeat=()=>ref.set({uid:myUserId,nome:myUserName,online:true,ultimaAtividade:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
  heartbeat(); presenceTimer=setInterval(heartbeat,30000);
  let users=[];
  const render=()=>{
    const div=document.getElementById('collabUsers'); div.replaceChildren();
    for(const p of users.filter(p=>Date.now()-(p.ultimaAtividade?.toMillis?.()||0)<90000)){
      const chip=document.createElement('span'); chip.className='collab-user-chip'; chip.textContent=p.nome+(p.uid===myUserId ? ' (você)' : ''); div.append(chip);
    }
  };
  unsubPresence=db.collection('rdos').doc(id).collection('presenca').onSnapshot(s=>{users=s.docs.map(d=>d.data()); render();},()=>{});
}
window.addEventListener('beforeunload',e=>{ if(isDirty()||saving||mediaReads){e.preventDefault();e.returnValue='';} });
