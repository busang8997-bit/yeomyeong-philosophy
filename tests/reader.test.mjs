import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {ACCESS_MS,accessState,grantAccess,parseByteRange,revokePayment,verifyGrobleSignature} from '../netlify/functions/_shared/reader-core.mjs';

test('Groble 서명은 본문과 5분 이내의 timestamp를 함께 검증한다',()=>{
  const now=Date.UTC(2026,9,13,12,0,0),timestamp=Math.floor(now/1000),secret='reader-test-secret',body='{"type":"payment.completed"}';
  const digest=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
  assert.equal(verifyGrobleSignature(body,`t=${timestamp},v1=${digest}`,secret,now),true);
  assert.equal(verifyGrobleSignature(body,`t=${timestamp},v1=${digest}`,secret+'x',now),false);
  assert.equal(verifyGrobleSignature(body+' ',`t=${timestamp},v1=${digest}`,secret,now),false);
  assert.equal(verifyGrobleSignature(body,`t=${timestamp-301},v1=${digest}`,secret,now),false);
  assert.equal(verifyGrobleSignature(body,digest,secret,now,String(timestamp)),true);
  assert.equal(verifyGrobleSignature(body,digest,secret,now,String(timestamp-301)),false);
});

test('결제는 책별 90일 권한을 주고 중복 웹훅은 기간을 늘리지 않으며 환불은 회수한다',()=>{
  const paidAt=Date.UTC(2026,9,13),first=grantAccess(null,'pay-1',paidAt);
  assert.deepEqual(accessState(first,paidAt),{allowed:true,expiresAt:paidAt+ACCESS_MS});
  assert.equal(grantAccess(first,'pay-1',paidAt+1000),first);
  const renewed=grantAccess(first,'pay-2',paidAt+ACCESS_MS-1000);
  assert.equal(accessState(renewed,paidAt+ACCESS_MS).allowed,true);
  const refunded=revokePayment(renewed,'pay-2');
  assert.equal(accessState(refunded,paidAt+ACCESS_MS).allowed,false);
  assert.equal(accessState(refunded,paidAt+1000).allowed,true);
  assert.equal(accessState(first,paidAt+ACCESS_MS).allowed,false);
});

test('PDF 열람기는 범위 요청을 512KB 이하로 자른다',()=>{
  assert.deepEqual(parseByteRange('bytes=0-65535',1000000),{start:0,end:65535});
  assert.deepEqual(parseByteRange('bytes=100-999999',1000000),{start:100,end:100+512*1024-1});
  assert.deepEqual(parseByteRange('bytes=-100',1000),{start:900,end:999});
  assert.equal(parseByteRange('bytes=1000-',1000),null);
  assert.equal(parseByteRange('bytes=1-2,5-6',1000),null);
});
