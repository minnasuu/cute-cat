/**
 * Skill 事件注册表
 * 每个 skill handler 与 data.ts 中 Skill.id 一一对应
 * 当猫咪执行任务时，通过 skillId 查找并调用对应的 handler.execute()
 */
import type { SkillHandler } from './types';

// --- 雪 (xue / analytics) ---
import crawlNews from './crawl-news';
import summarizeNews from './summarize-news';
import queryDashboard from './query-dashboard';
import trendAnalysis from './trend-analysis';

// --- 年年 (email) ---
import sendEmail from './send-email';
import sendNotification from './send-notification';

// --- 阿蓝 (writer) ---
import generateArticle from './generate-article';
import polishText from './polish-text';
import generateOutline from './generate-outline';
import newsToArticle from './news-to-article';

// --- 小虎 (crafts) ---
import generateComponent from './generate-component';
import updateCrafts from './update-crafts';
import layoutDesign from './layout-design';
import cssGenerate from './css-generate';

// --- Pixel (image) ---
import generateImage from './generate-image';
import generateChart from './generate-chart';
import imageEnhance from './image-enhance';

// --- 花椒 (manager) ---
import generateTodo from './generate-todo';
import assignTask from './assign-task';
import reviewApprove from './review-approve';
import siteAnalyze from './site-analyze';
import manageWorkflow from './manage-workflow';
import runWorkflow from './run-workflow';

// --- 黄金 (text) ---

// --- 咪咪 (sing) ---
import taskLog from './task-log';
import meetingNotes from './meeting-notes';

// --- 小白 (milk) ---
import qualityCheck from './quality-check';
import contentReview from './content-review';
import regressionTest from './regression-test';

// --- 发发 (hr) ---
import recruitCat from './recruit-cat';
import teamReview from './team-review';
import catTraining from './cat-training';

// --- 管理员私有 ---
import viewArticles from './admins/view-articles';
import createArticle from './admins/create-article';
import viewCrafts from './admins/view-crafts';
import createCraft from './admins/create-craft';

// --- CAT (default) ---
import aiChat from './ai-chat';

// 直接复用 primitives handler 作为原型技能的 skill handler
import type { PrimitiveHandler } from './primitives/types';
import textToImage from './primitives/text-to-image';
import structuredOutput from './primitives/structured-output';
import apiCall from './primitives/api-call';
import dbQuery from './primitives/db-query';
import emailSend from './primitives/email-send';
import webPush from './primitives/web-push';
import htmlRender from './primitives/html-render';
import chartRender from './primitives/chart-render';
import browserAction from './primitives/browser-action';
import fileIo from './primitives/file-io';
import workflowEngine from './primitives/workflow-engine';
import jsExecute from './primitives/js-execute';

/** 将 PrimitiveHandler 适配为 SkillHandler（补上缺省 config） */
function wrapPrimitive(p: PrimitiveHandler): SkillHandler {
  return {
    id: p.id,
    async execute(ctx) {
      const result = await p.execute({ ...ctx, config: {} });
      return { success: result.success, data: result.data, summary: result.summary, status: result.status };
    },
  };
}

const primitiveSkills: SkillHandler[] = [
  textToImage, structuredOutput, apiCall, dbQuery, emailSend,
  webPush, htmlRender, chartRender, browserAction, fileIo, workflowEngine, jsExecute,
].map(wrapPrimitive);

/** skillId → SkillHandler 映射表 */
const handlers: SkillHandler[] = [
  crawlNews, summarizeNews, queryDashboard, trendAnalysis,
  sendEmail, sendNotification,
  generateArticle, polishText, generateOutline, newsToArticle,
  generateComponent, updateCrafts, layoutDesign, cssGenerate,
  generateImage, generateChart, imageEnhance,
  generateTodo, assignTask, reviewApprove, siteAnalyze, manageWorkflow, runWorkflow, 

  taskLog, meetingNotes,
  qualityCheck, contentReview, regressionTest,
  recruitCat, teamReview, catTraining,
  viewArticles, createArticle, viewCrafts, createCraft,
  aiChat, ...primitiveSkills,
];

export const skillRegistry = new Map<string, SkillHandler>(
  handlers.map((h) => [h.id, h])
);

/** 根据 skillId 获取事件处理器 */
export function getSkillHandler(skillId: string): SkillHandler | undefined {
  return skillRegistry.get(skillId);
}

export type { SkillHandler, SkillContext, SkillResult } from './types';
