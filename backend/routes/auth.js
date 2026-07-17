const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const {
  generateTokens,
  verifyToken,
  authMiddleware,
  setAuthCookies,
  clearAuthCookies,
} = require('../middleware/auth');

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/** 与历史大小写混存数据兼容 */
function findUserByEmailInsensitive(normalizedEmail) {
  return prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });
}

const nodemailer = require('nodemailer');

const router = express.Router();
const prisma = new PrismaClient();
const { ensureWorkbenchTeam } = require('../lib/workbench-seed');
const coins = require('../lib/coins');
const { isAdminEmail } = require('../lib/admin');
const beta = require('../lib/beta');

// ======================== 简易内存速率限制 ========================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 分钟窗口
const RATE_LIMIT_MAX_LOGIN = 10;           // 登录：15 分钟内最多 10 次
const RATE_LIMIT_MAX_CODE = 5;             // 验证码：15 分钟内最多 5 次

function checkRateLimit(key, maxAttempts) {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return true;
  }
  record.count++;
  if (record.count > maxAttempts) return false;
  return true;
}

// 定期清理过期记录（每 30 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
  }
}, 30 * 60 * 1000);

// SMTP transporter (reuse email config; reset on failure to avoid caching broken instance)
let transporter = null;
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
      connectionTimeout: 10000,  // 10s 连接超时
      greetingTimeout: 10000,    // 10s greeting 超时
      socketTimeout: 15000,      // 15s socket 超时
    });
  }
  return transporter;
}
function resetTransporter() {
  if (transporter) {
    try { transporter.close(); } catch (_) { /* ignore */ }
    transporter = null;
  }
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 新手引导演示素材:取管理员用户最新的真实生成结果。
 * 返回 { name, description, plan, lineartUrl, finalUrl, recommendation }
 * 用于引导流程中替代 SVG mock,无需调用 AI。
 */
async function getTourDemoData() {
  const adminUserId = process.env.TOUR_DEMO_USER_ID || 'cf88dd4b-d6e7-49f5-a549-6830937a6879';
  // 找管理员的 team(任一即可)
  const team = await prisma.team.findFirst({ where: { ownerId: adminUserId }, select: { id: true } });
  const teamId = team?.id;
  if (!teamId) return null;

  // 找该 team 下最新的 single 模式产品(需有 images)
  const products = await prisma.lAProduct.findMany({
    where: { teamId, mode: 'single', images: { not: { equals: [] } } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      title: true, description: true, images: true, sections: true,
      materialId: true, fabricComposition: true, colors: true,
    },
  });

  const pick = products.find((p) => {
    const imgs = Array.isArray(p.images) ? p.images : [];
    return imgs.length > 0;
  }) || products[0];
  if (!pick) return null;

  const imgs = Array.isArray(pick.images) ? pick.images : [];
  const lineart = imgs.find((i) => i.slot === 'lineart') || imgs.find((i) => i.slot !== 'final') || imgs[0];
  const final = imgs.find((i) => i.slot === 'final') || imgs[imgs.length - 1];

  // 方案文案:优先用 sections 结构化字段拼接,退而求其次用 description
  let plan = '';
  try {
    const secs = typeof pick.sections === 'string' ? JSON.parse(pick.sections) : pick.sections;
    if (Array.isArray(secs) && secs.length > 0) {
      plan = secs.map((s) => {
        const heading = s.heading ? `**${s.heading}**` : '';
        const body = Array.isArray(s.body) ? s.body.join('\n') : (s.body || '');
        return [heading, body].filter(Boolean).join('\n');
      }).join('\n\n');
    }
  } catch { /* ignore */ }
  if (!plan) plan = pick.description || '';

  // 材质推荐(若该产品关联了材料)
  let recommendation = null;
  if (pick.materialId) {
    const mat = await prisma.lAMaterial.findUnique({
      where: { id: pick.materialId },
      select: { name: true, category: true, texture: true, composition: true, colors: true, originNote: true },
    });
    if (mat) {
      recommendation = {
        name: mat.name || '',
        category: mat.category || '面料',
        texture: mat.texture || '',
        composition: mat.composition || '',
        colors: Array.isArray(mat.colors) ? mat.colors : [],
        reason: mat.originNote || '',
      };
    }
  }

  return {
    name: pick.title || '',
    description: pick.description || '',
    plan,
    lineartUrl: lineart?.url || null,
    finalUrl: final?.url || null,
    recommendation,
  };
}

/** 按指定 productId 取演示素材(用于材料组合/款式裂变等指定演示案例) */
async function getTourDemoByProductId(productId) {
  const pick = await prisma.lAProduct.findUnique({
    where: { id: productId },
    select: {
      title: true, description: true, images: true, sections: true,
      materialId: true, fabricComposition: true, colors: true, mode: true,
    },
  });
  if (!pick) return null;

  const imgs = Array.isArray(pick.images) ? pick.images : [];
  const lineart = imgs.find((i) => i.slot === 'lineart') || imgs.find((i) => i.slot !== 'final') || imgs[0];
  const final = imgs.find((i) => i.slot === 'final') || imgs[imgs.length - 1];

  let plan = '';
  try {
    const secs = typeof pick.sections === 'string' ? JSON.parse(pick.sections) : pick.sections;
    if (Array.isArray(secs) && secs.length > 0) {
      plan = secs.map((s) => {
        const heading = s.heading ? `**${s.heading}**` : '';
        const body = Array.isArray(s.body) ? s.body.join('\n') : (s.body || '');
        return [heading, body].filter(Boolean).join('\n');
      }).join('\n\n');
    }
  } catch { /* ignore */ }
  if (!plan) plan = pick.description || '';

  let recommendation = null;
  if (pick.materialId) {
    const mat = await prisma.lAMaterial.findUnique({
      where: { id: pick.materialId },
      select: { name: true, category: true, texture: true, composition: true, colors: true, originNote: true },
    });
    if (mat) {
      recommendation = {
        name: mat.name || '',
        category: mat.category || '面料',
        texture: mat.texture || '',
        composition: mat.composition || '',
        colors: Array.isArray(mat.colors) ? mat.colors : [],
        reason: mat.originNote || '',
      };
    }
  }

  return {
    name: pick.title || '',
    description: pick.description || '',
    plan,
    lineartUrl: lineart?.url || null,
    finalUrl: final?.url || null,
    recommendation,
    imageUrls: imgs.filter((i) => i.url).map((i) => i.url),
    mode: pick.mode,
  };
}

/** 根据邮箱与充值记录计算角色 */
async function computeRole(userId, email) {
  if (isAdminEmail(email)) return 'admin';
  const hasRecharge = await prisma.coinTransaction.findFirst({
    where: { userId, type: 'recharge' },
    select: { id: true },
  });
  return hasRecharge ? 'member' : 'user';
}

/** 对外暴露的用户对象(含喵币/角色/邀请) */
async function publicUser(userId) {
  // 基础字段(所有环境必存在,不依赖未迁移的新字段)
  const baseSelect = {
    id: true, email: true, nickname: true, avatar: true, role: true, coins: true,
    inviteCode: true, inviteCount: true, invitedById: true, createdAt: true,
  };
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: baseSelect });
    if (u) return { ...u, onboardingDone: false };
    return null;
  } catch (err) {
    // 极端兜底:返回最小对象(绝不 throw)
    console.error('[auth] publicUser:查询失败:', err.message);
    return { id: userId, email: '', nickname: '', role: 'user', coins: 0, onboardingDone: false };
  }
}

// ======================== 公开配置（无需登录）========================
router.get('/public-config', async (_req, res) => {
  try {
    const betaRequired = await beta.isBetaRestricted();
    res.json({ betaRequired });
  } catch (err) {
    console.error('[auth] public-config error:', err);
    // 出错时保守处理:要求内测码(避免无码开放注册)
    res.json({ betaRequired: true });
  }
});

// ======================== 新手引导演示素材（无需登录）========================
// 取真实生成结果作为演示,避免引导时调用 AI 生图。
// 灵感扩散:取管理员最新的 single 产品;
// 材料组合/款式裂变:可通过 ?productId=xxx 指定演示产品。
router.get('/tour-demo', async (req, res) => {
  try {
    const { productId } = req.query;
    let demo = null;
    if (productId) {
      demo = await getTourDemoByProductId(String(productId));
    }
    if (!demo) {
      demo = await getTourDemoData();
    }
    res.json(demo);
  } catch (err) {
    console.error('[auth] tour-demo error:', err);
    res.json(null);
  }
});

// ======================== 发送验证码 ========================
router.post('/send-code', async (req, res) => {
  try {
    const { email: rawEmail, type = 'register' } = req.body;
    const email = normalizeEmail(rawEmail);
    if (!email) return res.status(400).json({ error: '请输入邮箱' });

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`code:${ip}`, RATE_LIMIT_MAX_CODE)) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 15 分钟后再试' });
    }
    if (!checkRateLimit(`code:${email}`, RATE_LIMIT_MAX_CODE)) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 15 分钟后再试' });
    }

    if (type === 'register') {
      const existing = await findUserByEmailInsensitive(email);
      if (existing) return res.status(400).json({ error: '该邮箱已注册' });
    }
    if (type === 'reset_password') {
      const existing = await findUserByEmailInsensitive(email);
      if (!existing) return res.status(400).json({ error: '该邮箱未注册' });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.emailVerification.create({
      data: { email, code, type, expiresAt },
    });

    // Try to send email, fallback to returning code in dev / on SMTP failure
    const transport = getTransporter();
    if (transport) {
      try {
        const from = process.env.SMTP_FROM || process.env.SMTP_USER;
        await transport.sendMail({
          from: `"CuCaTopia" <${from}>`,
          to: email,
          subject: type === 'register' ? '欢迎注册 CuCaTopia - 验证码' : 'CuCaTopia - 密码重置验证码',
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
              <svg width="48" height="48" viewBox="40 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;"><path d="M145.691 52.8215C145.381 44.9115 142.811 38.8315 139.861 34.3215C141.431 26.7215 140.541 7.41148 134.851 6.29148C130.171 5.36148 119.191 13.7115 116.351 16.2715C111.131 14.7115 105.911 13.9715 99.8606 13.9715C93.5306 13.9715 88.3106 14.7115 83.3706 16.2715C80.1106 13.1715 71.0606 5.14148 64.9106 6.29148C58.2606 7.51148 58.1106 24.0515 58.8406 33.7115C55.5906 38.7315 53.4506 44.9115 53.1306 51.2315C52.3906 62.7415 57.9206 72.9515 66.7106 78.0715C72.9906 81.7515 75.9406 82.4915 75.9406 82.4915H124.811C124.811 82.4915 127.911 81.1115 132.741 77.4415C140.121 72.0215 146.011 63.4115 145.691 52.8215Z" fill="#B0A08A"></path><path d="M83.3709 16.2715C88.3109 14.7115 93.5309 13.9715 99.8609 13.9715C102 41.5 78.5 54 53.1309 51.2315C53.4509 44.9115 55.5909 38.7315 58.8409 33.7115C58.1109 24.0515 58.2609 7.51148 64.9109 6.29148C71.0609 5.14148 80.1109 13.1715 83.3709 16.2715Z" fill="#B0A08A"></path><path d="M139.86 34.3207C142.81 38.8307 145.38 44.9107 145.69 52.8207C125 56 96.5001 41.5 99.8597 13.9707C105.91 13.9707 111.13 14.7107 116.35 16.2707C119.19 13.7107 130.17 5.36067 134.85 6.29067C140.54 7.41067 141.43 26.7207 139.86 34.3207Z" fill="#B0A08A"></path><path d="M142.83 63.52C138.11 72.32 128.5 87 99.54 85.47C72 84.5 59.5 74 57 65.37C62.11 66.76 75.25 68.29 84.3 59.42C89.3 54.47 90.28 49 98.24 49C106.2 49 107.98 54.92 112.38 59.06C119.45 65.73 130.27 66.42 142.83 63.52Z" fill="#FFFFFF"></path><path d="M75.1904 20.04C76.2104 18.82 68.7904 11.71 66.6504 12.03C63.2904 12.55 63.2904 21.95 63.9104 29.24C64.0204 30.13 72.9104 22.27 75.1904 20.04Z" fill="#F4B8B8"></path><path d="M124.211 20.04C123.191 18.82 130.611 11.71 133.121 12.03C136.171 12.45 136.751 22.11 135.621 29.87C135.471 30.85 127.191 22.81 124.211 20.04Z" fill="#F4B8B8"></path><path d="M83.1722 48C80.7748 48 80 49.8349 80 50.9524C80 52.7492 81.3179 54 83.1722 54C85.3245 54 86 52.2984 86 50.9524C86 49.3587 84.9272 48 83.1722 48Z" fill="#B2D989"></path><path d="M117.023 48C114.731 48 114 49.8868 114 51.0359C114 52.8836 115.299 54 117.023 54C119.112 54 120 52.42 120 51.0359C120 49.6061 118.903 48 117.023 48Z" fill="#B2D989"></path><path d="M97.7509 55.6094H102.061C103.731 55.6094 104 57 102 58.5L100.5 59.5C99.67 59.92 98.3009 59.2194 97.4209 58.4294C95.8509 57.1094 96.0109 55.6094 97.7509 55.6094Z" fill="#E8998D"></path><ellipse cx="73" cy="59" rx="5" ry="3" fill="#F4B8B8" opacity="0.6"></ellipse><ellipse cx="127" cy="59" rx="5" ry="3" fill="#F4B8B8" opacity="0.6"></ellipse><path d="M75.9406 82.4915C75.9406 82.4915 72.9906 81.7515 66.7106 78.0715C57.9206 72.9515 52.3906 62.7415 53.1306 51.2315C53.4506 44.9115 55.5906 38.7315 58.8406 33.7115C58.1106 24.0515 58.2606 7.51148 64.9106 6.29148C71.0606 5.14148 80.1106 13.1715 83.3706 16.2715C88.3106 14.7115 93.5306 13.9715 99.8606 13.9715C105.911 13.9715 111.131 14.7115 116.351 16.2715C119.191 13.7115 130.171 5.36148 134.851 6.29148C140.541 7.41148 141.431 26.7215 139.861 34.3215C142.811 38.8315 145.381 44.9115 145.691 52.8215C146.011 63.4115 140.121 72.0215 132.741 77.4415C127.911 81.1115 124.811 82.4915 124.811 82.4915" fill="none" stroke="#3E2E1E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
              <h2 style="color: #8DB889;">CuCaTopia</h2>
              <p>你的验证码是：</p>
              <div style="font-size: 32px; font-weight: bold; color: #333; letter-spacing: 8px; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center; margin: 16px 0;">
                ${code}
              </div>
              <p style="color: #999; font-size: 12px;">验证码 10 分钟内有效，请尽快使用。</p>
            </div>
          `,
        });
        res.json({ success: true, message: '验证码已发送到邮箱' });
      } catch (smtpErr) {
        // SMTP 发送失败：重置 transporter 避免缓存坏连接，回退到返回验证码
        console.error('[auth] SMTP send failed, falling back to code-in-response:', smtpErr.message);
        resetTransporter();
        res.json({ success: true, message: '验证码已生成（邮件发送失败，请使用此验证码）', code });
      }
    } else {
      // Dev mode: return code directly
      res.json({ success: true, message: '验证码已生成（开发模式）', code });
    }
  } catch (err) {
    console.error('[auth] send-code error:', err);
    res.status(500).json({ error: '发送验证码失败，请稍后重试' });
  }
});

// ======================== 注册 ========================
router.post('/register', async (req, res) => {
  try {
    const { email: rawEmail, password, nickname, code, betaCode, inviteCode: inviteCodeRaw } = req.body;
    const email = normalizeEmail(rawEmail);
    if (!email || !password || !nickname || !code) {
      return res.status(400).json({ error: '请填写所有必填项' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    // Beta code verification(数据库校验 + 一次性消费)
    if (!betaCode || !String(betaCode).trim()) {
      return res.status(400).json({ error: '请输入内测码' });
    }
    const normalizedBeta = beta.normalizeCode(betaCode);
    if (!normalizedBeta) {
      return res.status(400).json({ error: '内测码无效或已被使用' });
    }

    // Verify code
    const verification = await prisma.emailVerification.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        code,
        type: 'register',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    const existing = await findUserByEmailInsensitive(email);
    if (existing) return res.status(400).json({ error: '该邮箱已注册' });

    // 暂存内测码(创建用户后正式消费)
    const pendingBetaCode = normalizedBeta;

    const hashedPassword = await bcrypt.hash(password, 10);

    // 邀请人(可选,通过邀请码查找)
    let inviter = null;
    const inviteCodeStr = inviteCodeRaw ? String(inviteCodeRaw).trim() : '';
    if (inviteCodeStr) {
      inviter = await coins.findInviterByCode(inviteCodeStr);
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname,
        invitedById: inviter?.id ?? null,
        role: isAdminEmail(email) ? 'admin' : 'user',
      },
    });
    console.log('[auth] register: user created |', user.id, '|', email, '| hash length:', hashedPassword.length);

    // 正式消费内测码(带 userId)
    const finalConsume = await beta.consumeBetaCode(pendingBetaCode, user.id);
    if (!finalConsume.ok) {
      // 消费失败 → 回滚:删除刚创建的用户,提示错误
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      const msg = finalConsume.reason === 'used'
        ? '该内测码已被使用,请换一个重试'
        : '内测码无效或已被使用,请联系管理员获取';
      return res.status(400).json({ error: msg });
    }

    // 生成邀请码
    await coins.ensureInviteCode(user.id);

    // 注册奖励 100 喵币
    await coins.addCoins(user.id, coins.SIGNUP_BONUS, 'signup_bonus', { note: '新用户注册奖励' });

    // 邀请奖励(邀请人 +100,上限 INVITE_MAX)
    if (inviter) {
      const freshInviter = await prisma.user.findUnique({ where: { id: inviter.id }, select: { inviteCount: true } });
      if (freshInviter && freshInviter.inviteCount < coins.INVITE_MAX) {
        await coins.addCoins(inviter.id, coins.INVITE_REWARD, 'invite_reward', { refId: user.id, note: `邀请奖励: ${email}` });
        await prisma.user.update({ where: { id: inviter.id }, data: { inviteCount: { increment: 1 } } });
      }
    }

    try {
      await ensureWorkbenchTeam(prisma, user.id);
    } catch (seedErr) {
      console.error('[auth] workbench seed error:', seedErr);
    }

    // Mark code as used
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    const tokens = generateTokens(user.id);
    setAuthCookies(res, tokens);
    const fullUser = await publicUser(user.id);
    // 确保 role 正确(管理员直接通过校验,不依赖充值)
    if (fullUser && fullUser.role === 'user' && isAdminEmail(fullUser.email)) {
      await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
      fullUser.role = 'admin';
    }
    res.json({ success: true, user: fullUser });
  } catch (err) {
    console.error('[auth] register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// ======================== 登录 ========================
router.post('/login', async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = normalizeEmail(rawEmail);
    if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`login:${ip}`, RATE_LIMIT_MAX_LOGIN)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    }
    if (!checkRateLimit(`login:${email}`, RATE_LIMIT_MAX_LOGIN)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    }

    const user = await findUserByEmailInsensitive(email);
    if (!user) {
      console.warn('[auth] login: user not found |', email);
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    let valid = false;
    try {
      valid = await bcrypt.compare(password, user.password);
    } catch (bcryptErr) {
      console.error('[auth] bcrypt.compare failed:', bcryptErr.message, '| email:', email, '| hash length:', user.password?.length, '| hash prefix:', user.password?.substring(0, 7));
      return res.status(500).json({ error: '密码验证异常，请联系管理员' });
    }
    if (!valid) {
      console.warn('[auth] login: password mismatch | email:', email, '| hash length:', user.password?.length);
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const tokens = generateTokens(user.id);
    setAuthCookies(res, tokens);
    res.json({ success: true, user: await publicUser(user.id) });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// ======================== 忘记密码 ========================
router.post('/reset-password', async (req, res) => {
  try {
    const { email: rawEmail, password, code } = req.body;
    const email = normalizeEmail(rawEmail);
    if (!email || !password || !code) return res.status(400).json({ error: '请填写所有字段' });

    const verification = await prisma.emailVerification.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        code,
        type: 'reset_password',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) return res.status(400).json({ error: '验证码无效或已过期' });

    const userRow = await findUserByEmailInsensitive(email);
    if (!userRow) return res.status(400).json({ error: '该邮箱未注册' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: userRow.id }, data: { password: hashedPassword } });
    await prisma.emailVerification.update({ where: { id: verification.id }, data: { used: true } });

    res.json({ success: true, message: '密码重置成功' });
  } catch (err) {
    console.error('[auth] reset-password error:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// ======================== 刷新 Token ========================
router.post('/refresh-token', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) return res.status(400).json({ error: '缺少 refreshToken' });

    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: '无效的 refreshToken' });

    // 校验用户是否仍然存在
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: '用户不存在' });

    const tokens = generateTokens(decoded.userId);
    setAuthCookies(res, tokens);
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
});

// ======================== 登出 ========================
router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  res.json({ success: true });
});

// ======================== 注销帐号 ========================
// DELETE /api/auth/account —— 删除当前用户及级联数据,清除 cookie。
// 关联清理策略: 级联删除的(CoinTransaction/Team.owner/AICallLog 等)由 DB 自动处理;
// 自引用 invitedById 需手动置空,避免 FK 约束报错。
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    // 1. 解除「我邀请的人」对我的引用(避免自引用 FK 约束)
    await prisma.user.updateMany({
      where: { invitedById: req.userId },
      data: { invitedById: null },
    });

    // 2. 删除用户
    //    - owned Teams → cascade(Wrap TeamCat/Workflow/WorkflowRun/AICallLog/...)
    //    - CoinTransaction, CommunityPost → cascade
    //    - RedemptionCode.usedBy → SetNull
    //    - 若用户是某 WorkflowStep 的引用等,视 cascade 配置自动处理
    await prisma.user.delete({ where: { id: req.userId } });

    clearAuthCookies(res);
    res.json({ success: true });
  } catch (err) {
    console.error('[auth] delete account error:', err);
    res.status(500).json({ error: '注销失败,请稍后重试' });
  }
});

// ======================== 获取当前用户 ========================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    let u = await publicUser(req.userId);
    if (!u) return res.status(404).json({ error: '用户不存在' });
    // 兜底:管理员 email 但 role 未刷为 admin(存量数据)
    if (u.role !== 'admin' && isAdminEmail(u.email)) {
      await prisma.user.update({ where: { id: req.userId }, data: { role: 'admin' } }).catch(() => {});
      u = await publicUser(req.userId);
    }
    res.json(u);
  } catch (err) {
    console.error('[auth] /me error:', err.message, '\n', err.stack);
    res.status(500).json({ error: '获取用户信息失败', detail: err?.message });
  }
});

// ======================== 更新个人信息 ========================
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { nickname, avatar, onboardingDone, newPassword } = req.body;
    const data = {
      ...(nickname && { nickname }),
      ...(avatar !== undefined && { avatar }),
    };
    // onboardingDone:新字段未迁移时忽略(避免 500)
    if (typeof onboardingDone === 'boolean') {
      try { data.onboardingDone = onboardingDone; } catch { /* ignore */ }
    }
    // 改密码(免密场景:仅有 newPassword)
    if (newPassword) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: '新密码至少 6 位' });
      }
      data.password = bcrypt.hashSync(String(newPassword), 10);
    }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, email: true, nickname: true, avatar: true, plan: true, onboardingDone: true },
    }).catch(async (err) => {
      // 新字段未迁移 → 去掉 onboardingDone 重试
      if (String(err.message).includes('onboardingDone') || String(err.message).includes('column')) {
        console.warn('[auth] profile update:新字段未就绪,回退:', err.message);
        delete data.onboardingDone;
        return prisma.user.update({
          where: { id: req.userId },
          data,
          select: { id: true, email: true, nickname: true, avatar: true, plan: true },
        });
      }
      throw err;
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;
