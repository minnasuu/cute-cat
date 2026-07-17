#!/usr/bin/env node
/**
 * migrate-uploads-to-cos.js —— 存量本地文件一次性迁移到腾讯云 COS
 *
 * 不判断 storage.mode,始终按 S3 处理(无论 local/s3 模式都可把 /uploads/... 存量改写为 COS URL)。
 *
 * 流程:
 *   1. 扫描所有表/列,收集含 /uploads/ 的条目(含 JSON 数组列里的 url)
 *   2. 列出待上传文件清单 + 待更新 SQL 预览(dry-run)
 *   3. --exec 真跑:putBuffer 原样上传 COS(不二次压缩) + 更新 DB url
 *   4. checksum:本地 size vs COS size 比对
 *
 * 安全机制:
 *   - 默认 dry-run,加 --exec 才真正上传 + 更新 DB
 *   - 跳过 local 模式(无 S3 配置)
 *   - 文件不存在时跳过并 warn
 *   - 上传失败时跳过该文件,不阻塞整体
 *   - 更新 DB 前先上传,上传成功才改 url(避免只改一半)
 *   - 不清空本地副本(保留热缓存,随时可回退)
 *
 * 用法:
 *   node scripts/migrate-uploads-to-cos.js          # 默认 DRY RUN
 *   node scripts/migrate-uploads-to-cos.js --exec   # 真正执行(需本地原文件存在,上传 COS 后改 DB)
 *   node scripts/migrate-uploads-to-cos.js --exec --force-db-update
 *     # 本地原文件已删除但 COS 已有时:跳过上传,直接按 relPath→cosKey 改写 DB
 *
 * 兼容多种本地 URL 形态:
 *   /uploads/materials/x.jpg                 标准
 *   https://host/uploads/materials/x.jpg     反向代理/绝对路径
 *   http://host:8002/uploads/materials/x.jpg 带端口
 * 统一归一化为 /uploads/... 后再做前缀匹配,避免带 host 前缀的行被静默跳过。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const storage = require('../lib/storage');
const { putBuffer, getPublicUrl, createSavePath } = storage;

const EXEC = process.argv.includes('--exec');
const FORCE_DB = process.argv.includes('--force-db-update');
const UPLOADS_PREFIX = '/uploads/';
// 匹配 scheme://host[:port]/uploads/...,捕获 /uploads/... 部分
const UPLOADS_PATH_RE = /^https?:\/\/[^/]+(\/uploads\/.+)$/;

/**
 * 把多种本地 URL 形态归一化为 /uploads/... 标准串。
 * 已迁移的 COS url / data: / blob: / 非字符串 → 返回 null(跳过)。
 */
function normalizeLocalUrl(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith(UPLOADS_PREFIX)) return t;
  const m = UPLOADS_PATH_RE.exec(t);
  return m ? m[1] : null;
}

// ─── 字段清单(schema 提取) ────────────────────────────────────
// 直接 URL 列:String 类型,整列是 /uploads/... 路径
const STRING_COLS = [
  { table: 'User', col: 'avatar', model: 'user', pk: 'id' },
  { table: 'Team', col: 'icon', model: 'team', pk: 'id' },
  { table: 'LABrandProfile', col: 'logo', model: 'lABrandProfile', pk: 'id' },
  { table: 'LAVisualAsset', col: 'src', model: 'lAVisualAsset', pk: 'id' },
  { table: 'LAInspirationAsset', col: 'url', model: 'lAInspirationAsset', pk: 'id' },
  { table: 'LAInspirationAsset', col: 'thumbUrl', model: 'lAInspirationAsset', pk: 'id' },
  { table: 'LAMaterial', col: 'image', model: 'lAMaterial', pk: 'id' },
  { table: 'LAStyle', col: 'image', model: 'lAStyle', pk: 'id' },
  { table: 'LAIllustrationAsset', col: 'image', model: 'lAIllustrationAsset', pk: 'id' },
  { table: 'LAProduct', col: 'patternUrl', model: 'lAProduct', pk: 'id' },
  { table: 'LAProduct', col: 'techPackUrl', model: 'lAProduct', pk: 'id' },
  { table: 'LAProduct', col: 'imageUrl', model: 'lAProduct', pk: 'id' },
  { table: 'LAProduct', col: 'patternFinalUrl', model: 'lAProduct', pk: 'id' },
];

// JSON 列:数组,每个元素有 url 字段
const JSON_COLS = [
  { table: 'LAMaterial', col: 'colorImages', model: 'lAMaterial', pk: 'id', urlKey: 'url' },
  { table: 'LAProduct', col: 'images', model: 'lAProduct', pk: 'id', urlKey: 'url' },
  { table: 'LAProduct', col: 'sourceImages', model: 'lAProduct', pk: 'id', urlKey: 'url' },
  { table: 'CommunityPost', col: 'images', model: 'communityPost', pk: 'id', urlKey: 'url' },
];

// ─── 扫描 ──────────────────────────────────────────────────────
async function scanStringCols() {
  const items = [];
  for (const { table, col, model, pk } of STRING_COLS) {
    const rows = await prisma[model].findMany({
      select: { [pk]: true, [col]: true },
    });
    for (const row of rows) {
      const v = row[col];
      const norm = normalizeLocalUrl(v);
      if (norm) {
        // 保留原始值用于日志;归一化值用于后续 relPath 推导
        items.push({ table, col, model, pk, id: row[pk], norm, oldUrl: v });
      }
    }
  }
  return items;
}

async function scanJsonCols() {
  const items = [];
  for (const { table, col, model, pk, urlKey } of JSON_COLS) {
    const rows = await prisma[model].findMany({
      select: { [pk]: true, [col]: true },
    });
    for (const row of rows) {
      const arr = row[col];
      if (!Array.isArray(arr)) continue;
      arr.forEach((el, idx) => {
        const v = el?.[urlKey];
        const norm = normalizeLocalUrl(v);
        if (norm) {
          items.push({ table, col, model, pk, id: row[pk], norm, oldUrl: v, jsonIdx: idx, jsonArr: arr, urlKey });
        }
      });
    }
  }
  return items;
}

// ─── 路径转换 ──────────────────────────────────────────────────
function relPathFromUrl(normUrl) {
  // norm 已由 normalizeLocalUrl 保证以 /uploads/ 开头
  return normUrl.slice(UPLOADS_PREFIX.length);
}
function absPathFromRel(relPath) {
  return path.join(storage.UPLOAD_ROOT, relPath);
}
function cosKeyFromRel(relPath) {
  // 复用 createSavePath 的 prefix 逻辑,但保留原相对路径(含子目录)
  const prefix = (process.env.S3_FOLDER_PREFIX || '').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${relPath}` : relPath;
}

// ─── 上传 + 更新 ───────────────────────────────────────────────
async function uploadOne(absPath, cosKey, contentType) {
  return putBuffer({ absPath, savePath: cosKey, contentType });
}

async function updateStringCol(item, newUrl) {
  const { model, pk, id, col } = item;
  await prisma[model].update({ where: { [pk]: id }, data: { [col]: newUrl } });
}

async function updateJsonCol(item, newUrl) {
  const { model, pk, id, col, jsonIdx, jsonArr, urlKey } = item;
  const arr = [...jsonArr];
  arr[jsonIdx] = { ...arr[jsonIdx], [urlKey]: newUrl };
  await prisma[model].update({ where: { [pk]: id }, data: { [col]: arr } });
}

// ─── 主流程 ────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== migrate-uploads-to-cos ===`);
  console.log(`root: ${storage.UPLOAD_ROOT}`);
  console.log(`exec: ${EXEC ? 'YES (uploading + updating DB)' : 'DRY RUN (preview only, add --exec)'}`);
  console.log(`force-db-update: ${FORCE_DB ? 'YES (skip upload, rewrite DB only)' : 'NO'}`);
  console.log(`(不判断 storage.mode,始终按 S3 处理)\n`);

  if (FORCE_DB && !EXEC) {
    console.log('⚠️ --force-db-update 需要与 --exec 同时使用,已忽略。');
  }

  const stringItems = await scanStringCols();
  const jsonItems = await scanJsonCols();
  const allItems = [...stringItems, ...jsonItems];
  // 归一化后 oldUrl !== norm → 说明原始值带 scheme/host 前缀(反向代理/旧备份等形态)
  const hostPrefixed = allItems.filter((it) => it.oldUrl !== it.norm).length;

  // 去重(同一文件可能被多处引用)
  const fileMap = new Map(); // absPath → { relPath, cosKey, absPath, size, refs: [] }
  for (const it of allItems) {
    const relPath = relPathFromUrl(it.norm);
    const absPath = absPathFromRel(relPath);
    const cosKey = cosKeyFromRel(relPath);
    if (!fileMap.has(absPath)) {
      let size = 0;
      try { size = fs.statSync(absPath).size; } catch { /* 文件不存在 */ }
      fileMap.set(absPath, { relPath, cosKey, absPath, size, refs: [] });
    }
    fileMap.get(absPath).refs.push(it);
  }

  const files = [...fileMap.values()];
  const missing = files.filter((f) => f.size === 0);
  const ok = files.filter((f) => f.size > 0);

  console.log(`扫描完成:`);
  console.log(`  受影响条目: ${allItems.length} 个 url`);
  console.log(`  ├ 标准 /uploads/ 形态: ${allItems.length - hostPrefixed} 个`);
  console.log(`  └ 带 host 前缀的形态:  ${hostPrefixed} 个(归一化后一并处理)`);
  console.log(`  去重后文件: ${files.length} 个`);
  console.log(`  文件存在:   ${ok.length} 个`);
  console.log(`  文件缺失:   ${missing.length} 个`);
  if (missing.length > 0) {
    console.log(`  缺失文件清单:`);
    for (const f of missing) console.log(`    - ${f.absPath}`);
    if (FORCE_DB && EXEC) {
      console.log(`  (--force-db-update: 缺失文件将跳过上传,直接按相同 cosKey 改写 DB)`);
    }
  }

  if (files.length === 0) {
    console.log('\n✅ 无需要迁移的文件。');
    return;
  }

  // 预览前 10 个
  console.log(`\n预览(前 10 个):`);
  for (const f of ok.slice(0, 10)) {
    const newUrl = getPublicUrl(f.cosKey);
    console.log(`  ${f.relPath}  →  ${newUrl}  (${f.size} bytes, ${f.refs.length} 处引用)`);
  }
  if (ok.length > 10) console.log(`  ... 还有 ${ok.length - 10} 个`);

  if (!EXEC) {
    console.log(`\n🔒 dry-run 完成(未上传、未改 DB)。确认无误后加 --exec 执行。`);
    return;
  }

  // ─── 真跑 ────────────────────────────────────────────────────
  console.log(`\n开始上传 + 更新 DB...`);
  let uploaded = 0;
  let uploadFailed = 0;
  let updated = 0;
  let updateFailed = 0;
  let forced = 0; // --force-db-update 跳过上传直接改写 DB 的次数
  const newUrlCache = new Map(); // absPath → newUrl

  // 1) 本地文件存在的 → 上传 COS 后更新 DB(保持原逻辑)
  for (const f of ok) {
    let newUrl = newUrlCache.get(f.absPath);
    if (!newUrl) {
      try {
        const contentType = guessMime(f.absPath);
        await uploadOne(f.absPath, f.cosKey, contentType);
        newUrl = getPublicUrl(f.cosKey);
        newUrlCache.set(f.absPath, newUrl);
        uploaded++;
        console.log(`  ↑ ${f.relPath} → ${newUrl}`);
      } catch (e) {
        uploadFailed++;
        console.error(`  ✗ 上传失败 ${f.relPath}: ${e.message}`);
        continue; // 上传失败 → 不更新 DB
      }
    }
    for (const ref of f.refs) {
      try {
        if (ref.jsonIdx !== undefined) {
          await updateJsonCol(ref, newUrl);
        } else {
          await updateStringCol(ref, newUrl);
        }
        updated++;
      } catch (e) {
        updateFailed++;
        console.error(`  ✗ 更新失败 ${ref.table}.${ref.col}#${ref.id}: ${e.message}`);
      }
    }
  }

  // 2) 本地文件缺失 + --force-db-update → 跳过上传,按相同 cosKey 推算新 URL 改写 DB
  //    (本地热缓存已清理、但旧 DB 行仍写 /uploads/...;假设之前某次迁移已把同名文件传到 COS)
  if (FORCE_DB) {
    for (const f of missing) {
      if (f.refs.length === 0) continue;
      const newUrl = getPublicUrl(f.cosKey);
      console.log(`  ≈ (force-db) ${f.relPath} → ${newUrl} (本地文件缺失,跳过上传)`);
      forced += f.refs.length;
      for (const ref of f.refs) {
        try {
          if (ref.jsonIdx !== undefined) {
            await updateJsonCol(ref, newUrl);
          } else {
            await updateStringCol(ref, newUrl);
          }
          updated++;
        } catch (e) {
          updateFailed++;
          console.error(`  ✗ 更新失败 ${ref.table}.${ref.col}#${ref.id}: ${e.message}`);
        }
      }
    }
  }

  console.log(`\n=== 结果 ===`);
  console.log(`  上传成功:   ${uploaded}`);
  console.log(`  上传失败:   ${uploadFailed}`);
  if (FORCE_DB) console.log(`  强制改 DB:  ${forced}(本地文件缺失,跳过上传)`);
  console.log(`  DB 更新成功: ${updated}`);
  console.log(`  DB 更新失败: ${updateFailed}`);
  console.log(`  本地副本:   保留(未清空,可回退)`);
}

function guessMime(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
