/**
 * 官方工作流模版 —— 基于知名方法论搭建
 * 每个工作流引用 allCats 中的猫猫 id (agentId) 和 skillPool 中的技能 id (skillId)
 */

export interface OfficialWorkflow {
  id: string;
  name: string;
  icon: string;
  methodology: string;
  color: string;
  description: string;
  scenario: string;
  steps: { agentId: string; agentName: string; skillId: string; skillName: string; action: string }[];
  tags: string[];
}

export const officialWorkflows: OfficialWorkflow[] = [
  // ── 1. PDCA 循环 ──
  {
    id: 'pdca-content',
    name: '内容质量持续改进',
    icon: '🔄',
    methodology: 'PDCA 循环',
    color: '#8DB889',
    description: '基于戴明 PDCA（Plan-Do-Check-Act）循环，持续迭代优化内容产出质量。每一轮循环都会将质检反馈作为下一轮的改进输入。',
    scenario: '适用于博客运营、公众号内容、技术文档等需要持续打磨质量的场景',
    steps: [
      { agentId: 'manager', agentName: '花椒', skillId: 'generate-outline', skillName: '大纲生成', action: 'Plan — 分析选题并生成内容大纲' },
      { agentId: 'writer', agentName: '阿蓝', skillId: 'generate-article', skillName: '文章生成', action: 'Do — 根据大纲撰写完整文章' },
      { agentId: 'milk', agentName: '小白', skillId: 'quality-check', skillName: '质量检测', action: 'Check — 对文章进行质量评分和问题标注' },
      { agentId: 'writer', agentName: '阿蓝', skillId: 'polish-text', skillName: '内容润色', action: 'Act — 根据质检报告优化润色文章' },
    ],
    tags: ['内容创作', '质量管理', '持续改进'],
  },

  // ── 2. OODA 循环 ──
  {
    id: 'ooda-news',
    name: '资讯快速响应',
    icon: '⚡',
    methodology: 'OODA 循环',
    color: '#96BAFF',
    description: '基于 Boyd 的 OODA（Observe-Orient-Decide-Act）决策循环，快速感知行业动态并产出响应内容，在信息战中占得先机。',
    scenario: '适用于新闻资讯站、行业情报分析、竞品监控等需要快速反应的场景',
    steps: [
      { agentId: 'analytics', agentName: '雪', skillId: 'crawl-news', skillName: '资讯爬取', action: 'Observe — 爬取目标网站最新资讯' },
      { agentId: 'analytics', agentName: '雪', skillId: 'summarize-news', skillName: '资讯摘要', action: 'Orient — 对资讯进行摘要分类和趋势判断' },
      { agentId: 'manager', agentName: '花椒', skillId: 'assign-task', skillName: '任务分配', action: 'Decide — 决定是否值得跟进并分配任务' },
      { agentId: 'writer', agentName: '阿蓝', skillId: 'news-to-article', skillName: '资讯整理', action: 'Act — 将资讯整理为可发布内容' },
    ],
    tags: ['资讯监控', '快速响应', '情报分析'],
  },

  // ── 3. Design Thinking ──
  {
    id: 'design-thinking-visual',
    name: '创意视觉设计',
    icon: '🎨',
    methodology: 'Design Thinking',
    color: '#B39DDB',
    description: '遵循斯坦福 d.school 的设计思维五步法（Empathize-Define-Ideate-Prototype-Test），从用户视角出发进行创意视觉设计。',
    scenario: '适用于产品配图、活动海报、UI 组件设计等需要创意和用户洞察的场景',
    steps: [
      { agentId: 'analytics', agentName: '雪', skillId: 'trend-analysis', skillName: '趋势分析', action: 'Empathize — 分析目标用户偏好和设计趋势' },
      { agentId: 'manager', agentName: '花椒', skillId: 'generate-todo', skillName: '代办清单', action: 'Define — 明确设计需求和验收标准' },
      { agentId: 'writer', agentName: '阿蓝', skillId: 'generate-outline', skillName: '大纲生成', action: 'Ideate — 头脑风暴生成多个创意方案' },
      { agentId: 'image', agentName: 'Pixel', skillId: 'generate-image', skillName: 'AI 绘图', action: 'Prototype — 根据最优方案生成视觉原型' },
      { agentId: 'milk', agentName: '小白', skillId: 'quality-check', skillName: '质量检测', action: 'Test — 评估设计质量并提出改进建议' },
    ],
    tags: ['视觉设计', '用户体验', '创意'],
  },

  // ── 4. Scrum Sprint ──
  {
    id: 'scrum-sprint',
    name: '敏捷开发冲刺',
    icon: '🏃',
    methodology: 'Scrum',
    color: '#90CAF9',
    description: '基于 Scrum 敏捷框架的迷你 Sprint，从需求拆解到开发、测试、回顾的完整迭代周期，适合小团队快速交付。',
    scenario: '适用于功能开发、Bug 修复、技术优化等需要快速迭代交付的开发场景',
    steps: [
      { agentId: 'manager', agentName: '花椒', skillId: 'generate-todo', skillName: '代办清单', action: 'Sprint Planning — 拆解需求生成 Sprint Backlog' },
      { agentId: 'manager', agentName: '花椒', skillId: 'assign-task', skillName: '任务分配', action: 'Task Assignment — 将任务分配给开发猫猫' },
      { agentId: 'text', agentName: '黄金', skillId: 'develop-feature', skillName: '功能开发', action: 'Development — 执行开发任务' },
      { agentId: 'milk', agentName: '小白', skillId: 'regression-test', skillName: '回归测试', action: 'Testing — 自动化回归测试' },
      { agentId: 'manager', agentName: '花椒', skillId: 'review-approve', skillName: '审批流程', action: 'Sprint Review — 审核成果决定是否发布' },
    ],
    tags: ['敏捷开发', '迭代交付', '团队协作'],
  },

  // ── 5. GTD (Getting Things Done) ──
  {
    id: 'gtd-daily',
    name: '每日任务管理',
    icon: '📋',
    methodology: 'GTD',
    color: '#FFB74D',
    description: '基于 David Allen 的 GTD（Getting Things Done）方法论，通过收集、整理、组织、回顾、执行五步，实现高效的日常任务管理。',
    scenario: '适用于团队日常任务规划、项目进度管理、个人效率提升等场景',
    steps: [
      { agentId: 'analytics', agentName: '雪', skillId: 'query-dashboard', skillName: '数据查询', action: 'Capture — 收集所有待处理事项和数据' },
      { agentId: 'manager', agentName: '花椒', skillId: 'generate-todo', skillName: '代办清单', action: 'Clarify & Organize — 整理分类生成结构化待办' },
      { agentId: 'manager', agentName: '花椒', skillId: 'assign-task', skillName: '任务分配', action: 'Engage — 将任务分配给对应猫猫执行' },
      { agentId: 'sing', agentName: '咪咪', skillId: 'task-log', skillName: '任务日志', action: 'Reflect — 记录执行情况并生成日志报告' },
    ],
    tags: ['任务管理', '效率提升', '日常运营'],
  },

  // ── 6. Content Marketing Funnel ──
  {
    id: 'content-funnel',
    name: '内容营销漏斗',
    icon: '📣',
    methodology: 'AIDA 模型',
    color: '#F2A5B9',
    description: '基于经典的 AIDA（Attention-Interest-Desire-Action）营销漏斗模型，从吸引注意到促成行动的全链路内容营销流程。',
    scenario: '适用于产品推广、新功能发布、活动营销等需要全链路内容覆盖的场景',
    steps: [
      { agentId: 'analytics', agentName: '雪', skillId: 'trend-analysis', skillName: '趋势分析', action: 'Attention — 分析热点趋势找到吸引点' },
      { agentId: 'writer', agentName: '阿蓝', skillId: 'generate-article', skillName: '文章生成', action: 'Interest — 撰写引发兴趣的深度内容' },
      { agentId: 'image', agentName: 'Pixel', skillId: 'generate-image', skillName: 'AI 绘图', action: 'Desire — 生成精美配图增强吸引力' },
      { agentId: 'email', agentName: '年年', skillId: 'send-email', skillName: '发送邮件', action: 'Action — 发送营销邮件推动用户行动' },
      { agentId: 'sing', agentName: '咪咪', skillId: 'task-log', skillName: '任务日志', action: 'Track — 记录营销效果数据' },
    ],
    tags: ['内容营销', '用户增长', '全链路'],
  },

  // ── 7. Kaizen (持续改善) ──
  {
    id: 'kaizen-perf',
    name: '性能持续优化',
    icon: '📈',
    methodology: 'Kaizen 改善',
    color: '#FF6B6B',
    description: '基于丰田 Kaizen（改善）哲学，通过小步快跑、持续改善的方式优化系统性能。每次只专注一个瓶颈点，循序渐进。',
    scenario: '适用于网站性能优化、接口响应优化、前端加载速度优化等技术场景',
    steps: [
      { agentId: 'analytics', agentName: '雪', skillId: 'query-dashboard', skillName: '数据查询', action: '现状分析 — 查询当前性能数据基线' },
      { agentId: 'text', agentName: '黄金', skillId: 'optimize-perf', skillName: '性能优化', action: '改善执行 — 针对瓶颈进行优化' },
      { agentId: 'milk', agentName: '小白', skillId: 'regression-test', skillName: '回归测试', action: '效果验证 — 回归测试确保无副作用' },
      { agentId: 'sing', agentName: '咪咪', skillId: 'task-log', skillName: '任务日志', action: '标准固化 — 记录优化措施和效果' },
    ],
    tags: ['性能优化', '持续改善', '技术'],
  },

  // ── 8. 6W 报告法 ──
  {
    id: '6w-report',
    name: '数据分析报告',
    icon: '📊',
    methodology: '6W 分析法',
    color: '#7E57C2',
    description: '基于 6W 分析法（Who-What-When-Where-Why-How），系统化地完成从数据采集到可视化报告输出的全流程分析。',
    scenario: '适用于周报/月报生成、业务数据分析、竞品报告、市场调研等场景',
    steps: [
      { agentId: 'analytics', agentName: '雪', skillId: 'crawl-news', skillName: '资讯爬取', action: 'What & Where — 采集多源数据和资讯' },
      { agentId: 'analytics', agentName: '雪', skillId: 'trend-analysis', skillName: '趋势分析', action: 'Why & When — 分析趋势和时序变化' },
      { agentId: 'crafts', agentName: '小虎', skillId: 'generate-chart', skillName: '图表生成', action: 'How — 将分析数据可视化为图表' },
      { agentId: 'writer', agentName: '阿蓝', skillId: 'generate-article', skillName: '文章生成', action: 'Who — 生成面向目标读者的分析报告' },
      { agentId: 'email', agentName: '年年', skillId: 'send-email', skillName: '发送邮件', action: '分发 — 将报告邮件发送给相关人员' },
    ],
    tags: ['数据分析', '报告生成', '可视化'],
  },

  // ── 9. RACI 矩阵 ──
  {
    id: 'raci-team-ops',
    name: '团队能力盘点',
    icon: '👥',
    methodology: 'RACI 矩阵',
    color: '#26A69A',
    description: '基于 RACI（Responsible-Accountable-Consulted-Informed）职责矩阵，全面盘点团队能力分布，识别缺口并制定招募培训计划。',
    scenario: '适用于团队组建初期、季度团队复盘、新项目启动前的能力评估等场景',
    steps: [
      { agentId: 'hr', agentName: '发发', skillId: 'team-review', skillName: '团队盘点', action: 'Responsible — 盘点当前团队能力和角色分布' },
      { agentId: 'manager', agentName: '花椒', skillId: 'generate-todo', skillName: '代办清单', action: 'Accountable — 制定补齐能力缺口的行动计划' },
      { agentId: 'hr', agentName: '发发', skillId: 'recruit-cat', skillName: '招募新猫', action: 'Consulted — 按需招募新猫补充团队' },
      { agentId: 'hr', agentName: '发发', skillId: 'cat-training', skillName: '技能培训', action: 'Informed — 为现有成员制定培训计划' },
    ],
    tags: ['团队管理', '能力评估', '人才发展'],
  },
];
