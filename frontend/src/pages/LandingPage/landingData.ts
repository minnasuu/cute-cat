/**
 * Landing Page 展示用数据
 * 体现产品核心逻辑：外形模版 × 性格模版 × 技能池 = 自由组合
 */
import type { CatColors } from '../../components/CatSVG'
import { huajiaoTheme, lanmaoTheme, heimaotaxueTheme } from '../../data/themes'
import { niannianColors } from '../../data/cats/niannian'
import { xiaohuColors } from '../../data/cats/xiaohu'
import { pixelColors } from '../../data/cats/pixel'
import { huangjinColors } from '../../data/cats/huangjin'
import { mimiColors } from '../../data/cats/mimi'
import { xiaobaiColors } from '../../data/cats/xiaobai'
import { fafaColors } from '../../data/cats/fafa'

// ─── 外形模版 ───
export interface AppearanceTemplate {
  id: string
  name: string
  preview: string    // 简短描述
  colors: CatColors
}

export const appearanceTemplates: AppearanceTemplate[] = [
  { id: 'huajiao',   name: '狸花加白',  preview: '经典三花，沉稳大气',   colors: huajiaoTheme },
  { id: 'lanmao',    name: '蓝猫',  preview: '优雅蓝灰，文艺气质',   colors: lanmaoTheme },
  { id: 'heimao',    name: '踏雪黑猫',  preview: '酷感十足，神秘利落',   colors: heimaotaxueTheme },
  { id: 'jubi',      name: '橘猫',  preview: '暖橘毛色，亲切温暖',   colors: niannianColors },
  { id: 'sanhua',    name: '三花猫',  preview: '多彩拼接，活力满分',   colors: xiaohuColors },
  { id: 'xianluomao',name: '暹罗猫',  preview: '深浅渐变，高贵优雅',   colors: pixelColors },
  { id: 'jinsemao',  name: '金色暹罗猫',    preview: '暖金毛色，阳光开朗',   colors: huangjinColors },
  { id: 'baimao',    name: '白猫',  preview: '通体纯白，干净温柔',   colors: mimiColors },
  { id: 'naimao',    name: '奶牛猫',  preview: '黑白拼接，俏皮可爱',   colors: xiaobaiColors },
  { id: 'yinse',     name: '美短',  preview: '低调银灰，知性沉稳',   colors: fafaColors },
]

// ─── 性格模版 ───
export interface PersonalityTemplate {
  id: string
  name: string
  emoji: string
  traits: string[]         // 性格关键词
  tone: string             // 说话风格
}

export const personalityTemplates: PersonalityTemplate[] = [
  { id: 'leader',     name: '领导者',   emoji: '👑', traits: ['冷静理性', '条理清晰', '有决断力'], tone: '简洁专业、指令明确' },
  { id: 'creative',   name: '创意家',   emoji: '🎨', traits: ['灵感迸发', '天马行空', '追求完美'], tone: '活泼生动、充满想象' },
  { id: 'scholar',    name: '学者型',   emoji: '📚', traits: ['严谨求实', '逻辑缜密', '注重细节'], tone: '条理分明、引经据典' },
  { id: 'warm',       name: '暖心派',   emoji: '💛', traits: ['温柔体贴', '善解人意', '亲和力强'], tone: '温暖亲切、鼓励为主' },
  { id: 'hustler',    name: '实干家',   emoji: '⚡', traits: ['雷厉风行', '效率至上', '目标导向'], tone: '直截了当、言简意赅' },
  { id: 'playful',    name: '活泼鬼',   emoji: '🎉', traits: ['幽默风趣', '乐观开朗', '感染力强'], tone: '俏皮可爱、表情丰富' },
]

// ─── 全局技能池 ───
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

// ─── 技能组（快速装配一组技能）───
export interface SkillGroup {
  id: string
  name: string
  icon: string
  color: string
  description: string
  skillIds: string[]   // 引用 skillPool 中的 id
}

export const skillGroups: SkillGroup[] = [
  {
    id: 'programmer',
    name: '程序员',
    icon: '💻',
    color: '#90CAF9',
    description: 'Bug 监测、网页爬虫、GitHub 代码编写等全栈开发能力',
    skillIds: ['fix-bug', 'develop-feature', 'optimize-perf', 'crawl-news', 'generate-component', 'regression-test'],
  },
  {
    id: 'writer',
    name: '写手',
    icon: '✍️',
    color: '#FF6B6B',
    description: '文章撰写、内容润色、大纲规划、资讯整理等创作能力',
    skillIds: ['generate-article', 'polish-text', 'generate-outline', 'news-to-article', 'meeting-notes'],
  },
  {
    id: 'analyst',
    name: '分析师',
    icon: '📊',
    color: '#96BAFF',
    description: '数据采集、趋势分析、资讯摘要、图表可视化等数据能力',
    skillIds: ['crawl-news', 'summarize-news', 'query-dashboard', 'trend-analysis', 'generate-chart'],
  },
  {
    id: 'designer',
    name: '设计师',
    icon: '🎨',
    color: '#B39DDB',
    description: 'AI 绘图、组件生成、排版布局、样式生成等视觉能力',
    skillIds: ['generate-image', 'generate-component', 'layout-design', 'generate-chart'],
  },
  {
    id: 'operator',
    name: '运营官',
    icon: '📣',
    color: '#F2A5B9',
    description: '邮件推送、通知管理、任务日志、质量检测等运营能力',
    skillIds: ['send-email', 'send-notification', 'task-log', 'quality-check', 'summarize-news'],
  },
  {
    id: 'manager',
    name: '管理者',
    icon: '👔',
    color: '#8DB889',
    description: '任务分配、审批流程、工作流管理、团队盘点等管理能力',
    skillIds: ['generate-todo', 'assign-task', 'review-approve', 'manage-workflow', 'recruit-cat', 'team-review'],
  },
]

// ─── 预设组合示例（展示用）───
export interface PresetCombo {
  name: string
  appearance: string      // appearanceTemplate id
  personality: string     // personalityTemplate id
  skillGroupId: string    // skillGroup id（快速装配）
  extraSkillIds?: string[] // 额外散装技能
  description: string
}

export const presetCombos: PresetCombo[] = [
  {
    name: '花椒',
    appearance: 'huajiao',
    personality: 'leader',
    skillGroupId: 'manager',
    description: '经典的团队总管——三花外形 + 领导者性格 + 管理者技能组。',
  },
  {
    name: '阿蓝',
    appearance: 'lanmao',
    personality: 'creative',
    skillGroupId: 'writer',
    description: '文艺蓝灰猫 + 创意家性格 + 写手技能组，天生的创作搭配。',
  },
  {
    name: '雪',
    appearance: 'heimao',
    personality: 'scholar',
    skillGroupId: 'analyst',
    description: '冷酷黑猫 + 学者性格 + 分析师技能组，严谨的情报官。',
  },
]
