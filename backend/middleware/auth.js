const jwt = require('jsonwebtoken');

const DEFAULT_SECRET = 'cute-cat-secret-key-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
const JWT_EXPIRES_IN = '7d';
const JWT_REFRESH_EXPIRES_IN = '30d';

// 生产环境必须设置自定义 JWT_SECRET
if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_SECRET) {
  console.error('⚠️  [SECURITY] JWT_SECRET is using default value in production! Please set a strong JWT_SECRET environment variable.');
}

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

module.exports = { generateTokens, verifyToken, authMiddleware, JWT_SECRET };
