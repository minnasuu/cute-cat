import type { Assistant } from './types';
import type { CatColors } from '../components/CatSVG';
import { appearanceTemplates } from './themes';

function appearanceAt(index: number): CatColors {
  return JSON.parse(JSON.stringify(appearanceTemplates[index % appearanceTemplates.length].colors)) as CatColors;
}

function one(
  appearanceIndex: number,
  id: string,
  name: string,
  role: string,
  accent: string,
  description: string,
  messages: string[]
): Assistant {
  return {
    id,
    name,
    role,
    description,
    accent,
    systemPrompt: '',
    skills: [],
    item: 'clipboard',
    catColors: appearanceAt(appearanceIndex),
    messages,
  };
}

/** 社区页 17 只官方猫：仅展示角色与 AIGC 方向；与后端 official-cats 岗位一致 */
export const officialCatsCommunity: Assistant[] = [
  one(0, 'product-architect', '花椒', '产品策划', '#8DB889', '根据用户需求生成符合产品逻辑的结构树型架构图', ['架构中', '让我思考最重要的结构']),
  one(1, 'ux-designer', '青稞', '交互设计师', '#8DB889', '根据用户需求生成符合产品逻辑的交互流程图', ['交互中', '让我思考最重要的交互流程']),
  one(8, 'visual-designer', '墨墨', '视觉设计师', '#4E342E', '主视觉与配图创意，AIGC 生成画面方向。', ['画面生成中…', '你喜欢什么风格？']),
  one(2, 'frontend-engineer', '琥珀', '前端工程师', '#8DB889', '根据用户需求生成符合产品逻辑的网页结构和样式', ['开始设计网页！', '让我看看你的设计']),
  one(3, 'writer', '阿蓝', '文案编辑', '#FF6B6B', '长文与多平台，AIGC 辅助成文。', ['开始写作了！', '成稿请过目～']),
  one(4, 'copywriter', '米卷', '文案编辑', '#FF6B6B', '需求结构与方案骨架，AIGC 输出大纲。', ['大纲好了！', '要再拆细一点吗？']),
  one(5, 'scout-crawl', '雪糕', '市场研究', '#96BAFF', '竞品与行业动态，AIGC 归纳洞察（抓取后续接入）。', ['最新资讯到手', '一起看看前沿～']),
  one(6, 'messenger-email', '年年', '销售专家', '#F2A5B9', '触达话术与邮件稿，AIGC 生成沟通文案。', ['邮件已发出！', '正文润色好了']),
  one(7, 'builder-html', '小虎', '交互设计师', '#FFB74D', '信息架构与组件说明，AIGC 输出结构描述。', ['组件画好了！', '交互结构就绪']),
  one(9, 'pixel-chart', '柚柚', '数据分析师', '#4E342E', '指标解读与可视化叙事，AIGC 输出图表建议。', ['图表已出图！', '趋势一目了然']),
  one(10, 'pixel-enhance', '云朵', '多媒体设计', '#4E342E', '素材延展与优化思路，AIGC 给出处理建议。', ['清晰度拉满～', '再修一版？']),
  one(11, 'engineer-fix', '黄金', '前端工程师', '#90CAF9', '页面实现与组件落地，AIGC 辅助 HTML/CSS 草稿。', ['组件对齐了', '样式收口～']),
  one(12, 'recorder-log', '咪咪', '运营专家', '#B39DDB', '活动复盘与周报，AIGC 生成运营向内容。', ['日志已归档！', '本周小结好了']),
  one(13, 'recorder-notes', '团子', '行政助理', '#B39DDB', '会议与对内纪要，AIGC 整理要点。', ['纪要已生成！', '待办都标好了']),
  one(14, 'qa-review', '小白', '质量控制', '#EC407A', '质量与合规把关，AIGC 输出审阅意见。', ['审核完毕', '风险点标出来了～']),
  one(15, 'creative-mece', '发发', '商业分析师', '#FFB74D', '结构化论证与 MECE 式分析文稿，AIGC 辅助。', ['MECE 树画好了！', '穷尽且无重']),
  one(16, 'creative-scamper', '灵犀', '创意策划', '#FFB74D', 'Campaign 与创意发散，AIGC 做 SCAMPER 等整合。', ['灵感清单在这', '要组合一版吗？']),
];

export const legacyWorkflowAgentLabels: Record<string, string> = {
  analyst: '雪糕',
  writer: '阿蓝',
  designer: '墨墨',
  reviewer: '小白',
  ops: '年年',
  manager: '花椒',
};
