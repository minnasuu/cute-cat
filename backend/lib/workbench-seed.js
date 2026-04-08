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
          steps: w.steps,
          trigger: w.trigger || 'manual',
          persistent: !!w.persistent,
          enabled: true,
        },
      });
    }
  } else {
    await repairWebPageBuilderWorkflowIfNeeded(prisma, team.id, byTemplate);
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
      name: '网页制作流水线',
      icon: 'Globe',
      description:
        '一句话生成静态单页落地页：策划梳理模块 → 视觉确定风格 → 前端生成可预览 HTML，并支持一键导出 HTML / 图片。',
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
  ];
}

/**
 * 线上已有工作台团队时，将「网页制作流水线」修正为与 frontend/src/data/workflows.ts 一致（当前为三步：策划→视觉→前端）。
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
    where: { teamId, name: '网页制作流水线' },
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
      },
    });
    console.log(
      '[workbench-seed] repaired 网页制作流水线: steps → wpb_arch → wpb_visual → wpb_fe（与 workflows.ts 对齐）',
    );
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
