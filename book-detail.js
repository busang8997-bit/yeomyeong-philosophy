// 도서 상세의 가격·판매 상태·구매/열람 버튼을 D1 운영 카탈로그와 열람 세션으로 채운다.
// 구매는 열람실과 같은 /api/reader?mode=checkout 경로를 쓰고, 열람 권한 판단은 서버(열람실)가 그대로 한다.
const offer=document.querySelector('#book-offer');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(mode,book='')=>`/api/reader?mode=${encodeURIComponent(mode)}${book?`&book=${encodeURIComponent(book)}`:''}`;
const generic=document.querySelector('#book-generic');
const slug=generic?new URLSearchParams(location.search).get('book')||'':offer?.dataset.book||'';
const body=offer?.querySelector('[data-offer-body]');
const readerURL=`reader.html?book=${encodeURIComponent(slug)}`;
async function getJSON(mode){const response=await fetch(api(mode),{cache:'no-store',credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.error||'');return data;}
function fillGeneric(book){
 // /admin/에서 추가해 정적 상세 페이지가 없는 책은 카탈로그 값으로 상세를 채운다.
 document.title=`${book.title} · 여명철학`;
 generic.querySelector('[data-title]').textContent=book.title;
 generic.querySelector('[data-series]').textContent=book.series||'';
 generic.querySelector('[data-author]').textContent=book.author||'';
 generic.querySelector('[data-description]').textContent=book.description||'책 소개 등록 예정';
 generic.querySelector('[data-reader-link]').href=readerURL;
 const cover=generic.querySelector('[data-cover]');
 if(book.cover){const img=document.createElement('img');img.src=book.cover;img.alt=`${book.title} 표지`;cover.replaceChildren(img);cover.classList.remove('cover-text');}
 else cover.querySelector('[data-title-cover]').textContent=book.title;
 if(book.video_url){const sample=generic.querySelector('[data-sample]'),link=document.createElement('a');link.className='btn btn-accent';link.href=book.video_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='유튜브 샘플강의 보기';sample.append(link);sample.hidden=false;}
}
async function load(){
 if(!offer||!body)return;
 if(!slug){body.innerHTML='<p>도서를 찾을 수 없습니다. <a href="books.html">전자책 목록</a>에서 다시 선택해 주세요.</p>';return;}
 let book;
 try{book=(await getJSON('catalog')).books.find(item=>item.slug===slug);}
 catch{body.innerHTML='<p>가격 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';return;}
 if(!book){
  if(generic){generic.querySelector('[data-title]').textContent='도서를 찾을 수 없습니다';}
  body.innerHTML=generic?'<p><a href="books.html">전자책 목록</a>에서 다시 선택해 주세요.</p>':'<p>출간 준비 중인 도서입니다. 출간되면 전자책 목록에 추가합니다.</p>';
  offer.querySelector('.detail-reader-link')?.remove();return;
 }
 if(generic)fillGeneric(book);
 // 판매 가능 여부(PDF 등록 포함)와 열람권은 열람실과 같은 세션 응답을 기준으로 한다.
 let access=null;try{access=(await getJSON('session')).books.find(item=>item.slug===slug)||null;}catch{}
 const price=book.price?`<p class="book-price">${book.regular_price?`<del>정가 ${esc(book.regular_price)}</del>`:''}<strong>90일 열람 ${esc(book.price)}</strong></p>`:'';
 let status,actions='';
 if(access?.allowed){
  status=`열람권 보유 · ${new Date(access.expires_at).toLocaleDateString('ko-KR')}까지`;
  actions=`<a class="btn btn-accent" href="${readerURL}">전자책 열람하기</a>`;
 }else if(access?.can_buy){
  status='90일 열람 판매중';
  actions=`<a class="btn btn-accent" href="${api('checkout',slug)}">그로블에서 90일 열람권 구매</a>`;
 }else status=access?'판매 준비 중':'판매 상태를 확인하지 못했습니다';
 body.innerHTML=`<p class="detail-status"><span class="status ${access?.allowed||access?.can_buy?'done':'soon'}">${esc(status)}</span></p>${price}${actions?`<div class="row">${actions}</div>`:''}${access?.can_buy&&!access?.allowed?'<p class="detail-note">결제한 브라우저에서 결제 완료 후 90일 동안 열람할 수 있습니다.</p>':''}`;
 if(access?.allowed)offer.querySelector('.detail-reader-link')?.remove();
}
load();
