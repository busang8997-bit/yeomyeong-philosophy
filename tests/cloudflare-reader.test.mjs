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

class TestBucket {
  values=new Map();
  async put(key,value,options={}){this.values.set(key,{bytes:new Uint8Array(value),customMetadata:options.customMetadata||{}});}
  async head(key){const item=this.values.get(key);return item?{size:item.bytes.length,customMetadata:item.customMetadata}:null;}
  async get(key,options={}){
    const item=this.values.get(key);if(!item)return null;
    let bytes=item.bytes;
    if(options.range)bytes=bytes.slice(options.range.offset,options.range.offset+options.range.length);
    return {size:bytes.length,body:new Blob([bytes]).stream(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }
  async delete(key){this.values.delete(key);}
}

function adminCookie(secret,login='operator'){
  const payload=Buffer.from(JSON.stringify({login,exp:Date.now()+3600000})).toString('base64url');
  const signature=createHmac('sha256',secret).update(payload).digest('base64url');
  return `ym_admin_session=${payload}.${signature}`;
}

test('Cloudflare Pages API keeps PDF files private and serves a purchase-authorized range',async()=>{
  const env={DB:new TestDB(),PDF_BUCKET:new TestBucket(),READER_UPLOAD_KEY:'test-reader-key'};
  const session=await onRequest({request:new Request('https://stage.example/api/reader?mode=session'),env});
  assert.equal(session.status,200);
  const initial=await session.json();
  assert.equal(initial.books.length,5);
  assert.ok(initial.books.every(book=>!book.allowed));

  const book=initial.books[0],readerId='a'.repeat(64),hash=createHash('sha256').update(readerId).digest('hex');
  const uploadUrl=`https://stage.example/api/reader?mode=upload&book=${book.slug}&upload=${'b'.repeat(32)}&part=0&parts=1`;
  const uploaded=await onRequest({request:new Request(uploadUrl,{method:'POST',headers:{cookie:adminCookie(env.READER_UPLOAD_KEY),'content-type':'application/octet-stream'},body:'%PDF-1.4\ntest ebook'}),env});
  assert.equal(uploaded.status,200);
  assert.equal((await uploaded.json()).complete,true);

  const denied=await onRequest({request:new Request(`https://stage.example/api/reader?mode=pdf&book=${book.slug}`,{headers:{cookie:`ym_reader_id=${readerId}`,range:'bytes=0-7'}}),env});
  assert.equal(denied.status,403);

  const expiresAt=Date.now()+60_000;
  await env.DB.prepare('INSERT INTO app_kv(key,value) VALUES(?,?)').bind(`entitlement:${hash}:${book.slug}`,JSON.stringify({payments:[{paymentId:'payment-test',paidAt:Date.now(),expiresAt,refunded:false}]})).run();
  const allowed=await onRequest({request:new Request(`https://stage.example/api/reader?mode=pdf&book=${book.slug}`,{headers:{cookie:`ym_reader_id=${readerId}`,range:'bytes=0-7'}}),env});
  assert.equal(allowed.status,206);
  assert.equal(await allowed.text(),'%PDF-1.4');
});
