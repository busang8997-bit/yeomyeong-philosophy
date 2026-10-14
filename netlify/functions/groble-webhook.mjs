import {getStore} from '@netlify/blobs';
import {accessState,grantAccess,revokePayment,verifyGrobleSignature} from './_shared/reader-core.mjs';
import catalog from './_shared/catalog.json' with {type:'json'};
import readerConfig from './_shared/reader-config.json' with {type:'json'};

const store=()=>getStore({name:readerConfig.storeName,consistency:'strong'});
const reply=(status,body)=>Response.json(body,{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const amountOf=object=>[object.pricing?.finalAmount,object.amount,object.totalAmount,object.total_amount,object.price].map(Number).find(Number.isFinite);

export default async function handler(request){
  if(request.method!=='POST')return reply(405,{ok:false});
  const raw=await request.text(),signature=request.headers.get('x-groble-signature'),timestamp=request.headers.get('x-groble-timestamp');
  if(!verifyGrobleSignature(raw,signature,process.env.GROBLE_WEBHOOK_SECRET,Date.now(),timestamp))return reply(401,{ok:false,error:'invalid_signature'});
  let payload;try{payload=JSON.parse(raw);}catch{return reply(400,{ok:false,error:'invalid_json'});}
  const type=payload.type||payload.event;
  const object=payload.data?.object||payload.data||payload.object||{};
  const paymentId=String(object.merchantUid||object.id||object.paymentId||object.payment_id||'');
  if(!paymentId)return reply(400,{ok:false,error:'missing_payment_id'});
  try{
    const db=await store();
    let products=await db.get('reader:catalog',{type:'json'});
    if(!Array.isArray(products)){products=catalog;await db.setJSON('reader:catalog',products);}
    if(type==='payment.completed'){
      const reference=String(object.sellerReference||object.seller_reference||'');
      if(!/^[a-f0-9]{64}$/.test(reference))return reply(400,{ok:false,error:'missing_seller_reference'});
      const intent=await db.get(`checkout:${reference}`,{type:'json'});
      if(!intent||intent.status!=='pending'||intent.expiresAt<Date.now())return reply(404,{ok:false,error:'checkout_not_found'});
      const book=products.find(item=>item.slug===intent.book),amount=amountOf(object);
      if(!book||book.status!=='판매중'||(Number.isFinite(amount)&&amount!==intent.expectedAmount))return reply(400,{ok:false,error:'product_mismatch'});
      const paymentKey=`payment:${paymentId}`,prior=await db.get(paymentKey,{type:'json'});
      if(prior)return reply(200,{ok:true,duplicate:true});
      const key=`entitlement:${intent.readerHash}:${intent.book}`;
      const entitlement=grantAccess(await db.get(key,{type:'json'}),paymentId,Date.now());
      await db.setJSON(key,entitlement);
      await db.setJSON(paymentKey,{readerHash:intent.readerHash,book:intent.book,createdAt:Date.now()});
      await db.setJSON(`checkout:${reference}`,{...intent,status:'paid',paymentId});
      return reply(200,{ok:true,access:accessState(entitlement).allowed});
    }
    if(type==='payment.refunded'){
      const payment=await db.get(`payment:${paymentId}`,{type:'json'});
      if(!payment)return reply(200,{ok:true,ignored:true});
      const key=`entitlement:${payment.readerHash}:${payment.book}`;
      const entitlement=revokePayment(await db.get(key,{type:'json'}),paymentId);
      await db.setJSON(key,entitlement);
      return reply(200,{ok:true,access:accessState(entitlement).allowed});
    }
    return reply(200,{ok:true,ignored:true});
  }catch(error){console.error('Groble webhook error',error);return reply(503,{ok:false,error:'storage_unavailable'});}
}
