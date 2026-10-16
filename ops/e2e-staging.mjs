// staging 실사용 흐름 검수 (로컬 PC 전용). 실제 결제는 하지 않는다.
// 1) 구매 버튼 → Groble 결제 페이지 주소로 이동하는지(요청은 차단해 결제 페이지는 열지 않음)
// 2) 관리자 테스트 열람권 발급 → PDF 열람 → 페이지 이동·확대·축소·화면 맞춤 → 회수
// 관리자 비밀번호는 열리는 Chrome 창에 직접 입력한다(스크립트·채팅에 남지 않음).
// 사용: node ops/e2e-staging.mjs [책 slug] [사이트 주소]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const SLUG=process.argv[2]||'book-saju-story';
const BASE=(process.argv[3]||'https://staging.yeomyeong-philosophy.pages.dev').replace(/\/$/,'');
if(!/staging|localhost/.test(BASE)){console.error('staging 주소만 허용합니다.');process.exit(2);}
const OUT=path.join(path.dirname(fileURLToPath(import.meta.url)),'out','e2e-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(OUT,{recursive:true});
const STATE=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ym-e2e-')),'state.json');
const VIEWPORTS=[['pc',1280,800,false],['m360',360,780,true],['m390',390,844,true]];
const results=[];
const record=(vp,step,ok,detail='')=>{results.push({vp,step,ok,detail});console.log(`${ok?'OK  ':'FAIL'} ${vp} ${step}${detail?' — '+detail:''}`);};

async function launch(opts){try{return await chromium.launch({channel:'chrome',...opts});}catch{return await chromium.launch(opts);}}

// 로그인: 보이는 창에서 사용자가 비밀번호를 직접 입력한다.
{
  const browser=await launch({headless:false});
  const context=await browser.newContext({viewport:{width:1100,height:800}});
  const page=await context.newPage();
  await page.goto(BASE+'/admin/');
  console.log('>>> 열린 Chrome 창에서 관리자 비밀번호를 입력하고 로그인하세요(최대 5분 대기).');
  await page.waitForFunction(()=>window.yeomyeongAdminReady===true,null,{timeout:300000});
  await context.storageState({path:STATE});
  await browser.close();
}

const browser=await launch({});
for(const [vp,width,height,mobile] of VIEWPORTS){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1,storageState:STATE});
  const shot=async(page,name)=>page.screenshot({path:path.join(OUT,`${vp}-${name}.png`),fullPage:false});
  let granted=false;
  try{
    // 1) 구매 버튼 → Groble
    {
      const page=await context.newPage();
      let target='';
      await page.route(/groble\./i,route=>{if(!target)target=route.request().url();return route.abort();});
      await page.goto(`${BASE}/book-${SLUG.replace(/^book-/,'')}.html`,{waitUntil:'load'});
      const buy=page.locator('#book-offer a.btn[href*="mode=checkout"]').first();
      await buy.waitFor({timeout:15000});
      await buy.scrollIntoViewIfNeeded();
      await shot(page,'buy-button');
      await buy.click();
      await page.waitForTimeout(4000);
      let u=null;try{u=new URL(/groble\./i.test(page.url())?page.url():target);}catch{}
      record(vp,'구매 버튼 → Groble 이동',Boolean(u&&/groble\./i.test(u.hostname)&&u.searchParams.get('ref')?.length>=32),u?`${u.origin}${u.pathname} ref=${u.searchParams.has('ref')?'있음':'없음'}`:'Groble 요청 없음');
      await page.close();
    }
    // 2) 관리자 테스트 열람권 발급
    {
      const page=await context.newPage();
      await page.goto(BASE+'/admin/',{waitUntil:'load'});
      const section=page.locator(`section.book:has(input[data-key="slug"][value="${SLUG}"])`);
      await section.waitFor({timeout:15000});
      await section.locator('[data-test-access="grant"]').click();
      await page.locator('#message.ok:has-text("발급했습니다")').waitFor({timeout:15000});
      granted=true;
      record(vp,'관리자 테스트 열람권 발급',true,(await page.locator('#message').innerText()).slice(0,60));
      await page.close();
    }
    // 3) 열람
    {
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,120));});
      await page.goto(`${BASE}/reader.html?book=${SLUG}`,{waitUntil:'load'});
      const open=page.locator('#open-book');
      await open.waitFor({state:'visible',timeout:15000});
      await open.click();
      await page.locator('#page-status:has-text("/")').waitFor({timeout:30000});
      await page.waitForTimeout(800);
      const count=Number(await page.locator('#page-count').innerText());
      const status=()=>page.locator('#page-status').innerText();
      const cssW=()=>page.locator('#pdf-page').evaluate(c=>c.getBoundingClientRect().width);
      const nonBlank=()=>page.locator('#pdf-page').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4*97)if(d[i]<250||d[i+1]<250||d[i+2]<250)n++;return n>20;});
      record(vp,'PDF 열람 열기',count>0&&await nonBlank(),`${count}쪽, 1쪽 렌더 ${await nonBlank()?'내용 있음':'빈 화면'}`);
      await shot(page,'reader-open');
      const overflow=await page.evaluate(w=>document.documentElement.scrollWidth>w,width);
      record(vp,'열람 화면 가로 넘침 없음',!overflow);
      if(count>1){
        await page.locator('#next-page').click();await page.waitForFunction(()=>/^2 \//.test(document.querySelector('#page-status').textContent),null,{timeout:15000});
        record(vp,'다음 페이지',true,await status());
        await page.locator('#prev-page').click();await page.waitForFunction(()=>/^1 \//.test(document.querySelector('#page-status').textContent),null,{timeout:15000});
        record(vp,'이전 페이지',true,await status());
        await page.locator('#page-number').fill(String(Math.min(3,count)));await page.locator('#page-number').dispatchEvent('change');
        await page.waitForFunction(n=>document.querySelector('#page-status').textContent.startsWith(n+' /'),String(Math.min(3,count)),{timeout:15000});
        record(vp,'페이지 번호 입력 이동',true,await status());
      }
      const w0=await cssW();
      await page.locator('#zoom-in').click();await page.waitForTimeout(1200);const w1=await cssW();
      record(vp,'확대',w1>w0,`${Math.round(w0)}→${Math.round(w1)}px`);
      await shot(page,'reader-zoom-in');
      await page.locator('#zoom-out').click();await page.locator('#zoom-out').click();await page.waitForTimeout(1200);const w2=await cssW();
      record(vp,'축소',w2<w1,`${Math.round(w1)}→${Math.round(w2)}px`);
      await page.locator('#fit-width').click();await page.waitForTimeout(1200);
      const fit=await page.evaluate(()=>{const s=document.querySelector('.page-stage').getBoundingClientRect(),c=document.querySelector('#pdf-page').getBoundingClientRect();return {stage:s.width,canvas:c.width};});
      record(vp,'화면 맞춤',fit.canvas<=fit.stage+1&&fit.canvas>=Math.min(220,fit.stage-30),`캔버스 ${Math.round(fit.canvas)}px / 영역 ${Math.round(fit.stage)}px`);
      await shot(page,'reader-fit');
      record(vp,'열람 중 콘솔 오류 없음',errors.length===0,errors[0]||'');
      await page.close();
    }
  }catch(error){record(vp,'진행 중 예외',false,String(error.message).split('\n')[0]);}
  finally{
    // 4) 회수 (실패해도 항상 시도)
    if(granted){
      try{
        const page=await context.newPage();
        await page.goto(BASE+'/admin/',{waitUntil:'load'});
        const section=page.locator(`section.book:has(input[data-key="slug"][value="${SLUG}"])`);
        await section.waitFor({timeout:15000});
        await section.locator('[data-test-access="revoke"]').click();
        await page.locator('#message.ok:has-text("회수했습니다")').waitFor({timeout:15000});
        record(vp,'테스트 열람권 회수',true);
        await page.goto(`${BASE}/reader.html?book=${SLUG}`,{waitUntil:'load'});
        await page.locator('#access-message').waitFor();await page.waitForTimeout(1500);
        const hidden=await page.locator('#open-book').isHidden();
        const pdfStatus=await page.evaluate(async slug=>(await fetch(`/api/reader?mode=pdf&book=${slug}`,{headers:{Range:'bytes=0-1023'},credentials:'same-origin'})).status,SLUG);
        record(vp,'회수 후 열람 차단',hidden&&pdfStatus===403,`읽기 버튼 ${hidden?'숨김':'보임'}, PDF 요청 ${pdfStatus}`);
        await shot(page,'after-revoke');
        await page.close();
      }catch(error){record(vp,'회수 실패 — 관리자 화면에서 직접 회수 필요',false,String(error.message).split('\n')[0]);}
    }
    await context.close();
  }
}
await browser.close();
fs.rmSync(path.dirname(STATE),{recursive:true,force:true});
const failed=results.filter(r=>!r.ok);
console.log(`\n스크린샷: ${OUT}\n${failed.length?`실패 ${failed.length}건\n- `+failed.map(f=>`${f.vp} ${f.step} ${f.detail}`).join('\n- '):'모두 통과'}`);
process.exit(failed.length?1:0);
