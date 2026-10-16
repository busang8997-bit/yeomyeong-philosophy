import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {onRequest} from '../functions/api/reader.js';

class TestDB {
  values=new Map();
  prepare(sql){
    return {bind:(...args)=>({
      first:async()=>sql.startsWith('SELECT')?(this.values.has(args[0])?{value:this.values.get(args[0])}:null):null,
      run:async()=>{if(sql.startsWith('DELETE'))this.values.delete(args[0]);else this.values.set(args[0],args[1]);return {success:true};}
    })};
  }
}

const originalFetch=globalThis.fetch,storageFiles=new Map(),storageBase='https://sg.storage.bunnycdn.com/yeomyeong-pdf/';
globalThis.fetch=async(input,init={})=>{
  const url=String(input);
  if(!url.startsWith(storageBase))return originalFetch(input,init);
  const key=decodeURIComponent(url.slice(storageBase.length)),method=init.method||'GET',bytes=storageFiles.get(key);
  if(method==='PUT'){storageFiles.set(key,new Uint8Array(await new Response(init.body).arrayBuffer()));return new Response(null,{status:201});}
  if(!bytes)return new Response(null,{status:404});
  const range=new Headers(init.headers).get('Range');
  if(method==='HEAD')return new Response(null,{status:200,headers:{'Content-Length':String(bytes.length)}});
  let body=bytes,status=200,headers={'Content-Length':String(bytes.length)};
  if(range){const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(range)||[];if(a!==undefined){const start=Number(a),end=Math.min(Number(b),bytes.length-1);body=bytes.slice(start,end+1);status=206;headers={'Content-Length':String(body.length),'Content-Range':`bytes ${start}-${end}/${bytes.length}`};}}
  if(method==='DELETE'){storageFiles.delete(key);return new Response(null,{status:200});}
  return new Response(body,{status,headers});
};

function adminCookie(secret,login='operator'){
  const payload=Buffer.from(JSON.stringify({login,exp:Date.now()+3600000})).toString('base64url');
  const signature=createHmac('sha256',secret).update(payload).digest('base64url');
  return `ym_admin_session=${payload}.${signature}`;
}

test('Cloudflare Pages API keeps PDF files private and serves a purchase-authorized range',async()=>{
  storageFiles.clear();
  const env={DB:new TestDB(),BUNNY_STORAGE_KEY:'test-bunny-key',READER_UPLOAD_KEY:'test-reader-key'};
  const initialSession=await onRequest({request:new Request('https://stage.example/api/reader?mode=session'),env});
  assert.equal(initialSession.status,200);
  const initial=await initialSession.json();
  assert.equal(initial.books.length,5);
  assert.ok(initial.books.every(book=>!book.allowed));

  const book=initial.books[0],readerId='a'.repeat(64),hash=createHash('sha256').update(readerId).digest('hex');
  const uploadUrl=`https://stage.example/api/reader?mode=upload&book=${book.slug}&upload=${'b'.repeat(32)}&part=0&parts=1`;
  const uploaded=await onRequest({request:new Request(uploadUrl,{method:'POST',headers:{cookie:adminCookie(env.READER_UPLOAD_KEY),'content-type':'application/octet-stream'},body:'%PDF-1.4\ntest ebook'}),env});
  assert.equal(uploaded.status,200);
  assert.equal((await uploaded.json()).complete,true);

  const denied=await onRequest({request:new Request(`https://stage.example/api/reader?mode=pdf&book=${book.slug}`,{headers:{cookie:`ym_reader_id=${readerId}`,range:'bytes=0-7'}}),env});
  assert.equal(denied.status,403);

  const noAdmin=await onRequest({request:new Request('https://stage.example/api/reader?mode=admin-test-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({book:book.slug,action:'grant'})}),env});
  assert.equal(noAdmin.status,401);
  const grant=await onRequest({request:new Request('https://stage.example/api/reader?mode=admin-test-access',{method:'POST',headers:{cookie:`${adminCookie(env.READER_UPLOAD_KEY)}; ym_reader_id=${readerId}`, 'content-type':'application/json'},body:JSON.stringify({book:book.slug,action:'grant'})}),env});
  assert.equal(grant.status,200);
  const grantData=await grant.json(),expiresAt=grantData.expires_at;
  assert.equal(grantData.test,true);
  assert.ok(Math.abs((expiresAt-Date.now())-90*24*60*60*1000)<2000);
  const id=readerId;
  const readerHash=createHash('sha256').update(id).digest('hex');
  const allowed=await onRequest({request:new Request(`https://stage.example/api/reader?mode=pdf&book=${book.slug}`,{headers:{cookie:`ym_reader_id=${readerId}`,range:'bytes=0-7'}}),env});
  assert.equal(allowed.status,206);
  assert.equal(await allowed.text(),'%PDF-1.4');

  const readerSession=await onRequest({request:new Request('https://stage.example/api/reader?mode=session',{headers:{cookie:`ym_reader_id=${id}`}}),env});
  const state=(await readerSession.json()).books.find(item=>item.slug===book.slug);
  assert.equal(state.allowed,true);
  assert.equal(state.expires_at,expiresAt);
  const revoked=await onRequest({request:new Request('https://stage.example/api/reader?mode=admin-test-access',{method:'POST',headers:{cookie:`${adminCookie(env.READER_UPLOAD_KEY)}; ym_reader_id=${id}`, 'content-type':'application/json'},body:JSON.stringify({book:book.slug,action:'revoke'})}),env});
  assert.equal(revoked.status,200);
  const afterRevoke=await onRequest({request:new Request(`https://stage.example/api/reader?mode=pdf&book=${book.slug}`,{headers:{cookie:`ym_reader_id=${id}`,range:'bytes=0-7'}}),env});
  assert.equal(afterRevoke.status,403);

  const catalogRow=await env.DB.prepare('SELECT value FROM app_kv').bind('reader:catalog').first();
  const catalog=JSON.parse(catalogRow.value);
  catalog[0]={...catalog[0],status:'판매중',price:'8,000원',purchase_url:'https://groble.im/products/test-book'};
  await env.DB.prepare('INSERT INTO app_kv(key,value) VALUES(?,?)').bind('reader:catalog',JSON.stringify(catalog)).run();
  const checkout=await onRequest({request:new Request(`https://stage.example/api/reader?mode=checkout&book=${book.slug}`,{headers:{cookie:`ym_reader_id=${id}`}}),env});
  assert.equal(checkout.status,303);
  const location=new URL(checkout.headers.get('location'));
  assert.equal(location.origin,'https://groble.im');
  const ref=location.searchParams.get('ref');assert.match(ref,/^[a-f0-9]{64}$/);
  const checkoutRecord=JSON.parse((await env.DB.prepare('SELECT value FROM app_kv').bind(`checkout:${ref}`).first()).value);
  assert.equal(checkoutRecord.expectedAmount,8000);
  assert.equal(checkoutRecord.book,book.slug);
  assert.equal(checkoutRecord.readerHash,readerHash);
});

test('관리자 로그인 확인은 D1·Bunny 상태와 분리되고 Bunny 키가 없어도 도서 목록은 열린다',async()=>{
  const env={DB:new TestDB(),READER_UPLOAD_KEY:'test-reader-key'};
  const call=(mode,cookie='')=>onRequest({request:new Request(`https://stage.example/api/reader?mode=${mode}`,{headers:cookie?{cookie}:{}}),env});
  assert.equal((await call('admin-status')).status,401);
  assert.equal((await call('admin-status',adminCookie('other-key'))).status,401);
  const ok=await call('admin-status',adminCookie(env.READER_UPLOAD_KEY));
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).login,'operator');
  // Preview에 BUNNY_STORAGE_KEY가 없는 상황: 로그인은 유지되고 PDF 상태만 확인 불가로 표시된다.
  const admin=await call('admin',adminCookie(env.READER_UPLOAD_KEY));
  assert.equal(admin.status,200);
  const data=await admin.json();
  assert.equal(data.storageError,'missing_key');
  assert.deepEqual(data.storageEnv,[]);
  const named=await onRequest({request:new Request('https://stage.example/api/reader?mode=admin',{headers:{cookie:adminCookie(env.READER_UPLOAD_KEY)}}),env:{...env,'BUNNY_STORAGE_KEY ':'x',BUNNY_STORAGE_KEY:'  '}});
  const namedData=await named.json();
  assert.deepEqual(namedData.storageEnv,[{name:'BUNNY_STORAGE_KEY ',empty:false},{name:'BUNNY_STORAGE_KEY',empty:true}]);
  assert.ok(!JSON.stringify(namedData).includes('"x"'));
  assert.ok(data.books.length>0&&data.books.every(book=>book.pdfUploaded===null));
  const unset=await onRequest({request:new Request('https://stage.example/api/reader?mode=admin-status'),env:{DB:new TestDB()}});
  assert.equal(unset.status,503);
  assert.equal((await call('admin-session')).status,405);
});

test('Bunny 키가 없는 환경에서도 열람 세션·결제 시작은 Worker 예외 대신 JSON 503을 돌려준다',async()=>{
  const env={DB:new TestDB(),READER_UPLOAD_KEY:'test-reader-key'};
  const {defaultCatalog}=await import('../functions/api/_shared/default-catalog.js');
  await env.DB.prepare('INSERT INTO app_kv(key,value) VALUES(?,?)').bind('reader:catalog',JSON.stringify(defaultCatalog.map(book=>book.slug==='book-saju-story'?{...book,status:'판매중',price:'8,000원',purchase_url:'https://groble.im/products/test-book'}:book))).run();
  for(const mode of ['session','checkout&book=book-saju-story']){
    const response=await onRequest({request:new Request(`https://stage.example/api/reader?mode=${mode}`),env});
    assert.equal(response.status,503);
    assert.ok((await response.json()).error);
  }
});

test('Bunny가 키를 거부하면 관리자 화면에 http 상태 원인 코드를 준다',async()=>{
  const env={DB:new TestDB(),READER_UPLOAD_KEY:'test-reader-key',BUNNY_STORAGE_KEY:'wrong-key'};
  const saved=globalThis.fetch;
  globalThis.fetch=async(input,init)=>String(input).startsWith(storageBase)?new Response(null,{status:401}):saved(input,init);
  try{
    const admin=await onRequest({request:new Request('https://stage.example/api/reader?mode=admin',{headers:{cookie:adminCookie(env.READER_UPLOAD_KEY)}}),env});
    assert.equal(admin.status,200);
    assert.equal((await admin.json()).storageError,'http_401');
  }finally{globalThis.fetch=saved;}
});
