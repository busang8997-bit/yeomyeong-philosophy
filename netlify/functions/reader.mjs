import {randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import catalog from './_shared/catalog.json' with {type:'json'};
import readerConfig from './_shared/reader-config.json' with {type:'json'};
import {accessState,hashReaderId,parseByteRange} from './_shared/reader-core.mjs';

const COOKIE='ym_reader_id';
const ADMIN_COOKIE='ym_admin_session';
const store=()=>getStore({name:readerConfig.storeName,consistency:'strong'});
const securityHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Vary':'Cookie'};
const json=(status,data,headers={})=>Response.json(data,{status,headers:{...securityHeaders,...headers}});
const parseCookies=value=>Object.fromEntries(String(value||'').split(';').map(part=>{const i=part.indexOf('=');if(i<0)return['',''];try{return[part.slice(0,i).trim(),decodeURIComponent(part.slice(i+1).trim())]}catch{return['',''];}}));
const getReaderId=request=>{const value=parseCookies(request.headers.get('cookie'))[COOKIE];return hashReaderId(value)?value:'';};
const parseWon=value=>Number(String(value||'').replace(/[^0-9]/g,''));
const isGrobleURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='groble.im'||url.hostname.endsWith('.groble.im'));}catch{return false;}};
const isYouTubeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname);}catch{return false;}};
const isLiveBook=book=>Boolean(book?.published);
const fixedSecretMatch=(provided,expected)=>{if(!provided||!expected)return false;const left=Buffer.from(String(provided));const right=Buffer.from(expected);return left.length===right.length&&timingSafeEqual(left,right);};
const signAdmin=value=>createHmac('sha256',process.env.READER_UPLOAD_KEY||'').update(value).digest('base64url');
const isBookSlug=value=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value||''));

async function loadCatalog(db){
  let items=await db.get('reader:catalog',{type:'json'});
  if(!Array.isArray(items)){items=catalog;await db.setJSON('reader:catalog',items);}
  return items;
}
function adminLogin(request){
  if(!process.env.READER_UPLOAD_KEY)return '';
  const token=parseCookies(request.headers.get('cookie'))[ADMIN_COOKIE]||'';
  const [payload,signature]=token.split('.');
  if(!payload||!signature||!fixedSecretMatch(signature,signAdmin(payload)))return '';
  try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.exp>Date.now()&&/^[a-zA-Z0-9-]+$/.test(data.login)?data.login:'';}catch{return '';}
}
async function requireAdminSession(request){
  const login=adminLogin(request);
  if(!login)return '';
  const githubToken=request.headers.get('x-admin-github-token');
  if(!githubToken)return login;
  const identity=await verifyGithubAdmin(githubToken);
  return identity===login?login:'';
}
async function verifyGithubAdmin(token){
  if(!token||token.length>4096)return '';
  try{
    const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    const user=await fetch('https://api.github.com/user',{headers}).then(r=>r.ok?r.json():null);
    if(!user?.login)return '';
    const repo=await fetch('https://api.github.com/repos/busang8997-bit/yeomyeong-philosophy',{headers}).then(r=>r.ok?r.json():null);
    return repo?.permissions?.push?user.login:'';
  }catch{return '';}
}
function adminSessionCookie(login){
  const payload=Buffer.from(JSON.stringify({login,exp:Date.now()+8*60*60*1000})).toString('base64url');
  return `${ADMIN_COOKIE}=${payload}.${signAdmin(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

async function entitlementFor(readerHash,slug){const db=store();return db.get(`entitlement:${readerHash}:${slug}`,{type:'json'});}

export default async function handler(request){
  const url=new URL(request.url),method=request.method.toUpperCase(),mode=url.searchParams.get('mode')||'session';
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{...securityHeaders,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
  if(mode==='admin-session'&&method==='POST')return createAdminSession(request);
  if(mode==='admin-logout'&&method==='POST')return json(200,{ok:true},{'Set-Cookie':`${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
  if(mode==='admin'&&(method==='GET'||method==='POST'))return manageCatalog(request);
  if(mode==='catalog'&&method==='GET')return publicCatalog();
  if(mode==='pdf'&&(method==='GET'||method==='HEAD'))return servePdf(request,url);
  if(mode==='upload'&&method==='POST')return uploadPdf(request,url);
  if(mode==='checkout'&&method==='GET')return startCheckout(request,url);
  if(mode!=='session'||method!=='GET')return json(405,{error:'허용되지 않은 요청입니다.'},{Allow:'GET, POST'});
  let readerId=getReaderId(request),headers={};
  if(!readerId){readerId=randomBytes(32).toString('hex');headers['Set-Cookie']=`${COOKIE}=${readerId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;}
  const readerHash=hashReaderId(readerId);
  try{
    const db=await store();
    const books=await Promise.all((await loadCatalog(db)).filter(isLiveBook).map(async book=>{
      const [entitlement,file]=await Promise.all([entitlementFor(readerHash,book.slug),db.getMetadata(`pdf:${book.slug}`)]);
      const grant=accessState(entitlement);
      return {slug:book.slug,title:book.title,price:book.price,regular_price:book.regular_price,can_buy:Boolean(file)&&book.status==='판매중'&&isGrobleURL(book.purchase_url),allowed:grant.allowed,expires_at:grant.expiresAt};
    }));
    return json(200,{books},headers);
  }catch(error){console.error('reader session error',error);return json(503,{error:'열람 권한 확인을 준비 중입니다.'},headers);}
}

async function startCheckout(request,url){
  const db=await store(),books=await loadCatalog(db),book=books.find(item=>item.slug===String(url.searchParams.get('book')||''));
  if(!isLiveBook(book))return json(404,{error:'출간된 도서를 찾을 수 없습니다.'});
  if(book.status!=='판매중'||!isGrobleURL(book.purchase_url)||parseWon(book.price)<1)return json(409,{error:'이 도서는 결제 연결을 준비 중입니다.'});
  if(!await db.getMetadata(`pdf:${book.slug}`))return json(409,{error:'전자책 PDF 등록 후 판매를 시작할 수 있습니다.'});
  const readerId=getReaderId(request)||randomBytes(32).toString('hex');
  const readerHash=hashReaderId(readerId),sellerReference=randomBytes(32).toString('hex');
  await db.setJSON(`checkout:${sellerReference}`,{readerHash,book:book.slug,expectedAmount:parseWon(book.price),createdAt:Date.now(),expiresAt:Date.now()+2*60*60*1000,status:'pending'});
  const checkout=new URL(book.purchase_url);checkout.searchParams.set('ref',sellerReference);
  return new Response(null,{status:303,headers:{...securityHeaders,Location:checkout.toString(),'Set-Cookie':`${COOKIE}=${readerId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`}});
}

async function servePdf(request,url){
  const slug=url.searchParams.get('book')||'',db=await store(),books=await loadCatalog(db),book=books.find(item=>item.slug===slug);
  if(!book||!isLiveBook(book))return json(404,{error:'출간된 도서를 찾을 수 없습니다.'});
  const readerHash=hashReaderId(getReaderId(request));
  if(!readerHash)return json(401,{error:'구매한 브라우저에서 열람해 주세요.'});
  try{
    const grant=accessState(await entitlementFor(readerHash,slug));
    if(!grant.allowed)return json(403,{error:'유효한 90일 열람권이 없습니다.'});
    const bytes=await db.get(`pdf:${slug}`,{type:'arrayBuffer'});
    if(!bytes)return json(503,{error:'전자책 파일을 비공개 저장소에 연결 중입니다.'});
    const pdf=Buffer.from(bytes),baseHeaders={...securityHeaders,'Content-Type':'application/pdf','Accept-Ranges':'bytes','Content-Disposition':'inline; filename="reading-copy.pdf"'};
    if(request.method.toUpperCase()==='HEAD')return new Response(null,{status:200,headers:{...baseHeaders,'Content-Length':String(pdf.length)}});
    const rangeHeader=request.headers.get('range');
    if(!rangeHeader)return new Response(null,{status:416,headers:{...securityHeaders,'Content-Range':`bytes */${pdf.length}`}});
    const range=parseByteRange(rangeHeader,pdf.length);
    if(!range)return new Response(null,{status:416,headers:{...securityHeaders,'Content-Range':`bytes */${pdf.length}`}});
    const chunk=pdf.subarray(range.start,range.end+1);
    return new Response(chunk,{status:206,headers:{...baseHeaders,'Content-Length':String(chunk.length),'Content-Range':`bytes ${range.start}-${range.end}/${pdf.length}`}});
  }catch(error){console.error('reader pdf error',error);return json(503,{error:'전자책을 불러오지 못했습니다.'});}
}

async function uploadPdf(request,url){
  if(!await requireAdminSession(request))return json(401,{error:'관리자 로그인 후 이용해 주세요.'});
  const slug=url.searchParams.get('book')||'',uploadId=url.searchParams.get('upload')||'',index=Number(url.searchParams.get('part')),count=Number(url.searchParams.get('parts'));
  const db=await store(),book=(await loadCatalog(db)).find(item=>item.slug===slug);
  if(!book||!isBookSlug(slug)||!/^[a-f0-9]{32}$/.test(uploadId)||!Number.isInteger(index)||!Number.isInteger(count)||count<1||count>120||index<0||index>=count)return json(400,{error:'업로드 정보가 올바르지 않습니다.'});
  const chunk=Buffer.from(await request.arrayBuffer());
  if(!chunk.length||chunk.length>512*1024)return json(413,{error:'한 번에 512KB 이하로 나누어 올려 주세요.'});
  const doneKey=`upload-done:${uploadId}:${slug}`;
  if(await db.get(doneKey,{type:'text'}))return json(200,{ok:true,complete:true});
  const partKey=`upload-part:${uploadId}:${slug}:${index}`;
  await db.set(partKey,chunk);
  await db.setJSON(`upload-manifest:${uploadId}:${slug}`,{count,updatedAt:Date.now()});
  const chunks=await Promise.all(Array.from({length:count},(_,n)=>db.get(`upload-part:${uploadId}:${slug}:${n}`,{type:'arrayBuffer'})));
  if(chunks.some(value=>!value))return json(200,{ok:true,complete:false,received:index+1,total:count});
  const size=chunks.reduce((sum,value)=>sum+value.byteLength,0);
  if(size>30*1024*1024)return json(413,{error:'전자책 파일이 허용 크기(30MB)를 넘습니다.'});
  const data=Buffer.concat(chunks.map(value=>Buffer.from(value)));
  if(data.subarray(0,5).toString('ascii')!=='%PDF-')return json(415,{error:'PDF 파일만 등록할 수 있습니다.'});
  await db.set(`pdf:${slug}`,data,{metadata:{contentType:'application/pdf',uploadedAt:new Date().toISOString()}});
  for(let n=0;n<count;n++)await db.delete(`upload-part:${uploadId}:${slug}:${n}`);
  await db.delete(`upload-manifest:${uploadId}:${slug}`);await db.set(doneKey,'1');
  return json(200,{ok:true,complete:true,book:slug,size});
}

async function createAdminSession(request){
  if(!process.env.READER_UPLOAD_KEY)return json(503,{error:'관리자 세션 설정을 확인해 주세요.'});
  const login=await verifyGithubAdmin(request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'');
  if(!login)return json(401,{error:'여명철학 GitHub 관리자 계정으로 로그인해 주세요.'});
  return json(200,{ok:true,login},{'Set-Cookie':adminSessionCookie(login)});
}
async function manageCatalog(request){
  const login=await requireAdminSession(request);
  if(!login)return json(401,{error:'관리자 로그인이 만료되었습니다. /admin/에서 다시 로그인해 주세요.'});
  try{
    const db=await store();
    if(request.method==='GET'){
      const books=await loadCatalog(db);
      const result=await Promise.all(books.map(async book=>({ ...book, pdfUploaded:Boolean(await db.getMetadata(`pdf:${book.slug}`)) })));
      return json(200,{login,books:result});
    }
    const body=await request.json();
    if(!Array.isArray(body.books)||body.books.length>500)return json(400,{error:'도서 목록 형식이 올바르지 않습니다.'});
    const slugs=new Set();
    const books=body.books.map(book=>{
      const slug=String(book.slug||'').trim();
      if(!isBookSlug(slug)||slugs.has(slug))throw Error('도서 코드가 중복되었거나 형식이 올바르지 않습니다.');
      slugs.add(slug);
      const price=String(book.price||'').trim(),regular=String(book.regular_price||'').trim(),url=String(book.purchase_url||'').trim(),cover=String(book.cover||'').trim(),video=String(book.video_url||'').trim();
      if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||!(parsed.hostname==='groble.im'||parsed.hostname.endsWith('.groble.im')))throw Error('그로블 결제 주소만 등록할 수 있습니다.');}
      if(video&&!isYouTubeURL(video))throw Error('YouTube 영상 주소를 입력해 주세요.');
      if(price&&!/^[0-9,]+\s*원?$/.test(price)||regular&&!/^[0-9,]+\s*원?$/.test(regular))throw Error('가격은 숫자와 쉼표, 원 단위로 입력해 주세요.');
      if(cover&&!/^https:\/\//i.test(cover)&&!/^\/?assets\/[a-zA-Z0-9_./-]+$/.test(cover))throw Error('표지 주소는 https:// 또는 assets 경로만 사용할 수 있습니다.');
      return {slug,title:String(book.title||'').trim().slice(0,200),author:String(book.author||'').trim().slice(0,100),description:String(book.description||'').trim().slice(0,5000),series:String(book.series||'').trim().slice(0,100),published:Boolean(book.published),status:String(book.status||'준비중').slice(0,30),price,regular_price:regular,purchase_url:url,cover,video_url:video};
    });
    if(books.some(book=>!book.title))return json(400,{error:'책 제목을 입력해 주세요.'});
    await db.setJSON('reader:catalog',books);
    return json(200,{ok:true,books:await Promise.all(books.map(async book=>({...book,pdfUploaded:Boolean(await db.getMetadata(`pdf:${book.slug}`))})))});
  }catch(error){return json(400,{error:error.message||'도서 정보를 저장하지 못했습니다.'});}
}
async function publicCatalog(){
  try{const db=await store(),books=await loadCatalog(db);return json(200,{books:books.filter(isLiveBook).map(({slug,title,author,description,series,price,regular_price,status,purchase_url,cover,video_url})=>({slug,title,author,description,series,price,regular_price,status,purchase_url,cover,video_url}))});}
  catch{return json(503,{error:'도서 정보를 불러오지 못했습니다.'});}
}
