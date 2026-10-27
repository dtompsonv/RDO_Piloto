/* Executes in the browser against mock.js; never uses production Firebase. */
async function runRegression(){
  let assertions=0;
  function check(value,message){assertions++;if(!value)throw Error(message);}
  const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timeout waiting for initialization');};
  await wait(()=>obras.size===2);
  abrirModalObra();document.getElementById('novaObra').value='Obra teste CRUD';await salvarObra();
  const testWork=[...obras.keys()].find(id=>!['obra1','obra2'].includes(id));check(!!testWork,'create work');
  editarObra(testWork);document.getElementById('novaObra').value='Obra editada';await salvarObra();check(mock.rows.get('obras/'+testWork).obra==='Obra editada','edit persisted');
  const oldConfirm=window.confirm;window.confirm=()=>false;await excluirObra(testWork);check(!obras.get(testWork).excluida,'cancel deletion');window.confirm=oldConfirm;
  await excluirObra(testWork);check(mock.rows.get('obras/'+testWork).excluida,'trash persisted');check(!document.getElementById('obrasGrid').textContent.includes('Obra editada'),'deleted work hidden');
  await restaurarObra(testWork);check(!mock.rows.get('obras/'+testWork).excluida,'restore persisted');
  await excluirObra(testWork);
  mock.rows.set('rdos/trash-report',{obraId:testWork});mock.rows.set('rdos/trash-report/historico/h1',{texto:'Histórico'});mock.rows.set('rdos/trash-report/presenca/p1',{nome:'Pessoa'});
  window.confirm=()=>false;await limparLixeiraObras();check(mock.rows.has('obras/'+testWork),'cancel permanent cleanup');window.confirm=oldConfirm;
  mock.failSave=true;await limparLixeiraObras();mock.failSave=false;check(mock.rows.has('obras/'+testWork)&&mock.rows.has('rdos/trash-report'),'failed cleanup preserves work and reports');
  await limparLixeiraObras();check(!mock.rows.has('obras/'+testWork)&&!mock.rows.has('rdos/trash-report'),'permanent cleanup removes work and reports');check(!mock.rows.has('rdos/trash-report/historico/h1')&&!mock.rows.has('rdos/trash-report/presenca/p1'),'cleanup removes report history and presence');check(mock.rows.has('obras/obra1')&&mock.rows.has('obras/obra2'),'active works preserved');
  check(document.getElementById('obrasLixeira').hidden,'empty trash hidden');await loadCatalog();
  // This fixture reproduces the actual old data shape: no date and repeated quantities.
  const old=clone(blankData);old.campos.obra='Obra A';old.maoObra.direta.push({funcao:old.maoObra.direta[0].funcao,qtd:'7'});
  mock.rows.set('rdos/legacy',{obraId:'obra1',dados:old,versao:1});await loadCatalog();
  check(!document.getElementById('legacyPanel').hidden,'undated report is discoverable');
  await abrirRegistro('legacy');
  check(document.querySelectorAll('#gridDireta .card-item').length===24,'repeated legacy quantities normalized');
  check(document.getElementById('badgeMaoObraTotal').textContent==='7','last known quantity preserved without summing copies');
  document.getElementById('recoveryObra').value='obra1';document.getElementById('recoveryDate').value='2026-07-01';await vincularLegado();
  check(docId==='legacy'&&activeDate==='2026-07-01','recovery preserves report identity');
  check(mock.rows.get('rdos/legacy').dados.campos.dataRelatorio==='2026-07-01','recovered date stored in original document');
  check(document.querySelector('.rdo-layout').classList.contains('visivel'),'saving does not hide report');
  const firstInput=document.querySelector('#gridDireta input');firstInput.value='9';calcularQuantitativos();
  document.querySelector('#gridEquip input').value='4';calcularQuantitativos();
  document.querySelector('#bodyAtiv input:nth-child(1)').value='01';
  const tr=document.querySelector('#bodyAtiv tr');tr.querySelectorAll('input')[1].value='Execução de drenagem e regularização do trecho. ATIVIDADE_TESTE';
  tr.querySelector('select').value='Em andamento';
  addComentario('Fiscal <teste>','Texto longo de fiscalização. '.repeat(90)+'FIM_COMENTARIO_TESTE','2026-07-01T08:15');
  addOcorrencia('Responsável','Ocorrência preservada.','2026-07-01T09:20');
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  // Use a visible synthetic service photo in the PDF to verify image placement.
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=360;const ctx=canvas.getContext('2d');ctx.fillStyle='#dce8ef';ctx.fillRect(0,0,900,360);ctx.fillStyle='#536b7b';ctx.fillRect(0,210,900,150);ctx.strokeStyle='#e2c76b';ctx.lineWidth=12;ctx.setLineDash([60,35]);ctx.beginPath();ctx.moveTo(0,290);ctx.lineTo(900,290);ctx.stroke();ctx.fillStyle='#1f4e79';ctx.font='bold 30px Arial';ctx.fillText('FOTO SINTÉTICA PARA TESTE DE IMPRESSÃO',30,60);const photo=canvas.toDataURL('image/jpeg',0.7);
  await handleFotos([new File([Uint8Array.from(atob(photo.split(',')[1]),c=>c.charCodeAt(0))],'servico-teste.jpg',{type:'image/jpeg'})]);fotoGrid.querySelector('input').value='Drenagem e regularização — imagem sintética de teste.';
  check(fotoGrid.querySelector('img').getAttribute('src').length<=100000,'photo compression fits the document budget');
  const signatureCanvas=document.createElement('canvas');signatureCanvas.width=440;signatureCanvas.height=90;const signatureCtx=signatureCanvas.getContext('2d');signatureCtx.fillStyle='white';signatureCtx.fillRect(0,0,440,90);signatureCtx.fillStyle='#172534';signatureCtx.font='italic 30px Georgia';signatureCtx.fillText('Assinatura de teste',18,58);const signature=signatureCanvas.toDataURL('image/png');
  for(const id of ['assinExecImg','assinSupImg','assinFiscImg']){const el=document.getElementById(id);el.src=signature;el.style.display='block';}
  document.getElementById('execNome').value='Responsável de teste';document.getElementById('supNome').value='Supervisão de teste';document.getElementById('fiscNome').value='Fiscalização de teste';
  document.querySelector('[data-clima="tempo-manha"]').value='Bom';document.querySelector('[data-clima="cond-manha"]').value='Praticável';
  await salvarNoFirebase();
  check(docId==='legacy'&&document.querySelector('.sheet').classList.contains('visivel'),'report remains open after saving with photos');
  check(document.querySelectorAll('#savedReports button').length===1,'saved report appears in month list');
  await abrirDia('2026-07-02');check(docId===null,'opening empty day does not write a new report');
  check(document.getElementById('badgeMaoObraTotal').textContent==='0'&&fotoGrid.children.length===0,'new day has no inherited quantities or images');
  for(let i=0;i<5;i++){await abrirDia('2026-07-01');check(document.querySelectorAll('#gridDireta .card-item').length===24,'reopening does not grow quantity cards');check(document.getElementById('badgeMaoObraTotal').textContent==='9','reopening does not inflate total');await abrirDia('2026-07-02');}
  await abrirDia('2026-07-01');
  check(document.querySelector('#listaComentarios input[type=datetime-local]').value==='2026-07-01T08:15','comment date preserved');
  check(document.querySelector('#listaOcorrencias input[type=datetime-local]').value==='2026-07-01T09:20','occurrence date preserved');
  check(fotoGrid.children.length===1&&document.getElementById('assinExecImg').getAttribute('src')===signature,'photos and signatures round trip');
  for(const [key,id] of Object.entries({exec:'assinExecImg',sup:'assinSupImg',fisc:'assinFiscImg'})){
    check(!document.getElementById(id+'Excluir').hidden,'signature delete button visible after reopen');
    const previousName=document.getElementById(key+'Nome').value;
    document.getElementById(id+'Excluir').click();
    check(!document.getElementById(id).hasAttribute('src')&&document.getElementById(id+'Excluir').hidden,'signature image and delete button removed');
    check(document.getElementById(key+'Nome').value===previousName,'signature name preserved');
    check(coletarDados().midia.assinaturas[key]==='','removed signature excluded from serialized data');
    await salvarNoFirebase();await abrirDia('2026-07-02');await abrirDia('2026-07-01');
    check(!document.getElementById(id).hasAttribute('src')&&document.getElementById(id+'Excluir').hidden,'signature deletion persists after reopen');
    check(buildPDF().querySelectorAll('.pdf-signature img').length===2,'PDF excludes only deleted signature');
    const file=new File([Uint8Array.from(atob(signature.split(',')[1]),c=>c.charCodeAt(0))],'assinatura.png',{type:'image/png'});
    await carregarAssinatura({files:[file],value:''},id);
    check(!document.getElementById(id+'Excluir').hidden&&!!document.getElementById(id).getAttribute('src'),'signature can be added again');
    await salvarNoFirebase();
  }
  // Whole month: 31 separately addressable documents, no duplicate creation on reopen.
  for(let day=1;day<=31;day++){
    const date=calDataISO(2026,9,day);await abrirDia(date,'obra1');
    document.querySelector('#bodyAtiv tr').querySelectorAll('input')[1].value='Atividade do dia '+day;
    await salvarNoFirebase();
  }
  const monthly=[...mock.rows.entries()].filter(([key,data])=>/^rdos\/[^/]+$/.test(key)&&data.obraId==='obra1'&&data.dados.campos.dataRelatorio.startsWith('2026-10-'));
  check(monthly.length===31,'all 31 daily reports saved');check(document.querySelectorAll('#savedReports button').length===31,'all 31 saved reports listed');
  await abrirDia('2026-10-01');check(document.querySelector('#bodyAtiv tr').querySelectorAll('input')[1].value==='Atividade do dia 1','first day is recoverable after saving entire month');
  await voltarParaObras();check(document.getElementById('paginaObras').classList.contains('visivel'),'return to works');check(document.getElementById('obrasGrid').textContent.includes('Abrir último RDO'),'last saved report shortcut');
  await abrirDia('2026-10-31','obra1');
  // Failure cannot hide the report or announce remote success; a local draft survives reopening.
  mock.failSave=true;document.getElementById('local').value='RASCUNHO_PENDENTE';changed();await salvarRascunho();
  check(document.getElementById('saveState').textContent.includes('Não salvo'),'save failure is visible');
  check(document.querySelector('.sheet').classList.contains('visivel'),'save failure does not hide form');
  check((await localOp('get',activeDraftKey)).dados.campos.local==='RASCUNHO_PENDENTE','local draft retained');
  mock.failSave=false;const persisted=mock.rows.get('rdos/'+docId);await openForm({id:docId,obraId:obraAtualId,date:activeDate,data:persisted.dados,version:persisted.versao,fingerprint:stable(persisted.dados)});
  check(document.getElementById('local').value==='RASCUNHO_PENDENTE','local draft restored on reopening');await salvarNoFirebase();
  // Older clients/another session cannot silently overwrite a newer report.
  document.getElementById('local').value='Minha edição';const remote=mock.rows.get('rdos/'+docId);remote.dados.campos.local='Edição de outra pessoa';remote.versao++;
  let conflict=false;try{await salvarNoFirebase();}catch(e){conflict=e.message.includes('Outra pessoa');}
  check(conflict&&document.getElementById('local').value==='Minha edição','conflict preserves editor data');
  check(mock.rows.get('rdos/'+docId).dados.campos.local==='Edição de outra pessoa','conflict does not overwrite server');
  await localOp('delete',activeDraftKey);baseForm=clone(coletarDados());await abrirDia('2026-07-01');
  // HTML-like content stays text, and the PDF gets complete, expanded values.
  addComentario('Autor','</textarea><img src=x onerror=alert(1)>','2026-07-01T12:00');
  check(document.querySelectorAll('#listaComentarios img').length===0,'comments cannot inject markup');
  window.printCalls=0;window.print=()=>{window.printCalls++;};await exportarPDF();
  const pdf=document.getElementById('pdfReport');
  check(window.printCalls===1,'PDF command opens print flow');check(pdf.textContent.includes('FIM_COMENTARIO_TESTE'),'PDF retains complete long text');
  check(pdf.textContent.includes('ATIVIDADE_TESTE')&&pdf.textContent.includes('Praticável'),'PDF includes activities and weather');
  check(pdf.querySelectorAll('input,textarea,select').length===0,'print layout uses expanded text, not clipped form widgets');
  check(pdf.querySelectorAll('.pdf-photo img').length===1&&pdf.querySelectorAll('.pdf-signature img').length===3,'PDF includes photo and signatures');
  // Real browser reload is covered by runner.cjs, with the same persisted mock server state.
  await salvarNoFirebase();
  window.regressionResult={status:'pass',assertions,dates:monthly.length};
  return window.regressionResult;
}
