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
 assert.match(page,/mode=admin/);
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

test('도서목록은 런타임 카탈로그를 쓰고 상세 구매는 통합 90일 열람실로 연결한다',()=>sandbox(dir=>{
 const {out}=build(dir);
 const list=fs.readFileSync(path.join(out,'books.html'),'utf8');
 const client=fs.readFileSync(path.join(out,'catalog.js'),'utf8');
 assert.match(list,/id="runtime-catalog"/);
 assert.match(list,/catalog\.js/);
 assert.match(client,/mode=catalog/);
 assert.match(client,/90일 열람/);
 for(const slug of ['book-saju-story','book-wangchobo','book-jireumgil','book-jireumgil-middle','book-jireumgil-lower']){
  const detail=fs.readFileSync(path.join(out,`${slug}.html`),'utf8');
  assert.match(detail,new RegExp(`reader\\.html\\?book=${slug}`));
  assert.ok(!detail.includes('groble.im'));
 }
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
