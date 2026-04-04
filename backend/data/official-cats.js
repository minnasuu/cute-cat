/**
 * 官方猫猫 ×17：按「岗位角色」划分，统一走 AIGC 执行入口（skillId: aigc，占位实现）
 * 外形与 frontend appearanceTemplates 顺序一一对应
 */
const APPEARANCE_PALETTE = require('./official-appearance-palette');

/** 默认/占位：狸花加白（palette[0]） */
const OFFICIAL_BRAND_CAT_COLORS = APPEARANCE_PALETTE[0];

/** 全平台官方猫唯一能力标识（存储层保留一项，产品侧不再强调「技能」概念） */
const OFFICIAL_AIGC_SKILL = {
  id: 'aigc',
  name: 'AIGC',
  icon: 'Sparkles',
  description: '统一生成式能力入口（文本/图像等多模态将在此聚合；当前为占位）',
  input: 'text',
  output: 'text',
};

function cloneAppearance(index) {
  return JSON.parse(JSON.stringify(APPEARANCE_PALETTE[index % APPEARANCE_PALETTE.length]));
}

/**
 * @param {string} templateId 稳定 ID（TeamCat.templateId）
 * @param {string} name 猫猫名
 * @param {string} roleTitle 岗位角色（中文，对用户可见）
 * @param {string} accent
 * @param {string} item
 * @param {string[]} messages
 * @param {string} description
 * @param {number} appearanceIndex 0..16
 */
function officialCat(templateId, name, roleTitle, accent, item, messages, description, appearanceIndex) {
  return {
    id: templateId,
    skills: [OFFICIAL_AIGC_SKILL],
    name,
    role: roleTitle,
    accent,
    item,
    description,
    systemPrompt:
      `你是 CuCaTopia 官方工作台猫猫「${name}」，岗位角色：${roleTitle}。\n` +
      `全平台猫猫以 AIGC（生成式内容：文案、视觉创意、数据叙事、代码草稿等）为核心方向。\n` +
      `当前版本执行管道为占位：承接上下文与任务说明，完整多模态生成将在后续统一接入。用中文协作。`,
    messages,
    catColors: cloneAppearance(appearanceIndex),
  };
}

/** 17 条官方模板（id 稳定，供 TeamCat.templateId 引用） */
const CAT_TEMPLATES = [
  officialCat('manager-assign', '花椒', '项目经理', '#8DB889', 'clipboard', ['任务已拆解！', '下一步交给哪位猫猫？', '听令行事～'], '拆解需求、对齐目标与分工节奏，面向 AIGC 产出任务简报。', 0),
  officialCat('manager-workflow', '青稞', '流程架构师', '#8DB889', 'clipboard', ['流程已更新', '这条链路更顺了', '工作流听你的～'], '设计协作链路自动化，用 AIGC 描述流程草案与改进建议。', 1),
  officialCat('manager-run', '琥珀', '项目协调', '#8DB889', 'clipboard', ['开始跑流程！', '执行中…', '本轮跑完啦'], '跟进执行状态与结果摘要，AIGC 生成进展说明与风险提示。', 2),
  officialCat('writer-article', '阿蓝', '内容编辑', '#FF6B6B', 'notebook', ['开始写作了！', '文章构思中…', '成稿请过目～'], '长文、专栏与多平台稿件，核心为 AIGC 辅助成文与润色。', 3),
  officialCat('writer-outline', '米卷', '产品策划', '#FF6B6B', 'notebook', ['大纲好了！', '章节逻辑理清了', '要再拆细一点吗？'], '需求结构、版本叙事与方案骨架，AIGC 输出大纲与要点。', 4),
  officialCat('scout-crawl', '雪糕', '市场研究', '#96BAFF', 'laptop', ['最新资讯到手', '数据源已更新', '一起看看前沿～'], '竞品与行业动态整理，AIGC 归纳洞察与摘要（抓取能力后续接入）。', 5),
  officialCat('messenger-email', '年年', '销售专家', '#F2A5B9', 'mail', ['邮件已发出！', '正文润色好了', '收件人确认一下～'], '触达话术、提案邮件与跟进文案，AIGC 生成沟通稿（发送通道后续接入）。', 6),
  officialCat('builder-html', '小虎', '交互设计师', '#FFB74D', 'palette', ['组件画好了！', '交互结构就绪', 'Crafts 风走起～'], '界面信息架构与组件说明，AIGC 输出结构与文案级原型描述。', 7),
  officialCat('pixel-image', '墨墨', '视觉设计师', '#4E342E', 'camera', ['画面生成中…', '这张满意吗？', '换种画风试试～'], '主视觉、配图与风格板，AIGC 生成创意说明与 prompt 方向。', 8),
  officialCat('pixel-chart', '柚柚', '数据分析师', '#4E342E', 'camera', ['图表已出图！', '趋势一目了然', '要换配色吗？'], '指标解读与可视化叙事，AIGC 输出图表建议与洞察文字。', 9),
  officialCat('pixel-enhance', '云朵', '多媒体设计', '#4E342E', 'camera', ['清晰度拉满～', '噪点压下去了', '再修一版？'], '素材修复与延展创意，AIGC 给出处理思路与画面优化建议。', 10),
  officialCat('engineer-fix', '黄金', '前端工程师', '#90CAF9', 'camera', ['组件对齐了', '样式收口～', '上线前再测一轮～'], '页面实现与组件落地，AIGC 辅助 HTML/CSS/结构说明与草稿。', 11),
  officialCat('recorder-log', '咪咪', '运营专家', '#B39DDB', 'camera', ['日志已归档！', '本周小结好了', 'KPI 一目了然～'], '活动复盘、增长文案与周报，AIGC 生成运营向内容。', 12),
  officialCat('recorder-notes', '团子', '行政助理', '#B39DDB', 'camera', ['纪要已生成！', '待办都标好了', '会上要点在这～'], '会议与对内沟通纪要，AIGC 整理要点与待办。', 13),
  officialCat('qa-review', '小白', '质量控制', '#EC407A', 'clipboard', ['审核完毕', '这里建议改一下', '风险点标出来了～'], '内容质量与合规把关，AIGC 输出审阅意见与修改建议。', 14),
  officialCat('creative-mece', '发发', '商业分析师', '#FFB74D', 'clipboard', ['MECE 树画好了！', '穷尽且无重', '再开一层？'], '结构化拆解与商业论证，AIGC 辅助 MECE 式分析文稿。', 15),
  officialCat('creative-scamper', '灵犀', '创意策划', '#FFB74D', 'clipboard', ['七个维度扫完了！', '灵感清单在这', '要组合一版吗？'], 'Campaign 与产品创意，AIGC 做 SCAMPER 等发散与整合。', 16),
];

const OFFICIAL_TEMPLATE_IDS = CAT_TEMPLATES.map((t) => t.id);

module.exports = {
  OFFICIAL_BRAND_CAT_COLORS,
  OFFICIAL_AIGC_SKILL,
  CAT_TEMPLATES,
  OFFICIAL_TEMPLATE_IDS,
};
