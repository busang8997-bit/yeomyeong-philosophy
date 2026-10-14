import {accessState,grantAccess,revokePayment,verifyGrobleSignature} from '../../netlify/functions/_shared/reader-core.mjs';
import {readJSON,writeJSON} from './_shared/d1-store.js';
import {defaultCatalog} from './_shared/default-catalog.js';

const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const amountOf=object=>[object.pricing?.finalAmount,object.amount,object.totalAmount,object.total_amount,object.price].map(Number).find(Number.isFinite);
async function catalogFor(env){let rows=await readJSON(env.DB,'reader:catalog');if(!Array.isArray(rows)){rows=defaultCatalog;await writeJSON(env.DB,'reader:catalog',rows);}return rows;}

export async function onRequest({request,env}){
  if(request.method!=='POST')return reply(405,{ok:false});
  const raw=await request.text(),signature=request.headers.get('x-groble-signature'),timestamp=request.headers.get('x-groble-timestamp');
  if(!verifyGrobleSignature(raw,signature,env.GROBLE_WEBHOOK_SECRET,Date.now(),timestamp))return reply(401,{ok:false,error:'invalid_signature'});
  let payload;try{payload=JSON.parse(raw);}catch{return reply(400,{ok:false,error:'invalid_json'});}
  const type=payload.type||payload.event,eventId=String(payload.id||''),object=payload.data?.object||payload.data||payload.object||{};
  if(/^evt_test_/i.test(eventId))return reply(200,{ok:true,test:true,eventId,type});
  const paymentId=String(object.merchantUid||object.id||object.paymentId||object.payment_id||'');
  if(!paymentId)return reply(400,{ok:false,error:'missing_payment_id'});
  try{
    const books=await catalogFor(env);
    if(type==='payment.completed'){
      const ref=String(object.sellerReference||object.seller_reference||'');if(!/^[a-f0-9]{64}$/.test(ref))return reply(400,{ok:false,error:'missing_seller_reference'});
      const intent=await readJSON(env.DB,`checkout:${ref}`);if(!intent||intent.status!=='pending'||intent.expiresAt<Date.now())return reply(404,{ok:false,error:'checkout_not_found'});
      const book=books.find(item=>item.slug===intent.book),amount=amountOf(object);if(!book||book.status!=='판매중'||(Number.isFinite(amount)&&amount!==intent.expectedAmount))return reply(400,{ok:false,error:'product_mismatch'});
      const paymentKey=`payment:${paymentId}`;if(await readJSON(env.DB,paymentKey))return reply(200,{ok:true,duplicate:true});
      const key=`entitlement:${intent.readerHash}:${intent.book}`,entitlement=grantAccess(await readJSON(env.DB,key),paymentId,Date.now());
      await writeJSON(env.DB,key,entitlement);await writeJSON(env.DB,paymentKey,{readerHash:intent.readerHash,book:intent.book,createdAt:Date.now()});
      await writeJSON(env.DB,`checkout:${ref}`,{...intent,status:'paid',paymentId});return reply(200,{ok:true,access:accessState(entitlement).allowed});
    }
    if(type==='payment.refunded'){
      const payment=await readJSON(env.DB,`payment:${paymentId}`);if(!payment)return reply(200,{ok:true,ignored:true});
      const key=`entitlement:${payment.readerHash}:${payment.book}`,entitlement=revokePayment(await readJSON(env.DB,key),paymentId);await writeJSON(env.DB,key,entitlement);
      return reply(200,{ok:true,access:accessState(entitlement).allowed});
    }
    return reply(200,{ok:true,ignored:true});
  }catch(error){console.error('Cloudflare Groble webhook error',error);return reply(503,{ok:false,error:'storage_unavailable'});}
}
