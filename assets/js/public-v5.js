(function(){
'use strict';
const desktop=window.matchMedia('(min-width:1024px)');
const nav=document.querySelector('.top .nav');
const menu=document.querySelector('.home-nav-toggle');
const foldMobile=document.body.dataset.foldMobile!=='0';
const folds=Array.from(document.querySelectorAll('.home-fold'));
if(nav&&menu){
 document.querySelector('.top').classList.add('ui-ready');
 menu.hidden=false;
 menu.addEventListener('click',function(){const open=nav.classList.toggle('home-nav-open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'닫기':'메뉴';});
 nav.addEventListener('keydown',function(e){if(e.key==='Escape'){nav.classList.remove('home-nav-open');menu.setAttribute('aria-expanded','false');menu.textContent='메뉴';menu.focus();}});
}
function openHash(){let id;try{id=decodeURIComponent(location.hash.slice(1));}catch(e){return;}const f=folds.find(x=>x.id===id);if(f){f.open=true;f.scrollIntoView({block:'start'});}}
function sync(){folds.forEach(f=>{f.open=desktop.matches||!foldMobile;});if(nav&&menu){nav.classList.remove('home-nav-open');menu.setAttribute('aria-expanded','false');menu.textContent='메뉴';}openHash();}
folds.forEach(function(f){f.addEventListener('toggle',function(){if(!desktop.matches&&foldMobile&&f.open)folds.forEach(o=>{if(o!==f)o.open=false;});});f.querySelector('summary').addEventListener('click',e=>{if(desktop.matches||!foldMobile)e.preventDefault();});});
desktop.addEventListener('change',sync);window.addEventListener('hashchange',openHash);sync();
})();
/* 홈 화면에 추가 버튼 (.home-install). 설치창이 되는 브라우저는 바로 띄우고, 아니면 기기별 방법을 안내합니다. */
(function(){
var box=document.querySelector('.home-install');if(!box)return;
var btn=box.querySelector('.home-install-btn'),help=box.querySelector('.home-install-help');
var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
if(standalone)return;
var ua=navigator.userAgent,deferred=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;});
window.addEventListener('appinstalled',function(){box.hidden=true;});
function guide(){
 var inApp=/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps/i.test(ua);
 var ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 if(inApp)return ios?'지금은 앱 안의 화면이라 추가가 안 됩니다. 오른쪽 아래(또는 위) 메뉴에서 “Safari로 열기”를 누른 뒤 다시 시도해 주세요.':'지금은 앱 안의 화면이라 추가가 안 됩니다. 오른쪽 위 ⋮ 메뉴에서 “다른 브라우저로 열기 → Chrome”을 선택한 뒤 다시 시도해 주세요.';
 if(ios)return 'Safari 아래쪽의 공유 버튼(네모 위 화살표)을 누르고, “홈 화면에 추가”를 선택한 뒤 “추가”를 누르세요. (Chrome·네이버 앱은 Safari로 열어야 합니다.)';
 if(/SamsungBrowser/i.test(ua))return '화면 아래 메뉴(≡)를 누르고 “현재 페이지 추가 → 홈 화면”을 선택하세요.';
 if(/Android/i.test(ua))return '오른쪽 위 ⋮ 메뉴를 누르고 “홈 화면에 추가”(또는 “앱 설치”)를 선택하세요.';
 return '주소창 오른쪽의 설치 아이콘을 누르거나, 브라우저 메뉴에서 “앱 설치” 또는 “바로가기 만들기”를 선택하세요.';
}
btn.addEventListener('click',function(){
 if(deferred){var d=deferred;deferred=null;d.prompt();if(d.userChoice)d.userChoice.then(function(c){if(c&&c.outcome==='accepted')box.hidden=true;});return;}
 help.textContent=guide();help.hidden=false;
});
box.hidden=false;
})();
