import {randomBytes,timingSafeEqual} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import catalog from './_shared/catalog.json' with {type:'json'};
import readerConfig from './_shared/reader-config.json' with {type:'json'};
import {accessState,hashReaderId,parseByteRange,READER_BOOKS} from './_shared/reader-core.mjs';

const booksBySlug=new Map(catalog.filter(book=>READER_BOOKS.includes(book.slug)).map(book=>[book.slug,book]));
const COOKIE='ym_reader_id';
const store=()=>getStore({name:readerConfig.storeName,consistency:'strong'});
const securityHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Vary':'Cookie'};
const json=(status,data,headers={})=>Response.json(data,{status,headers:{...securityHeaders,...headers}});
const parseCookies=value=>Object.fromEntries(String(value||'').split(';').map(part=>{const i=part.indexOf('=');if(i<0)return['',''];try{return[part.slice(0,i).trim(),decodeURIComponent(part.slice(i+1).trim())]}catch{return['',''];}}));
const getReaderId=request=>{const value=parseCookies(request.headers.get('cookie'))[COOKIE];return hashReaderId(value)?value:'';};
const parseWon=value=>Number(String(value||'').replace(/[^0-9]/g,''));
const isGrobleURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='groble.im'||url.hostname.endsWith('.groble.im'));}catch{return false;}};
const isLiveBook=book=>Boolean(book?.published);
const fixedSecretMatch=(provided,expected)=>{if(!provided||!expected)return false;const left=Buffer.from(String(provided));const right=Buffer.from(expected);return left.length===right.length&&timingSafeEqual(left,right);};

async function entitlementFor(readerHash,slug){return store().then(db=>db.get(`entitlement:${readerHash}:${slug}`,{type:'json'}));}

export default async function handler(request){
  const url=new URL(request.url),method=request.method.toUpperCase(),mode=url.searchParams.get('mode')||'session';
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{...securityHeaders,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Reader-Upload-Key'}});
  if(mode==='pdf'&&(method==='GET'||method==='HEAD'))return servePdf(request,url);
  if(mode==='upload'&&method==='POST')return uploadPdf(request,url);
  if(mode==='checkout'&&method==='GET')return startCheckout(request,url);
  if(mode!=='session'||method!=='GET')return json(405,{error:'허용되지 않은 요청입니다.'},{Allow:'GET, POST'});
  let readerId=getReaderId(request),headers={};
  if(!readerId){readerId=randomBytes(32).toString('hex');headers['Set-Cookie']=`${COOKIE}=${readerId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;}
  const readerHash=hashReaderId(readerId);
  try{
    const db=await store();
    const books=await Promise.all([...booksBySlug.values()].filter(isLiveBook).map(async book=>{
      const [entitlement,file]=await Promise.all([entitlementFor(readerHash,book.slug),db.getMetadata(`pdf:${book.slug}`)]);
      const grant=accessState(entitlement);
      return {slug:book.slug,title:book.title,price:book.price,regular_price:book.regular_price,can_buy:Boolean(file)&&book.status==='판매중'&&isGrobleURL(book.purchase_url),allowed:grant.allowed,expires_at:grant.expiresAt};
    }));
    return json(200,{books},headers);
  }catch(error){console.error('reader session error',error);return json(503,{error:'열람 권한 확인을 준비 중입니다.'},headers);}
}

async function startCheckout(request,url){
  const book=booksBySlug.get(String(url.searchParams.get('book')||''));
  if(!isLiveBook(book))return json(404,{error:'출간된 도서를 찾을 수 없습니다.'});
  if(book.status!=='판매중'||!isGrobleURL(book.purchase_url)||parseWon(book.price)<1)return json(409,{error:'이 도서는 결제 연결을 준비 중입니다.'});
  const readerId=getReaderId(request)||randomBytes(32).toString('hex');
  const readerHash=hashReaderId(readerId),sellerReference=randomBytes(32).toString('hex'),db=await store();
  await db.setJSON(`checkout:${sellerReference}`,{readerHash,book:book.slug,expectedAmount:parseWon(book.price),createdAt:Date.now(),expiresAt:Date.now()+2*60*60*1000,status:'pending'});
  const checkout=new URL(book.purchase_url);checkout.searchParams.set('ref',sellerReference);
  return new Response(null,{status:303,headers:{...securityHeaders,Location:checkout.toString(),'Set-Cookie':`${COOKIE}=${readerId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`}});
}

async function servePdf(request,url){
  const slug=url.searchParams.get('book')||'',book=booksBySlug.get(slug);
  if(!book||!isLiveBook(book))return json(404,{error:'출간된 도서를 찾을 수 없습니다.'});
  const readerHash=hashReaderId(getReaderId(request));
  if(!readerHash)return json(401,{error:'구매한 브라우저에서 열람해 주세요.'});
  try{
    const grant=accessState(await entitlementFor(readerHash,slug));
    if(!grant.allowed)return json(403,{error:'유효한 90일 열람권이 없습니다.'});
    const bytes=await store().then(db=>db.get(`pdf:${slug}`,{type:'arrayBuffer'}));
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
  if(!fixedSecretMatch(request.headers.get('x-reader-upload-key'),process.env.READER_UPLOAD_KEY))return json(401,{error:'업로드 권한이 없습니다.'});
  const slug=url.searchParams.get('book')||'',uploadId=url.searchParams.get('upload')||'',index=Number(url.searchParams.get('part')),count=Number(url.searchParams.get('parts'));
  const book=booksBySlug.get(slug);
  if(!isLiveBook(book)||!READER_BOOKS.includes(slug)||!/^[a-f0-9]{32}$/.test(uploadId)||!Number.isInteger(index)||!Number.isInteger(count)||count<1||count>120||index<0||index>=count)return json(400,{error:'업로드 정보가 올바르지 않습니다.'});
  const chunk=Buffer.from(await request.arrayBuffer());
  if(!chunk.length||chunk.length>512*1024)return json(413,{error:'한 번에 512KB 이하로 나누어 올려 주세요.'});
  const db=await store(),doneKey=`upload-done:${uploadId}:${slug}`;
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
