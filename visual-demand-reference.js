(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
(function(){
  'use strict';
  const G=window.VisualDemandGridModel,DB='ai-visual-demand-reference-files-v1';
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let database;
  function db(){if(database)return database;database=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};request.onerror=()=>{database=null;reject(new Error('无法打开文件存储，请检查当前浏览器的存储权限。'));};});return database;}
  async function getFile(key){const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction('files').objectStore('files').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function putFiles(files){if(!files.size)return;const database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction('files','readwrite'),store=transaction.objectStore('files');for(const [key,file] of files)store.put(file,key);transaction.oncomplete=resolve;transaction.onerror=transaction.onabort=()=>reject(new Error('文件保存失败：浏览器存储空间不足或不可用。请减少文件后重试。'));});}
  const uid=()=>crypto.randomUUID();
  const sizeLabel=n=>n<1048576?Math.max(1,Math.ceil(n/1024))+' KB':(n/1048576).toFixed(1)+' MB';
  function control(d,editable=true){return '<div class="vg-reference-control"><p>'+h(G.referenceSummary(d)||'暂无制作参考')+'</p><button type="button" class="button secondary" data-reference-open="'+h(d.id||'')+'">'+(editable?'添加 / 管理制作参考':'查看制作参考')+'</button><small>支持多张图片、多个视频和多个链接</small></div>';}
  function open({record,readonly=false,onSave,onClose}){
    const old=document.getElementById('vgReferenceDialog');if(old?.open)return;old?.remove();
    const initial=G.referenceValue(record),value=structuredClone(initial),files=new Map(),urls=new Set();let busy=false,closed=false;
    const dialog=document.createElement('dialog');dialog.id='vgReferenceDialog';dialog.className='vg-reference-dialog';dialog.setAttribute('aria-label',readonly?'查看制作参考':'编辑制作参考');
    dialog.innerHTML='<header><div><h2>制作参考</h2><p>'+h(record.title||record.id||'需求参考')+'</p></div><button type="button" class="dialog-close" data-reference-close aria-label="关闭制作参考">×</button></header><div class="vg-reference-body">'+(!readonly?'<div class="vg-reference-upload"><label class="button secondary">＋ 上传图片<input type="file" accept="image/*" multiple aria-label="上传参考图片" data-reference-files="image"></label><label class="button secondary">＋ 上传视频<input type="file" accept="video/*" multiple aria-label="上传参考视频" data-reference-files="video"></label><span>可多选文件；文件保存在当前浏览器</span></div><div class="vg-reference-link"><input type="url" aria-label="参考链接" placeholder="输入HTTP/HTTPS链接，可多次添加" maxlength="2048"><button type="button" class="button secondary" data-reference-add-link>添加链接</button></div>':'')+'<div class="vg-reference-items"></div>'+(readonly?(value.text?'<section class="vg-reference-note"><h3>参考说明</h3><p>'+h(value.text)+'</p></section>':''):'<label class="vg-reference-note">参考说明（选填）<textarea aria-label="参考说明" maxlength="1500" rows="3" placeholder="补充说明；原有参考文字会保留">'+h(value.text)+'</textarea></label>')+'</div><div class="vg-reference-status" role="status">'+(readonly?'已保存的制作参考':'添加后点击「保存制作参考」；取消不写入需求')+'</div><footer><button type="button" class="button secondary vg-danger" data-reference-discard hidden>放弃修改</button><button type="button" class="button secondary" data-reference-close>'+(readonly?'关闭':'取消')+'</button>'+(!readonly?'<button type="button" class="button primary" data-reference-save>保存制作参考</button>':'')+'</footer>';
    document.body.append(dialog);dialog.showModal();
    const message=(text,error=false)=>{const el=dialog.querySelector('.vg-reference-status');el.textContent=text;el.classList.toggle('is-error',error);};
    const current=()=>({...value,text:dialog.querySelector('textarea')?.value??value.text});
    const dirty=()=>JSON.stringify(current())!==JSON.stringify(initial);
    const close=()=>{if(busy)return;closed=true;window.removeEventListener('beforeunload',warnUnload);dialog.close();dialog.remove();urls.forEach(url=>URL.revokeObjectURL(url));onClose?.();};
    const warnUnload=e=>{if(!readonly&&dirty()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warnUnload);
    const requestClose=()=>{if(busy)return;if(!readonly&&dirty()){message('制作参考尚未保存，请保存，或点击「放弃修改」。',true);dialog.querySelector('[data-reference-discard]').hidden=false;}else close();};
    async function showMedia(item,element){try{const blob=files.get(item.assetKey)||await getFile(item.assetKey);if(closed||!element.isConnected)return;if(!blob){element.parentElement.querySelector('[data-reference-file-note]').textContent='文件不在当前浏览器，请重新上传';return;}const url=URL.createObjectURL(blob);urls.add(url);element.src=url;element.parentElement.querySelector('[data-reference-download]').href=url;}catch(error){if(!closed)message(error.message,true);}}
    function draw(){
      const list=dialog.querySelector('.vg-reference-items');list.innerHTML=value.items.map(item=>'<article class="vg-reference-item" data-reference-item="'+h(item.id)+'">'+(item.kind==='link'?'<div class="vg-reference-link-card"><span>↗ 参考链接</span><a href="'+h(item.url)+'" target="_blank" rel="noopener noreferrer">'+h(item.url)+'</a></div>':'<div class="vg-reference-preview">'+(item.kind==='image'?'<img alt="'+h(item.name)+'" loading="lazy">':'<video controls preload="metadata" aria-label="'+h(item.name)+'"></video>')+'<span data-reference-file-note>'+h(sizeLabel(item.size))+'</span><a data-reference-download download="'+h(item.name)+'" class="table-link">下载文件</a></div>')+'<div class="vg-reference-item-footer"><span title="'+h(item.name)+'">'+h(item.name)+'</span>'+(!readonly?'<button type="button" class="text-button vg-danger" data-reference-remove="'+h(item.id)+'">移除</button>':'')+'</div></article>').join('')+(!value.items.length?'<div class="vg-reference-empty">暂无图片、视频或链接</div>':'');
      for(const item of value.items){if(item.kind==='link')continue;const element=list.querySelector('[data-reference-item="'+item.id+'"] img,[data-reference-item="'+item.id+'"] video');showMedia(item,element);}
    }
    dialog.onchange=e=>{const kind=e.target.dataset.referenceFiles;if(!kind||readonly||busy)return;const additions=[];for(const file of e.target.files){let mime=file.type;if(!mime){const ext=file.name.split('.').pop().toLowerCase();mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',avif:'image/avif',bmp:'image/bmp',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',m4v:'video/mp4',ogg:'video/ogg'})[ext]||'';}if(!mime.startsWith(kind+'/')||!file.size){message('请选择有效的'+(kind==='image'?'图片':'视频')+'文件；本次选择尚未添加。',true);e.target.value='';return;}const key=uid();additions.push({item:{id:key,kind,assetKey:key,name:file.name,size:file.size,mime},file});}
      additions.forEach(({item,file})=>{value.items.push(item);files.set(item.assetKey,file);});e.target.value='';draw();message('已添加 '+additions.length+' 个文件，点击保存后生效。');};
    function addLink(){const input=dialog.querySelector('input[type=url]'),url=input.value.trim();if(!url){message('请先输入参考链接。',true);return;}try{const normalized=G.normalizeReference({text:'',items:[{id:uid(),kind:'link',url}]});if(value.items.some(item=>item.kind==='link'&&item.url===normalized.items[0].url)){message('该链接已添加。',true);return;}value.items.push(normalized.items[0]);input.value='';draw();message('链接已添加，点击保存后生效。');}catch(error){message(error.message,true);input.focus();}}
    dialog.onclick=async e=>{
      if(e.target.closest('[data-reference-close]'))requestClose();if(e.target.closest('[data-reference-discard]'))close();if(readonly||busy)return;
      if(e.target.closest('[data-reference-add-link]'))addLink();const remove=e.target.closest('[data-reference-remove]');if(remove){const item=value.items.find(v=>v.id===remove.dataset.referenceRemove);value.items=value.items.filter(v=>v!==item);files.delete(item?.assetKey);draw();message('已移除参考项，保存后生效。');}
      if(e.target.closest('[data-reference-save]')){
        if(dialog.querySelector('input[type=url]').value.trim()){message('输入的链接尚未添加，请先点击「添加链接」。',true);return;}
        let normalized;try{normalized=G.normalizeReference(current());}catch(error){message(error.message,true);return;}
        busy=true;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);message('正在保存文件及制作参考…');
        try{await putFiles(files);await onSave?.(normalized);busy=false;close();}catch(error){busy=false;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);message(error.message+'；当前内容已保留，可重试。',true);}
      }
    };
    dialog.oncancel=e=>{e.preventDefault();requestClose();};dialog.onkeydown=e=>{if(e.key==='Enter'&&e.target.matches('input[type=url]')){e.preventDefault();addLink();}};draw();
    return dialog;
  }
  window.VisualDemandReference={open,control};
})();

})();