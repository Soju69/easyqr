/* ============ EasyQR app logic ============ */
(() => {
'use strict';

const $ = (s) => document.querySelector(s);

/* ---------- Иконки (lucide-style, stroke) ---------- */
const ICONS = {
  scooter:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M8 18h8M16.5 5l-2.6 7.2a2 2 0 0 0 1.9 2.8H19M15 5h2M8 18l3.5-7"/></svg>`,
  bike:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
  car:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M3 17v-4l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v4M6.5 12h11"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/></svg>`,
  link:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1"/><path d="M14 10a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.1"/></svg>`,
  x:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`
};

/* ---------- Known services → detection ---------- */
const SERVICES = [
  { key:'whoosh',   match:/whoosh|wsh\.bike/i,                    icon:'scooter', label:'WHOOSH · САМОКАТ' },
  { key:'yandex',   match:/yandex|\.go\b|taxi|vmnitime|\byd\b|\bmr\b|rt725|t\.\d+\.ru/i, icon:'car', label:'ЯНДЕКС · ТАКСИ' },
  { key:'utube',    match:/utube|u-tok|msk911|scooter-?sharing/i, icon:'scooter', label:'UTUBE · САМОКАТ' },
  { key:'mtsbike',  match:/mobik|\bmts\b|moyka|moika|velobike|vkm\b/i, icon:'bike', label:'МТС · ВЕЛО/КИК' },
  { key:'carshare', match:/youdrive|anytime|belka|dellin|carsharing|drive\d/i, icon:'car', label:'КАРШЕРИНГ' },
];

function detectService(url){
  const u = String(url||'');
  for (const s of SERVICES){
    if (s.match.test(u)) return s;
  }
  return { key:'link', icon:'link', label:'ССЫЛКА' };
}

/* ---------- Storage ---------- */
const LS = {
  get(k,d){ try{ const v=localStorage.getItem('eqr.'+k); return v?JSON.parse(v):d }catch(e){return d} },
  set(k,v){ try{ localStorage.setItem('eqr.'+k, JSON.stringify(v)) }catch(e){} }
};

let presets = LS.get('presets', null);
if (!presets){
  presets = [{ name:'Whoosh', url:'https://wsh.bike?s=' }];
  LS.set('presets', presets);
}
let history = LS.get('history', []);
let activePreset = LS.get('activePreset', 0);
if (activePreset >= presets.length) activePreset = 0;

/* ---------- Elements ---------- */
const el = {
  presets:$('#presets'), addPreset:$('#btn-add-preset'),
  prefix:$('#prefix'), suffix:$('#suffix'),
  generate:$('#btn-generate'), copy:$('#btn-copy'), download:$('#btn-download'),
  beamShell:$('#beam-shell'), stage:$('#stage'),
  vEmpty:$('#view-empty'), vThink:$('#view-thinking'), vResult:$('#view-result'),
  resBadge:$('#res-badge'), resTime:$('#res-time'), qrHolder:$('#qr-holder'),
  resUrl:$('#res-url'), resType:$('#res-type'),
  histList:$('#history-list'), histEmpty:$('#history-empty'), clearHist:$('#btn-clear-history'),
  modal:$('#preset-modal'), mpName:$('#mp-name'), mpUrl:$('#mp-url'),
  mpSave:$('#mp-save'), mpCancel:$('#mp-cancel'),
  toast:$('#toast'), installBtn:$('#btn-install')
};

let current = null; // {url, canvas, ts, svc, suf}
let generating = false;

/* ---------- Toast ---------- */
let toastT;
function toast(msg){
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.toast.classList.remove('show'), 1600);
}

/* ---------- Custom dot-style QR renderer ----------
   Белые круглые точки на графитовой подложке (монохром). */
const QR_COLORS = {
  plateTop:'#1C1C1F', plateBot:'#141416',
  dot:'#E4E4E7', eyeOuter:'#E4E4E7', eyeInner:'#C9C9CE' /* монохром: белые точки, серые глазки */
};
function renderDots(qr, size){
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  c.width = c.height = size*dpr;
  c.style.width = c.style.height = '100%';
  const ctx = c.getContext('2d');
  ctx.scale(dpr,dpr);

  const n = qr.modules.size, data = qr.modules.data;
  const qz = 3;                       // quiet zone (в модулях) — обязательная рамка
  const total = n + qz*2;
  const cell = size/total;
  const pad = cell*1.2;               // внутренний отступ плашки

  // графитовая плашка со скруглением и лёгким вертикальным градиентом
  const g = ctx.createLinearGradient(0,0,0,size);
  g.addColorStop(0,QR_COLORS.plateTop); g.addColorStop(1,QR_COLORS.plateBot);
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, size, size, cell*2.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(228,228,231,.08)'; ctx.lineWidth = 1;
  roundRect(ctx, .5, .5, size-1, size-1, cell*2.2);
  ctx.stroke();

  // позиции finder-паттернов (7x7 в углах)
  const isFinder = (col,row)=>
    (col<7&&row<7)||(col>=n-7&&row<7)||(col<7&&row>=n-7);

  // мягкое свечение под глазками
  ctx.save();
  ctx.shadowColor = 'rgba(230,230,232,.3)'; ctx.shadowBlur = cell*1.6;

  for(let row=0;row<n;row++){
    for(let col=0;col<n;col++){
      if(!data[row*n+col]) continue;
      const x=(col+qz)*cell, y=(row+qz)*cell;
      if(isFinder(col,row)){
        // finder рисуем целиком один раз по левому верхнему модулю блока
        const inTopL=(col===0&&row===0), inTopR=(col===n-7&&row===0), inBotL=(col===0&&row===n-7);
        if(inTopL||inTopR||inBotL){
          drawEye(ctx, x, y, cell);
        }
        continue;
      }
      ctx.fillStyle = QR_COLORS.dot;
      ctx.beginPath();
      ctx.arc(x+cell/2, y+cell/2, cell*0.42, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();
  return c;
}
function drawEye(ctx,x,y,cell){
  const S=cell*7;
  // внешнее кольцо — скруглённый квадрат обводкой
  ctx.strokeStyle = QR_COLORS.eyeOuter;
  ctx.lineWidth = cell*1.05;
  roundRect(ctx, x+ctx.lineWidth/2, y+ctx.lineWidth/2, S-ctx.lineWidth, S-ctx.lineWidth, cell*1.9);
  ctx.stroke();
  // зрачок
  ctx.fillStyle = QR_COLORS.eyeInner;
  roundRect(ctx, x+cell*2.15, y+cell*2.15, cell*2.7, cell*2.7, cell*.9);
  ctx.fill();
}
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ---------- Presets UI ---------- */
function renderPresets(){
  el.presets.innerHTML = '';
  presets.forEach((p,i)=>{
    const b = document.createElement('button');
    b.className = 'pill' + (i===activePreset?' active':'');
    b.setAttribute('role','tab');
    const svc = detectService(p.url);
    b.innerHTML = `<span class="pill-icon">${ICONS[svc.icon]}</span><span>${escapeHtml(p.name)}</span><span class="pill-del" data-del="${i}" title="Удалить пресет">${ICONS.x}</span>`;
    b.addEventListener('click',(e)=>{
      if (e.target.closest('.pill-del')) return;
      activePreset = i; LS.set('activePreset', i);
      applyPreset();
    });
    b.querySelector('.pill-del').addEventListener('click',(e)=>{
      e.stopPropagation();
      if (presets.length<=1){ toast('Нужен хотя бы один пресет'); return; }
      presets.splice(i,1);
      if (activePreset>=presets.length) activePreset=presets.length-1;
      LS.set('presets',presets); LS.set('activePreset',activePreset);
      applyPreset();
    });
    el.presets.appendChild(b);
  });
}

function applyPreset(){
  renderPresets();
  const p = presets[activePreset];
  el.prefix.textContent = p.url;
  el.suffix.focus({preventScroll:true});
}

/* ---------- Modal (только по кнопке «+» или клику по шаблону) ---------- */
function openModal(prefill){
  el.mpName.value = prefill ? prefill.name : '';
  el.mpUrl.value  = prefill ? prefill.url  : '';
  el.modal.hidden = false;
  (prefill ? el.mpUrl : el.mpName).focus();
}
function closeModal(){ el.modal.hidden = true; }

el.addPreset.addEventListener('click',()=>openModal(null));
el.mpCancel.addEventListener('click',closeModal);
el.modal.addEventListener('click',(e)=>{ if(e.target===el.modal) closeModal(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !el.modal.hidden) closeModal(); });

el.mpSave.addEventListener('click',savePreset);
el.mpUrl.addEventListener('keydown',(e)=>{ if(e.key==='Enter') savePreset(); });
el.mpName.addEventListener('keydown',(e)=>{ if(e.key==='Enter') el.mpUrl.focus(); });

function normalizeUrl(url){
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!url.endsWith('=') && !url.endsWith('?')) url += '=';
  return url;
}
function savePreset(){
  let name = el.mpName.value.trim();
  let url  = el.mpUrl.value.trim();
  if (!name || !url){ toast('Заполните оба поля'); return; }
  url = normalizeUrl(url);
  presets.push({name,url});
  activePreset = presets.length-1;
  LS.set('presets',presets); LS.set('activePreset',activePreset);
  closeModal();
  applyPreset();
  toast('Пресет добавлен');
}

/* Клик по серой части ссылки → редактирование текущего пресета */
el.prefix.addEventListener('click',()=>{
  const p = presets[activePreset];
  openModal({name:p.name, url:p.url});
  el.mpSave.onclick = ()=>{
    let name = el.mpName.value.trim(), url = el.mpUrl.value.trim();
    if(!name||!url){toast('Заполните оба поля');return;}
    url = normalizeUrl(url);
    presets[activePreset]={name,url};
    LS.set('presets',presets);
    closeModal(); applyPreset(); toast('Пресет обновлён');
    el.mpSave.onclick = savePreset;
  };
});

/* ---------- Generate ---------- */
async function generate(){
  if (generating) return;
  const suf = el.suffix.value.trim();
  const base = presets[activePreset].url;
  const url = base + suf;
  if (!suf){ toast('Введите номер'); shake(el.suffix.closest('.input-card')); return; }

  generating = true;
  el.copy.disabled = el.download.disabled = true;
  el.beamShell.classList.add('generating');
  showView('think');

  // build QR in background while orb plays
  let canvas=null, err=null;
  try{
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    canvas = renderDots(qr, 640);
  }catch(e){ err=e; }

  await sleep(1000); // "thinking" beat

  if (err){ showView(current?'result':'empty'); toast('Ошибка генерации'); generating=false; return; }

  const svc = detectService(url);
  const ts = Date.now();
  current = { url, canvas, ts, svc, suf };

  paintResult(current);
  pushHistory(current);
  showView('result');
  el.beamShell.classList.remove('generating');
  el.copy.disabled = el.download.disabled = false;
  generating = false;
  el.suffix.select();
}

function paintResult(item){
  el.qrHolder.innerHTML='';
  el.qrHolder.appendChild(item.canvas);
  el.resBadge.innerHTML = `<span class="pill-icon">${ICONS[item.svc.icon]}</span>${item.svc.key.toUpperCase()}`;
  el.resTime.textContent = fmtTime(item.ts);
  el.resUrl.textContent = item.url;
  el.resType.textContent = item.svc.label;
  el.vResult.classList.add('reveal');
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.vResult.classList.remove('reveal')));
}

function showView(v){
  el.vEmpty.hidden = v!=='empty';
  el.vThink.hidden = v!=='think';
  el.vResult.hidden = v!=='result';
  if (v==='result'){
    el.vResult.classList.add('reveal');
    requestAnimationFrame(()=>requestAnimationFrame(()=>el.vResult.classList.add('shown')));
  } else {
    el.vResult.classList.remove('shown');
  }
}

/* ---------- History ---------- */
function pushHistory(item){
  history.unshift({
    url:item.url, suf:item.suf, ts:item.ts, svc:item.svc.key,
    thumb: safeThumb(item.canvas)
  });
  if (history.length>60) history.length=60;
  LS.set('history',history);
  renderHistory();
}
function safeThumb(canvas){
  try{
    const c=document.createElement('canvas'); c.width=c.height=68;
    const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
    ctx.drawImage(canvas,0,0,68,68);
    return c.toDataURL('image/png');
  }catch(e){ return null }
}
const SVC_BY_KEY = {};
SERVICES.forEach(s=>SVC_BY_KEY[s.key]=s);

function renderHistory(){
  el.histList.innerHTML='';
  el.histEmpty.style.display = history.length? 'none':'block';
  history.forEach((h,i)=>{
    const svc = SVC_BY_KEY[h.svc] || detectService(h.url||'');
    const b=document.createElement('button');
    b.className='h-item';
    b.style.animationDelay = Math.min(i*30,300)+'ms';
    b.innerHTML = `
      <span class="h-icon">${ICONS[svc.icon]}</span>
      <span class="h-body">
        <span class="h-brand">${escapeHtml(svc.key.toUpperCase())}</span>
        <span class="h-meta">${fmtTime(h.ts)} · ${escapeHtml(h.url)}</span>
      </span>
      <span class="h-num">#${escapeHtml(String(h.suf||''))}</span>
      ${h.thumb?`<span class="h-thumb"><img src="${h.thumb}" alt=""></span>`:''}`;
    b.addEventListener('click',()=>restore(h));
    el.histList.appendChild(b);
  });
}

function restore(h){
  // find or create matching preset by prefix
  const idx = h.url.lastIndexOf('=');
  const base = idx>=0 ? h.url.slice(0,idx+1) : h.url;
  let pi = presets.findIndex(p=>p.url===base);
  if (pi<0){
    const svc = SVC_BY_KEY[h.svc]||detectService(base);
    presets.push({name:svc.key[0].toUpperCase()+svc.key.slice(1), url:base});
    pi = presets.length-1;
    LS.set('presets',presets);
  }
  activePreset = pi; LS.set('activePreset',pi);
  applyPreset();
  el.suffix.value = h.suf || '';
  current = { url:h.url, ts:h.ts, svc:SVC_BY_KEY[h.svc]||detectService(h.url), suf:h.suf, canvas:null };
  // regenerate silently (no fake delay) to get fresh canvas
  try{
    const qr = QRCode.create(h.url, { errorCorrectionLevel: 'M' });
    current.canvas = renderDots(qr, 640);
    paintResult(current); showView('result'); el.copy.disabled=el.download.disabled=false;
  }catch(e){ toast('Не удалось восстановить'); }
}

el.clearHist.addEventListener('click',()=>{
  history=[]; LS.set('history',history); renderHistory(); toast('История очищена');
});

/* ---------- Copy / Download ---------- */
el.copy.addEventListener('click', async ()=>{
  if(!current) return;
  try{ await navigator.clipboard.writeText(current.url); toast('Ссылка скопирована'); }
  catch(e){
    const t=document.createElement('textarea'); t.value=current.url; document.body.appendChild(t);
    t.select(); document.execCommand('copy'); t.remove(); toast('Скопировано');
  }
});
el.download.addEventListener('click',()=>{
  if(!current||!current.canvas) return;
  const a=document.createElement('a');
  a.download=`qr_${current.svc.key}_${current.suf||'x'}.png`;
  a.href=current.canvas.toDataURL('image/png');
  a.click(); toast('PNG сохранён');
});

/* ---------- Input events ---------- */
el.suffix.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); generate(); }});
el.generate.addEventListener('click',generate);

/* ---------- Utils ---------- */
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function fmtTime(ts){
  const d=new Date(ts);
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function shake(node){
  node.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:220,easing:'ease-in-out'});
}

/* ---------- PWA install ---------- */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; el.installBtn.hidden=false; });
el.installBtn.addEventListener('click',async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; el.installBtn.hidden=true;
});
window.addEventListener('appinstalled',()=>{ el.installBtn.hidden=true; });

/* ---------- Init ---------- */
applyPreset();
renderHistory();
})();
