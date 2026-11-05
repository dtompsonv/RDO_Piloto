const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const pdf=path.resolve(__dirname,'../test-results/rdo-periodo-teste.pdf');
const text=execFileSync('pdftotext',['-layout',pdf,'-'],{encoding:'utf8'}),pages=text.split('\f');
const dates=[...text.matchAll(/Data:\s*(\d{2}\/\d{2}\/\d{4})/g)].map(m=>m[1]);
assert.deepEqual(dates,Array.from({length:11},(_,i)=>String(i+5).padStart(2,'0')+'/10/2026'));
for(const page of pages)assert.ok([...page.matchAll(/Data:\s*\d{2}\/\d{2}\/\d{4}/g)].length<=1,'Each daily report starts on a new page');
for(const [label,date] of [['primeiro','05/10/2026'],['ultimo','15/10/2026']]){const index=pages.findIndex(page=>page.includes(date));assert.ok(index>=0);execFileSync('pdftoppm',['-f',String(index+1),'-l',String(index+1),'-singlefile','-scale-to','1400','-png',pdf,path.join(path.dirname(pdf),'periodo-'+label)]);}
console.log('PASS: PDF contém 11 datas em ordem, com início de RDO em nova página.');
