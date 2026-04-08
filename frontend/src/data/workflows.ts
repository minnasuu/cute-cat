import type { Workflow } from './types';

/**
 * 社区示意：当前产品仅围绕「落地页」web-page-builder。
 * agentId 与官方猫 templateId 一致，便于社区页解析头像与角色。
 */
export const workflows: Workflow[] = [
  {
    id: 'landing-page',
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
  {
    id: 'resume',
    name: '简历',
    description:
      '输入求职岗位，一键生成可编辑的一页简历：HR 梳理结构 → 文案补全要点 → 视觉优化 → 排版输出 A4 HTML，并支持导出 PDF。',
    steps: [
      {
        stepId: 'resume_arch',
        agentId: 'resume-architect',
      },
      {
        stepId: 'resume_write',
        agentId: 'resume-writer',
        inputFrom: 'resume_arch',
      },
      {
        stepId: 'resume_visual',
        agentId: 'visual-designer',
        inputFrom: 'resume_write',
      },
      {
        stepId: 'resume_html',
        agentId: 'resume-html-engineer',
        inputFrom: 'resume_visual',
      },
    ],
  },
  {
    id: 'poster',
    name: '海报制作',
    description:
      '输入活动/产品主题，一键生成可编辑海报：品牌运营拆解 → 文案共鸣表达 → 视觉匹配风格 → 前端输出单页海报（可导出）。',
    steps: [
      {
        stepId: 'poster_brand',
        agentId: 'recorder-log',
      },
      {
        stepId: 'poster_copy',
        agentId: 'writer-article',
        inputFrom: 'poster_brand',
      },
      {
        stepId: 'poster_visual',
        agentId: 'visual-designer',
        inputFrom: 'poster_copy',
      },
      {
        stepId: 'poster_fe',
        agentId: 'frontend-engineer',
        inputFrom: 'poster_visual',
      },
    ],
  },
];
