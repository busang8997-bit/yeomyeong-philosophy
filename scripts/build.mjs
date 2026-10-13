import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(value){
 const s=String(value??'').trim(); if(!s)return '';
 if(/^\/?assets\//.test(s)){const decoded=decodeURIComponent(s);if(/[<>"'\\\u0000-\u001f]/.test(decoded)||decoded.split('/').includes('..'))throw Error('이미지 경로 오류');return decoded.split('/').map(encodeURIComponent).join('/');}
 if(/[\u0000-\u0020\\]/.test(s))throw Error('링크에 공백·제어문자가 있습니다');
 if(/^https:\/\//i.test(s)){const u=new URL(s);if(u.username||u.password)throw Error('인증정보가 포함된 링크는 금지됩니다');return s;}
 if(/^mailto:[^<>"'\s]+@[^<>"'\s]+$/.test(s)||/^tel:\+?[0-9-]+$/.test(s))return s;
 if(/^(?:\/?assets\/[a-zA-Z0-9_./-]+|[a-z0-9-]+\.html(?:#[a-zA-Z0-9_-]+)?|#[a-zA-Z0-9_-]+)$/.test(s)&&!s.includes('..'))return s;
 throw Error('허용되지 않은 링크: '+s);
}
const url=s=>esc(safeURL(s));
const color=s=>/^#[0-9a-f]{6}$/i.test(s??'')?s:'#426f52';
const action=(link,label='이용하기',cls='btn btn-accent btn-sm')=>link?`<a class="${cls}" href="${url(link)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:`<span class="${cls}" aria-disabled="true">준비중</span>`;
const meta=x=>[x.topic,x.series].filter(Boolean).map(esc).join(' · ');
function cover(b,big=false,link=''){const tag=link?'a':'div';return `<${tag} class="cover${big?' big':''}${b.image?'':' cover-text'}"${link?` href="${url(link)}"`:''} style="background:${color(b.color)}">${b.image?`<img src="${url(b.image)}" alt="${esc(b.title)} 표지" style="max-width:100%;height:auto;object-fit:contain" loading="lazy">`:`<div class="ct">${esc(b.title)}</div>`}</${tag}>`;}
function book(b){return `<article class="book">${cover(b,false,b.slug+'.html')}<div class="bookbody"><a class="booktitle" href="${esc(b.slug)}.html">${esc(b.title)}</a><div class="author">${esc(b.author)}</div><p class="desc">${esc(b.description)}</p><span class="status ${b.status==='출간'?'done':'soon'}">${esc(b.status)}</span>${meta(b)?`<p>${meta(b)}</p>`:''}${b.price?`<p>${esc(b.price)}</p>`:''}<div class="row"><a class="btn btn-line btn-sm" href="${esc(b.slug)}.html">자세히 보기</a></div></div></article>`;}
function shelves(bs){const groups=new Map();for(const b of bs){const key=b.series||'기타 전자책';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);}return [...groups].map(([name,books],i)=>`<details class="library-shelf" id="shelf-${i+1}"><summary><span>${esc(name)}</span><span class="shelf-count">${books.length}권</span></summary><div class="books">${books.map(book).join('')}</div></details>`).join('');}
function sampleLectures(bs,ls,channel){const videos=[...bs,...ls].filter(v=>v.video_url);return `<section class="library-samples" id="library-samples" aria-label="유튜브 샘플강의"><h2>유튜브 샘플강의</h2><p>전자책과 강의를 선택하기 전에 공개 샘플강의를 살펴보세요. 유료 패키지의 영상 보조강의와는 별도로 제공됩니다.</p>${videos.length?`<div class="lects">${videos.map(v=>`<article class="lect"><h3>${esc(v.title)}</h3>${meta(v)?`<p>${meta(v)}</p>`:''}${action(v.video_url,'유튜브 샘플강의 보기','btn btn-line')}</article>`).join('')}</div>`:'<p>책별 샘플강의 링크는 준비되는 대로 추가합니다.</p>'}${channel?`<p>${action(channel,'여명철학 유튜브 채널 보기','btn btn-line')}</p>`:''}</section>`;}
function productCard(p,bs){return `<article class="prog sales-product"><span class="tag">${esc(p.type)}</span><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><p>${esc(p.period||'이용 기간 준비중')}</p>${p.price?`<p class="price">${esc(p.price)}</p>`:''}<div class="row">${p.status==='판매중'?action(p.purchase_url,'그로블 결제하기'):'<span class="tag">판매 준비중</span>'}<a class="btn btn-line" href="${esc(p.book_slugs[0])}.html">상품 자세히 보기</a></div></article>`;}
function packagePage(){return `<main><section class="block"><div class="wrap"><div class="sec-head"><h1>전자책 단독 열람</h1><p>현재는 책별 90일 전자책 열람 상품을 준비하고 있습니다.</p></div><p>영상보조강의 패키지는 자료 준비 후 추가합니다. 상품별 가격과 구매 링크는 도서 상세에서 안내할 예정입니다.</p><a class="btn btn-line" href="books.html">전자책 목록 보기</a></div></section></main>`;}
function salesHome(bs){const groups=[...new Set(bs.map(b=>b.series))];return `<main class="sales-home"><section class="hero"><div class="wrap"><p class="sales-kicker">여명철학출판사</p><h1>전자책 90일 열람</h1><p class="home-intro">사주·진로적성·타로 도서를 책별 단독 전자책으로 준비하고 있습니다.</p><div class="row"><a class="btn btn-accent" href="books.html">시리즈별 전자책 보기</a></div></div></section><section class="block"><div class="wrap"><h2>시리즈별 도서</h2><div class="sales-series">${groups.map((g,i)=>`<a class="sales-series-card" href="books.html#shelf-${i+1}"><h3>${esc(g)}</h3><p>${bs.filter(b=>b.series===g).length}권</p><span>도서 보기 →</span></a>`).join('')}</div><p>현재는 단독 전자책 열람 상품부터 준비합니다. 각 책은 90일 열람 방식이며 가격과 결제는 준비 후 안내합니다.</p><p>영상보조강의 패키지는 추후 추가합니다.</p></div></section><section class="block sales-sample-entry"><div class="wrap"><h2>유튜브 샘플강의</h2><p>여명쌤의 공개 강의와 책 소개를 확인할 수 있습니다.</p><a class="btn btn-line" href="books.html#library-samples">샘플 영상 보기</a></div></section></main>`;}
function libraryIntro(info,products,bs){return `<section class="library-intro"><h1>${esc(info.title)}</h1><p>${esc(info.intro)}</p><p class="library-summary">출간 ${bs.filter(b=>b.status==='출간').length}권 · 출간 예정 ${bs.filter(b=>b.status!=='출간').length}권</p></section>`;}
function lecture(l){return `<article class="lect"><div class="ltop"><h3><a href="${esc(l.slug)}.html">${esc(l.title)}</a></h3><span class="who">${esc(l.audience)}</span></div><div class="fmt">${esc(l.format)}</div>${l.description?`<p>${esc(l.description)}</p>`:''}${meta(l)?`<p>${meta(l)}</p>`:''}<div class="row"><a class="btn btn-line btn-sm" href="${esc(l.slug)}.html">자세히 보기</a></div></article>`;}
function program(p){return `<article class="prog${p.featured?' featured':''}"><div class="progicon">${esc(p.icon)}</div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p>${meta(p)?`<p>${meta(p)}</p>`:''}${p.price?`<p>${esc(p.price)}</p>`:''}<div class="row">${action(p.link,'프로그램 보기')}</div></article>`;}
function post(p){return `<article class="post"><div class="thumb" style="background:${color(p.color)}">${p.image?`<img src="${url(p.image)}" alt="${esc(p.title)}" style="width:100%;height:100%;object-fit:contain" loading="lazy">`:`<span>${esc(p.tag)}</span>`}</div><div class="postbody"><h4>${esc(p.title)}</h4>${p.description?`<p>${esc(p.description)}</p>`:''}${meta(p)?`<p>${meta(p)}</p>`:''}${action(p.link,p.type==='video'?'영상 보기':'글 보기','btn btn-line btn-sm')}</div></article>`;}
const method=m=>m==='fast'?'빠른 점단 결과지':'여명쌤 직접 풀이';
function consult(c){return `<article class="qcard" id="c-${esc(c.slug)}"><div class="qtop"><h3>${esc(c.icon)} ${esc(c.name)}</h3><span class="price">${esc(c.price||'가격 문의')}</span></div><p class="desc">${esc(c.desc)}</p><div class="qmeta"><span class="tag method">${method(c.method)}</span></div><div class="row">${action(c.link,'상담 신청')}</div></article>`;}
function question(q,cs){const c=cs.find(c=>c.slug===q.consult);return `<article class="qcard"><div class="qtop"><h3>${esc(q.q)}</h3><span class="price">${esc(q.price||c?.price||'가격 문의')}</span></div><p class="desc">${esc(q.desc)}</p><div class="qmeta"><span class="tag">${esc(q.cat)}</span><span class="tag method">${method(q.method)}</span></div><div class="row"><a class="btn btn-accent btn-sm" href="consult.html#c-${esc(q.consult)}">[${esc(c?.name||'상담')}]으로 신청</a></div></article>`;}
function ytId(s){if(!s)return '';const u=new URL(safeURL(s));if(u.hostname==='youtu.be')return u.pathname.slice(1);if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname))return u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1]||'';return '';}
const money=v=>Number(v).toLocaleString('ko-KR');
function detailSEO(s,title,description,brand){return s.replace(/<title>.*?<\/title>/,`<title>${esc(title)} · ${esc(brand)}</title>`).replace(/<meta\b[^>]*>/g,t=>{if(/(?:name|property)="(?:description|og:description)"/.test(t))return t.replace(/content="[^"]*"/,`content="${esc(description)}"`);if(/property="og:title"/.test(t))return t.replace(/content="[^"]*"/,`content="${esc(title)} · ${esc(brand)}"`);return t;});}
function careBook(b){return `<article class="product"><div class="product-top"><img class="book-cover" src="${url(b.image)}" alt="${esc(b.title)} 표지" loading="lazy"></div><div class="product-body"><p class="type">PDF 전자책 · ${esc(b.author)}</p><h3>${esc(b.title)}</h3><p class="author">${esc(b.author)}</p><p class="description">${esc(b.description)}</p>${meta(b)?`<p>${meta(b)}</p>`:''}<div class="buy-row"><div class="price"><span class="price-label">전자책</span><strong>${money(b.price)}<span>원</span></strong>${b.paper_price?`<small>종이책 ${money(b.paper_price)}원</small>`:''}</div>${action(b.purchase_url,'전자책 구매하기 ↗','btn')}</div>${b.video_url?action(b.video_url,'저자가 전하는 책 소개 ↗','video-link'):''}</div></article>`;}
function careVideo(b){const id=ytId(b.video_url);if(id&&!/^[\w-]{11}$/.test(id))throw Error('유튜브 영상 ID 오류');return `<article><h3>${esc(b.title)}</h3><p>전자책 ${money(b.price)}원${b.paper_price?` · 종이책 ${money(b.paper_price)}원`:''}</p>${id?`<details class="video-panel"><summary>책 소개 영상 보기</summary><iframe data-src="https://www.youtube-nocookie.com/embed/${esc(id)}?playsinline=1" title="${esc(b.title)} 홍보 영상" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></details>`:''}${b.video_url?action(b.video_url,'유튜브에서 크게 보기 ↗','video-link'):''}</article>`;}

export function build(root=process.cwd()){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const config=JSON.parse(read('admin/config.yml')); const care=config.backend.repo.endsWith('-care');
 const data={};for(const f of fs.readdirSync(path.join(root,'cms/data')))data[f.slice(0,-5)]=JSON.parse(read('cms/data/'+f));
 const items=k=>data[k]?.items||[];
 const settings=data.settings,defaults=JSON.parse(read('cms/default-settings.json'));
 const regions=JSON.parse(read('cms/regions.json'));
 const staticFiles=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
 const oldDetails=staticFiles.filter(f=>f.startsWith('book-')||f.startsWith('lecture-'));
 const seen=new Set();for(const x of [...items('books'),...items('lectures')])if(x.slug){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.slug)||seen.has(x.slug)||staticFiles.includes(x.slug+'.html')&&!oldDetails.includes(x.slug+'.html'))throw Error('페이지 이름 중복·오류: '+x.slug);seen.add(x.slug);}
 if(care){const bookIds=new Set();for(const b of items('books')){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.id)||bookIds.has(b.id))throw Error('책 고유 코드 중복·오류');bookIds.add(b.id);}}
 const ids=new Set();for(const q of items('questions')){if(!Number.isInteger(q.id)||q.id<1||ids.has(q.id))throw Error('질문 고유 번호 중복·오류');ids.add(q.id);if(!items('consult').some(c=>c.slug===q.consult))throw Error('연결 상담 분야가 없습니다: '+q.consult);if(!items('categories').includes(q.cat))throw Error('질문 분류가 없습니다: '+q.cat);}
 const slugs=new Set();for(const c of items('consult')){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)||slugs.has(c.slug))throw Error('상담 코드 중복·오류');slugs.add(c.slug);}
 function validate(o){if(Array.isArray(o))o.forEach(validate);else if(o&&typeof o==='object'){for(const [k,v] of Object.entries(o)){if(['link','image'].includes(k)||k.endsWith('_url'))safeURL(v);if(['price','paper_price'].includes(k)&&typeof v==='number'&&(!Number.isFinite(v)||v<0))throw Error('가격은 0 이상이어야 합니다');validate(v);}}}validate(data);
 if(!care){const productIds=new Set();for(const p of items('products')){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)||productIds.has(p.id))throw Error('상품 코드 중복·오류');productIds.add(p.id);for(const id of p.book_slugs||[])if(!items('books').some(b=>b.slug===id))throw Error('상품에 연결된 도서가 없습니다: '+id);if(p.status==='판매중'&&(!p.purchase_url||!p.period||!p.price))throw Error('판매 상품의 결제 링크·기간·가격이 필요합니다');}}
 const out=path.join(root,'dist');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
 for(const dir of ['assets','admin'])if(fs.existsSync(path.join(root,dir)))fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
 for(const f of fs.readdirSync(root)){if(!f.endsWith('.html')&&/^(?:robots\.txt|sitemap\.xml|manifest\.json|sw\.js|_headers|_redirects|favicon\..*)$/.test(f))fs.copyFileSync(path.join(root,f),path.join(out,f));}
 const render={books:r=>r.file==='books.html'?shelves(items('books')):items('books').map(book).join(''),lectures:()=>items('lectures').map(lecture).join(''),programs:()=>items('programs').map(program).join(''),content:r=>items('content').filter(p=>!r.type||p.type===r.type).map(post).join(''),consult:()=>items('consult').map(consult).join(''),questions:()=>items('questions').slice(0,4).map(q=>question(q,items('consult'))).join(''),care_books:()=>items('books').map(careBook).join(''),care_videos:()=>items('books').map(careVideo).join('')};
 function applySettings(s,file){
  for(const k of ['youtube_url','blog_url','kakao_url'])if(defaults[k]&&settings[k]!==defaults[k])s=s.split(esc(defaults[k])).join(url(settings[k]));
  if(settings.site_title!==defaults.site_title){
   s=s.replace(/(<title>)([\s\S]*?)(<\/title>)/,(_,a,b,c)=>a+b.split(esc(defaults.site_title)).join(esc(settings.site_title))+c);
   s=s.replace(/(<a\b[^>]*class="brand"[^>]*>)([\s\S]*?)(<\/a>)/,(_,a,b,c)=>a+b.split(esc(defaults.site_title)).join(esc(settings.site_title))+c);
  }
  if(file==='index.html'){
   if(settings.home_title!==defaults.home_title)s=s.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/,`$1${esc(settings.home_title)}$2`);
   s=s.replace(/(<meta\b[^>]*name="description"[^>]*content=")[^"]*(")/,`$1${esc(settings.description)}$2`).replace(/(<meta\b[^>]*content=")[^"]*("[^>]*name="description")/,`$1${esc(settings.description)}$2`);
  }
  if(settings.intro!==defaults.intro&&((care&&file==='index.html')||(!care&&file==='about.html'))){
   if(care)s=s.replace(/(<p class="body">)[\s\S]*?(<\/p>)/,`$1${esc(settings.intro)}$2`);
   else s=s.replace('<p>'+esc(defaults.intro)+'</p>','<p>'+esc(settings.intro)+'</p>');
  }
  // 공개 페이지에는 관리자 링크를 넣지 않는다(관리자 화면은 /admin/ 주소로 직접 접속).
  // 글자 크기는 공통 CSS(assets/css/public-v5.css)에서만 관리한다. 빌드가 페이지에 스타일을 끼워 넣지 않는다.
  return s;
 }
 function save(f,s){fs.writeFileSync(path.join(out,f),s);}
 for(const file of staticFiles){
  if(!care&&oldDetails.includes(file))continue;
  let s=read(file);for(const r of regions.filter(r=>r.file===file)){if(!s.includes(r.old))throw Error('화면 연결 영역 불일치: '+file+' '+r.kind);s=s.replace(r.old,r.old.match(/^<[^>]+>/)[0]+render[r.kind](r)+'</div>');}
  if(!care&&file==='books.html'){s=s.replace(/<div class="sec-head">[\s\S]*?<\/div>/,libraryIntro(data.library||{},items('products'),items('books'))).replace('<div class="books">','<div class="library-shelves">');}
  if(file==='ask.html'){
   const json=x=>JSON.stringify(x).replace(/</g,'\\u003c');
   s=s.replace(/const CATS = \[[\s\S]*?\];/,()=>`const CATS = ${json(items('categories'))};`).replace(/const QUESTIONS = \[[\s\S]*?\];/,()=>`const QUESTIONS = ${json(items('questions'))};`).replace(/const CONSULT_BY_SLUG = \{[\s\S]*?\};/,()=>`const CONSULT_BY_SLUG = ${json(Object.fromEntries(items('consult').map(c=>[c.slug,c])))};`);
   s=s.replace('function renderCats()',`const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));\nfunction renderCats()`);
   for(const v of ['c','it.q','priceLabel(it)','it.desc','it.cat','cname'])s=s.split('${'+v+'}').join('${htmlEscape('+v+')}');
  }
  if(file==='index.html'){
   const notice=items('notices').map(n=>`<details><summary>${esc(n.title)}</summary><p style="white-space:pre-line">${esc(n.body)}</p>${n.link?action(n.link,'자세히 보기'):''}</details>`).join('');
   const extra=care&&items('content').length?`<section class="wrap"><h2>시니어 콘텐츠</h2>${items('content').map(c=>`<details><summary>${esc(c.topic)} · ${esc(c.title)}</summary>${c.image?`<img src="${url(c.image)}" alt="${esc(c.title)}" style="max-width:100%">`:''}<p>${esc(c.description)}</p>${action(c.link,'콘텐츠 보기')}</details>`).join('')}</section>`:'';
   if(notice||extra)s=s.replace('</main>',extra+(notice?`<section class="wrap"><h2>공지</h2>${notice}</section>`:'')+'</main>');
   if(care){
    // Existing spotlight/FAQ amounts follow the same book data, without changing copy.
    const originals=JSON.parse(read('cms/default-books.json')).items;
    originals.forEach((b,i)=>{const n=items('books').find(x=>x.id===b.id);const cls=i===0?'book-feature':'patient-promo';const re=new RegExp('<section class="'+cls+'"[^>]*>[\\s\\S]*?<\\/section>');
     s=s.replace(re,section=>!n?'':section.split(esc(b.title)).join(esc(n.title)).split(money(b.price)+'원').join(money(n.price)+'원').split(esc(b.image)).join(url(n.image)));
     if(n)s=s.split(esc(b.image)).join(url(n.image));
    });
    if(JSON.stringify(originals)!==JSON.stringify(items('books')))s=s.replace(/(<summary>지금 전자책을 구매할 수 있나요\?<\/summary>)<p>[\s\S]*?<\/p>/,'$1<p>각 책의 구매 버튼에서 그로블 상품 안내를 확인하실 수 있습니다. '+items('books').map(b=>esc(b.title)+' '+money(b.price)+'원').join(' · ')+'</p>');
   }
  }
  if(!care&&file==='index.html')s=s.replace(/<main\b[\s\S]*?<\/main>/,salesHome(items('books')));
  if(!care&&file==='lectures.html')s=s.replace(/<main\b[\s\S]*?<\/main>/,packagePage());
  if(!care&&file==='books.html'){s=s.replace(/(<div class="library-shelves">)/,'$1');s=s.replace('</main>',`<section class="block"><div class="wrap"><h2>전자책 이용 안내</h2><p>${esc(data.library.sales_note)}</p><p>${esc(data.library.pending_note)}</p>${sampleLectures(items('books'),[],settings.youtube_url)}</div></section></main>`);}
  save(file,applySettings(s,file));
 }
 if(!care){
  const shell=read('cms/detail-shell.html');
  for(const b of items('books')){
   const offers=items('products').filter(p=>(p.book_slugs||[]).includes(b.slug));
   const main=`<main><section class="block"><div class="wrap"><div class="detailgrid">${cover(b,true)}<div><p class="kicker">${esc(b.status)}</p><h1>${esc(b.title)}</h1><p>${esc(b.author)}</p><p>${esc(b.description||'책 소개 등록 예정')}</p><details><summary>목차</summary><p style="white-space:pre-line">${esc(b.toc||'목차 등록 예정')}</p></details><section class="detail-offers"><h2>전자책 단독 열람</h2>${offers.map(p=>`<p class="tag">${esc(p.type)}</p><p>${esc(p.description)}</p><p>${esc(p.period||'이용 기간 준비중')} · ${esc(p.price||'가격 준비중')}</p>${p.status==='판매중'?action(p.purchase_url,'그로블 결제하기'):'<span class="tag">판매 준비중</span>'}`).join('')}</section><section class="detail-sample"><h2>무료 샘플강의</h2>${b.video_url?action(b.video_url,'유튜브 샘플강의 보기'):'<p>샘플강의 링크 등록 예정</p>'}</section><div class="row"><a class="btn btn-line" href="books.html">도서 목록으로</a></div></div></div></div></section></main>`;
   save(b.slug+'.html',applySettings(detailSEO(shell.replace('<!--CMS_DETAIL-->',main),b.title,b.description,settings.site_title),b.slug+'.html'));
  }
  for(const l of items('lectures')){save(l.slug+'.html',applySettings(detailSEO(shell.replace('<!--CMS_DETAIL-->',packagePage()),'전자책＋영상 보조강의','영상 보조강의 포함 전자책 패키지',settings.site_title),l.slug+'.html'));}

 }
 const domain=config.site_url;
 const html=fs.readdirSync(out).filter(f=>f.endsWith('.html')).sort();
 save('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${html.map(f=>`<url><loc>${esc(domain+'/'+(f==='index.html'?'':f))}</loc></url>`).join('')}</urlset>`);
 save('robots.txt',`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${domain}/sitemap.xml\n`);
 if(fs.existsSync(path.join(out,'sw.js'))){let s=fs.readFileSync(path.join(out,'sw.js'),'utf8');s=s.replace("if (url.origin !== self.location.origin) return;","if (url.origin !== self.location.origin || url.pathname.startsWith('/admin/')) return;");save('sw.js',s);}
 return {root,out,pages:html.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(build()));
