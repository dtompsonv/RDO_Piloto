'use strict';
// Minimum release: existing Firestore connection, no Authentication or paid Storage dependency.
const FIREBASE_CONFIG={apiKey:'AIzaSyAYd1LB-i5WL2IFrw3TfHBKc6j7MrJ6QK8',authDomain:'rdo-piloto.firebaseapp.com',projectId:'rdo-piloto',storageBucket:'rdo-piloto.firebasestorage.app',messagingSenderId:'817337792703',appId:'1:817337792703:web:d9b331e29291bd19062e0a'};
let db=null,app=null,docId=null,obraAtualId=null,activeDate=null,currentVersion=null,remoteFingerprint=null;
let calAno=new Date().getFullYear(),calMes=new Date().getMonth(),calDiasComRDO=new Set();
let obras=new Map(),reports=new Map(),baseForm=null,loading=false,navigating=false,saving=null,mediaReads=0,draftTimer=null;
let localDbPromise=null,activeDraftKey=null;
const clone=v=>JSON.parse(JSON.stringify(v));
const defaultLogo=document.getElementById('logoImg').getAttribute('src');
const stable=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const equal=(a,b)=>stable(a)===stable(b);
const todayISO=()=>agoraLocal().slice(0,10);
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text=''){document.getElementById('noticePanel').hidden=!text;document.getElementById('noticeText').textContent=text;}
function state(text){document.getElementById('saveState').textContent=text;}
function dirty(){return baseForm!==null&&!equal(coletarDados(),baseForm);}
function stamp(){return firebase.firestore.FieldValue.serverTimestamp();}
function changed(){
  if(loading||!activeDraftKey)return;
  document.getElementById('modificadoEm').textContent=new Date().toLocaleString('pt-BR');
  state('Alterações pendentes · salvando rascunho neste navegador...');
  clearTimeout(draftTimer);draftTimer=setTimeout(()=>persistDraft().then(()=>{if(dirty())state('Rascunho neste navegador · clique em Salvar RDO');}).catch(()=>state('Rascunho local indisponível · clique em Salvar RDO')),180);
}
registrarModificacao=changed;
function localDb(){
  if(!localDbPromise)localDbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open('rdo-minimo-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });return localDbPromise;
}
async function localOp(kind,key,value){
  const database=await localDb();return new Promise((resolve,reject)=>{
    const tx=database.transaction('drafts',kind==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');
    const request=kind==='get'?store.get(key):kind==='put'?store.put(value,key):store.delete(key);
    tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
async function persistDraft(){
  clearTimeout(draftTimer);if(!activeDraftKey||loading)return;
  const key=activeDraftKey,data=coletarDados();
  await localOp('put',key,{dados:data,docId,obraId:obraAtualId,date:activeDate,baseFingerprint:remoteFingerprint,version:currentVersion,updatedAt:Date.now()});
}
function draftKey(id,obraId,date){return FIREBASE_CONFIG.projectId+':'+(id||'novo:'+obraId+':'+date);}
function normalizeQuantities(items,label){
  const byName=new Map();let duplicates=0;
  for(const item of items||[]){const name=String(item[label]??item.item??item.funcao??'').trim();if(!name)continue;const key=name.toLocaleLowerCase('pt-BR');if(byName.has(key))duplicates++;byName.set(key,{[label]:name,qtd:String(Math.max(0,Number(item.qtd)||0))});}
  return {items:[...byName.values()],duplicates};
}
function applyData(raw){
  loading=true;let duplicates=0;
  try{
    const dados=clone(raw||{}),campos={...blankData.campos,...dados.campos};
    document.querySelectorAll('.sheet input[id],.sheet textarea[id]').forEach(el=>{if(el.type!=='file')el.value=campos[el.id]??'';});
    document.querySelectorAll('[data-clima]').forEach(el=>el.value=dados.clima?.[el.dataset.clima]||'');
    const groups={direta:'gridDireta',construtora:'gridConstrutora',indireta:'gridIndireta',equip:'gridEquip'};
    for(const [group,id] of Object.entries(groups)){
      const grid=document.getElementById(id);grid.replaceChildren();
      const source=group==='equip'?(dados.equipamentos?.lista??blankData.equipamentos.lista):(dados.maoObra?.[group]??blankData.maoObra[group]);
      const normalized=normalizeQuantities(source,group==='equip'?'item':'funcao');duplicates+=normalized.duplicates;
      for(const item of normalized.items){
        const card=document.createElement('div');card.className='card-item custom';
        const remove=document.createElement('button');remove.className='del-btn card-del';remove.textContent='✕';remove.setAttribute('aria-label','Remover item');remove.onclick=()=>{card.remove();calcularQuantitativos();};
        const label=document.createElement('div');label.className='card-label';label.textContent=item.item||item.funcao;
        const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.value=item.qtd;input.className='card-qty';input.dataset.group=group;input.oninput=calcularQuantitativos;
        card.append(remove,label,input);grid.append(card);
      }
    }
    document.getElementById('bodyAtiv').replaceChildren();for(const item of dados.atividades||[])addAtividade(item.codigo,item.descricao,item.status);if(!dados.atividades?.length)addAtividade();
    document.getElementById('listaComentarios').replaceChildren();for(const item of dados.comentarios||[])addComentario(item.autor,item.texto,item.data);
    document.getElementById('listaOcorrencias').replaceChildren();for(const item of dados.ocorrencias||[])addOcorrencia(item.autor,item.texto,item.data);
    aplicarMidia(dados.midia);calcularQuantitativos();calcularDatas();atualizarBadges();atualizarFotoBadge();
  }finally{loading=false;}return duplicates;
}
addCustomItem=function(group){
  const name=prompt('Nome do item:')?.trim();if(!name)return;
  const id={direta:'gridDireta',construtora:'gridConstrutora',indireta:'gridIndireta',equip:'gridEquip'}[group],grid=document.getElementById(id);
  if([...grid.querySelectorAll('.card-label')].some(el=>el.textContent.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))){alert('Esse item já existe na lista. Altere a quantidade do item existente.');return;}
  const data=coletarDados();if(group==='equip')data.equipamentos.lista.push({item:name,qtd:'0'});else data.maoObra[group].push({funcao:name,qtd:'0'});applyData(data);changed();
};
function reportDate(data){return data?.dados?.campos?.dataRelatorio||data?.dataRelatorio||'';}
function reportTime(data){return data.modificadoEm?.toMillis?.()||data.criadoEm?.toMillis?.()||0;}
function candidates(obraId,date){return [...reports.entries()].filter(([,r])=>r.obraId===obraId&&reportDate(r)===date).sort((a,b)=>reportTime(b[1])-reportTime(a[1]));}
function reportButton(text,onclick,selected=false){const b=document.createElement('button');b.type='button';b.className='report-link'+(selected?' current':'');b.textContent=text;b.onclick=onclick;return b;}
function renderSaved(){
  const target=document.getElementById('savedReports');target.replaceChildren();
  const month=`${calAno}-${String(calMes+1).padStart(2,'0')}`;
  const entries=[...reports.entries()].filter(([,r])=>r.obraId===obraAtualId&&reportDate(r).startsWith(month)).sort((a,b)=>reportDate(a[1]).localeCompare(reportDate(b[1])));
  for(const [id,r] of entries)target.append(reportButton(formatBR(reportDate(r))+(id===docId?' · aberto':''),()=>abrirRegistro(id),id===docId));
  if(!entries.length){const p=document.createElement('p');p.textContent='Nenhum RDO salvo neste mês. Selecione um dia no calendário.';p.style.fontSize='12px';target.append(p);}
}
function renderCalendario(){
  const grid=document.getElementById('calGrid');grid.replaceChildren();
  document.getElementById('calTitulo').textContent=new Date(calAno,calMes,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  calDiasComRDO=new Set([...reports.values()].filter(r=>r.obraId===obraAtualId&&validDate(reportDate(r))).map(reportDate));
  for(let i=0;i<new Date(calAno,calMes,1).getDay();i++){const empty=document.createElement('div');empty.className='cal-dia vazio';grid.append(empty);}
  for(let day=1;day<=new Date(calAno,calMes+1,0).getDate();day++){
    const date=calDataISO(calAno,calMes,day),button=document.createElement('button');button.type='button';button.className='cal-dia';button.textContent=day;button.dataset.data=date;
    if(calDiasComRDO.has(date))button.classList.add('has-rdo');if(date===activeDate)button.classList.add('selecionado');if(date===todayISO())button.classList.add('hoje');
    button.setAttribute('aria-label',formatBR(date)+(calDiasComRDO.has(date)?' · RDO salvo':''));button.onclick=()=>abrirDia(date);grid.append(button);
  }
  document.getElementById('calDataSelecionada').textContent=activeDate?formatBR(activeDate):'Selecione a data';renderSaved();
}
function calDataISO(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function calMudarMes(delta){const date=new Date(calAno,calMes+delta,1);calAno=date.getFullYear();calMes=date.getMonth();renderCalendario();}
function renderHome(){
  const grid=document.getElementById('obrasGrid');grid.replaceChildren();
  for(const [id,o] of obras){if(o.excluida)continue;const card=document.createElement('div');card.className='obra-card';const h=document.createElement('h3');h.textContent=o.obra||'Sem nome';const p=document.createElement('p');p.textContent=o.local||'';const button=reportButton('Calendário / novo RDO',()=>abrirRDOObra(id));card.append(h,p,button,reportButton('Editar',()=>editarObra(id)),reportButton('Excluir',()=>excluirObra(id)));const saved=[...reports.entries()].filter(([,r])=>r.obraId===id&&validDate(reportDate(r))).sort((a,b)=>reportDate(b[1]).localeCompare(reportDate(a[1])));if(saved.length){card.append(pdfElement('p',saved.length+' RDO(s) salvo(s)'),reportButton('Abrir último RDO · '+formatBR(reportDate(saved[0][1])),()=>abrirRegistro(saved[0][0])));}grid.append(card);}
  if(![...obras.values()].some(o=>!o.excluida)){const p=document.createElement('p');p.textContent='Nenhuma obra cadastrada. Use Adicionar obra.';grid.append(p);}
  let trash=document.getElementById('obrasLixeira');if(!trash){trash=document.createElement('details');trash.id='obrasLixeira';grid.after(trash);}trash.replaceChildren(pdfElement('summary','Lixeira de obras'));let trashCount=0;for(const [id,o] of obras)if(o.excluida){trashCount++;const row=pdfElement('p',o.obra||'Sem nome');row.append(reportButton('Restaurar',()=>restaurarObra(id)));trash.append(row);}if(trashCount){const clear=reportButton('Limpar lixeira',limparLixeiraObras);clear.id='limparLixeiraButton';clear.disabled=clearingTrash;trash.append(clear);}trash.hidden=!trashCount;
  const old=[...reports.entries()].filter(([,r])=>!obras.get(r.obraId)?.excluida&&(!validDate(reportDate(r))||!r.obraId||!obras.has(r.obraId))); 
  const list=document.getElementById('legacyList');list.replaceChildren();
  for(const [id,r] of old){const title=r.dados?.campos?.obra||obras.get(r.obraId)?.obra||'Obra não identificada';list.append(reportButton(title+' · '+(validDate(reportDate(r))?formatBR(reportDate(r)):'sem data')+' · registro '+id.slice(-6),()=>abrirRegistro(id)));}
  document.getElementById('legacyPanel').hidden=!old.length;
  const select=document.getElementById('recoveryObra');select.replaceChildren();const none=new Option('Selecione a obra','');select.add(none);for(const [id,o] of obras)if(!o.excluida)select.add(new Option(o.obra||id,id));
}
async function loadCatalog(){
  const [works,docs]=await Promise.all([db.collection('obras').get(),db.collection('rdos').get()]);
  obras=new Map(works.docs.map(d=>[d.id,d.data()]));reports=new Map(docs.docs.map(d=>[d.id,d.data()]));renderHome();
}
function showReport(){
  document.getElementById('paginaObras').classList.remove('visivel');document.getElementById('legacyPanel').hidden=true;
  document.querySelector('.sheet').classList.add('visivel');document.querySelector('.rdo-layout').classList.add('visivel');
  document.getElementById('recoveryPanel').hidden=!!activeDate&&!!obraAtualId;
  document.getElementById('recoveryObra').value=obraAtualId||'';document.getElementById('recoveryDate').value=activeDate||'';
}
function setURL(){const url=new URL(location.href);url.searchParams.delete('obra');url.searchParams.delete('doc');url.searchParams.delete('dia');if(obraAtualId)url.searchParams.set('obra',obraAtualId);if(docId)url.searchParams.set('doc',docId);if(activeDate)url.searchParams.set('dia',activeDate);history.replaceState({},'',url);}
async function beforeNavigation(){
  if(mediaReads){notice('Aguarde o carregamento das imagens.');return false;}
  if(saving){try{await saving;}catch{}}
  if(!dirty())return true;
  try{await salvarNoFirebase();return !dirty();}
  catch(error){
    try{await persistDraft();}catch{notice('Não foi possível salvar nem o rascunho local. Salve em PDF antes de sair.');return false;}
    return confirm('O RDO não foi salvo no servidor: '+error.message+'\nO rascunho está guardado neste navegador. Deseja mudar de relatório mesmo assim?');
  }
}
function navBusy(on){document.querySelector('.sheet').inert=on;document.getElementById('rdoSidebar').inert=on;}
async function openForm({id=null,obraId=null,date=null,data=null,version=null,fingerprint=null}){
  docId=id;obraAtualId=obraId;activeDate=validDate(date)?date:null;currentVersion=version;remoteFingerprint=fingerprint;
  notice('');activeDraftKey=draftKey(id,obraId,activeDate);
  const duplicates=applyData(data||blankData);baseForm=clone(coletarDados());
  let restored=false;
  try{const draft=await localOp('get',activeDraftKey);if(draft&&(!equal(draft.dados,baseForm))){applyData(draft.dados);remoteFingerprint=draft.baseFingerprint;currentVersion=draft.version;if(validDate(draft.date))activeDate=draft.date;if(obras.has(draft.obraId))obraAtualId=draft.obraId;restored=true;}}catch{}
  if(activeDate){const [y,m]=activeDate.split('-').map(Number);calAno=y;calMes=m-1;}
  showReport();setURL();renderCalendario();state(restored?'Rascunho recuperado neste navegador · clique em Salvar RDO':id?'RDO carregado · salvo no servidor':'Novo RDO · ainda não salvo');
  if(restored)notice('Recuperado um rascunho local. Revise e clique em Salvar RDO.');
  if(duplicates)notice('Foram encontrados '+duplicates+' itens repetidos neste registro antigo. Foi mantida a última quantidade de cada nome, sem somar as cópias. Confira os totais antes de salvar; o registro original no servidor permanece intacto até o salvamento.');
}
async function abrirRegistro(id){
  if(navigating)return;navigating=true;
  try{if(!await beforeNavigation())return;navBusy(true);const snap=await db.collection('rdos').doc(id).get();if(!snap.exists)throw Error('RDO não encontrado.');const r=snap.data();if(obras.get(r.obraId)?.excluida)throw Error('Esta obra está na lixeira. Restaure-a para abrir seus RDOs.');reports.set(id,r);await openForm({id,obraId:obras.has(r.obraId)?r.obraId:null,date:reportDate(r),data:r.dados,version:r.versao??0,fingerprint:stable(r.dados)});}
  catch(e){notice('Não foi possível abrir o RDO: '+e.message);}finally{navigating=false;navBusy(false);}
}
async function abrirRDOObra(id){return abrirDia(todayISO(),id);}
async function abrirDia(date,obraId=obraAtualId){
  if(navigating||!validDate(date)||!obraId)return;if(obras.get(obraId)?.excluida){notice('Restaure a obra na lixeira antes de abrir um RDO.');return;}
  if(docId&&(!activeDate||!obraAtualId)){document.getElementById('recoveryDate').value=date;notice('Para recuperar este registro antigo, selecione a obra e clique em Vincular e salvar RDO.');return;}
  const existing=candidates(obraId,date);if(existing.length)return abrirRegistro(existing[0][0]);
  navigating=true;
  try{
    if(!await beforeNavigation())return;navBusy(true);
    const id=encodeURIComponent(obraId)+'_'+date,snap=await db.collection('rdos').doc(id).get();
    if(snap.exists){const r=snap.data();reports.set(id,r);await openForm({id,obraId,date,data:r.dados,version:r.versao??0,fingerprint:stable(r.dados)});return;}
    const data=clone(blankData),work=obras.get(obraId);if(!work)throw Error('Obra não encontrada.');
    for(const key of ['obra','local','contratada','responsavel','contratoObra','contratoSup','dataInicio','dataFim','prazoContratual'])data.campos[key]=work[key]||'';
    data.campos.dataRelatorio=date;data.campos.criadoEm=agoraLocal();
    await openForm({obraId,date,data});
  }catch(e){notice('Não foi possível abrir o dia: '+e.message);}finally{navigating=false;navBusy(false);}
}
async function vincularLegado(){
  const date=document.getElementById('recoveryDate').value,obraId=document.getElementById('recoveryObra').value;
  if(!validDate(date)||!obras.has(obraId)){notice('Selecione uma obra e uma data válida.');return;}
  if(candidates(obraId,date).some(([id])=>id!==docId)){notice('Já existe outro RDO nesta data. Para preservar os dois registros, escolha outra data ou revise o RDO existente antes de vincular.');return;}
  obraAtualId=obraId;activeDate=date;document.getElementById('dataRelatorio').value=date;document.getElementById('obra').value=obras.get(obraId).obra||'';calcularDatas();
  try{await salvarNoFirebase();document.getElementById('recoveryPanel').hidden=true;const [y,m]=date.split('-').map(Number);calAno=y;calMes=m-1;renderCalendario();notice('RDO recuperado e salvo na data '+formatBR(date)+'.');}catch(e){notice('Não foi possível vincular: '+e.message);}
}
async function voltarParaObras(){if(navigating)return;navigating=true;try{if(!await beforeNavigation())return;docId=obraAtualId=activeDate=baseForm=activeDraftKey=null;document.querySelector('.sheet').classList.remove('visivel');document.querySelector('.rdo-layout').classList.remove('visivel');document.getElementById('recoveryPanel').hidden=true;document.getElementById('paginaObras').classList.add('visivel');renderHome();setURL();notice('');state('Selecione a obra para abrir o calendário.');}finally{navigating=false;}}
async function salvarNoFirebase(){
  clearTimeout(draftTimer);
  if(saving){await saving;return dirty()?salvarNoFirebase():true;}
  if(!db||!activeDate||!obraAtualId)throw Error('Informe a obra e a data do relatório antes de salvar.');
  if(mediaReads)throw Error('Aguarde o carregamento das imagens.');
  if(!dirty()&&docId){state('Salvo no servidor · '+formatBR(activeDate));return true;}
  const data=clone(coletarDados()),oldKey=activeDraftKey,id=docId||encodeURIComponent(obraAtualId)+'_'+activeDate,wasNew=!docId,expectedFingerprint=remoteFingerprint,expectedVersion=currentVersion;
  const quantities=[...Object.values(data.maoObra).flat(),...(data.equipamentos.lista||[])];
  if(quantities.some(item=>!Number.isInteger(Number(item.qtd))||Number(item.qtd)<0))throw Error('Informe quantidades inteiras e não negativas para mão de obra e equipamentos.');
  data.campos.dataRelatorio=activeDate;
  await persistDraft();
  if(new TextEncoder().encode(JSON.stringify(data)).length>800000)throw Error('O RDO excede o limite de imagens para salvamento. Reduza as fotos; o rascunho local e a exportação PDF continuam disponíveis.');
  const workId=obraAtualId,date=activeDate;state('Salvando no servidor...');
  saving=(async()=>{
    const ref=db.collection('rdos').doc(id);
    const next=await db.runTransaction(async tx=>{
      const work=await tx.get(db.collection('obras').doc(workId));if(!work.exists||work.data().excluida)throw Error('A obra foi excluída. Restaure-a antes de salvar.');
      const snap=await tx.get(ref);
      if(wasNew&&snap.exists)throw Error('Outra sessão já criou este dia. Volte à obra e reabra o relatório para revisar. Seu rascunho local foi preservado.');
      if(!wasNew&&!snap.exists)throw Error('Este registro não está mais no servidor. Seu rascunho local foi preservado.');
      if(snap.exists&&((snap.data().versao??0)!==expectedVersion||stable(snap.data().dados)!==expectedFingerprint))throw Error('Outra pessoa alterou este RDO. Salve sua edição em PDF antes de reabrir o registro para revisar as alterações.');
      const version=(snap.exists?snap.data().versao??0:0)+1;
      const record={obraId:workId,dataRelatorio:date,dados:data,versao:version,modificadoEm:stamp(),modificadoPor:data.campos.criadoPor||'Preenchimento do RDO'};
      if(!snap.exists){record.criadoEm=stamp();record.criadoPor=record.modificadoPor;tx.set(ref,record);}else tx.update(ref,record);
      return {...record,versao:version};
    });
    docId=id;currentVersion=next.versao;remoteFingerprint=stable(data);baseForm=clone(data);activeDraftKey=draftKey(id,workId,date);
    reports.set(id,{...next,modificadoEm:{toMillis:()=>Date.now()}});setURL();renderCalendario();
    // Never overwrite typing that happened during the network request.
    if(!dirty()){await localOp('delete',oldKey).catch(()=>{});if(oldKey!==activeDraftKey)await localOp('delete',activeDraftKey).catch(()=>{});}
    else await persistDraft();
    state(dirty()?'Alterações novas pendentes · clique em Salvar RDO':'Salvo no servidor · '+formatBR(date));
    return true;
  })();
  try{return await saving;}catch(e){state('Não salvo no servidor · rascunho neste navegador');notice(e.message);throw e;}finally{saving=null;}
}
async function salvarRascunho(){try{await salvarNoFirebase();notice('RDO salvo. Ele permanece aberto e pode ser reencontrado no calendário e na lista de RDOs salvos.');}catch(e){notice('Não foi possível salvar no servidor. '+e.message);}}
function limparTudo(){if(!confirm('Limpar o conteúdo deste RDO? A obra e a data serão mantidas.'))return;const data=clone(blankData);for(const key of ['obra','local','contratada','responsavel','contratoObra','contratoSup','dataInicio','dataFim','prazoContratual','dataRelatorio','criadoPor','criadoEm'])data.campos[key]=document.getElementById(key).value;applyData(data);changed();}
let editingObraId=null,obraSaving=false;
const obraFields={obra:'novaObra',local:'novoLocal',contratada:'novaContratada',responsavel:'novoResponsavel',contratoObra:'novoContratoObra',contratoSup:'novoContratoSup',dataInicio:'novaDataInicio',dataFim:'novaDataFim',prazoContratual:'novoPrazo'};
function abrirModalObra(id=null){
  if(obraSaving)return;editingObraId=id;const data=id?obras.get(id):{};if(id&&(!data||data.excluida))return;
  for(const [key,input] of Object.entries(obraFields))document.getElementById(input).value=data?.[key]??'';
  document.querySelector('#modalObra h2').textContent=id?'Editar obra':'Adicionar obra';
  document.getElementById('modalObra').classList.add('visivel');document.getElementById('novaObra').focus();
}
function editarObra(id){abrirModalObra(id);}
function fecharModalObra(){if(!obraSaving){document.getElementById('modalObra').classList.remove('visivel');editingObraId=null;}}
function calcularPrazoAuto(){const start=document.getElementById('novaDataInicio').value,end=document.getElementById('novaDataFim').value;if(start&&end)document.getElementById('novoPrazo').value=Math.max(0,diffDias(start,end));}
async function salvarObra(){
  if(obraSaving)return;const data=Object.fromEntries(Object.entries(obraFields).map(([key,id])=>[key,document.getElementById(id).value.trim()]));if(!data.obra){alert('Informe o nome da obra.');return;}
  obraSaving=true;const button=document.querySelector('#modalObra .btn-primary');button.disabled=true;
  try{if(editingObraId){const id=editingObraId,ref=db.collection('obras').doc(id);await db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists||current.data().excluida)throw Error('Obra indisponível. Atualize a página.');tx.update(ref,{...data,modificadoEm:stamp()});});obras.set(id,{...obras.get(id),...data});}else{const ref=await db.collection('obras').add({...data,criadoEm:stamp()});obras.set(ref.id,data);}obraSaving=false;fecharModalObra();renderHome();notice('Obra salva. Os RDOs anteriores mantêm os dados registrados na época.');}
  catch(e){notice('Não foi possível salvar a obra: '+e.message);}finally{obraSaving=false;button.disabled=false;}
}
async function setObraDeleted(id,deleted){
  if(clearingTrash)return;
  const ref=db.collection('obras').doc(id);try{await db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists)throw Error('Obra não encontrada.');tx.update(ref,{excluida:deleted,modificadoEm:stamp()});});obras.set(id,{...obras.get(id),excluida:deleted});renderHome();notice(deleted?'Obra movida para a lixeira. Seus RDOs podem ser recuperados ao restaurá-la.':'Obra restaurada.');}catch(e){notice('Não foi possível alterar a obra: '+e.message);}
}
async function excluirObra(id){const obra=obras.get(id);if(!obra||obra.excluida)return;if(confirm('Mover a obra "'+obra.obra+'" para a lixeira? Seus RDOs ficarão ocultos e poderão ser recuperados ao restaurar a obra.'))await setObraDeleted(id,true);}
async function restaurarObra(id){await setObraDeleted(id,false);}
let clearingTrash=false;
async function limparLixeiraObras(){
  if(clearingTrash)return;
  const ids=[...obras].filter(([,o])=>o.excluida).map(([id])=>id);if(!ids.length)return;
  if(!confirm('Excluir definitivamente '+ids.length+' obra(s) da lixeira e todos os seus RDOs, fotos e assinaturas? Esta ação não pode ser desfeita. Obras fora da lixeira serão mantidas.'))return;
  clearingTrash=true;renderHome();let removed=0;
  try{
    for(const id of ids){
      const workRef=db.collection('obras').doc(id);
      const workBefore=await workRef.get();if(!workBefore.exists||!workBefore.data().excluida)continue;
      const saved=await db.collection('rdos').where('obraId','==',id).get();
      const refs=[];for(const report of saved.docs){for(const name of ['historico','presenca']){const children=await report.ref.collection(name).get();for(const child of children.docs)refs.push(child.ref);}refs.push(report.ref);}
      if(refs.length>400)throw Error('Esta obra possui muitos registros para a limpeza segura de uma só vez. Nenhum registro desta obra foi excluído.');
      await db.runTransaction(async tx=>{
        const work=await tx.get(workRef);if(!work.exists||!work.data().excluida)throw Error('Uma obra foi restaurada durante a limpeza. Atualize a página e tente novamente.');
        // Reading every target makes concurrent edits retry before any deletion.
        for(const ref of refs)await tx.get(ref);
        for(const ref of refs)tx.delete(ref);tx.delete(workRef);
      });
      obras.delete(id);for(const report of saved.docs)reports.delete(report.id);removed++;
    }
    await loadCatalog();notice('Lixeira limpa: '+removed+' obra(s) excluída(s) definitivamente.');
  }catch(e){await loadCatalog().catch(()=>{});notice('Limpeza interrompida. '+removed+' obra(s) já excluída(s). '+e.message);}
  finally{clearingTrash=false;renderHome();}
}
function safeImage(src){return typeof src==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(src)?src:'';}
function coletarMidia(){return {logo:document.getElementById('logoImg').getAttribute('src')===defaultLogo?'':safeImage(document.getElementById('logoImg').getAttribute('src')),fotos:[...document.querySelectorAll('#fotoGrid .foto-item')].map(el=>({src:safeImage(el.querySelector('img').getAttribute('src')),legenda:el.querySelector('input').value})),assinaturas:Object.fromEntries(Object.entries({exec:'assinExecImg',sup:'assinSupImg',fisc:'assinFiscImg'}).map(([key,id])=>[key,safeImage(document.getElementById(id).getAttribute('src'))]))};}
function appendPhoto(src,legenda=''){
  const div=document.createElement('div');div.className='foto-item';const img=document.createElement('img');img.src=safeImage(src);img.alt=legenda||'Serviço executado';
  const input=document.createElement('input');input.type='text';input.placeholder='Legenda';input.value=legenda;
  const button=document.createElement('button');button.className='del-btn';button.textContent='✕';button.setAttribute('aria-label','Remover foto');button.onclick=()=>{div.remove();atualizarFotoBadge();};div.append(img,input,button);fotoGrid.append(div);
}
function aplicarMidia(midia){fotoGrid.replaceChildren();for(const photo of midia?.fotos||[])if(safeImage(photo.src))appendPhoto(photo.src,photo.legenda);document.getElementById('logoImg').src=safeImage(midia?.logo)||defaultLogo;document.getElementById('logoImg').style.display='block';document.getElementById('logoPlaceholder').style.display='none';for(const [key,id] of Object.entries({exec:'assinExecImg',sup:'assinSupImg',fisc:'assinFiscImg'})){const el=document.getElementById(id),src=safeImage(midia?.assinaturas?.[key]);if(src)el.src=src;else el.removeAttribute('src');el.style.display=src?'block':'none';}}
async function readImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Use PNG, JPEG ou WebP com até 10 MB por arquivo.');
  mediaReads++;try{
    const raw=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha ao ler imagem.'));reader.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Arquivo de imagem inválido.'));img.src=raw;});
    const canvas=document.createElement('canvas');let width=Math.min(1280,img.width),src='';
    for(let step=0;step<7;step++){canvas.width=width;canvas.height=Math.max(1,Math.round(img.height*width/img.width));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);src=canvas.toDataURL('image/jpeg',0.78-step*0.055);if(src.length<=100000)break;width=Math.max(320,Math.floor(width*0.8));}
    if(src.length>100000)throw Error('Não foi possível comprimir esta imagem para o limite do RDO.');return src;
  }finally{mediaReads--;}
}
async function handleFotos(files){const key=activeDraftKey;try{for(const file of files){if(fotoGrid.children.length>=6)throw Error('Limite de 6 fotos por RDO.');const src=await readImage(file);if(key!==activeDraftKey)return;appendPhoto(src);atualizarFotoBadge();}}catch(e){notice(e.message);}finally{fotoInput.value='';}}
async function carregarAssinatura(input,imgId){const file=input.files[0],key=activeDraftKey;if(!file)return;try{const src=await readImage(file);if(key!==activeDraftKey)return;const img=document.getElementById(imgId);img.src=src;img.style.display='block';changed();}catch(e){notice(e.message);}finally{input.value='';}}
document.getElementById('logoInput').addEventListener('change',async e=>{const file=e.target.files[0],key=activeDraftKey;if(!file)return;try{const src=await readImage(file);if(key===activeDraftKey){document.getElementById('logoImg').src=src;changed();}}catch(e){notice(e.message);}finally{e.target.value='';}});
document.getElementById('dataRelatorio').addEventListener('change',e=>{const next=e.target.value;e.target.value=activeDate||'';if(!activeDate){document.getElementById('recoveryDate').value=next;notice('Clique em Vincular e salvar RDO para associar o registro antigo à data.');}else if(next!==activeDate)abrirDia(next);});
document.getElementById('novaDataInicio').addEventListener('change',calcularPrazoAuto);document.getElementById('novaDataFim').addEventListener('change',calcularPrazoAuto);
window.addEventListener('beforeunload',e=>{if(dirty()||saving||mediaReads){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{persistDraft().catch(()=>{});});

// Printing uses text blocks rather than clipped input/textarea widgets.
function pdfElement(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;}
function pdfTable(headers,rows){const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');for(const h of headers)tr.append(pdfElement('th',h));head.append(tr);table.append(head);const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const value of row)tr.append(pdfElement('td',value??''));body.append(tr);}table.append(body);return table;}
function buildPDF(data=coletarDados()){
  const root=document.getElementById('pdfReport');root.replaceChildren();root.setAttribute('aria-hidden','false');
  const fields=data.campos,logo=pdfElement('img',undefined,'pdf-logo');logo.src=safeImage(data.midia.logo)||defaultLogo;root.append(logo,pdfElement('h1','Relatório Diário de Obra'),pdfElement('p','Data: '+(fields.dataRelatorio?formatBR(fields.dataRelatorio):'Não informada')));
  function section(title){const s=document.createElement('section');s.append(pdfElement('h2',title));root.append(s);return s;}
  const general=section('Dados da obra');for(const [label,key] of [['Obra','obra'],['Trecho','local'],['Contratada','contratada'],['Supervisora','responsavel'],['Contrato da obra','contratoObra'],['Contrato de supervisão','contratoSup']])general.append(pdfElement('p',label+': '+(fields[key]||'—')));
  general.append(pdfElement('p','Período contratual: '+(fields.dataInicio?formatBR(fields.dataInicio):'—')+' a '+(fields.dataFim?formatBR(fields.dataFim):'—')+' · Prazo: '+(fields.prazoContratual||'—')+' dias'));
  const weather=section('Condições climáticas');weather.append(pdfTable(['Período','Tempo','Condição de trabalho'],['manha','tarde','noite'].map((key,i)=>[['Manhã','Tarde','Noite'][i],data.clima['tempo-'+key]||'—',data.clima['cond-'+key]||'—'])));
  const labor=section('Mão de obra');const laborRows=[];for(const [group,label] of [['direta','Direta'],['construtora','Construtora'],['indireta','Indireta']])for(const item of data.maoObra[group]||[])if(Number(item.qtd)>0)laborRows.push([label,item.funcao,item.qtd]);labor.append(pdfTable(['Grupo','Função','Quantidade'],laborRows.length?laborRows:[['—','Não informada','0']]));labor.append(pdfElement('p','Total: '+laborRows.reduce((sum,row)=>sum+Number(row[2]),0)));
  const equipment=section('Equipamentos');const eq=(data.equipamentos.lista||[]).filter(e=>Number(e.qtd)>0);equipment.append(pdfTable(['Equipamento','Quantidade'],eq.length?eq.map(e=>[e.item,e.qtd]):[['Não informado','0']]));
  const activities=section('Atividades executadas');activities.append(pdfTable(['Código','Descrição','Situação'],data.atividades.length?data.atividades.map(a=>[a.codigo,a.descricao,a.status]):[['','Sem atividades informadas','']]));
  for(const [key,title] of [['comentarios','Comentários'],['ocorrencias','Ocorrências']]){const s=section(title);if(!data[key].length)s.append(pdfElement('p','Sem registros.'));for(const item of data[key]){const entry=pdfElement('div',undefined,'pdf-entry');entry.append(pdfElement('p',(item.autor||'Sem autor')+' · '+(item.data?item.data.replace('T',' '):'Sem data')),pdfElement('p',item.texto));s.append(entry);}}
  const photos=section('Fotos dos serviços');if(!data.midia.fotos.length)photos.append(pdfElement('p','Sem fotos.'));for(const [i,photo] of data.midia.fotos.entries()){const figure=pdfElement('div',undefined,'pdf-photo'),img=document.createElement('img');img.src=photo.src;img.alt=photo.legenda||'Foto do serviço';figure.append(img,pdfElement('p','Foto '+(i+1)+' — '+(photo.legenda||'Sem legenda')));photos.append(figure);}
  const signatures=section('Assinaturas'),grid=pdfElement('div',undefined,'pdf-signatures');for(const [key,label] of [['exec','Responsável técnico — Construtora'],['sup','Engenheiro civil — Supervisora'],['fisc','Fiscal']]){const col=pdfElement('div',undefined,'pdf-signature');col.append(pdfElement('p',label));const src=data.midia.assinaturas[key];if(src){const img=document.createElement('img');img.src=src;img.alt='Assinatura';col.append(img);}else col.append(pdfElement('p','________________________________'));col.append(pdfElement('p',fields[key+'Nome']||'Nome não informado'),pdfElement('p',fields[key+'Email']||''));grid.append(col);}signatures.append(grid);
  root.append(pdfElement('p','Preenchido por: '+(fields.criadoPor||'—')+' · Exportado em '+new Date().toLocaleString('pt-BR')));return root;
}
async function exportarPDF(){
  if(mediaReads){notice('Aguarde o carregamento das imagens antes de gerar o PDF.');return;}
  try{await persistDraft();}catch{notice('Rascunho local indisponível. O PDF será gerado com os dados atuais.');}
  const root=buildPDF();await Promise.all([...root.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
  const previous=document.title;document.title='RDO - '+(document.getElementById('obra').value||'Obra')+' - '+(activeDate||'sem-data');
  window.addEventListener('afterprint',()=>{document.title=previous;root.setAttribute('aria-hidden','true');},{once:true});window.print();
}

loading=true;buildGroup('gridDireta','direta',MAO_OBRA_DIRETA);buildGroup('gridConstrutora','construtora',MAO_OBRA_CONSTRUTORA);buildGroup('gridIndireta','indireta',MAO_OBRA_INDIRETA);buildGroup('gridEquip','equip',EQUIPAMENTOS);addAtividade();calcularQuantitativos();calcularDatas();atualizarBadges();
const blankData=clone(coletarDados());loading=false;
async function init(){
  try{app=firebase.apps?.length?firebase.app():firebase.initializeApp(FIREBASE_CONFIG);db=firebase.firestore(app);await loadCatalog();state('Conectado · selecione a obra para abrir o calendário.');const params=new URLSearchParams(location.search);if(params.get('doc'))await abrirRegistro(params.get('doc'));else if(params.get('obra'))await abrirDia(validDate(params.get('dia'))?params.get('dia'):todayISO(),params.get('obra'));}
  catch(e){state('Falha ao carregar os RDOs');notice('Não foi possível conectar: '+e.message+'. Recarregue a página quando a conexão voltar.');}
}
init();
