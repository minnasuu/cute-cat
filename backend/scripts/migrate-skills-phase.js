'use strict';

/**
 * 一次性迁移脚本：把 LASkillArticle.category 从旧 Laisse Ancie 6 分类
 * (design/craft/fabric/sourcing/brand/ops) 迁移到 Fashion AI Studio 10 phase。
 *
 * 用法：
 *   node backend/scripts/migrate-skills-phase.js            # 正式迁移
 *   node backend/scripts/migrate-skills-phase.js --dry-run  # 仅打印，不写库
 *
 * 幂等：已是新 phase id 的文章跳过；重跑不会 double-update。
 */

const { PrismaClient } = require('@prisma/client');
const { LEGACY_TO_PHASE, ALL_PHASE_IDS } = require('../data/skill-phases');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const all = await prisma.lASkillArticle.findMany({ select: { id: true, category: true } });

  const buckets = new Map();
  for (const id of ALL_PHASE_IDS) buckets.set(id, []);
  buckets.set('__legacy__', []);
  buckets.set('__unknown__', []);

  for (const a of all) {
    if (ALL_PHASE_IDS.includes(a.category)) {
      buckets.get(a.category).push(a.id);
    } else if (LEGACY_TO_PHASE[a.category]) {
      buckets.get('__legacy__').push({ id: a.category, to: LEGACY_TO_PHASE[a.category] });
    } else {
      buckets.get('__unknown__').push({ id: a.id, category: a.category });
    }
  }

  console.log(`[migrate-skills] 共 ${all.length} 篇文章`);
  console.log(`[migrate-skills] 已是新 phase：${ALL_PHASE_IDS.map((id) => `${id}=${buckets.get(id).length}`).join(', ')}`);
  console.log(`[migrate-skills] 旧 key 待迁移：${buckets.get('__legacy__').length}`);
  console.log(`[migrate-skills] 未知 key（不迁移）：${buckets.get('__unknown__').length}`);
  if (buckets.get('__unknown__').length > 0) {
    const unknownCats = [...new Set(buckets.get('__unknown__').map((x) => x.category))];
    console.log(`[migrate-skills]   未知 category 值：${unknownCats.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('[migrate-skills] --dry-run，跳过写库');
    for (const entry of buckets.get('__legacy__')) {
      console.log(`[migrate-skills]   将迁移：${entry.id} → ${entry.to}`);
    }
    return;
  }

  // 按目标 phase 分组批量 updateMany
  const byTarget = new Map();
  for (const entry of buckets.get('__legacy__')) {
    if (!byTarget.has(entry.to)) byTarget.set(entry.to, []);
    byTarget.get(entry.to).push(entry.id);
  }

  let migrated = 0;
  for (const [targetPhase, ids] of byTarget.entries()) {
    if (ids.length === 0) continue;
    const r = await prisma.lASkillArticle.updateMany({
      where: { id: { in: ids } },
      data: { category: targetPhase },
    });
    migrated += r.count;
    console.log(`[migrate-skills]   ${targetPhase}: ${r.count} 篇已迁移`);
  }
  console.log(`[migrate-skills] 迁移完成，共 ${migrated} 篇`);
}

main()
  .catch((err) => {
    console.error('[migrate-skills] 失败：', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
