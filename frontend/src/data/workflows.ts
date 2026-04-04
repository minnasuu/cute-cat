import type { Workflow } from './types';

/**
 * 社区示意：当前产品仅围绕「网页制作流水线」web-page-builder。
 * agentId 与官方猫 templateId 一致，便于社区页解析头像与角色。
 */
export const workflows: Workflow[] = [
  {
    id: 'web-page-builder',
    name: '网页制作流水线',
    description:
      '产品策划根据需求产出网站架构 → 交互设计师梳理链路与关键交互 → 视觉设计师定义风格与页面气质 → 前端工程师输出页面实现稿（全程 AIGC 占位执行）。',
    steps: [
      {
        stepId: 'wpb_arch',
        agentId: 'writer-outline',
        skillId: 'aigc',
        action:
          '（产品策划）根据用户输入，输出网站信息架构：建站目标、受众、页面树（站点地图）、各页核心模块与内容要点。用 Markdown，便于后续步骤引用。',
        params: [
          {
            key: 'topic',
            label: '建站需求 / 一句话描述',
            type: 'text',
            placeholder: '例如：SaaS 产品官网，需首页、定价、文档入口，风格专业可信',
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
        agentId: 'builder-html',
        skillId: 'aigc',
        inputFrom: 'wpb_arch',
        action:
          '（交互设计师）基于上一步网站架构，输出核心用户路径与交互说明：主要任务流、页面间跳转、关键页面上的组件级交互与空态/加载建议。Markdown。',
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
        agentId: 'pixel-image',
        skillId: 'aigc',
        inputFrom: 'wpb_ix',
        action:
          '（视觉设计师）基于架构与交互稿，输出页面视觉方向：主色/辅色、字体气质、圆角与间距倾向、组件风格关键词、可参考的 moodboard 文字描述。Markdown。',
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
        agentId: 'engineer-fix',
        skillId: 'aigc',
        inputFrom: 'wpb_visual',
        action:
          '（前端工程师）综合信息架构、交互与视觉方向，输出可交付的页面实现：单页或可复制的 HTML 草稿（含内联关键样式说明），并标注与架构各模块的对应关系。Markdown + 代码块。',
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
