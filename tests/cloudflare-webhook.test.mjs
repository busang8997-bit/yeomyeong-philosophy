import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {onRequest} from '../functions/api/groble-webhook.js';

class TestDB {
  values=new Map();
  prepare(sql){
    return {bind:(...args)=>({
      first:async()=>sql.startsWith('SELECT')?(this.values.has(args[0])?{value:this.values.get(args[0])}:null):null,
      run:async()=>{if(sql.startsWith('DELETE'))this.values.delete(args[0]);else this.values.set(args[0],args[1]);return {success:true};}
    })};
  }
  async set(key,value){await this.prepare('INSERT INTO app_kv').bind(key,JSON.stringify(value)).run();}
  async get(key){const row=await this.prepare('SELECT value').bind(key).first();return row?JSON.parse(row.value):null;}
}

function signedRequest(secret,event,now=Date.now()){
  const timestamp=String(Math.floor(now/1000)),raw=JSON.stringify(event);
  const signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
  return new Request('https://stage.example/api/groble-webhook',{method:'POST',headers:{'x-groble-timestamp':timestamp,'x-groble-signature':signature},body:raw});
}

test('Groble Cloudflare webhook records a 90-day grant and revokes it after refund',async()=>{
  const now=Date.now(),secret='webhook-secret',db=new TestDB(),env={DB:db,GROBLE_WEBHOOK_SECRET:secret};
  const book='book-saju-story',readerHash='a'.repeat(64),ref='b'.repeat(64),paymentId='merchant-payment-001';
  await db.set(`reader:catalog`,[{slug:book,title:'사주 교양서',published:true,status:'판매중',price:'8,000원'}]);
  await db.set(`checkout:${ref}`,{readerHash,book,expectedAmount:8000,createdAt:now,expiresAt:now+3600000,status:'pending'});
  const completed={type:'payment.completed',data:{object:{merchantUid:paymentId,sellerReference:ref,pricing:{finalAmount:8000}}}};
  assert.equal((await onRequest({request:signedRequest(secret,completed,now),env})).status,200);
  const key=`entitlement:${readerHash}:${book}`;
  const granted=await db.get(key);
  assert.equal(granted.payments[0].refunded,false);
  assert.equal(granted.payments[0].expiresAt-granted.payments[0].paidAt,90*24*60*60*1000);

  const refunded={type:'payment.refunded',data:{object:{merchantUid:paymentId}}};
  assert.equal((await onRequest({request:signedRequest(secret,refunded,now),env})).status,200);
  assert.equal((await db.get(key)).payments[0].refunded,true);
});
