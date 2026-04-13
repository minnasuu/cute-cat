/**
 * 默认工作台团队：17 官方猫 + 唯一内置工作流 web-page-builder。
 * 步骤 agentId 为 TeamCat.id，对应猫猫的 templateId 必须与 frontend/src/data/workflows.ts 中 agentId 一致，
 * 以便 workflow-executor 将 catTemplateId 分发到 lib/cat-step-scripts/cats/<templateId>.js。
 */
const { CAT_TEMPLATES, OFFICIAL_TEMPLATE_IDS } = require('../data/official-cats');

const WORKBENCH_MARKER = '__cuca_workbench_v1__';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function ensureWorkbenchTeam(prisma, userId) {
  let team = await prisma.team.findFirst({
    where: { ownerId: userId, description: WORKBENCH_MARKER },
  });

  if (!team) {
    team = await prisma.team.create({
      data: {
        name: '我的工作台',
        description: WORKBENCH_MARKER,
        ownerId: userId,
      },
    });
  }

  const cats = await prisma.teamCat.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: 'asc' },
  });

  const byTemplate = Object.fromEntries(
    cats.filter((c) => c.templateId).map((c) => [c.templateId, c])
  );

  for (const tmpl of CAT_TEMPLATES) {
    if (byTemplate[tmpl.id]) continue;
    const created = await prisma.teamCat.create({
      data: {
        teamId: team.id,
        templateId: tmpl.id,
        name: tmpl.name,
        role: tmpl.role,
        description: tmpl.description,
        catColors: tmpl.catColors,
        systemPrompt: tmpl.systemPrompt,
        skills: tmpl.skills,
        accent: tmpl.accent,
        item: tmpl.item,
        messages: tmpl.messages,
      },
    });
    byTemplate[tmpl.id] = created;
  }

  if (OFFICIAL_TEMPLATE_IDS.some((id) => !byTemplate[id])) {
    console.error('[workbench-seed] missing official cats after seed');
  }

  const wfCount = await prisma.workflow.count({ where: { teamId: team.id } });
  if (wfCount === 0) {
    const seedWfs = buildSeedWorkflowSteps(byTemplate);
    for (const w of seedWfs) {
      await prisma.workflow.create({
        data: {
          teamId: team.id,
          name: w.name,
          category: w.category || 'ecommerce',
          icon: w.icon,
          description: w.description,
          placeholder: w.placeholder || null,
          steps: w.steps,
          trigger: w.trigger || 'manual',
          persistent: !!w.persistent,
          enabled: true,
        },
      });
    }
  } else {
    // 默认不自动修复/重建内置工作流：
    // - 管理员后台允许编辑工作流，自动 repair 会覆盖修改，甚至在改名/删除后“新增一条种子工作流”
    // 如需强制对齐种子步骤（仅运维场景），显式开启 WORKBENCH_REPAIR_WORKFLOWS=1
    if (process.env.WORKBENCH_REPAIR_WORKFLOWS === '1') {
      await repairWebPageBuilderWorkflowIfNeeded(prisma, team.id, byTemplate);
      await disableResumeWorkflowIfNeeded(prisma, team.id);
      await repairBrandKitWorkflowIfNeeded(prisma, team.id, byTemplate);
      await repairPosterWorkflowIfNeeded(prisma, team.id, byTemplate);
    }
  }

  return team;
}

/**
 * 与 frontend/src/data/workflows.ts 中 web-page-builder 步骤一致（agent 为 templateId，此处转为 TeamCat.id）。
 * @param {Record<string, { id: string }>} catByTemplateId
 */
function buildSeedWorkflowSteps(catByTemplateId) {
  const C = (tid) => {
    const c = catByTemplateId[tid];
    if (!c) throw new Error(`Missing cat for template ${tid}`);
    return c.id;
  };

  // 与 frontend/src/data/workflows.ts 中 web-page-builder 逐步一致（仅多 agentId=TeamCat.id）
  return [
    {
      name: '落地页',
      category: 'internet',
      icon: 'Globe',
      description:
        '一句话生成可编辑的“落地页首屏 Hero”：提炼卖点 → 视觉确定风格 → 前端输出可预览 HTML（适合分享与导出）。',
      placeholder: '描述你的产品/活动：一句话定位 + 目标人群 + 想强调的卖点…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'wpb_arch',
          agentId: C('product-architect'),
          systemPrompt:
            '你是落地页策划/产品架构师。只为“首屏Hero”输出结构 JSON（必须可解析）。只允许输出 4~6 个字段：主标题/副标题/三条卖点/信任背书/CTA（可选价格/限时）。输出必须是 JSON 对象，禁止 markdown，禁止解释文字。',
        },
        {
          stepId: 'wpb_visual',
          agentId: C('visual-designer'),
          inputFrom: 'wpb_arch',
        },
        {
          stepId: 'wpb_fe',
          agentId: C('frontend-engineer'),
          inputFrom: 'wpb_visual',
          systemPrompt:
            '你是前端工程师。生成“落地页首屏Hero”静态单页 HTML（自包含、移动端优先）：包含主标题/副标题/卖点列表/信任背书/CTA按钮（2个）。必须适合导出 PNG/PDF，并且正文可被 contenteditable 编辑（避免把文字渲染进图片）。只输出完整 HTML。',
        },
      ],
    },
    {
      name: '海报制作',
      category: 'ecommerce',
      icon: 'Image',
      description:
        '输入活动/产品主题，一键生成可编辑海报：品牌运营拆解 → 文案共鸣表达 → 视觉匹配风格 → 前端输出单页海报（可导出）。',
      placeholder: '输入海报主题：如「新品发布会 / 春季招新 / 限时折扣」…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'poster_brand',
          agentId: C('recorder-log'),
          systemPrompt:
            '你是品牌运营。输出“海报Brief”：主题/受众/目的/情绪/关键词/约束（移动端一屏海报，可编辑，避免外链图片）。只输出 Markdown。',
        },
        {
          stepId: 'poster_copy',
          agentId: C('writer-article'),
          inputFrom: 'poster_brand',
          systemPrompt:
            '你是文案专员。基于海报Brief输出海报文案：主标题/副标题/三条卖点/行动号召（2个按钮备选）。只输出 Markdown。',
        },
        {
          stepId: 'poster_visual',
          agentId: C('visual-designer'),
          inputFrom: 'poster_copy',
          systemPrompt:
            '你是视觉设计师。根据上游海报文案与意图，输出“视觉风格：<设计提示词>”（可被前端工程师直接采用）。只输出两段：视觉风格：...\\n\\n用户需求：...（不需要选择理由）。',
        },
        {
          stepId: 'poster_fe',
          agentId: C('frontend-engineer'),
          inputFrom: 'poster_visual',
          systemPrompt:
            '你是前端工程师。生成“单屏海报”静态单页 HTML（自包含）：居中排版、强主标题、按钮CTA、装饰性背景（SVG/CSS渐变）。必须移动端优先，适合导出图片/PDF。额外要求：布局需兼容 3:4、1:1、9:16 裁切（关键文字始终在安全区）。只输出完整 HTML。',
        },
      ],
    },
    {
      name: '品牌气质卡',
      category: 'ecommerce',
      icon: 'Palette',
      description:
        '输入品牌/产品一句话，生成可编辑的品牌气质卡：品牌Brief → 口号与语气 → 视觉方向 → 一页品牌卡（配色/字体/语气示例/组件样式）。',
      placeholder: '描述你的品牌：定位 + 受众 + 3个关键词（如“温柔、专业、克制”）…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'brandkit_brief',
          agentId: C('recorder-log'),
          systemPrompt:
            '你是品牌运营。输出“品牌Brief”：定位/受众/调性关键词（5个以内）/禁用词/场景/参考气质。只输出 Markdown，短而完整。',
        },
        {
          stepId: 'brandkit_copy',
          agentId: C('writer-article'),
          inputFrom: 'brandkit_brief',
          systemPrompt:
            '你是品牌文案。基于品牌Brief输出：一句话定位、口号备选（3条）、品牌语气（3条原则）、示例文案（3句）。只输出 Markdown，避免长文。',
        },
        {
          stepId: 'brandkit_visual',
          agentId: C('visual-designer'),
          inputFrom: 'brandkit_copy',
          systemPrompt:
            '你是视觉设计师。基于上游品牌文案与气质，输出“视觉风格：<设计提示词>”（可被前端工程师直接采用）。只输出两段：视觉风格：...\\n\\n用户需求：...（不需要选择理由）。',
        },
        {
          stepId: 'brandkit_fe',
          agentId: C('frontend-engineer'),
          inputFrom: 'brandkit_visual',
          systemPrompt:
            '你是前端工程师。生成“一页品牌气质卡”静态单页 HTML（自包含、移动端优先、可编辑）：展示配色（至少5个色块+用途文案）、字体搭配（2种 font-family fallback）、语气原则与示例文案、按钮/卡片样式示例。必须适合导出 PNG/PDF。只输出完整 HTML。',
        },
      ],
    },
    {
      name: '服装设计',
      category: 'ecommerce',
      icon: 'PenLine',
      description:
        '输入服装需求（场合/人群/风格/颜色/版型），生成一张可用来沟通的服装设计效果图。',
      placeholder: '描述你的服装：场合、人群、风格、主色、版型（如“极简通勤风米白色西装套装”）…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'fashion_brief',
          agentId: C('recorder-log'),
          systemPrompt:
            '你是服装设计助理。把用户需求整理成“服装设计 Brief”：品类/人群/场景/版型/面料质感/配色/细节元素（领型、袖型、纽扣、口袋等）/风格关键词/禁用项。只输出 Markdown，尽量结构化（小标题+要点）。',
        },
        {
          stepId: 'fashion_image',
          agentId: C('pixel-image'),
          inputFrom: 'fashion_brief',
        },
      ],
    },
    {
      name: '手机壳设计',
      category: 'ecommerce',
      icon: 'Square',
      description:
        '输入主题/图案元素/色系与风格，生成一张手机壳设计效果图（适合电商沟通/上新）。',
      placeholder: '描述你的手机壳：主题、元素、色系、风格（如“樱花粉渐变 + 线条猫咪插画 + 极简”）…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'case_brief',
          agentId: C('recorder-log'),
          systemPrompt:
            '你是手机壳设计助理。把用户需求整理成“手机壳设计 Brief”：机型/材质（TPU/PC/透明/磨砂）/主视觉元素/配色/图案位置（居中、角落、全幅）/风格关键词/工艺（烫金、浮雕、UV、半透）/禁用项。只输出 Markdown，结构化要点。',
        },
        {
          stepId: 'case_image',
          agentId: C('pixel-image'),
          inputFrom: 'case_brief',
        },
      ],
    },
    {
      name: '插画设计',
      category: 'ecommerce',
      icon: 'Pencil',
      description:
        '输入主题与风格方向，生成一张插画（可用于海报、商品详情、社媒配图）。',
      placeholder: '描述你的插画：主题、风格、色调、元素（如“治愈系手绘风，暖色调，小猫在书店里”）…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'illustration_brief',
          agentId: C('recorder-log'),
          systemPrompt:
            '你是插画助理。把用户需求整理成“插画 Brief”：主题/画面主体/背景/构图/色调/风格（如水彩、线稿、扁平、日系）/氛围/细节元素/禁用项。只输出 Markdown，结构化要点。',
        },
        {
          stepId: 'illustration_image',
          agentId: C('pixel-image'),
          inputFrom: 'illustration_brief',
        },
      ],
    },
  ];
}

async function repairFashionDesignWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['recorder-log', 'pixel-image']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId).find((w) => w.name === '服装设计');
  if (!want?.steps?.length) return;
  const wfs = await prisma.workflow.findMany({ where: { teamId, name: '服装设计' } });
  if (!wfs.length) {
    await prisma.workflow.create({
      data: {
        teamId,
        name: want.name,
        category: want.category || 'ecommerce',
        icon: want.icon,
        description: want.description,
        placeholder: want.placeholder || null,
        steps: want.steps,
        trigger: want.trigger || 'manual',
        persistent: !!want.persistent,
        enabled: true,
      },
    });
    console.log('[workbench-seed] added 服装设计 workflow');
  }
}

async function repairPhoneCaseDesignWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['recorder-log', 'pixel-image']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId).find((w) => w.name === '手机壳设计');
  if (!want?.steps?.length) return;
  const wfs = await prisma.workflow.findMany({ where: { teamId, name: '手机壳设计' } });
  if (!wfs.length) {
    await prisma.workflow.create({
      data: {
        teamId,
        name: want.name,
        category: want.category || 'ecommerce',
        icon: want.icon,
        description: want.description,
        placeholder: want.placeholder || null,
        steps: want.steps,
        trigger: want.trigger || 'manual',
        persistent: !!want.persistent,
        enabled: true,
      },
    });
    console.log('[workbench-seed] added 手机壳设计 workflow');
  }
}

async function repairIllustrationDesignWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['recorder-log', 'pixel-image']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId).find((w) => w.name === '插画设计');
  if (!want?.steps?.length) return;
  const wfs = await prisma.workflow.findMany({ where: { teamId, name: '插画设计' } });
  if (!wfs.length) {
    await prisma.workflow.create({
      data: {
        teamId,
        name: want.name,
        category: want.category || 'ecommerce',
        icon: want.icon,
        description: want.description,
        placeholder: want.placeholder || null,
        steps: want.steps,
        trigger: want.trigger || 'manual',
        persistent: !!want.persistent,
        enabled: true,
      },
    });
    console.log('[workbench-seed] added 插画设计 workflow');
  }
}

/**
 * 线上已有工作台团队时，将「落地页」修正为与 frontend/src/data/workflows.ts 一致（当前为三步：策划→视觉→前端）。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 * @param {Record<string, { id: string }>} catByTemplateId
 */
async function repairWebPageBuilderWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['product-architect', 'visual-designer', 'frontend-engineer']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId)[0];
  if (!want?.steps?.length) return;

  const wfs = await prisma.workflow.findMany({
    where: { teamId, name: '落地页' },
  });

  for (const wf of wfs) {
    let steps = wf.steps;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        continue;
      }
    }
    if (!Array.isArray(steps)) continue;

    const normFrom = (v) => (v === undefined || v === null || v === '' ? null : v);
    const aligned =
      steps.length === want.steps.length &&
      want.steps.every((exp) => {
        const cur = steps.find((s) => s.stepId === exp.stepId);
        if (!cur || cur.agentId !== exp.agentId) return false;
        return normFrom(cur.inputFrom) === normFrom(exp.inputFrom);
      });
    if (aligned) continue;

    await prisma.workflow.update({
      where: { id: wf.id },
      data: {
        steps: want.steps,
        description: want.description,
        icon: want.icon,
        placeholder: want.placeholder || null,
        category: want.category || 'internet',
      },
    });
    console.log(
      '[workbench-seed] repaired 落地页: steps → wpb_arch → wpb_visual → wpb_fe（与 workflows.ts 对齐）',
    );
  }
}

/**
 * 线上已有工作台团队时，下线「简历」：
 * - 将 enabled=false（保留历史 run 关联）
 * - 不再 repair/新增该工作流
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 */
async function disableResumeWorkflowIfNeeded(prisma, teamId) {
  const wfs = await prisma.workflow.findMany({ where: { teamId, name: '简历' } });
  for (const wf of wfs) {
    if (wf.enabled === false) continue;
    await prisma.workflow.update({ where: { id: wf.id }, data: { enabled: false } });
    console.log('[workbench-seed] disabled 简历 workflow');
  }
}

/**
 * 线上已有工作台团队时，补齐/修正「品牌气质卡」为与 seed 一致（运营→文案→视觉→前端）。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 * @param {Record<string, { id: string }>} catByTemplateId
 */
async function repairBrandKitWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['recorder-log', 'writer-article', 'visual-designer', 'frontend-engineer']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId).find((w) => w.name === '品牌气质卡');
  if (!want?.steps?.length) return;

  const wfs = await prisma.workflow.findMany({
    where: { teamId, name: '品牌气质卡' },
  });

  if (!wfs.length) {
    await prisma.workflow.create({
      data: {
        teamId,
        name: want.name,
        category: want.category || 'ecommerce',
        icon: want.icon,
        description: want.description,
        placeholder: want.placeholder || null,
        steps: want.steps,
        trigger: want.trigger || 'manual',
        persistent: !!want.persistent,
        enabled: true,
      },
    });
    console.log('[workbench-seed] added 品牌气质卡 workflow');
    return;
  }

  const normFrom = (v) => (v === undefined || v === null || v === '' ? null : v);
  for (const wf of wfs) {
    let steps = wf.steps;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        steps = null;
      }
    }
    if (!Array.isArray(steps)) steps = [];

    const aligned =
      steps.length === want.steps.length &&
      want.steps.every((exp) => {
        const cur = steps.find((s) => s.stepId === exp.stepId);
        if (!cur || cur.agentId !== exp.agentId) return false;
        return normFrom(cur.inputFrom) === normFrom(exp.inputFrom);
      });
    if (aligned) continue;

    await prisma.workflow.update({
      where: { id: wf.id },
      data: {
        steps: want.steps,
        description: want.description,
        icon: want.icon,
        placeholder: want.placeholder || null,
        category: want.category || 'ecommerce',
        enabled: true,
      },
    });
    console.log('[workbench-seed] repaired 品牌气质卡: steps → brandkit_brief → brandkit_copy → brandkit_visual → brandkit_fe');
  }
}

/**
 * 线上已有工作台团队时，补齐/修正「海报制作」为与 seed 一致（运营→文案→视觉→前端）。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 * @param {Record<string, { id: string }>} catByTemplateId
 */
async function repairPosterWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['recorder-log', 'writer-article', 'visual-designer', 'frontend-engineer']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId).find((w) => w.name === '海报制作');
  if (!want?.steps?.length) return;

  const wfs = await prisma.workflow.findMany({
    where: { teamId, name: '海报制作' },
  });

  if (!wfs.length) {
    await prisma.workflow.create({
      data: {
        teamId,
        name: want.name,
        category: want.category || 'ecommerce',
        icon: want.icon,
        description: want.description,
        placeholder: want.placeholder || null,
        steps: want.steps,
        trigger: want.trigger || 'manual',
        persistent: !!want.persistent,
        enabled: true,
      },
    });
    console.log('[workbench-seed] added 海报制作 workflow');
    return;
  }

  const normFrom = (v) => (v === undefined || v === null || v === '' ? null : v);
  for (const wf of wfs) {
    let steps = wf.steps;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        steps = null;
      }
    }
    if (!Array.isArray(steps)) steps = [];

    const aligned =
      steps.length === want.steps.length &&
      want.steps.every((exp) => {
        const cur = steps.find((s) => s.stepId === exp.stepId);
        if (!cur || cur.agentId !== exp.agentId) return false;
        return normFrom(cur.inputFrom) === normFrom(exp.inputFrom);
      });
    if (aligned) continue;

    await prisma.workflow.update({
      where: { id: wf.id },
      data: {
        steps: want.steps,
        description: want.description,
        icon: want.icon,
        placeholder: want.placeholder || null,
        category: want.category || 'ecommerce',
      },
    });
    console.log('[workbench-seed] repaired 海报制作: steps → poster_brand → poster_copy → poster_visual → poster_fe');
  }
}

/**
 * 任意团队补齐 17 只官方猫（不创建工作流）。用于用户手动「创建团队」等场景。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 */
async function seedOfficialCatsForTeam(prisma, teamId) {
  const cats = await prisma.teamCat.findMany({ where: { teamId } });
  const byTemplate = Object.fromEntries(
    cats.filter((c) => c.templateId).map((c) => [c.templateId, c])
  );
  for (const tmpl of CAT_TEMPLATES) {
    if (byTemplate[tmpl.id]) continue;
    await prisma.teamCat.create({
      data: {
        teamId,
        templateId: tmpl.id,
        name: tmpl.name,
        role: tmpl.role,
        description: tmpl.description,
        catColors: tmpl.catColors,
        systemPrompt: tmpl.systemPrompt,
        skills: tmpl.skills,
        accent: tmpl.accent,
        item: tmpl.item,
        messages: tmpl.messages,
      },
    });
  }
}

/**
 * 管理员运维：强制修复某个 teamId 的工作台官方工作流（不会触碰非官方工作流）。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 */
async function repairWorkbenchWorkflowsForTeam(prisma, teamId) {
  const team = await prisma.team.findUnique({ where: { id: teamId } }).catch(() => null);
  if (!team) throw new Error('team not found');

  const cats = await prisma.teamCat.findMany({
    where: { teamId },
    orderBy: { createdAt: 'asc' },
  });
  const byTemplate = Object.fromEntries(
    cats.filter((c) => c.templateId).map((c) => [c.templateId, c])
  );

  await repairWebPageBuilderWorkflowIfNeeded(prisma, teamId, byTemplate);
  await disableResumeWorkflowIfNeeded(prisma, teamId);
  await repairBrandKitWorkflowIfNeeded(prisma, teamId, byTemplate);
  await repairPosterWorkflowIfNeeded(prisma, teamId, byTemplate);
  await repairFashionDesignWorkflowIfNeeded(prisma, teamId, byTemplate);
  await repairPhoneCaseDesignWorkflowIfNeeded(prisma, teamId, byTemplate);
  await repairIllustrationDesignWorkflowIfNeeded(prisma, teamId, byTemplate);
}

module.exports = {
  ensureWorkbenchTeam,
  seedOfficialCatsForTeam,
  WORKBENCH_MARKER,
  buildSeedWorkflowSteps,
  repairWorkbenchWorkflowsForTeam,
};
