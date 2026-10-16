/* ============================================================
   兒童讀物提示詞機器人 — 主程式
   主軸：教會「精準指令」。純前端、免安裝、離線可用。
   ============================================================ */

/* ---------- 小工具 ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s??'').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('on'), 1900);
}

function copyText(txt){
  const done = ()=>toast('已複製，可以直接貼到 GPT 了');
  const fallback = ()=>{
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); }
    catch(e){ toast('複製失敗，請手動選取文字'); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext)
    navigator.clipboard.writeText(txt).then(done).catch(fallback);
  else fallback();
}

function download(name, txt){
  const b = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const STORE_PREFIX = 'rbot_v2_';
const store = {
  get(k, d){ try{ const v = localStorage.getItem(STORE_PREFIX+k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(STORE_PREFIX+k, JSON.stringify(v)); }catch(e){ toast('沒有儲存成功，請先匯出備份再繼續。'); } },
  // 匯入是一整份作品：寫入失敗時，把已寫入的欄位還原。
  writeAll(values){
    const entries = Object.entries(values).map(([k,v])=>[STORE_PREFIX+k, JSON.stringify(v)]);
    const before = entries.map(([k])=>[k, localStorage.getItem(k)]);
    let written = 0;
    try{
      entries.forEach(([k,v])=>{ localStorage.setItem(k, v); written++; });
    }catch(err){
      before.slice(0, written).reverse().forEach(([k,v])=>{
        try{ if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){}
      });
      throw err;
    }
  }
};

/* 樣板填字 */
const HINTS = {
  TITLE:'書名', AUDIENCE:'閱讀對象', HERO:'主角設定', SIDEKICK:'配角設定',
  STYLE:'畫風', PALETTE:'主色', BORDER_COLOR:'邊框顏色', TOTAL:'總頁數',
  N:'頁碼', TEXT:'這一頁的文字', SCENE:'這一頁的畫面描述', LAYOUT:'排版方式',
  PREV:'上一頁頁碼', NEXT:'下一頁頁碼', IDX:'第幾個規則',
  SECTION_TITLE:'這個規則的標題', COVER_ACTION:'封面主角在做什麼',
  STEP_COUNT:'步驟數量', STEPS:'每個步驟畫什麼（一行一步）',
  TERM:'要解釋的詞', TERM_DEF:'用看得見的動作解釋這個詞',
  KEYWORD:'要標紅色的關鍵動詞', MARK:'⭕ 或 ❌',
  SUMMARY_LEAD:'總結頁的引導句', ITEMS:'核對項目（一行一項）', ITEM_COUNT:'核對項目數量',
  ICON_WANT:'這頁需要的圖示', IN_IMAGE_TEXT:'要畫在圖片上的字',
  LINES:'文字行數', PT:'內文字級',
  CAMERA:'這一鏡的鏡頭（景別＋運鏡）', LINE:'這一鏡的台詞', HERO_SHORT:'主角一句話',
  SEC:'這一鏡幾秒', LENS:'焦段', HERO_EN:'角色軸（英文）', ACTION:'這一鏡發生什麼動作',
  MOTIF:'視覺符號軸（英文）', LIGHT:'光影（英文）', MOTION:'動態物理軸',
  QUALITY:'畫風（英文）', AUDIO:'環境音或音效', ACCENT:'腔調與語氣',
  LINE_PY:'台詞的羅馬拼音'
};
function fill(tpl, v){
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (m,k)=>{
    const x = v[k];
    return (x!==undefined && x!==null && String(x).trim()!=='')
      ? x : '【請填寫：' + (HINTS[k]||k) + '】';
  });
}

/* ---------- 全域設定 ---------- */
const DEFAULTS = Object.assign({
  title:'', border:'橘色、綠色、藍色輪流',
  medium:'book',       // book＝讀物｜video＝影片
  kind:'child',        // child｜adult
  textMode:'draw'      // draw＝讓 AI 畫字｜reserve＝留空白框，排版時自己打
}, VIDEO_DEFAULTS, (({id, name, sub, pt, noTypes, ...rest}) => rest)(KINDS[0]));

/* 匯入及載入舊存檔共用的檢查。先檢查整份資料，才允許覆寫作品。
   舊備份沒有的新欄位補預設值；已停用的獎狀頁轉成總結頁。 */
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
function checkedCfg(cfg){
  if (!isRecord(cfg)) throw new Error('設定格式不對');
  Object.keys(DEFAULTS).forEach(k=>{
    if (hasOwn(cfg, k) && typeof cfg[k] !== typeof DEFAULTS[k]) throw new Error('設定欄位格式不對');
  });
  const enums = { medium:MEDIA, kind:KINDS, textMode:TEXT_MODES, aspect:ASPECTS };
  Object.entries(enums).forEach(([k,list])=>{
    if (hasOwn(cfg, k) && !list.some(x=>x.id === cfg[k])) throw new Error('設定選項不存在');
  });
  return {...cfg};
}
function checkedRows(rows, video){
  if (!Array.isArray(rows)) throw new Error('腳本格式不對');
  return rows.map(r=>{
    if (!isRecord(r)) throw new Error('腳本卡片格式不對');
    const type = !video && r.type === 'award' ? 'summary' : r.type;
    if (!(video ? SHOT_TYPES : PAGE_TYPES).some(t=>t.id === type)) throw new Error('卡片類型不存在');
    const defaults = video ? newVRow(type) : newRow(type);
    Object.keys(defaults).filter(k=>k !== 'sec').forEach(k=>{
      if (hasOwn(r, k) && typeof r[k] !== 'string') throw new Error('卡片欄位格式不對');
    });
    const out = {...defaults, ...r, type};
    if (video && hasOwn(r, 'sec')){
      if (!['number','string'].includes(typeof r.sec) || !Number.isFinite(+r.sec) || +r.sec < 0)
        throw new Error('鏡頭秒數格式不對');
      out.sec = +r.sec;
    }
    return out;
  });
}
function checkedThemes(themes){
  if (!Array.isArray(themes)) throw new Error('範本格式不對');
  return themes.map(t=>{
    if (!isRecord(t) || typeof t.id !== 'string' || !t.id.trim() ||
        typeof t.name !== 'string' || !t.name.trim() || !MEDIA.some(m=>m.id === t.medium))
      throw new Error('範本欄位格式不對');
    return {...t, cfg:checkedCfg(t.cfg)};
  });
}
function checkedBackup(d){
  if (!isRecord(d) || !['cfg','script','vscript','mythemes'].some(k=>hasOwn(d, k)))
    throw new Error('不是作品備份');
  const out = {};
  if (hasOwn(d, 'cfg')) out.cfg = checkedCfg(d.cfg);
  if (hasOwn(d, 'script')) out.script = checkedRows(d.script, false);
  if (hasOwn(d, 'vscript')) out.vscript = checkedRows(d.vscript, true);
  if (hasOwn(d, 'mythemes')) out.mythemes = checkedThemes(d.mythemes);
  return out;
}

// 先前錯誤匯入留下的損壞資料不能讓首頁也開不了。
// 原始資料另存一份，列表裡仍可讀的卡片保留；啟動時不覆寫原存檔。
let SAVED_DATA_BAD = false;
function readSaved(k, check, fallback){
  const value = store.get(k, fallback);
  try{ return check(value); }catch(err){
    SAVED_DATA_BAD = true;
    if (store.get('recovery:'+k, null) === null) store.set('recovery:'+k, value);
    if (Array.isArray(value) && Array.isArray(fallback)){
      return value.flatMap(item=>{ try{ return check([item]); }catch(e){ return []; } });
    }
    return fallback;
  }
}

/* 換作品類型時，只換「使用者沒動過」的欄位——動過的是他的工作，不能蓋掉。
   回傳被保留下來的欄位名稱，UI 要告訴他哪幾欄沒跟著換。 */
function switchKind(id){
  const from = kindOf(CFG.kind), to = kindOf(id), kept = [];
  ['audience','hero','sidekick','heroEn','sidekickEn','style','palette'].forEach(k=>{
    if ((CFG[k]||'') === (from[k]||'')) CFG[k] = to[k];
    else if ((CFG[k]||'') !== (to[k]||'')) kept.push(k);
  });
  CFG.kind = id; saveCfg();
  return kept;
}

/* 這個頁型在目前的作品類型可不可以用 */
function typeOk(t, kind){
  if (t.kinds && t.kinds.indexOf(kind) < 0) return false;
  const k = kindOf(kind);
  return !(k.noTypes || []).length || k.noTypes.indexOf(t.id) < 0;
}
let CFG = {...DEFAULTS, ...readSaved('cfg', checkedCfg, {})};
function saveCfg(){ store.set('cfg', CFG); }
function vars(extra){
  return Object.assign({
    TITLE:CFG.title, AUDIENCE:CFG.audience, HERO:CFG.hero, SIDEKICK:CFG.sidekick,
    STYLE:CFG.style, PALETTE:CFG.palette, BORDER_COLOR:CFG.border,
    TOTAL:SCRIPT.length || ''
  }, extra||{});
}

/* ---------- 可複製的指令卡 ---------- */
let pid = 0; const PSTORE = {};
function promptBox(text, label, cls){
  const id = 'p'+(++pid); PSTORE[id] = text;
  return `<div class="prompt ${cls||''}">
    <button class="btn sm ghost copy" data-copy="${id}">${I.copy}複製</button>
    ${label?`<span class="lbl">${(cls||'').indexOf('chg-box') >= 0
      ? '<span class="chg-b">整段換了</span>' : ''}${esc(label)}</span>`:''}
    <pre>${markChanged(esc(text))}</pre></div>`;
}
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-copy]');
  if (b) copyText(PSTORE[b.dataset.copy] || '');
});


/* ---------- 圖示家族 ----------
   全部 20x20 viewBox、1.5 筆畫、圓端點。統一粗細是 emoji 做不到的，
   而混用不同來源的圖形正是介面看起來廉價的主因。 */
const svg = (d) =>
  `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;
const I = {
  copy : svg('<rect x="7.2" y="7.2" width="8.6" height="8.6" rx="1.4"/>' +
             '<path d="M12.8 4.2H5.6A1.4 1.4 0 0 0 4.2 5.6v7.2"/>'),
  down : svg('<path d="M10 3.6v8.8m0 0 3.4-3.4M10 12.4 6.6 9"/><path d="M4 16.2h12"/>'),
  up   : svg('<path d="M10 16.4V7.6m0 0L6.6 11M10 7.6 13.4 11"/><path d="M4 3.8h12"/>'),
  trash: svg('<path d="M4.6 6.2h10.8M8 6.2V4.4h4v1.8M6.6 6.2l.6 9.4h5.6l.6-9.4"/>'),
  plus : svg('<path d="M10 4.4v11.2M4.4 10h11.2"/>'),
  print: svg('<path d="M6.2 8.2V4.2h7.6v4"/><rect x="3.6" y="8.2" width="12.8" height="5" rx="1.2"/>' +
             '<path d="M6.2 13.2h7.6v3.6H6.2z"/>'),
  reset: svg('<path d="M4.4 10a5.6 5.6 0 1 0 1.8-4.1"/><path d="M3.9 4.4v3.6h3.6"/>'),
  close: svg('<path d="M5.6 5.6l8.8 8.8m0-8.8-8.8 8.8"/>'),
  left : svg('<path d="M12.2 4.6 6.8 10l5.4 5.4"/>'),
  right: svg('<path d="M7.8 4.6 13.2 10l-5.4 5.4"/>'),
  ext  : svg('<path d="M8.4 4.6h7v7"/><path d="M15.4 4.6 8.8 11.2"/>' +
             '<path d="M12.4 15.4H4.6V7.6"/>')
};

/* ---------- 圖示家族之二：Lucide ----------
   來源：Lucide 圖示庫（ISC 授權，可自由使用與修改，全文在 assets\LUCIDE-LICENSE.txt）。
   原始檔是 24x24、2 筆畫；這裡統一改成 1.6，跟上面那套 20x20／1.5 的放在一起
   粗細才一致。用在「一眼要認出這是什麼」的地方：提示條、對錯欄、資源類型、
   疑難排解的症狀。內文裡的圖示一律只是輔助，重要的話永遠也用文字寫出來。 */
const lu = d => `<svg class="ico lu" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const LU = {
  ok    : lu('<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>'),
  no    : lu('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  info  : lu('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  warn  : lu('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  bulb  : lu('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
  doc   : lu('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  video : lu('<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>'),
  globe : lu('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  book  : lu('<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>'),
  cap   : lu('<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>')
};

const img = n => 'assets/book/p'+String(n).padStart(2,'0')+'.jpg';

/* ============================================================
   0. 字級
   ------------------------------------------------------------
   整份樣式都是 rem，根字級是 calc(var(--ui) * 100%)，
   所以改 --ui 一個值就等比例放大整個介面（版面不會被撐爛）。
   內文 pt = 12 × --ui，標示直接寫 pt。
   ============================================================ */
const UI_STEPS = [
  { v:1,     pt:'12pt' },
  { v:1.333, pt:'16pt' },
  { v:1.667, pt:'20pt' },
  { v:2.667, pt:'32pt' }
];
const UI_DEFAULT = 1;          // v2 工作人員版預設 16pt；保留 12／20／32pt 可選
// 易學版的字級另外記：它的題目與選項本來就放大過，預設 20pt 就夠大
const isEasy    = ()=> document.body.classList.contains('mode-easy');
const uiKey     = ()=> isEasy() ? 'e_ui' : 'ui';
const uiDefault = ()=> isEasy() ? 2 : UI_DEFAULT;
function uiRestore(){ applyUi(store.get(uiKey(), uiDefault())); }

function uiMarkup(){
  return `<button type="button" class="us-btn" aria-haspopup="true" aria-expanded="false"
      aria-label="字級">
      <span class="us-a1" aria-hidden="true">A</span><span class="us-a2" aria-hidden="true">A</span>
      <span class="us-cur"></span></button>
    <div class="us-pop" hidden>
      <span class="us-l">內文字級</span>
      <div class="us-seg" role="group" aria-label="內文字級">${
        UI_STEPS.map((s,i)=>`<button type="button" data-ui="${i}" aria-pressed="false">${s.pt}</button>`).join('')
      }</div>
    </div>`;
}

function applyUi(i){
  i = Math.min(UI_STEPS.length-1, Math.max(0, +i || 0));
  document.documentElement.style.setProperty('--ui', UI_STEPS[i].v);
  store.set(uiKey(), i);
  $$('.uiscale [data-ui]').forEach(b=>
    b.setAttribute('aria-pressed', String(+b.dataset.ui === i)));
  $$('.uiscale .us-cur').forEach(e=>{ e.textContent = UI_STEPS[i].pt; });
}

function mountUi(host){
  if (!host || host.dataset.built) return;
  host.innerHTML = uiMarkup();
  host.dataset.built = '1';
  const btn = host.querySelector('.us-btn');
  const pop = host.querySelector('.us-pop');
  const open = o=>{ pop.hidden = !o; btn.setAttribute('aria-expanded', String(o)); };

  btn.addEventListener('click', ()=>open(pop.hidden));
  pop.addEventListener('click', e=>{
    const b = e.target.closest('button[data-ui]');
    if (!b) return;
    applyUi(+b.dataset.ui);
    open(false); btn.focus();
  });
  // 點外面或按 Esc 關掉
  document.addEventListener('click', e=>{ if (!pop.hidden && !host.contains(e.target)) open(false); });
  document.addEventListener('keydown', e=>{
    if (e.key === 'Escape' && !pop.hidden){ open(false); btn.focus(); }
  });
  uiRestore();
}

/* ============================================================
   1. 首頁：目錄 + 球體
   ============================================================ */

/* 首頁目錄分四組。四大原則和產生器是讀物、影片共用的起點，
   所以放最前面；之後才分讀物、影音；查用的放最後。 */
const HUB_GROUPS = [
  { g:'起點', nodes:[
    { v:'prin', idx:'01', name:'四大原則',     desc:'5 課。讀物和影片共用的底層' },
    { v:'gen',  idx:'02', name:'指令產生器',   desc:'讀物／影音切換，組出可以直接貼的指令' } ]},
  { g:'讀物', nodes:[
    { v:'care', idx:'03', name:'友善就醫',     desc:'7 課，附一本做完的五頁範例' },
    { v:'ref',  idx:'04', name:'範例與檢查表', desc:'一本做完的成品，加交付前核對' } ]},
  { g:'影音', nodes:[
    { v:'vid',  idx:'05', name:'影片指令',     desc:'7 課。時間軸、動作、鏡頭、聲音' } ]},
  { g:'查用', nodes:[
    { v:'fix',  idx:'06', name:'疑難排解',     desc:'圖或影片生壞了，對症找修正指令' },
    { v:'res',  idx:'07', name:'學習資源',     desc:'17 個確認過的外部連結，含影片指令 7 篇' } ]}
];
const HUB_NODES = HUB_GROUPS.flatMap(g => g.nodes);
// 每個模組查得到自己的編號、名稱與分組，頁首和上方列都靠它
const HUB_OF = {};
HUB_GROUPS.forEach(g => g.nodes.forEach(n => HUB_OF[n.v] = Object.assign({ grp:g.g }, n)));

/* 七個模組的圖示。來源：Lucide（ISC 授權，可自由使用與修改，授權全文在
   assets\LUCIDE-LICENSE.txt）。原始檔是 24x24、2 筆畫，這裡統一改成 1.6，
   跟平台自己那套 20x20／1.5 筆畫的圖示放在一起才不會一粗一細。 */
const HUB_ICONS = {
  prin:'<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
  gen :'<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  care:'<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  ref :'<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  vid :'<path d="m12.296 3.464 3.02 3.956"/><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m6.18 5.276 3.1 3.899"/>',
  fix :'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  res :'<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>'
};
const hubIco = v =>
  `<svg class="r-ico" viewBox="0 0 24 24" aria-hidden="true">${HUB_ICONS[v] || ''}</svg>`;

/* 單一來源：shadcn/ui Dashboard 的側欄、摘要與工具表格。
   模組事件與球體節點保留，進度直接取現有已閱讀資料。 */
function homeMarkup(){
  const stats=[
    {id:'prin',name:'四大原則',total:5,note:'寫每一則指令都用得上'},
    {id:'care',name:'友善就醫',total:7,note:'從就醫情境到完整讀物'},
    {id:'vid',name:'影片指令',total:7,note:'時間、動作、鏡頭與聲音'},
    {id:'ref',name:'交付前檢查',total:CHECKLIST.reduce((n,g)=>n+g.items.length,0),note:'確認你的作品準備好了'}
  ];
  const rows=HUB_GROUPS.flatMap(g=>g.nodes.map(n=>`
    <button type="button" class="hp-row" data-v="${n.v}" data-group="${esc(g.g)}">
      <span class="r-title"><span class="r-mark">${hubIco(n.v)}</span><span class="r-name"><i class="r-idx">${n.idx}</i>${esc(n.name)}</span></span>
      <span class="r-desc">${esc(n.desc)}</span>
      <span class="r-category">${esc(g.g)}</span>
      <svg class="r-go" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m0 0-4.2-4.2M15 10l-4.2 4.2"/></svg>
    </button>`)).join('');
  return `<div class="home-page"><div class="hp-body">
    <h1 id="hp-title" class="ws-sr-only">工作台</h1>
    <div class="dash-stats">${stats.map(s=>`<button type="button" class="dash-stat" data-v="${s.id}">
      <span class="dash-stat-head">${esc(s.name)}<span class="dash-badge">${s.id==='ref'?'檢查表':'課程'}</span></span>
      <span class="dash-stat-number"><b data-count="${s.id}">0</b><span> / ${s.total}</span></span>
      <span class="dash-stat-bottom"><b>${s.id==='ref'?'已完成項目':'已閱讀課次'}${I.right}</b><span>${esc(s.note)}</span></span>
    </button>`).join('')}</div>
    <section class="dash-work" aria-labelledby="dash-work-title">
      <div class="dash-panel-head"><div><h2 id="dash-work-title">把教學目標，寫成 AI 聽得懂的指令</h2><p>先學四大原則，再做自己的讀物或影片。</p></div>
        <div class="hp-cta"><button class="btn ghost" data-v="prin">從四大原則開始${I.right}</button><button class="btn" data-v="gen">直接做一份指令${I.right}</button></div></div>
      <div class="dash-work-body"><div class="dash-path">
        <button type="button" data-v="prin"><span>01</span><div><b>學會怎麼說清楚</b><p>把四個習慣，套進每一則指令。</p></div>${I.right}</button>
        <button type="button" data-v="gen"><span>02</span><div><b>做出第一份作品</b><p>設定主角，寫好每一頁或每一鏡。</p></div>${I.right}</button>
        <button type="button" data-v="ref"><span>03</span><div><b>檢查，再交給讀者</b><p>看範例，用檢查表完成最後核對。</p></div>${I.right}</button>
      </div><div class="hp-orb" id="hp-orb"><div class="stage"><canvas id="robot-canvas" aria-label="智能球體 3D 模型"></canvas></div>
        <div class="hub-fallback" id="hub-fallback"><div class="emblem"></div></div><p class="hp-note" id="hub-note" hidden></p>
        <p class="hp-orb-caption">你的教學目標，從一則指令開始。</p></div></div>
    </section>
    <p class="hp-read"><button type="button" data-v="read">${READ_ICON}文件轉易讀${I.right}</button><span>選一份文件，準備改寫指令，再交給 ChatGPT。</span></p>
    <section class="dash-tools" aria-label="全部工具">
      <div class="dash-toolbar"><div class="dash-tabs" role="group" aria-label="篩選工具">${['全部','起點','讀物','影音','查用'].map((g,i)=>`<button type="button" data-hub-filter="${g}" aria-pressed="${i===0}">${g}</button>`).join('')}</div>
        <label class="dash-search">${svg('<circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/>')}<input id="hub-search" type="search" aria-label="搜尋工具" placeholder="搜尋工具"></label></div>
      <div class="dash-table-head" aria-hidden="true"><span>工具</span><span>用途</span><span>分類</span><span></span></div>
      <nav class="hp-index" aria-label="七個模組">${rows}</nav><p class="dash-no-result" id="hub-no-result" hidden>找不到符合的工具，請換個關鍵字。</p>
      <div class="dash-table-foot"><span id="hub-result-count" role="status">7 個工具</span><span>內容與進度自動保存在這台裝置。</span></div>
    </section>
    <p class="hp-foot">01 讀完、02 動手做一次就夠了。要做影片再上 05，其餘需要時再查。</p>
  </div></div>`;
}

function updateHomeStats(){
  $$('[data-count]', $('#view-home')).forEach(el=>{
    const id=el.dataset.count;
    el.textContent=id==='ref'?Object.values(store.get('check',{})).filter(Boolean).length:courseSeen(id).length;
  });
}

function workspaceNav(){
  const link=(v,name,ico)=>`<button type="button" class="ws-link" data-v="${v}" aria-label="${esc(name)}" title="${esc(name)}">${ico}<span>${esc(name)}</span></button>`;
  const groups=[{title:'工作台',items:[['home','總覽',LU.globe],['gen','指令產生器',hubIco('gen')],['read','文件轉易讀',READ_ICON]]},
    {title:'課程',items:[['prin','四大原則',hubIco('prin')],['care','友善就醫',hubIco('care')],['vid','影片指令',hubIco('vid')]]},
    {title:'查用',items:[['ref','範例與檢查表',hubIco('ref')],['fix','疑難排解',hubIco('fix')],['res','學習資源',hubIco('res')]]}];
  return `<div class="ws-nav-top"><button type="button" class="ws-brand" data-v="home" aria-label="提示詞機器人首頁">${LU.globe}<span>提示詞機器人</span></button><button type="button" class="ws-drawer-close" data-ws-close aria-label="關閉主導覽">${I.close}</button></div>
    <nav class="ws-nav" aria-label="模組">${groups.map(g=>`<div class="ws-group"><p>${g.title}</p>${g.items.map(x=>link(...x)).join('')}</div>`).join('')}</nav>
    <div class="ws-nav-bottom">${link('res','學習資源與說明',LU.info)}<button type="button" class="ws-link ws-easy" data-mode="easy" aria-label="切換易學版" title="切換易學版" aria-pressed="false">${LU.cap}<span>切換易學版</span></button>
      <div class="ws-profile"><span class="ws-avatar" aria-hidden="true">工</span><div><b>工作人員版</b><span>本機使用・自動儲存</span></div></div></div>`;
}
function mountWorkspace(){
  const aside=$('#app-sidebar'),drawer=$('#ws-drawer');
  aside.innerHTML=workspaceNav();drawer.innerHTML=workspaceNav();
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-ws-toggle]')){
      if(matchMedia('(max-width:999px)').matches){drawer.showModal();}
      else{document.body.classList.toggle('ws-collapsed');}
      syncWorkspace();
    }
    if(e.target.closest('[data-ws-close]'))drawer.close();
  });
  drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close();}});
  drawer.addEventListener('close',()=>syncWorkspace());
  matchMedia('(max-width:999px)').addEventListener('change',()=>{if(drawer.open)drawer.close();syncWorkspace();});
}
function syncWorkspace(){
  const v=document.body.dataset.view||'home',mobile=matchMedia('(max-width:999px)').matches;
  $$('.ws-link[data-v]').forEach(b=>{if(b.dataset.v===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const toggle=$('[data-ws-toggle]');
  if(toggle){toggle.setAttribute('aria-controls',mobile?'ws-drawer':'app-sidebar');toggle.setAttribute('aria-expanded',String(mobile?$('#ws-drawer').open:!document.body.classList.contains('ws-collapsed')));}
}

/* 每個模組頁的頁首補一行引線：圖示＋編號＋分組。
   七頁的 .page-head 各自寫在各自的 render 裡，與其改七個地方，
   不如渲染完統一補上——這樣頁首和首頁目錄永遠對得起來。
   課次頁沒有 .page-head（它用課程列），自然跳過。 */
function decorateHead(v){
  if (v === 'gen') return; // v2 產生器以作品名稱與步驟導覽作頁首。
  const n = HUB_OF[v];
  const head = $('#view-' + v + ' .page-head');
  if (!n || !head || head.querySelector('.ph-kick')) return;
  head.insertAdjacentHTML('afterbegin',
    `<p class="ph-kick"><span class="ph-ico">${hubIco(v)}</span>` +
    `<span class="ph-idx">${n.idx}</span><span class="ph-grp">${esc(n.grp)}</span></p>`);
}

/* 工作人員版／易學版切換。切換的邏輯在 easy.js；這裡只放按鈕。
   在工作人員版畫面上，按下去的一定是「工作人員版」。 */
function modeSwMarkup(){
  return `<span class="mode-sw" role="group" aria-label="切換版本">
    <button type="button" data-mode="pro" aria-pressed="true">工作人員版</button>
    <button type="button" data-mode="easy" aria-pressed="false">易學版</button></span>`;
}

let homeBuilt = false;

function renderHome(){
  // 首頁內容全是靜態的。重繪會連帶重建 canvas 與新的 WebGL context，
  // 反覆切換分頁會耗盡瀏覽器的 context 上限，所以只建一次。
  if (homeBuilt) { updateHomeStats(); if (ORB) ORB.start(); return; }
  $('#view-home').innerHTML = homeMarkup();
  homeBuilt = true;
  mountUi($('#ui-home'));
  mountHome();
  updateHomeStats();
  const host = $('#view-home');
  let group = '全部';
  const filter = ()=>{
    const q = $('#hub-search').value.trim().toLocaleLowerCase();
    let count = 0;
    $$('.hp-row',host).forEach(row=>{
      const show = (group === '全部' || row.dataset.group === group) && row.textContent.toLocaleLowerCase().includes(q);
      row.hidden = !show; if(show) count++;
    });
    $('#hub-no-result').hidden = count > 0;
    $('#hub-result-count').textContent = count + ' 個工具';
  };
  $('#hub-search').addEventListener('input',filter);
  host.addEventListener('click',e=>{const b=e.target.closest('[data-hub-filter]');if(!b)return;group=b.dataset.hubFilter;$$('[data-hub-filter]',host).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));filter();});
}

/* ---------- 3D 球體：建立、互動、生命週期 ---------- */
let ORB = null;

function mountHome(){
  const canvas = $('#robot-canvas');
  if (!canvas) return;

  if (window.OrbScene && window.THREE) ORB = OrbScene.create(canvas);

  if (!ORB){
    // WebGL 不可用 → 顯示靜態圓環，並說清楚其他功能不受影響
    $('#hub-fallback')?.classList.add('on');
    canvas.style.display = 'none';
    const note = $('#hub-note');
    if (note){
      note.hidden = false;
      note.textContent = '這個瀏覽器沒有啟用 WebGL，球體改成靜態圖示；其他功能不受影響。';
    }
    return;
  }

  // hover 目錄 → 球體朝那一列偏轉。方向直接從版面幾何算出來，
  // 所以寬螢幕（左右分欄）跟手機（上下堆疊）都會看向正確的方向。
  const box = $('#hp-orb');
  const lookAt = el=>{
    if (!ORB || !box) return;
    const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    const dx = (a.left + a.width /2) - (b.left + b.width /2);
    const dy = (a.top  + a.height/2) - (b.top  + b.height/2);
    const m  = Math.hypot(dx, dy) || 1;
    ORB.look(dx / m * 0.9, dy / m * 0.9);
  };
  $$('#view-home .hp-row').forEach(row=>{
    const on  = ()=>lookAt(row);
    const off = ()=>{ if (ORB) ORB.look(null); };
    row.addEventListener('pointerenter', on);
    row.addEventListener('focus', on);
    row.addEventListener('pointerleave', off);
    row.addEventListener('blur', off);
  });

  ORB.start();
}

/* ============================================================
   課程引擎（四大原則、友善就醫共用）
   ------------------------------------------------------------
   一個課程 = 目錄頁 + N 課。每一課只有一個標題、一個主體、一個主要動作。
   ・目前在哪：課程列寫「第 n 課／共 N 課」＋分段進度條（文字與圖形並存，
     不只靠顏色）。
   ・可以去哪：目錄可跳任一課；每課底部有上一課／下一課；鍵盤 ← →。
   ・位置記住：離開課程再回來，從上次那一課繼續；目錄會標示走到哪。
   ============================================================ */
const COURSES = {};
const lessonKey = id => 'lesson:' + id;
const seenKey   = id => 'seen:' + id;
const resumeKey = id => 'resume:' + id;
function courseSeen(id){
  const value = store.get(seenKey(id), []);
  // 舊版只存最高課號，無法得知前面是否跳過；只保留能確認開啟過的那一課。
  const list = Array.isArray(value) ? value : (Number.isInteger(value) ? [value] : []);
  const total = COURSES[id].lessons.length;
  return [...new Set(list.filter(n=>Number.isInteger(n) && n > 0 && n <= total))];
}

function courseGo(id, n){
  const total = COURSES[id].lessons.length;
  n = Math.max(0, Math.min(total, +n || 0));
  store.set(lessonKey(id), n);
  if (n > 0){
    store.set(seenKey(id), [...new Set([...courseSeen(id), n])]);
    store.set(resumeKey(id), n);
  }
  renderCourse(id);
  window.scrollTo(0, 0);
  // 換課後把焦點放到標題：螢幕閱讀器會唸出新標題，鍵盤使用者也知道頁面換了
  const h = $('#view-' + id + ' .lesson-title, #view-' + id + ' .page-head h2');
  if (h){ h.setAttribute('tabindex', '-1'); h.focus({ preventScroll:true }); }
}

function renderCourse(id){
  const c = COURSES[id];
  const total = c.lessons.length;
  let n = +store.get(lessonKey(id), 0) || 0;
  if (n < 0 || n > total) n = 0;
  const host = $('#view-' + id);
  host.innerHTML = n === 0 ? courseLanding(id, c) : lessonPage(id, c, n);
  decorateHead(id);   // 回到課程目錄時頁首會重畫，引線要補回去
  host.onclick = e=>{
    const b = e.target.closest('[data-lesson]');
    if (!b) return;
    e.preventDefault();
    courseGo(id, +b.dataset.lesson);
  };
}

function courseLanding(id, c){
  const total = c.lessons.length;
  const seen = courseSeen(id);
  const last = store.get(resumeKey(id), seen[seen.length - 1] || 0);
  const resume = Number.isInteger(last) && last > 0 && last <= total ? last : (seen[seen.length - 1] || 0);
  // 走到一半再回目錄：主要動作是「繼續」，從頭開始退成次要
  const cta = (seen.length > 0 && seen.length < total)
    ? `<a href="#" class="btn" data-lesson="${resume}">繼續第 ${resume} 課${I.right}</a>
       <a href="#" class="btn ghost" data-lesson="1">從第 1 課開始</a>`
    : `<a href="#" class="btn" data-lesson="1">開始第 1 課${I.right}</a>`;

  return `
  <div class="page-head">
    <h2>${esc(c.title)}</h2>
    <p>${c.lead}</p>
    <div class="row course-cta">${cta}
      <span class="course-meta">${LU.cap}${total} 課${c.minutes ? `・約 ${c.minutes} 分鐘` : ''}${
        seen.length ? `・看過 ${seen.length} 課` : ''}</span></div>
  </div>

  <nav class="ls-list" aria-label="課程目錄">
    ${c.lessons.map((L, i)=>`
      <a href="#" class="ls-row${seen.includes(i + 1) ? ' seen' : ''}" data-lesson="${i + 1}">
        <span class="ls-i">${String(i + 1).padStart(2, '0')}</span>
        <span class="ls-t">${esc(L.t)}${
          seen.includes(i + 1) ? `<span class="ls-done">${LU.ok}看過了</span>` : ''}</span>
        <span class="ls-s">${esc(L.sub || '')}</span>
        ${I.right}
      </a>`).join('')}
  </nav>
  ${c.foot ? c.foot() : ''}`;
}

function lessonPage(id, c, n){
  const total = c.lessons.length;
  const L = c.lessons[n - 1];
  const prev = n > 1 ? c.lessons[n - 2] : null;
  const next = n < total ? c.lessons[n] : null;

  const prevBtn = prev
    ? `<a href="#" class="ln prev" data-lesson="${n - 1}">
         <span class="ln-k">上一課</span><span class="ln-t">${esc(prev.t)}</span></a>`
    : `<a href="#" class="ln prev" data-lesson="0">
         <span class="ln-k">回到</span><span class="ln-t">課程目錄</span></a>`;
  const nextBtn = next
    ? `<a href="#" class="ln next" data-lesson="${n + 1}">
         <span class="ln-k">下一課</span><span class="ln-t">${esc(next.t)}</span></a>`
    : (c.done ? c.done() :
      `<a href="#" class="ln next" data-lesson="0">
         <span class="ln-k">完成</span><span class="ln-t">回課程目錄</span></a>`);

  return `
  <div class="course-bar">
    <a href="#" class="cb-idx" data-lesson="0">${I.left}${esc(c.title)}</a>
    <span class="cb-pos">第 ${n} 課<span class="cb-of">／共 ${total} 課</span></span>
    <div class="cb-prog" role="img" aria-label="進度：第 ${n} 課，共 ${total} 課">
      ${c.lessons.map((_, i)=>`<i class="${i < n ? 'on' : ''}"></i>`).join('')}
    </div>
  </div>

  <div class="lesson">
    <h2 class="lesson-title">${esc(L.t)}</h2>
    ${L.sub ? `<p class="lesson-sub">${esc(L.sub)}</p>` : ''}
    <div class="lesson-body">${L.body()}</div>
  </div>

  <div class="lesson-nav">${prevBtn}${nextBtn}</div>`;
}

// 鍵盤：課程頁裡 ← → 翻課。輸入框有焦點時不攔。
document.addEventListener('keydown', e=>{
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const v = document.body.dataset.view;
  if (!COURSES[v]) return;
  const n = +store.get(lessonKey(v), 0) || 0;
  const total = COURSES[v].lessons.length;
  if (e.key === 'ArrowRight' && n < total){ e.preventDefault(); courseGo(v, n + 1); }
  if (e.key === 'ArrowLeft'  && n > 0)    { e.preventDefault(); courseGo(v, n - 1); }
});


/* ============================================================
   2. 課程：四大原則
   ------------------------------------------------------------
   一課一個習慣，第五課把四個組起來變成一則完整指令，
   然後主要動作直接帶去指令產生器。
   ============================================================ */
function prinLesson(p){
  const resById = {};
  RESOURCES.forEach(g=>g.items.forEach(i=>resById[i.id] = i));
  const r = resById[p.src];
  return {
    t: p.title,
    sub: p.one,
    body: ()=>`
      <p class="lesson-why">${esc(p.why)}</p>
      <div class="ba">
        <div class="ba-col bad">
          <b>${LU.no}這樣寫，AI 只能猜</b>
          <ul>${p.bad.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        </div>
        <div class="ba-col good">
          <b>${LU.ok}這樣寫，AI 知道要動哪裡</b>
          <ul>${p.good.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="note g">${esc(p.tip)}</div>
      ${r ? `<p class="lesson-src">延伸閱讀：
        <a href="${esc(r.u)}" target="_blank" rel="noopener">${esc(r.t)}${I.ext}</a>
        <span class="tag">${esc(r.who)}</span></p>` : ''}`
  };
}

COURSES.prin = {
  title:'四大原則',
  minutes:10,
  lead:'四個習慣，寫每一則指令的時候都套一遍。學會之後可以拿去做任何讀物、任何主題，' +
       '也不限於哪一個 AI 工具。一課一個習慣，最後一課把四個組起來。',
  lessons:[
    ...PRINCIPLES.map(prinLesson),
    { t:'組起來：一則完整的指令長這樣',
      sub:'四個原則同時用上，就是這個樣子。這一則可以直接貼出去。',
      body: ()=>`
        <div class="anat">${ANATOMY.parts.map(a=>`
          <div class="anat-row">
            <div class="anat-tag">${esc(a.tag)} <span class="tag">原則 ${a.p}</span></div>
            <pre>${esc(a.text)}</pre>
          </div>`).join('')}
        </div>
        ${promptBox(ANATOMY.parts.map(a=>a.text).join('\n\n'), '整段複製起來看看', 'o')}
        <div class="note b"><b>要做影片的話，這四個原則原封不動搬過去。</b>
          差別只在「不變的那一段」從一條變三條——角色、固定物件、貫穿動作。
          <a href="#" data-go="vid">去影片指令 →</a></div>` }
  ],
  done: ()=>`<a href="#" class="ln next" data-go="gen">
    <span class="ln-k">下一步</span><span class="ln-t">去指令產生器，做一份自己的</span></a>`
};

function renderPrin(){ renderCourse('prin'); }

/* ============================================================
   3. 指令產生器（設定 + 腳本 + 輸出，全部在這一頁）
   ============================================================ */
let SCRIPT = readSaved('script', rows=>checkedRows(rows, false), []);
function saveScript(){ store.set('script', SCRIPT); }
function newRow(t){ return { type:t||'do', text:'', scene:'', extra:'', layout:'' }; }

function seedScript(){
  const adult = CFG.kind === 'adult';
  SCRIPT = [
    {type:'cover',   text:CFG.title||'', scene:'', extra:'', layout:''},
    {type:'preface', text: adult
       ? '這本手冊說明我的權利。\n我可以自己決定。\n我也可以請人幫我。'
       : '這本手冊是我的規則。\n遵守這些規則，我可以做得很好，也能保護自己。', scene:'', extra:'', layout:''},
    {type:'section', text:'', scene:'', extra:'', layout:''},
    {type:'steps',   text:'', scene:'', extra:'', layout:''},
    {type:'do',      text:'', scene:'', extra:'', layout:''},
    {type:'dont',    text:'', scene:'', extra:'', layout:''},
    {type:'question',text:'如果遇到……，我應該...', scene:'', extra:'', layout:''},
    {type:'answer',  text:'', scene:'', extra:'', layout:''},
    {type:'summary', text: adult
       ? '下面這些我都知道了嗎？知道的可以打勾：'
       : '我都有遵守下面的規則嗎？做到的人可以打勾：', scene:'', extra:'', layout:''}
  ];
  saveScript();
}

/* ============================================================
   改了哪裡
   ------------------------------------------------------------
   回饋：一鍵套用之後，使用者不知道改了什麼。
   所以凡是「一次改好幾欄」的動作（套範本、切類型、選讀者、選畫風）都走 withDiff()：
   改之前拍快照，改完比對，改到的欄位——
     1. 標成螢光黃，前兩秒閃兩下（系統設了減少動態效果就不閃）
     2. 標籤前面加「改了」兩個字，不只靠顏色
     3. 下面的指令裡，對應的那段文字也一起標黃
     4. 下方跳出一行提示，說這次改了哪幾項（螢幕閱讀器也會唸）
   （原本上方還有一個列出改了哪些、可以復原的黃色框，使用者說不需要，拿掉了。）
   使用者自己打字改的不標，那是他自己知道的；他一動那一欄，那一欄的標記就收掉。
   ============================================================ */
const CHG_FIELDS = {
  book:{ kind:'作品類型', textMode:'圖上的文字', title:'書名', audience:'閱讀對象',
         hero:'主角設定', sidekick:'配角設定', style:'畫風', palette:'主色' },
  video:{ kind:'主角類型', aspect:'畫面比例', accentOn:'說話的腔調', title:'片名',
          audience:'給誰看', hero:'主角（中文）', heroEn:'角色軸（英文）',
          sidekickEn:'配角（英文）', motif:'固定物件', motifEn:'固定物件（英文）',
          light:'固定光線', lightEn:'固定光線（英文）', motion:'貫穿動作',
          vstyle:'畫風', vstyleEn:'畫風（英文）' }
};
// 這些欄位的內容會原樣出現在指令裡，所以可以在指令中找到、標黃
const CHG_TEXT = ['title','audience','hero','sidekick','style','palette','heroEn','sidekickEn',
                  'motif','motifEn','light','lightEn','motion','vstyle','vstyleEn'];
const VACCENT = {
  on :'A warm Taiwanese Mandarin accent (台灣國語), slow, gentle and reassuring tone.',
  off:'A calm, gentle and reassuring tone.'
};
// 用 var：promptBox 可能比這一段更早被呼叫，let 會卡在暫時死區
var CHG = { keys:[], label:'', before:null, fresh:false };
var THEME_NOTE = '';

const medOf = ()=> CFG.medium === 'video' ? 'video' : 'book';
const reduceMotion = ()=> {
  try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; }
};
function chgReset(){ CHG = { keys:[], label:'', before:null, fresh:false }; }

function withDiff(label, fn, opt){
  const before = Object.assign({}, CFG);
  fn();
  saveCfg();
  const F = CHG_FIELDS[medOf()];
  const keys = Object.keys(F).filter(k => String(CFG[k] ?? '') !== String(before[k] ?? ''));
  CHG = { keys, label, before, fresh:true };
  renderGen();
  if (!(opt && opt.silent)) toast(keys.length
    ? label + '：改了 ' + keys.map(k=>F[k]).join('、')
    : label + '：設定本來就一樣，沒有改到');
  return keys;
}

// 使用者自己動了某一欄：那一欄的標記收掉
function chgClear(k){
  const i = CHG.keys.indexOf(k);
  if (i < 0) return;
  CHG.keys.splice(i, 1);
  paintChanged();
}

function chgVals(){
  const out = [];
  CHG.keys.forEach(k=>{
    if (CHG_TEXT.indexOf(k) < 0) return;
    const v = String(CFG[k] || '').trim();
    if (v.length >= 2) out.push(v);
  });
  if (CHG.keys.indexOf('textMode') >= 0 && CFG.textMode === 'reserve')
    out.push('【覆寫上面：這一頁的字不要畫上去】');
  if (CHG.keys.indexOf('aspect') >= 0){
    const a = ASPECTS.find(x=>x.id===CFG.aspect);
    if (a) out.push('畫面比例 ' + a.name);
  }
  if (CHG.keys.indexOf('accentOn') >= 0) out.push(CFG.accentOn ? VACCENT.on : VACCENT.off);
  return out;
}
// 單次替換：一個 regex 掃過去，不會在剛插進去的 <mark> 標籤裡再比對到
function markChanged(html){
  const vals = (CHG && CHG.keys.length) ? chgVals() : [];
  if (!vals.length) return html;
  const pat = vals.map(v=>esc(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                  .sort((a,b)=>b.length-a.length).join('|');
  return html.replace(new RegExp(pat, 'g'), m=>'<mark class="chg-m">' + m + '</mark>');
}
function chgHits(text){
  if (!CHG || !CHG.keys.length) return false;
  return chgVals().some(v => text.indexOf(v) >= 0);
}

/* 把目前的 CHG 畫到畫面上。只增減有變的標記，
   已經在畫面上的不重加——不然改一欄，其他欄會跟著再閃一次。 */
function paintChanged(){
  const host = $('#view-gen'); if (!host) return;
  const pre = medOf() === 'video' ? '#v-' : '#c-';
  const F = CHG_FIELDS[medOf()];
  const anim = CHG.fresh && !reduceMotion();

  const want = new Set();
  CHG.keys.forEach(k=>{
    const ctl = $(pre + k, host);
    if (ctl){ want.add(ctl); return; }
    const opt = $('[data-ck="' + k + '"]', host);
    if (opt) want.add(opt);
  });
  $$('.chg', host).forEach(el=>{
    if (want.has(el)) return;
    el.classList.remove('chg', 'chg-anim');
    const lab = el.closest('.field') ? el.closest('.field').querySelector('label') : el.querySelector('.opt-l');
    // 同一個欄位裡還有別的控制項被標著（例如中英文兩格），標籤就留著
    const f = el.closest('.field');
    if (lab && !(f && f.querySelector('.chg'))){ const b = lab.querySelector('.chg-b'); if (b) b.remove(); }
  });
  want.forEach(el=>{
    if (el.classList.contains('chg')) return;
    el.classList.add('chg');
    if (anim) el.classList.add('chg-anim');
    const lab = el.closest('.field') ? el.closest('.field').querySelector('label') : el.querySelector('.opt-l');
    if (lab && !lab.querySelector('.chg-b'))
      lab.insertAdjacentHTML('afterbegin', '<span class="chg-b' + (anim ? ' chg-pop' : '') + '">改了</span>');
  });
  // 被改到的欄位如果收在「更多設定」裡面，摺疊的標題也要標「改了」，
  // 不然一鍵套用之後，使用者看不到收起來的那幾欄也被換掉了
  $$('details.gx-more', host).forEach(d=>d.classList.toggle('has-chg', !!d.querySelector('.chg')));
  CHG.fresh = false;
}

/* ---------- 範本：使用者自己存 ----------
   回饋：不要預先塞一排範本，讓使用者自己新增。
   所以主列只放「我的範本」和「存成我的範本」；內建的收進摺疊區當範例。
   範本只存設定，不存逐頁腳本——套範本不應該把人家寫好的腳本蓋掉。 */
const TPL_KEYS = {
  book :['kind','textMode','title','audience','hero','sidekick','heroEn','sidekickEn',
         'style','palette','border'],
  video:['kind','aspect','accentOn','title','audience','hero','heroEn','sidekick','sidekickEn',
         'motif','motifEn','light','lightEn','motion','vstyle','vstyleEn']
};
const myThemes = ()=>readSaved('mythemes', checkedThemes, []);
const saveMyThemes = a => store.set('mythemes', a);

/* 範本區放在設定的最上面，而且內建範例直接攤開——
   「點一個範例，設定全部填好，再改幾個字」是做出第一本最快的路。
   舊版把內建範例收在摺疊裡，很多人根本沒發現它在那裡。 */
function tplBlock(){
  const med = medOf();
  const mine = myThemes().filter(t=>t.medium === med);
  const built = med === 'video' ? VIDEO_THEMES : THEMES;
  return `
  <div class="tpl gx-start">
    <div class="gx-lbl">從範例開始<span class="hint">點一個，整組設定幫你填好；改到的欄位會標黃</span></div>
    <div class="chips">${built.map((t,i)=>`
      <button type="button" class="chip" data-bt="${i}">${esc(t.name)}</button>`).join('')}</div>
    <div class="gx-lbl">我的範本<span class="hint">自己調好的設定存起來，下次按一下全部套回來（只存設定，不動腳本）</span></div>
    <div class="chips">
      ${mine.map(t=>`<span class="tpl-chip">
        <button type="button" class="chip" data-my="${esc(t.id)}">${esc(t.name)}</button><button
          type="button" class="tpl-x" data-mydel="${esc(t.id)}" title="刪除這個範本"
          aria-label="刪除範本：${esc(t.name)}">${I.close}</button></span>`).join('')}
      <button type="button" class="chip tpl-add" id="tpl-add">${I.plus}存成我的範本</button>
    </div>
    <form class="tpl-save" id="tpl-save" hidden>
      <label for="tpl-name">範本名稱</label>
      <input type="text" id="tpl-name" maxlength="30" autocomplete="off">
      <button type="submit" class="btn sm">儲存</button>
      <button type="button" class="btn sm ghost" id="tpl-cancel">取消</button>
    </form>
  </div>
  <div class="note g" id="theme-note" ${THEME_NOTE ? '' : 'hidden'}>${esc(THEME_NOTE)}</div>`;
}

function applyBookTheme(t){
  // 沒標 kind 的都是兒童範本。之前直接改 CFG.kind，
  // 套過就醫範本再套兒童範本時，類型和讀者會留在成人版
  const k = t.kind || 'child';
  if (k !== CFG.kind) switchKind(k);
  CFG.title = t.name;
  CFG.hero  = t.hero;
  if (t.audience) CFG.audience = t.audience;
  if (t.sidekick) CFG.sidekick = t.sidekick;
}
function applyVideoTheme(t){
  const k = t.kind || CFG.kind;
  if (k !== CFG.kind) switchKind(k);
  CFG.title = t.name;
  ['hero','sidekick','motif','light','motion','aspect'].forEach(key=>{
    if (t[key] != null) CFG[key] = t[key];
  });
  // 範本資料用 motif_en／light_en（底線），設定欄位是 motifEn／lightEn。
  // 之前這裡直接讀 t.motifEn，永遠是 undefined，英文的固定物件和光線從來沒被套上
  if (t.motif_en) CFG.motifEn = t.motif_en;
  if (t.light_en) CFG.lightEn = t.light_en;
  // 範本的配角只有中文，英文那欄先跟著帶，使用者自己潤
  if (t.sidekick != null) CFG.sidekickEn = t.sidekick;
  CFG.heroEn   = t.hero_en  || CFG.heroEn;
  CFG.vstyle   = t.style    || CFG.vstyle;
  CFG.vstyleEn = t.style_en || CFG.vstyleEn;
}

function wireTpl(){
  const med = medOf();
  const built = med === 'video' ? VIDEO_THEMES : THEMES;

  $$('[data-my]').forEach(b=>b.onclick=()=>{
    const t = myThemes().find(x=>x.id === b.dataset.my);
    if (!t) return;
    THEME_NOTE = '';
    withDiff('套用範本「' + t.name + '」', ()=>{ Object.assign(CFG, t.cfg); });
  });
  $$('[data-mydel]').forEach(b=>b.onclick=()=>{
    const all = myThemes();
    const t = all.find(x=>x.id === b.dataset.mydel);
    if (!t) return;
    if (!confirm('刪除範本「' + t.name + '」？\n只會刪掉範本，現在的設定不會變。')) return;
    saveMyThemes(all.filter(x=>x !== t));
    renderGen(); toast('已刪除範本「' + t.name + '」');
  });

  const form = $('#tpl-save'), name = $('#tpl-name');
  $('#tpl-add').onclick = ()=>{
    form.hidden = false;
    name.value = (CFG.title || '').trim() || '我的範本';
    name.focus(); name.select();
  };
  $('#tpl-cancel').onclick = ()=>{ form.hidden = true; $('#tpl-add').focus(); };
  form.onsubmit = e=>{
    e.preventDefault();
    const nm = name.value.trim();
    if (!nm){ name.focus(); return; }
    const all = myThemes();
    const old = all.find(x=>x.medium === med && x.name === nm);
    if (old && !confirm('已經有一個叫「' + nm + '」的範本。\n要用現在的設定蓋掉它嗎？')) return;
    const cfg = {};
    TPL_KEYS[med].forEach(k=>{ if (CFG[k] !== undefined) cfg[k] = CFG[k]; });
    const t = { id: old ? old.id : 't' + Date.now().toString(36), name:nm, medium:med, cfg };
    saveMyThemes(old ? all.map(x=>x === old ? t : x) : all.concat(t));
    renderGen(); toast('已存成範本「' + nm + '」');
  };

  $$('[data-bt]').forEach(b=>b.onclick=()=>{
    const t = built[+b.dataset.bt];
    if (!t) return;
    THEME_NOTE = t.note || '';
    withDiff('套用範本「' + t.name + '」', ()=>{
      if (med === 'video') applyVideoTheme(t); else applyBookTheme(t);
    });
  });
}

/* ---------- 閱讀對象快速套用 ----------
   按鈕常駐；那段七行的讀者描述和出處說明收進「看／改讀者描述」，
   要改的人打開，不改的人不用看。 */
function audBlock(){
  const med = medOf();
  return `<div class="aud" role="group" aria-label="${med === 'video' ? '觀眾' : '閱讀對象'}快速套用，依衛福部標準">
    ${AUD_AGES.map(A=>`
      <div class="aud-r"><span class="aud-a">${A.age}</span>
        ${AUDIENCES.filter(a=>a.age === A.age).map(a=>`<button type="button" class="chip"
          data-aud="${a.id}" aria-label="${a.age}・${a.lv}：${esc(a.def)}" title="${esc(a.def)}"
          ${CFG.audience === a[med] ? 'aria-pressed="true"' : ''}>${esc(a.lv)}</button>`).join('')}
      </div>`).join('')}
  </div>`;
}
function audSrcNote(){
  return `<p class="aud-src">分級依${esc(AUD_SRC.level)}；
      寫法依<a href="${esc(AUD_SRC.guideUrl)}" target="_blank" rel="noopener">${esc(AUD_SRC.write)}</a>。
      每頁幾行是平台照指南「每行只放 1 個資訊、一頁不要放太多內容」換算的建議。
      同一級的人差異很大，套上之後照案主實際情況改，做好最好請案主或品管員看過。</p>`;
}
function wireAud(){
  const med = medOf();
  $$('[data-aud]').forEach(b=>b.onclick=()=>{
    const a = AUDIENCES.find(x=>x.id === b.dataset.aud);
    if (!a) return;
    // 先切類型、再填讀者：switchKind 會把沒動過的讀者欄換成類型預設，順序反了會被蓋掉
    withDiff((med === 'video' ? '觀眾' : '閱讀對象') + '換成「' + a.age + '・' + a.lv + '」', ()=>{
      if (a.kind !== CFG.kind) switchKind(a.kind);
      CFG.audience = a[med];
    });
  });
}

/* 閱讀對象放進起手式。放在最後那句「請先回覆」之前，
   並且明講「跟上面的句數行數不同時以這裡為準」——最後一道指令權重最高。 */
function withAudience(mp, who, what){
  const a = (CFG.audience || '').trim();
  if (!a) return mp;
  const block = '【' + who + '，' + what + '的難度照這個調】\n' + a +
                '\n上面規則裡的句數、行數、字數跟這裡不一樣時，以這裡為準。\n';
  const i = mp.lastIndexOf('\n請先回覆');
  return i > 0 ? mp.slice(0, i) + '\n' + block + mp.slice(i) : mp + '\n\n' + block;
}

/* 讀物和影音共用的形式開關。兩邊都放在設定卡最上面同一個位置，
   切換時只換下半段，使用者不會覺得跳到另一個工具。 */
function mediumSeg(){
  return `
    <div class="opt">
      <div class="opt-l">作品形式<span class="hint">同一套原則，輸出不一樣</span></div>
      <div class="seg" role="group" aria-label="作品形式">
        ${MEDIA.map(m=>`<button type="button" data-med="${m.id}"
          aria-pressed="${CFG.medium===m.id}"><b>${esc(m.name)}</b><i>${esc(m.sub)}</i></button>`).join('')}
      </div>
    </div>`;
}
/* label 留空＝不另外印標籤（放在「讀者」欄位裡的時候，欄位本身已經有標籤了） */
function kindSeg(label, hint, aria){
  return `
    <div class="opt" data-ck="kind">
      ${label ? `<div class="opt-l">${esc(label)}<span class="hint">${esc(hint)}</span></div>` : ''}
      <div class="seg" role="group" aria-label="${esc(label || aria || '作品類型')}">
        ${KINDS.map(k=>`<button type="button" data-kind="${k.id}"
          aria-pressed="${CFG.kind===k.id}"><b>${esc(k.name)}</b><i>${esc(k.sub)}</i></button>`).join('')}
      </div>
    </div>`;
}
function wireKind(){
  $$('[data-kind]').forEach(b=>b.onclick=()=>{
    if (b.dataset.kind === CFG.kind) return;
    let kept = [];
    const nm = kindOf(b.dataset.kind).name;
    const keys = withDiff('換成「' + nm + '」', ()=>{ kept = switchKind(b.dataset.kind); }, { silent:true });
    const F = CHG_FIELDS[medOf()];
    toast('換成「' + nm + '」：改了 ' + keys.map(k=>F[k]).join('、') +
          (kept.length ? '；你自己改過的 ' + kept.length + ' 欄保留沒動' : ''));
  });
}

function wireMedium(){
  $$('[data-med]').forEach(b=>b.onclick=()=>{
    if (b.dataset.med === CFG.medium) return;
    if ($('#ws-drawer')?.open) $('#ws-drawer').close();
  chgReset(); THEME_NOTE = '';
    CFG.medium = b.dataset.med; saveCfg(); renderGen();
    toast(CFG.medium === 'video' ? '換成影片：逐鏡腳本' : '換成讀物：逐頁腳本');
  });
}

/* 匯出入是兩種形式共用的：一份檔案同時帶走設定、逐頁腳本和逐鏡腳本，
   不然做完讀物再做影片會覆蓋掉對方。 */
function wireIO(){
  $('#s-export').onclick = ()=>{
    download((CFG.title||'作品')+'_腳本.json',
      JSON.stringify({cfg:CFG, script:SCRIPT, vscript:VSCRIPT, mythemes:myThemes()}, null, 2));
    toast('已匯出，可以備份或給同事');
  };
  $('#s-import').onclick = ()=> $('#s-file').click();
  $('#s-file').onchange = e=>{
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      let d;
      try{ d = checkedBackup(JSON.parse(r.result)); }
      catch(err){ toast('檔案格式不對，原有資料沒有變更'); return; }
      const changes = {};
      if (hasOwn(d, 'cfg')) changes.cfg = {...DEFAULTS, ...d.cfg};
      if (hasOwn(d, 'script')) changes.script = d.script;
      if (hasOwn(d, 'vscript')) changes.vscript = d.vscript;
      // 同事給的範本：同形式同名的更新，其餘加進來。
      if (hasOwn(d, 'mythemes')){
        const all = myThemes();
        d.mythemes.forEach(t=>{
          const i = all.findIndex(x=>x.medium === t.medium && x.name === t.name);
          if (i >= 0) all[i] = {...t, id:all[i].id}; else all.push(t);
        });
        changes.mythemes = all;
      }
      try{
        store.writeAll(changes);
      }catch(err){ toast('匯入失敗，原有資料沒有變更'); return; }
      if (hasOwn(changes, 'cfg')) CFG = changes.cfg;
      if (hasOwn(changes, 'script')) SCRIPT = changes.script;
      if (hasOwn(changes, 'vscript')) VSCRIPT = changes.vscript;
      PG_OPEN.clear(); VS_OPEN.clear();
      renderGen(); toast('匯入成功');
    };
    r.onerror = ()=>toast('讀取檔案失敗，請再試一次');
    r.readAsText(f,'utf-8'); e.target.value='';
  };
}

/* ============================================================
   產生器：一頁四段
   ------------------------------------------------------------
   A 設定、B 開場、C 逐頁（影片是逐鏡）、D 收尾，同一頁從上往下捲。
   舊版繁瑣的地方不在「一頁」，而在這幾件事，所以只改這幾件：
   ・逐頁腳本和逐頁指令原本是兩份清單（C 寫字、D 一大串指令），
     合併成一頁一張卡片：寫完這一頁的文字，「複製這頁指令」就在同一張上。
   ・設定只攤開必填的幾樣（書名、讀者、主角、畫風），其他收進「更多設定」。
   ・內建範例原本收在摺疊裡，改成直接攤開。
   （2026-09 試過「一次只看一步」的分步版，使用者不要，改回一頁。）
   ============================================================ */
const GX_OPEN = {};          // 哪些「更多設定」是打開的，重畫之後維持原狀
const PG_OPEN = new Set();   // 哪幾頁的「看指令」是打開的

// 收起來的「更多」區塊。打開過的會記住，改一個欄位重畫之後不會又收回去
function moreBox(key, title, hint, inner){
  return `<details class="gx-more" data-more="${key}" ${GX_OPEN[key] ? 'open' : ''}>
    <summary><span class="gx-more-t">${esc(title)}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</summary>
    <div class="gx-more-b">${inner}</div></details>`;
}
function wireMore(root){
  $$('details.gx-more', root).forEach(d=>d.addEventListener('toggle', ()=>{ GX_OPEN[d.dataset.more] = d.open; }));
}

function renderGen(){
  const video = medOf() === 'video';
  const secs = video
    ? ['這支片的設定', '開場：先讓語言模型當編劇（整支片只做一次）', '逐鏡：寫動作、複製指令', '收尾：接片、配音、上字幕']
    : ['這本書的設定', '開場：貼這兩段（整本只做一次）', '逐頁：寫文字、複製指令', '收尾：排版、加頁碼、輸出 PDF'];
  $('#view-gen').innerHTML = `
  <div class="page-head">
    <h2>指令產生器</h2>
    <p>${video ? '填一次三條中心軸，之後每一鏡的指令都會自動套上。'
               : '填一次設定，之後每一頁的指令都會自動套上「原則 2 的不變段落」。'}
       <span class="tag">動手約 ${video ? 20 : 15} 分鐘</span></p>
  </div>
  ${secs.map((t, i)=>`
  <section class="card gx-sec">
    <h3><span class="step-n">${'ABCD'[i]}</span>${esc(t)}</h3>
    <div id="gx-${i + 1}"></div>
  </section>`).join('')}`;

  const fns = video ? [vStepSet, vStepOpen, vStepShots, vStepEnd]
                    : [bStepSet, bStepOpen, bStepPages, bStepEnd];
  fns.forEach((fn, i)=>fn($('#gx-' + (i + 1))));
  wireMedium();
  paintChanged();
  decorateHead('gen');   // 產生器常常整頁重畫，頁首的引線要跟著補回去
}

// 同一頁四段都看得到，所以上面一改，下面要跟著動
function drawBookEnd(){ const h = $('#gx-4'); if (h && medOf() === 'book') bStepEnd(h); }
function drawVideoEnd(){ const h = $('#gx-4'); if (h && medOf() === 'video') vStepEnd(h); }
// A 設定一改：B 的開場指令、C 每張卡片的標籤與指令、D 收尾都跟著更新
function bookLive(){
  genOpen();
  SCRIPT.forEach((_, i)=>refreshPageCard(i));
  drawBookEnd();
}
function videoLive(){
  vGenOpen();
  VSCRIPT.forEach((_, i)=>refreshShotCard(i));
  if (GX_OPEN.vmulti) drawMulti();
}

/* ---------- 讀物 1：設定 ---------- */
function bStepSet(body){
  const presets = STYLE_PRESETS.filter(p=>p.for === 'both' || p.for === CFG.kind);
  body.innerHTML = `
  ${mediumSeg()}
  ${tplBlock()}

  <div class="field"><label for="c-title">書名</label>
    <input type="text" id="c-title" value="${esc(CFG.title)}" placeholder="例如：我會自己刷牙"></div>

  <div class="field"><label>讀者<span class="hint">決定起手式的語氣、人物比例與字級</span></label>
    ${kindSeg('', '', '作品類型')}
    ${audBlock()}
    ${moreBox('aud', '看／改讀者描述', '這一段會放進起手式', `
      <textarea id="c-audience" rows="6" aria-label="讀者描述">${esc(CFG.audience)}</textarea>
      ${audSrcNote()}`)}
  </div>

  <div class="field"><label for="c-hero">主角設定<span class="hint">★每一頁都會原封不動貼這一段（原則 2）</span></label>
    <textarea id="c-hero" rows="3">${esc(CFG.hero)}</textarea></div>

  <div class="field"><label>畫風<span class="hint">點一個就好，畫風和主色會一起換</span></label>
    <div class="chips">${presets.map(p=>`<button type="button" class="chip" data-style="${esc(p.name)}"
      ${CFG.style === p.style ? 'aria-pressed="true"' : ''}>${esc(p.name)}</button>`).join('')}</div></div>

  ${moreBox('adv', '更多設定', '配角、畫風細節、主色、圖上的文字——不改也能用', `
    <div class="field"><label for="c-sidekick">配角設定<span class="hint">陌生人不用寫，起手式已統一成灰色剪影</span></label>
      <textarea id="c-sidekick" rows="2">${esc(CFG.sidekick)}</textarea></div>
    <div class="grid g2">
      <div class="field"><label for="c-style">畫風的文字<span class="hint">原則 1：都是可以檢查的條件</span></label>
        <textarea id="c-style" rows="3">${esc(CFG.style)}</textarea></div>
      <div class="field"><label for="c-palette">主色<span class="hint">3～4 色就好</span></label>
        <input type="text" id="c-palette" value="${esc(CFG.palette)}"></div>
    </div>
    <div class="opt" data-ck="textMode">
      <div class="opt-l">圖上的文字<span class="hint">中文字模型常畫錯，錯了就換第二個</span></div>
      <div class="seg" role="group" aria-label="圖上的文字">
        ${TEXT_MODES.map(m=>`<button type="button" data-tm="${m.id}"
          aria-pressed="${CFG.textMode === m.id}"><b>${esc(m.name)}</b><i>${esc(m.sub)}</i></button>`).join('')}
      </div>
    </div>
    <div class="note b" id="tm-note" ${CFG.textMode === 'reserve' ? '' : 'hidden'}>
      <b>留白框模式：</b>每一頁的指令最後會多一段覆寫，叫 AI 只畫乾淨的空白框、不要寫字。
      文字在 D「收尾」用 Word 打上去，字級、字體、斷行都由你決定，不會有錯字。
    </div>`)}`;

  ['title','audience','hero','sidekick','style','palette'].forEach(k=>{
    $('#c-' + k).addEventListener('input', e=>{
      chgClear(k);
      CFG[k] = e.target.value; saveCfg(); bookLive();
    });
  });
  $$('[data-style]', body).forEach(b=>b.onclick=()=>{
    const p = STYLE_PRESETS.find(x=>x.name === b.dataset.style);
    if (!p) return;
    // 畫風和主色是一組的，分開套會出現「印章風配四個顏色」這種矛盾
    withDiff('畫風換成「' + p.name + '」', ()=>{ CFG.style = p.style; CFG.palette = p.palette; });
  });
  $$('[data-tm]', body).forEach(b=>b.onclick=()=>{
    if (b.dataset.tm === CFG.textMode) return;
    const m = TEXT_MODES.find(x=>x.id === b.dataset.tm);
    withDiff('圖上的文字改成「' + (m ? m.name : b.dataset.tm) + '」', ()=>{ CFG.textMode = b.dataset.tm; });
  });
  wireKind(); wireTpl(); wireAud(); wireMore(body);
}

/* ---------- 讀物 2：開場 ---------- */
function bStepOpen(body){
  body.innerHTML = `
  <div class="note o">開一個<b>全新的</b>對話 → 貼第 1 段 → 等它回「已了解」→ 貼第 2 段做角色設定表，
    確認人長對了再往下一步。</div>
  <div id="gen-open"></div>`;
  genOpen();
}

/* ---------- 讀物 3：逐頁（寫文字＋複製指令在同一張卡片） ---------- */
function bStepPages(body){
  body.innerHTML = `
  <p class="gx-lead">一頁一張卡片：選頁型、寫文字，寫好就按「複製這頁指令」貼給 AI，看滿意了再做下一頁。
    文字最好全部先寫完再開始生圖，邊生邊想一定會亂。</p>
  <div class="gx-tools">
    <button class="btn" id="s-add">${I.plus}新增一頁</button>
    <button class="btn ghost" id="s-seed">套用頁面骨架</button>
    <span class="spacer"></span>
    <button class="btn sm ghost" id="s-export">${I.down}匯出備份</button>
    <button class="btn sm ghost" id="s-import">${I.up}匯入</button>
    <button class="btn sm ghost" id="s-clear">${I.trash}清空</button>
    <input type="file" id="s-file" accept=".json" hidden>
  </div>
  <div id="s-status"></div>
  <div class="pgc-list" id="s-list"></div>
  <div class="gx-tools gx-all" id="s-all"></div>`;

  $('#s-add').onclick = ()=>{
    SCRIPT.push(newRow()); saveScript(); drawPages();
    const t = $('.pgc:last-child .pgc-text'); if (t) t.focus();
  };
  $('#s-seed').onclick = ()=>{
    if (SCRIPT.length && !confirm('這會覆蓋現有腳本，確定嗎？')) return;
    seedScript(); PG_OPEN.clear(); drawPages(); toast('已套用骨架');
  };
  $('#s-clear').onclick = ()=>{
    if (!confirm('確定清空全部頁面？')) return;
    SCRIPT = []; saveScript(); PG_OPEN.clear(); drawPages();
  };
  wireIO();

  // 卡片會整批重畫，事件掛在外層清單上（只掛一次）
  const list = $('#s-list');
  list.addEventListener('input', e=>{
    const el = e.target.closest('[data-f]'); if (!el) return;
    const i = +el.dataset.i, f = el.dataset.f;
    SCRIPT[i][f] = el.value; saveScript();
    if (f === 'type') drawPages(); else refreshPage(i);
  });
  list.addEventListener('click', e=>{
    const mv = e.target.closest('[data-mv]');
    if (mv){
      const i = +mv.dataset.i, j = i + (+mv.dataset.mv);
      if (j < 0 || j >= SCRIPT.length) return;
      [SCRIPT[i], SCRIPT[j]] = [SCRIPT[j], SCRIPT[i]]; saveScript(); PG_OPEN.clear(); drawPages();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del){
      const i = +del.dataset.del;
      // 有寫字的頁才問一次：誤按刪掉一整頁的文字很傷
      if ((SCRIPT[i].text || '').trim() && !confirm('刪除第 ' + (i + 1) + ' 頁？這一頁寫的文字會一起刪掉。')) return;
      SCRIPT.splice(i, 1); saveScript(); PG_OPEN.clear(); drawPages();
      return;
    }
    const cp = e.target.closest('[data-cp]');
    if (cp){ copyText(buildPagePrompt(+cp.dataset.cp)); flashCopied(cp); }
  });
  // <details> 的 toggle 不會冒泡，要用捕獲階段才收得到
  list.addEventListener('toggle', e=>{
    const d = e.target; if (!d.matches || !d.matches('details.pgc-more')) return;
    const i = +d.dataset.pg;
    if (d.open){ PG_OPEN.add(i); const p = $('#pgp-' + i); if (p) p.innerHTML = pagePrompt(i); }
    else PG_OPEN.delete(i);
  }, true);

  drawPages();
}

// 複製按鈕變綠一下，讓人知道「這一頁我貼過了」
function flashCopied(btn){
  btn.classList.add('copied');
  clearTimeout(btn._t);
  btn._t = setTimeout(()=>btn.classList.remove('copied'), 1600);
}

function genOpen(){
  const host = $('#gen-open'); if (!host) return;
  host.innerHTML =
    promptBox(withAudience(MASTER_PROMPTS[CFG.kind] || MASTER_PROMPTS.child, '這本書的讀者', '文字和畫面'),
      '第 1 段　起手式指令（' + kindOf(CFG.kind).name + '）',
      CHG.keys.indexOf('kind') >= 0 ? 'chg-box' : '') +
    promptBox(
`請先幫我畫一張「角色設定表」，先不要畫故事頁。

主角：${CFG.hero || '【請填寫：主角設定】'}
配角：${CFG.sidekick || '（無）'}
畫風：${CFG.style}

請在同一張 A4 直式圖裡，畫出主角的：正面全身、側面全身，
以及開心、生氣、難過、思考四種表情的半身特寫，每個下面標註中文說明。
背景用米白色紙紋，人物之間留白清楚。

這張圖是之後每一頁的依據。接下來每一頁，主角的臉、髮型、衣服顏色
都必須和這張表完全一致，不可以更改。`, '第 2 段　角色設定表', 'g');
}

/* 上移、下移、刪除三顆小鈕，讀物和影片的卡片共用 */
const CARD_UP   = '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 12.5 10 8l4.5 4.5"/></svg>';
const CARD_DOWN = '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 7.5 10 12l4.5-4.5"/></svg>';
function cardActs(i, mv, del, unit){
  return `<span class="pgc-act">
    <button type="button" class="icon-btn" ${mv}="-1" data-i="${i}" title="上移" aria-label="第 ${i + 1} ${unit}上移">${CARD_UP}</button>
    <button type="button" class="icon-btn" ${mv}="1" data-i="${i}" title="下移" aria-label="第 ${i + 1} ${unit}下移">${CARD_DOWN}</button>
    <button type="button" class="icon-btn del" ${del}="${i}" title="刪除" aria-label="刪除第 ${i + 1} ${unit}">${I.close}</button>
  </span>`;
}

function pageTags(i){
  const r = SCRIPT[i];
  return ((!r.text || !r.text.trim()) ? '<span class="tag hot">缺文字</span>' : '') +
         (chgHits(buildPagePrompt(i)) ? '<span class="tag chg-t">有更新</span>' : '');
}
// 「看指令」裡面的東西：這個頁型必備／常見錯誤，加上完整指令
function pagePrompt(i){
  const r = SCRIPT[i];
  const t = PAGE_TYPES.find(x=>x.id === r.type) || PAGE_TYPES[0];
  return `<div class="pg-rules">
      <b>${LU.ok}${esc(t.name)}必備：</b>${t.must.map(m=>esc(m)).join('　·　')}<br>
      <b class="x">${LU.no}常見錯誤：</b>${t.avoid.map(m=>esc(m)).join('　·　')}
    </div>
    ${promptBox(buildPagePrompt(i), null,
      (r.type === 'question' || r.type === 'dont') ? 'r' : (r.type === 'do' ? 'g' : ''))}`;
}
function pageCard(i){
  const r  = SCRIPT[i];
  const ty = PAGE_TYPES.find(x=>x.id === r.type) || PAGE_TYPES[0];
  const empty = !r.text || !r.text.trim();
  // 只有樣板裡真的有 {{LAYOUT}} 的頁型才給排版選單——其他頁型選了也沒作用，只會讓人困惑
  const lay = /\{\{LAYOUT\}\}/.test(ty.tpl);
  return `<article class="pgc${empty ? ' is-empty' : ''}" data-i="${i}">
    <header class="pgc-h">
      <span class="pgc-n">第 ${i + 1} 頁</span>
      <select data-f="type" data-i="${i}" aria-label="第 ${i + 1} 頁的頁型">${PAGE_TYPES
        .filter(t=>typeOk(t, CFG.kind) || t.id === r.type)
        .map(t=>`<option value="${t.id}" ${t.id === r.type ? 'selected' : ''}>${esc(t.name)}${
          typeOk(t, CFG.kind) ? '' : '（不適用）'}</option>`).join('')}</select>
      ${typeOk(ty, CFG.kind) ? '' : '<span class="tag hot">這個頁型不適用</span>'}
      <span class="pgc-tags" id="pgt-${i}">${pageTags(i)}</span>
      ${cardActs(i, 'data-mv', 'data-del', '頁')}
    </header>
    <textarea class="pgc-text" data-f="text" data-i="${i}" rows="3" aria-label="第 ${i + 1} 頁的文字"
      placeholder="這一頁的文字（AI 會原文照抄）${esc(ty.textHint ? '\n' + ty.textHint : '　一句一行，最多 4 行')}">${esc(r.text)}</textarea>
    <div class="pgc-sub">
      <textarea data-f="scene" data-i="${i}" rows="2" aria-label="第 ${i + 1} 頁的畫面補充說明"
        placeholder="畫面補充（可以不填）：${esc(ty.sceneHint || '主角在做什麼、旁邊有什麼')}">${esc(r.scene)}</textarea>
      ${ty.extraHint ? `<input type="text" data-f="extra" data-i="${i}" aria-label="${esc(ty.extraHint)}"
        placeholder="${esc(ty.extraHint)}" value="${esc(r.extra || '')}">` : ''}
    </div>
    <div class="pgc-f">
      <button type="button" class="btn sm" data-cp="${i}">${I.copy}複製這頁指令</button>
      <details class="pgc-more" data-pg="${i}" ${PG_OPEN.has(i) ? 'open' : ''}>
        <summary>${lay ? '看指令、改排版' : '看指令'}</summary>
        ${lay ? `<div class="field pgc-lay"><label for="lay-${i}">排版<span class="hint">不選就自動輪替，整本才不會每頁都長一樣</span></label>
          <select id="lay-${i}" data-f="layout" data-i="${i}">
            <option value="">自動輪替</option>
            ${LAYOUTS.map(l=>`<option value="${esc(l)}" ${l === r.layout ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select></div>` : ''}
        <div id="pgp-${i}">${PG_OPEN.has(i) ? pagePrompt(i) : ''}</div>
      </details>
    </div>
  </article>`;
}
function pagesStatus(){
  const st = $('#s-status'); if (!st) return;
  const missing = SCRIPT.map((r,i)=>(!r.text || !r.text.trim()) ? i + 1 : null).filter(Boolean);
  st.innerHTML = missing.length && SCRIPT.length
    ? `<div class="note o"><b>還有 ${missing.length} 頁沒填文字：</b>第 ${missing.join('、')} 頁。
        指令裡會顯示「【請填寫：…】」，補完再貼。</div>` : '';
}
function drawPages(){
  const list = $('#s-list'); if (!list) return;
  if (!SCRIPT.length){
    list.innerHTML = `<div class="empty"><p>還沒有頁面。按「套用頁面骨架」先給你一個架子（封面、前言、規則、
      提問與回答、總結），再照需要增減。</p></div>`;
    $('#s-all').innerHTML = ''; pagesStatus(); drawBookEnd(); return;
  }
  list.innerHTML = SCRIPT.map((_, i)=>pageCard(i)).join('');
  pagesStatus(); drawBookEnd();
  $('#s-all').innerHTML = `
    <button class="btn ghost" id="s-copyall">${I.copy}全部複製（備份用）</button>
    <button class="btn ghost" id="s-dl">${I.down}下載成文字檔</button>
    <span class="gx-tip">要貼給 AI 的話，還是一頁一頁貼——一次全部貼進去，AI 會把頁面混在一起。</span>`;
  const all = ()=>SCRIPT.map((_, i)=>buildPagePrompt(i)).join('\n\n' + '─'.repeat(28) + '\n\n');
  $('#s-copyall').onclick = ()=>copyText(all());
  $('#s-dl').onclick = ()=>download((CFG.title || '讀物') + '_逐頁指令.txt', all());
}
// 打字時只更新這一張卡片（標籤、看指令），不整批重畫，游標才不會跳走
function refreshPageCard(i){
  const tags = $('#pgt-' + i); if (tags) tags.innerHTML = pageTags(i);
  const card = $('.pgc[data-i="' + i + '"]');
  if (card) card.classList.toggle('is-empty', !(SCRIPT[i].text || '').trim());
  if (PG_OPEN.has(i)){ const p = $('#pgp-' + i); if (p) p.innerHTML = pagePrompt(i); }
}
function refreshPage(i){
  refreshPageCard(i); pagesStatus(); drawBookEnd();   // 收尾的「逐頁文字」跟著這一頁的字變
}

function buildPagePrompt(i){
  const r = SCRIPT[i];
  const t = PAGE_TYPES.find(x=>x.id===r.type) || PAGE_TYPES[0];
  const n = i+1;
  const layout = r.layout || LAYOUTS[i % LAYOUTS.length];
  const idx = SCRIPT.slice(0,i+1).filter(x=>x.type==='section').length;
  const lines = (r.text||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const ex = (r.extra||'').split(/[｜|]/).map(x=>x.trim());
  const v = vars({
    N:n, PREV:n>1?n-1:'', NEXT:n<SCRIPT.length?n+1:'',
    TEXT:r.text, SCENE:r.scene || t.sceneDefault || '', LAYOUT:layout, IDX:idx||'',
    SECTION_TITLE:lines[0], COVER_ACTION:r.scene, ICON_WANT:r.scene,
    STEPS:r.scene, STEP_COUNT:lines.length||'',
    SUMMARY_LEAD:lines[0], ITEMS:lines.slice(1).join('\n'),
    ITEM_COUNT:lines.length>1?lines.length-1:'',
    TERM:ex[0], TERM_DEF:ex[1], KEYWORD:ex[0], MARK:ex[1]
  });
  let out = `【不變．角色】主角：${v.HERO}` +
    (v.SIDEKICK?`\n　　　　　　　配角：${v.SIDEKICK}`:'') +
    `\n【不變．畫風】${v.STYLE}\n【不變．主色】${v.PALETTE}\n\n` +
    fill(t.tpl, v);

  // 留白框模式：樣板裡到處都是「原文照抄」，與其改寫 12 份樣板，
  // 不如在最後加一段覆寫——最後一道指令的權重最高，也看得出是刻意的。
  if (CFG.textMode === 'reserve' && !t.ownText){
    out += '\n\n' + fill(TEXT_RESERVE_BLOCK, vars({
      TEXT:r.text, LINES:lines.length || '3～4', PT:kindOf(CFG.kind).pt
    }));
  }
  return out;
}

/* ---------- 讀物 4：收尾 ---------- */
function bStepEnd(body){
  const total = SCRIPT.length || '全部';
  body.innerHTML = `
    <div class="note r"><b>頁碼不要叫 AI 編。</b>
      圖片模型是把數字當圖形畫的，交給它編頁碼，重複、跳號、糊掉都很常見，
      蓋掉又會留下色塊痕跡。頁碼在排版軟體按兩下就好，放到這一步做。</div>

    <p style="font-size:0.84375rem;color:var(--ink-2);margin:0 0 0.875rem">
      用 Word（Google 文件、Pages 也一樣）把 ${total} 張圖排成一份 A4 PDF：</p>
    <ol class="howto">
      <li><b>版面配置 → 邊界 → 自訂</b>：上下左右都設 <b>0</b>，紙張 A4、方向直向。</li>
      <li><b>插入 → 圖片</b>，依序插入 ${total} 張圖，一張一頁。
        插入後點圖片 → 版面配置選項選「文字在後」，再拖到滿版。</li>
      <li><b>插入 → 頁碼 → 頁面底端 → 置中</b>。整份一次編完，不會跳號。</li>
      <li>翻一遍，確認頁碼沒有壓到插圖底部的內容。</li>
      <li><b>檔案 → 另存新檔 → PDF</b>。</li>
    </ol>
    ${CFG.textMode === 'reserve' ? `
    <div class="note o"><b>你選的是「留乾淨空白框」，所以文字也在這一步打：</b>
      圖都插好之後，用<b>插入 → 文字方塊</b>把每一頁的文字打進圖上的空白框裡，
      字級設 ${esc(kindOf(CFG.kind).pt)} 以上，文字方塊的外框和填滿都選「無」。
      下面這份是每一頁的文字，可以直接複製。</div>
    ${promptBox(SCRIPT.map((r,i)=>'【第 '+(i+1)+' 頁】\n'+(r.text||'（沒填）')).join('\n\n'),
      '逐頁文字（貼進 Word 用，不是給 AI 的）', 'g')}` : ''}

    ${SCRIPT.some(r=>r.type==='credits') ? `
    <div class="note o"><b>服務條款頁（尾頁）的字也在這一步打：</b>
      AI 在那一頁只畫了一個空白框。用<b>插入 → 文字方塊</b>把下面這幾行打進框裡，
      外框和填滿都選「無」。機構全名、電話、網址請對著公文或官網逐字核對，不要憑記憶打。</div>
    ${promptBox(SCRIPT.map((r,i)=>r.type==='credits'
        ? '【第 '+(i+1)+' 頁・尾頁】\n'+(r.text||'（沒填）') : null).filter(Boolean).join('\n\n'),
      '尾頁文字（貼進 Word 用，不是給 AI 的）', 'g')}` : ''}

    <div class="note b"><b>最後對一次：</b>翻完整份 PDF，確認頁碼連續、沒有重複或跳號，
      插圖裡沒有混進其他數字。</div>`;
}


/* ============================================================
   3.5 指令產生器：影音模式
   ------------------------------------------------------------
   讀物走頁，影音走鏡。共用同一份 CFG（書名、主角、配角都是同一個人），
   但多了三條中心軸和鏡頭欄位，輸出也多兩種格式：
   逐鏡（一次貼一鏡）、合併（支援多鏡的工具一次貼完）。
   ============================================================ */
let VSCRIPT = readSaved('vscript', rows=>checkedRows(rows, true), []);
function saveVScript(){ store.set('vscript', VSCRIPT); }

function newVRow(t){
  const ty = SHOT_TYPES.find(x=>x.id===t) || SHOT_TYPES[0];
  const cam = SHOT_CAM[ty.id] || SHOT_CAM.action;
  return { type:ty.id, sec:ty.sec, action:'', scene:'', audio:'', line:'', linePy:'',
           shot:cam.shot, move:cam.move, lens:cam.lens };
}

/* 三幕 30 秒的骨架：4＋6＋6＋6＋8。
   跟課程第三課教的結構一樣，套下去就是一支可以交的短片。 */
function seedVScript(){
  VSCRIPT = ['hook','action','object','dialogue','close'].map(newVRow);
  VSCRIPT[0].sec = 4; VSCRIPT[1].sec = 6; VSCRIPT[2].sec = 6;
  VSCRIPT[3].sec = 6; VSCRIPT[4].sec = 8;
  saveVScript();
}

function vFixed(){
  const out = fill(VFIXED_TPL, {
    HERO_EN:CFG.heroEn, MOTIF:CFG.motifEn, LIGHT:CFG.lightEn,
    MOTION:CFG.motion, QUALITY:vQuality()
  });
  return CFG.sidekickEn
    ? out.replace('【不變．視覺軸】', '【不變．配角】' + CFG.sidekickEn + '\n【不變．視覺軸】')
    : out;
}
function vQuality(){
  const a = (ASPECTS.find(x=>x.id===CFG.aspect) || ASPECTS[0]);
  return (CFG.vstyleEn || '') + '，畫面比例 ' + a.name + '。';
}
function vCam(r){
  const sh = CAMERA.shots.find(x=>x.id===r.shot) || CAMERA.shots[2];
  const mv = CAMERA.moves.find(x=>x.id===r.move) || CAMERA.moves[0];
  const ln = CAMERA.lens.find(x=>x.id===r.lens)  || CAMERA.lens[1];
  return { sh, mv, ln, en: sh.en + ', ' + mv.en, zh: sh.zh + '／' + mv.zh + '／' + ln.id + 'mm' };
}
function vAudio(r){
  const amb = (r.audio || '').trim();
  if (r.line && r.line.trim()) return amb ? ('Audio: ' + amb) : 'Audio: natural room tone.';
  return amb ? ('Audio: ' + amb) : 'Audio: quiet natural room tone.';
}
/* 樣板裡 {{ACTION}} 和 {{SCENE}} 後面都還接著別的句子。
   使用者不會記得補句點，所以在這裡補：動作收句號，場景收逗號。 */
function vEnd(t, mark){
  const x = String(t||'').trim();
  if (!x) return x;
  return /[.,;:!?。，、；：！？]$/.test(x) ? x : x + mark;
}
function vVars(i){
  const r = VSCRIPT[i], c = vCam(r);
  return {
    N:i+1, SEC:r.sec || (SHOT_TYPES.find(x=>x.id===r.type)||SHOT_TYPES[0]).sec,
    CAMERA:c.en, LENS:c.ln.en, HERO_EN:CFG.heroEn, ACTION:vEnd(r.action, '.'),
    SCENE:vEnd(r.scene, ','), MOTIF:CFG.motifEn, LIGHT:CFG.lightEn, QUALITY:CFG.vstyleEn,
    AUDIO:vAudio(r), LINE:r.line, LINE_PY:r.linePy,
    ACCENT: CFG.accentOn ? VACCENT.on : VACCENT.off
  };
}
function buildShotPrompt(i){
  const r = VSCRIPT[i];
  const t = SHOT_TYPES.find(x=>x.id===r.type) || SHOT_TYPES[0];
  return vFixed() + '\n\n' + fill(t.tpl, vVars(i));
}

/* 支援一次多鏡的工具（Kling 的 Multi shot、Veo 的時間戳）要的是短句，
   不是七層全寫一遍——常數已經在 Master Prompt 裡了。 */
function vCompact(i){
  const r = VSCRIPT[i], v = vVars(i), c = vCam(r);
  const bits = [c.en + ', ' + c.ln.en,
                r.action || ('【請填寫：' + HINTS.ACTION + '】'),
                r.scene, CFG.motifEn, CFG.lightEn].filter(x=>x && String(x).trim());
  // 合併格式是一串英文短句，句首要大寫、句尾只留一個句點
  const tidy = x=>{
    const y = String(x).trim().replace(/[.。，,\s]+$/, '');
    return y.charAt(0).toUpperCase() + y.slice(1);
  };
  let out = bits.map(tidy).join('. ') + '.';
  if (r.line && r.line.trim()){
    out += ' [Audio/Dialogue] ' + v.ACCENT + ' "' +
      (r.linePy || '【請填寫：' + HINTS.LINE_PY + '】') + '" (對譯台詞：' + r.line + ')';
  } else {
    out += ' ' + vAudio(r);
  }
  return out;
}
function vClock(sec){
  const m = Math.floor(sec/60), x = sec%60;
  return String(m).padStart(2,'0') + ':' + String(x).padStart(2,'0');
}
function vSecs(i){ const r = VSCRIPT[i];
  return +r.sec || (SHOT_TYPES.find(x=>x.id===r.type)||SHOT_TYPES[0]).sec; }
function vTotal(){ return VSCRIPT.reduce((a,_,i)=>a+vSecs(i), 0); }

/* ---------- 影片 1：設定 ----------
   必填的攤開：片名、觀眾與主角、畫面比例、三條中心軸。
   腔調、主角中文、配角、畫風收進「更多設定」——都有預設值，不改也能用。 */
function vStepSet(body){
  body.innerHTML = `
  ${mediumSeg()}
  ${tplBlock()}

  <div class="field"><label for="v-title">片名</label>
    <input type="text" id="v-title" value="${esc(CFG.title)}" placeholder="例如：看身心科沒有那麼可怕"></div>

  <div class="field"><label>觀眾與主角<span class="hint">決定台詞的難度，也會換掉主角與配角的預設（中英文一起換）</span></label>
    ${kindSeg('', '', '主角類型')}
    ${audBlock()}
    ${moreBox('vaud', '看／改觀眾描述', '這一段會放進起手式，也可以自己改成家屬或醫事人員', `
      <textarea id="v-audience" rows="6" aria-label="觀眾描述">${esc(CFG.audience)}</textarea>
      ${audSrcNote()}`)}
  </div>

  <div class="opt" data-ck="aspect">
    <div class="opt-l">畫面比例<span class="hint">開拍前就要決定，事後裁會切掉人</span></div>
    <div class="seg" role="group" aria-label="畫面比例">
      ${ASPECTS.map(a=>`<button type="button" data-asp="${a.id}"
        aria-pressed="${CFG.aspect === a.id}"><b>${esc(a.name)}</b><i>${esc(a.sub)}</i></button>`).join('')}
    </div>
  </div>

  <div class="gx-axes">
    <div class="gx-lbl">三條中心軸<span class="hint">★每一鏡都會原封不動貼。只鎖角色不夠，背景和動作也要鎖，三鏡接起來才像同一支片</span></div>
    <div class="field"><label for="v-heroEn">軸 1　角色（英文）<span class="hint">只寫 2～3 個關鍵細節：髮型、衣服材質、隨身物件</span></label>
      <textarea id="v-heroEn" rows="3">${esc(CFG.heroEn)}</textarea></div>
    <div class="grid g2">
      <div class="field"><label for="v-motif">軸 2　固定物件<span class="hint">每一鏡的背景都會出現它</span></label>
        <input type="text" id="v-motif" value="${esc(CFG.motif)}" placeholder="中文：窗邊的綠色盆栽">
        <textarea id="v-motifEn" rows="2" aria-label="固定物件（英文）"
          placeholder="英文：a green potted plant by the window">${esc(CFG.motifEn)}</textarea></div>
      <div class="field"><label for="v-light">軸 2　固定光線</label>
        <input type="text" id="v-light" value="${esc(CFG.light)}" placeholder="中文：清晨柔和的側光">
        <textarea id="v-lightEn" rows="2" aria-label="固定光線（英文）"
          placeholder="英文：soft natural morning side light">${esc(CFG.lightEn)}</textarea></div>
    </div>
    <div class="field"><label for="v-motion">軸 3　貫穿全片的動作<span class="hint">一個動作，三種狀態。觀眾會自己讀成「變好了」</span></label>
      <textarea id="v-motion" rows="2" placeholder="例如：呼吸——急促 → 看著蒸氣 → 深呼吸">${esc(CFG.motion)}</textarea></div>
  </div>

  ${moreBox('vadv', '更多設定', '腔調、主角中文、配角、畫風——不改也能用', `
    <div class="opt" data-ck="accentOn">
      <div class="opt-l">說話的腔調<span class="hint">預設的中文是播音腔，在地衛教會顯得遠</span></div>
      <div class="seg" role="group" aria-label="說話的腔調">
        <button type="button" data-acc="1" aria-pressed="${!!CFG.accentOn}">
          <b>台灣國語</b><i>親切、慢、口語</i></button>
        <button type="button" data-acc="0" aria-pressed="${!CFG.accentOn}">
          <b>一般中文</b><i>平穩、中性</i></button>
      </div>
    </div>
    <div class="field"><label for="v-hero">主角（中文）<span class="hint">給你自己看的，也會用在定裝照指令裡</span></label>
      <textarea id="v-hero" rows="2">${esc(CFG.hero)}</textarea></div>
    <div class="field"><label for="v-sidekickEn">配角（英文）<span class="hint">沒有就留空。中文版在讀物模式，兩邊是同一個人</span></label>
      <textarea id="v-sidekickEn" rows="2">${esc(CFG.sidekickEn || '')}</textarea></div>
    <div class="field"><label for="v-vstyle">畫風</label>
      <input type="text" id="v-vstyle" value="${esc(CFG.vstyle)}" placeholder="中文：電影級景深、低飽和">
      <textarea id="v-vstyleEn" rows="2" aria-label="畫風（英文）"
        placeholder="英文：cinematic depth of field, low saturation, 4k 24fps">${esc(CFG.vstyleEn)}</textarea></div>`)}

  <div class="note b"><b>三條軸都要填。</b>影片每一鏡都是重新生成的，只鎖角色的話，背景和動作會各走各的。
    <a href="#" data-go="vid">影片指令第 4 課</a>講的就是這件事。</div>`;

  ['title','audience','hero','heroEn','sidekickEn','motif','motifEn',
   'light','lightEn','motion','vstyle','vstyleEn'].forEach(k=>{
    const el = $('#v-' + k); if (!el) return;
    el.addEventListener('input', e=>{
      chgClear(k);
      CFG[k] = e.target.value; saveCfg(); videoLive();
    });
  });
  $$('[data-asp]', body).forEach(b=>b.onclick=()=>{
    if (b.dataset.asp === CFG.aspect) return;
    const a = ASPECTS.find(x=>x.id === b.dataset.asp);
    withDiff('畫面比例改成「' + (a ? a.name : b.dataset.asp) + '」', ()=>{ CFG.aspect = b.dataset.asp; });
  });
  $$('[data-acc]', body).forEach(b=>b.onclick=()=>{
    const on = b.dataset.acc === '1';
    if (on === !!CFG.accentOn) return;
    withDiff('腔調改成「' + (on ? '台灣國語' : '一般中文') + '」', ()=>{ CFG.accentOn = on; });
  });
  wireKind(); wireTpl(); wireAud(); wireMore(body);
}

/* ---------- 影片 2：開場 ---------- */
function vStepOpen(body){
  body.innerHTML = `
  <div class="note o">影片有兩個模型要用：<b>語言模型負責寫指令，影片模型負責生畫面</b>。
    開一個全新的 ChatGPT 或 Gemini 對話 → 貼第 1 段 → 等它回「已了解」→
    貼第 2 段生定裝照指令 → 拿定裝照去圖片工具生一張，之後每一段都設成首幀參考圖。</div>
  <div id="vgen-open"></div>`;
  vGenOpen();
}

/* ---------- 影片 3：逐鏡（寫動作＋複製指令在同一張卡片） ---------- */
const VS_OPEN = new Set();   // 哪幾鏡的「鏡頭、聲音、看指令」是打開的
function vStepShots(body){
  body.innerHTML = `
  <p class="gx-lead">一鏡一張卡片。一鏡只做一件事：想讓主角「走進去、坐下、拿起單子」，那是三鏡。
    寫好就按「複製這鏡指令」，生出來看過再做下一鏡；前一鏡的最後一格存下來，當下一鏡的首幀參考圖。</p>
  <div class="gx-tools">
    <button class="btn" id="v-add">${I.plus}新增一鏡</button>
    <button class="btn ghost" id="v-seed">套用三幕骨架</button>
    <span class="spacer"></span>
    <button class="btn sm ghost" id="s-export">${I.down}匯出備份</button>
    <button class="btn sm ghost" id="s-import">${I.up}匯入</button>
    <button class="btn sm ghost" id="v-clear">${I.trash}清空</button>
    <input type="file" id="s-file" accept=".json" hidden>
  </div>
  <div id="v-status"></div>
  <div class="pgc-list" id="v-list"></div>
  <div class="gx-tools gx-all" id="v-all"></div>
  <div id="v-multi"></div>`;

  $('#v-add').onclick = ()=>{
    VSCRIPT.push(newVRow('action')); saveVScript(); drawShots();
    const t = $('#v-list .pgc:last-child .pgc-text'); if (t) t.focus();
  };
  $('#v-seed').onclick = ()=>{
    if (VSCRIPT.length && !confirm('這會覆蓋現有的逐鏡腳本，確定嗎？')) return;
    seedVScript(); VS_OPEN.clear(); drawShots(); toast('已套用三幕骨架（30 秒）');
  };
  $('#v-clear').onclick = ()=>{
    if (!confirm('確定清空全部鏡頭？')) return;
    VSCRIPT = []; saveVScript(); VS_OPEN.clear(); drawShots();
  };
  wireIO();

  const list = $('#v-list');
  list.addEventListener('input', e=>{
    const el = e.target.closest('[data-vf]'); if (!el) return;
    const i = +el.dataset.i, f = el.dataset.vf;
    VSCRIPT[i][f] = (f === 'sec') ? (+el.value || 0) : el.value;
    // 換鏡型就把鏡頭換成那個鏡型的預設，不然每次都要重選三個下拉
    if (f === 'type'){
      const cam = SHOT_CAM[el.value] || SHOT_CAM.action;
      const ty  = SHOT_TYPES.find(x=>x.id === el.value);
      Object.assign(VSCRIPT[i], cam, { sec: ty ? ty.sec : VSCRIPT[i].sec });
    }
    saveVScript();
    // 鏡型和秒數會動到後面每一鏡的時間碼，要整批重畫；其他只更新這一張
    if (f === 'type' || f === 'sec') drawShots(); else refreshShot(i);
  });
  list.addEventListener('click', e=>{
    const mv = e.target.closest('[data-vmv]');
    if (mv){
      const i = +mv.dataset.i, j = i + (+mv.dataset.vmv);
      if (j < 0 || j >= VSCRIPT.length) return;
      [VSCRIPT[i], VSCRIPT[j]] = [VSCRIPT[j], VSCRIPT[i]]; saveVScript(); VS_OPEN.clear(); drawShots();
      return;
    }
    const del = e.target.closest('[data-vdel]');
    if (del){
      const i = +del.dataset.vdel;
      if ((VSCRIPT[i].action || '').trim() && !confirm('刪除第 ' + (i + 1) + ' 鏡？這一鏡寫的內容會一起刪掉。')) return;
      VSCRIPT.splice(i, 1); saveVScript(); VS_OPEN.clear(); drawShots();
      return;
    }
    const cp = e.target.closest('[data-vcp]');
    if (cp){ copyText(buildShotPrompt(+cp.dataset.vcp)); flashCopied(cp); }
  });
  list.addEventListener('toggle', e=>{
    const d = e.target; if (!d.matches || !d.matches('details.pgc-more')) return;
    const i = +d.dataset.vs;
    if (d.open){ VS_OPEN.add(i); const p = $('#vsp-' + i); if (p) p.innerHTML = shotPrompt(i); }
    else VS_OPEN.delete(i);
  }, true);

  drawShots();
}

function vGenOpen(){
  const host = $('#vgen-open'); if (!host) return;
  host.innerHTML =
    promptBox(withAudience(MASTER_PROMPTS.video, '這支片的觀眾', '台詞和畫面'),
      '第 1 段　影音起手式（貼給語言模型，不是影片工具）') +
    promptBox(
`請幫我寫「主角定裝照」的圖片生成指令，先不要寫分鏡。

主角：${CFG.hero || '【請填寫：' + HINTS.HERO + '】'}
英文描述（要沿用這一段，不要改寫）：${CFG.heroEn || '【請填寫：' + HINTS.HERO_EN + '】'}
畫風：${CFG.vstyle || '【請填寫：畫風】'}

請給我正面、側面、背面三張定裝照的指令，每一張都要：
- 乾淨的淺灰漸層背景，全身入鏡，光線柔和
- 臉、髮型、衣服顏色與材質、隨身物件三張完全一致
- 畫面裡不要出現任何文字

這三張是之後每一鏡的參考圖，所以細節必須固定下來。`,
      '第 2 段　定裝照指令（角色軸的保險）', 'g');
}

function shotTags(i){
  const r = VSCRIPT[i];
  return (vSecs(i) > 10 ? '<span class="tag hot">超過 10 秒</span>' : '') +
    ((!r.action || !r.action.trim()) ? '<span class="tag hot">缺動作</span>' : '') +
    ((r.line && r.line.replace(/[^一-龥a-zA-Z]/g, '').length > 12) ? '<span class="tag hot">台詞偏長</span>' : '') +
    (chgHits(buildShotPrompt(i)) ? '<span class="tag chg-t">有更新</span>' : '');
}
function shotPrompt(i){
  const r = VSCRIPT[i];
  const t = SHOT_TYPES.find(x=>x.id === r.type) || SHOT_TYPES[0];
  return `<div class="pg-rules">
      <b>${LU.ok}${esc(t.name)}必備：</b>${t.must.map(m=>esc(m)).join('　·　')}<br>
      <b class="x">${LU.no}常見錯誤：</b>${t.avoid.map(m=>esc(m)).join('　·　')}
    </div>
    <p class="v-src">什麼時候用：${esc(t.when)}</p>
    ${promptBox(buildShotPrompt(i), null, r.type === 'refuse' ? 'r' : (r.type === 'close' ? 'g' : ''))}`;
}
function shotCard(i, from){
  const r = VSCRIPT[i];
  const t = SHOT_TYPES.find(x=>x.id === r.type) || SHOT_TYPES[0];
  const empty = !r.action || !r.action.trim();
  const sel = (f, list, label)=>`<label class="pgc-mini">${label}
    <select data-vf="${f}" data-i="${i}">${list.map(o=>`<option value="${o.id}" ${o.id === r[f] ? 'selected' : ''}>${
      esc((o.zh || o.id + 'mm') + (o.use ? '　' + o.use : ''))}</option>`).join('')}</select></label>`;
  return `<article class="pgc${empty ? ' is-empty' : ''}" data-i="${i}">
    <header class="pgc-h">
      <span class="pgc-n">第 ${i + 1} 鏡</span>
      <span class="v-clock" title="這一鏡從第幾秒開始">${vClock(from)}</span>
      <select data-vf="type" data-i="${i}" aria-label="第 ${i + 1} 鏡的鏡型">${SHOT_TYPES
        .map(x=>`<option value="${x.id}" ${x.id === r.type ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <span class="v-sec"><input type="number" data-vf="sec" data-i="${i}" min="2" max="10"
        value="${esc(r.sec || t.sec)}" aria-label="第 ${i + 1} 鏡幾秒"><span>秒</span></span>
      <span class="pgc-tags" id="vst-${i}">${shotTags(i)}</span>
      ${cardActs(i, 'data-vmv', 'data-vdel', '鏡')}
    </header>
    <textarea class="pgc-text" data-vf="action" data-i="${i}" rows="2" aria-label="第 ${i + 1} 鏡發生什麼"
      placeholder="這一鏡發生什麼：${esc(t.hint)}">${esc(r.action)}</textarea>
    <div class="pgc-sub pgc-two">
      <input type="text" data-vf="scene" data-i="${i}" aria-label="第 ${i + 1} 鏡的場景"
        placeholder="場景（在哪裡）" value="${esc(r.scene || '')}">
      <input type="text" data-vf="line" data-i="${i}" aria-label="第 ${i + 1} 鏡的台詞"
        placeholder="台詞（中文，12 字以內；沒有就留空）" value="${esc(r.line || '')}">
    </div>
    <div class="pgc-f">
      <button type="button" class="btn sm" data-vcp="${i}">${I.copy}複製這鏡指令</button>
      <details class="pgc-more" data-vs="${i}" ${VS_OPEN.has(i) ? 'open' : ''}>
        <summary>鏡頭、聲音、看指令</summary>
        <p class="pgc-note">鏡頭會照鏡型自動帶預設，通常不用動。</p>
        <div class="pgc-row3">${sel('shot', CAMERA.shots, '景別')}${sel('move', CAMERA.moves, '運鏡')}${sel('lens', CAMERA.lens, '焦段')}</div>
        <div class="pgc-two">
          <label class="pgc-mini">台詞的羅馬拼音
            <input type="text" data-vf="linePy" data-i="${i}" value="${esc(r.linePy || '')}"></label>
          <label class="pgc-mini">環境音
            <input type="text" data-vf="audio" data-i="${i}" placeholder="紙張翻動聲、風聲" value="${esc(r.audio || '')}"></label>
        </div>
        <div id="vsp-${i}">${VS_OPEN.has(i) ? shotPrompt(i) : ''}</div>
      </details>
    </div>
  </article>`;
}
function shotsStatus(){
  const st = $('#v-status'); if (!st) return;
  if (!VSCRIPT.length){ st.innerHTML = ''; return; }
  const total = vTotal();
  const missing = VSCRIPT.map((r,i)=>(!r.action || !r.action.trim()) ? i + 1 : null).filter(Boolean);
  st.innerHTML =
    (total > 60 ? `<div class="note o"><b>總長 ${total} 秒。</b>
      超過 60 秒的衛教片很少有人看完，而且每 10 秒就是一次生成的點數。先想想哪幾鏡可以合併或刪掉。</div>` : '') +
    (missing.length ? `<div class="note o"><b>還有 ${missing.length} 鏡沒寫動作：</b>
      第 ${missing.join('、')} 鏡。沒有動作，模型只會給你一張會呼吸的照片。</div>` : '');
}
// 一次生多鏡的兩種格式：常數只寫一次、每一鏡一行。支援多鏡的工具用這個比較省點數
function vKling(){
  return 'Master Prompt:\n' + vFixed() + '\n\n' +
    VSCRIPT.map((r,i)=>`Multi shot Prompt ${i + 1} (${vSecs(i)}s): ${vCompact(i)}`).join('\n\n');
}
function vVeo(){
  let t0 = 0;
  return VSCRIPT.map((r,i)=>{
    const a = vClock(t0); t0 += vSecs(i);
    return `[${a}-${vClock(t0)}] ${vCompact(i)}`;
  }).join('\n\n');
}
function drawMulti(){
  const host = $('#v-multi'); if (!host) return;
  if (!VSCRIPT.length){ host.innerHTML = ''; return; }
  host.innerHTML = moreBox('vmulti', '一次生多鏡的兩種格式（Kling／Veo）',
    '上面一鏡一貼最穩；工具支援一次多鏡的話，用這裡比較省點數', `
    <p class="gx-lead">生出來不對的那一鏡，還是回上面單獨重生。</p>
    ${promptBox(vKling(), 'Kling 多鏡格式：Master Prompt ＋ Multi shot Prompt', 'g')}
    ${promptBox(vVeo(), 'Veo 時間戳格式：[mm:ss-mm:ss] 一行一鏡')}
    <div class="note r"><b>兩種格式都只是把常數抽出來寫一次。</b>
      中心軸如果在 Master Prompt 裡漏掉一條，後面每一鏡都會漂——這是多鏡格式唯一要小心的地方。</div>`);
  wireMore(host);
}
function drawShots(){
  const list = $('#v-list'); if (!list) return;
  if (!VSCRIPT.length){
    list.innerHTML = `<div class="empty"><p>還沒有鏡頭。按「套用三幕骨架」給你一支 30 秒的架子，再照需要增減。</p></div>`;
    $('#v-all').innerHTML = ''; shotsStatus(); drawMulti(); drawVideoEnd(); return;
  }
  let clock = 0;
  list.innerHTML = VSCRIPT.map((_, i)=>{ const from = clock; clock += vSecs(i); return shotCard(i, from); }).join('');
  shotsStatus(); drawVideoEnd();
  $('#v-all').innerHTML = `
    <button class="btn ghost" id="v-copyall">${I.copy}全部複製（備份用）</button>
    <button class="btn ghost" id="v-dl">${I.down}下載成文字檔</button>
    <span class="gx-tip">共 ${VSCRIPT.length} 鏡・${vTotal()} 秒。要貼給影片工具的話，還是一鏡一鏡貼。</span>`;
  const all = ()=>VSCRIPT.map((_, i)=>buildShotPrompt(i)).join('\n\n' + '─'.repeat(28) + '\n\n');
  $('#v-copyall').onclick = ()=>copyText(all());
  $('#v-dl').onclick = ()=>download((CFG.title || '影片') + '_逐鏡指令.txt',
    all() + '\n\n' + '═'.repeat(28) + '\n\n' + vKling() + '\n\n' + '═'.repeat(28) + '\n\n' + vVeo());
  drawMulti();
}
function refreshShotCard(i){
  const tags = $('#vst-' + i); if (tags) tags.innerHTML = shotTags(i);
  const card = $('#v-list .pgc[data-i="' + i + '"]');
  if (card) card.classList.toggle('is-empty', !(VSCRIPT[i].action || '').trim());
  if (VS_OPEN.has(i)){ const p = $('#vsp-' + i); if (p) p.innerHTML = shotPrompt(i); }
}
function refreshShot(i){
  refreshShotCard(i); shotsStatus();
  if (GX_OPEN.vmulti) drawMulti();
  drawVideoEnd();                                       // 收尾的「逐鏡台詞」跟著變
}

/* ---------- 影片 4：收尾 ---------- */
function vStepEnd(body){
  const subs = VSCRIPT.map((r,i)=>r.line && r.line.trim()
    ? '【第 ' + (i + 1) + ' 鏡】' + r.line : null).filter(Boolean).join('\n');
  body.innerHTML = `
    <div class="note r"><b>字不要叫模型生。</b>
      字幕、機構名稱、聯絡方式、標語一律後製加。影片模型畫中文字比圖片模型更糊，
      而且含真實機構名的指令常常直接被擋下來。</div>
    <ol class="howto">
      ${VID.post.map(x=>`<li>${esc(x)}</li>`).join('')}
    </ol>
    <div class="note o"><b>自動字幕一定要校：</b>${esc(VID.postWarn)}</div>
    ${subs ? promptBox(subs, '逐鏡台詞（貼進剪接軟體做字幕用，不是給 AI 的）', 'g') : ''}
    <div class="note b"><b>點數：</b>${esc(VID.credits)}</div>
    <div class="row"><button class="btn ghost" data-go="fix">生壞了，去疑難排解 →</button></div>`;
}

/* ============================================================
   4. 修圖急救包
   ============================================================ */
function renderFix(){
  $('#view-fix').innerHTML = `
  <div class="page-head">
    <h2>疑難排解</h2>
    <p>不用讀，出問題再來查。找到症狀 → 填頁碼和文字 → 複製修正指令。
       每一條都標了它違反哪一條原則。</p>
  </div>

  <div class="opt" style="margin:1rem 0 0.25rem">
    <div class="opt-l">在修什麼</div>
    <div class="seg" role="group" aria-label="症狀類型">
      <button type="button" data-dm="all"   aria-pressed="true"><b>全部</b></button>
      <button type="button" data-dm="book"  aria-pressed="false"><b>讀物</b><i>圖片</i></button>
      <button type="button" data-dm="video" aria-pressed="false"><b>影片</b><i>鏡頭</i></button>
    </div>
  </div>

  <div class="card" style="padding:0.9375rem 1.25rem">
    <div class="row fix-fields">
      <div>
        <label class="mini-lbl">要修第幾頁／鏡</label>
        <input type="text" id="d-n" class="mini-in" placeholder="例如 16">
      </div>
      <div>
        <label class="mini-lbl">這一頁的文字／這一鏡的動作</label>
        <input type="text" id="d-t" class="mini-in" placeholder="讀物貼文字；影片寫這一鏡發生什麼">
      </div>
    </div>
  </div>
  <div id="d-list"></div>`;
  $('#d-n').addEventListener('input', drawFix);
  $('#d-t').addEventListener('input', drawFix);
  $$('#view-fix [data-dm]').forEach(b=>b.onclick=()=>{
    FIX_MEDIUM = b.dataset.dm;
    $$('#view-fix [data-dm]').forEach(x=>x.setAttribute('aria-pressed', String(x===b)));
    drawFix();
  });
  drawFix();
}
let FIX_MEDIUM = 'all';
function drawFix(){
  const n = ($('#d-n')?.value||'').trim();
  const tx = ($('#d-t')?.value||'').trim();
  // 影片的診斷把「這一鏡的動作」也塞進 SCENE，修正指令才有東西可帶
  const v = vars({ N:n, TEXT:tx, SCENE:tx, LINE:tx, PREV:n?(+n-1):'', NEXT:n?(+n+1):'',
                   TOTAL:SCRIPT.length||'', HERO_SHORT:(CFG.hero||'').split(/[，,]/)[0] });

  const list = DIAGNOSE.filter(d=>
    FIX_MEDIUM === 'all' ? true :
    FIX_MEDIUM === 'video' ? d.medium === 'video' : d.medium !== 'video');

  $('#d-list').innerHTML = list.map(d=>{
    const P = PRINCIPLES.find(p=>p.n===d.p);
    const ev = d.evidence||{};
    const shots = ['bad','good'].filter(k=>ev[k]).map(k=>`<figure>
      <img src="${img(ev[k])}" loading="lazy" data-lb="${img(ev[k])}"
           style="border-color:var(${k==='bad'?'--bad-rule':'--ok-rule'})" alt="第 ${ev[k]} 頁">
      <figcaption>${k==='bad'?'⚠ 出問題':'✅ 正確'} P.${ev[k]}</figcaption></figure>`).join('');
    return `<div class="diag">
      <div class="hd">
        <span class="d-ico">${LU.warn}</span>
        <div class="t"><b>${esc(d.symptom)}</b>
          ${d.medium==='video'?'<span class="tag">影片</span>':''}
          ${P?`<span class="tag">違反原則 ${P.n}　${esc(P.title)}</span>`:''}</div>
        <span class="arrow">▶</span>
      </div>
      <div class="bd">
        <h5>為什麼會這樣</h5><p>${esc(d.cause)}</p>
        ${shots?`<div class="demo-strip">${shots}</div>`:''}
        <h5>修正指令</h5>
        ${promptBox(fill(d.prompt, v), null, 'r')}
      </div>
    </div>`;
  }).join('');
  $$('#d-list .diag .hd').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('open'));
}

/* ============================================================
   5. 學習資源
   ============================================================ */
/* 一份資源是什麼類型，從來源和網址推出來：影片、PDF／文件、官方網站、其他文章。
   只是幫忙掃視用的，實際是什麼永遠也用文字寫在「來源」那一行。 */
function resIcon(i){
  const u = i.u || '', who = i.who || '';
  if (/youtube\.com|youtu\.be|vimeo/i.test(u) || /影片/.test(who)) return LU.video;
  if (/PDF/i.test(who) || /\.pdf($|\?)/i.test(u))                  return LU.doc;
  if (/官方/.test(who))                                            return LU.globe;
  return LU.book;
}

function renderRes(){
  $('#view-res').innerHTML = `
  <div class="page-head">
    <h2>學習資源</h2>
    <p>想再深入的話，這些是我們建議的下一步。
       全部都確認過連得上（<b>這一頁需要網路</b>，平台其他部分離線可用）。</p>
  </div>

  ${RESOURCES.map(g=>`
    <div class="card">
      <h3>${esc(g.g)}</h3>
      <p class="res-note">${esc(g.note)}</p>
      <div class="res-grid">
      ${g.items.map(i=>`
        <a class="res" href="${esc(i.u)}" target="_blank" rel="noopener">
          <span class="res-ico">${resIcon(i)}</span>
          <span class="res-body">
            <span class="res-t">${esc(i.t)}${I.ext}</span>
            <span class="res-w">${esc(i.who)}</span>
            <span class="res-d">${esc(i.d)}</span>
          </span>
        </a>`).join('')}
      </div>
    </div>`).join('')}

  <div class="note o">
    <b>一句提醒：</b>圖畫得漂亮，孩子不一定學得會。社會性故事有它自己的句型規則和比例，
    那才是讀物有沒有效的關鍵。上面第三區的第一篇（教育部特教季刊）只有 4 頁，
    很值得在動筆前先看完。
  </div>`;
}

/* ============================================================
   6. 範例與檢查表
   ============================================================ */
let curPage = 1;
function renderRef(){
  const done = store.get('check', {});
  const total = CHECKLIST.reduce((s,g)=>s+g.items.length,0);

  $('#view-ref').innerHTML = `
  <div class="page-head">
    <h2>範例與檢查表</h2>
    <p>不用讀，需要時再翻。</p>
  </div>

  <div class="card">
    <h3>交付前檢查表　<span class="tag">${total} 項</span></h3>
    <div class="row" style="margin-bottom:0.625rem">
      <b id="ck-num" style="font-size:0.875rem"></b>
      <div class="spacer"></div>
      <button class="btn sm ghost" onclick="window.print()">${I.print}列印</button>
      <button class="btn sm ghost" id="ck-reset">${I.reset}全部取消</button>
    </div>
    <div class="progress"><i id="ck-bar" style="width:0%"></i></div>
    <div class="grid g3" style="margin-top:1rem">
      ${CHECKLIST.map((g,gi)=>`<div class="chk-grp">
        <b>${esc(g.g)}</b>
        ${g.items.map((it,ii)=>`<label class="chk ${done[gi+'-'+ii]?'done':''}" data-k="${gi}-${ii}">
          <input type="checkbox" ${done[gi+'-'+ii]?'checked':''}><span>${esc(it)}</span></label>`).join('')}
      </div>`).join('')}
    </div>
  </div>

  <div class="card">
    <h3>一本做完的範例：${esc(BOOK.title)}</h3>
    <div class="note b" style="margin-top:0">
      <b>這是一本六十分的成品，不是標準答案。</b>
      它證明「照四原則寫指令」真的做得出可以印出來給孩子用的東西，
      同時也留著三個沒修掉的瑕疵（第 16、17、19 頁），拿來對照更有用。
      <a href="${BOOK.pdf}" target="_blank" style="color:var(--blue);font-weight:700">開啟原始 PDF${I.ext}</a>
    </div>
    <div class="thumbs">${BOOK.pages.map(p=>{
      const t = PAGE_TYPES.find(x=>x.id===p.type);
      return `<div class="thumb ${p.bad?'bad':''}" data-page="${p.n}">
        <img src="${img(p.n)}" alt="第 ${p.n} 頁" loading="lazy">
        <div class="cap"><b>${p.n}</b> ${t?esc(t.name):''}</div></div>`;
    }).join('')}</div>
    <div id="bk-detail" class="bk-detail" hidden></div>
  </div>`;

  const upd = ()=>{
    const d = store.get('check', {});
    const n = Object.values(d).filter(Boolean).length;
    $('#ck-num').textContent = `已完成 ${n} / ${total} 項`;
    $('#ck-bar').style.width = (n/total*100)+'%';
  };
  $$('#view-ref .chk').forEach(l=>l.querySelector('input').onchange = e=>{
    const d = store.get('check', {});
    d[l.dataset.k] = e.target.checked; store.set('check', d);
    l.classList.toggle('done', e.target.checked); upd();
  });
  $('#ck-reset').onclick = ()=>{
    store.set('check', {});
    $$('#view-ref .chk').forEach(l=>{ l.querySelector('input').checked=false; l.classList.remove('done'); });
    upd();
  };
  $$('#view-ref [data-page]').forEach(el=>el.onclick=()=>showPage(+el.dataset.page));
  upd();
}
function showPage(n){
  curPage = n;
  const p = BOOK.pages.find(x=>x.n===n);
  const t = PAGE_TYPES.find(x=>x.id===p.type);
  const d = $('#bk-detail');
  d.hidden = false;
  d.innerHTML = `
    <img src="${img(n)}" data-lb="${img(n)}" alt="第 ${n} 頁">
    <div>
      <div class="row" style="margin-bottom:0.625rem">
        <b style="font-size:0.9375rem">第 ${n} 頁　${t?esc(t.name):''}</b>
        ${p.bad?'<span class="tag hot">留著的瑕疵</span>':''}
        <div class="spacer"></div>
        <button class="btn sm ghost" data-pg="${n>1?n-1:22}">${I.left}</button>
        <button class="btn sm ghost" data-pg="${n<22?n+1:1}">${I.right}</button>
        <button class="btn sm ghost" id="bk-close">${I.close}</button>
      </div>
      <div class="txt">${esc(p.text)}</div>
      <p class="teach">${esc(p.teach)}</p>
    </div>`;
  $$('[data-pg]', d).forEach(b=>b.onclick=()=>showPage(+b.dataset.pg));
  $('#bk-close').onclick = ()=>{ d.hidden = true; };
  d.scrollIntoView({behavior:'smooth', block:'nearest'});
}

/* ============================================================
   7. 課程：友善就醫（衛福部醫事司教材整理）
   ------------------------------------------------------------
   原網站依教材類型分區，那是製作方的視角。社工在現場遇到的是
   「案主現在卡在哪裡」，所以課次依就醫時刻排：看診前 → 看診時 →
   要做處置 → 在診間 → 影片與資源。
   ============================================================ */
function careLinks(links){
  return `<div class="c-dl">${links.map(l=>
    `<a class="dl" href="${esc(l.u)}" target="_blank" rel="noopener">${
      l.k === 'y' ? I.ext : I.down}${esc(l.t)}</a>`).join('')}</div>`;
}

function careMoments(idx){
  return idx.map(i=>{
    const m = CARE.moments[i];
    return `
    <div class="c-m">
      <div class="c-m-w">${esc(m.when)}</div>
      <div class="c-m-t">${esc(m.tool)}<span class="tag">${esc(m.kind)}</span></div>
      <p class="c-m-d"><b>裡面有什麼：</b>${esc(m.what)}</p>
      <p class="c-m-d"><b>怎麼用：</b>${esc(m.how)}</p>
      ${careLinks(m.links)}
    </div>`;
  }).join('');
}

COURSES.care = {
  title:'友善就醫',
  minutes:12,
  lead:'衛福部醫事司做了一整套教材，目的只有一件事：讓身心障礙者<b>自己看得懂醫療資訊、' +
       '自己做決定</b>，而不是由旁邊的人代答。這裡依「案主現在卡在哪裡」排成六課，' +
       '每一份教材都直接連到衛福部的下載處（需要網路）。',
  lessons:[
    { t:'看診前：說不出哪裡不舒服',
      sub:'醫師跟我的對話單',
      body: ()=>careMoments([0]) },

    { t:'看診時：該問什麼',
      sub:'就醫提問單第一式、第二式',
      body: ()=>`
        <p class="lesson-why">兩份提問單對應兩種情況：第一次看這個病，跟看過了還沒好。
           去之前先陪案主寫好，等於一份就醫筆記，醫師掃一眼就知道要討論什麼。</p>
        ${careMoments([1, 2])}` },

    { t:'醫師說要做處置',
      sub:'手術、檢查、麻醉，三份知情同意書',
      body: ()=>`
        <p class="lesson-why">三份是三次獨立的決定。麻醉常被當成手術的附屬品順帶帶過，
           檢查會取樣本這件事常被當成理所當然而沒說——每一份都要唸完再往下。</p>
        ${careMoments([3, 4, 5])}` },

    { t:'一份合格的知情同意書，要講完七件事',
      sub:'第 6 件最重要',
      body: ()=>`
        <p class="lesson-why">三份同意書的說明抽出來，骨架是一樣的。這七件事就是你陪同時的檢查表。</p>
        <ol class="c-steps">
          ${CARE.consent.steps.map(x=>`<li>${esc(x)}</li>`).join('')}
        </ol>
        <div class="note o">${esc(CARE.consent.key)}</div>` },

    { t:'在診間：下一步會發生什麼',
      sub:'流程圖卡 22 式，以及為什麼每份教材都有三種版本',
      body: ()=>`
        ${careMoments([6])}
        <h3 class="lesson-h3">同一份，為什麼要做三種版本</h3>
        ${CARE.formats.map(f=>`
          <div class="c-fmt">
            <div class="c-fmt-t">${esc(f.t)}</div>
            <div class="c-fmt-d">${esc(f.d)}</div>
          </div>`).join('')}` },

    { t:'照著做一次：五頁的範例',
      sub:'我要不要開刀——用前面教的規則，從頭做一本',
      body: ()=>`
        <p class="lesson-why">${esc(CARE_SAMPLE.note)}</p>

        <h3 class="lesson-h3">整本都一樣的那一段</h3>
        <p class="lesson-why">這三行每一頁開頭都要原封不動貼上去，一個字都不要改
          （這是<a href="#" data-go="prin">四大原則</a>的第 2 條）。</p>
        ${promptBox(CARE_SAMPLE.fixed, '不變段落（每頁都貼）', 'g')}

        <h3 class="lesson-h3">五頁長這樣</h3>
        <div class="note g">${esc(CARE_SAMPLE.drawn)}</div>
        <div class="note o">${esc(CARE_SAMPLE.drawnNote)}</div>
        <div class="sp-strip">${CARE_SAMPLE.pages.map(p=>`
          <a class="sp-mini" href="${p.img}" target="_blank" rel="noopener">
            <img src="${p.thumb || p.img}" alt="第 ${p.n} 頁：${esc(p.type)}" loading="lazy">
            <span>${p.n}</span></a>`).join('')}</div>

        <h3 class="lesson-h3">一頁一頁看</h3>
        ${CARE_SAMPLE.pages.map(p=>`
          <div class="sp">
            <div class="sp-h">
              <span class="sp-n">第 ${p.n} 頁</span>
              <span class="tag">${esc(p.type)}</span>
            </div>
            <div class="sp-row">
              <div>
                <a class="sp-fig" href="${p.img}" target="_blank" rel="noopener">
                  <img src="${p.img}" alt="第 ${p.n} 頁" loading="lazy"></a>
                <a class="sp-draft" href="${p.draft}" target="_blank" rel="noopener"
                   title="最早的版面示意（向量）">版面示意</a>
              </div>
              <div class="sp-txt">
                <pre class="sp-t">${esc(p.text)}</pre>
                <p class="sp-w">${esc(p.why)}</p>
              </div>
            </div>
            ${promptBox(CARE_SAMPLE.fixed + '\n\n' + p.prompt,
              '第 ' + p.n + ' 頁的完整指令')}
          </div>`).join('')}

        <div class="note">${esc(CARE_SAMPLE.draftNote)}</div>
        <div class="note b">${esc(CARE_SAMPLE.after)}</div>
        <div class="note g"><b>同一個故事也可以做成 30 秒的影片。</b>
          主角、硬規則、不變段落都沿用這一本，只是把「頁」換成「鏡」。
          讀物給案主自己看，影片給家屬和志工看。
          完整的三幕指令在<a href="#" data-go="vid">影片指令第 6 課</a>，
          或直接<a href="#" data-go="gen" data-medium="video">去產生器切到影音</a>。</div>` },

    { t:'影片與查資源',
      sub:'十支教材影片、全臺 22 縣市資料表、四份友善醫療院所清冊',
      body: ()=>`
        <h3 class="lesson-h3">十支影片</h3>
        <p class="res-note">給醫事人員也給民眾。前兩支是觀念底層，看完再看其他的比較有感。</p>
        ${CARE.videos.map(v=>`
          <a class="res" href="${esc(v.u)}" target="_blank" rel="noopener">
            <div class="res-t">${esc(v.t)}${I.ext}</div>
            <div class="res-w">${esc(v.w)}</div>
          </a>`).join('')}
        <h3 class="lesson-h3">要查資源的時候</h3>
        ${CARE.lookup.map(x=>`
          <a class="res" href="${esc(x.u)}" target="_blank" rel="noopener">
            <div class="res-t">${esc(x.t)}<span class="tag">${esc(x.n)}</span>${I.down}</div>
            <div class="res-d">${esc(x.d)}</div>
          </a>`).join('')}
        <p class="lesson-src">完整原始頁面：
          <a href="${esc(CARE.src)}" target="_blank" rel="noopener">衛福部醫事司・友善就醫資訊網${I.ext}</a></p>` }
  ],
  // 目錄底下：這套教材為什麼可信
  foot: ()=>`
    <div class="card">
      <h3>先知道三件事</h3>
      <div class="c-facts">
        ${CARE.facts.map(f=>`
          <div class="c-fact">
            <div class="c-n">${esc(f.n)}</div>
            <div class="c-ft">${esc(f.t)}</div>
            <div class="c-fd">${esc(f.d)}</div>
          </div>`).join('')}
      </div>
    </div>`,
  // 這一課承諾的是「做一本」，所以順便把形式切回讀物，
  // 不然剛上完影片課的人會落在影音模式，找不到就醫範本
  done: ()=>`<a href="#" class="ln next" data-go="gen" data-medium="book">
    <span class="ln-k">下一步</span><span class="ln-t">去指令產生器，套用就醫範本做一本</span></a>`
};

function renderCare(){ renderCourse('care'); }

/* ============================================================
   6. 課程：影片指令
   ------------------------------------------------------------
   四大原則是共用的底層，這一課只教「影片才有的四件事」。
   骨架是講義的七層導演公式，主範例是那支 30 秒身心科短片，
   最後一課把友善就醫那本五頁讀物改寫成同一個故事的影片版。
   ============================================================ */
function vWords(list){
  return list && list.length
    ? `<div class="v-words">${list.map(w=>`<span>${esc(w)}</span>`).join('')}</div>` : '';
}

COURSES.vid = {
  title:'影片指令',
  minutes:14,
  lead:'四大原則在影片一樣成立，不重教。這裡只補<b>影片才有的四件事</b>：' +
       '時間軸、動作、鏡頭、聲音。第六課有一支 30 秒短片的完整指令原文，' +
       '照著改就能做出自己的第一支。',
  lessons:[

    /* ---- 1 ---- */
    { t:'同一套原則，換成會動的',
      sub:'四大原則在影片怎麼用，以及影片多出來的四件事',
      body: ()=>`
        <p class="lesson-why">你在四大原則學的東西全部帶得走。影片不是另一套規則，
           是同一套規則多了一個維度——時間。先看四條原則各自怎麼變。</p>

        <div class="vgrid">
          ${VID.map.map(m=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">原則 ${m.p}</span>
                <span class="v-t">${esc(m.book)}</span></div>
              <div class="vmap">
                <div class="bk"><b>讀物</b>${esc(m.book)}</div>
                <div class="vd"><b>影片</b>${esc(m.video)}</div>
              </div>
              <p class="v-src">依據：${esc(m.src)}</p>
            </div>`).join('')}
        </div>

        <h3 class="lesson-h3">影片多出來的四件事</h3>
        <div class="vgrid">
          ${VID.four.map((f,i)=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">${String(i+1).padStart(2,'0')}</span>
                <span class="v-t">${esc(f.t)}</span></div>
              <p class="v-d">${esc(f.d)}</p>
            </div>`).join('')}
        </div>

        <div class="note b"><b>分工要先講清楚：</b>
          ${esc(VID.roles.writer)}；${esc(VID.roles.director)}。
          你先用 ChatGPT 或 Gemini 這種語言模型把每一鏡的指令寫好，
          再一鏡一鏡貼給影片工具。跳過第一步直接跟影片工具講話，就是在碰運氣。</div>

        <div class="note o"><b>還沒上過四大原則就先去上。</b>
          這一課從第二段開始都預設你已經知道「形容詞要換成可以檢查的條件」。
          <a href="#" data-go="prin">去四大原則 →</a></div>` },

    /* ---- 2 ---- */
    { t:'七層導演公式',
      sub:'一鏡的指令要寫哪七件事、順序為什麼固定',
      body: ()=>`
        <p class="lesson-why">影片指令不是一句話，是七層堆起來的。順序固定，
           因為模型是照順序理解的：先知道鏡頭在哪，才知道要拍誰、拍什麼。</p>

        <div class="vform"><b>指令</b> ＝ ${esc(VID.formula.split('=')[1] || VID.formula)}</div>

        <div class="vgrid">
          ${VID.layers.map(L=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">第 ${L.n} 層</span>
                <span class="v-t">${esc(L.tag)}</span>
                <span class="v-en">${esc(L.en)}</span></div>
              <p class="v-d">${esc(L.what)}</p>
              ${vWords(L.words)}
            </div>`).join('')}
        </div>

        <h3 class="lesson-h3">七層長在一起是什麼樣子</h3>
        <p class="res-note">這兩則是講義的原文範例。讀的時候把七層一層一層指出來，
           你會發現每一句都對得上其中一層。</p>
        ${VID.classic.map(c=>`
          <div class="vact">
            <div class="vact-h"><b>${esc(c.t)}</b></div>
            ${promptBox(c.en, '英文原文（貼給模型用這一段）')}
            <p class="v-d">${esc(c.zh)}</p>
            <p class="vact-w">${esc(c.note)}</p>
          </div>`).join('')}

        <div class="note g"><b>英文寫、中文想。</b>
          影片模型對英文的理解好很多，尤其是運鏡和光影這些術語。
          作法是用中文想清楚每一層要什麼，再叫語言模型翻成英文指令——
          第六課的範例就是這樣做的。台詞是例外，台詞要用羅馬拼音加中文對譯。</div>` },

    /* ---- 3 ---- */
    { t:'先分幕，再分鏡',
      sub:'黃金 8 秒、三幕 30 秒，以及三段怎麼接起來',
      body: ()=>`
        <p class="lesson-why">目前的工具一次只生 4～10 秒。所以 30 秒的影片是
           三段各自生出來再接的，不是一次生完。先決定幾幕、每幕幾秒、每幕發生什麼，
           再去寫每一鏡的指令。順序顛倒就會生出一堆接不起來的漂亮畫面。</p>

        <h3 class="lesson-h3">黃金 8 秒：一鏡之內的節奏</h3>
        <div class="vgrid">
          ${VID.golden.map((g,i)=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">${String(i+1).padStart(2,'0')}</span>
                <span class="v-t">${esc(g.t)}</span></div>
              <p class="v-d">${esc(g.d)}</p>
            </div>`).join('')}
        </div>

        <h3 class="lesson-h3">三幕 30 秒：一支片的結構</h3>
        <p class="res-note">30 秒＝3 段 × 10 秒，60 秒＝6 段 × 10 秒。
           衛教和宣導片用三幕最穩：先讓人看見困境，再給一個轉折，最後示範可以做的事。</p>
        <div class="vgrid">
          ${VID.acts.map(a=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">${esc(a.t)}</span>
                <span class="v-t">${esc(a.role)}</span>
                <span class="tag">${esc(a.mood)}</span></div>
              <p class="v-d">${esc(a.d)}</p>
            </div>`).join('')}
        </div>

        <h3 class="lesson-h3">三段怎麼接起來</h3>
        <div class="vgrid">
          ${VID.joins.map((j,i)=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">${String(i+1).padStart(2,'0')}</span>
                <span class="v-t">${esc(j.t)}</span></div>
              <p class="v-d">${esc(j.d)}</p>
            </div>`).join('')}
        </div>

        <div class="note r"><b>原則 3 在影片裡最容易破功。</b>
          一鏡塞兩件事，模型會兩件都做不好。想讓主角「走進診間、坐下、拿起單子」，
          那是三鏡，不是一鏡。拆開來生，反而比較快。</div>` },

    /* ---- 4 ---- */
    { t:'中心軸：影片版的不變段落',
      sub:'原則 2 從一條變三條，少一條三鏡就像三支片',
      body: ()=>`
        <p class="lesson-why">讀物只要鎖住主角，每一頁就長得像同一本書。
           影片不行——每一鏡都是重新生成的，只鎖角色，背景和動作還是會各走各的。
           講義的解法是三條軸一起鎖：<b>角色、視覺符號、動作</b>。
           這三段寫一次，之後每一鏡原封不動貼。</p>

        <div class="vgrid">
          ${VID.anchors.map((a,i)=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">軸 ${i+1}</span>
                <span class="v-t">${esc(a.t)}</span>
                <span class="v-en">${esc(a.sub)}</span></div>
              <p class="v-d">${esc(a.d)}</p>
              ${vWords([a.tag])}
            </div>`).join('')}
        </div>

        <div class="note b"><b>括號裡的標註要留著。</b>
          你會在第六課的範例看到每一句後面都掛一個像
          <code>(角色中心軸——鎖定人設與服裝)</code> 的括號。那不是註解給人看的，
          是寫給模型看的分類標籤，告訴它這一句屬於哪一條軸、不可以改。</div>

        <h3 class="lesson-h3">先生一張定裝照</h3>
        <p class="res-note">角色軸最可靠的作法不是把描述寫長，是先生一張定裝照，
           之後每一段都把它設成首幀參考圖。Kling 官方的實測是：角色描述只寫 2～3 個關鍵細節，
           寫越多反而越容易漂。</p>
        ${promptBox(VID.portrait, '定裝照指令（講義原文，改成自己的主角即可）')}
        <div class="note g"><b>要三個角度的話，把這句丟給語言模型：</b>
          「${esc(VID.portraitAsk)}」——正面、側面、背面三張，
          剛好對上 Kling 官方說的參考圖組合。</div>` },

    /* ---- 5 ---- */
    { t:'聲音也是指令',
      sub:'環境音、對白格式，還有台灣國語怎麼叫得出來',
      body: ()=>`
        <p class="lesson-why">這一代的影片模型會直接生聲音。所以聲音不是後製才想的事，
           它是第七層，寫在指令最後面。少寫這一層，你會得到一支安靜的片，
           然後花更多時間在剪接軟體補。</p>

        <div class="vgrid">
          ${VID.audioFormat.map((a,i)=>`
            <div class="vrow">
              <div class="v-h"><span class="v-n">${String(i+1).padStart(2,'0')}</span>
                <span class="v-t">${esc(a.t)}</span></div>
              <p class="v-d">${esc(a.d)}</p>
              ${promptBox(a.en, '寫法')}
            </div>`).join('')}
        </div>

        <h3 class="lesson-h3">台灣國語叫不出來的時候</h3>
        <p class="res-note">模型預設的中文是字正腔圓的播音腔，
           做在地衛教聽起來會很遠。講義整理了一組可以直接貼的詞。</p>
        <div class="vgrid">
          <div class="vrow"><div class="v-h"><span class="v-t">腔調關鍵字</span></div>
            <p class="v-d">${esc(VID.accent.keys)}</p></div>
          <div class="vrow"><div class="v-h"><span class="v-t">發音特徵</span></div>
            <p class="v-d">${esc(VID.accent.phon)}</p></div>
          <div class="vrow"><div class="v-h"><span class="v-t">語尾助詞</span></div>
            <p class="v-d">${esc(VID.accent.particles)}</p></div>
          <div class="vrow"><div class="v-h"><span class="v-t">場景詞（連畫面一起在地化）</span></div>
            <p class="v-d">${esc(VID.accent.scene)}</p></div>
        </div>
        <div class="note o"><b>還是不對就換路：</b>${esc(VID.accent.fix)}</div>

        <div class="note r"><b>台詞長度是硬限制。</b>
          5 秒的鏡頭放不下一整句話，模型會加速念完或直接切掉。
          一鏡一句，12 個字以內，講完鏡頭才結束。要講兩句就拆成兩鏡。</div>` },

    /* ---- 6 ---- */
    { t:'照著做一次：一支 30 秒的短片',
      sub:'講義的身心科範例原文，加上《我要不要開刀》的影片版',
      body: ()=>`
        <p class="lesson-why">下面是一支完整的 30 秒短片，三幕的指令原文照抄。
           先讀一遍，注意每一句後面的括號標的是哪一條軸；
           然後把主角、物件、動作換成你的題目，結構整個留著。</p>

        <div class="vact">
          <div class="vact-h"><b>${esc(VID.sample.title)}</b>
            <span class="tag">30 秒・三幕</span></div>
          <p class="v-d"><b>目的：</b>${esc(VID.sample.goal)}</p>
          <p class="v-d"><b>配樂：</b>${esc(VID.sample.music)}</p>
        </div>

        ${VID.sample.acts.map(a=>`
          <div class="vact">
            <div class="vact-h"><b>${esc(a.t)}</b><span class="tag">${esc(a.axis)}</span></div>
            ${promptBox(a.prompt, '第 ' + a.n + ' 幕的完整指令')}
            <p class="vact-w">${esc(a.why)}</p>
          </div>`).join('')}

        <div class="note b">${esc(VID.sample.remind)}</div>

        <h3 class="lesson-h3">${esc(VID.bridge.title)}</h3>
        <p class="lesson-why">${esc(VID.bridge.lead)}</p>
        <div class="note g"><b>三條軸：</b>${esc(VID.bridge.anchors)}</div>
        ${promptBox(VID.bridge.fixed, '不變段落（三幕都原封不動貼這一段）')}

        ${VID.bridge.acts.map(a=>`
          <div class="vact">
            <div class="vact-h"><b>${esc(a.t)}</b><span class="tag">${esc(a.page)}</span></div>
            ${promptBox(a.prompt, '第 ' + a.n + ' 幕')}
            <p class="vact-w">${esc(a.why)}</p>
          </div>`).join('')}

        <div class="note o">${esc(VID.bridge.after)}</div>
        <div class="note b"><b>同一個故事，兩種載體。</b>
          五頁的讀物在<a href="#" data-go="care">友善就醫第 6 課</a>，
          兩邊的主角設定、硬規則、不變段落是同一份。
          案主拿讀物，家屬和志工看影片，訊息不會互相打架。</div>` },

    /* ---- 7 ---- */
    { t:'工具、額度與後製',
      sub:'用哪一個、要花多少點數、生完之後還要做什麼',
      body: ()=>`
        <p class="lesson-why">指令寫對了，剩下的是工具怎麼選、點數怎麼省，
           以及生完的片還要走哪幾步才能交出去。</p>

        <div class="vgrid">
          ${VID.tools.map(t=>`
            <div class="vrow">
              <div class="v-h"><span class="v-t">${esc(t.t)}</span></div>
              <p class="v-d">${esc(t.for)}</p>
              <p class="v-src">注意：${esc(t.note)}</p>
            </div>`).join('')}
        </div>

        <div class="note o"><b>點數：</b>${esc(VID.credits)}
          所以分鏡要先在紙上（或語言模型裡）定稿再去生，
          每重生一次 10 秒就是 10 點。</div>

        <h3 class="lesson-h3">後製六步（Clipchamp，Windows 內建）</h3>
        <ol class="howto">
          ${VID.post.map(x=>`<li>${esc(x)}</li>`).join('')}
        </ol>
        <div class="note r"><b>字幕一定要校。</b>${esc(VID.postWarn)}</div>

        <div class="note b"><b>交出去之前，</b>用檢查表的「影片」那一組核對一次，
          九項都過再送。<a href="#" data-go="ref">去檢查表 →</a></div>
        <p class="lesson-src">生壞了的時候：<a href="#" data-go="fix">疑難排解</a>
          有五條影片專用的症狀（換臉、不會動、鏡頭亂晃、對白被切、被擋下）。</p>` }
  ],

  // 目錄底下原本有一張「這一課的來源」卡片，使用者要求拿掉。
  done: ()=>`<a href="#" class="ln next" data-go="gen" data-medium="video">
    <span class="ln-k">下一步</span><span class="ln-t">去指令產生器，切到影音做一支</span></a>`
};

function renderVid(){ renderCourse('vid'); }

/* ============================================================
   路由
   ============================================================ */
const VIEWS = { home:renderHome, prin:renderPrin, gen:renderGen,
                fix:renderFix, res:renderRes, ref:renderRef, care:renderCare,
                vid:renderVid };
/* 分頁名稱（給頂部導覽用） */
const VIEW_NAME = {
  home:'工作台', prin:'四大原則', gen:'指令產生器',
  fix:'疑難排解', res:'學習資源', ref:'範例與檢查表', care:'友善就醫',
  vid:'影片指令'
};

function go(v){
  // 易學版（easy.js）掛在這裡：依目前模式把頁面分流到工作人員版或易學版
  if (typeof routeHook === 'function') v = routeHook(v);
  if (!VIEWS[v]) v = 'home';
  if ($('#ws-drawer')?.open) $('#ws-drawer').close();
  chgReset(); THEME_NOTE = '';
  // 離開首頁就把 3D 迴圈停掉（不在畫面上就不該燒 GPU）
  if (v !== 'home' && ORB) ORB.stop();

  $$('.view').forEach(x=>x.classList.toggle('on', x.id==='view-'+v));

  // 工作人員版共用工作台導覽；易學版各頁保留自己的抬頭。
  const bar = $('#topbar');
  if (bar){
    bar.hidden = /^e-/.test(v);
    // 麵包屑帶上模組自己的圖示，跟首頁目錄那一列是同一個
    const c = $('#crumb');
    if (c) c.innerHTML = (HUB_OF[v] ? hubIco(v) : '') + esc(VIEW_NAME[v] || '');
  }
  document.body.classList.toggle('is-home', v === 'home');
  document.body.dataset.view = v;
  syncWorkspace();

  // 從外面進課程一律先到目錄。目錄會標「繼續第 n 課」，進度沒丟，
  // 但不會一點進去就跳到某一課的中間——那會讓人以為開錯頁。
  if (COURSES[v]) store.set(lessonKey(v), 0);

  VIEWS[v]();          // 進首頁時 renderHome() 會 start() 球體
  decorateHead(v);
  window.scrollTo(0,0);
}
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-v]');  if (b) return go(b.dataset.v);
  // 有些 data-go 掛在 <a href="#"> 上（內文裡的跳頁連結），
  // 不擋掉預設行為網址會多一個 #，回上一頁的行為也會怪
  const g = e.target.closest('[data-go]');
  if (g){
    e.preventDefault();
    // 課程結尾的「去產生器」要順便把形式切好，不然使用者會落在讀物模式
    if (g.dataset.medium && CFG.medium !== g.dataset.medium){
      CFG.medium = g.dataset.medium; saveCfg();
    }
    return go(g.dataset.go);
  }
  const l = e.target.closest('[data-lb]');
  if (l){ $('#lb img').src = l.dataset.lb; $('#lb').classList.add('on'); }
});
$('#lb').addEventListener('click', ()=> $('#lb').classList.remove('on'));
document.addEventListener('keydown', e=>{
  if (e.key==='Escape') $('#lb').classList.remove('on');
});

mountUi($('#ui-top'));
// 每次打開一律從首頁開始。之前記住上一次的分頁，結果不同瀏覽器記到不同地方，
// 用啟動器（Chrome）開會跳到之前看的那頁，被當成「開錯地方」。
// 等全部 script 都載完才開（easy.js 在後面，要先登記好易學版的頁和模式）。
document.addEventListener('DOMContentLoaded', ()=>{
  mountWorkspace();
  go('home');
  if (SAVED_DATA_BAD) toast('舊存檔有部分資料無法讀取，請匯入有效備份');
});
