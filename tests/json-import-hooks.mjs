// Cloudflare(Wrangler) 번들러는 `import x from './a.json'`을 그대로 받지만 Node는 `with {type:'json'}`을 요구한다.
// 배포 코드를 바꾸지 않고 Node 테스트에서만 .json 모듈을 JSON 형식으로 읽게 한다.
export async function resolve(specifier,context,next){
  const result=await next(specifier,context);
  if(result.url.endsWith('.json'))return {...result,importAttributes:{...context.importAttributes,type:'json'}};
  return result;
}
export async function load(url,context,next){
  if(url.endsWith('.json'))return next(url,{...context,importAttributes:{...context.importAttributes,type:'json'}});
  return next(url,context);
}
