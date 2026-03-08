import type { Workflow } from './types';

export const workflows: Workflow[] = [
  {
    id: 'daily-news',
    name: '资讯日报',
    description: '雪爬取最新资讯 → 智能摘要 → 阿蓝编辑成文 → 年年推送给订阅者',
    steps: [
      {
        agentId: 'analyst', skillId: 'crawl-news', action: '爬取指定网站/RSS 获取最新资讯 → 输出 JSON 资讯列表',
        params: [
          { key: 'sources', label: 'RSS / API 源', type: 'tags', placeholder: '输入 URL 后回车添加', description: '可添加多个 RSS 或 API 地址' },
          { key: 'keyword', label: '关键词过滤', type: 'text', placeholder: '可选，如 AI、前端', description: '仅保留包含关键词的资讯' },
          { key: 'maxItems', label: '最大条数', type: 'number', defaultValue: 20, description: '每个源最多抓取条数' },
        ],
      },
      {
        agentId: 'analyst', skillId: 'summarize-news', action: '对资讯内容进行摘要分类 → 输出 Text 摘要', inputFrom: 'analyst',
        params: [
          { key: 'language', label: '摘要语言', type: 'select', defaultValue: 'zh', options: [{ label: '中文', value: 'zh' }, { label: 'English', value: 'en' }] },
          { key: 'summaryLength', label: '摘要长度', type: 'select', defaultValue: 'medium', options: [{ label: '精简', value: 'short' }, { label: '适中', value: 'medium' }, { label: '详细', value: 'long' }] },
        ],
      },
      { agentId: 'writer', skillId: 'news-to-article', action: '整理为可发布的资讯日报 → 输出 Text', inputFrom: 'analyst' },
      {
        agentId: 'ops', skillId: 'send-notification', action: '推送资讯日报给订阅者 → 输出推送状态', inputFrom: 'writer',
        params: [
          { key: 'recipients', label: '收件人', type: 'tags', placeholder: '输入邮箱后回车', required: true, description: '推送目标邮箱' },
          { key: 'subjectPrefix', label: '邮件主题前缀', type: 'text', placeholder: '如 [每日资讯]', defaultValue: '[每日资讯]' },
        ],
      },
    ],
    startTime: '09:00',
    endTime: '09:15',
    scheduled: true,
    scheduledEnabled: true,
    cron: '每天 09:00',
    persistent: true,
  },
  {
    id: 'content-publish',
    name: '内容发布',
    description: '阿蓝撰写文章 → Pixel 配图 → Pixel 排版 → 小白审核 → 年年推送',
    steps: [
      {
        agentId: 'writer', skillId: 'generate-article', action: '根据主题和素材生成文章 → 输出 Text',
        params: [
          { key: 'topic', label: '文章主题', type: 'text', placeholder: '如：2026 前端趋势', required: true },
          { key: 'tone', label: '文风', type: 'select', defaultValue: 'casual', options: [{ label: '轻松', value: 'casual' }, { label: '专业', value: 'professional' }, { label: '幽默', value: 'humorous' }] },
          { key: 'wordCount', label: '目标字数', type: 'number', defaultValue: 1500 },
          { key: 'references', label: '参考资料', type: 'textarea', placeholder: '粘贴参考链接或内容，每行一个' },
        ],
      },
      {
        agentId: 'designer', skillId: 'generate-image', action: '为文章生成配图 → 输出 Image', inputFrom: 'writer',
        params: [
          { key: 'style', label: '画风', type: 'select', defaultValue: 'flat', options: [{ label: '扁平插画', value: 'flat' }, { label: '写实', value: 'realistic' }, { label: '像素风', value: 'pixel' }, { label: '水彩', value: 'watercolor' }] },
          { key: 'imageCount', label: '配图数量', type: 'number', defaultValue: 3 },
        ],
      },
      { agentId: 'designer', skillId: 'layout-design', action: '排版为精美页面 → 输出 HTML', inputFrom: 'designer' },
      { agentId: 'reviewer', skillId: 'content-review', action: '内容质量审核 → 输出 JSON 审核报告', inputFrom: 'designer' },
      { agentId: 'ops', skillId: 'send-notification', action: '推送发布通知 → 输出推送状态', inputFrom: 'reviewer' },
    ],
    startTime: '14:00',
    endTime: '14:30',
    persistent: false,
  },
  {
    id: 'data-report',
    name: '数据周报',
    description: '雪采集数据 → 趋势分析 → Pixel 图表可视化 → 阿蓝撰写报告 → 年年邮件发送',
    steps: [
      {
        agentId: 'analyst', skillId: 'query-dashboard', action: '采集一周核心数据 → 输出 JSON 数据集',
        params: [
          { key: 'dateRange', label: '数据范围', type: 'select', defaultValue: '7d', options: [{ label: '近 7 天', value: '7d' }, { label: '近 14 天', value: '14d' }, { label: '近 30 天', value: '30d' }] },
          { key: 'metrics', label: '关注指标', type: 'tags', placeholder: '如 PV、UV、跳出率', description: '指定需要关注的核心指标' },
        ],
      },
      { agentId: 'analyst', skillId: 'trend-analysis', action: '趋势分析与异常检测 → 输出 JSON 分析结论', inputFrom: 'analyst' },
      { agentId: 'designer', skillId: 'generate-chart', action: '生成数据可视化图表 → 输出 Image', inputFrom: 'analyst' },
      { agentId: 'writer', skillId: 'generate-article', action: '撰写数据分析报告 → 输出 Text', inputFrom: 'designer' },
      {
        agentId: 'ops', skillId: 'send-email', action: '发送周报邮件 → 输出邮件状态', inputFrom: 'writer',
        params: [
          { key: 'recipients', label: '收件人', type: 'tags', placeholder: '输入邮箱后回车', required: true },
        ],
      },
    ],
    startTime: '10:00',
    endTime: '10:30',
    scheduled: true,
    scheduledEnabled: true,
    cron: '每周五 10:00',
    persistent: true,
  },
];
