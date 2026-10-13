const $=s=>document.querySelector(s),message=$('#message'),list=$('#books');
const CHUNK=512*1024,API='/.netlify/functions/reader';
let books=[],busy=false;
function say(text,type=''){message.textContent=text;message.className=`notice ${type}`;}
function escapeHTML(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function authToken(){try{const user=JSON.parse(localStorage.getItem('decap-cms-user')||'null');return typeof user?.token==='string'?user.token:'';}catch{return '';}}
async function establishSession(){
  const saved=authToken();
  if(!saved){say('먼저 /admin/에서 GitHub 로그인한 뒤 이 메뉴를 여세요.','error');$('#operator').textContent='로그인 필요';return false;}
  const response=await fetch(`${API}?mode=admin-session`,{method:'POST',headers:{Authorization:`Bearer ${saved}`},credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'관리자 로그인 확인에 실패했습니다.');
  $('#operator').textContent=`관리자 ${data.login}`;return true;
}
async function request(mode,options={}){const response=await fetch(`${API}?mode=${mode}`,{credentials:'same-origin',cache:'no-store',...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'요청을 처리하지 못했습니다.');return data;}
function render(){
 list.replaceChildren();
 books.forEach((book,index)=>{
  const section=document.createElement('section');section.className='book';section.dataset.index=index;
  section.innerHTML=`<h2>${escapeHTML(book.title||'새 도서')} <span class="badge">${book.pdfUploaded?'PDF 등록됨':'PDF 미등록'}</span></h2>
   <div class="field"><label>도서 코드 (영문 소문자·숫자·하이픈)</label><input data-key="slug" value="${escapeHTML(book.slug)}" ${book.persisted?'readonly':''} pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></div>
   <div class="field"><label>책 제목</label><input data-key="title" value="${escapeHTML(book.title)}" required></div>
   <div class="field"><label>저자</label><input data-key="author" value="${escapeHTML(book.author)}"></div>
   <div class="field"><label>시리즈</label><input data-key="series" value="${escapeHTML(book.series)}"></div>
   <div class="field"><label>90일 열람 가격</label><input data-key="price" value="${escapeHTML(book.price)}" placeholder="예: 8,000원"></div>
   <div class="field"><label>정가</label><input data-key="regular_price" value="${escapeHTML(book.regular_price)}" placeholder="예: 20,000원"></div>
   <div class="field"><label>판매 상태</label><select data-key="status"><option ${book.status==='준비중'?'selected':''}>준비중</option><option ${book.status==='판매중'?'selected':''}>판매중</option><option ${book.status==='판매중지'?'selected':''}>판매중지</option></select></div>
   <div class="field"><label>그로블 결제 주소</label><input data-key="purchase_url" type="url" value="${escapeHTML(book.purchase_url)}" placeholder="https://...groble.im/..."></div>
   <div class="field full"><label>책 소개</label><textarea data-key="description">${escapeHTML(book.description)}</textarea></div>
   <div class="field"><label>표지 이미지 주소 (선택)</label><input data-key="cover" value="${escapeHTML(book.cover)}" placeholder="https://... 또는 /assets/uploads/..."></div>
   <div class="field full"><label>YouTube 샘플강의 링크 (선택)</label><input data-key="video_url" type="url" value="${escapeHTML(book.video_url)}" placeholder="https://youtu.be/... 또는 YouTube 영상 주소"></div>
   <div class="field"><label class="check"><input data-key="published" type="checkbox" ${book.published?'checked':''}> 사이트에 공개</label></div>
   <div class="field full"><label>PDF 등록·교체</label><input data-pdf type="file" accept="application/pdf,.pdf"><span class="small">PDF 파일을 선택한 뒤 등록 버튼을 누르세요. 기존 파일은 업로드 완료 때 교체됩니다.</span></div>
   <div class="book-footer"><span class="badge" data-pdf-status>${book.pdfUploaded?'현재 PDF 사용 중':'PDF를 등록하면 결제 후 열람 가능'}</span><button class="btn secondary" data-upload type="button">PDF 등록·교체</button></div>`;
  list.append(section);
 });
}
function readForm(){return [...list.querySelectorAll('.book')].map(section=>{const book={...books[Number(section.dataset.index)]};section.querySelectorAll('[data-key]').forEach(input=>{book[input.dataset.key]=input.type==='checkbox'?input.checked:input.value.trim();});return book;});}
async function load(){if(!authToken())return;try{await establishSession();const data=await request('admin');books=(data.books||[]).map(book=>({...book,persisted:true}));render();say(`${books.length}권을 불러왔습니다. 변경사항은 이 화면에서 저장할 수 있습니다.`,'ok');window.dispatchEvent(new Event('yeomyeong-admin-ready'));}catch(error){window.dispatchEvent(new CustomEvent('yeomyeong-admin-failed',{detail:error.message}));throw error;}}
async function save(){if(busy)return;busy=true;$('#save').disabled=true;try{const data=await request('admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({books:readForm()})});books=(data.books||[]).map(book=>({...book,persisted:true}));render();say('도서·가격·그로블 주소를 저장했습니다. 결제와 열람 화면에 즉시 반영됩니다.','ok');}catch(error){say(error.message,'error');}finally{busy=false;$('#save').disabled=false;}}
function makeSlug(){let n=1,slug;const used=new Set(books.map(b=>b.slug));do{slug=`book-new-${String(n++).padStart(3,'0')}`;}while(used.has(slug));return slug;}
$('#add').addEventListener('click',()=>{books.push({slug:makeSlug(),title:'새 전자책',author:'이부상 지음',description:'',series:'',published:false,status:'준비중',price:'',regular_price:'',purchase_url:'',cover:'',pdfUploaded:false,persisted:false});render();list.lastElementChild?.scrollIntoView({behavior:'smooth',block:'center'});});
$('#save').addEventListener('click',save);
list.addEventListener('click',async event=>{const button=event.target.closest('[data-upload]');if(!button||busy)return;const section=button.closest('.book'),book=readForm()[Number(section.dataset.index)],file=section.querySelector('[data-pdf]').files?.[0],status=section.querySelector('[data-pdf-status]');if(!file){say('등록할 PDF 파일을 먼저 선택해 주세요.','error');return;}if(!file.name.toLowerCase().endsWith('.pdf')||(file.type&&file.type!=='application/pdf')){say('PDF 파일만 등록할 수 있습니다.','error');return;}if(file.size<5||file.size>30*1024*1024){say('PDF는 30MB 이하로 등록해 주세요.','error');return;}if(!book.title||!book.slug){say('도서 코드와 책 제목을 입력하고 먼저 도서 정보를 저장해 주세요.','error');return;}try{busy=true;button.disabled=true;$('#save').disabled=true;const saved=await request('admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({books:readForm()})});books=(saved.books||[]).map(item=>({...item,persisted:true}));const current=books.find(item=>item.slug===book.slug);if(!current)throw Error('도서 정보를 먼저 저장해 주세요.');const upload=[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join(''),parts=Math.ceil(file.size/CHUNK);for(let i=0;i<parts;i++){const params=new URLSearchParams({mode:'upload',book:book.slug,upload,part:String(i),parts:String(parts)});const response=await fetch(`${API}?${params}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file.slice(i*CHUNK,Math.min(file.size,(i+1)*CHUNK)),credentials:'same-origin',cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'PDF 업로드에 실패했습니다.');status.textContent=`업로드 중 ${Math.round((i+1)/parts*100)}%`;say(`${book.title} PDF 업로드 중… ${i+1}/${parts}`);}await load();say(`${book.title} PDF 등록·교체를 완료했습니다. 새 파일은 비공개 저장소에 보관됩니다.`,'ok');}catch(error){say(error.message,'error');}finally{busy=false;button.disabled=false;$('#save').disabled=false;}});
$('#logout').addEventListener('click',async()=>{try{await request('admin-logout',{method:'POST'});}catch{}localStorage.removeItem('decap-cms-user');location.reload();});
load().catch(error=>say(error.message,'error'));
