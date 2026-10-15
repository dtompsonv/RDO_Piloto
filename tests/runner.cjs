const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const server=require('./server.cjs');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/test');
    await page.waitForFunction(()=>!!window.regressionResult,{},{timeout:120000});const result=await page.evaluate(()=>window.regressionResult);assert.equal(result.status,'pass',result.message);assert.deepEqual(errors,[]);
    const out=path.resolve(__dirname,'../test-results');fs.mkdirSync(out,{recursive:true});
    await page.emulateMedia({media:'print'});await page.pdf({path:path.join(out,'rdo-minimo-teste.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
    // A fresh page/JS context restores the same saved records, without changing the number of cards.
    const state=await page.evaluate(()=>[...mock.rows.entries()].map(([key,value])=>[key,JSON.parse(JSON.stringify(value))]));
    await page.route('**/tests/mock.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'mock.js'),'utf8')+'\nmock.rows.clear();for(const [key,value] of '+JSON.stringify(state)+')mock.rows.set(key,value);'}));
    await page.route('**/tests/scenarios.js',route=>route.fulfill({contentType:'text/javascript',body:'async function runRegression(){for(let i=0;i<200&&!reports.size;i++)await new Promise(r=>setTimeout(r,10));await abrirRegistro("legacy");return {assertions:1,dates:31};}'}));
    await page.reload();await page.waitForFunction(()=>document.getElementById('badgeMaoObraTotal').textContent==='9');assert.equal(await page.locator('#gridDireta .card-item').count(),24);assert.equal(await page.locator('#fotoGrid img').count(),1);
    console.log('PASS: '+result.assertions+' verificações; mês completo e recarga real da página; PDF gerado.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
