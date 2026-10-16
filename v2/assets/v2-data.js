/* v2 備份的純資料驗證。拒絕任意網址、重複識別碼與原型鍵。 */
(function(root){
  'use strict';
  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const id = x => typeof x === 'string' && /^[a-z0-9][a-z0-9:-]{0,159}$/i.test(x);
  const safeText = (x,max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
  function checkedLibrary(d){
    if (!record(d) || d.format !== 'prompt-robot-v2-library' || d.version !== 1 ||
        !record(d.cards) || !Array.isArray(d.cards.extras) || !record(d.cards.images) ||
        !Array.isArray(d.heroes) || !Array.isArray(d.packs) || !record(d.visibility) || !record(d.order))
      throw new Error('這不是 v2 的圖卡與活動備份。');
    if (d.cards.extras.length > 300 || d.heroes.length > 80 || d.packs.length > 80)
      throw new Error('備份的圖卡或活動數量超過上限。');
    const ids = new Set();
    const extras = d.cards.extras.map(x=>{
      if (!record(x) || !id(x.id) || !/^custom-/.test(x.id) || ids.has(x.id) ||
          !/^(hair|top|aid|place|mood|style|act:[a-z0-9-]{1,80})$/.test(x.qid) ||
          !safeText(x.t,40) || !safeText(x.p,240)) throw new Error('圖卡欄位不完整，或識別碼重複。');
      ids.add(x.id); return {id:x.id,qid:x.qid,t:x.t,p:x.p};
    });
    const images = Object.create(null);
    Object.entries(d.cards.images).forEach(([key,value])=>{
      if (!id(key) || typeof value !== 'string' || value.length > 900000 ||
          !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value))
        throw new Error('圖片格式不安全或圖片太大，請重新匯出備份。');
      images[key] = value;
    });
    const heroIds = new Set();
    const heroes = d.heroes.map(x=>{
      if (!record(x) || !id(x.id) || heroIds.has(x.id) || !safeText(x.name,40) || !record(x.ans) || !record(x.custom))
        throw new Error('人物卡格式不正確。');
      heroIds.add(x.id);
      const ans={},custom={};
      for (const q of ['sex','age','hair','top','aid']){
        if (!id(x.ans[q])) throw new Error('人物卡缺少設定。');
        ans[q]=x.ans[q];
        if (typeof x.custom[q] === 'string') custom[q]=x.custom[q].slice(0,160);
      }
      return {id:x.id,name:x.name,ans,custom};
    });
    const packIds = new Set();
    const packs = d.packs.map(x=>{
      if (!record(x) || !id(x.id) || packIds.has(x.id) || !safeText(x.name,60) ||
          !id(x.heroId) || !Array.isArray(x.places) || !x.places.length || x.places.length>12 ||
          !x.places.every(id) || !id(x.style) || typeof x.showPrompt !== 'boolean')
        throw new Error('活動包格式不正確。');
      packIds.add(x.id);
      return {id:x.id,name:x.name,heroId:x.heroId,places:[...new Set(x.places)],style:x.style,showPrompt:x.showPrompt};
    });
    const visibility={},order={};
    Object.entries(d.visibility).forEach(([key,value])=>{
      if (!id(key) || typeof value !== 'boolean') throw new Error('圖卡顯示設定不正確。');
      visibility[key]=value;
    });
    Object.entries(d.order).forEach(([key,value])=>{
      if (!id(key) || !Number.isInteger(value) || Math.abs(value)>10000) throw new Error('圖卡排序格式不正確。');
      order[key]=value;
    });
    return {cards:{extras,images},heroes,packs,visibility,order};
  }
  const api={checkedLibrary};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.V2Data=api;
})(typeof window !== 'undefined' ? window : globalThis);
