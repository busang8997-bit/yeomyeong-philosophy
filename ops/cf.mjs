// 여명철학 Cloudflare Pages 운영 도구 (로컬 PC 전용).
// 사용: node ops/cf.mjs <명령>
//   whoami                      Wrangler 로그인 상태 확인
//   status                      Preview·Production 최근 배포 (읽기 전용)
//   secrets                     Preview·Production Secret 이름 목록 (값은 나오지 않음)
//   secret-put <NAME> --env preview [--from-clipboard]
//                               Preview Secret 설정. 값은 채팅·소스에 남기지 않는다.
//                               --from-clipboard: 클립보드 값을 Wrangler에 직접 넘긴다(화면 출력 없음).
//                               없으면 Wrangler가 이 터미널에서 직접 입력을 받는다.
//   redeploy-staging            코드 변경 없는 커밋을 staging에 push해 Preview를 다시 배포
//   wait-deploy [커밋]          해당 커밋(기본: 현재 HEAD)의 Preview 배포가 끝날 때까지 기다린 뒤 결과 출력
//
// 안전장치: Production Secret 변경, main 대상 작업은 하지 않는다.
// Production은 사용자의 명시적 승인 후 YEOMYEONG_ALLOW_PRODUCTION=1 로만 열린다.
import {spawnSync,execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='yeomyeong-philosophy';
const OPS=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.dirname(OPS);
const WRANGLER=path.join(OPS,'node_modules','wrangler','bin','wrangler.js');
const [cmd,...rest]=process.argv.slice(2);
const flag=name=>rest.includes(name);
const option=name=>{const i=rest.indexOf(name);return i>=0?rest[i+1]:undefined;};
function fail(message){console.error(`중단: ${message}`);process.exit(1);}

// Wrangler는 ops 폴더에서 실행한다. 저장소 루트의 wrangler.toml(D1 바인딩 등)을 읽지 않게 해서
// 명령이 프로젝트 설정 파일 상태에 영향받지 않도록 한다.
function wrangler(args,{input,capture=false}={}){
 const result=spawnSync(process.execPath,[WRANGLER,...args],{cwd:OPS,encoding:'utf8',input,stdio:[input===undefined?'inherit':'pipe',capture?'pipe':'inherit','inherit']});
 if(result.error)fail(`Wrangler 실행 실패 (${result.error.message}). ops 폴더에서 npm install 을 먼저 실행하세요.`);
 return result;
}
function git(args){return execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();}
function envName(){
 const env=option('--env');
 if(env!=='preview'&&env!=='production')fail('--env preview 를 반드시 지정하세요. (Wrangler는 --env를 빼면 Production에 적용합니다)');
 if(env==='production'&&process.env.YEOMYEONG_ALLOW_PRODUCTION!=='1')fail('Production 변경은 사용자 승인 후에만 합니다.');
 return env;
}
function readClipboard(){
 const run=(file,args)=>execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
 try{
  if(process.platform==='win32')return run('powershell.exe',['-NoProfile','-Command','Get-Clipboard -Raw']);
  if(process.platform==='darwin')return run('pbpaste',[]);
  return run('xclip',['-selection','clipboard','-o']);
 }catch{fail('클립보드를 읽지 못했습니다.');}
}
function deployments(environment){
 const r=wrangler(['pages','deployment','list','--project-name',PROJECT,'--environment',environment,'--json'],{capture:true});
 if(r.status!==0)fail('배포 목록을 불러오지 못했습니다. node ops/cf.mjs whoami 로 로그인 상태를 확인하세요.');
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')));
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

switch(cmd){
 case 'whoami':process.exit(wrangler(['whoami']).status);
 case 'status':{
  for(const environment of ['preview','production']){
   console.log(`\n[${environment}] 최근 배포`);
   for(const d of deployments(environment).slice(0,5))console.log(`- ${d.Status.padEnd(8)} ${d.Branch} ${d.Source} ${d.Deployment}`);
  }
  console.log(`\n브랜치 고정 주소: https://staging.${PROJECT}.pages.dev`);
  break;
 }
 case 'secrets':{
  for(const environment of ['preview','production']){console.log(`\n[${environment}]`);wrangler(['pages','secret','list','--project-name',PROJECT,'--env',environment]);}
  break;
 }
 case 'secret-put':{
  const name=rest[0];
  if(!/^[A-Z][A-Z0-9_]*$/.test(name||''))fail('Secret 이름을 대문자 형식으로 지정하세요. 예: BUNNY_STORAGE_KEY');
  const env=envName();
  let input;
  if(flag('--from-clipboard')){
   input=readClipboard().replace(/^\s+|\s+$/g,'');
   if(!input)fail('클립보드가 비어 있습니다. 넣을 값을 먼저 복사하세요.');
   console.log(`클립보드 값(${input.length}자)을 ${env} 환경의 ${name}에 넣습니다. 값은 출력하지 않습니다.`);
  }
  const r=wrangler(['pages','secret','put',name,'--project-name',PROJECT,'--env',env],{input});
  if(r.status!==0)fail('Secret 설정에 실패했습니다.');
  console.log(`완료: ${env} 환경의 ${name}. 적용하려면 다시 배포해야 합니다 → node ops/cf.mjs redeploy-staging`);
  break;
 }
 case 'redeploy-staging':{
  if(git(['rev-parse','--abbrev-ref','HEAD'])!=='staging')fail('staging 브랜치에서만 실행합니다.');
  if(git(['status','--porcelain']))fail('커밋하지 않은 변경이 있습니다. 먼저 정리하세요.');
  git(['fetch','origin','staging']);
  if(git(['rev-parse','HEAD'])!==git(['rev-parse','origin/staging']))fail('로컬 staging이 origin/staging과 다릅니다. git pull 후 다시 실행하세요.');
  git(['commit','--allow-empty','-m','Redeploy staging Preview\n\nNo code changes.']);
  git(['push','origin','staging']);
  console.log(`staging 재배포 요청: ${git(['rev-parse','--short','HEAD'])}. 결과 확인 → node ops/cf.mjs wait-deploy`);
  break;
 }
 case 'wait-deploy':{
  const sha=git(['rev-parse','--short=7',rest[0]||'HEAD']);
  for(let i=0;i<60;i++){
   const d=deployments('preview').find(item=>String(item.Source).startsWith(sha));
   // Wrangler는 성공한 배포의 Status를 종료 시각("3 minutes ago" 등)으로, 나머지는 Active·Failure·Canceled 등으로 준다.
   const failed=d&&/failure|failed|canceled|cancelled/i.test(d.Status),done=d&&!failed&&/ago|second|minute|hour|day/i.test(d.Status);
   if(done||failed){console.log(`${done?'성공':'실패'} ${d.Branch} ${d.Source} (${d.Status})\n배포 주소: ${d.Deployment}\n로그: ${d.Build}`);process.exit(done?0:1);}
   console.log(d?`진행 중: ${d.Status}`:'배포 대기 중…');await sleep(15000);
  }
  fail('15분 안에 배포가 끝나지 않았습니다.');
 }
 default:
  console.log('명령: whoami | status | secrets | secret-put <NAME> --env preview [--from-clipboard] | redeploy-staging | wait-deploy [커밋]');
  process.exit(cmd?1:0);
}
