export interface SkillTemplate {
  id: string
  name: string
  icon: string
  category: SkillCategory
  description: string
  input: string
  output: string
  provider?: string
}

export type SkillCategory = 'content' | 'data' | 'visual' | 'comm' | 'dev' | 'manage'

export const skillCategories: { id: SkillCategory; name: string; icon: string; color: string }[] = [
  { id: 'content', name: '内容创作', icon: '✍️', color: '#FF6B6B' },
  { id: 'data',    name: '数据分析', icon: '📊', color: '#96BAFF' },
  { id: 'visual',  name: '视觉生成', icon: '🎨', color: '#B39DDB' },
  { id: 'comm',    name: '沟通协作', icon: '💬', color: '#F2A5B9' },
  { id: 'dev',     name: '开发运维', icon: '🛠️', color: '#90CAF9' },
  { id: 'manage',  name: '管理调度', icon: '📋', color: '#8DB889' },
]

export const skillPool: SkillTemplate[] = [
  // 内容创作
  { id: 'generate-article',  name: '文章生成',   icon: '📝', category: 'content', description: '根据主题和素材生成完整文章',           input: 'text', output: 'text',  provider: 'Gemini' },
  { id: 'polish-text',       name: '内容润色',   icon: '✨', category: 'content', description: '优化文本表达、调整语气和风格',          input: 'text', output: 'text',  provider: 'Gemini' },
  { id: 'generate-outline',  name: '大纲生成',   icon: '📑', category: 'content', description: '快速生成结构化内容大纲',               input: 'text', output: 'json',  provider: 'Gemini' },
  { id: 'news-to-article',   name: '资讯整理',   icon: '📰', category: 'content', description: '将零散资讯整理为可发布内容',            input: 'json', output: 'text',  provider: 'Gemini' },
  { id: 'meeting-notes',     name: '会议纪要',   icon: '📝', category: 'content', description: '生成结构化会议纪要',                  input: 'text', output: 'text',  provider: 'Gemini' },
  // 数据分析
  { id: 'crawl-news',        name: '资讯爬取',   icon: '🕸️', category: 'data', description: '定时爬取指定网站/RSS 最新资讯',           input: 'url',  output: 'json',  provider: 'Crawler' },
  { id: 'summarize-news',    name: '资讯摘要',   icon: '📰', category: 'data', description: '对爬取内容进行智能摘要和分类',             input: 'json', output: 'text',  provider: 'Gemini' },
  { id: 'query-dashboard',   name: '数据查询',   icon: '🔍', category: 'data', description: '查询数据库获取结构化数据',                input: 'text', output: 'json',  provider: 'PostgreSQL' },
  { id: 'trend-analysis',    name: '趋势分析',   icon: '📈', category: 'data', description: '对时序数据进行趋势分析和异常检测',          input: 'json', output: 'json',  provider: 'Python' },
  // 视觉生成
  { id: 'generate-image',    name: 'AI 绘图',   icon: '🖼️', category: 'visual', description: '根据文字描述生成高质量图片',             input: 'text',  output: 'image', provider: 'Gemini' },
  { id: 'generate-chart',    name: '图表生成',   icon: '📊', category: 'visual', description: '将数据转化为可视化图表',                 input: 'json',  output: 'image', provider: 'Chart.js' },
  { id: 'generate-component',name: '组件生成',   icon: '🧩', category: 'visual', description: '生成 React/HTML 创意组件代码',           input: 'text',  output: 'html',  provider: 'Gemini' },
  { id: 'layout-design',     name: '排版布局',   icon: '📐', category: 'visual', description: '将内容组合排版为精美页面',               input: 'json',  output: 'html',  provider: 'Template' },
  // 沟通协作
  { id: 'send-email',        name: '发送邮件',   icon: '📧', category: 'comm', description: '发送 HTML 格式邮件',                     input: 'text', output: 'email', provider: 'SMTP' },
  { id: 'send-notification', name: '推送通知',   icon: '🔔', category: 'comm', description: '向订阅者批量推送通知',                    input: 'text', output: 'json',  provider: 'WebPush' },
  { id: 'task-log',          name: '任务日志',   icon: '📒', category: 'comm', description: '记录和整理任务执行日志',                   input: 'json', output: 'text',  provider: 'Gemini' },
  // 开发运维
  { id: 'fix-bug',           name: 'Bug 修复',  icon: '🐛', category: 'dev', description: '排查并修复前后端 bug',                    input: 'text', output: 'text', provider: 'Code Analysis' },
  { id: 'develop-feature',   name: '功能开发',   icon: '🛠️', category: 'dev', description: '根据需求开发新功能模块',                   input: 'text', output: 'text', provider: 'Full Stack' },
  { id: 'optimize-perf',     name: '性能优化',   icon: '⚡', category: 'dev', description: '分析并优化性能瓶颈',                      input: 'text', output: 'text', provider: 'Lighthouse' },
  { id: 'quality-check',     name: '质量检测',   icon: '🔎', category: 'dev', description: '对输出内容进行质量评分',                   input: 'json', output: 'json', provider: 'Rules Engine' },
  { id: 'regression-test',   name: '回归测试',   icon: '🧪', category: 'dev', description: '自动化回归测试',                         input: 'url',  output: 'json', provider: 'Puppeteer' },
  // 管理调度
  { id: 'generate-todo',     name: '代办清单',   icon: '📋', category: 'manage', description: '分析需求自动生成代办清单',               input: 'json', output: 'json', provider: 'Gemini' },
  { id: 'assign-task',       name: '任务分配',   icon: '📌', category: 'manage', description: '将任务拆解并分配给指定猫猫',              input: 'text', output: 'json', provider: 'TaskQueue' },
  { id: 'review-approve',    name: '审批流程',   icon: '✅', category: 'manage', description: '审核工作成果决定是否发布',               input: 'json', output: 'json', provider: 'Workflow' },
  { id: 'manage-workflow',   name: '工作流管理', icon: '🔧', category: 'manage', description: '新增、修改或删除协作工作流',              input: 'json', output: 'json', provider: 'Workflow' },
  { id: 'recruit-cat',       name: '招募新猫',   icon: '🐱', category: 'manage', description: '招募新猫并定义角色与技能',               input: 'json', output: 'json', provider: 'Gemini' },
  { id: 'team-review',       name: '团队盘点',   icon: '👥', category: 'manage', description: '盘点团队能力分布和缺口',                input: 'none', output: 'json', provider: 'Gemini' },
]

// ────────────────────────────────────────────────────────────
// 技能组（快速装配一组技能）
// ────────────────────────────────────────────────────────────

export interface SkillGroup {
  id: string
  name: string
  icon: string
  color: string
  description: string
  skillIds: string[]   // 引用 skillPool 中的 id
  catId?: string       // 对应的官方猫猫 id
}

export const skillGroups: SkillGroup[] = [
  {
    id: 'manager',
    name: '管理者',
    icon: '👔',
    color: '#8DB889',
    description: '代办清单、任务分配、审批流程、工作流管理等全局管理能力',
    skillIds: ['generate-todo', 'assign-task', 'review-approve', 'manage-workflow'],
    catId: 'manager',
  },
  {
    id: 'writer',
    name: '写手',
    icon: '✍️',
    color: '#FF6B6B',
    description: '文章撰写、内容润色、大纲规划、资讯整理等创作能力',
    skillIds: ['generate-article', 'polish-text', 'generate-outline', 'news-to-article'],
    catId: 'writer',
  },
  {
    id: 'analyst',
    name: '分析师',
    icon: '📊',
    color: '#96BAFF',
    description: '资讯爬取、资讯摘要、数据查询、趋势分析等数据能力',
    skillIds: ['crawl-news', 'summarize-news', 'query-dashboard', 'trend-analysis'],
    catId: 'analytics',
  },
  {
    id: 'messenger',
    name: '信使',
    icon: '📮',
    color: '#F2A5B9',
    description: '邮件发送、推送通知等消息沟通能力',
    skillIds: ['send-email', 'send-notification'],
    catId: 'email',
  },
  {
    id: 'builder',
    name: '工匠',
    icon: '🧱',
    color: '#FFB74D',
    description: '组件生成、排版布局、页面搭建等前端构建能力',
    skillIds: ['generate-component', 'layout-design'],
    catId: 'crafts',
  },
  {
    id: 'designer',
    name: '画师',
    icon: '🎨',
    color: '#B39DDB',
    description: 'AI 绘图、图表生成等视觉创作能力',
    skillIds: ['generate-image', 'generate-chart'],
    catId: 'image',
  },
  {
    id: 'programmer',
    name: '程序员',
    icon: '💻',
    color: '#90CAF9',
    description: 'Bug 修复、功能开发、性能优化等全栈开发能力',
    skillIds: ['fix-bug', 'develop-feature', 'optimize-perf'],
    catId: 'text',
  },
  {
    id: 'recorder',
    name: '记录员',
    icon: '📒',
    color: '#CE93D8',
    description: '任务日志、会议纪要等信息记录整理能力',
    skillIds: ['task-log', 'meeting-notes'],
    catId: 'sing',
  },
  {
    id: 'qa',
    name: '质检员',
    icon: '🔎',
    color: '#80CBC4',
    description: '质量检测、回归测试等质量保障能力',
    skillIds: ['quality-check', 'regression-test'],
    catId: 'milk',
  },
  {
    id: 'hr',
    name: '人事官',
    icon: '👥',
    color: '#A5D6A7',
    description: '招募新猫、团队盘点等人才管理能力',
    skillIds: ['recruit-cat', 'team-review'],
    catId: 'hr',
  },
]