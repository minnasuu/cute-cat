import type { HistoryItem } from './types';

export const workHistory: HistoryItem[] = [
  // --- 3/6 ---
  { id: 'h1', agentId: 'manager', skillId: 'generate-todo', timestamp: '2026-03-06T09:00:00', summary: '生成本周网站代办清单', result: '输出 JSON 代办清单 (8项待办)', workflowName: '网站代办清单', status: 'success' },
  { id: 'h2', agentId: 'analytics', skillId: 'crawl-news', timestamp: '2026-03-06T09:05:00', summary: '爬取 UX/设计领域最新资讯', result: '获取 12 条资讯 (CSS新特性/设计趋势)', workflowName: '资讯采集与推送', status: 'success' },
  { id: 'h3', agentId: 'writer', skillId: 'news-to-article', timestamp: '2026-03-06T09:10:00', summary: '整理资讯为可发布摘要', result: '输出 800 字资讯汇总 (Markdown)', workflowName: '资讯采集与推送', status: 'success' },
  { id: 'h4', agentId: 'email', skillId: 'send-notification', timestamp: '2026-03-06T09:12:00', summary: '推送资讯摘要给主人', result: '通知推送成功 → 状态 200', workflowName: '资讯采集与推送', status: 'success' },
  { id: 'h5', agentId: 'image', skillId: 'generate-image', timestamp: '2026-03-06T10:30:00', summary: '生成春日主题插画', result: '1024×1024 PNG 樱花风景图', status: 'success' },
  { id: 'h6', agentId: 'text', skillId: 'pixelate-image', timestamp: '2026-03-06T10:35:00', summary: '对春日插画进行像素化', result: '输出 32×32 像素风格图片', workflowName: '图片处理流水线', status: 'success' },
  { id: 'h7', agentId: 'milk', skillId: 'quality-check', timestamp: '2026-03-06T10:38:00', summary: '检测像素图质量', result: '质量分数: 94/100 通过', workflowName: '图片处理流水线', status: 'success' },
];
