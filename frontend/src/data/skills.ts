import type { PrimitiveId, SkillPrimitive, StepParam } from './types'

// ────────────────────────────────────────────────────────────
// 技能原型定义（底层能力引擎，不对用户暴露）
// ────────────────────────────────────────────────────────────

export const skillPrimitives: SkillPrimitive[] = [
  { id: 'text-to-text',      name: 'AI 文生文',    description: '文本输入 → LLM 处理 → 文本输出',            input: 'text',  output: 'text',  provider: 'Qwen' },
  { id: 'text-to-image',     name: 'AI 文生图',    description: '文本描述 → 图片生成模型 → 图片',             input: 'text',  output: 'image', provider: 'Qwen' },
  { id: 'structured-output', name: '结构化输出',   description: '文本输入 → LLM 处理 → JSON 结构化数据',      input: 'text',  output: 'json',  provider: 'Qwen' },
  { id: 'api-call',          name: 'API 调用',     description: 'HTTP 请求外部 API 并返回结果',              input: 'json',  output: 'json',  provider: 'HTTP' },
  { id: 'db-query',          name: '数据库查询',   description: '执行 SQL 查询并返回结果集',                  input: 'text',  output: 'json',  provider: 'PostgreSQL' },
  { id: 'email-send',        name: '邮件发送',     description: '通过 SMTP 发送 HTML 邮件',                  input: 'text',  output: 'email', provider: 'SMTP' },
  { id: 'web-push',          name: 'Web 推送',     description: '向浏览器订阅端点发送推送通知',                input: 'json',  output: 'json',  provider: 'Web Push' },
  { id: 'html-render',       name: 'HTML 渲染',    description: '生成 HTML/React 组件并渲染预览',             input: 'text',  output: 'html',  provider: 'Renderer' },
  { id: 'chart-render',      name: '图表渲染',     description: 'JSON 数据 → Chart.js 可视化图表',            input: 'json',  output: 'image', provider: 'Chart.js' },
  { id: 'browser-action',    name: '浏览器操作',   description: 'Puppeteer 自动化浏览器交互与截图',            input: 'url',   output: 'json',  provider: 'Puppeteer' },
  { id: 'file-io',           name: '文件读写',     description: '读取或写入本地文件系统',                     input: 'text',  output: 'file',  provider: 'Node' },
  { id: 'workflow-engine',   name: '工作流引擎',   description: '编排并执行多步骤协作工作流',                  input: 'json',  output: 'json',  provider: 'Workflow' },
  { id: 'js-execute',        name: 'JS 执行',      description: '执行 JavaScript 代码',                     input: 'text',  output: 'text',  provider: 'Node' },
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
  category: SkillCategory
  description: string
  input: string
  output: string
  /** 该技能底层调用的原型 */
  primitiveId: PrimitiveId
  provider?: string
  /** 该技能需要用户配置的参数定义（如收件邮箱、API 地址等） */
  paramDefs?: StepParam[]
  /** 是否仅管理员可见 */
  adminOnly?: boolean
  /** 是否禁用（当前无法基于 primitives 实现） */
  disabled?: boolean
  /** 禁用原因说明 */
  disabledReason?: string
}

export type SkillCategory = 'content' | 'data' | 'visual' | 'comm' | 'dev' | 'manage'

export const skillCategories: { id: SkillCategory; name: string; color: string }[] = [
  { id: 'content', name: '内容创作', color: '#FF6B6B' },
  { id: 'data',    name: '数据分析', color: '#96BAFF' },
  { id: 'visual',  name: '视觉设计', color: '#B39DDB' },
  { id: 'comm',    name: '沟通运营', color: '#F2A5B9' },
  { id: 'dev',     name: '开发运维', color: '#90CAF9' },
  { id: 'manage',  name: '项目管理', color: '#8DB889' },
]

export const skillPool: SkillTemplate[] = [
  // ── 原型技能（默认猫猫 CAT 专属，id 直接使用 primitiveId，与 primitives handler 对齐）──
  { id: 'ai-chat',            name: 'AI 对话',     category: 'content', description: '通用 AI 文生文，可处理总结、分析、翻译、改写等文本任务',    input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Dify' },
  { id: 'text-to-image',      name: 'AI 文生图',   category: 'visual',  description: '文本描述 → 图片生成模型 → 图片',                      input: 'text', output: 'image', primitiveId: 'text-to-image',     provider: 'Qwen' },
  { id: 'structured-output',  name: '结构化输出',   category: 'data',    description: '文本输入 → LLM 处理 → JSON 结构化数据',               input: 'text', output: 'json',  primitiveId: 'structured-output', provider: 'Qwen' },
  { id: 'api-call',           name: 'API 调用',    category: 'dev',     description: 'HTTP 请求外部 API 并返回结果',                        input: 'json', output: 'json',  primitiveId: 'api-call',          provider: 'HTTP' },
  { id: 'db-query',           name: '数据库查询',   category: 'data',    description: '执行 SQL 查询并返回结果集',                           input: 'text', output: 'json',  primitiveId: 'db-query',          provider: 'PostgreSQL' },
  { id: 'email-send',         name: '邮件发送',    category: 'comm',    description: '通过 SMTP 发送 HTML 邮件',                            input: 'text', output: 'email', primitiveId: 'email-send',        provider: 'SMTP' },
  { id: 'web-push',           name: 'Web 推送',    category: 'comm',    description: '向浏览器订阅端点发送推送通知',                          input: 'json', output: 'json',  primitiveId: 'web-push',          provider: 'Web Push' },
  { id: 'html-render',        name: 'HTML 渲染',   category: 'visual',  description: '生成 HTML/React 组件并渲染预览',                       input: 'text', output: 'html',  primitiveId: 'html-render',       provider: 'Renderer' },
  { id: 'chart-render',       name: '图表渲染',    category: 'visual',  description: 'JSON 数据 → Chart.js 可视化图表',                      input: 'json', output: 'image', primitiveId: 'chart-render',      provider: 'Chart.js' },
  { id: 'browser-action',     name: '浏览器操作',   category: 'dev',     description: 'Puppeteer 自动化浏览器交互与截图',                      input: 'url',  output: 'json',  primitiveId: 'browser-action',    provider: 'Puppeteer' },
  { id: 'file-io',            name: '文件读写',    category: 'dev',     description: '读取或写入本地文件系统',                               input: 'text', output: 'file',  primitiveId: 'file-io',           provider: 'Node' },
  { id: 'workflow-engine',    name: '工作流引擎',   category: 'manage',  description: '编排并执行多步骤协作工作流',                            input: 'json', output: 'json',  primitiveId: 'workflow-engine',   provider: 'Workflow' },
  { id: 'js-execute',         name: 'JS 执行',     category: 'dev',     description: '执行 JavaScript 代码',                               input: 'text', output: 'text',  primitiveId: 'js-execute',        provider: 'Node' },

  // ── 内容创作（基于 text-to-text / structured-output 原型）──
  { id: 'generate-article',  name: '文章生成',   category: 'content', description: '根据主题和素材生成完整文章',           input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Qwen',
    paramDefs: [
      { key: 'topic', label: '文章主题', type: 'text', placeholder: '输入文章主题或关键词', required: true },
      { key: 'style', label: '写作风格', type: 'select', options: [{ label: '专业严谨', value: 'formal' }, { label: '轻松活泼', value: 'casual' }, { label: '技术教程', value: 'tutorial' }] },
      { key: 'wordCount', label: '目标字数', type: 'number', defaultValue: 1500, placeholder: '如 1500' },
    ],
  },
  { id: 'polish-text',       name: '内容润色',   category: 'content', description: '优化文本表达、调整语气和风格',          input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Qwen',
    paramDefs: [
      { key: 'tone', label: '目标语气', type: 'select', options: [{ label: '正式', value: 'formal' }, { label: '友好', value: 'friendly' }, { label: '幽默', value: 'humorous' }] },
    ],
  },
  { id: 'generate-outline',  name: '大纲生成',   category: 'content', description: '快速生成结构化内容大纲',               input: 'text', output: 'json',  primitiveId: 'structured-output', provider: 'Qwen' },
  { id: 'news-to-article',   name: '资讯整理',   category: 'content', description: '将零散资讯整理为可发布内容',            input: 'json', output: 'text',  primitiveId: 'text-to-text',      provider: 'Qwen' },
  { id: 'meeting-notes',     name: '会议纪要',   category: 'content', description: '生成结构化会议纪要',                  input: 'text', output: 'text',  primitiveId: 'text-to-text',      provider: 'Dify',
    paramDefs: [
      { key: 'participants', label: '参会人员', type: 'tags', placeholder: '输入姓名后回车' },
      { key: 'meetingDate', label: '会议日期', type: 'text', placeholder: '如 2026-03-08' },
    ],
  },

  // ── 数据分析（基于 api-call / db-query / structured-output 原型）──
  { id: 'crawl-news',        name: '资讯爬取',   category: 'data', description: '定时爬取指定网站/RSS 最新资讯',           input: 'url',  output: 'json',  primitiveId: 'api-call',          provider: 'Crawler',
    paramDefs: [
      { key: 'sources', label: 'RSS / API 源', type: 'tags', placeholder: '输入 URL 后回车添加', required: true },
      { key: 'keyword', label: '关键词过滤', type: 'text', placeholder: '可选，如 AI、前端' },
      { key: 'maxItems', label: '最大条数', type: 'number', defaultValue: 20 },
    ],
  },
  { id: 'summarize-news',    name: '资讯摘要',   category: 'data', description: '对爬取内容进行智能摘要和分类',             input: 'json', output: 'text',  primitiveId: 'text-to-text',      provider: 'Qwen' },
  { id: 'query-dashboard',   name: '数据查询',   category: 'data', description: '查询数据库获取结构化数据',                input: 'text', output: 'json',  primitiveId: 'db-query',          provider: 'PostgreSQL',
    paramDefs: [
      { key: 'query', label: '查询语句', type: 'textarea', placeholder: '输入 SQL 或自然语言查询', required: true },
      { key: 'dbName', label: '数据库名称', type: 'text', placeholder: '如 analytics' },
    ],
  },
  { id: 'trend-analysis',    name: '趋势分析',   category: 'data', description: '对时序数据进行趋势分析和异常检测',          input: 'json', output: 'json',  primitiveId: 'structured-output', provider: 'Qwen' },
  { id: 'site-analyze',      name: '网站诊断',   category: 'data', description: '分析网站内容分布和质量，给出优化建议',       input: 'none', output: 'json',  primitiveId: 'text-to-text',      provider: 'Dify',
    paramDefs: [
      { key: 'siteUrl', label: '网站地址', type: 'url', placeholder: 'https://example.com', required: true },
    ],
  },

  // ── 视觉设计（基于 text-to-image / chart-render / html-render 原型）──
  { id: 'generate-image',    name: 'AI 绘图',   category: 'visual', description: '根据文字描述生成高质量图片',             input: 'text',  output: 'image', primitiveId: 'text-to-image',     provider: 'Qwen',
    paramDefs: [
      { key: 'prompt', label: '图片描述', type: 'textarea', placeholder: '描述你想生成的图片内容', required: true },
      { key: 'aspectRatio', label: '宽高比', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }], defaultValue: '1:1' },
    ],
  },
  { id: 'generate-chart',    name: '图表生成',   category: 'visual', description: '将数据转化为可视化图表',                 input: 'json',  output: 'image', primitiveId: 'chart-render',      provider: 'Chart.js',
    paramDefs: [
      { key: 'chartType', label: '图表类型', type: 'select', options: [{ label: '折线图', value: 'line' }, { label: '柱状图', value: 'bar' }, { label: '饼图', value: 'pie' }, { label: '雷达图', value: 'radar' }], required: true },
    ],
  },
  { id: 'generate-component',name: '组件生成',   category: 'visual', description: '生成 React/HTML 创意组件代码',           input: 'text',  output: 'html',  primitiveId: 'html-render',       provider: 'Qwen',
    paramDefs: [
      { key: 'framework', label: '框架', type: 'select', options: [{ label: 'React', value: 'react' }, { label: 'HTML', value: 'html' }, { label: 'Vue', value: 'vue' }], defaultValue: 'react' },
    ],
  },
  { id: 'layout-design',     name: '排版布局',   category: 'visual', description: '将内容组合排版为精美页面',               input: 'json',  output: 'html',  primitiveId: 'html-render',       provider: 'Template' },
  { id: 'image-enhance',     name: '图片增强',   category: 'visual', description: '对图片进行超分辨率放大和降噪',            input: 'image', output: 'image', primitiveId: 'api-call',          provider: 'Real-ESRGAN',
    disabled: true, disabledReason: '需要 Real-ESRGAN 超分辨率 API 服务，当前未配置服务端点',
    paramDefs: [
      { key: 'scale', label: '放大倍数', type: 'select', options: [{ label: '2x', value: '2' }, { label: '4x', value: '4' }], defaultValue: '2' },
    ],
  },
  { id: 'css-generate',      name: '样式生成',   category: 'visual', description: '为组件生成匹配的 CSS/动画代码',          input: 'text',  output: 'text',  primitiveId: 'text-to-text',      provider: 'Qwen' },
  { id: 'update-crafts',     name: 'Crafts 更新', category: 'visual', description: '为 Crafts 页面新增交互 demo',       input: 'json', output: 'html', primitiveId: 'html-render',       provider: 'Qwen',
    paramDefs: [
      { key: 'craftName', label: 'Craft 名称', type: 'text', placeholder: '新 demo 的名称', required: true },
      { key: 'craftDesc', label: '效果描述', type: 'textarea', placeholder: '描述想要的交互效果' },
    ],
  },

  // ── 沟通运营（基于 email-send / web-push / db-query 原型）──
  { id: 'send-email',        name: '发送邮件',   category: 'comm', description: '发送 HTML 格式邮件',                     input: 'text', output: 'email', primitiveId: 'email-send',        provider: 'SMTP',
    paramDefs: [
      { key: 'to', label: '收件邮箱', type: 'text', placeholder: 'user@example.com', required: true, description: '不填则使用用户注册邮箱' },
      { key: 'subject', label: '邮件主题', type: 'text', placeholder: '邮件标题' },
      { key: 'cc', label: '抄送', type: 'tags', placeholder: '输入邮箱后回车添加' },
    ],
  },
  { id: 'send-notification', name: '推送通知',   category: 'comm', description: '向订阅者批量推送通知',                    input: 'text', output: 'json',  primitiveId: 'email-send',        provider: 'SMTP',
    paramDefs: [
      { key: 'recipients', label: '接收人列表', type: 'tags', placeholder: '输入邮箱后回车', required: true },
      { key: 'urgency', label: '紧急程度', type: 'select', options: [{ label: '普通', value: 'normal' }, { label: '重要', value: 'important' }, { label: '紧急', value: 'urgent' }], defaultValue: 'normal' },
    ],
  },
  { id: 'task-log',          name: '任务日志',   category: 'comm', description: '记录和整理任务执行日志',                   input: 'json', output: 'text',  primitiveId: 'db-query',          provider: 'PostgreSQL' },

  // ── 开发运维（基于 text-to-text / structured-output / browser-action 原型）──
  { id: 'fix-bug',           name: 'Bug 修复',  category: 'dev', description: '排查并修复前后端 bug',                    input: 'text', output: 'text', primitiveId: 'text-to-text',      provider: 'Code Analysis',
    disabled: true, disabledReason: '需要完整代码仓库访问与分析能力，单一 text-to-text 原型无法实现真正的 Bug 修复',
    paramDefs: [
      { key: 'repo', label: '仓库地址', type: 'url', placeholder: 'https://github.com/...' },
      { key: 'bugDesc', label: 'Bug 描述', type: 'textarea', placeholder: '详细描述 bug 现象和复现步骤', required: true },
    ],
  },
  { id: 'develop-feature',   name: '功能开发',   category: 'dev', description: '根据需求开发新功能模块',                   input: 'text', output: 'text', primitiveId: 'text-to-text',      provider: 'Full Stack',
    disabled: true, disabledReason: '需要完整全栈开发环境与多文件编排能力，单一原型无法实现端到端功能开发',
    paramDefs: [
      { key: 'requirement', label: '需求描述', type: 'textarea', placeholder: '详细描述功能需求', required: true },
      { key: 'techStack', label: '技术栈', type: 'tags', placeholder: '如 React, Node.js' },
    ],
  },
  { id: 'optimize-perf',     name: '性能优化',   category: 'dev', description: '分析并优化性能瓶颈',                      input: 'text', output: 'text', primitiveId: 'text-to-text',      provider: 'Lighthouse',
    disabled: true, disabledReason: '需要 Lighthouse 性能分析服务集成，当前后端未部署该能力',
    paramDefs: [
      { key: 'targetUrl', label: '目标页面', type: 'url', placeholder: 'https://...', required: true },
    ],
  },
  { id: 'quality-check',     name: '质量检测',   category: 'dev', description: '对输出内容进行质量评分',                   input: 'json', output: 'json', primitiveId: 'structured-output', provider: 'Rules Engine' },
  { id: 'content-review',    name: '内容审核',   category: 'dev', description: '检查内容是否合规、无敏感信息',              input: 'text', output: 'json', primitiveId: 'structured-output', provider: 'Moderation' },
  { id: 'regression-test',   name: '回归测试',   category: 'dev', description: '自动化回归测试',                         input: 'url',  output: 'json', primitiveId: 'browser-action',    provider: 'Puppeteer',
    paramDefs: [
      { key: 'testUrl', label: '测试地址', type: 'url', placeholder: 'https://...', required: true },
      { key: 'testCases', label: '测试用例', type: 'textarea', placeholder: '描述需要验证的功能点' },
    ],
  },

  // ── 项目管理（基于 structured-output / workflow-engine 原型）──
  { id: 'generate-todo',     name: '代办清单',   category: 'manage', description: '分析需求自动生成代办清单',               input: 'json', output: 'json', primitiveId: 'structured-output', provider: 'Dify' },
  { id: 'assign-task',       name: '任务分配',   category: 'manage', description: '将任务拆解并分配给指定猫猫',              input: 'text', output: 'json', primitiveId: 'structured-output', provider: 'Dify' },
  { id: 'review-approve',    name: '审批流程',   category: 'manage', description: '审核工作成果决定是否发布',               input: 'json', output: 'json', primitiveId: 'workflow-engine',   provider: 'Workflow',
    paramDefs: [
      { key: 'approvers', label: '审批人', type: 'tags', placeholder: '输入审批人后回车', required: true },
      { key: 'autoApprove', label: '自动审批（质量评分达标时）', type: 'toggle', defaultValue: false },
    ],
  },
  { id: 'manage-workflow',   name: '工作流管理', category: 'manage', description: '新增、修改或删除协作工作流',              input: 'json', output: 'json', primitiveId: 'workflow-engine',   provider: 'Workflow' },
  { id: 'run-workflow',      name: '执行工作流',category: 'manage', description: '触发指定工作流开始执行',                input: 'json', output: 'json', primitiveId: 'workflow-engine',   provider: 'Workflow' },
  { id: 'recruit-cat',       name: '招募新猫',   category: 'manage', description: '招募新猫并定义角色与技能',               input: 'json', output: 'json', primitiveId: 'structured-output', provider: 'Qwen',
    paramDefs: [
      { key: 'role', label: '期望角色', type: 'select', options: [{ label: 'Content Editor', value: 'Content Editor' }, { label: 'Data Analyst', value: 'Data Analyst' }, { label: 'Visual Designer', value: 'Visual Designer' }, { label: 'Engineer', value: 'Engineer' }, { label: 'QA Reviewer', value: 'QA Reviewer' }, { label: 'Operations Assistant', value: 'Operations Assistant' }], required: true },
      { key: 'catName', label: '猫猫名字', type: 'text', placeholder: '给新猫猫起个名字' },
    ],
  },

  // ── 管理员私有技能（adminOnly）──
  { id: 'view-articles',      name: '查看文章',   category: 'data',   description: '查看所有文章列表或单篇文章详情',           input: 'text', output: 'json', primitiveId: 'api-call',          provider: 'REST API', adminOnly: true,
    paramDefs: [
      { key: 'articleId', label: '文章 ID（留空查看全部）', type: 'text', placeholder: '输入文章 ID 查看详情，留空查看列表' },
    ],
  },
  { id: 'create-article',     name: '新增文章',   category: 'data',   description: '发布新文章（接收 JSON 对象）',              input: 'json', output: 'json', primitiveId: 'api-call',          provider: 'REST API', adminOnly: true,
    paramDefs: [
      { key: 'jsonData', label: '文章 JSON', type: 'textarea', required: true, placeholder: '{"title":"标题","summary":"摘要","content":"# Markdown 正文","publishDate":"2026-01-01","tags":["标签"],"readTime":5,"type":"Engineering"}' },
    ],
  },
  { id: 'view-crafts',        name: '查看 Crafts', category: 'data',  description: '查看所有 Crafts 列表或单个 Craft 详情',    input: 'text', output: 'json', primitiveId: 'api-call',          provider: 'REST API', adminOnly: true,
    paramDefs: [
      { key: 'craftId', label: 'Craft ID（留空查看全部）', type: 'text', placeholder: '输入 Craft ID 查看详情，留空查看列表' },
    ],
  },
  { id: 'create-craft',       name: '新增 Craft', category: 'data',  description: '批量创建 Craft（接收 JSON 数组）',          input: 'json', output: 'json', primitiveId: 'api-call',          provider: 'REST API', adminOnly: true,
    paramDefs: [
      { key: 'jsonData', label: 'Craft JSON 数组', type: 'textarea', required: true,description:'不填则使用上一步返回结果', placeholder: '[{"name":"名称","description":"描述","category":"effect","technologies":["React"],"htmlCode":"<div>HTML</div>","configSchema":[]}]' },
    ],
  },
]

/** 管理员私有技能 ID 列表 */
const ADMIN_SKILL_IDS = skillPool.filter(s => s.adminOnly).map(s => s.id)

/** 管理员私有技能完整对象（用于注入到猫猫 skills 数组） */
const ADMIN_SKILL_OBJECTS = skillPool
  .filter(s => s.adminOnly)
  .map(s => ({ id: s.id, name: s.name, description: s.description, input: s.input, output: s.output, ...(s.paramDefs?.length ? { paramDefs: s.paramDefs } : {}) }))

/** 根据管理员身份过滤可见技能池 */
export function getVisibleSkillPool(isAdmin: boolean): SkillTemplate[] {
  return isAdmin ? skillPool : skillPool.filter(s => !s.adminOnly)
}

/**
 * 为管理员的 Default 猫动态注入管理员私有技能
 * Default 猫已装备所有原型技能，此函数额外补充管理员专属技能（如文章管理、Craft 管理等）。
 * 猫猫 skills 存储在数据库中，此函数在前端读取后补充，避免需要重新保存猫猫。
 */
export function injectAdminSkillsToCats<T extends { role: string; skills: any[] }>(cats: T[], isAdmin: boolean): T[] {
  if (!isAdmin) return cats
  return cats.map(cat => {
    if (cat.role !== 'Default') return cat
    const existingIds = new Set(cat.skills.map((s: any) => s.id))
    const missing = ADMIN_SKILL_OBJECTS.filter(s => !existingIds.has(s.id))
    if (missing.length === 0) return cat
    return { ...cat, skills: [...cat.skills, ...missing] }
  })
}

/** 根据管理员身份获取技能组（管理员的 default 组自动包含私有技能） */
export function getVisibleSkillGroups(isAdmin: boolean): SkillGroup[] {
  if (!isAdmin) return skillGroups
  return skillGroups.map(g =>
    g.id === 'default'
      ? { ...g, skillIds: [...g.skillIds, ...ADMIN_SKILL_IDS] }
      : g
  )
}

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
    id: 'default',
    name: '默认助手',
    icon: '💬',
    color: '#A0A0A0',
    description: '全能猫猫，装备所有 13 个原型技能',
    skillIds: [
      'ai-chat',           // text-to-text
      'text-to-image',     // text-to-image
      'structured-output', // structured-output
      'api-call',          // api-call
      'db-query',          // db-query
      'email-send',        // email-send
      'web-push',          // web-push
      'html-render',       // html-render
      'chart-render',      // chart-render
      'browser-action',    // browser-action
      'file-io',           // file-io
      'workflow-engine',   // workflow-engine
      'js-execute',        // js-execute
    ],
    catId: 'default',
  },
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
