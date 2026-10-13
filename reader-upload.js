const $=selector=>document.querySelector(selector);
const fileInput=$('#upload-file'),keyInput=$('#upload-key'),start=$('#upload-start'),progress=$('#upload-progress'),message=$('#upload-message');
const CHUNK_SIZE=512*1024;
function report(text,state=''){message.textContent=text;message.dataset.state=state;}
function randomId(){const bytes=crypto.getRandomValues(new Uint8Array(16));return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');}
start.addEventListener('click',async()=>{
  const file=fileInput.files?.[0],key=keyInput.value.trim(),book=$('#upload-book').value;
  if(!file||!key){report('PDF 파일과 등록 비밀번호를 확인해 주세요.','error');return;}
  if(!file.name.toLowerCase().endsWith('.pdf')||file.type&&file.type!=='application/pdf'){report('PDF 파일만 등록할 수 있습니다.','error');return;}
  if(file.size<5||file.size>30*1024*1024){report('파일은 5바이트 초과, 30MB 이하로 등록해 주세요.','error');return;}
  const parts=Math.ceil(file.size/CHUNK_SIZE),upload=randomId();progress.hidden=false;progress.value=0;start.disabled=true;
  try{
    for(let part=0;part<parts;part++){
      const chunk=file.slice(part*CHUNK_SIZE,Math.min(file.size,(part+1)*CHUNK_SIZE));
      const query=new URLSearchParams({mode:'upload',book,upload,part:String(part),parts:String(parts)});
      const response=await fetch(`/.netlify/functions/reader?${query}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Reader-Upload-Key':key},body:chunk,credentials:'same-origin',cache:'no-store'});
      let result={};try{result=await response.json();}catch{}
      if(!response.ok)throw new Error(result.error||'업로드에 실패했습니다.');
      progress.value=Math.round((part+1)/parts*100);report(`등록 중… ${part+1} / ${parts} 조각`);
      if(result.complete){report('PDF를 비공개 열람 저장소에 등록했습니다.','success');break;}
    }
    fileInput.value='';keyInput.value='';
  }catch(error){report(error.message||'업로드 중 오류가 발생했습니다.','error');}
  finally{start.disabled=false;}
});
