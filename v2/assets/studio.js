/* v2 視覺稿實作：工作台、易學版及工程模式。沿用原有資料與產生器。 */
'use strict';

function studioThumb(p){
  return `<figure class="studio-thumb"><img src="assets/illustrations/workspace-${p.medium==='video'?'video':'book'}.png" alt="${p.medium==='video'?'影片':'讀物'}類型示意，非此作品成品" width="600" height="360"><figcaption>類型示意</figcaption></figure>`;
}
function studioProjectMeta(p){return `${p.medium==='video'?'影片':'讀物'} · ${p.data?.[p.medium==='video'?'vscript':'script']?.length||0} ${p.medium==='video'?'鏡':'頁'} · ${v2HumanDate(p.updated)} 儲存`;}
function studioHome(){
  v2SaveProject();
  const recent=[...V2.projects].sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
  const active=recent.find(p=>p.id===V2.activeProject)||recent[0];
  $('#view-home').innerHTML=`<div class="v2-home studio-home">
    <p class="v2-eyebrow">教材工作台</p><h1 tabindex="-1">今天，接著完成你的教材。</h1>
    <p class="v2-lead">從上次的進度開始，或建立一份新作品。</p>
    ${active?`<section class="studio-continue" aria-labelledby="studio-continue-title"><div class="v2-section-title"><h2 id="studio-continue-title">繼續上次的作品</h2><span>上次儲存：${v2HumanDate(active.updated)}</span></div><div class="studio-resume">${studioThumb(active)}<div><h2>${esc(active.name)}</h2><p>${studioProjectMeta(active)}</p></div><button class="btn" data-v2="open-project" data-id="${esc(active.id)}">繼續製作${I.right}</button></div></section>`:
    '<section class="studio-welcome"><h2>從第一份教材開始</h2><p>先選讀物或影片，設定對象，再一步步規劃內容。</p></section>'}
    <section aria-labelledby="studio-new-title"><div class="v2-section-title"><h2 id="studio-new-title">開始新作品</h2><div class="studio-shortcuts"><button class="btn ghost" data-v2="easy">${hubIco('gen')}畫一張圖片</button><button class="btn ghost" data-v="read">${READ_ICON}文件轉易讀</button></div></div><div class="v2-tasks">
      <button type="button" data-v2="new-book">${LU.book}<b>做一本讀物</b><span>設定對象與內容，再交給 AI。</span>${I.right}</button>
      <button type="button" data-v2="new-video">${LU.video}<b>做一支影片</b><span>安排分鏡、動作和聲音。</span>${I.right}</button>
      <button type="button" data-v="activities">${LU.cap}<b>準備活動</b><span>先選人物與場景，讓活動更聚焦。</span>${I.right}</button>
    </div></section>
    <section class="v2-projects"><div class="v2-section-title"><h2>我的作品</h2><span>${recent.length} 份 · 此瀏覽器自動儲存</span></div>
      ${recent.length?`<div class="v2-project-list">${recent.map(p=>`<article>${studioThumb(p)}<div class="studio-project-copy"><h3>${esc(p.name)}</h3><p>${studioProjectMeta(p)}</p></div><div class="v2-row-actions"><button class="btn sm ghost" data-v2="open-project" data-id="${esc(p.id)}">${p.medium==='video'?LU.video:LU.book}開啟</button><details class="studio-more"><summary aria-label="${esc(p.name)}的更多操作">更多</summary><div><button class="btn ghost" data-v2="export-project" data-id="${esc(p.id)}">${I.down}匯出作品</button><button class="btn ghost studio-danger" data-v2="delete-project" data-id="${esc(p.id)}">${I.trash}刪除作品</button></div></details></div></article>`).join('')}</div>`:'<p class="studio-no-project">還沒有作品。建立後會顯示在這裡，可隨時接著做。</p>'}
    </section><p class="v2-local">作品保存在此瀏覽器，換電腦前請先匯出備份。縮圖是教材類型示意，不是 AI 成品。</p></div>`;
  $('#view-home h1').focus({preventScroll:true});
}
v2RenderHome=studioHome;VIEWS.home=studioHome;VIEW_NAME.home='工作人員版';VIEW_NAME.cards='工程模式';

workspaceNav=function(){
  const link=(v,name,icon,sub='')=>`<button type="button" class="ws-link" data-v="${v}" aria-label="${name}${sub?'（'+sub+'）':''}" title="${name}">${icon}<span>${name}${sub?`<small>${sub}</small>`:''}</span></button>`;
  const cards=document.body.dataset.view==='cards';
  const cats=engCats();
  const category=c=>`<button class="ws-link" data-studio="category" data-id="${esc(c.id)}" ${c.id===engCat().id?'aria-current="page"':''}>${c.id.startsWith('act:')?ICO_PART.what:({place:ICO_PART.where,mood:ICO_PART.feel,style:ICO_PART.look}[c.id]||ICO_PART.who)}<span>${esc(c.t)}</span></button>`;
  const group=(title,ids,icon)=>`<details class="studio-category-group" ${ids.includes(engCat().id)?'open':''}><summary class="ws-link">${icon}<span>${title}</span>${I.right}</summary>${cats.filter(c=>ids.includes(c.id)).map(category).join('')}</details>`;
  const categories=group('人物',['sex','age'],ICO_PART.who)+group('頭髮與衣服',['hair','top'],ICO_PART.who)+category(cats.find(c=>c.id==='aid'))+category(cats.find(c=>c.id==='place'))+group('動作',cats.filter(c=>c.id.startsWith('act:')).map(c=>c.id),ICO_PART.what)+['mood','style','fix'].map(id=>category(cats.find(c=>c.id===id))).join('');
  return `<div class="ws-nav-top"><button class="ws-brand" data-v="home" aria-label="提示詞機器人首頁">${LU.globe}<span>提示詞機器人</span></button><button class="ws-drawer-close" data-ws-close aria-label="關閉主導覽">${I.close}</button></div>
    <nav class="ws-nav" aria-label="主導覽">${cards?`${link('home','回工作台',I.left)}<div class="studio-engineer-title"><b>工程模式</b><span>圖卡管理</span></div><div class="ws-group studio-categories"><p>題目分類</p>${categories}</div>`:
    `<div class="ws-group"><p>工作台</p>${link('home','我的作品',LU.book)}${link('activities','活動與人物卡',LU.cap)}${link('learn','學習中心',LU.book)}</div><div class="ws-group"><p>管理</p>${link('cards','工程模式',hubIco('fix'),'圖卡管理')}</div>`}</nav>
    <div class="ws-nav-bottom">${cards?'<button class="ws-link" data-studio="backups">'+I.down+'<span>備份與還原</span></button>':'<button class="ws-link" data-mode="easy">'+LU.cap+'<span>前往易學版</span></button>'}<p class="studio-local-nav">僅保存在此瀏覽器</p></div>`;
};
const studioOldSync=syncWorkspace;
syncWorkspace=function(){
  const mode=document.body.dataset.view==='cards'?'cards':'main';
  if($('#app-sidebar').dataset.studioNav!==mode){
    $('#app-sidebar').innerHTML=workspaceNav();$('#ws-drawer').innerHTML=workspaceNav();$('#app-sidebar').dataset.studioNav=mode;
  }
  studioOldSync();
};

/* 自訂內建圖卡的顯示名稱／描述不改來源資料；仍可恢復預設。 */
function studioOption(q,o){
  const edit=ENG.overrides?.[engKey(q,o)];
  if(!edit)return o;
  return {...o,...edit,...(q==='place'?{short:edit.t}:{}),...(q==='aid'?{name:edit.t}:{}),...(q==='top'&&edit.p!==o.p?{_engCustom:true}:{})};
}
const studioOldBuiltins=engBuiltins;
engBuiltins=q=>studioOldBuiltins(q).map(o=>studioOption(q,o));
const studioOldEpOpts=epOpts;
epOpts=q=>studioOldEpOpts(q).map(o=>studioOption(engFlowQid(q),o));

/* 易學版沿用選擇與流程，只變更視覺與清楚的已選狀態。 */
eOpt=function(o,on,attr){return `<button type="button" class="e-opt" ${attr} aria-pressed="${on}">${ePic(o)}<span class="e-otx"><span class="e-ot">${esc(o.t)}</span>${o.sub?`<span class="e-os">${esc(o.sub)}</span>`:''}<span class="e-tick" aria-hidden="true">${LU.ok}<span class="e-tick-t">已選擇</span></span></span></button>`;};
const studioOldShell=eShell;
eShell=function(id,title){
  const host=studioOldShell(id,title),header=$('.e-top',host);
  if(!$('.studio-easy-brand',header)){
    header.insertAdjacentHTML('afterbegin',`<span class="studio-easy-brand">${LU.globe}<b>提示詞機器人</b><span>易學版</span></span>`);
    $('.e-brand',header)?.remove();$('.e-title',header)?.remove();
    $('.e-tools',header).insertAdjacentHTML('beforeend','<button class="e-quiet" data-mode="pro">工作人員入口</button>');
  }
  return host;
};
const studioOldRenderPic=epRender;
epRender=function(){
  studioOldRenderPic();const host=$('#view-e-pic');
  host.dataset.question=EP.at;
  if(EP.at==='style'){$('.e-h2',host).textContent='你想要哪一種畫風？';$('.e-q>.e-hint',host).textContent='選一種你喜歡的，再按「選好了」。';}
};
const studioOldFit=eFit;
eFit=function(){if(EP.at!=='style')studioOldFit();};
VIEWS['e-pic']=epRender;
const studioOldEasyHome=renderEHome;
renderEHome=function(){
  studioOldEasyHome();const host=$('#view-e-home');
  if(!$('.e-foot [data-e="engineer"]',host))$('.e-fbtns',host).insertAdjacentHTML('afterbegin','<button class="e-quiet" data-e="engineer">工程模式（圖卡管理）</button>');
};
VIEWS['e-home']=renderEHome;EASY_UI.toEngineer='工程模式（圖卡管理）';EASY_UI.toEngineerYes='進入工程模式';

/* 工程模式：單一編輯器，所有文字與圖片先暫存，儲存時一起寫入。 */
let STUDIO_SELECTED='park',STUDIO_NEW=false,STUDIO_DRAFT=null,STUDIO_DIRTY=false,STUDIO_BUSY=false;
function studioCanEdit(o){return engCat().add&&typeof o?.p==='string'&&o.id!=='none';}
function studioDraft(o){return {qid:engCat().id,id:o?.id||null,t:o?.t||'',p:!o?'':typeof o.p==='string'?(o.p||'此選項不加入額外的描述。'):o.p&&typeof o.p==='object'?Object.values(o.p).join('\n'):'此題依人物設定自動組成指令。',image:ENG.images[engKey(engCat().id,o)]||'',shown:V2.visibility[engKey(engCat().id,o)]!==false};}
function studioChanged(){STUDIO_DIRTY=true;$('#studio-save-status').textContent='尚未儲存';}
async function studioLeave(){if(!STUDIO_DIRTY)return true;const yes=await eAsk('這張圖卡有尚未儲存的變更。要放棄變更嗎？','繼續編輯','放棄變更');if(yes){STUDIO_DIRTY=false;STUDIO_DRAFT=null;}return yes;}
function studioEditor(o){
  const cat=engCat(),d=STUDIO_DRAFT,editable=STUDIO_NEW||studioCanEdit(o),custom=!!ENG.extras.find(x=>x.qid===cat.id&&x.id===o?.id);
  const picture=d.image?`<span class="e-pic ok"><img src="${esc(d.image)}" alt="待儲存的圖卡圖片"></span>`:o?ePic(engMark(cat.id,o)):'<p class="studio-image-empty">請選擇要新增的圖卡圖片</p>';
  return `<form id="studio-card-form" class="studio-editor" aria-labelledby="studio-editor-title"><h2 id="studio-editor-title">${STUDIO_NEW?'新增圖卡':'編輯圖卡'}</h2><p class="studio-editor-meta">${STUDIO_NEW?esc(cat.t):esc(o.t)+' · '+(custom?'自訂圖卡':'內建圖卡')}</p>
    <div class="studio-image-preview">${picture}</div><label class="btn ghost v2-file-label studio-upload">${I.up}${STUDIO_NEW?'選擇圖片':'更換圖片'}<input type="file" ${STUDIO_NEW?'data-eng-new-image':`data-eng-upload="${esc(engKey(cat.id,o))}"`} accept="image/png,image/jpeg,image/webp" aria-label="${STUDIO_NEW?'選擇圖卡圖片':'更換 '+esc(o.t)+' 的圖片'}"></label>
    <label>顯示名稱<input data-eng-field="title" maxlength="40" required ${editable?'':'readonly'} value="${esc(d.t)}"></label>
    <label>給 AI 的描述<textarea data-eng-field="prompt" maxlength="240" rows="3" ${editable?'required':'readonly'} aria-describedby="studio-prompt-help">${esc(d.p)}</textarea></label><p class="studio-helper" id="studio-prompt-help">${editable?'這段文字會加入提示詞。':'此題涉及固定角色／修正規則，文字不開放編輯；仍可更換圖片。'}</p>
    <label class="studio-visible"><input type="checkbox" id="studio-visible" ${d.shown?'checked':''}>顯示於易學版</label>
    <p id="studio-editor-error" class="studio-error" role="alert"></p><p id="studio-save-status" role="status">${STUDIO_DIRTY?'尚未儲存':''}</p><button class="btn" type="submit" data-e="engsave" ${STUDIO_BUSY?'disabled':''}>${STUDIO_BUSY?'圖片處理中…':STUDIO_NEW?'新增圖卡':'儲存變更'}</button>
    ${!STUDIO_NEW?`<div class="studio-editor-actions"><button type="button" class="btn ghost" data-studio="reset" ${!ENG.images[engKey(cat.id,o)]&&!ENG.overrides?.[engKey(cat.id,o)]?'disabled':''}>${I.reset}恢復預設${custom?'圖片':'圖卡'}</button>${custom?'<button type="button" class="btn ghost studio-danger" data-studio="delete">'+I.trash+'刪除自訂圖卡</button>':''}</div>`:''}</form>`;
}
function studioRenderCards(){
  const host=$('#view-cards'),cat=engCat(),all=v2AllCards(cat.id);
  let selected=all.find(o=>o.id===STUDIO_SELECTED)||all[0];
  STUDIO_SELECTED=selected?.id||null;
  if(!STUDIO_DRAFT||STUDIO_DRAFT.qid!==cat.id||STUDIO_DRAFT.id!==(STUDIO_NEW?null:selected?.id))STUDIO_DRAFT=studioDraft(STUDIO_NEW?null:selected);
  const editor=STUDIO_NEW||selected?studioEditor(selected):'<div class="studio-editor"><h2>這一題還沒有圖卡</h2><p>按「新增圖卡」加入第一張。</p></div>';
  host.innerHTML=`<div class="studio-library"><div class="studio-card-main"><header class="studio-card-head"><h1 tabindex="-1">管理選項圖卡</h1><p>調整圖片與描述，讓選項更符合這次活動。</p></header>
    <div class="studio-card-toolbar"><label class="studio-cat-select">要管理哪一題？<select data-eng-cat>${engCats().map(c=>`<option value="${esc(c.id)}" ${c.id===cat.id?'selected':''}>${esc(c.t)}</option>`).join('')}</select></label><h2>${esc(cat.t)}</h2><div><label class="studio-search">搜尋圖卡<input type="search" id="v2-card-search" value="${esc(V2_CARD_QUERY)}" placeholder="搜尋圖卡"></label>${cat.add?'<button class="btn ghost" data-studio="new">'+I.plus+'新增圖卡</button>':''}</div></div>
    <p class="v2-library-error" id="v2-library-status" role="status">${esc(V2_LIBRARY_ERROR)}</p>
    <section class="eng-grid studio-card-grid" aria-label="${esc(cat.t)}圖卡">${all.map(o=>{const key=engKey(cat.id,o),shown=V2.visibility[key]!==false;return `<button type="button" class="eng-card studio-card" data-studio="select" data-id="${esc(o.id)}" aria-pressed="${!STUDIO_NEW&&o.id===STUDIO_SELECTED}" ${o.t.toLocaleLowerCase().includes(V2_CARD_QUERY.toLocaleLowerCase())?'':'hidden'}>${ePic(engMark(cat.id,o))}<span><h3>${esc(o.t)}</h3><small>${ENG.extras.some(x=>x.id===o.id)?'自訂':'內建'}${shown?'':' · 已隱藏'}</small></span><span class="studio-card-check" aria-hidden="true">${LU.ok}</span></button>`;}).join('')}</section><p id="studio-search-empty" class="studio-helper" hidden>找不到圖卡，請換個關鍵字。</p>
    ${selected&&!STUDIO_NEW?`<div class="studio-order"><span>調整「${esc(selected.t)}」順序</span><button class="btn ghost" data-v2="card-move" data-id="${esc(selected.id)}" data-direction="-1" ${all[0]===selected?'disabled':''}>${I.left}往前移</button><button class="btn ghost" data-v2="card-move" data-id="${esc(selected.id)}" data-direction="1" ${all.at(-1)===selected?'disabled':''}>往後移${I.right}</button></div>`:''}
    <details class="studio-backups" id="studio-backups"><summary>備份與使用者預覽</summary><div class="v2-library-tools"><button class="btn ghost" data-v2="export-library">${I.down}匯出圖卡與活動</button><label class="btn ghost v2-file-label">${I.up}匯入備份<input type="file" id="v2-library-file" accept=".json,application/json" aria-label="匯入圖卡與活動備份"></label><button class="btn ghost" data-v2="toggle-preview">${V2_CARD_PREVIEW?'收起預覽':'預覽使用者選項'}</button><button class="btn ghost" data-v="activities">設定活動包</button></div>${V2_CARD_PREVIEW?`<section class="v2-card-preview"><h2>使用者會看到的圖卡</h2><div class="e-opts">${all.filter(o=>V2.visibility[engKey(cat.id,o)]!==false).map(o=>eOpt(engMark(cat.id,o),false,'disabled')).join('')}</div></section>`:''}</details>
    <p class="v2-local">圖卡、活動與圖片僅保存在此瀏覽器，換電腦前請先匯出備份。</p></div>${editor}</div>`;
  if(V2_CARD_PREVIEW)$('#studio-backups').open=true;
  const categorySignature=engCats().map(c=>c.id).join('|');
  if(document.body.dataset.view==='cards'&&$('#app-sidebar').dataset.studioCats!==categorySignature){
    $('#app-sidebar').innerHTML=workspaceNav();$('#ws-drawer').innerHTML=workspaceNav();$('#app-sidebar').dataset.studioCats=categorySignature;
  }
  $$('#app-sidebar [data-studio="category"],#ws-drawer [data-studio="category"]').forEach(b=>{if(b.dataset.id===cat.id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('#v2-card-search').oninput=e=>{V2_CARD_QUERY=e.target.value;let count=0;$$('.studio-card',host).forEach(card=>{card.hidden=!$('h3',card).textContent.toLocaleLowerCase().includes(V2_CARD_QUERY.toLocaleLowerCase());if(!card.hidden)count++;});$('#studio-search-empty').hidden=!!count;};
  $('[data-eng-cat]').onchange=async e=>{const q=e.target.value;if(await studioLeave()){ENG_CAT=q;STUDIO_SELECTED=null;STUDIO_NEW=false;STUDIO_DRAFT=null;V2_CARD_QUERY='';studioRenderCards();}else e.target.value=cat.id;};
  $('#v2-library-file').onchange=async e=>{const file=e.target.files?.[0];if(file&&await studioLeave()){STUDIO_DRAFT=null;STUDIO_NEW=false;v2ImportLibrary(file);}};
  const form=$('#studio-card-form');
  if(form){
    form.onsubmit=studioSaveCard;
    $$('[data-eng-field]',form).forEach(field=>field.oninput=()=>{STUDIO_DRAFT[field.dataset.engField==='title'?'t':'p']=field.value;studioChanged();});
    $('#studio-visible').onchange=e=>{STUDIO_DRAFT.shown=e.target.checked;studioChanged();};
    $('input[type=file]',form).onchange=studioUpload;
  }
}
v2RenderCards=studioRenderCards;renderEEngineer=studioRenderCards;VIEWS.cards=studioRenderCards;
async function studioUpload(e){
  const file=e.target.files?.[0];if(!file)return;const draft=STUDIO_DRAFT;
  STUDIO_BUSY=true;const save=$('#studio-card-form button[type=submit]');save.disabled=true;save.textContent='圖片處理中…';
  try{const data=await engImageData(file);if(draft!==STUDIO_DRAFT)return;draft.image=data;ENG_PENDING_IMAGE=data;studioChanged();$('.studio-image-preview').innerHTML=`<span class="e-pic ok"><img src="${esc(data)}" alt="待儲存的圖卡圖片"></span>`;}
  catch(err){if(draft===STUDIO_DRAFT)$('#studio-editor-error').textContent=err.message;}
  finally{STUDIO_BUSY=false;if(draft===STUDIO_DRAFT){save.disabled=false;save.textContent=STUDIO_NEW?'新增圖卡':'儲存變更';e.target.value='';}}
}
function studioSaveCard(e){
  e.preventDefault();if(STUDIO_BUSY)return;
  const d=STUDIO_DRAFT,cat=engCat(),all=v2AllCards(cat.id),item=all.find(o=>o.id===d.id),editable=STUDIO_NEW||studioCanEdit(item);
  const error=$('#studio-editor-error');error.textContent='';
  if(editable&&(!d.t.trim()||!d.p.trim())){error.textContent='請填寫圖卡名稱與給 AI 的描述。';$(!d.t.trim()?'[data-eng-field=title]':'[data-eng-field=prompt]').focus();return;}
  if(STUDIO_NEW&&!d.image){error.textContent='請先選擇一張圖片。';return;}
  if(STUDIO_NEW&&ENG.extras.length>=300){error.textContent='最多保存 300 張自訂圖卡，請先匯出並整理。';return;}
  if(!d.shown&&all.filter(o=>o.id!==d.id&&V2.visibility[engKey(cat.id,o)]!==false).length===0){error.textContent='每一題至少保留一張可選圖卡。';return;}
  const next=structuredClone(ENG),workspace=structuredClone(V2),id=d.id||v2Uid('custom'),key=engKey(cat.id,{id});next.overrides=next.overrides||{};
  const extra=next.extras.find(o=>o.id===id);
  if(STUDIO_NEW)next.extras.push({id,qid:cat.id,t:d.t.trim(),p:d.p.trim()});
  else if(extra){extra.t=d.t.trim();extra.p=d.p.trim();}
  else if(editable){const base=studioOldBuiltins(cat.id).find(o=>o.id===id);if(base?.t===d.t.trim()&&base?.p===d.p.trim())delete next.overrides[key];else next.overrides[key]={t:d.t.trim(),p:d.p.trim()};}
  if(d.image)next.images[key]=d.image;else delete next.images[key];
  workspace.visibility[key]=d.shown;
  try{store.writeAll({e_engineer:next,workspace});}
  catch(err){error.textContent='儲存空間不足，原設定未變更。請先匯出備份或縮小圖片。';return;}
  ENG=next;V2=workspace;STUDIO_SELECTED=id;STUDIO_NEW=false;STUDIO_DRAFT=null;STUDIO_DIRTY=false;ENG_PENDING_IMAGE='';studioRenderCards();$('#studio-save-status').textContent='已儲存';toast('圖卡已儲存');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-studio]');if(!b||b.disabled||STUDIO_BUSY)return;
  const action=b.dataset.studio;
  if(['category','select','new'].includes(action)&&!await studioLeave())return;
  if(action==='category'){ENG_CAT=b.dataset.id;V2_CARD_QUERY='';STUDIO_SELECTED=null;STUDIO_NEW=false;STUDIO_DRAFT=null;studioRenderCards();$('#ws-drawer').open&&$('#ws-drawer').close();$('.studio-card-head h1').focus({preventScroll:true});}
  if(action==='select'){STUDIO_SELECTED=b.dataset.id;STUDIO_NEW=false;STUDIO_DRAFT=null;studioRenderCards();if(innerWidth<1100){$('#studio-editor-title').scrollIntoView({block:'start'});$('[data-eng-field=title]').focus({preventScroll:true});}}
  if(action==='new'){STUDIO_NEW=true;STUDIO_DRAFT=null;ENG_PENDING_IMAGE='';studioRenderCards();$('[data-eng-field=title]').focus();}
  if(action==='backups'){$('#studio-backups').open=true;$('#studio-backups').scrollIntoView({block:'start'});$('#ws-drawer').open&&$('#ws-drawer').close();}
  if(action==='reset'){
    if(!await eAsk('要恢復預設圖卡嗎？尚未儲存的變更也會放棄。','保留目前設定','恢復預設'))return;
    const next=structuredClone(ENG),key=engKey(engCat().id,{id:STUDIO_SELECTED});delete next.images[key];delete next.overrides?.[key];
    try{store.writeAll({e_engineer:next});}catch(err){$('#studio-editor-error').textContent='恢復失敗，原設定未變更。';return;}
    ENG=next;STUDIO_DRAFT=null;STUDIO_DIRTY=false;studioRenderCards();toast('已恢復預設圖卡');
  }
  if(action==='delete'){
    const q=engCat().id,id=STUDIO_SELECTED,key=engKey(q,{id}),item=ENG.extras.find(o=>o.qid===q&&o.id===id);if(!item)return;
    if(v2AllCards(q).filter(o=>o.id!==id&&V2.visibility[engKey(q,o)]!==false).length===0){$('#studio-editor-error').textContent='每一題至少保留一張可選圖卡。';return;}
    if(V2.heroes.some(h=>Object.values(h.ans).includes(id))||V2.packs.some(p=>p.places.includes(id)||p.style===id)){toast('這張圖卡仍被人物或活動使用，請先調整相依設定。');return;}
    if(q==='place'&&ENG.extras.some(o=>o.qid==='act:'+id)){toast('這個地方仍有自訂動作，請先到動作分類整理，避免遺失圖卡。');return;}
    if(!await eAsk('要刪除自訂圖卡「'+item.t+'」嗎？','保留圖卡','刪除圖卡'))return;
    const next=structuredClone(ENG),workspace=structuredClone(V2);next.extras=next.extras.filter(o=>o.id!==id);delete next.images[key];delete next.overrides?.[key];delete workspace.visibility[key];delete workspace.order[key];
    try{store.writeAll({e_engineer:next,workspace});}catch(err){$('#studio-editor-error').textContent='刪除失敗，原設定未變更。';return;}
    ENG=next;V2=workspace;STUDIO_SELECTED=null;STUDIO_DRAFT=null;STUDIO_DIRTY=false;studioRenderCards();toast('自訂圖卡已刪除');
  }
});
// 離開編輯器前明確確認，不把未儲存變更默默丟掉。
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-v],[data-mode],[data-go]');
  if(document.body.dataset.view==='cards'&&b){
    if(STUDIO_BUSY){e.preventDefault();e.stopImmediatePropagation();toast('正在處理圖片，請稍候再離開。');return;}
    if(STUDIO_DIRTY){e.preventDefault();e.stopImmediatePropagation();studioLeave().then(ok=>{if(ok)b.click();});}
  }
},true);
addEventListener('beforeunload',e=>{if(STUDIO_DIRTY){e.preventDefault();e.returnValue='';}});

document.addEventListener('DOMContentLoaded',()=>{
  const tools=$('.tb-tools');
  $('.mode-sw',tools).outerHTML='<span class="studio-mode-label">工作人員版</span><button class="btn ghost studio-easy-entry" data-mode="easy">'+LU.book+'前往易學版</button>';
  $('.ws-create',tools).textContent='繼續編輯';
  document.body.classList.add('studio-ready');syncWorkspace();
});
