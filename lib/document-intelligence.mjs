import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileP=promisify(execFile);

const tidy=s=>String(s||'').replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
const ascii=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');
const ntext=s=>ascii(String(s||'')).toUpperCase();

async function cmd(file,args,timeout=30000){
  try{const {stdout,stderr}=await execFileP(file,args,{timeout,maxBuffer:12*1024*1024});return {ok:true,stdout:String(stdout||''),stderr:String(stderr||'')}}
  catch(e){return {ok:false,stdout:String(e.stdout||''),stderr:String(e.stderr||e.message||'')}}
}

function textQuality(s){
  const t=tidy(s),a=ascii(t).toUpperCase();let score=(a.match(/[A-Z0-9]/g)||[]).length;
  for(const k of ['DE NGHI THANH TOAN','HOA DON','HOP DONG','PHIEU CAN','BIEN BAN NGHIEM THU','CONG TY','NGAY','SO TIEN','NHA CUNG CAP']) if(a.includes(k)) score+=120;
  return score;
}
async function bestOcr(filePath,{workDir=null,preprocessScale='180%'}={}){
  const candidates=[];
  // Two layout modes on the original are cheap and preserve clean scans.
  for(const psm of ['4','6']){
    let r=await cmd('tesseract',[filePath,'stdout','-l','vie+eng','--psm',psm],25000);
    if(!r.ok) r=await cmd('tesseract',[filePath,'stdout','-l','eng','--psm',psm],25000);
    if(r.ok) candidates.push({text:r.stdout,method:`ocr_psm${psm}`});
  }
  // One enhanced pass only. Checkpoint 3 intentionally avoids the old 300% x 2-pass
  // preprocessing because multi-page scans became unacceptably slow.
  const work=workDir||await mkdtemp(join(tmpdir(),'gami-imgprep-'));const own=!workDir;
  try{
    const pre=join(work,`pre-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    let magick=await cmd('magick',[filePath,'-resize',preprocessScale,'-colorspace','Gray','-contrast-stretch','0x10%','-sharpen','0x0.8',pre],18000);
    if(!magick.ok) magick=await cmd('convert',[filePath,'-resize',preprocessScale,'-colorspace','Gray','-contrast-stretch','0x10%','-sharpen','0x0.8',pre],18000);
    if(magick.ok){
      let r=await cmd('tesseract',[pre,'stdout','-l','vie+eng','--psm','4'],30000);
      if(!r.ok) r=await cmd('tesseract',[pre,'stdout','-l','eng','--psm','4'],30000);
      if(r.ok) candidates.push({text:r.stdout,method:'preprocessed_psm4'});
    }
  } finally { if(own) await rm(work,{recursive:true,force:true}); }
  candidates.sort((a,b)=>textQuality(b.text)-textQuality(a.text));
  return candidates[0]||{text:'',method:'ocr_failed'};
}

async function extractPdf(filePath){
  const direct=await cmd('pdftotext',['-layout',filePath,'-'],20000);
  const text=tidy(direct.stdout);
  if(direct.ok && text.length>=80) return {text,method:'pdf_text',warnings:[]};

  const work=await mkdtemp(join(tmpdir(),'gami-ocr-'));
  const warnings=[];
  try{
    const prefix=join(work,'page');
    const raster=await cmd('pdftoppm',['-f','1','-l','3','-r','160','-png',filePath,prefix],45000);
    if(!raster.ok) return {text,method:'pdf_text_empty',warnings:['pdftoppm unavailable or failed']};
    const images=(await readdir(work)).filter(x=>x.endsWith('.png')).sort();
    const out=[];let usedPreprocess=false;
    for(const img of images){
      const ocr=await bestOcr(join(work,img),{workDir:work});
      if(ocr.text){out.push(ocr.text);if(ocr.method.startsWith('preprocessed'))usedPreprocess=true}else warnings.push(`OCR failed: ${img}`);
    }
    const ocrText=tidy(out.join('\n\n'));
    return {text:ocrText,method:ocrText?(usedPreprocess?'pdf_ocr_preprocessed':'pdf_ocr'):'pdf_ocr_empty',warnings};
  } finally { await rm(work,{recursive:true,force:true}); }
}

async function extractImage(filePath){
  const ocr=await bestOcr(filePath,{preprocessScale:'300%'});
  return {text:tidy(ocr.text),method:ocr.text?`image_${ocr.method}`:'image_ocr_failed',warnings:ocr.text?[]:['OCR unavailable or failed']};
}

async function extractDocx(filePath){
  const r=await cmd('unzip',['-p',filePath,'word/document.xml'],15000);
  if(!r.ok) return {text:'',method:'docx_failed',warnings:['Cannot read document.xml']};
  const text=tidy(r.stdout.replace(/<w:tab\/?[^>]*>/g,'\t').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
  return {text,method:'docx_xml',warnings:[]};
}

export async function extractText(filePath,mimeType='',originalName=''){
  const ext=extname(originalName||filePath).toLowerCase();
  if(ext==='.pdf'||mimeType==='application/pdf') return extractPdf(filePath);
  if(['.png','.jpg','.jpeg','.webp','.tif','.tiff'].includes(ext)||String(mimeType).startsWith('image/')) return extractImage(filePath);
  if(ext==='.docx'||mimeType==='application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocx(filePath);
  if(['.txt','.csv','.json','.xml','.html','.md'].includes(ext)||String(mimeType).startsWith('text/')){
    const text=tidy(await readFile(filePath,'utf8')); return {text,method:'plain_text',warnings:[]};
  }
  return {text:'',method:'unsupported',warnings:['Stored successfully; intelligence extraction not supported for this file type yet.']};
}

function firstMatch(text,patterns){
  for(const p of patterns){const m=text.match(p);if(m?.[1])return tidy(m[1]);}
  return null;
}
function parseMoney(s){ if(!s)return null; const d=String(s).replace(/[^0-9]/g,''); return d?Number(d):null; }
function viDateToIso(s){
  if(!s)return null;
  let m=String(s).match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/); if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=ntext(s).match(/NGAY\s+(\d{1,2})\s+TH(?:ANG|ING)\s+(\d{1,2})\s+NAM\s+(\d{4})/); if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}
function field(value,confidence){return value==null||value===''?null:{value,confidence};}
function unfield(fields){const o={};for(const [k,v] of Object.entries(fields))if(v)o[k]=v.value;return o;}
function overall(fields,typeConfidence=.2){const vals=Object.values(fields).filter(Boolean);if(!vals.length)return typeConfidence;const weighted=vals.reduce((a,x)=>a+x.confidence,0)/vals.length;return Math.min(.99,Math.round((typeConfidence*.3+weighted*.7)*100)/100);}

function detectType(text,filename=''){
  const t=ntext(text+' '+filename);
  if(/PHIEU\s*CAN|TRONG LUONG|GROSS\s*WEIGHT|TARE\s*WEIGHT|NET\s*WEIGHT/.test(t))return ['weight_ticket',.92];
  if(/BIEN BAN NGHIEM THU|BBNT|NGHIEM THU.*DICH VU/.test(t))return ['acceptance_report',.92];
  if(/DE NGHI THANH TOAN|GIAY DE NGHI.*TAM UNG|QUYET TOAN TAM UNG/.test(t))return ['payment_request',.9];
  if(/HOA DON GIA TRI GIA TANG|VAT INVOICE|MA CO QUAN THUE|TONG CONG TIEN THANH TOAN/.test(t))return ['invoice',.96];
  if(/HOP DONG|CONTRACT/.test(t))return ['contract',.9];
  return ['unknown',.2];
}

function parseInvoice(text){
  const fields={};
  fields.invoice_no=field(firstMatch(text,[/(?:Số|So)\s*[:#]?\s*([0-9]{2,12})/i,/Invoice\s*(?:No\.?|Number)\s*[:#]?\s*([A-Z0-9-]+)/i]),.93);
  const d=firstMatch(text,[/(Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4})/i,/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/]);fields.invoice_date=field(viDateToIso(d),.95);
  fields.tax_code=field(firstMatch(text,[/Mã số thuế\s*[:]?\s*([0-9]{10,14})/i,/MST\s*[:]?\s*([0-9]{10,14})/i]),.88);
  fields.buyer_tax_code=field(firstMatch(text,[/Tên đơn vị[^\n]*\nMã số thuế\s*[:]?\s*([0-9]{10,14})/i]),.82);
  fields.amount=field(parseMoney(firstMatch(text,[/Tổng cộng tiền thanh toán\s*[:]?\s*([0-9.,\s]+)/i,/Tổng thanh toán\s*[:]?\s*([0-9.,\s]+)/i])),.97);
  fields.quantity=field(parseMoney(firstMatch(text,[/Rác thải\s+Sinh hoạt[^\n]*?([0-9][0-9.,]*)\s+2[.,]?500/i,/khối lượng[^\n]*?([0-9][0-9.,]*)\s*(?:kg|KG)/i])),.72);
  fields.vendor_name=field(firstMatch(text,[/^(CÔNG TY[^\n]{5,120})$/mi,/Tên đơn vị bán[^:]*:\s*([^\n]+)/i]),.78);
  const desc=firstMatch(text,[/(Thu gom và xử lý chất thải[^\n]*)/i,/(Thu gom[^\n]{0,120})/i]);fields.service_description=field(desc,.8);
  return fields;
}
function parseContract(text){
  const fields={};
  // OCR commonly reads “Số” as “So”, “S6” or “S0”. Prefer the number close to the
  // contract heading before falling back to generic legal-reference numbers.
  const head=text.slice(0,1400);
  let contractNo=firstMatch(head,[/(?:HỢP\s*ĐỒNG|HOP\s*DONG)[\s\S]{0,180}?S[ốoó06]\s*[:#]?\s*([0-9][0-9A-ZĐđ.\/\- ]{5,48})/i,/S[ốoó06]\s*[:#]\s*([0-9][0-9A-ZĐđ.\/\- ]{5,48})/i]);
  if(!contractNo) contractNo=firstMatch(text,[/(?:Hợp đồng|HĐ)\s*(?:số|No\.?|:)\s*[:]?\s*([A-Z0-9.\/-]+)/i,/[S$][ốoó]\s*[:]?\s*([0-9]{2,}[^\s]{3,48})/i]);
  if(contractNo) contractNo=contractNo.replace(/\s+/g,'').replace(/[;,]+$/,'');
  fields.contract_no=field(contractNo,.88);
  const d=firstMatch(text,[/(Hôm nay,?\s*ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4})/i,/(Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4})/i,/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/]);fields.signed_date=field(viDateToIso(d?.replace(/^Hôm nay,?\s*/i,'')),.9);
  const paymentDays=firstMatch(text,[/trong\s+vòng\s+(\d{1,3})(?:\s*\([^)]*\))?\s+ngày[^\n]{0,180}(?:hóa đơn|hoa don)/i,/(\d{1,3})(?:\s*\([^)]*\))?\s+ngày\s+kể\s+từ[^\n]{0,180}(?:hóa đơn|hoa don)/i])||firstMatch(ntext(text),[/TRONG\s+VONG\s+(\d{1,3})(?:\s*\([^)]*\))?\s+NGAY[^\n]{0,180}HOA\s+DON/i,/(\d{1,3})(?:\s*\([^)]*\))?\s+NGAY\s+KE\s+TU[^\n]{0,180}HOA\s+DON/i]);
  fields.payment_term_days=field(Number(paymentDays)||null,.95);
  fields.vendor_name=field(firstMatch(text,[/([^\n]*C[ÔO]NG TY[^\n]*URENCO\s*11)/i,/(?:Bên B|BÊN B)[^\n]*\n\s*([^\n]*CÔNG TY[^\n]*)/i]),.88);
  fields.service_description=field(firstMatch(text,[/(thu gom[^\n]{0,160}(?:chất thải|rác)[^\n]*)/i,/(vận chuyển[^\n]{0,160}xử lý[^\n]*)/i]),.76);
  return fields;
}
function parseWeight(text){
  const fields={};
  const d=firstMatch(text,[/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/]);fields.date=field(viDateToIso(d),.8);
  fields.gross_kg=field(parseMoney(firstMatch(text,[/(?:Gross(?:\s*Weight)?|Tổng trọng lượng|Trọng lượng toàn bộ)\s*[:]?\s*([0-9.,]+)/i])),.88);
  fields.tare_kg=field(parseMoney(firstMatch(text,[/(?:Tare(?:\s*Weight)?|Bì|Trọng lượng xe)\s*[:]?\s*([0-9.,]+)/i])),.88);
  fields.net_kg=field(parseMoney(firstMatch(text,[/(?:Net(?:\s*Weight)?|Thực|Khối lượng hàng|Khối lượng tịnh)\s*[:]?\s*([0-9.,]+)/i])),.9);
  fields.vehicle_no=field(firstMatch(text,[/(?:Biển số|BKS|Vehicle)\s*[:]?\s*([0-9A-Z.-]{5,15})/i]),.72);
  return fields;
}
function parseAcceptance(text){
  const fields={};
  const d=firstMatch(text,[/(Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4})/i,/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/]);fields.date=field(viDateToIso(d),.8);
  fields.contract_no=field(firstMatch(text,[/(?:Hợp đồng|HĐ)\s*(?:số)?\s*[:]?\s*([A-Z0-9.\/-]+)/i]),.76);
  fields.vendor_name=field(firstMatch(text,[/(CÔNG TY[^\n]{5,120})/i]),.7);
  fields.scope=field(firstMatch(text,[/(?:Nội dung nghiệm thu|Nội dung công việc)\s*[:]?\s*([^\n]{5,180})/i]),.72);
  return fields;
}
function parsePaymentRequest(text){
  const fields={},nt=ntext(text),at=ascii(text);
  let m=nt.match(/NGAY\s+(\d{1,2})\s+TH(?:ANG|ING)\s+(\d{1,2})\s+NAM\s+(\d{4})/);
  fields.date=field(m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:viDateToIso(firstMatch(text,[/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/])),.86);
  m=nt.match(/NGAY\s*PHAI\s*TT\s*[:]?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  fields.required_payment_date=field(m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null,.92);
  fields.request_no=field(firstMatch(text,[/(?:^|\n)\s*S[ốoóéèe]\s*[:]?\s*[—–-]?\s*([0-9]{2,12})/im]),.82);
  m=nt.match(/DE NGHI\s+(?:CHI\s+)?THANH TOAN\s+SO TIEN\s*[:]?\s*([0-9.,\s]+)/);
  fields.amount=field(parseMoney(m?.[1]||firstMatch(text,[/(?:Số tiền đề nghị|Tổng tiền)\s*[:]?\s*([0-9.,\s]+)/i])),.93);
  const vendorAscii=firstMatch(at,[/(?:Thanh toan cho nha cung cap|Nha cung cap|NCC|Don vi)\s*[:]?\s*([^\n]{4,160})/i]);
  fields.vendor_name=field(firstMatch(text,[/(?:Thanh toán cho nhà cung cấp|Nhà cung cấp|NCC|Đơn vị)\s*[:]?\s*([^\n]{4,160})/i])||vendorAscii,.78);
  fields.requester=field(firstMatch(text,[/Tên\s+(?:tôi|toi)\s+l[aà]\s*[:]?\s*([^\n]{4,120})/i]),.82);
  fields.employee_code=field(firstMatch(text,[/\((NV\s*\d{3,10})\)/i]),.9);
  fields.department=field(firstMatch(text,[/Bộ\s*phận\s*công\s*tác\s*[:]?\s*([^\n]{3,120})/i]),.82);
  fields.invoice_no=field(firstMatch(text,[/(?:HĐ|HD)\s*[:]?\s*([0-9]{2,12})/i]),.88);
  fields.bank_account=field(firstMatch(at,[/Tai\s*khoan\s*(?:ngan hang|ngan hing|ngan hang)?\s*[:]?\s*([0-9]{8,20})/i]),.72);
  fields.purpose=field(firstMatch(text,[/(?:Nội dung|Lý do chi|Lý do|Mục đích)\s*[:]?\s*([^\n]{4,220})/i])||firstMatch(at,[/(?:Noi dung|Ly do chi|Ly do|Muc dich)\s*[:]?\s*([^\n]{4,220})/i]),.75);
  return fields;
}

export function analyzeText(text,originalName=''){
  const clean=tidy(text); const [docType,typeConfidence]=detectType(clean,originalName);
  let fields={};
  if(docType==='invoice')fields=parseInvoice(clean);
  else if(docType==='contract')fields=parseContract(clean);
  else if(docType==='weight_ticket')fields=parseWeight(clean);
  else if(docType==='acceptance_report')fields=parseAcceptance(clean);
  else if(docType==='payment_request')fields=parsePaymentRequest(clean);
  const confidence=overall(fields,typeConfidence);
  return {doc_type:docType,doc_type_confidence:typeConfidence,confidence,fields,values:unfield(fields),text_preview:clean.slice(0,2200)};
}

export async function analyzeDocument(filePath,mimeType='',originalName=''){
  const ext=await extractText(filePath,mimeType,originalName);
  const analysis=analyzeText(ext.text,originalName);
  return {...analysis,extraction_method:ext.method,warnings:ext.warnings,text_length:ext.text.length};
}
