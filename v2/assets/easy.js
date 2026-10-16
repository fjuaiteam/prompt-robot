/* ============================================================
   易學版 — 畫面與邏輯
   ------------------------------------------------------------
   給心智障礙者自己操作的版本（心智年齡大約 8 歲，大人小孩都有）。
   工作人員版的功能不動：這個檔只掛在 app.js 留下的接口上——
     1. routeHook(v)：路由依目前模式分流（工作人員版的頁 ↔ 易學版的頁）
     2. VIEWS／VIEW_NAME：登記易學版自己的頁
     3. [data-mode] 按鈕：切換模式
   畫面上的字、選項、給 AI 的句子都在 easy-data.js。

   介面規則——拿平台自己在教的易讀指南來做介面本身：
   ・一個畫面只問一件事
   ・以圖卡選擇為主；選「其他」時才自己填文字
   ・每個選項都是圖＋字
   ・「上一步」永遠在左下、「下一步」永遠在右下
   ・不倒數、不自動跳頁、沒有一按就刪光的按鈕
   ============================================================ */

const byId  = (list, id) => (list || []).find(x => x.id === id) || null;
const nl2br = s => esc(s).replace(/\n/g, '<br>');

/* ============================================================
   工程模式：工作人員可以替換內建圖卡，或新增自己的選項。
   所有設定只存在目前瀏覽器；圖片縮小後才存，避免很快塞滿瀏覽器空間。
   ============================================================ */
const ENG_ALLOWED = new Set(['hair','top','aid','place','mood','style']);
const engQidAllowed = qid => ENG_ALLOWED.has(qid) || /^act:[a-z0-9-]{1,80}$/i.test(qid);
const ENG_BASE_CATS = [
  {id:'sex',   t:'男生／女生', add:false},
  {id:'age',   t:'年齡',       add:false},
  {id:'hair',  t:'頭髮',       add:true,  hint:'例如：黑色短頭髮'},
  {id:'top',   t:'衣服',       add:true,  hint:'例如：白色長袖襯衫、黑色長褲'},
  {id:'aid',   t:'隨身物品或輔具',add:true,hint:'例如：戴紅色帽子，背黑色背包'},
  {id:'place', t:'地方',       add:true,  hint:'例如：圖書館，旁邊有書架'},
];
const ENG_EMPTY = ()=>({ extras:[], images:{} });
function engLoad(){
  const d = store.get('e_engineer', null);
  if (!d || !Array.isArray(d.extras) || !d.images || typeof d.images !== 'object') return ENG_EMPTY();
  const extras = d.extras.filter(x => x && engQidAllowed(x.qid) && typeof x.id === 'string' &&
    typeof x.t === 'string' && typeof x.p === 'string').map(x=>({
      id:x.id.slice(0,80), qid:x.qid, t:x.t.slice(0,40), p:x.p.slice(0,240)
    }));
  const images = {};
  Object.entries(d.images).forEach(([k,v])=>{
    if (typeof v === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(v) && v.length < 900000)
      images[k.slice(0,180)] = v;
  });
  return {extras, images};
}
let ENG = engLoad();
let ENG_CAT = 'place';
let ENG_EDIT = null;
let ENG_PENDING_IMAGE = '';
function engSave(){
  try{ localStorage.setItem(STORE_PREFIX+'e_engineer', JSON.stringify(ENG)); return true; }
  catch(e){
    ENG = engLoad();
    toast('儲存空間不足。請先刪除不用的自訂圖片。');
    return false;
  }
}
const engKey = (qid, o) => qid + ':' + (o && o.id || '');
const engExtras = qid => ENG.extras.filter(x => x.qid === qid).map(x => {
  const o = {...x, _engCustom:true};
  if (qid === 'aid') o.name = x.t;
  if (qid === 'place') o.short = x.t;
  return o;
});
function engMark(qid, o){
  return o ? {...o, _engKey:engKey(qid,o)} : o;
}
const engFlowQid = qid => qid === 'act' ? 'act:' + (EP && EP.ans.place || '') : qid;
function engCats(){
  const actions = EASY_PLACE.concat(engExtras('place')).map(p=>({
    id:'act:' + p.id, t:'動作｜' + p.t, add:true,
    hint:'例如：坐在桌子前看書'
  }));
  return ENG_BASE_CATS.concat(actions, [
    {id:'mood',  t:'心情',     add:true,  hint:'例如：安心，表情放鬆，肩膀自然'},
    {id:'style', t:'畫風',     add:true,  hint:'例如：簡單拼貼插畫，低飽和、背景乾淨'},
    {id:'fix',   t:'修改問題', add:false}
  ]);
}

/* ============================================================
   模式：工作人員版／易學版
   ------------------------------------------------------------
   記在 sessionStorage，不記在 localStorage：
   ・點兩下 index.html 一定是工作人員版，點兩下「易學版.html」一定是易學版。
     不會發生「昨天案主用過，今天社工一打開變成易學版」。
   ・在畫面上切換之後按 F5 重新整理，還是同一版（同一個分頁內記得）。
   ============================================================ */
let MODE_MEM = 'pro';
const PRO_TITLE = document.title;
function modeGet(){
  try{
    const m = sessionStorage.getItem('rbot_v2_mode');
    if (m) return m === 'easy' ? 'easy' : 'pro';
  }catch(e){}
  return MODE_MEM;
}
function modeSet(m){
  MODE_MEM = m;
  try{ sessionStorage.setItem('rbot_v2_mode', m); }catch(e){}
  document.body.classList.toggle('mode-easy', m === 'easy');
  // 分頁名稱改成「易學版」開頭：去 ChatGPT 之後，要靠這個名字找回來
  document.title = m === 'easy' ? EASY_UI.tabTitle : PRO_TITLE;
  // 兩版各自記字級：社工在筆電上看 16pt，案主可能要大一點
  if (typeof uiRestore === 'function') uiRestore();
}

// 「易學版.html」會帶 ?mode=easy 過來。讀完就從網址拿掉，
// 之後在畫面上切回工作人員版再重新整理，才不會又被網址拉回易學版。
(function(){
  const m = /[?&]mode=(easy|pro)(?:&|$)/.exec(location.search);
  if (m){
    MODE_MEM = m[1];
    try{ sessionStorage.setItem('rbot_v2_mode', m[1]); }catch(e){}
    try{ history.replaceState(null, '', location.href.split('?')[0] + location.hash); }catch(e){}
  }
  modeSet(modeGet());
})();

/* 路由分流：易學版只走 e- 開頭的頁，工作人員版只走其他頁。
   工作人員版內文裡的 data-go 連結、回首頁，到了易學版一律回易學版首頁。 */
function routeHook(v){
  const easy = modeGet() === 'easy';
  if (v === 'read' || v === 'e-read') return easy ? 'e-read' : 'read';
  const isE  = /^e-/.test(v);
  if (easy && !isE) return 'e-home';
  if (!easy && isE) return 'home';
  return v;
}

function switchMode(m){
  modeSet(m);
  go('home');
  toast(m === 'easy' ? '換成易學版' : '換成工作人員版');
}

// 工作人員版 → 易學版：按一下就換。
// 易學版 → 工作人員版：要再確認一次，案主誤觸不會跑進滿滿都是字的工作人員版。
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  const to = b.dataset.mode === 'easy' ? 'easy' : 'pro';
  if (to === modeGet()) return;
  if (to === 'easy') return switchMode('easy');
  eAsk(EASY_UI.toProQ, EASY_UI.toProNo, EASY_UI.toProYes).then(ok=>{ if (ok) switchMode('pro'); });
});

/* ============================================================
   小零件
   ============================================================ */

/* 選項的圖。先顯示 emo 那個符號，圖檔真的載入成功才換成圖；
   優先用指定的真人照片，再找原圖卡 .png、.jpg，都沒有就保留符號——
   圖還沒生出來的時候也能用，不會閃出破圖，生好放進資料夾就自動換上。 */
// 找過、確定沒有的圖記起來，之後每次換畫面就不用再去找一次
const PIC_MISS = new Set();
function ePic(o){
  if (!o) return '<span class="e-pic e-none" aria-hidden="true"></span>';
  const managed = o._engKey && ENG.images[o._engKey];
  if (managed) return `<span class="e-pic ok e-managed-pic" aria-hidden="true"><img alt="" src="${esc(managed)}"></span>`;
  if (o.custom) return `<span class="e-pic e-custom-pic" aria-hidden="true">${svg('<path d="m4 13 9-9 3 3-9 9-4 1zM11 6l3 3"/>')}</span>`;
  if (o.hex) return `<span class="e-pic e-swatch" aria-hidden="true">${shirt(o.hex)}</span>`;
  if (o.none) return '<span class="e-pic e-none" aria-hidden="true"></span>';
  const emo = `<span class="e-emo">${o.emo || ''}</span>`;
  const photo = o.photo && !PIC_MISS.has(o.photo + '.jpg') ? o.photo : null;
  if (!photo && (!o.pic || PIC_MISS.has(o.pic))) return `<span class="e-pic" aria-hidden="true">${emo}</span>`;
  const src = photo ? photo + '.jpg' : o.pic + '.png';
  return `<span class="e-pic${photo ? ' e-photo' : ''}" aria-hidden="true"><img alt="" src="assets/easy/pics/${esc(src)}"
      ${photo ? `data-photo="${esc(photo)}"` : ''}
      data-pic="${esc(o.pic)}" data-alt="assets/easy/pics/${esc(o.pic)}.jpg"
      onload="this.parentNode.classList.add('ok')" onerror="ePicErr(this)">${emo}</span>`;
}
function ePicErr(img){
  const photo = img.getAttribute('data-photo');
  if (photo){
    PIC_MISS.add(photo + '.jpg');
    img.removeAttribute('data-photo');
    img.parentNode.classList.remove('e-photo');
    img.src = 'assets/easy/pics/' + img.getAttribute('data-pic') + '.png';
    return;
  }
  const alt = img.getAttribute('data-alt');
  if (alt){ img.removeAttribute('data-alt'); img.src = alt; return; }
  PIC_MISS.add(img.getAttribute('data-pic'));
  img.remove();
}
// 衣服顏色用色塊畫，看得最清楚，也不用另外生圖
function shirt(hex){
  // 外框顏色不寫死，交給 easy.css 用 var(--ink)，換色票時才不會漏掉這裡
  return `<svg viewBox="0 0 100 100"><path fill="${hex}" stroke-width="3"
    stroke-linejoin="round" d="M35 16 20 22 8 40l14 8 6-8v44h44V40l6 8 14-8-12-18-15-6q-15 12-30 0z"/></svg>`;
}

function eOpt(o, on, attr){
  return `<button type="button" class="e-opt" ${attr} aria-pressed="${on ? 'true' : 'false'}">
    ${ePic(o)}
    <span class="e-otx"><span class="e-ot">${esc(o.t)}</span>
      ${o.sub ? `<span class="e-os">${esc(o.sub)}</span>` : ''}</span>
    <span class="e-tick" aria-hidden="true">✓<span class="e-tick-t"> 選了</span></span>
  </button>`;
}

/* 五個分類的圖示。用工作人員版那套 20x20、1.5 筆畫的線條圖示，
   不用 emoji——emoji 每台電腦長得不一樣，而且跟平台的線條圖示混在一起很雜。 */
const ICO_PART = {
  who  : svg('<circle cx="10" cy="6.2" r="2.9"/><path d="M4.6 16.6a5.4 5.4 0 0 1 10.8 0"/>'),
  where: svg('<path d="M10 17.2s5-4.8 5-8.6a5 5 0 0 0-10 0c0 3.8 5 8.6 5 8.6z"/><circle cx="10" cy="8.4" r="1.8"/>'),
  what : svg('<circle cx="12.6" cy="4.4" r="1.7"/><path d="M5.2 16.8 8 13.4l1-3.1 3.3 1.9 2.7-.5"/><path d="M8 10.3 5.4 8"/>'),
  feel : svg('<circle cx="10" cy="10" r="6.5"/><path d="M7.7 8.5h.01M12.3 8.5h.01"/>' +
             '<path d="M7.4 12a3.3 3.3 0 0 0 5.2 0"/>'),
  look : svg('<path d="M10 3.7a6.3 6.3 0 1 0 0 12.6c1 0 1.4-.7 1.1-1.4-.4-.9.2-1.7 1.2-1.7h1.1a3 3 0 0 0 3-3c0-3.6-3-6.5-6.4-6.5z"/>' +
             '<path d="M7.3 8.2h.01M10.8 6.9h.01"/>')
};
function ePtag(part, text){
  const P = EASY_PARTS[part];
  return `<span class="e-ptag" data-part="${part}">${ICO_PART[part] || ''} ${esc(text || P.t)}</span>`;
}

// extra：接在目前這一步後面的字（選題目時是「第 3 題，共 9 題」），省掉一整行
function eStages(cur, extra){
  return `<ol class="e-stages" aria-label="做一張圖的步驟">${EASY_UI.stages.map((s,i)=>`
    <li class="${i < cur ? 'done' : (i === cur ? 'on' : '')}"${i === cur ? ' aria-current="step"' : ''}>
      <span class="e-stn" aria-hidden="true">${i < cur ? '✓' : i + 1}</span><span class="e-stl">${esc(s)}</span>${
      i === cur && extra ? `<span class="e-stx">${esc(extra)}</span>` : ''}</li>`).join('')}</ol>`;
}

function eNav(prev, next){
  return `<nav class="e-nav" aria-label="上一步和下一步">
    <button type="button" class="e-btn ghost e-prev" data-e="prev">${I.left}${esc(prev)}</button>
    ${next ? `<button type="button" class="e-btn e-next" data-e="next">${esc(next)}${I.right}</button>` : ''}
  </nav>`;
}

// 換畫面之後：回到最上面、焦點放到標題（螢幕閱讀器會唸，鍵盤也知道換頁了）
function eFocus(host){
  window.scrollTo(0, 0);
  const h = $('.e-h1, .e-h2', host);
  if (h) h.focus({ preventScroll:true });
}

/* 複製。先用同步的 execCommand：「複製並打開 ChatGPT」要在同一次點擊裡
   先複製完再開新分頁，非同步的 clipboard API 等到分頁切走就會失敗。 */
function eCopy(txt, quiet){
  const back = document.activeElement;
  let ok = false;
  const ta = document.createElement('textarea');
  ta.value = txt; ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta); ta.select();
  try{ ok = document.execCommand('copy'); }catch(e){}
  ta.remove();
  if (back && back.focus) back.focus({ preventScroll:true });
  if (!ok && navigator.clipboard && window.isSecureContext)
    navigator.clipboard.writeText(txt).catch(()=>{});
  if (!quiet) toast(EASY_UI.copied);
  return ok;
}
function eAiUrl(txt){
  if (!EASY_AI.q) return EASY_AI.url;
  const url = EASY_AI.q + encodeURIComponent(txt);
  return url.length <= 12000 ? url : EASY_AI.url;
}

/* 確認視窗。安全的選項（不要）是實心的主要按鈕，而且預設焦點在它上面。 */
function eAsk(q, no, yes){
  return new Promise(res=>{
    let d = $('#e-dlg');
    if (!d){
      d = document.createElement('dialog');
      d.id = 'e-dlg'; d.className = 'e-dlg';
      document.body.appendChild(d);
    }
    d.innerHTML = `<p class="e-dlg-q">${nl2br(q)}</p>
      <div class="e-dlg-b">
        <button type="button" class="e-btn" value="no" autofocus>${esc(no)}</button>
        <button type="button" class="e-btn ghost" value="yes">${esc(yes)}</button>
      </div>`;
    d.onclick = e=>{ const b = e.target.closest('button[value]'); if (b) d.close(b.value); };
    d.onclose = ()=>res(d.returnValue === 'yes');
    d.returnValue = '';
    if (d.showModal) d.showModal(); else res(confirm(q));
  });
}

/* 每一頁的外框（抬頭：回首頁、字級）只建一次，
   之後只換 .e-body。字級按鈕會在 document 上掛監聽，重建會一直疊上去。 */
const EBUILT = {};
function eShell(id, title){
  const host = $('#view-' + id);
  if (EBUILT[id]) return host;
  host.innerHTML = `<div class="e-page">
    <header class="e-top">
      ${title
        ? `<button type="button" class="e-homebtn" data-e="home">${I.left}回首頁</button>
           <span class="e-title">${esc(title)}</span>`
        : `<span class="e-brand">${esc(EASY_UI.mark)}<b>${esc(EASY_UI.modeName)}</b></span>`}
      <span class="e-tools"><span class="uiscale" id="ui-${id}"></span></span>
    </header>
    <div class="e-body"></div>
  </div>`;
  mountUi($('#ui-' + id));
  host.addEventListener('click', eClick);
  host.addEventListener('input', eCustomInput);
  EBUILT[id] = true;
  return host;
}

/* ============================================================
   易學版首頁
   ============================================================ */
function renderEHome(){
  const host = eShell('e-home', null);
  const has = epHasProgress();
  const C = has ? (EP.at === 'done' ? EASY_UI.picDone : EASY_UI.picResume) : EASY_UI.picCard;
  $('.e-body', host).innerHTML = `
    <h1 class="e-h1" tabindex="-1">${nl2br(EASY_UI.homeTitle)}</h1>
    <div class="e-cards">
      <button type="button" class="e-card" data-e="${has ? 'resume' : 'start'}">
        <span class="e-card-i" aria-hidden="true">${ePic({ pic:'home-pic', emo:'🖼️' })}</span>
        <span class="e-card-t">${esc(C.t)}</span>
        <span class="e-card-d">${nl2br(C.d)}</span>
        <span class="e-card-go" aria-hidden="true">${I.right}</span>
      </button>
      ${has ? `<button type="button" class="e-btn ghost e-restart" data-e="restart">${esc(EASY_UI.picRestart)}</button>` : ''}
      <button type="button" class="e-card doc-entry" data-go="read">
        <span class="e-card-i doc-entry-i" aria-hidden="true">${READ_ICON}</span>
        <span class="e-card-t">${esc(EASY_UI.docCard.t)}</span>
        <span class="e-card-d">${esc(EASY_UI.docCard.d)}</span>
        <span class="e-card-go" aria-hidden="true">${I.right}</span>
      </button>
    </div>
    <footer class="e-foot">
      <p class="e-credit"><a href="${esc(EASY_UI.photoCreditUrl)}" target="_blank"
        rel="noopener">${esc(EASY_UI.photoCredit)}</a><br><a href="${esc(EASY_UI.creditUrl)}" target="_blank"
        rel="noopener">${esc(EASY_UI.credit)}</a></p>
      <span class="e-fbtns">
        <button type="button" class="e-quiet" data-e="nextone">${esc(EASY_UI.nextOne)}</button>
        <button type="button" class="e-quiet" data-e="engineer">${esc(EASY_UI.toEngineer)}</button>
        <button type="button" class="e-quiet" data-mode="pro">${esc(EASY_UI.toPro)}</button>
      </span>
    </footer>`;
  eFocus(host);
}

/* ============================================================
   做一張圖
   ------------------------------------------------------------
   畫面順序：九題 → 摘要 → 指令 → 給 AI 畫 → 圖畫得對嗎？
                                              ├ 對 → 完成
                                              └ 不對 → 哪裡不對 → 只改這一件事 → 圖畫得對嗎？
   選到哪裡、選了什麼都存起來，回首頁再進來會接著做。
   ============================================================ */
const EP_NEW  = ()=>({ at:'sex', ans:{}, custom:{}, ret:null, fix:null, gave:false });
let EP = (()=>{
  const d = store.get('e_pic', null);
  const loaded = (d && typeof d === 'object' && d.ans && typeof d.ans === 'object')
    ? Object.assign(EP_NEW(), d) : EP_NEW();
  const saved = loaded.custom;
  loaded.custom = {};
  Object.keys(EASY_CUSTOM).forEach(q=>{
    if (saved && typeof saved[q] === 'string') loaded.custom[q] = saved[q].slice(0, EASY_CUSTOM_MAX);
  });
  return loaded;
})();
function epSave(){ store.set('e_pic', EP); }
function epHasProgress(){ return Object.keys(EP.ans).length > 0; }

const EP_FLOW  = { sum:'prompt', prompt:'give', give:'check', fix:'check' };
const EP_BACK  = { prompt:'sum', give:'prompt', check:'give', done:'check', fixpick:'check', fix:'fixpick' };
const EP_STAGE = { sum:1, prompt:1, give:2, check:3, done:3, fixpick:3, fix:3 };

const qIndex = id => EASY_QS.findIndex(q => q.id === id);

// 動作依地方顯示；四種畫風一律可選，指定的四題另提供「其他」。
function epOpts(qid){
  const a = EP.ans;
  let opts;
  switch (qid){
    case 'sex'  : return EASY_SEX;
    case 'age'  : return EASY_AGE;
    case 'hair' : opts = EASY_HAIR; break;
    case 'top'  : opts = EASY_TOP; break;
    case 'aid'  : opts = EASY_AID; break;
    case 'place': opts = EASY_PLACE; break;
    case 'act'  : { const p = byId(EASY_PLACE, a.place); opts = p ? p.acts : []; break; }
    case 'mood' : opts = EASY_MOOD; break;
    case 'style': opts = EASY_STYLE; break;
    case 'fix'  : return EASY_FIX;
  }
  if (!opts) return [];
  const extraQid = qid === 'act' ? 'act:' + (a.place || '') : qid;
  const extras = engQidAllowed(extraQid) ? engExtras(extraQid) : [];
  const all = opts.concat(extras);
  return EASY_CUSTOM[qid] ? all.concat({id:'other', t:'其他', custom:true}) : all;
}
const epOptOf = qid => byId(epOpts(qid), qid === 'fix' ? EP.fix : EP.ans[qid]);
const epCustomValue = (qid, custom = EP.custom) =>
  custom && typeof custom[qid] === 'string' ? custom[qid].slice(0, EASY_CUSTOM_MAX).trim() : '';
const epLabel = qid => {
  const o = epOptOf(qid);
  return o ? (o.custom ? epCustomValue(qid) : o.t) : '';
};
const epAnswered = qid => !!EP.ans[qid] && (EP.ans[qid] !== 'other' || !!epCustomValue(qid));

// 答案跟選項對不上的丟掉（換了地方，原本的動作就不算數；easy-data.js 改過也一樣）
function epClean(){
  EASY_QS.forEach(Q=>{
    if (EP.ans[Q.id] && !epOptOf(Q.id)) delete EP.ans[Q.id];
  });
  if (EP.fix && !byId(EASY_FIX, EP.fix)) EP.fix = null;
}
function epMissing(){
  const q = EASY_QS.find(Q => !epAnswered(Q.id));
  return q ? q.id : null;
}

function epPick(qid, oid){
  if (qid === 'fix'){ EP.fix = oid; return; }
  if (qid === 'place' && EP.ans.place !== oid){
    delete EP.ans.act; delete EP.custom.act;
  }
  EP.ans[qid] = oid;
  epClean();
}

function epGo(at){
  EP.at = at;
  epSave();
  epRender();
}

/* ---------- 組指令 ----------
   四大原則都在這裡自動套上，使用者不用知道：
   原則 1：每一段都是看得見的條件（「紅色短袖上衣」，不是「好看的衣服」）
   原則 2：主角那一段固定，而且寫明「每一張圖都照這一段畫」
   原則 3：只畫一張
   原則 4：不滿意的修正指令一律「整張重新畫」
   回傳一段一段的，每段標上是誰（主角、地方……），畫面上才能上色。 */
function epHero(a){
  const age = byId(EASY_AGE, a.age), hair = byId(epOpts('hair'), a.hair);
  const top = byId(epOpts('top'), a.top),  aid  = byId(epOpts('aid'), a.aid);
  if (!age || !hair || (!top && a.top !== 'other')) return '';
  const C = a.age === 'old' ? '灰白色' : '黑色';
  const pants = a.age === 'kid' ? '深藍色短褲' : '深藍色長褲';
  const out = [age.p[a.sex === 'f' ? 'f' : 'm'], hair.p.replace('{C}', C),
               a.top === 'other' ? '穿著：' + epCustomValue('top')
                 : (top._engCustom ? '穿著：' + top.p : '穿' + top.p + '短袖上衣、' + pants + '、白色球鞋')];
  if (aid && aid.p) out.push(aid.p);
  if (a.aid === 'other') out.push('隨身物品或輔具：' + epCustomValue('aid'));
  return out.join('，');
}
function epAct(a){
  if (a.act === 'other') return epCustomValue('act');
  const x = byId(epOpts('act'), a.act);
  if (!x) return '';
  return (a.aid === 'wheelchair' && x.wc) ? x.wc : x.p;
}
function epPlace(a){
  if (a.place === 'other'){
    const text = epCustomValue('place');
    return {p:text, short:text};
  }
  return byId(epOpts('place'), a.place);
}
function epSegs(a){
  const place = epPlace(a), mood = byId(epOpts('mood'), a.mood);
  const style = byId(epOpts('style'), a.style), age  = byId(EASY_AGE, a.age);
  const aid   = byId(epOpts('aid'), a.aid);
  const S = [];
  const t = (x, part)=>{ if (x) S.push({ t:x, part:part || null }); };

  t('請幫我畫一張圖。\n\n');
  t('【主角】每一張圖都照這一段畫，不要改\n'); t(epHero(a), 'who');
  t('\n\n【地方】');     t(place && place.p, 'where');
  t('\n【在做什麼】');   t(epAct(a), 'what');
  t('\n【心情】');       t(mood && mood.p, 'feel');
  t('\n【畫風】');       t(style && style.p, 'look');
  t('\n\n【規則】');

  const rules = [
    ['只畫一張圖，正方形。'],
    ['圖上不要有任何字、數字、招牌字或標誌。'],
    ['只畫上面寫到的東西，不要自己多加別的人、動物或東西。'],
    ['主角的全身都要在圖裡，頭和腳都不要被切掉。'],
    ['背景單純，看得出是', [place && place.short, 'where'], '就好。'],
    [age && age.rule]
  ];
  if (aid && aid.name)
    rules.push([[aid.name, 'who'], '是主角的一部分，一定要畫出來，樣子不能變。' +
      (aid.id === 'glasses' ? '' : '主角的動作要配合' + aid.name + '，畫得合理。')]);
  if (a.aid === 'other')
    rules.push(['上面描述的隨身物品或輔具是主角的一部分，每一張都要照描述畫出來，外觀和用法不能變，動作要合理。']);
  rules.filter(r => r[0]).forEach((r, i)=>{
    t('\n' + (i + 1) + '. ');
    r.forEach(x => Array.isArray(x) ? t(x[0], x[1]) : t(x));
  });
  return S;
}
const epText = ()=> epSegs(EP.ans).map(s => s.t).join('');
const segHtml = S => S.map(s => s.part
  ? `<mark class="e-mk" data-part="${s.part}">${esc(s.t)}</mark>` : esc(s.t)).join('');

function epFixText(){
  const f = byId(EASY_FIX, EP.fix);
  if (!f) return '';
  const place = epPlace(EP.ans);
  return f.p.replace('{HERO}', ()=>epHero(EP.ans))
            .replace('{PLACE}', ()=>place ? place.short : '')
            .replace('{ACT}', ()=>epAct(EP.ans));
}

/* ---------- 各個畫面 ----------
   每個畫面回傳：html、左下和右下按鈕的字（沒有右下就是 null） */

function epProg(qi){
  return `<div class="e-prog" aria-hidden="true">${EASY_QS.map((Q, i)=>
    `<i data-part="${Q.part}" class="${epAnswered(Q.id) ? 'on' : ''}${i === qi ? ' cur' : ''}"></i>`).join('')}</div>`;
}

function scrQ(qid){
  const qi = qIndex(qid), Q = EASY_QS[qi];
  const opts = epOpts(qid).filter(o=>!o.custom), cur = EP.ans[qid], custom = EASY_CUSTOM[qid];
  const last = qi === EASY_QS.length - 1;
  return {
    count:`第 ${qi + 1} 題，共 ${EASY_QS.length} 題`,
    html:`<section class="e-q" data-part="${Q.part}">
      <div class="e-qhead">${ePtag(Q.part)}${epProg(qi)}</div>
      <h2 class="e-h2" tabindex="-1">${esc(Q.q)}</h2>
      ${Q.hint ? `<p class="e-hint">${esc(Q.hint)}</p>` : ''}
      <p class="e-need" id="e-need-${qid}" role="alert" hidden>${esc(EASY_UI.needPick)}</p>
      <div class="e-opts" data-n="${opts.length}" role="group" aria-label="${esc(Q.q)}" ${opts.length ? '' : 'hidden'}>
        ${opts.map(o => eOpt(engMark(engFlowQid(qid),o), o.id === cur, `data-e="pick" data-q="${qid}" data-o="${esc(o.id)}"`)).join('')}
      </div>
      ${custom ? `<div class="e-other">
        <button type="button" class="e-btn ghost e-other-btn" data-e="pick" data-q="${qid}" data-o="other"
          aria-pressed="${cur === 'other'}" aria-controls="e-custom-${qid}">其他，自己填<span class="e-other-mark" aria-hidden="true">✓</span></button>
        <div class="e-custom" id="e-custom-${qid}" ${cur === 'other' ? '' : 'hidden'}>
          <label for="e-custom-input-${qid}">${esc(custom.label)}</label>
          <p class="e-hint" id="e-custom-hint-${qid}">${esc(custom.example)}</p>
          <input type="text" id="e-custom-input-${qid}" data-custom="${qid}" maxlength="${EASY_CUSTOM_MAX}"
            value="${esc(EP.custom[qid] || '')}" ${cur === 'other' ? 'required' : 'disabled'}
            aria-describedby="e-custom-hint-${qid} e-need-${qid}">
        </div>
      </div>` : ''}
    </section>`,
    prev: EP.ret ? '回去' : (qi === 0 ? '回首頁' : '上一步'),
    next: EP.ret ? '好了' : (last ? '選好了' : '下一步')
  };
}

function scrSum(){
  let lastPart = '';
  const rows = EASY_QS.map(Q=>{
    const head = Q.part !== lastPart
      ? `<li class="e-sgrp">${ePtag(Q.part)}</li>` : '';
    lastPart = Q.part;
    return head + `<li class="e-srow" data-part="${Q.part}">
      ${ePic(engMark(engFlowQid(Q.id),epOptOf(Q.id)))}
      <span class="e-sk">${esc(Q.k)}</span>
      <span class="e-sv">${esc(epLabel(Q.id))}</span>
      <button type="button" class="e-btn ghost e-edit" data-e="edit" data-q="${Q.id}"
        aria-label="改${esc(Q.k)}">改</button></li>`;
  }).join('');
  return {
    html:`<h2 class="e-h2" tabindex="-1">${esc(EASY_UI.sumTitle)}</h2>
      <p class="e-hint">${esc(EASY_UI.sumSub)}</p>
      <ul class="e-sum">${rows}</ul>`,
    prev:'上一步', next:'做成指令'
  };
}

function scrPrompt(){
  const S = epSegs(EP.ans);
  const used = Object.keys(EASY_PARTS).filter(p => S.some(s => s.part === p));
  return {
    html:`<h2 class="e-h2" tabindex="-1">${esc(EASY_UI.promptTitle)}</h2>
      <ul class="e-lines">${EASY_UI.promptLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="e-legend">${used.map(p => ePtag(p)).join('')}</p>
      <pre class="e-prompt">${segHtml(S)}</pre>`,
    prev:'上一步', next:EASY_UI.giveTitle
  };
}

/* 第 2 步的兩種情況，各配一張小示意圖：框框裡有字＋送出鈕；右鍵選單的「貼上」。
   按鈕放在第 1 步裡面：一按下去就會跳到 ChatGPT，所以三步要先看完。 */
const ICO_SEND = svg('<path d="M10 15.6V4.4m0 0-4.6 4.6M10 4.4l4.6 4.6"/>');
function giveMock(kind){
  return kind === 'send'
    ? `<span class="e-mock e-mock-box" aria-hidden="true"><i></i><i></i><b>${ICO_SEND}</b></span>`
    : `<span class="e-mock e-mock-menu" aria-hidden="true"><span>複製</span><span class="on">貼上</span></span>`;
}
function scrGive(){
  const U = EASY_UI;
  return {
    html:`<h2 class="e-h2" tabindex="-1">${esc(U.giveTitle)}</h2>
      <p class="e-hint">${esc(U.giveLead)}</p>
      <ol class="e-steps">
        <li><span class="e-sn">1</span><div>
          <p>${esc(U.give1)}</p>
          <div class="e-give">
            <button type="button" class="e-btn e-big" data-e="give">${I.copy}${esc(U.giveBtn)}</button>
            <p class="e-ok" id="e-give-ok" ${EP.gave ? '' : 'hidden'}>✓ ${esc(U.copied)}</p>
          </div></div></li>
        <li><span class="e-sn">2</span><div>
          <p>${esc(U.give2)}</p>
          <p>${esc(U.giveHas)}${giveMock('send')}</p>
          <p>${esc(U.giveEmpty)}${giveMock('menu')}</p></div></li>
        <li><span class="e-sn">3</span><div><p>${esc(U.give3)}</p></div></li>
      </ol>
      <p class="e-alt"><button type="button" class="e-link" data-e="copyprompt">${esc(U.giveOnly)}</button></p>`,
    prev:'上一步', next:'圖畫好了'
  };
}

// 圖畫得對嗎？把選的東西排成一行，讓他對著圖一個一個看
function epChips(){
  const a = EP.ans;
  const who = [epLabel('sex'), epLabel('age'), epLabel('hair'), epLabel('top') + (a.top === 'other' ? '' : '衣服')]
    .concat(a.aid && a.aid !== 'none' ? [epLabel('aid')] : []).join('・');
  return `<p class="e-chips">${ePtag('who', who)}${ePtag('where', epLabel('place'))}` +
         `${ePtag('what', epLabel('act'))}${ePtag('feel', epLabel('mood'))}${ePtag('look', epLabel('style'))}</p>`;
}
function scrCheck(){
  return {
    html:`<h2 class="e-h2" tabindex="-1">${esc(EASY_UI.checkTitle)}</h2>
      <p class="e-hint">${esc(EASY_UI.checkSub)}</p>
      ${epChips()}
      <div class="e-yn">
        <button type="button" class="e-yn-b ok" data-e="ok"><span class="e-yn-i" aria-hidden="true">✓</span>${esc(EASY_UI.checkOk)}</button>
        <button type="button" class="e-yn-b bad" data-e="bad"><span class="e-yn-i" aria-hidden="true">✗</span>${esc(EASY_UI.checkBad)}</button>
      </div>`,
    prev:'上一步', next:null
  };
}

function scrDone(){
  return {
    html:`<div class="e-done">
        <span class="e-done-i" aria-hidden="true">✓</span>
        <h2 class="e-h2" tabindex="-1">${esc(EASY_UI.doneTitle)}</h2>
        <ul class="e-lines">${EASY_UI.doneLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        <div class="e-acts">
          <button type="button" class="e-btn" data-e="same">${esc(EASY_UI.doneSame)}</button>
          <button type="button" class="e-btn ghost" data-e="new">${esc(EASY_UI.doneNew)}</button>
          <button type="button" class="e-btn ghost" data-e="home">回首頁</button>
        </div>
      </div>`,
    prev:'上一步', next:null
  };
}

function scrFixPick(){
  const opts = EASY_FIX;
  return {
    html:`<h2 class="e-h2" tabindex="-1">${esc(EASY_UI.fixPickTitle)}</h2>
      <p class="e-hint">${esc(EASY_UI.fixPickSub)}</p>
      <p class="e-need" role="alert" hidden>${esc(EASY_UI.needPick)}</p>
      <div class="e-opts" data-n="${opts.length}" role="group" aria-label="${esc(EASY_UI.fixPickTitle)}">
        ${opts.map(o => eOpt(engMark('fix',o), o.id === EP.fix, `data-e="pick" data-q="fix" data-o="${esc(o.id)}"`)).join('')}
      </div>`,
    prev:'上一步', next:'下一步'
  };
}

function scrFix(){
  const f = byId(EASY_FIX, EP.fix);
  return {
    html:`<h2 class="e-h2" tabindex="-1">${esc(EASY_UI.fixTitle)}</h2>
      <p class="e-fixwhat">${ePic(f)}<b>${esc(f ? f.t : '')}</b></p>
      <ul class="e-lines">${EASY_UI.fixLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <pre class="e-prompt">${esc(epFixText())}</pre>
      <div class="e-give">
        <button type="button" class="e-btn e-big" data-e="copyfix">${I.copy}${esc(EASY_UI.fixCopy)}</button>
      </div>
      <ol class="e-steps">${EASY_UI.fixSteps.map((s, i) =>
        `<li><span class="e-sn">${i + 1}</span><div>${esc(s)}</div></li>`).join('')}</ol>`,
    prev:'上一步', next:'圖畫好了'
  };
}

function epScreen(at){
  if (qIndex(at) >= 0) return scrQ(at);
  return ({ sum:scrSum, prompt:scrPrompt, give:scrGive, check:scrCheck,
            done:scrDone, fixpick:scrFixPick, fix:scrFix }[at] || scrSum)();
}

function epRender(){
  const host = eShell('e-pic', '做一張圖');
  epClean();
  // 還有題目沒答就不能往後走（例如從摘要回去換了地方，動作要重選）
  const miss = epMissing();
  if (qIndex(EP.at) < 0 && miss) EP.at = miss;
  if (EP.at === 'fix' && !EP.fix) EP.at = 'fixpick';
  if (qIndex(EP.at) < 0 && !EP_STAGE[EP.at]) EP.at = 'sum';
  epSave();

  const s = epScreen(EP.at);
  const stage = qIndex(EP.at) >= 0 ? 0 : EP_STAGE[EP.at];
  $('.e-body', host).innerHTML = eStages(stage, s.count) + s.html + eNav(s.prev, s.next);
  eFocus(host);
  eFit();
}
function renderEPic(){ epRender(); }

/* ============================================================
   工程模式
   ============================================================ */
function engBuiltins(qid){
  if (qid.startsWith('act:')){
    const place = byId(EASY_PLACE,qid.slice(4));
    return place ? place.acts : [];
  }
  return ({sex:EASY_SEX, age:EASY_AGE, hair:EASY_HAIR, top:EASY_TOP, aid:EASY_AID,
           place:EASY_PLACE, mood:EASY_MOOD, style:EASY_STYLE, fix:EASY_FIX}[qid] || []);
}
function engCat(){ const cats = engCats(); return cats.find(x=>x.id === ENG_CAT) || cats[0]; }
function engForm(){
  const cat = engCat(), item = ENG.extras.find(x=>x.id === ENG_EDIT) || null;
  const titleHint = cat.id.startsWith('act:') ? '例如：看書' : ({
    hair:'例如：平頭', top:'例如：白襯衫', aid:'例如：紅色帽子', place:'例如：圖書館',
    mood:'例如：安心', style:'例如：拼貼畫'
  }[cat.id] || '請輸入名稱');
  if (!cat.add) return `<p class="eng-note">這一題牽涉固定的提示詞規則，目前可以更換圖片，但不開放新增選項。</p>`;
  return `<section class="eng-form" aria-labelledby="eng-form-title">
    <h2 id="eng-form-title">${item ? '編輯自訂圖卡' : '新增一張圖卡'}</h2>
    <p class="e-hint">圖卡會加到「${esc(cat.t)}」的選項裡。名稱給使用者看；描述會寫進 AI 提示詞。</p>
    <label>顯示名稱
      <input type="text" data-eng-field="title" maxlength="40" value="${esc(item ? item.t : '')}"
        placeholder="${titleHint}">
    </label>
    <label>給 AI 的描述
      <textarea data-eng-field="prompt" maxlength="240" rows="3"
        placeholder="${esc(cat.hint || '')}">${esc(item ? item.p : '')}</textarea>
    </label>
    ${item ? '' : `<label class="eng-new-file">選擇圖卡圖片
      <input type="file" data-eng-new-image accept="image/png,image/jpeg,image/webp">
    </label>
    <div class="eng-new-preview" aria-live="polite">尚未選擇圖片</div>`}
    <p class="eng-error" role="alert" hidden></p>
    <div class="eng-actions">
      <button type="button" class="e-btn" data-e="engsave">${item ? '儲存文字' : '新增圖卡'}</button>
      ${item ? '<button type="button" class="e-btn ghost" data-e="engcancel">取消編輯</button>' : ''}
    </div>
  </section>`;
}
function engCard(qid, o, custom){
  const marked = engMark(qid,o), key = engKey(qid,o), replaced = !!ENG.images[key];
  return `<article class="eng-card">
    ${ePic(marked)}
    <div class="eng-card-copy"><h3>${esc(o.t)}</h3>
      <p>${custom ? '自訂圖卡' : (replaced ? '已使用自訂圖片' : '內建圖片')}</p></div>
    <div class="eng-card-actions">
      <label class="e-btn ghost eng-upload">${replaced ? '再換一張' : '更換圖片'}
        <input type="file" data-eng-upload="${esc(key)}" accept="image/png,image/jpeg,image/webp">
      </label>
      ${replaced ? `<button type="button" class="e-link" data-e="engreset" data-key="${esc(key)}">恢復預設圖片</button>` : ''}
      ${custom ? `<button type="button" class="e-link" data-e="engedit" data-id="${esc(o.id)}">編輯文字</button>
        <button type="button" class="e-link eng-delete" data-e="engdelete" data-id="${esc(o.id)}">刪除圖卡</button>` : ''}
    </div>
  </article>`;
}
function renderEEngineer(){
  const host = eShell('e-engineer', '工程模式');
  const cat = engCat(), base = engBuiltins(cat.id), extras = engExtras(cat.id);
  $('.e-body',host).innerHTML = `<div class="eng-head">
      <div><h1 class="e-h1" tabindex="-1">管理選項圖卡</h1>
        <p class="e-hint">替換原本的圖片，或加入自己的圖卡。設定只保存在這台電腦的這個瀏覽器。</p></div>
      <span class="eng-badge">工作人員使用</span>
    </div>
    <label class="eng-cat">要管理哪一題？
      <select data-eng-cat>${engCats().map(x=>`<option value="${x.id}" ${x.id===cat.id?'selected':''}>${esc(x.t)}</option>`).join('')}</select>
    </label>
    <p class="eng-help">按「更換圖片」可替換圖卡。圖片會自動縮小，原始檔不會被修改。</p>
    <section class="eng-grid" aria-label="${esc(cat.t)}圖卡">
      ${base.map(o=>engCard(cat.id,o,false)).join('')}
      ${extras.map(o=>engCard(cat.id,o,true)).join('')}
    </section>
    ${engForm()}
    <p class="eng-local">提醒：清除瀏覽器資料會一併刪除自訂圖卡。內建圖片不受影響，隨時可以恢復。</p>`;
  if (!host.dataset.engWired){
    host.addEventListener('change', engChange);
    host.dataset.engWired = '1';
  }
  eFocus(host);
}

function engImageData(file){
  return new Promise((resolve,reject)=>{
    if (!file || !/^image\/(?:png|jpeg|webp)$/.test(file.type)) return reject(new Error('請選 PNG、JPG 或 WebP 圖片。'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('圖片太大，請選 12 MB 以下的圖片。'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      const max = 720, scale = Math.min(1, max / Math.max(img.naturalWidth,img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height = Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      let data = canvas.toDataURL('image/webp',.82);
      if (data.length > 850000) data = canvas.toDataURL('image/jpeg',.68);
      data.length < 900000 ? resolve(data) : reject(new Error('圖片仍然太大，請先縮小圖片再試一次。'));
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片，請換一張。')); };
    img.src = url;
  });
}
async function engChange(e){
  const host = e.currentTarget;
  if (e.target.matches('[data-eng-cat]')){
    ENG_CAT = e.target.value; ENG_EDIT = null; ENG_PENDING_IMAGE = ''; renderEEngineer(); return;
  }
  const existing = e.target.closest('[data-eng-upload]');
  const fresh = e.target.closest('[data-eng-new-image]');
  if (!existing && !fresh) return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try{
    const data = await engImageData(file);
    if (existing){
      const before = ENG.images[existing.dataset.engUpload];
      ENG.images[existing.dataset.engUpload] = data;
      if (!engSave()){
        if (before) ENG.images[existing.dataset.engUpload] = before; else delete ENG.images[existing.dataset.engUpload];
        return;
      }
      renderEEngineer(); toast('圖片換好了');
    }else{
      ENG_PENDING_IMAGE = data;
      const preview = $('.eng-new-preview',host);
      preview.innerHTML = `<img src="${esc(data)}" alt="新圖卡預覽"><span>圖片已選好</span>`;
    }
  }catch(err){
    const box = $('.eng-error',host); box.textContent = err.message; box.hidden = false;
  }finally{ e.target.value = ''; }
}
function engSaveForm(host){
  const cat = engCat();
  const title = $('[data-eng-field="title"]',host).value.trim();
  const prompt = $('[data-eng-field="prompt"]',host).value.trim();
  const error = $('.eng-error',host);
  let message = '';
  if (!cat.add) message = '這一題不能新增圖卡。';
  else if (!title) message = '請填寫顯示名稱。';
  else if (!prompt) message = '請填寫給 AI 的描述。';
  else if (!ENG_EDIT && !ENG_PENDING_IMAGE) message = '請選擇一張圖卡圖片。';
  if (message){ error.textContent = message; error.hidden = false; return; }
  const id = ENG_EDIT || ('custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7));
  const old = ENG.extras.find(x=>x.id === id);
  if (old){ old.t = title.slice(0,40); old.p = prompt.slice(0,240); }
  else ENG.extras.push({id,qid:cat.id,t:title.slice(0,40),p:prompt.slice(0,240)});
  if (ENG_PENDING_IMAGE) ENG.images[engKey(cat.id,{id})] = ENG_PENDING_IMAGE;
  if (!engSave()) return;
  ENG_EDIT = null; ENG_PENDING_IMAGE = ''; renderEEngineer(); toast(old ? '文字更新好了' : '圖卡新增好了');
}

/* 圖的高度：CSS 先用視窗高度估一個，畫出來之後再量一次——
   最後一排選項如果掉到「下一步」底下，就把圖縮到剛好放得下。
   有下限：螢幕真的太矮就讓它捲，圖不會縮到認不出來。
   換視窗大小、換字級都會重量一次。 */
function eFit(){
  const host = $('#view-e-pic');
  if (!host || !host.classList.contains('on')) return;
  const box = $('.e-opts', host), nav = $('.e-nav', host);
  if (!box || !nav) return;
  box.style.removeProperty('--ph');
  const opts = $$('.e-opt', box), pic = opts[0] && $('.e-pic', opts[0]);
  if (!pic) return;
  const other = $('.e-other',host);
  const extra = other ? other.offsetHeight + parseFloat(getComputedStyle(other).marginTop) : 0;
  const limit  = innerHeight - nav.offsetHeight - extra - 8; // 把「其他」和文字欄位的高度一起留出來
  const bottom = Math.max(...opts.map(o => o.getBoundingClientRect().bottom)) + scrollY;
  const over = bottom - limit;
  if (over <= 0) return;
  const rows = new Set(opts.map(o => Math.round(o.offsetTop))).size;
  // 下限 3rem：圖卡縮太小就認不出來了，寧可讓畫面可以捲
  const min  = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3;
  const cur  = pic.getBoundingClientRect().height;
  box.style.setProperty('--ph', Math.max(min, cur - over / rows) + 'px');
}
let eFitT = 0;
const eFitSoon = ()=>{ clearTimeout(eFitT); eFitT = setTimeout(eFit, 80); };
addEventListener('resize', eFitSoon);
// 字級是改在 <html> 的 style 上（--ui），盯著它
new MutationObserver(eFitSoon).observe(document.documentElement, { attributes:true, attributeFilter:['style'] });

function epNeed(host){
  const n = $('.e-need', host), box = $('.e-opts', host);
  const custom = EP.ans[EP.at] === 'other' && $('[data-custom]',host);
  if (n){
    n.textContent = custom ? '請在「其他」欄位填寫內容，再按下一步。' : EASY_UI.needPick;
    n.hidden = false;
  }
  if (custom){
    custom.setAttribute('aria-invalid','true'); custom.focus();
    custom.scrollIntoView({block:'center'}); return;
  }
  if (box){
    box.classList.remove('e-shake'); void box.offsetWidth; box.classList.add('e-shake');
    const f = $('.e-opt', box); if (f) f.focus();
  }
}

function epNext(host){
  const at = EP.at;
  if (qIndex(at) >= 0){
    if (!epAnswered(at)) return epNeed(host);
    const miss = epMissing();
    if (EP.ret){
      if (miss) return epGo(miss);
      const r = EP.ret; EP.ret = null; return epGo(r);
    }
    const qi = qIndex(at);
    return epGo(qi < EASY_QS.length - 1 ? EASY_QS[qi + 1].id : (miss || 'sum'));
  }
  if (at === 'fixpick') return EP.fix ? epGo('fix') : epNeed(host);
  if (EP_FLOW[at]) epGo(EP_FLOW[at]);
}

function eCustomInput(e){
  const input = e.target.closest('[data-custom]');
  if (!input) return;
  const q = input.dataset.custom;
  if (!EASY_CUSTOM[q] || EP.ans[q] !== 'other') return;
  const before = epCustomValue(q);
  EP.custom[q] = input.value.slice(0, EASY_CUSTOM_MAX);
  if (q === 'place' && before !== epCustomValue(q)){
    delete EP.ans.act; delete EP.custom.act;
  }
  epSave();
  const host = e.currentTarget;
  if (epAnswered(q)){
    input.removeAttribute('aria-invalid');
    $('.e-need',host).hidden = true;
  }
  const prog = $('.e-prog',host); if (prog) prog.outerHTML = epProg(qIndex(q));
}

function epPrev(){
  const at = EP.at, qi = qIndex(at);
  if (qi >= 0 && EP.ret){ const r = EP.ret; EP.ret = null; return epGo(r); }
  if (qi === 0) return go('e-home');
  if (qi > 0) return epGo(EASY_QS[qi - 1].id);
  if (at === 'sum') return epGo(EASY_QS[EASY_QS.length - 1].id);
  epGo(EP_BACK[at] || 'sum');
}

/* ============================================================
   點擊（易學版的每一頁共用一個）
   ============================================================ */
function eClick(e){
  const b = e.target.closest('[data-e]');
  if (!b) return;
  const host = e.currentTarget;
  switch (b.dataset.e){
    case 'home': return go('e-home');

    /* 首頁 */
    case 'start':
    case 'resume': return go('e-pic');
    case 'restart': EP = EP_NEW(); epSave(); return go('e-pic');
    case 'engineer':
      return eAsk(EASY_UI.toEngineerQ, EASY_UI.toEngineerNo, EASY_UI.toEngineerYes)
        .then(ok=>{ if (ok) go('e-engineer'); });
    case 'nextone':
      return eAsk(EASY_UI.nextOneQ, EASY_UI.nextOneNo, EASY_UI.nextOneYes).then(ok=>{
        if (!ok) return;
        EP = EP_NEW(); epSave();
        readClear();
        renderEHome(); toast(EASY_UI.cleared);
      });

    /* 做一張圖 */
    case 'prev': return epPrev();
    case 'next': return epNext(host);
    case 'pick': {
      const q = b.dataset.q, o = b.dataset.o;
      epPick(q, o); epSave();
      $$('[data-e="pick"]', host).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const panel = $('.e-custom',host), input = $('[data-custom]',host);
      if (panel){
        panel.hidden = o !== 'other'; input.disabled = o !== 'other'; input.required = o === 'other';
        input.removeAttribute('aria-invalid');
        eFit();
        if (o === 'other'){
          input.focus(); input.scrollIntoView({block:'center'});
        }
      }
      const n = $('.e-need', host); if (n) n.hidden = true;
      const p = $('.e-prog', host); if (p) p.outerHTML = epProg(qIndex(q));
      return;
    }
    case 'edit': EP.ret = 'sum'; return epGo(b.dataset.q);
    case 'give': {
      const txt = epText();
      eCopy(txt, true);
      // 帶 ?q= 打開，框框裡就有指令；網址太長或 AI 不支援時，剛剛複製的可以用右鍵貼上
      const url = eAiUrl(txt);
      window.open(url, '_blank', 'noopener');
      EP.gave = true; epSave();
      const ok = $('#e-give-ok', host); if (ok) ok.hidden = false;
      return toast(url === EASY_AI.url ? '提示詞已複製，請到 ChatGPT 貼上' : '提示詞已複製，並已嘗試帶到 ChatGPT');
    }
    case 'copyprompt': return eCopy(epText());
    case 'copyfix':    return eCopy(epFixText());
    case 'ok':  return epGo('done');
    case 'bad': EP.fix = null; return epGo('fixpick');
    case 'same': // 主角一樣再畫一張——原則 2 的實際體驗：主角那一段不變，換地方和動作
      ['place', 'act', 'mood'].forEach(k => delete EP.ans[k]);
      ['place', 'act'].forEach(k => delete EP.custom[k]);
      EP.fix = null; EP.gave = false; EP.ret = null;
      return epGo('place');
    case 'new': EP = EP_NEW(); return epGo('sex');

    /* 工程模式 */
    case 'engreset': {
      const key = b.dataset.key;
      if (key && ENG.images[key]){
        delete ENG.images[key];
        if (!engSave()) return renderEEngineer();
        renderEEngineer(); toast('已恢復預設圖片');
      }
      return;
    }
    case 'engedit':
      ENG_EDIT = b.dataset.id; ENG_PENDING_IMAGE = ''; renderEEngineer();
      setTimeout(()=>$('.eng-form',host)?.scrollIntoView({behavior:'smooth',block:'start'}),0); return;
    case 'engcancel': ENG_EDIT = null; ENG_PENDING_IMAGE = ''; return renderEEngineer();
    case 'engsave': return engSaveForm(host);
    case 'engdelete': {
      const item = ENG.extras.find(x=>x.id === b.dataset.id);
      if (!item) return;
      return eAsk('要刪除「' + item.t + '」圖卡嗎？\n內建圖卡不會被刪除。','不要','刪除').then(ok=>{
        if (!ok) return;
        ENG.extras = ENG.extras.filter(x=>x.id !== item.id);
        delete ENG.images[engKey(item.qid,item)];
        Object.keys(EP.ans).forEach(q=>{ if (EP.ans[q] === item.id) delete EP.ans[q]; });
        if (!engSave()) return renderEEngineer();
        epSave(); ENG_EDIT = null; ENG_PENDING_IMAGE = '';
        renderEEngineer(); toast('自訂圖卡已刪除');
      });
    }
  }
}

/* ---------- 登記到 app.js 的路由 ---------- */
Object.assign(VIEWS,     { 'e-home':renderEHome, 'e-pic':renderEPic, 'e-engineer':renderEEngineer });
Object.assign(VIEW_NAME, { 'e-home':'易學版', 'e-pic':'做一張圖', 'e-engineer':'工程模式' });
