const root=document.querySelector('#runtime-catalog');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>value?`<p class="book-price">${value.regular_price?`<del>정가 ${esc(value.regular_price)}</del> `:''}<strong>90일 열람 ${esc(value.price||'가격 준비중')}</strong></p>`:'';
const hasGrobleCheckout=value=>{try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='groble.im'||url.hostname.endsWith('.groble.im'));}catch{return false;}};
const isForSale=book=>book.status==='판매중'&&hasGrobleCheckout(book.purchase_url);
const bookStatus=book=>isForSale(book)?'90일 열람 판매중':book.published?'출간 · 판매 준비 중':'출간 준비 중';
const bookAction=book=>isForSale(book)?`<a class="btn btn-line btn-sm" href="/reader.html?book=${encodeURIComponent(book.slug)}">90일 열람 구매하기</a>`:'<span class="book-unavailable" role="status">판매 준비 중</span>';
async function load(){
 if(!root)return;
 try{
  const response=await fetch('/api/reader?mode=catalog',{cache:'no-store'}),data=await response.json();
  if(!response.ok||!Array.isArray(data.books))throw Error();
  const groups=new Map();for(const book of data.books){const series=book.series||'기타 전자책';if(!groups.has(series))groups.set(series,[]);groups.get(series).push(book);}
  root.innerHTML=[...groups].map(([series,books],index)=>`<details id="shelf-${index+1}" class="library-shelf" open><summary><span>${esc(series)}</span><span class="shelf-count">${books.length}권</span></summary><div class="books">${books.map(book=>`<article class="book">${book.cover?`<a class="cover" href="/reader.html?book=${encodeURIComponent(book.slug)}"><img src="${esc(book.cover)}" alt="${esc(book.title)} 표지" loading="lazy"></a>`:`<a class="cover cover-text" href="/reader.html?book=${encodeURIComponent(book.slug)}"><div class="ct">${esc(book.title)}</div></a>`}<div class="bookbody"><a class="booktitle" href="/reader.html?book=${encodeURIComponent(book.slug)}">${esc(book.title)}</a><div class="author">${esc(book.author||'이부상 지음')}</div>${book.description?`<p class="desc">${esc(book.description)}</p>`:''}<span class="status ${isForSale(book)?'done':'soon'}">${esc(bookStatus(book))}</span>${money(book)}${book.video_url?`<p><a class="btn btn-line btn-sm" href="${esc(book.video_url)}" target="_blank" rel="noopener noreferrer">YouTube 샘플강의 보기</a></p>`:''}<div class="row">${bookAction(book)}</div></div></article>`).join('')}</div></details>`).join('')||'<p>현재 공개된 전자책이 없습니다.</p>';
 }catch{root.innerHTML='<p>도서 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';}
}
load();
