/**
 * safeQuery —— Prisma 查询安全包装器。
 *
 * 背景:代码已引用新字段(onboardingDone 等),但数据库迁移可能尚未落地。
 * Prisma Client 生成的类型包含新字段,查询时若未显式 select 基础字段,Prisma 会
 * 自动 SELECT 所有字段 → P2022 column does not exist。
 *
 * 方案:所有 prisma.user 查询必须显式 select 基础字段(见 BASE_SELECT)。
 * 本模块提供 safeUserQuery 辅助,统一基础字段列表。
 */

const BASE_USER_SELECT = {
  id: true, email: true, password: true, nickname: true, avatar: true,
  plan: true, aiQuota: true, aiUsed: true, role: true, coins: true,
  inviteCode: true, invitedById: true, inviteCount: true,
  createdAt: true, updatedAt: true,
};

/**
 * 安全查询用户:显式 select 基础字段,避免 P2022。
 * 返回结果不含 onboardingDone 等新字段(迁移前返回 undefined)。
 */
async function safeUserFindUnique(prisma, where) {
  return prisma.user.findUnique({ where, select: BASE_USER_SELECT });
}

async function safeUserFindFirst(prisma, where) {
  return prisma.user.findFirst({ where, select: BASE_USER_SELECT });
}

async function safeUserFindMany(prisma, args) {
  return prisma.user.findMany({ ...args, select: BASE_USER_SELECT });
}

module.exports = {
  BASE_USER_SELECT,
  safeUserFindUnique,
  safeUserFindFirst,
  safeUserFindMany,
};
