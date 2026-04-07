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
      '产品策划根据需求产出网站架构 → 交互设计师梳理链路与关键交互 → 视觉设计师定义风格与页面气质 → 前端工程师输出页面实现稿（全程 AIGC 执行）。',
    steps: [
      {
        stepId: 'wpb_arch',
        agentId: 'product-architect',
      },
      // {
      //   stepId: 'wpb_ix',
      //   agentId: 'ux-designer',
      //   inputFrom: 'wpb_arch',
      // },
      {
        stepId: 'wpb_visual',
        agentId: 'visual-designer',
        // 交互步骤未启用时直接承接产品架构（勿引用已注释的 wpb_ix）
        inputFrom: 'wpb_arch',
      },
      {
        stepId: 'wpb_fe',
        agentId: 'frontend-engineer',
        inputFrom: 'wpb_visual',
      },
    ],
  },
];
