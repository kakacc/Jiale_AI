(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
/* Local menu/permission catalog prototype; it never submits to the BI platform. */
(() => {
  'use strict';
  window.createMenuManagement = api => {
    const $ = id => document.getElementById(id);
    const html = api.escapeHtml;
    const key = 'bi-menu-permissions-prototype-v1';
    const clone = value => JSON.parse(JSON.stringify(value));
    let items = clone(window.aiMenuManagementSeed);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved?.version === 1 && Array.isArray(saved.items) && saved.items.some(item => item.id === 'AI-ROOT')) items = saved.items;
    } catch {}
    let selectedId = items.some(item => item.id === 'AI-TASKS') ? 'AI-TASKS' : items[0]?.id;
    let newItem = null;
    let draft = null;
    const drafts = new Map();
    const removedButtons = new Map();
    const expanded = new Set(['AI-ROOT','AI-TASKS']);
    const types = [['menu','菜单'],['button','按钮'],['external','外链'],['iframe','iFrame']];
    const find = id => items.find(item => item.id === id);
    const children = id => items.filter(item => item.parentId === id).sort((a,b) => Number(a.sort)-Number(b.sort));
    const descendants = id => {
      const ids = new Set([id]);
      const visit = parent => children(parent).forEach(item => { if (!ids.has(item.id)) { ids.add(item.id); visit(item.id); } });
      visit(id); return ids;
    };
    function effectiveEnabled(item) {
      const visited = new Set();
      while (item && !visited.has(item.id)) {
        if (!item.enabled || item.deferred) return false;
        visited.add(item.id); item = find(item.parentId);
      }
      return true;
    }
    function renderTree() {
      const query = $('menuTreeSearch').value.trim().toLowerCase();
      const matches = item => !query || [...descendants(item.id)].some(id => {
        const value = find(id);return `${value?.label||''} ${value?.name||''} ${value?.code||''}`.toLowerCase().includes(query);
      });
      const branch = (parentId,depth) => children(parentId).filter(matches).map(item => {
        const hasChildren = children(item.id).length > 0;
        const open = Boolean(query) || expanded.has(item.id);
        const label = item.label || item.name;
        const badge = item.deferred ? '<small class="menu-state deferred">暂缓</small>' : !effectiveEnabled(item) ? '<small class="menu-state inactive">未启用</small>' : item.id === 'AI-REFERENCE' ? '<small class="menu-state reference">非本期</small>' : '';
        const active = item.id === selectedId && !newItem;
        return `<div class="menu-catalog-node" role="treeitem" aria-level="${depth+1}" aria-selected="${active}" ${hasChildren?`aria-expanded="${open}"`:''}><div class="menu-catalog-line ${active?'selected':''}" style="--menu-depth:${depth}">${hasChildren?`<button class="menu-node-toggle" type="button" data-menu-toggle="${html(item.id)}" aria-label="${open?'折叠':'展开'} ${html(label)}">${open?'▾':'▸'}</button>`:'<span class="menu-node-spacer"></span>'}<button type="button" class="menu-node-select" data-menu-select="${html(item.id)}" title="${html(item.code)}"><span class="menu-node-icon" aria-hidden="true">${item.type==='button'?'◇':hasChildren?'▧':'▤'}</span><span>${html(label)}</span>${badge}</button>${active?`<span class="menu-node-actions">${item.type!=='button'?`<button type="button" data-menu-add="${html(item.id)}" aria-label="新增 ${html(label)} 下级">＋</button>`:''}<button type="button" data-menu-delete="${html(item.id)}" aria-label="删除 ${html(label)}">−</button></span>`:''}</div>${hasChildren&&open?`<div role="group">${branch(item.id,depth+1)}</div>`:''}</div>`;
      }).join('');
      $('menuManagementTree').innerHTML = branch('',0) || '<div class="menu-tree-empty">未找到匹配菜单或权限点</div>';
      $('toggleMenuTree').textContent = expanded.size ? '折叠' : '展开';
    }
    function rememberDraft() {
      if (draft) drafts.set(draft.id,clone(draft));
    }
    function choose(id) {
      rememberDraft();newItem=null;selectedId=id;render();
    }
    const field = (label,content,required=false,wide=false) => `<label class="menu-original-field${wide?' wide':''}"><span>${required?'<em>*</em>':''}${label}</span>${content}</label>`;
    const textInput = (id,value,placeholder='',extra='') => `<input id="${id}" value="${html(value||'')}" maxlength="200" placeholder="${html(placeholder)}" ${extra}>`;
    function buttonDrafts() {
      const removed = removedButtons.get(draft.id) || new Set();
      const actual = children(draft.id).filter(item=>item.type==='button'&&!removed.has(item.id)).map(item=>drafts.get(item.id)||item);
      const known = new Set(actual.map(item=>item.id));
      return [...actual,...[...drafts.values()].filter(item=>item.parentId===draft.id&&item.type==='button'&&!find(item.id)&&!removed.has(item.id)&&!known.has(item.id))];
    }
    function renderButtons() {
      const buttons = buttonDrafts();
      $('menuButtonRows').innerHTML = buttons.length ? buttons.map(item=>`<tr data-menu-button-row="${html(item.id)}"><td><button type="button" class="menu-remove-button" data-remove-menu-button="${html(item.id)}" aria-label="移除按钮 ${html(item.name||'新按钮')}">−</button></td><td><input value="${html(item.name)}" data-menu-button-field="name" data-menu-button-id="${html(item.id)}" maxlength="200" aria-label="按钮名称 ${html(item.code||'新按钮')}">${item.deferred?'<small class="menu-state deferred">本期暂缓</small>':''}</td><td><input value="${html(item.code)}" data-menu-button-field="code" data-menu-button-id="${html(item.id)}" maxlength="200" aria-label="按钮标识 ${html(item.name||'新按钮')}"></td><td><input value="${html(item.i18n||'')}" data-menu-button-field="i18n" data-menu-button-id="${html(item.id)}" maxlength="200" aria-label="按钮国际化 ${html(item.name||'新按钮')}"></td></tr>`).join('') : '<tr class="menu-button-empty"><td colspan="4">没有按钮菜单?</td></tr>';
    }
    function renderEditor() {
      const current = newItem || find(selectedId);
      if (!current) { $('menuManagementEditor').innerHTML='<div class="menu-tree-empty">请选择菜单或新增顶级菜单</div>';return; }
      draft = clone(drafts.get(current.id) || current);
      const excluded = descendants(current.id);
      const parentOptions = items.filter(item=>item.type!=='button'&&!excluded.has(item.id)).map(item=>`<option value="${html(item.id)}" ${item.id===draft.parentId?'selected':''}>${html(item.name)} · ${html(item.code)}</option>`).join('');
      const routeFields = draft.type==='button' ? '' : `${field('路由地址',textInput('menuFormPath',draft.path,'请输入路由地址'),true)}${field('高亮菜单',textInput('menuFormHighlight',draft.highlight,'请输入菜单标识，访问页面时高亮指定菜单'))}${field('视图地址',`<div class="menu-view-address"><span>src/modules/</span>${textInput('menuFormView',draft.view,'请输入视图地址')}<span>.vue</span></div>`,false,true)}${field('菜单图标',`<div class="menu-icon-field">${textInput('menuFormIcon',draft.icon)}<button type="button" class="button secondary" id="selectMenuIcon">选择图标</button><button type="button" class="text-button" id="clearMenuIcon">清除</button></div>`)}${field('路由重定向',textInput('menuFormRedirect',draft.redirect,'使用 / 开头的路由地址'))}`;
      const flags = draft.type==='button' ? [['enabled','是否启用']] : [['enabled','是否启用'],['hidden','是否隐藏'],['cache','是否缓存'],['copyright','版权显示'],['breadcrumb','面包屑显示'],['pinned','Tab是否固定']];
      const requirements = (draft.requires||[]).map(code=>findByCode(code)).filter(Boolean);
      $('menuManagementEditor').innerHTML = `<div class="menu-editor-head"><b data-runtime-copy>${html(newItem?'新增'+(draft.parentId?'下级':'顶级')+'菜单':draft.name)}</b><div>${draft.deferred?'<span class="menu-state deferred">本期暂缓</span>':''}<button class="button primary" type="button" id="saveMenuItem">保存</button></div></div><div class="menu-editor-scroll" id="menuEditorScroll"><form id="menuManagementForm" class="menu-original-form" onsubmit="return false">${field('菜单名称',textInput('menuFormName',draft.name,'请输入菜单名称'),true)}${field('菜单标识',textInput('menuFormCode',draft.code,'请输入唯一的菜单或权限标识'),true)}${field('上级菜单',`<select id="menuFormParent"><option value="">请选择上级菜单，不选为顶级菜单</option>${parentOptions}</select>`)}<div class="menu-original-field"><span>菜单类型</span><div class="menu-type-options">${types.map(([type,name])=>`<label><input type="radio" name="menuFormType" value="${type}" ${type===draft.type?'checked':''}><span>${name}</span></label>`).join('')}</div></div>${routeFields}${field('国际化',textInput('menuFormI18n',draft.i18n))}${field('排序',`<input id="menuFormSort" type="number" value="${Number(draft.sort)||0}" min="0" step="0.5" max="9999">`)}<div class="menu-form-switches wide">${flags.map(([key,label])=>`<label><span>${label}</span><span class="menu-toggle"><input type="checkbox" data-menu-flag="${key}" ${draft[key]?'checked':''} ${key==='enabled'&&draft.deferred?'disabled':''}><i></i></span></label>`).join('')}</div>${field('备注',`<textarea id="menuFormNote" maxlength="255" placeholder="备注信息">${html(draft.note||'')}</textarea>`,false,true)}${draft.permissionPoint?`<div class="menu-original-field wide menu-dependency-field"><span>前置权限</span><div>${requirements.length?requirements.map(item=>`<button type="button" class="menu-dependency" data-menu-select="${html(item.id)}">${html(item.name)} <code>${html(item.code)}</code></button>`).join(''):'<span class="menu-no-dependency">无</span>'}${requirements.length?'<p>配置角色操作权限时须同时勾选前置查看权限；取消查看权限时，应提示并一并取消依赖它的操作权限。</p>':''}</div></div>`:''}${draft.type==='button'?'':`<section class="menu-button-section wide" data-spec-id="menu-button-permissions" data-spec-label="菜单管理 · 按钮权限"><div class="menu-button-title"><h3>按钮权限</h3></div><div class="menu-button-table-wrap"><table class="menu-button-table"><thead><tr><th><button type="button" id="addMenuButton" aria-label="新增按钮权限">＋</button></th><th>按钮名称</th><th>按钮标识</th><th>按钮国际化</th></tr></thead><tbody id="menuButtonRows"></tbody></table></div><button type="button" class="menu-add-button" id="addMenuButtonBelow">＋ 新增一个</button></section>`}</form></div>`;
      if (draft.type!=='button') renderButtons();
      api.refresh();
    }
    const findByCode = code => items.find(item=>item.code===code);
    function render() { rememberDraft();renderTree();renderEditor(); }
    function create(parentId='') {
      rememberDraft();
      if (find(parentId)?.type==='button') return;
      newItem={id:`MENU-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,parentId,name:'',code:'',type:'menu',sort:children(parentId).length,path:'',view:'',icon:'',i18n:'',highlight:'',redirect:'',note:'',enabled:true,hidden:false,cache:true,copyright:true,breadcrumb:true,pinned:false,source:'custom'};
      selectedId=newItem.id;drafts.set(newItem.id,clone(newItem));render();$('menuFormName').focus();
    }
    function addButton() {
      const item={id:`BUTTON-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,parentId:draft.id,name:'',code:'',type:'button',sort:buttonDrafts().length,path:'',view:'',i18n:'',note:'',enabled:true,hidden:false,cache:false,copyright:false,breadcrumb:false,pinned:false,source:'custom'};
      drafts.set(item.id,item);renderButtons();api.refresh();
      document.querySelector(`[data-menu-button-id="${item.id}"][data-menu-button-field="name"]`).focus();
    }
    function validate(next) {
      const ids=new Set(next.map(item=>item.id));const codes=new Set();
      for(const item of next) {
        if(!item.name.trim()){api.toast('请输入菜单名称或按钮名称','warning');return false;}
        if(!item.code.trim()){api.toast('请输入菜单标识或按钮标识','warning');return false;}
        if(!/^[A-Za-z0-9_:-]+$/.test(item.code)){api.toast('标识仅支持字母、数字、冒号、下划线和短横线','warning');return false;}
        if(codes.has(item.code)){api.toast(`标识“${item.code}”已存在，请使用唯一标识`,'warning');return false;}codes.add(item.code);
        if(item.sort===null||!Number.isFinite(Number(item.sort))||Number(item.sort)<0||Number(item.sort)>9999){api.toast('排序请输入 0–9999 的数字','warning');return false;}
        if(item.source==='custom'&&item.type!=='button'&&!item.path?.trim()){api.toast('请输入路由地址','warning');return false;}
        if(item.parentId&&(!ids.has(item.parentId)||next.find(row=>row.id===item.parentId)?.type==='button')){api.toast('请选择有效的上级菜单','warning');return false;}
        if(item.type==='button'&&!item.parentId){api.toast('按钮权限必须挂在上级菜单下','warning');return false;}
        if(item.deferred&&item.enabled){api.toast('该功能本期暂缓，暂不支持启用','warning');return false;}
        const visited=new Set([item.id]);let current=item;
        while(current?.parentId){if(visited.has(current.parentId)){api.toast('上级菜单不能是当前菜单或其下级','warning');return false;}visited.add(current.parentId);current=next.find(row=>row.id===current.parentId);}
      }
      for(const item of next) if((item.requires||[]).some(code=>!codes.has(code))){api.toast('前置权限仍被其他权限依赖，不能移除','warning');return false;}
      return true;
    }
    function persist(next) {
      try { localStorage.setItem(key,JSON.stringify({version:1,items:next})); }
      catch {api.toast('保存失败，请检查浏览器存储空间','warning');return false;}
      items=next;return true;
    }
    function save() {
      rememberDraft();
      const ids=new Set([draft.id]);
      const changes=[clone(draft),...buttonDrafts().map(clone)];changes.forEach(item=>ids.add(item.id));
      const removed=removedButtons.get(draft.id)||new Set();
      let next=[...items.filter(item=>!ids.has(item.id)&&!removed.has(item.id)),...changes].map(item=>({...item,name:item.name.trim(),code:item.code.trim()}));
      const renamed=changes.filter(item=>find(item.id)&&find(item.id).code!==item.code).map(item=>[find(item.id).code,item.code.trim()]);
      next=next.map(item=>({...item,requires:(item.requires||[]).map(code=>renamed.find(([before])=>before===code)?.[1]||code)}));
      if(!validate(next)||!persist(next))return;
      ids.forEach(id=>drafts.delete(id));removed.forEach(id=>drafts.delete(id));removedButtons.delete(draft.id);
      newItem=null;expanded.add(draft.parentId);expanded.add(draft.id);draft=null;render();api.toast('菜单及按钮权限已保存');
    }
    function remove(id) {
      const item=find(id);if(!item)return;
      const ids=descendants(id);
      const dependent=items.find(row=>!ids.has(row.id)&&(row.requires||[]).some(code=>[...ids].some(target=>find(target)?.code===code)));
      if(dependent){api.toast(`“${item.name}”被“${dependent.name}”依赖，请先调整依赖权限`,'warning');return;}
      api.openDialog('删除菜单',item.name,`<div class="department-confirm-note"><b>确定删除“${html(item.name)}”？</b><p>将同时移除其下 ${ids.size-1} 个菜单或按钮权限。</p></div>`,'确定删除',()=>{
        if(!persist(items.filter(row=>!ids.has(row.id))))return;
        ids.forEach(value=>{drafts.delete(value);removedButtons.delete(value);});
        if(ids.has(selectedId)){selectedId=find(item.parentId)?.id||items[0]?.id;newItem=null;}
        api.closeDialog();render();api.toast('菜单已删除');
      });
    }
    $('openMenuManagement').addEventListener('click',()=>api.showView('menus'));
    $('createTopMenu').addEventListener('click',()=>create());
    $('menuTreeSearch').addEventListener('input',renderTree);
    $('toggleMenuTree').addEventListener('click',()=>{if(expanded.size)expanded.clear();else items.filter(item=>children(item.id).length).forEach(item=>expanded.add(item.id));renderTree();});
    $('menuManagementTree').addEventListener('click',event=>{
      const select=event.target.closest('[data-menu-select]');if(select){choose(select.dataset.menuSelect);return;}
      const toggle=event.target.closest('[data-menu-toggle]');if(toggle){const id=toggle.dataset.menuToggle;expanded.has(id)?expanded.delete(id):expanded.add(id);renderTree();return;}
      const add=event.target.closest('[data-menu-add]');if(add){create(add.dataset.menuAdd);return;}
      const del=event.target.closest('[data-menu-delete]');if(del)remove(del.dataset.menuDelete);
    });
    $('menuManagementEditor').addEventListener('input',event=>{
      const target=event.target;
      const property={menuFormName:'name',menuFormCode:'code',menuFormPath:'path',menuFormHighlight:'highlight',menuFormView:'view',menuFormIcon:'icon',menuFormRedirect:'redirect',menuFormI18n:'i18n',menuFormSort:'sort',menuFormNote:'note'}[target.id];
      if(property){draft[property]=property==='sort'?(target.value===''?NaN:Number(target.value)):target.value;return;}
      if(target.dataset.menuButtonField){const item=clone(drafts.get(target.dataset.menuButtonId)||find(target.dataset.menuButtonId));item[target.dataset.menuButtonField]=target.value;drafts.set(item.id,item);}
    });
    $('menuManagementEditor').addEventListener('change',event=>{
      const target=event.target;
      if(target.id==='menuFormParent')draft.parentId=target.value;
      if(target.dataset.menuFlag)draft[target.dataset.menuFlag]=target.checked;
      if(target.name==='menuFormType'){
        if(target.value==='button'&&(children(draft.id).length||buttonDrafts().length)){api.toast('当前菜单有下级或按钮权限，不能改为按钮','warning');target.checked=false;document.querySelector(`input[name="menuFormType"][value="${draft.type}"]`).checked=true;return;}
        draft.type=target.value;rememberDraft();renderEditor();
      }
    });
    $('menuManagementEditor').addEventListener('click',event=>{
      const target=event.target;
      if(target.closest('#saveMenuItem')){save();return;}
      if(target.closest('#addMenuButton,#addMenuButtonBelow')){addButton();return;}
      const removeButton=target.closest('[data-remove-menu-button]');
      if(removeButton){const removed=removedButtons.get(draft.id)||new Set();removed.add(removeButton.dataset.removeMenuButton);removedButtons.set(draft.id,removed);renderButtons();return;}
      const dependency=target.closest('[data-menu-select]');if(dependency){choose(dependency.dataset.menuSelect);return;}
      if(target.closest('#clearMenuIcon')){draft.icon='';$('menuFormIcon').value='';return;}
      if(target.closest('#selectMenuIcon')){
        api.openDialog('选择图标','',`<div class="menu-icon-choices">${[['sparkles','✦'],['dashboard','▥'],['list','☷'],['folder','▧'],['users','♙'],['image','▣']].map(([value,label])=>`<button type="button" data-menu-icon-choice="${value}" aria-label="${value}">${label}</button>`).join('')}</div>`,'确定',api.closeDialog);
      }
    });
    $('dialogBody').addEventListener('click',event=>{const button=event.target.closest('[data-menu-icon-choice]');if(!button)return;draft.icon=button.dataset.menuIconChoice;$('menuFormIcon').value=draft.icon;api.closeDialog();});
    render();return {render};
  };
})();

})();