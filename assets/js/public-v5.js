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
