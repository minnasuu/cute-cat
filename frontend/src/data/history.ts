import type { HistoryItem } from './types';

export const workHistory: HistoryItem[] = [
  // --- 3/6 ---
  { id: 'h2', agentId: 'analyst', skillId: 'crawl-news', timestamp: '2026-03-06T09:05:00', summary: '爬取 UX/设计领域最新资讯', result: '获取 12 条资讯 (CSS新特性/设计趋势)', workflowName: '资讯采集与推送', status: 'success' },
  { id: 'h5', agentId: 'designer', skillId: 'generate-image', timestamp: '2026-03-06T10:30:00', summary: '生成春日主题插画', result: '1024×1024 PNG 樱花风景图', status: 'success' },
  { id: 'h6', agentId: 'designer', skillId: 'image-enhance', timestamp: '2026-03-06T10:35:00', summary: '对春日插画进行增强处理', result: '输出高分辨率增强图片', workflowName: '图片处理流水线', status: 'success' },
];
