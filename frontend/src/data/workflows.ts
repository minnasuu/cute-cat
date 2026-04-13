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
      '一句话生成可编辑的“完整落地页”：信息架构 → 交互路径 → 视觉风格 → 前端输出可预览 HTML（适合分享与导出）。',
    steps: [
      {
        stepId: 'wpb_arch',
        agentId: 'product-architect',
      },
      {
        stepId: 'wpb_ix',
        agentId: 'ux-designer',
        inputFrom: 'wpb_arch',
      },
      {
        stepId: 'wpb_visual',
        agentId: 'visual-designer',
        inputFrom: 'wpb_ix',
      },
      {
        stepId: 'wpb_fe',
        agentId: 'frontend-engineer',
        inputFrom: 'wpb_visual',
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
  {
    id: 'brand-kit',
    name: '品牌气质卡',
    description:
      '输入品牌/产品一句话，生成可编辑的品牌气质卡：品牌Brief → 口号与语气 → 视觉方向 → 一页品牌卡（配色/字体/语气示例/组件样式）。',
    steps: [
      {
        stepId: 'brandkit_brief',
        agentId: 'recorder-log',
      },
      {
        stepId: 'brandkit_copy',
        agentId: 'writer-article',
        inputFrom: 'brandkit_brief',
      },
      {
        stepId: 'brandkit_visual',
        agentId: 'visual-designer',
        inputFrom: 'brandkit_copy',
      },
      {
        stepId: 'brandkit_fe',
        agentId: 'frontend-engineer',
        inputFrom: 'brandkit_visual',
      },
    ],
  },
];
