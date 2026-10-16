// 실제 배포된 사이트를 PC 1280px, 모바일 360px·390px로 검수한다 (로컬 PC 전용, 읽기만 한다).
// 사용: node ops/check-site.mjs [사이트 주소]   기본: https://staging.yeomyeong-philosophy.pages.dev
// 결과: 콘솔 요약 + ops/out/<시각>/ 스크린샷. 결제·관리자 저장 등 상태를 바꾸는 동작은 하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const BASE=(process.argv[2]||'https://staging.yeomyeong-philosophy.pages.dev').replace(/\/$/,'');
const OUT=path.join(path.dirname(fileURLToPath(import.meta.url)),'out',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(OUT,{recursive:true});
const PAGES=['/','/books.html','/book-saju-story.html','/book-wangchobo.html','/book-tarot-training.html','/lectures.html','/about.html','/reader.html?book=book-saju-story','/admin/'];
const VIEWPORTS=[['pc',1280,800,false],['m360',360,780,true],['m390',390,844,true]];
const problems=[];

// 서버 상태: 로그인·D1·Bunny 연결을 API 응답으로 구분한다(값·비밀은 다루지 않는다).
async function api(mode){try{const r=await fetch(`${BASE}/api/reader?mode=${mode}`,{redirect:'manual'});let body={};try{body=await r.json();}catch{}return {status:r.status,body};}catch(error){return {status:0,body:{error:error.message}};}}
const catalog=await api('catalog'),session=await api('session'),adminStatus=await api('admin-status');
console.log(`[API] catalog ${catalog.status} (${catalog.body.books?.length??'?'}권) · session ${session.status}${session.status===200?'':' '+(session.body.error||'')} · admin-status ${adminStatus.status} (401이 정상: 로그인 전)`);
if(catalog.status!==200)problems.push('도서 카탈로그(D1) 응답 오류');
if(session.status!==200)problems.push('열람 세션 오류: Bunny 연결(BUNNY_STORAGE_KEY) 또는 D1 문제일 가능성. /admin/ 경고의 원인 코드를 확인');
if(adminStatus.status===503)problems.push('이 배포에 READER_UPLOAD_KEY가 적용되지 않음');
const forSale=(session.body.books||[]).filter(book=>book.can_buy).map(book=>book.slug);
console.log(`[판매] 구매 버튼이 나와야 하는 책: ${forSale.join(', ')||'없음'}`);

let browser;
try{browser=await chromium.launch({channel:'chrome'});}catch{browser=await chromium.launch();}
for(const [label,width,height,mobile] of VIEWPORTS){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
 for(const page of PAGES){
  const tab=await context.newPage(),errors=[];
  tab.on('pageerror',e=>errors.push(e.message));
  // /admin/은 로그인 전 admin-status 401이 정상이므로 그 응답은 오류로 세지 않는다.
  tab.on('console',m=>{if(m.type()==='error'&&!(page==='/admin/'&&/status of 401/.test(m.text())))errors.push(m.text().slice(0,140));});
  const response=await tab.goto(BASE+page,{waitUntil:'load'}).catch(e=>null);
  await tab.waitForTimeout(1500);
  const r=await tab.evaluate(w=>{
   const offer=document.querySelector('#book-offer');
   const buy=offer?.querySelector('a.btn[href*="mode=checkout"]');
   let covered='';if(buy){buy.scrollIntoView({block:'center'});const b=buy.getBoundingClientRect(),el=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);if(el!==buy&&!buy.contains(el))covered=el?.tagName||'?';}
   return {overflow:document.documentElement.scrollWidth>w,offer:offer?.innerText.replace(/\s+/g,' ').slice(0,90)||'',buy:Boolean(buy),covered,reader:document.querySelector('#access-message')?.innerText||''};
  },width);
  const name=`${label}${page.replace(/[/?=&.]+/g,'_')}.png`;
  await tab.screenshot({path:path.join(OUT,name),fullPage:true});
  const status=response?.status()??0;
  const line=[`${label} ${page}`,`HTTP ${status}`,r.overflow?'가로넘침':'',r.offer&&`[${r.offer}]`,r.buy?`구매버튼${r.covered?' 가려짐:'+r.covered:''}`:'',r.reader&&`열람실: ${r.reader.slice(0,50)}`,errors.length?`오류 ${errors.length}건: ${errors[0]}`:''].filter(Boolean).join(' | ');
  console.log(line);
  if(status>=400||r.overflow||r.covered||errors.length)problems.push(line);
  const slug=page.match(/book-[a-z0-9-]+(?=\.html)/)?.[0];
  if(slug&&forSale.includes(slug)&&!r.buy)problems.push(`${label} ${page}: 판매 가능한데 구매 버튼 없음`);
  await tab.close();
 }
 await context.close();
}
await browser.close();
console.log(`\n스크린샷: ${OUT}`);
console.log(problems.length?`\n문제 ${problems.length}건\n- ${problems.join('\n- ')}`:'\n문제 없음');
process.exit(problems.length?1:0);
