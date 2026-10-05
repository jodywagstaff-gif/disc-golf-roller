const KEY='disc-roller.theme.v1';
const system=matchMedia('(prefers-color-scheme: dark)');
let choice=null;
try{const saved=localStorage.getItem(KEY);if(['day','night'].includes(saved))choice=saved;}catch{}
function render(){
 const theme=choice||(system.matches?'night':'day');document.documentElement.dataset.theme=theme;
 document.querySelector('meta[name="theme-color"]').content=theme==='day'?'#dce6dc':'#171526';
 for(const button of document.querySelectorAll('[data-theme-toggle]')){button.textContent=theme==='day'?'☀ Day':'☾ Night';button.setAttribute('aria-label',theme==='day'?'Day skin. Switch to Night':'Night skin. Switch to Day');}
}
render();system.addEventListener('change',()=>{if(!choice)render();});
document.addEventListener('click',event=>{if(!event.target.closest('[data-theme-toggle]'))return;choice=document.documentElement.dataset.theme==='day'?'night':'day';try{localStorage.setItem(KEY,choice);}catch{}render();});
window.addEventListener('storage',event=>{if(event.key===KEY){choice=['day','night'].includes(event.newValue)?event.newValue:null;render();}});
