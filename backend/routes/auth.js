const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateTokens, verifyToken, authMiddleware } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const router = express.Router();
const prisma = new PrismaClient();

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

// SMTP transporter (reuse email config)
let transporter = null;
function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    });
  }
  return transporter;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ======================== 发送验证码 ========================
router.post('/send-code', async (req, res) => {
  try {
    const { email, type = 'register' } = req.body;
    if (!email) return res.status(400).json({ error: '请输入邮箱' });

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`code:${ip}`, RATE_LIMIT_MAX_CODE)) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 15 分钟后再试' });
    }
    if (!checkRateLimit(`code:${email}`, RATE_LIMIT_MAX_CODE)) {
      return res.status(429).json({ error: '验证码发送过于频繁，请 15 分钟后再试' });
    }

    if (type === 'register') {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(400).json({ error: '该邮箱已注册' });
    }
    if (type === 'reset_password') {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) return res.status(400).json({ error: '该邮箱未注册' });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.emailVerification.create({
      data: { email, code, type, expiresAt },
    });

    // Try to send email, fallback to returning code in dev
    const transport = getTransporter();
    if (transport) {
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      await transport.sendMail({
        from: `"CuCaTopia" <${from}>`,
        to: email,
        subject: type === 'register' ? '欢迎注册 CuCaTopia - 验证码' : 'CuCaTopia - 密码重置验证码',
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8DB889;">
            <svg width="40" height="40" viewBox="40 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;"><path d="M145.691 52.8215C145.381 44.9115 142.811 38.8315 139.861 34.3215C141.431 26.7215 140.541 7.41148 134.851 6.29148C130.171 5.36148 119.191 13.7115 116.351 16.2715C111.131 14.7115 105.911 13.9715 99.8606 13.9715C93.5306 13.9715 88.3106 14.7115 83.3706 16.2715C80.1106 13.1715 71.0606 5.14148 64.9106 6.29148C58.2606 7.51148 58.1106 24.0515 58.8406 33.7115C55.5906 38.7315 53.4506 44.9115 53.1306 51.2315C52.3906 62.7415 57.9206 72.9515 66.7106 78.0715C72.9906 81.7515 75.9406 82.4915 75.9406 82.4915H124.811C124.811 82.4915 127.911 81.1115 132.741 77.4415C140.121 72.0215 146.011 63.4115 145.691 52.8215Z" fill="#FFF"></path><path d="M83.3709 16.2715C88.3109 14.7115 93.5309 13.9715 99.8609 13.9715C102 41.5 78.5 54 53.1309 51.2315C53.4509 44.9115 55.5909 38.7315 58.8409 33.7115C58.1109 24.0515 58.2609 7.51148 64.9109 6.29148C71.0609 5.14148 80.1109 13.1715 83.3709 16.2715Z" fill="#FFF"></path><path d="M139.86 34.3207C142.81 38.8307 145.38 44.9107 145.69 52.8207C125 56 96.5001 41.5 99.8597 13.9707C105.91 13.9707 111.13 14.7107 116.35 16.2707C119.19 13.7107 130.17 5.36067 134.85 6.29067C140.54 7.41067 141.43 26.7207 139.86 34.3207Z" fill="#FFF"></path><path d="M142.83 63.52C138.11 72.32 128.5 87 99.54 85.47C72 84.5 59.5 74 57 65.37C62.11 66.76 75.25 68.29 84.3 59.42C89.3 54.47 90.28 49 98.24 49C106.2 49 107.98 54.92 112.38 59.06C119.45 65.73 130.27 66.42 142.83 63.52Z" fill="#FFF"></path><path d="M75.1904 20.04C76.2104 18.82 68.7904 11.71 66.6504 12.03C63.2904 12.55 63.2904 21.95 63.9104 29.24C64.0204 30.13 72.9104 22.27 75.1904 20.04Z" fill="#FFF"></path><path d="M124.211 20.04C123.191 18.82 130.611 11.71 133.121 12.03C136.171 12.45 136.751 22.11 135.621 29.87C135.471 30.85 127.191 22.81 124.211 20.04Z" fill="#FFF"></path><path d="M83.1722 48C80.7748 48 80 49.8349 80 50.9524C80 52.7492 81.3179 54 83.1722 54C85.3245 54 86 52.2984 86 50.9524C86 49.3587 84.9272 48 83.1722 48Z" fill="#5D4037"></path><path d="M117.023 48C114.731 48 114 49.8868 114 51.0359C114 52.8836 115.299 54 117.023 54C119.112 54 120 52.42 120 51.0359C120 49.6061 118.903 48 117.023 48Z" fill="#5D4037"></path><path d="M97.7509 55.6094H102.061C103.731 55.6094 104 57 102 58.5L100.5 59.5C99.67 59.92 98.3009 59.2194 97.4209 58.4294C95.8509 57.1094 96.0109 55.6094 97.7509 55.6094Z" fill="#5D4037"></path><ellipse cx="73" cy="59" rx="5" ry="3" fill="#FFCCBC" opacity="0.6"></ellipse><ellipse cx="127" cy="59" rx="5" ry="3" fill="#FFCCBC" opacity="0.6"></ellipse><path d="M75.9406 82.4915C75.9406 82.4915 72.9906 81.7515 66.7106 78.0715C57.9206 72.9515 52.3906 62.7415 53.1306 51.2315C53.4506 44.9115 55.5906 38.7315 58.8406 33.7115C58.1106 24.0515 58.2606 7.51148 64.9106 6.29148C71.0606 5.14148 80.1106 13.1715 83.3706 16.2715C88.3106 14.7115 93.5306 13.9715 99.8606 13.9715C105.911 13.9715 111.131 14.7115 116.351 16.2715C119.191 13.7115 130.171 5.36148 134.851 6.29148C140.541 7.41148 141.431 26.7215 139.861 34.3215C142.811 38.8315 145.381 44.9115 145.691 52.8215C146.011 63.4115 140.121 72.0215 132.741 77.4415C127.911 81.1115 124.811 82.4915 124.811 82.4915" fill="none" stroke="#5D4037" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>CuCaTopia</h2>
            <p>你的验证码是：</p>
            <div style="font-size: 32px; font-weight: bold; color: #333; letter-spacing: 8px; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center; margin: 16px 0;">
              ${code}
            </div>
            <p style="color: #999; font-size: 12px;">验证码 10 分钟内有效，请尽快使用。</p>
          </div>
        `,
      });
      res.json({ success: true, message: '验证码已发送到邮箱' });
    } else {
      // Dev mode: return code directly
      res.json({ success: true, message: '验证码已生成（开发模式）', code });
    }
  } catch (err) {
    console.error('[auth] send-code error:', err);
    res.status(500).json({ error: '发送验证码失败' });
  }
});

// ======================== 注册 ========================
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname, code, betaCode } = req.body;
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

    // Check duplicate
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: '该邮箱已注册' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, nickname },
    });
    console.log('[auth] register: user created |', user.id, '|', email, '| hash length:', hashedPassword.length);

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
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`login:${ip}`, RATE_LIMIT_MAX_LOGIN)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    }
    if (!checkRateLimit(`login:${email}`, RATE_LIMIT_MAX_LOGIN)) {
      return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
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
    const { email, password, code } = req.body;
    if (!email || !password || !code) return res.status(400).json({ error: '请填写所有字段' });

    const verification = await prisma.emailVerification.findFirst({
      where: { email, code, type: 'reset_password', used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) return res.status(400).json({ error: '验证码无效或已过期' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { email }, data: { password: hashedPassword } });
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
