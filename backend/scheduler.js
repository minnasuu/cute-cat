/**
 * 后端定时工作流调度器
 *
 * 服务启动后常驻运行，每 15 秒扫描一次数据库中的定时工作流，
 * 根据 cron 规则判断是否到了执行时间，到时自动调用 executeWorkflow。
 * 取代前端浏览器中的 setInterval 调度，网页关闭后依然有效。
 */
const { PrismaClient } = require('@prisma/client');
const { executeWorkflow } = require('./workflow-executor');

const prisma = new PrismaClient();

const CHECK_INTERVAL = 15_000; // 15 秒检查一次
const runningSet = new Set();  // 防止同一工作流并行执行

/* ─── 自然语言 cron 解析 → 判断「现在是否该执行」 ─── */
function parseCronRule(cron) {
  if (!cron || !cron.trim()) return null;
  const s = cron.trim();

  // 每 N 分钟
  const minMatch = s.match(/每\s*(\d+)\s*分钟/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return { shouldRun: (now) => now.getMinutes() % mins === 0 && now.getSeconds() < 30 };
  }

  // 每 N 小时
  const hourMatch = s.match(/每\s*(\d+)\s*小时/);
  if (hourMatch) {
    const hrs = parseInt(hourMatch[1], 10);
    return { shouldRun: (now) => now.getHours() % hrs === 0 && now.getMinutes() === 0 && now.getSeconds() < 30 };
  }

  // 每小时
  if (/每小时/.test(s)) {
    return { shouldRun: (now) => now.getMinutes() === 0 && now.getSeconds() < 30 };
  }

  // 提取时间 HH:MM
  const timeMatch = s.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? parseInt(timeMatch[1], 10) : -1;
  const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;

  const timeOk = (now) => now.getHours() === hour && now.getMinutes() === minute && now.getSeconds() < 30;

  // 每天
  if (/每天|每日/.test(s) && hour >= 0) {
    return { shouldRun: timeOk };
  }

  // 工作日
  if (/工作日/.test(s) && hour >= 0) {
    return { shouldRun: (now) => { const d = now.getDay(); return d >= 1 && d <= 5 && timeOk(now); } };
  }

  // 每周X
  const weekMap = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const weekMatch = s.match(/每?周([一二三四五六日天])/);
  if (weekMatch && hour >= 0) {
    const dayOfWeek = weekMap[weekMatch[1]] ?? -1;
    return { shouldRun: (now) => now.getDay() === dayOfWeek && timeOk(now) };
  }

  // 每月N号
  const monthMatch = s.match(/每月\s*(\d{1,2})\s*[号日]/);
  if (monthMatch && hour >= 0) {
    const dayOfMonth = parseInt(monthMatch[1], 10);
    return { shouldRun: (now) => now.getDate() === dayOfMonth && timeOk(now) };
  }

  // 仅有时间，默认每天
  if (hour >= 0) {
    return { shouldRun: timeOk };
  }

  return null;
}

/* ─── 调度器主循环 ─── */
let timer = null;

async function checkAndRun() {
  try {
    // 查询所有启用的定时工作流
    const workflows = await prisma.workflow.findMany({
      where: {
        trigger: 'cron',
        enabled: true,
        cron: { not: null },
      },
    });

    if (workflows.length === 0) return;

    const now = new Date();

    for (const wf of workflows) {
      if (runningSet.has(wf.id)) continue; // 防止重入

      const rule = parseCronRule(wf.cron);
      if (!rule || !rule.shouldRun(now)) continue;

      // 到时间了，异步执行（不阻塞检查循环）
      runningSet.add(wf.id);
      console.log(`[scheduler] ⏰ 触发定时工作流: "${wf.name}" (${wf.id})`);

      // 获取团队 owner 作为 triggeredBy
      const team = await prisma.team.findUnique({ where: { id: wf.teamId }, select: { ownerId: true } }).catch(() => null);

      executeWorkflow(wf, team?.ownerId || null)
        .then(result => {
          console.log(`[scheduler] ✅ 工作流 "${wf.name}" 执行完成: ${result.status}`);
        })
        .catch(err => {
          console.error(`[scheduler] ❌ 工作流 "${wf.name}" 执行异常:`, err.message);
        })
        .finally(() => {
          runningSet.delete(wf.id);
        });
    }
  } catch (err) {
    console.error('[scheduler] 调度检查异常:', err.message);
  }
}

function startScheduler() {
  if (timer) return; // 已启动
  console.log(`[scheduler] 🕐 定时调度器已启动，每 ${CHECK_INTERVAL / 1000}s 检查一次`);
  timer = setInterval(checkAndRun, CHECK_INTERVAL);
  // 启动时立即检查一次
  checkAndRun();
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[scheduler] 调度器已停止');
  }
}

module.exports = { startScheduler, stopScheduler, parseCronRule };
