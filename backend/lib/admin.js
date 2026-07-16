'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * admin —— 统一管理员判断(单一数据源)。
 *
 * 替换原先散落三处的白名单:
 *   - routes/admin.js (后端 requireAdmin)
 *   - frontend AuthContext + main.tsx AdminRoute (前端通过 me.role 判断)
 *
 * 管理员邮箱通过 env ADMIN_EMAILS(逗号分隔)配置。
 */

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

async function isAdminUserId(userId) {
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return !!u?.email && isAdminEmail(u.email);
}

module.exports = { getAdminEmails, isAdminEmail, isAdminUserId };
