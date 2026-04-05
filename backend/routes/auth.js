const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateTokens, verifyToken, authMiddleware } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const router = express.Router();
const prisma = new PrismaClient();
const { ensureWorkbenchTeam } = require('../lib/workbench-seed');

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

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// ======================== 发送验证码 ========================
router.post('/send-code', async (req, res) => {
  try {
    const { type = 'register' } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ error: '请输入邮箱' });

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`code:${ip}`, RATE_LIMIT_MAX_CODE)) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 15 分钟后再试' });
    }
    if (!checkRateLimit(`code:${email}`, RATE_LIMIT_MAX_CODE)) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 15 分钟后再试' });
    }

    if (type === 'register') {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (existing) return res.status(400).json({ error: '该邮箱已注册' });
    }
    if (type === 'reset_password') {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
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
              <h2 style="color: #8DB889;">CuCaTopia 🐱</h2>
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
    const { password, nickname, code, betaCode } = req.body;
    const email = normalizeEmail(req.body.email);
    if (!email || !password || !nickname || !code) {
      return res.status(400).json({ error: '请填写所有必填项' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    // Beta code verification
    const betaCodes = (process.env.BETA_CODES || '').split(',').map(c => c.trim()).filter(Boolean);
    if (betaCodes.length > 0) {
      if (!betaCode || !betaCodes.includes(betaCode.trim())) {
        return res.status(400).json({ error: '内测码无效，请联系管理员获取' });
      }
    }

    // Verify code
    const verification = await prisma.emailVerification.findFirst({
      where: { email, code, type: 'register', used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    // Check duplicate (case-insensitive; new rows store lowercase)
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) return res.status(400).json({ error: '该邮箱已注册' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, nickname },
    });
    console.log('[auth] register: user created |', user.id, '|', email, '| hash length:', hashedPassword.length);

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
    res.json({
      success: true,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, plan: user.plan, aiQuota: user.aiQuota, aiUsed: user.aiUsed },
      ...tokens,
    });
  } catch (err) {
    console.error('[auth] register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// ======================== 登录 ========================
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`login:${ip}`, RATE_LIMIT_MAX_LOGIN)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    }
    if (!checkRateLimit(`login:${email}`, RATE_LIMIT_MAX_LOGIN)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
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
    res.json({
      success: true,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, plan: user.plan, aiQuota: user.aiQuota, aiUsed: user.aiUsed },
      ...tokens,
    });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// ======================== 忘记密码 ========================
router.post('/reset-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password, code } = req.body;
    if (!email || !password || !code) return res.status(400).json({ error: '请填写所有字段' });

    const verification = await prisma.emailVerification.findFirst({
      where: { email, code, type: 'reset_password', used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) return res.status(400).json({ error: '验证码无效或已过期' });

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) return res.status(400).json({ error: '该邮箱未注册' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
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
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: '缺少 refreshToken' });

    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: '无效的 refreshToken' });

    // 校验用户是否仍然存在
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: '用户不存在' });

    const tokens = generateTokens(decoded.userId);
    res.json({ success: true, ...tokens });
  } catch (err) {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
});

// ======================== 获取当前用户 ========================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, nickname: true, avatar: true, plan: true, aiQuota: true, aiUsed: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// ======================== 更新个人信息 ========================
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { ...(nickname && { nickname }), ...(avatar !== undefined && { avatar }) },
      select: { id: true, email: true, nickname: true, avatar: true, plan: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;
