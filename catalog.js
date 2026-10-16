// 공개 도서 목록과 홈 시리즈 카드는 D1 운영 카탈로그(/api/reader?mode=catalog)를 기준으로 그린다.
// 출간 예정 도서는 빌드 때 만든 별도 영역에 두고, D1에 공개된 같은 도서는 그 영역에서 뺀다.
const list=document.querySelector('#runtime-catalog'),home=document.querySelector('#home-catalog'),summary=document.querySelector('#library-summary');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hasGrobleCheckout=value=>{try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='groble.im'||url.hostname.endsWith('.groble.im'));}catch{return false;}};
const isYouTube=value=>{try{const url=new URL(value);return url.protocol==='https:'&&(/(^|\.)youtube\.com$/.test(url.hostname)||url.hostname==='youtu.be');}catch{return false;}};
const isForSale=book=>book.status==='판매중'&&hasGrobleCheckout(book.purchase_url);
const bookStatus=book=>isForSale(book)?'90일 열람 판매중':'판매 준비 중';
const price=book=>book.price?`<p class="book-price">${book.regular_price?`<del>정가 ${esc(book.regular_price)}</del> `:''}<strong>90일 열람 ${esc(book.price)}</strong></p>`:'';
const staticPages=new Set(String(list?.dataset.detailPages||'').split(' ').filter(Boolean));
// 빌드 때 상세 페이지가 만들어진 책은 그 페이지로, /admin/에서 새로 추가한 책은 공용 상세 페이지로 보낸다.
const detailURL=book=>staticPages.has(book.slug)?`${encodeURIComponent(book.slug)}.html`:`book.html?book=${encodeURIComponent(book.slug)}`;
function groups(books){const map=new Map();for(const book of books){const series=book.series||'기타 전자책';if(!map.has(series))map.set(series,[]);map.get(series).push(book);}return [...map];}
function card(book){
 const href=detailURL(book);
 const cover=book.cover?`<a class="cover" href="${href}"><img src="${esc(book.cover)}" alt="${esc(book.title)} 표지" loading="lazy"></a>`:`<a class="cover cover-text" href="${href}"><div class="ct">${esc(book.title)}</div></a>`;
 return `<article class="book">${cover}<div class="bookbody"><a class="booktitle" href="${href}">${esc(book.title)}</a><div class="author">${esc(book.author||'이부상 지음')}</div><span class="status ${isForSale(book)?'done':'soon'}">${esc(bookStatus(book))}</span>${price(book)}${book.description?`<p class="desc">${esc(book.description)}</p>`:''}</div><div class="row book-actions"><a class="btn ${isForSale(book)?'btn-accent':'btn-line'}" href="${href}">${isForSale(book)?'상세 보기·구매':'자세히 보기'}</a></div></article>`;
}
function hideUpcoming(books){
 const published=new Set(books.map(book=>book.slug));
 for(const item of document.querySelectorAll('[data-upcoming-slug]'))if(published.has(item.dataset.upcomingSlug))item.remove();
 for(const section of document.querySelectorAll('[data-upcoming]'))if(!section.querySelector('[data-upcoming-slug]'))section.hidden=true;
 return document.querySelectorAll('[data-upcoming-slug]').length;
}
async function load(){
 if(!list&&!home)return;
 try{
  const response=await fetch('/api/reader?mode=catalog',{cache:'no-store'}),data=await response.json();
  if(!response.ok||!Array.isArray(data.books))throw Error();
  const shelves=groups(data.books),upcoming=hideUpcoming(data.books);
  if(list)list.innerHTML=shelves.map(([series,books],index)=>`<details id="shelf-${index+1}" class="library-shelf" open><summary><span>${esc(series)}</span><span class="shelf-count">${books.length}권</span></summary><div class="books">${books.map(card).join('')}</div></details>`).join('')||'<p>현재 공개된 전자책이 없습니다.</p>';
  if(summary)summary.textContent=`공개 전자책 ${data.books.length}권 · 판매 중 ${data.books.filter(isForSale).length}권${upcoming?` · 출간 예정 ${upcoming}권`:''}`;
  // 홈 카드의 #shelf-N 번호는 위 도서 목록과 같은 순서로 만든다.
  if(home)home.innerHTML=shelves.map(([series,books],index)=>`<a class="sales-series-card" href="books.html#shelf-${index+1}"><h3>${esc(series)}</h3><p>${books.length}권 · 판매 중 ${books.filter(isForSale).length}권</p><span>도서 보기 →</span></a>`).join('')||'<p>현재 공개된 전자책이 없습니다.</p>';
  const samples=document.querySelector('#library-samples'),box=document.querySelector('#runtime-samples');
  if(samples&&box){
   const known=new Set([...box.querySelectorAll('a[href]')].map(a=>a.href));
   const fresh=data.books.filter(book=>isYouTube(book.video_url)&&!known.has(new URL(book.video_url).href));
   box.insertAdjacentHTML('beforeend',fresh.map(book=>`<article class="lect"><h3>${esc(book.title)}</h3>${book.author?`<p>${esc(book.author)}</p>`:''}<a class="btn btn-line" href="${esc(book.video_url)}" target="_blank" rel="noopener noreferrer">유튜브 샘플강의 보기</a></article>`).join(''));
   samples.hidden=box.children.length===0;
  }
  if(list&&location.hash)document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({block:'start'});
 }catch{
  if(list)list.innerHTML='<p>도서 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
  if(home)home.innerHTML='<p>전자책 목록을 불러오지 못했습니다. <a href="books.html">전자책 목록</a>에서 다시 확인해 주세요.</p>';
 }
}
load();
