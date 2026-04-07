const jwt = require('jsonwebtoken');

const DEFAULT_SECRET = 'cute-cat-secret-key-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
const JWT_EXPIRES_IN = '7d';
const JWT_REFRESH_EXPIRES_IN = '30d';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

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

function cookieBaseOptions() {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = cookieBaseOptions();
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/' });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: '/api/auth' });
}

function clearAuthCookies(res) {
  const base = cookieBaseOptions();
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
}

function getAccessTokenFromRequest(req) {
  if (req.cookies && req.cookies[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return null;
}

function authMiddleware(req, res, next) {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
    }
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

module.exports = {
  generateTokens,
  verifyToken,
  authMiddleware,
  JWT_SECRET,
  setAuthCookies,
  clearAuthCookies,
  getAccessTokenFromRequest,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
};
