import {createHmac,timingSafeEqual} from 'node:crypto';

const COOKIE='ym_admin_session';
const json=(status,data,more={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private',...more}});
function signed(value,secret){return createHmac('sha256',secret).update(value).digest('base64url');}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);}
export async function onRequestPost({request,env}){
  const secret=String(env.READER_UPLOAD_KEY||'');
  if(!secret)return json(503,{error:'관리자 비밀번호가 이 배포에 적용되지 않았습니다. 설정 후 다시 배포해야 적용됩니다.'});
  const body=await request.json().catch(()=>({}));
  if(!safeEqual(body.password,secret))return json(401,{error:'관리자 비밀번호가 맞지 않습니다.'});
  const maxAge=7*24*60*60;
  const payload=Buffer.from(JSON.stringify({login:'operator',exp:Date.now()+maxAge*1000})).toString('base64url');
  const token=`${payload}.${signed(payload,secret)}`;
  return json(200,{ok:true},{'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`});
}
