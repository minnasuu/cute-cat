const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

const PLAN_LIMITS = {
  free: { maxCatsPerTeam: 5 },
  pro: { maxCatsPerTeam: 20 },
  enterprise: { maxCatsPerTeam: 999 },
};

// ======================== 获取模版猫列表 ========================
router.get('/templates', async (req, res) => {
  res.json(CAT_TEMPLATES);
});

// ======================== 获取团队猫猫列表 ========================
router.get('/team/:teamId', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const cats = await prisma.teamCat.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: '获取猫猫列表失败' });
  }
});

// ======================== 添加猫猫到团队 ========================
router.post('/team/:teamId', async (req, res) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '团队不存在' });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const catCount = await prisma.teamCat.count({ where: { teamId: req.params.teamId } });
    if (catCount >= limits.maxCatsPerTeam) {
      return res.status(403).json({ error: `当前套餐每个团队最多 ${limits.maxCatsPerTeam} 只猫猫` });
    }

    const { templateId, name, role, description, catColors, systemPrompt, skills, aiModel, temperature, maxTokens, accent, item, messages } = req.body;

    // If templateId provided, merge from template
    let data = { teamId: req.params.teamId };
    if (templateId) {
      const template = CAT_TEMPLATES.find(t => t.id === templateId);
      if (template) {
        data = { ...data, templateId, name: name || template.name, role: template.role, description: template.description, catColors: catColors || template.catColors, systemPrompt: template.systemPrompt, skills: template.skills, accent: template.accent, item: template.item, messages: template.messages };
      }
    }
    // Override with provided values
    if (name) data.name = name;
    if (role) data.role = role;
    if (description !== undefined) data.description = description;
    if (catColors) data.catColors = catColors;
    if (systemPrompt) data.systemPrompt = systemPrompt;
    if (skills) data.skills = skills;
    if (aiModel) data.aiModel = aiModel;
    if (temperature !== undefined) data.temperature = temperature;
    if (maxTokens !== undefined) data.maxTokens = maxTokens;
    if (accent) data.accent = accent;
    if (item) data.item = item;
    if (messages) data.messages = messages;

    // Defaults for custom cat
    if (!data.role) data.role = 'Custom';
    if (!data.catColors) data.catColors = { body: '#F5A623', bodyDark: '#D4842A', belly: '#FFFFFF', earInner: '#F4B8B8', eyes: '#4A90D9', nose: '#E8998D', blush: '#F4B8B8', stroke: '#3E2E1E', apron: '#A5D6A7', apronLight: '#E8F5E9', apronLine: '#A5D6A7', desk: '#C8DEC4', deskDark: '#8DB889', deskLeg: '#A6CCA2', paw: '#FFFFFF', tail: '#F5A623' };
    if (!data.skills) data.skills = [];
    if (!data.messages) data.messages = ['喵~'];

    const cat = await prisma.teamCat.create({ data });
    res.json(cat);
  } catch (err) {
    console.error('[cats] create error:', err);
    res.status(500).json({ error: '添加猫猫失败' });
  }
});

// ======================== 获取猫猫详情 ========================
router.get('/:catId', async (req, res) => {
  try {
    const cat = await prisma.teamCat.findUnique({ where: { id: req.params.catId } });
    if (!cat) return res.status(404).json({ error: '猫猫不存在' });
    const team = await prisma.team.findFirst({ where: { id: cat.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '无权访问' });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: '获取猫猫详情失败' });
  }
});

// ======================== 更新猫猫 ========================
router.put('/:catId', async (req, res) => {
  try {
    const cat = await prisma.teamCat.findUnique({ where: { id: req.params.catId } });
    if (!cat) return res.status(404).json({ error: '猫猫不存在' });
    const team = await prisma.team.findFirst({ where: { id: cat.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '无权访问' });

    const { name, role, description, catColors, systemPrompt, skills, aiModel, temperature, maxTokens, accent, item, messages } = req.body;
    const updated = await prisma.teamCat.update({
      where: { id: req.params.catId },
      data: {
        ...(name && { name }),
        ...(role && { role }),
        ...(description !== undefined && { description }),
        ...(catColors && { catColors }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(skills && { skills }),
        ...(aiModel !== undefined && { aiModel }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(accent && { accent }),
        ...(item && { item }),
        ...(messages && { messages }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新猫猫失败' });
  }
});

// ======================== 删除猫猫 ========================
router.delete('/:catId', async (req, res) => {
  try {
    const cat = await prisma.teamCat.findUnique({ where: { id: req.params.catId } });
    if (!cat) return res.status(404).json({ error: '猫猫不存在' });
    const team = await prisma.team.findFirst({ where: { id: cat.teamId, ownerId: req.userId } });
    if (!team) return res.status(404).json({ error: '无权访问' });

    await prisma.teamCat.delete({ where: { id: req.params.catId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除猫猫失败' });
  }
});

// ======================== 模版猫数据 ========================
const CAT_TEMPLATES = [
  {
    id: 'manager',
    name: '花椒',
    role: 'Manager',
    description: '总管。统筹调度、任务分配、审批流程，可增删/执行工作流，决定是否招募新猫。',
    accent: '#8DB889',
    systemPrompt: '你是「花椒」，一只沉稳可靠的猫猫总管。你的职责是统筹调度整个猫猫团队，分配任务、审批成果、管理工作流。',
    skills: [
      { id: 'generate-todo', name: '代办清单', icon: '📋', description: '分析网站内容，自动生成代办清单', input: 'json', output: 'json' },
      { id: 'assign-task', name: '任务分配', icon: '📌', description: '将任务拆解并分配给指定猫猫', input: 'text', output: 'json' },
      { id: 'review-approve', name: '审批流程', icon: '✅', description: '审核工作成果并决定是否发布', input: 'json', output: 'json' },
      { id: 'manage-workflow', name: '工作流管理', icon: '🔧', description: '新增、修改或删除协作工作流', input: 'json', output: 'json' },
      { id: 'run-workflow', name: '执行工作流', icon: '▶️', description: '选择并触发指定工作流立即执行', input: 'text', output: 'json' },
    ],
    item: 'clipboard',
    catColors: { body: '#B0A08A', bodyDark: '#5C4A3A', belly: '#FFFFFF', earInner: '#F4B8B8', eyes: '#B2D989', nose: '#E8998D', blush: '#F4B8B8', stroke: '#3E2E1E', apron: '#A5D6A7', apronLight: '#E8F5E9', apronLine: '#A5D6A7', desk: '#C8DEC4', deskDark: '#8DB889', deskLeg: '#A6CCA2', paw: '#FFFFFF', tail: '#B0A08A', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['全体猫猫听令！', '开始工作啦', '今日KPI已达成✅', '需要招募新猫猫吗?', '一切尽在掌控中✨'],
  },
  {
    id: 'writer',
    name: '阿蓝',
    role: 'Writer',
    description: '根据主人的主题和材料输出文章，整理资讯为可发布内容。',
    accent: '#FF6B6B',
    systemPrompt: '你是「阿蓝」，一只文艺气质的蓝灰色猫猫写手。你负责所有文字创作工作。',
    skills: [
      { id: 'generate-article', name: '文章生成', icon: '📝', description: '根据主题和素材调用 AI 生成完整文章', input: 'text', output: 'text' },
      { id: 'polish-text', name: '内容润色', icon: '✨', description: '优化文本表达，调整语气和风格', input: 'text', output: 'text' },
      { id: 'generate-outline', name: '大纲生成', icon: '📑', description: '根据主题快速生成结构化大纲', input: 'text', output: 'json' },
      { id: 'news-to-article', name: '资讯转文章', icon: '📰', description: '将爬取的资讯摘要整理为可发布的博文', input: 'json', output: 'text' },
    ],
    item: 'notebook',
    catColors: { body: '#8E9AAF', bodyDark: '#6B7A8D', belly: '#B8C4D4', earInner: '#C4A6A6', eyes: '#D4944C', nose: '#B87D75', blush: '#C9A6A6', stroke: '#4A5568', apron: '#5B8DB8', apronLight: '#D0DFE9', apronLine: '#5B8DB8', desk: '#E8D5B8', deskDark: '#C4A87A', deskLeg: '#D4BF9A', paw: '#B8C4D4', tail: '#6B7A8D', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['开始写作了！', '我是灵魂写手', '文章构思中...', '今天写点啥？', '文章已完成！'],
  },
  {
    id: 'analytics',
    name: '雪',
    role: 'Scout',
    description: '资讯爬取、信息采集与数据分析。定时获取 UX/设计/前端领域最新动态。',
    accent: '#96BAFF',
    systemPrompt: '你是「雪」，一只机警敏锐的黑色猫猫侦察员。你是团队的眼睛和耳朵，负责信息采集和数据分析。',
    skills: [
      { id: 'crawl-news', name: '资讯爬取', icon: '🕸️', description: '定时爬取指定网站/RSS，获取最新资讯', input: 'url', output: 'json' },
      { id: 'summarize-news', name: '资讯摘要', icon: '📰', description: '对爬取内容进行智能摘要和分类', input: 'json', output: 'text' },
      { id: 'query-dashboard', name: '数据查询', icon: '🔍', description: '查询网站数据库获取结构化数据', input: 'text', output: 'json' },
      { id: 'trend-analysis', name: '趋势分析', icon: '📈', description: '对时序数据进行趋势分析和异常检测', input: 'json', output: 'json' },
    ],
    item: 'laptop',
    catColors: { body: '#3D3D3D', bodyDark: '#2A2A2A', belly: '#3D3D3D', earInner: '#E8909A', eyes: '#000', nose: '#542615', blush: '#F28686', stroke: '#1A1A1A', apron: '#7EB8DA', apronLight: '#D6EAF5', apronLine: '#7EB8DA', desk: '#C8D8E8', deskDark: '#8BA4BD', deskLeg: '#A6BCCF', paw: '#fff', tail: '#3D3D3D', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['一起看看最新资讯👀', '跳出率有点高呢...', '数据会越来越好哒', '时刻关注前沿✨', '我被数据淹没啦'],
  },
  {
    id: 'email',
    name: '年年',
    role: 'Messenger',
    description: '邮件发送、通知推送。',
    accent: '#F2A5B9',
    systemPrompt: '你是「年年」，一只温暖热情的橘色猫猫信使。你是团队与外界沟通的桥梁，负责所有邮件和通知。',
    skills: [
      { id: 'send-email', name: '发送邮件', icon: '📧', description: '发送 HTML 格式邮件给指定收件人', input: 'text', output: 'email' },
      { id: 'send-notification', name: '推送通知', icon: '🔔', description: '向订阅者批量推送通知', input: 'text', output: 'json' },
    ],
    item: 'mail',
    catColors: { body: '#F7AC5E', bodyDark: '#D3753E', belly: '', earInner: '#F28686', eyes: '#542615', nose: '#542615', blush: '#F28686', stroke: '#542615', apron: '#BDBDBD', apronLight: '#FEFFFE', apronLine: '#BDBDBD', desk: '#D7CCC8', deskDark: '#A1887F', deskLeg: '#BCAAA4', paw: '', tail: '#F7AC5E', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['有3封新邮件!', '邮件编辑中...', '一起来听今日资讯', '邮件送达率99%! 💌', '通知！通知！'],
  },
  {
    id: 'crafts',
    name: '小虎',
    role: 'Builder',
    description: '持续更新 Crafts 创意页面，生成前端组件和交互 demo。',
    accent: '#FFB74D',
    systemPrompt: '你是「小虎」，一只活力十足的三花猫猫建造师。你是团队的创意工匠，专注于前端组件和视觉呈现。',
    skills: [
      { id: 'generate-component', name: '组件生成', icon: '🧩', description: '根据描述生成 React/HTML 创意组件代码', input: 'text', output: 'html' },
      { id: 'update-crafts', name: 'Crafts 更新', icon: '🔄', description: '自动为 Crafts 页面新增交互 demo', input: 'text', output: 'html' },
      { id: 'layout-design', name: '排版布局', icon: '📐', description: '将文章+图片组合排版为精美页面', input: 'json', output: 'html' },
      { id: 'css-generate', name: '样式生成', icon: '🎨', description: '为组件生成匹配的 CSS/动画代码', input: 'html', output: 'file' },
    ],
    item: 'palette',
    catColors: { body: '#FAFAFA', bodyDark: '', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#542615', nose: '#E8998D', blush: '#FFB5C5', stroke: '#5D4037', apron: '#FFB74D', apronLight: '#FFF3E0', apronLine: '#FFB74D', desk: '#FFE0B2', deskDark: '#FFB74D', deskLeg: '#FFCC80', paw: ['#5C4A3A','#FAFAFA','#F7AC5E','#FAFAFA'], tail: '#5C4A3A', faceDark: '', month: '', head: '#FAFAFA', bodyDarkBottom: '#F7AC5E', leg: ['#F7AC5E','#FAFAFA','#5C4A3A','#F7AC5E'], headTopLeft: '#F7AC5E', headTopRight: '#5C4A3A' },
    messages: ['大家都在努力工作呢', '灵感迸发中...', '创意无限', '设计感满满', '俺生成的 crafts 满意吗？'],
  },
  {
    id: 'image',
    name: 'Pixel',
    role: 'Image Creator',
    description: '图片生成与图表可视化。调用 AI 生成模型。',
    accent: '#4E342E',
    systemPrompt: '你是「Pixel」，一只富有艺术天赋的暹罗猫猫画师。你负责所有视觉内容的生成。',
    skills: [
      { id: 'generate-image', name: 'AI 绘图', icon: '🖼️', description: '调用 AI 根据文字描述生成图片', input: 'text', output: 'image' },
      { id: 'generate-chart', name: '图表生成', icon: '📊', description: '根据 JSON 数据生成可视化图表', input: 'json', output: 'image' },
      { id: 'image-enhance', name: '图片增强', icon: '🔆', description: '对图片进行超分辨率放大和降噪', input: 'image', output: 'image' },
    ],
    item: 'camera',
    catColors: { body: '#FAF3EB', bodyDark: '#FAF3EB', belly: '#FAF3EB', earInner: '#4E342E', eyes: '#4FC3F7', nose: '#333', blush: '#FFCCBC', stroke: '#4E342E', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#D1C4E9', deskDark: '#9575CD', deskLeg: '#B39DDB', paw: '#4E342E', tail: '#4E342E', faceDark: '#4E342E', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['审美在线', '图像处理中...', '高清大图生成中!', '这张图太美了! ✨', '想生成什么画面?'],
  },
  {
    id: 'text',
    name: '黄金',
    role: 'Engineer',
    description: '网站全栈工程师',
    accent: '#90CAF9',
    systemPrompt: '你是「黄金」，一只技术派的金色猫猫程序员。你负责网站的开发、更新与维护工作。',
    skills: [
      { id: 'fix-bug', name: 'Bug 修复', icon: '🐛', description: '排查并修复网站前后端的 bug', input: 'text', output: 'text' },
      { id: 'develop-feature', name: '功能开发', icon: '🛠️', description: '根据需求开发新功能模块', input: 'text', output: 'text' },
      { id: 'optimize-perf', name: '性能优化', icon: '⚡', description: '分析并优化网站性能瓶颈', input: 'text', output: 'text' },
    ],
    item: 'camera',
    catColors: { body: '#FAF3EB', bodyDark: '#FAF3EB', belly: '#FAF3EB', earInner: '#F7AC5E', eyes: '#A1E0FF', nose: '#5D4037', blush: '#FFCCBC', stroke: '#5D4037', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#B3E5FC', deskDark: '#4FC3F7', deskLeg: '#81D4FA', paw: '#F7AC5E', tail: '#F7AC5E', faceDark: '#F7AC5E', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['像素化处理中... 🔲', '滤镜效果已应用~', 'OCR 识别完成!', '图片处理就交给我! ✨', '来一张像素风?'],
  },
  {
    id: 'sing',
    name: '咪咪',
    role: 'Recorder',
    description: '任务日志记录、会议纪要生成。记录完成后交给花椒分配新任务。',
    accent: '#B39DDB',
    systemPrompt: '你是「咪咪」，一只安静细心的白色猫猫记录员。你是团队的记忆管家，负责记录和归档一切重要信息。',
    skills: [
      { id: 'task-log', name: '任务日志', icon: '📒', description: '记录和整理每日/每周的任务执行日志', input: 'json', output: 'text' },
      { id: 'meeting-notes', name: '会议纪要', icon: '📝', description: '根据会议内容生成结构化会议纪要', input: 'text', output: 'text' },
    ],
    item: 'camera',
    catColors: { body: '#FFF', bodyDark: '#FFF', belly: '#FFF', earInner: '#FFF', eyes: '#5D4037', nose: '#5D4037', blush: '#FFCCBC', stroke: '#5D4037', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#FFF9C4', deskDark: '#FDD835', deskLeg: '#FFF176', paw: '#FFF', tail: '#FFF', faceDark: '', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['日志整理好了📒', '会议纪要已生成!', '任务记录中...', '这周完成了不少呢! 📝', '要记录点什么?'],
  },
  {
    id: 'milk',
    name: '小白',
    role: 'QA Inspector',
    description: '质量检测、内容审核和自动化测试。',
    accent: '#EC407A',
    systemPrompt: '你是「小白」，一只严谨认真的奶牛猫猫质检官。你是团队的最后一道防线，确保所有产出的质量达标。',
    skills: [
      { id: 'quality-check', name: '质量检测', icon: '🔎', description: '对输出内容进行质量评分和问题检测', input: 'json', output: 'json' },
      { id: 'content-review', name: '内容审核', icon: '🛡️', description: '检查文本是否合规、无敏感内容', input: 'text', output: 'json' },
      { id: 'regression-test', name: '回归测试', icon: '🧪', description: '对页面组件执行自动化回归测试', input: 'url', output: 'json' },
      { id: 'site-analyze', name: '网站诊断', icon: '🔬', description: '总结网站现有内容，提出改进建议', input: 'url', output: 'json' },
    ],
    item: 'clipboard',
    catColors: { body: '#FFF', bodyDark: '', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#000', nose: '#E8998D', blush: '#FFB5C5', stroke: '#5D4037', apron: '#FFB74D', apronLight: '#FFF3E0', apronLine: '#FFB74D', desk: '#F8BBD0', deskDark: '#EC407A', deskLeg: '#F48FB1', paw: ['#333','#FAFAFA','#333','#333'], tail: '#333', faceDark: '', month: '', head: '#FFF', bodyDarkBottom: '#333', leg: ['#FAFAFA','#333','#333','#FAFAFA'], headTopLeft: '#333', headTopRight: '#333' },
    messages: ['质量检测通过! ✅', '发现一个小问题', '内容审核中...', '测试覆盖率 98%!', '我是监工'],
  },
  {
    id: 'hr',
    name: '发发',
    role: 'HR',
    description: '人事专员。负责招募新猫、定义角色技能、团队管理和猫猫培训。',
    accent: '#5C9CE6',
    systemPrompt: '你是「发发」，一只温柔体贴的美短猫猫人事官。你负责团队的人才管理和发展。',
    skills: [
      { id: 'recruit-cat', name: '招募新猫', icon: '🐱', description: '根据需求招募一只新猫并定义其角色、技能和外观', input: 'json', output: 'json' },
      { id: 'team-review', name: '团队盘点', icon: '👥', description: '盘点当前猫猫团队的能力分布和缺口', input: 'none', output: 'json' },
      { id: 'cat-training', name: '技能培训', icon: '📚', description: '为现有猫猫新增或升级技能', input: 'json', output: 'json' },
    ],
    item: 'clipboard',
    catColors: { body: '#F5F5F5', bodyDark: '#D5D5D5', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#542615', nose: '#542615', blush: '#FFB5C5', stroke: '#333333', apron: '#E8A0BF', apronLight: '#FCE4EC', apronLine: '#E8A0BF', desk: '#E8C8D8', deskDark: '#C4919E', deskLeg: '#D4A8B5', paw: '#FFFFFF', tail: '#F5F5F5', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
    messages: ['猫猫们，今天状态如何?', '新猫面试中...', '新猫要什么花色呢？', '培训计划制定好了', '需要招新猫猫吗? 🐱'],
  },
  {
    id: 'default',
    name: 'CAT',
    role: 'Default',
    description: '官方默认猫猫。全能小助手，装备所有 13 个原型技能。',
    accent: '#A0A0A0',
    systemPrompt: '你是「CAT」，一只随和友善的猫猫助手。你是团队的全能基础成员，装备了所有 13 个原型技能：AI 文生文、文生图、结构化输出、API 调用、数据库查询、邮件发送、Web 推送、HTML 渲染、图表渲染、浏览器操作、文件读写、工作流引擎、JS 执行。性格：随和、乐于助人、认真负责、无所不能。',
    skills: [
      { id: 'ai-chat',           name: 'AI 对话',     icon: '💬', description: '通用 AI 文生文',                    input: 'text', output: 'text' },
      { id: 'text-to-image',     name: 'AI 文生图',   icon: '🖼️', description: '文本描述 → 图片生成',               input: 'text', output: 'image' },
      { id: 'structured-output', name: '结构化输出',   icon: '📦', description: '文本 → JSON 结构化数据',            input: 'text', output: 'json' },
      { id: 'api-call',          name: 'API 调用',    icon: '🌐', description: 'HTTP 请求外部 API',                input: 'json', output: 'json' },
      { id: 'db-query',          name: '数据库查询',   icon: '🗄️', description: '执行 SQL 查询',                    input: 'text', output: 'json' },
      { id: 'email-send',        name: '邮件发送',    icon: '📧', description: '通过 SMTP 发送邮件',               input: 'text', output: 'email' },
      { id: 'web-push',          name: 'Web 推送',    icon: '🔔', description: '发送浏览器推送通知',                input: 'json', output: 'json' },
      { id: 'html-render',       name: 'HTML 渲染',   icon: '🧩', description: '生成并渲染 HTML 组件',             input: 'text', output: 'html' },
      { id: 'chart-render',      name: '图表渲染',    icon: '📊', description: 'JSON → 可视化图表',                input: 'json', output: 'image' },
      { id: 'browser-action',    name: '浏览器操作',   icon: '🌍', description: '自动化浏览器交互',                 input: 'url',  output: 'json' },
      { id: 'file-io',           name: '文件读写',    icon: '📂', description: '读写本地文件',                     input: 'text', output: 'file' },
      { id: 'workflow-engine',   name: '工作流引擎',   icon: '⚙️', description: '编排多步骤工作流',                 input: 'json', output: 'json' },
      { id: 'js-execute',        name: 'JS 执行',     icon: '💻', description: '执行 JavaScript 代码',            input: 'text', output: 'text' },
    ],
    item: 'clipboard',
    catColors: null, // null 表示随机
    messages: ['喵~ 准备好了!', '交给我吧!', '正在思考中...', '搞定啦! ✨', '需要帮忙吗?', '全能猫猫上线! 🚀'],
  },
];

/** 从 appearanceTemplates 等效配色列表中随机选一个 */
const RANDOM_COLOR_POOL = [
  { body: '#B0A08A', bodyDark: '#5C4A3A', belly: '#FFFFFF', earInner: '#F4B8B8', eyes: '#B2D989', nose: '#E8998D', blush: '#F4B8B8', stroke: '#3E2E1E', apron: '#A5D6A7', apronLight: '#E8F5E9', apronLine: '#A5D6A7', desk: '#C8DEC4', deskDark: '#8DB889', deskLeg: '#A6CCA2', paw: '#FFFFFF', tail: '#B0A08A', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  { body: '#8E9AAF', bodyDark: '#6B7A8D', belly: '#B8C4D4', earInner: '#C4A6A6', eyes: '#D4944C', nose: '#B87D75', blush: '#C9A6A6', stroke: '#4A5568', apron: '#5B8DB8', apronLight: '#D0DFE9', apronLine: '#5B8DB8', desk: '#E8D5B8', deskDark: '#C4A87A', deskLeg: '#D4BF9A', paw: '#B8C4D4', tail: '#6B7A8D', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  { body: '#3D3D3D', bodyDark: '#2A2A2A', belly: '#3D3D3D', earInner: '#E8909A', eyes: '#000', nose: '#542615', blush: '#F28686', stroke: '#1A1A1A', apron: '#7EB8DA', apronLight: '#D6EAF5', apronLine: '#7EB8DA', desk: '#C8D8E8', deskDark: '#8BA4BD', deskLeg: '#A6BCCF', paw: '#fff', tail: '#3D3D3D', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  { body: '#F7AC5E', bodyDark: '#D3753E', belly: '', earInner: '#F28686', eyes: '#542615', nose: '#542615', blush: '#F28686', stroke: '#542615', apron: '#BDBDBD', apronLight: '#FEFFFE', apronLine: '#BDBDBD', desk: '#D7CCC8', deskDark: '#A1887F', deskLeg: '#BCAAA4', paw: '', tail: '#F7AC5E', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  { body: '#FAF3EB', bodyDark: '#FAF3EB', belly: '#FAF3EB', earInner: '#4E342E', eyes: '#4FC3F7', nose: '#333', blush: '#FFCCBC', stroke: '#4E342E', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#D1C4E9', deskDark: '#9575CD', deskLeg: '#B39DDB', paw: '#4E342E', tail: '#4E342E', faceDark: '#4E342E', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  { body: '#FFF', bodyDark: '#FFF', belly: '#FFF', earInner: '#FFF', eyes: '#5D4037', nose: '#5D4037', blush: '#FFCCBC', stroke: '#5D4037', apron: '#B39DDB', apronLight: '#EDE7F6', apronLine: '#B39DDB', desk: '#FFF9C4', deskDark: '#FDD835', deskLeg: '#FFF176', paw: '#FFF', tail: '#FFF', faceDark: '', month: '#333', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
  { body: '#F5F5F5', bodyDark: '#D5D5D5', belly: '#FFFFFF', earInner: '#FFB5C5', eyes: '#542615', nose: '#542615', blush: '#FFB5C5', stroke: '#333333', apron: '#E8A0BF', apronLight: '#FCE4EC', apronLine: '#E8A0BF', desk: '#E8C8D8', deskDark: '#C4919E', deskLeg: '#D4A8B5', paw: '#FFFFFF', tail: '#F5F5F5', faceDark: '', month: '', head: '', bodyDarkBottom: '', leg: '', headTopLeft: '', headTopRight: '' },
];

function getRandomColors() {
  return RANDOM_COLOR_POOL[Math.floor(Math.random() * RANDOM_COLOR_POOL.length)];
}

const PERSONALITY_POOL = [
  '好奇心旺盛，喜欢探索新事物',
  '安静沉稳，做事细致入微',
  '活泼开朗，总是充满活力',
  '温柔体贴，善于倾听',
  '机灵聪慧，反应敏捷',
  '认真负责，一丝不苟',
  '乐观积极，总能看到好的一面',
];

function getRandomPersonality() {
  return PERSONALITY_POOL[Math.floor(Math.random() * PERSONALITY_POOL.length)];
}

/** 自动为新团队创建一只默认 CAT 猫猫 */
async function createDefaultCat(teamId) {
  const template = CAT_TEMPLATES.find(t => t.id === 'default');
  if (!template) return null;
  const colors = getRandomColors();
  const personality = getRandomPersonality();
  try {
    return await prisma.teamCat.create({
      data: {
        teamId,
        templateId: 'default',
        name: template.name,
        role: template.role,
        description: template.description,
        catColors: colors,
        systemPrompt: template.systemPrompt + `\n性格特点：${personality}`,
        skills: template.skills,
        accent: template.accent,
        item: template.item,
        messages: template.messages,
      },
    });
  } catch (err) {
    console.error('[cats] create default CAT error:', err);
    return null;
  }
}

module.exports = router;
module.exports.createDefaultCat = createDefaultCat;
