'use strict';
(()=>{
  const send=()=>fetch('/api/usage/heartbeat',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')send();},60_000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')send();else send();});
  window.addEventListener('pagehide',()=>{navigator.sendBeacon('/api/usage/heartbeat',new Blob(['{}'],{type:'application/json'}));clearInterval(timer);});
})();
