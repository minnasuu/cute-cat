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

  return [
    {
      name: '网页制作流水线',
      icon: 'Globe',
      description:
        '产品策划根据需求产出网站架构 → 交互设计师梳理链路与关键交互 → 视觉设计师定义风格与页面气质 → 前端工程师输出页面实现稿（全程 AIGC 执行）。',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'wpb_arch',
          agentId: C('product-architect'),
          skillId: 'aigc',
          action:
            '（产品策划·花椒）根据用户输入，输出网站信息架构：建站目标、受众、页面树（站点地图）、各页核心模块与内容要点。输出 JSON 格式的结构树。',
          params: [
            {
              key: 'topic',
              label: '建站需求 / 一句话描述',
              type: 'text',
              placeholder:
                '例如：SaaS 产品官网，需首页、定价、文档入口，风格专业可信',
              required: true,
            },
            {
              key: 'audience',
              label: '目标用户（可选）',
              type: 'text',
              placeholder: '如：中小企业主、开发者',
            },
          ],
        },
        {
          stepId: 'wpb_ix',
          agentId: C('ux-designer'),
          skillId: 'aigc',
          inputFrom: 'wpb_arch',
          action:
            '（交互设计师·阿蓝）基于上一步网站架构，输出核心用户路径与交互说明：主要任务流、页面间跳转、关键页面上的组件级交互与空态/加载建议。Markdown。',
        },
        {
          stepId: 'wpb_visual',
          agentId: C('visual-designer'),
          skillId: 'aigc',
          inputFrom: 'wpb_ix',
          action:
            '（视觉设计师·墨墨）基于架构与交互稿，从视觉 prompt 库中匹配最符合的视觉方向，输出：主色/辅色、字体气质、圆角与间距倾向、组件风格关键词。',
        },
        {
          stepId: 'wpb_fe',
          agentId: C('frontend-engineer'),
          skillId: 'aigc',
          inputFrom: 'wpb_visual',
          action:
            '（前端工程师·琥珀）综合信息架构、交互与视觉方向，输出完整可运行的 HTML 单页代码（含内联 CSS），标注与架构各模块的对应关系。',
        },
      ],
    },
  ];
}

/**
 * 线上已有工作台团队时，将「网页制作流水线」四步 agentId 修正为与 workflows.ts 一致的官方猫（避免旧种子绑错 templateId）。
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} teamId
 * @param {Record<string, { id: string }>} catByTemplateId
 */
async function repairWebPageBuilderWorkflowIfNeeded(prisma, teamId, catByTemplateId) {
  for (const tid of [
    'product-architect',
    'ux-designer',
    'visual-designer',
    'frontend-engineer',
  ]) {
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

    const stepIds = ['wpb_arch', 'wpb_ix', 'wpb_visual', 'wpb_fe'];
    let aligned = true;
    for (const sid of stepIds) {
      const cur = steps.find((s) => s.stepId === sid);
      const exp = want.steps.find((s) => s.stepId === sid);
      if (!cur || !exp || cur.agentId !== exp.agentId) {
        aligned = false;
        break;
      }
    }
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
      '[workbench-seed] repaired 网页制作流水线: agentIds → product-architect, ux-designer, visual-designer, frontend-engineer',
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
