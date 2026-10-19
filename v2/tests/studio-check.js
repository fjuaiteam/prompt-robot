async page=>{
  const passed=[],errors=[];
  const assert=(ok,label)=>{if(!ok)throw Error(label);passed.push(label);};
  const readyImages=async()=>{await page.locator('.view.on img').evaluateAll(async images=>{await Promise.all(images.map(img=>img.decode()));});await page.mouse.move(0,0);};
  page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{STUDIO_DIRTY=false;delete ENG.overrides?.['place:park'];engSave();});
  await page.goto('http://127.0.0.1:8765/v2/');
  await page.reload();
  await page.evaluate(()=>{modeSet('pro');go('home');});
  await page.setViewportSize({width:1487,height:1058});
  assert(await page.locator('#app-sidebar [data-v=cards]').isVisible(),'工作台固定保留工程模式入口');
  await page.locator('#app-sidebar [data-v=cards]').click();
  await page.locator('[data-studio=select][data-id=park]').click();
  await page.locator('[data-eng-field=title]').fill('我的公園');
  await page.locator('[data-eng-field=prompt]').fill('有樹木和寬敞步道的公園');
  assert(await page.evaluate(()=>!ENG.overrides?.['place:park']),'圖卡文字不會在儲存前修改');
  await page.locator('[data-studio=select][data-id=home]').click();
  await page.getByRole('button',{name:'繼續編輯',exact:true}).click();
  assert(await page.locator('[data-eng-field=title]').inputValue()==='我的公園','取消離開後保留編輯內容');
  await page.locator('#studio-card-form button[type=submit]').click();
  assert(await page.evaluate(()=>epOpts('place').find(o=>o.id==='park').p==='有樹木和寬敞步道的公園'),'內建圖卡名稱與描述可正確套用到提示詞');
  assert(await page.evaluate(()=>V2Data.checkedLibrary(v2Library()).cards.overrides['place:park'].t==='我的公園'),'圖卡備份包含內建文字自訂設定');
  await page.reload();
  await page.locator('#app-sidebar [data-v=cards]').click();
  assert(await page.locator('[data-eng-field=title]').inputValue()==='我的公園','重新整理後保存內建圖卡文字');
  await page.locator('[data-studio=reset]').click();await page.getByRole('button',{name:'恢復預設',exact:true}).click();
  await page.waitForFunction(()=>!ENG.overrides?.['place:park']);
  assert(await page.evaluate(()=>!ENG.overrides['place:park']&&epOpts('place').find(o=>o.id==='park').t==='公園'),'恢復預設會還原圖卡名稱與描述');
  await page.locator('[data-eng-field=title]').fill('尚未儲存的公園');
  await page.locator('#app-sidebar .ws-link[data-v=home]').click();await page.getByRole('button',{name:'放棄變更',exact:true}).click();
  await page.locator('.studio-home').waitFor({state:'visible'});
  assert(await page.locator('.studio-home').isVisible(),'放棄未儲存變更可正常回工作台');
  await page.locator('#app-sidebar [data-v=cards]').click();
  assert(await page.locator('[data-eng-field=title]').inputValue()==='公園','未儲存文字不會汙染原圖卡');
  await page.locator('#app-sidebar .studio-category-group').filter({has:page.locator('[data-id=sex]')}).locator('summary').click();
  await page.locator('#app-sidebar [data-studio=category][data-id=sex]').click();
  assert(await page.locator('[data-eng-field=prompt]').getAttribute('readonly')!==null,'固定角色規則不會被文字編輯破壞');
  await page.locator('[data-studio=select][data-id=f]').click();await page.locator('#studio-visible').uncheck();await page.locator('#studio-card-form button[type=submit]').click();
  await page.locator('[data-studio=select][data-id=m]').click();await page.locator('#studio-visible').uncheck();await page.locator('#studio-card-form button[type=submit]').click();
  assert((await page.locator('#studio-editor-error').innerText()).includes('至少保留'),'不允許隱藏最後一張可選圖卡');
  await page.locator('#studio-visible').check();await page.locator('#studio-card-form button[type=submit]').click();
  await page.locator('[data-studio=select][data-id=f]').click();await page.locator('#studio-visible').check();await page.locator('#studio-card-form button[type=submit]').click();
  await page.locator('#app-sidebar [data-studio=category][data-id=place]').click();
  await page.locator('input[data-eng-upload]').evaluate(input=>{const dt=new DataTransfer();dt.items.add(new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>!STUDIO_BUSY);
  assert((await page.locator('#studio-editor-error').innerText()).includes('PNG'),'不支援的圖片格式有可理解的錯誤提示');
  assert(await page.evaluate(()=>{ENG.overrides['top:red']={t:'紅色上衣',p:studioOldBuiltins('top').find(o=>o.id==='red').p};const result=epHero({sex:'m',age:'adult',hair:'short',top:'red',aid:'none'});delete ENG.overrides['top:red'];return result.includes('短袖上衣')&&result.includes('深藍色長褲');}),'只改衣服名稱不會遺漏內建服裝規則');
  assert(await page.evaluate(async()=>{const before=JSON.stringify(v2Library()),data=JSON.parse(before);data.visibility['sex:m']=false;data.visibility['sex:f']=false;await v2ImportLibrary(new File([JSON.stringify(data)],'hidden.json'));return V2_LIBRARY_ERROR.includes('至少需要保留')&&JSON.stringify(v2Library())===before;}),'匯入不能繞過最後可選圖卡保護');
  assert(await page.evaluate(async()=>{const before=JSON.stringify(v2Library()),data=JSON.parse(before);data.cards.overrides['place:missing']={t:'不存在',p:'不存在的地方'};await v2ImportLibrary(new File([JSON.stringify(data)],'missing.json'));return V2_LIBRARY_ERROR.includes('不存在的內建圖卡')&&JSON.stringify(v2Library())===before;}),'匯入不存在的文字調整不會覆寫資料');
  await page.evaluate(()=>{STUDIO_DRAFT=null;STUDIO_DIRTY=false;go('home');
    const b=V2.projects.find(p=>p.medium==='book'),v=V2.projects.find(p=>p.medium==='video');
    if(b){b.name='練習搭公車';b.data.cfg.title=b.name;b.updated='2026-10-16T08:00:00.000Z';CFG={...DEFAULTS,...b.data.cfg};SCRIPT=b.data.script;VSCRIPT=b.data.vscript;V2.activeProject=b.id;}
    if(v){v.name='我的居家生活';v.data.cfg.title=v.name;v.updated='2026-10-15T08:00:00.000Z';}
    V2.visibility['place:home']=true;studioOldBuiltins('place').forEach((o,i)=>V2.order[engKey('place',o)]=i);
    V2_LIBRARY_ERROR='';v2Persist();go('home');document.querySelector('#toast').classList.remove('on');document.activeElement?.blur();});
  assert(await page.locator('.studio-thumb figcaption').first().innerText()==='類型示意','首頁縮圖明確標示非真實成品');
  assert(await page.evaluate(()=>{const p=V2.projects.find(p=>p.id===V2.activeProject),d=p.updated;go('home');return p.updated===d;}),'瀏覽首頁不會偽造新的儲存時間');
  await readyImages();await page.screenshot({path:'資源/測試紀錄/studio-home-desktop.png'});
  await page.locator('#app-sidebar [data-v=cards]').click();await page.locator('[data-studio=select][data-id=park]').click();
  assert(await page.locator('.studio-image-preview img').evaluate(img=>img.getBoundingClientRect().height<=img.parentElement.getBoundingClientRect().height+1),'工程預覽顯示完整圖片，不被容器裁切');
  await readyImages();await page.screenshot({path:'資源/測試紀錄/studio-engineer-desktop.png'});
  await page.evaluate(()=>{modeSet('easy');V2.activePack=null;EP=v2NewPicture();EP.guided=true;EP.ans={sex:'m',age:'adult',hair:'short',top:'red',aid:'none',place:'park',act:'walk',mood:'happy',style:'crayon'};EP.at='style';go('e-pic');document.activeElement?.blur();});
  assert(await page.locator('[data-e=pick][data-o=crayon] .e-tick-t').isVisible(),'易學版以勾選和文字標示已選狀態');
  await readyImages();await page.screenshot({path:'資源/測試紀錄/studio-easy-desktop.png'});
  await page.evaluate(()=>go('e-home'));
  assert(await page.locator('[data-e=engineer]').isVisible(),'易學版首頁保留工程模式入口');
  await page.locator('[data-e=engineer]').click();await page.getByRole('button',{name:'進入工程模式',exact:true}).click();
  await page.locator('#studio-card-form').waitFor({state:'visible'});
  assert(await page.locator('#studio-card-form').isVisible(),'易學版工程入口可真正開啟編輯器');
  for(const size of [{width:375,height:812},{width:768,height:1024},{width:812,height:375}]){
    await page.setViewportSize(size);
    for(const view of ['home','cards','gen']){
      await page.evaluate(view=>{modeSet('pro');go(view);},view);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${view} ${size.width}px 無水平溢出`);
      await page.evaluate(()=>document.documentElement.style.setProperty('--ui',2.667));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${view} ${size.width}px 工作人員大字級無溢出`);
    }
    await page.evaluate(()=>{modeSet('easy');EP.at='style';go('e-pic');});
    for(const ui of [1,1.333,1.667,2.667]){
      await page.evaluate(ui=>document.documentElement.style.setProperty('--ui',ui),ui);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`易學版 ${size.width}px 字級 ${ui} 無溢出`);
    }
  }
  await page.setViewportSize({width:375,height:812});await page.evaluate(()=>{modeSet('pro');go('cards');});
  await page.screenshot({path:'資源/測試紀錄/studio-engineer-mobile.png',fullPage:true});
  await page.locator('[data-ws-toggle]').click();
  assert(await page.locator('#ws-drawer').isVisible(),'手機可開啟工程分類抽屜');
  await page.locator('#ws-drawer [data-studio=category][data-id=mood]').click();
  assert(await page.evaluate(()=>ENG_CAT==='mood'&&!document.querySelector('#ws-drawer').open),'手機選分類後關閉抽屜並更新編輯器');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert(await page.evaluate(()=>getComputedStyle(document.querySelector('.ws-content')).transitionDuration==='0s'),'減少動態效果設定保持可用');
  assert(errors.length===0,'新視覺與編輯流程沒有未處理 JS 錯誤：'+errors.join(';'));
  return {passed:passed.length,checks:passed,errors};
}
