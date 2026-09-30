(async () => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
  const nowText = () => new Date().toLocaleString('zh-CN', { hour12:false }).replaceAll('/', '-');
  const TASK_NAME_MAX_LENGTH = 200;
  const DEFAULT_TEXT_INPUT_MAX_LENGTH = 200;
  const DEFAULT_TEXTAREA_MAX_LENGTH = 1500;
  const BUSINESS_TEXT_CONTROL_SELECTOR = 'input:not([type]),input[type="text"],input[type="search"],input[type="url"],input[type="email"],input[type="tel"],input[type="password"],textarea';
  function businessTextControls(root) {
    if (!root) return [];
    const controls = root.matches?.(BUSINESS_TEXT_CONTROL_SELECTOR) ? [root] : [];
    return controls.concat($$(BUSINESS_TEXT_CONTROL_SELECTOR, root));
  }
  function applyDefaultBusinessTextLimits(root) {
    businessTextControls(root).forEach(control => {
      if (control.hasAttribute('maxlength')) return;
      const limit = control.tagName === 'TEXTAREA' ? DEFAULT_TEXTAREA_MAX_LENGTH : DEFAULT_TEXT_INPUT_MAX_LENGTH;
      control.maxLength = limit;
      control.dataset.defaultMaxlength = String(limit);
    });
  }
  function enforceBusinessTextStorageLimits(root) {
    businessTextControls(root).forEach(control => {
      const limit = control.maxLength;
      if (limit >= 0 && control.value.length > limit) control.value = control.value.slice(0, limit);
    });
  }
  function observeBusinessTextLimits() {
    [$('[data-page="workspace"]'), $('#mainDialog')].filter(Boolean).forEach(scope => {
      applyDefaultBusinessTextLimits(scope);
      scope.addEventListener('input', event => {
        if (event.target.matches?.(BUSINESS_TEXT_CONTROL_SELECTOR)) enforceBusinessTextStorageLimits(event.target);
      });
      new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) applyDefaultBusinessTextLimits(node);
      }))).observe(scope, { childList:true, subtree:true });
    });
  }
  const MODEL_OPTION_SET_VERSION = 'model-profile-v2';
  const VERSIONED_MODEL_OPTION_FIELDS = new Set(['ageRange','region','height','bodyType','skinTone','hairColor','style']);
  const SCENE_OPTION_SET_VERSION = 'scene-config-v2';
  const VERSIONED_SCENE_OPTION_FIELDS = new Set(['ratio','quality','shotComposition','toneStyle','artAtmosphere']);
  const DETAIL_OPTION_SET_VERSION = 'detail-config-v1';
  const VERSIONED_DETAIL_OPTION_FIELDS = new Set(['ratio','quality','materialCloseup','lifestyleInteraction','flatLayCloseup','lightingControl','emotionExpression']);
  const IMAGE_OUTPUT_FORMATS = ['png','jpg'];
  const IMAGE_PROCESSING_MODELS = Object.freeze(['GPT Image 2']);
  const VIDEO_PROCESSING_MODELS = Object.freeze(['Seedance 2.0','Seedance 2.5']);
  const LEGACY_NODE_NAME_MAP = { '洗素材':'商品重塑', '造场景':'场景生成', '修细节':'素材裂变' };
  const LEGACY_TEMPLATE_TERM = '模' + '版';
  const LEGACY_DEPARTMENT_TERM = '\u7ec4\u7ec7';
  const LEGACY_PLATFORM_TERM = 'AI 素材运营';
  const LEGACY_PLATFORM_SPACED_TERM = 'AI 素材';
  const LEGACY_VISUAL_DEMAND_TERM = '视觉需求管理';
  const sharedDesignStateEndpoint = null;
  let sharedDesignPersistTimer = 0;

  async function fetchSharedDesignState() {
    if (!sharedDesignStateEndpoint) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch(sharedDesignStateEndpoint, { cache:'no-store', signal:controller.signal });
      if (response.status === 204) return null;
      if (!response.ok) throw new Error(`共享配置读取失败：${response.status}`);
      const payload = await response.json();
      return payload?.state && typeof payload.state === 'object' ? payload.state : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function persistSharedDesignStateNow() {
    if (!sharedDesignStateEndpoint) return true;
    clearTimeout(sharedDesignPersistTimer);
    sharedDesignPersistTimer = 0;
    try {
      const response = await fetch(sharedDesignStateEndpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ version:1, savedAt:new Date().toISOString(), state:designState }),
        cache:'no-store'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function queueSharedDesignStatePersist() {
    clearTimeout(sharedDesignPersistTimer);
    sharedDesignPersistTimer = setTimeout(() => { persistSharedDesignStateNow(); }, 320);
  }

  function beaconSharedDesignState() {
    if (!sharedDesignStateEndpoint) return;
    clearTimeout(sharedDesignPersistTimer);
    sharedDesignPersistTimer = 0;
    const body = JSON.stringify({ version:1, savedAt:new Date().toISOString(), state:designState });
    try {
      if (navigator.sendBeacon?.(sharedDesignStateEndpoint, new Blob([body], { type:'application/json' }))) return;
    } catch {}
    fetch(sharedDesignStateEndpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true }).catch(() => {});
  }

  function migrateLegacyNodeNames(value) {
    if (typeof value === 'string') return Object.entries(LEGACY_NODE_NAME_MAP).reduce((text, [legacyName, currentName]) => text.replaceAll(legacyName, currentName), value).replaceAll(LEGACY_TEMPLATE_TERM, '模板').replaceAll(LEGACY_DEPARTMENT_TERM, '部门').replaceAll(LEGACY_PLATFORM_TERM, 'AI素材').replaceAll(LEGACY_PLATFORM_SPACED_TERM, 'AI素材').replaceAll(LEGACY_VISUAL_DEMAND_TERM, '视觉需求');
    if (Array.isArray(value)) return value.map(migrateLegacyNodeNames);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, migrateLegacyNodeNames(item)]));
    return value;
  }
  function migrateQuotaLanguage(value) {
    if (typeof value === 'string') return value.replace(/tokens?/gi, '额度');
    if (Array.isArray(value)) return value.map(migrateQuotaLanguage);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, migrateQuotaLanguage(item)]));
    return value;
  }

  const viewNames = { workbench:'工作台', demands:'视觉需求', workspace:'新建任务', tasks:'任务与消耗', assets:'素材库', templates:'原型库', usage:'用量统计', permissions:'节点权限' };
  const nodeMap = {
    clean: { name:'商品重塑', tokens:1200, desc:'样板图/人台图生成高端3D透明底图', model:'GPT Image 2', suffix:'清理结果' },
    scene: { name:'场景生成', tokens:2800, desc:'将素材放入指定人物、环境或营销场景', model:'GPT Image 2', suffix:'场景结果' },
    detail: { name:'素材裂变', tokens:1600, desc:'精修素材（改表情、姿势、尺寸等），一张图裂变全套广告物料', model:'GPT Image 2', suffix:'精修结果' }
  };
  const MODEL_QUOTA_PRICE_CNY = Object.freeze({
    'Gemini Image Pro':0.0020,
    'GPT Image':0.0030,
    '内部图像模型':0.0012
    ,'GPT Image 2':0.0030
    ,'Seedance 2.0':0.0040
    ,'Seedance 2.5':0.0045
  });
  const DEFAULT_QUOTA_PRICE_CNY = 0.0020;
  function modelQuotaPriceCny(model) { return MODEL_QUOTA_PRICE_CNY[model] ?? DEFAULT_QUOTA_PRICE_CNY; }
  function roundQuota(value) { return Math.round((Number(value) || 0) * 10000) / 10000; }
  function quotaFromUsage(usage, model) { return roundQuota((Number(usage) || 0) * modelQuotaPriceCny(model)); }
  function formatCny(value) { return `¥${(Number(value) || 0).toLocaleString('zh-CN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`; }
  function formatUnitPriceCny(value) { return `¥${(Number(value) || 0).toFixed(4)}`; }
  const phaseNames = {
    clean:[['指令与上下文组装','读取任务参数、品牌约束与素材元数据'],['素材理解','识别主体、背景、文字及待清理区域'],['清理生成','执行去背景、画质修复或元素移除'],['结果校验','检查主体完整性、颜色与品牌约束']],
    scene:[['指令与上下文组装','合并任务参数、场景描述与品牌约束'],['输入素材理解','识别商品结构、人物与可编辑区域'],['场景生成','生成环境、光影、构图与主体融合结果'],['结果校验','检查商品一致性、构图与营销留白']],
    detail:[['问题区域识别','定位边缘、肢体、纹理与光影问题'],['精修指令组装','生成局部编辑指令与保真约束'],['局部精修','执行细节修复、清晰化与光影统一'],['终稿校验','检查水印、Logo、尺寸与输出质量']]
  };

  const defaultConfigs = {
    clean:{ mediaType:'图片', outputFormat:'png', outputDuration:'15', durationUnit:'秒', ratio:'4:5', model:'GPT Image 2', beautify:'标准美化', views:['正面'], quality:'超清 2K', requirements:'保留商品原始颜色、材质纹理与 Logo 形态，不改变产品结构。' },
    scene:{ mediaType:'图片', outputFormat:'png', outputDuration:'15', durationUnit:'秒', ratio:'3:4', model:'GPT Image 2', quality:'自动适配', gender:'女', ageRange:'25–34岁', region:'东亚', height:'165-170cm', bodyType:'标准', skinTone:'自然肤色', hairColor:'黑色', style:'时尚简约', shotComposition:'中景（半身穿搭）', toneStyle:'暖阳金调-温暖治愈', artAtmosphere:'都市度假-轻奢松弛', adCopy:'', copyLanguage:'英语', copyPosition:'画面右侧', voiceoverAudio:null, backgroundAudio:null, requirements:'保留商品原有结构、颜色与 Logo，生成自然协调的营销场景。', generateCount:'1' },
    detail:{ mediaType:'图片', outputFormat:'png', outputDuration:'15', durationUnit:'秒', generateCount:'1', ratio:'3:4', model:'GPT Image 2', quality:'自动适配', materialCloseup:'无特写', lifestyleInteraction:'全景/无交互（默认）', flatLayCloseup:'无特写', lightingControl:'自然柔光-真实舒适', emotionExpression:'保持原样', requirements:'修复边缘、手部与衣物褶皱，统一光影，不增加文字或水印。' }
  };

  function processingModelsFor(mediaType) { return mediaType === '视频' ? VIDEO_PROCESSING_MODELS : IMAGE_PROCESSING_MODELS; }
  function normalizeProcessingModel(mediaType, model) {
    const options = processingModelsFor(mediaType);
    return options.includes(model) ? model : options[0];
  }

  function normalizeDetailConfig(config = {}) {
    const ratioOptions = ['3:4','9:16','16:9','1:1','4:3'];
    const qualityOptions = ['自动适配','标准清晰','高清（1080P）','超清（2K）','超清（4K）','细节增强（2K）','细节增强（4K）','电商高清（1080P）','商业超清（2K）','商业超清（4K）'];
    const legacyQualityMap = { '高清 1080P':'高清（1080P）', '超清 2K':'超清（2K）', '超清 4K':'超清（4K）' };
    const normalized = { ...defaultConfigs.detail, ...config };
    normalized.ratio = ratioOptions.includes(normalized.ratio) ? normalized.ratio : defaultConfigs.detail.ratio;
    normalized.quality = legacyQualityMap[normalized.quality] || normalized.quality;
    normalized.quality = qualityOptions.includes(normalized.quality) ? normalized.quality : defaultConfigs.detail.quality;
    return normalized;
  }

  function getSceneRatioOptions(mediaType) {
    return mediaType === '视频' ? [
      {value:'16:9', label:'横屏（16:9）：YouTube、官网横版视频、广告横版素材'},
      {value:'9:16', label:'竖屏（9:16）：TikTok、Reels、Shorts、短视频投放'},
      {value:'1:1', label:'方屏（1:1）：部分社媒信息流、电商内容'},
      {value:'4:5', label:'竖版（4:5）：Instagram feed、部分广告图视频封面'}
    ] : ['3:4','9:16','16:9','1:1','4:3'].map(value => ({value, label:value}));
  }
  function getSceneRatioOptionVersion(mediaType) { return `${SCENE_OPTION_SET_VERSION}-${mediaType === '视频' ? 'video' : 'image'}`; }

  const platformUserDirectory = Object.freeze([
    Object.freeze({ id:'USR-0001', name:'管理员', department:'品牌中心' }),
    Object.freeze({ id:'USR-0002', name:'沈玲燕', department:'品牌中心' }),
    Object.freeze({ id:'USR-0003', name:'潘金兰', department:'品牌中心' }),
    Object.freeze({ id:'USR-0004', name:'张三', department:'品牌中心' }),
    Object.freeze({ id:'USR-0005', name:'赵六', department:'品牌中心' }),
    Object.freeze({ id:'USR-0006', name:'THD', department:'品牌中心' }),
    Object.freeze({ id:'USR-0007', name:'LZJ', department:'品牌中心' }),
    Object.freeze({ id:'USR-0008', name:'CHW', department:'品牌中心' }),
    Object.freeze({ id:'USR-0009', name:'LHX', department:'品牌中心' }),
    Object.freeze({ id:'USR-0010', name:'李四', department:'海外事业部' }),
    Object.freeze({ id:'USR-0011', name:'王五', department:'电商中心' })
  ]);
  const assetProducerIdentityDirectory = Object.freeze(Object.fromEntries(platformUserDirectory.map(user => [user.name,Object.freeze({ producer:user.name, producerDepartment:user.department })])));
  const executionPersonByAccount = Object.freeze({
    'zhangsan':'张三', 'zhangsan@demo':'张三',
    'lisi':'李四', 'lisi@demo':'李四',
    'wangwu':'王五', 'wangwu@demo':'王五',
    'zhaoliu':'赵六', 'zhaoliu@demo':'赵六'
  });
  function executionPersonName(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const directoryMatch = platformUserDirectory.find(user => user.name.toLowerCase() === raw.toLowerCase());
    return executionPersonByAccount[raw.toLowerCase()] || directoryMatch?.name || '未识别执行人';
  }

  const templateDefaults = [
    { id:1001, name:'海岛度假商品图', scope:'task', nodes:['clean','scene','detail'], type:'图片', creator:'张三 / 品牌中心', uses:38, last:'2026-09-15', status:'启用', configs:{ clean:{...defaultConfigs.clean}, scene:{...defaultConfigs.scene}, detail:{...defaultConfigs.detail} } },
    { id:1002, name:'TikTok 竖版短视频', scope:'task', nodes:['scene','detail'], type:'视频', creator:'李四 / 海外事业部', uses:26, last:'2026-09-14', status:'启用', configs:{ scene:{...defaultConfigs.scene, mediaType:'视频', ratio:'9:16', shotComposition:'全景（全身带环境）', toneStyle:'冷调科技-专业洁净', artAtmosphere:'时尚大片-先锋杂志感'}, detail:{...defaultConfigs.detail, mediaType:'视频', ratio:'9:16', quality:'高清 1080P'} } },
    { id:2001, name:'电商白底图标准化', scope:'node', nodeKey:'clean', nodes:['clean'], type:'图片', creator:'王五 / 电商中心', uses:19, last:'2026-09-14', status:'启用', config:{...defaultConfigs.clean} },
    { id:2002, name:'商品自然光场景', scope:'node', nodeKey:'scene', nodes:['scene'], type:'图片', creator:'张三 / 品牌中心', uses:16, last:'2026-09-13', status:'启用', config:{...defaultConfigs.scene} },
    { id:2003, name:'商品局部精修', scope:'node', nodeKey:'detail', nodes:['detail'], type:'图片', creator:'张三 / 品牌中心', uses:11, last:'2026-09-12', status:'启用', config:{...defaultConfigs.detail} }
  ];

  let tasks = [
    ['双十一新品白底图优化','图片','商品重塑 → 素材裂变','品牌中心 / zhangsan','1.26','暂存','2026-09-20 09:42',{produced:1,saved:0,id:'TSK-DRAFT-0920',nodes:['clean','detail'],createdAt:'2026-09-20 09:42',updatedAt:'2026-09-20 10:02',quotaCurrency:'CNY',nodeStats:{clean:{generated:1,stored:0,quota:1.26,executions:1}}}],
    ['夏季新品多渠道素材优化','图片','商品重塑 → 场景生成 → 素材裂变','品牌中心 / zhangsan','13.748','已完成','2026-09-15 14:32',{produced:3,saved:2,id:'TSK-20260918',nodes:['clean','scene','detail'],quotaCurrency:'CNY',nodeStats:{clean:{stored:0,quota:1.868},scene:{stored:1,quota:8.652},detail:{stored:1,quota:3.228}}}],
    ['TikTok 秋季上新短视频','视频','场景生成 → 素材裂变','海外事业部 / lisi','31.4','已终止并入库','2026-09-15 11:08',{produced:2,saved:1,id:'TSK-20260917',nodes:['scene','detail'],quotaCurrency:'CNY',nodeStats:{scene:{stored:0,quota:18.12},detail:{stored:1,quota:13.28}}}],
    ['防晒衣白底图清理','图片','商品重塑','电商中心 / wangwu','2.292','已完成','2026-09-14 17:46',{produced:1,saved:1,id:'TSK-20260916',nodes:['clean'],quotaCurrency:'CNY',nodeStats:{clean:{stored:1,quota:2.292}}}],
    ['运动鞋街景图精修','图片','素材裂变','品牌中心 / zhaoliu','3.444','已终止','2026-09-14 15:20',{produced:0,saved:0,id:'TSK-20260915',nodes:['detail'],quotaCurrency:'CNY',nodeStats:{detail:{stored:0,quota:3.444}}}]
  ];
  let assets = [
    ['防晒衣_海岛场景_v3.jpg','MAT-20260915-0182','图片','夏季新品 / 素材裂变','2160 × 2700','/AI素材/2026/09/夏季新品','正常','2026-09-15 14:35'],
    ['秋季上新_竖版_01.mp4','MAT-20260915-0177','视频','TikTok 秋季上新 / 素材裂变','1080 × 1920 · 12s','/AI素材/2026/09/TikTok秋季','正常','2026-09-15 11:15'],
    ['防晒衣_透明底.png','MAT-20260914-0168','图片','防晒衣白底图 / 商品重塑','2000 × 2500','/AI素材/2026/09/防晒衣','正常','2026-09-14 17:49'],
    ['运动鞋_街景_预览.jpg','MAT-20260914-0162','图片','运动鞋街景 / 场景生成','1920 × 1080','/AI素材/2026/09/运动鞋','正常','2026-09-14 15:18'],
    ['产品旋转展示.mp4','MAT-20260913-0155','视频','产品展示 / 场景生成','1080 × 1080 · 8s','/AI素材/2026/09/产品展示','正常','2026-09-13 16:04']
  ];
  const assetPreviewImages = [
    'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=640&q=82'
  ];
  const assetSyncMetaDefaults = {
    'MAT-20260915-0182':{ quality:'超清（2K）', previewSrc:assetPreviewImages[0], creator:'张三 / 品牌中心', ...resolveAssetProducerIdentity('张三'), taskId:'TSK-20260918', tagIds:['TAG-CAMPAIGN','TAG-FINAL'] },
    'MAT-20260915-0177':{ quality:'高清（1080P）', creator:'李四 / 海外事业部', ...resolveAssetProducerIdentity('李四'), taskId:'TSK-20260917', tagIds:['TAG-SOCIAL'] },
    'MAT-20260914-0168':{ quality:'超清（2K）', previewSrc:assetPreviewImages[1], creator:'王五 / 电商中心', ...resolveAssetProducerIdentity('王五'), taskId:'TSK-20260916', tagIds:['TAG-ECOM','TAG-FINAL'] },
    'MAT-20260914-0162':{ quality:'高清（1080P）', previewSrc:assetPreviewImages[2], creator:'赵六 / 品牌中心', ...resolveAssetProducerIdentity('赵六'), tagIds:['TAG-SOCIAL'] },
    'MAT-20260913-0155':{ quality:'高清（1080P）', creator:'王五 / 电商中心', ...resolveAssetProducerIdentity('王五'), tagIds:[] }
  };
  const assetTagDefaults = [
    { id:'TAG-CAMPAIGN', name:'活动投放' },
    { id:'TAG-ECOM', name:'电商主图' },
    { id:'TAG-SOCIAL', name:'社媒素材' },
    { id:'TAG-FINAL', name:'已定稿' }
  ];
  const modelDemoImages = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=640&q=82',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=640&q=82'
  ];
  const sceneDemoImages = [
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=960&q=82',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=960&q=82',
    'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=960&q=82',
    'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=960&q=82'
  ];
  const modelPrototypeSeedUses = { 'MOD-001':38, 'MOD-002':26, 'MOD-003':21, 'MOD-004':17, 'MOD-005':12, 'MOD-006':9, 'MOD-007':7, 'MOD-008':5 };
  const scenePrototypeSeedUses = { 'SCN-001':128, 'SCN-002':96, 'SCN-003':112, 'SCN-004':88 };
  const prototypeDefaults = [
    { id:'MOD-001', name:'东亚女模特 · 时尚简约', kind:'model', mediaType:'图片', image:modelDemoImages[0], details:'女 · 25–34岁 · 东亚 · 165-170cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-12 10:20', config:{gender:'女',ageRange:'25–34岁',region:'东亚',height:'165-170cm',bodyType:'标准',skinTone:'自然肤色',hairColor:'黑色',style:'时尚简约'} },
    { id:'MOD-002', name:'北美男模特 · 阳光运动', kind:'model', mediaType:'图片', image:modelDemoImages[1], details:'男 · 25–34岁 · 北美 · 176-180cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-12 10:18', config:{gender:'男',ageRange:'25–34岁',region:'北美',height:'176-180cm',bodyType:'健壮',skinTone:'自然肤色',hairColor:'深棕色',style:'阳光运动'} },
    { id:'MOD-003', name:'东亚女模特 · 优雅知性', kind:'model', mediaType:'图片', image:modelDemoImages[2], details:'女 · 35–44岁 · 东亚 · 165-170cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-11 15:30', config:{gender:'女',ageRange:'35–44岁',region:'东亚',height:'165-170cm',bodyType:'偏瘦',skinTone:'白皙',hairColor:'棕色',style:'优雅知性'} },
    { id:'MOD-004', name:'西欧女模特 · 轻奢高级', kind:'model', mediaType:'图片', image:modelDemoImages[3], details:'女 · 25–34岁 · 西欧 · 171-175cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-11 11:42', config:{gender:'女',ageRange:'25–34岁',region:'西欧',height:'171-175cm',bodyType:'匀称',skinTone:'白皙',hairColor:'金色',style:'轻奢高级'} },
    { id:'MOD-005', name:'非洲男模特 · 商务精英', kind:'model', mediaType:'图片', image:modelDemoImages[4], details:'男 · 35–44岁 · 非洲 · 181-185cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-10 17:20', config:{gender:'男',ageRange:'35–44岁',region:'非洲',height:'181-185cm',bodyType:'健壮',skinTone:'深肤色',hairColor:'黑色',style:'商务精英'} },
    { id:'MOD-006', name:'东亚女模特 · 学院风', kind:'model', mediaType:'图片', image:modelDemoImages[5], details:'女 · 18–24岁 · 东亚 · 165-170cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-10 14:05', config:{gender:'女',ageRange:'18–24岁',region:'东亚',height:'165-170cm',bodyType:'偏瘦',skinTone:'自然肤色',hairColor:'黑色',style:'学院风'} },
    { id:'MOD-007', name:'中东女模特 · 成熟稳重', kind:'model', mediaType:'图片', image:modelDemoImages[6], details:'女 · 25–34岁 · 中东 · 165-170cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-09 16:25', config:{gender:'女',ageRange:'25–34岁',region:'中东',height:'165-170cm',bodyType:'匀称',skinTone:'自然肤色',hairColor:'黑色',style:'成熟稳重'} },
    { id:'MOD-008', name:'南亚男模特 · 休闲日常', kind:'model', mediaType:'图片', image:modelDemoImages[7], details:'男 · 25–34岁 · 南亚 · 176-180cm', sourceTask:'原型库示例', sourceNode:'模特配置', ratio:'—', location:'/AI素材/原型库/模特原型', status:'已存储', time:'2026-09-09 10:50', config:{gender:'男',ageRange:'25–34岁',region:'南亚',height:'176-180cm',bodyType:'标准',skinTone:'小麦色',hairColor:'黑色',style:'休闲日常'} },
    { id:'SCN-001', name:'海岛日落场景模板', kind:'scene', mediaType:'图片', details:'海岛 · 暖阳金调 · 度假氛围', sourceTask:'原型库示例', sourceNode:'场景生成', ratio:'4:5', location:'/AI素材/原型库/场景模板', status:'已存储', time:'2026-09-12 10:16', config:{shotComposition:'全景（全身带环境）',toneStyle:'暖阳金调-温暖治愈',artAtmosphere:'都市度假-轻奢松弛'} },
    { id:'SCN-002', name:'极简影棚场景模板', kind:'scene', mediaType:'图片', details:'影棚 · 中性影棚色调 · 极简氛围', sourceTask:'原型库示例', sourceNode:'场景生成', ratio:'3:4', location:'/AI素材/原型库/场景模板', status:'已存储', time:'2026-09-12 10:12', config:{shotComposition:'中景（半身穿搭）',toneStyle:'中性影棚-真实还原',artAtmosphere:'极简纯粹-留白高级感'} },
    { id:'SCN-003', name:'城市街景场景模板', kind:'scene', mediaType:'视频', details:'街景 · 冷调科技光线 · 动态参考', sourceTask:'原型库示例', sourceNode:'场景生成', ratio:'9:16', location:'/AI素材/原型库/场景模板', status:'已存储', time:'2026-09-11 14:40', config:{shotComposition:'中景（半身穿搭）',toneStyle:'冷调科技-专业洁净',artAtmosphere:'时尚大片-先锋杂志感'} },
    { id:'SCN-004', name:'健身房运动场景模板', kind:'scene', mediaType:'图片', details:'健身房 · 专业冷调 · 运动张力', sourceTask:'原型库示例', sourceNode:'场景生成', ratio:'16:9', location:'/AI素材/原型库/场景模板', status:'已存储', time:'2026-09-10 16:20', config:{shotComposition:'全景（全身带环境）',toneStyle:'冷调科技-专业洁净',artAtmosphere:'运动活力-动态张力'} }
  ];
  let nodeOutputs = [
    {taskId:'TSK-20260918',task:'夏季新品多渠道素材优化',nodeKey:'clean',name:'夏季新品_清理结果.jpg',assetId:'OUT-0180',saved:false,time:'2026-09-15 14:31',source:'自行上传'},
    {taskId:'TSK-20260918',task:'夏季新品多渠道素材优化',nodeKey:'scene',name:'夏季新品_场景结果.jpg',assetId:'MAT-0181',saved:true,time:'2026-09-15 14:32',source:'上一步节点产出'},
    {taskId:'TSK-20260918',task:'夏季新品多渠道素材优化',nodeKey:'detail',name:'夏季新品_精修结果.jpg',assetId:'MAT-0182',saved:true,time:'2026-09-15 14:35',source:'上一步节点产出'}
  ];

  function loadStored(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) && value.length ? value : fallback;
    } catch { return fallback; }
  }
  function loadStoredArrayAllowEmpty(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value : fallback;
    } catch { return fallback; }
  }
  function loadStoredObject(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch { return fallback; }
  }
  let assetTags = migrateLegacyNodeNames(loadStoredArrayAllowEmpty('ai-material-asset-tags-v1', assetTagDefaults))
    .filter(item => item && item.id && item.name)
    .map(item => ({ id:String(item.id), name:String(item.name).trim() }));
  const taskRecordStatuses = new Set(['已完成','已终止并入库','已终止','暂存']);
  function normalizeTaskRecordStatus(status, meta = {}) {
    const rawStatus = String(status || '').trim();
    const hasStoredAssets = Number(meta.saved) > 0;
    if (taskRecordStatuses.has(rawStatus)) return rawStatus;
    if (rawStatus === '失败') return hasStoredAssets ? '已终止并入库' : '已终止';
    if (rawStatus.includes('终止')) return hasStoredAssets ? '已终止并入库' : '已终止';
    if (rawStatus.includes('完成')) return '已完成';
    return '暂存';
  }
  tasks = migrateLegacyNodeNames(loadStored('ai-material-tasks-v2', tasks)).map((row, index) => {
    const next = [...row];
    const meta = { ...(next[7] || {}) };
    const rawStatus = next[5];
    next[5] = normalizeTaskRecordStatus(rawStatus, meta);
    const legacyId = `TSK-LEGACY-${String(index + 1).padStart(3, '0')}-${String(next[6] || '').replace(/\D/g, '').slice(0, 8) || 'UNKNOWN'}`;
    const legacyGeneratedId = Boolean(meta.legacyGeneratedId) || !meta.id || String(meta.id).startsWith('TSK-LEGACY-');
    next[7] = { ...meta, id:meta.id || legacyId, ...(legacyGeneratedId ? { legacyGeneratedId:true } : {}), ...(rawStatus !== next[5] ? { rawStatus } : {}) };
    return next;
  });
  localStorage.setItem('ai-material-tasks-v2', JSON.stringify(tasks));
  assets = migrateLegacyNodeNames(loadStored('ai-material-assets-v2', assets)).map(row => {
    const [sourceTask = '', sourceNode = ''] = String(row[3] || '').split(' / ');
    const seedMetadata = assetSyncMetaDefaults[row[1]] || {};
    const metadata = { ...seedMetadata, ...(row[8] || {}) };
    const producer = String(metadata.producer || seedMetadata.producer || '').trim();
    const producerDepartment = String(metadata.producerDepartment || seedMetadata.producerDepartment || '').trim();
    const tagIds = [...new Set(Array.isArray(metadata.tagIds) ? metadata.tagIds.map(String) : [])].filter(id => assetTags.some(tag => tag.id === id)).slice(0,20);
    const normalized = [...row.slice(0,6), row[6] === '已过期' ? '已过期' : '正常', row[7], { ...metadata, sourceTask:metadata.sourceTask || sourceTask, sourceNode:metadata.sourceNode || sourceNode, creator:String(metadata.creator || ''), quality:metadata.quality || '自动适配', tagIds, visualDemandId:String(metadata.visualDemandId || ''), taskId:String(metadata.taskId || assetSyncMetaDefaults[row[1]]?.taskId || ''), spu:String(metadata.spu || ''), expression:String(metadata.expression || ''), mainSellingPoint:String(metadata.mainSellingPoint || ''), secondarySellingPoint:String(metadata.secondarySellingPoint || ''), scene:String(metadata.scene || ''), version:String(metadata.version || ''), materialCategory:String(metadata.materialCategory || ''), producer, producerDepartment, completedAt:String(metadata.completedAt || '') }];
    return normalized;
  });
  let selectedAssetIds = new Set();
  let visibleAssetIds = [];
  localStorage.setItem('ai-material-assets-v2', JSON.stringify(assets));
  localStorage.setItem('ai-material-asset-tags-v1', JSON.stringify(assetTags));
  nodeOutputs = migrateLegacyNodeNames(loadStored('ai-material-node-outputs-v1', nodeOutputs));
  const deletedPrototypeIds = new Set(loadStored('ai-material-deleted-prototype-ids-v1', []));
  let prototypes = migrateLegacyNodeNames(loadStored('ai-material-prototypes-v1', prototypeDefaults)).filter(item => !deletedPrototypeIds.has(item.id));
  prototypeDefaults.forEach(defaultItem => {
    if (deletedPrototypeIds.has(defaultItem.id)) return;
    const existing = prototypes.find(item => item.id === defaultItem.id);
    if (!existing) prototypes.push({ ...defaultItem, config:{ ...defaultItem.config } });
    else if (defaultItem.image && !existing.image) existing.image = defaultItem.image;
  });
  const legacySceneTemplateLabel = '场景模' + '版';
  const legacyPrototypeTypes = ['模特','场景','模特原型',legacySceneTemplateLabel,'场景模板'];
  const legacyPrototypeAssets = assets.filter(row => legacyPrototypeTypes.includes(row[2]));
  if (legacyPrototypeAssets.length) {
    legacyPrototypeAssets.forEach(row => {
      if (prototypes.some(item => item.id === row[1])) return;
      const kind = String(row[2]).includes('模特') ? 'model' : 'scene';
      prototypes.unshift({ id:row[1], name:row[0], kind, mediaType:/\.(mp4|mov|webm)$/i.test(row[0]) ? '视频' : '图片', details:row[3], sourceTask:String(row[3]).split(' / ')[0] || '历史任务', sourceNode:String(row[3]).split(' / ')[1] || (kind === 'model' ? '模特配置' : '场景生成'), ratio:row[4], location:row[5], status:row[6], time:row[7], config:{} });
    });
    assets = assets.filter(row => !legacyPrototypeTypes.includes(row[2]));
    localStorage.setItem('ai-material-prototypes-v1', JSON.stringify(prototypes));
    localStorage.setItem('ai-material-assets-v2', JSON.stringify(assets));
  }
  prototypes = prototypes.map(item => ['model','scene'].includes(item.kind) ? {
    ...item,
    status:['启用','停用'].includes(item.status) ? item.status : '启用',
    uses:Number.isFinite(Number(item.uses)) ? Math.max(0, Number(item.uses)) : ((item.kind === 'model' ? modelPrototypeSeedUses : scenePrototypeSeedUses)[item.id] || 0)
  } : item);
  localStorage.setItem('ai-material-prototypes-v1', JSON.stringify(prototypes));
  let templates = migrateLegacyNodeNames(loadStored('ai-material-templates-v2', templateDefaults));

  function splitValue(total, ratios) {
    const values = ratios.map((ratio, index) => index === ratios.length - 1 ? 0 : Math.round(total * ratio));
    values[values.length - 1] = total - values.reduce((sum, value) => sum + value, 0);
    return values;
  }
  function buildPhases(nodeKey, input, output, cache, retry = 0) {
    const definitions = [...phaseNames[nodeKey]];
    if (retry) definitions.push(['失败重试','根据校验结果补充约束并重新调用模型']);
    const inputRatios = retry ? [.22,.18,.30,.12,.18] : [.28,.22,.38,.12];
    const outputRatios = retry ? [0,.10,.48,.14,.28] : [0,.12,.70,.18];
    const inputs = splitValue(input, inputRatios);
    const outputs = splitValue(output, outputRatios);
    return definitions.map((phase, index) => ({ name:phase[0], action:phase[1], input:inputs[index], output:outputs[index], cache:index === 0 ? cache : 0, duration:`${(index === 2 ? 6.8 : 1.2 + index * .7).toFixed(1)}s`, result:phase[0] === '失败重试' ? '重试成功' : '完成' }));
  }
  function makeTokenRecord(id, taskId, task, nodeKey, org, account, model, input, output, cache, duration, status, time, retry = 0) {
    return normalizeQuotaRecord({ id, taskId, task, nodeKey, node:nodeMap[nodeKey].name, org, account, model, input, output, cache, duration, status, time, retry, phases:buildPhases(nodeKey,input,output,cache,retry) });
  }
  function normalizeQuotaRecord(item = {}) {
    const input = Number(item.tokenInput ?? item.input) || 0;
    const output = Number(item.tokenOutput ?? item.output) || 0;
    const cache = Number(item.tokenCache ?? item.cache) || 0;
    const tokenTotal = Number(item.tokenTotal) || input + output;
    const unitPriceCny = modelQuotaPriceCny(item.model);
    return {
      ...item,
      input,
      output,
      cache,
      tokenInput:input,
      tokenOutput:output,
      tokenCache:cache,
      tokenTotal,
      executorName:executionPersonName(item.executorName || item.account),
      unitPriceCny,
      inputQuota:quotaFromUsage(input, item.model),
      outputQuota:quotaFromUsage(output, item.model),
      cacheQuota:quotaFromUsage(cache, item.model),
      total:quotaFromUsage(tokenTotal, item.model),
      quotaCurrency:'CNY'
    };
  }

  let tokenDetails = [
    makeTokenRecord('RUN-0920-DRAFT-01','TSK-DRAFT-0920','双十一新品白底图优化','clean','品牌中心','zhangsan@demo','GPT Image 2',240,180,40,'8.6s','成功','2026-09-20 10:02:18'),
    makeTokenRecord('RUN-0915-0183-03','TSK-20260918','夏季新品多渠道素材优化','detail','品牌中心','zhangsan@demo','Gemini Image Pro',724,890,126,'15.2s','成功','2026-09-15 14:32:54'),
    makeTokenRecord('RUN-0915-0183-02','TSK-20260918','夏季新品多渠道素材优化','scene','品牌中心','zhangsan@demo','GPT Image',1348,1536,214,'28.6s','成功（重试1次）','2026-09-15 14:32:25',1),
    makeTokenRecord('RUN-0915-0183-01','TSK-20260918','夏季新品多渠道素材优化','clean','品牌中心','zhangsan@demo','Gemini Image Pro',612,322,145,'18.4s','成功','2026-09-15 14:32:06'),
    makeTokenRecord('RUN-0915-0178-02','TSK-20260917','TikTok 秋季上新短视频','detail','海外事业部','lisi@demo','Gemini Image Pro',3180,3460,420,'42.3s','成功','2026-09-15 11:08:48'),
    makeTokenRecord('RUN-0915-0178-01','TSK-20260917','TikTok 秋季上新短视频','scene','海外事业部','lisi@demo','GPT Image',2940,3100,388,'55.7s','成功','2026-09-15 11:08:02'),
    makeTokenRecord('RUN-0914-0169-01','TSK-20260916','防晒衣白底图清理','clean','电商中心','wangwu@demo','Gemini Image Pro',584,562,118,'17.9s','成功','2026-09-14 17:46:20'),
    makeTokenRecord('RUN-0914-0163-01','TSK-20260915','运动鞋街景图精修','detail','品牌中心','zhaoliu@demo','Gemini Image Pro',892,830,96,'21.2s','失败','2026-09-14 15:20:12'),
    makeTokenRecord('RUN-0913-0156-01','TSK-20260914','产品旋转展示','scene','电商中心','wangwu@demo','内部图像模型',1420,1780,260,'34.8s','成功','2026-09-13 16:04:30')
  ];
  tokenDetails = migrateLegacyNodeNames(loadStored('ai-material-token-details-v2', tokenDetails)).map(item => normalizeQuotaRecord({ ...item, node:nodeMap[item.nodeKey]?.name || item.node }));
  function replaceTaskTokenDetails(taskId, records = []) {
    const id = String(taskId || '').trim();
    if (!id) return;
    const normalized = records.map(item => normalizeQuotaRecord({ ...item, taskId:id, node:nodeMap[item.nodeKey]?.name || item.node }));
    tokenDetails = [...normalized, ...tokenDetails.filter(item => String(item.taskId || '') !== id)];
  }
  try {
    const storedDraft = JSON.parse(localStorage.getItem('ai-material-draft-v4') || 'null');
    if (storedDraft?.id && Array.isArray(storedDraft.records) && storedDraft.records.length) {
      replaceTaskTokenDetails(storedDraft.id, storedDraft.records);
      localStorage.setItem('ai-material-token-details-v2', JSON.stringify(tokenDetails));
    }
  } catch {}

  const taskMaterialDetailDefaults = {
    'TSK-20260918':{
      uploadCounts:{ clean:4, scene:2, detail:1 },
      configs:{
        clean:{...defaultConfigs.clean, views:['正面3D','侧面45度'], ratio:'4:5', quality:'超清 2K'},
        scene:{...defaultConfigs.scene, mediaType:'图片', generateCount:'3', ratio:'4:5', quality:'超清（2K）', model:'GPT Image'},
        detail:{...defaultConfigs.detail, mediaType:'图片', generateCount:'2', ratio:'4:5', quality:'商业超清（2K）'}
      },
      outputBreakdown:{ clean:{image:2,video:0,model:0,scene:0}, scene:{image:3,video:0,model:1,scene:1}, detail:{image:2,video:0,model:0,scene:0} }
    },
    'TSK-20260917':{
      uploadCounts:{ scene:2, detail:1 },
      configs:{
        scene:{...defaultConfigs.scene, mediaType:'视频', outputDuration:'12', durationUnit:'秒', ratio:'9:16', quality:'高清（1080P）', model:'GPT Image'},
        detail:{...defaultConfigs.detail, mediaType:'视频', outputDuration:'12', durationUnit:'秒', ratio:'9:16', quality:'高清（1080P）'}
      },
      outputBreakdown:{ scene:{image:0,video:1,model:1,scene:1}, detail:{image:0,video:1,model:0,scene:0} }
    },
    'TSK-20260916':{
      uploadCounts:{ clean:4 },
      configs:{ clean:{...defaultConfigs.clean, views:['正面3D'], ratio:'4:5', quality:'超清 2K', beautify:'标准美化'} },
      outputBreakdown:{ clean:{image:1,video:0,model:0,scene:0} }
    },
    'TSK-20260915':{
      uploadCounts:{ detail:2 },
      configs:{ detail:{...defaultConfigs.detail, mediaType:'图片', generateCount:'3', ratio:'16:9', quality:'高清（1080P）'} },
      outputBreakdown:{ detail:{image:3,video:0,model:0,scene:0} }
    }
  };
  taskMaterialDetailDefaults['TSK-20260918'].generationBatches = {
    clean:[{ attempt:1, generationMode:'initial', basedOnAttempt:null, config:{...taskMaterialDetailDefaults['TSK-20260918'].configs.clean}, uploadCount:4, outputBreakdown:{image:2,video:0,model:0,scene:0}, storedCount:0, time:'2026-09-15 14:32:06' }],
    scene:[
      { attempt:1, generationMode:'initial', basedOnAttempt:null, config:{...taskMaterialDetailDefaults['TSK-20260918'].configs.scene, ratio:'1:1', quality:'高清（1080P）'}, uploadCount:2, outputBreakdown:{image:3,video:0,model:1,scene:1}, storedCount:0, time:'2026-09-15 14:21:18' },
      { attempt:2, generationMode:'restart', basedOnAttempt:null, config:{...taskMaterialDetailDefaults['TSK-20260918'].configs.scene}, uploadCount:2, outputBreakdown:{image:3,video:0,model:1,scene:1}, storedCount:1, time:'2026-09-15 14:32:25' }
    ],
    detail:[{ attempt:1, generationMode:'continue', basedOnAttempt:2, config:{...taskMaterialDetailDefaults['TSK-20260918'].configs.detail}, uploadCount:1, outputBreakdown:{image:2,video:0,model:0,scene:0}, storedCount:1, time:'2026-09-15 14:32:54' }]
  };
  taskMaterialDetailDefaults['TSK-20260917'].generationBatches = {
    scene:[{ attempt:1, generationMode:'initial', basedOnAttempt:null, config:{...taskMaterialDetailDefaults['TSK-20260917'].configs.scene}, uploadCount:2, outputBreakdown:{image:0,video:1,model:1,scene:1}, storedCount:0, time:'2026-09-15 11:08:02' }],
    detail:[{ attempt:1, generationMode:'continue', basedOnAttempt:1, config:{...taskMaterialDetailDefaults['TSK-20260917'].configs.detail}, uploadCount:1, outputBreakdown:{image:0,video:1,model:0,scene:0}, storedCount:1, time:'2026-09-15 11:08:48' }]
  };
  taskMaterialDetailDefaults['TSK-20260916'].generationBatches = {
    clean:[{ attempt:1, generationMode:'initial', basedOnAttempt:null, config:{...taskMaterialDetailDefaults['TSK-20260916'].configs.clean}, uploadCount:4, outputBreakdown:{image:1,video:0,model:0,scene:0}, storedCount:1, time:'2026-09-14 17:46:20' }]
  };
  taskMaterialDetailDefaults['TSK-20260915'].generationBatches = {
    detail:[{ attempt:1, generationMode:'initial', basedOnAttempt:null, config:{...taskMaterialDetailDefaults['TSK-20260915'].configs.detail}, uploadCount:2, outputBreakdown:{image:3,video:0,model:0,scene:0}, storedCount:0, time:'2026-09-14 15:20:12' }]
  };

  function taskItemsForRow(collection, row) {
    const meta = row?.[7] || {};
    const exactMatches = meta.id ? collection.filter(item => item.taskId === meta.id) : [];
    if (meta.id) return exactMatches;
    return collection.filter(item => item.task === row?.[0]);
  }
  function buildTaskNodeStats(nodeKeys = [], records = [], storedOutputs = [], generatedOutputs = []) {
    const stats = {};
    const storedIds = {};
    const generatedIds = {};
    const ensure = nodeKey => {
      if (!nodeKey) return null;
      if (!stats[nodeKey]) stats[nodeKey] = { generated:0, stored:0, quota:0, executions:0 };
      if (!storedIds[nodeKey]) storedIds[nodeKey] = new Set();
      if (!generatedIds[nodeKey]) generatedIds[nodeKey] = new Set();
      return stats[nodeKey];
    };
    records.forEach(record => {
      const stat = ensure(record.nodeKey);
      if (stat) {
        stat.quota += Number(record.total) || 0;
        stat.executions += 1 + Math.max(0, Number(record.retry) || 0);
      }
    });
    generatedOutputs.forEach((output, index) => {
      const stat = ensure(output.nodeKey);
      if (!stat) return;
      const identity = output.assetId || `${output.nodeKey}-${output.name || 'output'}-${output.time || index}`;
      generatedIds[output.nodeKey].add(identity);
      stat.generated = generatedIds[output.nodeKey].size;
    });
    storedOutputs.forEach((output, index) => {
      if (output.saved === false) return;
      const stat = ensure(output.nodeKey);
      if (!stat) return;
      const identity = output.assetId || `${output.nodeKey}-${output.name || 'output'}-${output.time || index}`;
      storedIds[output.nodeKey].add(identity);
      stat.stored = storedIds[output.nodeKey].size;
    });
    const ordered = {};
    [...new Set([...nodeKeys, ...Object.keys(stats)])].forEach(nodeKey => {
      if (stats[nodeKey]) ordered[nodeKey] = stats[nodeKey];
    });
    return ordered;
  }
  function buildTaskOutputBreakdown(outputs = []) {
    const breakdown = {};
    outputs.forEach(output => {
      if (!output.nodeKey) return;
      breakdown[output.nodeKey] ||= { image:0, video:0, model:0, scene:0 };
      const kind = output.outputKind || 'material';
      if (kind === 'model' || kind === 'scene') breakdown[output.nodeKey][kind] += 1;
      else breakdown[output.nodeKey][output.type === '视频' ? 'video' : 'image'] += 1;
    });
    return breakdown;
  }
  function buildTaskGenerationBatches(outputs = [], generationBatchMeta = {}) {
    const nodeKeys = new Set([...outputs.map(output => output.nodeKey), ...Object.keys(generationBatchMeta || {})].filter(Boolean));
    const result = {};
    nodeKeys.forEach(nodeKey => {
      const nodeOutputsForTask = outputs.filter(output => output.nodeKey === nodeKey);
      const metaByAttempt = generationBatchMeta?.[nodeKey] || {};
      const attempts = new Set([
        ...nodeOutputsForTask.map(output => Number(output.attempt) || 1),
        ...Object.keys(metaByAttempt).map(value => Number(value) || 1)
      ]);
      result[nodeKey] = [...attempts].sort((a,b) => a - b).map(attempt => {
        const batchOutputs = nodeOutputsForTask.filter(output => (Number(output.attempt) || 1) === attempt);
        const meta = metaByAttempt[attempt] || metaByAttempt[String(attempt)] || {};
        const sample = batchOutputs.find(output => output.configSnapshot || output.prototypeConfig) || batchOutputs[0] || {};
        const outputBreakdown = buildTaskOutputBreakdown(batchOutputs)[nodeKey] || { image:0, video:0, model:0, scene:0 };
        return {
          attempt,
          generationMode:meta.generationMode || sample.generationMode || (attempt === 1 ? 'initial' : 'restart'),
          basedOnAttempt:meta.basedOnAttempt ?? sample.basedOnAttempt ?? null,
          config:{ ...(meta.configSnapshot || sample.configSnapshot || sample.prototypeConfig || {}) },
          uploadCount:Number(meta.uploadCount) || 0,
          outputBreakdown,
          storedCount:batchOutputs.filter(output => output.saved).length,
          time:meta.time || sample.time || '—'
        };
      });
    });
    return result;
  }
  function taskRouteKeys(row) {
    const meta = row?.[7] || {};
    const knownKeys = Array.isArray(meta.nodes) ? meta.nodes.filter(key => nodeMap[key]) : [];
    if (knownKeys.length) return knownKeys;
    const keyByName = Object.fromEntries(Object.entries(nodeMap).map(([key, value]) => [value.name, key]));
    return String(row?.[2] || '').split(' → ').map(name => keyByName[name]).filter(Boolean);
  }
  function taskNodeBreakdown(row) {
    const meta = row?.[7] || {};
    const records = taskItemsForRow(tokenDetails, row);
    const outputs = taskItemsForRow(nodeOutputs, row);
    const fallback = meta.nodeStats && typeof meta.nodeStats === 'object' ? meta.nodeStats : {};
    const observed = new Set([
      ...records.map(item => item.nodeKey),
      ...outputs.map(item => item.nodeKey),
      ...Object.keys(fallback)
    ].filter(key => key && nodeMap[key]));
    const orderedKeys = [...taskRouteKeys(row).filter(key => observed.has(key)), ...[...observed].filter(key => !taskRouteKeys(row).includes(key))];
    return orderedKeys.map(nodeKey => {
      const nodeRecords = records.filter(item => item.nodeKey === nodeKey);
      const nodeOutputsForTask = outputs.filter(item => item.nodeKey === nodeKey && item.saved);
      const fallbackStat = fallback[nodeKey] || {};
      const quota = nodeRecords.length
        ? nodeRecords.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
        : Object.prototype.hasOwnProperty.call(fallbackStat, 'quota') ? Number(fallbackStat.quota) || 0
        : Object.prototype.hasOwnProperty.call(fallbackStat, 'tokens') ? quotaFromUsage(fallbackStat.tokens, nodeMap[nodeKey]?.model) : null;
      const executions = nodeRecords.length
        ? nodeRecords.reduce((sum, item) => sum + 1 + Math.max(0, Number(item.retry) || 0), 0)
        : Object.prototype.hasOwnProperty.call(fallbackStat, 'executions') ? Number(fallbackStat.executions) || 0 : null;
      let stored = null;
      if (outputs.length) {
        stored = new Set(nodeOutputsForTask.map((item, index) => item.assetId || `${item.name || 'output'}-${item.time || index}`)).size;
      } else if (Object.prototype.hasOwnProperty.call(fallbackStat, 'stored')) {
        stored = Number(fallbackStat.stored) || 0;
      } else if (Number(meta.saved) === 0) {
        stored = 0;
      }
      return { nodeKey, nodeName:nodeMap[nodeKey]?.name || nodeRecords[0]?.node || '未知节点', stored, quota, executions };
    });
  }
  function taskStoredTotal(row, breakdown = taskNodeBreakdown(row)) {
    if (breakdown.length && breakdown.every(item => item.stored !== null)) return breakdown.reduce((sum, item) => sum + item.stored, 0);
    return Number(row?.[7]?.saved) || 0;
  }
  function taskTotalQuota(row, breakdown = taskNodeBreakdown(row)) {
    if (breakdown.length && breakdown.every(item => item.quota !== null)) return breakdown.reduce((sum, item) => sum + item.quota, 0);
    const storedTotal = Number(String(row?.[4] || '0').replaceAll(',', '')) || 0;
    return row?.[7]?.quotaCurrency === 'CNY' ? storedTotal : quotaFromUsage(storedTotal, nodeMap[taskRouteKeys(row)[0]]?.model);
  }
  function upsertTaskRecord(row) {
    const taskId = row?.[7]?.id;
    const index = taskId ? tasks.findIndex(item => item?.[7]?.id === taskId) : -1;
    if (index >= 0) tasks.splice(index, 1, row);
    else tasks.unshift(row);
  }

  const currentUserContext = { name:'管理员', role:'org-admin', org:'品牌中心', isOrgAdmin:true, assetVisibility:'all' };
  let workbenchActivity = loadStored('ai-material-workbench-activity-v2', [
    { time:'2026-09-20 10:18', completed:3, userQuota:15.36, orgQuota:76.86 },
    { time:'2026-09-18 16:40', completed:4, userQuota:20.48, orgQuota:124.00 },
    { time:'2026-09-15 14:35', completed:5, userQuota:29.68, orgQuota:168.00 },
    { time:'2026-08-29 11:20', completed:6, userQuota:32.00, orgQuota:204.00 }
  ]);
  let workbenchTasks = [
    { id:'TSK-DRAFT-0920', name:'双十一新品白底图优化', type:'图片', status:'draft', statusLabel:'暂存', progress:25, step:'创建任务 · 已选择 2 个节点', updated:'今天 09:42', updatedAt:'2026-09-20 09:42', nodes:['clean','detail'], current:0, org:'品牌中心 / 视觉设计部', requester:'张三', businessLine:'品牌电商', action:'继续执行' },
    { id:'TSK-RUN-0919', name:'秋冬 Campaign 多场景主图', type:'图片', status:'running', statusLabel:'执行中', progress:58, step:'当前节点：场景生成（2/3）', updated:'昨天 18:26', updatedAt:'2026-09-19 18:26', nodes:['clean','scene','detail'], current:1, org:'品牌中心 / 视觉设计部', requester:'张三', businessLine:'品牌电商', action:'继续执行' },
    { id:'TSK-STORE-0918', name:'新品开箱短视频精修', type:'视频', status:'storage', statusLabel:'待入库', progress:92, step:'全部节点已完成 · 待确认入库', updated:'09-17 16:08', updatedAt:'2026-09-17 16:08', nodes:['scene','detail'], current:1, org:'品牌中心 / 视觉设计部', requester:'张三', businessLine:'内容营销', action:'继续执行' }
  ];

  const defaultDemandOptionConfig = {
    businessChannel:['DTC','AMZ','其它'],
    channelCategory:['Paid Social','WEB','Email','Paid Search','AMZ拍摄协助','AMZ页面调性','OTH'],
    productLevel:['无','新品','潜力品','旺销','爆品'],
    demandSource:['素材下需','日常安排'],
    materialType:['IMG','VID','GIF'],
    expression:['Shoot-PD 实拍纯产品','AI-PD 纯产品','TTS UGC','IG UGC','Sale促销贴文','New新品预告','Shoot-MP 实拍模拍','AI-MP 模拍','Remix 混剪&拼接','Campaign系列','Flow系列','网站UI','营销主题','模特修图','AI-UGC口播'],
    mainSellingPoint:['无','Soft 柔软','Breathable 透气','Cooling 冰感','Stretch 弹力','Premium 高级感','WrinkleFree 抗皱','Moisture-Wicking 吸湿排汗','Quick-Drying 速干','Shape-Retaining 不变形','Home 家居','Sale促销贴文','Waterproof 防水','Performance 高性能','Multi-pockets 多口袋','Antibacterial 抗菌','Liner 内衬'],
    secondarySellingPoint:['无','Slim Fit 修身','Relaxed Fit 宽松','Durable 耐穿','Lightweight 轻便','Natural linen 天然','Shape-retaining 不变形','Elastic waistband 松紧腰','Drawstring waist 抽绳设计','Versatile 百搭','Pocket details 口袋特点','Collar details 领子特点','Cuff details 袖口特点','Hem design 下摆线条','Average（标准）','Soft 柔软','Stretch 弹力'],
    scene:['无','Outdoor 外景','Studio 棚拍','Indoor 室内搭景','Commute 通勤','Cafe 咖啡厅','Home 家居','Street 街拍','Business 商务','Gym 健身','Resort 度假'],
    bodyType:['无','Plus size（肥胖）','Athletic（肌肉）','Average（标准）','Slim（瘦弱）'],
    requester:['沈玲燕','潘金兰','张三','李四','王五','赵六'],
    priority:['P0','P1','P2'],
    materialCategory:['UGC','ProductDisplay','ProductBenefits','ModelShowcase','Styling','Lifestyle','Promotion'],
    scopes:{
      channelCategory:{'Paid Social':['DTC'],'WEB':['DTC'],'Email':['DTC'],'Paid Search':['DTC'],'AMZ拍摄协助':['AMZ','其它'],'AMZ页面调性':['AMZ','其它'],'OTH':['DTC','AMZ','其它']},
      materialType:{IMG:['DTC','AMZ','其它'],VID:['DTC','AMZ','其它'],GIF:['DTC']},
      expression:Object.fromEntries(['Shoot-PD 实拍纯产品','AI-PD 纯产品','TTS UGC','IG UGC','Sale促销贴文','New新品预告','Shoot-MP 实拍模拍','AI-MP 模拍','Remix 混剪&拼接','Campaign系列','Flow系列','网站UI','营销主题','模特修图','AI-UGC口播'].map(value => [value,['DTC','AMZ','其它']]))
    }
  };
  const demandOptionFieldLabels = {
    businessChannel:'业务渠道', channelCategory:'渠道归类', productLevel:'产品级别', demandSource:'需求来源', materialType:'素材格式', expression:'表达方式', mainSellingPoint:'主卖点', secondarySellingPoint:'辅助卖点', scene:'场景', bodyType:'模特体型', priority:'优先级', materialCategory:'素材类型'
  };
  const demandOptionIdentityOverrides = {
    'businessChannel:其它':{ id:'OTHER', label:'其它' },
    'productLevel:新品':{ id:'NEW', label:'新品' },
    'productLevel:潜力品':{ id:'POTENTIAL', label:'潜力品' },
    'productLevel:旺销':{ id:'BESTSELLER', label:'旺销' },
    'productLevel:爆品':{ id:'HERO', label:'爆品' },
    'productLevel:/':{ id:'NONE', label:'无' },
    'productLevel:无':{ id:'NONE', label:'无' },
    'demandSource:素材下需':{ id:'MATERIAL_REQUEST', label:'素材下需' },
    'demandSource:日常安排':{ id:'DAILY_PLAN', label:'日常安排' },
    'expression:Shoot-PD 实拍纯产品':{ id:'Shoot-PD', label:'实拍纯产品' },
    'expression:AI-PD 纯产品':{ id:'AI-PD', label:'AI纯产品' },
    'expression:TTS UGC':{ id:'TTS-UGC', label:'TTS口播' },
    'expression:IG UGC':{ id:'IG-UGC', label:'IG原生口播' },
    'expression:Sale促销贴文':{ id:'Sale', label:'促销贴文' },
    'expression:New新品预告':{ id:'New', label:'新品预告' },
    'expression:Shoot-MP 实拍模拍':{ id:'Shoot-MP', label:'实拍模拍' },
    'expression:AI-MP 模拍':{ id:'AI-MP', label:'AI模拍' },
    'expression:Remix 混剪&拼接':{ id:'Remix', label:'混剪&拼接' },
    'expression:Campaign系列':{ id:'Campaign', label:'Campaign系列' },
    'expression:Flow系列':{ id:'Flow', label:'Flow系列' },
    'expression:网站UI':{ id:'UI', label:'网站UI' },
    'expression:营销主题':{ id:'Marketing-Theme', label:'营销主题' },
    'expression:模特修图':{ id:'Model-Retouch', label:'模特修图' },
    'expression:AI-UGC口播':{ id:'AI-UGC', label:'AI-UGC口播' },
    'mainSellingPoint:无':{ id:'NONE', label:'无' },
    'secondarySellingPoint:无':{ id:'NONE', label:'无' },
    'scene:无':{ id:'NONE', label:'无' },
    'bodyType:无':{ id:'NONE', label:'无' }
  };
  const demandOptionSchemaVersion = '20260929-option-lifecycle-v5';
  const demandOptionSchemaVersionKey = 'ai-material-visual-demand-options-schema-version';
  const demandOptionHistoryKey = 'ai-material-visual-demand-option-history-v1';
  const storedDemandOptionConfig = loadStoredObject('ai-material-visual-demand-options-v1', defaultDemandOptionConfig);
  let demandOptionConfig = normalizeDemandOptionConfiguration({ ...JSON.parse(JSON.stringify(defaultDemandOptionConfig)), ...storedDemandOptionConfig, scopes:{...defaultDemandOptionConfig.scopes,...(storedDemandOptionConfig?.scopes || {})} });
  if (localStorage.getItem(demandOptionSchemaVersionKey) !== demandOptionSchemaVersion) {
    const defaultExpressionOptions = defaultDemandOptionConfig.expression.map((value,index) => normalizeDemandOption('expression', value, index));
    const existingExpressionById = new Map((demandOptionConfig.expression || []).map(option => [option.id.toLowerCase(), option]));
    demandOptionConfig.expression = [
      ...defaultExpressionOptions.map(option => ({ ...option, ...(existingExpressionById.get(option.id.toLowerCase()) || {}), label:option.label })),
      ...(demandOptionConfig.expression || []).filter(option => !defaultExpressionOptions.some(defaultOption => defaultOption.id.toLowerCase() === option.id.toLowerCase()))
    ];
    const defaultProductLevelOptions = defaultDemandOptionConfig.productLevel.map((value,index) => normalizeDemandOption('productLevel', value, index));
    const existingProductLevelById = new Map((demandOptionConfig.productLevel || []).map(option => [option.id.toLowerCase(), option]));
    demandOptionConfig.productLevel = [
      ...defaultProductLevelOptions.map(option => ({ ...option, ...(existingProductLevelById.get(option.id.toLowerCase()) || {}), label:option.label })),
      ...(demandOptionConfig.productLevel || []).filter(option => !defaultProductLevelOptions.some(defaultOption => defaultOption.id.toLowerCase() === option.id.toLowerCase()))
    ];
    demandOptionConfig.scopes = normalizeDemandOptionScopes({ ...defaultDemandOptionConfig.scopes, ...(demandOptionConfig.scopes || {}) }, demandOptionConfig);
    localStorage.setItem('ai-material-visual-demand-options-v1', JSON.stringify(demandOptionConfig));
    localStorage.setItem(demandOptionSchemaVersionKey, demandOptionSchemaVersion);
  }
  let demandOptionHistory = normalizeDemandOptionHistory(loadStoredObject(demandOptionHistoryKey, {}));
  rememberDemandOptionConfig({}, demandOptionConfig);
  let visualDemands = loadStored('ai-material-visual-demands-v1', [
    {id:'VR-202609-001',title:'260903周四-Modal 四大卖点',spu:'260903周四-Modal',businessChannel:'DTC',channelCategory:'Email',productLevel:'新品',demandSource:'月度视觉安排',materialType:'IMG',expression:'Campaign',mainSellingPoint:'四大卖点',scene:'网站页面',bodyType:'Average',requirements:'用于 EDM 四大卖点展示，保持品牌调性。',reference:'9月视觉安排总表',fbInfo:'',edmInfo:'四大卖点邮件视觉',requester:'沈玲燕',priority:'P0',requestDate:'2026-09-01',ddl:'2026-09-02',owner:'THD',materialCategory:'ProductBenefits',status:'已完成',linkedTaskIds:['TSK-DEMAND-001'],createdAt:'2026-09-01 09:10',updatedAt:'2026-09-02 18:20'},
    {id:'VR-202609-002',title:'FI-20250489 网站视觉优化',spu:'FI-20250489',businessChannel:'DTC',channelCategory:'WEB',productLevel:'潜力品',demandSource:'月度视觉安排',materialType:'IMG',expression:'网站UI',mainSellingPoint:'版型与剪裁',scene:'网站页面',bodyType:'Slim',requirements:'补充商品详情页模块与移动端构图。',reference:'',fbInfo:'',edmInfo:'',requester:'潘金兰',priority:'P2',requestDate:'2026-09-11',ddl:'2026-09-16',owner:'LZJ',materialCategory:'ProductDisplay',status:'待创建任务',linkedTaskIds:[],createdAt:'2026-09-11 10:20',updatedAt:'2026-09-11 10:20'},
    {id:'VR-202609-003',title:'秋冬新品 Paid Social 短视频',spu:'FI-20250621',businessChannel:'DTC',channelCategory:'Paid Social',productLevel:'新品',demandSource:'月度视觉安排',materialType:'VID',expression:'AI-MP',mainSellingPoint:'穿搭场景',scene:'都市通勤',bodyType:'Average',requirements:'9:16 竖版短视频，突出通勤与一衣多穿。',reference:'',fbInfo:'Meta Reels',edmInfo:'',requester:'沈玲燕',priority:'P1',requestDate:'2026-09-18',ddl:'2026-09-25',owner:'CHW',materialCategory:'UGC',status:'任务处理中',linkedTaskIds:['TSK-RUN-0919'],createdAt:'2026-09-18 09:30',updatedAt:'2026-09-23 16:40'},
    {id:'VR-202609-004',title:'AMZ 页面产品卖点图',spu:'AMZ-20260908',businessChannel:'AMZ',channelCategory:'AMZ页面调性',productLevel:'旺销',demandSource:'业务临时需求',materialType:'IMG',expression:'Shoot-PD',mainSellingPoint:'面料与材质',scene:'商品展示',bodyType:'Average',requirements:'主图保持白底，补充材质特写。',reference:'',fbInfo:'',edmInfo:'',requester:'李四',priority:'P1',requestDate:'2026-09-20',ddl:'2026-09-27',owner:'LHX',materialCategory:'ProductDisplay',status:'待创建任务',linkedTaskIds:[],createdAt:'2026-09-20 13:15',updatedAt:'2026-09-20 13:15'},
    {id:'VR-202609-005',title:'社媒 UGC 生活方式素材',spu:'FI-20250717',businessChannel:'DTC',channelCategory:'Paid Social',productLevel:'爆品',demandSource:'广告复盘',materialType:'VID',expression:'TTS UGC',mainSellingPoint:'新品核心卖点',scene:'室内生活',bodyType:'Plus size',requirements:'生成生活化口播与商品细节镜头。',reference:'',fbInfo:'Meta Feed / Reels',edmInfo:'',requester:'王五',priority:'P2',requestDate:'2026-09-22',ddl:'2026-09-28',owner:'CHW',materialCategory:'UGC',status:'待创建任务',linkedTaskIds:[],createdAt:'2026-09-22 11:05',updatedAt:'2026-09-22 11:05'}
  ]);
  visualDemands = visualDemands.map(normalizeVisualDemandOptionValues);
  assets = assets.map(row => {
    const next = [...row];
    const metadata = { ...(next[8] || {}) };
    ['expression','scene','materialCategory'].forEach(field => { metadata[field] = normalizeDemandOptionSelection(field, metadata[field]); });
    ['mainSellingPoint','secondarySellingPoint'].forEach(field => { metadata[field] = normalizeDemandOptionSelectionList(field, metadata[field]); });
    next[8] = metadata;
    next[8].naming = buildAssetNaming(next);
    return next;
  });
  localStorage.setItem('ai-material-assets-v2', JSON.stringify(assets));
  localStorage.setItem('ai-material-visual-demands-v1', JSON.stringify(visualDemands));
  let activeVisualDemandId = null;

  let activeView = 'workbench';
  let activeAiEdition = 'phase1';
  let activePrototypeTab = 'model';
  let activeTaskRecordTab = 'usage';
  let activeUsageKind = 'org';
  const tokenDetailMultiFilterState = { org:new Set(), account:new Set() };
  const libraryMultiFilterDefinitions = {
    'model.gender':[['不限','不限'],['女','女'],['男','男']],
    'model.ageRange':[['18–24岁','18–24岁'],['25–34岁','25–34岁'],['35–44岁','35–44岁'],['45–54岁','45–54岁'],['55岁以上','55岁以上']],
    'model.region':['东亚','东南亚','南亚','中东','北美','拉美','西欧','东欧','北欧','非洲','大洋洲'].map(value => [value,value]),
    'model.height':['165-170cm','171-175cm','176-180cm','181-185cm','186cm以上'].map(value => [value,value]),
    'model.bodyType':['偏瘦','标准','匀称','健壮','肌肉型','微胖','大码'].map(value => [value,value]),
    'model.skinTone':['很白','白皙','自然肤色','小麦色','健康深肤色','深肤色','黑色'].map(value => [value,value]),
    'model.hairColor':['黑色','深棕色','棕色','浅棕色','金色','灰白色','红棕色'].map(value => [value,value]),
    'model.style':['清新自然','阳光运动','商务精英','时尚简约','优雅知性','轻奢高级','休闲日常','街头潮流','旅行度假','成熟稳重','学院风'].map(value => [value,value]),
    'scene.shotComposition':['全景（全身带环境）','中景（半身穿搭）','近景（胸部以上）','远景（宏大环境氛围）','特写（局部材质纹理）','低角度（仰视权威感）','上帝视角（俯视平铺）'].map(value => [value,value]),
    'scene.toneStyle':['暖阳金调-温暖治愈','冷调科技-专业洁净','中性影棚-真实还原','黑白艺术-经典格调','莫兰迪色-低饱和度灰','赛博霓虹-潮流夜景','复古胶片-怀旧质感','暗调奢华-尊贵质感','清新马卡龙-活泼年轻'].map(value => [value,value]),
    'scene.artAtmosphere':['自然生活-真实松弛感','时尚大片-先锋杂志感','电影叙事-情绪故事感','极简纯粹-留白高级感','职场精英-自信干练','超现实梦境-艺术想象力','运动活力-动态张力','商旅休闲-轻松精致','都市度假-轻奢松弛','街头潮流-酷感街拍'].map(value => [value,value]),
    'template.kind':[['task','任务模板'],['node','节点模板']],
    'template.node':[['clean','商品重塑'],['scene','场景生成'],['detail','素材裂变']],
    'template.outputType':[['图片','图片'],['视频','视频']]
  };
  const libraryMultiFilterState = Object.fromEntries([
    ...Object.keys(libraryMultiFilterDefinitions),
    'template.creator',
    'template.org'
  ].map(field => [field,new Set()]));
  const timeFilterState = {
    workbench:{ start:'', end:'' },
    tasks:{ start:'', end:'' },
    assets:{ start:'', end:'' },
    templates:{ start:'', end:'' },
    usage:{ start:'', end:'' },
    usageDetails:{ start:'', end:'' }
  };
  let creationStage = 1;
  let toastTimer;
  let dialogAction = null;
  let runState = null;
  let activePreviewVersion = null;
  let activePreviewKind = 'material';
  let restoredDraftConfigs = null;
  let restoredDraftState = null;
  let activeDraftId = null;
  let designMode = false;
  let prototypeMode = 'experience';
  const specEditorDefaultWidth = 620;
  const specEditorWidthStorageKey = 'ai-material-prototype-spec-editor-width-v1';
  let preferredSpecEditorWidth = Number(localStorage.getItem(specEditorWidthStorageKey)) || specEditorDefaultWidth;
  let specEditorResizeState = null;
  let selectedEditable = null;
  let editableRecords = [];
  let primaryRecordByElement = new Map();
  let selectRecordByElement = new Map();
  const defaultSelectStateByKey = new Map();
  let customOptionSequence = 0;
  let editableRefreshScheduled = false;
  let editableRefreshInProgress = false;
  let designContentObserver = null;
  let designDirty = false;
  const defaultDesignState = { primary:'#2563eb', density:'comfortable', radius:8, hidden:{ creationSteps:false, serialNote:false, runCard:false }, content:{}, styles:{}, selects:{} };
  const designBackupStorageKey = 'ai-material-page-design-backups-v1';
  const designBackupLimit = 12;
  const designBackupIntervalMs = 120000;
  const designRecoveryMarkerKey = 'ai-material-page-design-recovery-applied-v1';
  let designState = JSON.parse(JSON.stringify(defaultDesignState));
  const apiSharedDesign = await fetchSharedDesignState();
  const embeddedSharedDesign = window.aiMaterialSharedDesignState && typeof window.aiMaterialSharedDesignState === 'object' ? window.aiMaterialSharedDesignState : null;
  const sharedSavedDesign = apiSharedDesign || embeddedSharedDesign;
  try {
    const recovery = window.aiMaterialDesignRecovery;
    const localSavedDesign = JSON.parse(localStorage.getItem('ai-material-page-design-v4') || localStorage.getItem('ai-material-page-design-v3') || 'null');
    // 当前浏览器的显式保存应优先于随页面发布的共享快照，避免刷新后被旧快照覆盖。
    const savedDesign = localSavedDesign || sharedSavedDesign;
    const recoveryAlreadyApplied = recovery?.fingerprint && localStorage.getItem(designRecoveryMarkerKey) === recovery.fingerprint;
    if (localSavedDesign && typeof localSavedDesign === 'object') {
      designState = normalizeDesignState(localSavedDesign);
      localStorage.setItem('ai-material-page-design-v4', JSON.stringify(designState));
      if (recovery?.fingerprint) localStorage.setItem(designRecoveryMarkerKey, recovery.fingerprint);
    } else if (recovery?.state && !recoveryAlreadyApplied) {
      if (savedDesign && typeof savedDesign === 'object') archiveDesignSnapshot(savedDesign, '恢复导入前保留的本地配置');
      (Array.isArray(recovery.backups) ? recovery.backups : []).forEach(item => {
        if (item?.state && typeof item.state === 'object') archiveDesignSnapshot(item.state, item.reason || '恢复文件中的历史备份');
      });
      designState = normalizeDesignState(recovery.state);
      archiveDesignSnapshot(designState, '从用户提供的文字备份恢复');
      localStorage.setItem('ai-material-page-design-v4', JSON.stringify(designState));
      localStorage.setItem(designRecoveryMarkerKey, recovery.fingerprint);
    } else if (savedDesign && typeof savedDesign === 'object') {
      designState = { ...designState, ...savedDesign, hidden:{...designState.hidden,...(savedDesign.hidden || {})}, content:savedDesign.content || {}, styles:savedDesign.styles || {}, selects:savedDesign.selects || {} };
      archiveDesignSnapshot(savedDesign, '打开页面时自动备份');
    }
  } catch {}
  designState = migrateQuotaLanguage(migrateLegacyNodeNames(designState));
  localStorage.setItem('ai-material-page-design-v4', JSON.stringify(designState));
  queueSharedDesignStatePersist();

  function readDesignBackups() {
    try {
      const backups = JSON.parse(localStorage.getItem(designBackupStorageKey) || '[]');
      return Array.isArray(backups) ? backups.filter(item => item && item.state && typeof item.state === 'object') : [];
    } catch { return []; }
  }
  function archiveDesignSnapshot(state, reason) {
    if (!state || typeof state !== 'object') return false;
    try {
      const backups = readDesignBackups();
      const snapshot = JSON.parse(JSON.stringify(state));
      if (backups.length && JSON.stringify(backups.at(-1).state) === JSON.stringify(snapshot)) return false;
      backups.push({ savedAt:new Date().toISOString(), reason, state:snapshot });
      localStorage.setItem(designBackupStorageKey, JSON.stringify(backups.slice(-designBackupLimit)));
      return true;
    } catch { return false; }
  }
  function normalizeDesignState(state) {
    return { ...JSON.parse(JSON.stringify(defaultDesignState)), ...state,
      hidden:{...defaultDesignState.hidden,...(state?.hidden || {})},
      content:{...(state?.content || {})}, styles:{...(state?.styles || {})}, selects:{...(state?.selects || {})} };
  }
  function updateDesignBackupAvailability() {
    const button = $('#restoreDesignBackup');
    if (!button) return;
    const latest = readDesignBackups().at(-1);
    button.disabled = !latest;
    button.title = latest ? `还原至 ${new Date(latest.savedAt).toLocaleString('zh-CN')} 的文字配置` : '暂无文字配置备份';
  }

  const sampleSpecs = {
    'workbench-page': {
      feature:'<p>作为“AI素材”与“AI素材（一期）”下的默认首页，为当前登录用户汇总待完成任务、待完成需求和额度消耗。AI素材（一期）复用同一套页面内容，但视觉需求能力显示“开发中，敬请期待”。</p>',
      data:'<p>页面数据按当前登录用户过滤；管理员角色额外返回其管理范围内的部门累计额度。指标卡时间区间维度为 D-AI-TIME-RANGE：待完成任务与待完成需求均按最后更新时间，额度指标按节点实际执行时间；下方两组待办列表不应用该时间区间。</p>',
      interaction:'<p>进入“AI素材”时默认打开本页；左侧“新建任务”为蓝色主按钮，右侧“新建视觉需求”为白色次级按钮。点击待完成任务进入当前步骤，点击待完成需求查看详情。指标统计时间只刷新指标卡，两组待办列表始终展示全部。</p>'
    },
    'workbench-metrics': {
      feature:'<p>展示待完成任务数、待完成需求数、当前用户累计消耗额度，以及管理员可见的部门累计消耗额度。</p>',
      data:'<ul><li>待完成任务：暂存、执行中和待入库状态任务的去重数量</li><li>待完成需求：排除已完成和已取消状态的视觉需求数量</li><li>已消耗额度：按各 AI 模型单价乘以实际消耗量计算，以人民币展示</li><li>部门额度卡片仅对部门管理员展示，并按权限范围汇总</li></ul>',
      interaction:'<p>数值随任务状态、实际执行消耗和页面时间区间同步刷新；普通成员不渲染部门额度卡片。</p>'
    },
    'workbench-unfinished-tasks': {
      feature:'<p>在工作台左侧半栏按最近执行时间展示当前用户的待完成任务，并提供快捷续办入口。</p>',
      data:'<p>任务展示任务 ID、名称、最近执行时间、当前步骤和完成进度，不展示任务图标、任务类型与状态。</p>',
      interaction:'<p>操作按钮统一显示“继续执行”，并根据任务当前状态进入创建任务、当前执行节点或素材入库步骤。列表始终展示当前用户全部待完成任务，不受上方指标统计时间区间影响。</p>'
    },
    'workbench-pending-demands': {
      feature:'<p>在工作台右侧半栏展示尚未完成的视觉需求，与待完成任务并列。</p>',
      data:'<p>排除已完成和已取消需求，展示需求名称、需求 ID、SPU、优先级和 DDL。</p>',
      interaction:'<p>点击“查看需求”打开需求详情；“查看全部”进入视觉需求列表。</p>'
    },
    'demands-page': {
      feature:'<p>作为创建 AI 素材任务的前置业务环节，集中登记、查询和维护视觉需求，并从需求发起任务。AI素材（一期）暂不开放需求业务功能，但保留“配置维度选项值”入口及完整配置能力。</p>',
      data:'<p>创建阶段填写需求名称、需求 SPU、业务渠道、产品级别、需求来源、下需时间、DDL、渠道归类、素材格式、表达方式、主卖点、场景、辅助卖点、模特体型、素材类型、制作要求、制作参考、FB 信息、EDM 信息、需求对接人、优先级和制作人。产品级别、需求来源、主卖点、场景、制作人和素材类型均为必填。新建与编辑使用同一组选项值，所有下拉均支持搜索；新建默认业务渠道 DTC、产品级别无、需求来源素材下需、渠道归类 Paid Social。制作要求、制作参考、FB 信息和 EDM 信息均独占一行。进度状态、完成时间、版本、制作周期和关联素材由关联任务在执行或完成后自动同步。</p>',
      interaction:'<p>AI素材（一期）默认展开并位于完整版AI素材上方。视觉需求页保留标题栏及右上角“配置维度选项值”；“新建视觉需求”置灰不可用，悬浮提示“开发中，敬请期待”；原指标卡与列表位置分别使用白底不可用区域居中显示“开发中，敬请期待”。完整版正常流程为“新建视觉需求 → 保存需求 → 创建任务 → 执行与入库”。新建与编辑弹窗不展示“创建阶段填写 22 项需求属性”的顶部提示卡。产品级别、需求来源、渠道归类和优先级在字段名旁提供说明气泡；制作要求、制作参考、FB 信息与 EDM 信息均使用支持换行的大文本框。需求对接人默认当前账号；制作人默认不选，但保存前必须选择。两者均从不受数据权限限制的平台完整用户目录中按部门树形单选并支持搜索。任务创建时自动带入需求名称、需求对接人、业务线、素材格式、制作要求并推荐执行节点；任务运行信息仅在需求详情中查看，不在新建表单中填写。</p>'
    },
    'demands-metrics': {
      feature:'<p>快速展示全部视觉需求以及待创建任务、任务处理中、已完成三类数量。</p>',
      data:'<p>按视觉需求当前状态实时聚合，编辑、创建任务、完成或终止任务后同步刷新。</p>',
      interaction:'<p>指标卡不受下方筛选条件影响，始终展示当前可见权限范围内的全量概览。</p>'
    },
    'demands-list': {
      feature:'<p>查询和管理视觉需求，并承接从需求到 AI 素材任务的业务衔接。</p>',
      data:'<p>列表粒度为视觉需求；业务列从左到右展示需求、优先级、产品级别、SPU、渠道归类、需求来源、制作人、下需时间 / DDL、需求对接人、进度状态和关联任务，末列保留详情、编辑与任务衔接操作。“需求”列上方显示需求名称、下方显示需求 ID；下需时间和 DDL 在同一列分两行展示；关联任务展示数量及最新任务 ID。维度选项值以稳定字段键持久化，每个选项同时保存英文标识与中文显示；英文标识在同一维度内唯一。</p>',
      interaction:'<p>筛选器默认收起为一行，显示需求ID、需求名称、优先级、产品级别及搜索、重置、展开操作；点击展开后显示SPU、渠道归类、需求来源、制作人、DDL日期区间、下需时间日期区间和需求对接人，支持再次收起。两个日期区间均允许只填写开始或结束日期，开始日期晚于结束日期时不执行筛选并提示。页面右上角“配置维度选项值”打开双栏弹窗：左侧切换维度，右侧维护所选维度的英文标识与中文显示；删除选项仅影响后续新建与编辑下拉，已创建视觉需求和素材继续显示删除前文案；修改选项会同步更新下拉和存量信息显示。需求对接人与制作人由平台用户目录提供，不进入自定义维度选项配置。</p>'
    },
    'workspace-page': {
      feature:'<p>承载从视觉需求发起的 AI 素材任务创建、逐节点执行和素材入库。任务信息与节点选择合并在第一步完成。</p><ul><li>支持图片与视频</li><li>支持单节点或多节点任务</li></ul>',
      data:'<p>任务与消耗数据需包含任务 ID、来源视觉需求 ID、需求部门、需求人、业务线、系统执行账号、执行人名称、节点顺序、节点配置快照和执行状态；页面仅展示执行人名称，系统账号保留为内部关联字段。</p>',
      interaction:'<ol><li>从视觉需求进入后自动带入任务信息和建议节点。</li><li>第二步一次只配置和执行一个节点，生成后才能进入下一节点，并可返回上一步。</li><li>全部节点完成后统一确认入库，也可返回最后一个执行节点。</li></ol><p>未额外说明长度限制时，普通文本输入框最多输入并保存 200 个字符，大文本框最多输入并保存 1500 个字符；存在明确限制时以字段限定为准。</p>'
    },
    'workspace-node-selection': {
      feature:'<p>与任务基础信息共同组成“创建任务”步骤。完整版允许选择商品重塑、场景生成、素材裂变中的一个或多个节点；AI素材（一期）中节点3素材裂变不可选择并显示“开发中，敬请期待”。</p>',
      data:'<p>保存节点编码、节点名称、排序和预计消耗额度。额度按当前模型单价乘以预计消耗量计算，节点组合写入任务配置快照。</p>',
      interaction:'<p>点击整张节点卡或复选框均可选中；至少选择一个节点后，“下一步”按钮才可用。</p>'
    },
    'workspace-task-base': {
      feature:'<p>填写任务基础信息，并可选择任务模板带入节点配置。</p>',
      data:'<ul><li>任务名称：必填，最多 200 个字符</li><li>需求部门、需求人、业务线均为必填</li><li>执行账号由系统按当前登录账号自动记录，不在创建任务表单中展示</li></ul>',
      interaction:'<p>任一必填项为空时不可开始执行；字段修改会进入草稿和任务配置快照。</p>'
    },
    'workspace-node-config': {
      feature:'<p>一次只展示并配置当前节点。每次点击生成都会产生独立素材，并在“生成结果”中按生成次数形成 v1、v2… 版本 Tab；生成失败时在同一模块展示简短错误信息。</p><p>商品重塑、场景生成、素材裂变的节点标题及标题说明分别使用独立文案配置；在“编辑文字”中修改任一节点时，不影响其他节点。</p>',
      data:'<ul><li>商品重塑节点仅允许上传图片；场景生成按素材分类限制文件类型；素材裂变的“需精修”、“参考模特”和“参考场景”均支持图片或视频</li><li>素材裂变上传区仅保留需精修（必填）、参考模特和参考场景，不展示主产品、搭配图片或“使用场景生成的生成素材”组件</li><li>素材裂变的素材处理仅展示输出类型、输出格式或输出时长、生成张数、输出比例、画质要求、面料与材质特写、生活化场景交互、平铺细节特写、专业光影控制、人物情绪表达和补充描述</li><li>商品重塑仅支持图片输出并显示输出格式（png、jpg）；场景生成和素材裂变支持图片或视频，默认图片，选择视频时显示可自行输入的输出时长，单位默认秒并可切换分钟</li><li>场景生成和素材裂变在图片输出下显示数字输入型“生成张数”，位于输出格式之后；切换为视频后不显示生成张数</li><li>输入素材：可选上一步指定产出；场景生成仅在直属上一节点已经生成图片时展示“从上一节点选择”，并列出全部生成图片版本（包含未预选入库版本）；素材裂变存在上级节点时，需精修支持从上一节点选择全部生成图片版本（包含未预选入库版本）；正面、侧面、背面、面料细节各最多 1 份，其他最多 4 份</li><li>“上传素材”标题后显示小字说明“平铺图/人台图”；各分类标题仅保留正面、侧面、背面、面料细节图或其他</li><li>上传数量统一显示为“当前数/上限张数”，例如 2/4张；与组件标题同行并右对齐；达到上限后禁用上传、素材库选择和上一节点选择</li><li>四个主要素材分类按四等份并排，其他素材独占下一行；未添加素材时不展示占位说明</li><li>非“其他”分类的标题与操作按钮紧凑排布，不保留多余竖向留白</li><li>每个素材分类均支持上传或从对应素材库/原型库选择，添加后展示缩略图，文件名位于缩略图下方；缩略图右上角可删除当前素材并释放名额</li><li>商品重塑首行展示输出类型与输出格式，均按四等份宽度；次行将输出视角、输出规格、画质要求、数字美化按四等份并排</li><li>素材裂变首行展示输出类型、输出格式和生成张数，次行展示输出比例和画质要求，其余配置从下一行开始；视频时首行仅展示输出类型和输出时长</li><li>AI 处理模型说明显示在预计消耗额度左侧；商品重塑默认 Gemini Image Pro，场景生成显示当前配置模型，素材裂变不额外展示模型字段</li><li>预计消耗额度会按当前模型单价与节点配置重新估算，视频时长或生成张数变化会同步影响估算</li><li>输出视角为多选，选项显示文案可在“编辑文字”状态调整；商品重塑按所选视角数量生成图片，场景生成和素材裂变按生成张数生成图片或按视频配置生成成片；生成卡片保存并展示生成当次选项文案快照</li><li>首次生成前显示“生成素材”；当前节点产生过结果后，原位置替换为“重新生成”和“基于当前版本生成”两个按钮，并为两个入口显示各自用途提示</li><li>“重新生成”不继承已有版本上下文；“基于当前版本生成”继承当前预览版本的上下文，当前版本由 v1、v2… 页签决定</li><li>每次生成均形成一个新的临时版本，并单独记录生成模式、上下文来源、产出和人民币额度明细</li></ul>',
      interaction:'<p>三个节点首次点击“生成素材”并完成后，原按钮替换为“重新生成”和“基于当前版本生成”。“重新生成”开启全新生成上下文；“基于当前版本生成”继承生成结果区当前选中版本的上下文。两个按钮在悬浮或键盘聚焦时分别显示用途说明。</p><p>点击“生成素材”时先校验当前节点的必填输入：商品重塑至少一张图片，场景生成必须有主产品图片，素材裂变必须有“需精修”图片或视频；只添加参考模特/参考场景不视为满足素材裂变必填条件。缺失时上传区域标红并定位到对应上传按钮。随后校验当前节点全部必填配置，缺失项所在区域标红并定位到第一个错误。生成完成后按 v1、v2… 升序展示版本并自动打开最新版本；“已预选 x 份”统计当前节点全部版本中已勾选的素材，不展示版本数量前缀。生成失败时在“生成结果”模块展示简短错误信息，且不将失败结果计为可入库素材。</p><p>生成结果中的视角说明、全部版本已预选数量和版本号均为运行时数据：视角读取“输出视角”当前选中项的可见文案（包含“编辑文字”中已保存的修改），并按生成当次原样展示；已预选数量取全部版本实际勾选总数，版本号按当前节点生成次数从 v1 递增。以上动态数据优先于“编辑文字”保存的历史内容，不允许被自定义文案覆盖。</p><p>场景生成仅在直属上一节点已经生成过图片素材时，才在“主产品”中展示“从上一节点选择”；弹窗列出该节点的全部生成图片版本（包含未预选入库版本），选择后作为本次主产品输入。</p><p>素材裂变存在上级节点时，“需精修（图片或视频）”额外展示“从上一节点选择”，弹窗列出直属上一节点生成的全部图片版本（包含未预选入库版本），选择后作为本次需精修输入。</p>'
    },
    'workspace-run-summary': {
      feature:'<p>展示当前任务信息、节点路径和实际额度执行概览，并随任务执行实时更新。</p>',
      data:'<ul><li>展示顺序：节点路径及各节点已消耗总额度、任务已消耗总额度、任务名称、需求部门、需求人、业务线</li><li>任务名称、需求部门、需求人、业务线均来自当前任务步骤1“任务创建”提交时保存的字段快照；下拉字段取当前选中项的可见文案，包含“编辑文字”中保存的选项调整</li><li>节点已消耗总额度（M-AI-NODE-CONSUMED-QUOTA）：按当前任务与节点汇总该节点全部实际执行记录额度；首次生成完成即显示，多次生成继续累计</li><li>任务已消耗总额度（M-AI-TASK-CONSUMED-QUOTA）：汇总当前任务在商品重塑、场景生成、素材裂变三个节点产生的全部实际执行记录额度；尚未生成时显示 0</li></ul>',
      interaction:'<p>进入执行页后锁定并展示步骤1的当前任务信息。执行摘要的节点路径仅显示节点序号、节点名称、状态样式和已消耗额度，不在节点下方显示说明文字。任一节点每次生成完成后，同时刷新该节点右侧累计额度与任务已消耗总额度；无执行记录的节点不显示额度，当前节点无需进入下一步即可看到已消耗额度。返回编辑并重新开始执行后重新生成任务快照。</p>'
    },
    'workspace-asset-stage': {
      feature:'<p>汇总各节点在生成结果中预选入库的素材，由执行人进行最终确认。</p>',
      data:'<p>正式入库时记录素材 ID、来源需求与任务 ID、节点、生成时间、业务属性和服务器存储状态；普通生成素材进入素材库，模特原型与场景模板分别进入原型库对应 Tab。</p>',
      interaction:'<p>预选产出默认勾选入库，可逐项取消。完成任务后按产出类型写入素材库或原型库，并清理全部未入库的临时内容。</p>'
    },
    'tasks-list': {
      feature:'<p>查询历史任务，查看节点流程、任务入库量和人民币额度消耗。</p>',
      data:'<p>列表粒度为任务；输出素材类型用于区分图片、视频或混合任务；状态仅包含已完成、已终止并入库、已终止、暂存。任务与消耗以任务记录为主表、执行额度明细为补充，未产生执行明细的暂存任务仍需显示；暂存仅代表任务生命周期状态，不能据此将消耗、调用或已执行节点归零。详情按任务 × 已执行节点聚合，入库素材量统计该节点最终确认入库的素材、模特原型和场景模板去重数量，额度按各 AI 模型单价乘以实际消耗量汇总。时间区间按任务创建时间（D-AI-TIME-RANGE）过滤。</p>',
      interaction:'<p>支持按任务名称、输出素材类型、状态、创建人、部门和创建时间区间组合筛选；点击“详情”查看每个执行节点的入库素材量和人民币额度消耗，不再展示“节点产出”指标卡。暂存任务已有执行记录时按实际记录展示额度、调用次数、已执行节点与最近执行时间，并允许查看额度明细；只有完全未执行的暂存任务才显示0额度、0调用、0个已执行节点和“尚未执行”，同时禁用额度明细入口但保留任务详情。缺少稳定任务 ID 关联的历史记录显示“历史节点明细未记录”，不按同名任务猜测或串联数据。时间默认全部，起止日期均包含在内。</p>'
    },
    'assets-list': {
      feature:'<p>记录执行人确认入库的图片、视频素材，支持业务信息补录、标签管理和一年期到期清理提示。</p>',
      data:'<p>列表的素材列将素材 ID 显示在缩略图下方，并展示素材命名、标签、制作人/部门、正常或已过期状态及生成时间；不展示文件名称、素材格式、SPU、业务素材类型、来源任务和来源节点。素材详情标题下方不重复展示素材 ID，详情主体的素材身份只显示素材 ID、不显示文件名称。详情的来源信息展示来源需求与需求 ID、来源任务与任务 ID、来源节点、制作人及部门；制作人和部门由只读人员身份目录成对写入，不属于可补录的业务信息。关联需求有制作人时按该人员查目录，独立任务按当前登录用户查目录；无法映射所属部门时保留制作人显示、部门留空。业务信息展示素材格式、生成时间、SPU、表达方式、主卖点、辅助卖点、场景、自定义版本、素材类型和按 9 月视觉安排总表规则生成的素材命名。通过需求创建的任务自动带入需求属性；独立任务产出的属性保持空白并可编辑。</p>',
      interaction:'<p>支持按素材名称或 ID、需求 ID、任务 ID、素材格式、素材类型、来源任务及其节点、部门及其制作人、标签、状态和生成时间组合筛选。编辑素材信息时，除辅助卖点外，SPU、表达方式、主卖点、场景、版本和素材类型全部必填，版本为空时默认填入 V1；表达方式、场景和素材类型复用视觉需求同源单选项，主卖点与辅助卖点复用视觉需求同源选项并支持多选；素材命名随编辑内容实时刷新并可复制。标签管理仅维护标签名称，不配置颜色；调整标签弹窗仅展示素材 ID 与素材格式，不展示文件名或标签管理入口，支持搜索标签，每个素材最多选择 20 个标签。制作人和部门不可编辑，并共同作为素材个人、部门归属及查看权限的判断依据；二者必须来自同一人员身份映射，不使用创建人或任务的可编辑需求部门兜底。历史素材或新素材缺失任一身份字段时仅全局素材权限可见。来源任务或有部门素材查看权限时的部门可单独选择，子级选项随父级变化。素材生成满一年后显示已过期并不可下载或再次选用；到期前一个月仅对当前用户可见的临期素材显示清理横幅，点击“点击查看”按生成时间定位。可调整标签和其他素材业务信息，批量下载仅包含正常素材。未额外说明长度限制时，普通文本输入框最多输入并保存 200 个字符，大文本框最多输入并保存 1500 个字符；存在明确限制时以字段限定为准。</p>'
    },
    'prototypes-list': {
      feature:'<p>按类型管理任务确认入库的模特原型与场景模板，并提供给新任务的原型选择器复用。AI素材（一期）中场景模板不可用并显示“开发中，敬请期待”。</p>',
      data:'<p>模特原型记录模特图片、启用/停用状态、累计使用次数，以及节点2“场景生成 → 素材处理 → 模特”的八项配置快照。场景模板记录场景图片、启用/停用状态、累计使用次数，以及同节点“场景”模块的景别构图、色调风格和艺术氛围配置快照。</p>',
      interaction:'<p>通过 Tab 切换模特原型、场景模板和模板配置；AI素材（一期）点击场景模板后仅显示开发中占位，模板配置仅展示节点模板，新建任务关闭任务模板创建入口，且各节点不能从场景模板选择。完整版继续支持三类列表筛选、查看与维护。</p>'
    },
    'templates-list': {
      feature:'<p>原型库内的模板配置管理生成过程配置，不包含图片或视频；AI素材（一期）仅开放节点模板。</p>',
      data:'<p>记录可修改的模板名称、模板类型、适用节点、输出素材类型、各节点素材处理配置快照、创建人、状态、累计使用次数及最近使用时间，不保存输入图片、视频或生成结果。AI素材（一期）只查询并使用当前已开放节点的节点模板。</p>',
      interaction:'<p>支持重命名并持久化保存；查看详情时按节点展示完整素材处理配置快照。使用模板后自动带入对应配置，每次成功套用需增加使用次数。AI素材（一期）关闭任务模板创建与套用入口，节点配置中的模板选择仅提供节点模板，各节点的场景模板选择入口关闭；完整版继续支持任务模板与节点模板。支持按模板名称、模板类型、适用节点、输出素材类型、创建人、部门和最近使用时间区间组合筛选或重置。未额外说明长度限制时，普通文本输入框最多输入并保存 200 个字符，大文本框最多输入并保存 1500 个字符；存在明确限制时以字段限定为准。</p>'
    },
    'tasks-usage': {
      feature:'<p>在任务与消耗页面集中查看任务及节点的额度效率、浪费和 AI 调用情况。</p>',
      data:'<p>页面直接展示任务用量统计；列表粒度为任务，弹窗明细粒度为任务 × 节点。列表合并任务记录与额度执行明细，确保所有暂存任务均可见，并对已有执行记录的暂存任务按实际数据汇总。</p>',
      interaction:'<p>进入“任务与消耗”即展示筛选器、指标卡与任务用量列表；无需切换页签。点击页面右上角“新建任务”进入空白任务创建页，且不关联视觉需求；暂存任务有执行记录时可查看“额度明细”和“任务详情”，无执行记录时仅查看任务详情。</p>'
    },
    'usage-token-detail': {
      feature:'<p>按任务汇总消耗额度、浪费额度、节点数、AI 调用次数与任务状态，展开后追溯节点层明细。</p>',
      data:'<ul><li>已额度消耗：筛选范围内已消耗总额度</li><li>平均单位有效额度：素材所在节点耗费总额度 ÷ 最终入库通过数量，分别计算图片和视频</li><li>浪费额度：未被选中入库素材对应的额度；失败和重试未形成有效入库素材的额度计入浪费</li><li>浪费额度占比：浪费额度 ÷ 已消耗总额度</li><li>平均每节点调用 AI 次数：AI 调用总次数 ÷ 总节点数</li><li>任务列表展示任务、部门/执行人、消耗额度、浪费额度、节点数、AI 调用次数、任务状态和最近执行时间；执行人展示平台用户名称，不展示邮箱或登录账号</li><li>节点列表展示节点、AI 模型、AI 调用次数、消耗额度、浪费额度、生成素材数、入库素材数和最近执行时间</li><li>任务详情按节点展示生成批次；每次点击生成均保存不可覆盖的配置快照、生成方式、基于版本、上传素材张数、产出类型及数量、入库数量和生成时间</li><li>同一节点存在多个生成批次时，通过 V1、V2 等批次 Tab 切换对应的独立配置快照和生成结果；默认定位最近一个有入库结果的批次，无入库素材时定位最近生成批次</li><li>批次配置采用“配置项：配置值”的文本叙事形式，并将上传素材张数纳入同一配置叙事模块</li></ul>',
      interaction:'<p>支持按任务、部门、执行人和日期组合筛选，其中部门与执行人支持多选；执行人筛选与列表均使用系统账号映射后的平台用户名称，未选择时表示全部，选择多项时按任一匹配项过滤。指标卡与列表使用相同筛选结果。点击“额度明细”通过弹窗查看节点额度数据，点击“任务详情”通过弹窗查看节点素材处理内容。</p>'
    },
    'permissions-matrix': {
      feature:'<p>一期按三个需求节点设置执行权限。</p>',
      data:'<p>权限主体为角色与部门范围，权限点为商品重塑、场景生成、素材裂变。</p>',
      interaction:'<p>关闭某节点权限后，该角色用户在工作台不可选择或执行对应节点。</p>'
    }
  };
  const specStorageKey = 'ai-material-prototype-specs-v1';
  const specBackupStorageKey = 'ai-material-prototype-spec-backups-v1';
  const specBackupLimit = 20;
  const prototypeGovernanceStorageKey = 'ai-material-prototype-governance-v1';
  function normalizeGlobalRuleRecords(value) {
    let records = Array.isArray(value) ? value : [];
    if (typeof value === 'string' && value.trim()) records = [{ id:'rule-legacy-1', code:'GR-001', name:'历史全局规则', content:value, updatedAt:'' }];
    const usedIds = new Set();
    return records.map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      let id = String(item.id || `rule-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || `rule-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      const contentFormat = item.contentFormat === 'rich' ? 'rich' : 'plain';
      return {
        id,
        code:String(item.code || `GR-${String(index + 1).padStart(3, '0')}`).trim().slice(0, 40),
        name:String(item.name || `全局规则 ${index + 1}`).trim().slice(0, 80),
        content:String(item.content || '').slice(0, contentFormat === 'rich' ? 2200000 : 12000),
        contentFormat,
        updatedAt:String(item.updatedAt || '')
      };
    }).filter(Boolean);
  }
  const defaultPrototypeGovernanceState = { pageDescriptions:{}, requirementAdjustments:'', globalRules:[], updatedAt:'' };
  let prototypeGovernanceState = JSON.parse(JSON.stringify(defaultPrototypeGovernanceState));
  try {
    const savedGovernance = JSON.parse(localStorage.getItem(prototypeGovernanceStorageKey) || 'null');
    if (savedGovernance && typeof savedGovernance === 'object' && !Array.isArray(savedGovernance)) {
      prototypeGovernanceState = {
        ...defaultPrototypeGovernanceState,
        ...savedGovernance,
        pageDescriptions:savedGovernance.pageDescriptions && typeof savedGovernance.pageDescriptions === 'object' && !Array.isArray(savedGovernance.pageDescriptions) ? savedGovernance.pageDescriptions : {}
      };
    }
  } catch {}
  prototypeGovernanceState.globalRules = normalizeGlobalRuleRecords(prototypeGovernanceState.globalRules);
  function persistPrototypeGovernanceState() {
    prototypeGovernanceState.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(prototypeGovernanceStorageKey, JSON.stringify(prototypeGovernanceState));
      return true;
    } catch { return false; }
  }
  function readSpecBackups() {
    try {
      const backups = JSON.parse(localStorage.getItem(specBackupStorageKey) || '[]');
      return Array.isArray(backups) ? backups.filter(item => item?.specs && typeof item.specs === 'object') : [];
    } catch { return []; }
  }
  function archiveSpecSnapshot(specs, reason) {
    if (!specs || typeof specs !== 'object') return;
    try {
      const backups = readSpecBackups();
      const snapshot = JSON.parse(JSON.stringify(specs));
      if (backups.length && JSON.stringify(backups.at(-1).specs) === JSON.stringify(snapshot)) return;
      backups.push({ savedAt:new Date().toISOString(), reason, specs:snapshot });
      localStorage.setItem(specBackupStorageKey, JSON.stringify(backups.slice(-specBackupLimit)));
    } catch {}
  }
  function persistSpecState(reason = '保存原型说明') {
    try {
      const previous = JSON.parse(localStorage.getItem(specStorageKey) || 'null');
      if (previous && typeof previous === 'object') archiveSpecSnapshot(previous, `${reason}前自动备份`);
      localStorage.setItem(specStorageKey, JSON.stringify(specState));
      return true;
    } catch { return false; }
  }
  let specState = JSON.parse(JSON.stringify(sampleSpecs));
  try {
    const savedSpecs = JSON.parse(localStorage.getItem(specStorageKey) || 'null');
    if (savedSpecs && typeof savedSpecs === 'object') {
      archiveSpecSnapshot(savedSpecs, '页面打开时自动备份');
      Object.entries(savedSpecs).forEach(([id, value]) => { specState[id] = { ...(specState[id] || {}), ...(value || {}) }; });
    }
  } catch {}
  specState = migrateLegacyNodeNames(specState);
  localStorage.setItem(specStorageKey, JSON.stringify(specState));
  let specTargets = [];
  let selectedSpecTarget = null;
  let specDirty = false;
  let specPanelView = 'list';
  let pendingGlobalRuleRange = null;
  let pendingRichImageRange = null;
  let activeRichTableCell = null;
  const recoveredSpecTargets = new Map();
  const deletedSpecTargetStorageKey = 'ai-material-prototype-deleted-spec-targets-v1';
  let deletedSpecTargetIds = new Set();
  try {
    const savedDeletedSpecTargets = JSON.parse(localStorage.getItem(deletedSpecTargetStorageKey) || '[]');
    if (Array.isArray(savedDeletedSpecTargets)) deletedSpecTargetIds = new Set(savedDeletedSpecTargets.filter(Boolean));
  } catch {}
  const businessSpecComponentSelector = [
    'main','article','section:not(.view)','header','nav','aside','form','fieldset','label','button','a[href]',
    'input:not([type="hidden"])','select','textarea','table','thead','tbody','tr','th','td','dl','dt','dd',
    'ul','ol','li','h1','h2','h3','h4','h5','p','figure','img','video',
    '[role="button"]','[role="tab"]','[role="group"]','[role="row"]','[role="cell"]','[role="columnheader"]',
    '.panel-head','.form-grid','.config-grid','.filters','.node-summary','.node-section','.classified-upload',
    '.uploaded-material-item','.generated-preview-card','.cache-item','.retained-asset','.workbench-task-item',
    '.task-node-breakdown-row','.asset-download-row','.status','.switch','.segmented',
    '[class$="-card"]','[class$="-item"]','[class$="-row"]','[class$="-section"]','[class$="-panel"]',
    '[class$="-grid"]','[class$="-toolbar"]','[class$="-actions"]'
  ].join(',');

  function toast(message, type = 'success') {
    const box = $('#toast'); box.textContent = message; box.className = `toast show ${type}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => box.className = 'toast', 2400);
  }
  function normalizeNodeMediaType(nodeKey, mediaType) { return nodeKey === 'clean' ? '图片' : (mediaType || defaultConfigs[nodeKey]?.mediaType || '图片'); }
  function getNodeMediaType(nodeKey) {
    return normalizeNodeMediaType(nodeKey, $(`.node-config-card[data-node="${nodeKey}"] [data-field="mediaType"]:checked`)?.value || runState?.configs?.[nodeKey]?.mediaType || restoredDraftConfigs?.[nodeKey]?.mediaType || defaultConfigs[nodeKey]?.mediaType);
  }
  function getNodeRatio(nodeKey) { return $(`.node-config-card[data-node="${nodeKey}"] [data-field="ratio"]`)?.value || runState?.configs?.[nodeKey]?.ratio || restoredDraftConfigs?.[nodeKey]?.ratio || defaultConfigs[nodeKey]?.ratio || '4:5'; }
  function summarizeConfig(nodes, configs, field, mixedLabel) {
    const values = nodes.map(key => field === 'mediaType' ? normalizeNodeMediaType(key, configs?.[key]?.[field] || getNodeMediaType(key)) : (configs?.[key]?.[field] || getNodeRatio(key)));
    const unique = [...new Set(values.filter(Boolean))];
    return unique.length <= 1 ? (unique[0] || '—') : mixedLabel;
  }
  function updateNodeSummary() {
    const taskNodeKeys = new Set(['clean','scene','detail']);
    const nodeTotals = new Map();
    const executedNodeKeys = new Set();
    (runState?.records || []).forEach(item => {
      if (!taskNodeKeys.has(item.nodeKey)) return;
      executedNodeKeys.add(item.nodeKey);
      nodeTotals.set(item.nodeKey, (nodeTotals.get(item.nodeKey) || 0) + (Number(item.total) || 0));
    });
    const total = [...nodeTotals.values()].reduce((sum, value) => sum + value, 0);
    const taskSnapshot = runState?.taskSnapshot || runState;
    if ($('#summaryConsumedQuota')) $('#summaryConsumedQuota').textContent = formatCny(total);
    $$('.route-step[data-node]').forEach(step => {
      const nodeKey = step.dataset.node;
      const quota = $('.route-step-quota', step);
      if (!quota) return;
      const hasExecutedRecord = executedNodeKeys.has(nodeKey);
      const formattedQuota = formatCny(nodeTotals.get(nodeKey) || 0);
      quota.hidden = !hasExecutedRecord;
      quota.textContent = hasExecutedRecord ? `已消耗 ${formattedQuota}` : '';
      if (hasExecutedRecord) quota.setAttribute('aria-label', `${nodeMap[nodeKey]?.name || '该节点'}已消耗总额度 ${formattedQuota}`);
      else quota.removeAttribute('aria-label');
    });
    if ($('#summaryTaskName')) $('#summaryTaskName').textContent = taskSnapshot?.taskName || '—';
    if ($('#summaryOrg')) $('#summaryOrg').textContent = taskSnapshot?.orgFull || '—';
    if ($('#summaryRequester')) $('#summaryRequester').textContent = taskSnapshot?.requester || '—';
    if ($('#summaryBusinessLine')) $('#summaryBusinessLine').textContent = taskSnapshot?.businessLine || '—';
  }
  function selectedNodes() { return $$('.node-card.selected').map(card => card.dataset.node).filter(key => activeAiEdition !== 'phase1' || key !== 'detail'); }
  function selectedOptionLabel(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || select?.value?.trim() || '';
  }
  function persistTemplates() { localStorage.setItem('ai-material-templates-v2', JSON.stringify(templates)); }
  function persistPrototypes() { localStorage.setItem('ai-material-prototypes-v1', JSON.stringify(prototypes)); }

  const editableCandidateSelector = 'h1,h2,h3,h4,p,button,a,th,td,dt,dd,span,b,strong,small,em,i,legend';
  const inlineEditableTags = new Set(['H1','H2','H3','H4','P','TH','TD','DT','DD','SPAN','B','STRONG','SMALL','EM','I','LEGEND']);
  function businessDialogRoot(element) {
    const dialog = element?.closest?.('#mainDialog,#mediaPreviewDialog');
    if (!dialog?.open) return null;
    if (dialog.id === 'mainDialog' && dialog.classList.contains('prototype-layer-dialog')) return null;
    return dialog;
  }
  function isBusinessDialogElement(element) { return Boolean(businessDialogRoot(element)); }
  function editableContext(element) {
    return element.closest('.view')?.dataset.page || (isBusinessDialogElement(element) ? activeView : 'global');
  }
  function safeKeyPart(value) {
    const text = String(value || '').trim();
    if (!text) return 'item';
    return encodeURIComponent(text).replace(/%/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,120) || 'item';
  }
  function stableElementPath(element) {
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      if (current.matches?.('#mainDialog,#mediaPreviewDialog')) {
        parts.unshift(`#${current.id}[dialog=${safeKeyPart(current.dataset.businessDialogKey || 'business-dialog')}]`);
        break;
      }
      if (current.id) { parts.unshift(`#${safeKeyPart(current.id)}`); break; }
      const stableAttribute = ['editorRowKey','node','view','usage','id','index'].find(name => current.dataset?.[name]);
      if (stableAttribute) {
        parts.unshift(`${current.tagName.toLowerCase()}[${stableAttribute}=${safeKeyPart(current.dataset[stableAttribute])}]`);
      } else if (current.tagName === 'A' && current.getAttribute('href')) {
        parts.unshift(`a[href=${safeKeyPart(current.getAttribute('href'))}]`);
      } else {
        const siblings = current.parentElement ? [...current.parentElement.children].filter(item => item.tagName === current.tagName) : [current];
        parts.unshift(`${current.tagName.toLowerCase()}:${siblings.indexOf(current) + 1}`);
      }
      if (current.matches?.('.view,.sidebar,.system-header,.page-tabs')) break;
      current = current.parentElement;
    }
    return parts.join('>');
  }
  function legacyRecordKey(element, kind) {
    return `${editableContext(element)}:${kind}:${stableElementPath(element)}`;
  }
  function semanticScopeKey(element) {
    const dialog = businessDialogRoot(element);
    if (dialog) return `dialog=${safeKeyPart(dialog.dataset.businessDialogKey || dialog.id)}`;
    const scope = element.closest('[data-node],[data-spec-id],.view,.sidebar,.system-header,.page-tabs');
    if (!scope) return 'document';
    const stableAttribute = ['node','specId','page','editorRowKey','id'].find(name => scope.dataset?.[name]);
    if (stableAttribute) return `${stableAttribute}=${safeKeyPart(scope.dataset[stableAttribute])}`;
    if (scope.id) return `id=${safeKeyPart(scope.id)}`;
    return `class=${safeKeyPart([...scope.classList].sort().join('_'))}`;
  }
  function semanticTextForKey(element, kind) {
    if (kind === 'select-options') {
      const fieldLabel = element.closest('label')?.querySelector('.field-label,.editable-direct-copy');
      return fieldLabel?.dataset?.editorDefaultText || selectEditorLabel(element);
    }
    if (element.dataset?.editorDefaultText) return element.dataset.editorDefaultText;
    if (['value','placeholder'].includes(kind)) {
      const label = element.closest('label')?.querySelector('.field-label,.editable-direct-copy,legend')?.textContent?.trim();
      return label || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.id || element.tagName;
    }
    return element.textContent.trim() || element.getAttribute('aria-label') || element.id || element.tagName;
  }
  function stableRecordKey(element, kind) {
    const explicitKey = element.dataset?.editorRecordKey;
    if (explicitKey) return `${editableContext(element)}:${kind}:explicit:${safeKeyPart(explicitKey)}`;
    const text = semanticTextForKey(element, kind);
    const scope = businessDialogRoot(element) || element.closest('[data-node],[data-spec-id],.view,.sidebar,.system-header,.page-tabs') || document.body;
    const peers = kind === 'select-options' ? $$('select', scope) : kind === 'value' || kind === 'placeholder' ? $$('input,textarea', scope) : $$(editableCandidateSelector, scope);
    const peerIndex = peers.filter(peer => peer.tagName === element.tagName && semanticTextForKey(peer, kind) === text).indexOf(element) + 1;
    return `${editableContext(element)}:${kind}:semantic:${semanticScopeKey(element)}:${element.tagName.toLowerCase()}:${safeKeyPart(text)}:${peerIndex || 1}`;
  }
  function migrateLegacyRecord(element, kind, key) {
    if (element.dataset?.editorRecordKey) return;
    const oldKey = legacyRecordKey(element, kind);
    if (oldKey === key) return;
    ['content','styles'].forEach(bucket => {
      if (!Object.prototype.hasOwnProperty.call(designState[bucket], key) && Object.prototype.hasOwnProperty.call(designState[bucket], oldKey)) {
        designState[bucket][key] = JSON.parse(JSON.stringify(designState[bucket][oldKey]));
      }
    });
  }
  function isEditableApplicationSelect(element) {
    if (element.tagName !== 'SELECT' || element.matches('.previous-output-select')) return false;
    if (element.closest('#designEditor,#specEditor,.prototype-control-deck,[data-runtime-copy]')) return false;
    return !element.closest('#mainDialog,#mediaPreviewDialog') || isBusinessDialogElement(element);
  }
  function ensureEditorOptionIdentity(option, index) {
    if (!option.dataset.editorOptionId) option.dataset.editorOptionId = `base-${index}`;
    if (!('editorMachineValue' in option.dataset)) {
      const machineValue = option.value;
      option.dataset.editorMachineValue = machineValue;
      if (!option.hasAttribute('value')) option.setAttribute('value', machineValue);
    }
  }
  function captureSelectState(select) {
    const options = [...select.options].map((option, index) => {
      ensureEditorOptionIdentity(option, index);
      const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '';
      return { id:option.dataset.editorOptionId, label:option.textContent || '', value:option.value, disabled:Boolean(option.disabled), group };
    });
    return { options, selectedId:select.selectedIndex >= 0 ? options[select.selectedIndex]?.id || null : null };
  }
  function applySelectState(select, state) {
    if (!state || !Array.isArray(state.options)) return;
    const fragment = document.createDocumentFragment();
    let activeGroup = null;
    state.options.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = String(item.value ?? '');
      option.textContent = String(item.label ?? '');
      option.disabled = Boolean(item.disabled);
      option.dataset.editorOptionId = String(item.id || `base-${index}`);
      option.dataset.editorMachineValue = option.value;
      const groupLabel = String(item.group || '');
      if (groupLabel) {
        if (!activeGroup || activeGroup.label !== groupLabel) {
          activeGroup = document.createElement('optgroup');
          activeGroup.label = groupLabel;
          fragment.append(activeGroup);
        }
        activeGroup.append(option);
      } else {
        activeGroup = null;
        fragment.append(option);
      }
    });
    select.replaceChildren(fragment);
    const selectedIndex = [...select.options].findIndex(option => option.dataset.editorOptionId === state.selectedId);
    select.selectedIndex = selectedIndex >= 0 ? selectedIndex : select.options.length ? 0 : -1;
  }
  function prepareEditableSelect(select) {
    const optionVersion = select.dataset.editorOptionsVersion;
    const baseKey = stableRecordKey(select, 'select-options');
    const key = optionVersion ? `${baseKey}:options:${safeKeyPart(optionVersion)}` : baseKey;
    const legacyKey = legacyRecordKey(select, 'select-options');
    if (!optionVersion && !designState.selects[key] && designState.selects[legacyKey]) designState.selects[key] = JSON.parse(JSON.stringify(designState.selects[legacyKey]));
    [...select.options].forEach(ensureEditorOptionIdentity);
    if (!defaultSelectStateByKey.has(key)) defaultSelectStateByKey.set(key, captureSelectState(select));
    if (select.dataset.editorSelectStructureApplied === key) return key;
    const saved = designState.selects[key];
    if (saved?.options) {
      applySelectState(select, saved);
    } else if (!optionVersion) {
      let migrated = false;
      [...select.options].forEach(option => {
        const legacyOptionKey = legacyRecordKey(option, 'text');
        if (!Object.prototype.hasOwnProperty.call(designState.content, legacyOptionKey)) return;
        option.textContent = designState.content[legacyOptionKey];
        migrated = true;
      });
      if (migrated) {
        designState.selects[key] = captureSelectState(select);
      }
    }
    if (optionVersion) {
      const field = select.dataset.field;
      const nodeKey = select.closest('[data-node]')?.dataset.node || 'scene';
      const defaults = defaultConfigs[nodeKey] || defaultConfigs.scene;
      const desired = runState?.configs?.[nodeKey]?.[field] ?? restoredDraftConfigs?.[nodeKey]?.[field] ?? defaults[field];
      const valueExists = [...select.options].some(option => option.value === String(desired) && option.value !== '__not_configured');
      const defaultValue = defaults[field];
      const defaultExists = [...select.options].some(option => option.value === String(defaultValue) && option.value !== '__not_configured');
      const fallback = [...select.options].find(option => !option.disabled && !option.hidden && option.value !== '__not_configured')?.value || '';
      select.value = valueExists ? String(desired) : defaultExists ? String(defaultValue) : fallback;
    }
    select.dataset.editorSelectStructureApplied = key;
    return key;
  }
  function syncSelectDesignState(record) {
    if (record?.kind !== 'select-options') return;
    const state = captureSelectState(record.element);
    designState.selects[record.key] = state;
    const pathKey = legacyRecordKey(record.element, record.kind);
    if (pathKey !== record.key) designState.selects[pathKey] = JSON.parse(JSON.stringify(state));
    if (record.element.matches('.scene-model-option-source')) syncSceneModelOptionChips(record.element.closest('.node-config-card'));
    designDirty = true;
    persistDesignState();
    refreshEditorTextList();
  }
  function restoreDefaultSelectStates() {
    $$('select').filter(isEditableApplicationSelect).forEach(select => {
      const baseKey = stableRecordKey(select, 'select-options');
      const optionVersion = select.dataset.editorOptionsVersion;
      const key = optionVersion ? `${baseKey}:options:${safeKeyPart(optionVersion)}` : baseKey;
      const defaults = defaultSelectStateByKey.get(key);
      if (defaults) applySelectState(select, defaults);
      delete select.dataset.editorSelectStructureApplied;
    });
  }
  function prepareDirectTextWrappers() {
    $$('label.field,.filters label,.creation-steps>span').forEach(container => {
      [...container.childNodes].forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
        const wrapper = document.createElement('span');
        wrapper.className = 'editable-direct-copy';
        wrapper.textContent = node.textContent.trim();
        node.replaceWith(wrapper);
      });
    });
  }
  function recordValue(record) {
    if (record.kind === 'select-options') return $$('option', record.element).map(option => option.textContent.trim()).join(' / ');
    if (record.kind === 'placeholder') return record.element.getAttribute('placeholder') || '';
    if (record.kind === 'value') return record.element.value || '';
    return record.element.textContent || '';
  }
  function setRecordValue(record, value) {
    const nextValue = String(value ?? '');
    if (record.kind === 'select-options') return;
    if (record.kind === 'placeholder') {
      if ((record.element.getAttribute('placeholder') || '') !== nextValue) record.element.setAttribute('placeholder', nextValue);
    } else if (record.kind === 'value') {
      if (record.element.value !== nextValue) record.element.value = nextValue;
    } else if (record.element.textContent !== nextValue) record.element.textContent = nextValue;
  }
  function storeEditableContent(record, value) {
    if (!record || record.kind === 'select-options') return false;
    const nextValue = String(value ?? '');
    const pathKey = legacyRecordKey(record.element, record.kind);
    const changed = designState.content[record.key] !== nextValue || (pathKey !== record.key && designState.content[pathKey] !== nextValue);
    designState.content[record.key] = nextValue;
    if (pathKey !== record.key) designState.content[pathKey] = nextValue;
    return changed;
  }
  function commitSelectedEditableValue() {
    if (!selectedEditable || selectedEditable.kind === 'select-options') return false;
    const editor = $('#editorText');
    if (!editor || editor.disabled) return false;
    const value = editor.value;
    setRecordValue(selectedEditable, value);
    const changed = storeEditableContent(selectedEditable, value);
    if (changed) designDirty = true;
    return changed;
  }
  function mirrorEditablePersistenceAliases() {
    editableRecords.forEach(record => {
      const pathKey = legacyRecordKey(record.element, record.kind);
      if (record.kind === 'select-options') {
        const saved = designState.selects[record.key];
        if (saved && pathKey !== record.key) designState.selects[pathKey] = JSON.parse(JSON.stringify(saved));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(designState.content, record.key)) {
        designState.content[pathKey] = designState.content[record.key];
      }
      if (designState.styles[record.key]) designState.styles[pathKey] = { ...designState.styles[record.key] };
    });
  }
  function applyEditableStyle(record) {
    const style = designState.styles[record.key] || {};
    record.element.style.fontSize = style.fontSize || '';
    record.element.style.textAlign = style.textAlign || '';
  }
  function makeEditableRecord(element, kind, key, defaultValue) {
    migrateLegacyRecord(element, kind, key);
    const record = { element, kind, key, context:editableContext(element), defaultValue };
    const hasSavedValue = Object.prototype.hasOwnProperty.call(designState.content, key);
    const keepExperienceInput = kind === 'value' && !designMode && element.dataset.prototypeValueTouched === 'true';
    if (hasSavedValue && !keepExperienceInput) setRecordValue(record, designState.content[key]);
    applyEditableStyle(record);
    return record;
  }
  function clearEditableSelection() {
    $$('.editable-selected').forEach(element => element.classList.remove('editable-selected'));
    selectedEditable = null;
    $('#selectedElementType').textContent = '尚未选择';
    $('#editorText').value = '';
    $('#editorText').disabled = true;
    $('#editorFontSize').disabled = true;
    $('#editorTextAlign').disabled = true;
    $('#editorTextField').hidden = false;
    $('#editorSelectOptions').hidden = true;
    $('#editorOptionList').innerHTML = '';
  }
  function refreshEditableElements() {
    if (editableRefreshInProgress) return;
    editableRefreshInProgress = true;
    const selectedKey = selectedEditable?.key || null;
    prepareDirectTextWrappers();
    editableRecords = [];
    primaryRecordByElement = new Map();
    selectRecordByElement = new Map();
    $$('#mainDialog [data-edit-key],#mediaPreviewDialog [data-edit-key]').forEach(element => {
      if (isBusinessDialogElement(element)) return;
      delete element.dataset.editKey;
      element.contentEditable = 'false';
      element.classList.remove('editable-selected');
    });
    const editableSelectElements = $$('select').filter(isEditableApplicationSelect);
    editableSelectElements.forEach(prepareEditableSelect);
    $$('.scene-model-option-source').forEach(select => syncSceneModelOptionChips(select.closest('.node-config-card')));
    const candidates = $$(editableCandidateSelector).filter(element => {
      if (element.closest('#designEditor,#specEditor,.prototype-control-deck,#toast,script,style')) return false;
      if (element.closest('#mainDialog,#mediaPreviewDialog') && !isBusinessDialogElement(element)) return false;
      if (element.closest('[data-runtime-copy]')) {
        element.removeAttribute('data-edit-key');
        element.contentEditable = 'false';
        return false;
      }
      if (element.querySelector(editableCandidateSelector)) return false;
      return Boolean(element.textContent.trim()) || Object.prototype.hasOwnProperty.call(element.dataset, 'editorDefaultText');
    });
    candidates.forEach(element => {
      if (!('editorDefaultText' in element.dataset)) element.dataset.editorDefaultText = element.textContent;
      const key = stableRecordKey(element, 'text');
      const record = makeEditableRecord(element, 'text', key, element.dataset.editorDefaultText);
      editableRecords.push(record);
      primaryRecordByElement.set(element, record);
      element.dataset.editKey = key;
      element.contentEditable = designMode && inlineEditableTags.has(element.tagName) ? 'plaintext-only' : 'false';
      element.spellcheck = false;
      if (!element.dataset.editorBound) {
        element.dataset.editorBound = 'true';
        element.addEventListener('click', event => {
          if (!designMode) return;
          const current = primaryRecordByElement.get(element);
          if (!current) return;
          if (element.closest('button,a')) event.preventDefault();
          event.stopPropagation();
          selectEditable(current);
        });
        element.addEventListener('input', () => {
          if (!designMode || !element.isContentEditable) return;
          const current = primaryRecordByElement.get(element);
          if (!current) return;
          const changed = storeEditableContent(current, recordValue(current));
          if (changed) designDirty = true;
          persistDesignState();
          if (selectedEditable?.key === current.key) $('#editorText').value = recordValue(current);
          refreshEditorTextList();
        });
        element.addEventListener('paste', event => {
          if (!designMode || !element.isContentEditable) return;
          event.preventDefault();
          document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
        });
      }
    });
    editableSelectElements.forEach(element => {
      const key = prepareEditableSelect(element);
      const record = { element, kind:'select-options', key, context:editableContext(element), defaultValue:'' };
      editableRecords.push(record);
      primaryRecordByElement.set(element, record);
      selectRecordByElement.set(element, record);
      element.dataset.editKey = key;
    });
    $$('input,textarea').filter(element => !element.closest('#designEditor,#specEditor,.prototype-control-deck') && (!element.closest('#mainDialog,#mediaPreviewDialog') || isBusinessDialogElement(element)) && !['checkbox','radio','file','range','color'].includes(element.type)).forEach(element => {
      if (!('editorDefaultValue' in element.dataset)) element.dataset.editorDefaultValue = element.value || '';
      const valueKey = stableRecordKey(element, 'value');
      const valueRecord = makeEditableRecord(element, 'value', valueKey, element.dataset.editorDefaultValue);
      editableRecords.push(valueRecord);
      primaryRecordByElement.set(element, valueRecord);
      element.dataset.editKey = valueRecord.key;
      if (!element.dataset.editorValueBound) {
        element.dataset.editorValueBound = 'true';
        element.addEventListener('input', () => {
          if (!designMode) element.dataset.prototypeValueTouched = 'true';
        });
      }
      if (element.hasAttribute('placeholder')) {
        if (!('editorDefaultPlaceholder' in element.dataset)) element.dataset.editorDefaultPlaceholder = element.getAttribute('placeholder') || '';
        const placeholderKey = stableRecordKey(element, 'placeholder');
        editableRecords.push(makeEditableRecord(element, 'placeholder', placeholderKey, element.dataset.editorDefaultPlaceholder));
      }
    });
    const restoredSelection = selectedKey ? editableRecords.find(record => record.key === selectedKey) || null : null;
    $$('.editable-selected').forEach(element => element.classList.remove('editable-selected'));
    selectedEditable = null;
    refreshEditorTextList();
    if (designMode && restoredSelection) selectEditable(restoredSelection);
    else if (designMode && selectedKey) clearEditableSelection();
    editableRefreshInProgress = false;
    if ((prototypeMode === 'spec' || prototypeMode === 'compare') && !$('#specEditor')?.hidden) refreshSpecTargets();
  }
  function scheduleEditableRefresh() {
    if (editableRefreshScheduled) return;
    editableRefreshScheduled = true;
    requestAnimationFrame(() => {
      editableRefreshScheduled = false;
      refreshEditableElements();
    });
  }
  function observeDynamicDesignContent() {
    const root = $('.app-shell');
    if (!root || designContentObserver) return;
    designContentObserver = new MutationObserver(mutations => {
      const needsRefresh = mutations.some(mutation => {
        const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        if (!target || target.closest('#designEditor,#specEditor,#mainDialog,#toast')) return false;
        if (mutation.type === 'characterData') return true;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (needsRefresh) scheduleEditableRefresh();
    });
    designContentObserver.observe(root, { subtree:true, childList:true, characterData:true });
  }
  function selectEditorLabel(select) {
    const field = select.closest('label');
    const label = field?.querySelector('.field-label,.editable-direct-copy')?.textContent?.trim() || select.getAttribute('aria-label') || select.id || '未命名下拉框';
    return label.replace(/\s*\*\s*$/,'').trim();
  }
  function recordLabel(record) {
    if (record.kind === 'select-options') return `下拉选项｜${selectEditorLabel(record.element)}（${record.element.options.length} 项）`;
    const kindLabel = record.kind === 'placeholder' ? '占位提示' : record.kind === 'value' ? '输入内容' : ({BUTTON:'按钮',OPTION:'下拉选项',TH:'表头',TD:'表格内容',H1:'页面标题',H2:'模块标题',H3:'内容标题',P:'说明文字'}[record.element.tagName] || '文字');
    const value = recordValue(record).replace(/\s+/g,' ').trim();
    return `${kindLabel}｜${value.slice(0,32) || '空内容'}`;
  }
  function refreshEditorTextList() {
    const list = $('#editorTextList');
    if (!list) return;
    const context = $('#editorPageSelect').value || activeView;
    const query = $('#editorTextSearch').value.trim().toLowerCase();
    const records = editableRecords.filter(record => record.context === context && record.element.tagName !== 'OPTION' && (!query || recordLabel(record).toLowerCase().includes(query) || recordValue(record).toLowerCase().includes(query)));
    list.innerHTML = records.length ? records.map(record => `<option value="${record.key}">${escapeHtml(recordLabel(record))}</option>`).join('') : '<option disabled>没有匹配文字</option>';
    if (selectedEditable && records.some(record => record.key === selectedEditable.key)) list.value = selectedEditable.key;
  }
  function renderEditorOptionList(record) {
    const list = $('#editorOptionList');
    if (!list) return;
    const options = record?.kind === 'select-options' ? [...record.element.options] : [];
    const rows = options.length ? options.map((option, index) => {
      const optionId = option.dataset.editorOptionId || `base-${index}`;
      return `<div class="editor-option-row"><span>${index + 1}</span><input type="text" value="${escapeHtml(option.textContent)}" data-option-label-id="${escapeHtml(optionId)}" aria-label="第 ${index + 1} 个下拉选项"><label class="editor-option-default" title="设为选中项"><input type="radio" name="editorDefaultOption" data-option-default-id="${escapeHtml(optionId)}" ${option.selected ? 'checked' : ''}><span>选中</span></label><button class="editor-option-remove" type="button" data-option-remove-id="${escapeHtml(optionId)}" aria-label="删除第 ${index + 1} 个下拉选项" title="删除选项">×</button></div>`;
    }).join('') : '<p class="editor-option-empty">该下拉框暂无选项，可新增选项</p>';
    list.innerHTML = `${rows}<button class="button secondary editor-add-option" type="button" data-add-select-option>＋ 新增选项</button>`;
  }
  function selectEditable(record) {
    if (selectedEditable && selectedEditable !== record) commitSelectedEditableValue();
    selectedEditable?.element.classList.remove('editable-selected');
    selectedEditable = record;
    record.element.classList.add('editable-selected');
    const pageName = viewNames[record.context] || '全局区域';
    $('#selectedElementType').textContent = `${pageName} · ${recordLabel(record).split('｜')[0]}`;
    const isSelectOptions = record.kind === 'select-options';
    $('#editorTextField').hidden = isSelectOptions;
    $('#editorSelectOptions').hidden = !isSelectOptions;
    $('#editorText').disabled = isSelectOptions;
    $('#editorText').value = isSelectOptions ? '' : recordValue(record);
    $('#editorFontSize').disabled = isSelectOptions;
    $('#editorTextAlign').disabled = isSelectOptions;
    const style = designState.styles[record.key] || {};
    $('#editorFontSize').value = style.fontSize || '';
    $('#editorTextAlign').value = style.textAlign || '';
    $('#editorTextList').value = record.key;
    if (isSelectOptions) renderEditorOptionList(record);
  }
  function editableRecordFromTarget(target) {
    if (!(target instanceof Element)) return null;
    const select = target.closest('select[data-edit-key]');
    if (select) return selectRecordByElement.get(select) || primaryRecordByElement.get(select) || null;
    const directElement = target.closest('[data-edit-key]');
    const directRecord = directElement ? primaryRecordByElement.get(directElement) : null;
    if (directRecord) return directRecord;
    const component = target.closest('button,a,label,.node-card,.panel,th,td,[role="tab"],[role="button"]');
    if (!component) return null;
    const childElement = component.querySelector('[data-edit-key]');
    return childElement ? primaryRecordByElement.get(childElement) || null : null;
  }
  function updateDesignSaveState() {
    $('#saveDesign').textContent = designDirty ? '保存页面设计 · 有修改' : '页面设计已保存';
  }
  function applyDesignState() {
    document.documentElement.style.setProperty('--design-primary', designState.primary);
    document.documentElement.style.setProperty('--design-radius', `${designState.radius}px`);
    document.body.classList.toggle('density-compact', designState.density === 'compact');
    document.body.classList.toggle('module-hide-creation-steps', Boolean(designState.hidden.creationSteps));
    document.body.classList.toggle('module-hide-serial-note', Boolean(designState.hidden.serialNote));
    document.body.classList.toggle('module-hide-run-card', Boolean(designState.hidden.runCard));
    $('#editorPrimaryColor').value = designState.primary;
    $('#editorDensity').value = designState.density;
    $('#editorRadius').value = designState.radius;
    $('#radiusValue').textContent = `${designState.radius}px`;
    $('#showCreationSteps').checked = !designState.hidden.creationSteps;
    $('#showRunCard').checked = !designState.hidden.runCard;
  }
  function sanitizeRichHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    [...template.content.querySelectorAll('div')].forEach(element => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = element.innerHTML || '<br>';
      element.replaceWith(paragraph);
    });
    const allowed = new Set(['P','BR','STRONG','B','EM','I','U','UL','OL','LI','H3','BLOCKQUOTE','A','HR','TABLE','THEAD','TBODY','TR','TH','TD','IMG','FONT']);
    [...template.content.querySelectorAll('*')].forEach(element => {
      if (!allowed.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }
      [...element.attributes].forEach(attribute => {
        const allowedAttribute = element.tagName === 'A' && attribute.name === 'href' || element.tagName === 'IMG' && ['src','alt'].includes(attribute.name) || element.tagName === 'FONT' && ['color','size'].includes(attribute.name);
        if (!allowedAttribute) element.removeAttribute(attribute.name);
      });
      if (element.tagName === 'A') {
        const href = element.getAttribute('href') || '';
        if (!/^(https?:|mailto:|#|\/)/i.test(href)) element.removeAttribute('href');
        else if (!href.startsWith('#prototype-rule-')) { element.target = '_blank'; element.rel = 'noopener'; }
      }
      if (element.tagName === 'IMG') {
        const src = element.getAttribute('src') || '';
        if (!/^(?:data:image\/(?:png|jpe?g|gif|webp);base64,|https?:\/\/)/i.test(src)) element.remove();
      }
      if (element.tagName === 'FONT') {
        const color = String(element.getAttribute('color') || '').toLowerCase();
        const size = String(element.getAttribute('size') || '');
        if (color && !['#dc2626','#f59e0b','#2563eb'].includes(color)) element.removeAttribute('color');
        if (size && !['2','3','5'].includes(size)) element.removeAttribute('size');
      }
    });
    return template.innerHTML;
  }
  function unifiedSpecHtml(record) {
    const feature = sanitizeRichHtml(record?.feature || '');
    const data = sanitizeRichHtml(record?.data || '');
    const interaction = sanitizeRichHtml(record?.interaction || '');
    const sections = [];
    if (feature) sections.push(feature);
    if (richHtmlHasContent(data)) sections.push(`<h3>数据说明</h3>${data}`);
    if (richHtmlHasContent(interaction)) sections.push(`<h3>交互说明</h3>${interaction}`);
    return sanitizeRichHtml(sections.join(''));
  }
  function richHtmlHasContent(html) {
    const value = String(html || '');
    return Boolean(value.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim() || /<(?:img|hr|table)\b/i.test(value));
  }
  function specRecord(id) {
    if (!specState[id]) specState[id] = { feature:'', data:'', interaction:'' };
    return specState[id];
  }
  function hasCreatedSpec(id) {
    return Object.prototype.hasOwnProperty.call(specState, id);
  }
  function specDisplayName(target) {
    if (!target) return '说明详情';
    const record = specState[target.dataset.specId];
    return String(record?.name || '').trim() || target.dataset.specLabel || target.dataset.specId;
  }
  function hasSpec(id) {
    const record = specState[id];
    return Boolean(record && ['feature','data','interaction'].some(key => richHtmlHasContent(record[key])));
  }
  function updateSpecSaveState() {
    $('#specSaveState').textContent = specDirty ? '有未保存修改' : prototypeMode === 'compare' ? '已保存说明' : '说明已保存';
    $('#specSaveState').classList.toggle('dirty', specDirty);
    $('#saveSpecs').textContent = specDirty ? '保存说明 · 有修改' : '说明已保存';
  }
  function updateSpecGuide() {
    const isList = specPanelView === 'list';
    if (prototypeMode === 'spec') {
      $('#specEditorGuide').innerHTML = isList
        ? '<b>当前页面说明</b><p>选择已有说明查看详情，或点击左侧业务组件创建一条新说明。</p>'
        : '<b>编辑组件说明</b><p>可自定义说明名称，并在统一富文本中记录功能、数据和交互规则。</p>';
    } else {
      $('#specEditorGuide').innerHTML = isList
        ? '<b>技术查看 · 当前页面说明</b><p>选择已有说明查看详情；技术查看状态不会创建或修改说明。</p>'
        : '<b>技术查看 · 说明详情</b><p>当前内容为只读；可返回列表继续查看其他说明。</p>';
    }
  }
  function renderPageDescription() {
    const page = $('#specPageSelect').value || activeView;
    const input = $('#specPageDescription');
    const canEdit = prototypeMode === 'spec';
    input.value = String(prototypeGovernanceState.pageDescriptions[page] || '');
    input.readOnly = !canEdit;
    input.placeholder = canEdit ? '输入当前页面的目标、范围和整体业务说明…' : '当前页面暂未填写页面说明';
    $('#specPageDescriptionState').textContent = canEdit ? '输入后自动保存' : '只读';
  }
  function renderSpecEditor() {
    const editor = $('#specRichEditor');
    const empty = $('#specEmptyState');
    const canEdit = prototypeMode === 'spec';
    const inDetail = specPanelView === 'detail' && Boolean(selectedSpecTarget);
    const deleteButton = $('#deleteSelectedSpecTarget');
    $('#specListView').hidden = inDetail;
    $('#specDetailView').hidden = !inDetail;
    $('#specEditorFoot').hidden = !canEdit || !inDetail;
    $('#richToolbar').hidden = !canEdit || !inDetail;
    $('#resetSpecTarget').hidden = !canEdit || !inDetail;
    $('#saveSpecs').hidden = !canEdit || !inDetail;
    deleteButton.hidden = !canEdit || !inDetail;
    deleteButton.disabled = !inDetail;
    editor.contentEditable = canEdit ? 'true' : 'false';
    updateSpecGuide();
    if (!inDetail) {
      renderPageDescription();
      editor.innerHTML = '';
      activeRichTableCell = null;
      syncRichTableTools();
      empty.hidden = true;
      updateSpecSaveState();
      return;
    }
    empty.hidden = true;
    const record = specRecord(selectedSpecTarget.dataset.specId);
    const fallbackName = selectedSpecTarget.dataset.specLabel || selectedSpecTarget.dataset.specId;
    $('#selectedSpecTarget').textContent = specDisplayName(selectedSpecTarget);
    $('#specBoundComponent').textContent = `关联组件：${fallbackName}`;
    $('#specNameInput').value = String(record.name || '');
    $('#specNameInput').placeholder = fallbackName;
    $('#specNameInput').readOnly = !canEdit;
    const value = unifiedSpecHtml(record);
    editor.innerHTML = value;
    activeRichTableCell = null;
    syncRichTableTools();
    editor.dataset.placeholder = canEdit ? '输入功能目标、业务规则、字段口径或交互约束…' : '当前原型说明尚未记录内容';
    editor.classList.toggle('is-empty', !richHtmlHasContent(value));
    updateSpecSaveState();
  }
  function selectSpecTarget(target, scroll = false) {
    selectedSpecTarget?.classList.remove('spec-selected');
    selectedSpecTarget = target || null;
    selectedSpecTarget?.classList.add('spec-selected');
    if (selectedSpecTarget) specPanelView = 'detail';
    $$('.spec-target-item').forEach(button => button.classList.toggle('active', Boolean(target) && button.dataset.specTarget === target.dataset.specId));
    renderSpecEditor();
    if (scroll && target && !target.classList.contains('view') && !target.closest('[hidden]')) target.scrollIntoView({ behavior:'smooth', block:'center' });
  }
  function showSpecList(commit = true) {
    if (commit) commitSpecEditor();
    selectedSpecTarget?.classList.remove('spec-selected');
    selectedSpecTarget = null;
    specPanelView = 'list';
    refreshSpecTargets();
  }
  function specComponentHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function specComponentTypeLabel(element) {
    if (element.matches('button,.button,.text-button,.table-link,[role="button"]')) return '按钮';
    if (element.matches('input,select,textarea')) return '表单控件';
    if (element.matches('label,.field,fieldset')) return '表单项';
    if (element.matches('table,thead,tbody,tr,th,td,[role="row"],[role="cell"],[role="columnheader"]')) return '表格组件';
    if (element.matches('h1,h2,h3,h4,h5,p')) return '文本组件';
    if (element.matches('img,video,figure')) return '媒体组件';
    if (element.matches('ul,ol,li,dl,dt,dd')) return '列表组件';
    if (element.matches('article,.panel,.run-card')) return '卡片';
    if (element.matches('nav,[role="tab"],[role="group"]')) return '导航组件';
    if (element.matches('.classified-upload,.uploaded-material-item,.generated-preview-card,.cache-item,.retained-asset')) return '素材组件';
    return '页面组件';
  }
  function specComponentLabel(element) {
    if (element.dataset.specLabel) return element.dataset.specLabel;
    const fieldLabel = element.closest('label,fieldset')?.querySelector('.field-label,legend,.editable-direct-copy');
    const heading = element.querySelector?.(':scope>h1,:scope>h2,:scope>h3,:scope>h4,:scope>h5,:scope>.panel-head h2,:scope>.node-section-title h4');
    const accessible = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder');
    const ownText = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean).join(' ');
    const fallbackText = element.matches('button,a,th,td,dt,dd') ? element.textContent.trim() : '';
    const text = String(accessible || fieldLabel?.textContent || heading?.textContent || ownText || fallbackText || element.id || '').replace(/\s+/g, ' ').trim();
    const type = specComponentTypeLabel(element);
    return text ? `${type} · ${text.slice(0, 42)}` : type;
  }
  function ensureSpecTargetIdentity(element, view) {
    if (!element || !view) return null;
    if (element.dataset.specId) return element;
    const page = view.contains(element) || isBusinessDialogElement(element) ? (view.dataset.page || 'page') : 'global';
    const path = stableElementPath(element);
    element.dataset.specId = `component-${safeKeyPart(page)}-${specComponentHash(path)}`;
    element.dataset.specLabel = specComponentLabel(element);
    element.dataset.specAuto = 'true';
    element.dataset.specScope = page;
    return element;
  }
  function restoreSavedSpecTargetIdentity(element, view) {
    if (!element || !view || element.dataset.specId) return element || null;
    const page = view.contains(element) || isBusinessDialogElement(element) ? (view.dataset.page || 'page') : 'global';
    const path = stableElementPath(element);
    const savedId = `component-${safeKeyPart(page)}-${specComponentHash(path)}`;
    if (!hasCreatedSpec(savedId)) return null;
    element.dataset.specId = savedId;
    element.dataset.specLabel = specComponentLabel(element);
    element.dataset.specAuto = 'true';
    element.dataset.specScope = page;
    return element;
  }
  function recoveredSpecTarget(id, page) {
    if (!recoveredSpecTargets.has(id)) {
      const target = document.createElement('span');
      target.dataset.specId = id;
      target.dataset.specAuto = 'true';
      target.dataset.specRecovered = 'true';
      recoveredSpecTargets.set(id, target);
    }
    const target = recoveredSpecTargets.get(id);
    target.dataset.specScope = page;
    target.dataset.specLabel = String(specState[id]?.name || '').trim() || `已恢复的组件说明 ${id.slice(-6)}`;
    return target;
  }
  function appendRecoveredSpecTargets(targets, view) {
    const page = view.dataset.page || 'page';
    const pagePrefix = `component-${safeKeyPart(page)}-`;
    const globalPrefix = 'component-global-';
    Object.keys(specState).forEach(id => {
      if ((!id.startsWith(pagePrefix) && !id.startsWith(globalPrefix)) || deletedSpecTargetIds.has(id)) return;
      if (targets.some(target => target.dataset.specId === id)) return;
      targets.push(recoveredSpecTarget(id, id.startsWith(globalPrefix) ? 'global' : page));
    });
  }
  function persistDeletedSpecTargets() {
    localStorage.setItem(deletedSpecTargetStorageKey, JSON.stringify([...deletedSpecTargetIds]));
  }
  function addCollectedSpecTarget(targets, element) {
    if (!element?.dataset.specId) return;
    const deleted = deletedSpecTargetIds.has(element.dataset.specId);
    element.classList.toggle('spec-target-deleted', deleted);
    if (!deleted && !targets.includes(element)) targets.push(element);
  }
  function collectSpecTargets(view) {
    const targets = [];
    addCollectedSpecTarget(targets, view);
    const dialogRoots = [$('#mainDialog'), $('#mediaPreviewDialog')].filter(root => root && isBusinessDialogElement(root));
    const candidateRoots = [view, ...$$('.sidebar,.system-header,.page-tabs'), ...dialogRoots];
    candidateRoots.forEach(root => {
      if (root.matches?.(businessSpecComponentSelector)) {
        root.classList.add('spec-component-candidate');
        restoreSavedSpecTargetIdentity(root, view);
      }
      $$(businessSpecComponentSelector, root).forEach(element => {
        if (element !== view && !element.closest('#designEditor,#specEditor,.prototype-control-deck,#toast') && (!element.closest('#mainDialog,#mediaPreviewDialog') || isBusinessDialogElement(element))) {
          element.classList.add('spec-component-candidate');
          restoreSavedSpecTargetIdentity(element, view);
        }
      });
    });
    $$('[data-spec-id]', view).forEach(element => {
      if (element === view || element.closest('#designEditor,#specEditor,.prototype-control-deck,#toast')) return;
      addCollectedSpecTarget(targets, element);
    });
    dialogRoots.forEach(root => $$('[data-spec-id]', root).forEach(element => addCollectedSpecTarget(targets, element)));
    $$('[data-spec-id][data-spec-scope="global"]').forEach(element => {
      addCollectedSpecTarget(targets, element);
    });
    appendRecoveredSpecTargets(targets, view);
    return targets;
  }
  function refreshSpecTargets() {
    const page = $('#specPageSelect').value || activeView;
    const view = $(`.view[data-page="${page}"]`);
    if (!view) return;
    specTargets = collectSpecTargets(view);
    const createdTargets = specTargets.filter(target => hasCreatedSpec(target.dataset.specId));
    specTargets.forEach(target => {
      delete target.dataset.specNumber;
      target.classList.toggle('has-spec-target', hasSpec(target.dataset.specId));
    });
    createdTargets.forEach((target, index) => { target.dataset.specNumber = String(index + 1); });
    $('#specListTitle').textContent = `${viewNames[page] || '当前页面'}说明`;
    renderPageDescription();
    $('#specTargetCount').textContent = `${createdTargets.length} 个`;
    $('#specTargetList').innerHTML = createdTargets.map((target, index) => {
      const id = target.dataset.specId;
      const componentLabel = target.dataset.specLabel || id;
      const name = specDisplayName(target);
      const hidden = target.closest('[hidden]') ? ' · 当前步骤未展示' : '';
      const level = target.dataset.specRecovered === 'true' ? '已恢复' : target.dataset.specAuto === 'true' ? '组件级' : '模块级';
      const recoveredClass = target.dataset.specRecovered === 'true' ? ' recovered' : '';
      return `<div class="spec-target-item ${hasSpec(id) ? 'has-spec' : ''}${recoveredClass}" data-spec-target="${escapeHtml(id)}" role="button" tabindex="0"><span>${index + 1}</span><span><b>${escapeHtml(name)}</b><small>${level} · ${escapeHtml(componentLabel)} · ${hasSpec(id) ? '已有内容' : '待完善'}${hidden}</small></span><em></em><i aria-hidden="true">›</i></div>`;
    }).join('');
    $('#specListEmpty').hidden = createdTargets.length > 0;
    const keepId = selectedSpecTarget?.dataset.specId;
    const keepTarget = createdTargets.find(target => target.dataset.specId === keepId) || null;
    if (specPanelView === 'detail' && keepTarget) selectSpecTarget(keepTarget);
    else {
      selectedSpecTarget?.classList.remove('spec-selected');
      selectedSpecTarget = null;
      specPanelView = 'list';
      renderSpecEditor();
    }
  }
  function commitSpecEditor() {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    const editor = $('#specRichEditor');
    const record = specRecord(selectedSpecTarget.dataset.specId);
    const value = sanitizeRichHtml(editor.innerHTML);
    const name = $('#specNameInput').value.trim().slice(0, 80);
    if (unifiedSpecHtml(record) !== value) specDirty = true;
    if (String(record.name || '') !== name) specDirty = true;
    record.feature = value;
    record.data = '';
    record.interaction = '';
    record.name = name;
    editor.innerHTML = value;
    $('#selectedSpecTarget').textContent = specDisplayName(selectedSpecTarget);
    selectedSpecTarget.classList.toggle('has-spec-target', hasSpec(selectedSpecTarget.dataset.specId));
    updateSpecSaveState();
  }
  function saveSpecs(silent = false) {
    commitSpecEditor();
    if (!persistSpecState('保存说明')) {
      specDirty = true;
      updateSpecSaveState();
      toast('原型说明保存失败，请减少图片大小或删除不需要的图片', 'warning');
      return false;
    }
    specDirty = false;
    refreshSpecTargets();
    updateSpecSaveState();
    if (!silent) toast('原型说明已保存');
    return true;
  }
  function requestDeleteSpecTarget(targetId) {
    if (prototypeMode !== 'spec') return;
    const target = specTargets.find(item => item.dataset.specId === targetId);
    if (!target) return;
    const label = specDisplayName(target);
    openDialog('删除组件说明', label, '<div class="permission-note spec-delete-confirm" style="margin:0"><span>!</span><p>删除后，该组件的功能、数据与交互说明将同时移除。之后仍可重新点击业务组件创建说明。</p></div>', '确认删除', () => {
      delete specState[targetId];
      persistSpecState('删除说明');
      deletedSpecTargetIds.add(targetId);
      persistDeletedSpecTargets();
      target.classList.remove('spec-selected','has-spec-target');
      target.classList.add('spec-target-deleted');
      if (target.dataset.specAuto === 'true') {
        ['specId','specLabel','specAuto','specScope','specNumber'].forEach(key => delete target.dataset[key]);
        target.classList.remove('spec-target-deleted');
      }
      if (selectedSpecTarget === target) selectedSpecTarget = null;
      specDirty = false;
      closeDialog();
      showSpecList(false);
      toast('组件说明已删除', 'info');
    });
  }
  function globalRuleById(id) {
    return prototypeGovernanceState.globalRules.find(rule => rule.id === id) || null;
  }
  function globalRuleRichHtml(rule) {
    const content = String(rule?.content || '');
    if (!content) return '';
    if (rule?.contentFormat === 'rich') return sanitizeRichHtml(content);
    return `<p>${escapeHtml(content).replace(/\r?\n/g, '<br>')}</p>`;
  }
  function globalRulePlainText(rule) {
    const template = document.createElement('template');
    template.innerHTML = globalRuleRichHtml(rule).replace(/<br\s*\/?\s*>/gi, ' ');
    return String(template.content.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function nextGlobalRuleCode() {
    const max = prototypeGovernanceState.globalRules.reduce((result, rule) => {
      const match = String(rule.code || '').match(/^GR-(\d+)$/i);
      return match ? Math.max(result, Number(match[1]) || 0) : result;
    }, 0);
    return `GR-${String(max + 1).padStart(3, '0')}`;
  }
  function globalRuleListItemsMarkup(codeQuery = '', nameQuery = '') {
    const codeNeedle = String(codeQuery).trim().toLowerCase();
    const nameNeedle = String(nameQuery).trim().toLowerCase();
    const canEdit = prototypeMode === 'spec';
    const rules = prototypeGovernanceState.globalRules.filter(rule => String(rule.code).toLowerCase().includes(codeNeedle) && String(rule.name).toLowerCase().includes(nameNeedle));
    if (!rules.length) return `<div class="global-rule-empty"><b>${prototypeGovernanceState.globalRules.length ? '未找到匹配规则' : '暂无全局规则'}</b><p>${canEdit ? '可点击“新增规则”创建第一条全局规则。' : '请切换至原型说明状态创建规则。'}</p></div>`;
    return rules.map(rule => `<article class="global-rule-row" data-open-global-rule="${escapeHtml(rule.id)}" tabindex="0" role="button"><span class="global-rule-code">${escapeHtml(rule.code)}</span><div><b>${escapeHtml(rule.name)}</b><small>${escapeHtml(globalRulePlainText(rule) || '暂未填写规则说明')}</small></div><span class="global-rule-updated">${rule.updatedAt ? escapeHtml(new Date(rule.updatedAt).toLocaleString('zh-CN', { hour12:false })) : '未记录更新时间'}</span><div class="global-rule-row-actions"><button type="button" data-view-global-rule="${escapeHtml(rule.id)}">查看</button>${canEdit ? `<button type="button" data-edit-global-rule="${escapeHtml(rule.id)}">修改</button>` : ''}</div></article>`).join('');
  }
  function openGlobalRulesList() {
    const canEdit = prototypeMode === 'spec';
    const body = `<div class="global-rule-manager dialog-wide-content"><div class="prototype-governance-note"><b>${canEdit ? '全局规则管理' : '全局规则查看'}</b><span>统一维护跨页面、跨组件复用的业务规则；规则可在单个原型说明中被引用。</span></div><div class="global-rule-list-toolbar"><label><span>规则编号</span><input id="globalRuleCodeSearch" placeholder="搜索规则编号"></label><label><span>规则名称</span><input id="globalRuleNameSearch" placeholder="搜索规则名称"></label>${canEdit ? '<button class="button primary" type="button" data-new-global-rule>＋ 新增规则</button>' : ''}</div><div class="global-rule-list" id="globalRuleListResults">${globalRuleListItemsMarkup()}</div></div>`;
    openDialog(canEdit ? '编辑全局规则' : '查看全局规则', `${prototypeGovernanceState.globalRules.length} 条规则`, body, '关闭', closeDialog);
    const dialogBody = $('#dialogBody');
    const refresh = () => { $('#globalRuleListResults').innerHTML = globalRuleListItemsMarkup($('#globalRuleCodeSearch').value, $('#globalRuleNameSearch').value); };
    dialogBody.oninput = event => { if (event.target.matches('#globalRuleCodeSearch,#globalRuleNameSearch')) refresh(); };
    dialogBody.onclick = event => {
      const create = event.target.closest('[data-new-global-rule]');
      if (create) { openGlobalRuleForm(); return; }
      const edit = event.target.closest('[data-edit-global-rule]');
      if (edit) { event.stopPropagation(); openGlobalRuleForm(edit.dataset.editGlobalRule); return; }
      const target = event.target.closest('[data-view-global-rule],[data-open-global-rule]');
      if (target) openGlobalRuleDetail(target.dataset.viewGlobalRule || target.dataset.openGlobalRule, 'list');
    };
    dialogBody.onkeydown = event => {
      if (!['Enter',' '].includes(event.key)) return;
      const row = event.target.closest('[data-open-global-rule]');
      if (!row) return;
      event.preventDefault();
      openGlobalRuleDetail(row.dataset.openGlobalRule, 'list');
    };
  }
  function openGlobalRuleForm(ruleId = '') {
    if (prototypeMode !== 'spec') return;
    const existing = globalRuleById(ruleId);
    const body = `<div class="global-rule-form dialog-wide-content"><button class="global-rule-back" type="button" data-back-global-rules>← 返回规则列表</button><div class="global-rule-form-grid"><label><span>规则编号 <em>*</em></span><input id="globalRuleCodeInput" maxlength="40" value="${escapeHtml(existing?.code || nextGlobalRuleCode())}" placeholder="例如 GR-001"></label><label><span>规则名称 <em>*</em></span><input id="globalRuleNameInput" maxlength="80" value="${escapeHtml(existing?.name || '')}" placeholder="输入规则名称"></label><div class="global-rule-rich-field wide"><span>规则说明</span><div class="rich-toolbar global-rule-rich-toolbar" id="globalRuleRichToolbar" aria-label="规则说明富文本工具栏"><select id="globalRuleRichBlock" aria-label="规则说明段落样式"><option value="p">正文</option><option value="h3">小标题</option><option value="blockquote">备注</option></select><button type="button" data-global-rich-command="bold" title="加粗"><b>B</b></button><button type="button" data-global-rich-command="italic" title="斜体"><i>I</i></button><button type="button" data-global-rich-command="underline" title="下划线"><u>U</u></button><button type="button" data-global-rich-command="insertUnorderedList" title="项目符号">• 列表</button><button type="button" data-global-rich-command="insertOrderedList" title="编号列表">1. 列表</button><button type="button" data-global-rich-command="createLink" title="插入链接">链接</button><button type="button" data-global-rich-command="insertHorizontalRule" title="插入横线">横线</button><button type="button" data-global-rich-table title="插入 2×2 表格">表格</button><button type="button" data-global-rich-image title="插入本地图片">图片</button><input id="globalRuleImageInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></div><div class="rich-editor global-rule-rich-editor" id="globalRuleContentInput" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="输入规则适用范围、判断条件、数据口径或交互约束…">${globalRuleRichHtml(existing)}</div></div></div></div>`;
    openDialog(existing ? '修改全局规则' : '新增全局规则', existing ? `${existing.code} · ${existing.name}` : '创建规则编号并为规则命名', body, '保存规则', () => {
      const code = $('#globalRuleCodeInput').value.trim().slice(0, 40);
      const name = $('#globalRuleNameInput').value.trim().slice(0, 80);
      const content = sanitizeRichHtml($('#globalRuleContentInput').innerHTML).trim();
      if (!code || !name) { toast('请填写规则编号和规则名称', 'warning'); return; }
      if (content.length > 2200000) { toast('规则说明内容过大，请减少图片大小或删除不需要的图片', 'warning'); return; }
      const duplicate = prototypeGovernanceState.globalRules.find(rule => rule.id !== existing?.id && rule.code.toLowerCase() === code.toLowerCase());
      if (duplicate) { toast(`规则编号 ${code} 已存在`, 'warning'); return; }
      const savedRule = { id:existing?.id || `rule-${Date.now().toString(36)}`, code, name, content, contentFormat:'rich', updatedAt:new Date().toISOString() };
      if (existing) Object.assign(existing, savedRule);
      else prototypeGovernanceState.globalRules.unshift(savedRule);
      if (!persistPrototypeGovernanceState()) { toast('全局规则保存失败，请检查浏览器存储空间', 'warning'); return; }
      toast(existing ? '全局规则已更新' : '全局规则已创建');
      openGlobalRuleDetail(savedRule.id, 'list');
    });
    const dialogBody = $('#dialogBody');
    const editor = $('#globalRuleContentInput');
    let imageRange = null;
    const captureRange = () => {
      const selection = window.getSelection();
      return selection?.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    };
    const insertMarkup = (markup, savedRange = null) => {
      editor.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      if (savedRange && editor.contains(savedRange.commonAncestorContainer)) selection.addRange(savedRange);
      else {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.addRange(range);
      }
      document.execCommand('insertHTML', false, markup);
    };
    dialogBody.onmousedown = event => { if (event.target.closest('#globalRuleRichToolbar button')) event.preventDefault(); };
    dialogBody.onclick = event => {
      if (event.target.closest('[data-back-global-rules]')) { openGlobalRulesList(); return; }
      const commandButton = event.target.closest('[data-global-rich-command]');
      if (commandButton) {
        const command = commandButton.dataset.globalRichCommand;
        let value = null;
        if (command === 'createLink') {
          value = window.prompt('输入链接地址（https://…）');
          if (!value) return;
        }
        editor.focus();
        document.execCommand(command, false, value);
        return;
      }
      if (event.target.closest('[data-global-rich-table]')) {
        insertMarkup('<table><tbody><tr><th>标题 1</th><th>标题 2</th></tr><tr><td>内容</td><td>内容</td></tr></tbody></table><p><br></p>', captureRange());
        return;
      }
      if (event.target.closest('[data-global-rich-image]')) {
        imageRange = captureRange();
        $('#globalRuleImageInput').click();
      }
    };
    dialogBody.onchange = event => {
      if (event.target.matches('#globalRuleRichBlock')) {
        editor.focus();
        document.execCommand('formatBlock', false, event.target.value);
        return;
      }
      if (!event.target.matches('#globalRuleImageInput')) return;
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) { imageRange = null; return; }
      if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(file.type)) { imageRange = null; toast('请选择 PNG、JPG、GIF 或 WebP 图片', 'warning'); return; }
      if (file.size > 1.5 * 1024 * 1024) { imageRange = null; toast('单张图片不能超过 1.5 MB', 'warning'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const range = imageRange;
        imageRange = null;
        insertMarkup(`<img src="${reader.result}" alt="${escapeHtml(file.name)}"><p><br></p>`, range);
      };
      reader.onerror = () => { imageRange = null; toast('图片读取失败，请重新选择', 'warning'); };
      reader.readAsDataURL(file);
    };
  }
  function openGlobalRuleDetail(ruleId, returnTarget = 'list') {
    const rule = globalRuleById(ruleId);
    if (!rule) { toast('该全局规则不存在或已删除', 'warning'); if (returnTarget === 'list') openGlobalRulesList(); return; }
    const canEdit = prototypeMode === 'spec';
    const backLabel = returnTarget === 'spec' ? '返回原型说明' : '返回规则列表';
    const body = `<div class="global-rule-detail dialog-wide-content"><div class="global-rule-detail-nav"><button class="global-rule-back" type="button" data-back-global-rule-detail>← ${backLabel}</button>${canEdit ? `<div><button class="button secondary" type="button" data-edit-global-rule="${escapeHtml(rule.id)}">修改规则</button><button class="button danger" type="button" data-delete-global-rule="${escapeHtml(rule.id)}">删除规则</button></div>` : ''}</div><section><div class="global-rule-detail-identity"><span>${escapeHtml(rule.code)}</span><h3>${escapeHtml(rule.name)}</h3></div><dl><div><dt>规则编号</dt><dd>${escapeHtml(rule.code)}</dd></div><div><dt>规则名称</dt><dd>${escapeHtml(rule.name)}</dd></div><div class="wide"><dt>规则说明</dt><dd class="global-rule-content rich-editor global-rule-rich-readonly">${globalRuleRichHtml(rule) || '<p>暂未填写规则说明</p>'}</dd></div></dl></section></div>`;
    openDialog('全局规则详情', `${rule.code} · ${rule.name}`, body, returnTarget === 'spec' ? '返回原型说明' : '关闭', returnTarget === 'spec' ? closeDialog : closeDialog);
    $('#dialogBody').onclick = event => {
      if (event.target.closest('[data-back-global-rule-detail]')) { if (returnTarget === 'spec') closeDialog(); else openGlobalRulesList(); return; }
      const edit = event.target.closest('[data-edit-global-rule]');
      if (edit) { openGlobalRuleForm(edit.dataset.editGlobalRule); return; }
      const remove = event.target.closest('[data-delete-global-rule]');
      if (remove) requestDeleteGlobalRule(remove.dataset.deleteGlobalRule, returnTarget);
    };
  }
  function requestDeleteGlobalRule(ruleId, returnTarget) {
    const rule = globalRuleById(ruleId);
    if (!rule || prototypeMode !== 'spec') return;
    openDialog('删除全局规则', `${rule.code} · ${rule.name}`, '<div class="permission-note spec-delete-confirm" style="margin:0"><span>!</span><p>删除后，已插入原型说明中的规则引用仍会保留，但点击时会提示该规则已不存在。</p></div>', '确认删除', () => {
      prototypeGovernanceState.globalRules = prototypeGovernanceState.globalRules.filter(item => item.id !== ruleId);
      persistPrototypeGovernanceState();
      toast('全局规则已删除', 'info');
      if (returnTarget === 'spec') closeDialog(); else openGlobalRulesList();
    });
  }
  function openPrototypeGovernanceEditor(kind) {
    if (kind === 'globalRules') { openGlobalRulesList(); return; }
    const canEdit = prototypeMode === 'spec';
    const value = String(prototypeGovernanceState.requirementAdjustments || '');
    const body = `<div class="prototype-governance-dialog"><div class="prototype-governance-note"><b>${canEdit ? '编辑模式' : '技术查看模式'}</b><span>记录需求变更、调整原因及影响范围，便于研发追溯。</span></div><label><span>需求调整记录</span><textarea id="prototypeGovernanceEditor" maxlength="12000" rows="14" ${canEdit ? '' : 'readonly'} placeholder="当前尚未填写需求调整记录">${escapeHtml(value)}</textarea></label></div>`;
    if (canEdit) {
      openDialog('编辑需求调整记录', '原型协作资料', body, '保存', () => {
        prototypeGovernanceState.requirementAdjustments = $('#prototypeGovernanceEditor').value.trim().slice(0,12000);
        if (!persistPrototypeGovernanceState()) { toast('需求调整记录保存失败，请检查浏览器存储空间', 'warning'); return; }
        closeDialog();
        toast('需求调整记录已保存');
      });
    } else openDialog('查看需求调整记录', '技术查看 · 只读', body, '关闭', closeDialog);
  }
  function globalRuleReferenceItemsMarkup(query = '') {
    const needle = String(query).trim().toLowerCase();
    const rules = prototypeGovernanceState.globalRules.filter(rule => !needle || `${rule.code} ${rule.name}`.toLowerCase().includes(needle));
    if (!rules.length) return `<div class="global-rule-empty"><b>${prototypeGovernanceState.globalRules.length ? '未找到匹配规则' : '暂无可引入规则'}</b><p>${prototypeGovernanceState.globalRules.length ? '请调整搜索关键词。' : '请先通过顶部“编辑全局规则”创建规则。'}</p></div>`;
    return rules.map(rule => `<button class="global-rule-reference-option" type="button" data-insert-global-rule="${escapeHtml(rule.id)}"><span>${escapeHtml(rule.code)}</span><div><b>${escapeHtml(rule.name)}</b><small>${escapeHtml(globalRulePlainText(rule) || '暂未填写规则说明')}</small></div><i>引入</i></button>`).join('');
  }
  function openGlobalRuleReferencePicker() {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    const selection = window.getSelection();
    pendingGlobalRuleRange = selection?.rangeCount && $('#specRichEditor').contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    const body = `<div class="global-rule-reference-picker"><label><span>搜索规则</span><input id="globalRuleReferenceSearch" placeholder="输入规则编号或规则名称"></label><div id="globalRuleReferenceResults">${globalRuleReferenceItemsMarkup()}</div></div>`;
    openDialog('引入全局规则', '将规则编号与名称插入当前原型说明', body, '取消', closeDialog);
    $('#dialogBody').oninput = event => { if (event.target.matches('#globalRuleReferenceSearch')) $('#globalRuleReferenceResults').innerHTML = globalRuleReferenceItemsMarkup(event.target.value); };
    $('#dialogBody').onclick = event => {
      const button = event.target.closest('[data-insert-global-rule]');
      if (!button) return;
      const rule = globalRuleById(button.dataset.insertGlobalRule);
      if (!rule) { toast('该全局规则不存在或已删除', 'warning'); return; }
      closeDialog();
      requestAnimationFrame(() => insertGlobalRuleReference(rule));
    };
  }
  function insertGlobalRuleReference(rule) {
    const editor = $('#specRichEditor');
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    if (pendingGlobalRuleRange && editor.contains(pendingGlobalRuleRange.commonAncestorContainer)) selection.addRange(pendingGlobalRuleRange);
    else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }
    document.execCommand('insertHTML', false, `<a href="#prototype-rule-${escapeHtml(rule.id)}">【${escapeHtml(rule.code)} · ${escapeHtml(rule.name)}】</a>&nbsp;`);
    pendingGlobalRuleRange = null;
    editor.dispatchEvent(new Event('input', { bubbles:true }));
  }
  function captureRichEditorRange() {
    const selection = window.getSelection();
    return selection?.rangeCount && $('#specRichEditor').contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
  }
  function insertRichMarkup(markup, savedRange = null) {
    const editor = $('#specRichEditor');
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) selection.addRange(savedRange);
    else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }
    document.execCommand('insertHTML', false, markup);
    editor.dispatchEvent(new Event('input', { bubbles:true }));
  }
  function richTableContext() {
    const editor = $('#specRichEditor');
    if (activeRichTableCell?.isConnected && editor.contains(activeRichTableCell)) {
      return { cell:activeRichTableCell, row:activeRichTableCell.parentElement, table:activeRichTableCell.closest('table') };
    }
    const selection = window.getSelection();
    const node = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const cell = node?.closest?.('td,th');
    if (!cell || !editor.contains(cell)) return null;
    activeRichTableCell = cell;
    return { cell, row:cell.parentElement, table:cell.closest('table') };
  }
  function syncRichTableTools() {
    const context = richTableContext();
    const rowCount = context?.table?.rows?.length || 0;
    const columnCount = context?.row?.cells?.length || 0;
    $$('[data-rich-table-action]').forEach(button => {
      const action = button.dataset.richTableAction;
      button.disabled = !context || action === 'delete-row' && rowCount <= 1 || action === 'delete-column' && columnCount <= 1;
    });
    $('#richTableTools')?.classList.toggle('is-active', Boolean(context));
  }
  function focusRichTableCell(cell) {
    if (!cell?.isConnected) { activeRichTableCell = null; syncRichTableTools(); return; }
    activeRichTableCell = cell;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    $('#specRichEditor').focus();
    syncRichTableTools();
  }
  function applyRichTableAction(action) {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    const context = richTableContext();
    if (!context) return;
    const { cell, row, table } = context;
    const rowIndex = Array.from(table.rows).indexOf(row);
    const cellIndex = cell.cellIndex;
    let nextCell = cell;
    if (action === 'add-row') {
      const nextRow = document.createElement('tr');
      Array.from(row.cells).forEach(() => { const next = document.createElement('td'); next.innerHTML = '<br>'; nextRow.appendChild(next); });
      row.after(nextRow);
      nextCell = nextRow.cells[Math.min(cellIndex, nextRow.cells.length - 1)];
    } else if (action === 'delete-row' && table.rows.length > 1) {
      row.remove();
      const nextRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
      nextCell = nextRow?.cells[Math.min(cellIndex, nextRow.cells.length - 1)] || null;
    } else if (action === 'add-column') {
      Array.from(table.rows).forEach(currentRow => {
        const source = currentRow.cells[Math.min(cellIndex, currentRow.cells.length - 1)];
        const next = document.createElement(source?.tagName === 'TH' ? 'th' : 'td');
        next.innerHTML = '<br>';
        if (source) source.after(next); else currentRow.appendChild(next);
        if (currentRow === row) nextCell = next;
      });
    } else if (action === 'delete-column' && row.cells.length > 1) {
      Array.from(table.rows).forEach(currentRow => { if (currentRow.cells[cellIndex]) currentRow.deleteCell(cellIndex); });
      nextCell = row.cells[Math.min(cellIndex, row.cells.length - 1)] || table.rows[0]?.cells[0] || null;
    } else if (action === 'delete-table') {
      const fallback = table.nextElementSibling || table.previousElementSibling;
      table.remove();
      activeRichTableCell = null;
      const range = document.createRange();
      if (fallback?.isConnected) { range.selectNodeContents(fallback); range.collapse(false); }
      else { range.selectNodeContents($('#specRichEditor')); range.collapse(false); }
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else return;
    $('#specRichEditor').dispatchEvent(new Event('input', { bubbles:true }));
    if (nextCell?.isConnected && action !== 'delete-table') focusRichTableCell(nextCell);
    else syncRichTableTools();
  }
  function specEditorWidthBounds() {
    const sidebarWidth = window.innerWidth <= 760 ? 0 : document.body.classList.contains('sidebar-collapsed') ? 64 : 200;
    const max = Math.max(1, window.innerWidth - sidebarWidth);
    return { min:Math.min(specEditorDefaultWidth, max), max };
  }
  function applySpecEditorWidth(width = preferredSpecEditorWidth, persist = false) {
    const bounds = specEditorWidthBounds();
    const normalized = Number.isFinite(Number(width)) ? Number(width) : specEditorDefaultWidth;
    const applied = Math.round(Math.min(bounds.max, Math.max(bounds.min, normalized)));
    document.documentElement.style.setProperty('--spec-editor-width', `${applied}px`);
    const handle = $('#specEditorResizeHandle');
    if (handle) {
      handle.setAttribute('aria-valuemin', String(Math.round(bounds.min)));
      handle.setAttribute('aria-valuemax', String(Math.round(bounds.max)));
      handle.setAttribute('aria-valuenow', String(applied));
      handle.setAttribute('aria-valuetext', `抽屉宽度 ${applied} 像素`);
    }
    if (persist) {
      preferredSpecEditorWidth = applied;
      try { localStorage.setItem(specEditorWidthStorageKey, String(applied)); } catch {}
    }
    return applied;
  }
  function beginSpecEditorResize(event) {
    if (!document.body.classList.contains('spec-panel-open') || event.button !== 0) return;
    const width = $('#specEditor').getBoundingClientRect().width;
    specEditorResizeState = { startX:event.clientX, startWidth:width, currentWidth:width };
    document.body.classList.add('spec-editor-resizing');
    event.preventDefault();
  }
  function moveSpecEditorResize(event) {
    if (!specEditorResizeState) return;
    const nextWidth = specEditorResizeState.startWidth + specEditorResizeState.startX - event.clientX;
    specEditorResizeState.currentWidth = applySpecEditorWidth(nextWidth, false);
    event.preventDefault();
  }
  function endSpecEditorResize() {
    if (!specEditorResizeState) return;
    applySpecEditorWidth(specEditorResizeState.currentWidth, true);
    specEditorResizeState = null;
    document.body.classList.remove('spec-editor-resizing');
  }
  function syncSpecSidebarHorizontalScroll() {
    const workspace = $('.workspace');
    const offset = document.body.classList.contains('spec-panel-open') ? -(workspace?.scrollLeft || 0) : 0;
    document.documentElement.style.setProperty('--spec-sidebar-offset-x', `${offset}px`);
    syncBusinessDialogHorizontalScroll();
  }
  function setPrototypeMode(mode) {
    if (!['copy','spec','experience','compare'].includes(mode)) mode = 'experience';
    if (designMode && mode !== 'copy') {
      commitSelectedEditableValue();
      mirrorEditablePersistenceAliases();
      persistDesignState();
    }
    if (prototypeMode === 'spec' && mode !== 'spec' && specDirty) saveSpecs(true);
    prototypeMode = mode;
    designMode = mode === 'copy';
    const specOpen = mode === 'spec' || mode === 'compare';
    document.body.classList.toggle('design-editing', designMode);
    document.body.classList.toggle('spec-editing', mode === 'spec');
    document.body.classList.toggle('spec-comparing', mode === 'compare');
    document.body.classList.toggle('spec-panel-open', specOpen);
    document.body.classList.toggle('prototype-experience', mode === 'experience');
    $('#designEditor').hidden = !designMode;
    $('#specEditor').hidden = !specOpen;
    $$('[data-prototype-mode]').forEach(button => button.classList.toggle('active', button.dataset.prototypeMode === mode));
    $$('[data-governance-verb]').forEach(label => { label.textContent = mode === 'spec' ? '编辑' : '查看'; });
    if (designMode) $('#editorPageSelect').value = activeView;
    if (!designMode) {
      clearEditableSelection();
    } else {
      $$('input[data-edit-key],textarea[data-edit-key]').forEach(element => delete element.dataset.prototypeValueTouched);
    }
    refreshEditableElements();
    if (specOpen) {
      applySpecEditorWidth();
      requestAnimationFrame(syncSpecSidebarHorizontalScroll);
      $('#specPageSelect').value = activeView;
      $('#specModeEyebrow').textContent = mode === 'spec' ? 'PROTOTYPE SPEC' : 'TECH REVIEW';
      $('#specEditorTitle').textContent = mode === 'spec' ? '原型说明' : '技术查看';
      selectedSpecTarget?.classList.remove('spec-selected');
      selectedSpecTarget = null;
      specPanelView = 'list';
      refreshSpecTargets();
    } else {
      syncSpecSidebarHorizontalScroll();
      selectedSpecTarget?.classList.remove('spec-selected');
      selectedSpecTarget = null;
      $$('[data-spec-id]').forEach(element => element.classList.remove('spec-selected'));
    }
  }
  function toggleDesignMode(force) {
    setPrototypeMode(force === false ? 'experience' : designMode ? 'experience' : 'copy');
  }
  async function saveDesign() {
    commitSelectedEditableValue();
    mirrorEditablePersistenceAliases();
    const localSaved = persistDesignState();
    const sharedSaved = await persistSharedDesignStateNow();
    if (localSaved && sharedSaved) toast('页面文字已保存到当前浏览器');
    else if (localSaved) toast('页面文字已保存到当前浏览器');
    else toast('页面设计保存失败，请检查浏览器存储空间', 'warning');
  }
  function persistDesignState() {
    try {
      const previousRaw = localStorage.getItem('ai-material-page-design-v4') || localStorage.getItem('ai-material-page-design-v3');
      if (previousRaw) {
        const previousState = JSON.parse(previousRaw);
        const latestBackup = readDesignBackups().at(-1);
        const latestBackupTime = latestBackup ? (Date.parse(latestBackup.savedAt) || 0) : 0;
        if (JSON.stringify(previousState) !== JSON.stringify(designState) && Date.now() - latestBackupTime >= designBackupIntervalMs) {
          archiveDesignSnapshot(previousState, '保存前自动备份');
        }
      }
      localStorage.setItem('ai-material-page-design-v4', JSON.stringify(designState));
      designDirty = false;
      queueSharedDesignStatePersist();
    } catch {
      designDirty = true;
    }
    updateDesignSaveState();
    updateDesignBackupAvailability();
    return !designDirty;
  }
  function restoreLatestDesignBackup() {
    const latest = readDesignBackups().at(-1);
    if (!latest) { toast('没有可恢复的文字配置备份', 'warning'); return; }
    archiveDesignSnapshot(designState, '恢复前自动备份');
    restoreDefaultSelectStates();
    designState = normalizeDesignState(latest.state);
    try {
      localStorage.setItem('ai-material-page-design-v4', JSON.stringify(designState));
      designDirty = false;
    } catch { designDirty = true; }
    clearEditableSelection();
    applyDesignState();
    refreshEditableElements();
    updateDesignSaveState();
    updateDesignBackupAvailability();
    toast(designDirty ? '备份已载入，但保存失败，请检查浏览器存储空间' : '已还原最近的文字配置备份', designDirty ? 'warning' : 'success');
  }
  function exportDesignBackup() {
    const payload = { format:'ai-material-page-design-backup', version:1, exportedAt:new Date().toISOString(), designState, backups:readDesignBackups() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-material-page-design-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('文字配置备份已导出');
  }
  async function importDesignBackupFile(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const importedState = payload?.designState || payload?.state || (payload?.content || payload?.selects || payload?.styles ? payload : null);
      if (!importedState || typeof importedState !== 'object') throw new Error('文件中没有可识别的文字配置');
      archiveDesignSnapshot(designState, '导入前自动备份');
      if (Array.isArray(payload.backups)) {
        const merged = [...readDesignBackups(), ...payload.backups.filter(item => item?.state && typeof item.state === 'object')];
        const unique = [];
        merged.forEach(item => {
          const signature = JSON.stringify(item.state);
          if (!unique.some(existing => JSON.stringify(existing.state) === signature)) unique.push(item);
        });
        localStorage.setItem(designBackupStorageKey, JSON.stringify(unique.slice(-designBackupLimit)));
      }
      restoreDefaultSelectStates();
      designState = normalizeDesignState(importedState);
      localStorage.setItem('ai-material-page-design-v4', JSON.stringify(designState));
      designDirty = false;
      clearEditableSelection();
      applyDesignState();
      refreshEditableElements();
      updateDesignSaveState();
      updateDesignBackupAvailability();
      toast('文字配置已导入并应用');
    } catch (error) {
      toast(error?.message || '文字配置导入失败', 'warning');
    }
  }
  function resetDesign() {
    openDialog('恢复默认页面设计','将清除当前浏览器保存的文字、下拉选项、颜色、密度、圆角和模块显示调整。','<div class="permission-note" style="margin:0"><span>i</span><p>任务、素材、模板和额度数据不会受到影响。</p></div>','确认恢复',() => {
      archiveDesignSnapshot(designState, '恢复默认前自动备份');
      restoreDefaultSelectStates();
      designState = JSON.parse(JSON.stringify(defaultDesignState));
      localStorage.removeItem('ai-material-page-design-v4');
      localStorage.removeItem('ai-material-page-design-v3');
      localStorage.removeItem('ai-material-page-design-v2');
      localStorage.removeItem('ai-material-page-design-v1');
      editableRecords.forEach(record => { setRecordValue(record, record.defaultValue); record.element.style.fontSize = ''; record.element.style.textAlign = ''; });
      clearEditableSelection();
      designDirty = false;
      applyDesignState();
      refreshEditableElements();
      updateDesignSaveState();
      updateDesignBackupAvailability();
      closeDialog();
      toast('已恢复默认页面设计');
    });
  }

  function toDateKey(value) {
    const text = String(value || '').trim();
    if (!text || text === '尚未使用' || text === '—') return '';
    const full = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (full) return `${full[1]}-${String(full[2]).padStart(2,'0')}-${String(full[3]).padStart(2,'0')}`;
    const relative = new Date();
    if (text.startsWith('昨天')) relative.setDate(relative.getDate() - 1);
    if (text.startsWith('今天') || text.startsWith('昨天')) return `${relative.getFullYear()}-${String(relative.getMonth() + 1).padStart(2,'0')}-${String(relative.getDate()).padStart(2,'0')}`;
    const short = text.match(/^(\d{1,2})-(\d{1,2})/);
    if (!short) return '';
    let year = new Date().getFullYear();
    const candidate = `${year}-${String(short[1]).padStart(2,'0')}-${String(short[2]).padStart(2,'0')}`;
    const todayKey = toDateKey(new Date().toLocaleDateString('zh-CN'));
    if (candidate > todayKey) year -= 1;
    return `${year}-${String(short[1]).padStart(2,'0')}-${String(short[2]).padStart(2,'0')}`;
  }
  function hasActiveTimeFilter(scope) {
    const state = timeFilterState[scope] || {};
    return Boolean(state.start || state.end);
  }
  function matchesTimeFilter(value, scope) {
    const state = timeFilterState[scope] || {};
    if (!state.start && !state.end) return true;
    const dateKey = toDateKey(value);
    if (!dateKey) return false;
    return (!state.start || dateKey >= state.start) && (!state.end || dateKey <= state.end);
  }
  function timeRangeLabel(scope) {
    const state = timeFilterState[scope] || {};
    if (state.start && state.end) return `${state.start} 至 ${state.end}`;
    if (state.start) return `${state.start} 起`;
    if (state.end) return `截至 ${state.end}`;
    return '全部时间';
  }
  function syncTimeFilterInputs(scope) {
    const state = timeFilterState[scope] || { start:'', end:'' };
    $$(`[data-time-filter="${scope}"]`).forEach(container => {
      const start = $('[data-time-start]', container);
      const end = $('[data-time-end]', container);
      if (start) start.value = state.start || '';
      if (end) end.value = state.end || '';
      container.classList.remove('time-filter-invalid');
    });
  }
  function commitTimeFilter(scope, container) {
    const start = $('[data-time-start]', container)?.value || '';
    const end = $('[data-time-end]', container)?.value || '';
    container.classList.remove('time-filter-invalid');
    if (start && end && start > end) {
      container.classList.add('time-filter-invalid');
      toast('开始日期不能晚于结束日期', 'warning');
      return false;
    }
    timeFilterState[scope] = { start, end };
    syncTimeFilterInputs(scope);
    return true;
  }
  function clearTimeFilter(scope, container) {
    timeFilterState[scope] = { start:'', end:'' };
    syncTimeFilterInputs(scope);
    container?.classList.remove('time-filter-invalid');
  }
  function renderTimeFilterScope(scope) {
    if (scope === 'workbench') renderWorkbench();
    if (scope === 'tasks') renderTasks($('#taskSearch')?.value.trim() || '');
    if (scope === 'assets') renderAssets($('#assetSearch').value.trim());
    if (scope === 'templates') {
      if (activePrototypeTab === 'config') renderTemplates($('#templateSearch').value.trim());
      else renderPrototypeLibrary();
    }
    if (scope === 'usageDetails') renderTokenDetails();
  }

  function renderWorkbench() {
    const metricTasks = workbenchTasks.filter(task => matchesTimeFilter(task.updatedAt || task.updated, 'workbench'));
    const pendingDemands = visualDemands.filter(item => !['已完成','已取消'].includes(item.status));
    const metricPendingDemands = pendingDemands.filter(item => matchesTimeFilter(item.updatedAt || item.createdAt || item.requestDate, 'workbench'));
    const activity = workbenchActivity.filter(item => matchesTimeFilter(item.time, 'workbench'));
    const rangeStats = activity.reduce((result, item) => ({ completed:result.completed + item.completed, userQuota:result.userQuota + item.userQuota, orgQuota:result.orgQuota + item.orgQuota }), { completed:0, userQuota:0, orgQuota:0 });
    const metricPendingCount = metricTasks.length;
    const listCount = workbenchTasks.length;
    const activeRange = hasActiveTimeFilter('workbench');
    $('#workbenchPendingCount').textContent = metricPendingCount.toLocaleString('zh-CN');
    $('#workbenchPendingDemandCount').textContent = activeAiEdition === 'phase1' ? '—' : metricPendingDemands.length.toLocaleString('zh-CN');
    $('#workbenchUserQuota').textContent = formatCny(rangeStats.userQuota);
    $('#workbenchOrgQuota').textContent = formatCny(rangeStats.orgQuota);
    $('#workbenchPendingNote').textContent = activeRange ? `${timeRangeLabel('workbench')}内更新` : '点击下方任务可快速继续';
    const pendingDemandNote = $('#workbenchPendingDemandNote');
    if (pendingDemandNote) pendingDemandNote.textContent = activeAiEdition === 'phase1' ? '开发中，敬请期待' : activeRange ? `${timeRangeLabel('workbench')}内更新` : '待创建任务或制作中';
    const adminCard = $('[data-admin-only]');
    if (adminCard) adminCard.hidden = !currentUserContext.isOrgAdmin;
    const list = $('#workbenchTaskList');
    if (!list) return;
    list.innerHTML = listCount ? workbenchTasks.map(task => `<div class="workbench-task-item" data-editor-row-key="${escapeHtml(task.id)}">
      <div class="workbench-task-main"><div><b>${escapeHtml(task.name)}</b><small>${escapeHtml(task.id)} · 最近执行时间：${escapeHtml(task.updated)}</small></div></div>
      <div class="workbench-task-progress"><div><i style="width:${Math.max(0,Math.min(100,task.progress))}%"></i></div><small>${escapeHtml(task.step)}</small></div>
      <button class="button secondary workbench-resume" type="button" data-resume-task="${escapeHtml(task.id)}">继续执行</button>
    </div>`).join('') : '<div class="workbench-task-empty"><b>当前没有待完成任务</b><span>可以先新建视觉需求，再从需求创建任务。</span></div>';
    const demandList = $('#workbenchDemandList');
    if (!demandList) return;
    if (activeAiEdition === 'phase1') {
      demandList.innerHTML = '<div class="workbench-task-empty phase1-inline-unavailable"><b>视觉需求</b><span>开发中，敬请期待</span></div>';
      return;
    }
    demandList.innerHTML = pendingDemands.length ? pendingDemands.map(item => `<div class="workbench-demand-item" data-editor-row-key="${escapeHtml(item.id)}">
      <div class="workbench-demand-main"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.id)} · ${escapeHtml(item.spu || '未填写 SPU')}</small></div>
      <div class="workbench-demand-info"><span>${escapeHtml(demandOptionDisplayValue('priority',item.priority) || '—')}</span><small>DDL ${escapeHtml(item.ddl || '未设置')}</small></div>
      <button class="button secondary workbench-demand-view" type="button" data-workbench-demand="${escapeHtml(item.id)}">查看需求 <span>→</span></button>
    </div>`).join('') : '<div class="workbench-task-empty"><b>当前没有待完成需求</b><span>新建的视觉需求会显示在这里。</span></div>';
  }

  function resumeWorkbenchTask(taskId) {
    const task = workbenchTasks.find(item => item.id === taskId);
    if (!task) return;
    activeVisualDemandId = task.visualDemandId || null;
    activeDraftId = task.id;
    runState = null;
    activePreviewVersion = null;
    activePreviewKind = 'material';
    $('#taskName').disabled = false; $('#orgSelect').disabled = false; $('#requesterSelect').disabled = false; $('#businessLineSelect').disabled = false; $('#loadTemplate').disabled = false;
    showView('workspace');
    $('#taskName').value = task.name;
    $('#nameCount').textContent = task.name.length.toLocaleString('zh-CN');
    $('#orgSelect').value = task.org;
    $('#requesterSelect').value = task.requester;
    $('#businessLineSelect').value = task.businessLine;
    restoredDraftConfigs = Object.fromEntries(task.nodes.map(key => [key, { ...defaultConfigs[key], mediaType:key === 'clean' ? '图片' : task.type, ratio:task.type === '视频' ? '9:16' : defaultConfigs[key].ratio }]));
    $$('.node-card').forEach(card => {
      const selected = task.nodes.includes(card.dataset.node);
      card.classList.toggle('selected', selected);
      $('.node-check input', card).checked = selected;
    });
    updateWorkflow();
    if (task.status === 'draft') {
      setCreationStage(1);
      $('#saveState').textContent = '已恢复草稿';
      toast(`已打开“${task.name}”草稿`, 'info');
      return;
    }
    advanceToTask();
    if (!runState) return;
    runState.id = task.id;
    runState.current = Math.max(0, Math.min(task.current, runState.nodes.length - 1));
    const outputNodes = task.status === 'storage' ? runState.nodes : runState.nodes.slice(0, runState.current);
    outputNodes.forEach((nodeKey,index) => {
      const outputType = nodeKey === 'clean' ? '图片' : task.type;
      runState.outputs.push({ taskId:task.id, task:task.name, nodeKey, outputKind:'material', previewLabel:'综合视角', name:`${task.name}_${nodeMap[nodeKey].suffix}_v1.${outputType === '视频' ? 'mp4' : 'jpg'}`, assetId:`OUT-${task.id}-${index + 1}`, saved:false, retained:task.status === 'storage', temporary:true, attempt:1, time:nowText(), source:index ? '上一步节点产出' : '自行上传', type:outputType, ratio:outputType === '视频' ? '9:16' : '4:5', view:'', views:[] });
      runState.records.push(makeTokenRecord(`RUN-${task.id}-${index + 1}`,task.id,task.name,nodeKey,'品牌中心','zhangsan@demo',nodeMap[nodeKey].model,520 + index * 140,360 + index * 120,80,`${12 + index * 5}.4s`,'成功',nowText()));
    });
    updateNodeSummary();
    if (task.status === 'storage') {
      setCreationStage(3);
      toast(`已打开“${task.name}”的入库确认`, 'info');
    } else {
      setCreationStage(2);
      toast(`已恢复到“${nodeMap[runState.nodes[runState.current]].name}”节点`, 'info');
    }
  }

  function scrollBusinessCanvasTop() {
    if (document.body.classList.contains('spec-panel-open')) $('.workspace').scrollTo({ top:0, left:0, behavior:'smooth' });
    else window.scrollTo({ top:0, behavior:'smooth' });
  }

  function setTaskRecordTab(tab) {
    activeTaskRecordTab = 'usage';
    $$('[data-task-record-tab]').forEach(button => {
      const selected = button.dataset.taskRecordTab === activeTaskRecordTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    $$('[data-task-record-pane]').forEach(pane => { pane.hidden = pane.dataset.taskRecordPane !== activeTaskRecordTab; });
    $$('[data-task-tab-only]').forEach(element => { element.hidden = element.dataset.taskTabOnly !== activeTaskRecordTab; });
    renderTokenDetails();
  }

  function showView(name) {
    const requestedTaskTab = name === 'usage' ? 'usage' : name === 'tasks' ? 'records' : null;
    const targetView = name === 'usage' ? 'tasks' : name;
    activeView = viewNames[targetView] ? targetView : 'workspace';
    $$('.view').forEach(view => view.classList.toggle('active', view.dataset.page === activeView));
    $$('.sub-nav').forEach(button => button.classList.toggle('active', button.dataset.view === activeView && button.closest('[data-ai-edition]')?.dataset.aiEdition === activeAiEdition));
    const demandView = $('[data-page="demands"]');
    const demandUnavailable = activeAiEdition === 'phase1' && activeView === 'demands';
    demandView?.classList.toggle('phase1-feature-unavailable', demandUnavailable);
    if ($('#phase1DemandUnavailable')) $('#phase1DemandUnavailable').hidden = !demandUnavailable;
    $('#breadcrumb').textContent = viewNames[activeView];
    scrollBusinessCanvasTop();
    if (activeView === 'workbench') renderWorkbench();
    if (activeView === 'demands' && !demandUnavailable) renderVisualDemands();
    if (activeView === 'templates') {
      if (activePrototypeTab === 'config') renderTemplates($('#templateSearch').value.trim());
      else renderPrototypeLibrary();
    }
    if (activeView === 'tasks') setTaskRecordTab(requestedTaskTab || activeTaskRecordTab);
    if (activeView === 'assets') renderAssets($('#assetSearch').value.trim());
    if (activeView === 'workspace') updateVisualDemandSourceBanner();
    if (designMode) $('#editorPageSelect').value = activeView;
    refreshEditableElements();
    if (prototypeMode === 'spec' || prototypeMode === 'compare') {
      $('#specPageSelect').value = activeView;
      selectedSpecTarget?.classList.remove('spec-selected');
      selectedSpecTarget = null;
      specPanelView = 'list';
      refreshSpecTargets();
    }
  }
  function setAiEdition(edition) {
    activeAiEdition = edition === 'phase1' ? 'phase1' : 'full';
    const label = activeAiEdition === 'phase1' ? 'AI素材（一期）' : 'AI素材';
    document.body.classList.toggle('ai-edition-phase1', activeAiEdition === 'phase1');
    $('#breadcrumbModule').textContent = label;
    $('#activeAiTab').textContent = `✦ ${label}`;
    if ($('#configTemplateTabLabel')) $('#configTemplateTabLabel').textContent = activeAiEdition === 'phase1' ? '节点模板' : '任务/节点模板';
    if ($('#prototypeLibraryDescription')) $('#prototypeLibraryDescription').textContent = activeAiEdition === 'phase1'
      ? '按原型类型查看任务入库的模特等产出，并复用节点模板。'
      : '按原型类型查看任务入库的模特、场景等产出，并复用任务/节点模板。';
    const taskTemplateEntry = $('#loadTemplate');
    if (taskTemplateEntry) {
      const unavailable = activeAiEdition === 'phase1';
      taskTemplateEntry.disabled = unavailable;
      if (unavailable) taskTemplateEntry.title = 'AI素材（一期）暂不支持任务模板';
      else taskTemplateEntry.removeAttribute('title');
    }
    if (activeAiEdition === 'phase1') libraryMultiFilterState['template.kind']?.clear();
    $$('.nav-group[data-ai-edition]').forEach(group => $('.ai-nav-toggle', group)?.classList.toggle('active-parent', group.dataset.aiEdition === activeAiEdition));
    const createDemandButton = $('#createVisualDemand');
    if (createDemandButton) {
      const unavailable = activeAiEdition === 'phase1';
      createDemandButton.disabled = unavailable;
      createDemandButton.setAttribute('aria-disabled', String(unavailable));
      if (unavailable) createDemandButton.title = '开发中，敬请期待';
      else createDemandButton.removeAttribute('title');
    }
    const detailCard = $('.node-card[data-node="detail"]');
    if (detailCard) {
      detailCard.classList.toggle('phase1-node-disabled', activeAiEdition === 'phase1');
      const input = $('.node-check input', detailCard);
      const notice = $('.phase1-node-unavailable', detailCard);
      input.disabled = activeAiEdition === 'phase1';
      if (activeAiEdition === 'phase1') { input.checked = false; detailCard.classList.remove('selected'); }
      if (notice) notice.hidden = activeAiEdition !== 'phase1';
    }
    if (activeAiEdition === 'phase1' && activePrototypeTab === 'scene') activePrototypeTab = 'model';
    $$('.library-tabs [data-library-tab]').forEach(tab => {
      const active = tab.dataset.libraryTab === activePrototypeTab;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    if (activeView === 'templates') {
      const showingConfigTemplates = activePrototypeTab === 'config';
      $('#prototypeLibraryPanel').hidden = showingConfigTemplates;
      $('#configTemplatePanel').hidden = !showingConfigTemplates;
      if (showingConfigTemplates) renderTemplates($('#templateSearch').value.trim());
      else renderPrototypeLibrary();
    }
    updateWorkflow();
  }
  function setCreationStage(stage) {
    creationStage = stage;
    $('#nodeStage').hidden = stage !== 1; $('#nodeStage').classList.toggle('active', stage === 1);
    $('#taskStage').hidden = stage !== 2; $('#taskStage').classList.toggle('active', stage === 2);
    $('#assetStage').hidden = stage !== 3; $('#assetStage').classList.toggle('active', stage === 3);
    $$('[data-creation-step]').forEach(element => { const value = Number(element.dataset.creationStep); element.classList.toggle('active', value === stage); element.classList.toggle('done', value < stage); });
    updateExecutionSummaryActions();
    if (stage === 2) { renderNodeConfigs(); renderGenerationCache(); }
    if (stage === 3) renderAssetStage();
    scrollBusinessCanvasTop();
  }

  function syncOutputViewLabels(nodeKey) {
    if (nodeKey !== 'clean') return;
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    const updatedDefaults = { 正面:'正面3D', 侧面:'侧面45度' };
    $$('[data-field="views"]', card).forEach(input => {
      const label = $('span', input.closest('label'));
      const nextDefault = updatedDefaults[input.value];
      if (!label || !nextDefault) return;
      const key = stableRecordKey(label, 'text');
      const savedText = designState.content[key];
      const visibleText = savedText && savedText.trim() ? savedText : nextDefault;
      label.textContent = visibleText;
      label.dataset.editorDefaultText = nextDefault;
    });
  }

  function syncSceneModelOptionChips(card = $('.node-config-card[data-node="scene"]')) {
    if (!card) return;
    const select = $('.scene-model-option-source', card);
    const choices = $('.scene-model-options', card);
    if (!select || !choices) return;
    const options = [...select.options];
    const current = $$('.scene-model-choice', choices);
    const needsRender = current.length !== options.length || options.some((option,index) => {
      const input = current[index];
      const label = input?.nextElementSibling;
      return !input || input.value !== option.value || input.checked !== (select.value === option.value) || input.disabled !== option.disabled || label?.textContent !== option.textContent;
    });
    if (!needsRender) return;
    choices.innerHTML = options.map(option => '<label><input class="scene-model-choice" type="radio" name="scene-model-choice" value="' + escapeHtml(option.value) + '" ' + (select.value === option.value ? 'checked' : '') + (option.disabled ? ' disabled' : '') + '><span data-runtime-copy>' + escapeHtml(option.textContent) + '</span></label>').join('');
  }

  function isSceneConfigGroupOptional(card, groupKey) {
    if (!card) return false;
    const category = groupKey === 'model' ? 'referenceModel' : groupKey === 'setting' ? 'referenceScene' : '';
    if (!category) return false;
    const group = $('.classified-upload[data-upload-category="' + category + '"]', card);
    const item = $('.uploaded-material-item', group);
    return item?.dataset.assetSource === (groupKey === 'model' ? 'model-prototype' : 'scene-template');
  }

  function sceneConfigGroupMeta(groupKey) {
    return groupKey === 'model'
      ? { category:'referenceModel', librarySource:'model-prototype', libraryLabel:'原型库 · 模特原型', emptyLabel:'未提供参考模特' }
      : { category:'referenceScene', librarySource:'scene-template', libraryLabel:'原型库 · 场景模板', emptyLabel:'未提供参考场景' };
  }

  function readSceneLibraryConfig(item) {
    if (!item?.dataset.libraryConfig) return {};
    try { return JSON.parse(item.dataset.libraryConfig); } catch { return {}; }
  }

  function applySceneLibraryConfig(section, config) {
    if (!section || !config) return;
    $$('select[data-field]', section).forEach(control => {
      const value = config[control.dataset.field];
      if (value != null && [...control.options].some(option => option.value === String(value))) control.value = String(value);
    });
  }

  function captureSceneSectionConfig(section) {
    return Object.fromEntries($$('select[data-field]', section).map(control => [control.dataset.field, control.value]));
  }

  function updateSceneOverrideMarkers(section) {
    if (!section) return;
    let original = {};
    try { original = JSON.parse(section.dataset.libraryConfig || '{}'); } catch {}
    const active = section.dataset.sourceMode === 'library' && section.dataset.customize === 'true';
    $$('[data-config-group][data-validation-field]', section).forEach(field => {
      const control = $('select[data-field]', field);
      const changed = Boolean(active && control && original[control.dataset.field] != null && String(original[control.dataset.field]) !== control.value);
      field.classList.toggle('is-overridden', changed);
    });
  }

  function syncSceneConfigRequirements(card = $('.node-config-card[data-node="scene"]'), changedGroup = '', resetManualValues = false) {
    if (!card) return;
    ['model','setting'].forEach(groupKey => {
      const meta = sceneConfigGroupMeta(groupKey);
      const uploadGroup = $('.classified-upload[data-upload-category="' + meta.category + '"]', card);
      const item = $('.uploaded-material-item', uploadGroup);
      const section = $('.scene-config-group-' + groupKey, card);
      if (!section) return;
      const fromLibrary = item?.dataset.assetSource === meta.librarySource;
      const fromUpload = item?.dataset.assetSource === 'upload';
      const libraryConfig = fromLibrary ? readSceneLibraryConfig(item) : {};
      if (changedGroup === groupKey) {
        if (fromLibrary) {
          section.dataset.customize = 'false';
          section.dataset.libraryConfig = JSON.stringify(libraryConfig);
          delete section.dataset.overrideConfig;
          applySceneLibraryConfig(section, libraryConfig);
        } else if (resetManualValues) {
          $$('select[data-field]', section).forEach(control => {
            if ([...control.options].some(option => option.value === '__not_configured')) control.value = '__not_configured';
          });
          delete section.dataset.libraryConfig;
          delete section.dataset.overrideConfig;
        }
      }
      if (!fromLibrary) section.dataset.customize = 'true';
      const customize = section.dataset.customize === 'true';
      section.dataset.sourceMode = fromLibrary ? 'library' : fromUpload ? 'upload' : 'manual';
      section.dataset.libraryId = fromLibrary ? item.dataset.assetId || '' : '';
      const source = $('.scene-config-source', section);
      const state = $('.scene-config-required-state', section);
      const toggleWrap = $('.scene-config-toggle-wrap', section);
      const toggle = $('.scene-config-toggle', section);
      const restore = $('.scene-restore-library', section);
      const note = $('.scene-config-source-note', section);
      if (source) source.textContent = fromLibrary ? `来源：${meta.libraryLabel} · ${item.dataset.assetName || $('.uploaded-file-name', item)?.textContent.trim() || ''}` : fromUpload ? '来源：用户自行上传' : meta.emptyLabel;
      if (state) state.textContent = fromLibrary ? (customize ? '正在调整当前任务配置' : '使用库配置') : '需要完善配置';
      if (note) note.textContent = fromLibrary ? (customize ? '当前调整仅对本次任务生效，不会修改原型库。' : '当前回显所选库配置；开启“调整配置”后才可修改。') : '';
      if (toggleWrap) toggleWrap.hidden = !fromLibrary;
      if (toggle) { toggle.checked = customize; toggle.disabled = !fromLibrary; }
      if (restore) restore.hidden = !(fromLibrary && customize);
      section.classList.toggle('is-library-readonly', fromLibrary && !customize);
      section.classList.toggle('is-library-customizing', fromLibrary && customize);
      section.classList.toggle('is-manual-required', !fromLibrary);
      $$('[data-config-group="' + groupKey + '"]', card).forEach(field => {
        const control = $('select[data-field]', field);
        const mark = $('.required-mark', field);
        if (mark) mark.hidden = fromLibrary;
        if (control) {
          const placeholder = [...control.options].find(option => option.value === '__not_configured');
          if (placeholder) { placeholder.disabled = fromLibrary; placeholder.hidden = fromLibrary; }
          control.disabled = Boolean(fromLibrary && !customize);
          control.required = !fromLibrary;
          control.setAttribute('aria-required', String(!fromLibrary));
          if (!fromLibrary && isMissingConfigValue(control.value)) clearConfigValidationArea(field);
        }
        if (fromLibrary) clearConfigValidationArea(field);
      });
      updateSceneOverrideMarkers(section);
    });
  }

  function configFields(key, config = {}) {
    const supplementaryPriorityNote = '<small class="supplementary-priority-note">若补充描述内容与上述配置内容冲突，则优先使用上述配置</small>';
    const requiredSelect = (label, field, options, extraClass = '') => {
      const optionVersion = key === 'detail' && VERSIONED_DETAIL_OPTION_FIELDS.has(field) ? ` data-editor-options-version="${DETAIL_OPTION_SET_VERSION}-${field}"` : '';
      return `<label class="field config-validation-area ${extraClass}" data-validation-field="${field}" data-validation-label="${label}"><span class="field-label">${label} <em class="required-mark">*</em></span><select ${field === 'model' ? 'class="node-model"' : field === 'ratio' ? 'class="node-output-ratio"' : ''} data-field="${field}"${optionVersion} required aria-required="true">${options.map(option => `<option>${option}</option>`).join('')}</select></label>`;
    };
    const outputFields = requiredSelect('输出比例', 'ratio', ['1:1','4:5','9:16','16:9']);
    const currentMediaType = normalizeNodeMediaType(key, config.mediaType);
    const currentModel = normalizeProcessingModel(currentMediaType, config.model);
    const modelField = `<label class="field config-validation-area" data-validation-field="model" data-validation-label="AI处理模型"><span class="field-label">AI处理模型 <em class="required-mark">*</em></span><select class="node-model" data-field="model" required aria-required="true">${processingModelsFor(currentMediaType).map(model => `<option value="${escapeHtml(model)}"${model === currentModel ? ' selected' : ''}>${escapeHtml(model)}</option>`).join('')}</select></label>`;
    const currentOutputFormat = IMAGE_OUTPUT_FORMATS.includes(String(config.outputFormat || '').toLowerCase()) ? String(config.outputFormat).toLowerCase() : defaultConfigs[key].outputFormat;
    const outputTypeField = `<fieldset class="field output-type-field config-validation-area" data-validation-field="mediaType" data-validation-label="输出类型"><legend class="field-label">输出类型 <em class="required-mark">*</em></legend><div class="output-type-options${key === 'clean' ? ' single-option' : ''}"><label><input class="node-media-type" data-field="mediaType" type="radio" name="media-type-${key}" value="图片" ${currentMediaType === '图片' ? 'checked' : ''} required aria-required="true"><span><i>▧</i>图片</span></label>${key === 'clean' ? '' : `<label><input class="node-media-type" data-field="mediaType" type="radio" name="media-type-${key}" value="视频" ${currentMediaType === '视频' ? 'checked' : ''} required aria-required="true"><span><i>▶</i>视频</span></label>`}</div></fieldset>`;
    const imageOutputFormatField = `<label class="field conditional-output-field config-validation-area" data-output-type="image" data-validation-field="outputFormat" data-validation-label="输出格式"><span class="field-label">输出格式 <em class="required-mark">*</em></span><select data-field="outputFormat" required aria-required="true">${IMAGE_OUTPUT_FORMATS.map(format => `<option value="${format}" ${currentOutputFormat === format ? 'selected' : ''}>${format}</option>`).join('')}</select></label>`;
    const videoOutputDurationField = `<div class="field conditional-output-field output-duration-field config-validation-area" data-output-type="video" data-validation-field="outputDuration" data-validation-label="输出时长"><span class="field-label">输出时长 <em class="required-mark">*</em></span><div class="output-duration-control"><input data-field="outputDuration" type="number" min="0.1" step="0.1" inputmode="decimal" value="${escapeHtml(config.outputDuration || defaultConfigs[key].outputDuration)}" required aria-required="true" aria-label="输出时长"><select data-field="durationUnit" aria-label="输出时长单位"><option value="秒" ${(config.durationUnit || defaultConfigs[key].durationUnit) === '秒' ? 'selected' : ''}>秒</option><option value="分钟" ${config.durationUnit === '分钟' ? 'selected' : ''}>分钟</option></select></div></div>`;
    const conditionalOutputFields = imageOutputFormatField + (key === 'clean' ? '' : videoOutputDurationField);
    const imageGenerateCountField = `<label class="field image-generate-count-field config-validation-area" data-output-type="image" data-validation-field="generateCount" data-validation-label="生成张数"><span class="field-label">生成张数 <em class="required-mark">*</em></span><input data-field="generateCount" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(config.generateCount || '1')}" required aria-required="true"></label>`;
    const sceneSelect = (label, field, options, extraClass = '', configGroup = '') => {
      const conditional = configGroup === 'model' || configGroup === 'setting';
      let optionVersion = '';
      if (configGroup === 'model' && VERSIONED_MODEL_OPTION_FIELDS.has(field)) optionVersion = MODEL_OPTION_SET_VERSION;
      else if (configGroup === 'base' && field === 'ratio') optionVersion = getSceneRatioOptionVersion(config.mediaType);
      else if (VERSIONED_SCENE_OPTION_FIELDS.has(field)) optionVersion = SCENE_OPTION_SET_VERSION;
      const optionVersionAttr = optionVersion ? ' data-editor-options-version="' + optionVersion + '"' : '';
      const normalizedOptions = options.map(option => typeof option === 'string' ? ({ value:option, label:option }) : option);
      const choices = conditional ? [{ value:'__not_configured', label:'请选择' }, ...normalizedOptions] : normalizedOptions;
      const value = String(config[field] ?? (conditional ? '__not_configured' : choices[0]?.value ?? ''));
      const validated = Boolean(configGroup);
      const required = validated && !conditional;
      const fieldClass = 'field scene-config-field ' + extraClass + (validated ? ' config-validation-area' : '');
      const fieldAttrs = validated ? ' data-config-group="' + configGroup + '" data-validation-field="' + field + '" data-validation-label="' + escapeHtml(label) + '"' : '';
      const requiredAttr = required ? ' required aria-required="true"' : '';
      const mark = required || conditional ? ' <em class="required-mark">*</em>' : '';
      const optionMarkup = choices.map(option => '<option value="' + escapeHtml(option.value) + '"' + (value === option.value ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>').join('');
      return '<label class="' + fieldClass + '"' + fieldAttrs + '><span class="field-label">' + label + '</span>' + mark + '<select class="' + (field === 'model' ? 'node-model' : field === 'ratio' ? 'node-output-ratio' : '') + '" data-field="' + field + '"' + optionVersionAttr + (validated ? ' aria-label="' + escapeHtml(label) + '"' : '') + requiredAttr + '>' + optionMarkup + '</select></label>';
    };
    const sceneTextarea = (label, field, value, extraClass = '') => '<label class="field scene-config-field ' + extraClass + '"><span class="field-label">' + label + '</span>' + (field === 'requirements' ? supplementaryPriorityNote : '') + '<textarea data-field="' + field + '">' + escapeHtml(value || '') + '</textarea></label>';
    const sceneGroup = (name, groupKey, fields, columns) => {
      const configurable = groupKey === 'model' || groupKey === 'setting';
      const controls = configurable ? '<div class="scene-config-group-actions"><button class="button secondary scene-restore-library" type="button" data-runtime-copy hidden>恢复库配置</button><label class="scene-config-toggle-wrap" hidden><span data-runtime-copy>调整配置</span><input class="scene-config-toggle" type="checkbox" aria-label="调整' + name + '配置"><i aria-hidden="true"></i></label><em class="scene-config-required-state" data-runtime-copy>需要完善配置</em></div>' : '';
      const source = configurable ? '<small class="scene-config-source" data-runtime-copy>' + (groupKey === 'model' ? '未提供参考模特' : '未提供参考场景') + '</small>' : '';
      return '<section class="scene-config-group scene-config-group-' + groupKey + ' span-2"' + (configurable ? ' data-config-module="' + groupKey + '" data-customize="true" data-source-mode="manual"' : '') + '><h5 class="scene-config-group-head"><span><b>' + name + '</b>' + source + '</span>' + controls + '</h5><div class="scene-config-fields scene-config-columns-' + columns + '">' + fields + '</div>' + (configurable ? '<p class="scene-config-source-note" data-runtime-copy>配置仅用于当前任务，不会修改原型库。</p>' : '') + '</section>';
    };
    const sceneAudioField = (label, field) => {
      const audio = config[field];
      const name = typeof audio === 'string' ? audio : audio?.name || '';
      const source = typeof audio === 'object' && audio ? audio.source || '' : '';
      return '<div class="field scene-audio-field"><span class="field-label">' + label + '</span><div class="scene-audio-control" data-audio-field="' + field + '" data-audio-name="' + escapeHtml(name) + '" data-audio-source="' + escapeHtml(source) + '"><span class="scene-audio-name" data-runtime-copy>' + (name ? escapeHtml(name) : '未选择音频') + '</span><div class="scene-audio-actions"><button class="button secondary" type="button" data-audio-upload>上传</button><button class="button secondary" type="button" data-audio-library>从音频库选择</button><button class="button danger-text" type="button" data-audio-remove ' + (name ? '' : 'hidden') + '>移除</button><input class="scene-audio-input" type="file" accept="audio/*" hidden></div></div></div>';
    };
    if (key === 'scene') {
      const baseFields = outputTypeField + conditionalOutputFields + imageGenerateCountField + sceneSelect('输出比例', 'ratio', getSceneRatioOptions(currentMediaType), '', 'base') + sceneSelect('画质要求', 'quality', ['自动适配','标准清晰','高清（1080P）','超清（2K）','超清（4K）','细节增强（2K）','细节增强（4K）','电商高清（1080P）','商业超清（2K）','商业超清（4K）'], '', 'base') + modelField;
      const modelFields = sceneSelect('性别', 'gender', ['不限','女','男'], '', 'model') + sceneSelect('年龄段', 'ageRange', ['全部','18–24岁','25–34岁','35–44岁','45–54岁','55岁以上'], '', 'model') + sceneSelect('地区', 'region', ['全部','东亚','东南亚','南亚','中东','北美','拉美','西欧','东欧','北欧','非洲','大洋洲'], '', 'model') + sceneSelect('身高', 'height', ['全部','165-170cm','171-175cm','176-180cm','181-185cm','186cm以上'], '', 'model') + sceneSelect('体型', 'bodyType', ['全部','偏瘦','标准','匀称','健壮','肌肉型','微胖','大码'], '', 'model') + sceneSelect('皮肤肤色', 'skinTone', ['全部','很白','白皙','自然肤色','小麦色','健康深肤色','深肤色','黑色'], '', 'model') + sceneSelect('头发颜色', 'hairColor', ['全部','黑色','深棕色','棕色','浅棕色','金色','灰白色','红棕色'], '', 'model') + sceneSelect('风格', 'style', ['全部','清新自然','阳光运动','商务精英','时尚简约','优雅知性','轻奢高级','休闲日常','街头潮流','旅行度假','成熟稳重','学院风'], '', 'model');
      const sceneFields = sceneSelect('景别构图', 'shotComposition', ['全部','全景（全身带环境）','中景（半身穿搭）','近景（胸部以上）','远景（宏大环境氛围）','特写（局部材质纹理）','低角度（仰视权威感）','上帝视角（俯视平铺）'], '', 'setting') + sceneSelect('色调风格', 'toneStyle', ['全部','暖阳金调-温暖治愈','冷调科技-专业洁净','中性影棚-真实还原','黑白艺术-经典格调','莫兰迪色-低饱和度灰','赛博霓虹-潮流夜景','复古胶片-怀旧质感','暗调奢华-尊贵质感','清新马卡龙-活泼年轻'], '', 'setting') + sceneSelect('艺术氛围', 'artAtmosphere', ['全部','自然生活-真实松弛感','时尚大片-先锋杂志感','电影叙事-情绪故事感','极简纯粹-留白高级感','职场精英-自信干练','超现实梦境-艺术想象力','运动活力-动态张力','商旅休闲-轻松精致','都市度假-轻奢松弛','街头潮流-酷感街拍'], '', 'setting');
      const videoFields = '<div class="scene-video-fields" data-output-type="video">' + sceneTextarea('广告文案', 'adCopy', config.adCopy, 'span-2') + sceneSelect('文案语言', 'copyLanguage', ['英语','简体中文','繁体中文','日语','韩语','西班牙语','法语']) + sceneSelect('文案位置', 'copyPosition', ['画面上方','画面下方','画面左侧','画面右侧','跟随主体避让']) + sceneAudioField('口播音频', 'voiceoverAudio') + sceneAudioField('背景音频', 'backgroundAudio') + '</div>';
      const otherFields = videoFields + sceneTextarea('补充描述', 'requirements', config.requirements, 'span-2');
      return sceneGroup('基础', 'base', baseFields, 3) + sceneGroup('模特', 'model', modelFields, 4) + sceneGroup('场景', 'setting', sceneFields, 3) + sceneGroup('其他', 'other', otherFields, 2);
    }
    if (key === 'clean') return `<div class="clean-output-row span-2">${outputTypeField}${conditionalOutputFields}${modelField}</div><div class="clean-processing-row span-2"><fieldset class="field view-field config-validation-area" data-validation-field="views" data-validation-label="输出视角"><legend class="field-label">输出视角 <em class="required-mark">*</em></legend><div class="view-options"><label><input type="checkbox" data-field="views" value="正面" checked><span>正面3D</span></label><label><input type="checkbox" data-field="views" value="侧面"><span>侧面45度</span></label><label><input type="checkbox" data-field="views" value="背面"><span>背面</span></label><label><input type="checkbox" data-field="views" value="面料细节"><span>面料细节</span></label></div><small class="view-rule">勾选几个视角即生成几张图片。</small></fieldset>${requiredSelect('输出规格','ratio',['1:1','4:5','9:16','16:9'])}${requiredSelect('画质要求','quality',['高清 1080P','超清 2K','超清 4K'])}${requiredSelect('数字美化','beautify',['不美化','轻度美化','标准美化','精细美化'])}</div><label class="field span-2 supplementary-description-field"><span class="field-label">补充描述</span>${supplementaryPriorityNote}<textarea data-field="requirements">${escapeHtml(config.requirements || defaultConfigs.clean.requirements)}</textarea></label>`;
    if (key === 'detail') {
      const detailSelect = (label, field, options) => {
        const optionValues = options.flatMap(option => typeof option === 'object' && Array.isArray(option.options) ? option.options : [option]);
        const currentValue = String(config[field] ?? optionValues[0] ?? '');
        const optionMarkup = options.map(option => {
          if (typeof option === 'object' && Array.isArray(option.options)) {
            return `<optgroup label="${escapeHtml(option.label)}">${option.options.map(value => `<option value="${escapeHtml(value)}" ${currentValue === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</optgroup>`;
          }
          return `<option value="${escapeHtml(option)}" ${currentValue === option ? 'selected' : ''}>${escapeHtml(option)}</option>`;
        }).join('');
        const optionVersion = VERSIONED_DETAIL_OPTION_FIELDS.has(field) ? ` data-editor-options-version="${DETAIL_OPTION_SET_VERSION}-${field}"` : '';
        return `<label class="field"><span class="field-label">${label}</span><select data-field="${field}"${optionVersion}>${optionMarkup}</select></label>`;
      };
      const lifestyleOptions = [
        '全景/无交互（默认）',
        { label:'上身交互特写', options:['衣领细节与手部整理动作','衣下摆细节与手部姿势','手触感质特写'] },
        { label:'下身交互特写', options:['腰部细节与插兜姿势','口袋细节与入袋手势','裤脚/裙摆缝线细节'] },
        { label:'配饰交互特写', options:['手指和配饰交互特写','手拿/手拎包袋交互','手拿/手握运动器材交互'] }
      ];
      return `<div class="detail-output-main-row">${outputTypeField}${conditionalOutputFields}${imageGenerateCountField}</div><div class="detail-output-spec-row">${requiredSelect('输出比例','ratio',['3:4','9:16','16:9','1:1','4:3'])}${requiredSelect('画质要求','quality',['自动适配','标准清晰','高清（1080P）','超清（2K）','超清（4K）','细节增强（2K）','细节增强（4K）','电商高清（1080P）','商业超清（2K）','商业超清（4K）'])}${modelField}</div>${detailSelect('面料与材质特写','materialCloseup',['无特写','极近纤维特写-展示微细纹理','光泽垂坠特写-展示面料高级感','工艺特写-展示匠心细节','走进缝线特写-展现做工品质','自然光感材质-展示真实触感'])}${detailSelect('生活化场景交互','lifestyleInteraction',lifestyleOptions)}${detailSelect('平铺细节特写','flatLayCloseup',['无特写','全件平铺','领口结构（上衣/连衣裙）','袖口细节（长短袖通用）','下摆线条（全品类适用）','腰头门襟（下装专用）','口袋/后幅结构（工装/牛仔）','五金辅料（拉链/扣子）','品牌标签/洗唛（工艺细节）'])}${detailSelect('专业光影控制','lightingControl',['自然柔光-真实舒适','窗边侧光-沉稳质感','低对比布光-高级简约','商务棚拍光-清晰专业','黄昏暖光-成熟松弛','硬朗侧光-男性力量感','均匀平光-电商展示感','轮廓背光-立体高级'])}${detailSelect('人物情绪表达','emotionExpression',['保持原样','自然微笑-亲和可信','沉稳平静-成熟魅力','自信从容-精英气质','轻松松弛-生活质感','干练利落-商务表达','专注坚定-力量感','温和内敛-低调高级','阳光自然-轻熟活力','冷静克制-高级时尚','目光交流-品牌沟通感'])}<label class="field span-2 supplementary-description-field"><span class="field-label">补充描述</span>${supplementaryPriorityNote}<textarea data-field="requirements">${escapeHtml(config.requirements || defaultConfigs.detail.requirements)}</textarea></label>`;
    }
    return '';
  }
  function sceneUploadMarkup({ previousNodeName = '', previousOutputs = [], hasPreviousNode = false } = {}) {
    const categories = [
      ['mainProduct','主产品','image/*',true],
      ['referenceModel','参考模特','image/*,video/*',false],
      ['referenceScene','参考场景','image/*,video/*',false],
      ['styling','搭配','image/*',false]
    ];
    return '<div class="classified-upload-grid scene-upload-grid">' + categories.map(([value,label,accept,required]) => {
      const libraryLabel = value === 'referenceModel' ? '从模特原型选择' : value === 'referenceScene' ? '从场景模板选择' : '从素材库选择';
      const previousButton = value === 'mainProduct' && hasPreviousNode
        ? '<button class="button secondary select-previous-output" type="button">从上一节点选择</button>'
        : '';
      const phase1UnavailableClass = value === 'referenceScene' ? ' phase1-scene-template-entry' : '';
      return '<section class="classified-upload scene-classified-upload" data-upload-category="' + value + '" data-max="1"><div class="classified-upload-head"><div class="classified-upload-title"><b>' + label + (required ? ' <em class="required-mark">*</em>' : '') + '</b><small class="upload-count" aria-live="polite">0/1个文件</small></div><div class="classified-upload-actions"><button class="button secondary select-classified-file" type="button">上传</button>' + previousButton + '<button class="button secondary select-category-asset' + phase1UnavailableClass + '" type="button">' + libraryLabel + '</button><input class="classified-file-input" type="file" accept="' + accept + '" data-max="1" data-accept-types="' + accept + '" hidden></div></div><div class="classified-file-list"></div></section>';
    }).join('') + '</div>';
  }
  function detailUploadMarkup({ hasPreviousNode = false } = {}) {
    const categories = [
      ['detailTarget','需精修（图片或视频）','从素材库选择',true],
      ['referenceModel','参考模特','从模特原型选择',false],
      ['referenceScene','参考场景','从场景模板选择',false]
    ];
    return '<div class="classified-upload-grid detail-upload-grid">' + categories.map(([value,label,libraryLabel,required]) => {
      const previousButton = value === 'detailTarget' && hasPreviousNode
        ? '<button class="button secondary select-previous-output" type="button">从上一节点选择</button>'
        : '';
      const phase1UnavailableClass = value === 'referenceScene' ? ' phase1-scene-template-entry' : '';
      return '<section class="classified-upload detail-classified-upload" data-upload-category="' + value + '" data-max="1"><div class="classified-upload-head"><div class="classified-upload-title"><b>' + label + (required ? ' <em class="required-mark">*</em>' : '') + '</b><small class="upload-count" aria-live="polite">0/1个文件</small></div><div class="classified-upload-actions"><button class="button secondary select-classified-file" type="button">上传</button>' + previousButton + '<button class="button secondary select-category-asset' + phase1UnavailableClass + '" type="button">' + libraryLabel + '</button><input class="classified-file-input" type="file" accept="image/*,video/*" data-max="1" data-accept-types="image/*,video/*" hidden></div></div><div class="classified-file-list"></div></section>';
    }).join('') + '</div>';
  }
  function classifiedUploadMarkup(mediaType, nodeKey = 'clean', options = {}) {
    if (nodeKey === 'scene') return sceneUploadMarkup(options);
    if (nodeKey === 'detail') return detailUploadMarkup(options);
    const isVideo = mediaType === '视频';
    const accept = isVideo ? 'video/*' : 'image/*';
    const unit = isVideo ? '个文件' : '张';
    const categories = [
      ['front','正面',1,true],
      ['side','侧面',1,false],
      ['back','背面',1,false],
      ['fabric','面料细节图',1,false],
      ['other','其他',4,false]
    ];
    return `<div class="classified-upload-grid">${categories.map(([value,label,max,demo]) => {
      const demoName = isVideo ? '夏季新品_正面展示.mp4' : '防晒衣_模特正面.jpg';
      const count = demo ? 1 : 0;
      return `<section class="classified-upload ${count >= max ? 'is-full' : ''}" data-upload-category="${value}" data-max="${max}"><div class="classified-upload-head"><div class="classified-upload-title"><b>${label}</b><small class="upload-count" aria-live="polite">${count}/${max}${unit}</small></div><div class="classified-upload-actions"><button class="button secondary select-classified-file" type="button" ${count >= max ? 'disabled' : ''}>上传</button><button class="button secondary select-category-asset" type="button" ${count >= max ? 'disabled' : ''}>从素材库选择</button><input class="classified-file-input" type="file" accept="${accept}" data-max="${max}" ${max > 1 ? 'multiple' : ''} hidden></div></div><div class="classified-file-list">${demo ? `<div class="uploaded-material-item demo"><div class="upload-thumb-wrap"><div class="upload-thumb media-preview-trigger ${isVideo ? 'video' : ''}" data-media-preview data-preview-type="${isVideo ? 'video' : 'image'}" data-preview-name="${demoName}" data-preview-source="上传" role="button" tabindex="0" aria-label="放大预览：${demoName}"><span>${isVideo ? '▶' : 'IMG'}</span></div><button class="remove-uploaded-material" type="button" title="删除" aria-label="删除${demoName}">×</button></div><div class="uploaded-material-info"><small>上传</small><b class="uploaded-file-name">${demoName}</b></div></div>` : ''}</div></section>`;
    }).join('')}</div>`;
  }
  function updateUploadGroupState(group) {
    if (!group) return;
    const max = Number(group.dataset.max || 1);
    const count = $$('.uploaded-material-item', group).length;
    const input = $('.classified-file-input', group);
    const unit = input?.accept?.includes('video/') ? '个文件' : '张';
    const hint = $('.upload-count', group);
    const isFull = count >= max;
    if (hint) hint.textContent = `${count}/${max}${unit}`;
    group.classList.toggle('is-full', isFull);
    $$('.select-classified-file,.select-category-asset,.select-previous-output', group).forEach(button => {
      button.disabled = isFull;
      button.title = isFull ? `已达到最大上传数 ${max}${unit}` : '';
    });
  }
  function refreshUploadEmptyState(group) {
    if (!group) return;
    const list = $('.classified-file-list', group);
    if (!list) return;
    $('.classified-empty', list)?.remove();
    updateUploadGroupState(group);
  }
  function renderNodeConfigs() {
    const nodes = runState?.nodes || selectedNodes();
    const index = runState?.current || 0;
    const key = nodes[index];
    if (!key) { $('#nodeConfigList').innerHTML = ''; return; }
    const previousName = index > 0 ? nodeMap[nodes[index - 1]].name : '';
    const previousOutputs = index > 0 ? (runState?.outputs || []).filter(item => item.nodeKey === nodes[index - 1]) : [];
    const hasPreviousImageOutputs = previousOutputs.some(item => (item.outputKind || 'material') === 'material' && item.type === '图片');
    const rawConfig = runState?.configs?.[key] || restoredDraftConfigs?.[key] || defaultConfigs[key];
    const config = key === 'detail' ? normalizeDetailConfig(rawConfig) : { ...rawConfig, mediaType:normalizeNodeMediaType(key, rawConfig?.mediaType) };
    const initialMediaType = normalizeNodeMediaType(key, config.mediaType);
    const uploadMediaType = key === 'clean' ? '图片' : initialMediaType;
    const uploadDescription = key === 'clean'
      ? '商品重塑仅支持图片；可在每个分类中上传或从素材库选择'
      : key === 'scene'
        ? `主产品必须上传${hasPreviousImageOutputs ? '；可从上一节点选择任意版本的生成图片' : ''}；四类素材各限1个文件，参考模特和参考场景支持图片/视频`
        : `“需精修”必须提供，支持图片或视频${index ? '；可从上一节点选择任意版本的生成图片' : ''}；参考模特、参考场景可选，均支持图片或视频`;
    const modelSummaryMarkup = `<span class="node-model-description"><b>AI处理模型</b><i id="nodeModelSummary">${escapeHtml(normalizeProcessingModel(initialMediaType, config.model))}</i></span>`;
    $('#nodeConfigList').innerHTML = `<section class="node-config-card" data-node="${key}" data-index="${index}">
      <div class="node-step-content">
        <div class="node-section node-input-section"><div class="node-section-title"><div><h4>上传素材 <em>*</em>${key === 'clean' ? '<small class="upload-section-note">平铺图/人台图</small>' : ''}</h4><p>${uploadDescription}</p></div></div>
          ${classifiedUploadMarkup(uploadMediaType, key, { previousNodeName: previousName, previousOutputs, hasPreviousNode: key === 'scene' ? hasPreviousImageOutputs : index > 0 && key === 'detail' })}
        </div>
        <div class="node-section node-requirement-section"><div class="node-section-title"><div><h4>素材处理</h4><p>模板仅会覆盖以下配置，不会替换上方已上传素材</p></div></div><div class="config-grid ${key === 'clean' ? 'clean-config-grid' : ''} ${key === 'detail' ? 'detail-config-grid' : ''}">${configFields(key, config)}</div><div class="node-config-generate"><div class="node-estimate-control">${modelSummaryMarkup}<span>预计消耗额度</span><b id="nodeEstimatedTokens">${formatCny(quotaFromUsage(nodeMap[key].tokens, config.model || nodeMap[key].model))}</b><small>人民币</small><button class="icon-button estimate-refresh" type="button" aria-label="重新计算预计消耗额度" title="重新计算预计消耗额度">↻</button></div><div class="node-generation-actions"><button class="button primary start-node-run" id="startRun" type="button">生成素材</button><div class="regenerate-actions" id="regenerateActions" hidden><div class="generation-action-with-tip"><button class="button secondary restart-node-run" id="restartRun" type="button" aria-describedby="restartRunTip">重新生成</button><span class="generation-action-tooltip" id="restartRunTip" role="tooltip">不继承原来的配置，重新发送生成指令，在生成结果偏离预期时建议使用该功能</span></div><div class="generation-action-with-tip"><button class="button primary continue-node-run" id="continueRun" type="button" aria-describedby="continueRunTip">基于当前版本生成</button><span class="generation-action-tooltip" id="continueRunTip" role="tooltip">基于当前版本进行调整，即继承当前版本的上下文，需要微调时建议使用该功能</span></div></div></div></div></div>
      </div>
    </section>`;
    syncOutputViewLabels(key);
    const nodeTitle = nodeMap[key].name;
    const nodeSubtitle = nodeMap[key].desc;
    const currentNodeTitle = $('#currentNodeTitle');
    const currentNodeSubtitle = $('#currentNodeSubtitle');
    currentNodeTitle.textContent = nodeTitle;
    currentNodeTitle.dataset.editorRecordKey = `workspace-node-title-v2-${key}`;
    currentNodeTitle.dataset.editorDefaultText = nodeTitle;
    currentNodeSubtitle.textContent = nodeSubtitle;
    currentNodeSubtitle.dataset.editorRecordKey = `workspace-node-subtitle-${key}`;
    currentNodeSubtitle.dataset.editorDefaultText = nodeSubtitle;
    $('#configNodeCount').textContent = `第 ${index + 1} / ${nodes.length} 个节点`;
    applyConfig(key, config);
    if (key === 'scene') syncSceneConfigRequirements($('.node-config-card[data-node="scene"]'));
    updateNodeSummary();
    updateNodeEstimate();
    updateNodeStepStates();
    refreshEditableElements();
  }
  function collectConfig(nodeKey) {
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    if (!card) {
      const savedConfig = { ...(runState?.configs?.[nodeKey] || restoredDraftConfigs?.[nodeKey] || defaultConfigs[nodeKey]) };
      savedConfig.mediaType = normalizeNodeMediaType(nodeKey, savedConfig.mediaType);
      return savedConfig;
    }
    enforceBusinessTextStorageLimits(card);
    const config = {};
    $$('[data-field]', card).forEach(field => {
      if (field.type === 'radio' && !field.checked) return;
      if (field.type === 'checkbox') {
        if (!config[field.dataset.field]) config[field.dataset.field] = [];
        if (field.checked) config[field.dataset.field].push(field.value);
        return;
      }
      config[field.dataset.field] = field.value;
    });
    config.mediaType = normalizeNodeMediaType(nodeKey, config.mediaType);
    if (nodeKey === 'scene') {
      $$('.scene-audio-control', card).forEach(control => { config[control.dataset.audioField] = control.dataset.audioName ? { name:control.dataset.audioName, source:control.dataset.audioSource || '' } : null; });
      ['model','setting'].forEach(groupKey => {
        const section = $('.scene-config-group-' + groupKey, card);
        if (!section) return;
        config[groupKey + 'ConfigMode'] = section.dataset.sourceMode || 'manual';
        config[groupKey + 'ReferenceId'] = section.dataset.libraryId || '';
        config[groupKey + 'OverrideEnabled'] = section.dataset.customize === 'true';
      });
    }
    return config;
  }
  function syncSceneAudioControl(control, value) {
    if (!control) return;
    const name = typeof value === 'string' ? value : value?.name || '';
    control.dataset.audioName = name;
    control.dataset.audioSource = typeof value === 'object' && value ? value.source || '' : '';
    const label = $('.scene-audio-name', control);
    const remove = $('[data-audio-remove]', control);
    if (label) label.textContent = name || '未选择音频';
    if (remove) remove.hidden = !name;
  }
  function handleSceneAudioUpload(input) {
    const file = input.files?.[0];
    const control = input.closest('.scene-audio-control');
    if (!file || !control) return;
    if (!file.type.startsWith('audio/')) { toast('请选择音频文件', 'warning'); input.value = ''; return; }
    syncSceneAudioControl(control, { name:file.name, source:'本地上传' });
    input.value = '';
    updateNodeEstimate();
    markDirty();
    toast('音频已添加');
  }
  function estimateNodeTokens(nodeKey, config = collectConfig(nodeKey)) {
    config = { ...config, mediaType:normalizeNodeMediaType(nodeKey, config.mediaType) };
    config.model = normalizeProcessingModel(config.mediaType, config.model);
    const base = nodeMap[nodeKey]?.tokens || 0;
    const durationSeconds = Math.max(.1, Number(config.outputDuration) || 15) * (config.durationUnit === '分钟' ? 60 : 1);
    const mediaFactor = config.mediaType === '视频' ? 1.2 + durationSeconds / 15 : 1;
    const quality = String(config.quality || '');
    const qualityFactor = quality.includes('4K') ? 1.55 : quality.includes('2K') ? 1.18 : 1;
    const strategyFactor = ['节省额度','节省 Token'].includes(config.strategy) ? .82 : config.strategy === '质量优先' ? 1.1 : 1;
    const views = Math.max(1, Array.isArray(config.views) ? config.views.length : 1);
    const viewsFactor = nodeKey === 'clean' ? views : 1;
    const outputCountFactor = ['scene','detail'].includes(nodeKey) && config.mediaType !== '视频' ? Math.max(1, Number.parseInt(String(config.generateCount || '1').match(/^\s*(\d+)/)?.[1] || '1', 10)) : 1;
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    const inputCount = card ? $$('.uploaded-file-name', card).length : 1;
    const inputFactor = inputCount > 1 ? 1 + (inputCount - 1) * .12 : 1;
    const requirementLength = String(config.requirements || '').trim().length;
    const promptFactor = 1 + Math.min(.12, requirementLength / 2500);
    return Math.max(1, Math.round(base * mediaFactor * qualityFactor * strategyFactor * viewsFactor * outputCountFactor * inputFactor * promptFactor / 10) * 10);
  }
  function updateNodeEstimate(animate = false) {
    const card = $('.node-config-card');
    if (!card) return;
    const nodeKey = card.dataset.node;
    const estimate = estimateNodeTokens(nodeKey);
    const value = $('#nodeEstimatedTokens');
    const model = $('.node-model', card)?.value || runState?.configs?.[nodeKey]?.model || restoredDraftConfigs?.[nodeKey]?.model || defaultConfigs[nodeKey]?.model || nodeMap[nodeKey].model;
    if (value) value.textContent = formatCny(quotaFromUsage(estimate, model));
    const modelLabel = $('#nodeModelSummary');
    if (modelLabel) modelLabel.textContent = model;
    const refresh = $('.estimate-refresh', card);
    if (animate && refresh) {
      refresh.classList.remove('is-refreshing');
      void refresh.offsetWidth;
      refresh.classList.add('is-refreshing');
      setTimeout(() => refresh.classList.remove('is-refreshing'), 600);
    }
  }
  function applyConfig(nodeKey, config) {
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    if (!config) return;
    config = { ...config, mediaType:normalizeNodeMediaType(nodeKey, config.mediaType) };
    if (nodeKey === 'detail') config = normalizeDetailConfig(config);
    if (runState?.configs) runState.configs[nodeKey] = { ...defaultConfigs[nodeKey], ...config };
    restoredDraftConfigs = { ...(restoredDraftConfigs || {}), [nodeKey]:{ ...defaultConfigs[nodeKey], ...config } };
    if (!card) return;
    Object.entries(config).forEach(([field, value]) => {
      const inputs = $$(`[data-field="${field}"]`, card);
      if (!inputs.length) return;
      if (inputs[0].type === 'radio') inputs.forEach(input => { input.checked = input.value === value; });
      else if (inputs[0].type === 'checkbox') {
        const values = Array.isArray(value) ? value : [value];
        inputs.forEach(input => { input.checked = values.includes(input.value); });
      }
      else inputs[0].value = value;
    });
    if (nodeKey === 'scene') $$('.scene-audio-control', card).forEach(control => syncSceneAudioControl(control, config[control.dataset.audioField]));
    syncNodeMediaUI(card);
    updateNodeSummary();
    markDirty();
  }
  function syncNodeMediaUI(card) {
    if (!card) return;
    const mediaType = normalizeNodeMediaType(card.dataset.node, $('[data-field="mediaType"]:checked', card)?.value);
    if (card.dataset.node === 'clean') {
      const imageChoice = $('[data-field="mediaType"][value="图片"]', card);
      if (imageChoice) imageChoice.checked = true;
      if (runState?.configs?.clean) runState.configs.clean.mediaType = '图片';
      if (restoredDraftConfigs?.clean) restoredDraftConfigs.clean.mediaType = '图片';
    }
    const uploadMediaType = card.dataset.node === 'clean' ? '图片' : mediaType;
    if (!['scene','detail'].includes(card.dataset.node)) $$('.classified-file-input', card).forEach(input => { input.accept = uploadMediaType === '视频' ? 'video/*' : 'image/*'; });
    if (card.dataset.node === 'detail') $$('.classified-file-input', card).forEach(input => { input.accept = input.dataset.acceptTypes || 'image/*,video/*'; });
    $$('[data-output-type="image"]', card).forEach(element => { element.hidden = mediaType === '视频'; });
    $$('[data-output-type="video"]', card).forEach(element => { element.hidden = mediaType !== '视频'; });
    const modelSelect = $('.node-model', card);
    if (modelSelect) {
      const models = processingModelsFor(mediaType);
      const model = normalizeProcessingModel(mediaType, modelSelect.value);
      modelSelect.replaceChildren(...models.map(value => {
        const option = document.createElement('option');
        option.value = value; option.textContent = value; option.selected = value === model;
        return option;
      }));
      if (runState?.configs?.[card.dataset.node]) runState.configs[card.dataset.node].model = model;
      if (restoredDraftConfigs?.[card.dataset.node]) restoredDraftConfigs[card.dataset.node].model = model;
    }
    if (card.dataset.node === 'scene') {
      const ratioSelect = $('[data-field="ratio"]', card);
      if (ratioSelect) {
        const options = getSceneRatioOptions(mediaType);
        const version = getSceneRatioOptionVersion(mediaType);
        const currentRatio = ratioSelect.value;
        if (ratioSelect.dataset.editorOptionsVersion !== version) {
          ratioSelect.dataset.editorOptionsVersion = version;
          ratioSelect.replaceChildren(...options.map(option => {
            const element = document.createElement('option');
            element.value = option.value;
            element.textContent = option.label;
            return element;
          }));
        }
        const liveOptions = [...ratioSelect.options].map(option => option.value);
        const available = liveOptions.includes(currentRatio);
        const defaultRatio = liveOptions.includes(defaultConfigs.scene.ratio) ? defaultConfigs.scene.ratio : liveOptions[0];
        ratioSelect.value = available ? currentRatio : defaultRatio;
        const resolvedRatio = ratioSelect.value || defaultRatio;
        if (runState?.configs?.scene) runState.configs.scene.ratio = resolvedRatio;
        if (restoredDraftConfigs?.scene) restoredDraftConfigs.scene.ratio = resolvedRatio;
      }
    }
    $$('.classified-upload', card).forEach(updateUploadGroupState);
    const demo = $('.uploaded-material-item.demo', card);
    if (demo) {
      const name = $('.uploaded-file-name', demo);
      const thumb = $('.upload-thumb', demo);
      const demoName = uploadMediaType === '视频' ? '夏季新品_正面展示.mp4' : '防晒衣_模特正面.jpg';
      if (name) name.textContent = demoName;
      if (thumb) { thumb.classList.toggle('video', uploadMediaType === '视频'); thumb.dataset.previewType = uploadMediaType === '视频' ? 'video' : 'image'; thumb.dataset.previewName = demoName; thumb.innerHTML = `<span>${uploadMediaType === '视频' ? '▶' : 'IMG'}</span>`; }
      const remove = $('.remove-uploaded-material', demo);
      if (remove) remove.setAttribute('aria-label', `删除${demoName}`);
    }
    $$('.classified-upload', card).forEach(updateUploadGroupState);
  }
  function localFileThumbnail(file) {
    const url = URL.createObjectURL(file);
    const name = escapeHtml(file.name);
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const visual = type === 'image' ? `<img src="${url}" alt="${name}">` : `<video src="${url}" muted preload="metadata"></video><span>▶</span>`;
    return `<div class="upload-thumb-wrap"><div class="upload-thumb media-preview-trigger ${type === 'video' ? 'video' : ''}" data-media-preview data-preview-type="${type}" data-preview-src="${url}" data-preview-name="${name}" data-preview-source="上传" role="button" tabindex="0" aria-label="放大预览：${name}">${visual}</div><button class="remove-uploaded-material" type="button" title="删除" aria-label="删除${name}">×</button></div>`;
  }
  function handleClassifiedFiles(input) {
    const group = input.closest('.classified-upload');
    const card = input.closest('.node-config-card');
    const list = $('.classified-file-list', group);
    const max = Number(input.dataset.max || group?.dataset.max || 1);
    const files = [...(input.files || [])];
    const acceptedTypes = (input.dataset.acceptTypes || input.accept).split(',').map(type => type.trim()).filter(Boolean);
    const acceptsVideo = acceptedTypes.includes('video/*');
    const acceptsImage = acceptedTypes.includes('image/*');
    const acceptsMixed = acceptsVideo && acceptsImage;
    const expectVideo = acceptsVideo && !acceptsImage;
    const isAllowed = file => acceptedTypes.some(type => type === 'video/*' ? file.type.startsWith('video/') : type === 'image/*' ? file.type.startsWith('image/') : file.type === type);
    const allowed = files.filter(isAllowed);
    const countUnit = acceptsMixed || expectVideo ? '个文件' : '张';
    const existingCount = $$('.uploaded-material-item', group).length;
    const remaining = Math.max(0, max - existingCount);
    const selected = allowed.slice(0, remaining);
    if (allowed.length !== files.length) toast(acceptsMixed ? '当前仅支持上传图片或视频' : expectVideo ? '当前仅支持上传视频' : '当前仅支持上传图片', 'warning');
    if (!remaining) { input.value = ''; updateUploadGroupState(group); toast(`该分类已上传 ${max}${countUnit}，请删除后再上传`, 'warning'); return; }
    if (!selected.length) { input.value = ''; return; }
    if (allowed.length > remaining) toast(`该分类还可上传 ${remaining}${countUnit}，已保留前 ${remaining}${countUnit}`, 'warning');
    $('.classified-empty', list)?.remove();
    const sceneSourceAttribute = card?.dataset.node === 'scene' ? ' data-asset-source="upload"' : '';
    list.insertAdjacentHTML('beforeend', selected.map(file => `<div class="uploaded-material-item"${sceneSourceAttribute}>${localFileThumbnail(file)}<div class="uploaded-material-info"><small>上传</small><b class="uploaded-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b></div></div>`).join(''));
    input.value = '';
    updateUploadGroupState(group);
    if (card?.dataset.node === 'scene') {
      const changedGroup = group?.dataset.uploadCategory === 'referenceModel' ? 'model' : group?.dataset.uploadCategory === 'referenceScene' ? 'setting' : '';
      syncSceneConfigRequirements(card, changedGroup, Boolean(changedGroup));
    }
    clearUploadValidationWhenSatisfied(card);
    markDirty();
    updateNodeEstimate();
    toast(acceptsMixed || expectVideo ? `已上传 ${selected.length}个文件` : `已上传 ${selected.length}张图片`);
  }
  function getNodeSource(nodeKey) {
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    const selectedId = $('.previous-output-select', card)?.value;
    const previousName = selectedId ? runState?.outputs.find(item => item.assetId === selectedId)?.name : '';
    const names = $$('.uploaded-file-name', card).map(item => item.textContent.trim()).filter(Boolean);
    const sources = [previousName, ...names].filter(Boolean);
    return sources.length ? sources.join('、') : '上传素材';
  }
  function getNodeUploadedFileCount(nodeKey) {
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    if (!card) return 0;
    const nonUploadSources = new Set(['library','model-prototype','scene-template','previous-output']);
    return $$('.uploaded-material-item', card).filter(item => !nonUploadSources.has(item.dataset.assetSource || '')).length;
  }

  function updateNodeStepStates() {
    if (!runState) return;
    const card = $('.node-config-card');
    const current = runState.current;
    const taskLocked = Boolean(runState);
    $('#taskName').disabled = taskLocked;
    $('#orgSelect').disabled = taskLocked;
    $('#requesterSelect').disabled = taskLocked;
    $('#businessLineSelect').disabled = taskLocked;
    $('#loadTemplate').disabled = taskLocked;
    const key = runState.nodes[current];
    const currentOutputs = runState.outputs.filter(item => item.nodeKey === key);
    if (card) {
      card.classList.toggle('running', runState.executing);
      const content = $('.node-step-content', card);
      $$('button,input,select,textarea', content).forEach(control => { control.disabled = runState.executing; });
      if (!runState.executing && card.dataset.node === 'scene') syncSceneConfigRequirements(card);
    }
    $$('.route-step').forEach((step, index) => {
      const completed = index < current;
      const active = index === current;
      step.classList.toggle('completed', completed);
      step.classList.toggle('current', active);
      step.classList.toggle('locked', index > current);
    });
    const hasGenerated = currentOutputs.length > 0;
    const startRunButton = $('#startRun');
    const regenerateActions = $('#regenerateActions');
    const restartRunButton = $('#restartRun');
    const continueRunButton = $('#continueRun');
    if (startRunButton) {
      startRunButton.hidden = hasGenerated;
      startRunButton.disabled = runState.executing;
      startRunButton.textContent = runState.executing ? `${nodeMap[key].name}生成中…` : '生成素材';
    }
    if (regenerateActions) regenerateActions.hidden = !hasGenerated;
    [restartRunButton,continueRunButton].filter(Boolean).forEach(button => { button.disabled = runState.executing; });
    $('#nextNodeStep').disabled = runState.executing || !currentOutputs.length;
    $('#nextNodeStep').textContent = current < runState.nodes.length - 1 ? `下一步：${nodeMap[runState.nodes[current + 1]].name}` : '下一步：确认入库';
    $('#nodeNextHint').textContent = currentOutputs.length ? `当前节点已生成 ${currentOutputs.length} 份素材，可继续生成或进入下一步` : '生成至少一份素材后，可进入下一步';
    $('#previousNodeStep').disabled = runState.executing;
    $('#currentNodeTemplate').disabled = runState.executing;
    updateExecutionSummaryActions();
  }

  function updateExecutionSummaryActions() {
    const actions = $('#runTaskActions');
    if (!actions) return;
    actions.hidden = !(creationStage === 2 && runState);
    const terminateAndStore = $('#terminateAndStore');
    if (terminateAndStore) {
      terminateAndStore.hidden = !(runState?.outputs.length && runState.outputs.some(output => output.retained));
      terminateAndStore.disabled = Boolean(runState?.executing);
    }
  }

  function updateWorkflow() {
    if (activeAiEdition === 'phase1') {
      const detailCard = $('.node-card[data-node="detail"]');
      detailCard?.classList.remove('selected');
      const detailInput = detailCard ? $('.node-check input', detailCard) : null;
      if (detailInput) { detailInput.checked = false; detailInput.disabled = true; }
    }
    const nodes = selectedNodes();
    $$('.node-card').forEach(card => $('.node-status', card).textContent = activeAiEdition === 'phase1' && card.dataset.node === 'detail' ? '暂不可用' : card.classList.contains('selected') ? '已选择' : '点击选择');
    $$('.flow-connector').forEach((connector, index) => connector.classList.toggle('active', nodes.includes(index === 0 ? 'clean' : 'scene') && nodes.includes(index === 0 ? 'scene' : 'detail')));
    $('#routePreview').innerHTML = nodes.length ? nodes.map((key, index) => `<div class="route-step" data-node="${key}"><b>${index + 1}</b><div class="route-step-copy"><span>${nodeMap[key].name}</span></div><strong class="route-step-quota" data-runtime-copy aria-live="polite" hidden></strong></div>`).join('') : '<div class="route-empty">请先选择处理节点</div>';
    updateNodeSummary();
    $('#confirmNodes').disabled = !nodes.length;
    $('#selectAllNodes').textContent = nodes.length === (activeAiEdition === 'phase1' ? 2 : 3) ? '取消全选' : '全选节点';
    $('#selectionSummary').textContent = nodes.length ? `已选择 ${nodes.length} 个节点：${nodes.map(key => nodeMap[key].name).join(' → ')}` : '尚未选择节点';
    markDirty();
  }
  function advanceToTask() {
    enforceBusinessTextStorageLimits($('[data-page="workspace"]'));
    const taskName = $('#taskName').value.trim();
    if (!taskName) { toast('请填写任务名称', 'warning'); $('#taskName').focus(); return; }
    if (taskName.length > TASK_NAME_MAX_LENGTH) { toast('任务名称不能超过 200 个字符', 'warning'); $('#taskName').focus(); return; }
    const missingBaseField = [$('#orgSelect'), $('#requesterSelect'), $('#businessLineSelect')].find(field => !field.value);
    if (missingBaseField) { toast('请完整填写创建任务中的必填配置', 'warning'); missingBaseField.focus(); return; }
    const nodes = selectedNodes();
    if (!nodes.length) { toast('请至少选择一个执行节点', 'warning'); return; }
    const configs = Object.fromEntries(nodes.map(key => {
      const config = { ...defaultConfigs[key], ...(restoredDraftConfigs?.[key] || {}) };
      config.mediaType = normalizeNodeMediaType(key, config.mediaType);
      return [key, config];
    }));
    const orgValue = $('#orgSelect').value;
    const requesterValue = $('#requesterSelect').value;
    const businessLineValue = $('#businessLineSelect').value;
    const taskSnapshot = {
      taskName,
      orgFull:selectedOptionLabel($('#orgSelect')),
      requester:selectedOptionLabel($('#requesterSelect')),
      businessLine:selectedOptionLabel($('#businessLineSelect')),
      visualDemandId:activeVisualDemandId || restoredDraftState?.visualDemandId || ''
    };
    const restoredRun = restoredDraftState && activeDraftId && restoredDraftState.id === activeDraftId ? restoredDraftState : null;
    runState = { id:activeDraftId || `TSK-${Date.now().toString().slice(-10)}`, taskSnapshot, taskName:taskSnapshot.taskName, org:orgValue.split(' / ')[0], orgFull:orgValue, requester:requesterValue, businessLine:businessLineValue, visualDemandId:taskSnapshot.visualDemandId, nodes:[...nodes], configs, uploadCounts:{}, generationBatchMeta:{}, generationErrors:{}, current:0, outputs:[], records:[], outputMetaByAttempt:{}, executing:false, generationSeq:0, startedAt:nowText() };
    if (restoredRun) {
      runState.current = Math.max(0, Math.min(Number(restoredRun.current) || 0, nodes.length - 1));
      runState.outputs = Array.isArray(restoredRun.outputs) ? restoredRun.outputs : [];
      runState.records = Array.isArray(restoredRun.records) ? restoredRun.records.map(normalizeQuotaRecord) : [];
      runState.uploadCounts = restoredRun.uploadCounts && typeof restoredRun.uploadCounts === 'object' ? { ...restoredRun.uploadCounts } : {};
      runState.generationBatchMeta = restoredRun.generationBatchMeta && typeof restoredRun.generationBatchMeta === 'object' ? { ...restoredRun.generationBatchMeta } : {};
      runState.generationErrors = restoredRun.generationErrors && typeof restoredRun.generationErrors === 'object' ? { ...restoredRun.generationErrors } : {};
      runState.outputMetaByAttempt = restoredRun.outputMetaByAttempt && typeof restoredRun.outputMetaByAttempt === 'object' ? restoredRun.outputMetaByAttempt : {};
      runState.generationSeq = Number(restoredRun.generationSeq) || runState.outputs.length;
      runState.startedAt = restoredRun.startedAt || restoredRun.createdAt || runState.startedAt;
    }
    activeDraftId = runState.id;
    if (runState.visualDemandId) updateDemandTaskState(runState.visualDemandId, '任务处理中', runState.id, demandRuntimePayload(runState));
    updateNodeSummary();
    activePreviewVersion = null;
    activePreviewKind = 'material';
    saveDraft(false);
    setCreationStage(2);
  }
  function markDirty() { if ($('#saveState')) $('#saveState').textContent = '未保存'; }
  function saveDraft(show = true) {
    enforceBusinessTextStorageLimits($('[data-page="workspace"]'));
    const nodes = runState ? [...runState.nodes] : selectedNodes();
    const configs = runState ? { ...runState.configs } : {};
    if (runState && !runState.executing) runState.configs[runState.nodes[runState.current]] = collectConfig(runState.nodes[runState.current]);
    nodes.forEach(key => { configs[key] = runState ? { ...runState.configs[key] } : collectConfig(key); });
    const snapshot = runState?.taskSnapshot;
    let previousDraft = null;
    try { previousDraft = JSON.parse(localStorage.getItem('ai-material-draft-v4') || 'null'); } catch {}
    const updatedAt = nowText();
    const id = runState?.id || activeDraftId || previousDraft?.id || `TSK-DRAFT-${Date.now().toString().slice(-10)}`;
    const existingTask = tasks.find(row => row?.[7]?.id === id);
    const createdAt = runState?.startedAt || previousDraft?.createdAt || existingTask?.[7]?.createdAt || existingTask?.[6] || updatedAt;
    const records = Array.isArray(runState?.records) ? runState.records : Array.isArray(previousDraft?.records) && previousDraft?.id === id ? previousDraft.records : [];
    const outputs = Array.isArray(runState?.outputs) ? runState.outputs : Array.isArray(previousDraft?.outputs) && previousDraft?.id === id ? previousDraft.outputs : [];
    const draft = {
      id,
      name:snapshot?.taskName || $('#taskName').value,
      org:snapshot?.orgFull || $('#orgSelect').value,
      requester:snapshot?.requester || $('#requesterSelect').value,
      businessLine:snapshot?.businessLine || $('#businessLineSelect').value,
      visualDemandId:runState?.visualDemandId || snapshot?.visualDemandId || activeVisualDemandId || previousDraft?.visualDemandId || '',
      nodes,
      configs,
      current:runState?.current || 0,
      outputs,
      records,
      outputMetaByAttempt:runState?.outputMetaByAttempt || previousDraft?.outputMetaByAttempt || {},
      generationErrors:runState?.generationErrors || previousDraft?.generationErrors || {},
      generationSeq:runState?.generationSeq || 0,
      startedAt:runState?.startedAt || createdAt,
      createdAt,
      updatedAt,
      savedAt:new Date().toISOString()
    };
    activeDraftId = id;
    restoredDraftState = draft;
    localStorage.setItem('ai-material-draft-v4', JSON.stringify(draft));
    const draftName = String(draft.name || '').trim();
    if (draftName && nodes.length) {
      const route = nodes.map(key => nodeMap[key]?.name).filter(Boolean).join(' → ') || '未生成';
      const taskType = summarizeConfig(nodes, configs, 'mediaType', '混合');
      const total = records.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
      const nodeStats = buildTaskNodeStats(nodes, records, [], outputs);
      upsertTaskRecord([draftName,taskType,route,`${String(draft.org || currentUserContext.org).split(' / ')[0]} / ${currentUserContext.name}`,String(roundQuota(total)),'暂存',createdAt,{produced:outputs.length,retained:outputs.filter(item => item.retained).length,saved:0,id,requester:draft.requester,businessLine:draft.businessLine,visualDemandId:draft.visualDemandId,createdAt,updatedAt,nodes:[...nodes],nodeStats,quotaCurrency:'CNY'}]);
      replaceTaskTokenDetails(id, records);
      if (draft.visualDemandId) updateDemandTaskState(draft.visualDemandId, '任务处理中', id, demandRuntimePayload({ id, startedAt:createdAt, outputs }));
      localStorage.setItem('ai-material-tasks-v2', JSON.stringify(tasks));
      localStorage.setItem('ai-material-token-details-v2', JSON.stringify(tokenDetails));
      const currentNodeName = nodes[Number(draft.current) || 0] ? nodeMap[nodes[Number(draft.current) || 0]]?.name : '';
      const workbenchDraft = { id, name:draftName, type:taskType, status:'draft', statusLabel:'暂存', progress:records.length ? Math.min(85, 30 + Math.round(((Number(draft.current) || 0) + 1) / nodes.length * 45)) : 25, step:records.length ? `当前节点：${currentNodeName || '待继续'}` : `创建任务 · 已选择 ${nodes.length} 个节点`, updated:'刚刚', updatedAt, nodes:[...nodes], current:Number(draft.current) || 0, org:draft.org, requester:draft.requester, businessLine:draft.businessLine, visualDemandId:draft.visualDemandId, action:'继续执行' };
      const workbenchIndex = workbenchTasks.findIndex(item => item.id === id);
      if (workbenchIndex >= 0) workbenchTasks.splice(workbenchIndex, 1, workbenchDraft);
      else workbenchTasks.unshift(workbenchDraft);
      renderTasks($('#taskSearch')?.value.trim() || '');
      renderTokenDetails();
      renderWorkbench();
    }
    $('#saveState').textContent = '已保存';
    if (show) toast('草稿已暂存到当前浏览器');
  }
  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem('ai-material-draft-v4') || 'null'); if (!draft) return;
      restoredDraftState = draft;
      activeDraftId = draft.id || null;
      activeVisualDemandId = draft.visualDemandId || null;
      $('#taskName').value = (draft.name || $('#taskName').value).slice(0, TASK_NAME_MAX_LENGTH); $('#orgSelect').value = draft.org || $('#orgSelect').value;
      if (draft.requester) $('#requesterSelect').value = draft.requester;
      if (draft.businessLine) $('#businessLineSelect').value = draft.businessLine;
      if (Array.isArray(draft.nodes)) {
        $$('.node-card').forEach(card => { const on = draft.nodes.includes(card.dataset.node); card.classList.toggle('selected', on); $('.node-check input', card).checked = on; });
        restoredDraftConfigs = Object.fromEntries(draft.nodes.map(key => [key, { ...defaultConfigs[key], ...(draft.configs?.[key] || {}), mediaType:normalizeNodeMediaType(key, draft.configs?.[key]?.mediaType || draft.type || defaultConfigs[key].mediaType), ratio:draft.configs?.[key]?.ratio || draft.ratio || defaultConfigs[key].ratio }]));
      }
      $('#saveState').textContent = '已恢复草稿';
    } catch {}
  }

  function normalizeDemandOptionHistory(rawHistory = {}) {
    const normalized = {};
    Object.keys(demandOptionFieldLabels).forEach(field => {
      normalized[field] = {};
      Object.values(rawHistory?.[field] || {}).forEach(entry => {
        const id = String(entry?.id || '').trim();
        const label = String(entry?.label || id).trim();
        const targetId = String(entry?.targetId || id).trim();
        if (id) normalized[field][id.toLowerCase()] = { id, label:label || id, targetId:targetId || id };
      });
    });
    return normalized;
  }
  function rememberDemandOptionConfig(previousConfig = {}, nextConfig = {}, renames = {}) {
    Object.keys(demandOptionFieldLabels).forEach(field => {
      demandOptionHistory[field] ||= {};
      (previousConfig[field] || []).forEach(option => {
        const id = String(option.id || '').trim();
        if (id) demandOptionHistory[field][id.toLowerCase()] = { id, label:String(option.label || id), targetId:id };
      });
      Object.entries(renames[field] || {}).forEach(([oldId,newId]) => {
        const oldKey = oldId.toLowerCase();
        const newOption = (nextConfig[field] || []).find(option => option.id.toLowerCase() === newId.toLowerCase());
        Object.values(demandOptionHistory[field]).forEach(entry => {
          if (String(entry.targetId || entry.id).toLowerCase() === oldKey) entry.targetId = newId;
        });
        demandOptionHistory[field][oldKey] = { id:oldId, label:newOption?.label || demandOptionHistory[field][oldKey]?.label || oldId, targetId:newId };
      });
      (nextConfig[field] || []).forEach(option => {
        const id = String(option.id || '').trim();
        if (id) demandOptionHistory[field][id.toLowerCase()] = { id, label:String(option.label || id), targetId:id };
      });
    });
    localStorage.setItem(demandOptionHistoryKey, JSON.stringify(demandOptionHistory));
  }
  function demandOptionHistoryByValue(field, value) {
    const target = String(value ?? '').trim();
    if (!target) return null;
    const entries = Object.values(demandOptionHistory?.[field] || {});
    return entries.find(entry => [entry.id,entry.label].some(candidate => String(candidate || '').toLowerCase() === target.toLowerCase())) || null;
  }
  function demandOptionHistoryDisplayValue(field, value) {
    let entry = demandOptionHistoryByValue(field, value);
    if (!entry) return '';
    const visited = new Set();
    for (let depth = 0; depth < 12 && entry; depth += 1) {
      const key = String(entry.id || '').toLowerCase();
      if (visited.has(key)) break;
      visited.add(key);
      const targetId = String(entry.targetId || entry.id || '');
      const current = demandOptionByValue(field, targetId);
      if (current) return current.label;
      const next = demandOptionHistoryByValue(field, targetId);
      if (!next || next === entry) break;
      entry = next;
    }
    return entry?.label || '';
  }
  function persistDemandOptions() {
    localStorage.setItem('ai-material-visual-demand-options-v1', JSON.stringify(demandOptionConfig));
    localStorage.setItem(demandOptionHistoryKey, JSON.stringify(demandOptionHistory));
    localStorage.setItem(demandOptionSchemaVersionKey, demandOptionSchemaVersion);
  }
  function persistVisualDemands() {
    localStorage.setItem('ai-material-visual-demands-v1', JSON.stringify(visualDemands));
  }
  function normalizeDemandOption(field, option, index = 0) {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const rawId = String(option.id || option.identifier || '').trim();
      const id = /^[A-Za-z][A-Za-z0-9_-]*$/.test(rawId) ? rawId : `${field.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()}_${index + 1}`;
      const label = String(option.label || option.displayName || option.name || rawId || id).trim();
      return { id, label:label || id, ...(option.legacy ? { legacy:String(option.legacy) } : {}) };
    }
    const raw = String(option ?? '').trim();
    const override = demandOptionIdentityOverrides[`${field}:${raw}`];
    if (override) return { ...override, ...(raw !== override.id && raw !== override.label ? { legacy:raw } : {}) };
    const leadingEnglish = raw.match(/^([A-Za-z][A-Za-z0-9&/_-]*(?:\s+[A-Za-z][A-Za-z0-9&/_-]*)*)/u)?.[1] || '';
    const identifier = leadingEnglish
      ? leadingEnglish.replace(/&/g,'AND').replace(/[\s/]+/g,'-').replace(/[^A-Za-z0-9_-]/g,'')
      : `${field.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()}_${index + 1}`;
    const remainder = leadingEnglish ? raw.slice(leadingEnglish.length).trim().replace(/^[（(]|[）)]$/g,'').trim() : raw;
    const label = remainder || raw || identifier;
    return { id:identifier, label, ...(raw && raw !== identifier && raw !== label ? { legacy:raw } : {}) };
  }
  function findDemandOptionInList(options, value) {
    const target = String(value ?? '').trim();
    if (!target) return null;
    return (options || []).find(option => [option.id, option.label, option.legacy, `${option.id} ${option.label}`].filter(Boolean).some(candidate => String(candidate).trim().toLowerCase() === target.toLowerCase())) || null;
  }
  function normalizeDemandOptionScopes(rawScopes = {}, config = {}) {
    const normalized = {};
    Object.entries(rawScopes || {}).forEach(([field, scopeMap]) => {
      if (!scopeMap || typeof scopeMap !== 'object' || !Array.isArray(config[field])) return;
      normalized[field] = {};
      Object.entries(scopeMap).forEach(([rawOption, rawChannels]) => {
        const option = findDemandOptionInList(config[field], rawOption);
        if (!option) return;
        normalized[field][option.id] = [...new Set((Array.isArray(rawChannels) ? rawChannels : []).map(channel => findDemandOptionInList(config.businessChannel || [], channel)?.id || String(channel)).filter(Boolean))];
      });
    });
    return normalized;
  }
  function normalizeDemandOptionConfiguration(config = {}) {
    const normalized = {};
    Object.keys(demandOptionFieldLabels).forEach(field => {
      const source = Array.isArray(config[field]) && config[field].length ? config[field] : (defaultDemandOptionConfig[field] || []);
      const seen = new Set();
      normalized[field] = source.map((option,index) => {
        const next = normalizeDemandOption(field, option, index);
        let uniqueId = next.id;
        let suffix = 2;
        while (seen.has(uniqueId.toLowerCase())) uniqueId = `${next.id}_${suffix++}`;
        seen.add(uniqueId.toLowerCase());
        return { ...next, id:uniqueId };
      });
    });
    normalized.scopes = normalizeDemandOptionScopes(config.scopes || {}, normalized);
    return normalized;
  }
  function demandOptionByValue(field, value) {
    return findDemandOptionInList(demandOptionConfig[field] || [], value);
  }
  function normalizeDemandOptionSelection(field, value) {
    const raw = String(value ?? '').trim();
    return demandOptionByValue(field, raw)?.id || raw;
  }
  function normalizeDemandOptionSelectionList(field, value) {
    return String(value || '').split(/[,，、]+/).map(item => normalizeDemandOptionSelection(field, item)).filter(Boolean).join('、');
  }
  function demandOptionDisplayValue(field, value) {
    return demandOptionByValue(field, value)?.label || demandOptionHistoryDisplayValue(field, value) || String(value ?? '');
  }
  function demandOptionDisplayList(field, value) {
    return String(value || '').split(/[,，、]+/).map(item => demandOptionDisplayValue(field, item)).filter(Boolean).join('、');
  }
  function normalizeVisualDemandOptionValues(item) {
    const next = { ...item };
    Object.keys(demandOptionFieldLabels).forEach(field => {
      if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = normalizeDemandOptionSelection(field, next[field]);
    });
    return next;
  }
  function demandOptionsFor(field, businessChannel = '') {
    const values = Array.isArray(demandOptionConfig[field]) ? demandOptionConfig[field] : [];
    if (!businessChannel || !demandOptionConfig.scopes?.[field]) return values;
    const businessChannelId = normalizeDemandOptionSelection('businessChannel', businessChannel);
    const scopedChannels = new Set(Object.values(demandOptionConfig.scopes[field]).flatMap(scope => Array.isArray(scope) ? scope : []));
    if (!scopedChannels.has(businessChannelId)) return values;
    return values.filter(option => {
      const scope = demandOptionConfig.scopes[field]?.[option.id];
      return !Array.isArray(scope) || !scope.length || scope.includes(businessChannelId);
    });
  }
  function demandOptionMarkup(field, selected = '', businessChannel = '', includeAll = false) {
    const available = demandOptionsFor(field, businessChannel);
    const selectedOption = findDemandOptionInList(available, selected);
    const selectedId = selectedOption?.id || '';
    return `${includeAll ? '<option value="">全部</option>' : '<option value="">请选择</option>'}${available.map(option => `<option value="${escapeHtml(option.id)}"${option.id === selectedId ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}`;
  }
  function demandFieldHelpMarkup(copy) {
    const safeCopy = escapeHtml(copy).replaceAll('\n','<br>');
    return `<span class="demand-field-help" tabindex="0" aria-label="查看属性说明">?<span class="demand-field-help-popover" role="tooltip">${safeCopy}</span></span>`;
  }
  function demandUserPickerMarkup(field, label, selected = '', required = false) {
    const selectedUser = platformUserDirectory.find(user => user.name === selected);
    const departmentGroups = [...new Set(platformUserDirectory.map(user => user.department))].map(department => ({
      department,
      users:platformUserDirectory.filter(user => user.department === department)
    }));
    return `<div class="field demand-person-field"><span class="field-label">${escapeHtml(label)}${required ? ' <em class="required-mark">*</em>' : ''}</span><input type="hidden" name="${escapeHtml(field)}" value="${escapeHtml(selected)}"><details class="demand-person-picker" data-demand-user-picker="${escapeHtml(field)}"><summary><span data-demand-user-summary>${escapeHtml(selected || '请选择用户')}</span><i>⌄</i></summary><div class="demand-person-picker-panel"><label class="demand-person-search"><span aria-hidden="true">⌕</span><input type="search" data-demand-user-search placeholder="搜索姓名或部门" autocomplete="off"></label><div class="demand-person-tree">${departmentGroups.map(group => `<details class="demand-person-department" open data-user-department="${escapeHtml(group.department)}"><summary><span>▾</span><b>${escapeHtml(group.department)}</b><small>${group.users.length}人</small></summary><div>${group.users.map(user => `<button type="button" class="demand-person-option${user.name === selected ? ' selected' : ''}" data-user-picker-value="${escapeHtml(user.name)}" data-user-picker-search-value="${escapeHtml(`${user.name} ${user.department}`.toLowerCase())}" aria-pressed="${user.name === selected ? 'true' : 'false'}"><span class="demand-person-avatar">${escapeHtml(user.name.slice(0,1))}</span><span><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.id)}</small></span><i>${user.name === selected ? '✓' : ''}</i></button>`).join('')}</div></details>`).join('')}</div>${required ? '' : '<button type="button" class="demand-person-clear" data-user-picker-clear>清空选择</button>'}</div></details><small data-demand-user-meta>${selectedUser ? `${escapeHtml(selectedUser.department)} · ` : ''}平台全部用户可见，按部门展示，支持搜索与单选</small></div>`;
  }
  function demandStatusClass(status) {
    return ({'待创建任务':'warning','任务处理中':'info','已完成':'success','已取消':'error'})[status] || 'info';
  }
  function syncDemandFilterOptions() {
    const fields = [['demandPriorityFilter','priority'],['demandProductLevelFilter','productLevel'],['demandChannelFilter','channelCategory'],['demandSourceFilter','demandSource']];
    fields.forEach(([id,field]) => {
      const select = $(`#${id}`);
      if (!select) return;
      const selected = select.value;
      select.innerHTML = demandOptionMarkup(field, selected, '', true);
      const renderedValues = new Set([...select.options].map(option => option.value.toLowerCase()));
      const historicalValues = [...new Set(visualDemands.map(item => normalizeDemandOptionSelection(field,item[field])).filter(Boolean))]
        .filter(value => !renderedValues.has(value.toLowerCase()));
      select.insertAdjacentHTML('beforeend', historicalValues.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(demandOptionDisplayValue(field,value) || value)}</option>`).join(''));
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
    });
    const syncPersonFilter = (id,key) => {
      const select = $(`#${id}`);
      if (!select) return;
      const selected = select.value;
      const people = [...new Set([...platformUserDirectory.map(user => user.name),...visualDemands.map(item => item[key]).filter(Boolean)])].sort((a,b) => a.localeCompare(b,'zh-CN'));
      select.innerHTML = `<option value="">全部</option>${people.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
      if (people.includes(selected)) select.value = selected;
    };
    syncPersonFilter('demandOwnerFilter','owner');
    syncPersonFilter('demandRequesterFilter','requester');
  }
  function renderVisualDemands() {
    if (!$('#visualDemandRows')) return;
    syncDemandFilterOptions();
    const demandId = ($('#demandIdFilter')?.value || '').trim().toLowerCase();
    const demandName = ($('#demandNameFilter')?.value || '').trim().toLowerCase();
    const priority = $('#demandPriorityFilter')?.value || '';
    const productLevel = $('#demandProductLevelFilter')?.value || '';
    const spu = ($('#demandSpuFilter')?.value || '').trim().toLowerCase();
    const channel = $('#demandChannelFilter')?.value || '';
    const demandSource = $('#demandSourceFilter')?.value || '';
    const owner = $('#demandOwnerFilter')?.value || '';
    const ddlStart = $('#demandDdlStartDate')?.value || '';
    const ddlEnd = $('#demandDdlEndDate')?.value || '';
    const requestStart = $('#demandRequestStartDate')?.value || '';
    const requestEnd = $('#demandRequestEndDate')?.value || '';
    const requester = $('#demandRequesterFilter')?.value || '';
    const optionMatches = (field,value,selected) => !selected || normalizeDemandOptionSelection(field,value) === selected;
    const list = visualDemands.filter(item => {
      return (!demandId || String(item.id || '').toLowerCase().includes(demandId))
        && (!demandName || String(item.title || '').toLowerCase().includes(demandName))
        && (!spu || String(item.spu || '').toLowerCase().includes(spu))
        && optionMatches('priority',item.priority,priority)
        && optionMatches('productLevel',item.productLevel,productLevel)
        && optionMatches('channelCategory',item.channelCategory,channel)
        && optionMatches('demandSource',item.demandSource,demandSource)
        && (!owner || item.owner === owner)
        && (!ddlStart || item.ddl >= ddlStart)
        && (!ddlEnd || item.ddl <= ddlEnd)
        && (!requestStart || item.requestDate >= requestStart)
        && (!requestEnd || item.requestDate <= requestEnd)
        && (!requester || item.requester === requester);
    });
    $('#demandMetricAll').textContent = visualDemands.length.toLocaleString('zh-CN');
    $('#demandMetricPending').textContent = visualDemands.filter(item => item.status === '待创建任务').length.toLocaleString('zh-CN');
    $('#demandMetricRunning').textContent = visualDemands.filter(item => item.status === '任务处理中').length.toLocaleString('zh-CN');
    $('#demandMetricDone').textContent = visualDemands.filter(item => item.status === '已完成').length.toLocaleString('zh-CN');
    $('#visualDemandRows').innerHTML = list.length ? list.map(item => {
      const taskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : [];
      const primaryAction = item.status === '待创建任务'
        ? `<button class="table-link primary-link" data-demand-task="${escapeHtml(item.id)}">创建任务</button>`
        : taskIds.length ? `<button class="table-link" data-demand-linked-task="${escapeHtml(taskIds.at(-1))}">查看任务</button>` : '';
      return `<tr data-demand-row="${escapeHtml(item.id)}"><td class="demand-identity-cell"><b>${escapeHtml(item.title || '未命名需求')}</b><small>${escapeHtml(item.id || '—')}</small></td><td><span class="demand-priority ${escapeHtml((item.priority || '').toLowerCase())}">${escapeHtml(demandOptionDisplayValue('priority', item.priority) || '—')}</span></td><td>${escapeHtml(demandOptionDisplayValue('productLevel', item.productLevel) || '—')}</td><td>${escapeHtml(item.spu || '—')}</td><td>${escapeHtml(demandOptionDisplayValue('channelCategory', item.channelCategory) || '—')}</td><td>${escapeHtml(demandOptionDisplayValue('demandSource', item.demandSource) || '—')}</td><td>${escapeHtml(item.owner || '—')}</td><td class="demand-date-cell"><span><small>下需</small>${escapeHtml(item.requestDate || '—')}</span><span><small>DDL</small>${escapeHtml(item.ddl || '—')}</span></td><td>${escapeHtml(item.requester || '—')}</td><td><span class="status ${demandStatusClass(item.status)}">${escapeHtml(item.status || '待创建任务')}</span></td><td>${taskIds.length ? `<b>${taskIds.length} 个</b><small>${escapeHtml(taskIds.at(-1))}</small>` : '<span class="muted-text">尚未创建</span>'}</td><td><div class="demand-row-actions"><button class="table-link" data-demand-detail="${escapeHtml(item.id)}">详情</button><button class="table-link" data-demand-edit="${escapeHtml(item.id)}">编辑</button>${primaryAction}</div></td></tr>`;
    }).join('') : '<tr><td colspan="12" class="empty-cell">未找到匹配的视觉需求</td></tr>';
    $('#visualDemandCount').textContent = `共 ${list.length} 条`;
  }
  function demandFormMarkup(item = {}) {
    const isNew = !item.id;
    const business = item.businessChannel || (isNew ? 'DTC' : '');
    const productLevel = item.productLevel || (isNew ? 'NONE' : '');
    const demandSource = item.demandSource || (isNew ? 'MATERIAL_REQUEST' : '');
    const channelCategory = item.channelCategory || (isNew ? 'Paid-Social' : '');
    const requester = Object.prototype.hasOwnProperty.call(item,'requester') ? item.requester : currentUserContext.name;
    const owner = item.owner || '';
    return `<form class="visual-demand-form dialog-wide-content" id="visualDemandForm" novalidate>
      <div class="demand-form-section"><div class="demand-form-section-title"><b>基础信息</b><span>带 * 为必填项</span></div><div class="demand-form-grid">
        <label class="field demand-form-wide"><span class="field-label">需求名称 <em class="required-mark">*</em></span><input name="title" maxlength="120" value="${escapeHtml(item.title || '')}" placeholder="例如：秋冬新品 Paid Social 短视频" required></label>
        <label class="field"><span class="field-label">需求SPU <em class="required-mark">*</em></span><input name="spu" value="${escapeHtml(item.spu || '')}" placeholder="输入 SPU 或项目编号" required></label>
        <label class="field"><span class="field-label">业务渠道 <em class="required-mark">*</em></span><select name="businessChannel" id="demandBusinessChannel" required>${demandOptionMarkup('businessChannel', business)}</select></label>
        <label class="field"><span class="field-label">产品级别 ${demandFieldHelpMarkup('爆品Top5，旺销Top5-10，潜力Top10-20')} <em class="required-mark">*</em></span><select name="productLevel" required>${demandOptionMarkup('productLevel', productLevel)}</select></label>
        <label class="field"><span class="field-label">需求来源 ${demandFieldHelpMarkup('1.视觉组提起 (按产品的级别)\n2.素材下需 (提需方发起)')} <em class="required-mark">*</em></span><select name="demandSource" required>${demandOptionMarkup('demandSource', demandSource)}</select></label>
        <label class="field"><span class="field-label">下需时间 <em class="required-mark">*</em></span><input name="requestDate" type="date" value="${escapeHtml(item.requestDate || today())}" required></label>
        <label class="field"><span class="field-label">DDL <em class="required-mark">*</em></span><input name="ddl" type="date" value="${escapeHtml(item.ddl || '')}" required></label>
        <label class="field"><span class="field-label">渠道归类 ${demandFieldHelpMarkup('1.Paid Social 社交广告（Meta=FB/INS / TikTok=TK / Snapchat）\n2.Paid Search 搜索广告（Google / Bing）=GG/BING\n3.Email 邮件营销 =EDM')} <em class="required-mark">*</em></span><select name="channelCategory" id="demandChannelCategory" required>${demandOptionMarkup('channelCategory', channelCategory, business)}</select></label>
        <label class="field"><span class="field-label">素材格式 <em class="required-mark">*</em></span><select name="materialType" id="demandMaterialType" required>${demandOptionMarkup('materialType', item.materialType || '', business)}</select></label>
      </div></div>
      <div class="demand-form-section"><div class="demand-form-section-title"><b>内容与制作要求</b><span>描述素材表达与交付要求</span></div><div class="demand-form-grid">
        <label class="field"><span class="field-label">表达方式 <em class="required-mark">*</em></span><select name="expression" id="demandExpression" required>${demandOptionMarkup('expression', item.expression || '', business)}</select></label>
        <label class="field"><span class="field-label">主卖点 <em class="required-mark">*</em></span><select name="mainSellingPoint" required>${demandOptionMarkup('mainSellingPoint', item.mainSellingPoint || '')}</select></label>
        <label class="field"><span class="field-label">场景 <em class="required-mark">*</em></span><select name="scene" required>${demandOptionMarkup('scene', item.scene || '')}</select></label>
        <label class="field"><span class="field-label">辅助卖点</span><select name="secondarySellingPoint">${demandOptionMarkup('secondarySellingPoint', item.secondarySellingPoint || '')}</select></label>
        <label class="field"><span class="field-label">模特体型</span><select name="bodyType">${demandOptionMarkup('bodyType', item.bodyType || '')}</select></label>
        <label class="field"><span class="field-label">素材类型 <em class="required-mark">*</em></span><select name="materialCategory" required>${demandOptionMarkup('materialCategory', item.materialCategory || '')}</select></label>
        <label class="field demand-form-full"><span class="field-label">制作要求</span><textarea name="requirements" rows="3" placeholder="描述尺寸、构图、文案、品牌规范等要求">${escapeHtml(item.requirements || '')}</textarea></label>
        <label class="field demand-form-full"><span class="field-label">制作参考</span><textarea name="reference" rows="3" placeholder="填写链接或参考说明，支持换行">${escapeHtml(item.reference || '')}</textarea></label>
        <label class="field demand-form-full"><span class="field-label">FB信息</span><textarea name="fbInfo" rows="3" placeholder="填写 FB 投放或版位信息，支持换行">${escapeHtml(item.fbInfo || '')}</textarea></label>
        <label class="field demand-form-full"><span class="field-label">EDM信息</span><textarea name="edmInfo" rows="3" placeholder="填写 EDM 主题或版位信息，支持换行">${escapeHtml(item.edmInfo || '')}</textarea></label>
      </div></div>
      <div class="demand-form-section"><div class="demand-form-section-title"><b>协作信息</b><span>明确需求与制作责任人</span></div><div class="demand-form-grid">
        ${demandUserPickerMarkup('requester','需求对接人',requester,true)}
        <label class="field"><span class="field-label">优先级 ${demandFieldHelpMarkup('日常安排 定义：P2常规，素材下需 定义：P1优先 或 P0紧急')} <em class="required-mark">*</em></span><select name="priority" required>${demandOptionMarkup('priority', item.priority || 'P2')}</select></label>
        ${demandUserPickerMarkup('owner','制作人',owner,true)}
      </div></div>
    </form>`;
  }
  function readDemandForm(existing = null) {
    const form = $('#visualDemandForm');
    const preservesDeletedOption = control => existing && control.matches('select[name]') && control.dataset.originalValue && control.dataset.userChanged !== 'true' && !demandOptionByValue(control.name, control.dataset.originalValue);
    const missingRequired = [...form.querySelectorAll('[required]')].find(control => !String(control.value || '').trim() && !preservesDeletedOption(control));
    if (missingRequired) {
      const fieldLabel = missingRequired.closest('.field')?.querySelector('.field-label')?.textContent.replace('*','').trim() || '必填项';
      const searchableSelect = missingRequired.closest('.demand-search-select');
      if (searchableSelect) { searchableSelect.open = true; $('[data-demand-search-input]', searchableSelect)?.focus(); }
      else missingRequired.focus();
      toast(`请填写${fieldLabel}`, 'warning');
      return null;
    }
    const preservedRequiredSelects = [...form.querySelectorAll('select[required]')].filter(preservesDeletedOption);
    preservedRequiredSelects.forEach(select => { select.required = false; });
    const isValid = form?.reportValidity();
    preservedRequiredSelects.forEach(select => { select.required = true; });
    if (!isValid) return null;
    const values = Object.fromEntries(new FormData(form).entries());
    if (existing) {
      $$('select[name]', form).forEach(select => {
        const originalValue = select.dataset.originalValue || '';
        if (!values[select.name] && originalValue && select.dataset.userChanged !== 'true' && !demandOptionByValue(select.name, originalValue)) values[select.name] = originalValue;
      });
    }
    if (!values.requester) { toast('请选择需求对接人', 'warning'); $('[data-demand-user-picker="requester"] > summary', form)?.focus(); return null; }
    if (!values.owner) { toast('请选择制作人', 'warning'); $('[data-demand-user-picker="owner"] > summary', form)?.focus(); return null; }
    if (values.ddl && values.requestDate && values.ddl < values.requestDate) { toast('DDL 不能早于下需时间', 'warning'); form.elements.ddl.focus(); return null; }
    const timestamp = nowText();
    return { ...(existing || {}), ...values, id:existing?.id || `VR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(Date.now()).slice(-4)}`, status:existing?.status || '待创建任务', linkedTaskIds:Array.isArray(existing?.linkedTaskIds) ? existing.linkedTaskIds : [], createdAt:existing?.createdAt || timestamp, updatedAt:timestamp };
  }
  function bindDemandUserPickers(form) {
    $$('[data-demand-user-picker]', form).forEach(picker => {
      const field = picker.dataset.demandUserPicker;
      const valueInput = form.elements[field];
      const summary = $('[data-demand-user-summary]', picker);
      const meta = picker.closest('.demand-person-field')?.querySelector('[data-demand-user-meta]');
      const updateSelection = value => {
        valueInput.value = value;
        summary.textContent = value || '请选择用户';
        const selectedUser = platformUserDirectory.find(user => user.name === value);
        if (meta) meta.textContent = `${selectedUser ? `${selectedUser.department} · ` : ''}平台全部用户可见，按部门展示，支持搜索与单选`;
        $$('.demand-person-option', picker).forEach(option => {
          const selected = option.dataset.userPickerValue === value;
          option.classList.toggle('selected', selected);
          option.setAttribute('aria-pressed', String(selected));
          $('i', option).textContent = selected ? '✓' : '';
        });
      };
      picker.addEventListener('click', event => {
        const option = event.target.closest('[data-user-picker-value]');
        if (option) { updateSelection(option.dataset.userPickerValue); picker.open = false; return; }
        if (event.target.closest('[data-user-picker-clear]')) { updateSelection(''); picker.open = false; }
      });
      const search = $('[data-demand-user-search]', picker);
      search?.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();
        $$('.demand-person-department', picker).forEach(group => {
          let visibleCount = 0;
          $$('.demand-person-option', group).forEach(option => {
            const visible = !query || option.dataset.userPickerSearchValue.includes(query);
            option.hidden = !visible;
            if (visible) visibleCount += 1;
          });
          group.hidden = visibleCount === 0;
          if (query && visibleCount) group.open = true;
        });
      });
      search?.addEventListener('click', event => event.stopPropagation());
    });
  }
  function enhanceDemandSearchableSelects(form) {
    $$('select', form).forEach(select => {
      if (select.dataset.demandSearchReady) return;
      select.dataset.demandSearchReady = 'true';
      const picker = document.createElement('details');
      picker.className = 'demand-search-select';
      select.before(picker);
      picker.appendChild(select);
      select.insertAdjacentHTML('beforebegin', '<summary><span data-demand-search-summary>请选择</span><i>⌄</i></summary>');
      select.insertAdjacentHTML('afterend', '<div class="demand-search-panel"><label class="demand-search-input"><span aria-hidden="true">⌕</span><input type="search" data-demand-search-input placeholder="搜索选项" autocomplete="off"></label><div class="demand-search-options" data-demand-search-options></div></div>');
      const summary = $('[data-demand-search-summary]', picker);
      const search = $('[data-demand-search-input]', picker);
      const optionList = $('[data-demand-search-options]', picker);
      const render = () => {
        const selected = select.selectedOptions[0];
        summary.textContent = selected?.textContent || '请选择';
        optionList.innerHTML = [...select.options].map(option => `<button type="button" class="demand-search-option${option.value === select.value ? ' selected' : ''}" data-demand-search-value="${escapeHtml(option.value)}" data-demand-search-text="${escapeHtml(`${option.textContent} ${option.value}`.toLowerCase())}" aria-pressed="${option.value === select.value ? 'true' : 'false'}"><span>${escapeHtml(option.textContent)}</span>${option.value === select.value ? '<i>✓</i>' : ''}</button>`).join('');
        const query = search.value.trim().toLowerCase();
        $$('[data-demand-search-value]', optionList).forEach(option => { option.hidden = !!query && !option.dataset.demandSearchText.includes(query); });
      };
      select._refreshDemandSearchSelect = render;
      render();
      picker.addEventListener('toggle', () => {
        if (!picker.open) return;
        $$('.demand-search-select[open]', form).forEach(other => { if (other !== picker) other.open = false; });
        search.value = '';
        render();
        requestAnimationFrame(() => search.focus());
      });
      picker.addEventListener('click', event => {
        const option = event.target.closest('[data-demand-search-value]');
        if (!option) return;
        select.dataset.userChanged = 'true';
        select.value = option.dataset.demandSearchValue;
        render();
        picker.open = false;
        select.dispatchEvent(new Event('change', { bubbles:true }));
      });
      search.addEventListener('click', event => event.stopPropagation());
      search.addEventListener('input', render);
    });
  }
  function bindDemandFormDependencies(existing = null) {
    const form = $('#visualDemandForm');
    if (!form) return;
    $$('select[name]', form).forEach(select => { select.dataset.originalValue = String(existing?.[select.name] || ''); });
    enhanceDemandSearchableSelects(form);
    bindDemandUserPickers(form);
    form.addEventListener('change', event => {
      if (event.target.name !== 'businessChannel') return;
      const business = event.target.value;
      [['demandChannelCategory','channelCategory'],['demandMaterialType','materialType'],['demandExpression','expression']].forEach(([id,field]) => {
        const select = $(`#${id}`, form); const current = select.value;
        select.innerHTML = demandOptionMarkup(field, current, business);
        if (![...select.options].some(option => option.value === current)) select.value = '';
        select._refreshDemandSearchSelect?.();
      });
    });
  }
  function openDemandFormDialog(demandId = '') {
    const existing = visualDemands.find(item => item.id === demandId) || null;
    openDialog(existing ? '编辑视觉需求' : '新建视觉需求', existing ? `${existing.id} · 修改后同步用于后续任务创建` : '登记完成后，可从需求列表创建 AI 素材任务', demandFormMarkup(existing || {}), existing ? '保存修改' : '保存视觉需求', () => {
      const record = readDemandForm(existing);
      if (!record) return;
      if (existing) visualDemands.splice(visualDemands.indexOf(existing), 1, record); else visualDemands.unshift(record);
      persistVisualDemands(); closeDialog(); renderVisualDemands(); toast(existing ? '视觉需求已更新' : '视觉需求已创建，可继续创建任务');
    });
    bindDemandFormDependencies(existing);
  }
  function demandTimestamp(value) {
    const timestamp = Date.parse(String(value || '').replace(' ', 'T'));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  function formatDemandProductionCycle(startedAt, endedAt) {
    const start = demandTimestamp(startedAt);
    const end = demandTimestamp(endedAt);
    if (start === null || end === null || end < start) return '—';
    const minutes = Math.max(0, Math.round((end - start) / 60000));
    if (!minutes) return '不足 1 分钟';
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', rest ? `${rest} 分钟` : ''].filter(Boolean).join(' ');
  }
  function demandRuntimePayload(state, completedAt = '', outputOverride = null) {
    const outputs = Array.isArray(outputOverride) ? outputOverride : Array.isArray(state?.outputs) ? state.outputs : [];
    const versionMap = new Map();
    outputs.forEach(output => {
      const attempt = Number(output.attempt) || 1;
      const nodeKey = output.nodeKey || 'unknown';
      const key = `${nodeKey}-${attempt}`;
      if (!versionMap.has(key)) versionMap.set(key, { nodeKey, nodeName:nodeMap[nodeKey]?.name || '未知节点', version:`v${attempt}`, generatedAt:output.time || '' });
    });
    return {
      startedAt:state?.startedAt || state?.createdAt || '',
      completedAt,
      versions:[...versionMap.values()],
      linkedAssets:outputs.map(output => ({ id:output.assetId || '', name:output.name || '未命名素材', type:output.type || '素材', nodeKey:output.nodeKey || '', nodeName:nodeMap[output.nodeKey]?.name || '未知节点', status:output.saved ? '已入库' : output.temporary === false ? '已生成' : '生成中' }))
    };
  }
  function latestDemandRuntime(item) {
    const taskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : [];
    const taskId = item.latestTaskId || taskIds.at(-1) || '';
    const runtime = taskId && item.taskRuntime?.[taskId] ? item.taskRuntime[taskId] : {};
    const taskRow = taskId ? tasks.find(row => row?.[7]?.id === taskId) : null;
    const taskMeta = taskRow?.[7] || {};
    const generationBatches = taskMeta.generationBatches && typeof taskMeta.generationBatches === 'object' ? taskMeta.generationBatches : {};
    const fallbackVersions = Object.entries(generationBatches).flatMap(([nodeKey,batches]) => (Array.isArray(batches) ? batches : []).map(batch => ({ nodeKey, nodeName:nodeMap[nodeKey]?.name || '未知节点', version:`v${Number(batch.attempt) || 1}`, generatedAt:batch.time || '' })));
    const fallbackAssets = taskId ? nodeOutputs.filter(output => output.taskId === taskId && output.saved).map(output => ({ id:output.assetId || '', name:output.name || '未命名素材', type:output.type || '素材', nodeKey:output.nodeKey || '', nodeName:nodeMap[output.nodeKey]?.name || '未知节点', status:'已入库' })) : [];
    const startedAt = runtime.startedAt || taskMeta.createdAt || item.taskStartedAt || '';
    const completedAt = runtime.completedAt || taskMeta.completedAt || item.completedAt || '';
    const updatedAt = runtime.updatedAt || item.updatedAt || nowText();
    return {
      taskId,
      progressStatus:runtime.progressStatus || item.status || '待创建任务',
      completedAt,
      productionCycle:runtime.productionCycle || formatDemandProductionCycle(startedAt, completedAt || updatedAt),
      versions:Array.isArray(runtime.versions) && runtime.versions.length ? runtime.versions : fallbackVersions,
      linkedAssets:Array.isArray(runtime.linkedAssets) && runtime.linkedAssets.length ? runtime.linkedAssets : fallbackAssets
    };
  }
  function demandDetailMarkup(item) {
    const pairs = [['需求名称',item.title],['需求SPU',item.spu],['业务渠道',demandOptionDisplayValue('businessChannel',item.businessChannel)],['产品级别',demandOptionDisplayValue('productLevel',item.productLevel)],['需求来源',demandOptionDisplayValue('demandSource',item.demandSource)],['下需时间',item.requestDate],['DDL',item.ddl],['渠道归类',demandOptionDisplayValue('channelCategory',item.channelCategory)],['素材格式',demandOptionDisplayValue('materialType',item.materialType)],['表达方式',demandOptionDisplayValue('expression',item.expression)],['主卖点',demandOptionDisplayList('mainSellingPoint',item.mainSellingPoint)],['场景',demandOptionDisplayValue('scene',item.scene)],['辅助卖点',demandOptionDisplayList('secondarySellingPoint',item.secondarySellingPoint)],['模特体型',demandOptionDisplayValue('bodyType',item.bodyType)],['素材类型',demandOptionDisplayValue('materialCategory',item.materialCategory)],['需求对接人',item.requester],['优先级',demandOptionDisplayValue('priority',item.priority)],['制作人',item.owner]];
    const runtime = latestDemandRuntime(item);
    const versionText = runtime.versions.length ? runtime.versions.map(version => typeof version === 'string' ? version : `${version.nodeName || nodeMap[version.nodeKey]?.name || '节点'} ${version.version || ''}`).join('、') : '任务执行后自动生成';
    const field = (label, value, wide = false) => `<div class="detail-field${wide ? ' detail-field-wide' : ''}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || '—')}</b></div>`;
    const notes = [['制作要求',item.requirements],['制作参考',item.reference],['FB信息',item.fbInfo],['EDM信息',item.edmInfo]];
    const linkedAssetMarkup = runtime.linkedAssets.length
      ? runtime.linkedAssets.map((asset, index) => `<div class="detail-field detail-field-wide"><span>关联素材 ${index + 1} · ${escapeHtml(asset.type || '素材')}</span><b>${escapeHtml(asset.name || '未命名素材')}<small>${escapeHtml(asset.id || '临时素材')} · ${escapeHtml(asset.nodeName || nodeMap[asset.nodeKey]?.name || '关联任务')} · ${escapeHtml(asset.status || '已关联')}</small></b></div>`).join('')
      : field('关联的素材', '任务产生素材后自动关联至此', true);
    return `<div class="visual-demand-detail dialog-wide-content">
      <section class="detail-section"><h3 class="detail-section-title">需求信息</h3><div class="detail-fields">${field('需求 ID', item.id)}${field('当前状态', runtime.progressStatus)}${pairs.map(([label,value]) => field(label, value)).join('')}</div></section>
      <section class="detail-section"><h3 class="detail-section-title">制作与投放说明</h3><div class="detail-fields">${notes.map(([label,value]) => field(label, value || '未填写', true)).join('')}</div></section>
      <section class="detail-section"><h3 class="detail-section-title">任务关联信息</h3><div class="detail-fields">${field('来源任务', runtime.taskId || '尚未创建任务')}${field('进度状态', runtime.progressStatus)}${field('完成时间', runtime.completedAt || '任务完成后同步')}${field('版本', versionText)}${field('制作周期', runtime.taskId ? runtime.productionCycle : '任务开始后计算')}${linkedAssetMarkup}</div></section>
    </div>`;
  }
  function openDemandOptionManager() {
    const workingConfig = JSON.parse(JSON.stringify(demandOptionConfig));
    Object.keys(demandOptionFieldLabels).forEach(field => {
      (workingConfig[field] || []).forEach(option => { option._originId = option.id; });
    });
    let activeField = Object.keys(demandOptionFieldLabels)[0];
    const identifierPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9-]+$/;
    const validateField = field => {
      const values = workingConfig[field] || [];
      if (!values.length) return '每个维度至少保留一个选项值';
      const identifiers = new Set();
      const labels = new Set();
      for (const option of values) {
        const identifier = String(option.id || '').trim();
        const label = String(option.label || '').trim();
        if (!identifierPattern.test(identifier)) return '英文标识仅支持英文字母、数字和连字符';
        if (!label) return '中文显示不能为空';
        const identifierKey = identifier.toLowerCase();
        if (identifiers.has(identifierKey)) return '同一维度中的英文标识必须唯一';
        if (labels.has(label)) return '同一维度中的中文显示不能重复';
        identifiers.add(identifierKey);
        labels.add(label);
      }
      return '';
    };
    const validateWorkingConfig = () => {
      for (const field of Object.keys(demandOptionFieldLabels)) {
        const message = validateField(field);
        if (message) return { field, message };
      }
      return null;
    };
    openDialog('配置维度选项值','删除仅影响后续新建与编辑下拉；修改会同步更新已有视觉需求和素材的显示',`<div class="demand-option-manager dialog-wide-content"><div class="demand-option-layout"><aside class="demand-option-dimensions"><div><span>维度</span><b>选择需配置的维度</b></div><div id="demandOptionDimensions"></div><p>新增选项默认对全部业务渠道可用。</p></aside><section class="demand-option-values-panel"><div class="demand-option-values-head"><div><span>维度选项值</span><b id="demandOptionActiveLabel"></b></div><small>删除保留存量显示；修改按稳定标识同步已有数据展示</small></div><div id="demandOptionItems"></div><div class="demand-option-add"><input id="newDemandOptionIdentifier" maxlength="64" pattern="[A-Za-z0-9-]+" title="仅支持英文字母、数字和连字符" placeholder="英文标识，如 Campaign"><input id="newDemandOptionLabel" maxlength="40" placeholder="中文显示，如 Campaign系列"><button class="button secondary" type="button" id="addDemandOption">新增选项值</button></div></section></div></div>`,'保存配置',() => {
      $$('[data-demand-option-identifier-index]', manager).forEach(input => { const option = workingConfig[activeField]?.[Number(input.dataset.demandOptionIdentifierIndex)]; if (option) option.id = input.value.trim(); });
      $$('[data-demand-option-label-index]', manager).forEach(input => { const option = workingConfig[activeField]?.[Number(input.dataset.demandOptionLabelIndex)]; if (option) option.label = input.value.trim(); });
      const invalid = validateWorkingConfig();
      if (invalid) { activeField = invalid.field; renderAll(); toast(invalid.message, 'warning'); return; }
      const nextConfig = normalizeDemandOptionConfiguration(workingConfig);
      const renames = {};
      Object.keys(demandOptionFieldLabels).forEach(field => {
        renames[field] = {};
        (workingConfig[field] || []).forEach(option => {
          if (option._originId && option._originId.toLowerCase() !== option.id.toLowerCase()) renames[field][option._originId] = option.id;
        });
      });
      rememberDemandOptionConfig(demandOptionConfig, nextConfig, renames);
      demandOptionConfig = nextConfig;
      persistDemandOptions(); closeDialog(); renderVisualDemands(); renderAssets($('#assetSearch')?.value.trim() || ''); toast('维度选项值已保存，存量显示已同步');
    });
    const body = $('#dialogBody');
    const manager = $('.demand-option-manager', body);
    const renderDimensions = () => {
      $('#demandOptionDimensions').innerHTML = Object.entries(demandOptionFieldLabels).map(([field,label]) => `<button type="button" class="demand-option-dimension${field === activeField ? ' active' : ''}" data-demand-option-field="${escapeHtml(field)}"><span>${escapeHtml(label)}</span><small>${(workingConfig[field] || []).length} 项</small></button>`).join('');
    };
    const renderItems = () => {
      const values = workingConfig[activeField] || [];
      $('#demandOptionActiveLabel').textContent = demandOptionFieldLabels[activeField];
      $('#demandOptionItems').innerHTML = values.length ? `<div class="demand-option-list"><div class="demand-option-list-head"><span>序号</span><b>英文标识</b><b>中文显示</b><i>操作</i></div>${values.map((option,index) => `<div class="demand-option-item"><span>${index + 1}</span><label><span>英文标识</span><input data-demand-option-identifier-index="${index}" pattern="[A-Za-z0-9-]+" title="仅支持英文字母、数字和连字符" value="${escapeHtml(option.id)}" autocomplete="off" spellcheck="false"></label><label><span>中文显示</span><input data-demand-option-label-index="${index}" value="${escapeHtml(option.label)}" autocomplete="off"></label><button type="button" data-delete-demand-option="${index}" aria-label="删除 ${escapeHtml(option.label)}">删除</button></div>`).join('')}</div>` : '<div class="demand-option-empty">当前维度暂无选项值</div>';
    };
    const renderAll = () => { renderDimensions(); renderItems(); };
    renderAll();
    const handleOptionEdit = event => {
      const identifierInput = event.target.closest('[data-demand-option-identifier-index]');
      if (identifierInput) {
        const index = Number(identifierInput.dataset.demandOptionIdentifierIndex);
        const option = workingConfig[activeField][index];
        const oldIdentifier = option.id;
        const nextIdentifier = identifierInput.value.trim();
        if (!identifierPattern.test(nextIdentifier)) { identifierInput.value = oldIdentifier; toast('英文标识仅支持英文字母、数字和连字符', 'warning'); return; }
        if (workingConfig[activeField].some((item,itemIndex) => itemIndex !== index && item.id.toLowerCase() === nextIdentifier.toLowerCase())) { identifierInput.value = oldIdentifier; toast('同一维度中的英文标识必须唯一', 'warning'); return; }
        option.id = nextIdentifier;
        if (workingConfig.scopes?.[activeField]?.[oldIdentifier]) { workingConfig.scopes[activeField][nextIdentifier] = workingConfig.scopes[activeField][oldIdentifier]; delete workingConfig.scopes[activeField][oldIdentifier]; }
        return;
      }
      const labelInput = event.target.closest('[data-demand-option-label-index]');
      if (!labelInput) return;
      const index = Number(labelInput.dataset.demandOptionLabelIndex);
      const option = workingConfig[activeField][index];
      const oldLabel = option.label;
      const nextLabel = labelInput.value.trim();
      if (!nextLabel || workingConfig[activeField].some((item,itemIndex) => itemIndex !== index && item.label === nextLabel)) { labelInput.value = oldLabel; toast('中文显示不能为空或重复', 'warning'); return; }
      option.label = nextLabel;
    };
    manager.addEventListener('input', event => {
      const identifierInput = event.target.closest('[data-demand-option-identifier-index], #newDemandOptionIdentifier');
      if (identifierInput) identifierInput.value = identifierInput.value.replace(/[^A-Za-z0-9-]/g, '');
      handleOptionEdit(event);
    });
    manager.addEventListener('change', handleOptionEdit);
    manager.addEventListener('click', event => {
      const dimensionButton = event.target.closest('[data-demand-option-field]');
      if (dimensionButton) { activeField = dimensionButton.dataset.demandOptionField; renderAll(); return; }
      if (event.target.closest('#addDemandOption')) {
        const identifierInput = $('#newDemandOptionIdentifier');
        const labelInput = $('#newDemandOptionLabel');
        const identifier = identifierInput.value.trim();
        const label = labelInput.value.trim();
        if (!identifierPattern.test(identifier)) { identifierInput.focus(); toast('英文标识仅支持英文字母、数字和连字符', 'warning'); return; }
        if (!label) { labelInput.focus(); toast('请输入中文显示', 'warning'); return; }
        if ((workingConfig[activeField] || []).some(option => option.id.toLowerCase() === identifier.toLowerCase())) { identifierInput.focus(); toast('同一维度中的英文标识必须唯一', 'warning'); return; }
        if ((workingConfig[activeField] || []).some(option => option.label === label)) { labelInput.focus(); toast('同一维度中的中文显示不能重复', 'warning'); return; }
        workingConfig[activeField].push({ id:identifier, label });
        identifierInput.value = ''; labelInput.value = ''; renderAll();
        return;
      }
      const button = event.target.closest('[data-delete-demand-option]'); if (!button) return;
      const index = Number(button.dataset.deleteDemandOption); const option = workingConfig[activeField][index];
      if ((workingConfig[activeField] || []).length <= 1) { toast('每个维度至少保留一个选项值', 'warning'); return; }
      workingConfig[activeField].splice(index,1); if (workingConfig.scopes?.[activeField]) delete workingConfig.scopes[activeField][option.id]; renderAll();
    });
  }
  function ensureSelectOption(select, value) {
    if (!select || !value) return;
    if (![...select.options].some(option => option.value === value || option.textContent === value)) select.add(new Option(value,value));
    select.value = value;
  }
  function suggestedNodesForDemand(item) {
    const expression = normalizeDemandOptionSelection('expression', item.expression || '');
    if (/^(AI-PD|Shoot-PD|UI)$/.test(expression)) return ['clean','detail'];
    if (/^(AI-MP|Shoot-MP|TTS-UGC|IG-UGC|Sale|New|Campaign|Flow|Marketing-Theme|AI-UGC)$/.test(expression)) return ['scene','detail'];
    if (/^(Remix|Model-Retouch)$/.test(expression)) return ['detail'];
    return item.materialType === 'VID' ? ['scene','detail'] : ['clean','scene','detail'];
  }
  function updateVisualDemandSourceBanner() {
    const banner = $('#visualDemandSourceBanner');
    const item = visualDemands.find(demand => demand.id === activeVisualDemandId);
    if (!banner) return;
    banner.hidden = !item;
    if (!item) return;
    $('#visualDemandSourceTitle').textContent = item.title;
    $('#visualDemandSourceMeta').textContent = `${item.id} · ${demandOptionDisplayValue('businessChannel',item.businessChannel)}/${demandOptionDisplayValue('channelCategory',item.channelCategory)} · ${demandOptionDisplayValue('materialType',item.materialType)}/${demandOptionDisplayValue('expression',item.expression)} · DDL ${item.ddl}`;
  }
  function startTaskFromDemand(demandId) {
    const item = visualDemands.find(demand => demand.id === demandId);
    if (!item) return;
    activeVisualDemandId = item.id; activeDraftId = null; runState = null; restoredDraftState = null; restoredDraftConfigs = null;
    $('#taskName').value = `${item.title} - AI素材任务`.slice(0,TASK_NAME_MAX_LENGTH);
    $('#nameCount').textContent = $('#taskName').value.length.toLocaleString('zh-CN');
    ensureSelectOption($('#requesterSelect'), item.requester);
    ensureSelectOption($('#businessLineSelect'), item.businessChannel === 'AMZ' ? '海外电商' : item.businessChannel === 'DTC' ? '品牌电商' : '内容营销');
    const nodes = suggestedNodesForDemand(item);
    $$('.node-card').forEach(card => { const selected = nodes.includes(card.dataset.node); card.classList.toggle('selected',selected); $('.node-check input',card).checked = selected; });
    restoredDraftConfigs = Object.fromEntries(nodes.map(key => [key,{...defaultConfigs[key],mediaType:item.materialType === 'VID' ? '视频' : '图片',requirements:[item.requirements,item.mainSellingPoint ? `主卖点：${demandOptionDisplayList('mainSellingPoint',item.mainSellingPoint)}` : '',item.scene ? `场景：${demandOptionDisplayValue('scene',item.scene)}` : ''].filter(Boolean).join('\n')} ]));
    showView('workspace'); setCreationStage(1); updateNodeSummary(); updateVisualDemandSourceBanner(); markDirty();
    toast(`已从视觉需求 ${item.id} 带入任务信息与建议节点`, 'info');
  }
  function startStandaloneTask() {
    activeVisualDemandId = null;
    activeDraftId = null;
    runState = null;
    restoredDraftState = null;
    restoredDraftConfigs = null;
    activePreviewVersion = null;
    activePreviewKind = 'material';
    $('#taskName').disabled = false;
    $('#taskName').value = '';
    $('#nameCount').textContent = '0';
    [$('#orgSelect'),$('#requesterSelect'),$('#businessLineSelect')].forEach(select => { if (select) { select.disabled = false; select.selectedIndex = 0; } });
    $('#loadTemplate').disabled = false;
    $$('.node-card').forEach(card => { card.classList.remove('selected'); $('.node-check input',card).checked = false; });
    $('#saveState').textContent = '未保存';
    updateWorkflow();
    updateNodeSummary();
    updateVisualDemandSourceBanner();
    showView('workspace');
    setCreationStage(1);
    $('#taskName').focus();
  }
  function updateDemandTaskState(demandId, status, taskId = '', runtimePatch = {}) {
    const item = visualDemands.find(demand => demand.id === demandId);
    if (!item) return;
    const updatedAt = nowText();
    item.status = status; item.updatedAt = updatedAt;
    item.linkedTaskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : [];
    if (taskId && !item.linkedTaskIds.includes(taskId)) item.linkedTaskIds.push(taskId);
    if (taskId) {
      item.latestTaskId = taskId;
      item.taskRuntime = item.taskRuntime && typeof item.taskRuntime === 'object' ? item.taskRuntime : {};
      const previous = item.taskRuntime[taskId] && typeof item.taskRuntime[taskId] === 'object' ? item.taskRuntime[taskId] : {};
      const next = { ...previous, ...runtimePatch, taskId, progressStatus:status, updatedAt };
      next.startedAt = next.startedAt || previous.startedAt || '';
      next.completedAt = next.completedAt || '';
      next.versions = Array.isArray(next.versions) ? next.versions : [];
      next.linkedAssets = Array.isArray(next.linkedAssets) ? next.linkedAssets : [];
      next.productionCycle = formatDemandProductionCycle(next.startedAt, next.completedAt || updatedAt);
      item.taskRuntime[taskId] = next;
    }
    persistVisualDemands(); renderVisualDemands();
  }

  function renderTasks(filter = '') {
    if (!$('#taskRows')) return;
    syncTaskOwnerFilterOptions();
    const type = $('#taskTypeFilter')?.value || '全部';
    const status = $('#taskStatusFilter')?.value || '全部';
    const creator = $('#taskCreatorFilter')?.value || '全部创建人';
    const org = $('#taskOrgFilter')?.value || '全部部门';
    const list = tasks.filter(row => {
      const owner = taskOwnerParts(row);
      return row[0].includes(filter) && (type === '全部' || row[1] === type) && (status === '全部' || row[5] === status) && (creator === '全部创建人' || owner.creator === creator) && (org === '全部部门' || owner.org === org) && matchesTimeFilter(row[7]?.createdAt || row[6], 'tasks');
    });
    const statusClasses = { '已完成':'success', '已终止并入库':'warning', '已终止':'error', '暂存':'info' };
    $('#taskRows').innerHTML = list.length ? list.map(row => {
      const meta = row[7] || {};
      const breakdown = taskNodeBreakdown(row);
      const plannedCount = taskRouteKeys(row).length;
      const executionSummary = breakdown.length
        ? `已执行 ${breakdown.length} 个节点 · 入库 ${taskStoredTotal(row, breakdown)} 份`
        : row[5] === '暂存' ? `计划 ${plannedCount} 个节点 · 尚未执行` : '暂无节点执行明细';
      const formattedQuota = formatCny(taskTotalQuota(row, breakdown));
      return `<tr data-editor-row-key="${escapeHtml(meta.id || row[0])}"><td><b>${escapeHtml(row[0])}</b><small>${escapeHtml(meta.id || '历史任务')}</small></td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}<small>${escapeHtml(executionSummary)}</small></td><td>${escapeHtml(row[3])}</td><td>${formattedQuota}</td><td><span class="status ${statusClasses[row[5]] || 'info'}">${escapeHtml(row[5])}</span></td><td>${escapeHtml(row[6])}</td><td><button class="table-link task-detail" data-index="${tasks.indexOf(row)}">详情</button></td></tr>`;
    }).join('') : `<tr><td colspan="8" class="empty-cell">${hasActiveTimeFilter('tasks') ? '所选时间区间内未找到匹配任务' : '未找到匹配任务'}</td></tr>`;
    $('.pagination span', $('#taskRows').closest('.list-panel')).textContent = `共 ${list.length} 条`;
  }
  function taskOwnerParts(row) {
    const [org = '', creator = ''] = String(row[3] || '').split(' / ');
    return { creator, org };
  }
  function syncTaskOwnerFilterOptions() {
    const creatorSelect = $('#taskCreatorFilter');
    const orgSelect = $('#taskOrgFilter');
    if (!creatorSelect || !orgSelect) return;
    const currentCreator = creatorSelect.value || '全部创建人';
    const currentOrg = orgSelect.value || '全部部门';
    const creators = [...new Set(tasks.map(row => taskOwnerParts(row).creator).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN'));
    const orgs = [...new Set(tasks.map(row => taskOwnerParts(row).org).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN'));
    creatorSelect.innerHTML = `<option>全部创建人</option>${creators.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
    orgSelect.innerHTML = `<option>全部部门</option>${orgs.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
    creatorSelect.value = creators.includes(currentCreator) ? currentCreator : '全部创建人';
    orgSelect.value = orgs.includes(currentOrg) ? currentOrg : '全部部门';
  }
  function assetTagIds(row) {
    const ids = Array.isArray(row?.[8]?.tagIds) ? row[8].tagIds.map(String) : [];
    return [...new Set(ids)].filter(id => assetTags.some(tag => tag.id === id));
  }
  function assetTagItems(row) {
    const ids = new Set(assetTagIds(row));
    return assetTags.filter(tag => ids.has(tag.id));
  }
  function assetTagMarkup(row, emptyText = '未设置') {
    const tags = assetTagItems(row);
    if (!tags.length) return `<span class="asset-tag-empty">${escapeHtml(emptyText)}</span>`;
    return `<div class="asset-tag-list">${tags.map(tag => `<span class="asset-tag-chip">${escapeHtml(tag.name)}</span>`).join('')}</div>`;
  }
  function assetTagUsageCount(tagId) {
    return assets.filter(row => assetTagIds(row).includes(tagId)).length;
  }
  function canViewDepartmentAssets() { return ['all','department'].includes(currentUserContext.assetVisibility); }
  function assetVisibleToCurrentUser(row) {
    const owner = assetProducerParts(row);
    if (currentUserContext.assetVisibility === 'all') return true;
    if (!owner.producer || !owner.producerDepartment) return false;
    return owner.producer === currentUserContext.name || (currentUserContext.assetVisibility === 'department' && owner.producerDepartment === currentUserContext.org);
  }
  function permittedAssets() { return assets.filter(assetVisibleToCurrentUser); }
  function assetGeneratedDate(row) {
    const match = String(row?.[7] || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
  }
  function shiftCalendarMonth(date, offset) {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + offset);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
  }
  function assetExpiryDate(row) {
    const generated = assetGeneratedDate(row);
    if (!generated) return null;
    const expiry = new Date(generated);
    expiry.setFullYear(expiry.getFullYear() + 1);
    return expiry;
  }
  function assetStatus(row, now = new Date()) {
    const expiry = assetExpiryDate(row);
    return row[6] === '已过期' || (expiry && now >= expiry) ? '已过期' : '正常';
  }
  function isAssetDueSoon(row, now = new Date()) {
    const expiry = assetExpiryDate(row);
    return assetStatus(row, now) === '正常' && Boolean(expiry) && now >= shiftCalendarMonth(expiry, -1) && now < expiry;
  }
  function refreshAssetRetention() {
    const now = new Date();
    let changed = false;
    assets.forEach(row => {
      if (assetStatus(row, now) !== '已过期' || row[6] === '已过期') return;
      row[6] = '已过期';
      row[8] = { ...(row[8] || {}), previewSrc:'', expiredAt:nowText() };
      changed = true;
    });
    if (changed) persistAssetStorageState();
    const dueSoon = permittedAssets().filter(row => isAssetDueSoon(row, now));
    $('#assetRetentionBanner').hidden = dueSoon.length === 0;
    $('#assetRetentionCount').textContent = dueSoon.length.toLocaleString('zh-CN');
    return dueSoon;
  }
  const assetMultiFilterKeys = ['sourceTask','sourceNode','tag','org','creator','materialCategory','expression'];
  const assetMultiFilterState = Object.fromEntries(assetMultiFilterKeys.map(key => [key,new Set()]));
  function commaSeparatedFilterValues(selector) {
    return String($(selector)?.value || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  }
  function matchesCommaSeparatedFilter(values, actualValue) {
    return !values.length || values.includes(String(actualValue || '').trim().toLowerCase());
  }
  function assetMultiFilterOptions(field) {
    const pool = permittedAssets();
    const unique = (values, displayField = '') => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
      .sort((a,b) => String(displayField ? demandOptionDisplayValue(displayField,a) : a).localeCompare(String(displayField ? demandOptionDisplayValue(displayField,b) : b), 'zh-CN'))
      .map(value => ({ value, label:displayField ? demandOptionDisplayValue(displayField,value) : value }));
    if (field === 'sourceTask') return unique(pool.map(row => assetSourceParts(row).sourceTask));
    if (field === 'sourceNode') {
      const tasks = assetMultiFilterState.sourceTask;
      const scopedPool = tasks.size ? pool.filter(row => tasks.has(assetSourceParts(row).sourceTask)) : pool;
      return unique(scopedPool.map(row => assetSourceParts(row).sourceNode));
    }
    if (field === 'tag') {
      const options = assetTags.map(tag => ({ value:String(tag.id), label:String(tag.name) }));
      return pool.some(row => assetTagIds(row).length === 0) ? [{ value:'__untagged__', label:'无标签' },...options] : options;
    }
    if (field === 'org') {
      if (!canViewDepartmentAssets()) return [{ value:currentUserContext.org, label:currentUserContext.org }];
      return unique(pool.map(row => assetProducerParts(row).producerDepartment));
    }
    if (field === 'creator') {
      const orgs = assetMultiFilterState.org;
      const scopedPool = orgs.size ? pool.filter(row => orgs.has(assetProducerParts(row).producerDepartment)) : pool;
      const options = unique(scopedPool.map(assetProducerName));
      return scopedPool.some(row => !assetProducerName(row)) ? [{ value:'__unassigned__', label:'未填写' },...options] : options;
    }
    if (field === 'materialCategory' || field === 'expression') {
      const configured = (demandOptionConfig[field] || []).map(option => ({ value:String(option.id), label:String(option.label) }));
      const configuredValues = new Set(configured.map(option => option.value));
      const historical = unique(pool.map(row => row[8]?.[field]), field).filter(option => !configuredValues.has(option.value));
      return [...configured,...historical];
    }
    return [];
  }
  function updateAssetMultiFilterSummary(details, options = assetMultiFilterOptions(details.dataset.assetMultiFilter)) {
    const selected = assetMultiFilterState[details.dataset.assetMultiFilter] || new Set();
    const labels = options.filter(option => selected.has(option.value)).map(option => option.label);
    const summary = $('[data-asset-multi-summary]', details);
    if (!summary) return;
    summary.textContent = labels.length > 2 ? `已选 ${labels.length} 项` : labels.length ? labels.join('、') : details.dataset.allLabel;
    summary.title = labels.join('、');
  }
  function syncAssetMultiFilterOptions() {
    $$('[data-asset-multi-filter]').forEach(details => {
      const field = details.dataset.assetMultiFilter;
      const selected = assetMultiFilterState[field];
      const options = assetMultiFilterOptions(field);
      const validValues = new Set(options.map(option => option.value));
      [...selected].forEach(value => { if (!validValues.has(value)) selected.delete(value); });
      const list = $('.asset-multi-options', details);
      list.innerHTML = options.length ? options.map(option => `<label class="asset-multi-option" data-search="${escapeHtml(option.label.toLowerCase())}"><input type="checkbox" value="${escapeHtml(option.value)}" ${selected.has(option.value) ? 'checked' : ''}><span>${escapeHtml(option.label)}</span></label>`).join('') : '<div class="asset-multi-empty">暂无可选项</div>';
      const search = $('[data-asset-multi-search]', details);
      if (search) search.value = '';
      updateAssetMultiFilterSummary(details, options);
    });
  }
  function closeAssetMultiFilters(except = null) {
    $$('[data-asset-multi-filter][open]').forEach(details => { if (details !== except) details.open = false; });
  }
  function clearAssetFilters({ keepTaskId = '' } = {}) {
    ['#assetIdFilter','#assetSearch','#assetDemandIdFilter','#assetTaskIdFilter','#assetSpuFilter'].forEach(selector => { const input = $(selector); if (input) input.value = ''; });
    if ($('#assetTaskIdFilter')) $('#assetTaskIdFilter').value = keepTaskId;
    if ($('#assetTypeFilter')) $('#assetTypeFilter').value = '全部';
    if ($('#assetStatusFilter')) $('#assetStatusFilter').value = '';
    assetMultiFilterKeys.forEach(key => assetMultiFilterState[key].clear());
    closeAssetMultiFilters();
    syncAssetMultiFilterOptions();
  }
  function renderAssets(filter = '') {
    refreshAssetRetention();
    const permitted = permittedAssets();
    const downloadableIds = new Set(permitted.filter(row => assetStatus(row) === '正常').map(row => row[1]));
    selectedAssetIds = new Set([...selectedAssetIds].filter(id => downloadableIds.has(id)));
    syncAssetMultiFilterOptions();
    const type = $('#assetTypeFilter')?.value || '全部';
    const status = $('#assetStatusFilter')?.value || '';
    const assetIds = commaSeparatedFilterValues('#assetIdFilter');
    const demandIds = commaSeparatedFilterValues('#assetDemandIdFilter');
    const taskIds = commaSeparatedFilterValues('#assetTaskIdFilter');
    const spus = commaSeparatedFilterValues('#assetSpuFilter');
    const search = String(filter || $('#assetSearch')?.value || '').trim().toLowerCase();
    const list = permitted.filter(row => {
      const { sourceTask, sourceNode } = assetSourceParts(row);
      const owner = assetProducerParts(row);
      const tagIds = assetTagIds(row);
      const metadata = row[8] || {};
      const selectedTags = assetMultiFilterState.tag;
      const matchesTag = !selectedTags.size || [...selectedTags].some(tag => tag === '__untagged__' ? tagIds.length === 0 : tagIds.includes(tag));
      return (!search || String(row[0]).toLowerCase().includes(search) || buildAssetNaming(row).toLowerCase().includes(search))
        && matchesCommaSeparatedFilter(assetIds, row[1])
        && matchesCommaSeparatedFilter(demandIds, metadata.visualDemandId)
        && matchesCommaSeparatedFilter(taskIds, metadata.taskId)
        && matchesCommaSeparatedFilter(spus, metadata.spu)
        && (type === '全部' || row[2] === type)
        && (!assetMultiFilterState.materialCategory.size || assetMultiFilterState.materialCategory.has(metadata.materialCategory))
        && (!assetMultiFilterState.expression.size || assetMultiFilterState.expression.has(metadata.expression))
        && (!assetMultiFilterState.sourceTask.size || assetMultiFilterState.sourceTask.has(sourceTask))
        && (!assetMultiFilterState.sourceNode.size || assetMultiFilterState.sourceNode.has(sourceNode))
        && matchesTag
        && (!assetMultiFilterState.creator.size || assetMultiFilterState.creator.has(assetProducerName(row)) || (assetMultiFilterState.creator.has('__unassigned__') && !assetProducerName(row)))
        && (!assetMultiFilterState.org.size || assetMultiFilterState.org.has(owner.producerDepartment))
        && (!status || assetStatus(row) === status);
    });
    $('#assetRows').innerHTML = list.length ? list.map(row => {
      const metadata = row[8] || {};
      const expired = assetStatus(row) === '已过期';
      const rowStatus = expired ? '已过期' : '正常';
      const ownerDepartment = assetProducerParts(row).producerDepartment || '未记录部门';
      const naming = buildAssetNaming(row);
      return `<tr data-editor-row-key="${escapeHtml(row[1])}" class="${selectedAssetIds.has(row[1]) ? 'is-selected' : ''}"><td class="asset-select-column"><input class="asset-select" type="checkbox" value="${escapeHtml(row[1])}" aria-label="选择素材 ${escapeHtml(row[1])}" ${selectedAssetIds.has(row[1]) ? 'checked' : ''} ${expired ? 'disabled title="素材已过期，无法下载"' : ''}></td><td><div class="asset-identity"><div class="asset-identity-preview">${assetThumbnailMarkup(row)}<small class="asset-id-caption">${escapeHtml(row[1])}</small></div></div></td><td class="asset-naming-cell"><b title="${escapeHtml(naming || '待补全素材信息后生成')}">${escapeHtml(naming || '待补全素材信息后生成')}</b></td><td class="asset-tags-cell">${assetTagMarkup(row)}</td><td><div class="asset-producer-cell" data-runtime-copy><b>${escapeHtml(assetProducerName(row) || '未填写')}</b><small>${escapeHtml(ownerDepartment)}</small></div></td><td><span class="status ${assetStatusClass(rowStatus)}">${rowStatus}</span></td><td>${escapeHtml(row[7])}</td><td class="asset-row-actions"><button class="table-link asset-info-edit" data-id="${escapeHtml(row[1])}">编辑信息</button><button class="table-link asset-tag-edit" data-id="${escapeHtml(row[1])}">调整标签</button><button class="table-link asset-detail" data-id="${escapeHtml(row[1])}">详情</button></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="empty-cell">未找到匹配素材</td></tr>';
    $('.pagination span', $('#assetRows').closest('.list-panel')).textContent = `共 ${list.length} 条`;
    syncAssetSelectionControls(list);
  }
  function syncAssetSelectionControls(visibleRows = assets) {
    const validIds = new Set(permittedAssets().filter(row => assetStatus(row) === '正常').map(row => row[1]));
    selectedAssetIds = new Set([...selectedAssetIds].filter(id => validIds.has(id)));
    visibleAssetIds = visibleRows.filter(row => assetStatus(row) === '正常' && assetVisibleToCurrentUser(row)).map(row => row[1]);
    const selectedVisibleCount = visibleAssetIds.filter(id => selectedAssetIds.has(id)).length;
    const selectAll = $('#selectAllAssets');
    selectAll.disabled = visibleAssetIds.length === 0;
    selectAll.checked = visibleAssetIds.length > 0 && selectedVisibleCount === visibleAssetIds.length;
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleAssetIds.length;
    $('#selectedAssetCount').textContent = selectedAssetIds.size.toLocaleString('zh-CN');
    $('#downloadSelectedAssets').disabled = selectedAssetIds.size === 0;
  }
  function openAssetBatchDownloadDialog() {
    const selectedRows = permittedAssets().filter(row => selectedAssetIds.has(row[1]) && assetStatus(row) === '正常');
    if (!selectedRows.length) { toast('请先选择需要下载的素材', 'warning'); return; }
    const imageCount = selectedRows.filter(row => row[2] === '图片').length;
    const videoCount = selectedRows.filter(row => row[2] === '视频').length;
    const list = selectedRows.map(row => {
      const { sourceTask, sourceNode } = assetSourceParts(row);
      return `<div class="asset-download-row">${assetThumbnailMarkup(row)}<div><b>${escapeHtml(row[1])}</b><small>${escapeHtml(row[2])} · ${escapeHtml(sourceTask || '未记录')} / ${escapeHtml(sourceNode || '未记录')}</small></div><span>${escapeHtml(row[4] || '未记录')}</span></div>`;
    }).join('');
    const body = `<div class="result-summary asset-download-summary"><div><span>所选素材</span><b>${selectedRows.length} 份</b></div><div><span>图片</span><b>${imageCount} 份</b></div><div><span>视频</span><b>${videoCount} 份</b></div></div><div class="asset-sync-note"><span>i</span><p>系统将按原始文件打包下载；文件较多时可在浏览器下载列表中查看进度。</p></div><div class="asset-download-list">${list}</div>`;
    openDialog('批量下载素材',`共选择 ${selectedRows.length} 份可下载素材`,body,'开始下载',() => {
      const count = selectedRows.length;
      closeDialog();
      selectedAssetIds.clear();
      renderAssets($('#assetSearch').value.trim());
      toast(`已开始生成 ${count} 份素材的下载包`);
    });
  }
  function assetSourceParts(row) {
    const metadata = row[8] || {};
    const [fallbackTask = '', fallbackNode = ''] = String(row[3] || '').split(' / ');
    return { sourceTask:metadata.sourceTask || fallbackTask, sourceNode:metadata.sourceNode || fallbackNode };
  }
  function resolveAssetProducerIdentity(producerName) {
    const producer = String(producerName || '').trim();
    const identity = assetProducerIdentityDirectory[producer];
    return identity ? { producer:identity.producer, producerDepartment:identity.producerDepartment } : { producer, producerDepartment:'' };
  }
  function assetProducerParts(row) {
    return {
      producer:String(row[8]?.producer || '').trim(),
      producerDepartment:String(row[8]?.producerDepartment || '').trim()
    };
  }
  function assetProducerName(row) {
    return assetProducerParts(row).producer;
  }
  function assetStatusClass(status) {
    return status === '正常' ? 'success' : 'error';
  }
  function assetThumbnailMarkup(row) {
    const metadata = row[8] || {};
    if (assetStatus(row) === '已过期') return '<div class="asset-thumbnail asset-expired" aria-label="素材已过期，服务器文件已清理"><span>已过期</span></div>';
    const isVideo = row[2] === '视频';
    const previewSrc = !isVideo ? metadata.previewSrc || '' : '';
    return `<div class="asset-thumbnail media-preview-trigger ${isVideo ? 'video' : ''}" data-media-preview data-preview-type="${isVideo ? 'video' : 'image'}" ${previewSrc ? `data-preview-src="${escapeHtml(previewSrc)}"` : ''} data-preview-name="${escapeHtml(row[1])}" data-preview-source="素材库" role="button" tabindex="0" aria-label="${isVideo ? '播放' : '放大'}素材 ${escapeHtml(row[1])}"><span aria-hidden="true">${isVideo ? '▶' : 'IMG'}</span>${previewSrc ? `<img src="${escapeHtml(previewSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">` : ''}</div>`;
  }
  function assetExpressionCode(value) {
    const text = String(value || '').trim();
    if (text === '网站UI') return 'UI';
    if (text === '/') return '';
    return text.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0] || text;
  }
  function assetSellingPointCode(value) {
    const text = String(value || '').trim();
    if (/^(?:N\/?A|NONE)(?:\s|$)/i.test(text)) return 'NA';
    return text.split(/[,，、]+/).map(part => part.trim()).filter(Boolean).map(part => part.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0] || part).join('&');
  }
  function assetSceneCode(value) {
    const text = String(value || '').trim();
    if (/^(?:N\/?A|NONE)(?:\s|$)/i.test(text)) return 'NA';
    if (/^(Shoot-MP|Remix)\s/.test(text)) return text.replace(/\s+/g, '');
    return text.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0] || text;
  }
  function assetCategoryCode(value) {
    const text = String(value || '').trim();
    return text.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0] || text;
  }
  function assetMetadataValues(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(/[,，、]+/);
    return [...new Set(source.map(item => String(item || '').trim()).filter(Boolean))];
  }
  function assetEditorOptionValues(field) {
    return demandOptionsFor(field).map(option => option.id);
  }
  function assetNoneOptionValue(field) {
    return demandOptionsFor(field).find(option => String(option.id).toLowerCase() === 'none' || option.label === '无')?.id || '';
  }
  function assetEditorSelectMarkup(field, selectedValue = '', required = false) {
    const selected = normalizeDemandOptionSelection(field, selectedValue);
    return `<select data-asset-info="${escapeHtml(field)}"${required ? ' required aria-required="true"' : ''}><option value="">请选择</option>${assetEditorOptionValues(field, selected).map(value => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(demandOptionDisplayValue(field,value))}</option>`).join('')}</select>`;
  }
  function assetEditorMultiMarkup(field, label, selectedValue = '', required = false) {
    const selected = new Set(assetMetadataValues(selectedValue).map(value => normalizeDemandOptionSelection(field,value)));
    const options = assetEditorOptionValues(field);
    const summary = selected.size ? [...selected].map(value => demandOptionDisplayValue(field,value)).join('、') : '请选择';
    return `<div class="asset-info-field asset-info-multi-field"><span class="asset-info-label">${escapeHtml(label)}${required ? ' <em class="required-mark">*</em>' : ''}</span><details class="asset-info-multi-select${selected.size ? ' has-selection' : ''}" data-asset-info-multi="${escapeHtml(field)}"${required ? ' data-asset-required="true"' : ''}><summary${required ? ' aria-required="true"' : ''}><span data-asset-info-multi-summary>${escapeHtml(summary)}</span><i>⌄</i></summary><div class="asset-info-multi-menu">${options.map(value => `<label><input type="checkbox" value="${escapeHtml(value)}"${selected.has(value) ? ' checked' : ''}><span>${escapeHtml(demandOptionDisplayValue(field,value))}</span></label>`).join('')}</div></details></div>`;
  }
  function assetNamingToken(value) {
    return String(value || '').replace(/[\s_]+/g, '');
  }
  function assetProducerInitials(value) {
    const producer = String(value || '').trim();
    const known = { '管理员':'GLY', '沈玲燕':'SLY', '潘金兰':'PJL', '张三':'ZS', '赵六':'ZL', '李四':'LS', '王五':'WW' };
    if (known[producer]) return known[producer];
    const latinWords = producer.match(/[A-Za-z]+/g);
    if (!latinWords) return '';
    return (latinWords.length > 1 ? latinWords.map(word => word[0]).join('') : latinWords[0].slice(0,3)).toUpperCase();
  }
  function assetNamingState(row, preview = false) {
    const metadata = row?.[8] || {};
    const missing = [];
    const requiredToken = (value, label, placeholder) => {
      const token = assetNamingToken(value);
      if (!token) missing.push(label);
      return token || (preview ? placeholder : '');
    };
    const stableToken = (field, value, label, placeholder) => requiredToken(normalizeDemandOptionSelection(field, value), label, placeholder);
    const sellingPoint = assetMetadataValues(metadata.mainSellingPoint).map(value => assetNamingToken(normalizeDemandOptionSelection('mainSellingPoint', value))).filter(Boolean).join('&') || assetNamingToken(assetNoneOptionValue('mainSellingPoint'));
    const date = String(metadata.completedAt || row?.[7] || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const yyyymmdd = date ? `${date[1]}${date[2].padStart(2,'0')}${date[3].padStart(2,'0')}` : '';
    const tokens = [
      requiredToken(metadata.spu, 'SPU', '待填SPU'),
      stableToken('materialType', row?.[2] === '视频' ? 'VID' : row?.[2] === '图片' ? 'IMG' : row?.[2], '素材格式', '待选素材格式'),
      stableToken('expression', metadata.expression, '表达方式', '待选表达方式'),
      sellingPoint || (preview ? '待选主卖点' : ''),
      stableToken('scene', metadata.scene, '场景', '待选场景'),
      `${assetProducerInitials(metadata.producer)}${yyyymmdd}` || (preview ? '待定制作人日期' : ''),
      requiredToken(metadata.version, '版本', '待填版本'),
      stableToken('materialCategory', metadata.materialCategory, '素材类型', '待选素材类型')
    ];
    return { name: missing.length && !preview ? '' : tokens.join('_'), missing };
  }
  function buildAssetNaming(row) {
    return assetNamingState(row).name;
  }
  function assetDetailBody(row) {
    const metadata = row[8] || {};
    const naming = buildAssetNaming(row);
    const expiry = assetExpiryDate(row);
    const { sourceTask, sourceNode } = assetSourceParts(row);
    const demand = visualDemands.find(item => item.id === metadata.visualDemandId);
    const task = tasks.find(item => item[7]?.id === metadata.taskId);
    const expired = assetStatus(row) === '已过期';
    const demandLabel = demand?.title || (metadata.visualDemandId ? '未找到来源需求' : '未关联视觉需求');
    const taskLabel = task?.[0] || sourceTask || '未记录';
    return `<div class="detail-layout asset-detail-layout dialog-wide-content">
      <div class="detail-hero">${assetThumbnailMarkup(row)}<div><h3>${escapeHtml(row[1])}</h3></div><span class="status ${assetStatusClass(assetStatus(row))}">${assetStatus(row)}</span></div>
      <section class="detail-section"><h3 class="detail-section-title">基本信息</h3><div class="detail-fields">
        <div class="detail-field"><span>素材格式</span><b>${escapeHtml(row[2])}</b></div><div class="detail-field"><span>生成时间</span><b>${escapeHtml(row[7] || '未记录')}</b></div>
        <div class="detail-field"><span>规格 / 画质</span><b>${escapeHtml(row[4] || '未记录')} · ${escapeHtml(metadata.quality || '自动适配')}</b></div><div class="detail-field"><span>清理时间</span><b>${expiry ? escapeHtml(expiry.toLocaleDateString('zh-CN')) : '未记录'}</b></div>
      </div></section>
      <section class="detail-section"><h3 class="detail-section-title">来源信息</h3><div class="detail-fields">
        <div class="detail-field"><span>来源需求 / 需求 ID</span><b class="detail-stacked-value">${escapeHtml(demandLabel)}<small>${escapeHtml(metadata.visualDemandId || '无需求 ID')}</small></b></div>
        <div class="detail-field"><span>来源任务 / 任务 ID</span><b class="detail-stacked-value">${escapeHtml(taskLabel)}<small>${escapeHtml(metadata.taskId || '未记录任务 ID')}</small></b></div>
        <div class="detail-field"><span>来源节点</span><b>${escapeHtml(sourceNode || '未记录')}</b></div><div class="detail-field"><span>制作人</span><b>${escapeHtml(assetProducerParts(row).producer || '未记录')}</b></div>
        <div class="detail-field"><span>部门</span><b>${escapeHtml(assetProducerParts(row).producerDepartment || '未记录')}</b></div>
      </div></section>
      <section class="detail-section"><h3 class="detail-section-title">业务信息</h3><div class="detail-fields">
        <div class="detail-field"><span>SPU</span><b>${escapeHtml(metadata.spu || '未填写')}</b></div><div class="detail-field"><span>素材类型</span><b>${escapeHtml(demandOptionDisplayValue('materialCategory',metadata.materialCategory) || '未填写')}</b></div>
        <div class="detail-field"><span>表达方式</span><b>${escapeHtml(demandOptionDisplayValue('expression',metadata.expression) || '未填写')}</b></div><div class="detail-field"><span>主卖点</span><b>${escapeHtml(demandOptionDisplayList('mainSellingPoint',metadata.mainSellingPoint) || '未填写')}</b></div>
        <div class="detail-field"><span>辅助卖点</span><b>${escapeHtml(demandOptionDisplayList('secondarySellingPoint',metadata.secondarySellingPoint) || '未填写')}</b></div><div class="detail-field"><span>场景</span><b>${escapeHtml(demandOptionDisplayValue('scene',metadata.scene) || '未填写')}</b></div>
        <div class="detail-field"><span>版本</span><b>${escapeHtml(metadata.version || '未填写')}</b></div>
        <div class="detail-field"><span>标签</span><b>${assetTagMarkup(row, '暂无标签')}</b></div>
        <div class="detail-field detail-field-wide"><span>素材命名</span><div class="asset-naming-value"><b>${escapeHtml(naming || '待补全素材信息后生成')}</b><button class="table-link asset-naming-copy" type="button" ${naming ? '' : 'disabled'}>复制</button></div></div>
      </div></section>
      <section class="detail-section"><h3 class="detail-section-title">下载</h3><div class="detail-fields"><div class="detail-field detail-field-wide"><span>当前素材</span><div class="detail-download-action"><button class="button primary asset-download-direct" type="button" ${expired ? 'disabled' : ''}>下载素材</button><small>${expired ? '已过期，服务器文件已清理，无法下载' : metadata.downloadUrl ? '点击下载当前素材的原文件' : '演示素材暂无原文件，接入文件服务后可下载'}</small><small class="detail-download-feedback" role="status" hidden></small></div></div></div></section>
    </div>`;
  }
  function downloadAssetFromDetail(row) {
    const feedback = $('#dialogBody .detail-download-feedback');
    const warn = message => { if (feedback) { feedback.textContent = message; feedback.hidden = false; } };
    if (assetStatus(row) === '已过期') { warn('素材已过期，无法下载'); return; }
    const path = String(row[8]?.downloadUrl || '');
    if (!path) { warn('当前无法下载：演示素材暂无原文件，接入文件服务后可使用快捷下载'); return; }
    let url;
    try { url = new URL(path, location.href); } catch { warn('下载地址无效'); return; }
    if (url.origin !== location.origin && url.protocol !== 'blob:') { warn('下载地址不属于平台服务器'); return; }
    const link = document.createElement('a');
    link.href = url.href;
    const fileName = String(row[8]?.fileName || row[0] || '素材');
    const extension = url.pathname.match(/\.[A-Za-z0-9]{2,8}$/)?.[0] || '';
    link.download = /\.[A-Za-z0-9]{2,8}$/.test(fileName) ? fileName : `${fileName}${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
  }
  function persistAssetStorageState() {
    localStorage.setItem('ai-material-assets-v2', JSON.stringify(assets));
  }
  function openAssetInfoEditor(row) {
    const metadata = row[8] || {};
    const expression = metadata.expression || '';
    const mainSellingPoint = metadata.mainSellingPoint || assetNoneOptionValue('mainSellingPoint');
    const secondarySellingPoint = metadata.secondarySellingPoint || assetNoneOptionValue('secondarySellingPoint');
    const scene = metadata.scene || '';
    const materialCategory = metadata.materialCategory || '';
    const initialNaming = assetNamingState([...row.slice(0,8), { ...metadata, expression, mainSellingPoint, secondarySellingPoint, scene, materialCategory, version:metadata.version || 'V1' }], true);
    const body = `<div class="asset-info-editor dialog-wide-content"><div class="asset-info-context"><b>素材 ID：${escapeHtml(row[1])}</b><span>素材格式：${escapeHtml(row[2])}</span></div><div class="asset-info-fields">
      <label><span class="asset-info-label">SPU <em class="required-mark">*</em></span><input data-asset-info="spu" value="${escapeHtml(metadata.spu || '')}" placeholder="例如 FI-WSH26141" maxlength="200" required aria-required="true"></label>
      <label><span class="asset-info-label">表达方式 <em class="required-mark">*</em></span>${assetEditorSelectMarkup('expression', expression, true)}</label>
      ${assetEditorMultiMarkup('mainSellingPoint', '主卖点', mainSellingPoint, true)}
      ${assetEditorMultiMarkup('secondarySellingPoint', '辅助卖点', secondarySellingPoint)}
      <label><span class="asset-info-label">场景 <em class="required-mark">*</em></span>${assetEditorSelectMarkup('scene', scene, true)}</label>
      <label><span class="asset-info-label">版本 <em class="required-mark">*</em></span><input data-asset-info="version" value="${escapeHtml(metadata.version || 'V1')}" placeholder="同一 SPU 的自定义版本" maxlength="80" required aria-required="true"></label>
      <label><span class="asset-info-label">素材类型 <em class="required-mark">*</em></span>${assetEditorSelectMarkup('materialCategory', materialCategory, true)}</label>
    </div><div class="asset-naming-preview"><div><span>素材命名（按视觉需求表规则自动生成）</span><button class="table-link asset-info-naming-copy" type="button">复制</button></div><b id="assetNamingPreview">${escapeHtml(initialNaming.name)}</b><small id="assetNamingMissingHint" class="asset-naming-missing-hint${initialNaming.missing.length ? '' : ' complete'}">${escapeHtml(initialNaming.missing.length ? `请补充：${initialNaming.missing.join('、')}` : '命名信息已完整，将随上方内容即时更新')}</small></div></div>`;
    const readDraft = () => {
      const next = { ...row[8] };
      $$('[data-asset-info]', $('#dialogBody')).forEach(control => { next[control.dataset.assetInfo] = control.value.trim(); });
      $$('[data-asset-info-multi]', $('#dialogBody')).forEach(control => {
        next[control.dataset.assetInfoMulti] = $$('input[type="checkbox"]:checked', control).map(input => input.value).join('、');
      });
      return next;
    };
    const syncMultiSummaries = () => {
      $$('[data-asset-info-multi]', $('#dialogBody')).forEach(control => {
        const values = $$('input[type="checkbox"]:checked', control).map(input => input.value);
        $('[data-asset-info-multi-summary]', control).textContent = values.length ? values.map(value => demandOptionDisplayValue(control.dataset.assetInfoMulti,value)).join('、') : '请选择';
        control.classList.toggle('has-selection', values.length > 0);
      });
    };
    const updateNamingPreview = () => {
      syncMultiSummaries();
      const state = assetNamingState([...row.slice(0,8),readDraft()], true);
      $('#assetNamingPreview').textContent = state.name;
      const hint = $('#assetNamingMissingHint');
      hint.textContent = state.missing.length ? `请补充：${state.missing.join('、')}` : '命名信息已完整，将随上方内容即时更新';
      hint.classList.toggle('complete', !state.missing.length);
      $('.asset-info-naming-copy', $('#dialogBody')).disabled = Boolean(state.missing.length);
      return state.missing.length ? '' : state.name;
    };
    openDialog('编辑素材信息', row[1], body, '保存修改', () => {
      const next = readDraft();
      const requiredFields = [['spu','SPU'],['expression','表达方式'],['scene','场景'],['version','版本'],['materialCategory','素材类型']];
      const missingField = requiredFields.find(([field]) => !String(next[field] || '').trim());
      if (missingField) {
        const control = $(`[data-asset-info="${missingField[0]}"]`, $('#dialogBody'));
        control?.focus();
        toast(`请填写${missingField[1]}`, 'warning');
        return;
      }
      const mainSellingPoint = $('[data-asset-info-multi="mainSellingPoint"]', $('#dialogBody'));
      if (!next.mainSellingPoint) {
        if (mainSellingPoint) { mainSellingPoint.open = true; $('summary', mainSellingPoint)?.focus(); }
        toast('请选择主卖点', 'warning');
        return;
      }
      row[8] = next;
      row[8].naming = buildAssetNaming(row);
      persistAssetStorageState();
      closeDialog();
      renderAssets($('#assetSearch').value.trim());
      toast('素材信息已更新');
    });
    $('#dialogBody').oninput = updateNamingPreview;
    $('#dialogBody').onchange = updateNamingPreview;
    $('#dialogBody').onclick = async event => {
      if (!event.target.closest('.asset-info-naming-copy')) return;
      const naming = updateNamingPreview();
      if (!naming) return;
      try { await navigator.clipboard.writeText(naming); toast('素材命名已复制'); }
      catch { toast('复制失败，请手动选择命名文字', 'warning'); }
    };
    updateNamingPreview();
  }
  function persistAssetTagState() {
    localStorage.setItem('ai-material-asset-tags-v1', JSON.stringify(assetTags));
    persistAssetStorageState();
  }
  function assetTagManagerBody() {
    const rows = assetTags.length ? assetTags.map(tag => {
      const usageCount = assetTagUsageCount(tag.id);
      return `<div class="asset-tag-manage-row" data-tag-id="${escapeHtml(tag.id)}"><input class="asset-tag-name-input" maxlength="20" value="${escapeHtml(tag.name)}" aria-label="标签名称：${escapeHtml(tag.name)}"><span class="asset-tag-usage">${usageCount.toLocaleString('zh-CN')} 份素材</span><button class="button secondary asset-tag-save" type="button">保存</button><button class="table-link danger asset-tag-remove" type="button">删除</button></div>`;
    }).join('') : '<div class="asset-tag-manager-empty">暂无标签，可在上方新建。</div>';
    return `<form class="asset-tag-create-form"><label><span>新标签名称</span><input id="newAssetTagName" maxlength="20" placeholder="例如：新品首发" required></label><button class="button primary" type="submit">新建标签</button></form><div class="asset-tag-manager-note">标签名称修改后会同步更新所有已关联素材；删除标签会解除全部素材关联。</div><div class="asset-tag-manage-list">${rows}</div>`;
  }
  function refreshAssetTagManagerDialog() {
    const body = $('#dialogBody');
    body.innerHTML = assetTagManagerBody();
    body.onsubmit = event => {
      if (!event.target.matches('.asset-tag-create-form')) return;
      event.preventDefault();
      const name = $('#newAssetTagName', body).value.trim();
      if (!name) { toast('请输入标签名称', 'warning'); return; }
      if (assetTags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) { toast('标签名称已存在', 'warning'); return; }
      assetTags.push({ id:`TAG-${Date.now().toString(36).toUpperCase()}`, name });
      persistAssetTagState();
      refreshAssetTagManagerDialog();
      renderAssets($('#assetSearch').value.trim());
      toast('标签已新建');
    };
    body.onclick = event => {
      const saveButton = event.target.closest('.asset-tag-save');
      const removeButton = event.target.closest('.asset-tag-remove');
      const row = event.target.closest('.asset-tag-manage-row');
      if (!row || (!saveButton && !removeButton)) return;
      const tag = assetTags.find(item => item.id === row.dataset.tagId);
      if (!tag) return;
      if (saveButton) {
        const name = $('.asset-tag-name-input', row).value.trim();
        if (!name) { toast('标签名称不能为空', 'warning'); return; }
        if (assetTags.some(item => item.id !== tag.id && item.name.toLowerCase() === name.toLowerCase())) { toast('标签名称已存在', 'warning'); return; }
        tag.name = name;
        persistAssetTagState();
        refreshAssetTagManagerDialog();
        renderAssets($('#assetSearch').value.trim());
        toast('标签已更新');
        return;
      }
      if (removeButton.dataset.confirming !== 'true') {
        removeButton.dataset.confirming = 'true';
        removeButton.textContent = '确认删除';
        removeButton.title = `将从 ${assetTagUsageCount(tag.id)} 份素材中解除该标签`;
        return;
      }
      assetTags = assetTags.filter(item => item.id !== tag.id);
      assets.forEach(asset => {
        const metadata = asset[8] || {};
        asset[8] = { ...metadata, tagIds:(Array.isArray(metadata.tagIds) ? metadata.tagIds : []).filter(id => String(id) !== tag.id) };
      });
      persistAssetTagState();
      refreshAssetTagManagerDialog();
      renderAssets($('#assetSearch').value.trim());
      toast('标签已删除并解除素材关联');
    };
  }
  function openAssetTagManagerDialog() {
    openDialog('标签管理','统一维护素材库可用标签',assetTagManagerBody(),'完成',() => { closeDialog(); renderAssets($('#assetSearch').value.trim()); });
    refreshAssetTagManagerDialog();
  }
  function openAssetTagEditor(row) {
    const selected = new Set(assetTagIds(row));
    const choices = assetTags.length ? assetTags.map(tag => `<label class="asset-tag-choice" data-tag-search="${escapeHtml(tag.name.toLowerCase())}"><input type="checkbox" name="assetTagChoice" value="${escapeHtml(tag.id)}" ${selected.has(tag.id) ? 'checked' : ''}><span class="asset-tag-chip">${escapeHtml(tag.name)}</span></label>`).join('') : '<div class="asset-tag-manager-empty">暂无可用标签，请先在标签管理中创建。</div>';
    const body = `<div class="asset-tag-editor-note"><b>素材 ID：${escapeHtml(row[1])}</b><small>素材格式：${escapeHtml(row[2])}</small></div><div class="asset-tag-editor-toolbar"><label><span>搜索标签</span><input id="assetTagChoiceSearch" type="search" placeholder="输入标签名称"></label><b id="assetTagChoiceCount">已选 ${Math.min(selected.size,20)}/20</b></div><div class="asset-tag-choice-grid">${choices}</div>`;
    openDialog('调整素材标签','支持搜索，每个素材最多选择 20 个标签',body,'保存标签',() => {
      const tagIds = $$('input[name="assetTagChoice"]:checked', $('#dialogBody')).map(input => input.value).filter(id => assetTags.some(tag => tag.id === id)).slice(0,20);
      row[8] = { ...(row[8] || {}), tagIds };
      persistAssetTagState();
      closeDialog();
      renderAssets($('#assetSearch').value.trim());
      toast('素材标签已更新');
    });
    const syncTagChoiceState = () => {
      const checked = $$('input[name="assetTagChoice"]:checked', $('#dialogBody'));
      const atLimit = checked.length >= 20;
      $('#assetTagChoiceCount').textContent = `已选 ${checked.length}/20`;
      $$('input[name="assetTagChoice"]', $('#dialogBody')).forEach(input => { input.disabled = atLimit && !input.checked; });
    };
    $('#dialogBody').oninput = event => {
      if (!event.target.matches('#assetTagChoiceSearch')) return;
      const keyword = event.target.value.trim().toLowerCase();
      $$('.asset-tag-choice', $('#dialogBody')).forEach(choice => { choice.hidden = Boolean(keyword) && !choice.dataset.tagSearch.includes(keyword); });
    };
    $('#dialogBody').onchange = event => {
      if (!event.target.matches('input[name="assetTagChoice"]')) return;
      const checked = $$('input[name="assetTagChoice"]:checked', $('#dialogBody'));
      if (checked.length > 20) { event.target.checked = false; toast('每个素材最多选择 20 个标签', 'warning'); }
      syncTagChoiceState();
    };
    syncTagChoiceState();
  }
  function renderTemplates(filter = '') {
    syncLibraryMultiFilterOptions('template');
    const kinds = libraryMultiFilterState['template.kind'];
    const nodes = libraryMultiFilterState['template.node'];
    const outputTypes = libraryMultiFilterState['template.outputType'];
    const creators = libraryMultiFilterState['template.creator'];
    const orgs = libraryMultiFilterState['template.org'];
    const templatePool = activeAiEdition === 'phase1'
      ? templates.filter(item => item.scope === 'node' && item.nodeKey !== 'detail')
      : templates;
    const list = templatePool.filter(item => {
      const applicableNodes = item.scope === 'node' ? [item.nodeKey] : (item.nodes || []);
      const owner = templateOwnerParts(item);
      return item.name.includes(filter)
        && (activeAiEdition === 'phase1' || !kinds.size || kinds.has(item.scope))
        && (!nodes.size || applicableNodes.some(nodeKey => nodes.has(nodeKey)))
        && (!outputTypes.size || outputTypes.has(item.type))
        && (!creators.size || creators.has(owner.creator))
        && (!orgs.size || orgs.has(owner.org))
        && matchesTimeFilter(item.last, 'templates');
    });
    $('#templateRows').innerHTML = list.length ? list.map(item => {
      const applicableNodes = item.scope === 'node' ? [item.nodeKey] : (item.nodes || []);
      const applicableNodeNames = applicableNodes.map(key => nodeMap[key]?.name || key).join(' → ');
      return `<tr data-editor-row-key="TPL-${item.id}"><td><b>${escapeHtml(item.name)}</b><small>TPL-${String(item.id).padStart(4,'0')}</small></td><td><span class="scope-badge ${item.scope}">${item.scope === 'node' ? '节点模板' : '任务模板'}</span></td><td>${escapeHtml(applicableNodeNames)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.creator)}</td><td><b>${item.uses}</b></td><td>${item.last}</td><td><span class="status ${item.status === '启用' ? 'success' : 'info'}">${item.status}</span></td><td><button class="table-link use-template" data-id="${item.id}">使用</button><button class="table-link template-detail" data-id="${item.id}">详情</button><button class="table-link template-rename" data-id="${item.id}">重命名</button></td></tr>`;
    }).join('') : `<tr><td colspan="9" class="empty-cell">${hasActiveTimeFilter('templates') ? '所选时间区间内未找到匹配模板' : '未找到匹配模板'}</td></tr>`;
    renderPrototypeCounts();
  }
  function templateOwnerParts(item) {
    const [creator = '', org = ''] = String(item.creator || '').split(' / ');
    return { creator, org };
  }
  function libraryMultiFilterOptions(field) {
    const templatePool = activeAiEdition === 'phase1'
      ? templates.filter(item => item.scope === 'node' && item.nodeKey !== 'detail')
      : templates;
    if (field === 'template.creator') {
      return [...new Set(templatePool.map(item => templateOwnerParts(item).creator).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN')).map(value => [value,value]);
    }
    if (field === 'template.org') {
      return [...new Set(templatePool.map(item => templateOwnerParts(item).org).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN')).map(value => [value,value]);
    }
    if (field === 'template.kind' && activeAiEdition === 'phase1') return [['node','节点模板']];
    if (field === 'template.node' && activeAiEdition === 'phase1') return (libraryMultiFilterDefinitions[field] || []).filter(([value]) => value !== 'detail');
    return libraryMultiFilterDefinitions[field] || [];
  }
  function updateLibraryMultiFilterSummary(field) {
    const element = $$('[data-library-multi-filter]').find(item => item.dataset.libraryMultiFilter === field);
    if (!element) return;
    const selected = libraryMultiFilterState[field];
    const values = [...selected];
    const labels = new Map(libraryMultiFilterOptions(field));
    const summary = $('[data-library-multi-summary]', element);
    const selectedLabels = values.map(value => labels.get(value) || value);
    summary.textContent = values.length === 0 ? element.dataset.allLabel : values.length === 1 ? selectedLabels[0] : `已选 ${values.length} 项`;
    summary.title = selectedLabels.join('、');
    element.classList.toggle('has-selection', values.length > 0);
    const allInput = $('[data-library-multi-all]', element);
    if (allInput) allInput.checked = values.length === 0;
    $$('[data-library-multi-value]', element).forEach(input => { input.checked = selected.has(input.dataset.libraryMultiValue); });
  }
  function syncLibraryMultiFilterOptions(scope = '') {
    $$('[data-library-multi-filter]').forEach(element => {
      const field = element.dataset.libraryMultiFilter;
      if (scope && !field.startsWith(`${scope}.`)) return;
      const selected = libraryMultiFilterState[field];
      const options = libraryMultiFilterOptions(field);
      if (!selected) return;
      const availableValues = options.map(([value]) => value);
      [...selected].forEach(value => { if (!availableValues.includes(value)) selected.delete(value); });
      const menu = $('.prototype-multi-menu', element);
      menu.innerHTML = `<label class="prototype-multi-option prototype-multi-all"><input type="checkbox" data-library-multi-all${selected.size ? '' : ' checked'}><span>${escapeHtml(element.dataset.allLabel)}</span></label>${options.map(([value,label]) => `<label class="prototype-multi-option"><input type="checkbox" data-library-multi-value="${escapeHtml(value)}"${selected.has(value) ? ' checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}`;
      updateLibraryMultiFilterSummary(field);
    });
  }
  function clearLibraryMultiFilterScope(scope) {
    Object.entries(libraryMultiFilterState).forEach(([field,selected]) => {
      if (field.startsWith(`${scope}.`)) selected.clear();
    });
    syncLibraryMultiFilterOptions(scope);
  }
  function closeLibraryMultiFilters() {
    $$('[data-library-multi-filter][open]').forEach(element => { element.open = false; });
  }

  const templateConfigSchemas = {
    clean:[
      { title:'素材处理', fields:[['mediaType','输出类型'],['outputFormat','输出格式','image'],['outputDuration','输出时长','video'],['views','输出视角'],['ratio','输出规格'],['quality','画质要求'],['beautify','数字美化'],['requirements','补充描述','wide']] }
    ],
    scene:[
      { title:'基础', fields:[['mediaType','输出类型'],['outputFormat','输出格式','image'],['outputDuration','输出时长','video'],['generateCount','生成张数','image'],['ratio','输出比例'],['quality','画质要求'],['model','AI处理模型']] },
      { title:'模特', fields:[['gender','性别'],['ageRange','年龄段'],['region','地区'],['height','身高'],['bodyType','体型'],['skinTone','皮肤肤色'],['hairColor','头发颜色'],['style','风格']] },
      { title:'场景', fields:[['shotComposition','景别构图'],['toneStyle','色调风格'],['artAtmosphere','艺术氛围']] },
      { title:'其他', fields:[['adCopy','广告文案','video-wide'],['copyLanguage','文案语言','video'],['copyPosition','文案位置','video'],['voiceoverAudio','口播音频','video'],['backgroundAudio','背景音频','video'],['requirements','补充描述','wide']] }
    ],
    detail:[
      { title:'素材处理', fields:[['mediaType','输出类型'],['outputFormat','输出格式','image'],['outputDuration','输出时长','video'],['generateCount','生成张数','image'],['ratio','输出比例'],['quality','画质要求'],['materialCloseup','面料与材质特写'],['lifestyleInteraction','生活化场景交互'],['flatLayCloseup','平铺细节特写'],['lightingControl','专业光影控制'],['emotionExpression','人物情绪表达'],['requirements','补充描述','wide']] }
    ]
  };
  function templateNodeConfig(item, nodeKey) {
    const saved = item.scope === 'node' ? item.config : item.configs?.[nodeKey];
    return { ...(defaultConfigs[nodeKey] || {}), ...(saved || {}) };
  }
  function templateConfigValue(value, field, config = {}) {
    if (Array.isArray(value)) return value.length ? value.join('、') : '未配置';
    if (value && typeof value === 'object') return [value.name,value.source].filter(Boolean).join(' · ') || '未配置';
    if (value === null || value === undefined || value === '') return '未配置';
    if (field === 'generateCount') return `${value}张`;
    if (field === 'outputDuration') return `${value} ${config.durationUnit || '秒'}`;
    return String(value);
  }
  function templateNodeConfigMarkup(item, nodeKey, index) {
    const config = templateNodeConfig(item, nodeKey);
    const mediaType = normalizeNodeMediaType(nodeKey, config.mediaType || item.type || '图片');
    const groups = (templateConfigSchemas[nodeKey] || []).map(group => {
      const fields = group.fields.filter(([, , mode = '']) => !mode.startsWith('video') || mediaType === '视频').filter(([, , mode = '']) => mode !== 'image' || mediaType !== '视频');
      return `<section class="detail-section"><h3 class="detail-section-title">节点 ${index + 1} · ${escapeHtml(nodeMap[nodeKey]?.name || nodeKey)} · ${escapeHtml(group.title)}</h3><div class="detail-fields">${fields.map(([field,label,mode = '']) => `<div class="detail-field${mode.includes('wide') ? ' detail-field-wide' : ''}"><span>${escapeHtml(label)}</span><b>${escapeHtml(templateConfigValue(config[field], field, config))}</b></div>`).join('')}</div></section>`;
    }).join('');
    return `<div class="template-node-config-flat"><section class="detail-section"><h3 class="detail-section-title">节点 ${index + 1} · ${escapeHtml(nodeMap[nodeKey]?.name || nodeKey)}</h3><div class="detail-fields"><div class="detail-field"><span>输出类型</span><b>${escapeHtml(mediaType)}</b></div><div class="detail-field"><span>内容</span><b>素材处理配置快照</b></div></div></section>${groups}</div>`;
  }
  function templateDetailBody(item) {
    const nodes = item.scope === 'node' ? [item.nodeKey] : (item.nodes || []);
    const route = nodes.map(key => nodeMap[key]?.name || key).join(' → ');
    return `<div class="template-detail dialog-wide-content"><section class="detail-section"><h3 class="detail-section-title">模板信息</h3><div class="detail-fields"><div class="detail-field"><span>模板类型</span><b>${item.scope === 'node' ? '节点模板' : '任务模板'}</b></div><div class="detail-field"><span>输出类型</span><b>${escapeHtml(item.type)}</b></div><div class="detail-field detail-field-wide"><span>适用流程</span><b>${escapeHtml(route || '未配置')}</b></div><div class="detail-field"><span>使用次数</span><b>${Math.max(0, Number(item.uses) || 0).toLocaleString('zh-CN')}</b></div><div class="detail-field"><span>状态</span><b>${escapeHtml(item.status)}</b></div><div class="detail-field detail-field-wide"><span>内容范围</span><b>模板内容仅包含各节点的素材处理配置，不包含输入图片、视频或生成结果。</b></div></div></section><div class="template-config-detail">${nodes.map((nodeKey,index) => templateNodeConfigMarkup(item,nodeKey,index)).join('')}</div></div>`;
  }
  function renameTemplate(item) {
    openDialog('修改模板名称',`TPL-${String(item.id).padStart(4,'0')}`,`<label class="field template-rename-field"><span>模板名称 <em>*</em></span><input id="renameTemplateName" maxlength="40" value="${escapeHtml(item.name)}"><small>名称最长 40 个字符</small></label>`,'保存名称',() => {
      const name = $('#renameTemplateName')?.value.trim() || '';
      if (!name) { toast('请填写模板名称', 'warning'); return; }
      if (templates.some(template => template.id !== item.id && template.name.trim().toLowerCase() === name.toLowerCase())) { toast('模板名称已存在，请更换名称', 'warning'); return; }
      item.name = name;
      persistTemplates();
      closeDialog();
      renderTemplates($('#templateSearch').value.trim());
      toast('模板名称已更新');
    });
  }

  function renderPrototypeCounts() {
    $('#modelPrototypeCount').textContent = prototypes.filter(item => item.kind === 'model').length.toLocaleString('zh-CN');
    $('#scenePrototypeCount').textContent = prototypes.filter(item => item.kind === 'scene').length.toLocaleString('zh-CN');
    const templatePool = activeAiEdition === 'phase1'
      ? templates.filter(item => item.scope === 'node' && item.nodeKey !== 'detail')
      : templates;
    $('#configTemplateCount').textContent = templatePool.filter(item => matchesTimeFilter(item.last, 'templates')).length.toLocaleString('zh-CN');
  }
  const modelConfigFields = [
    ['gender','性别'],
    ['ageRange','年龄段'],
    ['region','地区'],
    ['height','身高'],
    ['bodyType','体型'],
    ['skinTone','皮肤肤色'],
    ['hairColor','头发颜色'],
    ['style','风格']
  ];
  const modelFilterControls = {
    gender:'model.gender',
    ageRange:'model.ageRange',
    region:'model.region',
    height:'model.height',
    bodyType:'model.bodyType',
    skinTone:'model.skinTone',
    hairColor:'model.hairColor',
    style:'model.style'
  };
  function modelPrototypeTitle(item) {
    const config = item.config || {};
    const region = config.region && config.region !== '全部' ? config.region : '不限地区';
    const gender = config.gender === '女' ? '女性' : config.gender === '男' ? '男性' : '模特';
    const style = config.style && config.style !== '全部' ? config.style : '通用风格';
    return `${region}${gender} · ${style}`;
  }
  function modelPrototypeImage(item, index = 0) {
    return item.image || modelDemoImages[index % modelDemoImages.length];
  }
  function matchesModelPrototypeFilters(item) {
    const config = item.config || {};
    return Object.entries(modelFilterControls).every(([field, filterKey]) => {
      const selected = libraryMultiFilterState[filterKey];
      return !selected.size || selected.has(String(config[field] || ''));
    });
  }
  function modelPrototypeCard(item, index) {
    const config = item.config || {};
    const image = modelPrototypeImage(item, index);
    const disabled = item.status === '停用';
    const uses = Math.max(0, Number(item.uses) || 0);
    const tags = ['region','gender','ageRange','style','skinTone','hairColor']
      .map(field => {
        const label = modelConfigFields.find(([key]) => key === field)?.[1] || field;
        const value = config[field] || '未配置';
        return `<span title="${escapeHtml(`${label}：${value}`)}">${escapeHtml(value)}</span>`;
      }).join('');
    return `<article class="model-prototype-card ${disabled ? 'is-disabled' : ''}" data-editor-row-key="${escapeHtml(item.id)}">
      <div class="model-card-main">
        <div class="model-card-media media-preview-trigger" data-media-preview data-preview-type="image" data-preview-src="${escapeHtml(image)}" data-preview-name="${escapeHtml(modelPrototypeTitle(item))}" data-preview-source="模特原型" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(modelPrototypeTitle(item))}">
          <span aria-hidden="true">人像</span><img src="${escapeHtml(image)}" alt="${escapeHtml(modelPrototypeTitle(item))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">
        </div>
        <div class="model-card-content">
          <div class="model-card-heading"><h3>${escapeHtml(modelPrototypeTitle(item))}</h3><span class="model-status ${disabled ? 'disabled' : 'enabled'}">${disabled ? '停用' : '启用'}</span></div>
          <div class="model-card-tags">${tags}</div>
          <p class="model-card-build"><span>身高</span><b>${escapeHtml(config.height || '未配置')}</b><i>/</i><span>体型</span><b>${escapeHtml(config.bodyType || '未配置')}</b></p>
          <div class="model-card-usage"><span>使用次数</span><b>${uses.toLocaleString('zh-CN')} 次</b></div>
        </div>
      </div>
      <div class="model-card-actions">
        <button class="model-card-action prototype-detail" type="button" data-id="${escapeHtml(item.id)}">查看详情</button>
        <button class="model-card-action prototype-status-toggle" type="button" data-id="${escapeHtml(item.id)}">${disabled ? '启用' : '停用'}</button>
        ${disabled ? `<button class="model-card-action danger prototype-delete" type="button" data-id="${escapeHtml(item.id)}">删除</button>` : ''}
      </div>
    </article>`;
  }
  const sceneConfigFields = [
    ['shotComposition','景别构图'],
    ['toneStyle','色调风格'],
    ['artAtmosphere','艺术氛围']
  ];
  const sceneFilterControls = {
    shotComposition:'scene.shotComposition',
    toneStyle:'scene.toneStyle',
    artAtmosphere:'scene.artAtmosphere'
  };
  function matchesScenePrototypeFilters(item) {
    const config = item.config || {};
    return Object.entries(sceneFilterControls).every(([field, filterKey]) => {
      const selected = libraryMultiFilterState[filterKey];
      return !selected.size || selected.has(String(config[field] || ''));
    });
  }
  function scenePrototypeTitle(item) {
    const config = item.config || {};
    const tone = String(config.toneStyle || '通用色调').split('-')[0];
    const atmosphere = String(config.artAtmosphere || '通用氛围').split('-')[0];
    return `${tone} · ${atmosphere}`;
  }
  function prototypeDisplayTitle(item) {
    return item.kind === 'model' ? modelPrototypeTitle(item) : scenePrototypeTitle(item);
  }
  function scenePrototypeImage(item, index = 0) {
    return item.image || sceneDemoImages[index % sceneDemoImages.length];
  }
  function scenePrototypeCard(item, index) {
    const config = item.config || {};
    const image = scenePrototypeImage(item, index);
    const disabled = item.status === '停用';
    const uses = Math.max(0, Number(item.uses) || 0);
    const fields = sceneConfigFields.map(([field,label]) => `<div><span>${escapeHtml(label)}</span><b title="${escapeHtml(config[field] || '未配置')}">${escapeHtml(config[field] || '未配置')}</b></div>`).join('');
    return `<article class="scene-prototype-card ${disabled ? 'is-disabled' : ''}" data-editor-row-key="${escapeHtml(item.id)}">
      <div class="scene-card-media media-preview-trigger" data-media-preview data-preview-type="image" data-preview-src="${escapeHtml(image)}" data-preview-name="${escapeHtml(scenePrototypeTitle(item))}" data-preview-source="场景模板" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(scenePrototypeTitle(item))}">
        <span aria-hidden="true">场景</span><img src="${escapeHtml(image)}" alt="${escapeHtml(scenePrototypeTitle(item))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">
      </div>
      <div class="scene-card-content">
        <h3>${escapeHtml(scenePrototypeTitle(item))}</h3>
        <div class="scene-card-config">${fields}</div>
        <div class="scene-card-summary"><span>使用次数 <b>${uses.toLocaleString('zh-CN')} 次</b></span><em class="model-status ${disabled ? 'disabled' : 'enabled'}">${disabled ? '停用' : '启用'}</em></div>
      </div>
      <div class="model-card-actions scene-card-actions">
        <button class="model-card-action prototype-detail" type="button" data-id="${escapeHtml(item.id)}">查看详情</button>
        <button class="model-card-action prototype-status-toggle" type="button" data-id="${escapeHtml(item.id)}">${disabled ? '启用' : '停用'}</button>
        ${disabled ? `<button class="model-card-action danger prototype-delete" type="button" data-id="${escapeHtml(item.id)}">删除</button>` : ''}
      </div>
    </article>`;
  }
  function renderPrototypeLibrary(filter = '') {
    const kind = activePrototypeTab === 'scene' ? 'scene' : 'model';
    const showingModels = kind === 'model';
    const sceneUnavailable = activeAiEdition === 'phase1' && kind === 'scene';
    if ($('#phase1SceneUnavailable')) $('#phase1SceneUnavailable').hidden = !sceneUnavailable;
    if (sceneUnavailable) {
      $('#modelPrototypeFilters').hidden = true;
      $('#scenePrototypeFilters').hidden = true;
      $('#modelPrototypeGrid').hidden = true;
      $('#scenePrototypeGrid').hidden = true;
      $('#prototypeTableWrap').hidden = true;
      renderPrototypeCounts();
      return;
    }
    syncLibraryMultiFilterOptions(kind);
    $('#modelPrototypeFilters').hidden = !showingModels;
    $('#scenePrototypeFilters').hidden = showingModels;
    $('#modelPrototypeGrid').hidden = !showingModels;
    $('#scenePrototypeGrid').hidden = showingModels;
    $('#prototypeTableWrap').hidden = true;
    const list = prototypes.filter(item => item.kind === kind && (showingModels ? matchesModelPrototypeFilters(item) : matchesScenePrototypeFilters(item)));
    renderPrototypeCounts();
    if (showingModels) {
      $('#modelPrototypeGrid').innerHTML = list.length
        ? list.map(modelPrototypeCard).join('')
        : '<div class="model-prototype-empty"><b>未找到匹配的模特原型</b><span>可重置筛选条件后查看全部原型。</span></div>';
      return;
    }
    $('#scenePrototypeGrid').innerHTML = list.length
      ? list.map(scenePrototypeCard).join('')
      : '<div class="scene-prototype-empty"><b>未找到匹配的场景模板</b><span>可重置筛选条件后查看全部模板。</span></div>';
  }

  function usageTaskRow(taskId, taskName) {
    return tasks.find(row => taskId && row?.[7]?.id === taskId) || tasks.find(row => row?.[0] === taskName) || null;
  }
  function uniqueOutputCount(outputs) {
    return new Set(outputs.map((item, index) => item.assetId || `${item.nodeKey || 'node'}-${item.name || 'output'}-${item.time || index}`)).size;
  }
  function nodeOutputMetrics(taskId, taskName, nodeKey, records, taskRow) {
    const metaStat = taskRow?.[7]?.nodeStats?.[nodeKey] || {};
    const outputs = nodeOutputs.filter(item => (taskId ? item.taskId === taskId : item.task === taskName) && item.nodeKey === nodeKey);
    const storedOutputs = outputs.filter(item => item.saved);
    const recordGenerated = records.reduce((sum, item) => sum + (Number(item.generatedCount) || 0), 0);
    const successfulCalls = records.filter(item => !String(item.status).includes('失败')).length;
    const generated = Object.prototype.hasOwnProperty.call(metaStat, 'generated')
      ? Math.max(0, Number(metaStat.generated) || 0)
      : recordGenerated || (outputs.length ? uniqueOutputCount(outputs) : successfulCalls);
    const stored = Object.prototype.hasOwnProperty.call(metaStat, 'stored')
      ? Math.max(0, Number(metaStat.stored) || 0)
      : uniqueOutputCount(storedOutputs);
    const mediaTypes = [...new Set(storedOutputs.map(item => item.type).filter(Boolean))];
    const taskMediaType = taskRow?.[1] === '视频' ? '视频' : taskRow?.[1] === '图片' ? '图片' : records.some(item => item.mediaType === '视频') ? '视频' : '图片';
    return { generated:Math.max(generated, stored), stored, mediaType:mediaTypes.includes('视频') ? '视频' : mediaTypes.includes('图片') ? '图片' : taskMediaType };
  }
  function nodeWasteQuota(records, generated, stored) {
    const total = records.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    if (!total) return 0;
    const failedQuota = records.filter(item => String(item.status).includes('失败')).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const retryQuota = records.filter(item => !String(item.status).includes('失败')).reduce((sum, item) => {
      const phases = Array.isArray(item.phases) ? item.phases.filter(phase => String(phase.name).includes('失败') || String(phase.result).includes('重试')) : [];
      return sum + phases.reduce((phaseSum, phase) => phaseSum + quotaFromUsage((Number(phase.input) || 0) + (Number(phase.output) || 0), item.model), 0);
    }, 0);
    const productiveQuota = Math.max(0, total - failedQuota - retryQuota);
    if (!generated) return total;
    const unusedShare = Math.max(0, generated - Math.min(stored, generated)) / generated;
    return Math.min(total, failedQuota + retryQuota + productiveQuota * unusedShare);
  }
  function syncTokenDetailFilterOptions() {
    const taskOwners = tasks.map(taskOwnerParts);
    const definitions = [
      { type:'org', element:$('#tokenOrgFilter'), values:[...new Set([...tokenDetails.map(item => item.org), ...taskOwners.map(item => item.org)].filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN')) },
      { type:'account', element:$('#tokenAccountFilter'), values:[...new Set([...tokenDetails.map(item => item.executorName || executionPersonName(item.account)), ...taskOwners.map(item => executionPersonName(item.creator))].filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN')) }
    ];
    definitions.forEach(({ type, element, values }) => {
      if (!element) return;
      const selected = tokenDetailMultiFilterState[type];
      [...selected].forEach(value => { if (!values.includes(value)) selected.delete(value); });
      const allLabel = element.dataset.allLabel;
      $('.token-multi-menu', element).innerHTML = `<label class="token-multi-option token-multi-all"><input type="checkbox" data-token-multi-all${selected.size ? '' : ' checked'}><span>${escapeHtml(allLabel)}</span></label>${values.map(value => `<label class="token-multi-option"><input type="checkbox" data-token-multi-value="${escapeHtml(value)}"${selected.has(value) ? ' checked' : ''}><span>${escapeHtml(value)}</span></label>`).join('')}`;
      updateTokenMultiFilterSummary(type);
    });
  }
  function updateTokenMultiFilterSummary(type) {
    const element = $(`[data-token-multi-filter="${type}"]`);
    if (!element) return;
    const selected = tokenDetailMultiFilterState[type];
    const values = [...selected];
    const summary = $('[data-token-multi-summary]', element);
    summary.textContent = values.length === 0 ? element.dataset.allLabel : values.length === 1 ? values[0] : `已选 ${values.length} 项`;
    summary.title = values.join('、');
    element.classList.toggle('has-selection', values.length > 0);
    const allInput = $('[data-token-multi-all]', element);
    if (allInput) allInput.checked = values.length === 0;
    $$('[data-token-multi-value]', element).forEach(input => { input.checked = selected.has(input.dataset.tokenMultiValue); });
  }
  function closeTokenMultiFilters() {
    $$('[data-token-multi-filter][open]').forEach(element => { element.open = false; });
  }
  function taskMaterialConfigNarrativeMarkup(nodeKey, config, uploadCount = 0) {
    const uploadText = `${Math.max(0, Number(uploadCount) || 0)} 张`;
    if (!config || !Object.keys(config).length) return `<section class="detail-section"><h4 class="detail-section-title">本批次配置</h4><div class="detail-fields"><div class="detail-field"><span>上传素材</span><b>${uploadText}</b></div><div class="detail-field"><span>处理配置</span><b>历史记录未保存</b></div></div></section>`;
    const mediaType = normalizeNodeMediaType(nodeKey, config.mediaType || '图片');
    const groups = (templateConfigSchemas[nodeKey] || []).map(group => {
      const fields = group.fields
        .filter(([, , mode = '']) => !mode.startsWith('video') || mediaType === '视频')
        .filter(([, , mode = '']) => mode !== 'image' || mediaType !== '视频');
      if (!fields.length) return '';
      const values = fields.map(([field,label]) => `<div class="detail-field"><span>${escapeHtml(label)}</span><b>${escapeHtml(templateConfigValue(config[field], field, config))}</b></div>`).join('');
      return `<section class="detail-section"><h4 class="detail-section-title">${escapeHtml(group.title)}</h4><div class="detail-fields">${values}</div></section>`;
    }).join('');
    return `<section class="detail-section"><h4 class="detail-section-title">本批次配置</h4><div class="detail-fields"><div class="detail-field"><span>上传素材</span><b>${uploadText}</b></div></div></section>${groups}`;
  }
  function generationBatchOutputText(batch) {
    const count = batch.outputBreakdown || {};
    return `图片 ${Math.max(0, Number(count.image) || 0)} 张 · 视频 ${Math.max(0, Number(count.video) || 0)} 个 · 模特原型 ${Math.max(0, Number(count.model) || 0)} 个 · 场景模板 ${Math.max(0, Number(count.scene) || 0)} 个`;
  }
  function taskGenerationBatchesMarkup(nodeKey, batches, activeAttempt) {
    if (!batches.length) return '<div class="task-material-config-empty">历史素材处理配置未记录</div>';
    const matchedIndex = batches.findIndex(batch => Number(batch.attempt) === Number(activeAttempt));
    const activeIndex = matchedIndex >= 0 ? matchedIndex : batches.length - 1;
    const tabs = batches.length > 1 ? `<div class="task-generation-tabs" role="tablist" aria-label="生成批次">${batches.map((batch, index) => {
      const attempt = Math.max(1, Number(batch.attempt) || index + 1);
      const isActive = index === activeIndex;
      return `<button type="button" class="task-generation-tab${isActive ? ' active' : ''}" role="tab" aria-selected="${isActive}" data-batch-tab="${attempt}"><span>V${attempt}</span></button>`;
    }).join('')}</div>` : '';
    const panels = batches.map((batch, index) => {
      const attempt = Math.max(1, Number(batch.attempt) || index + 1);
      const isActive = index === activeIndex;
      const storedCount = Math.max(0, Number(batch.storedCount) || 0);
      const singleBatchHead = batches.length === 1 ? `<h4 class="detail-section-title">V${attempt}</h4>` : '';
      return `<section class="task-generation-panel detail-section${isActive ? ' active' : ''}" role="tabpanel" data-batch-panel="${attempt}"${isActive ? '' : ' hidden'}>${singleBatchHead}<div class="detail-fields"><div class="detail-field detail-field-wide"><span>生成结果</span><b>${escapeHtml(generationBatchOutputText(batch))}</b></div><div class="detail-field"><span>入库结果</span><b>${storedCount} 份</b></div><div class="detail-field"><span>生成时间</span><b>${escapeHtml(batch.time || '—')}</b></div></div>${taskMaterialConfigNarrativeMarkup(nodeKey, batch.config || {}, batch.uploadCount)}</section>`;
    }).join('');
    return `<div data-batch-group="${escapeHtml(nodeKey)}">${tabs}<div class="task-generation-panels">${panels}</div></div>`;
  }
  function taskMaterialDetailMarkup(group, taskRow) {
    const meta = taskRow?.[7] || {};
    const fallback = taskMaterialDetailDefaults[group.taskId] || {};
    const outputs = taskRow ? taskItemsForRow(nodeOutputs, taskRow) : [];
    const observedBreakdown = buildTaskOutputBreakdown(outputs);
    const sections = group.nodes.map((nodeItem, index) => {
      const nodeKey = nodeItem.key;
      const nodeOutputsForTask = outputs.filter(item => item.nodeKey === nodeKey);
      const latestOutput = [...nodeOutputsForTask].sort((a,b) => String(b.time || '').localeCompare(String(a.time || '')))[0];
      const config = meta.nodeConfigs?.[nodeKey] || latestOutput?.configSnapshot || latestOutput?.prototypeConfig || fallback.configs?.[nodeKey] || null;
      const uploadCount = Object.prototype.hasOwnProperty.call(meta.uploadCounts || {}, nodeKey)
        ? Number(meta.uploadCounts[nodeKey]) || 0
        : Object.prototype.hasOwnProperty.call(fallback.uploadCounts || {}, nodeKey) ? Number(fallback.uploadCounts[nodeKey]) || 0 : null;
      let batches = meta.generationBatches?.[nodeKey] || fallback.generationBatches?.[nodeKey] || [];
      if (!Array.isArray(batches)) batches = [];
      if (!batches.length && config) {
        batches = [{ attempt:1, generationMode:'initial', basedOnAttempt:null, config, uploadCount:uploadCount || 0, outputBreakdown:meta.outputBreakdown?.[nodeKey] || fallback.outputBreakdown?.[nodeKey] || observedBreakdown[nodeKey] || {image:0,video:0,model:0,scene:0}, storedCount:nodeItem.stored || 0, time:nodeItem.latest || '—' }];
      }
      batches = batches.map((batch, batchIndex) => ({ ...batch, attempt:Number(batch.attempt) || batchIndex + 1, config:{ ...(batch.config || {}) } })).sort((a,b) => a.attempt - b.attempt);
      const latestBatch = batches.at(-1);
      const storedBatches = batches.filter(batch => Number(batch.storedCount) > 0);
      const storedCount = batches.reduce((sum, batch) => sum + (Number(batch.storedCount) || 0), 0);
      const activeBatch = storedBatches.at(-1) || latestBatch;
      const batchContent = taskGenerationBatchesMarkup(nodeKey, batches, activeBatch?.attempt);
      return `<section class="detail-section"><h3 class="detail-section-title">节点 ${index + 1} · ${escapeHtml(nodeItem.name)}</h3><div class="detail-fields"><div class="detail-field"><span>生成次数</span><b>${batches.length ? `${batches.length} 次` : '未记录'}</b></div><div class="detail-field"><span>入库数量</span><b>${storedCount} 份</b></div></div>${batchContent}</section>`;
    }).join('');
    const storedAssets = permittedAssets().filter(row => String(row[8]?.taskId || '') === String(group.taskId || ''));
    const assetShortcut = storedAssets.length
      ? `<button class="button secondary task-assets-shortcut" type="button" data-task-id="${escapeHtml(group.taskId)}">去素材库查看</button>`
      : '<button class="button secondary" type="button" disabled>暂无可查看素材</button>';
    return `<div class="task-material-dialog dialog-wide-content"><section class="detail-section"><h3 class="detail-section-title">任务信息</h3><div class="detail-fields"><div class="detail-field"><span>任务名称</span><b>${escapeHtml(group.task)}</b></div><div class="detail-field"><span>任务 ID</span><b>${escapeHtml(group.taskId)}</b></div><div class="detail-field detail-field-wide"><span>入库素材</span><div class="task-assets-shortcut-row"><b>${storedAssets.length.toLocaleString('zh-CN')} 份</b>${assetShortcut}</div></div></div></section>${sections || '<section class="detail-section"><h3 class="detail-section-title">执行节点</h3><p>暂无已执行节点</p></section>'}</div>`;
  }

  function showTaskAssets(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return;
    closeDialog();
    showView('assets');
    clearAssetFilters({ keepTaskId:id });
    renderAssets('');
    toast(`已查看任务 ${id} 的入库素材`);
  }
  function tokenQuotaDetailMarkup(group) {
    const nodeRows = group.nodes.map(nodeItem => `<tr><td><b>${escapeHtml(nodeItem.name)}</b></td><td>${escapeHtml(nodeItem.models.join('、'))}</td><td class="number-cell"><b>${nodeItem.calls.toLocaleString('zh-CN')} 次</b></td><td class="number-cell"><b>${formatCny(nodeItem.total)}</b></td><td class="number-cell">${formatCny(nodeItem.waste)}</td><td class="number-cell">${nodeItem.generated.toLocaleString('zh-CN')} 份</td><td class="number-cell">${nodeItem.stored.toLocaleString('zh-CN')} 份</td><td>${escapeHtml(nodeItem.latest)}</td></tr>`).join('');
    return `<div class="token-detail-dialog dialog-wide-content"><section class="detail-section"><h3 class="detail-section-title">额度概览</h3><div class="detail-fields"><div class="detail-field"><span>节点数</span><b>${group.nodeCount.toLocaleString('zh-CN')} 个</b></div><div class="detail-field"><span>调用 AI 次数</span><b>${group.executions.toLocaleString('zh-CN')} 次</b></div><div class="detail-field"><span>消耗额度</span><b>${formatCny(group.total)}</b></div><div class="detail-field"><span>浪费额度</span><b>${formatCny(group.waste)}</b></div></div></section><section class="detail-section"><h3 class="detail-section-title">节点明细</h3><div class="table-wrap token-dialog-table"><table class="phase-table node-consumption-table"><thead><tr><th>节点</th><th>AI模型</th><th>调用AI次数</th><th>消耗额度</th><th>浪费额度</th><th>生成素材数</th><th>入库素材数</th><th>最近执行时间</th></tr></thead><tbody>${nodeRows}</tbody></table></div></section></div>`;
  }
  let renderedTokenTaskGroups = new Map();
  function renderTokenDetails() {
    syncTokenDetailFilterOptions();
    const query = $('#tokenTaskSearch').value.trim().toLowerCase();
    const selectedOrgs = tokenDetailMultiFilterState.org;
    const selectedAccounts = tokenDetailMultiFilterState.account;
    const list = tokenDetails.filter(item => matchesTimeFilter(item.time, 'usageDetails') && (!query || item.task.toLowerCase().includes(query) || item.taskId.toLowerCase().includes(query)) && (!selectedOrgs.size || selectedOrgs.has(item.org)) && (!selectedAccounts.size || selectedAccounts.has(item.executorName || executionPersonName(item.account))));
    const executionCount = records => records.reduce((sum, item) => sum + 1 + Math.max(0, Number(item.retry) || 0), 0);
    const sumField = (records, field) => records.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
    const groupedTasks = new Map();
    list.forEach(item => {
      const key = item.taskId || item.task;
      if (!groupedTasks.has(key)) groupedTasks.set(key, { key, taskId:item.taskId || '—', task:item.task, records:[] });
      groupedTasks.get(key).records.push(item);
    });
    tasks.filter(row => row[5] === '暂存').forEach(row => {
      const meta = row[7] || {};
      const taskId = String(meta.id || '');
      const taskName = String(row[0] || '');
      const owner = taskOwnerParts(row);
      const draftTime = meta.updatedAt || meta.createdAt || row[6];
      const matchesQuery = !query || taskName.toLowerCase().includes(query) || taskId.toLowerCase().includes(query);
      const matchesOrg = !selectedOrgs.size || selectedOrgs.has(owner.org);
      const matchesAccount = !selectedAccounts.size || selectedAccounts.has(executionPersonName(owner.creator));
      if (!matchesQuery || !matchesOrg || !matchesAccount || !matchesTimeFilter(draftTime, 'usageDetails')) return;
      const key = taskId || taskName;
      if (!groupedTasks.has(key)) groupedTasks.set(key, { key, taskId:taskId || '—', task:taskName, records:[], taskRow:row });
      else groupedTasks.get(key).taskRow = row;
    });
    const taskGroups = [...groupedTasks.values()].map(group => {
      const records = group.records;
      const taskRow = group.taskRow || usageTaskRow(group.taskId, group.task);
      const groupedNodes = new Map();
      records.forEach(item => {
        const key = item.nodeKey || item.node;
        if (!groupedNodes.has(key)) groupedNodes.set(key, { key, name:item.node, records:[] });
        groupedNodes.get(key).records.push(item);
      });
      const routeOrder = taskRow ? taskRouteKeys(taskRow) : [];
      const nodes = [...groupedNodes.values()].sort((a,b) => {
        const aIndex = routeOrder.indexOf(a.key);
        const bIndex = routeOrder.indexOf(b.key);
        return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
      }).map(nodeGroup => {
        const nodeRecords = nodeGroup.records;
        const failed = nodeRecords.some(item => String(item.status).includes('失败'));
        const retried = nodeRecords.some(item => Number(item.retry));
        const status = failed ? '含失败' : retried ? '含重试' : '成功';
        const statusClass = failed ? 'error' : retried ? 'warning' : 'success';
        const outputMetrics = nodeOutputMetrics(group.taskId, group.task, nodeGroup.key, nodeRecords, taskRow);
        const total = sumField(nodeRecords, 'total');
        return {
          ...nodeGroup,
          models:[...new Set(nodeRecords.map(item => item.model))],
          calls:executionCount(nodeRecords), total,
          waste:nodeWasteQuota(nodeRecords, outputMetrics.generated, outputMetrics.stored),
          generated:outputMetrics.generated, stored:outputMetrics.stored, mediaType:outputMetrics.mediaType,
          status, statusClass, latest:nodeRecords.map(item => item.time).sort().at(-1) || '—'
        };
      });
      const taskStatus = taskRow?.[5] || (records.some(item => String(item.status).includes('失败')) ? '已终止' : '已完成');
      const taskOwner = taskOwnerParts(taskRow || []);
      const executionTimes = records.map(item => item.time).filter(Boolean).sort();
      const taskTime = taskRow?.[7]?.updatedAt || taskRow?.[7]?.createdAt || taskRow?.[6] || '';
      return {
        ...group,
        orgs:[...new Set([...records.map(item => item.org), taskOwner.org].filter(Boolean))],
        executors:[...new Set([...records.map(item => item.executorName || executionPersonName(item.account)), executionPersonName(taskOwner.creator)].filter(Boolean))],
        total:sumField(records, 'total'), waste:nodes.reduce((sum, item) => sum + item.waste, 0),
        nodeCount:nodes.length,
        executions:executionCount(records),
        latest:executionTimes.at(-1) || (taskStatus === '暂存' ? '尚未执行' : '—'),
        sortTime:executionTimes.at(-1) || taskTime,
        hasQuotaDetails:records.length > 0,
        taskStatus, nodes
      };
    }).sort((a,b) => String(b.sortTime || '').localeCompare(String(a.sortTime || '')));
    renderedTokenTaskGroups = new Map(taskGroups.map(group => [String(group.key), group]));
    $('#tokenDetailRows').innerHTML = taskGroups.length ? taskGroups.map(group => {
      const taskStatusClass = { '已完成':'success', '已终止并入库':'warning', '已终止':'error', '暂存':'info' }[group.taskStatus] || 'info';
      const quotaAction = group.hasQuotaDetails
        ? `<button class="table-link open-token-detail" data-group-key="${escapeHtml(group.key)}">额度明细</button>`
        : '<button class="table-link" type="button" disabled title="暂存任务尚未产生额度明细">额度明细</button>';
      return `<tr class="token-main-row" data-editor-row-key="${escapeHtml(group.key)}"><td><b>${escapeHtml(group.task)}</b><small>${escapeHtml(group.taskId)}</small></td><td>${escapeHtml(group.orgs.join('、') || '—')}<small>${escapeHtml(group.executors.join('、') || '—')}</small></td><td class="number-cell"><b>${formatCny(group.total)}</b></td><td class="number-cell">${formatCny(group.waste)}</td><td class="number-cell">${group.nodeCount.toLocaleString('zh-CN')}</td><td class="number-cell"><b>${group.executions.toLocaleString('zh-CN')} 次</b></td><td><span class="status ${taskStatusClass}">${escapeHtml(group.taskStatus)}</span></td><td>${escapeHtml(group.latest)}</td><td class="token-row-actions">${quotaAction}<button class="table-link open-task-material-detail" data-group-key="${escapeHtml(group.key)}">任务详情</button></td></tr>`;
    }).join('') : `<tr><td colspan="9" class="empty-cell">${hasActiveTimeFilter('usageDetails') ? '所选日期范围内未找到匹配任务' : '未找到匹配任务'}</td></tr>`;
    const allNodes = taskGroups.flatMap(group => group.nodes);
    const listTotal = taskGroups.reduce((sum, group) => sum + group.total, 0);
    const wasteTotal = taskGroups.reduce((sum, group) => sum + group.waste, 0);
    const mediaTotals = { 图片:{ quota:0, stored:0 }, 视频:{ quota:0, stored:0 } };
    allNodes.filter(item => item.stored > 0).forEach(item => {
      const mediaType = item.mediaType === '视频' ? '视频' : '图片';
      mediaTotals[mediaType].quota += item.total;
      mediaTotals[mediaType].stored += item.stored;
    });
    const totalNodes = allNodes.length;
    const totalCalls = taskGroups.reduce((sum, group) => sum + group.executions, 0);
    $('#tokenDetailCount').textContent = `共 ${taskGroups.length} 条任务`;
    $('#detailConsumedQuota').textContent = formatCny(listTotal);
    $('#detailImageAverage').textContent = formatCny(mediaTotals.图片.stored ? mediaTotals.图片.quota / mediaTotals.图片.stored : 0);
    $('#detailVideoAverage').textContent = formatCny(mediaTotals.视频.stored ? mediaTotals.视频.quota / mediaTotals.视频.stored : 0);
    $('#detailWasteQuota').textContent = formatCny(wasteTotal);
    $('#detailWasteShare').textContent = `${listTotal ? (wasteTotal / listTotal * 100).toFixed(1) : '0.0'}%`;
    $('#detailCallsPerNode').textContent = (totalNodes ? totalCalls / totalNodes : 0).toFixed(2);
    $('#detailCallsPerNodeNote').textContent = `AI 调用总次数 ÷ 总节点数（${totalCalls.toLocaleString('zh-CN')} ÷ ${totalNodes.toLocaleString('zh-CN')}）`;
  }

  function openDialog(title, subtitle, body, confirmText = '确定', action = null) {
    const dialogBody = $('#dialogBody');
    dialogBody.onclick = null;
    dialogBody.onmousedown = null;
    dialogBody.onchange = null;
    dialogBody.oninput = null;
    dialogBody.onsubmit = null;
    $('#dialogTitle').textContent = title;
    const dialogSubtitle = $('#dialogSubtitle');
    dialogSubtitle.textContent = subtitle || '';
    dialogSubtitle.hidden = !subtitle;
    dialogBody.innerHTML = body;
    applyDefaultBusinessTextLimits(dialogBody);
    $('#dialogConfirm').textContent = confirmText; $('#dialogConfirm').hidden = !confirmText;
    const isDetailDialog = /(?:详情|明细)$/.test(title);
    $('#mainDialog').classList.toggle('dialog-wide', isDetailDialog || Boolean($('.dialog-wide-content', $('#dialogBody'))));
    $('#mainDialog').classList.toggle('detail-dialog', isDetailDialog);
    $('.dialog-cancel').hidden = isDetailDialog && confirmText === '关闭'; $('.dialog-close').hidden = false; dialogAction = action;
    const prototypeLayerDialog = prototypeMode !== 'experience';
    $('#mainDialog').classList.toggle('prototype-layer-dialog', prototypeLayerDialog);
    if (prototypeLayerDialog) delete $('#mainDialog').dataset.businessDialogKey;
    else $('#mainDialog').dataset.businessDialogKey = title || '业务弹窗';
    if (!$('#mainDialog').open) $('#mainDialog').show();
    syncDialogBackdrop();
    scheduleEditableRefresh();
  }
  function syncDialogBackdrop() {
    const backdrop = $('#businessDialogBackdrop');
    const mainDialog = $('#mainDialog');
    const mediaDialog = $('#mediaPreviewDialog');
    const hasOpenDialog = Boolean(mainDialog?.open || mediaDialog?.open);
    backdrop.hidden = !hasOpenDialog;
    backdrop.classList.toggle('prototype-layer', Boolean(mainDialog?.open && mainDialog.classList.contains('prototype-layer-dialog')));
    syncBusinessDialogHorizontalScroll();
  }
  function syncBusinessDialogHorizontalScroll() {
    const mainDialog = $('#mainDialog');
    const mediaDialog = $('#mediaPreviewDialog');
    const hasOpenDialog = Boolean(mainDialog?.open || mediaDialog?.open);
    const followsBusinessCanvas = hasOpenDialog && ['spec','copy'].includes(prototypeMode);
    let scrollLeft = 0;
    if (followsBusinessCanvas) {
      scrollLeft = document.body.classList.contains('spec-panel-open')
        ? Number($('.workspace')?.scrollLeft || 0)
        : Number(document.scrollingElement?.scrollLeft || window.scrollX || 0);
    }
    document.documentElement.style.setProperty('--business-dialog-offset-x', `${-scrollLeft}px`);
  }
  function canScrollHorizontally(element, delta) {
    if (!element || element.scrollWidth <= element.clientWidth + 1) return false;
    const max = element.scrollWidth - element.clientWidth;
    return delta < 0 ? element.scrollLeft > 0 : element.scrollLeft < max;
  }
  function forwardDialogHorizontalWheel(event) {
    if (!['spec','copy'].includes(prototypeMode)) return;
    const delta = Math.abs(event.deltaX) > .5 ? event.deltaX : event.shiftKey && Math.abs(event.deltaY) > .5 ? event.deltaY : 0;
    if (!delta) return;
    const localScroller = event.target.closest?.('.dialog-body,.media-preview-content');
    if (canScrollHorizontally(localScroller, delta)) return;
    const businessScroller = document.body.classList.contains('spec-panel-open') ? $('.workspace') : document.scrollingElement;
    if (!canScrollHorizontally(businessScroller, delta)) return;
    const before = businessScroller.scrollLeft;
    businessScroller.scrollLeft += delta;
    if (businessScroller.scrollLeft !== before) event.preventDefault();
  }
  function closeDialog() {
    if ($('#mainDialog').open) $('#mainDialog').close();
    $('#mainDialog').classList.remove('prototype-layer-dialog');
    dialogAction = null;
    syncDialogBackdrop();
  }

  function openMediaPreview(trigger) {
    const dialog = $('#mediaPreviewDialog');
    if (!dialog || !trigger) return;
    const type = trigger.dataset.previewType === 'video' ? 'video' : 'image';
    const name = trigger.dataset.previewName || '素材预览';
    const media = trigger.dataset.previewSrc || trigger.querySelector('img,video')?.currentSrc || trigger.querySelector('img,video')?.src || '';
    const content = $('#mediaPreviewContent');
    dialog.dataset.businessDialogKey = `媒体预览-${name}`;
    content.replaceChildren();
    if (media) {
      const element = document.createElement(type === 'video' ? 'video' : 'img');
      element.src = media;
      if (type === 'video') { element.controls = true; element.playsInline = true; element.preload = 'metadata'; }
      else element.alt = name;
      content.append(element);
    } else {
      const visual = type === 'video' ? null : (trigger.matches('.generated-media,.upload-thumb,.cache-preview,.asset-thumbnail') ? trigger : trigger.querySelector('.generated-media,.upload-thumb,.cache-preview,.asset-thumbnail'))?.cloneNode(true);
      if (type === 'video') {
        const player = document.createElement('video');
        player.controls = true;
        player.playsInline = true;
        player.preload = 'metadata';
        player.className = 'media-preview-empty-player';
        player.setAttribute('aria-label', `视频播放器：${name}`);
        content.append(player);
      } else if (visual) {
        visual.classList.add('media-preview-demo-visual');
        visual.removeAttribute('data-media-preview');
        visual.removeAttribute('role');
        visual.removeAttribute('tabindex');
        content.append(visual);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = `media-preview-placeholder ${type}`;
        placeholder.innerHTML = `<b>${type === 'video' ? '▶' : 'IMG'}</b><span>${type === 'video' ? '视频预览' : '图片预览'}</span><small>当前原型未关联实际媒体文件</small>`;
        content.append(placeholder);
      }
      const note = document.createElement('small');
      note.className = 'media-preview-demo-note';
      note.textContent = type === 'video' ? '原型示意视频未关联实际文件；上传的本地视频可在此播放。' : '原型示意素材未关联实际图片文件。';
      content.append(note);
    }
    $('#mediaPreviewCaption').textContent = `${trigger.dataset.previewSource ? `${trigger.dataset.previewSource} · ` : ''}${name}`;
    if (!dialog.open) dialog.show();
    syncDialogBackdrop();
    scheduleEditableRefresh();
  }
  function closeMediaPreview() {
    const dialog = $('#mediaPreviewDialog');
    const video = $('#mediaPreviewContent video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    $('#mediaPreviewContent').replaceChildren();
    if (dialog?.open) dialog.close();
    syncDialogBackdrop();
    scheduleEditableRefresh();
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-media-preview]');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMediaPreview(trigger);
  }, true);
  document.addEventListener('keydown', event => {
    if (!['Enter',' '].includes(event.key)) return;
    const trigger = event.target.closest?.('[data-media-preview]');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMediaPreview(trigger);
  }, true);
  $('#closeMediaPreview').addEventListener('click', closeMediaPreview);
  $('#mediaPreviewDialog').addEventListener('click', event => { if (event.target === $('#mediaPreviewDialog')) closeMediaPreview(); });
  $('#mediaPreviewDialog').addEventListener('close', () => { if ($('#mediaPreviewContent').childElementCount) closeMediaPreview(); });

  function setSelectedNodes(nodes) {
    const availableNodes = activeAiEdition === 'phase1' ? nodes.filter(key => key !== 'detail') : nodes;
    $$('.node-card').forEach(card => { const on = availableNodes.includes(card.dataset.node); card.classList.toggle('selected', on); $('.node-check input', card).checked = on; }); updateWorkflow();
  }
  function useTaskTemplate(item) {
    if (activeAiEdition === 'phase1') { toast('AI素材（一期）暂不支持任务模板', 'info'); return; }
    if (activeAiEdition === 'phase1' && item.nodes?.includes('detail')) { toast('该模板包含素材裂变节点，当前处于开发中', 'info'); return; }
    if (activeView !== 'workspace') activeVisualDemandId = null;
    item.uses += 1; item.last = today(); persistTemplates(); setSelectedNodes(item.nodes);
    restoredDraftConfigs = Object.fromEntries(item.nodes.map(key => {
      const config = item.configs?.[key] || {};
      return [key, { ...defaultConfigs[key], ...config, mediaType:normalizeNodeMediaType(key, config.mediaType || item.type || defaultConfigs[key].mediaType), ratio:config.ratio || (item.type === '视频' ? '9:16' : defaultConfigs[key].ratio) }];
    }));
    $('#taskName').value = `${item.name} - 新任务`.slice(0, TASK_NAME_MAX_LENGTH); $('#nameCount').textContent = $('#taskName').value.length.toLocaleString('zh-CN'); showView('workspace'); setCreationStage(1); toast(`已套用任务模板“${item.name}”，请确认任务信息与节点`);
  }
  function useTemplate(id) {
    const item = templates.find(template => template.id === Number(id)); if (!item) return;
    if (activeAiEdition === 'phase1' && item.scope === 'task') { toast('AI素材（一期）暂不支持任务模板', 'info'); return; }
    if (activeAiEdition === 'phase1' && (item.nodeKey === 'detail' || item.nodes?.includes('detail'))) { toast('素材裂变开发中，敬请期待', 'info'); return; }
    if (item.scope === 'node') {
      if (activeView !== 'workspace') activeVisualDemandId = null;
      item.uses += 1; item.last = today(); persistTemplates();
      setSelectedNodes([item.nodeKey]);
      restoredDraftConfigs = { [item.nodeKey]:{ ...defaultConfigs[item.nodeKey], ...(item.config || {}), mediaType:normalizeNodeMediaType(item.nodeKey, item.config?.mediaType || item.type || defaultConfigs[item.nodeKey].mediaType), ratio:item.config?.ratio || (item.type === '视频' ? '9:16' : defaultConfigs[item.nodeKey].ratio) } };
      showView('workspace'); setCreationStage(1); toast(`已套用节点模板“${item.name}”，请补充任务信息后执行`);
    } else useTaskTemplate(item);
  }
  function openTemplatePicker() {
    if (activeAiEdition === 'phase1') { toast('AI素材（一期）暂不支持任务模板', 'info'); return; }
    const available = templates.filter(item => item.scope === 'task' && item.status === '启用' && (activeAiEdition !== 'phase1' || !item.nodes?.includes('detail')));
    openDialog('选择任务模板','模板带入节点组合与配置，不包含任何图片或视频',`<div class="template-picker-note">套用后仍可调整节点、重新选择输入素材和修改详细要求。</div><div class="progress-list">${available.map((item,index) => `<label class="file-row template-choice"><input type="radio" name="tpl" value="${item.id}" ${index === 0 ? 'checked' : ''}><div><b>${escapeHtml(item.name)}</b><small>${item.nodes.map(key => nodeMap[key].name).join(' → ')} · ${item.type} · 已使用 ${item.uses} 次</small></div><span class="scope-badge task">任务</span></label>`).join('')}</div>`,'使用任务模板',() => { const id = $('input[name="tpl"]:checked', $('#dialogBody'))?.value; closeDialog(); useTemplate(id); });
  }
  function applyTemplateToNode(item, nodeKey) {
    if (activeAiEdition === 'phase1' && item.scope !== 'node') { toast('AI素材（一期）仅支持节点模板', 'info'); return; }
    const sourceConfig = item.scope === 'node' ? item.config : item.configs?.[nodeKey];
    if (!sourceConfig) return;
    item.uses += 1; item.last = today(); persistTemplates();
    const mediaFallback = item.type === '视频' ? '视频' : defaultConfigs[nodeKey].mediaType;
    applyConfig(nodeKey, { ...sourceConfig, mediaType:normalizeNodeMediaType(nodeKey, sourceConfig.mediaType || mediaFallback), ratio:sourceConfig.ratio || (mediaFallback === '视频' ? '9:16' : defaultConfigs[nodeKey].ratio) });
    toast(`已套用模板“${item.name}”，仅更新${nodeMap[nodeKey].name}节点配置`);
  }
  function openNodeTemplatePicker(nodeKey) {
    if (activeAiEdition === 'phase1' && nodeKey === 'detail') { toast('素材裂变开发中，敬请期待', 'info'); return; }
    const available = templates.filter(item => item.status === '启用' && (
      (item.scope === 'node' && item.nodeKey === nodeKey) ||
      (activeAiEdition !== 'phase1' && item.scope === 'task' && item.nodes?.includes(nodeKey) && item.configs?.[nodeKey])
    ));
    const pickerNote = activeAiEdition === 'phase1'
      ? '一期仅提供当前节点的节点模板；任务信息、节点顺序和输入素材均保持不变。'
      : '任务信息、节点顺序和输入素材均保持不变；任务模板中的其他节点配置不会带入。';
    openDialog(`选择${nodeMap[nodeKey].name}模板`,'选择当前节点可用的模板，仅套用在当前节点',`<div class="template-picker-note">${pickerNote}</div><div class="progress-list">${available.length ? available.map((item,index) => `<label class="file-row template-choice"><input type="radio" name="nodeTpl" value="${item.id}" ${index === 0 ? 'checked' : ''}><div><b>${escapeHtml(item.name)}</b><small>${item.scope === 'task' ? item.nodes.map(key => nodeMap[key].name).join(' → ') : nodeMap[item.nodeKey].name} · ${item.type} · 已使用 ${item.uses} 次</small></div><span class="scope-badge ${item.scope}">${item.scope === 'task' ? '任务模板' : '节点模板'}</span></label>`).join('') : '<div class="empty-inline">暂无当前节点可用的节点模板</div>'}</div>`,available.length ? '套用至当前节点' : '',() => { const id = $('input[name="nodeTpl"]:checked', $('#dialogBody'))?.value; const item = templates.find(template => template.id === Number(id)); closeDialog(); if (item) applyTemplateToNode(item, nodeKey); });
  }
  function saveCurrentAsTemplate() {
    if (activeAiEdition === 'phase1') { toast('AI素材（一期）暂不支持任务模板', 'info'); return; }
    if (!selectedNodes().length) { toast('请先选择执行节点', 'warning'); return; }
    const defaultName = $('#taskName').value.trim() || '未命名模板';
    const templateType = summarizeConfig(selectedNodes(), null, 'mediaType', '混合');
    openDialog('保存为任务模板','保存节点组合与节点配置；图片、视频和节点产出不会进入模板',`<div class="form-grid" style="padding:0"><label class="field span-2">模板名称 <em>*</em><input id="newTemplateName" maxlength="40" value="${escapeHtml(defaultName)}模板"></label><label class="field">节点输出类型<input value="${templateType}" disabled></label><label class="field">节点组合<input value="${selectedNodes().map(key => nodeMap[key].name).join(' → ')}" disabled></label><label class="field span-2">模板说明<textarea placeholder="补充适用场景，可选"></textarea></label></div>`,'保存任务模板',() => {
      const name = $('#newTemplateName').value.trim(); if (!name) { toast('请填写模板名称', 'warning'); return; }
      const configs = {}; selectedNodes().forEach(key => { configs[key] = collectConfig(key); });
      templates.unshift({ id:Date.now(), name, scope:'task', nodes:selectedNodes(), type:summarizeConfig(selectedNodes(), configs, 'mediaType', '混合'), creator:'管理员 / 品牌中心', uses:0, last:'尚未使用', status:'启用', configs }); persistTemplates(); closeDialog(); toast('任务模板已保存，不包含图片或视频');
    });
  }
  function saveNodeAsTemplate(nodeKey) {
    openDialog(`保存${nodeMap[nodeKey].name}节点模板`,'只保存当前节点配置，不包含输入素材',`<div class="form-grid" style="padding:0"><label class="field span-2">模板名称 <em>*</em><input id="newNodeTemplateName" maxlength="40" value="${nodeMap[nodeKey].name}配置模板"></label><label class="field">模板范围<input value="单节点 · ${nodeMap[nodeKey].name}" disabled></label><label class="field">输出类型<input value="${getNodeMediaType(nodeKey)}" disabled></label></div>`,'保存节点模板',() => {
      const name = $('#newNodeTemplateName').value.trim(); if (!name) { toast('请填写模板名称', 'warning'); return; }
      templates.unshift({ id:Date.now(), name, scope:'node', nodeKey, nodes:[nodeKey], type:getNodeMediaType(nodeKey), creator:'管理员 / 品牌中心', uses:0, last:'尚未使用', status:'启用', config:collectConfig(nodeKey) }); persistTemplates(); closeDialog(); toast('节点模板已保存，不包含输入素材');
    });
  }
  function openPreviousOutputPicker(card) {
    if (!runState || !card) return;
    const currentIndex = Number(card.dataset.index ?? runState.current);
    if (!Number.isFinite(currentIndex) || currentIndex <= 0) { toast('当前节点没有可选择的上一节点', 'info'); return; }
    const previousKey = runState.nodes[currentIndex - 1];
    if (!previousKey) { toast('当前节点没有可选择的上一节点', 'info'); return; }
    const previousNodeName = nodeMap[previousKey]?.name || '上一节点';
    const isDetail = card.dataset.node === 'detail';
    const targetCategory = isDetail ? 'detailTarget' : 'mainProduct';
    const targetLabel = isDetail ? '需精修素材' : '主产品';
    const group = $(`.classified-upload[data-upload-category="${targetCategory}"]`, card);
    const max = Number(group?.dataset.max || 1);
    const currentCount = group ? $$('.uploaded-material-item', group).length : 0;
    const remaining = Math.max(0, max - currentCount);
    if (!remaining) { toast(`${targetLabel}已达到 ${max} 个文件上限，请删除后再选择`, 'warning'); return; }
    const previousOutputs = (runState.outputs || []).filter(item => item.nodeKey === previousKey && (item.outputKind || 'material') === 'material' && item.type === '图片');
    if (!previousOutputs.length) { toast(`${previousNodeName}暂无可选择的图片产出`, 'info'); return; }
    const choices = previousOutputs.map((item, index) => {
      const version = `v${item.attempt || 1}`;
      const label = item.previewLabel || '图片';
      const status = item.retained ? '已预选入库' : '未预选入库';
      return `<label class="file-row template-choice"><input type="radio" name="previousOutputPick" value="${escapeHtml(item.assetId)}" ${index === previousOutputs.length - 1 ? 'checked' : ''}><span class="file-thumb">IMG</span><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(previousNodeName)} · ${version} · ${escapeHtml(label)} · ${escapeHtml(item.ratio || '图片')}</small><small class="picker-status">${status}</small></div></label>`;
    }).join('');
    openDialog(`从${previousNodeName}选择`, `可选择${previousNodeName}生成的全部图片版本（共 ${previousOutputs.length} 个，包含未预选入库版本）`, `<div class="progress-list">${choices}</div>`, `选择为${targetLabel}`, () => {
      const selectedId = $('input[name="previousOutputPick"]:checked', $('#dialogBody'))?.value;
      const selected = previousOutputs.find(item => item.assetId === selectedId);
      if (!selected || !group) { toast('请选择一份上一节点图片', 'warning'); return; }
      const list = $('.classified-file-list', group);
      $('.classified-empty', list)?.remove();
      list.insertAdjacentHTML('beforeend', `<div class="uploaded-material-item" data-asset-source="previous-output" data-asset-id="${escapeHtml(selected.assetId)}" data-asset-name="${escapeHtml(selected.name)}" data-previous-node="${escapeHtml(previousKey || '')}"><div class="upload-thumb-wrap"><div class="upload-thumb library media-preview-trigger" data-media-preview data-preview-type="image" data-preview-name="${escapeHtml(selected.name)}" data-preview-source="${escapeHtml(previousNodeName)}" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(selected.name)}"><span>IMG</span></div><button class="remove-uploaded-material" type="button" title="删除" aria-label="删除${escapeHtml(selected.name)}">×</button></div><div class="uploaded-material-info"><small>${escapeHtml(previousNodeName)} · ${escapeHtml(`v${selected.attempt || 1}`)}</small><b class="uploaded-file-name">${escapeHtml(selected.name)}</b></div></div>`);
      updateUploadGroupState(group);
      clearUploadValidationWhenSatisfied(card);
      closeDialog();
      markDirty();
      updateNodeEstimate();
      toast(`已选择${previousNodeName}的 ${selected.name} 作为${targetLabel}`, 'success');
    });
  }
  function openCategoryAssetPicker(nodeKey, category, max) {
    const sceneImageOnly = nodeKey === 'scene' && ['mainProduct','styling'].includes(category);
    const sceneMixed = nodeKey === 'scene' && ['referenceModel','referenceScene'].includes(category);
    const detailMixed = nodeKey === 'detail' && ['detailTarget','referenceModel','referenceScene'].includes(category);
    const mediaType = nodeKey === 'clean' || sceneImageOnly ? '图片' : getNodeMediaType(nodeKey);
    const acceptedMediaTypes = sceneMixed || detailMixed ? ['图片','视频'] : [mediaType];
    const unit = acceptedMediaTypes.length > 1 || mediaType === '视频' ? '个文件' : '张';
    const group = $(`.node-config-card[data-node="${nodeKey}"] .classified-upload[data-upload-category="${category}"]`);
    const currentCount = group ? $$('.uploaded-material-item', group).length : 0;
    const remaining = Math.max(0, max - currentCount);
    if (!remaining) { toast(`该分类已达到 ${max}${unit}上限，请删除后再选择`, 'warning'); return; }
    const sceneConfigGroup = category === 'referenceModel' ? 'model' : category === 'referenceScene' ? 'setting' : '';
    if (activeAiEdition === 'phase1' && sceneConfigGroup === 'setting') { toast('场景模板开发中，敬请期待', 'info'); return; }
    const assetSource = sceneConfigGroup === 'model' ? 'model-prototype' : sceneConfigGroup === 'setting' ? 'scene-template' : 'library';
    const sourceName = sceneConfigGroup === 'model' ? '模特原型' : sceneConfigGroup === 'setting' ? '场景模板' : '素材库';
    const pickerTitle = sceneConfigGroup === 'model' ? '从模特原型选择' : sceneConfigGroup === 'setting' ? '从场景模板选择' : '从素材库选择';
    const modelPrototypeAssets = prototypes.filter(item => item.kind === 'model' && item.status !== '停用').map(item => [modelPrototypeTitle(item),item.id,item.mediaType,item.details,item.config || {}]);
    const sceneTemplateAssets = prototypes.filter(item => item.kind === 'scene' && item.status !== '停用').map(item => [scenePrototypeTitle(item),item.id,item.mediaType,item.details,item.config || {}]);
    const assetPool = sceneConfigGroup === 'model' ? modelPrototypeAssets : sceneConfigGroup === 'setting' ? sceneTemplateAssets : permittedAssets().filter(asset => assetStatus(asset) === '正常');
    const available = assetPool.filter(asset => acceptedMediaTypes.includes(asset[2])).slice(0,8);
    const inputType = remaining > 1 ? 'checkbox' : 'radio';
    const choices = available.length ? available.map((asset,index) => `<label class="file-row template-choice"><input type="${inputType}" name="categoryAssetPick" value="${escapeHtml(asset[1])}" ${index === 0 ? 'checked' : ''}><span class="file-thumb">${asset[2] === '视频' ? 'MP4' : 'IMG'}</span><div><b>${escapeHtml(asset[0])}</b><small>${asset[1]} · ${asset[3]}</small></div></label>`).join('') : `<div class="empty-inline">${sceneConfigGroup ? '原型库中暂无匹配类型的原型' : '素材库中暂无匹配类型的素材'}</div>`;
    const pickerConfirmText = sceneConfigGroup === 'model' ? '选择模特原型' : sceneConfigGroup === 'setting' ? '选择场景模板' : '选择素材';
    openDialog(pickerTitle,`当前已有 ${currentCount}/${max}${unit}，还可选择 ${remaining}${unit}`,`<div class="progress-list">${choices}</div>`,pickerConfirmText,() => {
      const selectedIds = $$('input[name="categoryAssetPick"]:checked', $('#dialogBody')).map(input => input.value);
      if (!selectedIds.length) { toast('请至少选择一份素材', 'warning'); return; }
      if (selectedIds.length > remaining) { toast(`该分类还可选择 ${remaining} 份素材`, 'warning'); return; }
      const selectedAssets = selectedIds.map(id => available.find(asset => asset[1] === id)).filter(Boolean);
      if (group) {
        const list = $('.classified-file-list', group);
        $('.classified-empty', list)?.remove();
        list.insertAdjacentHTML('beforeend', selectedAssets.map(asset => `<div class="uploaded-material-item" data-asset-source="${assetSource}" data-asset-id="${escapeHtml(asset[1])}" data-asset-name="${escapeHtml(asset[0])}" data-library-config="${escapeHtml(JSON.stringify(asset[4] || {}))}"><div class="upload-thumb-wrap"><div class="upload-thumb library media-preview-trigger ${asset[2] === '视频' ? 'video' : ''}" data-media-preview data-preview-type="${asset[2] === '视频' ? 'video' : 'image'}" data-preview-name="${escapeHtml(asset[0])}" data-preview-source="${escapeHtml(sourceName)}" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(asset[0])}"><span>${asset[2] === '视频' ? '▶' : 'IMG'}</span></div><button class="remove-uploaded-material" type="button" title="删除" aria-label="删除${escapeHtml(asset[0])}">×</button></div><div class="uploaded-material-info"><small>${escapeHtml(sourceName)}</small><b class="uploaded-file-name">${escapeHtml(asset[0])}</b></div></div>`).join(''));
        updateUploadGroupState(group);
        if (nodeKey === 'scene') syncSceneConfigRequirements(group.closest('.node-config-card'), sceneConfigGroup);
        clearUploadValidationWhenSatisfied(group.closest('.node-config-card'));
        if (['model','setting'].includes(sceneConfigGroup)) {
          selectedIds.forEach(id => {
            const expectedKind = sceneConfigGroup === 'model' ? 'model' : 'scene';
            const prototype = prototypes.find(item => item.kind === expectedKind && item.id === id);
            if (prototype) prototype.uses = Math.max(0, Number(prototype.uses) || 0) + 1;
          });
          persistPrototypes();
        }
      }
      closeDialog(); markDirty(); updateNodeEstimate(); toast(`已从${sourceName}选择 ${selectedAssets.length} 份素材`);
    });
  }

  function openSceneAudioPicker(field) {
    const options = [
      { id:'AUD-001', name:'轻快生活方式_背景音.mp3', type:'背景音频 · 轻快' },
      { id:'AUD-002', name:'品牌介绍_女声英语.mp3', type:'口播音频 · 英语' },
      { id:'AUD-003', name:'清新氛围_无歌词.mp3', type:'背景音频 · 清新' },
      { id:'AUD-004', name:'产品卖点_男声英语.mp3', type:'口播音频 · 英语' }
    ];
    const choices = options.map((audio,index) => '<label class="file-row template-choice"><input type="radio" name="sceneAudioPick" value="' + audio.id + '" ' + (index === 0 ? 'checked' : '') + '><span class="file-thumb">音频</span><div><b>' + escapeHtml(audio.name) + '</b><small>' + audio.id + ' · ' + escapeHtml(audio.type) + '</small></div></label>').join('');
    openDialog('从音频库选择', '选择一条音频素材', '<div class="progress-list">' + choices + '</div>', '选择音频', () => {
      const selectedId = $('input[name="sceneAudioPick"]:checked', $('#dialogBody'))?.value;
      const audio = options.find(item => item.id === selectedId);
      const control = $('.node-config-card[data-node="scene"] [data-audio-field="' + field + '"]');
      if (!audio || !control) { toast('请选择一条音频', 'warning'); return; }
      syncSceneAudioControl(control, { name:audio.name, source:'音频库' });
      closeDialog(); updateNodeEstimate(); markDirty();
    });
  }

  function createRunTokenRecord(nodeKey, index, taskId, taskName, timestamp) {
    const expected = estimateNodeTokens(nodeKey, collectConfig(nodeKey)); const total = Math.max(1, expected + Math.floor(Math.random() * Math.max(40, expected * .08) - expected * .02)); const input = Math.round(total * .47); const output = total - input; const retry = nodeKey === 'scene' && Math.random() > .65 ? 1 : 0;
    const model = $(`.node-config-card[data-node="${nodeKey}"] .node-model`)?.value || nodeMap[nodeKey].model;
    return makeTokenRecord(`RUN-${Date.now()}-${index + 1}`,taskId,taskName,nodeKey,runState?.org || $('#orgSelect').value.split(' / ')[0],'admin@demo',model,input,output,Math.round(input * .14),`${(12 + index * 2.4).toFixed(1)}s`,retry ? '成功（重试1次）' : '成功',timestamp,retry);
  }
  function outputFileName(nodeKey, mediaType, attempt, view = '', variantIndex = 0, variantTotal = 1, outputFormat = 'png') {
    const variantSuffix = mediaType === '图片' && variantTotal > 1 && !view ? `_${String(variantIndex + 1).padStart(2,'0')}` : '';
    const extension = mediaType === '视频' ? 'mp4' : (IMAGE_OUTPUT_FORMATS.includes(String(outputFormat).toLowerCase()) ? String(outputFormat).toLowerCase() : 'png');
    return `${runState.taskName}_${nodeMap[nodeKey].suffix}${view ? `_${view}` : ''}${variantSuffix}_v${attempt}.${extension}`;
  }
  function currentNodeOutputs() {
    if (!runState) return [];
    const key = runState.nodes[runState.current];
    return runState.outputs.filter(item => item.nodeKey === key);
  }
  function briefGenerationError(error) {
    const raw = String(error?.userMessage || error?.message || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '模型服务暂时不可用，请稍后重试';
    const safe = raw.replace(/(?:https?:\/\/|[A-Za-z]:\\|\/[\w.-]+\/)[^\s]*/g, '').trim();
    return (safe || '模型服务暂时不可用，请稍后重试').slice(0, 80);
  }
  function recordGenerationFailure(nodeKey, error) {
    if (!runState) return;
    runState.generationErrors ||= {};
    runState.generationErrors[nodeKey] = { message:briefGenerationError(error), time:nowText() };
    runState.executing = false;
    runState.pendingGenerationMode = null;
    runState.pendingBasedOnAttempt = null;
    renderGenerationCache();
    updateNodeStepStates();
    toast(`${nodeMap[nodeKey].name}生成失败，请查看生成结果`, 'warning');
  }
  function requiredConfigRules(nodeKey) {
    const mediaType = getNodeMediaType(nodeKey);
    const outputRule = mediaType === '视频' ? ['outputDuration','输出时长'] : ['outputFormat','输出格式'];
    if (nodeKey === 'clean') return [
      ['mediaType','输出类型'],outputRule,['model','AI处理模型'],['views','输出视角'],['ratio','输出规格'],['quality','画质要求'],['beautify','数字美化']
    ];
    if (nodeKey === 'scene') {
      const card = $('.node-config-card[data-node="scene"]');
      const rules = [['mediaType','输出类型'],outputRule,['ratio','输出比例'],['quality','画质要求'],['model','AI处理模型']];
      if (mediaType === '图片') rules.splice(2, 0, ['generateCount','生成张数']);
      [['model','参考模特'],['setting','参考场景']].forEach(([groupKey,label]) => {
        if (isSceneConfigGroupOptional(card, groupKey)) return;
        $$('[data-config-group="' + groupKey + '"][data-validation-field]', card).forEach(field => rules.push([field.dataset.validationField, field.dataset.validationLabel || label]));
      });
      return rules;
    }
    const rules = [['mediaType','输出类型'],outputRule,['ratio','输出比例'],['quality','画质要求'],['model','AI处理模型']];
    if (mediaType === '图片') rules.splice(2, 0, ['generateCount','生成张数']);
    return rules;
  }
  function isMissingConfigValue(value) {
    return Array.isArray(value) ? value.length === 0 : value == null || String(value).trim() === '' || String(value) === '__not_configured';
  }
  function isInvalidConfigValue(field, value) {
    return isMissingConfigValue(value)
      || (field === 'outputDuration' && (!(Number(value) > 0) || !Number.isFinite(Number(value))))
      || (field === 'generateCount' && (!(Number(value) >= 1) || !Number.isInteger(Number(value))));
  }
  function clearUploadValidation(card) {
    const area = $('.node-input-section', card);
    if (!area) return;
    area.classList.remove('upload-invalid');
    area.removeAttribute('aria-invalid');
    $('.upload-error-message', area)?.remove();
  }
  function clearUploadValidationWhenSatisfied(card) {
    if (!card) return;
    if (card.dataset.node !== 'detail') {
      clearUploadValidation(card);
      return;
    }
    const target = $('.classified-upload[data-upload-category="detailTarget"]', card);
    if ($('[data-preview-type="image"],[data-preview-type="video"]', target)) clearUploadValidation(card);
  }
  function validateUploadedMaterials(nodeKey, focusFirst = true) {
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    if (!card) return true;
    const area = $('.node-input-section', card);
    clearUploadValidation(card);
    const materials = $$('.uploaded-material-item', area);
    const hasRequiredMaterial = nodeKey === 'clean'
      ? materials.some(item => $('[data-preview-type="image"]', item))
      : nodeKey === 'scene'
        ? $$('.classified-upload[data-upload-category="mainProduct"] .uploaded-material-item [data-preview-type="image"]', area).length > 0
        : $$('.classified-upload[data-upload-category="detailTarget"] .uploaded-material-item [data-preview-type="image"],.classified-upload[data-upload-category="detailTarget"] .uploaded-material-item [data-preview-type="video"]', area).length > 0;
    if (hasRequiredMaterial) return true;
    area.classList.add('upload-invalid');
    area.setAttribute('aria-invalid', 'true');
    const grid = $('.classified-upload-grid', area);
    const errorMessage = nodeKey === 'scene' ? '请上传主产品图片' : nodeKey === 'detail' ? '请上传需精修的图片或视频' : '请上传图片';
    grid?.insertAdjacentHTML('afterend', '<div class="upload-error-message" role="alert">' + errorMessage + '</div>');
    if (focusFirst) {
      area.scrollIntoView({ behavior:'smooth', block:'center' });
      const firstUpload = nodeKey === 'scene'
        ? $('.classified-upload[data-upload-category="mainProduct"] .select-classified-file', area)
        : nodeKey === 'detail'
          ? $('.classified-upload[data-upload-category="detailTarget"] .select-classified-file', area)
          : $('.select-classified-file:not(:disabled)', area);
      setTimeout(() => firstUpload?.focus({ preventScroll:true }), 240);
    }
    toast(errorMessage, 'warning');
    return false;
  }
  function clearConfigValidationArea(area) {
    if (!area) return;
    area.classList.remove('config-invalid');
    area.removeAttribute('aria-invalid');
    $('.config-error-message', area)?.remove();
  }
  function validateRequiredConfig(nodeKey, config, focusFirst = true) {
    const card = $(`.node-config-card[data-node="${nodeKey}"]`);
    if (!card) return true;
    $$('.config-validation-area', card).forEach(clearConfigValidationArea);
    const errors = requiredConfigRules(nodeKey).filter(([field]) => isInvalidConfigValue(field, config[field]));
    errors.forEach(([field,label]) => {
      const area = $(`.config-validation-area[data-validation-field="${field}"]`, card);
      if (!area) return;
      area.classList.add('config-invalid');
      area.setAttribute('aria-invalid', 'true');
      const message = field === 'outputDuration' ? '输出时长需大于 0' : field === 'generateCount' ? '生成张数需为大于 0 的整数' : `${label}必选`;
      area.insertAdjacentHTML('beforeend', `<div class="config-error-message" role="alert">${message}</div>`);
    });
    if (!errors.length) return true;
    const firstArea = $(`.config-validation-area[data-validation-field="${errors[0][0]}"]`, card);
    if (focusFirst && firstArea) {
      firstArea.scrollIntoView({ behavior:'smooth', block:'center' });
      setTimeout(() => $('input:not([type="hidden"]),select,textarea', firstArea)?.focus({ preventScroll:true }), 240);
    }
    const firstError = errors[0][0] === 'outputDuration' ? '输出时长需大于 0' : errors[0][0] === 'generateCount' ? '生成张数需为大于 0 的整数' : `${errors[0][1]}必选`;
    toast(firstError, 'warning');
    return false;
  }
  function refreshControlValidation(control) {
    const area = control?.closest?.('.config-validation-area');
    const card = control?.closest?.('.node-config-card');
    if (!area || !card || !area.classList.contains('config-invalid')) return;
    const field = area.dataset.validationField;
    const config = collectConfig(card.dataset.node);
    const required = requiredConfigRules(card.dataset.node).some(([requiredField]) => requiredField === field);
    if (!required || !isInvalidConfigValue(field, config[field])) clearConfigValidationArea(area);
  }
  function startRun(generationMode = 'initial') {
    if (!runState || runState.executing || runState.current >= runState.nodes.length) return;
    const currentKey = runState.nodes[runState.current];
    runState.configs[currentKey] = collectConfig(currentKey);
    const config = runState.configs[currentKey];
    if (!validateUploadedMaterials(currentKey)) return;
    if (!validateRequiredConfig(currentKey, config)) return;
    runState.uploadCounts ||= {};
    runState.uploadCounts[currentKey] = getNodeUploadedFileCount(currentKey);
    refreshEditableElements();
    const selectedViews = currentKey === 'clean' ? $$('[data-field="views"]:checked', $(`.node-config-card[data-node="${currentKey}"]`)).map(input => $('span', input.closest('label'))?.textContent.trim() || input.value) : [];
    if (currentKey === 'clean') runState.configs[currentKey].viewLabels = [...selectedViews];
    const previousAttempts = runState.outputs.filter(item => item.nodeKey === currentKey).map(item => Number(item.attempt) || 0).filter(Boolean);
    const latestAttempt = previousAttempts.length ? Math.max(...previousAttempts) : null;
    const basedOnAttempt = generationMode === 'continue' ? (activePreviewVersion || latestAttempt) : null;
    const resolvedGenerationMode = generationMode === 'continue' && basedOnAttempt ? 'continue' : generationMode === 'restart' ? 'restart' : 'initial';
    const inputSource = getNodeSource(currentKey);
    const source = resolvedGenerationMode === 'continue' ? `${inputSource}；基于 v${basedOnAttempt}` : inputSource;
    runState.executing = true;
    runState.pendingGenerationMode = resolvedGenerationMode;
    runState.pendingBasedOnAttempt = basedOnAttempt;
    runState.generationErrors ||= {};
    delete runState.generationErrors[currentKey];
    runState.generationSeq += 1;
    const generationSeq = runState.generationSeq;
    const runId = runState.id;
    const mediaType = normalizeNodeMediaType(currentKey, config.mediaType);
    config.mediaType = mediaType;
    const ratio = config.ratio || '4:5';
    const sceneGeneration = currentKey === 'scene' ? {
      model: !(config.modelConfigMode === 'library' && config.modelOverrideEnabled !== true),
      setting: !(config.settingConfigMode === 'library' && config.settingOverrideEnabled !== true)
    } : null;
    updateNodeStepStates();
    renderGenerationCache();
    setTimeout(() => {
      if (!runState || runState.id !== runId) return;
      try {
      const completedAttempts = runState.outputs.filter(item => item.nodeKey === currentKey).map(item => Number(item.attempt) || 0);
      const attempt = (completedAttempts.length ? Math.max(...completedAttempts) : 0) + 1;
      const timestamp = nowText();
      const configurableImageCount = ['scene','detail'].includes(currentKey) && mediaType === '图片' ? Math.max(1, Number.parseInt(String(config.generateCount || '1').match(/^\s*(\d+)/)?.[1] || '1', 10)) : 1;
      const outputViews = currentKey === 'clean' && mediaType === '图片' ? selectedViews : ['scene','detail'].includes(currentKey) && mediaType === '图片' ? Array.from({length:configurableImageCount}, () => '') : [''];
      const generatedOutputs = outputViews.map((view, viewIndex) => {
        const outputView = currentKey === 'scene' && mediaType === '图片' && outputViews.length > 1 ? `场景方案${viewIndex + 1}` : view;
        const previewLabel = currentKey === 'scene' ? (outputView || `场景方案${viewIndex + 1}`) : currentKey === 'detail' && mediaType === '图片' && outputViews.length > 1 ? `裂变方案${viewIndex + 1}` : outputView || (mediaType === '视频' && selectedViews.length ? selectedViews.join('、') : '综合视角');
        return { taskId:runState.id, task:runState.taskName, nodeKey:currentKey, outputKind:'material', previewLabel, name:outputFileName(currentKey, mediaType, attempt, outputView, viewIndex, outputViews.length, config.outputFormat), assetId:`OUT-${Date.now().toString().slice(-8)}-${generationSeq}-${viewIndex + 1}`, saved:false, retained:false, temporary:true, attempt, time:timestamp, source, generationMode:resolvedGenerationMode, basedOnAttempt, configSnapshot:{...config}, type:mediaType, format:mediaType === '图片' ? (config.outputFormat || 'png') : 'mp4', duration:mediaType === '视频' ? Number(config.outputDuration) || 15 : null, durationUnit:mediaType === '视频' ? (config.durationUnit || '秒') : '', ratio, view:outputView || '', views:mediaType === '视频' ? selectedViews : (view ? [view] : []) };
      });
      runState.outputMetaByAttempt ||= {};
      runState.outputMetaByAttempt[attempt] = {
        generationMode:resolvedGenerationMode,
        basedOnAttempt,
        contextInherited:resolvedGenerationMode === 'continue'
      };
      runState.generationBatchMeta ||= {};
      runState.generationBatchMeta[currentKey] ||= {};
      runState.generationBatchMeta[currentKey][attempt] = {
        generationMode:resolvedGenerationMode,
        basedOnAttempt,
        configSnapshot:{ ...config },
        uploadCount:runState.uploadCounts?.[currentKey] || 0,
        time:timestamp
      };
      if (currentKey === 'scene') {
        Object.assign(runState.outputMetaByAttempt[attempt], {
          modelSkipped:!sceneGeneration.model,
          sceneSkipped:!sceneGeneration.setting
        });
        const generatedIdentityOutputs = [
          { outputKind:'model', previewLabel:'生成模特', suffix:'模特原型' },
          { outputKind:'scene', previewLabel:'生成场景', suffix:'场景原型' }
        ].filter(({outputKind}) => outputKind === 'model' ? sceneGeneration.model : sceneGeneration.setting)
          .map(({outputKind,previewLabel,suffix}) => ({ taskId:runState.id, task:runState.taskName, nodeKey:currentKey, outputKind, previewLabel, name:`${runState.taskName}_${suffix}_v${attempt}.jpg`, assetId:`OUT-${Date.now().toString().slice(-8)}-${generationSeq}-${outputKind}`, saved:false, retained:false, temporary:true, attempt, time:timestamp, source, generationMode:resolvedGenerationMode, basedOnAttempt, type:'图片', ratio, prototypeConfig:{...config}, view:'', views:[] }));
        generatedOutputs.push(...generatedIdentityOutputs);
      }
      runState.outputs.push(...generatedOutputs);
      const tokenRecord = createRunTokenRecord(currentKey, generationSeq - 1, runState.id, runState.taskName, timestamp);
      tokenRecord.attempt = attempt;
      tokenRecord.generationMode = resolvedGenerationMode;
      tokenRecord.basedOnAttempt = basedOnAttempt;
      tokenRecord.generatedCount = generatedOutputs.length;
      tokenRecord.mediaType = mediaType;
      runState.records.push(tokenRecord);
      updateNodeSummary();
      runState.executing = false;
      runState.pendingGenerationMode = null;
      runState.pendingBasedOnAttempt = null;
      activePreviewVersion = attempt;
      activePreviewKind = 'material';
      renderGenerationCache();
      updateNodeStepStates();
      if (runState.visualDemandId) updateDemandTaskState(runState.visualDemandId, '任务处理中', runState.id, demandRuntimePayload(runState));
      if (currentKey === 'clean' && mediaType === '图片') toast(`${nodeMap[currentKey].name}已生成 ${generatedOutputs.length} 张视角图片`);
      else if (currentKey === 'scene') {
        const generatedLabels = [`${mediaType === '图片' ? configurableImageCount : 1} 份素材`];
        if (sceneGeneration.model) generatedLabels.push('1 个模特');
        if (sceneGeneration.setting) generatedLabels.push('1 个场景');
        toast(`${nodeMap[currentKey].name}已生成 ${generatedLabels.join('、')}`);
      }
      else if (currentKey === 'detail' && mediaType === '图片') toast(`${nodeMap[currentKey].name}已生成 ${configurableImageCount} 张素材`);
      else toast(`${nodeMap[currentKey].name}已生成第 ${attempt} 份素材`);
      } catch (error) {
        if (!runState || runState.id !== runId) return;
        recordGenerationFailure(currentKey, error);
      }
    }, 850);
  }
  function renderGenerationCache() {
    const container = $('#generationCache');
    if (!container || !runState || creationStage !== 2) return;
    const outputs = currentNodeOutputs();
    const currentKey = runState.nodes[runState.current];
    const versionNumbers = [...new Set(outputs.map(output => Number(output.attempt) || 1))].sort((a,b) => a - b);
    if (!versionNumbers.includes(activePreviewVersion)) activePreviewVersion = versionNumbers.at(-1) || null;
    const pendingMode = runState.pendingGenerationMode;
    const runningTitle = pendingMode === 'continue'
      ? `正在基于 v${runState.pendingBasedOnAttempt || activePreviewVersion || ''} 生成新版本…`
      : pendingMode === 'restart' ? '正在重新生成新素材…' : '正在生成新素材…';
    const runningNote = pendingMode === 'continue'
      ? '继承当前版本上下文，执行完成后将形成新的临时版本'
      : pendingMode === 'restart' ? '本次不继承已有版本上下文，执行完成后将形成新的临时版本' : '执行完成后将形成新的临时版本，并显示在下方预览区';
    const running = runState.executing ? `<div class="preview-generating"><span>✦</span><div><b>${runningTitle}</b><small>${runningNote}</small></div><em>处理中</em></div>` : '';
    const tabs = versionNumbers.length ? `<div class="preview-version-tabs" role="tablist" aria-label="生成素材版本">${versionNumbers.map(version => {
      const active = version === activePreviewVersion;
      return `<button class="preview-version-tab ${active ? 'active' : ''}" type="button" role="tab" aria-selected="${active}" data-preview-version="${version}"><b data-runtime-copy>v${version}</b></button>`;
    }).join('')}</div>` : '';
    const activeOutputs = outputs.filter(output => Number(output.attempt || 1) === activePreviewVersion);
    const outputGroupNames = currentKey === 'scene' ? [['material','素材'],['model','模特'],['scene','场景']] : [['material','生成素材']];
    const activeKind = outputGroupNames.some(([kind]) => kind === activePreviewKind) ? activePreviewKind : outputGroupNames[0][0];
    const kindTabs = currentKey === 'scene' ? `<div class="preview-kind-tabs" role="tablist" aria-label="生成内容类型">${outputGroupNames.map(([kind,label]) => {
      const count = activeOutputs.filter(output => (output.outputKind || 'material') === kind).length;
      const active = activeKind === kind;
      return `<button class="preview-kind-tab ${active ? 'active' : ''}" type="button" role="tab" aria-selected="${active}" data-preview-kind="${kind}"><span class="preview-kind-label">${label}</span><small data-runtime-copy>${count}</small></button>`;
    }).join('')}</div>` : '';
    const renderOutputGroup = (kind,label,groupOutputs) => {
      if (!groupOutputs.length) return '';
      const cards = groupOutputs.map((output,index) => {
        const viewText = output.previewLabel || (output.view ? String(output.view) : output.views?.length ? output.views.map(value => String(value)).join('、') : '综合视角');
        return `<label class="generated-preview-card ${output.retained ? 'selected' : ''}" data-output-kind="${kind}"><div class="generated-media media-preview-trigger ${output.type === '视频' ? 'video' : ''} tone-${(activePreviewVersion + index) % 3}" data-media-preview data-preview-type="${output.type === '视频' ? 'video' : 'image'}" data-preview-name="${escapeHtml(output.name)}" data-preview-source="生成结果" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(output.name)}"><div class="generated-result-visual"><span>效果图</span><b>${output.type === '视频' ? '▶' : 'IMG'}</b></div></div><div class="generated-view-name" data-runtime-copy>${escapeHtml(viewText)}</div><div class="preview-checkbox"><input class="preview-retain-output" type="checkbox" data-output-id="${escapeHtml(output.assetId)}" ${output.retained ? 'checked' : ''}><span>预选入库</span></div></label>`;
      }).join('');
      return `<section class="preview-kind-group"><h4 class="preview-kind-title" data-runtime-copy>${label}<small>${groupOutputs.length} 份</small></h4><div class="generated-preview-grid">${cards}</div></section>`;
    };
    const selectedKindOutputs = activeOutputs.filter(output => (output.outputKind || 'material') === activeKind);
    const generationMeta = runState.outputMetaByAttempt?.[activePreviewVersion] || {};
    const skippedMessage = activeKind === 'model' && generationMeta.modelSkipped
      ? '本版本使用模特原型库配置，未生成新的模特。'
      : activeKind === 'scene' && generationMeta.sceneSkipped
        ? '本版本使用原型库中的场景模板配置，未生成新的场景。'
        : `本版本暂无${activeKind === 'model' ? '模特' : activeKind === 'scene' ? '场景' : '素材'}。`;
    const versionContent = currentKey === 'scene'
      ? (selectedKindOutputs.length ? renderOutputGroup(activeKind, outputGroupNames.find(([kind]) => kind === activeKind)?.[1] || '素材', selectedKindOutputs) : `<div class="preview-kind-empty">${skippedMessage}</div>`)
      : renderOutputGroup('material','生成素材',activeOutputs);
    const versionPanel = activeOutputs.length ? `<section class="preview-version-panel ${currentKey === 'scene' ? 'preview-version-panel-scene' : ''}" role="tabpanel">${kindTabs}${versionContent}</section>` : '';
    const emptyText = currentKey === 'scene' ? '点击“生成素材”后，可在素材、模特、场景页签中分别查看并预选入库。' : '点击“生成素材”并等待执行完成后，可在这里预览图片或视频，并预选需要入库的结果。';
    const generationError = runState.generationErrors?.[currentKey];
    const empty = !outputs.length && !runState.executing && !generationError ? `<div class="preview-empty"><b>尚未生成素材</b><p>${emptyText}</p></div>` : '';
    const errorPanel = !runState.executing && generationError ? `<div class="preview-generation-error" role="alert"><span>!</span><div><b>生成失败</b><p>${escapeHtml(generationError.message || '模型服务暂时不可用，请稍后重试')}</p></div><small>${escapeHtml(generationError.time || '')}</small></div>` : '';
    const previewSummary = runState.outputs.length ? `已预选 ${runState.outputs.filter(item => item.retained).length} 份` : '';
    container.innerHTML = `<div class="cache-head"><div><h3>生成结果</h3><small>每次生成形成新版本，默认展示最新结果</small></div><span data-runtime-copy>${previewSummary}</span></div><div class="generation-preview-body">${running}${errorPanel}${tabs}${versionPanel}${empty}</div>`;
  }
  function setRetainedOutput(outputId, retained) {
    if (!runState || runState.executing) return;
    const output = runState.outputs.find(item => item.assetId === outputId);
    if (!output) return;
    output.retained = retained;
    if (!output.retained) output.saved = false;
    renderGenerationCache();
    updateNodeStepStates();
    toast(output.retained ? '已预选入库，任务完成前仍可取消' : '已取消预选，任务完成后将清理该临时素材', output.retained ? 'success' : 'info');
  }
  function goToPreviousNode() {
    if (!runState || runState.executing) return;
    const currentKey = runState.nodes[runState.current];
    runState.configs[currentKey] = collectConfig(currentKey);
    if (runState.current === 0) { returnToTaskEditing(); return; }
    runState.current -= 1;
    activePreviewVersion = null;
    const previousKey = runState.nodes[runState.current];
    renderNodeConfigs();
    renderGenerationCache();
    toast(`已返回${nodeMap[previousKey].name}节点`, 'info');
    $('.node-parameter-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function goToNextNode() {
    if (!runState || runState.executing || !currentNodeOutputs().length) return;
    const completedKey = runState.nodes[runState.current];
    runState.configs[completedKey] = collectConfig(completedKey);
    if (runState.current < runState.nodes.length - 1) {
      runState.current += 1;
      activePreviewVersion = null;
      const nextKey = runState.nodes[runState.current];
      renderNodeConfigs();
      renderGenerationCache();
      toast(`${nodeMap[completedKey].name}已完成，已进入${nodeMap[nextKey].name}`);
      $('.node-parameter-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    setCreationStage(3);
  }
  function returnFromAssetStage() {
    if (!runState || runState.executing) return;
    runState.current = Math.max(0, runState.nodes.length - 1);
    activePreviewVersion = null;
    setCreationStage(2);
    renderNodeConfigs();
    renderGenerationCache();
    toast(`已返回${nodeMap[runState.nodes[runState.current]].name}节点，可调整配置或重新生成`, 'info');
    $('.node-parameter-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderAssetStage() {
    const container = $('#retainedAssetList');
    if (!container || !runState) return;
    const retained = runState.outputs.filter(item => item.retained);
    const groupNames = [['material','生成素材'],['model','模特原型'],['scene','场景模板']];
    container.innerHTML = retained.length ? groupNames.map(([kind,label]) => {
      const group = retained.filter(item => (item.outputKind || 'material') === kind);
      if (!group.length) return '';
      const rows = group.map(output => {
        const kindLabel = kind === 'model' ? '模特原型' : kind === 'scene' ? '场景模板' : '生成素材';
        const outputLabel = output.previewLabel || output.view || output.views?.join('、') || '';
        const detail = [nodeMap[output.nodeKey].name,kindLabel,`临时版本 V${output.attempt}`,output.type,output.ratio,outputLabel].filter(Boolean).join(' · ');
        const destination = kind === 'material' ? '存入素材库' : `存入原型库 · ${kindLabel}`;
        return `<div class="retained-asset" data-output-kind="${kind}"><div class="cache-preview media-preview-trigger" data-media-preview data-preview-type="${output.type === '视频' ? 'video' : 'image'}" data-preview-name="${escapeHtml(output.name)}" data-preview-source="生成结果" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(output.name)}">${output.type === '视频' ? '▶' : 'IMG'}</div><div><b>${escapeHtml(output.name)}</b><small>${escapeHtml(detail)}</small></div><label><input class="store-retained-output" type="checkbox" value="${escapeHtml(output.assetId)}" checked><span>${destination}</span></label></div>`;
      }).join('');
      return `<section class="asset-kind-group"><h3 data-runtime-copy>${label}<small>${group.length} 份待筛选</small></h3><div class="asset-kind-list">${rows}</div></section>`;
    }).join('') : '<div class="retained-empty"><b>没有预选入库的素材</b><p>完成任务后，所有生成结果都将作为临时内容清理；额度执行明细仍会保留。</p></div>';
    updateAssetStageSelectionSummary();
  }
  function updateAssetStageSelectionSummary() {
    if (!runState) return;
    const retainedCount = runState.outputs.filter(item => item.retained).length;
    const checkedIds = new Set($$('.store-retained-output:checked').map(input => input.value));
    const clearCount = runState.outputs.length - checkedIds.size;
    $('#cleanupSummary').textContent = `初选 ${retainedCount} 份，当前将入库 ${checkedIds.size} 份；完成后清理 ${clearCount} 份未入库内容`;
    $('#assetStageStatus').textContent = checkedIds.size ? '待确认入库' : '未选择入库项';
    $('#assetStageStatus').className = `status ${checkedIds.size ? 'ready' : 'warning'}`;
  }
  function finishTask() {
    if (!runState) return;
    const completedAt = nowText();
    const checkedIds = new Set($$('.store-retained-output:checked').map(input => input.value));
    const retained = runState.outputs.filter(item => item.retained);
    const finalStored = retained.filter(output => checkedIds.has(output.assetId));
    runState.outputs.forEach(output => { output.saved = finalStored.includes(output); output.temporary = false; });
    finalStored.forEach((output, storedIndex) => {
      const kind = output.outputKind || 'material';
      const libraryCode = kind === 'model' ? 'MOD' : kind === 'scene' ? 'SCN' : 'MAT';
      output.assetId = `${libraryCode}-${Date.now().toString().slice(-8)}-${storedIndex + 1}`;
      const sourceTask = runState.taskName;
      const sourceNode = nodeMap[output.nodeKey].name;
      if (kind === 'model' || kind === 'scene') {
        const config = output.prototypeConfig || runState.configs[output.nodeKey] || {};
        const details = kind === 'model'
          ? [config.gender,config.ageRange,config.region,config.height,config.style].filter(Boolean).join(' · ')
          : [config.shotComposition,config.toneStyle,config.artAtmosphere].filter(Boolean).join(' · ');
        const kindLabel = kind === 'model' ? '模特原型' : '场景模板';
        const image = kind === 'model' ? modelDemoImages[prototypes.filter(item => item.kind === 'model').length % modelDemoImages.length] : '';
        prototypes.unshift({ id:output.assetId, name:output.name, kind, mediaType:output.type, ...(image ? { image } : {}), details, sourceTask, sourceNode, ratio:output.ratio, location:`/AI素材/原型库/${kindLabel}/${sourceTask}`, status:'启用', uses:0, time:completedAt, generatedAt:output.time, config:{...config} });
      } else {
        const quality = runState.configs?.[output.nodeKey]?.quality || '自动适配';
        const demand = visualDemands.find(item => item.id === runState.visualDemandId);
        const producerIdentity = resolveAssetProducerIdentity(demand?.owner || currentUserContext.name);
        const metadata = { quality, sourceTask, sourceNode, creator:`${currentUserContext.name} / ${runState.org}`, ...producerIdentity, tagIds:[], taskId:runState.id, visualDemandId:runState.visualDemandId || '', spu:demand?.spu || '', expression:demand?.expression || '', mainSellingPoint:demand?.mainSellingPoint || '', secondarySellingPoint:demand?.secondarySellingPoint || '', scene:demand?.scene || '', version:demand ? 'V1' : '', materialCategory:demand?.materialCategory || '', completedAt };
        const storageMonth = String(output.time || completedAt).slice(0,7).replace('-', '/');
        const assetRow = [output.name,output.assetId,output.type,`${sourceTask} / ${sourceNode}`,`${output.ratio}${output.type === '视频' ? ' · 12s' : ''}`,`/AI素材/素材库/${storageMonth}/${sourceTask}`,'正常',output.time,metadata];
        metadata.naming = buildAssetNaming(assetRow);
        assets.unshift(assetRow);
      }
    });
    const clearedCount = runState.outputs.length - finalStored.length;
    const savedCount = finalStored.length;
    const total = runState.records.reduce((sum, item) => sum + item.total, 0);
    const executedNodes = runState.nodes.filter(key => runState.outputs.some(output => output.nodeKey === key) || runState.records.some(record => record.nodeKey === key));
    const routeNodes = runState.terminatedEarly ? executedNodes : runState.nodes;
    const route = routeNodes.map(key => nodeMap[key].name).join(' → ') || '未生成';
    const taskType = summarizeConfig(runState.nodes, runState.configs, 'mediaType', '混合');
    const taskStatus = runState.terminatedEarly ? (savedCount ? '已终止并入库' : '已终止') : '已完成';
    const nodeStats = buildTaskNodeStats(routeNodes, runState.records, finalStored, runState.outputs);
    upsertTaskRecord([runState.taskName,taskType,route,`${runState.org} / ${currentUserContext.name}`,String(roundQuota(total)),taskStatus,runState.startedAt,{produced:runState.outputs.length,retained:retained.length,saved:savedCount,cleared:clearedCount,id:runState.id,requester:runState.requester,businessLine:runState.businessLine,visualDemandId:runState.visualDemandId,createdAt:runState.startedAt,completedAt,nodes:[...routeNodes],nodeStats,nodeConfigs:{...runState.configs},uploadCounts:{...(runState.uploadCounts || {})},outputBreakdown:buildTaskOutputBreakdown(runState.outputs),generationBatches:buildTaskGenerationBatches(runState.outputs,runState.generationBatchMeta),quotaCurrency:'CNY'}]);
    if (runState.visualDemandId) updateDemandTaskState(runState.visualDemandId, taskStatus === '已终止' ? '待创建任务' : '已完成', runState.id, demandRuntimePayload(runState, taskStatus === '已终止' ? '' : completedAt, finalStored));
    nodeOutputs.unshift(...finalStored); replaceTaskTokenDetails(runState.id, runState.records);
    const workbenchTaskIndex = workbenchTasks.findIndex(item => item.id === runState.id);
    if (workbenchTaskIndex >= 0) workbenchTasks.splice(workbenchTaskIndex, 1);
    workbenchActivity.unshift({ time:completedAt, completed:taskStatus === '已完成' ? 1 : 0, userQuota:total, orgQuota:total });
    localStorage.removeItem('ai-material-draft-v4');
    activeDraftId = null;
    restoredDraftState = null;
    restoredDraftConfigs = null;
    localStorage.setItem('ai-material-workbench-activity-v2', JSON.stringify(workbenchActivity));
    renderWorkbench();
    localStorage.setItem('ai-material-tasks-v2', JSON.stringify(tasks)); localStorage.setItem('ai-material-assets-v2', JSON.stringify(assets)); localStorage.setItem('ai-material-prototypes-v1', JSON.stringify(prototypes)); localStorage.setItem('ai-material-node-outputs-v1', JSON.stringify(nodeOutputs)); localStorage.setItem('ai-material-token-details-v2', JSON.stringify(tokenDetails));
    renderTasks($('#taskSearch')?.value.trim() || ''); renderAssets($('#assetSearch').value.trim());
    if (activePrototypeTab === 'config') renderTemplates($('#templateSearch').value.trim());
    else renderPrototypeLibrary();
    renderTokenDetails();
    const completed = runState;
    const resultTitle = completed.terminatedEarly ? (savedCount ? '任务已终止并入库' : '任务已终止') : '任务已完成';
    const routeMarkup = routeNodes.map((key,index) => `${index ? '<i>→</i>' : ''}<span>${nodeMap[key].name} ✓</span>`).join('');
    const resultMessage = completed.terminatedEarly ? (savedCount ? '已按最终勾选入库，并清理其余生成内容' : '最终筛选未保留入库项，生成内容已清理') : '已按最终勾选完成入库，并清理其余生成内容';
    openDialog(resultTitle,resultMessage,`<div class="dialog-route">${routeMarkup}</div><div class="result-summary"><div><span>累计生成</span><b>${completed.outputs.length} 份</b></div><div><span>预选入库</span><b>${retained.length} 份</b></div><div><span>本次入库</span><b>${savedCount} 份</b></div></div><div class="permission-note" style="margin:16px 0 0"><span>✓</span><p>素材已进入素材库，模特原型与场景模板已按类型进入原型库；已清理 ${clearedCount} 份未入库内容，${completed.records.length} 次额度明细均已记录。</p></div>`,'查看额度明细',() => { closeDialog(); showView('usage'); $('#tokenTaskSearch').value = completed.id; renderTokenDetails(); $('.token-detail-panel').scrollIntoView({ behavior:'smooth' }); });
    $('.dialog-cancel').textContent = '关闭'; runState = null; activePreviewVersion = null;
    $('#taskName').disabled = false; $('#orgSelect').disabled = false; $('#requesterSelect').disabled = false; $('#businessLineSelect').disabled = false; $('#loadTemplate').disabled = false;
    setCreationStage(1);
  }
  function terminateAndStore() {
    if (!runState || runState.executing || !runState.outputs.some(output => output.retained)) return;
    if (!runState.executing) runState.configs[runState.nodes[runState.current]] = collectConfig(runState.nodes[runState.current]);
    runState.terminatedEarly = true;
    setCreationStage(3);
    $('.asset-stage-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
    toast('已终止后续节点，可继续二次筛选并入库', 'info');
  }
  function terminateTask() {
    if (!runState) return;
    openDialog('确认终止任务','终止后生成结果将无法恢复','<div class="permission-note" style="margin:0"><span>!</span><p>任务将被终止，生成的素材/原型将丢失，确定要终止任务吗？</p></div>','确认终止',() => {
      if (!runState) { closeDialog(); return; }
      const terminated = runState;
      const produced = terminated.outputs.length;
      const executedNodes = terminated.nodes.filter(key => terminated.outputs.some(output => output.nodeKey === key) || terminated.records.some(record => record.nodeKey === key));
      const route = executedNodes.map(key => nodeMap[key].name).join(' → ') || '未生成';
      const total = terminated.records.reduce((sum, item) => sum + item.total, 0);
      const taskType = summarizeConfig(terminated.nodes, terminated.configs, 'mediaType', '混合');
      const terminatedAt = nowText();
      const nodeStats = buildTaskNodeStats(executedNodes, terminated.records, [], terminated.outputs);
      upsertTaskRecord([terminated.taskName,taskType,route,`${terminated.org} / ${currentUserContext.name}`,String(roundQuota(total)),'已终止',terminated.startedAt,{produced,retained:0,saved:0,cleared:produced,id:terminated.id,requester:terminated.requester,businessLine:terminated.businessLine,visualDemandId:terminated.visualDemandId,createdAt:terminated.startedAt,terminatedAt,nodes:[...executedNodes],nodeStats,nodeConfigs:{...terminated.configs},uploadCounts:{...(terminated.uploadCounts || {})},outputBreakdown:buildTaskOutputBreakdown(terminated.outputs),generationBatches:buildTaskGenerationBatches(terminated.outputs,terminated.generationBatchMeta),quotaCurrency:'CNY'}]);
      if (terminated.visualDemandId) updateDemandTaskState(terminated.visualDemandId, '待创建任务', terminated.id, demandRuntimePayload(terminated, '', []));
      replaceTaskTokenDetails(terminated.id, terminated.records);
      const workbenchTaskIndex = workbenchTasks.findIndex(item => item.id === terminated.id);
      if (workbenchTaskIndex >= 0) workbenchTasks.splice(workbenchTaskIndex, 1);
      workbenchActivity.unshift({ time:terminatedAt, completed:0, userQuota:total, orgQuota:total });
      localStorage.setItem('ai-material-tasks-v2', JSON.stringify(tasks));
      localStorage.setItem('ai-material-token-details-v2', JSON.stringify(tokenDetails));
      localStorage.setItem('ai-material-workbench-activity-v2', JSON.stringify(workbenchActivity));
      localStorage.removeItem('ai-material-draft-v4');
      activeDraftId = null;
      restoredDraftState = null;
      restoredDraftConfigs = null;
      renderWorkbench(); renderTasks($('#taskSearch')?.value.trim() || ''); renderTokenDetails();
      closeDialog(); runState = null; activePreviewVersion = null;
      $('#taskName').disabled = false; $('#orgSelect').disabled = false; $('#requesterSelect').disabled = false; $('#businessLineSelect').disabled = false; $('#loadTemplate').disabled = false;
      setCreationStage(1);
      toast('任务已终止，生成结果已清理', 'warning');
    });
    $('.dialog-cancel').textContent = '继续任务';
  }
  function returnToTaskEditing() {
    if (!runState || runState.executing) return;
    const key = runState.nodes[runState.current];
    runState.configs[key] = collectConfig(key);
    saveDraft(false);
    restoredDraftConfigs = { ...(restoredDraftConfigs || {}), ...runState.configs };
    runState = null;
    activePreviewVersion = null;
    $('#taskName').disabled = false; $('#orgSelect').disabled = false; $('#requesterSelect').disabled = false; $('#businessLineSelect').disabled = false; $('#loadTemplate').disabled = false;
    setCreationStage(1);
    toast('已返回创建任务，可继续修改任务信息和节点', 'info');
  }

  $$('.sub-nav').forEach(button => button.addEventListener('click', () => {
    setAiEdition(button.closest('[data-ai-edition]')?.dataset.aiEdition || 'full');
    showView(button.dataset.view);
  }));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => {
    showView(button.dataset.go);
    if (button.dataset.go === 'workspace') setCreationStage(1);
    if (button.hasAttribute('data-open-demand-create') && activeAiEdition !== 'phase1') openDemandFormDialog();
  }));
  $('#createTaskFromWorkbench')?.addEventListener('click', startStandaloneTask);
  $('#createTaskFromTasks')?.addEventListener('click', startStandaloneTask);
  $('#createVisualDemand')?.addEventListener('click', () => openDemandFormDialog());
  $('#manageDemandOptions')?.addEventListener('click', openDemandOptionManager);
  $('#toggleDemandFilters')?.addEventListener('click', () => {
    const filters = $('#visualDemandFilters');
    const button = $('#toggleDemandFilters');
    const expanded = filters.classList.toggle('is-expanded');
    filters.classList.toggle('is-collapsed', !expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.innerHTML = `${expanded ? '收起' : '展开'} <span>${expanded ? '⌃' : '⌄'}</span>`;
  });
  $('#searchDemands')?.addEventListener('click', () => {
    const ranges = [
      ['#demandDdlStartDate','#demandDdlEndDate','DDL'],
      ['#demandRequestStartDate','#demandRequestEndDate','下需时间']
    ];
    const invalidRange = ranges.find(([startId,endId]) => $(startId).value && $(endId).value && $(startId).value > $(endId).value);
    if (invalidRange) { toast(`${invalidRange[2]}开始日期不能晚于结束日期`, 'warning'); return; }
    renderVisualDemands();
  });
  $('#resetDemandFilters')?.addEventListener('click', () => {
    $$('#demandIdFilter,#demandNameFilter,#demandSpuFilter,#demandDdlStartDate,#demandDdlEndDate,#demandRequestStartDate,#demandRequestEndDate').forEach(input => input.value = '');
    $$('#demandPriorityFilter,#demandProductLevelFilter,#demandChannelFilter,#demandSourceFilter,#demandOwnerFilter,#demandRequesterFilter').forEach(select => select.value = '');
    renderVisualDemands();
  });
  $('#visualDemandRows')?.addEventListener('click', event => {
    const detailButton = event.target.closest('[data-demand-detail]');
    const editButton = event.target.closest('[data-demand-edit]');
    const taskButton = event.target.closest('[data-demand-task]');
    const linkedButton = event.target.closest('[data-demand-linked-task]');
    if (detailButton) {
      const item = visualDemands.find(demand => demand.id === detailButton.dataset.demandDetail);
      if (item) openDialog('视觉需求详情',item.title,demandDetailMarkup(item),'关闭',closeDialog);
      return;
    }
    if (editButton) { openDemandFormDialog(editButton.dataset.demandEdit); return; }
    if (taskButton) { startTaskFromDemand(taskButton.dataset.demandTask); return; }
    if (linkedButton) {
      showView('tasks');
      if ($('#tokenTaskSearch')) $('#tokenTaskSearch').value = linkedButton.dataset.demandLinkedTask;
      renderTokenDetails();
      toast('已定位到关联任务', 'info');
    }
  });
  $('#backToVisualDemand')?.addEventListener('click', () => showView('demands'));
  $('#previousAssetStep')?.addEventListener('click', returnFromAssetStage);
  $('#workbenchTaskList').addEventListener('click', event => {
    const button = event.target.closest('[data-resume-task]');
    if (button) resumeWorkbenchTask(button.dataset.resumeTask);
  });
  $('#workbenchDemandList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-workbench-demand]');
    if (!button) return;
    const item = visualDemands.find(demand => demand.id === button.dataset.workbenchDemand);
    if (item) openDialog('视觉需求详情',item.title,demandDetailMarkup(item),'关闭',closeDialog);
  });
  $$('.ai-nav-toggle').forEach(toggle => toggle.addEventListener('click', () => {
    const group = toggle.closest('.nav-group');
    group.classList.toggle('open');
    $('.sub-menu', group).hidden = !group.classList.contains('open');
    toggle.setAttribute('aria-expanded', String(group.classList.contains('open')));
    $('i', toggle).textContent = group.classList.contains('open') ? '⌃' : '⌄';
  }));
  $('#toggleSidebar').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
    if (document.body.classList.contains('spec-panel-open')) applySpecEditorWidth();
  });
  $('.workspace').addEventListener('scroll', syncSpecSidebarHorizontalScroll, { passive:true });
  window.addEventListener('scroll', syncBusinessDialogHorizontalScroll, { passive:true });
  $$('[data-prototype-mode]').forEach(button => button.addEventListener('click', () => setPrototypeMode(button.dataset.prototypeMode)));
  $('#closeDesignEditor').addEventListener('click', () => toggleDesignMode(false));
  $('#closeSpecEditor').addEventListener('click', () => setPrototypeMode('experience'));
  $('#specEditorResizeHandle').addEventListener('pointerdown', beginSpecEditorResize);
  $('#specEditorResizeHandle').addEventListener('dblclick', () => applySpecEditorWidth(specEditorDefaultWidth, true));
  $('#specEditorResizeHandle').addEventListener('keydown', event => {
    const currentWidth = $('#specEditor').getBoundingClientRect().width;
    const bounds = specEditorWidthBounds();
    let nextWidth = null;
    if (event.key === 'ArrowLeft') nextWidth = currentWidth + 40;
    if (event.key === 'ArrowRight') nextWidth = currentWidth - 40;
    if (event.key === 'Home') nextWidth = specEditorDefaultWidth;
    if (event.key === 'End') nextWidth = bounds.max;
    if (nextWidth === null) return;
    event.preventDefault();
    applySpecEditorWidth(nextWidth, true);
  });
  window.addEventListener('pointermove', moveSpecEditorResize);
  window.addEventListener('pointerup', endSpecEditorResize);
  window.addEventListener('pointercancel', endSpecEditorResize);
  window.addEventListener('resize', () => { if (document.body.classList.contains('spec-panel-open')) applySpecEditorWidth(); syncBusinessDialogHorizontalScroll(); });
  $('#saveDesign').addEventListener('click', saveDesign);
  $('#resetDesign').addEventListener('click', resetDesign);
  $('#editorPageSelect').addEventListener('change', () => {
    const page = $('#editorPageSelect').value;
    if (page !== 'global') showView(page);
    else refreshEditorTextList();
  });
  $('#specPageSelect').addEventListener('change', () => {
    commitSpecEditor();
    showView($('#specPageSelect').value);
  });
  $('#specPageDescription').addEventListener('input', () => {
    if (prototypeMode !== 'spec') return;
    const page = $('#specPageSelect').value || activeView;
    prototypeGovernanceState.pageDescriptions[page] = $('#specPageDescription').value.slice(0,2000);
    const saved = persistPrototypeGovernanceState();
    $('#specPageDescriptionState').textContent = saved ? '已自动保存' : '保存失败';
  });
  $('#requirementAdjustmentsEntry').addEventListener('click', () => openPrototypeGovernanceEditor('requirementAdjustments'));
  $('#globalRulesEntry').addEventListener('click', () => openPrototypeGovernanceEditor('globalRules'));
  $('#specTargetList').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-spec-target]');
    if (deleteButton) {
      event.stopPropagation();
      requestDeleteSpecTarget(deleteButton.dataset.deleteSpecTarget);
      return;
    }
    const button = event.target.closest('.spec-target-item');
    if (!button) return;
    commitSpecEditor();
    selectSpecTarget(specTargets.find(target => target.dataset.specId === button.dataset.specTarget) || null, true);
  });
  $('#specTargetList').addEventListener('keydown', event => {
    if (!['Enter',' '].includes(event.key) || event.target.closest('.spec-target-delete')) return;
    const item = event.target.closest('.spec-target-item');
    if (!item) return;
    event.preventDefault();
    commitSpecEditor();
    selectSpecTarget(specTargets.find(target => target.dataset.specId === item.dataset.specTarget) || null, true);
  });
  $('#backToSpecList').addEventListener('click', () => showSpecList(true));
  $('#specNameInput').addEventListener('input', () => {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    const record = specRecord(selectedSpecTarget.dataset.specId);
    record.name = $('#specNameInput').value.slice(0, 80);
    specDirty = true;
    $('#selectedSpecTarget').textContent = specDisplayName(selectedSpecTarget);
    updateSpecSaveState();
  });
  $('#specRichEditor').addEventListener('input', () => {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    const record = specRecord(selectedSpecTarget.dataset.specId);
    record.feature = $('#specRichEditor').innerHTML;
    record.data = '';
    record.interaction = '';
    specDirty = true;
    $('#specRichEditor').classList.toggle('is-empty', !richHtmlHasContent($('#specRichEditor').innerHTML));
    updateSpecSaveState();
  });
  $('#specRichEditor').addEventListener('click', event => {
    const cell = event.target.closest('td,th');
    activeRichTableCell = cell && $('#specRichEditor').contains(cell) ? cell : null;
    syncRichTableTools();
    const link = event.target.closest('a[href^="#prototype-rule-"]');
    if (!link) return;
    event.preventDefault();
    if (prototypeMode === 'spec') commitSpecEditor();
    openGlobalRuleDetail(link.getAttribute('href').slice('#prototype-rule-'.length), 'spec');
  });
  $('#insertGlobalRuleRef').addEventListener('click', openGlobalRuleReferencePicker);
  $('#insertRichTable').addEventListener('click', () => {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    const existingTables = new Set($$('table', $('#specRichEditor')));
    insertRichMarkup('<table><tbody><tr><th>标题 1</th><th>标题 2</th></tr><tr><td>内容</td><td>内容</td></tr></tbody></table><p><br></p>', captureRichEditorRange());
    const insertedTable = $$('table', $('#specRichEditor')).find(table => !existingTables.has(table));
    focusRichTableCell(insertedTable?.rows[1]?.cells[0] || insertedTable?.rows[0]?.cells[0] || null);
  });
  $('#richTableTools').addEventListener('click', event => {
    const button = event.target.closest('[data-rich-table-action]');
    if (!button || button.disabled) return;
    applyRichTableAction(button.dataset.richTableAction);
  });
  $('#insertRichImage').addEventListener('click', () => {
    if (prototypeMode !== 'spec' || !selectedSpecTarget) return;
    pendingRichImageRange = captureRichEditorRange();
    $('#richImageInput').click();
  });
  $('#richImageInput').addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) { pendingRichImageRange = null; return; }
    if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(file.type)) {
      pendingRichImageRange = null;
      toast('请选择 PNG、JPG、GIF 或 WebP 图片', 'warning');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      pendingRichImageRange = null;
      toast('单张图片不能超过 1.5 MB', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const range = pendingRichImageRange;
      pendingRichImageRange = null;
      insertRichMarkup(`<img src="${reader.result}" alt="${escapeHtml(file.name)}"><p><br></p>`, range);
    };
    reader.onerror = () => { pendingRichImageRange = null; toast('图片读取失败，请重新选择', 'warning'); };
    reader.readAsDataURL(file);
  });
  $('#richToolbar').addEventListener('mousedown', event => { if (event.target.closest('button')) event.preventDefault(); });
  $('#richToolbar').addEventListener('click', event => {
    const button = event.target.closest('[data-rich-command]');
    if (!button || !selectedSpecTarget) return;
    const command = button.dataset.richCommand;
    let value = button.dataset.richValue || null;
    if (command === 'createLink') {
      value = window.prompt('输入链接地址（https://…）');
      if (!value) return;
    }
    $('#specRichEditor').focus();
    document.execCommand(command, false, value);
    $('#specRichEditor').dispatchEvent(new Event('input', { bubbles:true }));
  });
  $('#richBlock').addEventListener('change', () => {
    $('#specRichEditor').focus();
    document.execCommand('formatBlock', false, $('#richBlock').value);
    $('#specRichEditor').dispatchEvent(new Event('input', { bubbles:true }));
  });
  $('#saveSpecs').addEventListener('click', () => saveSpecs());
  $('#deleteSelectedSpecTarget').addEventListener('click', () => {
    if (selectedSpecTarget) requestDeleteSpecTarget(selectedSpecTarget.dataset.specId);
  });
  $('#resetSpecTarget').addEventListener('click', () => {
    if (!selectedSpecTarget) return;
    const targetId = selectedSpecTarget.dataset.specId;
    const targetLabel = specDisplayName(selectedSpecTarget);
    openDialog('清空模块说明', targetLabel, '<div class="permission-note" style="margin:0"><span>i</span><p>将清空当前原型说明的全部富文本内容，其他模块不受影响。</p></div>', '确认清空', () => {
      specState[targetId] = { feature:'', data:'', interaction:'' };
      specDirty = true;
      closeDialog();
      refreshSpecTargets();
      toast('已清空当前模块说明，保存后生效', 'info');
    });
  });
  $('#editorTextSearch').addEventListener('input', refreshEditorTextList);
  $('#editorTextList').addEventListener('change', () => {
    const record = editableRecords.find(item => item.key === $('#editorTextList').value);
    if (!record) return;
    selectEditable(record);
    record.element.scrollIntoView?.({behavior:'smooth',block:'center'});
  });
  document.addEventListener('pointerdown', event => {
    if (!designMode) return;
    if (event.target.closest?.('#designEditor,#specEditor,.prototype-control-deck')) return;
    if (event.target.closest?.('#mainDialog,#mediaPreviewDialog') && !isBusinessDialogElement(event.target)) return;
    const record = editableRecordFromTarget(event.target);
    if (record) selectEditable(record);
    if (record?.kind === 'select-options') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('click', event => {
    if (!designMode) return;
    if (event.target.closest?.('#designEditor,#specEditor,.prototype-control-deck')) return;
    const businessDialog = businessDialogRoot(event.target);
    if (event.target.closest?.('#mainDialog,#mediaPreviewDialog') && !businessDialog) return;
    if (!event.target.closest?.('.app-shell') && !businessDialog) return;
    const record = editableRecordFromTarget(event.target);
    const element = record?.element || null;
    const insideInteractiveControl = Boolean(element?.closest('button,a,label,input,textarea,select,option'));
    if (!element?.isContentEditable || insideInteractiveControl) event.preventDefault();
    event.stopImmediatePropagation();
    if (record) selectEditable(record);
  }, true);
  document.addEventListener('click', event => {
    if (prototypeMode !== 'spec' && prototypeMode !== 'compare') return;
    if (event.target.closest('#specEditor,.prototype-control-deck')) return;
    const businessDialog = businessDialogRoot(event.target);
    if (event.target.closest('#mainDialog,#mediaPreviewDialog') && !businessDialog) return;
    const view = $('.view.active');
    if (!view) return;
    const targetSelector = prototypeMode === 'spec' ? `[data-spec-id],${businessSpecComponentSelector}` : '[data-spec-id]';
    const target = event.target.closest?.(targetSelector);
    const isGlobalTarget = Boolean(target?.closest('.sidebar,.system-header,.page-tabs'));
    const isDialogTarget = Boolean(target && businessDialog?.contains(target));
    if (!target || (!view.contains(target) && !isGlobalTarget && !isDialogTarget)) return;
    if (prototypeMode === 'compare') {
      if (deletedSpecTargetIds.has(target.dataset.specId) || !hasCreatedSpec(target.dataset.specId)) return;
      if (!specTargets.includes(target)) refreshSpecTargets();
      selectSpecTarget(specTargets.find(item => item.dataset.specId === target.dataset.specId) || null);
      return;
    }
    if (prototypeMode === 'spec') {
      event.preventDefault();
      event.stopImmediatePropagation();
      commitSpecEditor();
    }
    ensureSpecTargetIdentity(target, view);
    if (deletedSpecTargetIds.delete(target.dataset.specId)) {
      target.classList.remove('spec-target-deleted');
      persistDeletedSpecTargets();
    }
    if (!specTargets.includes(target)) refreshSpecTargets();
    selectSpecTarget(specTargets.find(item => item.dataset.specId === target.dataset.specId) || target);
  }, true);
  $('#editorText').addEventListener('input', () => {
    if (!selectedEditable) return;
    setRecordValue(selectedEditable, $('#editorText').value);
    const changed = storeEditableContent(selectedEditable, $('#editorText').value);
    if (changed) designDirty = true;
    persistDesignState();
    refreshEditorTextList();
  });
  $('#editorOptionList').addEventListener('change', event => {
    if (selectedEditable?.kind !== 'select-options') return;
    const select = selectedEditable.element;
    const labelInput = event.target.closest('[data-option-label-id]');
    if (labelInput) {
      const option = [...select.options].find(item => item.dataset.editorOptionId === labelInput.dataset.optionLabelId);
      if (!option) return;
      option.textContent = labelInput.value;
      syncSelectDesignState(selectedEditable);
      return;
    }
    const defaultInput = event.target.closest('[data-option-default-id]');
    if (defaultInput) {
      const index = [...select.options].findIndex(item => item.dataset.editorOptionId === defaultInput.dataset.optionDefaultId);
      if (index < 0) return;
      select.selectedIndex = index;
      syncSelectDesignState(selectedEditable);
      renderEditorOptionList(selectedEditable);
    }
  });
  $('#editorOptionList').addEventListener('click', event => {
    if (selectedEditable?.kind !== 'select-options') return;
    const select = selectedEditable.element;
    if (event.target.closest('[data-add-select-option]')) {
      customOptionSequence += 1;
      const optionId = `custom-${Date.now().toString(36)}-${customOptionSequence}`;
      const option = document.createElement('option');
      option.value = `__prototype_${optionId}`;
      option.textContent = '新选项';
      option.dataset.editorOptionId = optionId;
      option.dataset.editorMachineValue = option.value;
      select.append(option);
      if (select.options.length === 1) select.selectedIndex = 0;
      syncSelectDesignState(selectedEditable);
      refreshEditableElements();
      requestAnimationFrame(() => $$('[data-option-label-id]', $('#editorOptionList')).at(-1)?.focus());
      return;
    }
    const removeButton = event.target.closest('[data-option-remove-id]');
    if (!removeButton) return;
    const options = [...select.options];
    const index = options.findIndex(item => item.dataset.editorOptionId === removeButton.dataset.optionRemoveId);
    if (index < 0) return;
    const wasSelected = select.selectedIndex === index;
    options[index].remove();
    if (wasSelected) select.selectedIndex = select.options.length ? Math.min(index, select.options.length - 1) : -1;
    syncSelectDesignState(selectedEditable);
    refreshEditableElements();
  });
  $('#editorOptionList').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !event.target.matches('[data-option-label-id]')) return;
    event.preventDefault();
    event.target.blur();
  });
  $('#editorFontSize').addEventListener('change', () => {
    if (!selectedEditable) return;
    const key = selectedEditable.key;
    designState.styles[key] = { ...(designState.styles[key] || {}), fontSize:$('#editorFontSize').value };
    applyEditableStyle(selectedEditable);
    designDirty = true;
    updateDesignSaveState();
  });
  $('#editorTextAlign').addEventListener('change', () => {
    if (!selectedEditable) return;
    const key = selectedEditable.key;
    designState.styles[key] = { ...(designState.styles[key] || {}), textAlign:$('#editorTextAlign').value };
    applyEditableStyle(selectedEditable);
    designDirty = true;
    updateDesignSaveState();
  });
  $('#editorPrimaryColor').addEventListener('input', () => { designState.primary = $('#editorPrimaryColor').value; designDirty = true; applyDesignState(); updateDesignSaveState(); });
  $('#editorDensity').addEventListener('change', () => { designState.density = $('#editorDensity').value; designDirty = true; applyDesignState(); updateDesignSaveState(); });
  $('#editorRadius').addEventListener('input', () => { designState.radius = Number($('#editorRadius').value); designDirty = true; applyDesignState(); updateDesignSaveState(); });
  $('#showCreationSteps').addEventListener('change', () => { designState.hidden.creationSteps = !$('#showCreationSteps').checked; designDirty = true; applyDesignState(); updateDesignSaveState(); });
  $('#showRunCard').addEventListener('change', () => { designState.hidden.runCard = !$('#showRunCard').checked; designDirty = true; applyDesignState(); updateDesignSaveState(); });
  $('#restoreDesignBackup').addEventListener('click', restoreLatestDesignBackup);
  $('#exportDesignBackup').addEventListener('click', exportDesignBackup);
  $('#importDesignBackup').addEventListener('click', () => $('#importDesignBackupInput').click());
  $('#importDesignBackupInput').addEventListener('change', event => {
    const file = event.target.files?.[0];
    importDesignBackupFile(file).finally(() => { event.target.value = ''; });
  });
  updateDesignBackupAvailability();
  document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
    if (designMode) { event.preventDefault(); saveDesign(); }
    if (prototypeMode === 'spec') { event.preventDefault(); saveSpecs(); }
  });
  $('#refreshPage').addEventListener('click', () => { showView(activeView === 'tasks' && activeTaskRecordTab === 'usage' ? 'usage' : activeView); toast('页面数据已刷新'); });
  $('#prototypeInfo').addEventListener('click', () => openDialog('原型使用说明','面向产品、业务与研发的协作原型',`<div class="progress-list"><p><b>纯体验：</b>业务、产品和研发无干扰体验完整功能流程。</p><p><b>技术查看：</b>使用独立青绿色原型标识，研发与产品可在操作页面时对照组件说明。</p><p><b>原型说明：</b>使用独立紫色原型标识；按钮、表单、卡片、表格与上传区等业务组件均可点击创建富文本说明。</p><p><b>编辑文字：</b>产品经理调整页面文字，并可新增、删除下拉选项或指定选中项。</p><p><b>动态数据优先：</b>生成视角、跨版本预选总数、版本号及已消耗总额度始终以当前任务实际数据为准，不受“编辑文字”中的历史修改影响。</p><p><b>逐步执行：</b>当前节点生成至少一份素材后，才可进入下一节点。</p><p><b>额度治理：</b>人民币额度可追溯到任务、节点与每次生成的执行阶段。</p></div>`,'我知道了',closeDialog));
  $('#orgSelect').addEventListener('change', markDirty); $('#requesterSelect').addEventListener('change', markDirty); $('#businessLineSelect').addEventListener('change', markDirty); $('#taskName').addEventListener('input', () => { $('#nameCount').textContent = $('#taskName').value.length.toLocaleString('zh-CN'); markDirty(); });
  $$('.node-check input').forEach(input => input.addEventListener('change', () => { if (input.disabled) return; input.closest('.node-card').classList.toggle('selected', input.checked); updateWorkflow(); }));
  $$('.node-card').forEach(card => card.addEventListener('click', event => {
    if (activeAiEdition === 'phase1' && card.dataset.node === 'detail') { toast('素材裂变开发中，敬请期待', 'info'); return; }
    if (event.target.closest('.node-check')) return;
    const input = $('.node-check input', card); input.checked = !input.checked; card.classList.toggle('selected', input.checked); updateWorkflow();
  }));
  $('#selectAllNodes').addEventListener('click', () => {
    const availableCards = $$('.node-card').filter(card => activeAiEdition !== 'phase1' || card.dataset.node !== 'detail');
    const all = selectedNodes().length === availableCards.length;
    availableCards.forEach(card => { card.classList.toggle('selected', !all); $('.node-check input', card).checked = !all; }); updateWorkflow();
  });
  $('#confirmNodes').addEventListener('click', advanceToTask); $('#saveDraft').addEventListener('click', () => saveDraft(true)); $('#terminateTask').addEventListener('click', terminateTask); $('#terminateAndStore').addEventListener('click', terminateAndStore); $('#loadTemplate').addEventListener('click', openTemplatePicker); $('#previousNodeStep').addEventListener('click', goToPreviousNode); $('#nextNodeStep').addEventListener('click', goToNextNode); $('#currentNodeTemplate').addEventListener('click', () => { if (runState) openNodeTemplatePicker(runState.nodes[runState.current]); }); $('#finishTask').addEventListener('click', finishTask);
  $('#generationCache').addEventListener('change', event => { if (event.target.matches('.preview-retain-output')) setRetainedOutput(event.target.dataset.outputId, event.target.checked); });
  $('#retainedAssetList').addEventListener('change', event => { if (event.target.matches('.store-retained-output')) updateAssetStageSelectionSummary(); });
  $('#generationCache').addEventListener('click', event => {
    const tab = event.target.closest('.preview-version-tab');
    if (tab) {
      activePreviewVersion = Number(tab.dataset.previewVersion);
      renderGenerationCache();
      return;
    }
    const kindTab = event.target.closest('.preview-kind-tab');
    if (!kindTab) return;
    activePreviewKind = kindTab.dataset.previewKind;
    renderGenerationCache();
  });

  $('#nodeConfigList').addEventListener('input', event => { const card = event.target.closest('.node-config-card'); if (!card) return; refreshControlValidation(event.target); updateSceneOverrideMarkers(event.target.closest('.scene-config-group')); updateNodeEstimate(); markDirty(); });
  $('#nodeConfigList').addEventListener('click', event => {
    const card = event.target.closest('.node-config-card'); if (!card) return;
    const restoreLibraryButton = event.target.closest('.scene-restore-library');
    if (restoreLibraryButton) {
      const section = restoreLibraryButton.closest('.scene-config-group');
      let libraryConfig = {};
      try { libraryConfig = JSON.parse(section?.dataset.libraryConfig || '{}'); } catch {}
      applySceneLibraryConfig(section, libraryConfig);
      updateSceneOverrideMarkers(section);
      updateNodeEstimate(); markDirty(); toast('已恢复所选库中的配置', 'info');
      return;
    }
    const removeButton = event.target.closest('.remove-uploaded-material');
    if (removeButton) {
      event.preventDefault();
      const group = removeButton.closest('.classified-upload');
      const item = removeButton.closest('.uploaded-material-item');
      const removedLibraryReference = ['model-prototype','scene-template'].includes(item?.dataset.assetSource);
      const changedGroup = group?.dataset.uploadCategory === 'referenceModel' ? 'model' : group?.dataset.uploadCategory === 'referenceScene' ? 'setting' : '';
      const source = $('[data-preview-src]', item)?.dataset.previewSrc;
      if (source?.startsWith('blob:')) URL.revokeObjectURL(source);
      item?.remove();
      refreshUploadEmptyState(group);
      if (card.dataset.node === 'scene') syncSceneConfigRequirements(card, changedGroup, removedLibraryReference);
      updateNodeEstimate();
      markDirty();
      toast('已删除当前素材');
      return;
    }
    const audioRemoveButton = event.target.closest('[data-audio-remove]');
    if (audioRemoveButton) {
      syncSceneAudioControl(audioRemoveButton.closest('.scene-audio-control'), null);
      updateNodeEstimate(); markDirty(); toast('已移除音频');
      return;
    }
    const audioUploadButton = event.target.closest('[data-audio-upload]');
    if (audioUploadButton) { $('.scene-audio-input', audioUploadButton.closest('.scene-audio-control'))?.click(); return; }
    const audioLibraryButton = event.target.closest('[data-audio-library]');
    if (audioLibraryButton) { openSceneAudioPicker(audioLibraryButton.closest('.scene-audio-control').dataset.audioField); return; }
    if (event.target.closest('.estimate-refresh')) { updateNodeEstimate(true); toast('已重新计算预计额度', 'info'); return; }
    const uploadButton = event.target.closest('.select-classified-file');
    if (uploadButton) { $('.classified-file-input', uploadButton.closest('.classified-upload'))?.click(); return; }
    const previousOutputButton = event.target.closest('.select-previous-output');
    if (previousOutputButton) { openPreviousOutputPicker(card); return; }
    const libraryButton = event.target.closest('.select-category-asset');
    if (libraryButton) { const group = libraryButton.closest('.classified-upload'); openCategoryAssetPicker(card.dataset.node, group.dataset.uploadCategory, Number(group.dataset.max || 1)); return; }
    if (event.target.closest('.restart-node-run')) { startRun('restart'); return; }
    if (event.target.closest('.continue-node-run')) { startRun('continue'); return; }
    if (event.target.closest('.start-node-run')) startRun('initial');
  });
  $('#nodeConfigList').addEventListener('change', event => {
    const card = event.target.closest('.node-config-card'); if (!card) return;
    if (event.target.matches('.scene-config-toggle')) {
      const section = event.target.closest('.scene-config-group');
      if (event.target.checked) {
        section.dataset.customize = 'true';
        let overrides = {};
        try { overrides = JSON.parse(section.dataset.overrideConfig || '{}'); } catch {}
        if (Object.keys(overrides).length) applySceneLibraryConfig(section, overrides);
      } else {
        section.dataset.overrideConfig = JSON.stringify(captureSceneSectionConfig(section));
        section.dataset.customize = 'false';
        let libraryConfig = {};
        try { libraryConfig = JSON.parse(section.dataset.libraryConfig || '{}'); } catch {}
        applySceneLibraryConfig(section, libraryConfig);
      }
      syncSceneConfigRequirements(card);
      updateNodeEstimate(); markDirty();
      toast(event.target.checked ? '已开启当前任务配置调整' : '已切换为使用库配置', 'info');
      return;
    }
    if (event.target.matches('.scene-audio-input')) { handleSceneAudioUpload(event.target); return; }
    if (event.target.matches('.scene-model-choice')) {
      const select = $('.scene-model-option-source', card);
      if (select) select.value = event.target.value;
      refreshControlValidation(select);
      updateNodeEstimate(); markDirty(); return;
    }
    refreshControlValidation(event.target);
    updateSceneOverrideMarkers(event.target.closest('.scene-config-group'));
    if (event.target.matches('.node-media-type')) {
      const grid = $('.classified-upload-grid', card);
      if (grid && card.dataset.node === 'clean') grid.outerHTML = classifiedUploadMarkup('图片', 'clean');
      clearUploadValidationWhenSatisfied(card); syncNodeMediaUI(card); updateNodeSummary(); updateNodeEstimate(); markDirty(); return;
    }
    if (event.target.matches('.node-output-ratio')) { syncNodeMediaUI(card); updateNodeSummary(); updateNodeEstimate(); markDirty(); return; }
    if (event.target.matches('.classified-file-input')) { handleClassifiedFiles(event.target); return; }
    updateNodeEstimate(); markDirty();
  });

  $('#mainDialog').addEventListener('close', () => { dialogAction = null; $('.dialog-cancel').textContent = '取消'; syncDialogBackdrop(); scheduleEditableRefresh(); }); $('#mainDialog .dialog-close').addEventListener('click', closeDialog); $('.dialog-cancel').addEventListener('click', closeDialog); $('#dialogConfirm').addEventListener('click', () => { enforceBusinessTextStorageLimits($('#mainDialog')); dialogAction ? dialogAction() : closeDialog(); });
  $('#mainDialog').addEventListener('wheel', forwardDialogHorizontalWheel, { passive:false });
  $('#mediaPreviewDialog').addEventListener('wheel', forwardDialogHorizontalWheel, { passive:false });
  $('#businessDialogBackdrop').addEventListener('click', () => { if ($('#mediaPreviewDialog').open) closeMediaPreview(); else closeDialog(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if ($('#mediaPreviewDialog').open) { event.preventDefault(); closeMediaPreview(); }
    else if ($('#mainDialog').open) { event.preventDefault(); closeDialog(); }
  });
  $('#mainDialog').addEventListener('click', event => {
    const taskAssetsShortcut = event.target.closest('.task-assets-shortcut');
    if (taskAssetsShortcut) { showTaskAssets(taskAssetsShortcut.dataset.taskId); return; }
    const tab = event.target.closest('.task-generation-tab');
    if (!tab) return;
    const batchGroup = tab.closest('[data-batch-group]');
    if (!batchGroup) return;
    const attempt = String(tab.dataset.batchTab || '');
    $$('.task-generation-tab', batchGroup).forEach(button => {
      const isActive = button === tab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    $$('.task-generation-panel', batchGroup).forEach(panel => {
      const isActive = String(panel.dataset.batchPanel || '') === attempt;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
  });
  $('#taskRows')?.addEventListener('click', event => {
    const button = event.target.closest('.task-detail');
    if (!button) return;
    const row = tasks[Number(button.dataset.index)];
    const meta = row[7] || {};
    const breakdown = taskNodeBreakdown(row);
    const routeNames = row[2] && row[2] !== '未生成' ? row[2].split(' → ') : taskRouteKeys(row).map(key => nodeMap[key]?.name).filter(Boolean);
    const routeMarkup = routeNames.length
      ? routeNames.map((name,index) => `${index ? '<i>→</i>' : ''}<span>${escapeHtml(name)}</span>`).join('')
      : '<span class="task-route-empty">尚未执行</span>';
    const nodeRows = breakdown.length ? `<div class="task-node-breakdown" role="table" aria-label="按执行节点汇总">
      <div class="task-node-breakdown-head" role="row"><span role="columnheader">执行节点</span><span role="columnheader">生成 / 执行次数</span><span role="columnheader">入库素材量</span><span role="columnheader">额度消耗（人民币）</span></div>
      ${breakdown.map(item => `<div class="task-node-breakdown-row" role="row"><b role="cell">${escapeHtml(item.nodeName)}</b><span role="cell" data-label="生成 / 执行次数">${item.executions === null ? '<em>明细未记录</em>' : `${item.executions.toLocaleString('zh-CN')} 次`}</span><span role="cell" data-label="入库素材量">${item.stored === null ? '<em>明细未记录</em>' : `${item.stored.toLocaleString('zh-CN')} 份`}</span><span role="cell" data-label="额度消耗（人民币）">${item.quota === null ? '<em>明细未记录</em>' : formatCny(item.quota)}</span></div>`).join('')}
    </div>` : row[5] === '暂存'
      ? '<div class="task-node-breakdown-empty"><b>任务尚未执行</b><span>暂无已执行节点，也没有入库素材量或额度消耗。</span></div>'
      : '<div class="task-node-breakdown-empty"><b>历史节点明细未记录</b><span>当前仅保留任务总计，缺少可按任务 ID 关联的节点明细。</span></div>';
    const storedAssets = permittedAssets().filter(asset => String(asset[8]?.taskId || '') === String(meta.id || ''));
    const taskDetails = `<section class="detail-section"><h3 class="detail-section-title">基本信息</h3><div class="detail-fields"><div class="detail-field"><span>任务 ID</span><b>${escapeHtml(meta.id || '未记录')}</b></div><div class="detail-field"><span>任务状态</span><b>${escapeHtml(row[5] || '未记录')}</b></div><div class="detail-field"><span>媒体类型</span><b>${escapeHtml(row[1] || '未记录')}</b></div><div class="detail-field"><span>部门 / 创建人</span><b>${escapeHtml(row[3] || '未记录')}</b></div><div class="detail-field"><span>来源需求 ID</span><b>${escapeHtml(meta.visualDemandId || '未关联')}</b></div><div class="detail-field"><span>创建时间</span><b>${escapeHtml(meta.createdAt || row[6] || '未记录')}</b></div><div class="detail-field detail-field-wide"><span>执行流程</span><div class="dialog-route">${routeMarkup}</div></div></div></section><section class="detail-section"><h3 class="detail-section-title">任务结果</h3><div class="detail-fields"><div class="detail-field"><span>任务入库</span><div class="task-assets-shortcut-row"><b>${taskStoredTotal(row, breakdown).toLocaleString('zh-CN')} 份</b>${storedAssets.length ? `<button class="button secondary task-assets-shortcut" type="button" data-task-id="${escapeHtml(meta.id)}">去素材库查看</button>` : '<button class="button secondary" type="button" disabled>暂无可查看素材</button>'}</div></div><div class="detail-field"><span>额度消耗（人民币）</span><b>${formatCny(taskTotalQuota(row, breakdown))}</b></div></div></section><section class="detail-section"><h3 class="detail-section-title">执行节点</h3>${nodeRows}</section>`;
    openDialog('任务详情',row[0],taskDetails,'查看额度明细',() => { closeDialog(); showView('usage'); $('#tokenTaskSearch').value = meta.id || row[0]; renderTokenDetails(); });
  });
  $('#assetRows').addEventListener('click', event => {
    const tagButton = event.target.closest('.asset-tag-edit');
    const detailButton = event.target.closest('.asset-detail');
    const infoButton = event.target.closest('.asset-info-edit');
    const button = tagButton || detailButton || infoButton;
    if (!button) return;
    const row = permittedAssets().find(asset => asset[1] === button.dataset.id);
    if (!row) return;
    if (infoButton) { openAssetInfoEditor(row); return; }
    if (tagButton) {
      openAssetTagEditor(row);
      return;
    }
    if (detailButton) {
      openDialog('素材详情','',assetDetailBody(row),'关闭',closeDialog);
      $('#dialogBody').onclick = async dialogEvent => {
        if (dialogEvent.target.closest('.asset-download-direct')) { downloadAssetFromDetail(row); return; }
        if (dialogEvent.target.closest('.asset-naming-copy')) {
          try { await navigator.clipboard.writeText(buildAssetNaming(row)); toast('素材命名已复制'); }
          catch { toast('复制失败，请手动选择命名文字', 'warning'); }
        }
      };
      return;
    }
  });
  $('#assetRows').addEventListener('change', event => {
    const checkbox = event.target.closest('.asset-select');
    if (!checkbox) return;
    if (checkbox.checked) selectedAssetIds.add(checkbox.value);
    else selectedAssetIds.delete(checkbox.value);
    checkbox.closest('tr')?.classList.toggle('is-selected', checkbox.checked);
    const visibleRows = visibleAssetIds.map(id => assets.find(row => row[1] === id)).filter(Boolean);
    syncAssetSelectionControls(visibleRows);
  });
  $('#selectAllAssets').addEventListener('change', event => {
    visibleAssetIds.forEach(id => event.target.checked ? selectedAssetIds.add(id) : selectedAssetIds.delete(id));
    renderAssets($('#assetSearch').value.trim());
  });
  $('#downloadSelectedAssets').addEventListener('click', openAssetBatchDownloadDialog);
  $$('.library-tabs [data-library-tab]').forEach(button => button.addEventListener('click', () => {
    closeLibraryMultiFilters();
    activePrototypeTab = button.dataset.libraryTab;
    $$('.library-tabs [data-library-tab]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const showingConfigTemplates = activePrototypeTab === 'config';
    $('#prototypeLibraryPanel').hidden = showingConfigTemplates;
    $('#configTemplatePanel').hidden = !showingConfigTemplates;
    syncTimeFilterInputs('templates');
    if (showingConfigTemplates) renderTemplates($('#templateSearch').value.trim());
    else renderPrototypeLibrary();
  }));
  document.addEventListener('change', event => {
    const input = event.target.closest('[data-library-multi-all],[data-library-multi-value]');
    if (!input) return;
    const element = input.closest('[data-library-multi-filter]');
    const field = element?.dataset.libraryMultiFilter;
    const selected = libraryMultiFilterState[field];
    if (!selected) return;
    if (input.hasAttribute('data-library-multi-all')) selected.clear();
    else if (input.checked) selected.add(input.dataset.libraryMultiValue);
    else selected.delete(input.dataset.libraryMultiValue);
    updateLibraryMultiFilterSummary(field);
  });
  $$('[data-library-multi-filter]').forEach(element => element.addEventListener('toggle', () => {
    if (!element.open) return;
    $$('[data-library-multi-filter][open]').forEach(other => { if (other !== element) other.open = false; });
  }));
  $('#filterModelPrototypes').addEventListener('click', () => { closeLibraryMultiFilters(); renderPrototypeLibrary(); });
  $('#resetModelPrototypeFilters').addEventListener('click', () => {
    clearLibraryMultiFilterScope('model');
    closeLibraryMultiFilters();
    renderPrototypeLibrary();
  });
  $('#filterScenePrototypes').addEventListener('click', () => { closeLibraryMultiFilters(); renderPrototypeLibrary(); });
  $('#resetScenePrototypeFilters').addEventListener('click', () => {
    clearLibraryMultiFilterScope('scene');
    closeLibraryMultiFilters();
    renderPrototypeLibrary();
  });
  $('#prototypeLibraryPanel').addEventListener('click', event => {
    const button = event.target.closest('.prototype-detail,.prototype-status-toggle,.prototype-delete');
    if (!button) return;
    const item = prototypes.find(prototype => prototype.id === button.dataset.id);
    if (!item) return;
    if (button.matches('.prototype-status-toggle')) {
      item.status = item.status === '停用' ? '启用' : '停用';
      persistPrototypes();
      renderPrototypeLibrary();
      toast(`“${prototypeDisplayTitle(item)}”已${item.status}`);
      return;
    }
    if (button.matches('.prototype-delete')) {
      const kindLabel = item.kind === 'model' ? '模特原型' : '场景模板';
      if (item.status !== '停用') { toast(`仅停用状态的${kindLabel}可删除`, 'warning'); return; }
      openDialog(`删除${kindLabel}`,prototypeDisplayTitle(item),`<div class="prototype-delete-warning"><span>!</span><div><b>删除后将不再出现在原型库中</b><p>历史任务中已保存的配置快照不受影响；该操作仅允许用于停用状态的${kindLabel}。</p></div></div>`,'确认删除',() => {
        const index = prototypes.findIndex(prototype => prototype.id === item.id);
        if (index >= 0) prototypes.splice(index, 1);
        deletedPrototypeIds.add(item.id);
        localStorage.setItem('ai-material-deleted-prototype-ids-v1', JSON.stringify([...deletedPrototypeIds]));
        persistPrototypes();
        closeDialog();
        renderPrototypeLibrary();
        toast(`${kindLabel}已删除`);
      });
      return;
    }
    const kindLabel = item.kind === 'model' ? '模特原型' : '场景模板';
    if (item.kind === 'model') {
      const image = modelPrototypeImage(item, Math.max(0, prototypes.filter(prototype => prototype.kind === 'model').indexOf(item)));
      const configMarkup = modelConfigFields.map(([field,label]) => `<div class="detail-field"><span>${escapeHtml(label)}</span><b>${escapeHtml(item.config?.[field] || '未配置')}</b></div>`).join('');
      const disabled = item.status === '停用';
      const preview = `<div class="model-detail-image media-preview-trigger" data-media-preview data-preview-type="image" data-preview-src="${escapeHtml(image)}" data-preview-name="${escapeHtml(modelPrototypeTitle(item))}" data-preview-source="模特原型" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(modelPrototypeTitle(item))}"><span aria-hidden="true">人像</span><img src="${escapeHtml(image)}" alt="${escapeHtml(modelPrototypeTitle(item))}" referrerpolicy="no-referrer" onerror="this.hidden=true"></div>`;
      openDialog(`${kindLabel}详情`,modelPrototypeTitle(item),`<section class="detail-section"><h3 class="detail-section-title">基本信息</h3><div class="detail-fields"><div class="detail-field"><span>原型 ID</span><b>${escapeHtml(item.id)}</b></div><div class="detail-field"><span>状态</span><b class="model-status ${disabled ? 'disabled' : 'enabled'}">${disabled ? '停用' : '启用'}</b></div><div class="detail-field"><span>使用次数</span><b>${Math.max(0, Number(item.uses) || 0).toLocaleString('zh-CN')} 次</b></div><div class="detail-field"><span>生成时间</span><b>${escapeHtml(item.time || '未记录')}</b></div></div></section><section class="detail-section"><h3 class="detail-section-title">原型预览</h3>${preview}</section><section class="detail-section"><h3 class="detail-section-title">配置参数</h3><div class="detail-fields">${configMarkup}</div></section>`,'关闭',closeDialog);
      return;
    }
    const sceneIndex = Math.max(0, prototypes.filter(prototype => prototype.kind === 'scene').indexOf(item));
    const image = scenePrototypeImage(item, sceneIndex);
    const configMarkup = sceneConfigFields.map(([field,label]) => `<div class="detail-field"><span>${escapeHtml(label)}</span><b>${escapeHtml(item.config?.[field] || '未配置')}</b></div>`).join('');
    const disabled = item.status === '停用';
    const preview = `<div class="scene-detail-image media-preview-trigger" data-media-preview data-preview-type="image" data-preview-src="${escapeHtml(image)}" data-preview-name="${escapeHtml(scenePrototypeTitle(item))}" data-preview-source="场景模板" role="button" tabindex="0" aria-label="放大预览：${escapeHtml(scenePrototypeTitle(item))}"><span aria-hidden="true">场景</span><img src="${escapeHtml(image)}" alt="${escapeHtml(scenePrototypeTitle(item))}" referrerpolicy="no-referrer" onerror="this.hidden=true"></div>`;
    openDialog(`${kindLabel}详情`,scenePrototypeTitle(item),`<section class="detail-section"><h3 class="detail-section-title">基本信息</h3><div class="detail-fields"><div class="detail-field"><span>模板 ID</span><b>${escapeHtml(item.id)}</b></div><div class="detail-field"><span>状态</span><b class="model-status ${disabled ? 'disabled' : 'enabled'}">${disabled ? '停用' : '启用'}</b></div><div class="detail-field"><span>使用次数</span><b>${Math.max(0, Number(item.uses) || 0).toLocaleString('zh-CN')} 次</b></div><div class="detail-field"><span>生成时间</span><b>${escapeHtml(item.time || '未记录')}</b></div></div></section><section class="detail-section"><h3 class="detail-section-title">场景预览</h3>${preview}</section><section class="detail-section"><h3 class="detail-section-title">配置参数</h3><div class="detail-fields">${configMarkup}</div></section>`,'关闭',closeDialog);
  });
  $('#templateRows').addEventListener('click', event => {
    const use = event.target.closest('.use-template');
    const detail = event.target.closest('.template-detail');
    const rename = event.target.closest('.template-rename');
    if (use) { useTemplate(use.dataset.id); return; }
    if (rename) {
      const item = templates.find(template => template.id === Number(rename.dataset.id));
      if (item) renameTemplate(item);
      return;
    }
    if (detail) {
      const item = templates.find(template => template.id === Number(detail.dataset.id));
      if (item) openDialog('模板详情',item.name,templateDetailBody(item),'使用模板',() => { closeDialog(); useTemplate(item.id); });
    }
  });
  $$('[data-task-record-tab]').forEach(button => button.addEventListener('click', () => {
    setTaskRecordTab(button.dataset.taskRecordTab);
    scrollBusinessCanvasTop();
    refreshEditableElements();
    if (prototypeMode === 'spec' || prototypeMode === 'compare') refreshSpecTargets();
  }));
  $('#tokenDetailRows').addEventListener('click', event => {
    const button = event.target.closest('.open-token-detail,.open-task-material-detail');
    if (!button) return;
    const group = renderedTokenTaskGroups.get(String(button.dataset.groupKey || ''));
    if (!group) return;
    if (button.classList.contains('open-token-detail')) {
      openDialog('额度明细',`${group.task} · ${group.taskId}`,tokenQuotaDetailMarkup(group),'关闭',closeDialog);
      return;
    }
    const taskRow = usageTaskRow(group.taskId, group.task);
    openDialog('任务详情',`${group.task} · ${group.taskId}`,taskMaterialDetailMarkup(group, taskRow),'关闭',closeDialog);
  });
  $('.token-filters').addEventListener('change', event => {
    const input = event.target.closest('[data-token-multi-all],[data-token-multi-value]');
    if (!input) return;
    const element = input.closest('[data-token-multi-filter]');
    const type = element?.dataset.tokenMultiFilter;
    const selected = tokenDetailMultiFilterState[type];
    if (!selected) return;
    if (input.hasAttribute('data-token-multi-all')) selected.clear();
    else if (input.checked) selected.add(input.dataset.tokenMultiValue);
    else selected.delete(input.dataset.tokenMultiValue);
    updateTokenMultiFilterSummary(type);
  });
  $$('[data-token-multi-filter]').forEach(element => element.addEventListener('toggle', () => {
    if (!element.open) return;
    $$('[data-token-multi-filter][open]').forEach(other => { if (other !== element) other.open = false; });
  }));
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-token-multi-filter]')) closeTokenMultiFilters();
    if (!event.target.closest('[data-library-multi-filter]')) closeLibraryMultiFilters();
  });
  $('#searchTokenDetails').addEventListener('click', () => { const filters = $('.token-filters[data-time-filter="usageDetails"]'); if (commitTimeFilter('usageDetails', filters)) { closeTokenMultiFilters(); renderTokenDetails(); } }); $('#resetTokenDetails').addEventListener('click', () => { $('#tokenTaskSearch').value = ''; tokenDetailMultiFilterState.org.clear(); tokenDetailMultiFilterState.account.clear(); closeTokenMultiFilters(); const filters = $('.token-filters[data-time-filter="usageDetails"]'); clearTimeFilter('usageDetails', filters); renderTokenDetails(); });
  $$('[data-time-apply]').forEach(button => button.addEventListener('click', () => {
    const container = button.closest('[data-time-filter]');
    const scope = container?.dataset.timeFilter;
    if (scope && commitTimeFilter(scope, container)) renderTimeFilterScope(scope);
  }));
  $$('[data-time-reset]').forEach(button => button.addEventListener('click', () => {
    const container = button.closest('[data-time-filter]');
    const scope = container?.dataset.timeFilter;
    if (!scope) return;
    clearTimeFilter(scope, container);
    renderTimeFilterScope(scope);
  }));
  $$('[data-time-start],[data-time-end]').forEach(input => input.addEventListener('input', () => input.closest('[data-time-filter]')?.classList.remove('time-filter-invalid')));
  $('#savePermissions').addEventListener('click', () => toast('节点权限已保存（演示）')); $('#manageAssetTags').addEventListener('click', openAssetTagManagerDialog);
  $('#searchTasks')?.addEventListener('click', () => { const container = $('[data-time-filter="tasks"]'); if (commitTimeFilter('tasks', container)) renderTasks($('#taskSearch')?.value.trim() || ''); });
  $('#searchAssets').addEventListener('click', () => { closeAssetMultiFilters(); renderAssets($('#assetSearch').value.trim()); });
  $('#resetAssetFilters').addEventListener('click', () => { clearAssetFilters(); renderAssets(); });
  $('#toggleAssetFilters').addEventListener('click', event => {
    const button = event.currentTarget;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.firstChild.textContent = expanded ? '展开筛选 ' : '收起筛选 ';
    $('#assetAdvancedFilters').hidden = expanded;
    if (expanded) closeAssetMultiFilters();
  });
  $('#assetLibraryFilters').addEventListener('toggle', event => {
    const details = event.target.closest?.('[data-asset-multi-filter]');
    if (details?.open) closeAssetMultiFilters(details);
  }, true);
  $('#assetLibraryFilters').addEventListener('input', event => {
    const search = event.target.closest?.('[data-asset-multi-search]');
    if (!search) return;
    const query = search.value.trim().toLowerCase();
    const details = search.closest('[data-asset-multi-filter]');
    $$('.asset-multi-option', details).forEach(option => { option.hidden = Boolean(query) && !String(option.dataset.search || '').includes(query); });
  });
  $('#assetLibraryFilters').addEventListener('change', event => {
    const checkbox = event.target.closest?.('.asset-multi-option input[type="checkbox"]');
    if (!checkbox) return;
    const details = checkbox.closest('[data-asset-multi-filter]');
    const field = details.dataset.assetMultiFilter;
    checkbox.checked ? assetMultiFilterState[field].add(checkbox.value) : assetMultiFilterState[field].delete(checkbox.value);
    if (field === 'sourceTask' || field === 'org') syncAssetMultiFilterOptions();
    else updateAssetMultiFilterSummary(details);
  });
  $('#assetLibraryFilters').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.target.matches('[data-asset-multi-search]')) return;
    if (event.target.matches('input')) { event.preventDefault(); closeAssetMultiFilters(); renderAssets($('#assetSearch').value.trim()); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('#assetLibraryFilters')) closeAssetMultiFilters(); });
  $('#assetExpiryFilter').addEventListener('click', () => {
    const dueSoon = refreshAssetRetention();
    if (!dueSoon.length) { renderAssets($('#assetSearch').value.trim()); return; }
    clearAssetFilters();
    $('#assetIdFilter').value = dueSoon.map(row => row[1]).join(',');
    renderAssets();
  });
  $('#searchTemplates').addEventListener('click', () => { const filters = $('#configTemplatePanel [data-time-filter="templates"]'); if (commitTimeFilter('templates', filters)) { closeLibraryMultiFilters(); renderTemplates($('#templateSearch').value.trim()); } });
  $('#resetTemplateFilters').addEventListener('click', () => {
    $('#templateSearch').value = '';
    clearLibraryMultiFilterScope('template');
    closeLibraryMultiFilters();
    const filters = $('#configTemplatePanel [data-time-filter="templates"]');
    clearTimeFilter('templates', filters);
    renderTemplates();
  });
  $$('.reset-filter').forEach(button => button.addEventListener('click', () => {
    const filters = button.closest('.filters');
    $$('input:not([type="checkbox"]):not([type="radio"])', filters).forEach(input => input.value = '');
    $$('select', filters).forEach(select => select.selectedIndex = 0);
    const scope = filters.dataset.timeFilter;
    if (scope) clearTimeFilter(scope, filters);
    if (activeView === 'tasks') renderTasks();
    if (activeView === 'assets') renderAssets();
    if (activeView === 'templates') renderTemplates();
  }));

  function flushDesignStateBeforeExit() {
    if (!designMode && !designDirty) return;
    commitSelectedEditableValue();
    mirrorEditablePersistenceAliases();
    persistDesignState();
    beaconSharedDesignState();
  }
  window.addEventListener('pagehide', flushDesignStateBeforeExit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDesignStateBeforeExit();
  });

  observeBusinessTextLimits(); restoreDraft(); setAiEdition('phase1'); setCreationStage(1); renderWorkbench(); renderVisualDemands(); renderTasks(); renderAssets(); renderPrototypeLibrary(); renderTemplates(); renderTokenDetails(); updateNodeSummary(); updateVisualDemandSourceBanner(); $('#nameCount').textContent = $('#taskName').value.length.toLocaleString('zh-CN'); applyDesignState(); setPrototypeMode('experience'); observeDynamicDesignContent(); updateDesignSaveState(); updateSpecSaveState();
})();
