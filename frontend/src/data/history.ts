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
  // --- 3/5 ---
  { id: 'h8', agentId: 'writer', skillId: 'generate-article', timestamp: '2026-03-05T14:00:00', summary: '撰写技术博客: React 19 新特性', result: '输出 2,400 字长文 (Markdown)', workflowName: '文章发布', status: 'success' },
  { id: 'h9', agentId: 'image', skillId: 'generate-image', timestamp: '2026-03-05T14:10:00', summary: '为博客生成配图', result: '1024×1024 PNG 科技风格配图', workflowName: '文章发布', status: 'success' },
  { id: 'h10', agentId: 'crafts', skillId: 'layout-design', timestamp: '2026-03-05T14:15:00', summary: '排版为文章页面', result: '输出响应式 HTML 博客页', workflowName: '文章发布', status: 'success' },
  { id: 'h11', agentId: 'email', skillId: 'send-notification', timestamp: '2026-03-05T14:20:00', summary: '推送博客发布通知', result: '通知 128 位订阅者', workflowName: '文章发布', status: 'success' },
  { id: 'h12', agentId: 'sing', skillId: 'task-log', timestamp: '2026-03-05T16:00:00', summary: '整理本周任务执行日志', result: '输出任务日志 (12 条执行记录)', workflowName: '任务日志与分配', status: 'success' },
  { id: 'h13', agentId: 'crafts', skillId: 'css-generate', timestamp: '2026-03-05T16:30:00', summary: '为音乐播放页生成动画样式', result: '输出 SCSS 含波形动画', workflowName: '音乐视频制作', status: 'success' },
  // --- 3/4 ---
  { id: 'h14', agentId: 'analytics', skillId: 'trend-analysis', timestamp: '2026-03-04T10:00:00', summary: '分析二月份用户增长趋势', result: 'MAU +18%，异常点: 2/14 流量峰值', workflowName: '数据周报', status: 'success' },
  { id: 'h15', agentId: 'analytics', skillId: 'crawl-news', timestamp: '2026-03-04T10:30:00', summary: '爬取本周设计资讯', result: '获取 15 条资讯 (Figma更新/AI设计工具)', status: 'success' },
  { id: 'h16', agentId: 'image', skillId: 'generate-chart', timestamp: '2026-03-04T11:00:00', summary: '生成月度趋势折线图', result: '输出 PNG 折线图 (UV/PV/转化率)', workflowName: '数据周报', status: 'success' },
  { id: 'h17', agentId: 'writer', skillId: 'polish-text', timestamp: '2026-03-04T11:30:00', summary: '润色创意企划文案', result: '可读性提升 35%，语气更活泼', status: 'success' },
  { id: 'h18', agentId: 'manager', skillId: 'review-approve', timestamp: '2026-03-04T11:45:00', summary: '审批文章发布方案', result: '审批通过 → 安排 3/7 发布', status: 'success' },
  { id: 'h19', agentId: 'milk', skillId: 'content-review', timestamp: '2026-03-04T15:00:00', summary: '审核博客文章合规性', result: '审核结果: safe (无敏感内容)', status: 'success' },
  { id: 'h20', agentId: 'text', skillId: 'ocr-extract', timestamp: '2026-03-04T16:00:00', summary: '从产品截图中提取文字', result: '识别 320 字 (准确率 97%)', status: 'success' },
  { id: 'h21', agentId: 'milk', skillId: 'regression-test', timestamp: '2026-03-04T17:00:00', summary: '对 Crafts 组件执行回归测试', result: '12 项测试，11 通过，1 警告', workflowName: 'Crafts 更新', status: 'warning' },
  { id: 'h22', agentId: 'sing', skillId: 'meeting-notes', timestamp: '2026-03-04T18:00:00', summary: '生成周会会议纪要', result: '输出会议纪要 (5 项议题/3 项待办)', status: 'success' },
  { id: 'h23', agentId: 'crafts', skillId: 'update-crafts', timestamp: '2026-03-04T19:00:00', summary: '新增交互动画 Craft 组件', result: '输出 Craft: 粒子动画 demo', workflowName: 'Crafts 更新', status: 'success' },
  { id: 'h24', agentId: 'email', skillId: 'manage-subscribers', timestamp: '2026-03-04T20:00:00', summary: '清理无效订阅者', result: '移除 12 个无效邮箱，剩余 128 人', status: 'success' },
];
