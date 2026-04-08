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
      await repairResumeWorkflowIfNeeded(prisma, team.id, byTemplate);
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
      icon: 'Globe',
      description:
        '一句话生成静态单页落地页：策划梳理模块 → 视觉确定风格 → 前端生成可预览 HTML，并支持一键导出 HTML / 图片。',
      placeholder: '描述你的页面或站点：目标用户、必备模块、风格气质…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'wpb_arch',
          agentId: C('product-architect'),
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
        },
      ],
    },
    {
      name: '简历',
      icon: 'FileText',
      description:
        '输入求职岗位，一键生成可编辑的一页简历：HR 梳理结构 → 文案补全要点 → 视觉优化（可复用落地页视觉猫） → 排版输出 A4 HTML，并支持导出 PDF。',
      placeholder: '输入求职岗位：如「产品经理 / 前端工程师 / 数据分析师」…',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'resume_arch',
          agentId: C('resume-architect'),
        },
        {
          stepId: 'resume_write',
          agentId: C('resume-writer'),
          inputFrom: 'resume_arch',
        },
        {
          stepId: 'resume_visual',
          agentId: C('visual-designer'),
          inputFrom: 'resume_write',
        },
        {
          stepId: 'resume_html',
          agentId: C('resume-html-engineer'),
          inputFrom: 'resume_visual',
        },
      ],
    },
    {
      name: '海报制作',
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
            '你是前端工程师。生成“单屏海报”静态单页 HTML（自包含）：居中排版、强主标题、按钮CTA、装饰性背景（SVG/CSS渐变）。必须移动端优先，适合导出图片/PDF。只输出完整 HTML。',
        },
      ],
    },
  ];
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
      },
    });
    console.log(
      '[workbench-seed] repaired 落地页: steps → wpb_arch → wpb_visual → wpb_fe（与 workflows.ts 对齐）',
    );
  }
}

/**
 * 线上已有工作台团队时，补齐/修正「简历」为与 seed 一致（三步：HR→写手→排版）。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 * @param {Record<string, { id: string }>} catByTemplateId
 */
async function repairResumeWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of ['resume-architect', 'resume-writer', 'visual-designer', 'resume-html-engineer']) {
    if (!catByTemplateId[tid]?.id) return;
  }
  const want = buildSeedWorkflowSteps(catByTemplateId).find((w) => w.name === '简历');
  if (!want?.steps?.length) return;

  const wfs = await prisma.workflow.findMany({
    where: { teamId, name: '简历' },
  });

  if (!wfs.length) {
    await prisma.workflow.create({
      data: {
        teamId,
        name: want.name,
        icon: want.icon,
        description: want.description,
        placeholder: want.placeholder || null,
        steps: want.steps,
        trigger: want.trigger || 'manual',
        persistent: !!want.persistent,
        enabled: true,
      },
    });
    console.log('[workbench-seed] added 简历 workflow');
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
      },
    });
    console.log('[workbench-seed] repaired 简历: steps → resume_arch → resume_write → resume_html');
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

module.exports = {
  ensureWorkbenchTeam,
  seedOfficialCatsForTeam,
  WORKBENCH_MARKER,
  buildSeedWorkflowSteps,
};
