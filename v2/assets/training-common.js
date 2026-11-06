'use strict';
window.Training=(()=>{
  const $=id=>document.getElementById(id);
  class ApiError extends Error{constructor(message,status,code){super(message);Object.assign(this,{status,code});}}
  async function api(path,options={}){
    const headers=new Headers(options.headers||{});
    if(options.body!==undefined&&!(options.body instanceof Blob)&&!(options.body instanceof ArrayBuffer)){headers.set('Content-Type','application/json');options={...options,body:JSON.stringify(options.body)};}
    let res;try{res=await fetch(path,{...options,headers,credentials:'same-origin',cache:'no-store'});}catch{throw new ApiError('連線中斷，請保留圖片並稍後重試。',0,'NETWORK');}
    if(!res.ok){let d;try{d=await res.json();}catch{}throw new ApiError(d?.error?.message||'服務暫時無法使用，請稍後重試。',res.status,d?.error?.code||'HTTP');}
    if(options.response==='blob')return res.blob();
    try{return await res.json();}catch{throw new ApiError('交件服務未啟動，請使用講師提供的網站網址。',503,'NOT_CONFIGURED');}
  }
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
  async function busy(button,work){button.disabled=true;try{return await work();}catch(e){status(e.message,true);if(e.status===401)document.dispatchEvent(new Event('training-expired'));}finally{button.disabled=false;}}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  const safeName=s=>String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)||'未命名';
  function csv(rows){return new Blob(['\ufeff'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});}
  function element(tag,text,props={}){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;Object.assign(el,props);return el;}
  function localWarning(){if(location.protocol==='file:'){status('雲端交件需要網路服務。請開啟講師提供的 HTTPS 網址；本機教學工作台仍可使用。',true);return true;}return false;}
  function time(value){return new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});}
  return {$,api,status,busy,download,csv,safeName,element,localWarning,time,ApiError};
})();
