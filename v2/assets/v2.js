/* v2：沿用原本的教材、產生器與圖卡邏輯，重整任務與教學流程。 */
'use strict';

const V2_DEFAULT_HEROES = [
  {id:'adult-short',name:'短髮的大人',ans:{sex:'m',age:'adult',hair:'short',top:'red',aid:'none'},custom:{}},
  {id:'adult-tail',name:'綁馬尾的大人',ans:{sex:'f',age:'adult',hair:'tail',top:'blue',aid:'none'},custom:{}},
  {id:'older-glasses',name:'戴眼鏡的長輩',ans:{sex:'m',age:'old',hair:'short',top:'green',aid:'glasses'},custom:{}}
];
const V2_DEFAULT_PACKS = [
  {id:'park-day',name:'公園的一天',heroId:'adult-short',places:['park'],style:'crayon',showPrompt:false},
  {id:'bus-trip',name:'練習搭公車',heroId:'adult-tail',places:['bus'],style:'cartoon',showPrompt:false},
  {id:'home-day',name:'我的居家生活',heroId:'older-glasses',places:['home'],style:'water',showPrompt:false}
];
const V2_EMPTY = ()=>({projects:[],heroes:[],packs:[],activeProject:null,activePack:null,visibility:{},order:{},genStep:0});
let V2 = Object.assign(V2_EMPTY(),store.get('workspace',{}));
for(const key of ['projects','heroes','packs']) if(!Array.isArray(V2[key])) V2[key]=[];
for(const key of ['visibility','order']) if(!isRecord(V2[key])) V2[key]={};
let v2SaveTimer;
let V2_LIBRARY_ERROR = '';
let V2_CARD_QUERY = '';
let V2_PACK_EDIT = null;
let V2_HERO_EDIT = null;
const V2_PACK_DRAFTS = new Map();
let V2_HERO_DRAFT = null;
let V2_HERO_DIRTY = false;
let V2_LIBRARY_FAILED = false;
let V2_CARD_PREVIEW = false;
const v2Uid = prefix => prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
const v2Heroes = ()=>V2_DEFAULT_HEROES.concat(V2.heroes);
const v2Packs = ()=>V2_DEFAULT_PACKS.concat(V2.packs);
const v2Pack = ()=>v2Packs().find(x=>x.id===V2.activePack)||null;
function v2Persist(){
  try{ store.writeAll({workspace:V2}); return true; }
  catch(e){ toast('儲存空間不足，請先匯出備份。'); return false; }
}
function v2ProjectSnapshot(){
  return {cfg:{...CFG},script:SCRIPT.map(x=>({...x})),vscript:VSCRIPT.map(x=>({...x}))};
}
const v2ActiveProject=()=>V2.projects.find(p=>p.id===V2.activeProject);
function v2Progress(p=v2ActiveProject()){
  try{return V2Data.checkedProgress(p?.progress);}catch(e){return V2Data.checkedProgress();}
}
function v2SetProgress(change){
  if(!v2SaveProject())return false;
  const p=v2ActiveProject();if(!p)return false;
  const previous=p.progress;p.progress={...v2Progress(p),...change};
  if(!v2Persist()){p.progress=previous;return false;}return true;
}
function v2ProjectState(p){const progress=v2Progress(p);return progress.delivered?'已確認可交付（自行確認）':progress.imagesReady?'外部素材已完成（自行確認）':progress.sent.length?'交接中・尚未確認成品':'腳本草稿・尚未確認成品';}
function v2PendingRows(){
  const video=medOf()==='video',rows=video?VSCRIPT:SCRIPT;
  const samples=['如果遇到……，我應該...','下面這些我都知道了嗎？知道的可以打勾：','我都有遵守下面的規則嗎？做到的人可以打勾：'];
  return rows.flatMap((r,i)=>!String((video?r.action:r.text)||'').trim()||!video&&samples.includes((r.text||'').trim())?[i+1]:[]);
}
function v2SaveProject(){
  clearTimeout(v2SaveTimer);
  const p=V2.projects.find(x=>x.id===V2.activeProject);
  if(!p) return true;
  const data=v2ProjectSnapshot(),name=CFG.title.trim()||'未命名作品';
  if(p.name===name&&p.medium===medOf()&&JSON.stringify(p.data)===JSON.stringify(data))return true;
  const before={...p};
  Object.assign(p,{name,medium:medOf(),updated:new Date().toISOString(),data,progress:V2Data.checkedProgress()});
  if(!v2Persist()){Object.assign(p,before);return false;}return true;
}
function v2Autosave(){ clearTimeout(v2SaveTimer); v2SaveTimer=setTimeout(v2SaveProject,350); }
const v2OldSaveCfg=saveCfg,v2OldSaveScript=saveScript,v2OldSaveVScript=saveVScript;
saveCfg=function(){v2OldSaveCfg();v2Autosave();};
saveScript=function(){v2OldSaveScript();v2Autosave();};
saveVScript=function(){v2OldSaveVScript();v2Autosave();};
addEventListener('pagehide',v2SaveProject);

function v2NewProject(medium){
  if(!v2SaveProject())return;
  const before={workspace:structuredClone(V2),cfg:CFG,script:SCRIPT,vscript:VSCRIPT};
  if(V2.projects.length>=50){toast('已達 50 份作品，請先匯出並整理舊作品。');return;}
  if(!V2.activeProject && (CFG.title.trim()||SCRIPT.length||VSCRIPT.length)){
    V2.projects.push({id:v2Uid('project'),name:CFG.title||'先前的草稿',medium:medOf(),updated:new Date().toISOString(),data:v2ProjectSnapshot()});
  }
  CFG={...DEFAULTS,medium,title:medium==='video'?'我的新影片':'我的新讀物'};
  SCRIPT=[];VSCRIPT=[];PG_OPEN.clear();
  const id=v2Uid('project');V2.activeProject=id;V2.genStep=0;
  V2.projects.unshift({id,name:CFG.title,medium,updated:new Date().toISOString(),data:v2ProjectSnapshot()});
  try{store.writeAll({cfg:CFG,script:SCRIPT,vscript:VSCRIPT,workspace:V2});}
  catch(err){V2=before.workspace;CFG=before.cfg;SCRIPT=before.script;VSCRIPT=before.vscript;toast('新作品沒有儲存成功，原本的作品已保留，請先匯出備份。');return;}
  modeSet('pro');go('gen');
}
function v2OpenProject(id){
  if(!v2SaveProject())return;
  const p=V2.projects.find(x=>x.id===id);if(!p)return;
  try{
    const d=checkedBackup(p.data);
    store.writeAll({...d,workspace:{...V2,activeProject:id}});
    CFG={...DEFAULTS,...d.cfg};SCRIPT=d.script||[];VSCRIPT=d.vscript||[];
    V2.activeProject=id;PG_OPEN.clear();go('gen');
  }catch(e){toast('這份作品無法讀取，請使用原本的備份檔。');}
}
function v2HumanDate(x){const d=new Date(x);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'});}
function v2RenderHome(){
  v2SaveProject();
  const recent=[...V2.projects].sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
  const active=recent.find(x=>x.id===V2.activeProject)||recent[0];
  $('#view-home').innerHTML=`<div class="v2-home">
    <div class="v2-eyebrow">提示詞機器人 <span>v2</span></div>
    <h1 tabindex="-1">今天，想完成什麼？</h1>
    <p class="v2-lead">準備一份教材，或帶領一次圖卡活動。</p>
    ${active?`<section class="v2-resume"><div><span class="v2-kicker">接著上次的進度</span><h2>${esc(active.name)}</h2><p>${active.medium==='video'?'影片':'讀物'}・${v2HumanDate(active.updated)} 儲存</p></div><button class="btn" data-v2="open-project" data-id="${esc(active.id)}">繼續製作${I.right}</button></section>`:''}
    <div class="v2-tasks">
      <button type="button" data-v2="new-book">${LU.book}<b>做一本讀物</b><span>設定對象、規劃每一頁，再交給 AI。</span>${I.right}</button>
      <button type="button" data-v2="new-video">${LU.video}<b>做一支影片</b><span>安排分鏡、動作和聲音。</span>${I.right}</button>
      <button type="button" data-v2="easy">${hubIco('gen')}<b>畫一張圖片</b><span>進入易學版，一次選一件事。</span>${I.right}</button>
      <button type="button" data-v="activities">${LU.cap}<b>準備帶領活動</b><span>先選人物與場景，讓活動更聚焦。</span>${I.right}</button>
    </div>
    <div class="v2-quick"><button class="btn ghost" data-v="read">${READ_ICON}文件轉易讀</button><button class="btn ghost" data-v="cards">圖卡管理</button><button class="btn ghost" data-v="learn">學習中心</button></div>
    <section class="v2-projects"><div class="v2-section-title"><h2>我的作品</h2><span>${recent.length} 份・此瀏覽器自動儲存</span></div>
      ${recent.length?`<div class="v2-project-list">${recent.map(p=>`<article><div>${p.medium==='video'?LU.video:LU.book}<div><h3>${esc(p.name)}</h3><p>${p.medium==='video'?'影片':'讀物'}・${p.data?.[p.medium==='video'?'vscript':'script']?.length||0} ${p.medium==='video'?'鏡':'頁'}・${v2HumanDate(p.updated)}</p></div></div><div class="v2-row-actions"><button class="btn sm ghost" data-v2="open-project" data-id="${esc(p.id)}">開啟</button><button class="btn sm ghost" data-v2="export-project" data-id="${esc(p.id)}">匯出</button><button class="btn sm ghost" data-v2="delete-project" data-id="${esc(p.id)}" aria-label="刪除作品 ${esc(p.name)}">刪除</button></div></article>`).join('')}</div>`:'<div class="v2-empty"><h3>從第一份作品開始</h3><p>選擇上面的讀物或影片，完成後可以隨時回來接著做。</p></div>'}
    </section><p class="v2-local">作品與圖卡保存在此瀏覽器。需要換電腦時，先匯出備份。</p>
  </div>`;
  $('h1',$('#view-home')).focus({preventScroll:true});
}
function v2RenderLearn(){
  $('#view-learn').innerHTML=`<div class="page-head"><h1 tabindex="-1">學習中心</h1><p>需要的時候再學，也可以直接開始製作。</p></div><div class="v2-learning">${[
    ['prin','四大原則','5 課，掌握說清楚、保持一致的方法。'],['care','友善就醫','7 課，從生活情境做出完整讀物。'],['vid','影片指令','7 課，練習鏡頭、動作與聲音。'],['ref','範例與檢查表','看完整成品，交付前逐項確認。'],['fix','遇到問題','找到適合的修正指令。'],['res','學習資源','外部教學與參考文件。']
  ].map(([id,title,desc])=>`<button data-v="${id}">${hubIco(id)}<b>${title}</b><span>${desc}</span>${I.right}</button>`).join('')}</div>`;
}

/* 工作人員產生器：保留原本事件與欄位，只重新安排四個工作階段。 */
const v2OriginalRenderGen=renderGen;
renderGen=function(){
  v2SaveProject();
  v2OriginalRenderGen();
  const host=$('#view-gen');
  const step=Math.max(0,Math.min(3,Number(V2.genStep)||0));V2.genStep=step;
  $('.page-head h2',host).textContent=CFG.title||'製作新作品';
  $('.page-head p',host).textContent=(medOf()==='video'?'影片':'讀物')+'工作流程・內容會自動儲存';
  $('.ph-kick',host)?.remove();
  const sections=$$('.gx-sec',host),order=[0,2,1,3];
  const names=['設定對象','規劃內容','交給 AI','排版與交付檢查'];
  const nav=document.createElement('nav');nav.className='v2-stepper';nav.setAttribute('aria-label','作品製作步驟');
  nav.innerHTML=names.map((name,i)=>`<button type="button" data-v2="gen-step" data-step="${i}" ${i===step?'aria-current="step"':''}><span>${i+1}</span>${name}</button>`).join('');
  $('.page-head',host).after(nav);
  order.forEach((n,i)=>{sections[n].hidden=i!==step;sections[n].dataset.v2Stage=i;$('.step-n',sections[n]).textContent=String(i+1);});
  if(step===0){
    const settings=$('#gx-1'),templates=$('.tpl',settings);
    if(templates){const detail=document.createElement('details');detail.className='v2-reference';detail.innerHTML='<summary>使用範例或我的範本</summary>';settings.append(detail);detail.append(templates);}
    const hint=document.createElement('p');hint.className='v2-stage-hint';hint.textContent='本站準備設定、腳本與指令 → 在外部 AI 產生圖片／影片 → 用 Word 或影片工具排版交付。先確認讀者、作品名稱與主角。';sections[0].prepend(hint);
  }
  const summary=document.createElement('p');summary.id='v2-gen-status';summary.className='v2-stage-status';summary.setAttribute('role','status');summary.textContent=v2GenStatus();nav.after(summary);
  if(step===2)v2MountHandoff(sections[1]);
  if(step===3){
    const panel=document.createElement('section');panel.className='v2-completion';const progress=v2Progress();
    panel.innerHTML=`<h3>成品在哪裡？下一步做什麼？</h3><p>本站不會自動產生或收回圖片、影片與 PDF。請在外部 AI 完成素材，再依下方說明排版。</p><label><input type="checkbox" data-v2="confirm-images" ${progress.imagesReady?'checked':''}>我已在外部工具完成並檢查素材（自行確認）</label><label><input type="checkbox" data-v2="confirm-delivery" ${progress.delivered?'checked':''}>我已完成排版與交付檢查（自行確認）</label><p role="status" id="v2-completion-status">修改設定或腳本後，交接紀錄與完成確認會重設，請重新核對。</p>`;sections[3].prepend(panel);
  }
  const footer=document.createElement('nav');footer.className='v2-flow-nav';footer.setAttribute('aria-label','製作步驟導覽');
  footer.innerHTML=`<button class="btn ghost" data-v2="gen-prev">${I.left}${step===0?'回工作台':'上一步'}</button>${step<3?`<button class="btn" data-v2="gen-next">${names[step+1]}${I.right}</button>`:'<button class="btn" data-v="ref">打開交付檢查表'+I.right+'</button>'}`;
  host.append(footer);
  if(!V2.activeProject){
    V2.activeProject=v2Uid('project');V2.projects.unshift({id:V2.activeProject,name:CFG.title||'未命名作品',medium:medOf(),updated:new Date().toISOString(),data:v2ProjectSnapshot()});
  }
  v2Persist();
};
function v2GenStatus(){
  if(V2.genStep===0)return CFG.title.trim()?'已填作品名稱，接著確認讀者與主角。':'請先填作品名稱。';
  const rows=medOf()==='video'?VSCRIPT:SCRIPT;
  if(V2.genStep===1){const pending=v2PendingRows();return rows.length?`已有 ${rows.length} ${medOf()==='video'?'鏡腳本':'頁腳本'}。${pending.length?'請檢查第 '+pending.join('、')+' 頁／鏡的空白或骨架示例內容。':'交接前請逐項檢查腳本。'}`:'還沒有內容，先新增一頁／一鏡，或套用骨架。';}
  if(V2.genStep===2)return '先確認內容，再選要交給 AI 的一段。開啟 AI 後仍須自己送出。';
  return '外部素材完成後，依下方說明排版；確認成果後再自行標記可交付。';
}
function v2GenMove(step,validate){
  if(validate&&V2.genStep===0&&(!CFG.title.trim()||!CFG.hero.trim())){
    const target=$(medOf()==='video'?(!CFG.title.trim()?'#v-title':'#v-heroEn'):(!CFG.title.trim()?'#c-title':'#c-hero'));target?.focus();
    $('#v2-gen-status').textContent='請先填作品名稱與主角設定，再繼續。';return;
  }
  if(validate&&V2.genStep===1&&!(medOf()==='video'?VSCRIPT:SCRIPT).length){
    $('#v2-gen-status').textContent='請先新增內容，或按「套用骨架」。';$(medOf()==='video'?'#v-add':'#s-add')?.focus();return;
  }
  V2.genStep=step;v2SaveProject();renderGen();window.scrollTo(0,0);$('.v2-stepper [aria-current]')?.focus();
}
function v2MountHandoff(section){
  const intro=section.querySelector('#gx-2');
  const details=document.createElement('details');details.className='v2-reference';
  const summary=document.createElement('summary');summary.textContent='第一次開始：查看開場與角色設定指令';details.append(summary);
  section.append(details);details.append(intro);
  const box=document.createElement('section');box.className='v2-ai-panel';
  const rows=medOf()==='video'?VSCRIPT:SCRIPT,progress=v2Progress(),pending=v2PendingRows();
  box.innerHTML=`<h3>把這一段交給 AI</h3><p>第一次開新對話，之後在<strong>同一個 ChatGPT 對話</strong>依序貼上。複製不等於送出；請到 ChatGPT 確認並按送出。</p>
    ${pending.length?`<div class="v2-content-review"><p>第 ${pending.join('、')} 頁／鏡仍有空白或骨架示例。請先修改，或確認你要保留這些內容。</p><button class="btn ghost" data-v2="plan-confirm" aria-pressed="${progress.planReviewed}">${progress.planReviewed?'已自行確認待完成內容':'我已檢查，保留這些內容繼續'}</button><button class="btn ghost" data-v2="gen-step" data-step="1">回去修改</button></div>`:''}
    <label for="v2-prompt-select">要交接的內容</label><select id="v2-prompt-select"><option value="intro">開場：第 1 段</option><option value="character">角色設定：第 2 段</option>${rows.map((r,i)=>`<option value="${i}">第 ${i+1} ${medOf()==='video'?'鏡':'頁'}・${esc((r.text||r.line||r.scene||'未填內容').slice(0,22))}</option>`).join('')}</select>
    <div class="v2-row-actions"><button class="btn" data-v2="gen-ai">複製並開啟 ChatGPT${I.right}</button><button class="btn ghost" data-v2="gen-copy">只複製</button></div><p id="v2-ai-status" role="status"></p>
    <div class="v2-row-actions"><button class="btn ghost" data-v2="mark-sent">我已在同一對話送出這段</button><button class="btn ghost" data-v2="next-prompt">前往下一段</button></div><p id="v2-sent-status" role="status"></p>
    <details class="v2-sent-list"><summary>查看交接紀錄（自行確認）</summary><ol id="v2-sent-list"></ol></details><details><summary>查看將交出的完整提示詞</summary><textarea id="v2-ai-text" readonly aria-label="完整提示詞"></textarea></details><p>修改設定或腳本會重設送出紀錄，避免沿用舊內容的確認。</p>`;
  $('.v2-stage-hint',section)?.remove();section.prepend(box);
  const select=$('#v2-prompt-select');if([...select.options].some(o=>o.value===progress.selected))select.value=progress.selected;
  select.onchange=()=>{v2SetProgress({selected:select.value});v2RefreshHandoff();$('#v2-ai-status').textContent='';};
  v2RefreshHandoff();
}
function v2RefreshHandoff(){
  const select=$('#v2-prompt-select');if(!select)return;
  const progress=v2Progress(),sent=progress.sent.includes(select.value);
  $('[data-v2=gen-ai]').textContent=select.value==='intro'&&!progress.sent.length?'複製並開啟新的 ChatGPT 對話':'複製這段，回原對話貼上';
  $('#v2-ai-text').value=v2SelectedPrompt();
  $('[data-v2=mark-sent]').textContent=sent?'取消這段的送出確認':'我已在同一對話送出這段';$('[data-v2=mark-sent]').setAttribute('aria-pressed',String(sent));
  $('#v2-sent-status').textContent=`已自行確認 ${progress.sent.filter(key=>[...select.options].some(o=>o.value===key)).length} / ${select.options.length} 段送出；目前這段${sent?'已確認送出':'尚未確認送出'}。`;
  $('#v2-sent-list').innerHTML=[...select.options].map(o=>`<li>${progress.sent.includes(o.value)?'已確認送出':'尚未確認'}：${esc(o.textContent)}</li>`).join('');
}
function v2SelectedPrompt(){
  const value=$('#v2-prompt-select')?.value||'intro';
  if(value==='intro'||value==='character'){
    const boxes=$$('.prompt pre',$('#gx-2'));return boxes[value==='intro'?0:1]?.textContent||'';
  }
  return medOf()==='video'?buildShotPrompt(Number(value)):buildPagePrompt(Number(value));
}

/* 在工作人員版管理圖卡與活動。 */
const v2OriginalWorkspaceNav=workspaceNav;
workspaceNav=function(){
  const wrap=document.createElement('div');wrap.innerHTML=v2OriginalWorkspaceNav();
  const nav=$('.ws-nav',wrap),group=document.createElement('div');group.className='ws-group';
  group.innerHTML=`<p>帶領與準備</p><button class="ws-link" data-v="activities">${LU.cap}<span>活動與人物卡</span></button><button class="ws-link" data-v="cards">${hubIco('ref')}<span>圖卡管理</span></button><button class="ws-link" data-v="learn">${LU.book}<span>學習中心</span></button>`;
  nav.prepend(group);return wrap.innerHTML;
};
VIEWS.home=v2RenderHome;VIEWS.gen=renderGen;VIEWS.learn=v2RenderLearn;
Object.assign(VIEW_NAME,{home:'工作台',learn:'學習中心',activities:'活動與人物卡',cards:'圖卡管理'});

/* 易學版：人物卡捷徑、清楚的摘要、可恢復的 AI 交接。 */
const v2OldEpNew=EP_NEW;
// EP_NEW 為原版常數；所有 v2 的重啟操作使用這個工廠。
function v2NewPicture(){return {...v2OldEpNew(),at:'character',guided:false};}
if(!Object.keys(EP.ans).length) EP=v2NewPicture();
const v2OriginalEpOpts=epOpts;
epOpts=function(qid){
  const pack=v2Pack(),key=engFlowQid(qid);
  return v2OriginalEpOpts(qid).filter(o=>{
    if(V2.visibility[engKey(key,o)]===false && EP.ans[qid]!==o.id)return false;
    if(pack&&qid==='place')return pack.places.includes(o.id);
    return true;
  }).sort((a,b)=>(V2.order[engKey(key,a)]||0)-(V2.order[engKey(key,b)]||0));
};
const v2OriginalEPick=epPick;
epPick=function(q,o){if(EP.ans[q]!==o)EP.gave=false;v2OriginalEPick(q,o);};
const v2OriginalPic=ePic;
ePic=function(o){
  if(o&&['crayon','cartoon','line','water'].includes(o.id)&&String(o.pic||'').startsWith('style-')&& !ENG.images[o._engKey]){
    return `<span class="e-pic ok v2-style-example" data-style="${o.id}" aria-hidden="true"><img alt="" src="assets/illustrations/style-comparison.png"></span>`;
  }
  return v2OriginalPic(o);
};
function v2HeroAvailable(hero){
  return ['sex','age','hair','top','aid'].every(q=>{
    const o=v2OriginalEpOpts(q).find(x=>x.id===hero.ans[q]);
    return o && (o.id!=='other'||!!hero.custom[q]?.trim());
  });
}
function v2HeroSummary(hero){return ['age','hair','top','aid'].map(q=>hero.ans[q]==='other'?hero.custom[q]:q==='aid'&&hero.ans[q]==='none'?'無輔具':(v2OriginalEpOpts(q).find(o=>o.id===hero.ans[q])?.t||'')+(q==='top'?'衣服':'')).filter(Boolean).join('・');}
function v2HeroPreset(hero){return V2_DEFAULT_HEROES.find(h=>['sex','age','hair','top','aid'].every(q=>h.ans[q]===hero.ans[q]&&!ENG.overrides?.[q+':'+hero.ans[q]]));}
function v2HeroPicture(hero){
  const match=v2HeroPreset(hero);
  if(match)return `<span class="e-pic ok v2-person-picture" aria-hidden="true"><img src="assets/illustrations/hero-${match.id}.png" alt=""></span>`;
  return '<span class="e-pic v2-person-summary" aria-hidden="true">文字<br>設定</span>';
}
function v2CharacterScreen(){
  return {html:`<h2 class="e-h2" tabindex="-1">今天想畫哪個人物？</h2><p class="e-hint">選一張人物卡，或自己設定。</p>
    <div class="v2-hero-options">${v2Heroes().filter(v2HeroAvailable).map(h=>`<button type="button" class="v2-hero-card" data-v2="choose-hero" data-id="${esc(h.id)}">${v2HeroPicture(h)}<b>${esc(h.name)}</b><span>${esc(v2HeroSummary(h))}</span><small>${v2HeroPreset(h)?'人物示意，請以設定為準':'此人物依文字設定，沒有示意圖'}</small>${I.right}</button>`).join('')}</div>
    <button class="e-btn ghost" data-v2="custom-hero">自己設定人物</button>`,prev:'回首頁',next:null};
}
function v2Flow(){return EASY_QS.filter(q=>!(EP.guided&&['sex','age','hair','top','aid'].includes(q.id))&&!(v2Pack()&&q.id==='style'));}
epProg=function(qi){return `<div class="e-prog" aria-hidden="true">${v2Flow().map(q=>`<i data-part="${q.part}" class="${epAnswered(q.id)?'on':''}${EASY_QS[qi]?.id===q.id?' cur':''}"></i>`).join('')}</div>`;};
const v2OriginalQ=scrQ;
scrQ=function(qid){
  const screen=v2OriginalQ(qid);
  if(v2Pack()&&qid==='place'){
    const box=document.createElement('div');box.innerHTML=screen.html;$('.e-other',box)?.remove();
    const hint=$('.e-q>.e-hint',box);if(hint)hint.textContent='今天先從活動準備好的地方選一個。';screen.html=box.innerHTML;
  }
  return screen;
};
const v2OriginalSum=scrSum;
scrSum=function(){
  const original=v2OriginalSum();
  original.html=`<h2 class="e-h2" tabindex="-1">這就是你想畫的內容嗎？</h2><p class="v2-sentence">${esc(v2Sentence())}</p><p class="e-hint">想改哪一個，就按「改」。</p>`+original.html.replace(/^[\s\S]*?<ul class="e-sum">/,'<ul class="e-sum">');
  original.next=v2Pack()?.showPrompt?'看指令':'請 AI 畫圖片';return original;
};
function v2Sentence(){return `${epLabel('age')}，穿${epLabel('top')}${EP.ans.top==='other'?'':'衣服'}，在${epLabel('place')}${epLabel('act')}，心情${epLabel('mood')}。`;}
const v2OriginalPrompt=scrPrompt;
scrPrompt=function(){return {html:`<h2 class="e-h2" tabindex="-1">內容已經準備好了</h2><p class="v2-sentence">${esc(v2Sentence())}</p><details class="v2-reference"><summary>看完整指令</summary><pre class="e-prompt">${segHtml(epSegs(EP.ans))}</pre></details>`,prev:'回去確認',next:'請 AI 畫圖片'};};
scrGive=function(){
  return {html:`<h2 class="e-h2" tabindex="-1">${EP.gave?'回來確認圖片':'準備請 AI 畫圖'}</h2>
    <p class="e-hint">${EP.gave?'圖片會在 ChatGPT 出現。看到後，再回到這裡。':'接下來會到另一個網站 ChatGPT。它會幫你畫圖，這裡不會直接出現圖片。'}</p>
    <p class="v2-sentence">${esc(v2Sentence())}</p>
    <div class="v2-handoff-card"><button class="e-btn e-big" data-e="give">${I.copy}${EP.gave?'再開啟 ChatGPT':'把提示詞帶到 ChatGPT'}</button>
      <p class="v2-handoff-status" id="v2-easy-status" role="status">${EP.gave?'已準備交接。圖片還需要在 ChatGPT 產生。':'到了 ChatGPT，確認輸入框有字，再按送出。'}</p></div>
    ${EP.gave?'<button class="e-btn e-big" data-v2="image-ready">我看到圖片了'+I.right+'</button>':''}
    <div class="v2-help-actions"><button class="e-btn ghost" data-v2="handoff-help" data-kind="open">沒有打開</button><button class="e-btn ghost" data-v2="handoff-help" data-kind="paste">不知道怎麼貼上</button><button class="e-btn ghost" data-v2="handoff-help" data-kind="support">請工作人員陪我</button><button class="e-btn ghost" data-e="copyprompt">只複製指令</button></div>
    <section id="v2-easy-help" class="v2-help" role="region" aria-labelledby="v2-help-title" hidden></section>
    <details class="v2-reference"><summary>看完整指令／手動複製</summary><textarea class="v2-manual-prompt" readonly aria-label="繪圖指令">${esc(epText())}</textarea></details>
    <p class="e-hint v2-return-hint">等圖片畫好，回到瀏覽器的「易學版」分頁。</p>`,prev:'回去確認',next:null};
};
let V2_HELP_STEP=0,V2_HELP_KIND='paste';
function v2ShowEasyHelp(kind,step=0){
  const box=$('#v2-easy-help');if(!box)return;box.hidden=false;V2_HELP_STEP=step;V2_HELP_KIND=kind;
  if(kind==='paste'){
    const steps=[['先複製要貼上的指令','按下面的「只複製指令」，再按「下一個動作」。'],['到 ChatGPT 貼上','在 ChatGPT 的輸入框長按，或按滑鼠右鍵，選「貼上」。'],['送出後，再回到這裡','確認輸入框有字，再按送出。等圖片出現，回到這個易學版分頁。']];
    box.innerHTML=`<h3 id="v2-help-title" tabindex="-1">${step+1} / 3　${steps[step][0]}</h3><p>${steps[step][1]}</p>${step===0?'<button class="e-btn ghost" data-e="copyprompt">只複製指令</button>':''}<div class="v2-row-actions">${step?'<button class="e-btn ghost" data-v2="help-prev">上一個動作</button>':''}${step<2?'<button class="e-btn" data-v2="help-next">下一個動作</button>':'<button class="e-btn ghost" data-v2="help-close">我知道了</button>'}</div>`;
  }else if(kind==='support')box.innerHTML='<h3 id="v2-help-title" tabindex="-1">可以請工作人員陪你</h3><p>告訴工作人員：「我選好了，請陪我到 ChatGPT 畫圖，再一起回來看。」</p><p>你的選擇會保留在這裡，不用重新選。請不要告訴別人你的密碼。</p><button class="e-btn ghost" data-v2="help-close">留在這裡等工作人員</button>';
  else box.innerHTML='<h3 id="v2-help-title" tabindex="-1">先打開 ChatGPT</h3><p>按下面的按鈕，到另一個網站。打開後，回這裡看「不知道怎麼貼上」。</p><a class="e-btn ghost" href="https://chatgpt.com/" target="_blank" rel="noopener">另行開啟 ChatGPT</a>';
  $('#v2-help-title').focus({preventScroll:true});box.scrollIntoView({block:'center'});
}
epRender=function(){
  const host=eShell('e-pic','做一張圖');
  epClean();
  const pack=v2Pack();if(pack&&byId(v2OriginalEpOpts('style'),pack.style))EP.ans.style=pack.style;
  const miss=epMissing();
  if(EP.at!=='character'&&qIndex(EP.at)<0&&miss)EP.at=miss;
  if(EP.at==='check'&&!EP.gave)EP.at='give';
  if(EP.at==='fix'&&!EP.fix)EP.at='fixpick';
  const valid=['character','sum','prompt','give','check','done','fixpick','fix'];
  if(qIndex(EP.at)<0&&!valid.includes(EP.at))EP.at='sum';
  const s=EP.at==='character'?v2CharacterScreen():epScreen(EP.at);
  const optionCount=(qIndex(EP.at)>=0?epOpts(EP.at):[]).filter(o=>!o.custom).length;
  if(optionCount>2)s.html+=`<p class="v2-more-options">共有 ${optionCount} 個選項，可以往下看。</p>`;
  const flow=v2Flow(),idx=flow.findIndex(q=>q.id===EP.at);
  const stage=EP.at==='character'||qIndex(EP.at)>=0?0:EP_STAGE[EP.at];
  const count=idx>=0?`第 ${idx+1} 題，共 ${flow.length} 題`:undefined;
  $('.e-body',host).innerHTML=(pack?`<p class="v2-activity-label">今天的活動：${esc(pack.name)}</p>`:'')+eStages(stage,count)+s.html+eNav(s.prev,s.next);
  const prog=$('.e-prog',host);if(prog)prog.setAttribute('aria-label','目前的選擇進度');
  epSave();eFocus(host);eFit();
};
epNext=function(host){
  const at=EP.at;
  if(qIndex(at)>=0){
    if(!epAnswered(at))return epNeed(host);
    if(EP.ret){const miss=epMissing();if(miss)return epGo(miss);const ret=EP.ret;EP.ret=null;return epGo(ret);}
    const flow=v2Flow(),i=flow.findIndex(q=>q.id===at);return epGo(flow[i+1]?.id||epMissing()||'sum');
  }
  if(at==='sum')return epGo(v2Pack()?.showPrompt?'prompt':'give');
  if(at==='prompt')return epGo('give');
  if(at==='fixpick')return EP.fix?epGo('fix'):epNeed(host);
  if(at==='fix')return epGo('check');
};
epPrev=function(){
  if(EP.at==='character')return go('e-home');
  if(EP.ret){const ret=EP.ret;EP.ret=null;return epGo(ret);}
  const flow=v2Flow(),i=flow.findIndex(q=>q.id===EP.at);
  if(i===0)return epGo('character');
  if(i>0)return epGo(flow[i-1].id);
  if(EP.at==='sum')return epGo(flow[flow.length-1].id);
  if(EP.at==='give')return epGo('sum');
  epGo(EP_BACK[EP.at]||'sum');
};
const v2OriginalEasyHome=renderEHome;
renderEHome=function(){
  v2OriginalEasyHome();
  const host=$('#view-e-home'),pack=v2Pack();
  $('.e-foot [data-e="engineer"]',host)?.remove();
  if(pack)$('.e-h1',host).insertAdjacentHTML('afterend',`<p class="v2-activity-label">今天的活動：${esc(pack.name)}</p>`);
};
EASY_UI.tabTitle='易學版 v2｜提示詞機器人';
EASY_UI.stages[1]='確認內容';
EASY_UI.toEngineer='圖卡管理';EASY_UI.toEngineerYes='前往圖卡管理';
const v2OriginalEClick=eClick;
eClick=function(e){
  const b=e.target.closest('[data-e]');if(!b)return;
  if(['start','restart','new'].includes(b.dataset.e)){
    if(b.dataset.e==='start'&&epHasProgress())return go('e-pic');
    if(b.dataset.e!=='start'&&epHasProgress()){
      return eAsk('要重新選一張圖片嗎？\n剛剛的選擇會重新開始。','先不要','重新選').then(ok=>{if(ok){EP=v2NewPicture();epSave();go('e-pic');}});
    }
    EP=v2NewPicture();epSave();return go('e-pic');
  }
  if(b.dataset.e==='nextone'){
    return eAsk(EASY_UI.nextOneQ,EASY_UI.nextOneNo,EASY_UI.nextOneYes).then(ok=>{if(ok){EP=v2NewPicture();epSave();readClear();renderEHome();toast(EASY_UI.cleared);}});
  }
  if(b.dataset.e==='give'){
    const text=epText();let copied=eCopy(text,true);const url=eAiUrl(text);
    window.open(url,'_blank','noopener');EP.gave=true;epGo('give');
    const status=$('#v2-easy-status');
    status.textContent=copied?'指令已複製。到 ChatGPT 確認有字，按送出，再等圖片。':'如果沒有自動帶入，請展開下方完整指令，手動選取複製。';
    return;
  }
  if(b.dataset.e==='same'){
    EP.guided=true;return v2OriginalEClick(e);
  }
  return v2OriginalEClick(e);
};
VIEWS['e-pic']=epRender;VIEWS['e-home']=renderEHome;

function v2BackupPanel(){return `<details class="v2-backup-panel" ${V2_LIBRARY_ERROR?'open':''}><summary>備份與還原</summary><p>只保存在這個瀏覽器；以下兩種備份範圍不同，都不含外部 AI 圖片、影片或 PDF 成品。</p><div class="v2-backup-grid"><section><h3>作品設定與腳本 (.json)</h3><p>在作品的「更多」下載個別作品備份。還原會新增一份作品，不覆蓋現有作品；不匯入個人範本。</p><label class="btn ghost v2-file-label">還原作品備份<input type="file" data-v2-restore-project accept=".json,application/json" aria-label="還原作品備份"></label></section><section><h3>人物、活動與圖卡 (.json)</h3><p>含自訂圖片與設定，不含作品清單。還原前會確認是否取代目前的圖卡與活動。</p><button class="btn ghost" data-v2="export-library">下載圖卡與活動備份</button><label class="btn ghost v2-file-label">還原圖卡與活動<input type="file" data-v2-restore-library accept=".json,application/json" aria-label="還原圖卡與活動"></label></section></div><p class="${V2_LIBRARY_FAILED?'v2-library-error':'v2-library-success'}" role="status">${esc(V2_LIBRARY_ERROR)}</p><p data-v2-project-import-status role="status"></p></details>`;}
function v2WireBackups(host){
  $('[data-v2-restore-project]',host)?.addEventListener('change',e=>v2ImportProject(e.target.files?.[0]));
  $('[data-v2-restore-library]',host)?.addEventListener('change',e=>v2ImportLibrary(e.target.files?.[0]));
}
async function v2ImportProject(file){
  if(!file)return;
  const status=$('.view.on [data-v2-project-import-status]');
  try{
    if(file.size>5*1024*1024)throw new Error('檔案超過 5 MB，請選作品設定與腳本備份。');
    const raw=JSON.parse(await file.text()),d=checkedBackup(raw);
    if(!d.cfg||!Array.isArray(d.script)||!Array.isArray(d.vscript)||d.script.length>500||d.vscript.length>500)throw new Error('請選含設定與腳本的完整作品備份，每種腳本最多 500 頁／鏡。');
    const progress=V2Data.checkedProgress(raw.progress);
    if(V2.projects.length>=50)throw new Error('已達 50 份作品，請先備份並整理作品。');
    if(!v2SaveProject())return;
    const data={cfg:{...DEFAULTS,...d.cfg},script:d.script,vscript:d.vscript};
    const id=v2Uid('project'),project={id,name:data.cfg.title.trim()||'還原的作品',medium:data.cfg.medium,updated:new Date().toISOString(),data,progress};
    const workspace={...V2,projects:[project,...V2.projects],activeProject:id,genStep:0};
    store.writeAll({...data,workspace});V2=workspace;CFG=data.cfg;SCRIPT=data.script;VSCRIPT=data.vscript;PG_OPEN.clear();VS_OPEN.clear();
    modeSet('pro');go('home');toast('備份已還原為新作品，原有作品未受影響。');
  }catch(e){if(status){status.textContent='無法還原：'+(e.message||'檔案格式錯誤');status.className='v2-library-error';}else toast('無法還原作品：'+e.message);}
}
function v2LibraryFeedback(){
  const view=document.body.dataset.view;
  if(view==='home')v2RenderHome();else if(view==='activities')v2RenderActivities();else v2RenderCards();
}
function v2OptionList(q,selected){return v2OriginalEpOpts(q).filter(x=>!x.custom).map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.t)}</option>`).join('');}
function v2PeopleHtml(){return v2Heroes().map(h=>`<div>${v2HeroPicture(h)}<span><b>${esc(h.name)}</b><small>${esc(v2HeroSummary(h))}</small></span><button type="button" class="btn sm ghost" data-v2="edit-hero" data-id="${esc(h.id)}" aria-label="${V2.heroes.includes(h)?'編輯':'檢視並另存'}人物卡 ${esc(h.name)}">${V2.heroes.includes(h)?'編輯':'檢視／另存'}</button>${V2.heroes.includes(h)?`<button type="button" class="btn sm ghost" data-v2="delete-hero" data-id="${esc(h.id)}" aria-label="刪除人物卡 ${esc(h.name)}">刪除</button>`:''}</div>`).join('');}
function v2RefreshPeople(){
  const select=$('#v2-pack-form [name=hero]'),current=select?.value;
  if(select)select.innerHTML=v2Heroes().filter(v2HeroAvailable).map(h=>`<option value="${esc(h.id)}" ${h.id===current?'selected':''}>${esc(h.name)}</option>`).join('');
  const list=$('.v2-people-list');if(list)list.innerHTML=v2PeopleHtml();
}
function v2FillHeroForm(hero,copy=false){
  const form=$('#v2-hero-form');if(!form)return;
  V2_HERO_EDIT=V2.heroes.includes(hero)?hero.id:null;
  const h=hero||{name:'',ans:{sex:'m',age:'adult',hair:'short',top:'red',aid:'none'},custom:{}};
  $('[name=name]',form).value=copy?(h.name+'（副本）').slice(0,40):h.name;
  ['sex','age','hair','top','aid'].forEach(q=>{
    const select=$('[name='+q+']',form);select.innerHTML=v2OptionList(q,h.ans[q]);
    if(h.ans[q]==='other')select.insertAdjacentHTML('beforeend',`<option value="other" selected>自訂：${esc(h.custom[q]||'請重新選擇')}</option>`);
  });
  $('h3',form).textContent=V2_HERO_EDIT?'編輯人物卡':hero?'另存人物卡':'新增常用人物';
  $('[type=submit]',form).textContent=V2_HERO_EDIT?'儲存人物變更':'新增人物卡';
  $('[data-v2=cancel-hero]',form).hidden=!hero;$('#v2-hero-error').textContent='';
  V2_HERO_DRAFT=hero?{...structuredClone(h),name:$('[name=name]',form).value}:null;
  V2_HERO_DIRTY=false;
}
function v2RenderActivities(){
  const editing=v2Packs().find(x=>x.id===V2_PACK_EDIT),host=$('#view-activities');
  const draftKey=V2_PACK_EDIT||'new';
  const p=V2_PACK_DRAFTS.get(draftKey)||editing||{name:'',heroId:'adult-short',places:['park'],style:'crayon',showPrompt:false};
  const places=v2OriginalEpOpts('place').filter(x=>!x.custom);
  host.innerHTML=`<div class="page-head"><p class="v2-eyebrow">帶領前的準備</p><h1 tabindex="-1">活動與人物卡</h1><p>人物卡是預設角色；活動包決定這次可選的地方與畫風。使用情境名稱，不填真實個資。</p></div>${v2BackupPanel()}
    <section><div class="v2-section-title"><h2>選一份活動開始</h2><button class="btn ghost" data-v2="free-activity">自由選擇模式</button></div><div class="v2-pack-grid">${v2Packs().map(pack=>`<article><span class="v2-kicker">${pack.places.length} 個場景・${esc(byId(v2OriginalEpOpts('style'),pack.style)?.t||'自訂畫風')}</span><h3>${esc(pack.name)}</h3><p>${esc(v2Heroes().find(h=>h.id===pack.heroId)?.name||'人物待設定')}</p><div class="v2-row-actions"><button class="btn" data-v2="start-pack" data-id="${esc(pack.id)}">開始活動${I.right}</button><button class="btn ghost" data-v2="edit-pack" data-id="${esc(pack.id)}">${V2.packs.includes(pack)?'編輯':'另存調整'}</button>${V2.packs.includes(pack)?`<button class="btn ghost" data-v2="delete-pack" data-id="${esc(pack.id)}">刪除</button>`:''}</div></article>`).join('')}</div></section>
    <div class="v2-preparation"><form id="v2-pack-form" class="v2-form"><h2>${editing?'調整活動':'新增活動包'}</h2><p>只會顯示這次需要的地方，動作會跟著地方出現。</p>
      <label>活動名稱<input name="name" maxlength="60" required value="${esc(p.name)}" placeholder="例如：今天一起去公園"></label>
      <label>使用人物卡<select name="hero">${v2Heroes().filter(v2HeroAvailable).map(h=>`<option value="${esc(h.id)}" ${h.id===p.heroId?'selected':''}>${esc(h.name)}</option>`).join('')}</select></label>
      <fieldset><legend>可以選的地方（至少一個）</legend><div class="v2-check-options">${places.map(place=>`<label><input type="checkbox" name="places" value="${esc(place.id)}" ${p.places.includes(place.id)?'checked':''}>${esc(place.t)}</label>`).join('')}</div></fieldset>
      <label>這次使用的畫風<select name="style">${v2OptionList('style',p.style)}</select></label>
      <label class="v2-check-label"><input type="checkbox" name="prompt" ${p.showPrompt?'checked':''}>保留「看指令」教學步驟</label>
      <p id="v2-pack-error" role="alert"></p><div class="v2-row-actions"><button class="btn" type="submit">${editing&&!V2.packs.includes(editing)?'另存為新活動':'儲存活動'}</button>${editing?'<button class="btn ghost" type="button" data-v2="cancel-pack">取消調整</button>':''}</div>
    </form><section class="v2-form"><h2>人物卡</h2><p>可核對或調整設定；內建人物需另存副本。變更自訂人物會套用至下次開始的相關活動，不改目前進行中的選擇。</p><div class="v2-people-list">${v2PeopleHtml()}</div>
      <form id="v2-hero-form"><h3>新增常用人物</h3><label>人物卡名稱<input name="name" maxlength="40" required placeholder="例如：穿白襯衫的大人"></label><div class="v2-field-grid">${[['sex','男生／女生'],['age','年齡'],['hair','頭髮'],['top','衣服'],['aid','隨身物品或輔具']].map(([q,name])=>`<label>${name}<select name="${q}">${v2OptionList(q,q==='age'?'adult':q==='aid'?'none':null)}</select></label>`).join('')}</div><p id="v2-hero-error" role="alert"></p><div class="v2-row-actions"><button class="btn" type="submit">新增人物卡</button><button type="button" class="btn ghost" data-v2="cancel-hero" hidden>取消人物調整</button></div></form>
    </section></div>`;
  const packForm=$('#v2-pack-form');
  packForm.oninput=packForm.onchange=()=>{const fd=new FormData(packForm);V2_PACK_DRAFTS.set(draftKey,{name:String(fd.get('name')),heroId:fd.get('hero'),places:fd.getAll('places'),style:fd.get('style'),showPrompt:fd.has('prompt')});};
  const heroDraft=V2_HERO_DRAFT,heroEdit=V2_HERO_EDIT,heroDirty=V2_HERO_DIRTY;v2FillHeroForm(heroDraft);V2_HERO_EDIT=heroEdit;V2_HERO_DIRTY=heroDirty;
  if(heroEdit){$('#v2-hero-form h3').textContent='編輯人物卡';$('#v2-hero-form [type=submit]').textContent='儲存人物變更';}
  const heroForm=$('#v2-hero-form');
  heroForm.oninput=heroForm.onchange=()=>{const fd=new FormData(heroForm),custom=V2_HERO_DRAFT?.custom||{};V2_HERO_DRAFT={name:String(fd.get('name')),ans:Object.fromEntries(['sex','age','hair','top','aid'].map(q=>[q,fd.get(q)])),custom};V2_HERO_DIRTY=true;};
  v2WireBackups(host);
  $('#v2-pack-form').onsubmit=e=>{
    e.preventDefault();const form=e.target,fd=new FormData(form),selected=fd.getAll('places');
    if(!String(fd.get('name')).trim()||!selected.length){$('#v2-pack-error').textContent='請填活動名稱，並至少選一個地方。';return;}
    if(V2.packs.length>=80&&!V2.packs.some(x=>x.id===V2_PACK_EDIT)){toast('最多可保存 80 份活動。');return;}
    const id=V2.packs.some(x=>x.id===V2_PACK_EDIT)?V2_PACK_EDIT:v2Uid('pack');
    const item={id,name:String(fd.get('name')).trim(),heroId:fd.get('hero'),places:selected,style:fd.get('style'),showPrompt:fd.has('prompt')};
    const before=structuredClone(V2);V2.packs=V2.packs.filter(x=>x.id!==id).concat(item);
    if(!v2Persist()){V2=before;return;}
    V2_PACK_DRAFTS.delete(draftKey);V2_PACK_EDIT=null;v2RenderActivities();toast('活動已儲存，可以開始帶領了');
  };
  $('#v2-hero-form').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.target),name=String(fd.get('name')).trim();
    if(!name){$('#v2-hero-error').textContent='請填人物卡名稱。';return;}
    if(V2.heroes.length>=80&&!V2_HERO_EDIT){toast('最多可保存 80 張人物卡。');return;}
    const uses=V2.packs.filter(p=>p.heroId===V2_HERO_EDIT).length;
    if(uses&&!await eAsk(`這張人物卡用於 ${uses} 份活動。變更會在下次開始活動時套用，要儲存嗎？`,'繼續編輯','儲存人物變更'))return;
    const before=structuredClone(V2.heroes);
    const hero={id:V2_HERO_EDIT||v2Uid('hero'),name,ans:{},custom:{...V2_HERO_DRAFT?.custom}};
    ['sex','age','hair','top','aid'].forEach(q=>hero.ans[q]=fd.get(q));
    V2.heroes=V2.heroes.filter(h=>h.id!==hero.id).concat(hero);if(!v2Persist()){V2.heroes=before;return;}
    v2RefreshPeople();v2FillHeroForm(null);toast('人物卡已儲存，旁邊的活動草稿已保留。');
  };
}
function v2StartPack(id){
  const pack=v2Packs().find(x=>x.id===id),hero=pack&&v2Heroes().find(x=>x.id===pack.heroId);
  if(!pack||!hero||!v2HeroAvailable(hero)||!pack.places.some(p=>v2OriginalEpOpts('place').some(x=>x.id===p&&V2.visibility[engKey('place',x)]!==false))){toast('這份活動的人物或場景需要重新設定，請確認指定場景沒有被隱藏。');return;}
  const start=()=>{
    const before=V2.activePack;V2.activePack=pack.id;if(!v2Persist()){V2.activePack=before;return;}EP=v2NewPicture();EP.ans={...hero.ans,style:pack.style};EP.custom={...hero.custom};EP.guided=true;EP.at='place';epSave();modeSet('easy');go('e-pic');
  };
  if(epHasProgress())eAsk('要開始這份活動嗎？\n目前易學版的選擇會重新開始。','先不要','開始活動').then(ok=>{if(ok)start();});else start();
}

/* 圖卡管理：搜尋、顯示／隱藏、按鈕排序、預覽與可驗證的備份。 */
function v2AllCards(qid){return engBuiltins(qid).concat(engExtras(qid)).sort((a,b)=>(V2.order[engKey(qid,a)]||0)-(V2.order[engKey(qid,b)]||0));}
function v2RenderCards(){
  const host=$('#view-cards'),cat=engCat();
  const all=v2AllCards(cat.id),query=V2_CARD_QUERY.toLocaleLowerCase();
  const visible=all.filter(o=>o.t.toLocaleLowerCase().includes(query));
  host.innerHTML=`<div class="page-head"><p class="v2-eyebrow">帶領前的準備</p><h1 tabindex="-1">圖卡管理</h1><p>整理好選項，再到活動包決定這次要用哪些場景。</p></div>
    <div class="v2-library-tools"><button class="btn ghost" data-v2="export-library">${I.down}匯出圖卡與活動</button><label class="btn ghost v2-file-label">${I.up}匯入備份<input type="file" id="v2-library-file" accept=".json,application/json" aria-label="匯入圖卡與活動備份"></label><button class="btn ghost" data-v="activities">設定活動包</button></div>
    <p class="${V2_LIBRARY_FAILED?'v2-library-error':'v2-library-success'}" id="v2-library-status" role="status">${esc(V2_LIBRARY_ERROR)}</p>
    <div class="v2-card-toolbar"><label>要管理哪一題？<select data-eng-cat>${engCats().map(x=>`<option value="${esc(x.id)}" ${x.id===cat.id?'selected':''}>${esc(x.t)}</option>`).join('')}</select></label><label>搜尋這一題的圖卡<input type="search" id="v2-card-search" value="${esc(V2_CARD_QUERY)}" placeholder="輸入名稱"></label><button class="btn ghost" data-v2="toggle-preview">${V2_CARD_PREVIEW?'回到管理':'預覽使用者選項'}</button></div>
    ${V2_CARD_PREVIEW?`<section class="v2-card-preview"><h2>使用者會看到的圖卡</h2><p>活動包還會依設定篩選地方。</p><div class="e-opts" data-n="${all.length}">${all.filter(o=>V2.visibility[engKey(cat.id,o)]!==false).map(o=>eOpt(engMark(cat.id,o),false,'disabled')).join('')}</div></section>`:
      `<section class="eng-grid" aria-label="${esc(cat.t)}圖卡">${visible.map(o=>{
        const key=engKey(cat.id,o),idx=all.indexOf(o),shown=V2.visibility[key]!==false;
        const controls=`<div class="v2-card-controls"><button class="btn sm ghost" data-v2="card-visibility" data-key="${esc(key)}" aria-pressed="${shown}">${shown?'已顯示':'已隱藏'}</button><button class="btn sm ghost" data-v2="card-move" data-id="${esc(o.id)}" data-direction="-1" ${idx===0?'disabled':''} aria-label="將 ${esc(o.t)} 往前移">${I.left}</button><button class="btn sm ghost" data-v2="card-move" data-id="${esc(o.id)}" data-direction="1" ${idx===all.length-1?'disabled':''} aria-label="將 ${esc(o.t)} 往後移">${I.right}</button></div>`;
        return engCard(cat.id,o,!!o._engCustom).replace('</article>',controls+'</article>');
      }).join('')||'<p class="v2-empty">找不到圖卡，請換個關鍵字。</p>'}</section>${engForm()}`}
    <p class="v2-local">圖卡與活動只存於此瀏覽器。換電腦或清除資料前，請先匯出備份。</p>`;
  if(!host.dataset.v2Wired){host.addEventListener('click',eClick);host.addEventListener('change',engChange);host.dataset.v2Wired='1';}
  $('#v2-card-search').oninput=e=>{
    V2_CARD_QUERY=e.target.value;
    if(V2_CARD_PREVIEW)return;
    $$('.eng-card',host).forEach(card=>card.hidden=!$('h3',card).textContent.toLocaleLowerCase().includes(V2_CARD_QUERY.toLocaleLowerCase()));
  };
  $('#v2-library-file').onchange=e=>v2ImportLibrary(e.target.files?.[0]);
}
// 原版換圖／新增後呼叫同一個管理頁，事件仍由原有程式負責。
renderEEngineer=v2RenderCards;
function v2Library(){return {format:'prompt-robot-v2-library',version:1,cards:ENG,heroes:V2.heroes,packs:V2.packs,visibility:V2.visibility,order:V2.order};}
function v2ExportLibrary(){download('提示詞機器人-v2-圖卡與活動備份.json',JSON.stringify(v2Library(),null,2));}
async function v2ImportLibrary(file){
  if(!file)return;
  try{
    if(file.size>25*1024*1024)throw new Error('備份超過 25 MB，請確認選到正確的檔案。');
    const d=V2Data.checkedLibrary(JSON.parse(await file.text()));
    // 對照實際內建圖卡，拒絕無法使用的活動與人物相依設定。
    const opts=q=>engBuiltins(q).concat(d.cards.extras.filter(x=>x.qid===q));
    Object.keys(d.cards.overrides).forEach(key=>{const i=key.lastIndexOf(':'),q=key.slice(0,i),id=key.slice(i+1);if(!engBuiltins(q).some(o=>o.id===id))throw new Error('文字設定引用了不存在的內建圖卡。');});
    const qids=ENG_BASE_CATS.map(q=>q.id).concat(opts('place').map(p=>'act:'+p.id),['mood','style','fix']);
    qids.forEach(q=>{const list=opts(q);if(list.length&&list.every(o=>d.visibility[engKey(q,o)]===false))throw new Error('每一題至少需要保留一張可選圖卡。');});
    const heroes=V2_DEFAULT_HEROES.concat(d.heroes);
    d.heroes.forEach(h=>['sex','age','hair','top','aid'].forEach(q=>{
      if(h.ans[q]==='other'&&['top','aid'].includes(q)&&h.custom[q]?.trim())return;
      if(!opts(q).some(x=>x.id===h.ans[q]))throw new Error('人物卡引用了不存在的選項。');
    }));
    d.packs.forEach(p=>{
      if(!heroes.some(h=>h.id===p.heroId)||!p.places.every(id=>opts('place').some(x=>x.id===id))||!opts('style').some(x=>x.id===p.style))throw new Error('活動包引用了不存在的人物、地方或畫風。');
    });
    const ok=await eAsk(`備份包含 ${d.cards.extras.length} 張自訂圖卡、${d.heroes.length} 張人物卡、${d.packs.length} 份活動。\n要取代目前的圖卡與活動設定嗎？建議先匯出原設定。`,'先不要','匯入並取代');
    if(!ok)return;
    const next={...V2,heroes:d.heroes,packs:d.packs,visibility:d.visibility,order:d.order,activePack:null};
    store.writeAll({e_engineer:d.cards,workspace:next,e_pic:v2NewPicture()});
    ENG=d.cards;V2=next;EP=v2NewPicture();V2_LIBRARY_ERROR='備份匯入完成。作品清單未受影響。';V2_LIBRARY_FAILED=false;ENG_EDIT=null;ENG_PENDING_IMAGE='';V2_PACK_DRAFTS.clear();V2_PACK_EDIT=null;V2_HERO_EDIT=null;V2_HERO_DRAFT=null;V2_HERO_DIRTY=false;v2LibraryFeedback();
  }catch(e){V2_LIBRARY_ERROR='無法匯入：'+(e.message||'檔案格式錯誤');V2_LIBRARY_FAILED=true;v2LibraryFeedback();}
}
VIEWS.activities=v2RenderActivities;VIEWS.cards=v2RenderCards;
VIEWS['e-engineer']=()=>{modeSet('pro');go('cards');};

document.addEventListener('input',e=>{
  if(e.target.closest('#view-gen')){
    v2Autosave();const status=$('#v2-gen-status');if(status)status.textContent=v2GenStatus();
  }
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-v2]');if(!b||b.disabled)return;
  try{
    switch(b.dataset.v2){
      case 'new-book':return v2NewProject('book');
      case 'new-video':return v2NewProject('video');
      case 'open-project':return v2OpenProject(b.dataset.id);
      case 'export-project':{
        if(!v2SaveProject())return;const p=V2.projects.find(x=>x.id===b.dataset.id);if(p){download('提示詞作品-'+p.name.replace(/[\\/:*?"<>|]/g,'-')+'.json',JSON.stringify({...p.data,progress:v2Progress(p)},null,2));toast('已下載設定與腳本備份，不含外部 AI 成品；可在備份與還原新增還原作品。');}return;
      }
      case 'delete-project':{
        const p=V2.projects.find(x=>x.id===b.dataset.id);if(!p)return;
        if(!await eAsk('要刪除「'+p.name+'」嗎？\n建議先匯出作品。','先不要','刪除'))return;
        const before=structuredClone(V2);V2.projects=V2.projects.filter(x=>x.id!==p.id);
        if(V2.activeProject===p.id){V2.activeProject=null;}
        if(!v2Persist()){V2=before;return;}
        return v2RenderHome();
      }
      case 'easy':modeSet('easy');return go('e-home');
      case 'gen-step':return v2GenMove(Number(b.dataset.step),false);
      case 'gen-prev':return V2.genStep===0?go('home'):v2GenMove(V2.genStep-1,false);
      case 'gen-next':return v2GenMove(V2.genStep+1,true);
      case 'gen-ai':
      case 'gen-copy':{
        if(v2PendingRows().length&&!v2Progress().planReviewed){$('#v2-ai-status').textContent='請先回去修改待完成內容，或按「我已檢查，保留這些內容繼續」。';$('[data-v2=plan-confirm]')?.focus();return;}
        const text=v2SelectedPrompt();if(!text)return;
        const copied=eCopy(text,true);
        const start=b.dataset.v2==='gen-ai'&&$('#v2-prompt-select').value==='intro'&&!v2Progress().sent.length;
        if(start)window.open(eAiUrl(text),'_blank','noopener');
        $('#v2-ai-status').textContent=copied?'已複製完整提示詞。'+(start?'在新的 ChatGPT 對話確認文字並送出。':'請切回剛剛的同一個 ChatGPT 對話貼上，確認文字並送出。'):'沒有複製成功，請展開完整提示詞手動選取複製。';
        return;
      }
      case 'plan-confirm':if(v2SetProgress({planReviewed:true})){b.textContent='已自行確認待完成內容';b.setAttribute('aria-pressed','true');}return;
      case 'mark-sent':{
        const key=$('#v2-prompt-select').value,progress=v2Progress();
        if(v2PendingRows().length&&!progress.planReviewed){$('#v2-ai-status').textContent='請先檢查待完成內容。';return;}
        if(v2SetProgress({sent:progress.sent.includes(key)?progress.sent.filter(x=>x!==key):progress.sent.concat(key)}))v2RefreshHandoff();return;
      }
      case 'next-prompt':{const select=$('#v2-prompt-select');if(select.selectedIndex<select.options.length-1){select.selectedIndex++;select.onchange();select.focus();}else $('#v2-ai-status').textContent='這已是最後一段；確認外部素材後，前往排版與交付檢查。';return;}
      case 'confirm-images':{const checked=b.checked;if(!v2SetProgress({imagesReady:checked,...(!checked?{delivered:false}:{})})){b.checked=!checked;return;}if(!checked)$('[data-v2=confirm-delivery]').checked=false;return;}
      case 'confirm-delivery':{
        if(b.checked&&!v2Progress().imagesReady){b.checked=false;$('#v2-completion-status').textContent='請先完成並確認外部素材，再標記可交付。';return;}
        const checked=b.checked;if(!v2SetProgress({delivered:checked}))b.checked=!checked;return;
      }
      case 'choose-hero':{
        const hero=v2Heroes().find(x=>x.id===b.dataset.id);if(!hero||!v2HeroAvailable(hero))return;
        EP.ans={...EP.ans,...hero.ans};EP.custom={...EP.custom,...hero.custom};EP.guided=true;EP.gave=false;return epGo('place');
      }
      case 'custom-hero':EP.guided=false;EP.gave=false;return epGo('sex');
      case 'image-ready':if(EP.gave)return epGo('check');return;
      case 'handoff-help':{
        return v2ShowEasyHelp(b.dataset.kind);
      }
      case 'help-prev':return v2ShowEasyHelp('paste',Math.max(0,V2_HELP_STEP-1));
      case 'help-next':return v2ShowEasyHelp('paste',Math.min(2,V2_HELP_STEP+1));
      case 'help-close':$('#v2-easy-help').hidden=true;$('[data-v2=handoff-help][data-kind='+V2_HELP_KIND+']')?.focus();return;
      case 'free-activity':{
        V2.activePack=null;v2Persist();modeSet('easy');return go('e-home');
      }
      case 'start-pack':return v2StartPack(b.dataset.id);
      case 'edit-pack':V2_PACK_EDIT=b.dataset.id;v2RenderActivities();$('#v2-pack-form').scrollIntoView({block:'start'});$('#v2-pack-form input').focus({preventScroll:true});return;
      case 'cancel-pack':V2_PACK_DRAFTS.delete(V2_PACK_EDIT||'new');V2_PACK_EDIT=null;return v2RenderActivities();
      case 'edit-hero':{
        if(V2_HERO_DIRTY&&!await eAsk('人物卡有尚未儲存的內容，要放棄並切換嗎？','繼續編輯','放棄人物變更'))return;
        const hero=v2Heroes().find(h=>h.id===b.dataset.id);if(hero){v2FillHeroForm(hero,!V2.heroes.includes(hero));$('#v2-hero-form [name=name]').focus();}return;
      }
      case 'cancel-hero':if(!V2_HERO_DIRTY||await eAsk('要放棄這張人物卡尚未儲存的內容嗎？','繼續編輯','放棄人物變更'))v2FillHeroForm(null);return;
      case 'delete-pack':{
        const pack=V2.packs.find(x=>x.id===b.dataset.id);if(!pack)return;
        if(!await eAsk('要刪除活動「'+pack.name+'」嗎？','先不要','刪除'))return;
        const before=structuredClone(V2);V2.packs=V2.packs.filter(x=>x!==pack);if(V2.activePack===pack.id)V2.activePack=null;
        if(!v2Persist()){V2=before;return;}V2_PACK_EDIT=null;return v2RenderActivities();
      }
      case 'delete-hero':{
        if(V2.packs.some(p=>p.heroId===b.dataset.id)){toast('這張人物卡仍在活動中使用，請先調整活動的人物。');return;}
        if(!await eAsk('要刪除這張自訂人物卡嗎？','先不要','刪除'))return;
        const before=structuredClone(V2);V2.heroes=V2.heroes.filter(x=>x.id!==b.dataset.id);
        if(!v2Persist()){V2=before;return;}if(V2_HERO_EDIT===b.dataset.id)v2FillHeroForm(null);v2RefreshPeople();return;
      }
      case 'export-library':return v2ExportLibrary();
      case 'toggle-preview':V2_CARD_PREVIEW=!V2_CARD_PREVIEW;return v2RenderCards();
      case 'card-visibility':{
        const all=v2AllCards(engCat().id),key=b.dataset.key;
        if(V2.visibility[key]!==false&&all.filter(o=>V2.visibility[engKey(engCat().id,o)]!==false).length<=1){toast('每一題至少保留一張可選圖卡。');return;}
        const before={...V2.visibility};V2.visibility[key]=V2.visibility[key]===false;if(!v2Persist())V2.visibility=before;return v2RenderCards();
      }
      case 'card-move':{
        const qid=engCat().id,all=v2AllCards(qid),i=all.findIndex(o=>o.id===b.dataset.id),j=i+Number(b.dataset.direction);
        if(i<0||j<0||j>=all.length)return;
        const before={...V2.order};[all[i],all[j]]=[all[j],all[i]];all.forEach((o,n)=>V2.order[engKey(qid,o)]=n);if(!v2Persist())V2.order=before;return v2RenderCards();
      }
    }
  }catch(err){toast('操作沒有完成：'+(err.message||'請再試一次'));}
});

// 在離開編輯區前同步最新作品；不依賴非同步定時器完成儲存。
document.addEventListener('click',e=>{
  if(e.target.closest('[data-v],[data-mode],[data-go]')&&document.body.dataset.view==='gen')v2SaveProject();
},true);
