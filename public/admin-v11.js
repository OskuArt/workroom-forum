/* CONSTELLATION V11 admin logo sync */
const V11_ADMIN_LOGO=`<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3.5l2.7 9.8L28.5 16l-9.8 2.7L16 28.5l-2.7-9.8L3.5 16l9.8-2.7L16 3.5Z" fill="currentColor"/><circle cx="25.5" cy="7" r="1.6" fill="currentColor" opacity=".72"/><circle cx="7" cy="24.5" r="1.2" fill="currentColor" opacity=".48"/></svg>`;
function syncAdminLogo(scope=document){scope.querySelectorAll?.('.logoIcon').forEach(el=>{if(el.dataset.v11logo)return;el.dataset.v11logo='1';el.innerHTML=V11_ADMIN_LOGO})}
const v11AdminObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1)syncAdminLogo(n)});
v11AdminObserver.observe(document.documentElement,{subtree:true,childList:true});
setTimeout(()=>syncAdminLogo(),0);
