(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
(function () {
  'use strict';
  window.createVisualDemandRecords = function (api) {
    const M=window.VisualDemandRecordsModel, h=api.escapeHtml, root=document.getElementById('visualDemandRecords');
    const KEY='ai-visual-demand-business-records-v1';
    const $=selector=>document.querySelector(selector);
    const actor=api.currentUser.name;
    const materialSelection=new Set();
    const materialDeleteHint='仅支持批量删除未创建过广告命名的素材，请先取消勾选广告命名数>0的素材';
    const accountName=n=>n.adAccountName||M.advertisingAccounts.find(a=>a.value===n.adAccountId)?.label||n.adAccountId||'';
    const namingConfig=()=>({allowIncomplete:true,users:api.users.map(u=>u.name),pageValues:api.adOptions('adPage').map(o=>o.value),sourceValues:api.adOptions('adMaterialSource').map(o=>o.value),producerInitials:api.producerInitials,categoryCode:value=>api.optionCode('materialCategory',value)});
    function readLatestBusiness(){const saved=localStorage.getItem(KEY);if(!saved)throw new Error('记录已更新，请刷新后重试。');const next=JSON.parse(saved);if(next.version!==1||!['demands','materials','namings','batches'].every(k=>Array.isArray(next[k])))throw new Error('记录无法读取，请刷新后重试。');return next;}
    const can=code=>api.currentUser.isOrgAdmin||api.currentUser.permissions?.includes(code);
    const guard=code=>{if(can(code))return true;api.toast('当前账号没有此操作权限','warning');return false;};
    const options=(values,selected='',empty='全部')=>(empty===null?'':'<option value="">'+h(empty)+'</option>')+values.map(v=>{const value=typeof v==='object'?v.value:v,label=typeof v==='object'?v.label:v;return '<option value="'+h(value)+'" '+(value===selected?'selected':'')+'>'+h(label)+'</option>';}).join('');
    const namingState=(d,values={},preview=false)=>api.materialNamingState(d,values,preview);
    function materialNaming(m,d={}) {d=d||{};return namingState({...d,...m},{owner:m.deliveredBy||d.owner,completionDate:m.deliveredAt||d.completionDate,version:m.version||d.version||'V1',materialType:m.type||m.materialType||d.materialType});}
    function materialName(m,d) {return materialNaming(m,d).name||(!d?m.name:'')||'待补全命名信息';}
    function namingField(d,values,id) {
      const state=namingState(d,values);
      return '<label class="vd-form-full vd-material-name">素材名称<input id="'+id+'" value="'+h(state.name)+'" readonly aria-readonly="true" placeholder="待补全命名信息"><small id="'+id+'Hint" class="vd-type-help">'+h(state.missing.length?'请补充：'+state.missing.join('、'):'按素材库命名规则自动生成')+'</small></label>';
    }
    function updateNamingField(d,form,id) {const state=namingState(d,{owner:form.elements.owner?.value??form.elements.deliveredBy?.value,completionDate:form.elements.completionDate?.value??form.elements.deliveredAt?.value,version:form.elements.version?.value,materialType:form.elements.type?.value});$('#'+id).value=state.name;$('#'+id+'Hint').textContent=state.missing.length?'请补充：'+state.missing.join('、'):'按素材库命名规则自动生成';}
    function materialAddressMarkup(value,empty='—') {
      const url=M.safeUrl(value);
      if(url)return '<a class="table-link" href="'+h(url)+'" target="_blank" rel="noopener noreferrer">查看素材 ↗</a>';
      if(M.isUncPath(value))return '<a class="table-link vd-share-path" href="'+h(M.materialLinkTarget(value))+'" target="_blank" rel="noopener noreferrer">'+h(value)+' ↗</a> <button type="button" class="table-link vd-copy-address" data-vd-copy-address="'+h(value)+'">复制地址</button>';
      return '<span class="vd-optional">'+h(empty)+'</span>';
    }
    function materialTableAddressMarkup(value) {
      const target=M.materialLinkTarget(value);
      if(!target)return '<span class="vd-optional">URL 待补充</span>';
      return '<div class="vd-material-address-actions"><a class="table-link" href="'+h(target)+'" target="_blank" rel="noopener noreferrer">点击跳转</a><button type="button" class="table-link" data-vd-copy-address="'+h(value)+'">复制地址</button></div>';
    }
    async function copyMaterialName(value) {try{await navigator.clipboard.writeText(value);api.toast('素材名称已复制');}catch{api.toast('复制失败，请选中素材名称手动复制','warning');}}
    async function copyMaterialAddress(value) {try{await navigator.clipboard.writeText(value);api.toast('素材地址已复制');}catch{api.toast('复制失败，请手动选择并复制素材地址','warning');}}
    const badge=status=>'<span class="vd-status vd-status-'+({'待处理':'pending','进行中':'running','已交付':'delivered','已关闭':'closed','已取消':'cancelled','制作中':'running','已完成':'delivered','项目暂停':'paused','待制作':'pending','待分配':'pending'}[status]||'pending')+'">'+h(status)+'</span>';
    const label=(field,value)=>value===null||value===undefined||value===''?'':api.optionLabel(field,value)||value;
    const typeLabel=value=>M.demandTypes.find(t=>t.value===value)?.label||'待补充';
    function ownerControl(d,value='',required=false){return M.usesPostNumber(d.expression)?'<input name="owner" type="text" maxlength="200" value="'+h(value)+'" placeholder="请输入帖子编号" data-post-owner '+(required?'required':'')+'><small class="vd-warning" data-post-warning role="status" hidden></small>':'<select name="owner" '+(required?'required':'')+'>'+options(api.users.map(u=>({value:u.name,label:u.name+' · '+u.department})),value,'请选择制作人')+'</select>';}
    function bindPostWarning(form,d){const input=form?.elements.owner;if(!input||!M.usesPostNumber(d.expression))return;const update=()=>{const message=M.postNumberWarning(store,{...d,owner:input.value}),note=form.querySelector('[data-post-warning]');if(note){note.textContent=message;note.hidden=!message;}input.setAttribute('aria-description',message);};input.addEventListener('input',update);update();}
    const userOptions=selected=>options(api.users.map(u=>({value:u.name,label:u.name+' · '+u.department})),selected,null);
    let storageProblem='', filters=M.normalizeDemandFilters(), savedFilters=null, filterProblem='', page=1, pageTab='list', filtersExpanded=false, adPage=1, adFilters=M.normalizeAdvertisingFilters(), savedAdFilters=null, adFilterProblem='', adPreferenceKey='', materialPage=1, materialFilters=M.normalizeMaterialFilters(), savedMaterialFilters=null, materialFilterProblem='', materialPreferenceKey='';
    let grid;
    let preferenceKey='';
    try {preferenceKey=M.filterStorageKey(api.currentUser.id);const saved=localStorage.getItem(preferenceKey);if(saved){const preference=JSON.parse(saved);if(preference?.filters?.status&&!M.statuses.includes(preference.filters.status)){preference.filters.status=['待处理','待创建任务'].includes(preference.filters.status)?'':M.canonicalProgressStatus(preference.filters.status);filterProblem='旧状态筛选已更新，请核对后保存筛选';}savedFilters=M.decodeFilterPreference(api.currentUser.id,JSON.stringify(preference));filters={...savedFilters};}}
    catch(error){filterProblem=error.message||'已保存的筛选条件暂时无法读取。';}
    try {materialPreferenceKey=M.materialFilterStorageKey(api.currentUser.id);const saved=localStorage.getItem(materialPreferenceKey);if(saved){savedMaterialFilters=M.decodeMaterialFilterPreference(api.currentUser.id,saved);materialFilters={...savedMaterialFilters};}}
    catch(error){materialFilterProblem=error.message||'已保存的素材筛选条件暂时无法读取。';}
    try {adPreferenceKey=M.advertisingFilterStorageKey(api.currentUser.id);const saved=localStorage.getItem(adPreferenceKey);if(saved){savedAdFilters=M.decodeAdvertisingFilterPreference(api.currentUser.id,saved);adFilters={...savedAdFilters};}}
    catch(error){adFilterProblem=error.message||'已保存的广告筛选条件暂时无法读取。';}
    const sameMaterialFilters=(a,b)=>JSON.stringify(M.normalizeMaterialFilters(a))===JSON.stringify(M.normalizeMaterialFilters(b));
    function materialFilterSaveLabel(value=materialFilters) {return materialFilterProblem||(!savedMaterialFilters?'可保存为下次默认筛选':sameMaterialFilters(value,savedMaterialFilters)?'已保存为此账号的默认筛选':'条件已变更，尚未保存');}
    function applyMaterialFilters(save=false) {
      const form=$('#vdMaterialFilter');if(!form.reportValidity())return;
      try {
        const next=M.validateMaterialFilters(Object.fromEntries(new FormData(form)));
        if(save){if(!materialPreferenceKey)throw new Error('缺少登录人员标识，暂时无法保存筛选。');localStorage.setItem(materialPreferenceKey,M.encodeMaterialFilterPreference(api.currentUser.id,next));savedMaterialFilters={...next};materialFilterProblem='';}
        materialFilters=next;materialPage=1;materialSelection.clear();render();if(save)api.toast('已保存素材筛选，下次进入将自动应用');
      }catch(error){api.toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，素材筛选未保存。':error.message||'素材筛选保存失败，请稍后重试','warning');}
    }
    function updateMaterialFilterSaveState() {const form=$('#vdMaterialFilter'),state=$('#vdMaterialFilterSaveState');if(form&&state)state.textContent=materialFilterSaveLabel(Object.fromEntries(new FormData(form)));}
    const sameAdFilters=(a,b)=>JSON.stringify(M.normalizeAdvertisingFilters(a))===JSON.stringify(M.normalizeAdvertisingFilters(b));
    function adFilterSaveLabel(value=adFilters) {return adFilterProblem||(!savedAdFilters?'可保存为下次默认筛选':sameAdFilters(value,savedAdFilters)?'已保存为此账号的默认筛选':'条件已变更，尚未保存');}
    function applyAdFilters(save=false) {
      const form=$('#vdAdvertisingFilter');if(!form.reportValidity())return;
      try {
        const next=M.validateAdvertisingFilters(Object.fromEntries(new FormData(form)));
        if(save){if(!adPreferenceKey)throw new Error('缺少登录人员标识，暂时无法保存筛选。');localStorage.setItem(adPreferenceKey,M.encodeAdvertisingFilterPreference(api.currentUser.id,next));savedAdFilters={...next};adFilterProblem='';}
        adFilters=next;adPage=1;render();if(save)api.toast('已保存广告筛选，下次进入将自动应用');
      }catch(error){api.toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，广告筛选未保存。':error.message||'广告筛选保存失败，请稍后重试','warning');}
    }
    function updateAdFilterSaveState() {const form=$('#vdAdvertisingFilter'),state=$('#vdAdFilterSaveState');if(form&&state)state.textContent=adFilterSaveLabel(Object.fromEntries(new FormData(form)));}
    const sameFilters=(a,b)=>JSON.stringify(M.normalizeDemandFilters(a))===JSON.stringify(M.normalizeDemandFilters(b));
    function filterSaveLabel(value=filters) {return filterProblem||(!savedFilters?'可保存为下次默认筛选':sameFilters(value,savedFilters)?'已保存为此账号的默认筛选':'条件已变更，尚未保存');}
    function applyFilters(save=false) {
      const form=$('#vdFilterForm');if(!form.reportValidity())return;
      try {
        const next=M.validateDemandFilters(Object.fromEntries(new FormData(form)));
        if(save){if(!preferenceKey)throw new Error('缺少登录人员标识，暂时无法保存筛选。');localStorage.setItem(preferenceKey,M.encodeFilterPreference(api.currentUser.id,next));savedFilters={...next};filterProblem='';}
        filters=next;page=1;grid?.clearSelection();render();if(save)api.toast('已保存筛选，下次进入将自动应用');
      }catch(error){api.toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，筛选未保存。':error.message||'筛选保存失败，请稍后重试','warning');}
    }
    function rangeText(start,end) {return start||end?(start||'不限')+' 至 '+(end||'不限'):'请选择日期区间';}
    function rangeMarkup(prefix,name,values=filters) {
      const start=values[prefix+'Start'],end=values[prefix+'End'];
      return '<div class="vd-filter-field"><span>'+name+'</span><details class="vd-date-range" data-range="'+prefix+'"><summary aria-label="'+name+'区间"><span class="vd-range-value '+(!start&&!end?'is-empty':'')+'">'+h(rangeText(start,end))+'</span><span aria-hidden="true">▦</span></summary><div class="vd-range-popover"><div class="vd-range-dates"><label>开始日期<input type="date" name="'+prefix+'Start" value="'+h(start)+'" aria-label="'+name+'开始日期"></label><span>至</span><label>结束日期<input type="date" name="'+prefix+'End" value="'+h(end)+'" aria-label="'+name+'结束日期"></label></div><div class="vd-range-actions"><button type="button" class="text-button" data-vd-range-clear="'+prefix+'">清空</button><button type="button" class="button secondary" data-vd-range-close="'+prefix+'">完成选择</button></div></div></details></div>';
    }
    function seed() {
      const demands=api.seedDemands.map((v,i)=>({...M.clone(v),id:'VD-DEMO-'+String(i+1).padStart(3,'0'),demandType:i===4?'ad-team':'visual-team',status:M.canonicalProgressStatus(v.status,v.owner),executionMethod:i===2?'混合制作':'人工制作',historical:false,linkedTaskIds:[],source:{system:'DEMO'},logs:[{id:M.uid('LOG'),at:v.createdAt,actor:'管理员',action:'创建演示记录',detail:'用于演示一期需求、交付素材及广告命名流程'}]}));
      const materials=[{id:'MAT-DEMO-001',demandId:demands[0]?.id,name:'Modal 四大卖点 · EDM 主图',originalCode:'EDM-MODAL-01',type:'图片',url:'',deliveredBy:'THD',deliveredAt:'2026-09-02',sourceType:'人工制作',remark:'演示记录，文件地址待补充',source:{system:'DEMO'},createdAt:'2026-09-02 18:20:00'}].filter(v=>v.demandId);
      const namings=materials.length?[{id:'ADN-DEMO-001',materialId:materials[0].id,adName:'DEMO_Modal_Benefits_US_01',platform:'Meta',adAccountId:'',adId:'',createdBy:'张三',createdAt:'2026-09-03 10:00:00',source:{system:'DEMO'},remark:'示意名称，未套用飞书命名公式'}]:[];
      return {version:1,demands,materials,namings,batches:[]};
    }
    function ensureStatusExamples(store){
      let changed=false;const G=window.VisualDemandGridModel,visible=()=>store.demands.filter(d=>G.canViewDemand(d,api.currentUser)),date=M.now().slice(0,10);
      for(const state of ['草稿','待分配','待制作','制作中','已完成','项目暂停']){
        if(visible().some(d=>state==='草稿'?d.submissionState==='draft':d.submissionState!=='draft'&&d.status===state))continue;
        const index=['草稿','待分配','待制作','制作中','已完成','项目暂停'].indexOf(state),id='VD-DEMO-V23-'+String(index).padStart(2,'0');if(store.demands.some(d=>d.id===id))continue;
        const type=['待制作','项目暂停'].includes(state)?'ad-team':'visual-team',base=M.clone(api.seedDemands[0]||{}),draft=G.emptyDraft(type,api.currentUser);
        const d={...base,...draft,id,title:'示例 · '+state+'需求',submissionState:state==='草稿'?'draft':'submitted',status:state==='草稿'?'':state,owner:state==='待分配'||state==='草稿'?'':['待制作','制作中'].includes(state)?'POST-EXAMPLE-'+index:'THD',expression:state==='待制作'?'IG-UGC':state==='制作中'?'TTS-UGC':'Campaign',requestDate:date,ddl:date,requester:api.currentUser.name,source:{system:'DEMO',exampleRule:'visual-states-v23'},linkedTaskIds:[],logs:[]};
        if(state==='已完成'){const materialId='MAT-DEMO-V23-COMPLETED',url='https://example.com/materials/visual-demand-v23';Object.assign(d,{completionDate:date,version:'V1',executionOwner:d.owner,executionUrl:url,executionUpdatedAt:M.now(),executionMaterialId:materialId,productionDays:0});store.materials.push({id:materialId,demandId:id,name:d.title,type:'图片',url,deliveredBy:d.owner,deliveredAt:date,version:'V1',productionDays:0,source:{system:'DEMO'},createdAt:M.now()});}
        M.appendLog(d,'创建演示记录','补充'+state+'状态展示；既有需求保留',api.currentUser.name);store.demands.push(d);changed=true;
      }return changed;
    }
    let store;
    try {
      const saved=localStorage.getItem(KEY);
      store=saved?JSON.parse(saved):seed();
      if(!store||store.version!==1||!['demands','materials','namings','batches'].every(k=>Array.isArray(store[k])))throw new Error('记录格式异常');
      if(!saved)localStorage.setItem(KEY,JSON.stringify(store));
    } catch(error) {storageProblem='本地记录暂时无法读取或保存，请保留当前浏览器数据并稍后重试。';store={version:1,demands:[],materials:[],namings:[],batches:[]};}
    try{const progressChanged=M.normalizeProgressStore(store),adsChanged=M.normalizeAdvertisingRelations(store),draftsChanged=window.VisualDemandGridModel.normalizeDraftOwnership(store,api.users),samplesChanged=ensureStatusExamples(store);if((progressChanged||adsChanged||draftsChanged||samplesChanged)&&!storageProblem)localStorage.setItem(KEY,JSON.stringify(store));}catch(error){storageProblem='记录更新暂时无法保存，请保留浏览器数据后重试。';}
    store.demands.forEach(d=>{if(!d.demandType&&d.source?.system==='DEMO')d.demandType=d.id==='VD-DEMO-005'?'ad-team':'visual-team';});
    function commit(action) {
      if(storageProblem){api.toast(storageProblem,'warning');return false;}
      const previous=M.clone(store);
      try {action();localStorage.setItem(KEY,JSON.stringify(store));return true;}
      catch(error){store=previous;api.toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，请先导出记录后重试。':error.message||'保存失败，请稍后重试','warning');return false;}
    }
    const visibleDemands=()=>store.demands.filter(d=>window.VisualDemandGridModel.canViewDemand(d,api.currentUser));
    const demand=id=>visibleDemands().find(v=>v.id===id);
    const materialsFor=id=>store.materials.filter(v=>v.demandId===id&&!v.deletedAt);
    const deletedDelivery=d=>!materialsFor(d.id).length&&store.materials.some(m=>m.demandId===d.id&&m.deletedAt);
    const incomplete=d=>['已交付','已关闭','已完成'].includes(d.status)&&Boolean(M.completionIssue(store,d));
    const completionWarning=d=>deletedDelivery(d)?'素材已删除':!d.demandType?'需求类型待补充':'素材地址待补充';
    function filtered() {
      return visibleDemands().filter(d=>M.demandMatchesFilters(d,filters)).sort((a,b)=>(b.requestDate||'').localeCompare(a.requestDate||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
    }

    function download(name,headers,rows) {
      const blob=new Blob([M.toCsv(headers,rows)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    function demandCycleText(d) {const days=M.demandDeliverySummary(store,d.id)?.productionDays;return typeof days==='number'&&days>=0?days+' 天':'—';}
    function exportDemands() {
      download('视觉需求_'+M.now().slice(0,10)+'.csv',['平台需求ID','需求名称','需求类型','SPU','业务渠道','优先级','需求对接人','制作人','下需时间','DDL','制作周期','进度状态'],filtered().map(d=>[d.id,d.title,typeLabel(d.demandType),d.spu,label('businessChannel',d.businessChannel),d.priority,d.requester,d.owner,d.requestDate,d.ddl,demandCycleText(d),d.status]));
      api.toast('已导出当前筛选范围内的需求记录');
    }
    function demandListMarkup(list,count,pages) {
      return '<form id="vdFilterForm" class="vd-filters vd-demand-filters">'+[['demandId','需求ID','输入需求ID'],['title','需求名称','输入需求名称'],['spu','SPU','输入SPU']].map(([key,name,placeholder])=>'<label>'+name+'<input name="'+key+'" placeholder="'+placeholder+'" maxlength="200" value="'+h(filters[key])+'"></label>').join('')+'<label>需求类型<select name="demandType">'+options(M.demandTypes,filters.demandType)+'</select></label><label>进度状态<select name="status">'+options(M.statuses,filters.status)+'</select></label><label class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>行状态<select name="submissionState">'+options([{value:'draft',label:'草稿'},{value:'submitted',label:'已提交'}],filters.submissionState)+'</select></label><label class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>优先级<select name="priority">'+options(['P0','P1','P2'],filters.priority)+'</select></label>'+'<div class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>'+rangeMarkup('request','下需日期')+'</div><div class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>'+rangeMarkup('ddl','DDL')+'</div>'+'<label class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>制作人<select name="owner">'+options([...new Set([...api.users.map(u=>u.name),...visibleDemands().map(d=>d.owner).filter(Boolean)])],filters.owner)+'</select></label><label class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>需求对接人<select name="requester">'+options([...new Set([...api.users.map(u=>u.name),...visibleDemands().map(d=>d.requester).filter(Boolean)])],filters.requester)+'</select></label>'+[['productLevel','产品级别'],['channelCategory','渠道归类'],['demandSource','需求来源']].map(([key,name])=>'<label class="vd-filter-advanced" '+(filtersExpanded?'':'hidden')+'>'+name+'<select name="'+key+'">'+options([...new Set(visibleDemands().map(d=>d[key]).filter(Boolean))].map(v=>({value:v,label:label(key,v)})),filters[key])+'</select></label>').join('')+'<div class="vd-demand-filter-footer"><span id="vdFilterSaveState" class="vd-filter-save-state">'+h(filterSaveLabel())+'</span><div class="vd-filter-actions"><button class="button primary" type="submit">搜索</button><button class="button secondary" type="button" data-vd-action="reset">重置</button><button class="button secondary" type="button" data-vd-action="save-filters" '+(!preferenceKey?'disabled':'')+'>保存筛选</button><button class="text-button" type="button" data-vd-action="toggle-filters" aria-expanded="'+filtersExpanded+'">'+(filtersExpanded?'收起 ⌃':'展开 ⌄')+'</button></div></div></form>'+
        grid.markup();
    }

    function materialFiltered() {
      return M.materialRows(store).filter(({material:m,demand:d})=>M.materialMatchesFilters(m,d,materialFilters,materialName(m,d))).sort((a,b)=>(b.material.createdAt||b.material.deliveredAt||'').localeCompare(a.material.createdAt||a.material.deliveredAt||'')||a.material.id.localeCompare(b.material.id));
    }
    function materialMarkup() {
      const rows=materialFiltered(),pages=Math.max(1,Math.ceil(rows.length/10));materialPage=Math.min(materialPage,pages);
      const producers=[...new Set([...api.users.map(u=>u.name),...M.materialRows(store).map(({material:m,demand:d})=>m.deliveredBy||d.executionOwner||d.owner).filter(Boolean)])];
      const visible=rows.slice((materialPage-1)*10,materialPage*10),valid=new Set(rows.map(r=>r.material.id));
      [...materialSelection].forEach(id=>{if(!valid.has(id))materialSelection.delete(id);});
      const selected=rows.filter(r=>materialSelection.has(r.material.id)),blocked=selected.some(r=>r.namingCount>0);
      return '<form id="vdMaterialFilter" class="vd-filters vd-material-filters">'+[['materialId','素材ID','输入素材ID'],['name','素材名称','输入素材名称'],['sourceDemand','来源需求','输入需求ID或名称']].map(([key,name,placeholder])=>'<label>'+name+'<input name="'+key+'" value="'+h(materialFilters[key])+'" maxlength="200" placeholder="'+placeholder+'"></label>').join('')+'<label>需求类型<select name="demandType">'+options(M.demandTypes,materialFilters.demandType)+'</select></label><label>SPU<input name="spu" value="'+h(materialFilters.spu)+'" maxlength="200" placeholder="输入SPU"></label><label>制作人<select name="producer">'+options(producers,materialFilters.producer)+'</select></label>'+rangeMarkup('completion','完成日期',materialFilters)+'<div class="vd-material-filter-footer"><span id="vdMaterialFilterSaveState" class="vd-filter-save-state">'+h(materialFilterSaveLabel())+'</span><div class="vd-filter-actions"><button class="button primary" type="submit">搜索</button><button class="button secondary" type="button" data-vd-action="reset-materials">重置</button><button class="button secondary" type="button" data-vd-action="save-material-filters" '+(!materialPreferenceKey?'disabled':'')+'>保存筛选</button></div></div></form><p class="vd-material-note">已完成状态的需求，对应的素材信息会在此处显示（即只有已完成状态的需求产生的素材才能创建广告命名）</p><div class="vd-record-toolbar"><button class="button secondary" data-vd-action="export">导出</button><div class="vd-material-bulk" '+(selected.length?'':'hidden')+'><span>已选择 '+selected.length+' 条</span><button class="button primary" data-vd-action="batch-naming" '+(!can('demand:naming:manage')?'disabled':'')+'>批量创建广告命名</button><span class="vd-disabled-tip" title="'+h(blocked?materialDeleteHint:!can('demand:delivery:manage')?'当前账号没有删除权限':'')+'"><button class="button secondary vd-delete-material" data-vd-action="batch-delete-materials" '+(blocked||!can('demand:delivery:manage')?'disabled':'')+'>批量删除</button></span><button class="text-button" data-vd-action="clear-materials">取消选择</button></div></div><div class="vd-table-scroll" data-runtime-copy><table class="vd-table vd-material-table vd-material-table-v24"><colgroup><col style="width:42px"><col style="width:220px"><col style="width:125px"><col style="width:100px"><col style="width:115px"><col style="width:170px"><col style="width:100px"><col style="width:140px"></colgroup><thead><tr><th><input type="checkbox" id="vdMaterialSelectAll" aria-label="全选当前页素材" '+(visible.length&&visible.every(r=>materialSelection.has(r.material.id))?'checked':'')+'></th><th>素材</th><th>需求类型</th><th>制作人</th><th>完成日期</th><th>素材URL</th><th>广告命名数</th><th>操作</th></tr></thead><tbody>'+visible.map(({material:m,demand:d,namingCount})=>'<tr class="'+(materialSelection.has(m.id)?'is-selected':'')+'"><td><input type="checkbox" data-vd-material-check="'+h(m.id)+'" aria-label="选择素材 '+h(m.id)+'" '+(materialSelection.has(m.id)?'checked':'')+'></td><td><b class="vd-truncated-name" title="'+h(materialName(m,d))+'">'+h(materialName(m,d))+'</b><small>素材ID：'+h(m.id)+'</small></td><td><span class="vd-demand-type">'+h(typeLabel(d.demandType))+'</span></td><td>'+h(m.deliveredBy||d.executionOwner||d.owner||'')+'</td><td>'+h(m.deliveredAt||d.completionDate||'')+'</td><td>'+materialTableAddressMarkup(m.url)+'</td><td>'+namingCount+'</td><td><div class="vd-row-actions"><button class="table-link" data-vd-material-detail="'+h(m.id)+'">详情</button><button class="table-link" data-vd-material-edit="'+h(m.id)+'" '+(!can('demand:delivery:manage')?'disabled':'')+'>编辑URL</button></div></td></tr>').join('')+(rows.length?'':'<tr><td colspan="8"><div class="vd-empty">暂无符合条件的素材。视觉需求完成后，交付素材将自动显示在此处。</div></td></tr>')+'</tbody></table></div><div class="vd-pagination" data-runtime-copy><span>共 '+rows.length+' 条，每页 10 条</span><button class="button" data-vd-material-page="'+(materialPage-1)+'" '+(materialPage===1?'disabled':'')+'>上一页</button><span>'+materialPage+' / '+pages+'</span><button class="button" data-vd-material-page="'+(materialPage+1)+'" '+(materialPage===pages?'disabled':'')+'>下一页</button></div>';
    }
    function exportMaterials() {
      download('素材记录_'+M.now().slice(0,10)+'.csv',['素材ID','素材名称','需求类型','制作人','完成日期','素材URL','广告命名数'],materialFiltered().map(({material:m,demand:d,namingCount})=>[m.id,materialName(m,d),typeLabel(d.demandType),m.deliveredBy||d.executionOwner||d.owner||'',m.deliveredAt||d.completionDate||'',m.url||'',namingCount]));
      api.toast('已导出当前筛选范围内的素材记录');
    }
    const advertisingPlatform=value=>({'Meta':'Facebook','Google Ads':'Google'})[value]||value;
    const advertisingPromoter=n=>n.promoter??n.createdBy??'';
    const adDimensionValue=(field,value)=>api.adOptionValue(field,value)||value||'';
    function adContext(n,m) {const context=M.advertisingRecordContext(store,n,m);return {...context,adPage:adDimensionValue('adPage',context.adPage),materialSource:adDimensionValue('adMaterialSource',context.materialSource)};}
    function adDimensionOptions(field,key,all) {
      const values=api.adOptions(field).map(o=>({...o}));
      [...all.map(({naming:n,material:m})=>adContext(n,m)[key]),adFilters[key]].filter(Boolean).forEach(value=>{if(!values.some(o=>o.value===value))values.push({value,label:label(field,value)});});
      return values;
    }
    function advertisingFiltered() {
      return M.advertisingRows(store).filter(({naming:n,material:m})=>M.advertisingMatchesFilters(adContext(n,m),adFilters)).sort((a,b)=>(b.naming.createdAt||'').localeCompare(a.naming.createdAt||'')||a.naming.id.localeCompare(b.naming.id));
    }
    function advertisingMarkup() {
      const rows=advertisingFiltered(),pages=Math.max(1,Math.ceil(rows.length/10));adPage=Math.min(adPage,pages);
      const all=M.advertisingRows(store),promoters=[...new Set([...api.users.map(u=>u.name),...all.map(r=>advertisingPromoter(r.naming)),adFilters.promoter].filter(Boolean))];
      const platforms=[...new Set([...M.advertisingPlatforms,...all.map(r=>advertisingPlatform(r.naming.platform)),adFilters.platform].filter(Boolean))];
      const unlinked=store.namings.filter(n=>!n.deletedAt&&!store.materials.some(m=>m.id===n.materialId&&!m.deletedAt));
      return '<form id="vdAdvertisingFilter" class="vd-filters vd-ad-filters">'+[['adName','广告名称','输入广告名称'],['materialId','素材ID','输入素材ID']].map(([key,name,placeholder])=>'<label>'+name+'<input name="'+key+'" value="'+h(adFilters[key])+'" maxlength="200" placeholder="'+placeholder+'"></label>').join('')+'<label>投放平台<select name="platform">'+options(platforms,adFilters.platform)+'</select></label><label>SPU<input name="spu" value="'+h(adFilters.spu)+'" maxlength="200" placeholder="输入SPU"></label><label>投放主页<select name="adPage">'+options(adDimensionOptions('adPage','adPage',all),adFilters.adPage)+'</select></label><label>素材来源<select name="materialSource">'+options(adDimensionOptions('adMaterialSource','materialSource',all),adFilters.materialSource)+'</select></label><label>推广人<select name="promoter">'+options(promoters,adFilters.promoter)+'</select></label>'+rangeMarkup('completion','素材完成日期',adFilters)+'<div class="vd-ad-filter-footer"><span id="vdAdFilterSaveState" class="vd-filter-save-state">'+h(adFilterSaveLabel())+'</span><div class="vd-filter-actions"><button class="button primary" type="submit">搜索</button><button class="button secondary" type="button" data-vd-action="reset-ads">重置</button><button class="button secondary" type="button" data-vd-action="save-ad-filters" '+(!adPreferenceKey?'disabled':'')+'>保存筛选</button></div></div></form><div class="vd-record-toolbar"><button class="button secondary" data-vd-action="export">导出</button></div><div class="vd-ad-description"><span>广告命名关联素材，按素材完成日期筛选和展示。</span><b data-runtime-copy>共 '+rows.length+' 条广告命名</b></div><div class="vd-table-scroll" data-runtime-copy><table class="vd-table vd-ad-table vd-ad-table-v24"><colgroup>'+[300,120,100,130,130,220,170,100,120,150,140,150].map(width=>'<col style="width:'+width+'px">').join('')+'</colgroup><thead><tr>'+['广告名称','SPU','投放平台','投放主页','素材来源','素材','素材URL','推广人','素材完成日期','广告账户','广告ID','操作'].map(title=>'<th>'+title+'</th>').join('')+'</tr></thead><tbody>'+rows.slice((adPage-1)*10,adPage*10).map(({naming:n,demand:d,material:m})=>{const context=adContext(n,m);return '<tr><td><b>'+h(n.adName||'待补充命名信息')+'</b><small>'+h(n.id)+'</small></td><td>'+h(context.spu)+'</td><td>'+h(context.platform)+'</td><td>'+h(label('adPage',context.adPage))+'</td><td>'+h(label('adMaterialSource',context.materialSource))+'</td><td><button class="table-link vd-ad-material-name vd-truncated-name" title="'+h(materialName(m,d))+'" data-vd-ad-material-view="'+h(m.id)+'">'+h(materialName(m,d))+'</button><small>素材ID：'+h(m.id)+'</small></td><td>'+materialTableAddressMarkup(m.url)+'</td><td>'+h(context.promoter)+'</td><td>'+h(context.completionDate)+'</td><td>'+h(accountName(n))+'</td><td>'+h(n.adId||'')+'</td><td><div class="vd-row-actions"><button class="table-link" data-vd-ad-copy="'+h(n.id)+'" '+(!n.adName?'disabled':'')+'>复制</button><button class="table-link" data-vd-ad-edit="'+h(n.id)+'" '+(!can('demand:naming:manage')?'disabled':'')+'>编辑</button><button class="table-link vd-delete-ad" data-vd-ad-delete="'+h(n.id)+'" '+(!can('demand:naming:manage')?'disabled':'')+'>删除</button></div></td></tr>';}).join('')+(rows.length?'':'<tr><td colspan="12"><div class="vd-empty">暂无符合条件的广告命名。可在「素材」页签勾选素材，批量创建广告命名。</div></td></tr>')+'</tbody></table></div><div class="vd-pagination" data-runtime-copy><span>共 '+rows.length+' 条，每页 10 条</span><button class="button" data-vd-ad-page="'+(adPage-1)+'" '+(adPage===1?'disabled':'')+'>上一页</button><span>'+adPage+' / '+pages+'</span><button class="button" data-vd-ad-page="'+(adPage+1)+'" '+(adPage===pages?'disabled':'')+'>下一页</button></div>'+(unlinked.length?'<details class="vd-unlinked-ads"><summary>'+unlinked.length+' 条历史广告待关联素材</summary><p>历史记录已保留；继续使用前请由研发核对素材ID，也可删除无效广告。</p><ul>'+unlinked.map(n=>'<li>'+h(n.adName||'未命名')+' · '+h(n.id)+' · '+h(advertisingPlatform(n.platform)||'未填写')+' <button class="table-link vd-delete-ad" data-vd-ad-delete="'+h(n.id)+'" '+(!can('demand:naming:manage')?'disabled':'')+'>删除</button></li>').join('')+'</ul></details>':'');
    }
    function exportAdvertising() {
      download('广告命名_'+M.now().slice(0,10)+'.csv',['广告命名ID','广告名称','SPU','投放平台','投放主页','素材来源','素材ID','素材名称','素材URL','推广人','素材完成日期','广告账户','广告ID'],advertisingFiltered().map(({naming:n,material:m,demand:d})=>{const c=adContext(n,m);return [n.id,n.adName||'',c.spu,c.platform,label('adPage',c.adPage),label('adMaterialSource',c.materialSource),m.id,materialName(m,d),m.url||'',c.promoter,c.completionDate,accountName(n),n.adId||''];}));
      api.toast('已导出当前筛选范围内的广告命名');
    }
    function render() {
      if(!can('demand:view')){root.innerHTML='<div class="vd-empty">当前账号没有查看视觉需求的权限。</div>';return;}
      const list=filtered(),count=list.length,pages=Math.max(1,Math.ceil(count/10));page=Math.min(page,pages);
      root.innerHTML='<header class="page-head vd-page-head"><div><div class="title-row"><h1>视觉需求</h1><span class="vd-phase-label">一期 · 业务记录</span></div><p>按制作分工管理视觉需求，每个需求记录一份素材信息。</p></div><div class="vd-page-actions"><button class="button secondary" data-vd-action="config" '+(!can('demand:config:manage')?'disabled':'')+'>配置维度选项值</button></div></header>'+(storageProblem?'<div class="vd-alert">'+h(storageProblem)+'</div>':'')+'<section class="panel vd-list-panel" data-spec-id="demand-records-list" data-spec-label="需求、素材及广告命名"><div class="vd-main-tabs"><button data-vd-action="list" class="'+(pageTab==='list'?'active':'')+'">视觉需求</button><button data-vd-action="materials" class="'+(pageTab==='materials'?'active':'')+'">素材</button><button data-vd-action="ads" class="'+(pageTab==='ads'?'active':'')+'">广告命名</button><span>需求 → 素材 → 广告命名</span></div>'+(pageTab==='ads'?advertisingMarkup():pageTab==='materials'?materialMarkup():demandListMarkup(list,count,pages))+'</section>';
    }
    function businessDemandForm(item) {
      const markup=api.formMarkup(item,{allowUnassignedOwner:true});
      const anchor='<label class="field"><span class="field-label">需求SPU';
      const typeField=item.id?'<label class="field"><span class="field-label">需求类型</span><input value="'+h(typeLabel(item.demandType))+'" readonly aria-readonly="true"><input type="hidden" name="demandType" value="'+h(item.demandType||'')+'"><small class="vd-type-help">需求创建后不可修改类型。</small></label>':'<label class="field"><span class="field-label">需求类型 <em class="required-mark">*</em></span><select name="demandType" required>'+options(M.demandTypes,item.demandType||'','请选择需求类型')+'</select><small class="vd-type-help">后续支持通过平台任务流程制作。</small></label>';
      const full=markup.replace(anchor,typeField+anchor);
      const template=document.createElement('template');template.innerHTML=full;
      if(item.demandType!=='ad-team'){
        const reference=template.content.querySelector('[name="reference"]');if(reference){const wrapper=reference.closest('.field');wrapper.classList.add('vg-legacy-reference');reference.hidden=true;wrapper.insertAdjacentHTML('beforeend',window.VisualDemandReference.control(item,true));}
        return template.innerHTML;
      }
      const form=template.content.querySelector('form');form.classList.add('vd-ad-team-demand-form');
      const sections=[...form.querySelectorAll('.demand-form-section')];
      M.adTeamDemandFormSections.forEach((section,index)=>{
        const fields=(index===0?['demandType',...section.fields]:section.fields).map(name=>form.querySelector('[name="'+name+'"]')?.closest('.field')).filter(Boolean);
        sections[index].querySelector('.demand-form-grid').replaceChildren(...fields);
        sections[index].querySelector('.demand-form-section-title b').textContent=section.title;
      });
      // These dimensions are selected directly when the business-channel input is absent.
      ['channelCategory','materialType','expression'].forEach(field=>{
        const select=form.elements[field],selected=api.optionCode(field,item[field]||select.value||'');
        select.innerHTML=options(api.adOptions(field),selected,'请选择');
      });
      return template.innerHTML;
    }
    function bindBusinessDemandForm(existing,draft) {
      api.bindForm(existing);
      const form=$('#visualDemandForm');
      const applyOwnerMode=(initial=false)=>{const expression=form.elements.expression?.value||'',post=M.usesPostNumber(expression),field=form.elements.owner?.closest('.field');if(!field)return;
        const old=field.dataset.ownerMode,mode=post?'post':'person';if(old===mode)return;field.dataset.ownerMode=mode;
        if(post||old){const value=initial?form.elements.owner.value:'';field.innerHTML='<span class="field-label">制作人</span>'+ownerControl({expression},value,false);}
        bindPostWarning(form,{...existing,...draft,expression,id:existing?.id});
      };applyOwnerMode(true);form.addEventListener('change',event=>{if(event.target.name==='expression')applyOwnerMode();});
      bindReference();
      function bindReference(){const button=form.querySelector('[data-reference-open]');if(button)button.onclick=event=>{event.preventDefault();window.VisualDemandReference.open({record:{...existing,...draft,reference:form.querySelector('[name="reference"]').value},onSave:value=>{draft.reference=value.text;draft.referenceItems=value.items;form.querySelector('[name="reference"]').value=value.text;form.querySelector('.vg-reference-control').outerHTML=window.VisualDemandReference.control(draft,true);bindReference();}});};}
      if(existing)return;
      form.addEventListener('change',event=>{
        if(event.target.name!=='demandType')return;
        Object.assign(draft,Object.fromEntries(new FormData(form)));
        $('#dialogBody').innerHTML=businessDemandForm(draft);
        bindBusinessDemandForm(null,draft);
      });
    }
    function assignProducer(id) {
      if(!guard('demand:manage'))return;
      const d=demand(id);if(!d)return;
      if(d.status!=='待分配'){api.toast('需求已不处于待分配状态，请刷新列表','warning');return;}
      api.openDialog('分配制作人',d.title+' · '+id,'<form id="vdAssignProducerForm" class="dialog-wide-content vd-form-grid"><label class="vd-form-full"><span>制作人 <em class="required-mark">*</em></span>'+ownerControl(d,'',true)+'<small class="vd-type-help">分配成功后，需求进度状态更新为「待制作」。</small></label></form>','确认分配',()=>{
        const form=$('#vdAssignProducerForm');if(!form.reportValidity())return;
        if(!commit(()=>M.assignDemandProducer(store,id,form.elements.owner.value,actor,api.users.map(u=>u.name))))return;
        api.closeDialog();render();const warning=M.postNumberWarning(store,d);api.toast('制作人已分配，需求已转为待制作'+(warning?'；'+warning:''),warning?'warning':'success');
      });bindPostWarning($('#vdAssignProducerForm'),d);
    }
    const canExecute=d=>d.submissionState!=='draft'&&M.canModifyDemand(d)&&can('demand:manage')&&can('demand:delivery:manage');
    function executeDemand(id) {
      const d=demand(id);if(!d)return;
      if(d.submissionState==='draft'){api.toast('请先提交需求，再执行制作','warning');return;}
      try{M.assertDemandMutable(d);}catch(error){api.toast(error.message,'warning');return;}
      if(d.status==='待分配'){assignProducer(id);return;}
      if(!guard('demand:manage')||!guard('demand:delivery:manage'))return;
      if(!M.demandTypes.some(type=>type.value===d.demandType)){api.toast('该需求缺少需求类型，请联系管理员补齐','warning');return;}
      const defaults=M.visualExecutionDefaults(d,actor),mats=materialsFor(id),selected=mats.length===1?mats[0]:mats.find(m=>m.id===d.executionMaterialId),days=M.productionDays(d.requestDate,defaults.completionDate);
      const generated=(date,producer)=>M.generateMaterialAddress({completionDate:date,producer,businessChannel:label('businessChannel',d.businessChannel),channelCategory:label('channelCategory',d.channelCategory),spu:d.spu||''});
      const initialAuto=generated(defaults.completionDate,defaults.owner),savedAddress=(d.executionUpdatedAt||d.materialUrlUpdatedAt)?(d.executionUrl??selected?.url??''):'';
      let manualAddress=d.executionUrlMode==='manual'||Boolean(savedAddress)&&(!d.executionUrlMode&&savedAddress!==initialAuto);
      const address=manualAddress?savedAddress:initialAuto;
      api.openDialog('执行需求',d.title+' · '+id,'<form id="vdVisualExecutionForm" class="dialog-wide-content vd-form-grid vd-visual-execution"><section class="vd-execution-priority vd-form-full"><p>请先确认进度状态与完成日期</p><div class="vd-execution-priority-fields"><label><span>进度状态 <em class="required-mark">*</em></span><select name="status" required autofocus>'+options(M.statuses,defaults.status,null)+'</select></label><label><span>完成日期 <em class="required-mark">*</em></span><input type="date" name="completionDate" required value="'+h(defaults.completionDate)+'"></label></div></section><label><span>制作人 <em class="required-mark">*</em></span>'+ownerControl(d,defaults.owner,true)+'</label><label><span>版本 <em class="required-mark">*</em></span><input name="version" required maxlength="200" value="'+h(defaults.version)+'" placeholder="例如：V1"></label><label class="vd-form-full">制作周期 <div class="vd-cycle-control"><input name="productionDays" readonly aria-readonly="true" value="'+h(days===null?'待补充下需日期':days<0?'完成日期早于下需日期':days)+'"><span>天</span></div><small class="vd-type-help">下需日期：'+h(M.dateValue(d.requestDate)||'待补充')+'；按完成日期与下需日期的自然日差自动计算，同日为0天。</small></label>'+(mats.length>1?'<label class="vd-form-full">本次更新的素材记录 <select name="materialId" required>'+options(mats.map(m=>({value:m.id,label:m.name+' · '+m.id})),selected?.id||'','请选择历史素材记录')+'</select><small class="vd-warning">该需求有多份历史素材，选择本次要更新的记录；其余记录保留。</small></label>':'<input type="hidden" name="materialId" value="'+h(selected?.id||'')+'">')+namingField(d,defaults,'vdExecutionMaterialName')+'<div class="vd-form-full vd-address-field"><label for="vdExecutionAddress">素材URL '+(d.demandType==='ad-team'?'（选填）':'<em class="required-mark">*</em>')+'</label><input id="vdExecutionAddress" name="url" type="text" '+(d.demandType==='ad-team'?'':'required')+' maxlength="2048" value="'+h(address)+'" placeholder="支持局域网共享路径或 HTTP/HTTPS 链接"><div class="vd-address-actions"><small class="vd-type-help" id="vdExecutionAddressMode">'+(manualAddress?'已手动修改；变更制作人或日期时保留当前地址。':'已按规则生成，可手动修改。')+'</small><button type="button" class="text-button" data-vd-regenerate-address>按规则重新生成</button></div></div></form>','保存执行信息',()=>{
        const form=$('#vdVisualExecutionForm');if(!form.reportValidity())return;
        const input=Object.fromEntries(new FormData(form));input.urlMode=manualAddress?'manual':'auto';
        if(!commit(()=>M.saveDemandExecution(store,id,input,actor,api.users.map(u=>u.name),namingState)))return;
        api.closeDialog();render();const warning=M.postNumberWarning(store,d);api.toast('执行信息已保存'+(warning?'；'+warning:''),warning?'warning':'success');
      });
      bindPostWarning($('#vdVisualExecutionForm'),d);
      const update=()=>{const form=$('#vdVisualExecutionForm');if(!form)return;const days=M.productionDays(d.requestDate,form.elements.completionDate.value);form.elements.productionDays.value=days===null?'待补充日期':days<0?'完成日期早于下需日期':String(days);updateNamingField(d,form,'vdExecutionMaterialName');if(!manualAddress)form.elements.url.value=generated(form.elements.completionDate.value,form.elements.owner.value);$('#vdExecutionAddressMode').textContent=manualAddress?'已手动修改；变更制作人或日期时保留当前地址。':'已按规则生成，可手动修改。';};
      $('#dialogBody').oninput=event=>{if(event.target.name==='url'){manualAddress=true;update();}else if(['completionDate','owner','version'].includes(event.target.name))update();};
      $('#dialogBody').onchange=event=>{if(['completionDate','owner','version'].includes(event.target.name))update();};
      $('#dialogBody').onclick=event=>{if(event.target.closest('[data-vd-regenerate-address]')){manualAddress=false;update();}};
      $('#vdVisualExecutionForm select[name="status"]').focus();
    }
    function confirmDeleteDemand(id) {
      if(!guard('demand:manage'))return;const d=demand(id);if(!d)return;
      if(!M.canDeleteDemand(d)){api.toast('仅待分配、待制作、项目暂停的需求支持删除','warning');return;}
      api.openDialog('删除视觉需求',d.id,'<div class="vd-delete-confirm"><p>确认删除该视觉需求？</p><dl><dt>需求名称</dt><dd>'+h(d.title)+'</dd><dt>需求ID</dt><dd>'+h(d.id)+'</dd><dt>进度状态</dt><dd>'+h(d.status)+'</dd></dl><small>删除后，该需求将从视觉需求列表移除。</small></div>','确认删除',()=>{
        if(!commit(()=>M.deleteDemand(store,id,actor)))return;
        api.closeDialog();render();api.toast('视觉需求已删除');
      });
    }
    function editDemand(id='',returnToDetail=false) {
      if(!guard('demand:manage'))return;
      const existing=id?demand(id):null;
      if(existing){try{M.assertDemandMutable(existing);}catch(error){api.toast(error.message,'warning');return;}}
      const draft={...existing};
      api.openDialog(existing?'编辑视觉需求':'新建视觉需求',existing?existing.id:'登记需求后，可直接记录人工或 AI 制作的交付素材。',businessDemandForm(existing||{}),existing?'保存修改':'保存需求',()=>{
        const raw=api.readForm(existing,{allowUnassignedOwner:true});if(!raw)return;try{M.validateProducer(raw,raw.owner,api.users.map(u=>u.name),false);}catch(error){api.toast(error.message,'warning');return;}
        if(raw.demandType!=='ad-team')raw.referenceItems=M.clone(draft.referenceItems||existing?.referenceItems||[]);
        const value=M.prepareAdTeamDemandValues(existing,raw,label('channelCategory',raw.channelCategory));
        let prepared;try{prepared=M.prepareDemandRecord(existing,value);}catch(error){api.toast(error.message,'warning');return;}
        const record={...prepared,id:existing?.id||M.uid('VD'),source:existing?.source||{system:'PLATFORM'},executionMethod:existing?.executionMethod||'人工制作',logs:existing?.logs||[]};
        if(!commit(()=>{if(existing)M.assertDemandMutable(demand(existing.id));if(record.executionUpdatedAt&&record.completionDate){const days=M.productionDays(record.requestDate,record.completionDate);if(days===null||days<0)throw new Error('下需日期须有效且不能晚于已记录的完成日期。');record.productionDays=days;}if(['已交付','已关闭','已完成'].includes(record.status))M.assertCompletion(store,record);if(existing)store.demands.splice(store.demands.findIndex(v=>v.id===existing.id),1,record);else store.demands.unshift(record);const changes=existing?Object.keys(value).filter(k=>!['updatedAt','linkedTaskIds','logs'].includes(k)&&JSON.stringify(value[k])!==JSON.stringify(existing[k])):[];M.appendLog(record,existing?'编辑需求':'创建需求',existing?'更新字段：'+(changes.join('、')||'基础信息'):'需求已登记，可分配制作并记录交付',actor);}))return;
        api.closeDialog();render();api.toast('需求已保存');if(returnToDetail)detail(record.id,'base');
      });bindBusinessDemandForm(existing,draft);
    }
    const field=(name,value,wide=false)=>'<div class="detail-field'+(wide?' detail-field-wide':'')+'"><span>'+h(name)+'</span><b>'+h(value||'—')+'</b></div>';
    function baseMarkup(d) {
      const pairs=[['需求名称',d.title],['需求类型',typeLabel(d.demandType)],['需求 ID',d.id],['需求 SPU',d.spu],['业务渠道',label('businessChannel',d.businessChannel)],['产品级别',label('productLevel',d.productLevel)],['需求来源',label('demandSource',d.demandSource)],['下需时间',d.requestDate],['DDL',d.ddl],['渠道归类',label('channelCategory',d.channelCategory)],['素材格式',label('materialType',d.materialType)],['表达方式',label('expression',d.expression)],['主卖点',label('mainSellingPoint',d.mainSellingPoint)],['辅助卖点',label('secondarySellingPoint',d.secondarySellingPoint)],['场景',label('scene',d.scene)],['模特体型',label('bodyType',d.bodyType)],['素材类型',label('materialCategory',d.materialCategory)],['需求对接人',d.requester],['制作人',d.owner],['优先级',d.priority],['创建时间',d.createdAt]];
      return '<section class="detail-section"><h3 class="detail-section-title">需求信息</h3><div class="detail-fields">'+pairs.map(([n,v])=>field(n,v)).join('')+'</div></section><section class="detail-section"><h3 class="detail-section-title">制作与投放说明</h3><div class="detail-fields">'+[['制作要求',d.requirements],['FB 信息',d.fbInfo],['EDM 信息',d.edmInfo]].map(([n,v])=>field(n,v,true)).join('')+'<div class="detail-field detail-field-wide"><span>制作参考</span>'+window.VisualDemandReference.control(d,false)+'</div>'+'</div></section>';
    }
    function deliveryMarkup(d) {
      const info=M.demandDeliverySummary(store,d.id);
      const url=info?.url||'',safe=M.safeUrl(url);
      const linked=info?store.materials.find(m=>m.id===d.executionMaterialId&&m.demandId===d.id):null;
      const deliveryName=info?(linked?materialName(linked,d):namingState(d,info).name||'待补全命名信息'):'';
      const nameField='<div class="detail-field detail-field-wide"><span>素材名称</span><b class="vd-copyable-material-name"><span>'+h(deliveryName||'—')+'</span>'+(deliveryName&&deliveryName!=='待补全命名信息'?'<button type="button" class="table-link vd-copy-material-name" data-vd-copy-material-name="'+h(deliveryName)+'" aria-label="复制素材名称">复制</button>':'')+'</b></div>';
      const urlField='<div class="detail-field detail-field-wide vd-delivery-url"><span>素材URL</span><b>'+(safe?'<a class="table-link" href="'+h(safe)+'" target="_blank" rel="noopener noreferrer">'+h(url)+' ↗</a>':materialAddressMarkup(url))+'</b></div>';
      return (!info?'<p class="vd-delivery-empty">尚未通过「执行需求」填写交付信息。</p>':'')+'<section class="detail-section vd-delivery-summary"><h3 class="detail-section-title">交付素材</h3><div class="detail-fields">'+nameField+urlField+field('版本',info?.version)+field('制作人',info?.owner)+field('完成日期',info?.completionDate)+field('制作周期',info&&info.productionDays!==null?info.productionDays+' 天':'')+'</div></section>';
    }
    function detail(id,tab='base') {
      const d=demand(id);if(!d)return;
      if(!['base','materials'].includes(tab))tab='base';
      const content=tab==='materials'?deliveryMarkup(d):baseMarkup(d);
      api.openDialog('视觉需求详情',d.id,'<div class="dialog-wide-content vd-detail"><div class="vd-detail-summary"><div><h2>'+h(d.title)+'</h2><p>'+h(d.requester||'未分配对接人')+' → '+h(d.owner||'未分配制作人')+' · DDL '+h(d.ddl||'待补充')+'</p></div><div>'+badge(d.status)+(M.canModifyDemand(d)?' <button class="button secondary" data-vd-command="edit-demand" '+(!can('demand:manage')?'disabled':'')+'>编辑需求</button>':'')+'</div></div>'+(incomplete(d)?'<div class="vd-alert">'+h(deletedDelivery(d)?'交付素材已从素材页删除；需求完成状态与原交付记录保留。':!d.demandType?'既有需求未填写需求类型，请联系管理员补齐。':'既有需求已完成，素材地址待补充；原完成记录予以保留。')+'</div>':'')+'<div class="vd-detail-tabs">'+[['base','基础信息'],['materials','交付素材']].map(([key,name])=>'<button data-vd-detail-tab="'+key+'" class="'+(key===tab?'active':'')+'">'+name+'</button>').join('')+'</div><div class="vd-detail-content" data-runtime-copy>'+content+'</div></div>','关闭',api.closeDialog);
      $('#dialogBody').onclick=event=>{
        const button=event.target.closest('button');if(!button)return;
        if(button.hasAttribute('data-reference-open'))window.VisualDemandReference.open({record:d,readonly:true});
        if(button.dataset.vdDetailTab){detail(id,button.dataset.vdDetailTab);return;}
        if(button.dataset.vdCommand==='edit-demand')editDemand(id,true);
        if(button.dataset.vdCopyMaterialName)copyMaterialName(button.dataset.vdCopyMaterialName);
        if(button.dataset.vdCopyAddress)copyMaterialAddress(button.dataset.vdCopyAddress);
      };
    }
    function editMaterial(id) {
      if(!guard('demand:delivery:manage'))return;
      const material=store.materials.find(m=>m.id===id&&!m.deletedAt),d=material?demand(material.demandId):null;
      if(!material||!d){api.toast('素材或来源需求不存在，请刷新后重试','warning');return;}
      api.openDialog('编辑素材URL',materialName(material,d)+' · '+material.id,'<form id="vdMaterialUrlForm" class="dialog-wide-content vd-form-grid"><label class="vd-form-full"><span>素材URL <em class="required-mark">*</em></span><input name="url" type="text" required maxlength="2048" value="'+h(material.url||'')+'" placeholder="支持 HTTP/HTTPS 链接或局域网共享路径"><small class="vd-type-help">保存后同步更新来源需求中的素材URL。</small>'+(materialsFor(d.id).length>1?'<small class="vd-type-help">该需求有多份历史素材；保存后，需求交付地址将指向当前这份素材，其余素材记录保留。</small>':'')+'</label></form>','保存URL',()=>{
        const form=$('#vdMaterialUrlForm');if(!form.reportValidity())return;
        if(!commit(()=>M.updateMaterialUrl(store,id,form.elements.url.value,actor)))return;
        api.closeDialog();render();api.toast('素材URL已保存，并同步至来源需求');
      });
    }
    function materialDetail(id) {
      const m=store.materials.find(m=>m.id===id&&!m.deletedAt);if(!m){api.toast('素材已删除，请刷新列表','warning');return;}
      const d=demand(m.demandId),combined={...(d||{}),...m},G=window.VisualDemandGridModel;
      let drawer=document.getElementById('vdMaterialDrawer');if(!drawer){drawer=document.createElement('dialog');drawer.id='vdMaterialDrawer';drawer.className='vg-drawer vd-material-drawer';document.body.append(drawer);}
      const valueField=(name,value,wide=false)=>'<div class="detail-field '+(wide?'detail-field-wide':'')+'"><span>'+h(name)+'</span><b>'+h(value??'')+'</b></div>';
      const section=(title,body)=>'<section class="detail-section"><h3>'+h(title)+'</h3><div class="detail-fields">'+body+'</div></section>';
      const related=M.activeMaterialAdvertisements(store,id);
      const basics=valueField('素材名称',materialName(m,d),true)+valueField('素材ID',m.id)+valueField('需求类型',d?typeLabel(d.demandType):'')+valueField('SPU',combined.spu)+valueField('素材格式',label('materialType',combined.materialType||m.type))+valueField('素材类型',label('materialCategory',combined.materialCategory))+valueField('制作人',m.deliveredBy||d?.executionOwner||d?.owner)+valueField('完成日期',m.deliveredAt||d?.completionDate)+valueField('版本',m.version||d?.version)+valueField('制作周期',m.productionDays??d?.productionDays??M.productionDays(d?.requestDate,m.deliveredAt||d?.completionDate))+valueField('广告命名数',related.length)+'<div class="detail-field detail-field-wide"><span>素材URL</span><b>'+materialAddressMarkup(m.url,'')+'</b></div>';
      const source=valueField('来源需求ID',d?.id||m.demandId)+valueField('来源需求名称',d?.title,true)+valueField('进度状态',d?.status)+G.fields.filter(f=>!['spu','materialType','materialCategory','owner','title','reference'].includes(f.key)).map(f=>valueField(f.label,f.type==='select'?label(f.key,combined[f.key]):combined[f.key],f.type==='long')).join('')+'<div class="detail-field detail-field-wide"><span>制作参考</span>'+window.VisualDemandReference.control(combined,false)+'</div>';
      drawer.innerHTML='<header class="vg-drawer-head"><div><span>素材详情 · '+h(m.id)+'</span><h2>'+h(materialName(m,d))+'</h2></div><button class="text-button" data-material-close aria-label="关闭素材详情">✕</button></header><div class="vg-drawer-content">'+section('素材信息',basics)+section('来源需求与制作内容',source)+section('广告命名',related.length?related.map(n=>valueField(n.id,n.adName||'待补充命名信息',true)).join(''):valueField('广告命名','暂无'))+section('记录信息',valueField('创建时间',m.createdAt)+valueField('更新时间',m.updatedAt)+valueField('创建人',m.createdBy))+'</div><footer class="vg-drawer-footer"><button class="button secondary" data-material-close>关闭</button></footer>';
      drawer.onclick=e=>{const close=e.target.closest('[data-material-close]');if(close)drawer.close();const copy=e.target.closest('[data-vd-copy-address]');if(copy)copyMaterialAddress(copy.dataset.vdCopyAddress);if(e.target.closest('[data-reference-open]'))window.VisualDemandReference.open({record:combined,readonly:true});};
      if(!drawer.open)drawer.showModal();
    }
    function batchNaming() {
      if(!guard('demand:naming:manage'))return;
      const selected=materialFiltered().filter(r=>materialSelection.has(r.material.id));if(!selected.length)return;
      const ids=selected.map(r=>r.material.id),defaults={platform:'Facebook',promoter:actor};
      api.openDialog('批量创建广告命名','已选择 '+ids.length+' 份素材','<form id="vdBatchNamingForm" class="dialog-wide-content vd-form-grid vd-ad-naming-form"><p class="vd-form-full vd-type-help">填写内容将应用到所有选中素材，所有信息均为选填。</p>'+namingInputs(defaults)+'<section class="vd-form-full vd-batch-naming-preview"><h3>广告命名预览</h3><div id="vdBatchNamingPreview"></div></section></form>','创建 '+ids.length+' 条广告命名',()=>{
        const form=$('#vdBatchNamingForm');if(!form.reportValidity())return;const input=Object.fromEntries(new FormData(form));
        if(!commit(()=>{store=readLatestBusiness();M.createAdvertisingNamings(store,ids,input,actor,namingConfig());}))return;
        materialSelection.clear();pageTab='ads';adPage=1;adFilters=M.normalizeAdvertisingFilters();api.closeDialog();render();api.toast('已创建 '+ids.length+' 条广告命名');
      });
      const update=()=>{const form=$('#vdBatchNamingForm');if(!form)return;const input=Object.fromEntries(new FormData(form));$('#vdBatchNamingPreview').innerHTML=selected.map(({material:m,demand:d})=>{const context=M.advertisingNamingContext(store,m.id,null,namingConfig()),state=M.advertisingNameState({...context,...input,promoterCode:input.promoter?api.producerInitials(input.promoter):''}),duplicate=state.name&&store.namings.some(n=>!n.deletedAt&&n.adName===state.name);return '<div class="vd-batch-preview-item"><b>'+h(materialName(m,d))+'</b><small>'+h(m.id)+' · SPU：'+h(context.spu)+'</small><p>'+h(state.name||'待补充命名信息')+'</p>'+(state.missing.length?'<small>补充 '+h(state.missing.join('、'))+' 后可自动生成名称，当前仍可创建。</small>':'')+(duplicate?'<small class="vd-warning">已存在相同名称，仍可保存。</small>':'')+'</div>';}).join('');};
      $('#dialogBody').oninput=update;$('#dialogBody').onchange=update;update();
    }
    function namingInputs(n={}) {
      const accountOptions=M.advertisingAccounts.slice();if(n.adAccountId&&!accountOptions.some(a=>a.value===n.adAccountId))accountOptions.push({value:n.adAccountId,label:n.adAccountName||n.adAccountId});
      return '<label class="vd-form-full">投放平台<select name="platform">'+options(M.advertisingPlatforms,n.platform,'请选择投放平台')+'</select></label><label>投放主页<select name="adPage">'+options(api.adOptions('adPage'),n.adPage,'请选择投放主页')+'</select></label><label>素材来源<select name="materialSource">'+options(api.adOptions('adMaterialSource'),n.materialSource,'请选择素材来源')+'</select></label><label>落地页<input name="landingPage" maxlength="200" value="'+h(n.landingPage||'')+'" placeholder="输入落地页"></label><label>推广人<select name="promoter">'+options(api.users.map(u=>({value:u.name,label:u.name+(u.department?' · '+u.department:'')})),n.promoter,'请选择推广人')+'</select></label><label>广告账户<select name="adAccountId">'+options(accountOptions,n.adAccountId,'请选择广告账户')+'</select></label><label>广告ID<input name="adId" maxlength="200" value="'+h(n.adId||'')+'" placeholder="选填"></label>';
    }
    function confirmDeleteMaterials() {
      if(!guard('demand:delivery:manage'))return;
      const selected=materialFiltered().filter(r=>materialSelection.has(r.material.id));if(!selected.length)return;
      if(selected.some(r=>r.namingCount>0)){api.toast(materialDeleteHint,'warning');return;}
      const ids=selected.map(r=>r.material.id);
      api.openDialog('批量删除素材','已选择 '+ids.length+' 份素材','<div class="vd-delete-confirm"><p>确认删除以下 '+ids.length+' 份素材？</p><ul>'+selected.map(({material:m,demand:d})=>'<li>'+h(materialName(m,d))+'<small> '+h(m.id)+'</small></li>').join('')+'</ul><small>来源需求及历史交付记录保留。</small></div>','确认删除',()=>{
        if(!commit(()=>{store=readLatestBusiness();M.deleteMaterials(store,ids,actor);}))return;
        materialSelection.clear();api.closeDialog();render();api.toast('已删除 '+ids.length+' 份素材');
      });
    }
    function editNaming(materialId,id='',fromMaterials=false) {
      if(!guard('demand:naming:manage'))return;
      const existing=id?store.namings.find(n=>n.id===id&&!n.deletedAt):null;
      if(id&&!existing){api.toast('广告命名不存在，请刷新后重试','warning');return;}
      const lockedMaterialId=existing?.materialId||materialId,m=store.materials.find(m=>m.id===lockedMaterialId&&!m.deletedAt),d=m?demand(m.demandId):null;
      if(!m){api.toast('请从当前素材记录创建广告命名','warning');return;}
      const n=existing||{},pages=api.adOptions('adPage'),sources=api.adOptions('adMaterialSource');
      const config=namingConfig;
      let context;try{context=M.advertisingNamingContext(store,lockedMaterialId,existing,config());}catch(error){api.toast(error.message,'warning');return;}
      const defaults={platform:advertisingPlatform(n.platform)||'Facebook',adPage:api.adOptionValue('adPage',n.adPage||''),materialSource:api.adOptionValue('adMaterialSource',n.materialSource||''),landingPage:n.landingPage||'',promoter:n.promoter??n.createdBy??actor};
      const generated=input=>M.advertisingNameState({...context,...input,promoterCode:input.promoter?api.producerInitials(input.promoter):''});
      const initial=generated(defaults);
      api.openDialog(existing?'编辑广告命名':'创建广告命名',materialName(m,d)+' · '+lockedMaterialId,'<form id="vdNamingForm" class="dialog-wide-content vd-form-grid vd-ad-naming-form"><label class="vd-form-full">素材<input value="'+h(materialName(m,d))+'" readonly aria-readonly="true" maxlength="2048"><small class="vd-type-help">'+h(lockedMaterialId)+'</small></label><label class="vd-form-full">SPU<input value="'+h(context.spu)+'" readonly aria-readonly="true" maxlength="200"></label>'+namingInputs({...defaults,adAccountId:n.adAccountId,adAccountName:n.adAccountName,adId:n.adId})+'<label class="vd-form-full vd-ad-generated-name">广告名称<input id="vdAdName" readonly aria-readonly="true" maxlength="2048" value="'+h(initial.name)+'" placeholder="补全上方信息后自动生成"><small class="vd-type-help" id="vdAdNameHint">'+h(initial.missing.length?'请补充：'+initial.missing.join('、'):'已按规则自动生成')+'</small><small class="vd-warning" id="vdDuplicateName" hidden>已存在相同名称，请核对平台及账户；仍可保存。</small></label>'+(existing?'<label class="vd-form-full">备注<textarea name="remark" rows="3" maxlength="1500">'+h(n.remark||'')+'</textarea></label>':'')+'</form>',existing?'保存命名':'保存广告命名',()=>{
        const form=$('#vdNamingForm');if(!form.reportValidity())return;
        const value={...Object.fromEntries(new FormData(form)),id};
        if(!commit(()=>M.saveAdvertisingNaming(store,lockedMaterialId,value,actor,config())))return;
        pageTab='ads';adPage=1;adFilters=M.normalizeAdvertisingFilters();api.closeDialog();render();api.toast(existing?'广告命名已保存':'广告命名已创建，并显示在广告命名页签');
      });
      const update=()=>{const form=$('#vdNamingForm');if(!form)return;const state=generated(Object.fromEntries(new FormData(form)));$('#vdAdName').value=state.name;$('#vdAdNameHint').textContent=state.missing.length?'请补充：'+state.missing.join('、'):'已按规则自动生成';$('#vdDuplicateName').hidden=!state.name||!store.namings.some(n=>!n.deletedAt&&n.id!==id&&n.adName===state.name);};
      $('#dialogBody').oninput=update;$('#dialogBody').onchange=update;update();
    }
    function confirmDeleteAdvertising(id) {
      if(!guard('demand:naming:manage'))return;
      const n=store.namings.find(n=>n.id===id&&!n.deletedAt);if(!n){api.toast('广告记录已删除，请刷新列表','warning');return;}
      api.openDialog('删除广告命名',n.id,'<div class="vd-delete-confirm"><p>确认删除该广告命名？</p><dl><dt>广告名称</dt><dd>'+h(n.adName)+'</dd><dt>广告ID</dt><dd>'+h(n.id)+'</dd><dt>素材ID</dt><dd>'+h(n.materialId||'未关联素材')+'</dd></dl><small>删除后，该广告记录将从广告命名页移除，关联素材仍保留。</small></div>','确认删除',()=>{
        if(!commit(()=>M.deleteAdvertisingNaming(store,id,actor)))return;
        api.closeDialog();render();api.toast('广告命名已删除，关联素材已保留');
      });
    }
    async function copyName(id) {const n=store.namings.find(n=>n.id===id&&!n.deletedAt);if(!n)return;try{await navigator.clipboard.writeText(n.adName);api.toast('广告名称已复制');}catch{api.toast('复制失败，请选中广告名称手动复制','warning');}}
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      const action=button.dataset.vdAction;
      if(button.dataset.vdCopyAddress)copyMaterialAddress(button.dataset.vdCopyAddress);
      if(action==='create'){if(pageTab==='list')grid.addRow();else editDemand();}
      if(action==='config'&&guard('demand:config:manage'))api.openOptions();
      if(action==='export'){if(pageTab==='ads')exportAdvertising();else if(pageTab==='materials')exportMaterials();else grid.exportGrid();}
      if(action==='toggle-filters'){try{filters=M.validateDemandFilters(Object.fromEntries(new FormData($('#vdFilterForm'))));filtersExpanded=!filtersExpanded;render();}catch(error){api.toast(error.message,'warning');}}
      if(action==='save-filters')applyFilters(true);
      if(button.dataset.vdRangeClear){const range=button.closest('.vd-date-range');range.querySelectorAll('input').forEach(input=>input.value='');updateRange(range);updateFilterSaveState();updateMaterialFilterSaveState();updateAdFilterSaveState();}
      if(button.dataset.vdRangeClose)button.closest('.vd-date-range').open=false;
      if(action==='list'||action==='materials'||action==='ads'){materialSelection.clear();grid.clearSelection();pageTab=action;render();if(document.body.classList.contains('spec-panel-open'))$('.workspace').scrollTo({top:0});else window.scrollTo({top:0});}
      if(action==='reset'){filters=M.normalizeDemandFilters();page=1;grid.clearSelection();render();}

      if(button.dataset.vdPage){page=Number(button.dataset.vdPage);render();}
      if(button.dataset.vdDetail)detail(button.dataset.vdDetail,button.dataset.vdTab||'base');
      if(button.dataset.vdEdit)editDemand(button.dataset.vdEdit);
      if(button.dataset.vdAssign)assignProducer(button.dataset.vdAssign);
      if(button.dataset.vdExecute)executeDemand(button.dataset.vdExecute);
      if(button.dataset.vdDelete)confirmDeleteDemand(button.dataset.vdDelete);
      if(action==='reset-materials'){materialFilters=M.normalizeMaterialFilters();materialPage=1;materialSelection.clear();render();}
      if(action==='save-material-filters')applyMaterialFilters(true);
      if(button.dataset.vdMaterialPage){materialPage=Number(button.dataset.vdMaterialPage);materialSelection.clear();render();}
      if(action==='batch-naming')batchNaming();
      if(action==='batch-delete-materials')confirmDeleteMaterials();
      if(action==='clear-materials'){materialSelection.clear();render();}
      if(button.dataset.vdMaterialDetail)materialDetail(button.dataset.vdMaterialDetail);
      if(button.dataset.vdMaterialEdit){const m=store.materials.find(m=>m.id===button.dataset.vdMaterialEdit);if(m)editMaterial(m.id);}
      if(action==='reset-ads'){adFilters=M.normalizeAdvertisingFilters();adPage=1;render();}
      if(action==='save-ad-filters')applyAdFilters(true);
      if(button.dataset.vdAdMaterialView)materialDetail(button.dataset.vdAdMaterialView);
      if(button.dataset.vdAdPage){adPage=Number(button.dataset.vdAdPage);render();}
      if(button.dataset.vdAdCopy)copyName(button.dataset.vdAdCopy);
      if(button.dataset.vdAdDelete)confirmDeleteAdvertising(button.dataset.vdAdDelete);
      if(button.dataset.vdAdEdit){const row=M.advertisingRows(store).find(r=>r.naming.id===button.dataset.vdAdEdit);if(row)editNaming(row.material.id,row.naming.id);}
    });
    function updateFilterSaveState() {const form=$('#vdFilterForm'),state=$('#vdFilterSaveState');if(form&&state)state.textContent=filterSaveLabel(Object.fromEntries(new FormData(form)));}
    function updateRange(range) {const values=[...range.querySelectorAll('input')].map(input=>input.value),value=range.querySelector('.vd-range-value');value.textContent=rangeText(...values);value.classList.toggle('is-empty',!values.some(Boolean));}
    root.addEventListener('input',event=>{if(event.target.closest('#vdFilterForm,#vdMaterialFilter,#vdAdvertisingFilter')){const range=event.target.closest('.vd-date-range');if(range)updateRange(range);updateFilterSaveState();updateMaterialFilterSaveState();updateAdFilterSaveState();}});
    root.addEventListener('change',event=>{if(event.target.id==='vdMaterialSelectAll'){materialFiltered().slice((materialPage-1)*10,materialPage*10).forEach(r=>{if(event.target.checked)materialSelection.add(r.material.id);else materialSelection.delete(r.material.id);});render();return;}if(event.target.dataset.vdMaterialCheck){if(event.target.checked)materialSelection.add(event.target.dataset.vdMaterialCheck);else materialSelection.delete(event.target.dataset.vdMaterialCheck);render();return;}if(event.target.closest('#vdFilterForm,#vdMaterialFilter,#vdAdvertisingFilter')){const range=event.target.closest('.vd-date-range');if(range)updateRange(range);updateFilterSaveState();updateMaterialFilterSaveState();updateAdFilterSaveState();}});
    root.addEventListener('toggle',event=>{if(event.target.matches('.vd-date-range')&&event.target.open)root.querySelectorAll('.vd-date-range[open]').forEach(range=>{if(range!==event.target)range.open=false;});},true);
    document.addEventListener('click',event=>root.querySelectorAll('.vd-date-range[open]').forEach(range=>{if(!range.contains(event.target))range.open=false;}));
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){const range=event.target.closest('.vd-date-range');if(range){range.open=false;range.querySelector('summary').focus();}}});
    root.addEventListener('submit',event=>{if(event.target.id==='vdMaterialFilter'){event.preventDefault();applyMaterialFilters();return;}if(event.target.id==='vdAdvertisingFilter'){event.preventDefault();applyAdFilters();return;}if(event.target.id!=='vdFilterForm')return;event.preventDefault();applyFilters();});

    window.addEventListener('storage',event=>{if(event.key!==KEY||!event.newValue)return;try{const incoming=JSON.parse(event.newValue);if(incoming.version===1&&['demands','materials','namings','batches'].every(k=>Array.isArray(incoming[k]))){M.normalizeProgressStore(incoming);M.normalizeAdvertisingRelations(incoming);window.VisualDemandGridModel.normalizeDraftOwnership(incoming,api.users);store=incoming;if(grid?.isEditing())grid.onExternal();else render();}}catch{api.toast('其他页面的记录更新无法读取，请保留当前数据','warning');}});
    grid=window.createVisualDemandGrid({api,M,root,h,getStore:()=>store,replaceStore:value=>{store=value;},render,filtered,getDemandType:()=>filters.demandType||'all',setDemandType:type=>{filters.demandType=type==='all'?'':type;},formMarkup:businessDemandForm,deliveryMarkup,execute:executeDemand});
    render();return {render};
  };
})();

})();