import type { Workflow } from './types';

/**
 * 社区示意：当前产品仅围绕「网页制作流水线」web-page-builder。
 * agentId 与官方猫 templateId 一致，便于社区页解析头像与角色。
 */
export const workflows: Workflow[] = [
  {
    id: 'web-page-builder',
    name: '落地页',
    description:
      '一句话生成静态单页落地页：策划梳理模块 → 视觉确定风格 → 前端生成可预览 HTML，并支持一键导出 HTML / 图片。',
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
