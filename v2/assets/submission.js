'use strict';
(()=>{
  const {$,api,status,busy,time}=Training;let me=null,saved=null,pending=null,requestId=null,previewUrl=null,generation=0,uploading=false;
  function showLogin(){me=null;saved=null;pending=null;requestId=null;generation++;if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}$('image-file').value='';$('preview').hidden=true;$('file-info').textContent='';$('saved-submission').hidden=true;$('saved-image').hidden=true;$('saved-image').removeAttribute('src');$('saved-download').removeAttribute('href');$('upload').disabled=true;$('login-section').hidden=false;$('student-section').hidden=true;}
  async function renderStudent(){
    if(me.role!=='student'){location.replace('admin.html');return;}
    $('login-section').hidden=true;$('student-section').hidden=false;
    $('welcome').textContent=me.activity.name+' · '+(me.user.name||me.user.username);
    const needsProfile=!me.user.name||!me.user.groupName;$('profile-form').hidden=!needsProfile;$('upload-section').hidden=true;
    if(needsProfile){$('profile-form').elements.name.value=me.user.name||'';$('profile-form').elements.groupName.value=me.user.groupName||'';return;}
    $('activity-state').textContent=me.activity.isOpen?'活動開放中，確認預覽後即可交件。':'目前尚未開放或已截止交件；你仍可查看已交作品。';
    saved=(await api('/api/submission')).submission;renderSaved();$('upload-section').hidden=false;$('upload').disabled=!pending||!me.activity.isOpen;
  }
  function renderSaved(){
    $('empty-submission').hidden=!!saved;$('saved-submission').hidden=!saved;
    $('upload').textContent=saved?'確認替換作品':'確認上傳';
    if(saved){$('saved-image').hidden=true;$('saved-image-state').hidden=false;$('saved-image-state').textContent='正在載入已交圖片…';$('saved-image').src=saved.imageUrl+'?v='+saved.version;$('saved-download').href=saved.imageUrl+'?v='+saved.version;$('saved-name').textContent=me.user.name;$('saved-group').textContent=me.user.groupName;$('saved-time').textContent=time(saved.updatedAt);}
  }
  $('saved-image').addEventListener('load',()=>{if(saved&&me&&$('saved-image').naturalWidth>0){$('saved-image').hidden=false;$('saved-image-state').hidden=true;}});
  $('saved-image').addEventListener('error',()=>{if(saved&&me){$('saved-image').hidden=true;$('saved-image-state').hidden=false;$('saved-image-state').textContent='圖片暫時無法顯示，請重新整理或重新登入，確認最新交件紀錄。';}});
  async function init(){if(Training.localWarning())return;try{me=await api('/api/me');await renderStudent();}catch(e){showLogin();if(e.status!==401)status(e.message,true);}}
  $('login-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;busy(f.querySelector('button'),async()=>{me=await api('/api/login',{method:'POST',body:{username:f.elements.username.value.trim(),password:f.elements.password.value}});f.elements.password.value='';status('');await renderStudent();});});
  $('profile-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;busy(f.querySelector('button'),async()=>{me=await api('/api/profile',{method:'POST',body:Object.fromEntries(new FormData(f))});status('資料已確認。');await renderStudent();});});
  $('logout').addEventListener('click',()=>busy($('logout'),async()=>{await api('/api/logout',{method:'POST',body:{}});generation++;pending=null;requestId=null;$('image-file').value='';$('preview').hidden=true;if(previewUrl)URL.revokeObjectURL(previewUrl);showLogin();status('已登出。');}));
  async function compress(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請選擇 JPEG、PNG 或 WebP 圖片。');
    if(file.size>20*1024*1024)throw Error('原始圖片超過 20 MB，請先縮小圖片。');
    let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('無法讀取圖片，請重新下載或選擇其他圖片。');}
    try{let scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');
      for(let round=0;round<5;round++){canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        for(const quality of [.9,.8,.7,.6,.5]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=1000000)return blob;}scale*=.8;}
      throw Error('圖片仍超過大小限制，請選擇較簡單或較小的圖片。');
    }finally{bitmap.close();}
  }
  $('image-file').addEventListener('change',async e=>{const version=++generation;pending=null;requestId=null;$('upload').disabled=true;$('preview').hidden=true;$('file-info').textContent='';const file=e.target.files[0];if(!file)return;status('正在準備圖片…');try{const blob=await compress(file);if(version!==generation)return;pending=blob;requestId=crypto.randomUUID();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);$('preview').src=previewUrl;$('preview').hidden=false;$('file-info').textContent=`${file.name} · 調整後 ${(blob.size/1000).toFixed(0)} KB`;$('upload').disabled=!me.activity.isOpen;status('請確認圖片，再按下方按鈕交件。');}catch(err){if(version===generation)status(err.message,true);}});
  function sendImage(blob,version,id){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT','/api/submission');xhr.withCredentials=true;xhr.setRequestHeader('Content-Type','image/jpeg');xhr.setRequestHeader('If-Match',String(version));xhr.setRequestHeader('X-Request-Id',id);xhr.timeout=90000;xhr.upload.onprogress=e=>{if(e.lengthComputable)$('upload-progress').value=e.loaded/e.total*100;};xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300&&data?.submission)resolve(data);else reject(new Training.ApiError(data?.error?.message||'上傳未完成，請保留圖片後重試。',xhr.status,data?.error?.code));};xhr.onerror=xhr.ontimeout=()=>reject(new Training.ApiError('上傳連線中斷，請按同一按鈕重試。',0,'NETWORK'));xhr.send(blob);});}
  $('upload').addEventListener('click',async()=>{if(!pending||uploading)return;if(saved&&!confirm('要用這張圖片替換目前已交的作品嗎？'))return;uploading=true;$('image-file').disabled=true;$('logout').disabled=true;$('upload-progress').hidden=false;const button=$('upload');button.disabled=true;status('正在上傳，請保持頁面開啟…');try{const result=await sendImage(pending,saved?.version||0,requestId);saved=result.submission;renderSaved();pending=null;requestId=null;$('image-file').value='';$('preview').hidden=true;$('file-info').textContent='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}status('已交件！講師可以看到你的最新作品。');}catch(e){status(e.message,true);if(e.status===409){try{me=await api('/api/me');saved=(await api('/api/submission')).submission;renderSaved();requestId=crypto.randomUUID();$('activity-state').textContent=me.activity.isOpen?'活動開放中，確認預覽後即可交件。':'目前尚未開放或已截止交件；你仍可查看已交作品。';status(e.message+' 已載入最新紀錄，請再次確認後送出。',true);}catch(refreshError){status(refreshError.message,true);if(refreshError.status===401)showLogin();}}if(e.status===401)showLogin();}finally{uploading=false;button.disabled=!pending||!me?.activity?.isOpen;$('image-file').disabled=false;$('logout').disabled=false;$('upload-progress').hidden=true;}});
  document.addEventListener('training-expired',showLogin);init();
})();
