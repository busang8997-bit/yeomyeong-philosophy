import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build,safeURL} from '../scripts/build.mjs';

function sandbox(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeomyeong-admin-'));
 try{fs.cpSync(process.cwd(),dir,{recursive:true,filter:p=>!p.includes('/dist')&&!p.includes('/node_modules')&&!p.includes('/.git')});return fn(dir);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('관리자는 /admin/ 로그인 후 도서 운영과 관리자 전용 열람 테스트를 한다',()=>sandbox(dir=>{
 const {out}=build(dir);
 const page=fs.readFileSync(path.join(out,'admin/index.html'),'utf8');
 const script=fs.readFileSync(path.join(out,'admin/ebooks.js'),'utf8');
 const redirect=fs.readFileSync(path.join(out,'admin/ebooks.html'),'utf8');
 assert.match(page,/도서·판매·영상 관리/);
 assert.match(page,/관리자 비밀번호/);
 assert.match(page,/mode=admin-status/);
 assert.match(page,/ebooks\.js/);
 assert.match(script,/PDF 등록·교체/);
 assert.match(script,/data-key="price"/);
 assert.match(script,/data-key="purchase_url"/);
 assert.match(script,/YouTube 샘플강의 링크/);
 assert.match(script,/관리자 테스트 열람권 발급/);
 assert.match(script,/테스트 열람권 회수/);
 assert.match(script,/admin-test-access/);
 assert.ok(!page.includes('READER_UPLOAD_KEY')&&!script.includes('READER_UPLOAD_KEY'));
 assert.match(redirect,/url=\/admin\//);
}));

test('도서목록·홈은 D1 카탈로그를 쓰고 목록→상세→구매/열람 순서로 연결한다',()=>sandbox(dir=>{
 const {out}=build(dir);
 const list=fs.readFileSync(path.join(out,'books.html'),'utf8');
 const home=fs.readFileSync(path.join(out,'index.html'),'utf8');
 const client=fs.readFileSync(path.join(out,'catalog.js'),'utf8');
 const detailClient=fs.readFileSync(path.join(out,'book-detail.js'),'utf8');
 assert.match(list,/id="runtime-catalog"/);
 assert.match(list,/catalog\.js/);
 assert.match(home,/id="home-catalog"/);
 // 공유 미리보기(og:description)도 상담이 아닌 전자책 안내 문구를 쓴다.
 assert.ok(!/og:description"[^>]*상담/.test(home));
 assert.match(home,/catalog\.js/);
 // 홈 시리즈 카드는 빌드 때 고정하지 않는다(존재하지 않는 #shelf-N 링크 방지).
 assert.ok(!/books\.html#shelf-\d/.test(home));
 assert.ok(!list.includes('class="library-shelf"'));
 // 출간 예정 도서는 별도 영역에서 상세 페이지로만 연결한다.
 for(const page of [home,list]){assert.match(page,/id="upcoming"/);assert.match(page,/data-upcoming-slug="book-tarot-training"/);}
 assert.match(client,/mode=catalog/);
 assert.match(client,/book\.status==='판매중'&&hasGrobleCheckout/);
 assert.match(client,/판매 준비 중/);
 assert.ok(!client.includes('reader.html'),'목록은 열람실로 바로 보내지 않는다');
 assert.match(client,/book\.html\?book=/);
 for(const nav of ['consult.html','programs.html','content.html'])assert.ok(!list.match(/<nav class="nav"[\s\S]*?<\/nav>/)[0].includes(nav));
 assert.match(list,/href="books\.html#library-samples"/);
 for(const slug of ['book-saju-story','book-wangchobo','book-jireumgil','book-jireumgil-middle','book-jireumgil-lower']){
  const detail=fs.readFileSync(path.join(out,`${slug}.html`),'utf8');
  assert.match(detail,new RegExp(`data-book="${slug}"`));
  assert.match(detail,new RegExp(`reader\\.html\\?book=${slug}`));
  assert.match(detail,/book-detail\.js/);
  assert.ok(!detail.includes('groble.im'));
 }
 assert.match(fs.readFileSync(path.join(out,'book.html'),'utf8'),/id="book-generic"/);
 assert.match(detailClient,/api\('checkout',slug\)/);
 assert.match(detailClient,/access\?\.allowed/);
 assert.match(detailClient,/access\?\.can_buy/);
 const catalog=JSON.parse(fs.readFileSync(path.join(dir,'netlify/functions/_shared/catalog.json'),'utf8'));
 assert.deepEqual(catalog.map(book=>book.slug),['book-saju-story','book-wangchobo','book-jireumgil','book-jireumgil-middle','book-jireumgil-lower']);
}));

test('서버는 관리자 세션을 확인하고 카탈로그·PDF를 비공개 런타임 저장소에 쓴다',()=>sandbox(dir=>{
 const {out}=build(dir);
 const fn=fs.readFileSync(path.join(dir,'netlify/functions/reader.mjs'),'utf8');
 const webhook=fs.readFileSync(path.join(dir,'netlify/functions/groble-webhook.mjs'),'utf8');
 const admin=fs.readFileSync(path.join(out,'admin/ebooks.js'),'utf8');
 assert.match(fn,/mode==='admin-session'/);
 assert.match(fn,/verifyGithubAdmin/);
 assert.match(fn,/async function entitlementFor\(readerHash,slug\)\{const db=store\(\);return db\.get/);
 assert.ok(!fn.includes('store().then'));
 assert.match(fn,/Set-Cookie/);
 assert.match(fn,/db\.setJSON\('reader:catalog',books\)/);
 assert.match(fn,/db\.set\(`pdf:\$\{slug\}`/);
 assert.match(fn,/READER_UPLOAD_KEY/);
 assert.ok(!admin.includes('READER_UPLOAD_KEY')&&!admin.includes('X-Reader-Upload-Key'));
 assert.match(webhook,/reader:catalog/);
 assert.match(fn,/전자책 PDF 등록 후 판매를 시작/);
}));

test('외부 링크 검증은 위험한 URL을 거부한다',()=>{
 for(const value of ['javascript:alert(1)','//attacker.test','https://name:secret@example.com','assets/../../secret'])assert.throws(()=>safeURL(value));
 assert.equal(safeURL('https://groble.im/products/book'),'https://groble.im/products/book');
});
