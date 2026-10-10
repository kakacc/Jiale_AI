(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
/* Local department-management prototype. Uses only its own browser storage. */
(() => {
  'use strict';
  window.createDepartmentManagement = function createDepartmentManagement(api) {
    const $ = id => document.getElementById(id);
    const html = api.escapeHtml;
    const storageKey = 'bi-department-management-prototype-v1';
    const userDirectory = () => api.getUsers?.() || api.users;
    const rootId = 'DEP-COMPANY';
    const defaults = [
      {id:rootId,parentId:'',name:'公司总部',code:'DEPT-COMPANY',leader:'USR-0001',sort:0,note:'公司组织架构根部门。',protected:true},
      {id:'DEP-BRAND',parentId:rootId,name:'品牌中心',code:'DEPT-BRAND',leader:'USR-0004',sort:10,note:'负责品牌策划与视觉内容。'},
      {id:'DEP-DESIGN',parentId:'DEP-BRAND',name:'视觉设计部',code:'DEPT-DESIGN',leader:'USR-0006',sort:10,note:'负责图片、视频与营销素材制作。'},
      {id:'DEP-ECOM',parentId:rootId,name:'电商中心',code:'DEPT-ECOM',leader:'USR-0011',sort:20,note:'负责电商渠道运营。'},
      {id:'DEP-AMAZON',parentId:'DEP-ECOM',name:'亚马逊运营组',code:'DEPT-AMAZON',leader:'',sort:10,note:''},
      {id:'DEP-OVERSEAS',parentId:rootId,name:'海外事业部',code:'DEPT-OVERSEAS',leader:'USR-0010',sort:30,note:'负责海外业务与广告投放。'},
      {id:'DEP-ADS',parentId:'DEP-OVERSEAS',name:'广告投放组',code:'DEPT-ADS',leader:'',sort:10,note:''}
    ].map(item => ({...item,createdAt:'2026-10-09 09:00:00',updatedAt:'2026-10-09 09:00:00'}));
    const defaultMembers = Object.fromEntries(userDirectory().map(user => [user.id,
      user.id === 'USR-0001' ? rootId : ['USR-0006','USR-0007','USR-0008','USR-0009'].includes(user.id) ? 'DEP-DESIGN' : user.department === '海外事业部' ? 'DEP-OVERSEAS' : user.department === '电商中心' ? 'DEP-ECOM' : 'DEP-BRAND']));
    let state = {version:1,departments:defaults,members:defaultMembers};
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved?.departments) && saved.departments.some(item => item.id === rootId) && saved.members && typeof saved.members === 'object') state = saved;
    } catch {}
    // Retain the saved organization and membership while retiring department state.
    state.departments = state.departments.map(({status,...item}) => item);
    let scopeId = '';
    let filters = {name:'',code:''};
    let page = 1;
    let pageSize = 10;
    let visibleRows = [];
    const selectedIds = new Set();
    const treeCollapsed = new Set();
    const rowsCollapsed = new Set();
    const now = () => new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'});
    const find = id => state.departments.find(item => item.id === id);
    const leaderName = item => userDirectory().find(user => user.id === item.leader)?.name || '—';
    const children = id => state.departments.filter(item => item.parentId === id).sort((a,b) => a.sort-b.sort || a.name.localeCompare(b.name,'zh-CN'));
    const descendants = id => {
      const ids = new Set([id]);
      const visit = parent => children(parent).forEach(item => { if (!ids.has(item.id)) { ids.add(item.id); visit(item.id); } });
      visit(id); return ids;
    };
    const directMembers = id => userDirectory().filter(user => state.members[user.id] === id);
    const path = id => {
      const names = []; const visited = new Set(); let item = find(id);
      while (item && !visited.has(item.id)) { visited.add(item.id); names.unshift(item.name); item = find(item.parentId); }
      return names.join(' / ');
    };
    const flatten = () => {
      const rows = []; const visited = new Set();
      const visit = (parentId,depth,ancestorIds) => children(parentId).forEach(item => {
        if (visited.has(item.id)) return;
        visited.add(item.id); rows.push({item,depth,ancestorIds}); visit(item.id,depth+1,[...ancestorIds,item.id]);
      });
      visit('',0,[]); return rows;
    };
    const save = mutate => {
      const next = JSON.parse(JSON.stringify(state)); mutate(next);
      try { localStorage.setItem(storageKey,JSON.stringify(next)); }
      catch { api.toast('保存失败，请检查浏览器存储空间','warning'); return false; }
      state = next; selectedIds.clear(); render(); api.onChange?.(); return true;
    };
    const dialog = (...args) => { api.openDialog(...args); document.querySelector('.dialog-cancel').textContent = '取消'; };
    const refreshSelection = () => {
      const selectable = visibleRows.filter(({item}) => !item.protected);
      const count = selectable.filter(({item}) => selectedIds.has(item.id)).length;
      $('selectAllDepartments').checked = selectable.length > 0 && count === selectable.length;
      $('selectAllDepartments').indeterminate = count > 0 && count < selectable.length;
      $('selectAllDepartments').disabled = !selectable.length;
      $('deleteSelectedDepartments').disabled = !selectedIds.size;
      $('deleteSelectedDepartments').textContent = selectedIds.size ? `删除 (${selectedIds.size})` : '删除';
    };
    function organizationTreeMarkup(options = {}) {
      const selectedScope = options.scopeId || '';
      const collapsed = options.collapsed || treeCollapsed;
      const membersInTree = options.users || userDirectory();
      const query = String(options.query || '').trim().toLowerCase();
      const matches = item => !query || [...descendants(item.id)].some(id => find(id)?.name.toLowerCase().includes(query));
      const branch = (parentId,depth) => children(parentId).filter(matches).map(item => {
        const hasChildren = children(item.id).length > 0;
        const expanded = Boolean(query) || !collapsed.has(item.id);
        const ids = descendants(item.id);
        const memberCount = membersInTree.filter(user => ids.has(state.members[user.id])).length;
        return `<div class="department-tree-node" role="treeitem" aria-level="${depth+1}" aria-selected="${selectedScope===item.id}" ${hasChildren ? `aria-expanded="${expanded}"` : ''}><div class="department-tree-line ${selectedScope===item.id?'selected':''}" style="--department-depth:${depth}">${hasChildren ? `<button type="button" class="department-tree-toggle" data-tree-toggle="${html(item.id)}" aria-label="${expanded?'折叠':'展开'}${html(item.name)}">${expanded?'▾':'▸'}</button>` : '<span class="department-tree-spacer"></span>'}<button type="button" class="department-tree-select" data-department-scope="${html(item.id)}" title="${html(path(item.id))}"><span class="department-folder" aria-hidden="true">▧</span><span>${html(item.name)}</span><small title="含下级部门的成员数">${memberCount}</small></button></div>${hasChildren&&expanded?`<div role="group">${branch(item.id,depth+1)}</div>`:''}</div>`;
      }).join('');
      return `<button class="department-tree-all ${selectedScope?'':'selected'}" type="button" data-department-scope=""><span>全部部门</span><small>${state.departments.length}</small></button>${branch('',0) || '<p class="department-tree-empty">未找到匹配部门</p>'}`;
    }
    function renderTree() {
      $('departmentTree').innerHTML = organizationTreeMarkup({scopeId,query:$('departmentTreeSearch').value,collapsed:treeCollapsed});
    }
    function render() {
      if (scopeId && !find(scopeId)) scopeId = '';
      renderTree();
      const allowed = scopeId ? descendants(scopeId) : null;
      const filtered = flatten().filter(({item}) => (!allowed || allowed.has(item.id)) && item.name.toLowerCase().includes(filters.name) && item.code.toLowerCase().includes(filters.code));
      const filteredIds = new Set(filtered.map(({item}) => item.id));
      const unfolded = filtered.filter(row => !row.ancestorIds.some(id => rowsCollapsed.has(id) && filteredIds.has(id)));
      const pageCount = Math.max(1,Math.ceil(unfolded.length/pageSize));
      page = Math.min(Math.max(1,page),pageCount);
      visibleRows = unfolded.slice((page-1)*pageSize,page*pageSize);
      $('departmentRows').innerHTML = visibleRows.map(({item,depth}) => {
        const hasChildren = children(item.id).length > 0;
        return `<tr data-department-row="${html(item.id)}" data-editor-row-key="department-${html(item.id)}"><td class="department-check-column"><input type="checkbox" data-department-select="${html(item.id)}" aria-label="选择部门 ${html(item.name)}" ${selectedIds.has(item.id)?'checked':''} ${item.protected?'disabled':''}></td><td><div class="department-name-cell" style="--department-depth:${depth}">${hasChildren?`<button type="button" class="department-row-toggle" data-row-toggle="${html(item.id)}" aria-label="${rowsCollapsed.has(item.id)?'展开':'折叠'}部门 ${html(item.name)}">${rowsCollapsed.has(item.id)?'▸':'▾'}</button>`:'<span class="department-row-spacer"></span>'}<button type="button" class="department-name-link" data-department-action="detail" data-department-id="${html(item.id)}" title="${html(item.name)}">${html(item.name)}</button></div></td><td><span class="department-code">${html(item.code)}</span></td><td>${html(leaderName(item))}</td><td>${item.sort}</td><td class="department-row-actions"><button class="table-link" data-department-action="add" data-department-id="${html(item.id)}">新增下级</button><button class="table-link" data-department-action="edit" data-department-id="${html(item.id)}">编辑</button><button class="table-link danger" data-department-action="delete" data-department-id="${html(item.id)}" ${item.protected?'disabled title="根部门不可删除"':''}>删除</button></td></tr>`;
      }).join('');
      $('departmentEmpty').hidden = unfolded.length > 0;
      $('departmentScopeTitle').textContent = scopeId ? `${find(scopeId).name}及下级部门` : '全部部门';
      $('departmentScopeCount').textContent = `${filtered.length} 个部门`;
      $('departmentResultCount').textContent = `共 ${filtered.length} 个部门${unfolded.length<filtered.length?` · 当前展开 ${unfolded.length} 个`:''}`;
      $('departmentPageNumber').textContent = String(page);
      $('departmentPreviousPage').disabled = page===1;
      $('departmentNextPage').disabled = page===pageCount;
      $('toggleDepartmentRows').textContent = rowsCollapsed.size ? '展开全部' : '折叠全部';
      $('expandDepartmentTree').textContent = treeCollapsed.size ? '展开全部' : '折叠全部';
      refreshSelection(); api.refresh();
    }
    const resetFilters = () => {
      filters = {name:'',code:''}; scopeId=''; page=1; selectedIds.clear(); rowsCollapsed.clear();
      $('departmentNameSearch').value=''; $('departmentCodeSearch').value=''; $('departmentTreeSearch').value=''; render();
    };
    function openForm(item = null,parentId = '') {
      const existing = Boolean(item);
      const excluded = item ? descendants(item.id) : new Set();
      const defaultParent = item?.parentId ?? (find(parentId || scopeId) ? parentId || scopeId : rootId);
      const selectedParent = existing ? defaultParent : defaultParent || rootId;
      const parentOptions = flatten().filter(({item:row}) => !excluded.has(row.id)).map(({item:row,depth}) => `<option value="${html(row.id)}" ${row.id===selectedParent?'selected':''}>${'　'.repeat(depth)}${html(row.name)}</option>`).join('');
      const body = `<div class="form-grid department-form"><label class="field span-2"><span>上级部门 <em>*</em></span><select id="departmentFormParent" ${item?.protected?'disabled':''}>${item?.protected?'<option value="">顶级部门</option>':parentOptions}</select></label><label class="field"><span>部门名称 <em>*</em></span><input id="departmentFormName" maxlength="200" placeholder="请输入部门名称" value="${html(item?.name||'')}"></label><label class="field"><span>部门编码 <em>*</em></span><input id="departmentFormCode" maxlength="40" placeholder="如 DEPT-BRAND" value="${html(item?.code||'')}"></label><label class="field">负责人<select id="departmentFormLeader"><option value="">请选择负责人</option>${userDirectory().map(user=>`<option value="${html(user.id)}" ${item?.leader===user.id?'selected':''}>${html(user.name)}</option>`).join('')}</select></label><label class="field"><span>排序 <em>*</em></span><input id="departmentFormSort" type="number" min="0" max="9999" step="1" value="${item?.sort??10}"><small>数字越小，同级部门越靠前</small></label><label class="field span-2">备注<textarea id="departmentFormNote" maxlength="1500" placeholder="请输入部门职责或说明">${html(item?.note||'')}</textarea></label></div>`;
      dialog(existing?'编辑部门':'新增部门',existing?path(item.id):'填写部门信息，保存后加入组织架构',body,'确定',()=>{
        const parent = $('departmentFormParent').value;
        const name = $('departmentFormName').value.trim(); const code = $('departmentFormCode').value.trim();
        const sort = Number($('departmentFormSort').value);
        if (!name) { api.toast('请填写部门名称','warning'); $('departmentFormName').focus(); return; }
        if (!code) { api.toast('请填写部门编码','warning'); $('departmentFormCode').focus(); return; }
        if (!/^[A-Za-z0-9_-]+$/.test(code)) { api.toast('部门编码仅支持字母、数字、下划线和短横线','warning'); $('departmentFormCode').focus(); return; }
        if (state.departments.some(row=>row.id!==item?.id&&row.code.toLowerCase()===code.toLowerCase())) { api.toast('部门编码已存在，请使用其他编码','warning'); $('departmentFormCode').focus(); return; }
        if (state.departments.some(row=>row.id!==item?.id&&row.parentId===parent&&row.name===name)) { api.toast('同一上级部门下已存在该名称','warning'); $('departmentFormName').focus(); return; }
        if (!Number.isInteger(sort)||sort<0||sort>9999||$('departmentFormSort').value==='') { api.toast('排序请输入 0–9999 的整数','warning'); return; }
        if (!item?.protected&&(!find(parent)||excluded.has(parent))) { api.toast('请选择有效的上级部门','warning'); return; }
        const id = item?.id || `DEP-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        const value = {id,parentId:parent,name,code,leader:$('departmentFormLeader').value,sort,note:$('departmentFormNote').value.trim(),createdAt:item?.createdAt||now(),updatedAt:now(),...(item?.protected?{protected:true}:{})};
        if (!save(next=>{const index=next.departments.findIndex(row=>row.id===id); if(index>=0)next.departments[index]=value; else next.departments.push(value);})) return;
        api.closeDialog(); resetFilters(); api.toast(existing?'部门信息已更新':'部门已新增');
      });
    }
    function openMembers(item) {
      const picked = new Set(directMembers(item.id).map(user=>user.id));
      const body = `<div class="department-members"><div class="department-member-toolbar"><label class="field"><span>搜索成员</span><input id="departmentMemberSearch" type="search" placeholder="输入姓名或用户 ID" maxlength="200"></label><span id="departmentMemberSelection" data-runtime-copy></span></div><p class="department-member-note">每位成员归属一个部门，可选择成员调整其部门归属。</p><div id="departmentMemberChoices" class="department-member-list"></div><p id="departmentMemberTransferNote" class="department-member-transfer" hidden></p></div>`;
      dialog('部门成员',path(item.id),body,'保存成员',()=>{
        if (!save(next=>{userDirectory().forEach(user=>{if(user.id==='USR-0001')return; if(picked.has(user.id))next.members[user.id]=item.id; else if(next.members[user.id]===item.id)next.members[user.id]='';});}))return;
        api.closeDialog(); api.toast('部门成员已更新');
      });
      const renderChoices = ()=>{
        const query = $('departmentMemberSearch').value.trim().toLowerCase();
        const users=userDirectory().filter(user=>!query||`${user.name} ${user.id}`.toLowerCase().includes(query));
        $('departmentMemberChoices').innerHTML=users.length?users.map(user=>`<label class="department-member-option"><input type="checkbox" data-department-member="${html(user.id)}" ${picked.has(user.id)?'checked':''} ${user.id==='USR-0001'?'disabled':''}><span class="department-member-avatar" aria-hidden="true">${html(user.name.slice(0,1))}</span><div><b>${html(user.name)}${user.id==='USR-0001'?'<i>管理员</i>':''}</b><small>${html(user.id)}</small></div><span class="department-member-origin">${html(find(state.members[user.id])?.name||'待分配')}</span></label>`).join(''):'<div class="empty-inline">未找到匹配成员</div>';
        $('departmentMemberSelection').textContent=`已选 ${picked.size} 人`;
        const moved=userDirectory().filter(user=>picked.has(user.id)&&state.members[user.id]&&state.members[user.id]!==item.id&&user.id!=='USR-0001');
        const note=$('departmentMemberTransferNote');note.hidden=!moved.length;note.textContent=`保存后，将把 ${moved.map(user=>`${user.name}（${find(state.members[user.id])?.name||'待分配'}）`).join('、')}调整至${item.name}，共 ${moved.length} 人。`;
      };
      $('dialogBody').oninput=event=>{if(event.target.id==='departmentMemberSearch')renderChoices();};
      $('dialogBody').onchange=event=>{const id=event.target.dataset.departmentMember;if(!id||id==='USR-0001')return; if(event.target.checked)picked.add(id);else picked.delete(id);renderChoices();};
      renderChoices();
    }
    function openDetail(item) {
      const members=directMembers(item.id);
      dialog('部门详情',path(item.id),`<div class="department-detail"><section class="detail-section"><h3 class="detail-section-title">部门信息</h3><div class="detail-fields">${[['部门名称',item.name],['部门编码',item.code],['上级部门',find(item.parentId)?.name||'无（顶级部门）'],['负责人',leaderName(item)],['排序',item.sort],['直属成员',`${members.length} 人`],['下级部门',`${children(item.id).length} 个`],['创建时间',item.createdAt],['更新时间',item.updatedAt]].map(([label,value])=>`<div class="detail-field"><span>${label}</span><b>${html(value)}</b></div>`).join('')}<div class="detail-field detail-field-wide"><span>备注</span><b>${html(item.note||'—')}</b></div></div></section><section class="detail-section"><h3 class="detail-section-title">直属成员</h3><div class="department-detail-members">${members.map(user=>`<span>${html(user.name)}</span>`).join('')||'<p>暂无直属成员</p>'}</div></section></div>`,'关闭',api.closeDialog);
    }
    function deleteDepartments(ids) {
      const items=[...new Set(ids)].map(find).filter(Boolean);if(!items.length)return;
      const blocked=items.find(item=>item.protected||children(item.id).length||directMembers(item.id).length);
      if(blocked){api.toast(blocked.protected?'根部门不可删除':children(blocked.id).length?`“${blocked.name}”有下级部门，请先处理下级部门`:`“${blocked.name}”仍有成员，请先调整成员归属`,'warning');return;}
      dialog('删除部门',`已选择 ${items.length} 个部门`,`<div class="department-confirm-note"><b>确定删除以下部门？</b><ul>${items.map(item=>`<li>${html(path(item.id))}</li>`).join('')}</ul></div>`,'确定删除',()=>{
        const deleted=new Set(items.map(item=>item.id));if(!save(next=>{next.departments=next.departments.filter(item=>!deleted.has(item.id));}))return;
        api.closeDialog();api.toast('部门已删除');
      });
    }
    $('togglePermissionManagement').addEventListener('click',()=>{const open=$('permissionManagementMenu').hidden;$('permissionManagementMenu').hidden=!open;$('permissionManagementNav').classList.toggle('open',open);$('togglePermissionManagement').setAttribute('aria-expanded',String(open));$('togglePermissionManagement').querySelector('i').textContent=open?'⌃':'⌄';});
    $('openDepartmentManagement').addEventListener('click',()=>api.showView('departments'));
    $('createDepartment').addEventListener('click',()=>openForm());
    $('searchDepartments').addEventListener('click',()=>{filters={name:$('departmentNameSearch').value.trim().toLowerCase(),code:$('departmentCodeSearch').value.trim().toLowerCase()};page=1;selectedIds.clear();render();});
    $('resetDepartments').addEventListener('click',resetFilters);
    $('clearDepartmentFilters').addEventListener('click',resetFilters);
    $('departmentTreeSearch').addEventListener('input',renderTree);
    $('departmentTree').addEventListener('click',event=>{const toggle=event.target.closest('[data-tree-toggle]');if(toggle){const id=toggle.dataset.treeToggle;treeCollapsed.has(id)?treeCollapsed.delete(id):treeCollapsed.add(id);renderTree();return;}const button=event.target.closest('[data-department-scope]');if(button){scopeId=button.dataset.departmentScope;page=1;selectedIds.clear();render();}});
    $('expandDepartmentTree').addEventListener('click',()=>{if(treeCollapsed.size)treeCollapsed.clear();else state.departments.filter(item=>children(item.id).length).forEach(item=>treeCollapsed.add(item.id));render();});
    $('toggleDepartmentRows').addEventListener('click',()=>{if(rowsCollapsed.size)rowsCollapsed.clear();else state.departments.filter(item=>children(item.id).length).forEach(item=>rowsCollapsed.add(item.id));page=1;selectedIds.clear();render();});
    $('refreshDepartments').addEventListener('click',()=>{render();api.toast('部门列表已刷新');});
    $('departmentPageSize').addEventListener('change',()=>{pageSize=Number($('departmentPageSize').value);page=1;selectedIds.clear();render();});
    $('departmentPreviousPage').addEventListener('click',()=>{page-=1;selectedIds.clear();render();});
    $('departmentNextPage').addEventListener('click',()=>{page+=1;selectedIds.clear();render();});
    $('selectAllDepartments').addEventListener('change',event=>{visibleRows.forEach(({item})=>{if(!item.protected){if(event.target.checked)selectedIds.add(item.id);else selectedIds.delete(item.id);}});render();});
    $('deleteSelectedDepartments').addEventListener('click',()=>deleteDepartments([...selectedIds]));
    $('departmentRows').addEventListener('change',event=>{const id=event.target.dataset.departmentSelect;if(!id)return;if(event.target.checked)selectedIds.add(id);else selectedIds.delete(id);refreshSelection();});
    $('departmentRows').addEventListener('click',event=>{
      const toggle=event.target.closest('[data-row-toggle]');if(toggle){const id=toggle.dataset.rowToggle;rowsCollapsed.has(id)?rowsCollapsed.delete(id):rowsCollapsed.add(id);page=1;selectedIds.clear();render();return;}
      const button=event.target.closest('[data-department-action]');if(!button)return;
      const item=find(button.dataset.departmentId);if(!item)return;
      const action=button.dataset.departmentAction;
      if(action==='add')openForm(null,item.id);else if(action==='edit')openForm(item);else if(action==='detail')openDetail(item);else if(action==='members')openMembers(item);else if(action==='delete')deleteDepartments([item.id]);
    });
    document.querySelectorAll('.department-filters input').forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter')$('searchDepartments').click();}));
    render();
    const departmentInfo = id => {
      const item=find(id);if(!item)return null;
      return {...item,path:path(id)};
    };
    function updateMembership(assignments={},removed=[]) {
      const entries=Object.entries(assignments);
      for(const [userId,departmentId] of entries){
        if(!userDirectory().some(user=>user.id===userId)){api.toast('未找到用户，请刷新后重试','warning');return false;}
        if(userId==='USR-0001'&&departmentId!==state.members[userId]){api.toast('超管的部门不可修改','warning');return false;}
        const item=departmentInfo(departmentId);
        if(!item){api.toast('请选择所属部门','warning');return false;}
      }
      if(removed.includes('USR-0001')){api.toast('超管不可删除','warning');return false;}
      if(!entries.length&&!removed.length)return true;
      return save(next=>{entries.forEach(([userId,departmentId])=>next.members[userId]=departmentId);removed.forEach(userId=>delete next.members[userId]);next.departments.forEach(item=>{if(removed.includes(item.leader)){item.leader='';item.updatedAt=now();}});});
    }
    return {render,treeMarkup:organizationTreeMarkup,list:()=>flatten().map(({item,depth})=>({...departmentInfo(item.id),depth})),memberDepartment:userId=>departmentInfo(state.members[userId]),descendantIds:id=>[...descendants(id)],updateMembership,openDetail:id=>{const item=find(id);if(item)openDetail(item);}};
  };
})();

})();