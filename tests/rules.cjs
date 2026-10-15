const {test,before,after}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,runTransaction,serverTimestamp}=require('firebase/firestore');
const {ref,uploadBytes,getBytes}=require('firebase/storage');
let env;
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-rdo-piloto',firestore:{rules:fs.readFileSync('firestore.rules','utf8')},storage:{rules:fs.readFileSync('storage.rules','utf8')}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'obras/o1'),{proprietario:'owner',membros:['owner','reader'],editores:['owner']});
    await setDoc(doc(db,'rdos/r1'),{obraId:'o1',dados:{campos:{dataRelatorio:'2026-10-15',local:'Inicial'}},versao:1});
  });
});
after(async()=>{await env?.cleanup();});
test('only obra members can read reports; anonymous and outsiders cannot',async()=>{
  await assertSucceeds(getDoc(doc(env.authenticatedContext('reader').firestore(),'rdos/r1')));
  await assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(),'rdos/r1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'rdos/r1')));
});
test('reader cannot edit reports or grant membership',async()=>{
  const db=env.authenticatedContext('reader').firestore();
  await assertFails(updateDoc(doc(db,'rdos/r1'),{versao:2}));
  await assertFails(updateDoc(doc(db,'obras/o1'),{editores:['reader']}));
});
test('owner can commit report and immutable history together',async()=>{
  const db=env.authenticatedContext('owner').firestore();
  await assertSucceeds(runTransaction(db,async tx=>{
    const r=doc(db,'rdos/r1');const s=await tx.get(r);const v=s.data().versao+1;
    const dados={campos:{dataRelatorio:'2026-10-15',local:'Atualizado'}};
    tx.update(r,{dados,versao:v,modificadoPor:'Nome',modificadoPorUid:'owner',modificadoEm:serverTimestamp()});
    tx.set(doc(db,'rdos/r1/historico/v'+v),{autor:'Nome',autorUid:'owner',data:serverTimestamp(),versao:v,dados});
  }));
  await assertFails(updateDoc(doc(db,'rdos/r1/historico/v2'),{autor:'Outra pessoa'}));
  await assertFails(updateDoc(doc(db,'rdos/r1'),{obraId:'outra'}));
});
test('daily creation and index are atomic and index cannot be reassigned',async()=>{
  const db=env.authenticatedContext('owner').firestore();
  await assertSucceeds(runTransaction(db,async tx=>{
    await tx.get(doc(db,'rdos/daily'));
    const dados={campos:{dataRelatorio:'2026-10-16'}};
    tx.set(doc(db,'rdos/daily'),{obraId:'o1',dados,criadoPorUid:'owner',modificadoPorUid:'owner',versao:1,criadoEm:serverTimestamp(),modificadoEm:serverTimestamp()});
    tx.set(doc(db,'rdos/daily/historico/v1'),{autorUid:'owner',data:serverTimestamp(),versao:1,dados});
    tx.set(doc(db,'obras/o1/dias/2026-10-16'),{rdoId:'daily'});
  }));
  await assertFails(updateDoc(doc(db,'obras/o1/dias/2026-10-16'),{rdoId:'r1'}));
});
test('storage enforces membership, editor role and image types',async()=>{
  const file='obras/o1/rdos/r1/photo';
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext('owner').storage(),file),new Uint8Array([1,2,3]),{contentType:'image/png'}));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('reader').storage(),file)));
  await assertFails(getBytes(ref(env.authenticatedContext('outsider').storage(),file)));
  await assertFails(uploadBytes(ref(env.authenticatedContext('reader').storage(),file+'2'),new Uint8Array([1]),{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(env.authenticatedContext('owner').storage(),file+'3'),new Uint8Array([1]),{contentType:'text/html'}));
});
