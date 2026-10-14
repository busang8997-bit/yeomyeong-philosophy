const BASE='https://sg.storage.bunnycdn.com/yeomyeong-pdf';

function storageUrl(path){
  return `${BASE}/${String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
}

function accessKey(env){
  const key=String(env.BUNNY_STORAGE_KEY||'').trim();
  if(!key) throw new Error('BUNNY_STORAGE_KEY is not configured');
  return key;
}

async function request(env,path,init={}){
  const headers=new Headers(init.headers||{});
  headers.set('AccessKey',accessKey(env));
  return fetch(storageUrl(path),{...init,headers});
}

function sizeFromHeaders(headers){
  const range=headers.get('content-range')||'';
  const match=/\/(\d+)$/.exec(range);
  if(match) return Number(match[1]);
  const length=Number(headers.get('content-length')||0);
  return Number.isFinite(length)?length:0;
}

export function bunnyBucket(env){
  return {
    async head(path){
      let res=await request(env,path,{method:'HEAD'});
      if(res.status===404) return null;
      if(res.ok){
        const size=sizeFromHeaders(res.headers);
        try{await res.body?.cancel();}catch{}
        if(size) return {size};
      }
      res=await request(env,path,{method:'GET',headers:{Range:'bytes=0-0'}});
      if(res.status===404) return null;
      if(!res.ok) throw new Error(`Bunny Storage HEAD failed: ${res.status}`);
      const size=sizeFromHeaders(res.headers);
      try{await res.body?.cancel();}catch{}
      return {size};
    },

    async get(path,options={}){
      const headers={};
      const range=options?.range;
      if(range&&Number.isFinite(range.offset)&&Number.isFinite(range.length)){
        headers.Range=`bytes=${range.offset}-${range.offset+range.length-1}`;
      }
      const res=await request(env,path,{method:'GET',headers});
      if(res.status===404) return null;
      if(!res.ok) throw new Error(`Bunny Storage GET failed: ${res.status}`);
      return {
        body:res.body,
        size:sizeFromHeaders(res.headers),
        arrayBuffer:()=>res.arrayBuffer(),
      };
    },

    async put(path,body,options={}){
      const headers={};
      const type=options?.httpMetadata?.contentType;
      if(type) headers['Content-Type']=type;
      const res=await request(env,path,{method:'PUT',headers,body});
      if(!res.ok) throw new Error(`Bunny Storage PUT failed: ${res.status}`);
      try{await res.body?.cancel();}catch{}
      return {ok:true};
    },

    async delete(path){
      const res=await request(env,path,{method:'DELETE'});
      if(res.status===404) return;
      if(!res.ok) throw new Error(`Bunny Storage DELETE failed: ${res.status}`);
      try{await res.body?.cancel();}catch{}
    },
  };
}
