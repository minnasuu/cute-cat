import type { Workflow } from './types';

export const workflows: Workflow[] = [
  {
    id: 'daily-news',
    name: '资讯日报',
    description: '雪爬取最新资讯 → 智能摘要 → 阿蓝编辑成文 → 年年推送给订阅者',
    steps: [
      {
        stepId: 'dn_1', agentId: 'analyst', skillId: 'crawl-news', action: '爬取指定网站/RSS 获取最新资讯 → 输出 JSON 资讯列表',
        params: [
          { key: 'sources', label: 'RSS / API 源', type: 'tags', placeholder: '输入 URL 后回车添加', description: '可添加多个 RSS 或 API 地址' },
          { key: 'keyword', label: '关键词过滤', type: 'text', placeholder: '可选，如 AI、前端', description: '仅保留包含关键词的资讯' },
          { key: 'maxItems', label: '最大条数', type: 'number', defaultValue: 20, description: '每个源最多抓取条数' },
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
        stepId: 'cp_1', agentId: 'writer', skillId: 'generate-article', action: '根据主题和素材生成文章 → 输出 Text',
        params: [
          { key: 'topic', label: '文章主题', type: 'text', placeholder: '如：2026 前端趋势', required: true },
          { key: 'tone', label: '文风', type: 'select', defaultValue: 'casual', options: [{ label: '轻松', value: 'casual' }, { label: '专业', value: 'professional' }, { label: '幽默', value: 'humorous' }] },
          { key: 'wordCount', label: '目标字数', type: 'number', defaultValue: 1500 },
          { key: 'references', label: '参考资料', type: 'textarea', placeholder: '粘贴参考链接或内容，每行一个' },
        ],
      },
      {
        stepId: 'cp_2', agentId: 'designer', skillId: 'generate-image', action: '为文章生成配图 → 输出 Image', inputFrom: 'cp_1',
        params: [
          { key: 'style', label: '画风', type: 'select', defaultValue: 'flat', options: [{ label: '扁平插画', value: 'flat' }, { label: '写实', value: 'realistic' }, { label: '像素风', value: 'pixel' }, { label: '水彩', value: 'watercolor' }] },
          { key: 'imageCount', label: '配图数量', type: 'number', defaultValue: 3 },
        ],
      },
      { stepId: 'cp_3', agentId: 'reviewer', skillId: 'content-review', action: '内容质量审核 → 输出 JSON 审核报告', inputFrom: 'cp_2' },
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
      { stepId: 'dr_1', agentId: 'designer', skillId: 'generate-chart', action: '生成数据可视化图表 → 输出 Image', inputFrom: 'analyst' },
      { stepId: 'dr_2', agentId: 'writer', skillId: 'generate-article', action: '撰写数据分析报告 → 输出 Text', inputFrom: 'dr_1' },
      {
        stepId: 'dr_3', agentId: 'ops', skillId: 'send-email', action: '发送周报邮件 → 输出邮件状态', inputFrom: 'dr_2',
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
