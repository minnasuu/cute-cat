/**
 * 默认工作台团队：17 官方猫 + 唯一内置工作流 web-page-builder（步骤 agentId 为真实 TeamCat.id）
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
    const steps = buildSeedWorkflowSteps(byTemplate);
    for (const w of steps) {
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
  }

  return team;
}

/**
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
        '产品策划 → 交互设计 → 视觉设计 → 前端实现，根据你的建站需求串联产出（AIGC 占位执行）。',
      trigger: 'manual',
      persistent: false,
      steps: [
        {
          stepId: 'wpb_arch',
          agentId: C('writer-outline'),
          skillId: 'aigc',
          action:
            '（产品策划）根据用户输入，输出网站信息架构：建站目标、受众、页面树、各页核心模块与内容要点。Markdown。',
          params: [
            {
              key: 'topic',
              label: '建站需求 / 一句话描述',
              type: 'text',
              placeholder: '例如：SaaS 产品官网，需首页、定价、文档入口',
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
          agentId: C('builder-html'),
          skillId: 'aigc',
          inputFrom: 'wpb_arch',
          action:
            '（交互设计师）基于架构输出核心用户路径与交互说明：任务流、页面跳转、关键组件交互与状态。Markdown。',
          params: [
            {
              key: 'topic',
              label: '补充说明',
              type: 'text',
              valueSource: 'upstream',
            },
          ],
        },
        {
          stepId: 'wpb_visual',
          agentId: C('pixel-image'),
          skillId: 'aigc',
          inputFrom: 'wpb_ix',
          action:
            '（视觉设计师）输出视觉方向：色板、字体气质、圆角间距倾向、组件风格与 moodboard 文字描述。Markdown。',
          params: [
            {
              key: 'topic',
              label: '补充说明',
              type: 'text',
              valueSource: 'upstream',
            },
          ],
        },
        {
          stepId: 'wpb_fe',
          agentId: C('engineer-fix'),
          skillId: 'aigc',
          inputFrom: 'wpb_visual',
          action:
            '（前端工程师）综合前三步，输出页面实现稿：单页或可复制的 HTML 草稿（含关键样式说明），并标注与架构模块的对应关系。',
          params: [
            {
              key: 'topic',
              label: '补充说明',
              type: 'text',
              valueSource: 'upstream',
            },
          ],
        },
      ],
    },
  ];
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
