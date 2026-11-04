import {euro} from './mail.mjs';
// PDF 1.4, embedded page content and standard WinAnsi fonts, no remote renderer.
export function pdf(report){
 const clean=s=>String(s).normalize('NFC').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/€/g,'EUR').replace(/[^\x20-\xff]/g,'?');
 const wrap=s=>{const words=clean(s).split(' '),lines=[];let l='';for(const w of words){if(l.length+w.length>91){lines.push(l);l=''}l+=(l?' ':'')+w}lines.push(l);return lines};
 const lines=[`Periodo: ${report.month}`,`Confermate: ${report.confirmed} | Effettuate e pagate: ${report.completed} | Annullate: ${report.cancelled}`,''];
 for(const r of report.rows.filter(r=>r.status==='completed'))lines.push(...wrap(`${r.id} | ${r.date} | ${r.experience==='dinner'?'Cena in villa':'Pasta e cena'} | ${r.name}`),`Importo: ${euro(r.final)} | Commissione: ${euro(r.fee)} | Versato: ${euro(r.settled)}`,'');
 lines.push(`Commissioni maturate: ${euro(report.fees)}`,`Importi versati: ${euro(report.settled)}`,`Saldo residuo: ${euro(report.balance)}`);
 const chunks=[];while(lines.length)chunks.push(lines.splice(0,39));
 const objects=['',''];const pages=[];const lit=s=>clean(s).replace(/[\\()]/g,'\\$&');
 for(const [i,chunk] of chunks.entries()){
  const pid=objects.length+1,cid=pid+1;pages.push(pid);
  let stream=`0.14 0.24 0.18 rg\nBT /F1 20 Tf 45 790 Td (Villa Mafalda) Tj ET\nBT /F1 12 Tf 45 764 Td (Rendiconto Simonetta Garelli - ${lit(report.month)}) Tj ET\n0.70 0.60 0.40 RG 45 750 m 550 750 l S\nBT /F1 10 Tf 14 TL 45 724 Td\n`;
  stream+=chunk.map((s,j)=>(j?'T* ':'')+`(${lit(s)}) Tj`).join('\n');stream+=`\nET\nBT /F1 9 Tf 45 38 Td (Documento riservato - Pagina ${i+1}/${chunks.length}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Contents ${cid} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(p=>p+' 0 R').join(' ')}] >>`;
 let output='%PDF-1.4\n';const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(output.length);output+=`${i+1} 0 obj\n${obj}\nendobj\n`}const start=output.length;output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
 return Uint8Array.from(output,c=>c.charCodeAt(0));
}
