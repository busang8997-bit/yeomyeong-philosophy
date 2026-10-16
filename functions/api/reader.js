import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {accessState,grantAccess,hashReaderId,parseByteRange,revokePayment} from '../../netlify/functions/_shared/reader-core.mjs';
import {defaultCatalog} from './_shared/default-catalog.js';
import {readJSON,readText,removeKey,writeJSON,writeText} from './_shared/d1-store.js';
import {bunnyBucket} from './_shared/bunny-storage.js';

const READER_COOKIE='ym_reader_id',ADMIN_COOKIE='ym_admin_session';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Vary':'Cookie'};
const json=(status,data,more={})=>Response.json(data,{status,headers:{...headers,...more}});
const cookies=request=>Object.fromEntries(String(request.headers.get('cookie')||'').split(';').map(part=>{const i=part.indexOf('=');if(i<0)return['',''];try{return[part.slice(0,i).trim(),decodeURIComponent(part.slice(i+1).trim())]}catch{return['',''];}}));
const readerId=request=>{const value=cookies(request)[READER_COOKIE];return hashReaderId(value)?value:'';};
const won=value=>Number(String(value||'').replace(/[^0-9]/g,''));
const validSlug=value=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value||''));
const validGroble=value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='groble.im'||u.hostname.endsWith('.groble.im'));}catch{return false;}};
const validYouTube=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(u.hostname);}catch{return false;}};
function signed(value,secret){return createHmac('sha256',secret).update(value).digest('base64url');}
function adminLogin(request,secret){
  if(!secret)return '';
  const token=cookies(request)[ADMIN_COOKIE]||'',parts=token.split('.');
  if(parts.length!==2)return '';
  const [payload,signature]=parts,expected=signed(payload,secret),a=Buffer.from(signature),b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))return '';
  try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.exp>Date.now()&&/^[a-zA-Z0-9-]+$/.test(data.login)?data.login:'';}catch{return '';}
}
async function catalogFor(env){let items=await readJSON(env.DB,'reader:catalog');if(!Array.isArray(items)){items=defaultCatalog;await writeJSON(env.DB,'reader:catalog',items);}return items;}
const storage=env=>bunnyBucket(env);
async function hasPdf(env,slug){return Boolean(await storage(env).head(slug));}
// 관리자 화면용: Bunny 연결 문제(예: Preview에 BUNNY_STORAGE_KEY 없음)가 도서 목록·로그인까지 막지 않도록 null로 표시한다.
async function pdfStatus(env,slug){try{return await hasPdf(env,slug);}catch(error){console.error('Bunny PDF status error',error);return null;}}
async function withPdfStatus(env,books){const list=await Promise.all(books.map(async book=>({...book,pdfUploaded:await pdfStatus(env,book.slug)})));return {books:list,storageError:list.some(book=>book.pdfUploaded===null)};}
function safeBook(book){return Boolean(book?.published);}
function pdfObject(slug){return String(slug);}

export async function onRequest({request,env}){
  const url=new URL(request.url),method=request.method.toUpperCase(),mode=url.searchParams.get('mode')||'session';
  try{
    // 로그인 여부만 확인한다. D1·Bunny를 건드리지 않으므로 저장소 문제와 로그인 문제를 구분할 수 있다.
    if(mode==='admin-status'&&method==='GET'){
      if(!env.READER_UPLOAD_KEY)return json(503,{error:'관리자 비밀번호가 이 배포에 적용되지 않았습니다. 설정 후 다시 배포해야 적용됩니다.'});
      const login=adminLogin(request,env.READER_UPLOAD_KEY);
      return login?json(200,{ok:true,login}):json(401,{error:'관리자 로그인이 필요합니다.'});
    }
    if(mode==='admin-logout'&&method==='POST')return json(200,{ok:true},{'Set-Cookie':`${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
    if(mode==='admin'&&(method==='GET'||method==='POST'))return manageCatalog(request,env);
    if(mode==='admin-test-access'&&method==='POST')return adminTestAccess(request,url,env);
    if(mode==='catalog'&&method==='GET')return publicCatalog(env);
    if(mode==='upload'&&method==='POST')return uploadPdf(request,url,env);
    if(mode==='pdf'&&(method==='GET'||method==='HEAD'))return servePdf(request,url,env);
    if(mode==='checkout'&&method==='GET')return startCheckout(request,url,env);
    if(mode!=='session'||method!=='GET')return json(405,{error:'허용되지 않은 요청입니다.'},{Allow:'GET, POST'});
    return readerSession(request,env);
  }catch(error){console.error('Cloudflare reader error',error);return json(503,{error:mode.startsWith('admin')?'도서 운영 정보를 불러오지 못했습니다. D1·Bunny 연결을 확인해 주세요. 관리자 로그인 상태와는 별개입니다.':'전자책 서비스를 준비 중입니다.'});}
}

// This route is gated by the existing signed admin session. Test grants use a
// tagged payment id in the normal entitlement record, so the real webhook path
// and real payment records are never touched.
async function adminTestAccess(request,url,env){
  const login=adminLogin(request,env.READER_UPLOAD_KEY);if(!login)return json(401,{error:'관리자 로그인 후 이용해 주세요.'});
  const body=await request.json().catch(()=>({})),slug=String(body.book||''),action=String(body.action||'');
  if(!validSlug(slug)||!['grant','revoke'].includes(action))return json(400,{error:'테스트 열람 정보가 올바르지 않습니다.'});
  const book=(await catalogFor(env)).find(item=>item.slug===slug);if(!safeBook(book))return json(404,{error:'출간 도서를 찾을 수 없습니다.'});
  let id=readerId(request),extra={};
  if(!id){id=randomBytes(32).toString('hex');extra['Set-Cookie']=`${READER_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;}
  const hash=hashReaderId(id),testKey=`admin-test:${hash}:${slug}`,entitlementKey=`entitlement:${hash}:${slug}`;
  const entitlement=await readJSON(env.DB,entitlementKey)||{payments:[]},existing=await readJSON(env.DB,testKey);
  if(action==='grant'){
    if(!await hasPdf(env,slug))return json(409,{error:'PDF 파일을 먼저 등록해 주세요.'});
    const realActive=(entitlement.payments||[]).some(item=>!String(item.paymentId||'').startsWith('admin-test:')&&!item.refunded&&Number(item.expiresAt)>Date.now());
    const previousTest=(entitlement.payments||[]).find(item=>item.paymentId===existing?.paymentId),activeTest=previousTest&&!previousTest.refunded&&Number(previousTest.expiresAt)>Date.now();
    if(realActive&&!activeTest)return json(409,{error:'이 브라우저에는 실제 열람권이 있어 테스트 열람권을 추가하지 않았습니다.'});
    const paymentId=activeTest?existing.paymentId:`admin-test:${randomBytes(16).toString('hex')}`;
    const updated=grantAccess(entitlement,paymentId,Date.now());
    await writeJSON(env.DB,entitlementKey,updated);
    await writeJSON(env.DB,testKey,{paymentId,createdAt:Date.now()});
    const grant=updated.payments.find(item=>item.paymentId===paymentId);
    return json(200,{ok:true,action,book:slug,expires_at:grant.expiresAt,test:true},extra);
  }
  if(!existing?.paymentId)return json(409,{error:'회수할 관리자 테스트 열람권이 없습니다.'});
  await writeJSON(env.DB,entitlementKey,revokePayment(entitlement,existing.paymentId));
  await removeKey(env.DB,testKey);
  return json(200,{ok:true,action,book:slug,expires_at:null,test:true},extra);
}

async function readerSession(request,env){
  let id=readerId(request),extra={};
  if(!id){id=randomBytes(32).toString('hex');extra['Set-Cookie']=`${READER_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;}
  const hash=hashReaderId(id),db=env.DB;
  const books=await Promise.all((await catalogFor(env)).filter(safeBook).map(async book=>{
    const [grant,pdf]=await Promise.all([readJSON(db,`entitlement:${hash}:${book.slug}`),hasPdf(env,book.slug)]),state=accessState(grant);
    return {slug:book.slug,title:book.title,price:book.price,regular_price:book.regular_price,can_buy:pdf&&book.status==='판매중'&&validGroble(book.purchase_url),allowed:state.allowed,expires_at:state.expiresAt};
  }));
  return json(200,{books},extra);
}

async function startCheckout(request,url,env){
  const slug=String(url.searchParams.get('book')||''),book=(await catalogFor(env)).find(item=>item.slug===slug);
  if(!safeBook(book))return json(404,{error:'출간 도서를 찾을 수 없습니다.'});
  if(book.status!=='판매중'||!validGroble(book.purchase_url)||won(book.price)<1)return json(409,{error:'이 도서는 결제 연결을 준비 중입니다.'});
  if(!await hasPdf(env,slug))return json(409,{error:'전자책 PDF 등록 후 판매를 시작할 수 있습니다.'});
  const id=readerId(request)||randomBytes(32).toString('hex'),hash=hashReaderId(id),ref=randomBytes(32).toString('hex');
  await writeJSON(env.DB,`checkout:${ref}`,{readerHash:hash,book:slug,expectedAmount:won(book.price),createdAt:Date.now(),expiresAt:Date.now()+2*60*60*1000,status:'pending'});
  const checkout=new URL(book.purchase_url);checkout.searchParams.set('ref',ref);
  return new Response(null,{status:303,headers:{...headers,Location:checkout.toString(),'Set-Cookie':`${READER_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`}});
}

async function servePdf(request,url,env){
  const slug=url.searchParams.get('book')||'',book=(await catalogFor(env)).find(item=>item.slug===slug);
  if(!book||!safeBook(book))return json(404,{error:'출간 도서를 찾을 수 없습니다.'});
  const hash=hashReaderId(readerId(request));if(!hash)return json(401,{error:'구매한 브라우저에서 열람해 주세요.'});
  const state=accessState(await readJSON(env.DB,`entitlement:${hash}:${slug}`));
  if(!state.allowed)return json(403,{error:'유효한 90일 열람권이 없습니다.'});
  const bucket=storage(env),head=await bucket.head(pdfObject(slug));if(!head)return json(503,{error:'전자책 파일을 비공개 저장소에 연결 중입니다.'});
  const base={...headers,'Content-Type':'application/pdf','Accept-Ranges':'bytes','Content-Disposition':'inline; filename="reading-copy.pdf"'};
  if(request.method.toUpperCase()==='HEAD')return new Response(null,{status:200,headers:{...base,'Content-Length':String(head.size)}});
  const range=parseByteRange(request.headers.get('range'),head.size);
  if(!request.headers.has('range')||!range)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${head.size}`}});
  const object=await bucket.get(pdfObject(slug),{range:{offset:range.start,length:range.end-range.start+1}});
  if(!object)return json(503,{error:'전자책 파일을 불러오지 못했습니다.'});
  return new Response(object.body,{status:206,headers:{...base,'Content-Length':String(range.end-range.start+1),'Content-Range':`bytes ${range.start}-${range.end}/${head.size}`}});
}

async function uploadPdf(request,url,env){
  const login=adminLogin(request,env.READER_UPLOAD_KEY);if(!login)return json(401,{error:'관리자 로그인 후 이용해 주세요.'});
  const slug=url.searchParams.get('book')||'',upload=url.searchParams.get('upload')||'',index=Number(url.searchParams.get('part')),count=Number(url.searchParams.get('parts'));
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!/^[a-f0-9]{32}$/.test(upload)||!Number.isInteger(index)||!Number.isInteger(count)||count<1||count>120||index<0||index>=count)return json(400,{error:'업로드 정보가 올바르지 않습니다.'});
  const book=(await catalogFor(env)).find(item=>item.slug===slug);if(!book)return json(404,{error:'도서를 먼저 저장해 주세요.'});
  const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>512*1024)return json(413,{error:'한 번에 512KB 이하로 나누어 올려 주세요.'});
  const done=`upload-done:${upload}:${slug}`;if(await readText(env.DB,done))return json(200,{ok:true,complete:true});
  const bucket=storage(env);
  await bucket.put(`tmp/${upload}/${slug}/${index}`,bytes);
  await writeJSON(env.DB,`upload-manifest:${upload}:${slug}`,{count,updatedAt:Date.now()});
  const keys=Array.from({length:count},(_,n)=>`tmp/${upload}/${slug}/${n}`),heads=await Promise.all(keys.map(key=>bucket.head(key)));
  if(heads.some(x=>!x))return json(200,{ok:true,complete:false,received:index+1,total:count});
  const parts=await Promise.all(keys.map(async key=>new Uint8Array(await (await bucket.get(key)).arrayBuffer())));
  const size=parts.reduce((sum,part)=>sum+part.length,0);if(size>30*1024*1024)return json(413,{error:'전자책 파일이 허용 크기(30MB)를 넘습니다.'});
  const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
  if(new TextDecoder().decode(data.subarray(0,5))!=='%PDF-')return json(415,{error:'PDF 파일만 등록할 수 있습니다.'});
  await bucket.put(slug,data,{httpMetadata:{contentType:'application/pdf'},customMetadata:{uploadedAt:new Date().toISOString()}});
  await Promise.all(keys.map(key=>bucket.delete(key)));
  await removeKey(env.DB,`upload-manifest:${upload}:${slug}`);await writeText(env.DB,done,'1');
  return json(200,{ok:true,complete:true,book:slug,size});
}

async function manageCatalog(request,env){
  const login=adminLogin(request,env.READER_UPLOAD_KEY);if(!login)return json(401,{error:'관리자 로그인이 만료되었습니다. /admin/에서 다시 로그인해 주세요.'});
  if(request.method==='GET'){
    return json(200,{login,...await withPdfStatus(env,await catalogFor(env))});
  }
  const body=await request.json();if(!Array.isArray(body.books)||body.books.length>500)return json(400,{error:'도서 목록 형식이 올바르지 않습니다.'});
  const seen=new Set(),books=[];
  for(const item of body.books){
    const slug=String(item.slug||'').trim(),price=String(item.price||'').trim(),regular=String(item.regular_price||'').trim(),purchase=String(item.purchase_url||'').trim(),cover=String(item.cover||'').trim(),video=String(item.video_url||'').trim();
    if(!validSlug(slug)||seen.has(slug))return json(400,{error:'도서 코드가 중복되었거나 형식이 올바르지 않습니다.'});seen.add(slug);
    if(purchase&&!validGroble(purchase))return json(400,{error:'그로블 결제 주소만 등록할 수 있습니다.'});
    if(video&&!validYouTube(video))return json(400,{error:'YouTube 영상 주소를 입력해 주세요.'});
    if(price&&!/^[0-9,]+\s*원?$/.test(price)||regular&&!/^[0-9,]+\s*원?$/.test(regular))return json(400,{error:'가격은 숫자와 쉼표, 원 단위로 입력해 주세요.'});
    if(cover&&!/^https:\/\//i.test(cover)&&!/^\/?assets\/[a-zA-Z0-9_./-]+$/.test(cover))return json(400,{error:'표지 주소는 https:// 또는 assets 경로만 사용할 수 있습니다.'});
    const title=String(item.title||'').trim().slice(0,200);if(!title)return json(400,{error:'책 제목을 입력해 주세요.'});
    books.push({slug,title,author:String(item.author||'').trim().slice(0,100),description:String(item.description||'').trim().slice(0,5000),series:String(item.series||'').trim().slice(0,100),published:Boolean(item.published),status:String(item.status||'준비중').slice(0,30),price,regular_price:regular,purchase_url:purchase,cover,video_url:video});
  }
  await writeJSON(env.DB,'reader:catalog',books);
  return json(200,{ok:true,...await withPdfStatus(env,books)});
}

async function publicCatalog(env){const books=await catalogFor(env);return json(200,{books:books.filter(safeBook).map(({slug,title,author,description,series,price,regular_price,status,purchase_url,cover,video_url})=>({slug,title,author,description,series,price,regular_price,status,purchase_url,cover,video_url}))});}
