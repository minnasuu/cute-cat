'use strict';

/**
 * 一次性清理脚本：删除旧 seed 文章（skill-seed-1 … skill-seed-8）。
 *
 * 背景：知识库不再预置任何示例/占位文章，由用户从空沉淀。
 * 前端 store.refresh 已包含自愈式迁移（加载时自动删），本脚本作为兜底/主动清理手段。
 *
 * 仅删除 id 为 skill-seed-1 … skill-seed-8 的行；用户自建文章（其他 id）完全不受影响。
 *
 * 用法：
 *   node backend/scripts/delete-legacy-skill-seeds.js            # 正式删除
 *   node backend/scripts/delete-legacy-skill-seeds.js --dry-run  # 仅打印，不写库
 *
 * 幂等：重复运行无副作用（已删除的行跳过）。
 */

const { PrismaClient } = require('@prisma/client');

const LEGACY_SEED_IDS = [
  'skill-seed-1', 'skill-seed-2', 'skill-seed-3', 'skill-seed-4',
  'skill-seed-5', 'skill-seed-6', 'skill-seed-7', 'skill-seed-8',
];

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const found = await prisma.lASkillArticle.findMany({
    where: { id: { in: LEGACY_SEED_IDS } },
    select: { id: true, zhTitle: true, category: true },
  });

  console.log(`[delete-legacy-seeds] 命中旧 seed 文章：${found.length} / ${LEGACY_SEED_IDS.length}`);
  for (const a of found) {
    console.log(`[delete-legacy-seeds]   - ${a.id}  ${a.zhTitle}  (${a.category})`);
  }

  if (found.length === 0) {
    console.log('[delete-legacy-seeds] 无需清理，退出');
    return;
  }

  if (DRY_RUN) {
    console.log('[delete-legacy-seeds] --dry-run，跳过写库');
    return;
  }

  const r = await prisma.lASkillArticle.deleteMany({
    where: { id: { in: LEGACY_SEED_IDS } },
  });
  console.log(`[delete-legacy-seeds] 已删除 ${r.count} 篇旧 seed 文章`);
}

main()
  .catch((err) => {
    console.error('[delete-legacy-seeds] 失败：', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
