// Browser-accessible regression harness; Firebase is always replaced before app initialization.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const suite=fs.readFileSync(path.join(__dirname,'browser.cjs'),'utf8');
const mock=suite.slice(suite.indexOf('function firebaseDouble()'),suite.indexOf('async function main()'));
const test=suite.slice(suite.indexOf("    await page.goto(url); ")+"    await page.goto(url); ".length,suite.indexOf('  } finally {await browser.close();'));
const adapters=`
const errors=[]; window.addEventListener('error',e=>errors.push(e.message));
const assert={equal:(a,b,m)=>{if(a!==b)throw Error((m||'equal')+': '+JSON.stringify(a)+' != '+JSON.stringify(b));},notEqual:(a,b,m)=>{if(a===b)throw Error(m||'notEqual');},ok:(v,m)=>{if(!v)throw Error(m||'ok');},match:(v,r)=>{if(!r.test(v))throw Error(v+' does not match '+r);},deepEqual:(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(JSON.stringify(a)+' != '+JSON.stringify(b));}};
const page={evaluate:async(fn,arg)=>fn(arg),waitForTimeout:ms=>new Promise(r=>setTimeout(r,ms)),waitForFunction:async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out');},locator:selector=>({isVisible:async()=>!!document.querySelector(selector)&&getComputedStyle(document.querySelector(selector)).display!=='none',textContent:async()=>document.querySelector(selector)?.textContent,count:async()=>document.querySelectorAll(selector).length,inputValue:async()=>document.querySelector(selector)?.value,getAttribute:async name=>document.querySelector(selector)?.getAttribute(name)})};
(async()=>{try{${test}\n document.getElementById('testResult').textContent='PASS: Todos os cenários de regressão passaram.'; }catch(e){document.getElementById('testResult').textContent='FAIL: '+e.stack;console.error(e);}})();`;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/test'){
    let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www.gstatic.com[^>]+><\/script>/g,'');
    html=html.replace('<head>','<head><script>'+mock+'\nfirebaseDouble();</script>');
    html=html.replace('<body>','<body><pre id="testResult" role="status" style="white-space:pre-wrap;background:#fff;padding:20px">Executando testes...</pre>');
    html=html.replace('</body>','<script>'+adapters.replaceAll('</script>','<\\/script>')+'</script></body>');
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;
  }
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/plain');res.end(fs.readFileSync(file));
});
server.listen(4173,'127.0.0.1',()=>console.log('Regression harness: http://127.0.0.1:4173/test (Firebase simulated)'));
