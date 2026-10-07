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
function cover(b,big=false,link=''){const tag=link?'a':'div';return `<${tag} class="cover${big?' big':''}"${link?` href="${url(link)}"`:''} style="background:${color(b.color)}">${b.image?`<img src="${url(b.image)}" alt="${esc(b.title)} 표지" style="max-width:100%;height:auto;object-fit:contain" loading="lazy">`:`<div class="ct">${esc(b.title)}</div>`}</${tag}>`;}
function book(b){return `<article class="book">${cover(b,false,b.slug+'.html')}<div class="bookbody"><a class="booktitle" href="${esc(b.slug)}.html">${esc(b.title)}</a><div class="author">${esc(b.author)}</div><p class="desc">${esc(b.description)}</p><span class="status ${b.status==='출간'?'done':'soon'}">${esc(b.status)}</span>${meta(b)?`<p>${meta(b)}</p>`:''}${b.price?`<p>${esc(b.price)}</p>`:''}<div class="row"><a class="btn btn-line btn-sm" href="${esc(b.slug)}.html">자세히 보기</a></div></div></article>`;}
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
 const out=path.join(root,'dist');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
 for(const dir of ['assets','admin'])if(fs.existsSync(path.join(root,dir)))fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
 for(const f of fs.readdirSync(root)){if(!f.endsWith('.html')&&/^(?:robots\.txt|sitemap\.xml|manifest\.json|sw\.js|_headers|_redirects|favicon\..*)$/.test(f))fs.copyFileSync(path.join(root,f),path.join(out,f));}
 const render={books:()=>items('books').map(book).join(''),lectures:()=>items('lectures').map(lecture).join(''),programs:()=>items('programs').map(program).join(''),content:r=>items('content').filter(p=>!r.type||p.type===r.type).map(post).join(''),consult:()=>items('consult').map(consult).join(''),questions:()=>items('questions').slice(0,4).map(q=>question(q,items('consult'))).join(''),care_books:()=>items('books').map(careBook).join(''),care_videos:()=>items('books').map(careVideo).join('')};
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
  s=s.replace('</footer>','<div class="wrap" style="padding:12px 0;font-size:16px"><a href="/admin/">관리자</a></div></footer>');
  if(!care)s=s.replace('</head>',`<style id="mobile-reading-size">
@media(max-width:640px){
 body{font-size:24px;line-height:1.75}
 .hero .home-intro,.hero p.lead,.sec-head p,.qcard p.desc,.bookbody .desc,.prog p,.lect ul,.tocbox p,.pillar span,.detail,.postbody p{font-size:24px!important;line-height:1.75}
 .home-fold-title{font-size:30px!important;line-height:1.45}
 .qcard h3,.lect h3,.prog h3,.bookbody .booktitle,.postbody h4,.home-fold-body h3{font-size:28px!important;line-height:1.5}
 .btn,.btn-sm,.home-fold-body .btn,.home-fold-body .btn-sm,.top .nav a,.home-nav-toggle,.search input,.cat{font-size:22px!important;line-height:1.5;min-height:56px}
 .bookbody .author,.bookbody .status,.lect .fmt,.lect .who,.tag,.kicker,.resultbar,.ch-item span,.noticeitem span,.home-fold-hint,.home-fold-body .author,.home-fold-body .fmt,.home-fold-body .status,.home-fold-body .who,footer,footer .fnote,footer .flinks{font-size:20px!important;line-height:1.7}
 .qcard .price,.home-fold-body .price{font-size:24px!important;white-space:normal}
 .row,.qtop,.ltop{flex-wrap:wrap}.row>*{max-width:100%}
 .bookbody,.qcard,.lect,.prog,.postbody{overflow-wrap:anywhere;min-width:0}
}
</style></head>`);
  return s;
 }
 function save(f,s){fs.writeFileSync(path.join(out,f),s);}
 for(const file of staticFiles){
  if(!care&&oldDetails.includes(file))continue;
  let s=read(file);for(const r of regions.filter(r=>r.file===file)){if(!s.includes(r.old))throw Error('화면 연결 영역 불일치: '+file+' '+r.kind);s=s.replace(r.old,r.old.match(/^<[^>]+>/)[0]+render[r.kind](r)+'</div>');}
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
  save(file,applySettings(s,file));
 }
 if(!care){
  const shell=read('cms/detail-shell.html');
  for(const b of items('books')){
   const main=`<main><section class="block" style="padding-top:40px"><div class="wrap"><div class="detailgrid">${cover(b,true)}<div><p class="kicker">${esc(b.status)}</p><h1>${esc(b.title)}</h1><p>${esc(b.author)}</p><p>${esc(b.description)}</p>${meta(b)?`<p>${meta(b)}</p>`:''}${b.price?`<p>${esc(b.price)}</p>`:''}<div class="row">${action(b.purchase_url,'구매 안내','btn btn-accent')}<a class="btn btn-line" href="books.html">도서 목록으로</a></div>${b.video_url?`<p>${action(b.video_url,'영상 보기')}</p>`:''}${b.toc?`<details><summary>목차</summary><p style="white-space:pre-line">${esc(b.toc)}</p></details>`:''}</div></div></div></section></main>`;
   save(b.slug+'.html',applySettings(detailSEO(shell.replace('<!--CMS_DETAIL-->',main),b.title,b.description,settings.site_title),b.slug+'.html'));
  }
  for(const l of items('lectures')){
   const main=`<main><section class="block" style="padding-top:40px"><div class="wrap"><h1>${esc(l.title)}</h1><p>${esc(l.audience)}</p><p>${esc(l.format)}</p>${l.description?`<p>${esc(l.description)}</p>`:''}<article class="lect"><h3>주요 내용</h3><ul>${String(l.bullets||'').split('\n').filter(Boolean).map(v=>`<li>${esc(v)}</li>`).join('')}</ul>${l.price?`<p>${esc(l.price)}</p>`:''}<div class="row">${action(l.link,'강의 신청')}<a class="btn btn-line" href="lectures.html">강의 목록으로</a></div>${l.video_url?`<p>${action(l.video_url,'공개 영상 보기')}</p>`:''}</article></div></section></main>`;
   save(l.slug+'.html',applySettings(detailSEO(shell.replace('<!--CMS_DETAIL-->',main),l.title,l.description||l.audience,settings.site_title).replace('aria-current="page" href="books.html"','href="books.html"').replace('href="lectures.html"','href="lectures.html" aria-current="page"'),l.slug+'.html'));
  }
 }
 const domain=config.site_url;
 const html=fs.readdirSync(out).filter(f=>f.endsWith('.html')).sort();
 save('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${html.map(f=>`<url><loc>${esc(domain+'/'+(f==='index.html'?'':f))}</loc></url>`).join('')}</urlset>`);
 save('robots.txt',`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${domain}/sitemap.xml\n`);
 if(fs.existsSync(path.join(out,'sw.js'))){let s=fs.readFileSync(path.join(out,'sw.js'),'utf8');s=s.replace("if (url.origin !== self.location.origin) return;","if (url.origin !== self.location.origin || url.pathname.startsWith('/admin/')) return;");save('sw.js',s);}
 return {root,out,pages:html.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(build()));
