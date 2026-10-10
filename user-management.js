(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
/* Original platform user management, extended only with department membership and organization tree. */
(() => {
  'use strict';
  window.createUserManagement = function createUserManagement(api) {
    const $ = id => document.getElementById(id);
    const html = api.escapeHtml;
    const storageKey = 'bi-user-management-original-prototype-v2';
    const defaultAvatar = 'https://bi.jialenet.com/static/jpg/defaultAvatar-CTeocs1F.jpg';
    const roles = [
      {id:'bi_view_ylq',name:'投手_虞丽秋'}, {id:'bi_view_zdx',name:'投手_周丹晓'},
      {id:'bi_view_hk',name:'投手_黄珂'}, {id:'bi_view_ljj',name:'投手_梁俊杰'},
      {id:'bi_view',name:'报表查看'}, {id:'create_creative_id',name:'素材ID生成'}, {id:'SuperAdmin',name:'超级管理员'}
    ];
    const originalUsers = [
      {id:'BI-USR-YLQ',username:'Meta_ylq',nickname:'虞丽秋',roles:['bi_view_ylq','create_creative_id']},
      {id:'BI-USR-LJJ',username:'Meta_ljj',nickname:'梁俊杰',roles:[]},
      {id:'BI-USR-HK',username:'Meta_hk',nickname:'黄珂',roles:[]},
      {id:'BI-USR-ZDX',username:'Meta_zdx',nickname:'周丹晓',roles:[]},
      {id:'BI-USR-TEST',username:'ceshi_18_7',nickname:'权限测试号',roles:[]},
      {id:'BI-USR-ADMIN',username:'admin',nickname:'创始人',status:'禁用',mobile:'16858888988',email:'admin@adminmine.com',roles:[]},
      {id:'BI-USR-VIEW',username:'bi_view',nickname:'报表查看',roles:[]},
      {id:'BI-USR-CID',username:'c_cid_1',nickname:'素材ID生成',roles:[]},
      {id:'USR-0001',username:'bi_admin',nickname:'创始人',mobile:'16858888988',email:'admin@adminmine.com',roles:['SuperAdmin']}
    ].map(user=>({type:'系统用户',mobile:'',email:'',status:'启用',note:'',avatar:defaultAvatar,createdAt:'2026-10-09 09:00:00',updatedAt:'2026-10-09 09:00:00',...user,protected:user.id==='USR-0001'}));
    let users = originalUsers;
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(Array.isArray(saved?.users)&&saved.users.some(user=>user.id==='USR-0001'))users=saved.users.map(user=>({...user,protected:user.id==='USR-0001'}));
    } catch {}
    let filters={username:'',nickname:'',mobile:'',email:'',status:''};
    let scopeId='';let page=1;let pageSize=10;let pageCount=1;let visibleUsers=[];
    const selected=new Set();const treeCollapsed=new Set();const hiddenColumns=new Set();
    const columns=[['selection','多选'],['index','#'],['avatar','头像'],['username','用户名'],['nickname','昵称'],['department','所属部门'],['type','用户类型'],['mobile','手机'],['email','邮箱'],['status','状态'],['actions','操作']];
    const now=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'});
    const find=id=>users.find(user=>user.id===id);
    const department=user=>api.departments.memberDepartment(user.id);
    const directory=()=>{
      const current=users.map(user=>({id:user.id,name:user.nickname,username:user.username,department:department(user)?.name||'',status:user.status}));
      const ids=new Set(current.map(user=>user.id));
      return [...current,...api.users.filter(user=>!ids.has(user.id))];
    };
    const avatarMarkup=user=>`<img class="user-avatar" src="${html(user.avatar||defaultAvatar)}" alt="${html(user.username)}">`;
    const departmentOptions=selectedId=>api.departments.list().map(item=>`<option value="${html(item.id)}" ${item.id===selectedId?'selected':''}>${html(item.path)}</option>`).join('');
    const dialog=(title,body,confirm,callback)=>{
      closeActionMenu();api.openDialog(title,'',body,confirm,callback);
      const element=$('mainDialog');element.classList.add('original-user-dialog');
      $('dialogConfirm').innerHTML=`${html(confirm)} <small>Ctrl + Enter</small>`;
      document.querySelector('.dialog-cancel').innerHTML='取消 <small>Esc</small>';
      if(!$('userDialogFullscreen')){
        const button=document.createElement('button');button.id='userDialogFullscreen';button.type='button';button.className='user-dialog-screen';button.textContent='⛶';button.setAttribute('aria-label','全屏显示弹窗');
        element.querySelector('.dialog-close').before(button);
        button.addEventListener('click',()=>{const full=element.classList.toggle('user-original-fullscreen');button.setAttribute('aria-label',full?'退出弹窗全屏':'全屏显示弹窗');});
      }
    };
    function renderOrganizationTree(){
      $('userOrganizationTree').innerHTML=api.departments.treeMarkup({scopeId,query:$('userOrganizationSearch').value.trim(),collapsed:treeCollapsed,users});
      $('expandUserOrganizationTree').textContent=treeCollapsed.size?'展开全部':'折叠全部';
    }
    function refreshSelection(){
      const selectable=visibleUsers.filter(user=>!user.protected);
      const count=selectable.filter(user=>selected.has(user.id)).length;
      $('selectAllUsers').checked=selectable.length>0&&count===selectable.length;
      $('selectAllUsers').indeterminate=count>0&&count<selectable.length;
      $('selectAllUsers').disabled=!selectable.length;
      $('deleteSelectedUsers').disabled=!selected.size;
    }
    function applyColumns(){
      $('userManagementTable').querySelectorAll('[data-user-column]').forEach(cell=>cell.hidden=hiddenColumns.has(cell.dataset.userColumn));
    }
    function render(){
      if(scopeId&&!api.departments.list().some(item=>item.id===scopeId))scopeId='';
      renderOrganizationTree();closeActionMenu();
      const allowed=scopeId?new Set(api.departments.descendantIds(scopeId)):null;
      const rows=users.filter(user=>user.username.toLowerCase().includes(filters.username)&&user.nickname.toLowerCase().includes(filters.nickname)
        &&String(user.mobile||'').includes(filters.mobile)&&String(user.email||'').toLowerCase().includes(filters.email)
        &&(!filters.status||user.status===filters.status)&&(!allowed||allowed.has(department(user)?.id)));
      pageCount=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(Math.max(1,page),pageCount);
      visibleUsers=rows.slice((page-1)*pageSize,page*pageSize);
      const ids=new Set(users.filter(user=>!user.protected).map(user=>user.id));[...selected].forEach(id=>{if(!ids.has(id))selected.delete(id);});
      $('userRows').innerHTML=visibleUsers.map((user,index)=>{
        const dept=department(user);
        const cell=(key,value,className='')=>`<td data-user-column="${key}"${className?` class="${className}"`:''}>${value}</td>`;
        return `<tr data-user-row="${html(user.id)}" data-editor-row-key="original-user-${html(user.id)}">${cell('selection',user.protected?'—':`<input type="checkbox" data-user-select="${html(user.id)}" aria-label="选择用户 ${html(user.username)}" ${selected.has(user.id)?'checked':''}>`,'user-check-column')}${cell('index',(page-1)*pageSize+index+1)}${cell('avatar',avatarMarkup(user))}${cell('username',html(user.username))}${cell('nickname',html(user.nickname))}${cell('department',`<span title="${html(dept?.path||'未分配部门')}">${html(dept?.name||'未分配')}</span>`,'user-department-cell')}${cell('type',html(user.type))}${cell('mobile',html(user.mobile||''))}${cell('email',`<span title="${html(user.email||'')}">${html(user.email||'')}</span>`)}${cell('status',`<span class="user-original-status ${user.status==='启用'?'enabled':'disabled'}">${html(user.status)}</span>`)}${cell('actions',`${user.protected?'':`<button class="table-link" data-user-action="edit" data-user-id="${html(user.id)}">♙ 编辑</button>`}<button class="user-more-trigger" data-user-action="more" data-user-id="${html(user.id)}" aria-label="更多操作 ${html(user.username)}" aria-haspopup="menu" aria-expanded="false">⋯</button>`,'user-row-actions')}</tr>`;
      }).join('');
      $('userEmpty').hidden=rows.length>0;$('userResultCount').textContent=`共 ${rows.length} 条`;
      $('userPageNumber').textContent=String(page);$('userPageJump').value=String(page);$('userPageJump').max=String(pageCount);
      $('userPreviousPage').disabled=page===1;$('userNextPage').disabled=page===pageCount;
      applyColumns();refreshSelection();api.refresh();
    }
    function commit(next,assignments={},removed=[]){
      const previous=users;
      try{localStorage.setItem(storageKey,JSON.stringify({version:2,users:next}));}catch{api.toast('保存失败，请检查浏览器存储空间','warning');return false;}
      users=next;
      if(!api.departments.updateMembership(assignments,removed)){users=previous;try{localStorage.setItem(storageKey,JSON.stringify({version:2,users:previous}));}catch{}render();return false;}
      selected.clear();render();api.departments.render();return true;
    }
    function resetFilters(){
      filters={username:'',nickname:'',mobile:'',email:'',status:''};scopeId='';page=1;selected.clear();
      ['userUsernameSearch','userNicknameSearch','userMobileSearch','userEmailSearch','userStatusSearch','userOrganizationSearch'].forEach(id=>$(id).value='');render();
    }
    function openForm(user=null){
      if(user?.protected)return;
      const existing=Boolean(user);const currentDepartment=user?department(user):null;let avatar=user?.avatar||defaultAvatar;
      const field=(label,content,required=false,wide=false)=>`<label class="user-original-field${wide?' wide':''}"><span>${required?'<em>*</em>':''}${label}</span>${content}</label>`;
      const body=`<div class="user-original-form"><div class="user-original-field wide user-original-avatar-field"><span>头像</span><label class="user-original-avatar-upload"><input id="userFormAvatar" type="file" accept="image/*" hidden><span id="userAvatarPreview">${existing?avatarMarkup(user):'<i aria-hidden="true">＋</i><b>上传图片</b>'}</span></label></div>${field('用户名',`<input id="userFormUsername" value="${html(user?.username||'')}" maxlength="200" placeholder="请输入用户名">`,true)}${field('昵称',`<input id="userFormNickname" value="${html(user?.nickname||'')}" maxlength="200" placeholder="请输入昵称">`,true)}${field('密码',`<input id="userFormPassword" type="text" data-runtime-copy value="${existing?'':'123456'}" autocomplete="off" maxlength="200" ${existing?'disabled':''}>`,!existing)}${field('手机',`<input id="userFormMobile" value="${html(user?.mobile||'')}" maxlength="200" placeholder="请输入手机">`)}${field('邮箱',`<input id="userFormEmail" value="${html(user?.email||'')}" maxlength="200" placeholder="请输入邮箱">`)}<div class="user-original-field"><span>用户类型</span><div class="user-original-type">${['系统用户','普通用户'].map(value=>`<label><input type="radio" name="userFormType" value="${value}" ${value===(user?.type||'系统用户')?'checked':''}><span>${value}</span></label>`).join('')}</div></div>${field('所属部门',`<select id="userFormDepartment" required aria-required="true"><option value="">请选择部门</option>${departmentOptions(currentDepartment?.id||'')}</select>`,true,true)}${field('备注',`<textarea id="userFormNote" maxlength="1500" placeholder="请输入备注">${html(user?.note||'')}</textarea>`,false,true)}<div class="user-original-field wide"><span>状态</span><div class="user-original-status-options">${['启用','禁用'].map(value=>`<label><input type="radio" name="userFormStatus" value="${value}" ${value===(user?.status||'启用')?'checked':''}>${value}</label>`).join('')}</div></div></div>`;
      dialog(existing?'编辑':'新增',body,'确定',()=>{
        const username=$('userFormUsername').value.trim();const nickname=$('userFormNickname').value.trim();const departmentId=$('userFormDepartment').value;
        const target=api.departments.list().find(item=>item.id===departmentId);
        if(!username){api.toast('请输入用户名','warning');$('userFormUsername').focus();return;}
        if(!nickname){api.toast('请输入昵称','warning');$('userFormNickname').focus();return;}
        if(!existing&&!$('userFormPassword').value){api.toast('请输入密码','warning');return;}
        if(users.some(item=>item.id!==user?.id&&item.username.toLowerCase()===username.toLowerCase())){api.toast('用户名已存在','warning');return;}
        if(!departmentId||!target){api.toast('请选择所属部门','warning');$('userFormDepartment').focus();return;}
        const id=user?.id||`BI-USR-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        const value={...(user||{}),id,username,nickname,type:document.querySelector('input[name="userFormType"]:checked').value,mobile:$('userFormMobile').value.trim(),email:$('userFormEmail').value.trim(),status:document.querySelector('input[name="userFormStatus"]:checked').value,note:$('userFormNote').value.trim(),avatar,roles:user?.roles||[],protected:false,createdAt:user?.createdAt||now(),updatedAt:now()};
        if(!commit(existing?users.map(item=>item.id===id?value:item):[...users,value],{[id]:departmentId}))return;
        api.closeDialog();api.toast(existing?'编辑成功':'新增成功');
      });
      $('userFormAvatar').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){api.toast('请选择图片','warning');return;}const reader=new FileReader();reader.onload=()=>{avatar=String(reader.result);const preview=$('userAvatarPreview');if(preview)preview.innerHTML=`<img class="user-avatar" src="${html(avatar)}" alt="用户头像">`;};reader.readAsDataURL(file);});
    }
    function openRoles(user){
      if(user.protected)return;const picked=new Set(user.roles||[]);
      dialog('赋予角色',`<div class="user-role-form"><span><em>*</em>角色</span><div><div id="userRoleChips" class="user-role-chips"></div><label class="user-role-search"><input id="userRoleSearch" type="search" placeholder="搜索角色"></label><div id="userRoleChoices" class="user-role-choices"></div></div></div>`,'确定',()=>{
        if(!picked.size){api.toast('请选择角色','warning');return;}
        if(!commit(users.map(item=>item.id===user.id?{...item,roles:[...picked],updatedAt:now()}:item)))return;
        api.closeDialog();api.toast('操作成功');
      });
      const renderChoices=()=>{const query=$('userRoleSearch').value.trim().toLowerCase();$('userRoleChips').innerHTML=roles.filter(role=>picked.has(role.id)).map(role=>`<span>${html(role.name)}-${html(role.id)}<button data-remove-role="${html(role.id)}" aria-label="移除角色 ${html(role.name)}">×</button></span>`).join('');$('userRoleChoices').innerHTML=roles.filter(role=>`${role.name}-${role.id}`.toLowerCase().includes(query)).map(role=>`<label><input type="checkbox" data-user-role="${html(role.id)}" ${picked.has(role.id)?'checked':''}>${html(role.name)}-${html(role.id)}</label>`).join('')||'<p>无匹配角色</p>';};
      $('userRoleSearch').addEventListener('input',renderChoices);$('userRoleChoices').addEventListener('change',event=>{const id=event.target.dataset.userRole;if(!id)return;event.target.checked?picked.add(id):picked.delete(id);renderChoices();});$('userRoleChips').addEventListener('click',event=>{const id=event.target.closest('[data-remove-role]')?.dataset.removeRole;if(id){picked.delete(id);renderChoices();}});renderChoices();
    }
    function initializePassword(user){
      if(user.protected)return;
      dialog('初始化密码',`<div class="department-confirm-note"><b>确定初始化用户 ${html(user.username)} 的密码？</b></div>`,'确定',()=>{if(!commit(users.map(item=>item.id===user.id?{...item,passwordInitializedAt:now()}:item)))return;api.closeDialog();api.toast('密码已初始化');});
    }
    function deleteUsers(ids){
      const items=ids.map(find).filter(Boolean);if(!items.length||items.some(user=>user.protected))return;
      dialog('删除',`<div class="department-confirm-note"><b>确定删除选中的 ${items.length} 个用户？</b></div>`,'确定',()=>{const removed=new Set(items.map(user=>user.id));if(!commit(users.filter(user=>!removed.has(user.id)),{},[...removed]))return;api.closeDialog();api.toast('删除成功');});
    }
    function closeActionMenu(){const menu=$('userActionMenu');if(menu)menu.hidden=true;document.querySelectorAll('.user-more-trigger[aria-expanded="true"]').forEach(button=>button.setAttribute('aria-expanded','false'));}
    function openActionMenu(user,button){
      const menu=$('userActionMenu');const wasOpen=!menu.hidden&&menu.dataset.userId===user.id;closeActionMenu();if(wasOpen)return;
      menu.dataset.userId=user.id;menu.innerHTML=user.protected?'<button disabled>超管不可修改</button>':`<button role="menuitem" data-original-user-action="delete">删除</button><button role="menuitem" data-original-user-action="roles">赋予角色</button><button role="menuitem" data-original-user-action="password">初始化密码</button>`;
      const rect=button.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(rect.right-150,window.innerWidth-158))}px`;menu.style.top=`${Math.min(rect.bottom+5,window.innerHeight-(user.protected?48:140))}px`;menu.hidden=false;button.setAttribute('aria-expanded','true');
    }
    $('openUserManagement').addEventListener('click',()=>api.showView('users'));
    $('createUser').addEventListener('click',()=>openForm());
    $('searchUsers').addEventListener('click',()=>{filters={username:$('userUsernameSearch').value.trim().toLowerCase(),nickname:$('userNicknameSearch').value.trim().toLowerCase(),mobile:$('userMobileSearch').value.trim(),email:$('userEmailSearch').value.trim().toLowerCase(),status:$('userStatusSearch').value};page=1;selected.clear();render();});
    $('resetUsers').addEventListener('click',resetFilters);$('clearUserFilters').addEventListener('click',resetFilters);
    $('toggleUserFilters').addEventListener('click',()=>{const expanded=$('userAdvancedFilters').hidden;$('userAdvancedFilters').hidden=!expanded;$('toggleUserFilters').setAttribute('aria-expanded',String(expanded));$('toggleUserFilters').textContent=expanded?'收起 ⌃':'展开 ⌄';});
    $('toggleUserSearch').addEventListener('click',()=>{$('userManagementFilters').hidden=!$('userManagementFilters').hidden;});
    $('refreshUsers').addEventListener('click',render);
    $('printUsers').addEventListener('click',()=>{document.body.classList.add('printing-user-list');window.print();document.body.classList.remove('printing-user-list');});
    $('userColumnChoices').innerHTML=columns.map(([id,label])=>`<label><span>${label}</span><input role="switch" type="checkbox" data-user-column-toggle="${id}" checked></label>`).join('');
    $('userColumnChoices').addEventListener('change',event=>{const id=event.target.dataset.userColumnToggle;if(!id)return;event.target.checked?hiddenColumns.delete(id):hiddenColumns.add(id);applyColumns();});
    $('userPageSize').addEventListener('change',()=>{pageSize=Number($('userPageSize').value);page=1;selected.clear();render();});
    $('userPreviousPage').addEventListener('click',()=>{page-=1;selected.clear();render();});$('userNextPage').addEventListener('click',()=>{page+=1;selected.clear();render();});
    $('userPageJump').addEventListener('change',()=>{page=Math.min(pageCount,Math.max(1,Number($('userPageJump').value)||1));selected.clear();render();});
    $('selectAllUsers').addEventListener('change',event=>{visibleUsers.forEach(user=>{if(!user.protected){event.target.checked?selected.add(user.id):selected.delete(user.id);}});render();});
    $('deleteSelectedUsers').addEventListener('click',()=>deleteUsers([...selected]));
    $('userRows').addEventListener('change',event=>{const id=event.target.dataset.userSelect;if(!id||find(id)?.protected)return;event.target.checked?selected.add(id):selected.delete(id);refreshSelection();});
    $('userRows').addEventListener('click',event=>{const button=event.target.closest('[data-user-action]');if(!button)return;const user=find(button.dataset.userId);if(!user)return;if(button.dataset.userAction==='edit')openForm(user);else if(button.dataset.userAction==='more')openActionMenu(user,button);});
    $('userActionMenu').addEventListener('click',event=>{const action=event.target.dataset.originalUserAction;const user=find($('userActionMenu').dataset.userId);if(!action||!user)return;closeActionMenu();if(action==='delete')deleteUsers([user.id]);else if(action==='roles')openRoles(user);else if(action==='password')initializePassword(user);});
    document.addEventListener('click',event=>{if(!event.target.closest('.user-more-trigger,#userActionMenu'))closeActionMenu();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeActionMenu();});window.addEventListener('resize',closeActionMenu);document.addEventListener('scroll',closeActionMenu,true);
    $('userOrganizationSearch').addEventListener('input',renderOrganizationTree);
    $('expandUserOrganizationTree').addEventListener('click',()=>{if(treeCollapsed.size)treeCollapsed.clear();else{const items=api.departments.list();items.filter(item=>items.some(child=>child.parentId===item.id)).forEach(item=>treeCollapsed.add(item.id));}renderOrganizationTree();});
    $('userOrganizationTree').addEventListener('click',event=>{const toggle=event.target.closest('[data-tree-toggle]');if(toggle){const id=toggle.dataset.treeToggle;treeCollapsed.has(id)?treeCollapsed.delete(id):treeCollapsed.add(id);renderOrganizationTree();return;}const button=event.target.closest('[data-department-scope]');if(button){scopeId=button.dataset.departmentScope;page=1;selected.clear();render();}});
    document.querySelectorAll('#userManagementFilters input').forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter')$('searchUsers').click();}));
    $('mainDialog').addEventListener('close',()=>{$('mainDialog').classList.remove('original-user-dialog','user-original-fullscreen');$('userDialogFullscreen')?.remove();});
    document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter'&&$('mainDialog').open&&$('mainDialog').classList.contains('original-user-dialog')){event.preventDefault();$('dialogConfirm').click();}});
    render();return {render,getUsers:directory};
  };
})();

})();