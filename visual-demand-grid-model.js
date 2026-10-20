(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
(function(global){
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./visual-demand-records-model.js'):global.VisualDemandRecordsModel;
  const fields=[
    ['title','需求名称','text',true],['spu','需求SPU','text',true],['businessChannel','业务渠道','select',true],['productLevel','产品级别','select',true],['demandSource','需求来源','select',true],
    ['requestDate','下需时间','date',true],['ddl','DDL','date',true],['channelCategory','渠道归类','select',true],['materialType','素材格式','select',true],
    ['expression','表达方式','select',true],['mainSellingPoint','主卖点','select',true],['scene','场景','select',true],['secondarySellingPoint','辅助卖点','select',false],['bodyType','模特体型','select',false],['materialCategory','素材类型','select',true],
    ['requirements','制作要求','long',false],['reference','制作参考','reference',false],['fbInfo','FB信息','long',false],['edmInfo','EDM信息','long',false],['requester','需求对接人','person',true],['priority','优先级','select',true],['owner','制作人','person',false]
  ].map(([key,label,type,required])=>({key,label,type,required}));
  const adFields=M.adTeamDemandFormSections.flatMap(x=>x.fields);
  const commonFields=['title','spu','channelCategory','materialType','requestDate','ddl','requester','priority','owner'];
  const keyFields=fields.filter(f=>!['long','reference'].includes(f.type)&&!['secondarySellingPoint','bodyType'].includes(f.key)).map(f=>f.key);
  const isDraft=d=>d?.submissionState==='draft';
  const identity=actor=>typeof actor==='object'&&actor?{id:String(actor.id||''),name:String(actor.name||'')}:{id:'',name:String(actor||'')};
  function draftIdentity(d){
    const creation=(d.logs||[]).slice().reverse().find(log=>['创建草稿','复制需求'].includes(log.action))||(d.logs||[]).at(-1);
    return {id:d.draftOwnerId||d.createdById||'',name:d.draftOwnerName||d.createdBy||creation?.actor||''};
  }
  function canViewDemand(d,actor){if(!d||d.deletedAt)return false;if(!isDraft(d))return true;const owner=draftIdentity(d),user=identity(actor);return owner.id?Boolean(user.id&&owner.id===user.id):Boolean(owner.name&&owner.name===user.name);}
  function assertDraftAccess(d,actor){if(isDraft(d)&&!canViewDemand(d,actor))throw new Error('草稿仅创建人可见和操作。');}
  function normalizeDraftOwnership(store,users=[]){let changed=false;for(const d of store.demands){if(!isDraft(d))continue;const owner=draftIdentity(d);if(!owner.id&&owner.name){const matches=users.filter(u=>u.name===owner.name);if(matches.length===1)owner.id=String(matches[0].id||'');}if(!owner.id&&!owner.name)continue;for(const [key,value] of Object.entries({draftOwnerId:owner.id,draftOwnerName:owner.name})){if(d[key]!==value){d[key]=value;changed=true;}}}return changed;}
  function batchEligibility(records){
    const sameType=records.length>0&&new Set(records.map(d=>d.demandType)).size===1&&M.demandTypes.some(t=>t.value===records[0].demandType),allDraft=records.length>0&&records.every(isDraft);
    return {sameType,allDraft,editReason:sameType?'':'仅支持批量修改相同需求类型的数据',submitReason:allDraft?'':'仅支持批量提交行状态为草稿的数据，请先取消勾选已提交的数据'};
  }
  function batchFields(records){if(!batchEligibility(records).sameType)throw new Error('仅支持批量修改相同需求类型的数据');return fields.filter(f=>allowed(records[0],f.key));}
  function sortDemands(records,sort='request-desc'){
    const compare=sort==='ddl-asc'?(a,b)=>(a.ddl||'9999').localeCompare(b.ddl||'9999'):sort==='created-desc'?(a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''):sort==='id-asc'?(a,b)=>a.id.localeCompare(b.id):(a,b)=>(b.requestDate||'').localeCompare(a.requestDate||'')||(b.createdAt||'').localeCompare(a.createdAt||'');
    return records.slice().sort((a,b)=>Number(isDraft(b))-Number(isDraft(a))||compare(a,b)||a.id.localeCompare(b.id));
  }
  const version=d=>JSON.stringify(d||null);
  const allowed=(d,key)=>fields.some(f=>f.key===key)&&(d.demandType!=='ad-team'||adFields.includes(key));
  const fieldKeysForType=type=>(type==='ad-team'?adFields:fields.map(f=>f.key)).slice();
  function referenceValue(d){return {text:String(d?.reference||''),items:M.clone(d?.referenceItems||[])};}
  function normalizeReference(value){
    if(!value||typeof value!=='object'||!Array.isArray(value.items))throw new Error('制作参考格式无效。');
    const text=String(value.text||'').trim();if(text.length>1500)throw new Error('参考说明最多1500个字符。');
    const seen=new Set(),items=value.items.map(item=>{
      if(!item||!['image','video','link'].includes(item.kind)||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)||seen.has(item.id))throw new Error('参考项格式无效或编号重复。');seen.add(item.id);
      if(item.kind==='link'){let url;try{url=new URL(String(item.url||'').trim());}catch{throw new Error('请输入完整的HTTP/HTTPS参考链接。');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('参考链接仅支持HTTP/HTTPS地址。');if(url.href.length>2048)throw new Error('参考链接最多2048个字符。');return {id:item.id,kind:'link',url:url.href,name:String(item.name||url.href).slice(0,500)};}
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(item.assetKey||'')||!Number.isSafeInteger(item.size)||item.size<=0||!String(item.mime||'').startsWith(item.kind+'/'))throw new Error('图片或视频文件信息无效。');
      return {id:item.id,kind:item.kind,assetKey:item.assetKey,name:String(item.name||'未命名文件').slice(0,500),size:item.size,mime:item.mime};
    });return {text,items};
  }
  function referenceSummary(d){const v=referenceValue(d),counts=['image','video','link'].map((kind,i)=>{const n=v.items.filter(x=>x.kind===kind).length;return n?['图片','视频','链接'][i]+' '+n+' 项':'';}).filter(Boolean);return [v.text,...counts].filter(Boolean).join(' · ');}
  function parseClipboard(input){
    const text=String(input).replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false,after=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;after=true;}}else cell+=c;continue;}
      if(c==='"'&&!cell&&!after){quoted=true;continue;}
      if(c==='\t'){row.push(cell);cell='';after=false;}
      else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';after=false;}
      else{if(after)throw new Error('粘贴内容的引号格式不正确，请复制未合并的单元格区域。');cell+=c;}
    }
    if(quoted)throw new Error('粘贴内容包含未闭合引号，请核对单元格换行格式。');
    row.push(cell);rows.push(row);while(rows.length>1&&rows.at(-1).every(v=>v===''))rows.pop();
    if(rows.some(r=>r.length!==rows[0].length))throw new Error('粘贴内容每行列数不同，请取消合并单元格后重试。');
    if(rows.length>1000)throw new Error('一次最多粘贴1000行，请拆分操作。');return rows;
  }
  function normalize(field,value,config,d){
    let v=String(value??'').trim();const f=fields.find(f=>f.key===field);if(!f||!allowed(d,field))throw new Error('该字段只读或不适用于此需求类型。');
    if(f.type==='reference'&&value&&typeof value==='object')return normalizeReference(value);
    const max=field==='title'?120:['long','reference'].includes(f.type)?1500:200;if(v.length>max)throw new Error(f.label+'最多'+max+'个字符。');
    if(!v)return '';
    if(f.type==='date'){const date=M.dateValue(v);if(!date)throw new Error(f.label+'格式无效，请使用YYYY-MM-DD。');return date;}
    if(f.type==='person'){if(field==='owner'&&M.usesPostNumber(d.expression))M.validateProducer(d,v,config.users||[],false);else if(!(config.users||[]).includes(v))throw new Error(f.label+'不存在，请选择平台人员。');}
    if(f.type==='select'){
      const values=config.options(field,d),matches=values.filter(o=>o.value===v||o.label===v);
      const exact=matches.find(o=>o.value===v);if(exact)return exact.value;
      if(matches.length!==1)throw new Error(f.label+'不是有效选项，请核对配置。');return matches[0].value;
    }
    return v;
  }
  function requiredIssues(d,config){
    const issues=[];
    if(!M.demandTypes.some(t=>t.value===d.demandType))issues.push('请选择需求类型');
    fields.filter(f=>f.required&&allowed(d,f.key)).forEach(f=>{
      if(!String(d[f.key]||'').trim())issues.push(f.label+'不能为空');
      else try{normalize(f.key,d[f.key],config,d);}catch(e){issues.push(e.message);}
    });
    if(d.owner)try{M.validateProducer(d,d.owner,config.users||[],false);}catch(error){issues.push(error.message);}
    if(d.requestDate&&d.ddl&&d.requestDate>d.ddl)issues.push('DDL不能早于下需时间');
    return issues;
  }
  function emptyDraft(type='visual-team',actor='管理员'){
    if(!M.demandTypes.some(t=>t.value===type))throw new Error('请选择需求类型。');
    const user=identity(actor);return {id:M.uid('VD'),demandType:type,submissionState:'draft',status:'',createdById:user.id,createdBy:user.name,draftOwnerId:user.id,draftOwnerName:user.name,source:{system:'PLATFORM'},logs:[],createdAt:M.now(),updatedAt:M.now(),revision:0};
  }
  function assertVersion(d,expected){if(expected!==undefined&&version(d)!==expected)throw new Error('数据冲突：该记录已在其他页面修改，请读取最新记录后重试。');}
  function changedValues(d,patch,config){
    const next={...d},changes=[];
    if(Object.hasOwn(patch,'expression')){
      const expression=normalize('expression',patch.expression,config,d);next.expression=expression;
      if(M.usesPostNumber(d.expression)!==M.usesPostNumber(expression)&&!Object.hasOwn(patch,'owner')&&d.owner){next.owner='';changes.push({field:'owner',label:'制作人',before:d.owner,after:''});}
    }
    for(const [key,value] of Object.entries(patch)){
      const normalized=normalize(key,value,config,next);
      if(key==='reference'&&normalized&&typeof normalized==='object'){
        const before=referenceValue(d);if(JSON.stringify(before)===JSON.stringify(normalized))continue;
        next.reference=normalized.text;next.referenceItems=normalized.items;
        changes.push({field:key,label:'制作参考',before,after:M.clone(normalized)});continue;
      }
      if(normalized===String(d[key]??''))continue;
      next[key]=normalized;changes.push({field:key,label:fields.find(f=>f.key===key).label,before:d[key]??'',after:normalized});
    }
    if(!isDraft(d)){M.assertDemandMutable(d);if(!isDraft(next)){
      const prior=requiredIssues(d,config),errors=requiredIssues(next,config).filter(e=>!prior.includes(e));if(errors.length)throw new Error(errors.join('；'));
    }}
    if(next.requestDate&&next.ddl&&next.requestDate>next.ddl)throw new Error('DDL不能早于下需时间。');
    if(next.completionDate&&Object.hasOwn(patch,'requestDate')){const days=M.productionDays(next.requestDate,next.completionDate);if(days===null||days<0)throw new Error('下需时间不能晚于已记录的完成日期。');next.productionDays=days;}
    if(d.demandType==='ad-team'){
      next.businessChannel=d.businessChannel||'DTC';
    }
    if(!isDraft(d)&&['待分配','待制作'].includes(d.status))next.status=M.initialProgressStatus(next.owner);
    return {next,changes};
  }
  function savePatch(store,{id,patch,expected,isNew=false,record,confirmed=false},actor,config){
    const old=store.demands.find(d=>d.id===id);
    if(isNew&&old)throw new Error('该草稿已经保存，请刷新记录后重试。');
    const d=old||record;if(!d||d.deletedAt)throw new Error('记录不存在或已删除。');
    assertDraftAccess(d,actor);if(old)assertVersion(old,expected);
    if(!isDraft(d))M.assertDemandMutable(d);
    const {next,changes}=changedValues(d,patch,config);
    if(!isDraft(d)&&changes.some(c=>keyFields.includes(c.field))&&!confirmed)throw new Error('已提交需求的关键字段变更需要确认。');
    if(!changes.length){if(isNew)throw new Error('空白行不创建业务记录，请先填写内容。');return {record:d,unchanged:true};}
    next.revision=(old?.revision||0)+1;next.logs=M.clone(d.logs||[]);
    M.appendLog(next,old?'表格编辑':'创建草稿',changes.map(c=>{const display=v=>v&&typeof v==='object'?referenceSummary({reference:v.text,referenceItems:v.items}):v;return c.label+'：'+(display(c.before)||'空')+' → '+(display(c.after)||'空');}).join('；'),identity(actor).name);
    Object.assign(next.logs[0],{changes:M.clone(changes)});
    if(old)store.demands.splice(store.demands.indexOf(old),1,next);else store.demands.unshift(next);
    return {record:next,changes};
  }
  function submit(store,{id,expected},actor,config){
    const d=store.demands.find(d=>d.id===id&&!d.deletedAt);if(!d)throw new Error('需求不存在或已删除。');assertVersion(d,expected);assertDraftAccess(d,actor);
    if(!isDraft(d))throw new Error('该需求已经提交，不能重复提交。');
    const errors=requiredIssues(d,config);if(errors.length)throw new Error(errors.join('；'));
    Object.assign(d,{submissionState:'submitted',submittedAt:M.now(),submittedBy:identity(actor).name,status:M.initialProgressStatus(d.owner),revision:(d.revision||0)+1});
    M.appendLog(d,'提交需求','草稿 → '+d.status,identity(actor).name);return d;
  }
  function deleteRecord(store,{id,expected},actor){
    const d=store.demands.find(d=>d.id===id&&!d.deletedAt);if(!d)throw new Error('需求不存在或已删除。');assertVersion(d,expected);assertDraftAccess(d,actor);
    if(store.materials.some(m=>m.demandId===id&&!m.deletedAt))throw new Error('需求已有交付素材，不能删除，请先处理关联记录。');
    if(store.namings.some(n=>!n.deletedAt&&(n.demandId===id||n.legacyDemandId===id||store.materials.some(m=>m.demandId===id&&m.id===n.materialId))))throw new Error('需求存在关联广告，请先处理关联记录。');
    if(!isDraft(d)&&!M.canDeleteDemand(d))throw new Error('仅草稿、待分配、待制作、项目暂停的需求支持删除。');
    Object.assign(d,{deletedAt:M.now(),deletedBy:identity(actor).name,revision:(d.revision||0)+1});M.appendLog(d,'删除需求','在线表格确认删除，保留历史记录',identity(actor).name);return d;
  }
  function copyRecord(d,actor='管理员'){
    assertDraftAccess(d,actor);const next=emptyDraft(d.demandType,actor);
    const businessKeys=[...fields.map(f=>f.key),'referenceItems','completionDate','version','executionOwner','executionUrl','executionUrlMode','executionMaterialName','executionMethod','remark'];
    for(const key of businessKeys)if(Object.hasOwn(d,key))next[key]=M.clone(d[key]);
    next.requester=identity(actor).name;
    const days=M.productionDays(next.requestDate,next.completionDate);next.productionDays=days!==null&&days>=0?days:null;
    return next;
  }
  const api={identity,draftIdentity,canViewDemand,assertDraftAccess,normalizeDraftOwnership,batchEligibility,batchFields,sortDemands,fieldKeysForType,referenceValue,normalizeReference,referenceSummary,fields,commonFields,keyFields,isDraft,version,allowed,parseClipboard,normalize,requiredIssues,emptyDraft,assertVersion,changedValues,savePatch,submit,deleteRecord,copyRecord};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.VisualDemandGridModel=api;
})(typeof window!=='undefined'?window:globalThis);

})();