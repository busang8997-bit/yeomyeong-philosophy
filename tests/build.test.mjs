import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build,safeURL} from '../scripts/build.mjs';

function sandbox(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeomyeong-cms-'));try{fs.cpSync(process.cwd(),dir,{recursive:true,filter:p=>!p.includes('/dist')&&!p.includes('/node_modules')});return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function edit(dir,file,fn){const p=path.join(dir,'cms/data',file+'.json');const v=JSON.parse(fs.readFileSync(p,'utf8'));fn(v);fs.writeFileSync(p,JSON.stringify(v));}
const care=JSON.parse(fs.readFileSync('admin/config.yml','utf8')).backend.repo.endsWith('-care');
test('관리자 데이터·원본·비밀을 공개 배포물에 복사하지 않는다',()=>sandbox(dir=>{const {out}=build(dir);for(const p of ['cms','scripts','tests','README.md','ADMIN-SETUP.md'])assert.ok(!fs.existsSync(path.join(out,p)));assert.ok(fs.existsSync(path.join(out,'admin/config.yml')));assert.match(fs.readFileSync(path.join(out,'robots.txt'),'utf8'),/Disallow: \/admin\//);}));
test('도서 수정이 목록과 상세에 반영되며 HTML 삽입을 막는다',()=>sandbox(dir=>{edit(dir,'books',v=>{v.items[0].title='검수 <img src=x onerror=alert(1)>';v.items[0].description='관리자에서 바꾼 소개';if(care)v.items[0].price=12345;else v.items[0].purchase_url='https://www.groble.im/products/test';});const {out}=build(dir);const s=fs.readFileSync(path.join(out,'index.html'),'utf8');assert.match(s,/검수 &lt;img/);assert.ok(!s.includes('<img src=x onerror'));assert.match(s,/관리자에서 바꾼 소개/);if(care)assert.match(s,/12,345/);else{const d=fs.readFileSync(path.join(out,'book-wangchobo.html'),'utf8');assert.match(d,/관리자에서 바꾼 소개/);assert.match(d,/https:\/\/www.groble.im\/products\/test/);}}));
test('위험한 링크는 빌드를 중단한다',()=>sandbox(dir=>{edit(dir,'books',v=>{v.items[0].purchase_url='javascript:alert(1)';});assert.throws(()=>build(dir),/허용되지/);for(const v of ['//attacker.test','https://name:secret@example.com','assets/../../secret'])assert.throws(()=>safeURL(v));}));
test('도서 삭제·추가가 목록에 반영된다',()=>sandbox(dir=>{edit(dir,'books',v=>{const newBook={...v.items[0],title:'검수용 새 책',slug:'book-new-test',id:'book-new-test'};v.items=v.items.slice(1);v.items.push(newBook);});const {out}=build(dir);const s=fs.readFileSync(path.join(out,care?'index.html':'books.html'),'utf8');assert.match(s,/검수용 새 책/);if(!care){assert.ok(!fs.existsSync(path.join(out,'book-wangchobo.html')));assert.ok(fs.existsSync(path.join(out,'book-new-test.html')));}}));
test('사이트 제목·소개·유튜브 연결을 설정에서 바꾼다',()=>sandbox(dir=>{edit(dir,'settings',v=>{v.site_title='관리자 검수 사이트';v.home_title='관리자 검수 첫 화면';v.intro='관리자 검수 소개';v.youtube_url='https://www.youtube.com/@test';});const {out}=build(dir);const s=fs.readFileSync(path.join(out,'index.html'),'utf8');assert.match(s,/관리자 검수 사이트/);assert.match(s,/관리자 검수 첫 화면/);assert.match(fs.readFileSync(path.join(out,care?'index.html':'about.html'),'utf8'),/관리자 검수 소개/);assert.match(fs.readFileSync(path.join(out,care?'index.html':'content.html'),'utf8'),/https:\/\/www.youtube.com\/@test/);}));
test('질문·상담·분류 변경과 스크립트 삽입 차단',{skip:care},()=>sandbox(dir=>{edit(dir,'questions',v=>{v.items[0].q='검수 </script><img src=x>';v.items[0].price='11,000원';});const {out}=build(dir);const s=fs.readFileSync(path.join(out,'ask.html'),'utf8');assert.ok(!s.includes('검수 </script>'));assert.match(s,/htmlEscape\(it.q\)/);edit(dir,'questions',v=>{v.items[0].consult='missing';});assert.throws(()=>build(dir),/연결 상담/);}));
test('유튜브를 열기 전 불러오지 않고 닫으면 중단한다',{skip:!care},()=>sandbox(dir=>{const {out}=build(dir);const s=fs.readFileSync(path.join(out,'index.html'),'utf8');assert.equal((s.match(/<iframe /g)||[]).length,2);assert.equal((s.match(/data-src="https:\/\/www.youtube-nocookie.com\/embed\//g)||[]).length,2);assert.ok(!s.includes('dothome'));assert.match(s,/removeAttribute\('src'\)/);}));
test('상세 페이지를 포함한 모든 공개 페이지가 공통 헤더·푸터를 쓰고 글자 크기를 빌드에서 덮지 않는다',{skip:care},()=>sandbox(dir=>{
 const {out}=build(dir);
 const part=(file,tag)=>fs.readFileSync(path.join(dir,'_layout',file),'utf8').match(new RegExp('<'+tag+'\\b[\\s\\S]*?</'+tag+'>'))[0];
 const plain=h=>h.replace(/ aria-current="page"/g,'').replace(/\s+/g,' ');
 const header=plain(part('header.html','header'));const nav=header.match(/<a href="[^"#?]+\.html"/g).length;
 const pages=fs.readdirSync(out).filter(f=>f.endsWith('.html'));
 assert.ok(pages.length>=18);
 for(const f of pages){
  const s=fs.readFileSync(path.join(out,f),'utf8');
  assert.ok(!s.includes('mobile-reading-size'),f+': 빌드가 글자 크기 스타일을 끼워 넣음');
  const got=s.match(/<header\b[\s\S]*?<\/header>/)[0];
  assert.equal(plain(got),header,f+': 공통 헤더와 다름');
  assert.equal((plain(got).match(/<a href="[^"#?]+\.html"/g)||[]).length,nav,f+': 메뉴 개수 다름');
  assert.ok(s.includes('home-footer-info')&&s.includes('home-install-btn'),f+': 공통 푸터와 다름');
 }
}));

test('공개 페이지 푸터에 관리자 링크를 넣지 않지만 관리자 화면(/admin/)은 배포한다',()=>sandbox(dir=>{
 const {out}=build(dir);
 assert.ok(fs.existsSync(path.join(out,'admin','index.html')),'관리자 화면이 배포 폴더에 없음');
 for(const f of fs.readdirSync(out).filter(f=>f.endsWith('.html'))){
  const s=fs.readFileSync(path.join(out,f),'utf8');
  assert.ok(!/href="\/admin\/?"/.test(s)&&!s.includes('>관리자</a>'),f+': 공개 페이지에 관리자 링크가 있음');
 }
}));
