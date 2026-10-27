const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/test'){
    let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="https:\/\/www.gstatic.com[^>]+><\/script>/g,'');
    html=html.replace('<head>','<head><script src="/tests/mock.js"></script>');
    html=html.replace('<body>','<body><pre id="testResult" role="status" style="white-space:pre-wrap;background:#fff;padding:20px">Executando regressões...</pre>');
    html=html.replace('</body>','<script src="/tests/scenarios.js"></script><script>runRegression().then(result=>document.getElementById("testResult").textContent="PASS: "+result.assertions+" verificações; "+result.dates+" RDOs do mês salvos e reabertos.").catch(e=>{window.regressionResult={status:"fail",message:e.stack};document.getElementById("testResult").textContent="FAIL: "+e.stack;console.error(e);});</script></body>');
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'text/plain');res.end(fs.readFileSync(file));
});
if(require.main===module)server.listen(4174,'127.0.0.1',()=>console.log('Testes isolados: http://127.0.0.1:4174/test'));
module.exports=server;
