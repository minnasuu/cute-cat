const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateTokens, verifyToken, authMiddleware } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const router = express.Router();
const prisma = new PrismaClient();

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
        from: `"Cute Cat 🐱" <${from}>`,
        to: email,
        subject: type === 'register' ? '欢迎注册 Cute Cat - 验证码' : 'Cute Cat - 密码重置验证码',
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8DB889;">🐱 Cute Cat</h2>
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

    // Mark code as used
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    const tokens = generateTokens(user.id);
    res.json({
      success: true,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, plan: user.plan },
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: '邮箱或密码错误' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: '邮箱或密码错误' });

    const tokens = generateTokens(user.id);
    res.json({
      success: true,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, plan: user.plan },
      ...tokens,
    });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: '登录失败' });
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
