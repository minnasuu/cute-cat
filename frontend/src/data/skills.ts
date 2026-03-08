import type { PrimitiveId, SkillPrimitive } from './types'

// ────────────────────────────────────────────────────────────
// 技能原型定义（底层能力引擎，不对用户暴露）
// ────────────────────────────────────────────────────────────

export const skillPrimitives: SkillPrimitive[] = [
  { id: 'text-to-text',      name: 'AI 文生文',   description: '文本输入 → LLM 处理 → 文本输出',           input: 'text', output: 'text',  provider: 'Gemini / Dify' },
  { id: 'text-to-image',     name: 'AI 文生图',   description: '文本描述 → 图片生成模型 → 图片',            input: 'text', output: 'image', provider: 'Gemini' },
  { id: 'structured-output', name: '结构化输出',   description: '文本输入 → LLM 结构化输出 → JSON',          input: 'text', output: 'json',  provider: 'Gemini / Dify' },
  { id: 'api-call',          name: '外部 API',    description: '调用外部 REST API / RSS / Webhook',        input: 'url',  output: 'json',  provider: 'HTTP Client' },
  { id: 'db-query',          name: '数据库查询',   description: '查询 PostgreSQL 返回结构化数据',            input: 'text', output: 'json',  provider: 'PostgreSQL' },
  { id: 'email-send',        name: '邮件发送',    description: '通过 SMTP 发送 HTML 邮件',                 input: 'text', output: 'email', provider: 'SMTP' },
  { id: 'web-push',          name: '推送通知',    description: '通过 Web Push API 发送浏览器通知',          input: 'text', output: 'json',  provider: 'Web Push' },
  { id: 'html-render',       name: 'HTML 渲染',   description: '将数据注入模板，输出 HTML 片段',            input: 'json', output: 'html',  provider: 'Template Engine' },
  { id: 'chart-render',      name: '图表渲染',    description: '将 JSON 数据渲染为可视化图表',              input: 'json', output: 'image', provider: 'Chart.js' },
  { id: 'browser-action',    name: '浏览器操作',   description: '通过 Puppeteer 执行浏览器自动化',           input: 'url',  output: 'json',  provider: 'Puppeteer' },
  { id: 'file-io',           name: '文件读写',    description: '读写服务端文件系统',                       input: 'text', output: 'file',  provider: 'Node.js FS' },
  { id: 'workflow-engine',   name: '工作流引擎',   description: '触发、管理、查询工作流',                    input: 'json', output: 'json',  provider: 'Workflow Engine' },
]

/** 根据原型 ID 获取原型定义 */
export function getPrimitive(id: PrimitiveId): SkillPrimitive | undefined {
  return skillPrimitives.find(p => p.id === id)
}

// ────────────────────────────────────────────────────────────
// 技能定义（用户可见，每个技能基于某个原型封装）
// ────────────────────────────────────────────────────────────

export interface SkillTemplate {
  id: string
  name: string
  icon: string
  category: SkillCategory
  description: string
  input: string
  output: string
  /** 该技能底层调用的原型 */
  primitiveId: PrimitiveId
  provider?: string
}

export type SkillCategory = 'content' | 'data' | 'visual' | 'comm' | 'dev' | 'manage'

export const skillCategories: { id: SkillCategory; name: string; icon: string; color: string }[] = [
  { id: 'content', name: '内容创作', icon: '✍️', color: '#FF6B6B' },
  { id: 'data',    name: '数据分析', icon: '📊', color: '#96BAFF' },
  { id: 'visual',  name: '视觉设计', icon: '🎨', color: '#B39DDB' },
  { id: 'comm',    name: '沟通运营', icon: '💬', color: '#F2A5B9' },
  { id: 'dev',     name: '开发运维', icon: '🛠️', color: '#90CAF9' },
  { id: 'manage',  name: '项目管理', icon: '📋', color: '#8DB889' },
]

export const skillPool: SkillTemplate[] = [
  // ── 内容创作（基于 text-to-text / structured-output 原型）──
  { id: 'generate-article',  name: '文章生成',   icon: '📝', category: 'content', description: '根据主题和素材生成完整文章',           input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Gemini' },
  { id: 'polish-text',       name: '内容润色',   icon: '✨', category: 'content', description: '优化文本表达、调整语气和风格',          input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Gemini' },
  { id: 'generate-outline',  name: '大纲生成',   icon: '📑', category: 'content', description: '快速生成结构化内容大纲',               input: 'text', output: 'json',  primitiveId: 'structured-output', provider: 'Gemini' },
  { id: 'news-to-article',   name: '资讯整理',   icon: '📰', category: 'content', description: '将零散资讯整理为可发布内容',            input: 'json', output: 'text',  primitiveId: 'text-to-text',      provider: 'Gemini' },
  { id: 'meeting-notes',     name: '会议纪要',   icon: '📋', category: 'content', description: '生成结构化会议纪要',                  input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Dify' },

  // ── 数据分析（基于 api-call / db-query / structured-output 原型）──
  { id: 'crawl-news',        name: '资讯爬取',   icon: '🕸️', category: 'data', description: '定时爬取指定网站/RSS 最新资讯',           input: 'url',  output: 'json',  primitiveId: 'api-call',          provider: 'Crawler' },
  { id: 'summarize-news',    name: '资讯摘要',   icon: '📰', category: 'data', description: '对爬取内容进行智能摘要和分类',             input: 'json', output: 'text',  primitiveId: 'text-to-text',      provider: 'Gemini' },
  { id: 'query-dashboard',   name: '数据查询',   icon: '🔍', category: 'data', description: '查询数据库获取结构化数据',                input: 'text', output: 'json',  primitiveId: 'db-query',          provider: 'PostgreSQL' },
  { id: 'trend-analysis',    name: '趋势分析',   icon: '📈', category: 'data', description: '对时序数据进行趋势分析和异常检测',          input: 'json', output: 'json',  primitiveId: 'structured-output', provider: 'Gemini' },
  { id: 'site-analyze',      name: '网站诊断',   icon: '🔬', category: 'data', description: '分析网站内容分布和质量，给出优化建议',       input: 'none', output: 'json',  primitiveId: 'text-to-text',      provider: 'Dify' },

  // ── 视觉设计（基于 text-to-image / chart-render / html-render 原型）──
  { id: 'generate-image',    name: 'AI 绘图',   icon: '🖼️', category: 'visual', description: '根据文字描述生成高质量图片',             input: 'text',  output: 'image', primitiveId: 'text-to-image',     provider: 'Gemini' },
  { id: 'generate-chart',    name: '图表生成',   icon: '📊', category: 'visual', description: '将数据转化为可视化图表',                 input: 'json',  output: 'image', primitiveId: 'chart-render',      provider: 'Chart.js' },
  { id: 'generate-component',name: '组件生成',   icon: '🧩', category: 'visual', description: '生成 React/HTML 创意组件代码',           input: 'text',  output: 'html',  primitiveId: 'html-render',       provider: 'Gemini' },
  { id: 'layout-design',     name: '排版布局',   icon: '📐', category: 'visual', description: '将内容组合排版为精美页面',               input: 'json',  output: 'html',  primitiveId: 'html-render',       provider: 'Template' },
  { id: 'image-enhance',     name: '图片增强',   icon: '🔆', category: 'visual', description: '对图片进行超分辨率放大和降噪',            input: 'image', output: 'image', primitiveId: 'api-call',          provider: 'Real-ESRGAN' },
  { id: 'css-generate',      name: '样式生成',   icon: '🎨', category: 'visual', description: '为组件生成匹配的 CSS/动画代码',          input: 'text',  output: 'text',  primitiveId: 'text-to-text',      provider: 'Gemini' },
  { id: 'update-crafts',     name: 'Crafts 更新', icon: '🔄', category: 'visual', description: '为 Crafts 页面新增交互 demo',       input: 'json', output: 'html', primitiveId: 'html-render',       provider: 'Gemini' },

  // ── 沟通运营（基于 email-send / web-push / db-query 原型）──
  { id: 'send-email',        name: '发送邮件',   icon: '📧', category: 'comm', description: '发送 HTML 格式邮件',                     input: 'text', output: 'email', primitiveId: 'email-send',        provider: 'SMTP' },
  { id: 'send-notification', name: '推送通知',   icon: '🔔', category: 'comm', description: '向订阅者批量推送通知',                    input: 'text', output: 'json',  primitiveId: 'email-send',        provider: 'SMTP' },
  { id: 'task-log',          name: '任务日志',   icon: '📒', category: 'comm', description: '记录和整理任务执行日志',                   input: 'json', output: 'text',  primitiveId: 'db-query',          provider: 'PostgreSQL' },

  // ── 开发运维（基于 text-to-text / structured-output / browser-action 原型）──
  { id: 'fix-bug',           name: 'Bug 修复',  icon: '🐛', category: 'dev', description: '排查并修复前后端 bug',                    input: 'text', output: 'text', primitiveId: 'text-to-text',      provider: 'Code Analysis' },
  { id: 'develop-feature',   name: '功能开发',   icon: '🛠️', category: 'dev', description: '根据需求开发新功能模块',                   input: 'text', output: 'text', primitiveId: 'text-to-text',      provider: 'Full Stack' },
  { id: 'optimize-perf',     name: '性能优化',   icon: '⚡', category: 'dev', description: '分析并优化性能瓶颈',                      input: 'text', output: 'text', primitiveId: 'text-to-text',      provider: 'Lighthouse' },
  { id: 'quality-check',     name: '质量检测',   icon: '🔎', category: 'dev', description: '对输出内容进行质量评分',                   input: 'json', output: 'json', primitiveId: 'structured-output', provider: 'Rules Engine' },
  { id: 'content-review',    name: '内容审核',   icon: '🛡️', category: 'dev', description: '检查内容是否合规、无敏感信息',              input: 'text', output: 'json', primitiveId: 'structured-output', provider: 'Moderation' },
  { id: 'regression-test',   name: '回归测试',   icon: '🧪', category: 'dev', description: '自动化回归测试',                         input: 'url',  output: 'json', primitiveId: 'browser-action',    provider: 'Puppeteer' },

  // ── 项目管理（基于 structured-output / workflow-engine 原型）──
  { id: 'generate-todo',     name: '代办清单',   icon: '📋', category: 'manage', description: '分析需求自动生成代办清单',               input: 'json', output: 'json', primitiveId: 'structured-output', provider: 'Dify' },
  { id: 'assign-task',       name: '任务分配',   icon: '📌', category: 'manage', description: '将任务拆解并分配给指定猫猫',              input: 'text', output: 'json', primitiveId: 'structured-output', provider: 'Dify' },
  { id: 'review-approve',    name: '审批流程',   icon: '✅', category: 'manage', description: '审核工作成果决定是否发布',               input: 'json', output: 'json', primitiveId: 'workflow-engine',   provider: 'Workflow' },
  { id: 'manage-workflow',   name: '工作流管理', icon: '🔧', category: 'manage', description: '新增、修改或删除协作工作流',              input: 'json', output: 'json', primitiveId: 'workflow-engine',   provider: 'Workflow' },
  { id: 'run-workflow',      name: '执行工作流', icon: '▶️', category: 'manage', description: '触发指定工作流开始执行',                input: 'json', output: 'json', primitiveId: 'workflow-engine',   provider: 'Workflow' },
  { id: 'recruit-cat',       name: '招募新猫',   icon: '🐱', category: 'manage', description: '招募新猫并定义角色与技能',               input: 'json', output: 'json', primitiveId: 'structured-output', provider: 'Gemini' },
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
    id: 'pm',
    name: '项目经理',
    icon: '👔',
    color: '#8DB889',
    description: '任务规划、分配、审批、工作流管理、团队扩编等全局管理能力',
    skillIds: ['generate-todo', 'assign-task', 'review-approve', 'manage-workflow', 'run-workflow', 'recruit-cat'],
    catId: 'manager',
  },
  {
    id: 'editor',
    name: '内容编辑',
    icon: '✍️',
    color: '#FF6B6B',
    description: '文章撰写、内容润色、大纲规划、资讯整理、会议纪要等文字创作能力',
    skillIds: ['generate-article', 'polish-text', 'generate-outline', 'news-to-article', 'meeting-notes'],
    catId: 'writer',
  },
  {
    id: 'analyst',
    name: '数据分析师',
    icon: '📊',
    color: '#96BAFF',
    description: '资讯爬取、资讯摘要、数据查询、趋势分析、网站诊断等数据洞察能力',
    skillIds: ['crawl-news', 'summarize-news', 'query-dashboard', 'trend-analysis', 'site-analyze'],
    catId: 'analyst',
  },
  {
    id: 'designer',
    name: '视觉设计师',
    icon: '🎨',
    color: '#B39DDB',
    description: 'AI 绘图、图表生成、组件设计、排版布局、图片增强、样式生成等视觉创作能力',
    skillIds: ['generate-image', 'generate-chart', 'generate-component', 'layout-design', 'image-enhance', 'css-generate'],
    catId: 'designer',
  },
  {
    id: 'qa',
    name: '质量审核员',
    icon: '🔎',
    color: '#80CBC4',
    description: '质量检测、内容审核、回归测试等质量保障能力',
    skillIds: ['quality-check', 'content-review', 'regression-test'],
    catId: 'reviewer',
  },
  {
    id: 'ops',
    name: '运营助理',
    icon: '📮',
    color: '#F2A5B9',
    description: '邮件发送、消息推送、任务日志等沟通运营能力',
    skillIds: ['send-email', 'send-notification', 'task-log'],
    catId: 'ops',
  },
  {
    id: 'engineer',
    name: '开发工程师',
    icon: '💻',
    color: '#90CAF9',
    description: 'Bug 修复、功能开发、性能优化、Crafts 更新等全栈开发能力',
    skillIds: ['fix-bug', 'develop-feature', 'optimize-perf', 'update-crafts'],
    catId: 'engineer',
  },
]
