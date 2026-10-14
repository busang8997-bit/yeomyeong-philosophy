import {createHmac,createHash,timingSafeEqual} from 'node:crypto';

export const ACCESS_MS=90*24*60*60*1000;
export const MAX_CLOCK_SKEW_SECONDS=300;
export const READER_BOOKS=Object.freeze([
  'book-saju-story','book-wangchobo','book-jireumgil','book-jireumgil-middle','book-jireumgil-lower'
]);

export function hashReaderId(readerId){
  if(typeof readerId!=='string'||!/^[a-f0-9]{64}$/.test(readerId))return '';
  return createHash('sha256').update(readerId).digest('hex');
}

export function parseGrobleSignature(signatureHeader,timestampHeader=''){
  if(typeof signatureHeader!=='string')return null;
  // Current Groble webhooks send the signature and Unix timestamp separately.
  if(timestampHeader){
    if(!/^\d{10}$/.test(String(timestampHeader))||!/^[a-f0-9]{64}$/i.test(signatureHeader))return null;
    return {timestamp:Number(timestampHeader),signature:signatureHeader.toLowerCase()};
  }
  // Continue accepting the legacy combined header during endpoint migration.
  const values=Object.fromEntries(signatureHeader.split(',').map(part=>part.trim().split('=',2)));
  if(!/^\d{10}$/.test(values.t||'')||!/^[a-f0-9]{64}$/i.test(values.v1||''))return null;
  return {timestamp:Number(values.t),signature:values.v1.toLowerCase()};
}

export function verifyGrobleSignature(rawBody,header,secret,nowMs=Date.now(),timestampHeader=''){
  if(!secret||typeof rawBody!=='string')return false;
  const parsed=parseGrobleSignature(header,timestampHeader);
  if(!parsed||Math.abs(Math.floor(nowMs/1000)-parsed.timestamp)>MAX_CLOCK_SKEW_SECONDS)return false;
  const expected=createHmac('sha256',secret).update(`${parsed.timestamp}.${rawBody}`).digest();
  const actual=Buffer.from(parsed.signature,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function grantAccess(previous,paymentId,paidAt){
  const grants=Array.isArray(previous?.payments)?previous.payments:[];
  if(grants.some(item=>item.paymentId===paymentId))return previous;
  const start=Math.max(Number(paidAt)||Date.now(),...grants.filter(item=>!item.refunded).map(item=>Number(item.expiresAt)||0));
  return {payments:[...grants,{paymentId,paidAt:Number(paidAt)||Date.now(),expiresAt:start+ACCESS_MS,refunded:false}]};
}

export function revokePayment(previous,paymentId){
  if(!previous||!Array.isArray(previous.payments))return previous;
  return {payments:previous.payments.map(item=>item.paymentId===paymentId?{...item,refunded:true}:item)};
}

export function accessState(entitlement,nowMs=Date.now()){
  const active=(entitlement?.payments||[]).filter(item=>!item.refunded&&Number(item.expiresAt)>nowMs);
  return {allowed:active.length>0,expiresAt:active.length?Math.max(...active.map(item=>Number(item.expiresAt))):null};
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
