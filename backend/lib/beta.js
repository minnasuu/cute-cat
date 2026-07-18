const { PrismaClient } = require('@prisma/client');

// ─── 字符集 ───
// 去掉易混字符 0/O/I/1,人工抄写时不易混淆
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

const prisma = new PrismaClient();

/** 生成单个随机内测码 */
function generateBetaCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * 归一化用户输入:大写 + 去首尾空格。
 * 大写字母数字码,不区分大小写输入。
 */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * 批量生成内测码。
 * @param {number} n 数量
 * @param {string} [note] 备注
 * @param {string} [createdBy] 管理员 email
 * @returns {Promise<string[]>} 生成的码数组
 */
async function createBetaCodes(n, note = '', createdBy = '') {
  const count = Math.min(Math.max(parseInt(n, 10) || 1, 1), 500);
  const created = [];
  for (let i = 0; i < count; i++) {
    let code;
    let saved = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateBetaCode();
      try {
        await prisma.betaCode.create({
          data: { code, note: note || null, createdBy: createdBy || null },
        });
        created.push(code);
        saved = true;
        break;
      } catch (err) {
        // 真正唯一冲突(PostgreSQL P2002 / 表级 Unique 约束)才重试;
        // 其余错误(表不存在、字段缺失等)必须抛出,避免静默返回 0 个码
        const msg = String(err.message);
        const isUnique = err.code === 'P2002'
          || /Unique constraint/i.test(msg)
          || /duplicate key/i.test(msg);
        if (!isUnique) throw err;
      }
    }
    if (!saved) {
      console.warn(`[beta] failed to generate unique code after retries (i=${i})`);
    }
  }
  return created;
}

/**
 * 校验并一次性消费内测码(原子操作)。
 *
 * 使用 updateMany + used:false 条件,在并发注册场景下保证每个码只被消耗一次:
 * affected rows = 1 → 本请求抢到,0 → 已被他人抢走。
 *
 * @param {string} code 用户输入的码
 * @param {string} userId 注册用户的 id
 * @returns {Promise<{ ok: boolean; reason?: string }>}
 */
async function consumeBetaCode(code, userId) {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { ok: false, reason: 'empty' };
  }

  try {
    const result = await prisma.betaCode.updateMany({
      where: { code: normalized, used: false },
      data: { used: true, usedById: userId, usedAt: new Date() },
    });

    if (result.count === 0) {
      // 不存在 或 已使用:区分一下,便于前端给不同提示
      const existing = await prisma.betaCode.findUnique({
        where: { code: normalized },
        select: { used: true },
      });
      if (!existing) return { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'used' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[beta] consumeBetaCode error:', err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * 检查当前是否开启了内测准入(有未使用的码)。
 * 用于 GET /public-config。
 */
async function isBetaRestricted() {
  const count = await prisma.betaCode.count({ where: { used: false } });
  return count > 0;
}

/**
 * 启动时一次性迁移:若 DB 中没有任何未使用的内测码,且 env BETA_CODES 有值,
 * 则把旧码写入 DB,避免升级后存量旧码失效。
 */
async function migrateLegacyEnvCodes() {
  try {
    const unusedCount = await prisma.betaCode.count({ where: { used: false } });
    if (unusedCount > 0) return { migrated: 0, reason: 'db_has_unused' };

    const envCodes = (process.env.BETA_CODES || '')
      .split(',')
      .map((c) => normalizeCode(c))
      .filter(Boolean);
    if (envCodes.length === 0) return { migrated: 0, reason: 'no_env_codes' };

    let migrated = 0;
    for (const code of envCodes) {
      try {
        await prisma.betaCode.create({
          data: { code, note: '从环境变量迁移(升级存量码)', createdBy: 'system-migration' },
        });
        migrated++;
      } catch (err) {
        if (!String(err.message).includes('Unique') && !String(err.message).includes('code')) throw err;
        // 已存在(存量码被手动导入过),跳过
      }
    }
    if (migrated > 0) {
      `[beta] migrated ${migrated} legacy beta code(s) from env to DB`;
    }
    return { migrated, reason: 'ok' };
  } catch (err) {
    console.error('[beta] migrateLegacyEnvCodes error:', err);
    return { migrated: 0, reason: 'error' };
  }
}

// ─── 管理接口辅助 ───

/** 列表(分页) */
async function listBetaCodes({ page = 1, pageSize = 50 } = {}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeSize = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);

  const [total, rows] = await Promise.all([
    prisma.betaCode.count(),
    prisma.betaCode.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
      select: {
        id: true,
        code: true,
        used: true,
        usedAt: true,
        note: true,
        createdBy: true,
        createdAt: true,
        usedBy: { select: { email: true, nickname: true } },
      },
    }),
  ]);

  return { total, page: safePage, pageSize: safeSize, rows };
}

/** 统计 */
async function betaStats() {
  const [total, used, unused] = await Promise.all([
    prisma.betaCode.count(),
    prisma.betaCode.count({ where: { used: true } }),
    prisma.betaCode.count({ where: { used: false } }),
  ]);
  return { total, used, unused };
}

/** 删除未使用的码 */
async function deleteBetaCode(id) {
  const record = await prisma.betaCode.findUnique({ where: { id } });
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.used) return { ok: false, reason: 'already_used' };
  await prisma.betaCode.delete({ where: { id } });
  return { ok: true };
}

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateBetaCode,
  normalizeCode,
  createBetaCodes,
  consumeBetaCode,
  isBetaRestricted,
  migrateLegacyEnvCodes,
  listBetaCodes,
  betaStats,
  deleteBetaCode,
};
