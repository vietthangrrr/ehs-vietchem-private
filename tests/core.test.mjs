import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateBackupArchive, restoreBackupArchive } from '../lib/backup.mjs';
import { analyzeText } from '../lib/document-intelligence.mjs';
import { unzipEntries } from '../lib/xlsx-template.mjs';

test('VIETCHEM EHS checkpoint7.2 integration suite', async (t)=>{
  const root=fileURLToPath(new URL('..', import.meta.url));
  const tmp=await mkdtemp(join(tmpdir(),'gami-ehs-test-'));
  const port=18987;
  const bootstrap='TempPass!2026';
  const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),EHS_DATA_DIR:join(tmp,'data'),EHS_UPLOAD_DIR:join(tmp,'uploads'),EHS_ADMIN_PASSWORD:bootstrap,EHS_ENABLE_LEGAL_WATCH:'0',EHS_AUTO_BACKUP:'0'},stdio:['ignore','pipe','pipe']});
  let started=false;
  child.stdout.on('data',d=>{if(String(d).includes('VIETCHEM EHS System CP7.2 Login Recovery'))started=true});
  child.stderr.on('data',d=>{if(!String(d).includes('ExperimentalWarning'))process.stderr.write('[server] '+String(d))});
  for(let i=0;i<160&&!started;i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(started,true,'server did not start');
  t.after(async()=>{child.kill('SIGTERM');await rm(tmp,{recursive:true,force:true})});

  let adminCookie='';
  async function req(path,options={},cookie=adminCookie){
    const headers={...(options.body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(options.headers||{})};
    const r=await fetch(`http://127.0.0.1:${port}${path}`,{...options,headers});
    const j=await r.json().catch(()=>({}));return{r,j};
  }
  const cookieFrom=r=>(r.headers.get('set-cookie')||'').split(';')[0];
  async function importAndProcess(name,text,category='payment'){
    const imp=await req('/api/documents',{method:'POST',body:JSON.stringify({original_name:name,mime_type:'text/plain',base64:Buffer.from(text).toString('base64'),category,site_id:'site_tt'})});
    assert.equal(imp.r.status,201);
    const ext=await req('/api/document-intelligence/process',{method:'POST',body:JSON.stringify({document_id:imp.j.id})});
    assert.equal(ext.r.status,200);
    return {document:imp.j,extraction:ext.j};
  }

  await t.test('unauthenticated API is blocked and security headers are present',async()=>{
    const {r,j}=await req('/api/dashboard',{},'');assert.equal(r.status,401);assert.equal(j.error,'AUTH_REQUIRED');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
  });
  await t.test('pilot admin login succeeds and session can access app',async()=>{
    const login=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:'admin',password:bootstrap})},'');assert.equal(login.r.status,200);adminCookie=cookieFrom(login.r);assert.ok(adminCookie.includes('ehs_session='));
    if(login.j.user.must_change_password){const ch=await req('/api/auth/change-password',{method:'POST',body:JSON.stringify({old_password:bootstrap,new_password:'AdminNew!2026xx'})});assert.equal(ch.r.status,200)}
    const ok=await req('/api/dashboard');assert.equal(ok.r.status,200);
  });
  await t.test('real seed foundation + checkpoint5 baselines are loaded',async()=>{
    const {r,j}=await req('/api/source-stats');assert.equal(r.status,200);assert.equal(j.employees,430);assert.equal(j.ppeItems,70);assert.equal(j.planObligations,345);assert.equal(j.legalReview,6);assert.equal(j.equipment,16);assert.equal(j.legalSources,8);
  });
  await t.test('dashboard exposes equipment and legal-update warning dimensions',async()=>{
    const {r,j}=await req('/api/dashboard');assert.equal(r.status,200);assert.equal(typeof j.ppeNegative,'number');assert.equal(typeof j.legalReview,'number');assert.equal(j.equipExpired,16);assert.equal(j.legalUpdates,3);
  });
  await t.test('official legal baseline and update review are explicit',async()=>{
    const sources=(await req('/api/legal-sources')).j;assert.equal(sources.length,8);assert.ok(sources.every(x=>String(x.official_url||'').startsWith('https://vanban.chinhphu.vn/')));
    const updates=(await req('/api/legal-updates')).j;assert.equal(updates.filter(x=>x.status==='needs_review').length,3);
    const u=updates.find(x=>x.id==='lu_fire_2026');assert.ok(u);
    const done=await req('/api/legal-updates/resolve',{method:'POST',body:JSON.stringify({id:u.id,status:'action_required',review_note:'QA: review PCCC forms/workflows before changing obligations.'})});assert.equal(done.r.status,200);
    const after=(await req('/api/legal-updates')).j.find(x=>x.id===u.id);assert.equal(after.status,'action_required');
  });
  await t.test('checkpoint7 private health endpoint is public and minimal',async()=>{const r=await fetch(`http://127.0.0.1:${port}/healthz`);assert.equal(r.status,200);const j=await r.json();assert.equal(j.status,'ok');assert.match(j.version,/checkpoint7\.2-login-recovery/);assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive')});
  await t.test('checkpoint7 Legal Intelligence searches curated official register without auto-changing obligations',async()=>{const out=await req('/api/legal-search?q=105%2F2025');assert.equal(out.r.status,200);assert.ok(out.j.results.sources.some(x=>x.code==='105/2025/NĐ-CP'));assert.ok(Array.isArray(out.j.official_portals)&&out.j.official_portals.length>=2);const ui=await readFile(join(root,'public','app.js'),'utf8');assert.match(ui,/Tra cứu luật nội bộ/);assert.match(ui,/Human review required/)});
  await t.test('employee master can be filtered by site',async()=>{const all=(await req('/api/employees?site=TT&status=active')).j;assert.ok(all.length>100);assert.ok(all.every(x=>x.site_code==='TT'))});
  await t.test('PPE issue allows negative stock and records it',async()=>{const em=(await req('/api/employees?site=TT&status=active')).j[0];const p=(await req('/api/ppe')).j.items.find(x=>x.sku==='PPE-001');const qty=Math.max(1,Number(p.current_stock)+5);const {r,j}=await req('/api/ppe/issue',{method:'POST',body:JSON.stringify({employee_id:em.id,lines:[{item_id:p.id,quantity:qty}],reason:'test'})});assert.equal(r.status,201);assert.equal(j.results[0].negative_stock,true);assert.ok(j.results[0].after<0)});
  await t.test('checkpoint5.5 PPE history is full-width data source with filters and dedicated Excel export',async()=>{const all=await req('/api/ppe/history?limit=1000');assert.equal(all.r.status,200);assert.ok(Array.isArray(all.j));assert.ok(all.j.length>0);const outs=await req('/api/ppe/history?type=OUT&limit=1000');assert.equal(outs.r.status,200);assert.ok(outs.j.every(x=>x.type==='OUT'));const r=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=ppe-ledger`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/spreadsheetml/);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length>1000);assert.equal(b[0],0x50);assert.equal(b[1],0x4b)});

  await t.test('checkpoint6.1 PPE size management supports one-size and multi-size stock',async()=>{
    const cr=await req('/api/ppe/catalog',{method:'POST',body:JSON.stringify({sku:'QA-SIZE-001',name:'QA Giày bảo hộ nhiều size',unit:'đôi',one_size:false,size_options:['40','41','42'],opening_stock:12,min_stock:2,unit_price:200000})});assert.equal(cr.r.status,201);
    let item=(await req('/api/ppe/catalog')).j.find(x=>x.id===cr.j.id);assert.ok(item);assert.equal(Number(item.one_size),0);assert.deepEqual(item.size_options,['40','41','42']);assert.equal(item.size_stocks.find(x=>x.size_label==='__UNALLOCATED__').current_stock,12);
    const adj=await req('/api/ppe/adjust',{method:'POST',body:JSON.stringify({item_id:item.id,size_label:'41',quantity:5,unit_price:200000,reason:'QA nhập size 41'})});assert.equal(adj.r.status,200);assert.equal(adj.j.size_after,5);
    const emp=(await req('/api/employees?site=TT&status=active')).j[0];const issue=await req('/api/ppe/issue',{method:'POST',body:JSON.stringify({employee_id:emp.id,lines:[{item_id:item.id,size_label:'41',quantity:2}],reason:'QA cấp size'})});assert.equal(issue.r.status,201);assert.equal(issue.j.results[0].size_label,'41');assert.equal(issue.j.results[0].size_after,3);
    const hist=(await req('/api/ppe/history?q=41&limit=100')).j;assert.ok(hist.some(x=>x.item_id===item.id&&x.size_label==='41'));
    const one=await req('/api/ppe/catalog',{method:'POST',body:JSON.stringify({sku:'QA-ONESIZE-001',name:'QA Áo phản quang one size',unit:'cái',one_size:true,opening_stock:2})});assert.equal(one.r.status,201);const oneItem=(await req('/api/ppe/catalog')).j.find(x=>x.id===one.j.id);assert.equal(Number(oneItem.one_size),1);assert.equal(oneItem.size_options.length,0);
    const ui=await readFile(join(root,'public','app.js'),'utf8');assert.match(ui,/Một size/);assert.match(ui,/Danh sách size/);assert.match(ui,/Chưa phân size/);
  });
  await t.test('checkpoint6.2 PPE issue history correction returns old stock and writes reversal + corrected OUT',async()=>{
    const emp=(await req('/api/employees?site=TT&status=active')).j[0];
    const item=(await req('/api/ppe')).j.items.find(x=>x.sku==='PPE-002');assert.ok(item);
    const before=Number(item.current_stock);
    const issued=await req('/api/ppe/issue',{method:'POST',body:JSON.stringify({employee_id:emp.id,lines:[{item_id:item.id,quantity:3}],reason:'Cấp mới',note:'QA correction source'})});assert.equal(issued.r.status,201);
    const hist1=(await req('/api/ppe/history?type=OUT&limit=1000')).j;const original=hist1.find(x=>x.item_id===item.id&&x.note==='QA correction source'&&String(x.tx_status||'active')==='active');assert.ok(original);
    const afterIssue=Number((await req('/api/ppe')).j.items.find(x=>x.id===item.id).current_stock);assert.equal(afterIssue,before-3);
    const fix=await req('/api/ppe/history/correct',{method:'POST',body:JSON.stringify({transaction_id:original.id,mode:'correct',employee_id:emp.id,item_id:item.id,quantity:1,reason:'Cấp mới',note:'QA corrected',correction_reason:'QA xuất nhầm số lượng 3 thành 1'})});assert.equal(fix.r.status,200);assert.ok(fix.j.reversal_id);assert.ok(fix.j.replacement_id);
    const afterFix=Number((await req('/api/ppe')).j.items.find(x=>x.id===item.id).current_stock);assert.equal(afterFix,before-1,'old quantity must be returned before corrected quantity is re-issued');
    const hist2=(await req('/api/ppe/history?limit=1000')).j;const old=hist2.find(x=>x.id===original.id),rev=hist2.find(x=>x.id===fix.j.reversal_id),rep=hist2.find(x=>x.id===fix.j.replacement_id);assert.equal(old.tx_status,'superseded');assert.equal(rev.type,'REVERSAL');assert.equal(rev.reversal_of_id,original.id);assert.equal(rep.type,'OUT');assert.equal(rep.tx_status,'active');assert.equal(rep.correction_of_id,original.id);assert.equal(rep.quantity,1);assert.match(rep.correction_reason,/xuất nhầm/i);
    const cancel=await req('/api/ppe/history/correct',{method:'POST',body:JSON.stringify({transaction_id:rep.id,mode:'cancel',correction_reason:'QA hủy lần xuất sửa lại'})});assert.equal(cancel.r.status,200);
    const afterCancel=Number((await req('/api/ppe')).j.items.find(x=>x.id===item.id).current_stock);assert.equal(afterCancel,before,'cancel must return corrected issue fully to stock');
    const finalHist=(await req('/api/ppe/history?limit=1000')).j;assert.equal(finalHist.find(x=>x.id===rep.id).tx_status,'voided');
    const ui=await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();assert.match(ui,/Sửa lịch sử xuất PPE/);assert.match(ui,/tự hoàn về kho/);assert.match(ui,/ppeHistEdit/);
  });

  await t.test('checkpoint6.2 correction moves stock safely between PPE sizes',async()=>{
    const item=(await req('/api/ppe/catalog')).j.find(x=>x.sku==='QA-SIZE-001');assert.ok(item);
    const emp=(await req('/api/employees?site=TT&status=active')).j[1];
    const st42=item.size_stocks.find(x=>x.size_label==='42');if(!st42||Number(st42.current_stock)<4)await req('/api/ppe/adjust',{method:'POST',body:JSON.stringify({item_id:item.id,size_label:'42',quantity:4,unit_price:200000,reason:'QA stock size42'})});
    let cat=(await req('/api/ppe/catalog')).j.find(x=>x.id===item.id);const b41=Number(cat.size_stocks.find(x=>x.size_label==='41').current_stock),b42=Number(cat.size_stocks.find(x=>x.size_label==='42').current_stock);
    const issue=await req('/api/ppe/issue',{method:'POST',body:JSON.stringify({employee_id:emp.id,lines:[{item_id:item.id,size_label:'41',quantity:2}],reason:'Cấp mới',note:'QA wrong size'})});assert.equal(issue.r.status,201);
    const original=(await req('/api/ppe/history?type=OUT&q=QA%20wrong%20size&limit=100')).j.find(x=>x.note==='QA wrong size');assert.ok(original);
    const fix=await req('/api/ppe/history/correct',{method:'POST',body:JSON.stringify({transaction_id:original.id,mode:'correct',employee_id:emp.id,item_id:item.id,size_label:'42',quantity:1,reason:'Cấp mới',note:'QA corrected size',correction_reason:'Nhầm size 41 thành 42'})});assert.equal(fix.r.status,200);
    cat=(await req('/api/ppe/catalog')).j.find(x=>x.id===item.id);assert.equal(Number(cat.size_stocks.find(x=>x.size_label==='41').current_stock),b41,'old size must be returned');assert.equal(Number(cat.size_stocks.find(x=>x.size_label==='42').current_stock),b42-1,'corrected size must be issued');
  });

  await t.test('checkpoint5.6 PPE UI uses full-width inventory, dropdown history, sticky action column and watermark',async()=>{const appSrc=await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();const cssSrc=await (await fetch(`http://127.0.0.1:${port}/styles.css`)).text();assert.match(appSrc,/ppeHistoryToggle/);assert.match(appSrc,/ppe-action-head/);assert.match(appSrc,/khung xem ~20 dòng/);assert.doesNotMatch(appSrc,/Stock ledger<\/h2>/);assert.match(cssSrc,/ppe-history-dropdown/);assert.match(cssSrc,/position:sticky!important;right:0/);assert.match(cssSrc,/vietchem-logo\.png/);assert.match(cssSrc,/opacity:\.045/)});
  await t.test('checkpoint5.5 PPE cost allocation snapshots price + department and exports 2 cost sheets',async()=>{
    const outs=await req('/api/ppe/history?type=OUT&limit=1000');assert.equal(outs.r.status,200);const tx=outs.j[0];assert.ok(tx);assert.ok(Number(tx.unit_price_snapshot)>=0);assert.equal(Number(tx.cost_amount),Number(tx.quantity)*Number(tx.unit_price_snapshot));assert.ok(tx.department_snapshot||tx.department);assert.ok(tx.employee_name_snapshot||tx.employee_name);
    const r=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=ppe`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length>2000);const raw=b.toString('utf8');assert.ok(raw.includes('Phân bổ chi phí'));assert.ok(raw.includes('Chi phí PPE lũy kế'));
  });
  await t.test('deadline change requires justification and preserves original',async()=>{let {r}=await req('/api/obligations/deadline-change',{method:'POST',body:JSON.stringify({obligation_id:'obl_pc04_dec',new_due_date:'2026-12-20',reason_category:'Other',justification:''})});assert.equal(r.status,400);const ok=await req('/api/obligations/deadline-change',{method:'POST',body:JSON.stringify({obligation_id:'obl_pc04_dec',new_due_date:'2026-12-20',reason_category:'Waiting for authority',justification:'Awaiting official confirmation'})});assert.equal(ok.r.status,201);const obs=(await req('/api/obligations')).j.find(x=>x.id==='obl_pc04_dec');assert.equal(obs.original_due_date,'2026-12-15');assert.equal(obs.current_due_date,'2026-12-15')});
  await t.test('legal review queue is explicit and resolution is audited',async()=>{const q=(await req('/api/legal-reviews')).j.find(x=>x.status==='needs_review');assert.ok(q);const rr=await req('/api/legal-reviews/resolve',{method:'POST',body:JSON.stringify({id:q.id,status:'keep_current',review_note:'Test review - requires legal owner decision'})});assert.equal(rr.r.status,200);const after=(await req('/api/legal-reviews')).j.find(x=>x.id===q.id);assert.equal(after.status,'keep_current')});
  await t.test('document import persists and detects duplicates',async()=>{const payload={original_name:'test.txt',mime_type:'text/plain',base64:Buffer.from('hello checkpoint5').toString('base64'),category:'other',site_id:'site_tt'};const a=await req('/api/documents',{method:'POST',body:JSON.stringify(payload)});assert.equal(a.r.status,201);assert.equal(a.j.duplicate_of,null);const b=await req('/api/documents',{method:'POST',body:JSON.stringify(payload)});assert.equal(b.r.status,201);assert.ok(b.j.duplicate_of?.id)});
  await t.test('Document Intelligence extracts invoice fields and links reviewed evidence to payment',async()=>{
    const text=`CÔNG TY CỔ PHẦN MÔI TRƯỜNG ĐÔ THỊ VÀ CÔNG NGHIỆP 11 - URENCO 11\nMã số thuế: 0900291087\nHÓA ĐƠN GIÁ TRỊ GIA TĂNG\nNgày 30 tháng 09 năm 2026\nSố: 4348\nThu gom và xử lý chất thải\nRác thải Sinh hoạt Kg 2.450 2.500 6.125.000\nTổng cộng tiền thanh toán: 7.155.000`;
    const {extraction:ext}=await importAndProcess('urenco-invoice.txt',text);assert.equal(ext.doc_type,'invoice');assert.equal(ext.values.invoice_no,'4348');assert.equal(ext.values.amount,7155000);assert.equal(ext.values.quantity,2450);assert.equal(ext.matches[0].id,'pay_urenco_4348');
    const review=await req('/api/document-intelligence/review',{method:'POST',body:JSON.stringify({id:ext.id,status:'accepted',payment_id:'pay_urenco_4348',review_note:'QA accepted'})});assert.equal(review.r.status,200);
    const pay=(await req('/api/payments')).j.find(x=>x.id==='pay_urenco_4348');assert.equal(pay.intelligence.invoice_quantity_kg,2450);assert.ok(pay.docs.find(d=>d.doc_type==='Hóa đơn').received);assert.ok(pay.linked_documents.some(d=>d.doc_type==='Hóa đơn'));
  });
  await t.test('contract OCR normalization still matches the correct payment case',async()=>{
    const text=`HOP DONG\nTHU GOM, VAN CHUYEN VA XU LY CHAT THAI\nS6:05 12/2025/HDCN/U11-TT\nHom nay, ngay 05 thang 12 nam 2025\nCONG TY CP MOI TRUONG DO THI VA CONG NGHIEP 11 - URENCO11\nThanh toan trong vong 10 ngay ke tu hoa don tai chinh hop le`;
    const {extraction}=await importAndProcess('hop-dong-ocr.txt',text);assert.equal(extraction.doc_type,'contract');assert.equal(extraction.values.contract_no,'0512/2025/HDCN/U11-TT');assert.equal(extraction.values.payment_term_days,10);assert.equal(extraction.matches[0].id,'pay_urenco_4348');
  });
  await t.test('payment request parser recovers tracking fields without treating it as accounting data',async()=>{
    const text=`GIẤY ĐỀ NGHỊ THANH TOÁN\nNgày 12 tháng 10 năm 2026\nSố: 803\nTên tôi là: Đặng Vũ Việt Thắng (NV02089)\nBộ phận công tác: VIETCHEM - Phòng EHS\nThanh toán cho nhà cung cấp: URENCO 11\nĐề nghị thanh toán số tiền: 7.155.000\nNgày phải TT: 16/10/2026\nNội dung: NMTT - Phòng EHS chi trả chi phí thu gom rác thải T9 (HĐ: 4348)\nTài khoản ngân hàng: 2405201002417`;
    const a=analyzeText(text,'de-nghi-thanh-toan.txt');assert.equal(a.doc_type,'payment_request');assert.equal(a.values.request_no,'803');assert.equal(a.values.amount,7155000);assert.equal(a.values.required_payment_date,'2026-10-16');assert.equal(a.values.invoice_no,'4348');assert.equal(a.values.employee_code,'NV02089');
  });
  await t.test('payment intelligence aggregates multiple weigh slips and BBNT after human review',async()=>{
    for(const [name,net] of [['pc-1.txt','1.250'],['pc-2.txt','1.200']]){
      const {extraction}=await importAndProcess(name,`PHIẾU CÂN\nNgày 05/10/2026\nBKS: 89C-12345\nGross Weight: 5.000 kg\nTare Weight: 3.750 kg\nNet Weight: ${net} kg`);
      assert.equal(extraction.doc_type,'weight_ticket');const rv=await req('/api/document-intelligence/review',{method:'POST',body:JSON.stringify({id:extraction.id,status:'accepted',payment_id:'pay_urenco_4348',review_note:'Synthetic weigh-slip QA'})});assert.equal(rv.r.status,200);
    }
    const {extraction:bbnt}=await importAndProcess('bbnt.txt',`BIÊN BẢN NGHIỆM THU DỊCH VỤ\nNgày 06 tháng 10 năm 2026\nHợp đồng số: 0512/2025/HĐCN/U11-TT\nCÔNG TY CỔ PHẦN MÔI TRƯỜNG ĐÔ THỊ VÀ CÔNG NGHIỆP 11 - URENCO 11\nNội dung nghiệm thu: Thu gom và xử lý chất thải`);
    assert.equal(bbnt.doc_type,'acceptance_report');await req('/api/document-intelligence/review',{method:'POST',body:JSON.stringify({id:bbnt.id,status:'accepted',payment_id:'pay_urenco_4348',review_note:'Synthetic BBNT QA'})});
    const p=(await req('/api/payments')).j.find(x=>x.id==='pay_urenco_4348');assert.equal(p.intelligence.weight_ticket_total_kg,2450);assert.equal(p.intelligence.weight_ticket_count,2);assert.equal(p.intelligence.weight_variance_kg,0);assert.equal(p.intelligence.weight_status,'matched');assert.equal(p.intelligence.bbnt_count,1);assert.ok(p.docs.find(d=>d.doc_type==='Phiếu cân').received);assert.ok(p.docs.find(d=>d.doc_type==='BBNT').received);
  });
  await t.test('payment tolerance is configurable but cannot be negative',async()=>{
    const bad=await req('/api/payments',{method:'PATCH',body:JSON.stringify({id:'pay_urenco_4348',weight_tolerance_kg:-1})});assert.equal(bad.r.status,400);
    const ok=await req('/api/payments',{method:'PATCH',body:JSON.stringify({id:'pay_urenco_4348',weight_tolerance_kg:5})});assert.equal(ok.r.status,200);
  });
  await t.test('payment planned date later than contract due requires explanation',async()=>{const bad=await req('/api/payments',{method:'PATCH',body:JSON.stringify({id:'pay_urenco_4348',planned_payment_date:'2026-10-20',explanation_if_late:''})});assert.equal(bad.r.status,400);const clear=await req('/api/payments',{method:'PATCH',body:JSON.stringify({id:'pay_urenco_4348',planned_payment_date:'2026-10-20',explanation_if_late:'Internal approval delay'})});assert.equal(clear.r.status,200);const p=(await req('/api/payments')).j.find(x=>x.id==='pay_urenco_4348');assert.equal(p.amount,7155000);assert.equal(p.contractual_due_date,'2026-10-10')});
  await t.test('equipment source-photo staging is review-controlled',async()=>{
    const rows=(await req('/api/equipment')).j;assert.equal(rows.length,16);assert.ok(rows.every(x=>x.source_ref==='photo:equipment-list-2026-10-15'));assert.ok(rows.every(x=>x.review_status==='needs_review'));assert.ok(rows.some(x=>x.status==='repair_hold'));assert.ok(rows.every(x=>['expired','due_60','valid','no_due_date'].includes(x.inspection_state)));
  });
  await t.test('recording an equipment inspection creates history and refreshes reminder task',async()=>{
    const eq=(await req('/api/equipment')).j.find(x=>x.asset_code==='EQ-PHOTO-PV-03');assert.ok(eq);
    const r=await req('/api/equipment/inspection',{method:'POST',body:JSON.stringify({equipment_id:eq.id,inspection_date:'2026-10-15',next_due_date:'2027-10-15',result:'passed',inspector_org:'QA Inspection Org',certificate_no:'QA-CERT-001',notes:'Integration test'})});assert.equal(r.r.status,201);
    const hist=(await req(`/api/equipment/inspections?equipment_id=${encodeURIComponent(eq.id)}`)).j;assert.equal(hist[0].certificate_no,'QA-CERT-001');
    const refreshed=(await req('/api/equipment')).j.find(x=>x.id===eq.id);assert.equal(refreshed.next_inspection_date,'2027-10-15');assert.equal(refreshed.review_status,'reviewed');assert.equal(refreshed.inspection_state,'valid');
    const task=(await req('/api/tasks')).j.find(x=>x.linked_entity_type==='equipment'&&x.linked_entity_id===eq.id);assert.ok(task);assert.equal(task.due_date,'2027-09-15');
  });
  await t.test('backup API creates checksum-valid archive and offline restore preserves DB + uploads',async()=>{
    const r=await fetch(`http://127.0.0.1:${port}/api/admin/backup`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/gzip/);const buf=Buffer.from(await r.arrayBuffer());assert.ok(buf.length>1000);
    const local=validateBackupArchive(buf);assert.equal(local.ok,true);assert.equal(local.manifest.app_version,'0.9.1-checkpoint7.2-login-recovery');assert.ok(local.manifest.files.some(f=>f.path==='data/ehs.sqlite'));assert.ok(local.manifest.files.some(f=>f.path.startsWith('uploads/')));
    const viaApi=await req('/api/admin/backup/validate',{method:'POST',body:JSON.stringify({base64:buf.toString('base64')})});assert.equal(viaApi.r.status,200);assert.equal(viaApi.j.ok,true);
    const restoreRoot=await mkdtemp(join(tmpdir(),'gami-ehs-restore-'));try{await restoreBackupArchive(buf,{dataDir:join(restoreRoot,'data'),uploadDir:join(restoreRoot,'uploads')});const restoredDb=new DatabaseSync(join(restoreRoot,'data','ehs.sqlite'),{readOnly:true});assert.equal(restoredDb.prepare('SELECT COUNT(*) c FROM employees').get().c,430);assert.equal(restoredDb.prepare('SELECT COUNT(*) c FROM equipment').get().c,16);assert.ok(restoredDb.prepare('SELECT COUNT(*) c FROM documents').get().c>=5);restoredDb.close();assert.ok((await readdir(join(restoreRoot,'uploads'))).length>=1)}finally{await rm(restoreRoot,{recursive:true,force:true})}
  });
  await t.test('login brute-force guard blocks wrong attempts but a correct password self-recovers the account',async()=>{
    const create=await req('/api/users',{method:'POST',body:JSON.stringify({username:'lock.qa',display_name:'Lock QA',role:'warehouse',password:'LockTest!2026'})});assert.equal(create.r.status,201);
    for(let i=0;i<5;i++){const bad=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:'lock.qa',password:'wrong-password'})},'');assert.equal(bad.r.status,401)}
    const blocked=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:'lock.qa',password:'still-wrong'})},'');assert.equal(blocked.r.status,429);assert.equal(blocked.j.error,'LOGIN_LOCKED');assert.ok(blocked.j.locked_until);
    const recovered=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:'lock.qa',password:'LockTest!2026'})},'');assert.equal(recovered.r.status,200);
  });
  await t.test('RBAC denies warehouse from payment writes but allows PPE read',async()=>{
    const create=await req('/api/users',{method:'POST',body:JSON.stringify({username:'warehouse.qa',display_name:'Warehouse QA',role:'warehouse',password:'Warehouse!2026'})});assert.equal(create.r.status,201);
    const login=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:'warehouse.qa',password:'Warehouse!2026'})},'');const wc=cookieFrom(login.r);assert.equal(login.r.status,200);
    const ch=await req('/api/auth/change-password',{method:'POST',body:JSON.stringify({old_password:'Warehouse!2026',new_password:'Warehouse!2026x'})},wc);assert.equal(ch.r.status,200);
    const pay=await req('/api/payments',{method:'PATCH',body:JSON.stringify({id:'pay_urenco_4348',status:'submitted'})},wc);assert.equal(pay.r.status,403);assert.equal(pay.j.error,'FORBIDDEN');
    const backup=await req('/api/admin/backup',{},wc);assert.equal(backup.r.status,403);
    const ppe=await req('/api/ppe',{},wc);assert.equal(ppe.r.status,200);
  });
  await t.test('RBAC separates EHS staff from deadline approval',async()=>{
    await req('/api/users',{method:'POST',body:JSON.stringify({username:'ehs.qa',display_name:'EHS QA',role:'ehs_staff',password:'EhsStaff!2026'})});
    const login=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:'ehs.qa',password:'EhsStaff!2026'})},'');const c=cookieFrom(login.r);await req('/api/auth/change-password',{method:'POST',body:JSON.stringify({old_password:'EhsStaff!2026',new_password:'EhsStaff!2026x'})},c);
    const pending=(await req('/api/deadline-requests')).j.find(x=>x.status==='pending');assert.ok(pending);
    const deny=await req('/api/obligations/deadline-change/approve',{method:'POST',body:JSON.stringify({request_id:pending.id,approve:true})},c);assert.equal(deny.r.status,403);
  });
  await t.test('OCR fields can be human-corrected before acceptance and source extraction remains audited',async()=>{
    const {extraction}=await importAndProcess('invoice-edit.txt',`HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nNgày 30 tháng 09 năm 2026\nSố: 4348\nRác thải Sinh hoạt Kg 2.450 2.500 6.125.000\nTổng cộng tiền thanh toán: 7.155.000`);
    const patch=await req('/api/document-intelligence/extraction',{method:'PATCH',body:JSON.stringify({id:extraction.id,fields:{quantity:2460}})});assert.equal(patch.r.status,200);assert.equal(patch.j.values.quantity.value,2460);
    const rows=(await req('/api/document-extractions')).j,edited=rows.find(x=>x.id===extraction.id);assert.equal(edited.fields.quantity.value,2460);assert.ok(edited.edited_at);assert.ok(edited.original_fields_json);
    const review=await req('/api/document-intelligence/review',{method:'POST',body:JSON.stringify({id:extraction.id,status:'accepted',payment_id:'pay_urenco_4348',review_note:'Corrected against source'})});assert.equal(review.r.status,200);
    const locked=await req('/api/document-intelligence/extraction',{method:'PATCH',body:JSON.stringify({id:extraction.id,fields:{quantity:2470}})});assert.equal(locked.r.status,409);
  });
  await t.test('equipment reconciliation preserves source reference and records before/after history',async()=>{
    const eq=(await req('/api/equipment')).j.find(x=>x.review_status==='needs_review');assert.ok(eq);
    const rr=await req('/api/equipment/reconcile',{method:'POST',body:JSON.stringify({equipment_id:eq.id,fields:{serial_no:'QA-VERIFIED-SERIAL',location:'QA Location'},note:'Compared against source master',finalize:true})});assert.equal(rr.r.status,200);
    const after=(await req('/api/equipment')).j.find(x=>x.id===eq.id);assert.equal(after.serial_no,'QA-VERIFIED-SERIAL');assert.equal(after.review_status,'reviewed');assert.equal(after.source_ref,'photo:equipment-list-2026-10-15');assert.equal(after.reconciled_by,'admin');
    const hist=(await req(`/api/equipment/reconciliations?equipment_id=${encodeURIComponent(eq.id)}`)).j;assert.equal(hist.length,1);assert.equal(hist[0].finalized,1);
  });
  await t.test('notification engine creates escalation alerts and supports read state',async()=>{
    const refreshed=await req('/api/notifications/refresh',{method:'POST',body:'{}'});assert.equal(refreshed.r.status,200);assert.ok(refreshed.j.count>0);
    const rows=(await req('/api/notifications')).j;assert.ok(rows.some(x=>x.level==='critical'));assert.ok(rows.some(x=>x.source_type==='payment'));assert.ok(rows.some(x=>x.source_type==='legal_update'));
    const one=rows.find(x=>x.status==='unread');const mark=await req('/api/notifications',{method:'POST',body:JSON.stringify({id:one.id,status:'read'})});assert.equal(mark.r.status,200);const again=(await req('/api/notifications')).j.find(x=>x.id===one.id);assert.equal(again.status,'read');
  });
  await t.test('Legal Watch establishes baseline then detects source content change without auto-rewriting obligations',async()=>{
    let body='LEGAL_VERSION_1';
    const mock=createServer((_q,res)=>{res.writeHead(200,{'content-type':'text/html','etag':`"${body}"`});res.end(`<html><body><main>${body}</main></body></html>`)});
    await new Promise(ok=>mock.listen(0,'127.0.0.1',ok));const mp=mock.address().port;t.after(()=>mock.close());
    const src=(await req('/api/legal-sources')).j[0];
    let r=await req('/api/legal-sources',{method:'PATCH',body:JSON.stringify({id:src.id,official_url:`http://127.0.0.1:${mp}/law`})});assert.equal(r.r.status,200);
    const first=await req('/api/legal-watch/run',{method:'POST',body:JSON.stringify({source_ids:[src.id]})});assert.equal(first.r.status,200);assert.equal(first.j.checked_count,1);assert.equal(first.j.changed_count,0);assert.equal(first.j.error_count,0);
    const beforeObs=(await req('/api/obligations')).j.map(x=>({id:x.id,legal_basis:x.legal_basis}));
    body='LEGAL_VERSION_2';
    const second=await req('/api/legal-watch/run',{method:'POST',body:JSON.stringify({source_ids:[src.id]})});assert.equal(second.r.status,200);assert.equal(second.j.changed_count,1);assert.equal(second.j.error_count,0);
    const updates=(await req('/api/legal-updates')).j;assert.ok(updates.some(x=>x.source_id===src.id&&x.event_type==='content_changed'&&x.status==='needs_review'));
    const afterObs=(await req('/api/obligations')).j.map(x=>({id:x.id,legal_basis:x.legal_basis}));assert.deepEqual(afterObs,beforeObs,'watch must not auto-rewrite obligations');
    const runs=(await req('/api/legal-watch/runs')).j;assert.ok(runs.length>=2);const updated=(await req('/api/legal-sources')).j.find(x=>x.id===src.id);assert.ok(updated.content_hash);assert.ok(updated.last_checked_at);
  });
  await t.test('PPE catalog supports add, edit, soft-remove and reactivate without deleting history',async()=>{
    const sku=`QA-PPE-${Date.now()}`;
    const created=await req('/api/ppe/catalog',{method:'POST',body:JSON.stringify({sku,name:'QA PPE catalog item',unit:'cái',min_stock:2,unit_price:12345,opening_stock:3})});assert.equal(created.r.status,201);const pid=created.j.id;
    let catalog=(await req('/api/ppe/catalog')).j,one=catalog.find(x=>x.id===pid);assert.ok(one);assert.equal(one.current_stock,3);assert.equal(one.active,1);assert.ok(one.tx_count>=1);
    const edit=await req('/api/ppe/catalog',{method:'PATCH',body:JSON.stringify({id:pid,name:'QA PPE catalog item edited',min_stock:4})});assert.equal(edit.r.status,200);
    const badStop=await req('/api/ppe/catalog',{method:'PATCH',body:JSON.stringify({id:pid,active:false})});assert.equal(badStop.r.status,400);
    const stop=await req('/api/ppe/catalog',{method:'PATCH',body:JSON.stringify({id:pid,active:false,inactive_reason:'QA replace item'})});assert.equal(stop.r.status,200);
    const active=(await req('/api/ppe')).j.items;assert.ok(!active.some(x=>x.id===pid),'inactive catalog item must be hidden from operational PPE list');
    const hist=(await req('/api/ppe/history?limit=1000')).j;assert.ok(hist.some(x=>x.item_id===pid),'soft remove must preserve ledger history');
    const restore=await req('/api/ppe/catalog',{method:'PATCH',body:JSON.stringify({id:pid,active:true})});assert.equal(restore.r.status,200);catalog=(await req('/api/ppe/catalog')).j;one=catalog.find(x=>x.id===pid);assert.equal(one.active,1);
  });
  await t.test('checkpoint5.7.1 PPE catalog button is wired in the active PPE renderer',async()=>{
    const src=await readFile(join(root,'public','app.js'),'utf8');
    assert.match(src,/\$\('#managePpeTypes'\)\.onclick=\(\)=>managePpeTypes\(\)/);
  });
  await t.test('system health exposes WAL/busy-timeout and concurrent writes remain consistent',async()=>{
    const h=await req('/api/system/health');assert.equal(h.r.status,200);assert.equal(h.j.app_version,'0.9.1-checkpoint7.2-login-recovery');assert.equal(String(h.j.journal_mode).toLowerCase(),'wal');assert.ok(Number(h.j.busy_timeout_ms)>=5000);
    const writes=await Promise.all(Array.from({length:12},(_,i)=>req('/api/tasks',{method:'POST',body:JSON.stringify({title:`Concurrent QA ${i}`,category:'QA',site_id:'site_tt',owner:'QA'})})));assert.ok(writes.every(x=>x.r.status===201));const tasks=(await req('/api/tasks')).j;assert.equal(tasks.filter(x=>String(x.title).startsWith('Concurrent QA ')).length,12);
  });

  await t.test('checkpoint5 compliance overview + legal-extra workflow are explicit',async()=>{
    const before=(await req('/api/compliance/overview')).j;assert.equal(before.annual_plan,345);assert.equal(typeof before.overdue,'number');
    const create=await req('/api/compliance/legal-extra',{method:'POST',body:JSON.stringify({title:'QA legal extra obligation',category:'chemical',legal_basis:'QA legal basis',site_id:'site_tt',due_date:'2026-12-31',owner:'Phòng EHS',notes:'Created by CP5 QA'})});assert.equal(create.r.status,201);
    const rows=(await req('/api/obligations?scope=legal_extra')).j;const o=rows.find(x=>x.id===create.j.id);assert.ok(o);assert.equal(o.source_scope,'legal_extra');assert.equal(o.status,'not_started');
    const upd=await req('/api/obligations',{method:'PATCH',body:JSON.stringify({id:o.id,status:'in_progress',progress:35,status_note:'Đang thu thập bằng chứng'})});assert.equal(upd.r.status,200);
    const after=(await req('/api/obligations?scope=legal_extra')).j.find(x=>x.id===o.id);assert.equal(after.status,'in_progress');assert.equal(after.progress,35);assert.equal(after.status_note,'Đang thu thập bằng chứng');
  });
  await t.test('checkpoint5 annual-plan upload is staged and never overwrites active obligations automatically',async()=>{
    const before=(await req('/api/obligations?scope=annual_plan')).j.length;
    const imp=await req('/api/documents',{method:'POST',body:JSON.stringify({original_name:'EHS_PLAN_2027.xlsx',mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base64:Buffer.from('qa-plan-placeholder').toString('base64'),category:'annual_plan',site_id:'site_tt'})});assert.equal(imp.r.status,201);
    const st=await req('/api/compliance/plan-import',{method:'POST',body:JSON.stringify({document_id:imp.j.id,plan_year:2027,version_label:'QA Rev01',note:'QA staging'})});assert.equal(st.r.status,201);assert.equal(st.j.status,'pending_review');
    const plans=(await req('/api/compliance/plan-imports')).j;assert.ok(plans.some(x=>x.id===st.j.id&&x.status==='pending_review'));
    const after=(await req('/api/obligations?scope=annual_plan')).j.length;assert.equal(after,before,'staging plan must not silently replace obligations');
  });
  await t.test('checkpoint5 task workflow supports status, progress, completion and linked source deadline',async()=>{
    const cr=await req('/api/tasks',{method:'POST',body:JSON.stringify({title:'QA linked compliance task',category:'Compliance',site_id:'site_tt',owner:'QA',linked_entity_type:'obligation',linked_entity_id:'obl_pc04_dec',status:'not_started'})});assert.equal(cr.r.status,201);
    let tsk=(await req('/api/tasks')).j.find(x=>x.id===cr.j.id);assert.equal(tsk.due_date,'2026-12-15');assert.equal(tsk.source_due_date,'2026-12-15');assert.equal(tsk.status,'not_started');
    let up=await req('/api/tasks',{method:'PATCH',body:JSON.stringify({id:tsk.id,status:'in_progress',progress:45,notes:'Đang thực hiện'})});assert.equal(up.r.status,200);
    tsk=(await req('/api/tasks')).j.find(x=>x.id===tsk.id);assert.equal(tsk.status,'in_progress');assert.equal(tsk.progress,45);assert.ok(tsk.started_at);
    up=await req('/api/tasks',{method:'PATCH',body:JSON.stringify({id:tsk.id,status:'completed'})});assert.equal(up.r.status,200);
    tsk=(await req('/api/tasks')).j.find(x=>x.id===tsk.id);assert.equal(tsk.status,'completed');assert.equal(tsk.progress,100);assert.ok(tsk.completed_at);
  });
  await t.test('checkpoint5.9 recurring tasks roll forward, remain editable and expand into Calendar',async()=>{
    const cr=await req('/api/tasks',{method:'POST',body:JSON.stringify({title:'QA daily recurring task',category:'QA',site_id:'site_tt',owner:'QA',due_date:'2026-10-16',recurrence:'daily',recurrence_interval:1,recurrence_end_date:'2026-10-20'})});assert.equal(cr.r.status,201);
    let tsk=(await req('/api/tasks')).j.find(x=>x.id===cr.j.id);assert.equal(tsk.recurrence,'daily');assert.equal(tsk.recurrence_interval,1);assert.equal(tsk.due_date,'2026-10-16');
    const cal=await req('/api/calendar?start=2026-10-16&end=2026-10-20');assert.equal(cal.r.status,200);const rec=cal.j.events.filter(x=>x.id===cr.j.id&&x.type==='task');assert.equal(rec.length,5);assert.ok(rec.every(x=>x.recurring===true));
    const done=await req('/api/tasks',{method:'PATCH',body:JSON.stringify({id:cr.j.id,status:'completed',progress:100})});assert.equal(done.r.status,200);assert.equal(done.j.recurring,true);assert.equal(done.j.next_due_date,'2026-10-17');
    tsk=(await req('/api/tasks')).j.find(x=>x.id===cr.j.id);assert.equal(tsk.status,'not_started');assert.equal(tsk.progress,0);assert.equal(tsk.due_date,'2026-10-17');assert.equal(tsk.recurrence_completed_count,1);
    const hist=await req(`/api/tasks/recurrence-history?task_id=${encodeURIComponent(cr.j.id)}`);assert.equal(hist.r.status,200);assert.equal(hist.j[0].scheduled_date,'2026-10-16');
    const edit=await req('/api/tasks',{method:'PATCH',body:JSON.stringify({id:cr.j.id,recurrence:'weekly',recurrence_interval:2,recurrence_end_date:'2026-12-31'})});assert.equal(edit.r.status,200);tsk=(await req('/api/tasks')).j.find(x=>x.id===cr.j.id);assert.equal(tsk.recurrence,'weekly');assert.equal(tsk.recurrence_interval,2);
    const ui=await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();assert.match(ui,/Hàng ngày/);assert.match(ui,/Hàng tuần/);assert.match(ui,/Hàng tháng/);assert.match(ui,/recurrencePayload/);assert.match(ui,/Task lặp/);
  });

  await t.test('checkpoint5 creates payment case and type-driven checklist without accounting functions',async()=>{
    const vendors=(await req('/api/vendors')).j;const v=vendors.find(x=>x.name.includes('URENCO'));assert.ok(v);
    const contracts=(await req(`/api/contracts?vendor_id=${encodeURIComponent(v.id)}`)).j;const c=contracts[0];assert.ok(c);assert.equal(c.payment_term_days,10);
    const cr=await req('/api/payments',{method:'POST',body:JSON.stringify({vendor_id:v.id,contract_id:c.id,site_id:'site_tt',title:'QA rác tháng 10/2026',category:'waste',invoice_no:'QA-100',invoice_date:'2026-10-01',amount:6000000,planned_payment_date:'2026-10-11'})});assert.equal(cr.r.status,201);assert.equal(cr.j.contractual_due_date,'2026-10-11');
    const pay=(await req('/api/payments')).j.find(x=>x.id===cr.j.id);assert.deepEqual(pay.docs.map(x=>x.doc_type).sort(),['Biên bản nghiệm thu','Hóa đơn','Hợp đồng (bản sao photo)','Phiếu cân','Đề nghị thanh toán khác'].sort());assert.ok(pay.docs.every(x=>['missing','declared','linked'].includes(x.evidence_state)));
  });

  await t.test('checkpoint5.2 payment types reproduce the internal checklist including advance and settlement flows',async()=>{
    const vendors=(await req('/api/vendors')).j;const v=vendors[0];assert.ok(v);
    const cases=[
      ['advance_other',['Đề nghị tạm ứng (SSE)','Tờ trình (Photo và lưu bản sao)']],
      ['advance_vendor',['Đề nghị tạm ứng NCC (SSE)','Hợp đồng (>5 triệu)','Phiếu đề nghị thanh toán của NCC','Tờ trình (dịch vụ mới · photo lưu bản sao)']],
      ['settlement_advance',['Đề nghị quyết toán tạm ứng (SSE)','Tờ trình (bản sao đã lưu)','Hóa đơn dịch vụ','Biên bản nghiệm thu','Bản sao kết quả (đối với khóa học)']],
      ['settlement_vendor_advance',['Đề nghị quyết toán tạm ứng (SSE)','Tờ trình (bản sao đã lưu)','Hóa đơn dịch vụ','Biên bản nghiệm thu','Bản sao kết quả (đối với khóa học)']],
      ['payment_external',['Đề nghị thanh toán khác','Tờ trình (Chi hạng mục 3 - Không có hóa đơn)']]
    ];
    for(const [category,expected] of cases){
      const cr=await req('/api/payments',{method:'POST',body:JSON.stringify({vendor_id:v.id,title:`QA ${category}`,category,amount:6000000})});assert.equal(cr.r.status,201);
      const pay=(await req('/api/payments')).j.find(x=>x.id===cr.j.id);assert.deepEqual(pay.docs.map(x=>x.doc_type).sort(),expected.sort());
    }
  });

  await t.test('checkpoint5 equipment full edit + inspection photos are preserved as linked evidence',async()=>{
    const eq=(await req('/api/equipment')).j[0];const emp=(await req('/api/employees?site=TT&status=active')).j[0];
    const patch=await req('/api/equipment',{method:'PATCH',body:JSON.stringify({id:eq.id,name:'QA edited equipment',department:'Phòng EHS',manager:'QA Manager',manager_employee_id:emp.id,operator:'QA Operator',manufacturer:'QA Maker',serial_no:'QA-SERIAL-CP5'})});assert.equal(patch.r.status,200);
    const edited=(await req('/api/equipment')).j.find(x=>x.id===eq.id);assert.equal(edited.name,'QA edited equipment');assert.equal(edited.department,'Phòng EHS');assert.equal(edited.manager_employee_id,emp.id);assert.equal(edited.serial_no,'QA-SERIAL-CP5');
    const photo=await req('/api/documents',{method:'POST',body:JSON.stringify({original_name:'inspection-photo.jpg',mime_type:'image/jpeg',base64:Buffer.from('fake-image-bytes').toString('base64'),category:'equipment',site_id:edited.site_id||'site_tt'})});assert.equal(photo.r.status,201);
    const insp=await req('/api/equipment/inspection',{method:'POST',body:JSON.stringify({equipment_id:eq.id,inspection_date:'2026-10-15',next_due_date:'2027-10-15',result:'pass',inspector_org:'QA kiểm định',photo_document_ids:[photo.j.id],notes:'Ảnh tem kiểm định QA'})});assert.equal(insp.r.status,201);assert.equal(insp.j.photo_count,1);
    const hist=(await req(`/api/equipment/inspections?equipment_id=${encodeURIComponent(eq.id)}`)).j;const row=hist.find(x=>x.id===insp.j.id);assert.ok(row.attachments.some(x=>x.doc_type==='inspection_photo'&&x.document_id===photo.j.id));
  });

  await t.test('checkpoint5.3 My Day aggregates operational attention without mutating source records',async()=>{
    const before=(await req('/api/obligations')).j.map(x=>({id:x.id,status:x.status,current_due_date:x.current_due_date}));
    const out=await req('/api/my-day');assert.equal(out.r.status,200);assert.ok(Array.isArray(out.j.tasks));assert.ok(Array.isArray(out.j.obligations));assert.ok(Array.isArray(out.j.payments));assert.ok(Array.isArray(out.j.equipment));assert.equal(typeof out.j.inbox_count,'number');
    const after=(await req('/api/obligations')).j.map(x=>({id:x.id,status:x.status,current_due_date:x.current_due_date}));assert.deepEqual(after,before,'My Day must be read-only');
  });
  await t.test('checkpoint5.3 Universal Inbox and Data Quality expose actionable queues',async()=>{
    const inbox=await req('/api/inbox');assert.equal(inbox.r.status,200);assert.ok(Array.isArray(inbox.j));assert.ok(inbox.j.some(x=>['Legal Update','Legal Review','Payment','Equipment','OCR','Document','Approval'].includes(x.kind)));
    const q=await req('/api/data-quality');assert.equal(q.r.status,200);assert.equal(typeof q.j.score,'number');assert.ok(Array.isArray(q.j.issues));assert.ok(q.j.issues.some(x=>x.code==='equipment_review'));
  });
  await t.test('checkpoint5.3 Calendar unifies task, compliance, payment and inspection deadlines',async()=>{
    const out=await req('/api/calendar?start=2026-01-01&end=2027-12-31');assert.equal(out.r.status,200);assert.ok(Array.isArray(out.j.events));const types=new Set(out.j.events.map(x=>x.type));assert.ok(types.has('task'));assert.ok(types.has('compliance'));assert.ok(types.has('payment'));assert.ok(types.has('equipment'));
  });
  await t.test('checkpoint5.3 one-click evidence links source file directly and updates payment checklist',async()=>{
    const tsk=await req('/api/tasks',{method:'POST',body:JSON.stringify({title:'QA evidence task',site_id:'site_tt',owner:'QA'})});assert.equal(tsk.r.status,201);
    const doc=await req('/api/documents',{method:'POST',body:JSON.stringify({original_name:'task-evidence.pdf',mime_type:'application/pdf',base64:Buffer.from('qa evidence').toString('base64'),category:'task',site_id:'site_tt',linked_entity_type:'task',linked_entity_id:tsk.j.id})});assert.equal(doc.r.status,201);
    const link=await req('/api/evidence/link',{method:'POST',body:JSON.stringify({document_id:doc.j.id,entity_type:'task',entity_id:tsk.j.id,evidence_type:'evidence'})});assert.equal(link.r.status,200);
    const task=(await req('/api/tasks')).j.find(x=>x.id===tsk.j.id);assert.equal(task.evidence_count,1);
    const pay=(await req('/api/payments')).j.find(x=>x.id==='pay_urenco_4348'),row=pay.docs.find(x=>x.doc_type==='Phiếu cân');assert.ok(row);
    const pdoc=await req('/api/documents',{method:'POST',body:JSON.stringify({original_name:'quick-weight.pdf',mime_type:'application/pdf',base64:Buffer.from('weight evidence').toString('base64'),category:'payment',site_id:'site_tt',linked_entity_type:'payment',linked_entity_id:pay.id})});assert.equal(pdoc.r.status,201);
    const plink=await req('/api/evidence/link',{method:'POST',body:JSON.stringify({document_id:pdoc.j.id,entity_type:'payment',entity_id:pay.id,evidence_type:'Phiếu cân'})});assert.equal(plink.r.status,200);
    const after=(await req('/api/payments')).j.find(x=>x.id===pay.id);assert.ok(after.docs.find(x=>x.doc_type==='Phiếu cân').document_id);
  });

  await t.test('checkpoint5.8 Document Library supports category retrieval, metadata, preview and filtered Excel',async()=>{
    const imp=await req('/api/documents',{method:'POST',body:JSON.stringify({original_name:'PC04_QA_2026.pdf',mime_type:'application/pdf',base64:Buffer.from('qa-pc04-document').toString('base64'),category:'fire',subcategory:'PC04 - Báo cáo PCCC/CNCH',site_id:'site_tt',document_no:'PC04-QA-2026',document_date:'2026-10-15',tags:'PC04,PCCC,2026'})});assert.equal(imp.r.status,201);
    const meta=await req('/api/documents/metadata',{method:'PATCH',body:JSON.stringify({id:imp.j.id,category:'fire',subcategory:'PC04 - Báo cáo PCCC/CNCH',site_id:'site_tt',status:'linked',document_no:'PC04-QA-2026',document_date:'2026-10-15',expiry_date:'2027-10-15',tags:'PC04,PCCC,2026',metadata_note:'QA document library'})});assert.equal(meta.r.status,200);
    const filtered=await req('/api/documents?category=fire&subcategory='+encodeURIComponent('PC04 - Báo cáo PCCC/CNCH')+'&site=TT&q=PC04-QA-2026');assert.equal(filtered.r.status,200);assert.ok(filtered.j.some(x=>x.id===imp.j.id&&x.document_no==='PC04-QA-2026'&&x.subcategory==='PC04 - Báo cáo PCCC/CNCH'));
    const stats=await req('/api/documents/stats');assert.equal(stats.r.status,200);assert.ok(stats.j.categories.some(x=>x.category==='fire'));
    const preview=await fetch(`http://127.0.0.1:${port}/api/documents/file?id=${encodeURIComponent(imp.j.id)}&inline=1`,{headers:{cookie:adminCookie}});assert.equal(preview.status,200);assert.match(preview.headers.get('content-disposition')||'',/^inline;/);
    const x=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=documents&category=fire&subcategory=${encodeURIComponent('PC04 - Báo cáo PCCC/CNCH')}&site=TT&q=PC04-QA-2026`,{headers:{cookie:adminCookie}});assert.equal(x.status,200);const xb=Buffer.from(await x.arrayBuffer());assert.ok(xb.length>1000);assert.ok(xb.toString('utf8').includes('PC04-QA-2026'));
    const ui=await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();assert.match(ui,/docFolder/);assert.match(ui,/Truy xuất hồ sơ/);assert.match(ui,/Phân loại & metadata tài liệu/);assert.match(ui,/Xuất Excel đang lọc/);
  });

  await t.test('Excel export produces a real XLSX workbook for module and consolidated scopes',async()=>{
    for(const scope of ['ppe','compliance','all']){
      const r=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=${scope}`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/spreadsheetml/);assert.match(r.headers.get('content-disposition')||'',/\.xlsx/);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length>1000);assert.equal(b[0],0x50);assert.equal(b[1],0x4b);
    }
  });

  await t.test('checkpoint6.3 clock + Global Search are wired and cross-module search returns results',async()=>{
    const ui=await readFile(join(root,'public','app.js'),'utf8'),html=await readFile(join(root,'public','index.html'),'utf8');assert.match(html,/sideClock/);assert.match(html,/globalSearchBtn/);assert.match(ui,/Ctrl\+K|ctrlKey/);assert.match(ui,/globalSearchModal/);
    const s=await req('/api/search?q=4348');assert.equal(s.r.status,200);assert.ok(Array.isArray(s.j.results));assert.ok(s.j.results.some(x=>x.type==='payment'||x.type==='document'));
  });
  await t.test('checkpoint6.3 Audit Mode aggregates gaps and exports an Audit Pack workbook',async()=>{
    const a=await req('/api/audit-prep?domain=environment&site=TT');assert.equal(a.r.status,200);assert.equal(a.j.domain,'environment');assert.equal(a.j.site,'TT');assert.equal(typeof a.j.summary.evidence_coverage_percent,'number');assert.ok(Array.isArray(a.j.obligations));
    const r=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=audit-pack&domain=environment&site=TT`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length>1000);assert.equal(b[0],0x50);
  });
  await t.test('checkpoint6.3 monthly EHS report saves commentary and exports XLSX',async()=>{
    const first=await req('/api/monthly-report?year=2026&month=10&site=TT');assert.equal(first.r.status,200);assert.equal(first.j.year,2026);assert.equal(first.j.month,10);assert.ok(first.j.summary);
    const save=await req('/api/monthly-report/note',{method:'PATCH',body:JSON.stringify({year:2026,month:10,site:'TT',note:'QA monthly report note'})});assert.equal(save.r.status,200);
    const after=await req('/api/monthly-report?year=2026&month=10&site=TT');assert.equal(after.j.note,'QA monthly report note');
    const r=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=monthly-report&year=2026&month=10&site=TT`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length>1000);
  });
  await t.test('checkpoint6.3 Quick Capture UI and offline equipment QR are available',async()=>{
    const ui=await readFile(join(root,'public','app.js'),'utf8');assert.match(ui,/Quick Capture/);assert.match(ui,/capture="environment"/);assert.match(ui,/showEquipmentQr/);
    const eq=(await req('/api/equipment')).j[0];const r=await fetch(`http://127.0.0.1:${port}/api/equipment/qr?id=${encodeURIComponent(eq.id)}`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/svg/);const svg=await r.text();assert.match(svg,/<svg/);assert.match(svg,/<rect/);
  });
  await t.test('checkpoint6.4 weekly/monthly/KPI report forms are available and export XLSX',async()=>{
    const weekly=await req('/api/weekly-report?date=2026-10-16&site=TT');assert.equal(weekly.r.status,200);assert.ok(Array.isArray(weekly.j.rows));assert.ok(weekly.j.start&&weekly.j.end);
    const kpi=await req('/api/kpi-report?year=2026&month=10&site=TT');assert.equal(kpi.r.status,200);assert.equal(kpi.j.items.length,9);assert.equal(kpi.j.items.reduce((a,x)=>a+Number(x.weight||0),0),24);
    for(const [scope,params] of [['weekly-report','date=2026-10-16&site=TT&reporter=QA&position=EHS&department=Ph%C3%B2ng%20EHS'],['monthly-report','year=2026&month=10&site=TT&reporter=QA'],['kpi-report','year=2026&month=10&site=TT&reporter=QA']]){const r=await fetch(`http://127.0.0.1:${port}/api/export/excel?scope=${scope}&${params}`,{headers:{cookie:adminCookie}});assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/spreadsheetml/);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length>1000);assert.equal(b[0],0x50);assert.equal(b[1],0x4b)}
    const tm=await fetch(`http://127.0.0.1:${port}/api/report-template?type=monthly`,{headers:{cookie:adminCookie}});assert.equal(tm.status,200);assert.ok((await tm.arrayBuffer()).byteLength>10000);
    const tk=await fetch(`http://127.0.0.1:${port}/api/report-template?type=kpi`,{headers:{cookie:adminCookie}});assert.equal(tk.status,200);assert.ok((await tk.arrayBuffer()).byteLength>5000);
    const ui=await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();assert.match(ui,/Báo cáo tuần/);assert.match(ui,/Báo cáo tháng/);assert.match(ui,/KPI tháng/);assert.match(ui,/Mẫu gốc/);
  });
  await t.test('checkpoint6.6 report forms write user-entered data into the exact uploaded Excel templates',async()=>{
    const headers={cookie:adminCookie,'Content-Type':'application/json'};
    const weeklyPayload={type:'weekly',reporter:'QA Reporter',department:'Phòng EHS',resultStart:'2026-10-12',resultEnd:'2026-10-17',planStart:'2026-10-19',planEnd:'2026-10-24',resultItems:Array.from({length:9},(_,i)=>({action:i===0?'Đã kiểm tra xe QA-01':i===3?'Đã làm MSDS cho QA, SL: 5':'Kết quả '+(i+1),owner:'QA',collaborator:'EHS',status:'Đạt',note:'Note '+(i+1)})),planItems:Array.from({length:9},(_,i)=>({action:'Kế hoạch '+(i+1),owner:'QA',collaborator:'EHS',note:''}))};
    const wr=await fetch(`http://127.0.0.1:${port}/api/manual-report/export`,{method:'POST',headers,body:JSON.stringify(weeklyPayload)});assert.equal(wr.status,200);const wb=Buffer.from(await wr.arrayBuffer());assert.ok(wb.length>1000);const we=new Map(unzipEntries(wb).map(e=>[e.name,e.data]));const wt=new Map(unzipEntries(await readFile(join(root,'templates','bao_cao_tuan_mau.xlsx'))).map(e=>[e.name,e.data]));assert.deepEqual(we.get('xl/styles.xml'),wt.get('xl/styles.xml'));assert.match(we.get('xl/workbook.xml').toString(),/sheet name="Báo cáo tuần"/);assert.match(we.get('xl/worksheets/sheet1.xml').toString(),/Đã kiểm tra xe QA-01/);assert.match(we.get('xl/worksheets/sheet1.xml').toString(),/Đã làm MSDS cho QA, SL: 5/);
    const monthPayload={type:'monthly',year:2026,month:10,reporter:'QA Reporter',position:'Nhân viên EHS',department:'Phòng EHS',weeks:[{label:'Tuần 1 (01/10 - 07/10/2026)',items:Array.from({length:7},(_,i)=>({work:'Đã làm mục '+(i+1),result:'Đã hoàn thành',evaluation:'Đã TH',detail:'Chi tiết '+(i+1),solution:''}))}]};
    const mr=await fetch(`http://127.0.0.1:${port}/api/manual-report/export`,{method:'POST',headers,body:JSON.stringify(monthPayload)});assert.equal(mr.status,200);const mb=Buffer.from(await mr.arrayBuffer());assert.ok(mb.length>1000);const me=new Map(unzipEntries(mb).map(e=>[e.name,e.data]));const mt=new Map(unzipEntries(await readFile(join(root,'templates','bao_cao_thang_mau.xlsx'))).map(e=>[e.name,e.data]));assert.deepEqual(me.get('xl/styles.xml'),mt.get('xl/styles.xml'));assert.match(me.get('xl/worksheets/sheet1.xml').toString(),/BÁO CÁO ĐÁNH GIÁ KẾT QUẢ CÔNG VIỆC THÁNG 10\/2026/);assert.match(me.get('xl/worksheets/sheet1.xml').toString(),/Đã làm mục 1/);
    const kpiPayload={type:'kpi',year:2026,month:10,reporter:'QA Reporter',position:'Nhân viên EHS',disciplineDeduction:0,professionalDeduction:0,items:Array.from({length:9},(_,i)=>({note:'Ghi chú '+(i+1),result:'KQ '+(i+1),score:3}))};
    const kr=await fetch(`http://127.0.0.1:${port}/api/manual-report/export`,{method:'POST',headers,body:JSON.stringify(kpiPayload)});assert.equal(kr.status,200);const kb=Buffer.from(await kr.arrayBuffer());assert.ok(kb.length>1000);const ke=new Map(unzipEntries(kb).map(e=>[e.name,e.data]));const kt=new Map(unzipEntries(await readFile(join(root,'templates','kpi_thang_mau.xlsx'))).map(e=>[e.name,e.data]));assert.deepEqual(ke.get('xl/styles.xml'),kt.get('xl/styles.xml'));const kxml=ke.get('xl/worksheets/sheet2.xml').toString();assert.match(kxml,/QA Reporter/);assert.match(kxml,/KQ 1/);assert.match(kxml,/Q8\*E8/);
    for(const type of ['weekly','monthly','kpi']){const t=await fetch(`http://127.0.0.1:${port}/api/report-template?type=${type}`,{headers:{cookie:adminCookie}});assert.equal(t.status,200);assert.ok((await t.arrayBuffer()).byteLength>5000)}
    const ui=await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();assert.match(ui,/chính file mẫu gốc cậu đã gửi/);assert.match(ui,/Đã kiểm tra xe/);assert.match(ui,/Đã làm MSDS/);assert.match(ui,/postManualReport/);
  });
  await t.test('audit actor comes from authenticated identity and includes checkpoint5 actions',async()=>{const rows=(await req('/api/audit')).j;assert.ok(rows.some(x=>x.actor==='admin'));assert.ok(rows.some(x=>x.action==='system.backup_created'));assert.ok(rows.some(x=>x.action==='equipment.inspection_recorded'));assert.ok(rows.some(x=>x.action==='auth.login_blocked'))});
});
