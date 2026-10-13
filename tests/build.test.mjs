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
test('도서 수정이 목록과 상세에 반영되며 HTML 삽입을 막는다',()=>sandbox(dir=>{edit(dir,'books',v=>{const b=v.items.find(x=>x.slug==='book-wangchobo');b.title='검수 <img src=x onerror=alert(1)>';b.description='관리자에서 바꾼 소개';if(care)b.price=12345;else b.purchase_url='https://www.groble.im/products/test';});if(!care)edit(dir,'products',v=>{const p=v.items.find(x=>x.book_slugs.includes('book-wangchobo'));Object.assign(p,{purchase_url:'https://www.groble.im/products/test',period:'30일',price:'검수 가격',status:'판매중'});});const {out}=build(dir);const s=fs.readFileSync(path.join(out,care?'index.html':'books.html'),'utf8');assert.match(s,/검수 &lt;img/);assert.ok(!s.includes('<img src=x onerror'));assert.match(s,/관리자에서 바꾼 소개/);if(care)assert.match(s,/12,345/);else{const d=fs.readFileSync(path.join(out,'book-wangchobo.html'),'utf8');assert.match(d,/관리자에서 바꾼 소개/);assert.match(d,/https:\/\/www.groble.im\/products\/test/);}}));
test('위험한 링크는 빌드를 중단한다',()=>sandbox(dir=>{edit(dir,'books',v=>{v.items[0].purchase_url='javascript:alert(1)';});assert.throws(()=>build(dir),/허용되지/);for(const v of ['//attacker.test','https://name:secret@example.com','assets/../../secret'])assert.throws(()=>safeURL(v));}));
test('도서 삭제·추가가 목록에 반영된다',()=>sandbo…5182 tokens truncated…  return {allowed:active.length>0,expiresAt:active.length?Math.max(...active.map(item=>Number(item.expiresAt))):null};
}

export function parseByteRange(header,size,maxLength=512*1024){
  if(!Number.isSafeInteger(size)||size<0)return null;
  if(!header)return {start:0,end:Math.min(size-1,maxLength-1)};
  const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if(!match||(!match[1]&&!match[2])||size===0)return null;
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;start=Math.max(0,size-suffix);end=size-1;}
  else {start=Number(match[1]);end=match[2]?Number(match[2]):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size)return null;
  return {start,end:Math.min(end,size-1,start+maxLength-1)};
}
