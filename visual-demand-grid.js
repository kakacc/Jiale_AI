(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
(function(){
  'use strict';
  window.createVisualDemandGrid=function(ctx){
    const {api,M,root,h}=ctx,G=window.VisualDemandGridModel,KEY='ai-visual-demand-business-records-v1';
    const can=()=>api.currentUser.isOrgAdmin||api.currentUser.permissions?.includes('demand:manage');
    const state={page:1,size:50,sort:'request-desc',selected:new Set(),pending:[],newRows:[],pinned:new Set(),active:null,range:null,anchor:null,drag:false,status:'草稿自动保存；提交后进入制作流程',failed:false,drawerId:'',drawerTab:'base'};
    const $=s=>root.querySelector(s),label=(f,v)=>api.optionLabel(f,v)||v||'',record=id=>ctx.getStore().demands.find(d=>d.id===id&&G.canViewDemand(d,api.currentUser))||state.pending.find(d=>d.id===id&&G.canViewDemand(d,api.currentUser));
    const spec=k=>G.fields.find(f=>f.key===k),draftLabel=d=>G.isDraft(d)?'草稿':'已提交';
    const options=(values,value,empty='请选择')=>'<option value="">'+h(empty)+'</option>'+values.map(o=>'<option value="'+h(o.value)+'" '+(o.value===value?'selected':'')+'>'+h(o.label)+'</option>').join('');
    const optionCache=new Map();
    function fieldOptions(f,d){
      if(f==='priority')return ['P0','P1','P2'].map(value=>({value,label:value}));
      const key=[f,d.demandType,d.businessChannel,JSON.stringify(api.adOptions(f))].join('|');if(optionCache.has(key))return optionCache.get(key).map(o=>({...o}));
      const template=document.createElement('template');template.innerHTML=ctx.formMarkup(d);const select=template.content.querySelector('select[name="'+f+'"]');
      const values=select?[...select.options].filter(o=>o.value&&!o.disabled).map(o=>({value:o.value,label:o.textContent.trim()})):api.adOptions(f);
      optionCache.set(key,values);return values.map(o=>({...o}));
    }
    const config={users:api.users.map(u=>u.name),options:fieldOptions,label};
    const progressTones={'待分配':'unassigned','待制作':'queued','制作中':'working','已完成':'completed','项目暂停':'paused'};
    const helpContent={
      submissionState:{title:'行状态说明',rows:[['草稿','草稿状态需求未进入执行流程，仅自己可见'],['已提交','需求进入执行流程（会有进度状态），数据他人可见']]},
      status:{title:'进度状态说明',rows:[['待分配','已提交，尚未指定制作人；分配后进入待制作。'],['待制作','已指定制作人，等待开始制作。'],['制作中','制作人正在执行需求，可更新执行及交付信息。'],['已完成','需求已完成，交付素材进入素材页；需求内容只读。'],['项目暂停','需求暂时停止，需求内容只读，不支持执行。'],['草稿','尚未进入制作流程，进度状态留空。']]},
      actions:{title:'不同状态的操作说明',rows:[['草稿','直接编辑并自动保存；补齐必填项后提交，支持详情；勾选后可批量复制或删除。'],['待分配','可编辑、分配制作人、查看详情；勾选后可批量复制。'],['待制作 / 制作中','可编辑、执行需求、查看详情；勾选后可批量复制；已提交关键字段修改需确认。'],['已完成 / 项目暂停','支持详情；勾选后可批量复制。需求内容只读，不支持执行。'],['批量删除','仅草稿、待分配、待制作、项目暂停可删除；存在交付素材或关联广告时不可删除，删除前需确认。']]}
    };
    function headerHelp(key){const help=helpContent[key];return help?'<button type="button" class="vg-header-help" data-grid-help="'+key+'" aria-label="'+h(help.title)+'" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25"></circle><path d="M6.5 5.8a1.6 1.6 0 0 1 3 .8c0 1.2-1.5 1.3-1.5 2.4M8 11.2v.1"></path></svg></button>':'';}
    function rowLegend(){return '<div class="vg-row-legend" aria-label="行状态图例"><span class="vg-legend-label">行状态图例</span><span><i class="vg-legend-dot draft"></i><b>草稿</b><small>草稿状态需求未进入执行流程，仅自己可见</small></span><span><i class="vg-legend-dot submitted"></i><b>已提交</b><small>需求进入执行流程（会有进度状态），数据他人可见</small></span></div>';}
    const demandTypeView=()=>ctx.getDemandType()||'all';
    function columns(){const keys=G.fieldKeysForType(demandTypeView()).filter(key=>key!=='title');
      return [{key:'submissionState',label:'行状态',system:true},{key:'id',label:'需求ID',system:true},spec('title'),{key:'status',label:'进度状态',system:true},{key:'demandType',label:'需求类型',system:true},...keys.map(spec),{key:'productionDays',label:'制作周期',system:true}];}

    function rows(){
      const matches=ctx.filtered(),ids=new Set(matches.map(d=>d.id));
      const pinned=ctx.getStore().demands.filter(d=>G.canViewDemand(d,api.currentUser)&&state.pinned.has(d.id)&&!ids.has(d.id));
      const sorted=G.sortDemands([...state.pending,...pinned,...matches].filter((d,i,a)=>G.canViewDemand(d,api.currentUser)&&a.findIndex(v=>v.id===d.id)===i),state.sort);
      const fresh=state.newRows.map(id=>sorted.find(d=>d.id===id&&G.isDraft(d))).filter(Boolean),freshIds=new Set(fresh.map(d=>d.id)),all=[...fresh,...sorted.filter(d=>!freshIds.has(d.id))];
      state.page=Math.min(state.page,Math.max(1,Math.ceil(all.length/state.size)));
      return {all,visible:all.slice((state.page-1)*state.size,state.page*state.size)};
    }
    function bulkButton(action,title,primary,reason=''){
      const disabled=!can()||Boolean(reason);return '<span class="vg-bulk-action" '+(reason?'title="'+h(reason)+'" tabindex="0" aria-label="'+h(reason)+'"':'')+'><button class="button '+(primary?'primary':'secondary')+'" data-grid-action="'+action+'" '+(disabled?'disabled':'')+'>'+title+'</button></span>';
    }
    function addButton(footer=false){return '<button class="'+(footer?'text-button':'button primary')+' vg-add-trigger" data-grid-action="add" aria-haspopup="menu" aria-expanded="false" '+(!can()?'disabled':'')+'>＋ 新增行 <span aria-hidden="true">⌄</span></button>';}
    function text(d,f){if(f==='id')return d.id;if(f==='demandType')return M.demandTypes.find(t=>t.value===d.demandType)?.label||'';if(f==='submissionState')return draftLabel(d);if(f==='status')return G.isDraft(d)?'':d.status||'';if(f==='productionDays'){const v=M.demandDeliverySummary(ctx.getStore(),d.id)?.productionDays;return typeof v==='number'?v+'天':'';}if(f==='reference')return G.referenceSummary(d);return ['select'].includes(spec(f)?.type)?label(f,d[f]):d[f]||'';}
    function editable(d,f){return can()&&!d.deletedAt&&(G.isDraft(d)||M.canModifyDemand(d))&&G.allowed(d,f);}
    function cell(d,c,index,rowIndex){const value=text(d,c.key),edit=editable(d,c.key),sys=c.system||!G.allowed(d,c.key);let content=h(value);
      if(c.key==='id')content='<button class="vg-id-link" data-grid-detail="'+h(d.id)+'">'+h(d.id)+'</button>';
      if(c.key==='submissionState')content='<span class="vg-tag '+(G.isDraft(d)?'draft':'submitted')+'">'+h(value)+'</span>';
      if(c.key==='status'&&value)content='<span class="vg-tag vg-progress '+(progressTones[value]||'')+'">'+h(value)+'</span>';
      if(c.key==='demandType'&&value)content='<span class="vg-tag vg-demand-type '+(d.demandType==='ad-team'?'ad-team':'visual-team')+'">'+h(value)+'</span>';
      if(c.key==='reference'&&value&&G.allowed(d,c.key))content='<button class="table-link vg-reference-cell-link" data-grid-reference="'+h(d.id)+'">'+h(value)+'</button>';
      return '<td class="vg-cell '+(c.key==='id'?'vg-id-cell ':'')+(edit?'vg-editable':'vg-readonly')+'" data-grid-cell data-id="'+h(d.id)+'" data-field="'+c.key+'" data-row="'+rowIndex+'" data-col="'+index+'" tabindex="0" aria-label="'+h(d.id+' '+c.label)+'" aria-readonly="'+(!edit)+'" title="'+h(sys&&!c.system?'此类型不填写该字段':!edit&&!c.system?'已完成或项目暂停，不能修改':value||(edit?'点击填写':''))+'"><div class="vg-cell-text">'+content+'</div></td>';
    }
    function markup(){
      const {all,visible}=rows(),cols=columns(),pages=Math.max(1,Math.ceil(all.length/state.size)),selected=visible.filter(d=>state.selected.has(d.id)),eligibility=G.batchEligibility(selected);
      return '<div class="vg-workspace"><div class="vg-toolbar"><div class="vg-toolbar-main">'+addButton()+'<button class="button secondary" data-grid-action="export">导出</button></div><div class="vg-toolbar-view"><select aria-label="表格排序" id="vgSort">'+[['request-desc','下需时间 · 最新'],['ddl-asc','DDL · 最近'],['created-desc','创建时间 · 最新'],['id-asc','需求ID · 升序']].map(([v,n])=>'<option value="'+v+'" '+(state.sort===v?'selected':'')+'>'+n+'</option>').join('')+'</select></div></div><div class="vg-bulkbar '+(selected.length?'has-selection':'')+'"><span id="vgSelectionCount">'+(selected.length?'已选择 '+selected.length+' 条':'勾选行进行批量操作；点击单元格编辑，Shift＋点击可选择区域')+'</span><div '+(selected.length?'':'hidden')+'>'+bulkButton('batch-edit','批量修改',false,eligibility.editReason)+'<button class="button secondary" data-grid-action="copy" '+(!can()?'disabled':'')+'>批量复制</button>'+bulkButton('submit','批量提交',true,eligibility.submitReason)+'<button class="button secondary vg-danger" data-grid-action="delete" '+(!can()?'disabled':'')+'>批量删除</button><button class="text-button" data-grid-action="clear">取消选择</button></div></div><div class="vg-savebar"><span class="vg-save-status '+(state.failed?'is-error':'')+'" role="status">'+h(state.status)+'</span><button class="text-button" data-grid-action="retry" '+(state.failed?'':'hidden')+'>重试保存</button><button class="text-button" data-grid-action="refresh" '+(state.failed?'':'hidden')+'>读取最新</button><span class="vg-hint">计算字段只读 · 草稿不进入制作流程</span></div>'+rowLegend()+'<div class="vg-scroll" data-runtime-copy><table class="vg-table" role="grid" aria-label="视觉需求在线表格"><thead><tr><th class="vg-check-col"><input type="checkbox" id="vgSelectAll" aria-label="全选当前页" '+(visible.length&&selected.length===visible.length?'checked':'')+'></th>'+cols.map(c=>'<th class="'+(c.key==='id'?'vg-id-col':'')+'" data-grid-col="'+c.key+'">'+h(c.label)+(c.required?' <em>*</em>':'')+headerHelp(c.key)+'</th>').join('')+'<th class="vg-actions-col">操作'+headerHelp('actions')+'</th></tr></thead><tbody>'+visible.map((d,i)=>'<tr data-grid-row="'+h(d.id)+'" class="'+(G.isDraft(d)?'is-draft':'')+'"><td class="vg-check-col"><input type="checkbox" data-grid-check="'+h(d.id)+'" aria-label="选择 '+h(d.id)+'" '+(state.selected.has(d.id)?'checked':'')+'></td>'+cols.map((c,j)=>cell(d,c,j,i)).join('')+'<td class="vg-row-actions">'+(G.isDraft(d)?'<button class="table-link" data-grid-submit="'+h(d.id)+'" '+(!can()?'disabled':'')+'>提交</button>':M.canModifyDemand(d)?'<button class="table-link" data-grid-execute="'+h(d.id)+'">'+(d.status==='待分配'?'分配制作人':'执行需求')+'</button>':'')+'<button class="table-link" data-grid-detail="'+h(d.id)+'">详情</button></td></tr>').join('')+(!visible.length?'<tr><td colspan="'+(cols.length+2)+'"><div class="vd-empty">暂无符合条件的需求，点击「新增行」开始填写。</div></td></tr>':'')+'</tbody></table></div><div class="vg-bottom"><span>共 '+all.length+' 条'+(state.pending.length?'（含 '+state.pending.length+' 条待填写行）':'')+'</span><div><label>每页 <select id="vgPageSize" aria-label="每页条数">'+[20,50,100].map(v=>'<option '+(state.size===v?'selected':'')+'>'+v+'</option>').join('')+'</select> 条</label><button class="button secondary" data-grid-page="'+(state.page-1)+'" '+(state.page<=1?'disabled':'')+'>上一页</button><span>'+state.page+' / '+pages+'</span><button class="button secondary" data-grid-page="'+(state.page+1)+'" '+(state.page>=pages?'disabled':'')+'>下一页</button></div></div></div>';
    }
    function rerender(){hideHelp();closeAddMenu();const scroll=$('.vg-scroll'),x=scroll?.scrollLeft||0,y=scroll?.scrollTop||0;ctx.render();const next=$('.vg-scroll');if(next){next.scrollLeft=x;next.scrollTop=y;}}
    function refreshRow(id){state.range=null;rerender();}
    function status(message,error=false){state.status=message;state.failed=error;const el=$('.vg-save-status');if(el){el.textContent=message;el.classList.toggle('is-error',error);}for(const name of ['retry','refresh']){const button=$('[data-grid-action="'+name+'"]');if(button)button.hidden=!error;}}
    function latest(){const raw=localStorage.getItem(KEY);if(!raw)return M.clone(ctx.getStore());const value=JSON.parse(raw);if(value.version!==1||!['demands','materials','namings','batches'].every(k=>Array.isArray(value[k])))throw new Error('业务数据格式异常，已停止写入。');return value;}
    function saveStore(next){localStorage.setItem(KEY,JSON.stringify(next));ctx.replaceStore(next);}
    function permission(){if(!can())throw new Error('当前账号没有需求管理权限。');}
    function perform(store,plan){permission();if(plan.blocked)throw new Error(plan.blocked);const target=store.demands.find(d=>d.id===plan.id)||plan.record;if(target)G.assertDraftAccess(target,api.currentUser);if(plan.kind==='submit')return G.submit(store,plan,api.currentUser,config);if(plan.kind==='delete')return G.deleteRecord(store,plan,api.currentUser);if(plan.kind==='copy'){
        const old=store.demands.find(d=>d.id===plan.id&&!d.deletedAt);if(!old)throw new Error('源需求不存在。');G.assertVersion(old,plan.expected);const next=G.copyRecord(old,api.currentUser);next.id=plan.copy.id;next.createdAt=plan.copy.createdAt;if(store.demands.some(d=>d.id===next.id))throw new Error('复制的草稿已经创建，不能重复执行。');next.revision=1;M.appendLog(next,'复制需求','复制来源：'+old.id+'；新草稿，对接人为当前用户，制作周期自动计算',api.currentUser.name);store.demands.unshift(next);return next;
      }return G.savePatch(store,plan,api.currentUser,config).record;}
    function enrich(plan){try{const source=latest(),before=source.demands.find(d=>d.id===plan.id)||plan.record;perform(source,{...plan,confirmed:true});const after=source.demands.find(d=>d.id===plan.id);const warning=plan.kind==='patch'&&G.isDraft(after)?G.requiredIssues(after,config).join('；'):'';
        const duplicate=plan.isNew&&after?.spu&&after.channelCategory&&source.demands.some(d=>d.id!==after.id&&!d.deletedAt&&d.spu===after.spu&&d.channelCategory===after.channelCategory&&d.requestDate===after.requestDate);
        return {...plan,error:'',warning:[warning,after?M.postNumberWarning(source,after):'',duplicate?'存在相同SPU、渠道及下需时间，请核对是否重复':'',!G.isDraft(before)&&plan.kind==='patch'?'将修改已提交需求，请确认执行影响':''].filter(Boolean).join('；')};
      }catch(error){return {...plan,error:error.message,warning:''};}}
    function executePlans(plans,title,excluded=[]){
      let working;try{permission();working=latest();}catch(e){api.toast(e.message,'warning');return;}
      const retry=[...excluded],results=excluded.map(p=>({id:p.id,line:p.line,success:false,skipped:true,error:p.error}));for(const plan of plans){const candidate=M.clone(working);try{perform(candidate,{...plan,confirmed:true});working=candidate;results.push({id:plan.id,line:plan.line,success:true,createdId:plan.copy?.id});}catch(e){results.push({id:plan.id,line:plan.line,success:false,error:e.message});retry.push({...plan,error:e.message});}}
      const good=results.filter(r=>r.success);if(good.length){working.gridOperations=working.gridOperations||[];working.gridOperations.unshift({id:M.uid('BULK'),action:title,actor:api.currentUser.name,at:M.now(),results:M.clone(results)});
        try{saveStore(working);}catch(e){status('保存失败：'+(e.name==='QuotaExceededError'?'存储空间不足':e.message)+'；输入已保留',true);api.toast('保存失败，未写入记录。请保留当前内容后重试','warning');return;}
        good.forEach(r=>{state.pinned.add(r.createdId||r.id);state.pending=state.pending.filter(d=>d.id!==r.id);});
      }
      state.selected.clear();state.active=null;status('已保存 · 成功 '+good.length+' 条，未执行 / 失败 '+(results.length-good.length)+' 条');rerender();
      api.openDialog(title+'结果','本次共 '+results.length+' 条','<div class="vg-result"><p>成功 <b>'+good.length+'</b> 条，未执行 <b>'+results.filter(r=>r.skipped).length+'</b> 条，失败 <b>'+results.filter(r=>!r.success&&!r.skipped).length+'</b> 条。</p>'+results.map(r=>'<div class="vg-result-row '+(r.success?'':'is-error')+'"><span>'+h(r.id)+'</span><b>'+h(r.success?'成功':(r.skipped?'未执行：':'')+r.error)+'</b></div>').join('')+(retry.some(p=>p.kind==='patch')?'<button class="button secondary" data-grid-retry-plans>修正未通过的记录</button>':'')+'</div>','关闭',api.closeDialog);
      document.querySelector('[data-grid-retry-plans]')?.addEventListener('click',()=>retryPatchPlans(retry.filter(p=>p.kind==='patch'),title));
    }
    function retryPatchPlans(plans,title){api.openDialog('修正未通过的记录','保留原输入；已成功的记录不会再次创建','<form id="vgRetryForm" class="dialog-wide-content vg-retry-form">'+plans.map((p,i)=>'<section><h3>第 '+(p.line||i+1)+' 行 · '+h(p.id)+'</h3><div class="vg-retry-fields">'+Object.entries(p.patch).map(([field,value])=>'<label>'+h(spec(field)?.label||field)+inputMarkup({...p.record,...record(p.id),[field]:value},field).replace('data-grid-editor','data-retry-index="'+i+'" data-retry-field="'+field+'"')+'</label>').join('')+'</div></section>').join('')+'</form>','重新校验',()=>{const updated=plans.map(p=>({...p,patch:{...p.patch},blocked:''}));document.querySelectorAll('[data-retry-field]').forEach(el=>updated[Number(el.dataset.retryIndex)].patch[el.dataset.retryField]=el.value);preview(updated,title);});}
    function preview(plans,title){const checked=plans.map(enrich),valid=checked.filter(p=>!p.error),errors=checked.length-valid.length;
      api.openDialog(title+'预览','共 '+checked.length+' 条 · 可操作 '+valid.length+' 条 · 不可操作 '+errors+' 条','<div class="vg-preview"><p>确认后才写入数据；未通过的记录保持原值。</p><div class="vg-preview-scroll"><table><thead><tr><th>行 / 需求ID</th><th>操作内容</th><th>校验结果</th></tr></thead><tbody>'+checked.map((p,i)=>'<tr class="'+(p.error?'is-error':'')+'"><td>'+(p.line||i+1)+'<small>'+h(p.id)+'</small></td><td>'+h(p.description||title)+'</td><td>'+h(p.error||p.warning||'通过')+'</td></tr>').join('')+'</tbody></table></div>'+(checked.every(p=>p.kind==='patch')?'<button class="button secondary" data-grid-back-to-edit>返回修改</button>':'')+(errors?'<div class="vg-preview-actions"><button class="button secondary" data-grid-valid-only '+(!valid.length?'disabled':'')+'>仅'+h(title.replace(/^批量/,''))+'校验通过的 '+valid.length+' 条</button></div>':'')+'</div>',errors?'全部校验通过后可执行':'确认'+title+' '+valid.length+' 条',()=>executePlans(checked,title));
      document.getElementById('dialogConfirm').disabled=errors>0||!checked.length;
      document.querySelector('[data-grid-valid-only]')?.addEventListener('click',()=>executePlans(valid,title,checked.filter(p=>p.error)));
      document.querySelector('[data-grid-back-to-edit]')?.addEventListener('click',()=>retryPatchPlans(checked,title));
    }
    function confirmBatchAction(kind){
      const plans=selectedPlans(kind);if(!plans.length)return;
      const copying=kind==='copy',title=copying?'批量复制':'批量删除';
      const question='确认'+(copying?'复制':'删除')+plans.length+'条数据？';
      const note=copying?'复制后数据默认为<span class="vg-tag draft">草稿</span>状态':'删除后数据不可复原';
      api.openDialog(title,'','<div class="vg-count-confirm '+(copying?'':'is-delete')+'"><p class="vg-count-question">'+h(question)+'</p><p class="vg-count-note">'+note+'</p></div>',copying?'确认复制':'确认删除',()=>executePlans(plans,title));
    }
    function chooseNewType(callback){api.openDialog('选择新增需求类型','「全部」显示字段全集；新需求需选择具体制作类型','<label class="vg-type-choice">需求类型<select id="vgChooseType" aria-label="具体需求类型">'+M.demandTypes.map(t=>'<option value="'+t.value+'">'+h(t.label)+'</option>').join('')+'</select></label>','继续',()=>{const type=document.getElementById('vgChooseType').value;api.closeDialog();callback(type);});}
    let addMenu=null,addAnchor=null;
    function closeAddMenu(){addAnchor?.setAttribute('aria-expanded','false');addAnchor?.removeAttribute('aria-controls');addMenu?.remove();addMenu=null;addAnchor=null;}
    function showAddMenu(anchor){
      if(addAnchor===anchor){closeAddMenu();return;}closeAddMenu();hideHelp();addAnchor=anchor;
      addMenu=document.createElement('div');addMenu.className='vg-add-menu';addMenu.id='vgAddTypeMenu';addMenu.setAttribute('role','menu');addMenu.setAttribute('aria-label','新增需求类型');
      addMenu.innerHTML=M.demandTypes.map(t=>'<button type="button" role="menuitem" data-grid-new-type="'+t.value+'">'+h(t.label)+'</button>').join('');document.body.append(addMenu);anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',addMenu.id);
      const box=anchor.getBoundingClientRect(),rect=addMenu.getBoundingClientRect();addMenu.style.left=Math.max(12,Math.min(box.left,innerWidth-rect.width-12))+'px';addMenu.style.top=(box.bottom+rect.height+6<innerHeight?box.bottom+6:box.top-rect.height-6)+'px';
      addMenu.onclick=e=>{const button=e.target.closest('[data-grid-new-type]');if(button)addRow(button.dataset.gridNewType);};
      addMenu.onkeydown=e=>{const buttons=[...addMenu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}if(e.key==='Escape'){e.preventDefault();const anchor=addAnchor;closeAddMenu();anchor?.focus();}};
    }
    function addRow(type,anchor){
      if(!can())return;if(!M.demandTypes.some(t=>t.value===type)){showAddMenu(anchor||$('[data-grid-action="add"]'));return;}
      closeAddMenu();ctx.setDemandType(type);const d=G.emptyDraft(type,api.currentUser);state.pending.unshift(d);state.newRows.unshift(d.id);state.pinned.add(d.id);state.selected.clear();state.range=null;state.active=null;
      state.page=1;rerender();const td=root.querySelector('[data-id="'+d.id+'"][data-field="title"]');td?.scrollIntoView({block:'nearest',inline:'nearest'});if(td)startEdit(td);
    }
    document.addEventListener('pointerdown',e=>{if(addMenu&&!addMenu.contains(e.target)&&!addAnchor?.contains(e.target))closeAddMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAddMenu();});
    root.addEventListener('scroll',closeAddMenu,true);window.addEventListener('resize',closeAddMenu);
    function openReference(id){
      if(state.active&&!finishEdit())return;
      const d=record(id);if(!d||!G.allowed(d,'reference'))return;
      const snapshot=M.clone(d),expected=G.version(d);state.referenceEditing=true;
      window.VisualDemandReference.open({record:snapshot,readonly:!editable(d,'reference'),onSave:value=>{
        const plan={kind:'patch',id,expected,isNew:!ctx.getStore().demands.some(x=>x.id===id),record:snapshot,patch:{reference:value}};
        const next=latest();perform(next,plan);saveStore(next);state.pending=state.pending.filter(x=>x.id!==id);state.pinned.add(id);status('制作参考已自动保存');refreshRow(id);
        if(document.getElementById('vgDrawer')?.open)drawer(id,'base');
      },onClose:()=>{state.referenceEditing=false;}});
    }
    function inputMarkup(d,f,drawer=false){const s=spec(f),value=d[f]||'',attrs=(drawer?'data-grid-drawer-field="'+f+'" data-id="'+h(d.id)+'"':'data-grid-editor')+' aria-label="'+h(s.label)+'"';
      if(s.type==='select'){const vals=fieldOptions(f,d);let selected=value;try{selected=G.normalize(f,value,config,d);}catch{}if(selected&&!vals.some(v=>v.value===selected))vals.push({value:selected,label:label(f,selected)+'（原值）'});return '<select '+attrs+'>'+options(vals,selected)+'</select>';}
      if(f==='owner'&&M.usesPostNumber(d.expression))return '<input '+attrs+' value="'+h(value)+'" data-post-owner placeholder="请输入帖子编号" autocomplete="off" maxlength="200"><small class="vg-post-warning" role="status" hidden></small>';
      if(s.type==='person')return '<input '+attrs+' value="'+h(value)+'" list="vgPeople" placeholder="搜索平台人员" autocomplete="off" maxlength="200">';
      if(s.type==='reference'&&drawer)return window.VisualDemandReference.control(d,editable(d,f));
      if(['long','reference'].includes(s.type))return '<textarea '+attrs+' rows="4" maxlength="1500">'+h(value)+'</textarea>';
      return '<input '+attrs+' value="'+h(value)+'" type="'+(s.type==='date'?'date':'text')+'" maxlength="'+(f==='title'?120:200)+'">';}
    function selectRange(td,extend=false){const p={row:Number(td.dataset.row),col:Number(td.dataset.col)};if(!extend||!state.range)state.range={start:p,end:p};else state.range.end=p;paintRange();}
    function paintRange(){const r=state.range;root.querySelectorAll('[data-grid-cell]').forEach(td=>{const row=Number(td.dataset.row),col=Number(td.dataset.col);td.classList.toggle('vg-selected-cell',!!r&&row>=Math.min(r.start.row,r.end.row)&&row<=Math.max(r.start.row,r.end.row)&&col>=Math.min(r.start.col,r.end.col)&&col<=Math.max(r.start.col,r.end.col));});}
    function startEdit(td){const d=record(td.dataset.id),f=td.dataset.field;if(!d||!editable(d,f)){selectRange(td);return;}if(state.active){if(state.active.id===d.id&&state.active.field===f)return;if(!finishEdit())return;td=root.querySelector('[data-id="'+d.id+'"][data-field="'+f+'"]');if(!td)return;}
      if(f==='reference'){openReference(d.id);return;}
      const scroller=$('.vg-scroll');if(scroller){const bounds=scroller.getBoundingClientRect(),box=td.getBoundingClientRect(),fixed=0;if(box.left<bounds.left+fixed)scroller.scrollLeft-=bounds.left+fixed-box.left+4;if(box.right>bounds.right)scroller.scrollLeft+=box.right-bounds.right+4;}
      selectRange(td);state.active={id:d.id,field:f,base:G.version(d),record:M.clone(d),original:String(d[f]||''),value:String(d[f]||'')};td.classList.add('vg-editing');td.innerHTML=inputMarkup(d,f);const input=td.querySelector('[data-grid-editor]');input.focus();if(input.type!=='date'&&input.tagName!=='SELECT')input.select();status('正在编辑 · '+spec(f).label);}
    function finishEdit(cancel=false){const active=state.active;if(!active)return true;const input=$('[data-grid-editor]');if(input)active.value=input.value;if(cancel){state.active=null;status('已取消本次未保存输入');refreshRow(active.id);return true;}
      if(active.value===active.original){state.active=null;status('已保存');refreshRow(active.id);return true;}
      const d=active.record,plan={kind:'patch',id:d.id,patch:{[active.field]:active.value},expected:active.base,isNew:!ctx.getStore().demands.some(r=>r.id===d.id),record:d,description:spec(active.field).label+'：'+(active.original||'空')+' → '+(active.value||'空')};
      const checked=enrich(plan);if(checked.error){status(checked.error+'；输入已保留，可修正后重试',true);input?.setAttribute('aria-invalid','true');return false;}
      if(!G.isDraft(d)&&G.keyFields.includes(active.field)){state.active=null;status('等待确认关键字段变更');refreshRow(active.id);preview([plan],'变更关键字段');return false;}
      try{status('保存中…');const latestStore=latest();perform(latestStore,plan);saveStore(latestStore);state.pending=state.pending.filter(r=>r.id!==d.id);state.pinned.add(d.id);state.active=null;const warning=M.postNumberWarning(latestStore,latestStore.demands.find(x=>x.id===d.id));status('已自动保存 · '+M.now().slice(11,19)+(warning?' · '+warning:''));if(warning)api.toast(warning,'warning');refreshRow(active.id);return true;}catch(e){status('保存失败：'+e.message+'；输入已保留',true);return false;}
    }
    function move(td,rowDelta,colDelta,editing=false){const target=root.querySelector('[data-grid-cell][data-row="'+(Number(td.dataset.row)+rowDelta)+'"][data-col="'+(Number(td.dataset.col)+colDelta)+'"]');if(target){target.focus();if(editing)startEdit(target);else selectRange(target);}}
    function currentSelected(){return rows().visible.filter(d=>state.selected.has(d.id));}
    function selectedPlans(kind,ids){return (ids?ids.map(record).filter(Boolean):currentSelected()).map((d,i)=>({kind,id:d.id,expected:G.version(d),line:i+1,...(kind==='copy'?{copy:G.copyRecord(d,api.currentUser)}:{}),description:kind==='submit'?'草稿提交 → '+M.initialProgressStatus(d.owner):kind==='copy'?'复制其余业务字段为草稿；新需求ID、空进度、当前用户对接人、周期自动计算':kind==='delete'?'确认逻辑删除，不级联删除下游记录':''}));}
    function batchEdit(){
      const selected=currentSelected();if(!selected.length)return;const eligibility=G.batchEligibility(selected);if(!eligibility.sameType){api.toast(eligibility.editReason,'warning');return;}
      const available=G.batchFields(selected),type=selected[0].demandType,patches=Object.fromEntries(available.map(f=>[f.key,{enabled:false,clear:false,value:f.type==='reference'?{text:'',items:[]}:''}]));
      const groups=type==='ad-team'?M.adTeamDemandFormSections:[{title:'基础信息',fields:['title','spu','businessChannel','productLevel','demandSource','requestDate','ddl','channelCategory','materialType']},{title:'内容与制作要求',fields:['expression','mainSellingPoint','scene','secondarySellingPoint','bodyType','materialCategory','requirements','reference','fbInfo','edmInfo']},{title:'协作信息',fields:['requester','priority','owner']}];
      const effectiveBatchRecord=()=>({...selected[0],...(patches.expression?.enabled&&patches.expression.value?{expression:patches.expression.value}:{})});
      function fieldMarkup(key){const f=spec(key),p=patches[key],control=f.type==='reference'?window.VisualDemandReference.control({reference:p.value.text,referenceItems:p.value.items},true):inputMarkup({...effectiveBatchRecord(),[key]:p.value},key).replace('data-grid-editor','data-batch-value="'+key+'"');
        return '<section class="vg-batch-field '+(['long','reference'].includes(f.type)?'wide':'')+'" data-batch-field="'+key+'"><label class="vg-batch-enable"><input type="checkbox" data-batch-enable="'+key+'">'+h(f.label)+'</label><div class="vg-batch-control">'+control+'</div><label class="vg-batch-clear"><input type="checkbox" data-batch-clear="'+key+'" disabled>清空字段</label></section>';}
      api.openDialog('批量修改 · '+M.demandTypes.find(t=>t.value===type).label,'已选择 '+selected.length+' 条；勾选要修改的字段，未勾选的字段保留原值','<div class="vg-batch-all-fields dialog-wide-content">'+groups.map((group,index)=>'<section class="vg-batch-group"><div class="vg-batch-group-head"><h3>'+h(group.title)+'</h3><label class="vg-batch-select-module"><input type="checkbox" data-batch-module="'+index+'" aria-label="全选'+h(group.title)+'模块">全选模块</label></div><div class="vg-batch-fields">'+group.fields.filter(key=>patches[key]).map(fieldMarkup).join('')+'</div></section>').join('')+'<div class="vg-batch-errors" role="alert" hidden></div></div>','确认修改',()=>{
        const patch={};for(const f of available){const p=patches[f.key];if(!p.enabled)continue;if(!p.clear&&(f.type==='reference'?!p.value.text.trim()&&!p.value.items.length:!String(p.value).trim())){api.toast('请填写'+f.label+'，或勾选清空字段','warning');return;}patch[f.key]=p.clear?(f.type==='reference'?{text:'',items:[]}: ''):p.value;}
        if(!Object.keys(patch).length){api.toast('请至少勾选一个需要修改的字段','warning');return;}
        if(!G.batchEligibility(selected.map(d=>record(d.id)).filter(Boolean)).sameType){api.toast('仅支持批量修改相同需求类型的数据','warning');return;}
        const plans=selected.map((d,i)=>({kind:'patch',id:d.id,expected:G.version(d),patch:M.clone(patch),line:i+1,description:Object.keys(patch).map(key=>spec(key).label+' → '+(patches[key].clear?'清空':spec(key).type==='reference'?G.referenceSummary({reference:patch[key].text,referenceItems:patch[key].items}):patch[key])).join('；')}));
        const checked=plans.map(enrich),errors=checked.filter(p=>p.error),message=document.querySelector('.vg-batch-errors');
        if(errors.length){message.innerHTML=errors.map(p=>'<p>第'+p.line+'条 · '+h(p.id)+'：'+h(p.error)+'</p>').join('');message.hidden=false;message.scrollIntoView({block:'nearest'});return;}
        executePlans(checked,'批量修改');
      });
      const body=document.getElementById('dialogBody');
      function enableField(key){const p=patches[key],field=body.querySelector('[data-batch-field="'+key+'"]');field.classList.toggle('is-enabled',p.enabled);field.querySelector('[data-batch-clear]').disabled=!p.enabled;field.querySelectorAll('.vg-batch-control input,.vg-batch-control select,.vg-batch-control textarea,.vg-batch-control button').forEach(el=>el.disabled=!p.enabled||p.clear);}
      let batchPostMode=M.usesPostNumber(effectiveBatchRecord().expression);
      function refreshBatchOwner(){const mode=M.usesPostNumber(effectiveBatchRecord().expression);if(mode!==batchPostMode){patches.owner.value='';batchPostMode=mode;}body.querySelector('[data-batch-field="owner"] .vg-batch-control').innerHTML=inputMarkup({...effectiveBatchRecord(),owner:patches.owner.value},'owner').replace('data-grid-editor','data-batch-value="owner"');enableField('owner');}
      function syncModuleSelections(){groups.forEach((group,index)=>{const keys=group.fields.filter(key=>patches[key]),selectedCount=keys.filter(key=>patches[key].enabled).length,input=body.querySelector('[data-batch-module="'+index+'"]');input.checked=selectedCount===keys.length;input.indeterminate=selectedCount>0&&selectedCount<keys.length;});}
      available.forEach(f=>enableField(f.key));syncModuleSelections();
      body.onchange=e=>{
        if(e.target.hasAttribute('data-batch-module')){const keys=groups[Number(e.target.dataset.batchModule)].fields.filter(key=>patches[key]);keys.forEach(key=>{patches[key].enabled=e.target.checked;body.querySelector('[data-batch-enable="'+key+'"]').checked=e.target.checked;enableField(key);});if(keys.includes('expression'))refreshBatchOwner();}
        if(e.target.dataset.batchEnable){patches[e.target.dataset.batchEnable].enabled=e.target.checked;enableField(e.target.dataset.batchEnable);}
        if(e.target.dataset.batchClear){patches[e.target.dataset.batchClear].clear=e.target.checked;enableField(e.target.dataset.batchClear);}
        if(e.target.dataset.batchValue)patches[e.target.dataset.batchValue].value=e.target.value;
        if(e.target.dataset.batchEnable==='expression'||e.target.dataset.batchValue==='expression')refreshBatchOwner();
        syncModuleSelections();const message=body.querySelector('.vg-batch-errors');if(message)message.hidden=true;
      };
      body.oninput=e=>{if(e.target.dataset.batchValue)patches[e.target.dataset.batchValue].value=e.target.value;if(e.target.dataset.batchValue==='owner'&&e.target.hasAttribute('data-post-owner'))showPostWarning(e.target,effectiveBatchRecord(),e.target.value,selected.length>1&&e.target.value.trim()?'批量应用后多条需求将使用相同帖子编号，仍可保存。':'');};
      body.onclick=e=>{const button=e.target.closest('[data-reference-open]');if(!button||button.disabled)return;const p=patches.reference;window.VisualDemandReference.open({record:{title:'批量修改制作参考',reference:p.value.text,referenceItems:p.value.items},onSave:value=>{p.value=value;body.querySelector('[data-batch-field="reference"] .vg-batch-control').innerHTML=window.VisualDemandReference.control({reference:value.text,referenceItems:value.items},true);enableField('reference');}});};
    }
    function previewPaste(value,startRow=null,startField=null,newType=demandTypeView()){
      let matrix;try{matrix=G.parseClipboard(value);}catch(e){api.toast(e.message,'warning');return;}
      const visible=[...root.querySelectorAll('[data-grid-row]')].map(el=>record(el.dataset.gridRow)).filter(Boolean),cols=columns(),baseRow=startRow===null?visible.length:startRow,startCol=startField?cols.findIndex(c=>c.key===startField):cols.findIndex(c=>c.key==='spu');
      if(newType==='all'&&baseRow+matrix.length>visible.length){chooseNewType(type=>previewPaste(value,startRow,startField,type));return;}
      const plans=matrix.map((values,i)=>{const existing=visible[baseRow+i],d=existing||G.emptyDraft(newType,api.currentUser),patch={},notes=[],blocked=[];values.forEach((v,j)=>{const col=cols[startCol+j];if(!col){blocked.push('粘贴超过当前可见字段范围');return;}notes.push(col.label+'：'+(v||'空'));if(col.system||!G.allowed(d,col.key))blocked.push(col.label+'只读');else patch[col.key]=v;});
        return {kind:'patch',id:d.id,patch,record:d,isNew:!ctx.getStore().demands.some(r=>r.id===d.id),expected:existing?G.version(existing):undefined,line:i+1,description:(existing?'覆盖已有记录；':'新增草稿；')+notes.join('；'),blocked:blocked.join('；')};});
      // A blocked column remains a row error, even when other mapped cells are valid.
      preview(plans,'批量粘贴');
    }
    function exportGrid(){const selected=currentSelected(),cols=columns(),data=selected.length?selected:rows().all,blob=new Blob([M.toCsv(cols.map(c=>c.label),data.map(d=>cols.map(c=>text(d,c.key))))],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='视觉需求表格_'+M.now().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);api.toast('已导出'+(selected.length?'选中记录':'当前筛选结果')+'，可使用Excel打开');}
    function drawer(id,tab='base'){
      const d=record(id);if(!d)return;state.drawerId=id;state.drawerTab=tab;
      let dialog=document.getElementById('vgDrawer');if(!dialog){dialog=document.createElement('dialog');dialog.id='vgDrawer';dialog.className='vg-drawer';dialog.setAttribute('aria-label','视觉需求详情');document.body.append(dialog);}
      const fields=(d.demandType==='ad-team'?M.adTeamDemandFormSections.flatMap(x=>x.fields).map(spec):G.fields),issues=G.isDraft(d)?G.requiredIssues(d,config):[];
      dialog.innerHTML='<div class="vg-drawer-head"><div><span>'+h(d.id)+'</span><h2>'+h(d.title||'新需求草稿')+'</h2><p>'+draftLabel(d)+(G.isDraft(d)?' · 填写后自动保存，提交后可执行':' · '+h(d.status))+'</p></div><button class="dialog-close" data-drawer-close aria-label="关闭详情">×</button></div><div class="vg-drawer-tabs">'+[['base','基础信息'],['materials','交付素材'],['history','变更记录']].map(([key,title])=>'<button data-drawer-tab="'+key+'" class="'+(tab===key?'active':'')+'">'+title+'</button>').join('')+'</div><div class="vg-drawer-content">'+(tab==='base'?'<div class="vg-drawer-type">需求类型：'+h(text(d,'demandType'))+'（创建后不可修改）</div>'+(issues.length?'<p class="vd-alert">提交前请补充：'+h(issues.join('；'))+'</p>':'')+'<div class="vg-drawer-fields">'+fields.map(f=>f.type==='reference'?'<div class="vg-drawer-reference wide"><span>制作参考</span>'+window.VisualDemandReference.control(d,editable(d,f.key))+'</div>':'<label class="'+(f.type==='long'?'wide':'')+'"><span>'+f.label+(f.required?' <em>*</em>':'')+'</span>'+(editable(d,f.key)?inputMarkup(d,f.key,true):'<b>'+h(text(d,f.key))+'</b>')+'</label>').join('')+'</div>':tab==='materials'?ctx.deliveryMarkup(d):'<div class="vg-history">'+(d.logs||[]).map(log=>'<section><p><b>'+h(log.action)+'</b><span>'+h(log.at)+' · '+h(log.actor)+'</span></p><div>'+h(log.detail||'')+'</div></section>').join('')+(!(d.logs||[]).length?'<p>暂无变更记录</p>':'')+'</div>')+'</div><div class="vg-drawer-status" role="status">已保存的内容在刷新后保留</div><div class="vg-drawer-footer"><button class="button secondary" data-drawer-close>关闭</button>'+(G.isDraft(d)?'<button class="button primary" data-drawer-submit '+(!can()?'disabled':'')+'>校验并提交</button>':M.canModifyDemand(d)?'<button class="button primary" data-drawer-execute>'+h(d.status==='待分配'?'分配制作人':'执行需求')+'</button>':'')+'</div>';
      if(!document.getElementById('vgPeople')){const list=document.createElement('datalist');list.id='vgPeople';list.innerHTML=api.users.map(u=>'<option value="'+h(u.name)+'">'+h(u.department||'')+'</option>').join('');document.body.append(list);}
      if(!dialog.open)dialog.showModal();
      let viewRecord=M.clone(d);const drawerValues=new Map([...dialog.querySelectorAll('[data-grid-drawer-field]')].map(el=>[el.dataset.gridDrawerField,String(el.value)]));
      const hasUnsaved=()=>[...dialog.querySelectorAll('[data-grid-drawer-field]')].some(el=>String(el.value)!==drawerValues.get(el.dataset.gridDrawerField));
      const closeDrawer=()=>{if(hasUnsaved()){dialog.querySelector('.vg-drawer-status').textContent='存在未保存输入，请先修正，或在输入框按Esc取消本次修改。';return false;}dialog.close();return true;};
      dialog.oncancel=e=>{if(hasUnsaved())e.preventDefault();};
      dialog.onclick=e=>{if(e.target.closest('[data-reference-open]')&&!hasUnsaved())openReference(id);if(e.target.closest('[data-drawer-close]'))closeDrawer();const button=e.target.closest('[data-drawer-tab]');if(button&&(!hasUnsaved()||closeDrawer()))drawer(id,button.dataset.drawerTab);if(e.target.closest('[data-drawer-submit]')&&closeDrawer()){preview(selectedPlans('submit',[id]),'提交需求');}if(e.target.closest('[data-drawer-execute]')&&closeDrawer()){ctx.execute(id);}const copy=e.target.closest('[data-vd-copy-material-name],[data-vd-copy-address]');if(copy)navigator.clipboard.writeText(copy.dataset.vdCopyMaterialName||copy.dataset.vdCopyAddress).then(()=>api.toast('已复制')).catch(()=>api.toast('复制失败，请手动复制','warning'));};
      let baseline=null;if(dialog._vgFocusIn)dialog.removeEventListener('focusin',dialog._vgFocusIn);dialog._vgFocusIn=e=>{if(e.target.dataset.gridDrawerField)baseline={snapshot:G.version(viewRecord),record:M.clone(viewRecord),field:e.target.dataset.gridDrawerField,value:e.target.value};};dialog.addEventListener('focusin',dialog._vgFocusIn);
      dialog.onchange=e=>{const f=e.target.dataset.gridDrawerField;if(!f)return;const before=baseline?.field===f?baseline:{snapshot:G.version(viewRecord),record:viewRecord};const plan={kind:'patch',id,expected:before.snapshot,record:before.record,isNew:!ctx.getStore().demands.some(x=>x.id===id),patch:{[f]:e.target.value},description:spec(f).label+' → '+(e.target.value||'空')};const checked=enrich(plan),message=dialog.querySelector('.vg-drawer-status');if(checked.error){message.textContent=checked.error+'；输入未保存，请修正';message.classList.add('is-error');return;}
        if(!G.isDraft(d)&&G.keyFields.includes(f)){dialog.close();preview([plan],'变更关键字段');return;}
        try{const next=latest();perform(next,plan);saveStore(next);state.pending=state.pending.filter(x=>x.id!==id);state.pinned.add(id);drawerValues.set(f,String(e.target.value));viewRecord=M.clone(record(id));dialog.querySelector('.vg-drawer-head h2').textContent=viewRecord.title||'';message.textContent='已自动保存 · '+M.now().slice(11,19)+(M.postNumberWarning(next,viewRecord)?' · '+M.postNumberWarning(next,viewRecord):'');message.classList.remove('is-error');baseline=null;ctx.render();if(f==='expression')drawer(id,'base');}catch(error){message.textContent='保存失败：'+error.message+'；输入已保留';message.classList.add('is-error');}
      };
      dialog.oninput=e=>{if(e.target.dataset.gridDrawerField==='owner'&&e.target.hasAttribute('data-post-owner'))showPostWarning(e.target,record(id),e.target.value);};
      if(dialog._vgFocusOut)dialog.removeEventListener('focusout',dialog._vgFocusOut);dialog._vgFocusOut=e=>{const input=e.target,field=input.dataset.gridDrawerField;if(field&&dialog.open&&String(input.value)!==drawerValues.get(field))queueMicrotask(()=>{if(dialog.open&&input.isConnected&&String(input.value)!==drawerValues.get(field))dialog.onchange?.({target:input});});};dialog.addEventListener('focusout',dialog._vgFocusOut);
      dialog.onkeydown=e=>{if(e.key==='Escape'&&e.target.matches('[data-grid-drawer-field]')&&baseline){e.preventDefault();e.target.value=drawerValues.get(e.target.dataset.gridDrawerField)||'';dialog.querySelector('.vg-drawer-status').textContent='已取消当前未保存输入';}};
    }
    let helpAnchor=null,helpBubble=null;
    function hideHelp(){if(helpAnchor){helpAnchor.setAttribute('aria-expanded','false');helpAnchor.removeAttribute('aria-describedby');}helpBubble?.remove();helpAnchor=null;helpBubble=null;}
    function showHelp(button){
      if(helpAnchor===button)return;hideHelp();const help=helpContent[button.dataset.gridHelp];if(!help)return;
      helpAnchor=button;helpBubble=document.createElement('div');helpBubble.className='vg-help-tooltip';helpBubble.id='vgHeaderTooltip';helpBubble.setAttribute('role','tooltip');
      helpBubble.innerHTML='<strong>'+h(help.title)+'</strong><dl>'+help.rows.map(([name,description])=>'<div><dt>'+h(name)+'</dt><dd>'+h(description)+'</dd></div>').join('')+'</dl>';
      document.body.append(helpBubble);button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby',helpBubble.id);
      const rect=button.getBoundingClientRect(),box=helpBubble.getBoundingClientRect(),left=Math.max(12,Math.min(rect.left,window.innerWidth-box.width-12));
      helpBubble.style.left=left+'px';helpBubble.style.top=(rect.bottom+8+box.height<=window.innerHeight?rect.bottom+8:Math.max(12,rect.top-box.height-8))+'px';
    }
    root.addEventListener('mouseover',e=>{const button=e.target.closest('[data-grid-help]');if(button)showHelp(button);});
    root.addEventListener('mouseout',e=>{const button=e.target.closest('[data-grid-help]');if(button&&!button.contains(e.relatedTarget))hideHelp();});
    root.addEventListener('focusin',e=>{const button=e.target.closest('[data-grid-help]');if(button)showHelp(button);});
    root.addEventListener('focusout',e=>{if(e.target.closest('[data-grid-help]'))hideHelp();});
    root.addEventListener('keydown',e=>{if(e.key==='Escape')hideHelp();});
    root.addEventListener('click',e=>{const button=e.target.closest('[data-grid-help]');if(button){showHelp(button);e.stopPropagation();}});
    root.addEventListener('scroll',hideHelp,true);window.addEventListener('resize',hideHelp);
    root.addEventListener('click',e=>{if(state.active&&e.target.closest('button,select')&&!e.target.closest('.vg-cell')&&!e.target.closest('[data-grid-action="retry"],[data-grid-action="refresh"]')){if(!finishEdit()){e.preventDefault();e.stopImmediatePropagation();}}},true);
    root.addEventListener('submit',e=>{if(state.active&&!finishEdit()){e.preventDefault();e.stopImmediatePropagation();}},true);
    root.addEventListener('click',e=>{
      const button=e.target.closest('button');if(button?.disabled)return;const action=button?.dataset.gridAction;
      if(action==='add')addRow(undefined,button);if(action==='export')exportGrid();if(action==='clear'){state.selected.clear();rerender();}if(action==='batch-edit')batchEdit();
      if(action==='copy'||action==='delete')confirmBatchAction(action);
      if(action==='submit'){const selection=currentSelected(),eligibility=G.batchEligibility(selection);if(!eligibility.allDraft){api.toast(eligibility.submitReason,'warning');return;}preview(selectedPlans(action),'批量提交');}
      if(action==='retry')finishEdit();if(action==='refresh')api.openDialog('读取最新数据','未保存的当前输入将放弃','<p>确认读取其他页面已保存的最新记录？</p>','读取最新',()=>{try{ctx.replaceStore(latest());state.active=null;status('已读取最新记录');rerender();api.closeDialog();}catch(error){api.toast(error.message,'warning');}});
      if(button?.dataset.gridReference)openReference(button.dataset.gridReference);
      if(button?.dataset.gridDetail)drawer(button.dataset.gridDetail);
      if(button?.dataset.gridSubmit)preview(selectedPlans('submit',[button.dataset.gridSubmit]),'提交需求');
      if(button?.dataset.gridExecute)ctx.execute(button.dataset.gridExecute);
      if(button?.dataset.gridPage){state.page=Number(button.dataset.gridPage);state.selected.clear();state.range=null;state.pending=state.pending.filter(d=>!!Object.keys(d).find(k=>G.fields.some(f=>f.key===k)&&d[k]));rerender();}
      const td=e.target.closest('[data-grid-cell]');if(td&&!e.target.closest('button,input,select,textarea')){if(state.drag){state.drag=false;return;}if(e.shiftKey){selectRange(td,true);return;}startEdit(td);}
    });
    root.addEventListener('change',e=>{
      const el=e.target;
      if(el.id==='vgSort'){state.sort=el.value;state.newRows=[];state.selected.clear();state.range=null;rerender();}
      if(el.id==='vgPageSize'){state.size=Number(el.value);state.page=1;state.selected.clear();state.range=null;rerender();}
      if(el.id==='vgSelectAll'){rows().visible.forEach(d=>el.checked?state.selected.add(d.id):state.selected.delete(d.id));rerender();}
      if(el.dataset.gridCheck){el.checked?state.selected.add(el.dataset.gridCheck):state.selected.delete(el.dataset.gridCheck);rerender();}
      if(el.matches('[data-grid-editor]')){state.active.value=el.value;finishEdit();}
    });
    root.addEventListener('focusout',e=>{if(e.target.matches('[data-grid-editor]')&&state.active){state.active.value=e.target.value;queueMicrotask(()=>{if(state.active&&!root.querySelector('[data-grid-editor]:focus'))finishEdit();});}});
    function showPostWarning(input,d,value,extra=''){
      const warning=M.postNumberWarning(ctx.getStore(),{...d,owner:value})||extra,note=input.parentElement.querySelector('.vg-post-warning');if(note){note.textContent=warning;note.hidden=!warning;}input.setAttribute('aria-description',warning);return warning;
    }
    root.addEventListener('input',e=>{if(e.target.matches('[data-grid-editor]')&&state.active){state.active.value=e.target.value;const warning=e.target.hasAttribute('data-post-owner')?showPostWarning(e.target,record(state.active.id),e.target.value):'';status(warning||'正在编辑 · 离开单元格后自动保存');}});
    root.addEventListener('keydown',e=>{
      const td=e.target.closest('[data-grid-cell]');if(!td)return;
      if(e.target.matches('[data-grid-editor]')){
        if(e.key==='Escape'){e.preventDefault();finishEdit(true);return;}
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const pos={id:td.dataset.id,field:td.dataset.field};if(finishEdit())root.querySelector('[data-id="'+pos.id+'"][data-field="'+pos.field+'"]')?.focus();return;}
        if(e.key==='Tab'){e.preventDefault();const pos={row:Number(td.dataset.row),col:Number(td.dataset.col)};if(finishEdit()){const cols=columns(),nextCol=pos.col+(e.shiftKey?-1:1),nextRow=nextCol>=cols.length?pos.row+1:nextCol<0?pos.row-1:pos.row;const target=root.querySelector('[data-grid-cell][data-row="'+nextRow+'"][data-col="'+((nextCol+cols.length)%cols.length)+'"]');target?.focus();if(target)startEdit(target);}return;}
      }else{
        if(e.key==='Enter'){e.preventDefault();startEdit(td);}
        const shifts={ArrowDown:[1,0],ArrowUp:[-1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};if(shifts[e.key]){e.preventDefault();move(td,...shifts[e.key]);}
        if(['Delete','Backspace'].includes(e.key)&&editable(record(td.dataset.id),td.dataset.field)){e.preventDefault();startEdit(td);const input=$('[data-grid-editor]');if(input&&state.active){input.value='';state.active.value='';finishEdit();}}
      }
    });
    root.addEventListener('paste',e=>{const td=e.target.closest('[data-grid-cell]');if(!td)return;const value=e.clipboardData?.getData('text/plain');if(value===undefined)return;if(e.target.tagName==='TEXTAREA'&&!value.includes('\t'))return;
      let matrix;try{matrix=G.parseClipboard(value);}catch(error){e.preventDefault();api.toast(error.message,'warning');return;}
      if(matrix.length===1&&matrix[0].length===1){if(e.target.matches('[data-grid-editor]'))return;e.preventDefault();const d=record(td.dataset.id);if(!editable(d,td.dataset.field)){api.toast('该字段只读，不能粘贴覆盖','warning');return;}if(td.dataset.field==='reference'){previewPaste(value,Number(td.dataset.row),td.dataset.field);return;}startEdit(td);const input=$('[data-grid-editor]');if(input){input.value=matrix[0][0];state.active.value=input.value;finishEdit();}return;}
      e.preventDefault();state.active=null;rerender();previewPaste(value,Number(td.dataset.row),td.dataset.field);
    });
    root.addEventListener('copy',e=>{if(e.target.matches('input,textarea'))return;const td=e.target.closest('[data-grid-cell]');if(!td)return;const range=state.range||{start:{row:Number(td.dataset.row),col:Number(td.dataset.col)},end:{row:Number(td.dataset.row),col:Number(td.dataset.col)}};const data=rows().visible,cols=columns(),out=[];for(let i=Math.min(range.start.row,range.end.row);i<=Math.max(range.start.row,range.end.row);i++)out.push(cols.slice(Math.min(range.start.col,range.end.col),Math.max(range.start.col,range.end.col)+1).map(c=>{const value=text(data[i],c.key);return /[\t\r\n"]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;}).join('\t'));e.preventDefault();e.clipboardData.setData('text/plain',out.join('\n'));});
    root.addEventListener('pointerdown',e=>{const td=e.target.closest('[data-grid-cell]');if(td&&!e.target.matches('input,select,textarea,button')){state.anchor=td;state.drag=false;}});
    root.addEventListener('pointerover',e=>{const td=e.target.closest('[data-grid-cell]');if(e.buttons===1&&state.anchor&&td&&td!==state.anchor&&!state.active){if(!state.drag)selectRange(state.anchor);state.drag=true;selectRange(td,true);}});
    if(!document.getElementById('vgPeople')){const list=document.createElement('datalist');list.id='vgPeople';list.innerHTML=api.users.map(u=>'<option value="'+h(u.name)+'">'+h(u.department||'')+'</option>').join('');document.body.append(list);}
    window.addEventListener('beforeunload',e=>{if(state.active&&state.active.value!==state.active.original){e.preventDefault();e.returnValue='';}});
    return {markup,addRow,drawer,exportGrid,isEditing:()=>!!state.active||!!state.referenceEditing,onExternal:()=>status('记录已在其他页面更新；保存时将再次校验版本',true),clearSelection:()=>{state.selected.clear();state.range=null;state.pinned.clear();state.newRows=[];},config};
  };
})();

})();