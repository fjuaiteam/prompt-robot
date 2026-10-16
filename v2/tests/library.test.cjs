const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkedLibrary}=require('../assets/v2-data.js');
const sample=()=>({format:'prompt-robot-v2-library',version:1,cards:{extras:[{id:'custom-test',qid:'place',t:'圖書館',p:'明亮的圖書館'}],images:{}},heroes:[],packs:[],visibility:{'place:custom-test':false},order:{'place:custom-test':1}});
test('備份保留自訂圖卡、顯示與排序，不保留未知欄位',()=>{
  const input=sample();input.private='不應保留';const out=checkedLibrary(input);
  assert.equal(out.cards.extras[0].p,'明亮的圖書館');assert.equal(out.visibility['place:custom-test'],false);assert.equal(out.private,undefined);
});
test('拒絕其他產品或版本的備份',()=>{const x=sample();x.version=9;assert.throws(()=>checkedLibrary(x));assert.throws(()=>checkedLibrary(null));});
test('拒絕遠端圖片網址、SVG 與非圖片資料',()=>{
  for(const data of ['https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,PHNjcmlwdD4=']){
    const x=sample();x.cards.images['place:home']=data;assert.throws(()=>checkedLibrary(x));
  }
});
test('拒絕重複識別碼、過大圖片與空白內容',()=>{
  const a=sample();a.cards.extras.push({...a.cards.extras[0]});assert.throws(()=>checkedLibrary(a));
  const b=sample();b.cards.images['place:home']='data:image/png;base64,'+'A'.repeat(900000);assert.throws(()=>checkedLibrary(b));
  const c=sample();c.cards.extras[0].p=' ';assert.throws(()=>checkedLibrary(c));
});
test('拒絕原型鍵與不正確的管理設定',()=>{
  const a=sample();a.cards.images=JSON.parse('{"__proto__":"data:image/png;base64,AAAA"}');assert.throws(()=>checkedLibrary(a));
  const b=sample();b.order['place:home']='1';assert.throws(()=>checkedLibrary(b));
});
test('人物卡和活動包保留必要資料',()=>{
  const x=sample();x.heroes=[{id:'hero-test',name:'短髮人物',ans:{sex:'m',age:'adult',hair:'short',top:'red',aid:'none'},custom:{}}];
  x.packs=[{id:'pack-test',name:'圖書館活動',heroId:'hero-test',places:['custom-test','custom-test'],style:'crayon',showPrompt:false}];
  const out=checkedLibrary(x);assert.deepEqual(out.packs[0].places,['custom-test']);assert.equal(out.heroes[0].ans.age,'adult');
});
