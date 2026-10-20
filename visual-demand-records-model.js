(() => {
  const localStorage = window.aiMaterialStandaloneStorage;
(function (global) {
  'use strict';
  const demandTypes = [{value:'visual-team',label:'视觉组制作'},{value:'ad-team',label:'投放组制作'}];
  const visualProgressStatuses = ['制作中','已完成','项目暂停','待制作','待分配'];
  const legacyStatuses = ['待处理','进行中','已交付','已关闭','已取消'];
  const statuses = visualProgressStatuses;
  const transitions = Object.fromEntries(statuses.map(status=>[status,['已完成','项目暂停'].includes(status)?[status]:statuses]));
  const now = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  const uid = prefix => prefix + '-' + now().slice(0,10).replaceAll('-','') + '-' + (global.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()).replaceAll('-','').slice(0,12).toUpperCase();
  const clone = value => JSON.parse(JSON.stringify(value));
  function parseCsv(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const rows=[]; let row=[], cell='', quoted=false, afterQuote=false;
    for (let i=0;i<text.length;i++) {
      const c=text[i];
      if(afterQuote && ![',','\n','\r'].includes(c)){if(c===' '||c==='\t')continue;throw new Error('CSV 引号结束后包含无效内容。');}
      if (c==='"') { if (quoted && text[i+1]==='"') {cell+='"';i++;} else if (quoted) {quoted=false;afterQuote=true;} else if (!cell) quoted=true; else throw new Error('CSV 引号格式不正确，请重新导出。'); }
      else if (c===',' && !quoted) {row.push(cell);cell='';afterQuote=false;}
      else if ((c==='\n'||c==='\r')&&!quoted) {if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';afterQuote=false;}
      else cell+=c;
    }
    if(quoted)throw new Error('CSV 存在未闭合的引号。');
    row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
    if(rows.length<2)throw new Error('文件需要表头和至少一条数据。');
    const headers=rows.shift().map(v=>v.trim());
    if(headers.some(v=>!v)||new Set(headers).size!==headers.length)throw new Error('表头不能为空或重复，请核对列名。');
    if(rows.length>5000)throw new Error('每批最多导入 5000 行，请拆分文件。');
    return {headers,rows:rows.map((values,index)=>{if(values.length!==headers.length)throw new Error('第 '+(index+2)+' 行列数与表头不一致。');return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));})};
  }
  function toCsv(headers,rows) {
    const cell = value => {let s=String(value??'');if(/^(?:\s*[=+\-@]|[\t\r])/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  }
  function safeUrl(value) {try {const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
  function isUncPath(value) {
    const text=String(value||'').trim();
    if(!text.startsWith('\\\\')||/[<>:"|?*\x00-\x1f]/.test(text))return false;
    const parts=text.slice(2).split('\\');
    if(parts.at(-1)==='')parts.pop();
    return parts.length>=2&&parts.every(part=>part&&part!=='.'&&part!=='..'&&!part.includes('/'))&&!/\s/.test(parts[0]);
  }
  function isMaterialAddress(value) {const text=String(value||'').trim();return text.length<=2048&&Boolean(safeUrl(text)||isUncPath(text));}
  function materialLinkTarget(value) {
    const web=safeUrl(value);if(web)return web;
    if(!isUncPath(value))return '';
    const [host,...parts]=String(value).trim().slice(2).split('\\');
    if(!/^[a-z0-9._-]+$/i.test(host))return '';
    return 'file://'+host+'/'+parts.map(part=>encodeURIComponent(part)).join('/');
  }
  function usesPostNumber(expression){return ['IGUGC','TTSUGC','IG原生口播','TTS口播'].includes(String(expression||'').trim().replace(/[\s_-]+/g,'').toUpperCase());}
  function postNumberWarning(store,demand){const number=String(demand.owner||'').trim();return usesPostNumber(demand.expression)&&number&&(store.demands||[]).some(other=>!other.deletedAt&&other.id!==demand.id&&usesPostNumber(other.expression)&&String(other.owner||'').trim()===number)?'该帖子编号已存在，仍可继续填写和保存。':'';}
  function validateProducer(demand,owner,validOwners=[],required=true){const value=String(owner||'').trim();if(usesPostNumber(demand.expression)){if(required&&!value)throw new Error('请输入帖子编号。');if(value.length>200)throw new Error('帖子编号最多200个字符。');}else if((required&&!value)||(value&&validOwners.length&&!validOwners.includes(value)))throw new Error('请选择平台内的制作人。');return value;}
  function assignDemandProducer(store,id,owner,actor='管理员',validOwners=[]) {
    const d=store.demands.find(v=>v.id===id);if(!d)throw new Error('需求不存在。');
    assertDemandMutable(d);
    if(d.submissionState==='draft')throw new Error('请先提交需求，再分配制作人。');
    if(d.status!=='待分配')throw new Error('需求已不处于待分配状态，请刷新列表。');
    owner=String(owner||'').trim();
    validateProducer(d,owner,validOwners);if(!usesPostNumber(d.expression)&&!validOwners.includes(owner))throw new Error('请选择平台内的制作人。');
    d.owner=owner;d.status='待制作';
    appendLog(d,'分配制作人','制作人：'+owner+'；待分配 → 待制作',actor);
    return d;
  }
  function generateMaterialAddress({completionDate,businessChannel='',channelCategory='',producer='',spu=''}) {
    const date=dateValue(completionDate);if(!date)return '';
    const business=String(businessChannel)==='OTHER'?'其它':String(businessChannel);
    const channel=({'Paid-Social':'Paid Social','Paid-Search':'Paid Search'})[channelCategory]||String(channelCategory);
    const other=business.includes('其它'),group=other?'其它':business.includes('AMZ')?'AMZ':'DTC';
    const folder=[['Paid Social','FB推广'],['Paid Search','谷歌推广'],['Email','EDM'],['WEB','站内'],['OTH','其他']].find(([text])=>channel.includes(text))?.[1]||channel.replaceAll(' ','');
    const parts=[String(Number(date.slice(0,4))),...(!other?[folder]:[]),Number(date.slice(5,7))+'月',String(producer),String(spu)];
    return String.raw`\\192.168.0.150\赵河东\FIOBOC素材-`+group+'\\'+parts.join('\\').replaceAll('*','');
  }
  function dateValue(value) {
    if(!value)return '';
    const m=String(value).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
    if(!m)return null;
    const result=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    const d=new Date(result+'T00:00:00Z');
    return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===result?result:null;
  }
  const demandFilterDefaults = {demandId:'',title:'',spu:'',demandType:'',submissionState:'',status:'',priority:'',owner:'',requester:'',productLevel:'',channelCategory:'',demandSource:'',requestStart:'',requestEnd:'',ddlStart:'',ddlEnd:''};
  function normalizeDemandFilters(input={}) {
    return Object.fromEntries(Object.keys(demandFilterDefaults).map(key=>[key,typeof input?.[key]==='string'?input[key].trim().slice(0,200):'']));
  }
  function validateDemandFilters(input) {
    const filters=normalizeDemandFilters(input);
    for(const [prefix,label] of [['request','下需日期'],['ddl','DDL']]) {
      const start=filters[prefix+'Start'],end=filters[prefix+'End'];
      if([start,end].some(value=>value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||dateValue(value)!==value)))throw new Error(label+'格式无效，请重新选择日期。');
      if(start&&end&&start>end)throw new Error(label+'开始日期不能晚于结束日期。');
    }
    if(filters.demandType&&!demandTypes.some(t=>t.value===filters.demandType))throw new Error('需求类型筛选无效，请重新选择。');
    if(filters.status&&!statuses.includes(filters.status))throw new Error('进度状态筛选无效，请重新选择。');
    if(filters.submissionState&&!['draft','submitted'].includes(filters.submissionState))throw new Error('提交状态筛选无效。');
    if(filters.priority&&!['P0','P1','P2'].includes(filters.priority))throw new Error('优先级筛选无效，请重新选择。');
    return filters;
  }
  function demandMatchesFilters(demand,input) {
    const f=normalizeDemandFilters(input);
    if(demand.deletedAt)return false;
    if(f.submissionState&&(demand.submissionState==='draft'?'draft':'submitted')!==f.submissionState)return false;
    if(f.status&&demand.submissionState==='draft')return false;
    return [['demandId','id'],['title','title'],['spu','spu']].every(([key,field])=>!f[key]||String(demand[field]||'').toLowerCase().includes(f[key].toLowerCase()))&&
      ['demandType','status','priority','owner','requester','productLevel','channelCategory','demandSource'].every(key=>!f[key]||demand[key]===f[key])&&
      [['request','requestDate'],['ddl','ddl']].every(([prefix,field])=>{const date=dateValue(demand[field]);return (!f[prefix+'Start']||(date&&date>=f[prefix+'Start']))&&(!f[prefix+'End']||(date&&date<=f[prefix+'End']));});
  }
  function filterStorageKey(userId) {if(!userId||typeof userId!=='string')throw new Error('缺少登录人员标识，暂时无法保存筛选。');return 'ai-visual-demand-filters-v1:'+encodeURIComponent(userId);}
  function encodeFilterPreference(userId,filters) {filterStorageKey(userId);return JSON.stringify({version:1,userId,filters:validateDemandFilters(filters)});}
  function decodeFilterPreference(userId,value) {
    filterStorageKey(userId);const preference=JSON.parse(value);
    if(preference?.version!==1||preference.userId!==userId||!preference.filters||typeof preference.filters!=='object'||Array.isArray(preference.filters))throw new Error('已保存的筛选条件无法读取，请重新设置并保存。');
    return validateDemandFilters(preference.filters);
  }
  const materialFilterDefaults={materialId:'',name:'',sourceDemand:'',demandType:'',spu:'',producer:'',completionStart:'',completionEnd:''};
  function normalizeMaterialFilters(input={}) {
    return Object.fromEntries(Object.keys(materialFilterDefaults).map(key=>[key,typeof input?.[key]==='string'?input[key].trim().slice(0,200):'']));
  }
  function validateMaterialFilters(input) {
    const f=normalizeMaterialFilters(input),start=f.completionStart,end=f.completionEnd;
    if([start,end].some(value=>value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||dateValue(value)!==value)))throw new Error('完成日期格式无效，请重新选择日期。');
    if(start&&end&&start>end)throw new Error('完成日期开始日期不能晚于结束日期。');
    if(f.demandType&&!demandTypes.some(type=>type.value===f.demandType))throw new Error('需求类型筛选无效，请重新选择。');
    return f;
  }
  function materialMatchesFilters(material,demand,input,generatedName='') {
    const f=normalizeMaterialFilters(input),includes=(value,query)=>!query||String(value||'').toLowerCase().includes(query.toLowerCase());
    const date=dateValue(material.deliveredAt||demand.completionDate);
    return includes(material.id,f.materialId)&&includes(generatedName||material.name,f.name)&&
      (!f.sourceDemand||[demand.id,demand.title].some(value=>includes(value,f.sourceDemand)))&&
      includes(demand.spu,f.spu)&&(!f.demandType||demand.demandType===f.demandType)&&
      (!f.producer||(material.deliveredBy||demand.executionOwner||demand.owner)===f.producer)&&
      (!f.completionStart||(Boolean(date)&&date>=f.completionStart))&&(!f.completionEnd||(Boolean(date)&&date<=f.completionEnd));
  }
  function materialFilterStorageKey(userId) {filterStorageKey(userId);return 'ai-visual-material-filters-v1:'+encodeURIComponent(userId);}
  function encodeMaterialFilterPreference(userId,filters) {materialFilterStorageKey(userId);return JSON.stringify({version:1,kind:'materials',userId,filters:validateMaterialFilters(filters)});}
  function decodeMaterialFilterPreference(userId,value) {
    materialFilterStorageKey(userId);const preference=JSON.parse(value);
    if(preference?.version!==1||preference.kind!=='materials'||preference.userId!==userId||!preference.filters||typeof preference.filters!=='object'||Array.isArray(preference.filters))throw new Error('已保存的素材筛选条件无法读取，请重新设置并保存。');
    return validateMaterialFilters(preference.filters);
  }
  function updateMaterialUrl(store,materialId,url,actor='管理员') {
    const material=store.materials.find(m=>m.id===materialId&&!m.deletedAt);if(!material)throw new Error('素材记录不存在或已删除。');
    const demand=store.demands.find(d=>d.id===material.demandId);if(!demand||demand.deletedAt)throw new Error('来源需求不存在或已删除，无法同步素材URL。');
    url=String(url||'').trim();if(!url&&d.demandType!=='ad-team')throw new Error('请填写素材URL。');
    if(url&&!isMaterialAddress(url))throw new Error('请填写有效的 HTTP/HTTPS 链接或局域网共享路径。');
    const at=now();
    material.url=url;material.updatedAt=at;
    Object.assign(demand,{executionUrl:url,executionUrlMode:'manual',materialUrlUpdatedAt:at,executionMaterialId:material.id});
    appendLog(demand,'修改素材URL','素材：'+material.id+'；已同步需求交付地址',actor);
    return {material,demand};
  }
  function assertMaterialWrite(store,demandId,materialId='') {
    if(!store.demands.some(d=>d.id===demandId&&!d.deletedAt))throw new Error('关联需求不存在。');
    if(materialId) {if(!store.materials.some(m=>m.id===materialId&&m.demandId===demandId&&!m.deletedAt))throw new Error('关联素材不存在或不属于当前需求。');return;}
    if(store.materials.some(m=>m.demandId===demandId&&!m.deletedAt))throw new Error('本期每个需求仅登记一份素材信息，请编辑已有素材。');
  }
  const initialProgressStatus = owner => String(owner||'').trim()?'待制作':'待分配';
  function canonicalProgressStatus(status,owner='') {
    if(statuses.includes(status))return status;
    if(['已交付','已关闭'].includes(status))return '已完成';
    if(['进行中','任务处理中'].includes(status))return '制作中';
    if(['已取消','项目暂停'].includes(status))return '项目暂停';
    return initialProgressStatus(owner);
  }
  function normalizeProgressStore(store) {
    let changed=false;
    store.demands.forEach(d=>{
      const status=d.submissionState==='draft'?'':canonicalProgressStatus(d.status||d.progressStatus,d.owner);
      if(d.status!==status){if(d.status&&d.submissionState!=='draft'&&!d.legacyStatus)d.legacyStatus=d.status;d.status=status;changed=true;}
      if(Object.prototype.hasOwnProperty.call(d,'progressStatus')){d.legacyProgressStatus=d.progressStatus;delete d.progressStatus;changed=true;}
    });
    if(store.progressStatusSchemaVersion!==2){store.progressStatusSchemaVersion=2;changed=true;}
    return changed;
  }
  const canDeleteDemand = demand => Boolean(demand)&&!demand.deletedAt&&['待分配','待制作','项目暂停'].includes(demand.status);
  function deleteDemand(store,id,actor='管理员') {
    const d=store.demands.find(v=>v.id===id);if(!d||d.deletedAt)throw new Error('需求不存在或已删除，请刷新列表。');
    if(!canDeleteDemand(d))throw new Error('仅待分配、待制作、项目暂停的需求支持删除，请刷新列表。');
    const at=now();Object.assign(d,{deletedAt:at,deletedBy:actor});
    appendLog(d,'删除需求','进度状态：'+d.status+'；需求从业务列表移除',actor);
    return d;
  }
  const canModifyDemand = demand => Boolean(demand)&&!demand.deletedAt&&!['已完成','项目暂停'].includes(canonicalProgressStatus(demand.status,demand.owner));
  function assertDemandMutable(demand) {if(demand?.deletedAt)throw new Error('需求已删除，不能修改。');if(!canModifyDemand(demand))throw new Error('已完成或项目暂停的需求不允许修改。');}
  const adTeamDemandFormSections=[
    {title:'基础信息',fields:['title','spu','channelCategory','materialType','requestDate','ddl']},
    {title:'内容与制作要求',fields:['expression','mainSellingPoint','scene','materialCategory']},
    {title:'协作信息',fields:['requester','priority','owner']}
  ];
  function prepareAdTeamDemandValues(existing,values,channelLabel='') {
    if(values.demandType!=='ad-team')return values;
    const allowed=['demandType',...adTeamDemandFormSections.flatMap(section=>section.fields),'id','createdAt','updatedAt','linkedTaskIds'];
    const result={...existing,...Object.fromEntries(allowed.filter(key=>Object.hasOwn(values,key)).map(key=>[key,values[key]]))};
    result.title=String(result.title||'').trim();
    result.businessChannel=existing&&Object.hasOwn(existing,'businessChannel')?existing.businessChannel:'DTC';
    return result;
  }
  function prepareDemandRecord(existing,values) {
    if(existing){assertDemandMutable(existing);if(String(values.demandType||'')!==String(existing.demandType||''))throw new Error('编辑需求不支持修改需求类型。');}
    else if(!demandTypes.some(type=>type.value===values.demandType))throw new Error('请选择需求类型。');
    const owner=String(values.owner||'').trim();
    const current=existing?canonicalProgressStatus(existing.status,existing.owner):'';
    const status=!existing||!owner||['待制作','待分配'].includes(current)?initialProgressStatus(owner):current;
    return {...existing,...values,owner,status,demandType:existing?existing.demandType||'':values.demandType};
  }
  function productionDays(requestDate,completionDate) {
    const start=dateValue(requestDate),end=dateValue(completionDate);
    if(!start||!end)return null;
    return Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
  }
  function visualExecutionDefaults(demand,actor,today=now().slice(0,10)) {
    const saved=Boolean(demand.executionUpdatedAt);
    return {status:visualProgressStatuses.includes(demand.status)?demand.status:(['已交付','已关闭'].includes(demand.status)?'已完成':'制作中'),owner:usesPostNumber(demand.expression)?demand.owner||'':saved?demand.owner||actor:actor,completionDate:saved?demand.completionDate||today:today,version:saved?demand.version||'V1':'V1'};
  }
  function saveDemandExecution(store,demandId,input,actor='管理员',validOwners=[],namingProvider=null) {
    const d=store.demands.find(v=>v.id===demandId);if(!d)throw new Error('需求不存在。');
    assertDemandMutable(d);
    if(d.submissionState==='draft')throw new Error('请先提交需求，再执行制作。');
    if(d.status==='待分配')throw new Error('请先分配制作人，再执行需求。');
    if(!demandTypes.some(type=>type.value===d.demandType))throw new Error('请先补充需求类型。');
    const status=String(input.status||''),owner=String(input.owner||'').trim(),version=String(input.version||'').trim(),completionDate=String(input.completionDate||''),url=String(input.url||'').trim();
    if(!visualProgressStatuses.includes(status))throw new Error('请选择有效的进度状态。');
    validateProducer(d,owner,validOwners);
    if(!version||version.length>200)throw new Error('请填写版本，最多200个字符。');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(completionDate)||dateValue(completionDate)!==completionDate)throw new Error('请选择有效的完成日期。');
    const days=productionDays(d.requestDate,completionDate);
    if(days===null)throw new Error('请先在需求基础信息中补充有效的下需日期。');
    if(days<0)throw new Error('完成日期不能早于下需日期。');
    if(!url&&d.demandType!=='ad-team')throw new Error('请填写素材URL。');
    if(url&&!isMaterialAddress(url))throw new Error('请填写有效的 HTTP/HTTPS 链接或局域网共享路径。');
    const mats=store.materials.filter(m=>m.demandId===demandId&&!m.deletedAt);
    let material;
    if(mats.length>1){material=mats.find(m=>m.id===input.materialId);if(!material)throw new Error('该需求有多份历史素材，请明确选择本次更新的素材记录。');}
    else {material=mats[0];if(input.materialId&&input.materialId!==material?.id)throw new Error('关联素材已变化，请重新打开执行需求。');}
    if(material||url||status==='已完成')assertMaterialWrite(store,demandId,material?.id||'');
    // Validate everything before writing so failed execution cannot partially change demand/material.
    const naming=namingProvider?namingProvider(d,{owner,completionDate,version}):null;
    const at=now(),previous=d.status;
    Object.assign(d,{status,owner,executionOwner:owner,executionUrl:url,executionUrlMode:input.urlMode==='auto'?'auto':'manual',completionDate,version,productionDays:days,executionUpdatedAt:at,completedAt:status==='已完成'?completionDate:'',executionMethod:d.executionMethod||'人工制作'});
    if(naming)d.executionMaterialName=naming.missing?.length?'':naming.name;
    if(status==='制作中'&&!d.startedAt)d.startedAt=at;
    if(material||url||status==='已完成') {
      const metadata={...Object.fromEntries(materialBusinessFields.filter(key=>Object.hasOwn(d,key)).map(key=>[key,clone(d[key])])),type:({IMG:'图片',VID:'视频',GIF:'GIF'}[d.materialType]||d.materialType||'图片'),url,deliveredBy:owner,deliveredAt:completionDate,version,productionDays:days,updatedAt:at};
      if(naming){metadata.name=naming.missing?.length?'':naming.name;metadata.namingRuleVersion='visual-schedule-v1';if(material?.name&&material.name!==metadata.name&&!material.legacyName)metadata.legacyName=material.name;}
      if(material)Object.assign(material,metadata);
      else{material={id:uid('MAT'),demandId,name:d.title,type:({IMG:'图片',VID:'视频',GIF:'GIF'}[d.materialType]||d.materialType||'图片'),originalCode:'',sourceType:'人工制作',source:{system:'PLATFORM'},createdAt:at,...metadata};store.materials.push(material);}
      d.executionMaterialId=material.id;
    }
    appendLog(d,'执行需求',previous+' → '+status+'；制作人：'+owner+'；完成日期：'+completionDate+'；版本：'+version+'；制作周期：'+days+'天'+(material?'；素材：'+material.id:''),actor);
    return {demand:d,material:material||null};
  }
  function saveVisualExecution(store,demandId,input,actor='管理员',validOwners=[]) {
    if(store.demands.find(d=>d.id===demandId)?.demandType!=='visual-team')throw new Error('该执行表单仅适用于视觉组制作需求。');
    return saveDemandExecution(store,demandId,input,actor,validOwners);
  }
  function demandDeliverySummary(store,demandId) {
    const d=store.demands.find(d=>d.id===demandId);
    if(!d)return null;
    if(d.submissionState==='draft'){
      if(!d.completionDate&&!d.version&&!d.executionUrl)return null;
      const days=productionDays(d.requestDate,d.completionDate);
      return {name:d.executionMaterialName||'',url:d.executionUrl||'',version:d.version||'',owner:d.executionOwner??d.owner??'',completionDate:d.completionDate||'',productionDays:days!==null&&days>=0?days:null};
    }
    if(!d.executionUpdatedAt&&!d.materialUrlUpdatedAt)return null;
    // Existing execution records used a stable material ID before URL/owner snapshots were added.
    const material=store.materials.find(m=>m.id===d.executionMaterialId&&m.demandId===d.id);
    if(!d.executionUpdatedAt)return {name:material?.name||'',url:d.executionUrl||'',version:'',owner:'',completionDate:'',productionDays:null};
    const date=d.completionDate||'';
    return {name:d.executionMaterialName??material?.name??'',url:Object.prototype.hasOwnProperty.call(d,'executionUrl')?d.executionUrl:material?.url||'',version:d.version||'',owner:Object.prototype.hasOwnProperty.call(d,'executionOwner')?d.executionOwner:d.owner||'',completionDate:date,productionDays:typeof d.productionDays==='number'?d.productionDays:productionDays(d.requestDate,date)};
  }
  const advertisingPlatforms=['Facebook','Google'];
  // Prototype account labels; no connection to an advertising platform.
  const advertisingAccounts=[{value:'ACC-META-US',label:'Meta 美国主账户'},{value:'ACC-META-EU',label:'Meta 欧洲账户'},{value:'ACC-GOOGLE-US',label:'Google 美国账户'}];
  function advertisingNameState({spu='',adPage='',materialSource='',landingPage='',promoterCode='',completionDate='',materialId='',materialCategory=''}) {
    const missing=[],token=(value,label)=>{const text=String(value??'').trim();if(!text)missing.push(label);return text;};
    const date=dateValue(completionDate);if(!date)missing.push('素材完成日期');
    const pieces=[token(spu,'SPU'),token(adPage,'投放主页'),token(materialSource,'素材来源'),token(landingPage,'落地页'),token(promoterCode,'推广人缩写')+(date?date.replaceAll('-',''):''),token(materialId,'素材ID'),token(materialCategory,'素材类型')];
    return {name:missing.length?'':pieces.join('_'),missing};
  }
  function advertisingNamingContext(store,materialId,existing=null,config={}) {
    const material=store.materials.find(m=>m.id===materialId&&!m.deletedAt);
    if(!material)throw new Error('素材关联无效或已删除，请重新选择素材创建广告。');
    if(existing?.deletedAt)throw new Error('广告记录已删除。');
    const demand=store.demands.find(d=>d.id===material.demandId);
    if(existing&&existing.materialId!==materialId)throw new Error('不支持修改广告所关联的素材。');
    const category=material.materialCategory||demand?.materialCategory||'';
    return {spu:existing?.spuSnapshot??material.spu??demand?.spu??'',completionDate:existing?.completionDateSnapshot||(material.deliveredAt||material.completionDate||demand?.completionDate||''),materialId:material.id,materialCategory:existing?.materialCategorySnapshot??(config.categoryCode?config.categoryCode(category):category)};
  }
  function saveAdvertisingNaming(store,materialId,input,actor='管理员',config={}) {
    const existing=input.id?store.namings.find(n=>n.id===input.id):null;
    if(input.id&&(!existing||existing.deletedAt))throw new Error('广告命名记录不存在或已删除。');
    const context=advertisingNamingContext(store,materialId,existing,config);
    const text=(key,limit=200)=>{const value=String(input[key]??(key==='remark'?existing?.remark:'')??'').trim();if(value.length>limit)throw new Error(key==='remark'?'备注最多1500个字符。':'输入内容超过允许长度。');return value;};
    const platform=text('platform'),adPage=text('adPage'),materialSource=text('materialSource'),landingPage=text('landingPage'),promoter=text('promoter'),adAccountId=text('adAccountId'),adId=text('adId'),remark=text('remark',1500);
    if((platform||!config.allowIncomplete)&&!advertisingPlatforms.includes(platform))throw new Error('请选择Facebook或Google。');
    if((adPage||!config.allowIncomplete)&&!(config.pageValues||[]).includes(adPage))throw new Error('请选择当前配置中的投放主页。');
    if((materialSource||!config.allowIncomplete)&&!(config.sourceValues||[]).includes(materialSource))throw new Error('请选择当前配置中的素材来源。');
    if(!landingPage&&!config.allowIncomplete)throw new Error('请填写落地页。');
    if((promoter||!config.allowIncomplete)&&!(config.users||[]).includes(promoter))throw new Error('请选择平台内的推广人。');
    const promoterCode=promoter&&config.producerInitials?config.producerInitials(promoter):'';
    const generated=advertisingNameState({...context,adPage,materialSource,landingPage,promoterCode});
    if(generated.missing.length&&!config.allowIncomplete)throw new Error('广告名称缺少：'+generated.missing.join('、')+'。');
    const at=now(),record={...existing,id:existing?.id||uid('ADN'),materialId,platform,adPage,materialSource,landingPage,promoter,adName:generated.name,spuSnapshot:context.spu,completionDateSnapshot:dateValue(context.completionDate),materialCategorySnapshot:context.materialCategory,promoterInitialsSnapshot:promoterCode,adAccountId,adAccountName:advertisingAccounts.find(a=>a.value===adAccountId)?.label||(existing?.adAccountId===adAccountId?existing?.adAccountName:'')||adAccountId,adId,remark,namingRuleVersion:'ad-v11',source:existing?.source||{system:'PLATFORM'},createdBy:existing?.createdBy||actor,createdAt:existing?.createdAt||at,updatedAt:at};
    if(record.demandId){if(!record.legacyDemandId)record.legacyDemandId=record.demandId;}
    delete record.demandId;
    if(existing?.adName&&existing.adName!==record.adName&&!existing.legacyAdName)record.legacyAdName=existing.adName;
    if(existing)store.namings.splice(store.namings.findIndex(n=>n.id===existing.id),1,record);else store.namings.push(record);
    return record;
  }
  function createAdvertisingNamings(store,materialIds,input,actor='管理员',config={}) {
    const ids=[...new Set(materialIds)];
    if(!ids.length)throw new Error('请先勾选素材。');
    const eligible=new Set(materialRows(store).map(row=>row.material.id));
    if(ids.some(id=>!eligible.has(id)))throw new Error('仅支持已完成需求产生的有效素材，请刷新后重新选择。');
    const next=clone(store),values={...input};delete values.id;
    const records=ids.map(id=>saveAdvertisingNaming(next,id,values,actor,{...config,allowIncomplete:true}));
    store.namings=next.namings;return records;
  }
  function deleteMaterials(store,materialIds,actor='管理员') {
    const ids=[...new Set(materialIds)],eligible=new Set(materialRows(store).map(row=>row.material.id));
    if(!ids.length)throw new Error('请先勾选素材。');
    if(ids.some(id=>!eligible.has(id)||!canDeleteMaterial(store,store.materials.find(m=>m.id===id))))throw new Error('仅支持批量删除未创建过广告命名的素材，请先取消勾选广告命名数>0的素材');
    const next=clone(store);ids.forEach(id=>deleteMaterial(next,id,actor));store.materials=next.materials;return ids;
  }
  function sourceKey(source) {return JSON.stringify([source.system,source.baseId,source.tableId,source.recordId,source.entity,source.split||'0']);}
  function appendLog(demand, action, detail, actor='管理员') {demand.logs=demand.logs||[];demand.logs.unshift({id:uid('LOG'),at:now(),actor,action,detail});demand.updatedAt=now();}
  function completionIssue(store,demand) {
    if(!demandTypes.some(type=>type.value===demand.demandType))return '请先补充需求类型。';
    if(!store.materials.some(m=>m.demandId===demand.id&&!m.deletedAt&&(demand.demandType==='ad-team'||isMaterialAddress(m.url))))return '确认完成前，请记录该份素材地址（URL）。';
    return '';
  }
  function assertCompletion(store,demand) {const issue=completionIssue(store,demand);if(issue)throw new Error(issue);}
  function activeMaterialAdvertisements(store,materialId) {return store.namings.filter(n=>!n.deletedAt&&n.materialId===materialId);}
  function canDeleteMaterial(store,material) {return Boolean(material)&&!material.deletedAt&&activeMaterialAdvertisements(store,material.id).length===0;}
  function deleteMaterial(store,id,actor='管理员') {
    const material=store.materials.find(m=>m.id===id);if(!material||material.deletedAt)throw new Error('素材不存在或已删除，请刷新列表。');
    if(!canDeleteMaterial(store,material))throw new Error('该素材存在投放广告，请先删除关联广告后再删除素材。');
    Object.assign(material,{deletedAt:now(),deletedBy:actor});appendLog(material,'删除素材','素材从业务列表移除，来源需求交付记录保留',actor);
    return material;
  }
  function deleteAdvertisingNaming(store,id,actor='管理员') {
    const naming=store.namings.find(n=>n.id===id);if(!naming||naming.deletedAt)throw new Error('广告记录不存在或已删除，请刷新列表。');
    Object.assign(naming,{deletedAt:now(),deletedBy:actor});appendLog(naming,'删除投放广告','广告记录从业务列表移除，关联素材保留',actor);
    return naming;
  }
  function advertisingRows(store) {
    return store.namings.flatMap(naming=>{
      if(naming.deletedAt)return [];
      const material=store.materials.find(m=>m.id===naming.materialId&&!m.deletedAt);
      return material?[{naming,material,demand:store.demands.find(d=>d.id===material.demandId)||null}]:[];
    });
  }
  // Old parent IDs remain audit data only. Material IDs are the sole active ad relation.
  const materialBusinessFields=['spu','materialCategory','expression','mainSellingPoint','secondarySellingPoint','scene','materialType'];
  function normalizeAdvertisingRelations(store) {
    let changed=false;
    store.materials.forEach(material=>{const demand=store.demands.find(d=>d.id===material.demandId);if(!demand)return;materialBusinessFields.forEach(key=>{if(!Object.hasOwn(material,key)&&Object.hasOwn(demand,key)){material[key]=clone(demand[key]);changed=true;}});});
    store.namings.forEach(n=>{if(Object.hasOwn(n,'demandId')){if(n.demandId&&!n.legacyDemandId)n.legacyDemandId=n.demandId;delete n.demandId;changed=true;}});
    if(store.adMaterialRelationSchemaVersion!==1){store.adMaterialRelationSchemaVersion=1;changed=true;}
    return changed;
  }
  function advertisingRecordContext(store,n,material) {
    const demand=store.demands.find(d=>d.id===material?.demandId);
    return {adName:n.adName||'',materialId:material?.id||'',platform:({'Meta':'Facebook','Google Ads':'Google'})[n.platform]||n.platform||'',spu:n.spuSnapshot??material?.spu??demand?.spu??'',adPage:n.adPage||'',materialSource:n.materialSource||'',promoter:n.promoter??n.createdBy??'',completionDate:dateValue(n.completionDateSnapshot||material?.deliveredAt||material?.completionDate||demand?.completionDate)};
  }
  const advertisingFilterDefaults={adName:'',materialId:'',platform:'',spu:'',adPage:'',materialSource:'',promoter:'',completionStart:'',completionEnd:''};
  function normalizeAdvertisingFilters(input={}) {return Object.fromEntries(Object.keys(advertisingFilterDefaults).map(key=>[key,typeof input?.[key]==='string'?input[key].trim().slice(0,200):'']));}
  function validateAdvertisingFilters(input) {
    const f=normalizeAdvertisingFilters(input),start=f.completionStart,end=f.completionEnd;
    if([start,end].some(value=>value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||dateValue(value)!==value)))throw new Error('素材完成日期格式无效，请重新选择日期。');
    if(start&&end&&start>end)throw new Error('素材完成日期开始日期不能晚于结束日期。');
    return f;
  }
  function advertisingMatchesFilters(context,input) {
    const f=normalizeAdvertisingFilters(input),date=dateValue(context.completionDate);
    return ['adName','materialId','spu'].every(key=>!f[key]||String(context[key]||'').toLowerCase().includes(f[key].toLowerCase()))&&
      ['platform','adPage','materialSource','promoter'].every(key=>!f[key]||context[key]===f[key])&&
      (!f.completionStart||(Boolean(date)&&date>=f.completionStart))&&(!f.completionEnd||(Boolean(date)&&date<=f.completionEnd));
  }
  function advertisingFilterStorageKey(userId) {filterStorageKey(userId);return 'ai-visual-advertising-filters-v1:'+encodeURIComponent(userId);}
  function encodeAdvertisingFilterPreference(userId,filters) {advertisingFilterStorageKey(userId);return JSON.stringify({version:1,kind:'advertising',userId,filters:validateAdvertisingFilters(filters)});}
  function decodeAdvertisingFilterPreference(userId,value) {
    advertisingFilterStorageKey(userId);const preference=JSON.parse(value);
    if(preference?.version!==1||preference.kind!=='advertising'||preference.userId!==userId||!preference.filters||typeof preference.filters!=='object'||Array.isArray(preference.filters))throw new Error('已保存的广告筛选条件无法读取，请重新设置并保存。');
    return validateAdvertisingFilters(preference.filters);
  }
  function materialRows(store) {
    const namingCounts=new Map();
    advertisingRows(store).forEach(row=>{if(row.material)namingCounts.set(row.material.id,(namingCounts.get(row.material.id)||0)+1);});
    return store.materials.flatMap(material=>{const demand=store.demands.find(d=>d.id===material.demandId);return !material.deletedAt&&demand&&!demand.deletedAt&&demand.status==='已完成'?[{material,demand,namingCount:namingCounts.get(material.id)||0}]:[];});
  }
  function namingsForDemand(store,id) {return advertisingRows(store).filter(row=>row.material.demandId===id).map(row=>row.naming);}
  function changeStatus(store,id,next,note='',actor='管理员') {
    const d=store.demands.find(v=>v.id===id);if(!d)throw new Error('需求不存在。');
    assertDemandMutable(d);
    if(!statuses.includes(next))throw new Error('请选择有效的进度状态。');
    if(next==='已完成')assertCompletion(store,d);
    const previous=canonicalProgressStatus(d.status,d.owner);if(next===previous)return d;
    d.status=next;
    if(next==='制作中'&&!d.startedAt)d.startedAt=now();
    if(next==='已完成')d.completedAt=now();else d.completedAt='';
    appendLog(d,'更新进度状态',previous+' → '+next+(note?'；'+note:''),actor);return d;
  }
  function planImport(store, input) {
    const {entity,baseId,tableId,mapping,parentMode='platform',parentTableId=''}=input;
    if(!['demands','materials','namings'].includes(entity))throw new Error('请选择导入对象。');
    if(!baseId?.trim()||!tableId?.trim())throw new Error('请填写来源库标识和来源表标识。');
    if(!mapping.sourceRecordId)throw new Error('请映射源记录 ID，不能按名称去重。');
    if(entity!=='demands'&&parentMode==='source'&&!parentTableId.trim())throw new Error('请填写关联对象所在的来源表标识。');
    const plans=input.rows.map((raw,i)=>{
      const data=Object.fromEntries(Object.entries(mapping).map(([field,column])=>[field,String(raw[column]??'').trim()]));
      const source={system:'FEISHU',baseId:baseId.trim(),tableId:tableId.trim(),recordId:data.sourceRecordId,entity,split:data.split||'0'};
      const key=sourceKey(source);
      const fingerprint=JSON.stringify({raw:Object.fromEntries(Object.entries(raw).sort(([a],[b])=>a.localeCompare(b))),mapping,parentMode,parentTableId});
      let outcome='ready',reason='校验通过',parentId='';
      const errors=[];
      if(!data.sourceRecordId)errors.push('缺少源记录 ID');
      const existing=store[entity].find(v=>v.source&&sourceKey(v.source)===key);
      if(existing) {outcome=existing.source.fingerprint===fingerprint?'skip':'issue';reason=outcome==='skip'?'相同源记录已导入，本次跳过':'源记录内容或映射已变化，待人工核对；不会覆盖历史';}
      if(entity==='demands') {
        if(!data.title)errors.push('缺少需求名称');
        if(data.status&&![...statuses,...legacyStatuses].includes(data.status))errors.push('进度状态不在支持范围内，请核对映射');
        for(const field of ['requestDate','ddl'])if(data[field]&&dateValue(data[field])===null)errors.push(field==='ddl'?'DDL 日期无效':'下需日期无效');
        if(data.requestDate&&data.ddl&&dateValue(data.requestDate)>dateValue(data.ddl))errors.push('DDL 不能早于下需日期');
      } else {
        const collection=entity==='materials'?store.demands:store.materials;
        const candidates=collection.filter(v=>!v.deletedAt&&(parentMode==='platform'?v.id===data.parentRef:v.source?.system==='FEISHU'&&v.source.baseId===baseId.trim()&&v.source.tableId===parentTableId.trim()&&v.source.recordId===data.parentRef));
        if(candidates.length!==1)errors.push(candidates.length?'关联编号对应多条记录，请改用平台 ID':'找不到唯一关联'+(entity==='materials'?'需求':'素材')+'，请先导入父记录并核对编号');
        else parentId=candidates[0].id;
        if(entity==='materials') {
          if(!data.name)errors.push('缺少素材名称');
          if(!['图片','视频','GIF','IMG','VID'].includes(data.type))errors.push('素材格式须为图片、视频、GIF、IMG 或 VID');
          if(data.url&&!isMaterialAddress(data.url))errors.push('文件地址须为有效链接或局域网共享路径');
          if(data.deliveredAt&&dateValue(data.deliveredAt)===null)errors.push('交付日期无效');
        } else {if(!data.adName)errors.push('缺少广告名称');if(!data.platform)errors.push('缺少投放平台');}
      }
      if(errors.length){outcome='issue';reason=errors.join('；');}
      return {line:i+2,data,source:{...source,fingerprint,rawSnapshot:clone(raw)},key,fingerprint,parentId,outcome,reason};
    });
    const grouped=new Map();plans.forEach(p=>{if(!grouped.has(p.key))grouped.set(p.key,[]);grouped.get(p.key).push(p);});
    grouped.forEach(group=>{
      if(group.length<2)return;
      if(new Set(group.map(p=>p.fingerprint)).size>1)group.forEach(p=>{p.outcome='issue';p.reason='同一源记录及拆分序号对应不同内容，请核对；本批均不写入';});
      else group.slice(1).forEach(p=>{if(p.outcome==='ready'){p.outcome='skip';p.reason='本文件重复源记录，跳过重复行';}});
    });
    return plans;
  }
  function applyImport(store,input,actor='管理员') {
    const plans=planImport(store,input),batchId=uid('IMP'),at=now();
    let imported=0;
    plans.filter(p=>p.outcome==='ready').forEach(p=>{
      const v=p.data, source={...p.source,batchId,importedAt:at};
      let record;
      if(input.entity==='demands') {
        record={...v,id:uid('VD'),title:v.title,status:canonicalProgressStatus(v.status,v.owner),...(v.status&&!statuses.includes(v.status)?{legacyStatus:v.status}:{}),requestDate:dateValue(v.requestDate)||'',ddl:dateValue(v.ddl)||'',createdAt:at,updatedAt:at,executionMethod:v.executionMethod||'人工制作',historical:true,source,logs:[]};
        appendLog(record,'历史导入','来源记录 '+source.recordId+'；批次 '+batchId,actor);
      } else if(input.entity==='materials') {
        record={...v,id:uid('MAT'),demandId:p.parentId,type:({IMG:'图片',VID:'视频'})[v.type]||v.type,deliveredAt:dateValue(v.deliveredAt)||'',createdAt:at,updatedAt:at,source};
        const d=store.demands.find(d=>d.id===p.parentId);appendLog(d,'导入交付素材',record.name+' · '+record.id,actor);
      } else {
        record={...v,id:uid('ADN'),materialId:p.parentId,createdBy:v.createdBy||actor,createdAt:at,updatedAt:at,source};
        if(record.demandId)record.legacyDemandId=record.demandId;delete record.demandId;
      }
      store[input.entity].push(record);imported++;
    });
    const batch={id:batchId,at,actor,entity:input.entity,baseId:input.baseId,tableId:input.tableId,fileName:input.fileName||'',total:plans.length,imported,skipped:plans.filter(p=>p.outcome==='skip').length,issues:plans.filter(p=>p.outcome==='issue').map(p=>({line:p.line,sourceRecordId:p.source.recordId,reason:p.reason,rawSnapshot:p.source.rawSnapshot})),mapping:clone(input.mapping)};
    store.batches.unshift(batch);return batch;
  }
  const api={advertisingAccounts,createAdvertisingNamings,deleteMaterials,usesPostNumber,postNumberWarning,validateProducer,adTeamDemandFormSections,prepareAdTeamDemandValues,activeMaterialAdvertisements,canDeleteMaterial,deleteMaterial,deleteAdvertisingNaming,canDeleteDemand,deleteDemand,normalizeAdvertisingRelations,advertisingRecordContext,advertisingFilterDefaults,normalizeAdvertisingFilters,validateAdvertisingFilters,advertisingMatchesFilters,advertisingFilterStorageKey,encodeAdvertisingFilterPreference,decodeAdvertisingFilterPreference,advertisingPlatforms,advertisingNameState,advertisingNamingContext,saveAdvertisingNaming,materialFilterDefaults,normalizeMaterialFilters,validateMaterialFilters,materialMatchesFilters,materialFilterStorageKey,encodeMaterialFilterPreference,decodeMaterialFilterPreference,updateMaterialUrl,assignDemandProducer,materialLinkTarget,isUncPath,isMaterialAddress,generateMaterialAddress,saveDemandExecution,demandDeliverySummary,initialProgressStatus,canonicalProgressStatus,normalizeProgressStore,canModifyDemand,assertDemandMutable,prepareDemandRecord,visualProgressStatuses,legacyStatuses,productionDays,visualExecutionDefaults,saveVisualExecution,demandFilterDefaults,normalizeDemandFilters,validateDemandFilters,demandMatchesFilters,filterStorageKey,encodeFilterPreference,decodeFilterPreference,assertMaterialWrite,demandTypes,completionIssue,assertCompletion,advertisingRows,materialRows,namingsForDemand,statuses,transitions,now,uid,clone,parseCsv,toCsv,safeUrl,dateValue,sourceKey,appendLog,changeStatus,planImport,applyImport};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.VisualDemandRecordsModel=api;
})(typeof window!=='undefined'?window:globalThis);

})();