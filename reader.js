import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const $=selector=>document.querySelector(selector);
const select=$('#book-select'),message=$('#access-message'),price=$('#book-price'),openButton=$('#open-book'),buyButton=$('#buy-book'),viewer=$('#viewer');
const canvas=$('#pdf-page'),context=canvas.getContext('2d');
let books=[],selected=null,pdf=null,page=1,scale=1,fit=true,renderTask=null;
const api=(mode,book='')=>`/.netlify/functions/reader?mode=${encodeURIComponent(mode)}${book?`&book=${encodeURIComponent(book)}`:''}`;

function setMessage(text,state=''){message.textContent=text;message.dataset.state=state;}
function setSelected(slug){
  selected=books.find(book=>book.slug===slug)||books[0]||null;
  if(!selected){price.textContent='';openButton.hidden=true;setMessage('출간 도서 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.','error');return;}
  select.value=selected.slug;
  price.textContent=selected.price?`90일 열람 ${selected.price}${selected.regular_price?` (정가 ${selected.regular_price})`:''}`:'';
  viewer.hidden=true;pdf=null;openButton.hidden=!selected.allowed;buyButton.hidden=!selected.can_buy;
  if(selected.allowed){const end=new Date(selected.expires_at).toLocaleDateString('ko-KR');setMessage(`이 책의 열람권이 있습니다. ${end}까지 읽을 수 있습니다.`,'success');}
  else if(selected.can_buy){setMessage('아직 이 책의 열람 권한이 없습니다. 결제 후 같은 브라우저에서 읽을 수 있습니다.');}
  else{setMessage('전자책 결제 연결을 준비하고 있습니다. 도서 목록에서 출시 안내를 확인해 주세요.');}
}

async function loadSession(){
  try{
    const response=await fetch(api('session'),{cache:'no-store',credentials:'same-origin'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'권한을 확인할 수 없습니다.');
    books=data.books||[];select.replaceChildren(...books.map(book=>{const option=document.createElement('option');option.value=book.slug;option.textContent=book.title;return option;}));
    select.disabled=books.length===0;
    const wanted=new URLSearchParams(location.search).get('book');setSelected(books.some(book=>book.slug===wanted)?wanted:books[0]?.slug);
    if(new URLSearchParams(location.search).has('payment'))setMessage('그로블 결제 상태를 확인했습니다. 열람 권한이 반영되기까지 잠시 기다린 뒤 다시 확인해 주세요.');
  }catch(error){setMessage(error.message||'열람 서버에 연결할 수 없습니다.','error');}
}

async function openBook(){
  if(!selected?.allowed)return;
  viewer.hidden=false;openButton.hidden=true;setMessage('전자책을 불러오고 있습니다.');
  try{
    const firstResponse=await fetch(api('pdf',selected.slug),{headers:{Range:'bytes=0-65535'},credentials:'same-origin',cache:'no-store'});
    if(firstResponse.status!==206){let data={};try{data=await firstResponse.json();}catch{}throw new Error(data.error||'전자책 열람 권한을 확인할 수 없습니다.');}
    const total=Number(firstResponse.headers.get('Content-Range')?.split('/').at(-1));
    if(!Number.isSafeInteger(total)||total<1)throw new Error('전자책 파일 정보를 읽을 수 없습니다.');
    const firstData=new Uint8Array(await firstResponse.arrayBuffer());
    class EntitledRangeTransport extends pdfjsLib.PDFDataRangeTransport{
      constructor(){super(total,firstData);this.transportReady();}
      requestDataRange(begin,end){fetch(api('pdf',selected.slug),{headers:{Range:`bytes=${begin}-${end-1}`},credentials:'same-origin',cache:'no-store'}).then(async response=>{if(response.status!==206)throw new Error('열람 권한이 만료되었거나 해제되었습니다.');this.onDataRange(begin,new Uint8Array(await response.arrayBuffer()));}).catch(error=>this.onError(error.message));}
    }
    const task=pdfjsLib.getDocument({range:new EntitledRangeTransport(),rangeChunkSize:65536,disableStream:true,disableAutoFetch:true});
    pdf=await task.promise;$('#page-count').textContent=String(pdf.numPages);page=1;await renderPage();setMessage(`${pdf.numPages}쪽 전자책을 열었습니다.`,'success');
    viewer.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){viewer.hidden=true;openButton.hidden=false;setMessage(error?.message||'전자책 파일을 불러오지 못했습니다.','error');}
}

async function renderPage(){
  if(!pdf)return;
  if(renderTask)renderTask.cancel();
  const current=await pdf.getPage(page);const base=current.getViewport({scale:1});
  const width=Math.max(220,$('.page-stage').clientWidth-24);scale=fit?Math.min(1.8,width/base.width):scale;
  const viewport=current.getViewport({scale});const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=`${Math.floor(viewport.width)}px`;canvas.style.height=`${Math.floor(viewport.height)}px`;
  renderTask=current.render({canvasContext:context,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
  try{await renderTask.promise;$('#page-number').value=String(page);$('#page-status').textContent=`${page} / ${pdf.numPages}쪽`;}
  catch(error){if(error?.name!=='RenderingCancelledException')throw error;}
}

select.addEventListener('change',()=>setSelected(select.value));
openButton.addEventListener('click',openBook);
buyButton.addEventListener('click',()=>{if(selected?.can_buy)location.href=api('checkout',selected.slug);});
$('#prev-page').addEventListener('click',()=>{if(pdf&&page>1){page--;renderPage();}});
$('#next-page').addEventListener('click',()=>{if(pdf&&page<pdf.numPages){page++;renderPage();}});
$('#page-number').addEventListener('change',event=>{if(pdf){page=Math.max(1,Math.min(pdf.numPages,Number(event.target.value)||1));renderPage();}});
$('#zoom-out').addEventListener('click',()=>{fit=false;scale=Math.max(.5,scale-.15);renderPage();});
$('#zoom-in').addEventListener('click',()=>{fit=false;scale=Math.min(2.4,scale+.15);renderPage();});
$('#fit-width').addEventListener('click',()=>{fit=true;renderPage();});
window.addEventListener('resize',()=>{if(pdf&&fit)renderPage();});
document.addEventListener('contextmenu',event=>{if(event.target===canvas)event.preventDefault();});
loadSession();
